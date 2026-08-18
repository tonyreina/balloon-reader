// Tests the sky: balloon geometry and the ambient wildlife.
//
// The wildlife exists to keep a child engaged, which means the interesting
// assertions are the restraint ones — how few, how rarely, and where they are
// not allowed to go.
//
//   node tests/scene.test.mjs      (no browser, no dependencies)

globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };

const { Scene } = await import('../js/scene.js');

let failures = 0;
function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

// A canvas context that records nothing but accepts everything, so render() can
// be exercised for real.
function recordingContext() {
  const calls = { fill: 0, stroke: 0, ellipse: 0, arc: 0 };
  const noop = () => {};
  const gradient = { addColorStop: noop };
  return {
    calls,
    setTransform: noop, save: noop, restore: noop, translate: noop, scale: noop,
    rotate: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, clip: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, clearRect: noop, fillRect: noop,
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    fill() { calls.fill++; }, stroke() { calls.stroke++; },
    ellipse() { calls.ellipse++; }, arc() { calls.arc++; },
  };
}

function makeScene(width = 1000, height = 600) {
  const ctx = recordingContext();
  const canvas = {
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ width, height }),
    getContext: () => ctx,
  };
  const scene = new Scene(canvas);
  return { scene, ctx };
}

// Runs the scene forward in realistic frames.
function run(scene, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) scene.update(dt);
}

console.log('\n-- the wildlife shows restraint --');
{
  const { scene } = makeScene();
  check('the sky starts empty', scene.critters.count, 0);

  run(scene, 4);
  check('nothing arrives in the first few seconds', scene.critters.count, 0);

  // Over a long session there should be wildlife, but never a crowd. Spawn timing
  // is random, so measure several independent sessions and judge the average: one
  // session's occupancy swings by ten points either way.
  //
  // Arrivals per minute is the metric that matters. A new creature appearing is
  // what pulls a child's eye; a cat already halfway across the grass does not, so
  // "how much of the time is something on screen" is reported but not asserted on.
  let mostAtOnce = 0;
  let mostGround = 0;
  let mostSky = 0;
  const sessions = [];
  const minutes = 5;
  const frames = 60 * 60 * minutes;

  for (let session = 0; session < 5; session++) {
    const { scene: fresh } = makeScene();
    let occupied = 0;
    let arrivals = 0;
    let previous = 0;
    for (let i = 0; i < frames; i++) {
      fresh.update(1 / 60);
      const now = fresh.critters.count;
      if (now > previous) arrivals += now - previous;
      previous = now;
      if (now > 0) occupied++;
      mostAtOnce = Math.max(mostAtOnce, now);
      mostGround = Math.max(mostGround, fresh.critters.countOf('ground'));
      mostSky = Math.max(mostSky, fresh.critters.countOf('sky'));
    }
    sessions.push({ arrivalsPerMinute: arrivals / minutes, occupancy: occupied / frames });
  }

  const mean = (pick) => sessions.reduce((sum, s) => sum + pick(s), 0) / sessions.length;
  const arrivalRate = mean((s) => s.arrivalsPerMinute);
  const occupancy = mean((s) => s.occupancy);
  const spread = sessions.map((s) => `${Math.round(s.occupancy * 100)}%`).join(' ');

  check(`wildlife does appear (peak ${mostAtOnce} at once)`, mostAtOnce > 0);
  check(`never more than two in the sky (peak ${mostSky})`, mostSky <= 2);
  check(`never more than one on the ground (peak ${mostGround})`, mostGround <= 1);
  check(`never more than three at once (peak ${mostAtOnce})`, mostAtOnce <= 3);
  check(`arrivals stay occasional (${arrivalRate.toFixed(1)} per minute)`, arrivalRate <= 3);
  console.log(`      (something on screen ${Math.round(occupancy * 100)}% of the time; per session: ${spread})`);
}

