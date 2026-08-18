// Tests the Recognizer's bookkeeping directly, with Vosk and the audio pipeline
// stubbed. This is where the awkward cases live: a partial that shrinks, a final
// that carries words the partials never showed, "[unk]" tokens, and the gate that
// stops the game's own hint voice from scoring itself.
//
//   node tests/recognizer.test.mjs      (no browser, no dependencies)

let failures = 0;
function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

// --- stubs ---------------------------------------------------------------
const spoken = [];  // every word Vosk was asked to accept audio for

class FakeKaldi {
  constructor(sampleRate, grammar) {
    this.grammar = grammar;
    this.handlers = {};
    FakeKaldi.created.push(grammar ? JSON.parse(grammar) : null);
  }
  setWords() {}
  on(event, handler) { this.handlers[event] = handler; }
  acceptWaveform() { spoken.push('audio'); }
  remove() { this.removed = true; }
  partial(text) { this.handlers.partialresult?.({ result: { partial: text } }); }
  final(text) { this.handlers.result?.({ result: { text } }); }
}
FakeKaldi.created = [];

class FakeAudioContext {
  constructor() { this.sampleRate = 16000; this.destination = {}; }
  async resume() {}
  async close() {}
  createMediaStreamSource() { return { connect() {} }; }
  createGain() { return { gain: {}, connect() {} }; }
  createScriptProcessor() {
    this.processor = { connect() {}, onaudioprocess: null };
    return this.processor;
  }
}

globalThis.window = {
  addEventListener() {},
  AudioContext: FakeAudioContext,
  // A local voice so voice.js will actually speak and open its quiet window.
  speechSynthesis: {
    getVoices: () => [{ lang: 'en-US', localService: true, name: 'Test Voice' }],
    cancel() {},
    speak() {},          // deliberately never fires onend
    addEventListener() {},
  },
};
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
// Node 21+ ships a read-only `navigator`, so it has to be replaced rather than
// assigned to.
Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } },
  configurable: true,
  writable: true,
});

const { Recognizer } = await import('../js/recognizer.js');
const { say } = await import('../js/voice.js');
const { Game } = await import('../js/game.js');

// Builds a Recognizer with the model already "loaded".
function makeRecognizer(overrides = {}) {
  const heard = [];
  const unknowns = [];
  const recognizer = new Recognizer({
    onWords: (words) => heard.push(...words.map((w) => w[0])),
    onUnknown: (count) => unknowns.push(count),
    ...overrides,
  });
  recognizer.model = { KaldiRecognizer: FakeKaldi };
  recognizer.sampleRate = 16000;
  return { recognizer, heard, unknowns };
}

// --- grammar ------------------------------------------------------------
console.log('\n-- grammar built for each sentence --');
{
  FakeKaldi.created.length = 0;
  const { recognizer } = makeRecognizer();
  recognizer.setTarget(['I', 'can', 'see', 'the', 'sun']);
  const grammar = FakeKaldi.created.at(-1);

  check('grammar contains the sentence words', ['i', 'can', 'see', 'the', 'sun'].every((w) => grammar.includes(w)));
  check('grammar ends with the unknown token', grammar.at(-1), '[unk]');
  check('grammar includes decoy words so wrong speech has somewhere to go', grammar.length > 100);
  check('target words are repeated to bias the decoder toward them',
    grammar.filter((w) => w === 'sun').length > 1);

  // The whole sentence as one phrase is what teaches the decoder the word order.
  // Without it a single long decoy swallows two short target words: "the sun"
  // came back as "south", and a schwa "the" was never heard at all.
  check('the whole sentence is in the grammar as a phrase',
    grammar.filter((entry) => entry === 'i can see the sun').length > 1);

  // A decoy that sounds like a target word steals correct reading instead of
  // catching wrong reading.
  check('decoys that sound like a sentence word are screened out',
    ['so', 'saw', 'sea', 'ten', 'run', 'sing'].filter((w) => grammar.includes(w)), []);
  check('decoys unlike the sentence words are kept',
    ['mountain', 'because', 'window', 'yellow'].every((w) => grammar.includes(w)));

  const previous = FakeKaldi.created.length;
  recognizer.setTarget(['The', 'cat', 'is', 'on', 'my', 'lap']);
  check('a new sentence rebuilds the decoder', FakeKaldi.created.length, previous + 1);
  check('the new grammar has the new words', FakeKaldi.created.at(-1).includes('lap'));
  check('and not the old ones', FakeKaldi.created.at(-1).includes('sun'), false);
}

