// What the game remembers: which words need practice, the sessions log, a
// grown-up's own sentences, and the rule that own sentences are local only.
//
//   node tests/store.test.mjs      (no browser, no dependencies)

let failures = 0;
function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

globalThis.window = { addEventListener() {} };

const { Store, checkCustomSentences } = await import('../js/store.js');
const { canAddOwnSentences } = await import('../js/env.js');
const { pickSentence, CUSTOM_INDEX } = await import('../js/sentences.js');

// A stand-in for localStorage, plus a clock we control so the resting periods
// between practice attempts can be tested without waiting days.
function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

let clock = 1_000_000;
const now = () => clock;
const newStore = (storage = fakeStorage()) => new Store({ storage, now });

console.log('\n-- words that need practice --');
{
  const store = newStore();
  store.noteWord('elephant', { helped: true });
  check('a word the game gave away is due straight away', [...store.dueWords()], ['elephant']);

  store.noteWord('elephant');                 // read correctly
  check('reading it correctly rests it', [...store.dueWords()], []);

  clock += 3 * 60 * 1000;                     // past the first two-minute rest
  check('and it comes back a couple of minutes later', [...store.dueWords()], ['elephant']);

  store.noteWord('elephant');
  clock += 3 * 60 * 1000;
  check('a second success rests it for longer', [...store.dueWords()], []);
  clock += 20 * 60 * 1000;
  check('until that rest is up too', [...store.dueWords()], ['elephant']);

  // A word read correctly from the start is never practice material.
  store.noteWord('rabbit');
  clock += 30 * 24 * 60 * 60 * 1000;
  check('a word never missed is never due', [...store.dueWords()], ['elephant']);
}

console.log('\n-- little words are the microphone\'s problem, not the child\'s --');
{
  const store = newStore();
  for (const word of ['the', 'a', 'is', 'my', 'of', 'and']) {
    store.noteWord(word, { helped: true });
  }
  check('function words never enter the practice list', [...store.dueWords()], []);
  check('nor the grown-up\'s list', store.wordsNeedingPractice(), []);

  store.noteWord('Butterfly!', { helped: true });
  check('punctuation and case are normalised', [...store.dueWords()], ['butterfly']);
}

console.log('\n-- the practice list is ordered by how much trouble a word gave --');
{
  const store = newStore();
  store.noteWord('volcano', { helped: true });
  store.noteWord('volcano', { helped: true });
  store.noteWord('volcano', { helped: true });
  store.noteWord('kitten', { helped: true });
  const list = store.wordsNeedingPractice();
  check('hardest word first', list.map((entry) => entry.word), ['volcano', 'kitten']);
  check('with a count a grown-up can read', list[0].helped, 3);
}

console.log('\n-- sentences are chosen to bring practice words back --');
{
  const store = newStore();
  store.noteWord('lap', { helped: true });
  const chosen = pickSentence({ levelIndex: 0, dueWords: store.dueWords() });
  check('a sentence containing the due word is chosen', chosen, 'The cat is on my lap');

  // But never the same sentence twice running.
  const again = pickSentence({ levelIndex: 0, dueWords: store.dueWords(), recent: [chosen] });
  check('and not the one just read', again === chosen, false);
}

console.log('\n-- remembering across sessions --');
{
  const storage = fakeStorage();
  const first = newStore(storage);
  first.noteWord('astronaut', { helped: true });
  first.endSession({ wordsRead: 12, wordsHelped: 2, sentencesDone: 3, seconds: 90 });
  first.saveSettings({ gentle: false, easyLetters: true });

  const second = newStore(storage);
  check('practice words survive a reload', [...second.dueWords()], ['astronaut']);
  check('so does the session log', second.sessions.length, 1);
  check('and the settings', second.settings.gentle, false);

  second.clearAll();
  const third = newStore(storage);
  check('forgetting everything really forgets it', third.sessions.length, 0);
  check('including practice words', [...third.dueWords()], []);
}

console.log('\n-- a browser that refuses to store anything --');
{
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  let threw = null;
  try {
    const store = new Store({ storage: broken, now });
    store.noteWord('window', { helped: true });
    store.endSession({ wordsRead: 1 });
    check('the game still tracks words in memory', [...store.dueWords()], ['window']);
    store.clearAll();
  } catch (error) {
    threw = error.message;
  }
  check('private browsing does not break the game', threw, null);
}

console.log('\n-- checking sentences a grown-up typed --');
{
  const good = checkCustomSentences('The dog sat on the step\n  We went to the park  \n');
  check('clean lines are accepted', good.sentences, ['The dog sat on the step', 'We went to the park']);
  check('with no complaints', good.problems, []);

  check('punctuation is stripped rather than rejected',
    checkCustomSentences('The dog sat, and then he ran!').sentences,
    ['The dog sat and then he ran']);

  check('digits are refused', checkCustomSentences('I have 3 cats').problems.length, 1);
  check('a single word is refused', checkCustomSentences('Hello').problems.length, 1);
  check('an over-long line is refused',
    checkCustomSentences(`one ${'word '.repeat(20)}`).problems.length, 1);
  check('symbols are refused', checkCustomSentences('The cat <script> ran').problems.length, 1);
  check('blank input gives nothing and no complaint',
    checkCustomSentences('\n\n  \n'), { sentences: [], problems: [] });
  check('the problem names the line', checkCustomSentences('Good line here\nI have 3 cats').problems[0].startsWith('Line 2'));
}

console.log('\n-- own sentences are local only --');
{
  const allowed = [
    { protocol: 'http:', hostname: 'localhost' },
    { protocol: 'http:', hostname: '127.0.0.1' },
    { protocol: 'file:', hostname: '' },
    { protocol: 'http:', hostname: 'kitchen-pc.local' },
  ];
  const hidden = [
    { protocol: 'https:', hostname: 'tonyreina.github.io' },
    { protocol: 'https:', hostname: 'example.com' },
    { protocol: 'http:', hostname: '192.168.1.50' },
    { protocol: 'https:', hostname: 'notlocalhost.com' },
    { protocol: 'https:', hostname: 'localhost.evil.com' },
  ];
  check('offered when the game is served from this machine',
    allowed.every((location) => canAddOwnSentences(location)));
  check('hidden everywhere it is published',
    hidden.some((location) => canAddOwnSentences(location)), false);
}

console.log('\n-- a grown-up\'s own sentences drive the game --');
{
  const own = ['The dog sat on the step', 'We went to the park'];
  check('their sentences are used',
    own.includes(pickSentence({ levelIndex: CUSTOM_INDEX, custom: own })), true);
  check('an empty set yields nothing to read',
    pickSentence({ levelIndex: CUSTOM_INDEX, custom: [] }), null);
}

console.log(failures ? `\n${failures} failing check(s)` : '\nAll store checks passed');
process.exit(failures ? 1 : 0);
