// The parts a grown-up uses: reading-comfort settings, their own sentences, and
// the progress screen — including whether any of it survives a reload.
//
//   pixi run -e dev test-ui

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
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const problems = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__balloon));
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__balloon));

  console.log('\n-- reading comfort --');
  const readingFont = () => page.evaluate(() =>
    getComputedStyle(document.querySelector('.sentence')).fontFamily.split(',')[0].replace(/"/g, ''));

  // Andika and wide spacing by default: the audience is children still learning
  // the letter shapes.
  check('rounded letters chosen by default', await page.inputValue('#font-select'), 'andika');
  check('wide spacing on by default', await page.isChecked('#spacing-toggle'));
  check(`the sentence is set in Andika (${await readingFont()})`, await readingFont(), 'Andika');

  // Every choice has to actually reach the reading text, and each font must really
  // load rather than silently falling back to the next name in the stack.
  for (const [choice, expected] of [['opendyslexic', 'OpenDyslexic'], ['storybook', 'Baloo 2'], ['andika', 'Andika']]) {
    await page.selectOption('#font-select', choice);
    await page.waitForTimeout(250);
    check(`choosing ${choice} sets the reading text in ${expected}`, await readingFont(), expected);
    // Fonts load lazily, and the sentence bar is empty before a round starts, so
    // ask for the face explicitly. An empty result means the @font-face is missing
    // or its file does not load, and the text would silently fall back.
    const faces = await page.evaluate(
      (family) => document.fonts.load(`700 2rem "${family}"`).then((list) => list.length),
      expected,
    );
    check(`${expected} has a real font file behind it (${faces} face(s))`, faces > 0);
  }

  await page.selectOption('#font-select', 'opendyslexic');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__balloon));
  check('the choice survives a reload', await page.inputValue('#font-select'), 'opendyslexic');
  check('and is applied on load', await readingFont(), 'OpenDyslexic');
  await page.screenshot({ path: `${SHOTS}/shot-9-opendyslexic.png` });
  await page.selectOption('#font-select', 'andika');

  console.log('\n-- progress, before anything has been played --');
  await page.click('[data-progress]');
  check('the progress screen opens', await page.isVisible('#progress-screen'));
  check('and says there is nothing yet',
    /No finished rounds yet/.test(await page.textContent('#progress-body')));
  await page.click('#progress-close');
  check('and closes again', await page.isHidden('#progress-screen'));

  console.log('\n-- a grown-up\'s own sentences --');
  // Served from localhost here, so the feature is offered. js/env.js hides it on
  // any published copy; tests/store.test.mjs covers that rule for every hostname.
  check('the button is offered on a local copy', await page.isVisible('#sentences-btn'));

  await page.click('#sentences-btn');
  check('the editor opens', await page.isVisible('#sentences-screen'));

  await page.fill('#sentences-input', 'I have 3 cats\nThe dog sat on the step');
  await page.click('#sentences-save');
  check('a line with a digit is refused', await page.isVisible('#sentences-problems'));
  check('and the problem names the line',
    /Line 1/.test(await page.textContent('#sentences-problems')));
  check('the editor stays open so it can be fixed', await page.isVisible('#sentences-screen'));

  await page.fill('#sentences-input', 'The dog sat on the step\nWe went to the park');
  await page.click('#sentences-save');
  check('good sentences save', await page.isHidden('#sentences-screen'));
  check('and appear as a choice',
    await page.$eval('#level-select', (select) =>
      [...select.options].some((option) => /Your own sentences \(2\)/.test(option.textContent))));
  check('and are selected ready to play', await page.inputValue('#level-select'), 'own');
  await page.screenshot({ path: `${SHOTS}/shot-7-sentences.png` });

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__balloon));
  check('they survive a reload', await page.inputValue('#level-select'), 'own');

  console.log('\n-- playing a grown-up\'s own sentences --');
  await page.click('#play-btn');
  await page.waitForSelector('#start-screen', { state: 'hidden', timeout: 180000 });
  const shown = await page.$$eval('#sentence .word', (nodes) => nodes.map((n) => n.textContent).join(' '));
  check(`the game reads their sentence ("${shown}")`,
    ['The dog sat on the step', 'We went to the park'].includes(shown));
  check('and the recognizer was tuned to it',
    await page.evaluate((sentence) => window.__balloon.debugHistory.includes(`listening for: ${sentence}`), shown));
  check('with no level to be promoted out of',
    await page.evaluate(() => window.__balloon.game.levelIndex), -1);

  console.log('\n-- words that needed help are remembered --');
  // Finish the sentence with the keyboard, then let a word go unread so the game
  // gives it away, which is what puts a word on the practice list.
  await page.evaluate(() => {
    const game = window.__balloon.game;
    const little = ['the', 'a', 'an', 'is', 'on', 'my', 'i', 'we', 'to', 'and', 'of', 'in', 'at', 'it'];
    // Step over the little words first: those are deliberately never recorded, so
    // helping one would prove nothing.
    while (game.index < game.words.length - 1
           && little.includes(game.words[game.index].text.toLowerCase())) {
      game.acceptWord();
    }
    game.acceptWord({ helped: true });      // as the never-stuck rule would
  });
  const remembered = await page.evaluate(() => window.__balloon.game.store.wordsNeedingPractice());
  check(`a helped word is recorded (${remembered.map((w) => w.word).join(' ') || 'none'})`,
    remembered.length >= 1);
  check('a little word would not have been recorded',
    remembered.every((entry) => !['the', 'a', 'is', 'on', 'my'].includes(entry.word)));

  console.log('\n-- progress, after playing --');
  // End the round for real, so the session is logged by the game rather than by
  // the test: spend the last heart and let the balloon land.
  await page.evaluate(() => {
    const game = window.__balloon.game;
    game.hearts = 1;
    game.landed();
  });
  await page.waitForSelector('#over-screen', { state: 'visible', timeout: 10000 });
  check('the round ends on the last heart', await page.isVisible('#over-screen'));

  await page.click('#over-screen [data-progress]');
  const body = await page.textContent('#progress-body');
  check('a round is reported', /rounds played/.test(body));
  check('and the practice words are listed', /Words to practise/.test(body));

  // The chart is easy to break silently: percentage heights inside a flex column
  // collapse to nothing unless the bar itself is full height.
  const barHeights = await page.$$eval('.session-chart .bar i', (nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
  check(`the round chart actually draws bars (${barHeights.join(', ')}px)`,
    barHeights.length > 0 && barHeights.some((height) => height > 2));
  await page.screenshot({ path: `${SHOTS}/shot-8-progress.png` });

  console.log('\n-- forgetting everything --');
  page.on('dialog', (dialog) => dialog.accept());
  await page.click('#progress-forget');
  check('the log is emptied', /No finished rounds yet/.test(await page.textContent('#progress-body')));
  check('their own sentences go too',
    await page.$eval('#level-select', (select) =>
      [...select.options].some((option) => /Your own/.test(option.textContent))), false);

  check('no page errors throughout', problems, []);
} finally {
  await browser.close();
  stopServer();
}

console.log(failures ? `\n${failures} failing check(s)` : '\nAll interface checks passed');
process.exit(failures ? 1 : 0);
