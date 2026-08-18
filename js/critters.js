// Ambient wildlife: birds and butterflies crossing the sky, and a caterpillar,
// cat or dog wandering the grass.
//
// This is decoration, and decoration in a reading game has to earn its place.
// The rules it follows:
//   - Never many. At most two in the sky and one on the ground.
//   - Never often. Long, random gaps, so a creature is a small event.
//   - Never in front of the balloon, and never over the sentence: the sky band
//     stops below the HUD and the ground band sits on the grass.
//   - Nothing new appears while a child is stuck on a word.
//   - Nothing appears at all if the browser asks for reduced motion.
//
// The ground animals also cheer: a correct word makes them hop, and finishing a
// sentence sets them all off. They never say anything — no text competes with
// the words the child is reading.

const SKY_KINDS = ['bird', 'butterfly'];
const GROUND_KINDS = ['caterpillar', 'cat', 'dog'];
const BUTTERFLY_HUES = [45, 30, 275, 200, 330];

const MAX_SKY = 2;
const MAX_GROUND = 1;

// Seconds. Tuned so the sky is empty about half the time and a ground animal is
// a genuine event: gaps are measured from arrival, and a crossing takes a while,
// so gaps much shorter than these make the screen feel busy. tests/scene.test.mjs
// measures how often something is on screen.
const SKY_FIRST = [8, 16];
const SKY_GAP = [26, 48];
const GROUND_FIRST = [25, 45];
const GROUND_GAP = [75, 135];

const between = ([low, high]) => low + Math.random() * (high - low);

export class Critters {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.skyIn = between(SKY_FIRST);
    this.groundIn = between(GROUND_FIRST);
    this.time = 0;

    // Which animal comes next. These rotate rather than being picked at random,
    // because random picking happily sends the same animal three times running,
    // and part of the appeal is not knowing which one is next. Cats and dogs
    // therefore take turns. The starting point is random so it is not always the
    // caterpillar first.
    this.groundTurn = Math.floor(Math.random() * GROUND_KINDS.length);
    this.skyTurn = Math.floor(Math.random() * SKY_KINDS.length);

