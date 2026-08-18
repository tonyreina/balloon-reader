// Fuzzy word matching: children mispronounce, and speech recognition guesses.
// We accept a word if it is close enough, so the game rewards effort not luck.

const HOMOPHONE_GROUPS = [
  ['to', 'too', 'two'], ['for', 'four', 'fore'], ['one', 'won'],
  ['there', 'their', 'theyre'], ['be', 'bee'], ['see', 'sea'],
  ['no', 'know'], ['i', 'eye', 'aye'], ['hi', 'high'],
  ['by', 'buy', 'bye'], ['ate', 'eight'], ['blue', 'blew'],
  ['our', 'hour'], ['you', 'ewe', 'u'], ['here', 'hear'],
  ['son', 'sun'], ['flower', 'flour'], ['knight', 'night'],
  ['made', 'maid'], ['meet', 'meat'], ['nose', 'knows'],
  ['pair', 'pear'], ['right', 'write'], ['road', 'rode'],
  ['sale', 'sail'], ['some', 'sum'], ['tail', 'tale'],
  ['threw', 'through'], ['wait', 'weight'], ['way', 'weigh'],
  ['wood', 'would'], ['whole', 'hole'], ['ant', 'aunt'],
  ['bear', 'bare'], ['board', 'bored'], ['plane', 'plain'],
  ['deer', 'dear'], ['hair', 'hare'], ['toad', 'towed'],
  ['ball', 'bawl'], ['not', 'knot'], ['ok', 'okay'],
];

const HOMOPHONE_KEY = new Map();
HOMOPHONE_GROUPS.forEach((group, index) => {
  for (const word of group) HOMOPHONE_KEY.set(word, index);
});

// Noises the recognizer reports while a child thinks out loud.
const FILLERS = new Set(['um', 'uh', 'er', 'erm', 'hmm', 'mm', 'mmm', 'ah', 'huh']);

export function normalize(word) {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function tokenize(text) {
  return text.split(/\s+/).map(normalize).filter(Boolean);
}

export function isFiller(token) {
  return FILLERS.has(token);
}

export function editDistance(a, b) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

// Longer words earn more forgiveness: "elephant" vs "elefant" should pass,
// but "cat" vs "cap" must not.
function allowance(length) {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

export function matches(spoken, target) {
  const said = normalize(spoken);
  const want = normalize(target);
  if (!said || !want) return false;
  if (said === want) return true;

  const saidGroup = HOMOPHONE_KEY.get(said);
  if (saidGroup !== undefined && saidGroup === HOMOPHONE_KEY.get(want)) return true;

  // Plural / tense slips that don't mean the child misread the word.
  if (said.replace(/(s|es|ed|ing)$/, '') === want.replace(/(s|es|ed|ing)$/, '')
      && want.length >= 4) return true;

  return editDistance(said, want) <= allowance(want.length);
}