// --- partial and final bookkeeping --------------------------------------
console.log('\n-- transcripts become words exactly once --');
{
  const { recognizer, heard } = makeRecognizer();
  recognizer.setTarget(['I', 'can', 'see', 'the', 'sun']);
  const kaldi = recognizer.kaldi;

  kaldi.partial('i');
  kaldi.partial('i can');
  kaldi.partial('i can see');
  check('growing partials emit each new word once', heard, ['i', 'can', 'see']);

  // Vosk can re-hypothesise a partial into something shorter. Counting down and
  // back up again would credit a word the child never said a second time.
  kaldi.partial('i can');
  check('a shorter partial emits nothing', heard, ['i', 'can', 'see']);
  kaldi.partial('i can see the');
  check('growing again does not repeat the earlier word', heard, ['i', 'can', 'see', 'the']);

  kaldi.final('i can see the sun');
  check('the final emits only what the partials had not', heard, ['i', 'can', 'see', 'the', 'sun']);

  // A fresh utterance starts counting from zero again.
  kaldi.partial('sun');
  check('the next utterance is not treated as a continuation', heard.at(-1), 'sun');
}

console.log('\n-- silence and unrecognised speech --');
{
  const { recognizer, heard, unknowns } = makeRecognizer();
  recognizer.setTarget(['I', 'can', 'see', 'the', 'sun']);
  const kaldi = recognizer.kaldi;

  kaldi.final('');
  check('a silent final emits no words', heard, []);
  check('and reports no unknown speech', unknowns, []);

  kaldi.partial('[unk]');
  check('an unknown-only partial emits no words', heard, []);

  kaldi.final('[unk] [unk]');
  check('unknown tokens never become words', heard, []);
  check('but are reported so the game can nudge', unknowns, [2]);

  kaldi.final('i [unk] see');
  check('real words alongside unknown ones still count', heard, ['i', 'see']);
}

console.log('\n-- a final that arrives with no partials at all --');
{
  const { recognizer, heard } = makeRecognizer();
  recognizer.setTarget(['The', 'cat', 'is', 'on', 'my', 'lap']);
  recognizer.kaldi.final('the cat is on my lap');
  check('every word is emitted', heard, ['the', 'cat', 'is', 'on', 'my', 'lap']);
}

// --- the microphone gate ------------------------------------------------
console.log('\n-- the game must not score its own hint voice --');
{
  const { recognizer } = makeRecognizer();
  recognizer.setTarget(['I', 'can', 'see', 'the', 'sun']);
  await recognizer.listen();
  recognizer.setEnabled(true);

  const frame = { inputBuffer: { getChannelData: () => new Float32Array(128) } };
  const audio = recognizer.audioContext.processor.onaudioprocess;

  spoken.length = 0;
  audio(frame);
  check('audio normally reaches the decoder', spoken.length, 1);

  say('sun');                       // the stuck-word hint speaks
  spoken.length = 0;
  audio(frame);
  check('audio is dropped while the game is speaking', spoken.length, 0);

  await new Promise((done) => setTimeout(done, 1100));
  spoken.length = 0;
  audio(frame);
  check('audio flows again once it has finished', spoken.length, 1);

  recognizer.setEnabled(false);
  spoken.length = 0;
  audio(frame);
  check('a paused game feeds the decoder nothing', spoken.length, 0);

  recognizer.stop();
}

// --- wired to the real game ---------------------------------------------
console.log('\n-- recognizer driving the real game --');
{
  const scene = {
    sink: 0, lift: 0, grounded: false, puffs: 0,
    reset() {}, puff() { this.puffs++; }, escape() {},
  };
  const uiSentences = [];
  const ui = {
    renderSentence() {}, renderStats() {}, setLevelName() {}, flashBanner() {},
    nudge() { ui.nudges = (ui.nudges || 0) + 1; }, highlightHint() {}, showGameOver() {},
    onSentence(words) { uiSentences.push(words.join(' ')); },
  };

  const game = new Game(scene, ui);
  const { recognizer } = makeRecognizer({
    onWords: (words) => game.handleSpoken(words),
    onUnknown: () => ui.nudge(),
  });
  ui.onSentence = (words) => { uiSentences.push(words.join(' ')); recognizer.setTarget(words); };

  game.start({ levelIndex: 0, gentle: false });
  check('the game told the recognizer what to listen for', uiSentences, ['I can see the sun']);

  recognizer.kaldi.partial('i can see');
  check('spoken words are credited', game.words.slice(0, 3).map((w) => w.state), ['read', 'read', 'read']);
  check('each one puffed the balloon', scene.puffs, 3);

  recognizer.kaldi.final('i can see the sun');
  check('the sentence finished', game.sentencesDone, 1);

  game.update(2.1);
  check('the recognizer was retuned for the next sentence', uiSentences.at(-1), 'The cat is on my lap');
}

console.log(failures ? `\n${failures} failing check(s)` : '\nAll recognizer checks passed');
process.exit(failures ? 1 : 0);
