// Reading content, ordered by difficulty. Level 1 is CVC words and the most
// common sight words; later levels add blends, digraphs and longer phrases.
//
// `sink` is how much of the sky the balloon loses per second with no reading,
// and `lift` is how much one correct word gains back. Both are fractions of the
// visible sky, so the difficulty is the same on every screen size. See
// tests/balance.mjs for what these mean in words-per-minute.

export const LEVELS = [
  {
    name: 'Level 1 · First Words',
    sink: 0.041816,
    lift: 0.110816,
    sentences: [
      'I can see the sun',
      'The cat is on my lap',
      'A big red dog ran',
      'We like to go up',
      'My hat is not wet',
      'He has a fun job',
      'She sat on the mat',
      'You can hop and run',
    ],
  },
  {
    name: 'Level 2 · Blends',
    sink: 0.059,
    lift: 0.100,
    sentences: [
      'The frog jumps in the pond',
      'My best friend has a red sled',
      'Stop and look at the black bird',
      'Ten small fish swim fast',
      'She spilled milk on the step',
      'Please help me plant the seed',
      'The truck went past our school',
      'Granddad and I dance and sing',
    ],
  },
  {
    name: 'Level 3 · Long Vowels',
    sink: 0.087,
    lift: 0.092,
    sentences: [
      'The green kite flew over the lake',
      'I made a cake for my mom',
      'Nine green beans grow in the rain',
      'He rode his bike home in time',
      'We ate five ripe grapes today',
      'Those cute mice hide in the pipe',
      'Please write your name on the page',
      'The brave mule pulled the heavy load',
    ],
  },
  {
    name: 'Level 4 · Two Syllables',
    sink: 0.106,
    lift: 0.084,
    sentences: [
      'The rabbit hopped under the wooden fence',
      'My sister found a yellow button in her pocket',
      'Seven puppies were sleeping beside the basket',
      'The dragon flew above the sleepy village',
      'Grandma baked muffins in a little kitchen',
      'A tiny spider was walking across the window',
      'The winter morning was cold and quiet',
      'We planted flowers along the garden path',
    ],
  },
  {
    name: 'Level 5 · Storytime',
    sink: 0.124,
    lift: 0.078,
    sentences: [
      'The curious fox followed a butterfly through the tall grass',
      'Every evening the lighthouse blinked across the dark water',
      'Tony discovered an enormous footprint beside the river',
      'The children whispered because the baby was finally asleep',
      'Thunder rumbled while the family shared warm soup together',
      'Her favorite library book was about ancient volcanoes',
      'A gentle breeze carried the smell of fresh bread down the street',
      'The astronaut floated slowly toward the shining silver station',
    ],
  },
];

export const CUSTOM_LEVEL = {
  name: 'Your own sentences',
  // Middle-of-the-road difficulty: a grown-up's own sentences could be anything,
  // so the balloon is forgiving rather than tuned to a reading level.
  sink: 0.06,
  lift: 0.10,
  sentences: [],
};

export function levelAt(levelIndex, custom = []) {
  if (levelIndex === CUSTOM_INDEX) {
    return { ...CUSTOM_LEVEL, sentences: custom };
  }
  return LEVELS[Math.min(Math.max(levelIndex, 0), LEVELS.length - 1)];
}

// Level index that means "the sentences a grown-up typed in".
export const CUSTOM_INDEX = -1;

const wordsOf = (sentence) =>
  sentence.toLowerCase().split(/\s+/).map((word) => word.replace(/[^a-z']/g, '')).filter(Boolean);

// Picks the next sentence for a level.
//
// Rather than marching through the list in order, this prefers a sentence
// containing words the child has needed help with and that are due for another
// go. That keeps practice targeted while every sentence stays a real sentence —
// stringing a child's missed words together would make nonsense, which is the
// last thing a beginning reader needs.
//
// `recent` is the handful just shown, so the same sentence does not come round
// twice in a row, and `cursor` provides the plain sequential order to fall back on
// when nothing is due.
export function pickSentence({ levelIndex, custom = [], dueWords = new Set(), recent = [], cursor = 0 }) {
  const level = levelAt(levelIndex, custom);
  const pool = level.sentences;
  if (!pool.length) return null;

  // A sentence containing the most words that are due for another go wins.
  if (dueWords.size) {
    let best = null;
    let bestCount = 0;
    for (const sentence of pool) {
      if (recent.includes(sentence)) continue;
      const hits = new Set(wordsOf(sentence).filter((word) => dueWords.has(word)));
      if (hits.size > bestCount) {
        bestCount = hits.size;
        best = sentence;
      }
    }
    if (best) return best;
  }

  // Otherwise straight through the level in order, stepping over anything just
  // shown. Walking forward from the cursor keeps that order intact — filtering the
  // pool first would renumber it and scramble the sequence.
  for (let step = 0; step < pool.length; step++) {
    const candidate = pool[(cursor + step) % pool.length];
    if (!recent.includes(candidate)) return candidate;
  }
  return pool[cursor % pool.length];
}

export function sentenceAt(levelIndex, sentenceIndex, custom = []) {
  const level = levelAt(levelIndex, custom);
  if (!level.sentences.length) return null;
  return level.sentences[sentenceIndex % level.sentences.length];
}
