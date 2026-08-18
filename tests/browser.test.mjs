// Drives the real page in Chromium and checks the game itself: rendering,
// balloon physics, word states, hearts and layout. Reading is done with the
// Space fallback rather than a voice — tests/speech.test.mjs covers the
// microphone path with real audio.
//
//   pixi run -e dev test-browser
// or
//   npm install && npx playwright install chromium && node tests/browser.test.mjs

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { ensureServer } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.URL || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || here;

let failures = 0;
function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const stopServer = await ensureServer(BASE);
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

const problems = [];
page.on('console', (msg) => { if (msg.type() === 'error') problems.push(msg.text()); });
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__balloon));

  check('start screen is showing', await page.isVisible('#start-screen'));
  check('no console errors on load', problems, []);
  await page.screenshot({ path: `${SHOTS}/shot-1-start.png` });

  // Starting downloads the speech model, then opens the microphone.
  await page.click('#play-btn');
  check('a progress bar appears while the model loads', await page.isVisible('#loading'));
  await page.waitForSelector('#start-screen', { state: 'hidden', timeout: 180000 });
  check('the speech model finished loading', await page.evaluate(() => window.__balloon.recognizer?.ready === true));

  const words = await page.$$eval('#sentence .word', (nodes) => nodes.map((n) => n.textContent));
  check('sentence rendered', words, ['I', 'can', 'see', 'the', 'sun']);
  check('first word is current', await page.$eval('#sentence .word', (n) => n.classList.contains('current')));

  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('#sky');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4000) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return seen.size;
  });
  check('sky is drawn with many colors', painted > 20);

  // The wildlife is drawn with a real canvas context here, which the stub context
  // in tests/scene.test.mjs cannot check: a wrong argument to arc() or ellipse()
  // only throws in a browser.
  const drawn = await page.evaluate(() => {
    const critters = window.__balloon.scene.critters;
    critters.list.length = 0;
    for (const kind of ['bird', 'butterfly', 'caterpillar', 'cat', 'dog']) {
      for (let tries = 0; tries < 200; tries++) {
        const had = critters.list.length;
        if (kind === 'bird' || kind === 'butterfly') critters.spawnSky();
        else critters.spawnGround();
        if (critters.list.at(-1).kind === kind) break;
        critters.list.length = had;
      }
    }
    // Spawning puts them just off the edge, so spread them across the sky and
    // stop them moving; otherwise the screenshot is an empty field.
    critters.list.forEach((critter, i) => {
      critter.x = window.__balloon.scene.width * (0.16 + i * 0.17);
      critter.speed = 0;
      if (critter.group === 'sky') critter.wander = 0;
    });
    critters.cheer(2);
    return critters.list.map((c) => c.kind);
  });
  await page.waitForTimeout(300);
  check('every creature kind draws on a real canvas', drawn.sort(),
    ['bird', 'butterfly', 'cat', 'caterpillar', 'dog']);
  check('drawing the wildlife raised no errors', problems, []);
  await page.screenshot({ path: `${SHOTS}/shot-6-critters.png` });
  await page.evaluate(() => { window.__balloon.scene.critters.list.length = 0; });

  const before = await page.evaluate(() => window.__balloon.scene.altitude);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(160);
  }
  const after = await page.evaluate(() => window.__balloon.scene.altitude);
  check(`balloon rose (${before.toFixed(2)} -> ${after.toFixed(2)})`, after > before);
  check('three words marked read', await page.$$eval('#sentence .word.read', (n) => n.length), 3);
  check('fourth word is current', await page.$eval('#sentence .word.current', (n) => n.textContent), 'the');
  check('score climbed', await page.$eval('#score', (n) => Number(n.textContent) > 0));
  await page.screenshot({ path: `${SHOTS}/shot-2-playing.png` });

  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  check('completion banner shown', await page.$eval('#banner', (n) => n.classList.contains('show')));
  check('balloon is escaping upward', await page.evaluate(() => window.__balloon.scene.escaping));
  await page.screenshot({ path: `${SHOTS}/shot-3-complete.png` });

  await page.waitForTimeout(2100);
  check('next sentence loaded',
    await page.$$eval('#sentence .word', (n) => n.map((x) => x.textContent).join(' ')),
    'The cat is on my lap');
  check('recognizer was retuned to the new sentence',
    await page.evaluate(() => window.__balloon.debugHistory.some((l) => l === 'listening for: The cat is on my lap')));

  // With no reading at all the balloon must sink and cost a heart.
  await page.evaluate(() => { window.__balloon.scene.balloonY = window.__balloon.scene.floorY - 4; });
  await page.waitForTimeout(900);
  check('landing cost a heart', await page.$eval('#hearts', (n) => n.textContent.length), 4);
  await page.screenshot({ path: `${SHOTS}/shot-4-landed.png` });

  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal overflow on phone width', overflow <= 0);
  await page.screenshot({ path: `${SHOTS}/shot-5-phone.png` });

  check('still no console errors', problems, []);
} finally {
  await browser.close();
  stopServer();
}

console.log(failures ? `\n${failures} failing check(s)` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
