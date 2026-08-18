// Proves the claim the game makes about itself: that playing it sends nothing
// anywhere. Two passes.
//
//   1. A static scan for anything in the shipped files that a browser would fetch
//      from another host on its own — a stylesheet, a font, a script, an image, a
//      CSS url(), a fetch to an absolute URL, a socket, a beacon. Ordinary links a
//      person can click are allowed: a link is inert until clicked.
//   2. A real session in Chromium — page load, model download, microphone open,
//      recognition, a spoken hint — with every request the page and its worker make
//      recorded, then checked for origin and method.
//
//   pixi run -e dev test-privacy

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { ensureServer } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.URL || 'http://localhost:8000';

let failures = 0;
function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  got ${JSON.stringify(actual)}`}`);
}

// The static scan for externally-fetched resources lives in tests/guardrails.test.mjs
// so that it runs in CI, where this test's browser half cannot: that half needs the
// 40MB speech model. Keeping one copy means they cannot disagree.

// --- 2. a real session --------------------------------------------------
console.log('\n-- a whole session, watching every request --');
const stopServer = await ensureServer(BASE);
const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${resolve(here, 'audio/correct-sentence.wav')}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const context = await browser.newContext();
const requests = [];
// Listening on the context, not the page, so a worker's traffic is caught too.
context.on('request', (r) => requests.push({ method: r.method(), url: r.url(), type: r.resourceType() }));

try {
  const page = await context.newPage();
  page.on('websocket', (ws) => requests.push({ method: 'WS', url: ws.url(), type: 'websocket' }));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__balloon));
  await page.click('#play-btn');
  await page.waitForFunction(() => window.__balloon.recognizer?.ready === true, { timeout: 180000 });
  await page.waitForSelector('#start-screen', { state: 'hidden', timeout: 60000 });
  // Long enough to recognise words and for the stuck-word hint to speak.
  await page.waitForTimeout(20000);

  const heard = await page.evaluate(() =>
    window.__balloon.debugHistory.filter((line) => line.startsWith('heard: ')).length);
  check(`the microphone was actually working (${heard} words heard)`, heard > 0);

  const origin = new URL(BASE).origin;
  const classify = (url) => {
    if (url.startsWith('data:')) return 'data:';
    if (url.startsWith('blob:')) return 'blob:';
    return new URL(url).origin;
  };
  const offsite = requests.filter((r) => {
    const where = classify(r.url);
    return where !== origin && where !== 'data:' && where !== 'blob:';
  });
  const uploads = requests.filter((r) => !['GET', 'HEAD'].includes(r.method));

  console.log(`      ${requests.length} requests: `
    + `${requests.filter((r) => classify(r.url) === origin).length} to the game's own address, `
    + `${requests.filter((r) => classify(r.url).endsWith(':')).length} data:/blob: (no network)`);

  check('nothing was requested from any other host',
    offsite.map((r) => `${r.method} ${r.url}`), []);
  check('nothing was uploaded — every request was a GET',
    uploads.map((r) => `${r.method} ${r.url}`), []);
  check('no websocket was opened',
    requests.filter((r) => r.type === 'websocket').map((r) => r.url), []);

  // The audio itself: the only consumer is the worker, over postMessage.
  check('the model is fetched from this project, not from a CDN',
    requests.some((r) => r.url === `${origin}/models/vosk-model-small-en-us-0.15.tar.gz`));

  // --- the microphone must be shut, not merely ignored --------------------
  // Muting a live track leaves the browser's recording indicator lit and the audio
  // pipeline running. For a game that promises a child's voice stays on the device,
  // "we stopped listening" is not the same as "the microphone is off", and a parent
  // is looking at the indicator, not at our flag.
  console.log('\n-- the microphone is released when the game is not listening --');
  const micState = () => page.evaluate(() => {
    const r = window.__balloon.recognizer;
    return {
      tracks: (r?.stream?.getTracks() || []).filter((t) => t.readyState === 'live').length,
      context: r?.audioContext?.state ?? 'closed',
      live: Boolean(r?.live),
    };
  });

  check('open while a child is reading', await micState(), { tracks: 1, context: 'running', live: true });

  await page.click('#pause-btn');
  await page.waitForTimeout(600);
  check('closed while paused', await micState(), { tracks: 0, context: 'closed', live: false });

  await page.click('#pause-btn');
  await page.waitForTimeout(1500);
  check('open again on resume', (await micState()).tracks, 1);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(600);
  check('closed when the tab is hidden', (await micState()).tracks, 0);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const g = window.__balloon.game; g.hearts = 1; g.landed(); });
  await page.waitForTimeout(800);
  check('closed once the round is over', (await micState()).tracks, 0);
} finally {
  await browser.close();
  stopServer();
}

console.log(failures ? `\n${failures} failing check(s)` : '\nAll privacy checks passed');
process.exit(failures ? 1 : 0);
