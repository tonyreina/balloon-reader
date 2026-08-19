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
const { UNSAFE_WORDS, unsafeWordsIn } = await import('../js/safe-words.js');

let failures = 0;
function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  got ${JSON.stringify(actual)}`}`);
}

const words = (sentence) => sentence.split(/\s+/);
const bare = (word) => word.toLowerCase().replace(/[^a-z']/g, '');

// The list lives in js/safe-words.js so the sentences shipped here and the sentences
// a grown-up types are held to one standard rather than two that drift apart.
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

const flagged = [...seen.keys()].filter((word) => unsafeWordsIn(word).length > 0);
check(`no word a child should not be asked to read (${UNSAFE_WORDS.size} blocked)`, flagged, []);

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
// Adjacent levels are NOT required to grow, because some are separated by the
// phonics pattern they teach rather than by length: level 3 is long vowels, and
// long-vowel words ("kite", "cake", "ripe") are short by nature, so it can sit
// below level 2 on this measure and still be harder to read. Requiring growth
// between neighbours would only tempt someone into padding a level with longer
// words to satisfy the number. What must hold is the overall climb.
check(`level 1 has the shortest words (${lengths[0].toFixed(2)})`,
  lengths[0], Math.min(...lengths));
check(`the last level has the longest (${lengths.at(-1).toFixed(2)})`,
  lengths.at(-1), Math.max(...lengths));
check('word length climbs over any two levels',
  lengths.every((length, i) => i < 2 || length > lengths[i - 2]));

const longest = LEVELS.map((level) => Math.max(...level.sentences.map((s) => words(s).length)));
console.log(`      longest sentence by level:    ${longest.join(' -> ')} words`);
check('sentences never get shorter as levels go up',
  longest.every((count, i) => i === 0 || count >= longest[i - 1]));

// Not "the same number" — that forbade the perfectly reasonable act of adding more
// sentences to one level, and nothing in the game requires equal counts: promotion
// happens after SENTENCES_PER_LEVEL completions regardless, so a longer level simply
// has more variety before it repeats. What must hold is that no level is too thin to
// finish, which is what catches a truncated or half-deleted list.
const PROMOTION = 4;   // js/game.js SENTENCES_PER_LEVEL
const counts = LEVELS.map((level) => level.sentences.length);
console.log(`      sentences per level:          ${counts.join(' · ')}`);
check(`every level has enough to reach promotion (needs ${PROMOTION})`,
  counts.filter((n) => n < PROMOTION), []);
check('and enough for variety before repeating', counts.filter((n) => n < 6), []);

console.log(failures ? `\n${failures} failing check(s)` : '\nAll content checks passed');
process.exit(failures ? 1 : 0);