    // A child who has asked the browser to calm down gets no moving wildlife.
    this.reducedMotion = Boolean(
      typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
    );
  }

  get count() {
    return this.list.length;
  }

  countOf(group) {
    return this.list.filter((critter) => critter.group === group).length;
  }

  // Called when the child reads a word (small) or finishes a sentence (big).
  cheer(strength = 1) {
    for (const critter of this.list) {
      if (critter.group !== 'ground') continue;
      critter.cheerFor = Math.max(critter.cheerFor, 0.7 * strength);
    }
  }

  update(dt) {
    const { scene } = this;
    this.time += dt;

    if (!this.reducedMotion) {
      // `quiet` is set while the game is helping a stuck child: no new arrivals.
      this.skyIn -= dt;
      this.groundIn -= dt;
      if (this.skyIn <= 0) {
        this.skyIn = between(SKY_GAP);
        if (!scene.quiet && this.countOf('sky') < MAX_SKY) this.spawnSky();
      }
      if (this.groundIn <= 0) {
        this.groundIn = between(GROUND_GAP);
        if (!scene.quiet && this.countOf('ground') < MAX_GROUND) this.spawnGround();
      }
    }

    const margin = scene.width * 0.2 + 60;
    this.list = this.list.filter((critter) => {
      critter.age += dt;
      critter.phase += critter.flap * dt;
      critter.x += critter.speed * critter.dir * dt;
      critter.cheerFor = Math.max(0, critter.cheerFor - dt);
      return critter.x > -margin && critter.x < scene.width + margin;
    });
  }

  spawnSky() {
    const kind = SKY_KINDS[this.skyTurn++ % SKY_KINDS.length];
    const { width, height } = this.scene;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const size = Math.max(11, Math.min(width, height) * (kind === 'bird' ? 0.030 : 0.027));
    const wander = kind === 'bird' ? size * 1.4 : size * 3.2;

    // The band has to allow for the bobbing as well as the creature's own height,
    // or a bird drifts up behind the HUD and a butterfly dips over the sentence.
    const reach = wander + size * 2;
    const ceiling = this.scene.topInset + reach;
    const floor = this.scene.grassTop - reach;

    // Birds ride high and fast; butterflies drift lower and slower.
    const band = kind === 'bird'
      ? [ceiling, Math.max(ceiling, Math.min(floor, height * 0.44))]
      : [Math.min(floor, Math.max(ceiling, height * 0.42)), floor];
    const seconds = kind === 'bird' ? between([7, 11]) : between([13, 20]);

    this.list.push({
      kind,
      group: 'sky',
      dir,
      size,
      x: dir > 0 ? -size * 3 : width + size * 3,
      y: between(band),
      speed: width / seconds,
      flap: kind === 'bird' ? between([7, 10]) : between([4.5, 6.5]),
      phase: Math.random() * 6.283,
      wander,
      hue: kind === 'butterfly' ? BUTTERFLY_HUES[this.skyTurn % BUTTERFLY_HUES.length] : 0,
      cheerFor: 0,
      age: 0,
    });
  }

  spawnGround() {
    const kind = GROUND_KINDS[this.groundTurn++ % GROUND_KINDS.length];
    const { width, height } = this.scene;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const size = Math.max(13, Math.min(width, height)
      * (kind === 'caterpillar' ? 0.030 : 0.082));
    const seconds = kind === 'caterpillar' ? between([40, 65]) : between([26, 44]);

    this.list.push({
      kind,
      group: 'ground',
      dir,
      size,
      x: dir > 0 ? -size * 2 : width + size * 2,
      y: 0, // ground creatures sit on the grass line, resolved at draw time
      speed: width / seconds,
      flap: kind === 'caterpillar' ? between([5, 7]) : between([6, 8]),
      phase: Math.random() * 6.283,
      wander: 0,
      hue: 0,
      cheerFor: 0,
      age: 0,
    });
  }

  draw(ctx) {
    for (const critter of this.list) {
      ctx.save();
      if (critter.group === 'ground') {
        // Stand them in the grass, hopping when they are cheering.
        const hop = critter.cheerFor > 0
          ? Math.abs(Math.sin(this.time * 13)) * critter.size * 0.3
          : 0;
        ctx.translate(critter.x, this.scene.grassTop + this.scene.height * 0.022 - hop);
      } else {
        ctx.translate(critter.x, critter.y + Math.sin(critter.phase * 0.4) * critter.wander);
      }
      ctx.scale(critter.dir, 1); // face the way they are going

      if (critter.kind === 'bird') this.drawBird(ctx, critter);
      else if (critter.kind === 'butterfly') this.drawButterfly(ctx, critter);
      else if (critter.kind === 'caterpillar') this.drawCaterpillar(ctx, critter);
      else if (critter.kind === 'cat') this.drawCat(ctx, critter);
      else this.drawDog(ctx, critter);

      ctx.restore();
    }
  }

  // A distant gull: two curves that flap, no more detail than the eye needs.
  drawBird(ctx, bird) {
    const s = bird.size;
    const flap = Math.sin(bird.phase);
    ctx.strokeStyle = 'rgba(58, 76, 94, 0.62)';
    ctx.lineWidth = Math.max(1.3, s * 0.17);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s, flap * s * 0.42);
    ctx.quadraticCurveTo(-s * 0.45, -s * 0.5 + flap * s * 0.24, 0, 0);
    ctx.quadraticCurveTo(s * 0.45, -s * 0.5 + flap * s * 0.24, s, flap * s * 0.42);
    ctx.stroke();
  }

  drawButterfly(ctx, moth) {
    const s = moth.size;
    // Wings close to a sliver and open wide, seen from behind.
    const open = 0.28 + Math.abs(Math.sin(moth.phase)) * 0.72;
    const tilt = Math.sin(moth.phase * 0.5) * 0.25;

    ctx.rotate(tilt);
    ctx.save();
    ctx.scale(open, 1);
    ctx.fillStyle = `hsla(${moth.hue}, 88%, 68%, 0.92)`;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * s * 0.72, -s * 0.34, s * 0.72, s * 0.5, side * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(side * s * 0.58, s * 0.42, s * 0.5, s * 0.38, side * -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * s * 0.9, -s * 0.44, s * 0.17, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(62, 48, 40, 0.85)';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.13, s * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCaterpillar(ctx, bug) {
    const s = bug.size;
    const segments = 7;
    this.drawShadow(ctx, bug);
    for (let i = segments - 1; i >= 0; i--) {
      // Each segment lags the one in front, which reads as inching along.
      const lift = Math.sin(bug.phase - i * 0.85);
      const grow = i === 0 ? 1.18 : 1 - i * 0.045;
      ctx.fillStyle = i === 0
        ? 'hsla(96, 52%, 42%, 0.95)'
        : `hsla(${96 + i * 3}, 58%, ${48 + (i % 2) * 6}%, 0.95)`;
      ctx.beginPath();
      ctx.arc(-i * s * 0.62, -s * 0.42 - Math.max(0, lift) * s * 0.3, s * 0.36 * grow, 0, Math.PI * 2);
      ctx.fill();
    }
    // Antennae: thin, curved, with a little ball on the end.
    ctx.strokeStyle = 'hsla(96, 40%, 28%, 0.95)';
    ctx.lineWidth = Math.max(0.9, s * 0.05);
    ctx.lineCap = 'round';
    ctx.fillStyle = 'hsla(96, 40%, 28%, 0.95)';
    for (const side of [-1, 1]) {
      const tipX = s * (0.30 + side * 0.06);
      const tipY = -s * (1.02 + side * 0.06);
      ctx.beginPath();
      ctx.moveTo(s * 0.14, -s * 0.66);
      ctx.quadraticCurveTo(s * 0.30, -s * 0.96, tipX, tipY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tipX, tipY, s * 0.075, 0, Math.PI * 2);
      ctx.fill();
    }

    // A face on the head segment.
    ctx.fillStyle = 'hsl(22, 32%, 17%)';
    ctx.beginPath();
    ctx.arc(s * 0.16, -s * 0.5, s * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s * 0.175, -s * 0.52, s * 0.022, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'hsl(22, 32%, 17%)';
    ctx.lineWidth = Math.max(0.8, s * 0.035);
    ctx.beginPath();
    ctx.arc(s * 0.2, -s * 0.42, s * 0.09, 0.35, 1.5);
    ctx.stroke();
  }

  // A shadow keeps them standing on the grass rather than floating over it, and
  // it stays put while they hop, which is what makes the hop read.
  drawShadow(ctx, critter) {
    const s = critter.size;
    const hop = critter.cheerFor > 0 ? Math.abs(Math.sin(this.time * 13)) * s * 0.3 : 0;
    ctx.fillStyle = 'rgba(40, 60, 30, 0.16)';
    ctx.beginPath();
    ctx.ellipse(0, hop, s * 0.5, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Same approach as the dog: one flowing outline, a big round skull and a short
  // muzzle. A cat's silhouette differs mostly in the ears and the tail, so those
  // carry the recognition.
  catOutline(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(-0.52 * s, -0.34 * s);
    ctx.bezierCurveTo(-0.74 * s, -0.44 * s, -0.72 * s, -0.76 * s, -0.48 * s, -0.82 * s); // rump
    ctx.bezierCurveTo(-0.24 * s, -0.90 * s, 0.04 * s, -0.86 * s, 0.24 * s, -0.90 * s);   // back
    ctx.bezierCurveTo(0.40 * s, -0.94 * s, 0.40 * s, -1.10 * s, 0.54 * s, -1.18 * s);    // neck
    ctx.bezierCurveTo(0.72 * s, -1.30 * s, 0.98 * s, -1.24 * s, 1.03 * s, -1.04 * s);    // skull
    ctx.bezierCurveTo(1.07 * s, -0.94 * s, 1.08 * s, -0.84 * s, 1.00 * s, -0.76 * s);    // cheek
    ctx.bezierCurveTo(0.94 * s, -0.70 * s, 0.84 * s, -0.685 * s, 0.76 * s, -0.70 * s);   // short muzzle
    ctx.bezierCurveTo(0.66 * s, -0.72 * s, 0.60 * s, -0.52 * s, 0.54 * s, -0.40 * s);    // throat
    ctx.bezierCurveTo(0.46 * s, -0.29 * s, 0.06 * s, -0.265 * s, -0.16 * s, -0.29 * s);  // belly
    ctx.bezierCurveTo(-0.34 * s, -0.305 * s, -0.46 * s, -0.315 * s, -0.52 * s, -0.34 * s);
    ctx.closePath();
  }

  drawCat(ctx, cat) {
    const s = cat.size;
    const coat = 'hsl(30, 50%, 58%)';
    const shade = 'hsl(28, 44%, 44%)';
    const cream = 'hsl(40, 60%, 92%)';
    const pink = 'hsl(348, 62%, 76%)';
    const ink = 'hsl(22, 32%, 17%)';
    const flick = Math.sin(cat.phase * (cat.cheerFor > 0 ? 3.4 : 1.1));

    this.drawShadow(ctx, cat);
    this.drawPaw(ctx, cat, -0.26 * s, 2.1, shade, shade);
    this.drawPaw(ctx, cat, 0.36 * s, 0.9, shade, shade);

    // A tall curled tail, tapered, flicking. This is the cat's signature.
    const tailPath = () => {
      ctx.beginPath();
      ctx.moveTo(-0.46 * s, -0.72 * s);
      ctx.bezierCurveTo(
        (-0.86 + flick * 0.05) * s, -0.86 * s,
        (-0.96 + flick * 0.14) * s, -1.24 * s,
        (-0.70 + flick * 0.20) * s, -1.36 * s,
      );
      ctx.bezierCurveTo(
        (-0.80 + flick * 0.14) * s, -1.16 * s,
        (-0.70 + flick * 0.05) * s, -0.94 * s,
        -0.34 * s, -0.66 * s,
      );
      ctx.closePath();
    };
    ctx.fillStyle = coat;
    tailPath();
    ctx.fill();
    ctx.save();
    tailPath();
    ctx.clip();
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.arc((-0.70 + flick * 0.20) * s, -1.34 * s, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ears, drawn before the head so their bases disappear behind the skull.
    for (const [dx, lean] of [[0.60, -0.22], [0.94, 0.12]]) {
      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.moveTo((dx - 0.11) * s, -1.12 * s);
      ctx.quadraticCurveTo((dx + lean) * s, -1.60 * s, (dx + 0.15) * s, -1.10 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pink;
      ctx.beginPath();
      ctx.moveTo((dx - 0.04) * s, -1.14 * s);
      ctx.quadraticCurveTo((dx + lean * 0.8) * s, -1.44 * s, (dx + 0.09) * s, -1.13 * s);
      ctx.closePath();
      ctx.fill();
    }

    this.catOutline(ctx, s);
    ctx.fillStyle = coat;
    ctx.fill();

    ctx.save();
    this.catOutline(ctx, s);
    ctx.clip();

    // Tabby stripes over the back, following the body rather than sitting on it.
    ctx.strokeStyle = shade;
    ctx.lineWidth = s * 0.075;
    ctx.lineCap = 'round';
    for (const at of [-0.30, -0.12, 0.06]) {
      ctx.beginPath();
      ctx.moveTo(at * s, -0.92 * s);
      ctx.quadraticCurveTo((at + 0.06) * s, -0.80 * s, (at + 0.02) * s, -0.68 * s);
      ctx.stroke();
    }

    ctx.fillStyle = cream;      // chest and muzzle
    ctx.beginPath();
    ctx.ellipse(0.48 * s, -0.46 * s, 0.22 * s, 0.20 * s, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.06 * s, -0.32 * s, 0.36 * s, 0.10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.90 * s, -0.80 * s, 0.17 * s, 0.13 * s, 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Nose, mouth, eye: the same face treatment as the dog, so they are clearly
    // the same pair of hands.
    ctx.fillStyle = pink;
    ctx.beginPath();
    ctx.moveTo(1.00 * s, -0.85 * s);
    ctx.lineTo(1.07 * s, -0.85 * s);
    ctx.lineTo(1.035 * s, -0.79 * s);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, s * 0.026);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(1.035 * s, -0.78 * s);
    ctx.quadraticCurveTo(0.99 * s, -0.73 * s, 0.94 * s, -0.77 * s);
    ctx.stroke();

    // Whiskers, kept faint so they do not turn into scratches at small sizes.
    ctx.strokeStyle = 'rgba(60, 45, 35, 0.35)';
    ctx.lineWidth = Math.max(0.8, s * 0.016);
    for (const dy of [-0.02, 0.04]) {
      ctx.beginPath();
      ctx.moveTo(1.00 * s, (-0.82 + dy) * s);
      ctx.lineTo(1.26 * s, (-0.86 + dy * 2) * s);
      ctx.stroke();
    }

    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(0.90 * s, -1.00 * s, 0.058 * s, 0.075 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0.92 * s, -1.03 * s, 0.024 * s, 0, Math.PI * 2);
    ctx.fill();

    this.drawPaw(ctx, cat, -0.40 * s, 0, coat, cream);
    this.drawPaw(ctx, cat, 0.22 * s, 3.0, coat, cream);
  }

  // The dog's outline is one continuous path rather than a stack of ellipses:
  // overlapping primitives are what made the earlier version read as geometric.
  // Proportions are deliberately puppyish — a big round head, a short muzzle, a
  // low chest and stubby legs — because that is what makes an animal read as cute.
  dogOutline(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(-0.60 * s, -0.34 * s);
    ctx.bezierCurveTo(-0.80 * s, -0.44 * s, -0.78 * s, -0.74 * s, -0.54 * s, -0.80 * s); // rump
    ctx.bezierCurveTo(-0.26 * s, -0.88 * s, 0.06 * s, -0.84 * s, 0.28 * s, -0.88 * s);   // back
    ctx.bezierCurveTo(0.44 * s, -0.92 * s, 0.44 * s, -1.08 * s, 0.60 * s, -1.16 * s);    // neck
    ctx.bezierCurveTo(0.76 * s, -1.26 * s, 1.00 * s, -1.20 * s, 1.06 * s, -1.02 * s);    // skull
    ctx.bezierCurveTo(1.09 * s, -0.92 * s, 1.18 * s, -0.90 * s, 1.24 * s, -0.82 * s);    // brow to muzzle
    ctx.bezierCurveTo(1.33 * s, -0.72 * s, 1.28 * s, -0.60 * s, 1.14 * s, -0.585 * s);   // nose, rounded
    ctx.bezierCurveTo(1.02 * s, -0.575 * s, 0.94 * s, -0.60 * s, 0.86 * s, -0.62 * s);   // chin
    ctx.bezierCurveTo(0.72 * s, -0.645 * s, 0.66 * s, -0.50 * s, 0.60 * s, -0.40 * s);   // throat
    ctx.bezierCurveTo(0.52 * s, -0.285 * s, 0.10 * s, -0.255 * s, -0.20 * s, -0.28 * s); // belly
    ctx.bezierCurveTo(-0.40 * s, -0.295 * s, -0.54 * s, -0.30 * s, -0.60 * s, -0.34 * s);
    ctx.closePath();
  }

  // Legs bend rather than hinge, and each ends in a paw, so they do not read as
  // sticks poking out of an ellipse.
  drawPaw(ctx, critter, x, offset, coat, cream) {
    const s = critter.size;
    const swing = Math.sin(critter.phase * 1.5 + offset) * s * 0.09;
    ctx.strokeStyle = coat;
    ctx.lineWidth = s * 0.15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, -s * 0.44);
    ctx.quadraticCurveTo(x + swing * 0.4, -s * 0.24, x + swing, -s * 0.07);
    ctx.stroke();
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.ellipse(x + swing, -s * 0.055, s * 0.105, s * 0.062, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawDog(ctx, dog) {
    const s = dog.size;
    const coat = 'hsl(28, 54%, 54%)';
    const shade = 'hsl(26, 46%, 42%)';
    const earColor = 'hsl(24, 44%, 36%)';
    const cream = 'hsl(38, 62%, 90%)';
    const ink = 'hsl(22, 32%, 17%)';
    const wag = Math.sin(dog.phase * (dog.cheerFor > 0 ? 8 : 3));

    this.drawShadow(ctx, dog);

    // Far legs first, in shadow, so the body sits in front of them.
    this.drawPaw(ctx, dog, -0.30 * s, 2.1, shade, shade);
    this.drawPaw(ctx, dog, 0.40 * s, 0.9, shade, shade);

    // Tail: a tapered shape, wide at the base and pointed at the tip.
    const tailPath = () => {
      ctx.beginPath();
      ctx.moveTo(-0.56 * s, -0.68 * s);
      ctx.quadraticCurveTo(
        (-0.92 + wag * 0.10) * s, -0.88 * s,
        (-0.84 + wag * 0.26) * s, -1.20 * s,
      );
      ctx.quadraticCurveTo(
        (-0.70 + wag * 0.20) * s, -0.92 * s,
        -0.44 * s, -0.62 * s,
      );
      ctx.closePath();
    };
    ctx.fillStyle = coat;
    tailPath();
    ctx.fill();
    // Cream tip, the way most dogs have one. Clipped to the tail, or it floats
    // away from the tip as a detached white blob.
    ctx.save();
    tailPath();
    ctx.clip();
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.ellipse((-0.84 + wag * 0.26) * s, -1.15 * s, s * 0.12, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.dogOutline(ctx, s);
    ctx.fillStyle = coat;
    ctx.fill();

    // Markings are clipped to the outline so nothing looks stuck on top.
    ctx.save();
    this.dogOutline(ctx, s);
    ctx.clip();

    ctx.fillStyle = shade;         // darker saddle over the back
    ctx.beginPath();
    ctx.ellipse(-0.05 * s, -0.95 * s, 0.52 * s, 0.30 * s, -0.06, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = cream;         // chest and belly
    ctx.beginPath();
    ctx.ellipse(0.52 * s, -0.44 * s, 0.24 * s, 0.20 * s, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.1 * s, -0.32 * s, 0.42 * s, 0.11 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();               // cream muzzle
    ctx.ellipse(1.10 * s, -0.70 * s, 0.24 * s, 0.16 * s, 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Floppy teardrop ear, hanging along the cheek.
    ctx.fillStyle = earColor;
    ctx.beginPath();
    ctx.moveTo(0.66 * s, -1.14 * s);
    ctx.bezierCurveTo(0.50 * s, -1.10 * s, 0.44 * s, -0.86 * s, 0.52 * s, -0.68 * s);
    ctx.bezierCurveTo(0.62 * s, -0.56 * s, 0.78 * s, -0.64 * s, 0.80 * s, -0.82 * s);
    ctx.bezierCurveTo(0.82 * s, -0.98 * s, 0.78 * s, -1.10 * s, 0.66 * s, -1.14 * s);
    ctx.closePath();
    ctx.fill();

    // Nose, a soft blob with a highlight rather than a flat dot.
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(1.23 * s, -0.73 * s, 0.075 * s, 0.062 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(1.21 * s, -0.76 * s, 0.026 * s, 0.02 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // A smile. Cheap, and it does more for cuteness than anything else here.
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, s * 0.028);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(1.20 * s, -0.66 * s);
    ctx.quadraticCurveTo(1.10 * s, -0.60 * s, 1.02 * s, -0.65 * s);
    ctx.stroke();

    // Big eye, set forward, with a catchlight.
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(0.98 * s, -0.94 * s, 0.062 * s, 0.072 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(1.00 * s, -0.97 * s, 0.026 * s, 0, Math.PI * 2);
    ctx.fill();

    // Tan brow spot, the marking that gives a dog an expression.
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.ellipse(0.95 * s, -1.06 * s, 0.07 * s, 0.045 * s, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Near legs last, in full colour, so the dog has depth.
    this.drawPaw(ctx, dog, -0.44 * s, 0, coat, cream);
    this.drawPaw(ctx, dog, 0.26 * s, 3.0, coat, cream);
  }
}
