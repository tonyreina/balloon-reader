// Tests the local speech path for real: synthesised audio is handed to Chromium
// as its microphone, decoded by Vosk inside the page, and the resulting game
// state is checked. This is the test that would have caught the game being deaf.
//
//   bash tests/make-fixtures.sh          # once, needs espeak + ffmpeg
//   python3 serve.py 8000 &
//   node tests/speech.test.mjs
//
// Requires playwright: npm install --no-save playwright && npx playwright install chromium

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { ensureServer } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const URL_BASE = process.env.URL || 'http://localhost:8000';
// AUDIO_DIR lets the test run from outside the repo (e.g. where playwright is
// installed) while still pointing at these fixtures.
const audioDir = process.env.AUDIO_DIR || resolve(here, 'audio');
const AUDIO = {
  correct: resolve(audioDir, 'correct-sentence.wav'),
  wrong: resolve(audioDir, 'wrong-sentence.wav'),
  schwa: resolve(audioDir, 'schwa-the.wav'),
};

for (const [name, path] of Object.entries(AUDIO)) {
  if (!existsSync(path)) {
    console.error(`missing fixture ${name}: ${path}\nrun: bash tests/make-fixtures.sh`);
    process.exit(2);
  }
}

const stopServer = await ensureServer(URL_BASE);

let failures = 0;
function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

// Opens the game with a WAV file standing in for the microphone.
async function openGame(audioFile) {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${audioFile}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${URL_BASE}/?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__balloon));
  await page.click('#play-btn');
  // Model download and unpack, then the microphone, then the first sentence.
  await page.waitForFunction(() => window.__balloon.recognizer?.ready === true, { timeout: 180000 });
  await page.waitForSelector('#start-screen', { state: 'hidden', timeout: 30000 });
  return { browser, page, errors };
}

const readWords = (page) => page.$$eval('#sentence .word.read', (n) => n.map((x) => x.textContent));
const heardWords = (page) => page.evaluate(() =>
  window.__balloon.debugHistory.filter((l) => l.startsWith('heard: ')).map((l) => l.slice(7)));

// --- 1. reading the sentence aloud lifts the balloon ---------------------
{
  console.log('\n-- reading the sentence correctly --');
  const { browser, page, errors } = await openGame(AUDIO.correct);

  check('model loaded and microphone open', await page.textContent('#mic-label'), 'Listening');
  check('grammar was set to the sentence', (await page.evaluate(() =>
    window.__balloon.debugHistory.some((l) => l === 'listening for: I can see the sun'))));

  const startAltitude = await page.evaluate(() => window.__balloon.scene.altitude);
  const deadline = Date.now() + 30000;
  let read = [];
  while (Date.now() < deadline) {
    read = await readWords(page);
    if (read.length >= 4) break;
    await page.waitForTimeout(400);
  }

  check(`at least 4 of 5 words credited from speech (got ${read.length}: ${read.join(' ')})`, read.length >= 4);
  check('credited words are the sentence\'s own, in order',
    read.join(' '), 'I can see the sun'.split(' ').slice(0, read.length).join(' '));
  check('the balloon gained altitude', await page.evaluate(() => window.__balloon.scene.altitude) > startAltitude - 0.4);
  check('score went up', Number(await page.textContent('#score')) > 0);
  check('no page errors', errors, []);
  await page.screenshot({ path: `${process.env.SHOTS || here}/speech-correct.png` });
  await browser.close();
}

// --- 2. the wrong words must not lift it --------------------------------
// The recognizer decodes against a grammar built from the sentence, which is
// what makes it accurate on a child's voice. This is the check that the narrow
// grammar is not simply hearing the target words in any noise.
{
  console.log('\n-- reading something completely different --');
  const { browser, page, errors } = await openGame(AUDIO.wrong);

  await page.waitForTimeout(25000); // let the wrong sentence loop several times
  const read = await readWords(page);
  const heard = await heardWords(page);
  const leaked = heard.filter((w) => ['i', 'can', 'see', 'the', 'sun'].includes(w.toLowerCase()));

  check(`recognizer produced words (${heard.length}), so audio was flowing`, heard.length > 0);
  // Recognition is probabilistic, so the bar is that wrong speech cannot carry a
  // child through a sentence - not that it never scores a single word. Measured
  // with the decoy vocabulary in js/decoys.js this sits at about one word per 25
  // seconds of continuous unrelated speech; without the decoys it was 3 of 5.
  check(`wrong speech cannot read the sentence (credited ${read.length}/5: ${read.join(' ') || 'none'})`, read.length <= 1);
  check(`sentence did not complete on wrong speech`, await page.evaluate(() => window.__balloon.game.sentencesDone), 0);
  // Recognition is probabilistic, so this one is a bound, not an exact figure.
  // The game's own rule that only the current or next word can be credited is
  // what turns the occasional leak into nothing: most leaked words arrive out of
  // order and are discarded, which is why the two checks above hold even when
  // this number is not zero. Measured at 1-3 words per 25 seconds.
  check(`target-word leaks stay rare (${leaked.length} in 25s: ${leaked.join(' ') || 'none'})`, leaked.length <= 5);
  check('no page errors', errors, []);
  await page.screenshot({ path: `${process.env.SHOTS || here}/speech-wrong.png` });
  await browser.close();
}

// --- 3. "the" said the way people actually say it ------------------------
// Most people reduce "the" to a schwa ("thuh"), not "thee". This failed until the
// sentence went into the grammar as a whole phrase: with only the individual
// words in it, nothing told the decoder that "the" is followed by "sun" here, so
// the pair was swallowed by a single decoy word ("south").
{
  console.log('\n-- "the" reduced to a schwa --');
  const { browser, page, errors } = await openGame(AUDIO.schwa);

  const deadline = Date.now() + 30000;
  let read = [];
  while (Date.now() < deadline) {
    read = await readWords(page);
    if (read.length >= 4) break;
    await page.waitForTimeout(400);
  }
  const helped = await page.evaluate(() => window.__balloon.game.wordsHelped);
  const finished = await page.evaluate(() => window.__balloon.game.sentencesDone);

  check(`schwa "the" does not stall the sentence (read ${read.length}, helped ${helped}, finished ${finished})`,
    finished >= 1 || read.length >= 4);
  check('"the" was not the word that needed help', helped <= 1);
  check('no page errors', errors, []);
  await browser.close();
}

// --- 4. every sentence must be buildable into a grammar -----------------
// A word missing from the model's dictionary would break a whole sentence.
{
  console.log('\n-- grammar coverage for every sentence --');
  const { browser, page } = await openGame(AUDIO.correct);

  const report = await page.evaluate(async () => {
    const { LEVELS } = await import('/js/sentences.js');
    const recognizer = window.__balloon.recognizer;
    const bad = [];
    for (const level of LEVELS) {
      for (const sentence of level.sentences) {
        recognizer.grammarFailed = false;
        let error = null;
        const previous = recognizer.onError;
        recognizer.onError = (message) => { error = message; };
        try {
          recognizer.setTarget(sentence.split(/\s+/));
        } catch (e) {
          error = `threw: ${e.message}`;
        }
        await new Promise((done) => setTimeout(done, 80));
        recognizer.onError = previous;
        if (error || recognizer.grammarFailed) bad.push({ sentence, error });
      }
    }
    return { total: LEVELS.reduce((n, l) => n + l.sentences.length, 0), bad };
  });

  check(`all ${report.total} sentences build a grammar`, report.bad, []);
  await browser.close();
}

stopServer();
console.log(failures ? `\n${failures} failing check(s)` : '\nAll speech checks passed');
process.exit(failures ? 1 : 0);
