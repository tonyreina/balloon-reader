// Audits the reading content in js/sentences.js.
//
// The sentences are a hand-written list in one file — nothing is generated, fetched
// or randomised at runtime — so a grown-up can read the whole thing. This script is
// the shortcut: it prints every distinct word the game will ever ask a child to
// read, and checks the structural properties that are easy to break by accident
// when editing the list.
//
//   node tests/content.test.mjs
//
// The word-list output is the important part. The assertions are a tripwire, not a
// substitute for reading it.

const { LEVELS } = await import('../js/sentences.js');

let failures = 0;
function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  got ${JSON.stringify(actual)}`}`);
}

const words = (sentence) => sentence.split(/\s+/);
const bare = (word) => word.toLowerCase().replace(/[^a-z']/g, '');

// Anything a young child should not be asked to read aloud. This is a tripwire for
// edits, deliberately blunt: it cannot judge tone or context, only spot obvious
// words. Reading the sentences yourself is the actual safeguard.
const NOT_FOR_CHILDREN = [
  'kill', 'killed', 'kills', 'dead', 'death', 'die', 'died', 'dies', 'blood',
  'bloody', 'gun', 'guns', 'shot', 'shoot', 'knife', 'stab', 'hate', 'hates',
  'hurt', 'hurts', 'war', 'weapon', 'drunk', 'beer', 'wine', 'drug', 'drugs',
  'stupid', 'idiot', 'dumb', 'ugly', 'fat', 'damn', 'hell', 'god', 'sexy',
  'kiss', 'naked', 'scared', 'afraid', 'terrified', 'cry', 'crying', 'alone',
  'lonely', 'sad', 'fight', 'fought', 'hit', 'kick', 'punch', 'steal', 'stole',
];

console.log('=== every word the game will ask a child to read ===\n');

const seen = new Map(); // word -> level where it first appears
for (const [index, level] of LEVELS.entries()) {
  for (const sentence of level.sentences) {
    for (const word of words(sentence)) {
      const key = bare(word);
      if (!seen.has(key)) seen.set(key, index + 1);
    }
  }
}

for (const [index, level] of LEVELS.entries()) {
  const fresh = [...seen.entries()]
    .filter(([, first]) => first === index + 1)
    .map(([word]) => word)
    .sort();
  console.log(`${level.name}  (${fresh.length} new words)`);
  console.log(`  ${fresh.join(' ')}\n`);
}

const totalSentences = LEVELS.reduce((n, level) => n + level.sentences.length, 0);
console.log(`${totalSentences} sentences, ${seen.size} distinct words in total.\n`);

console.log('=== checks ===');

const allSentences = LEVELS.flatMap((level) => level.sentences);

// Nothing but letters, apostrophes and single spaces: no digits, no punctuation a
// beginning reader has not met, and no double spaces that would render as a gap.
const badCharacters = allSentences.filter((s) => !/^[A-Za-z' ]+$/.test(s));
check('sentences contain only letters, apostrophes and spaces', badCharacters, []);
check('no double spaces', allSentences.filter((s) => /\s{2,}/.test(s)), []);
check('no leading or trailing spaces', allSentences.filter((s) => s !== s.trim()), []);
check('each sentence starts with a capital letter',
  allSentences.filter((s) => !/^[A-Z]/.test(s)), []);
check('no sentence ends with a full stop (the game shows words, not punctuation)',
  allSentences.filter((s) => /[.!?,;:]$/.test(s)), []);

const flagged = [...seen.keys()].filter((word) => NOT_FOR_CHILDREN.includes(word));
check('no word from the not-for-children list', flagged, []);

check('every sentence is unique', allSentences.length, new Set(allSentences).size);

// Level 1 has to be readable by a child who has just started: short words, short
// sentences. Later levels are allowed to grow, but not to jump.
const level1 = LEVELS[0].sentences;
check('level 1 words are all six letters or fewer',
  level1.flatMap(words).filter((w) => bare(w).length > 6), []);
check('level 1 sentences are at most six words',
  level1.filter((s) => words(s).length > 6), []);

const averageWordLength = (level) => {
  const all = level.sentences.flatMap(words).map(bare);
  return all.reduce((sum, w) => sum + w.length, 0) / all.length;
};
const lengths = LEVELS.map(averageWordLength);
console.log(`      average word length by level: ${lengths.map((l) => l.toFixed(2)).join(' -> ')}`);
// Non-decreasing rather than increasing: levels 2 and 3 are separated by the
// phonics pattern they teach (consonant blends, then long vowels), not by word
// length, and their averages are within 0.01 of each other. Demanding growth here
// would only tempt someone into padding level 3 with longer words for no reason.
check('word length never drops as levels go up',
  lengths.every((length, i) => i === 0 || length >= lengths[i - 1]));

const longest = LEVELS.map((level) => Math.max(...level.sentences.map((s) => words(s).length)));
console.log(`      longest sentence by level:    ${longest.join(' -> ')} words`);
check('sentences never get shorter as levels go up',
  longest.every((count, i) => i === 0 || count >= longest[i - 1]));

check('every level has the same number of sentences',
  new Set(LEVELS.map((level) => level.sentences.length)).size, 1);

console.log(failures ? `\n${failures} failing check(s)` : '\nAll content checks passed');
process.exit(failures ? 1 : 0);
