// Runs the real balloon physics headlessly to answer the only question that
// matters for difficulty: how slowly can a child read and still stay aloft?
//
//   node tests/balance.mjs
//
// Early readers reading aloud manage roughly 20-60 words per minute, so level 1
// must stay well under that and the top level should sit around fluent pace.

globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
if (!globalThis.performance) {
  Object.defineProperty(globalThis, 'performance', { value: { now: () => 0 }, configurable: true });
}

const { Scene } = await import('../js/scene.js');
const { LEVELS } = await import('../js/sentences.js');

function fakeCanvas(width, height) {
  return {
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ width, height }),
    getContext: () => ({ setTransform() {} }),
  };
}

// Plays one sentence at a constant pace; returns true if the balloon survives.
function survives(level, sentence, secondsPerWord, { gentle = false, size = [900, 560] } = {}) {
  const scene = new Scene(fakeCanvas(...size));
  scene.sink = level.sink * (gentle ? 0.6 : 1);
  scene.lift = level.lift * (gentle ? 1.25 : 1);
  scene.reset();

  const words = sentence.split(/\s+/);
  const dt = 1 / 60;
  let elapsed = 0;
  let spoken = 0;

  while (spoken < words.length) {
    elapsed += dt;
    scene.update(dt);
    if (scene.grounded) return false;
    if (elapsed >= (spoken + 1) * secondsPerWord) {
      const word = words[spoken];
      scene.puff(1 + Math.min(word.length, 10) * 0.035);
      spoken += 1;
    }
  }
  return true;
}

// Slowest pace that still finishes the sentence, in words per minute.
function slowestPace(level, sentence, options) {
  let ok = 0.2;      // very fast, certainly survivable
  let fail = 30;     // absurdly slow, certainly not
  if (!survives(level, sentence, ok, options)) return null;
  for (let i = 0; i < 24; i++) {
    const mid = (ok + fail) / 2;
    if (survives(level, sentence, mid, options)) ok = mid; else fail = mid;
  }
  return 60 / ok;
}

const sizes = { laptop: [1280, 620], phone: [390, 520], tablet: [820, 900] };

console.log('Slowest sustainable reading pace (words per minute)\n');
console.log('level                       normal  gentle   phone  tablet   sink-only fall');
for (const level of LEVELS) {
  // The longest sentence in the level is the hardest to sustain.
  const sentence = level.sentences.reduce((a, b) => (b.split(' ').length > a.split(' ').length ? b : a));
  const normal = slowestPace(level, sentence, {});
  const gentle = slowestPace(level, sentence, { gentle: true });
  const phone = slowestPace(level, sentence, { size: sizes.phone });
  const tablet = slowestPace(level, sentence, { size: sizes.tablet });

  // How long an unread balloon takes to reach the grass.
  const scene = new Scene(fakeCanvas(...sizes.laptop));
  scene.sink = level.sink;
  scene.lift = level.lift;
  scene.reset();
  let seconds = 0;
  while (!scene.grounded && seconds < 120) { scene.update(1 / 60); seconds += 1 / 60; }

  const cell = (value) => (value === null ? '  n/a' : value.toFixed(0).padStart(5));
  console.log(
    `${level.name.padEnd(26)}${cell(normal)}   ${cell(gentle)}   ${cell(phone)}   ${cell(tablet)}`
    + `        ${seconds.toFixed(1)}s`,
  );
}

console.log('\nWord count of the sentence tested per level:');
for (const level of LEVELS) {
  const longest = level.sentences.reduce((a, b) => (b.split(' ').length > a.split(' ').length ? b : a));
  console.log(`  ${level.name.padEnd(26)} ${String(longest.split(' ').length).padStart(2)} words  "${longest}"`);
}
