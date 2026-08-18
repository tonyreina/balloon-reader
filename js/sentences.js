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
    sink: 0.041,
    lift: 0.110,
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
      'Grand dad and I clap and sing',
    ],
  },
  {
    name: 'Level 3 · Long Vowels',
    sink: 0.087,
    lift: 0.092,
    sentences: [
      'The white kite flew over the lake',
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
      'Marcus discovered an enormous footprint beside the river',
      'The children whispered because the baby was finally asleep',
      'Thunder rumbled while the family shared warm soup together',
      'Her favorite library book was about ancient volcanoes',
      'A gentle breeze carried the smell of fresh bread down the street',
      'The astronaut floated slowly toward the shining silver station',
    ],
  },
];

export function sentenceAt(levelIndex, sentenceIndex) {
  const level = LEVELS[Math.min(levelIndex, LEVELS.length - 1)];
  return level.sentences[sentenceIndex % level.sentences.length];
}
