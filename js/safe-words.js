// The words this game will not put in front of a child.
//
// Two places use it: the sentences typed into "My sentences" are rejected if they
// contain any of these, and tests/content.test.mjs holds the bundled sentences in
// js/sentences.js to the same standard. One list, so the two cannot drift apart.
//
// What this is for. The realistic risk is not an attacker — the feature is only
// offered when the game is served from the machine it is played on, so anyone who
// could reach it could edit the source instead. It is an older sibling typing
// something for a younger one to read aloud, or a grown-up pasting a line from
// somewhere without rereading it. A blocklist stops exactly that, and nothing more:
// it cannot judge tone, context or a sentence that is unkind without using any of
// these words. Reading what your child will read remains the real safeguard, which
// is why `pixi run -e dev words` prints the whole vocabulary.
//
// Deliberately whole-word matching. Substring matching would reject "grass",
// "Scunthorpe" and "classic", and a filter that punishes innocent words teaches a
// child that the computer is arbitrary.

// Light obfuscation is undone before matching, so "sh1t" and "@ss" do not walk past.
const LOOKALIKES = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', '7': 't' };

// Profanity, slurs and sexual language. Present so they can be blocked; a filter
// that does not name them does not stop them.
const PROFANITY = [
  'arse', 'arsehole', 'ass', 'asshole', 'bastard', 'bitch', 'bollocks', 'bugger',
  'crap', 'cunt', 'damn', 'dick', 'dickhead', 'douche', 'fuck', 'fucker', 'fucking',
  'goddamn', 'jackass', 'motherfucker', 'piss', 'prick', 'pussy', 'shit', 'shite',
  'slut', 'twat', 'wanker', 'whore',
];

const SLURS = [
  'chink', 'coon', 'dyke', 'fag', 'faggot', 'gook', 'kike', 'nigger', 'nigga',
  'paki', 'raghead', 'retard', 'retarded', 'spastic', 'spic', 'tranny', 'wetback',
];

const SEXUAL = [
  'anal', 'blowjob', 'boobs', 'cock', 'cum', 'erection', 'horny', 'masturbate',
  'naked', 'nude', 'orgasm', 'penis', 'porn', 'porno', 'rape', 'sex', 'sexy',
  'sperm', 'testicles', 'vagina', 'virgin',
];

// Not obscene, but not what a five year old should be practising reading aloud.
const FRIGHTENING = [
  'behead', 'beheaded', 'blood', 'bloody', 'bomb', 'corpse', 'dead', 'death', 'die',
  'died', 'dies', 'gun', 'guns', 'hang', 'hanged', 'kill', 'killed', 'killing',
  'kills', 'knife', 'murder', 'murdered', 'rifle', 'shoot', 'shooting', 'shot',
  'slaughter', 'stab', 'stabbed', 'strangle', 'suicide', 'torture', 'weapon',
];

const ADULT = [
  'beer', 'booze', 'cigarette', 'cocaine', 'drug', 'drugs', 'drunk', 'heroin',
  'joint', 'marijuana', 'meth', 'smoking', 'stoned', 'vodka', 'weed', 'whiskey', 'wine',
];

// Words a child should not be handed to read about themselves or anyone else.
const CRUEL = [
  'fat', 'hate', 'idiot', 'loser', 'moron', 'stupid', 'ugly', 'worthless',
];

export const UNSAFE_WORDS = new Set([
  ...PROFANITY, ...SLURS, ...SEXUAL, ...FRIGHTENING, ...ADULT, ...CRUEL,
]);

// Reduces a word to the form the list is written in: lower case, lookalike
// characters resolved, everything else dropped. "Sh1t!" and "@SS" both land.
export function canonical(word) {
  return String(word)
    .toLowerCase()
    .split('')
    .map((ch) => LOOKALIKES[ch] ?? ch)
    .join('')
    .replace(/[^a-z]/g, '');
}

// Returns the unsafe words a piece of text contains, in the order they appear.
// Plurals and simple endings are checked too, so "idiots" and "killing" are caught
// without listing every form.
export function unsafeWordsIn(text) {
  const found = [];
  for (const raw of String(text || '').split(/\s+/)) {
    const word = canonical(raw);
    if (!word) continue;
    const stem = word.replace(/(s|es|ed|ing|er|ers|y)$/, '');
    if (UNSAFE_WORDS.has(word)) found.push(word);
    else if (stem.length >= 3 && UNSAFE_WORDS.has(stem)) found.push(word);
  }
  return found;
}

export function isSafeForChildren(text) {
  return unsafeWordsIn(text).length === 0;
}
