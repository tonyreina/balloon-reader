// Headless checks for the pure logic: word matching and sentence flow.
// The canvas and microphone are stubbed; visuals are verified in the browser.

globalThis.window = { addEventListener() {} };

const { matches, tokenize, isFiller } = await import('../js/matcher.js');
const { Game } = await import('../js/game.js');

let failures = 0;
function check(label, actual, expected = true) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` (got ${actual})`}`);
}

console.log('\n-- matching --');
check('exact match', matches('cat', 'cat'));
check('case and punctuation ignored', matches('Cat!', 'cat'));
check('homophone to/two', matches('two', 'to'));
check('recognizer slip on a long word', matches('elefant', 'elephant'));
check('plural slip', matches('jumps', 'jumped'));
check('short lookalikes stay wrong', matches('cap', 'cat'), false);
check('different word rejected', matches('dog', 'cat'), false);
check('empty rejected', matches('', 'cat'), false);
check('tokenize splits and cleans', tokenize("The  cat's hat!").join('|'), 'the|cats|hat');
check('filler detected', isFiller('um'));

console.log('\n-- game flow --');
const scene = {
  sink: 0, lift: 0, grounded: false, puffs: 0,
  reset() { this.grounded = false; },
  puff() { this.puffs++; },
  escape() { this.escaped = true; },
};
const ui = {
  sentences: 0, banners: [], nudges: 0, gameOver: false,
  renderSentence() { this.sentences++; },
  renderStats() {},
  setLevelName() {},
  flashBanner(text) { if (text) this.banners.push(text); },
  nudge() { this.nudges++; },
  highlightHint() {},
  showGameOver() { this.gameOver = true; },
};

const game = new Game(scene, ui);
game.start({ levelIndex: 0, gentle: false });
check('first sentence loaded', game.words.map((w) => w.text).join(' '), 'I can see the sun');
check('three hearts', game.hearts, 3);

// Read the sentence word by word, as the recognizer would deliver it.
for (const word of ['I', 'can', 'see', 'the', 'sun']) {
  game.handleSpoken([[word.toLowerCase()]]);
}
check('all five words puffed the balloon', scene.puffs, 5);
check('sentence counted as finished', game.sentencesDone, 1);
check('balloon flew off', scene.escaped, true);
check('score awarded', game.score > 100);

// Transition, then the next sentence should load.
game.update(2.1);
check('next sentence loaded', game.words.map((w) => w.text).join(' '), 'The cat is on my lap');
check('word index reset', game.index, 0);

// Recognizer misses "is" but the child clearly said "on": credit the small word.
game.handleSpoken([['the'], ['cat'], ['on']]);
check('function word auto-credited', game.words[2].state, 'read');
check('advanced past "on"', game.words[3].state, 'read');

game.handleSpoken([['my'], ['lap']]);
check('sentence two finished', game.sentencesDone, 2);

// A skipped content word is marked, not credited.
game.update(2.1);
check('third sentence loaded', game.words.map((w) => w.text).join(' '), 'A big red dog ran');
game.handleSpoken([['a'], ['big'], ['dog']]);
check('skipped content word flagged', game.words[2].state, 'skipped');
check('word after the skip is read', game.words[3].state, 'read');

// A wrong word only nudges; it never costs a heart.
const heartsBefore = game.hearts;
game.handleSpoken([['banana']]);
check('wrong word nudges', ui.nudges > 0);
check('wrong word costs no heart', game.hearts, heartsBefore);
check('fillers ignored', (() => { const n = ui.nudges; game.handleSpoken([['um']]); return ui.nudges === n; })());

// A word the microphone will not hear must not trap the child forever: the game
// reads it aloud twice and then hands it over, marked as helped, not read.
{
  const helpScene = { sink: 0, lift: 0, grounded: false, puffs: 0, reset() {}, puff() {}, escape() {} };
  const helpUi = {
    renderSentence() {}, renderStats() {}, setLevelName() {}, flashBanner() {},
    nudge() {}, highlightHint() {}, showGameOver() {}, onSentence() {},
  };
  const stuck = new Game(helpScene, helpUi);
  stuck.start({ levelIndex: 0, gentle: false });
  const firstWord = stuck.words[0].text;

  stuck.update(6);   // first hint
  check('stuck word is not credited by the first hint', stuck.words[0].state, 'pending');
  stuck.update(6);   // second hint
  check('nor by the second', stuck.words[0].state, 'pending');
  stuck.update(6);   // help
  check(`the game hands over "${firstWord}" rather than trapping the child`, stuck.words[0].state, 'helped');
  check('and moves on to the next word', stuck.index, 1);
  check('a helped word is not counted as read', stuck.wordsRead, 0);
  check('it is counted as helped', stuck.wordsHelped, 1);
  check('and earns no score', stuck.score, 0);
}

// Landing costs a heart and replays the sentence; three landings end the game.
for (let i = 0; i < 3; i++) {
  scene.grounded = true;
  game.update(0.016);
  game.update(1.7);
}
check('game over after three landings', ui.gameOver, true);
check('hearts spent', game.hearts <= 0, true);

console.log(failures ? `\n${failures} failing check(s)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