console.log('\n-- they stay out of the way --');
{
  const { scene } = makeScene();
  let worstTop = Infinity;
  let worstBottom = -Infinity;
  let seen = 0;
  for (let i = 0; i < 60 * 600; i++) {
    scene.update(1 / 60);
    for (const critter of scene.critters.list) {
      if (critter.group !== 'sky') continue;
      seen++;
      worstTop = Math.min(worstTop, critter.y - critter.wander - critter.size * 2);
      worstBottom = Math.max(worstBottom, critter.y + critter.wander + critter.size * 2);
    }
  }
  check(`sky wildlife was observed (${seen} sightings)`, seen > 0);
  check(`nothing flies up behind the HUD (highest ${worstTop.toFixed(0)}, HUD ends ${scene.topInset})`,
    worstTop >= scene.topInset - 4);
  check(`nothing flies down over the sentence (lowest ${worstBottom.toFixed(0)}, grass at ${scene.grassTop.toFixed(0)})`,
    worstBottom <= scene.grassTop);
}

console.log('\n-- nothing new arrives while a child is stuck --');
{
  const { scene } = makeScene();
  scene.quiet = true;
  run(scene, 300);
  check('a quiet scene stays empty', scene.critters.count, 0);

  scene.quiet = false;
  run(scene, 120);
  check('and fills again once the child is moving', scene.critters.count > 0);
}

console.log('\n-- reduced motion means no motion --');
{
  const { scene } = makeScene();
  scene.critters.reducedMotion = true;
  run(scene, 600);
  check('no wildlife at all when reduced motion is asked for', scene.critters.count, 0);
}

console.log('\n-- cheering --');
{
  const { scene } = makeScene();
  // Put one of each on stage rather than waiting for the timers.
  scene.critters.spawnGround();
  scene.critters.spawnSky();
  const ground = scene.critters.list.find((c) => c.group === 'ground');
  const sky = scene.critters.list.find((c) => c.group === 'sky');

  check('nobody is cheering to start with', ground.cheerFor, 0);
  scene.cheer(1);
  check('a correct word sets the ground animal cheering', ground.cheerFor > 0);
  check('the sky pays no attention', sky.cheerFor, 0);

  const small = ground.cheerFor;
  scene.cheer(2.6);
  check('finishing a sentence cheers harder', ground.cheerFor > small);

  run(scene, 3);
  check('and the cheering settles down again', ground.cheerFor, 0);
}

console.log('\n-- everything can actually be drawn --');
{
  // Every creature kind, on both facing directions, through the real draw code.
  for (const kind of ['bird', 'butterfly', 'caterpillar', 'cat', 'dog']) {
    const { scene, ctx } = makeScene();
    const group = ['bird', 'butterfly'].includes(kind) ? 'sky' : 'ground';
    for (const dir of [1, -1]) {
      if (group === 'sky') scene.critters.spawnSky(); else scene.critters.spawnGround();
      const critter = scene.critters.list.at(-1);
      critter.kind = kind;
      critter.dir = dir;
      critter.cheerFor = 1; // exercise the cheering branch too
    }
    let threw = null;
    try {
      scene.render();
    } catch (error) {
      threw = error.message;
    }
    check(`a ${kind} draws without error`, threw, null);
    check(`a ${kind} actually paints something`, ctx.calls.fill + ctx.calls.stroke > 0);
  }
}

console.log('\n-- wildlife does not disturb the balloon --');
{
  const { scene } = makeScene();
  scene.critters.spawnGround();
  scene.critters.spawnSky();
  const before = scene.balloonY;
  const altitudeBefore = scene.altitude;
  run(scene, 2);
  check('the balloon still falls on its own terms', scene.balloonY > before);
  check('altitude is still a sane fraction', scene.altitude <= altitudeBefore && scene.altitude >= 0);

  scene.puff(1);
  run(scene, 0.5);
  check('and still rises when puffed', scene.velocity < 0);
}

console.log(failures ? `\n${failures} failing check(s)` : '\nAll scene checks passed');
process.exit(failures ? 1 : 0);
