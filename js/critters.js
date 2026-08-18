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
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class Critters {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.skyIn = between(SKY_FIRST);
    this.groundIn = between(GROUND_FIRST);
    this.time = 0;

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
    const kind = pick(SKY_KINDS);
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
      hue: kind === 'butterfly' ? pick([45, 30, 275, 200, 330]) : 0,
      cheerFor: 0,
      age: 0,
    });
  }

  spawnGround() {
    const kind = pick(GROUND_KINDS);
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
    ctx.strokeStyle = 'hsla(96, 45%, 30%, 0.9)';
    ctx.lineWidth = Math.max(1, s * 0.07);
    for (const side of [-0.5, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(s * 0.2, -s * 0.7);
      ctx.lineTo(s * 0.42, -s * 1.05 + side * s * 0.2);
      ctx.stroke();
    }
  }

  // Four short legs that swing in pairs: enough to read as walking at this size.
  drawLegs(ctx, critter, spread, color) {
    const s = critter.size;
    const swing = Math.sin(critter.phase * 1.5);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, s * 0.1);
    ctx.lineCap = 'round';
    for (const [i, at] of spread.entries()) {
      const lift = (i % 2 === 0 ? swing : -swing) * s * 0.12;
      ctx.beginPath();
      ctx.moveTo(at * s, -s * 0.3);
      ctx.lineTo(at * s + lift, -s * 0.02);
      ctx.stroke();
    }
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

  drawCat(ctx, cat) {
    const s = cat.size;
    const coat = 'hsl(28, 55%, 56%)';
    const dark = 'hsl(26, 50%, 38%)';
    const wag = Math.sin(cat.phase * (cat.cheerFor > 0 ? 3.4 : 1.1));

    this.drawShadow(ctx, cat);
    this.drawLegs(ctx, cat, [-0.3, -0.12, 0.2, 0.36], dark);

    // A tall curled tail is most of what says "cat" at this size.
    ctx.strokeStyle = coat;
    ctx.lineWidth = s * 0.14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.44, -s * 0.46);
    ctx.quadraticCurveTo(-s * 0.92, -s * 0.72 + wag * s * 0.16, -s * 0.66, -s * 1.16 + wag * s * 0.14);
    ctx.stroke();

    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.52, s * 0.46, s * 0.27, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tabby stripes: cheap, and they read as a cat immediately.
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1.2, s * 0.055);
    for (const at of [-0.2, 0.0, 0.2]) {
      ctx.beginPath();
      ctx.arc(s * at, -s * 0.52, s * 0.24, -2.5, -0.7);
      ctx.stroke();
    }

    // Head, kept large relative to the body the way a cat's reads.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.arc(s * 0.5, -s * 0.86, s * 0.29, 0, Math.PI * 2);
    ctx.fill();

    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * (0.5 + side * 0.2), -s * 1.02);
      ctx.lineTo(s * (0.5 + side * 0.26), -s * 1.42);
      ctx.lineTo(s * (0.5 + side * 0.02), -s * 1.1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'hsl(348, 60%, 74%)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * (0.5 + side * 0.16), -s * 1.06);
      ctx.lineTo(s * (0.5 + side * 0.2), -s * 1.29);
      ctx.lineTo(s * (0.5 + side * 0.06), -s * 1.11);
      ctx.closePath();
      ctx.fill();
    }

    // White muzzle and chest, so it is not one flat colour against the grass.
    ctx.fillStyle = 'rgba(255, 252, 245, 0.92)';
    ctx.beginPath();
    ctx.ellipse(s * 0.66, -s * 0.78, s * 0.14, s * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.3, -s * 0.4, s * 0.12, s * 0.16, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'hsl(20, 30%, 18%)';
    ctx.beginPath();
    ctx.arc(s * 0.6, -s * 0.93, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'hsl(348, 55%, 62%)';
    ctx.beginPath();
    ctx.arc(s * 0.72, -s * 0.82, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  drawDog(ctx, dog) {
    const s = dog.size;
    const coat = 'hsl(34, 45%, 50%)';
    const dark = 'hsl(32, 42%, 32%)';
    const ear = 'hsl(30, 40%, 34%)';
    // A wagging tail is the whole point of a dog, and it doubles as the cheer.
    const wag = Math.sin(dog.phase * (dog.cheerFor > 0 ? 8 : 3));

    this.drawShadow(ctx, dog);
    this.drawLegs(ctx, dog, [-0.38, -0.18, 0.22, 0.42], dark);

    ctx.strokeStyle = coat;
    ctx.lineWidth = s * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.52, -s * 0.52);
    ctx.quadraticCurveTo(-s * 0.76, -s * 0.82, -s * 0.62 + wag * s * 0.26, -s * 1.12);
    ctx.stroke();

    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.54, s * 0.52, s * 0.27, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head and a long snout: the snout is what separates it from the cat.
    ctx.beginPath();
    ctx.arc(s * 0.52, -s * 0.86, s * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.82, -s * 0.76, s * 0.2, s * 0.13, 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 252, 245, 0.9)';
    ctx.beginPath();
    ctx.ellipse(s * 0.28, -s * 0.42, s * 0.13, s * 0.17, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // One floppy ear, hanging.
    ctx.fillStyle = ear;
    ctx.beginPath();
    ctx.ellipse(s * 0.38, -s * 0.82, s * 0.13, s * 0.28, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // A red collar reads as "somebody's dog" in one glance.
    ctx.strokeStyle = 'hsl(2, 70%, 52%)';
    ctx.lineWidth = s * 0.09;
    ctx.beginPath();
    ctx.arc(s * 0.4, -s * 0.68, s * 0.21, -0.5, 1.5);
    ctx.stroke();

    ctx.fillStyle = 'hsl(20, 25%, 15%)';
    ctx.beginPath();
    ctx.arc(s * 1.0, -s * 0.78, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.6, -s * 0.92, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
}
