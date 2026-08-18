// The dragon that keeps the balloon up.
//
// It hovers below the balloon and is the visible cause of the mechanic: when a child
// reads a word, the dragon huffs and a puff of air lifts the balloon. Nothing about
// the physics lives here — the scene still owns that — but the puff particles are
// emitted from this dragon's mouth, so what a child sees and what the game does are
// the same event.
//
// Drawn as real anatomy rather than a cartoon shape: a serpentine neck, membrane
// wings with finger struts, overlapping belly plates, four clawed limbs, a spaded
// tail and a dorsal ridge. The proportions are the cute part — an oversized skull,
// a short rounded snout and a big eye, the way a hatchling is built rather than a
// wyvern. Anatomy at a young child's dragon, in other words.
//
// Fine detail is skipped when the dragon is drawn small, because at forty pixels
// belly plates and wing struts stop being detail and become dirt.

const TAU = Math.PI * 2;

export class Dragon {
  constructor(scene) {
    this.scene = scene;
    this.x = 0;
    this.y = 0;
    this.size = 40;
    this.started = false;

    this.flap = 0;        // wingbeat phase
    this.bob = 0;         // hover phase
    this.huffT = 0;       // 1 at the moment of the puff, easing to 0
    this.huffPower = 1;
    this.cheerT = 0;      // longer celebration after a finished sentence
    this.blinkT = 0;
    this.nextBlink = 2.5;

    this.drift = Math.random() * TAU;  // where in the patrol it starts
    this.facing = 1;                   // eased -1..1, used directly as scaleX
    this.facingWanted = 1;
  }

  // Rough scale: a little larger than the balloon, so it reads as the thing doing
  // the lifting and so its anatomy survives being drawn.
  get scale() {
    return this.scene.radius * 1.15;
  }

  // Where the air comes out, derived rather than stored: the head group is drawn at
  // (0.46s, -0.9s) from the anchor and the lips sit at (0.36s, -0.28s) inside it.
  // Computing it on demand keeps the puff emitter and the drawn mouth in step.
  get mouth() {
    const s = this.size;
    const lunge = this.huffT * s * 0.16;
    return {
      x: this.x + this.facing * (s * 0.82 + lunge * 0.5),
      y: this.y - s * 1.18 - lunge + this.hover,
    };
  }

  huff(power = 1) {
    this.huffT = 1;
    this.huffPower = Math.min(1.6, power);
    this.flap += 1.1; // a hard downbeat with the breath
  }

  cheer(strength = 1) {
    this.cheerT = Math.max(this.cheerT, 0.6 * strength);
  }

  update(dt) {
    const { scene } = this;
    const s = this.scale;
    this.size = s;

    // It patrols from one side of the balloon to the other rather than hanging in
    // one spot, turning to face the balloon as it crosses. sin() slows at the
    // extremes on its own, so it lingers at each side without any extra logic.
    this.drift += dt * 0.62;
    const targetX = scene.balloonX + Math.sin(this.drift) * s * 1.5;
    // Well clear of the balloon: the gap is where the breath is visible, so it has
    // to be big enough to see a jet of air crossing it.
    const targetY = scene.balloonY + scene.radius + s * 2.5;

    if (!this.started) {
      this.x = targetX;
      this.y = targetY;
      this.started = true;
    } else {
      // Exponential ease: fast enough to keep up, slow enough to look like flying.
      const follow = 1 - Math.pow(0.0006, dt);
      this.x += (targetX - this.x) * follow;
      this.y += (targetY - this.y) * follow;
    }

    // Always face the balloon it is breathing at. The turn is eased rather than
    // snapped, so mid-turn the dragon is genuinely edge-on: that reads as turning
    // round instead of flipping. A dead band keeps it from dithering as it crosses.
    const offset = scene.balloonX - this.x;
    if (offset > s * 0.25) this.facingWanted = 1;
    else if (offset < -s * 0.25) this.facingWanted = -1;
    this.facing += (this.facingWanted - this.facing) * (1 - Math.pow(0.004, dt));

    const hurry = 1 + this.huffT * 1.6 + (this.cheerT > 0 ? 0.8 : 0);
    this.flap += dt * 7.5 * hurry;
    this.bob += dt * 2.1;
    this.huffT = Math.max(0, this.huffT - dt * 2.2);
    this.cheerT = Math.max(0, this.cheerT - dt);

    // Blink now and then; it does more for looking alive than anything else.
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0.13;
      this.nextBlink = 2.2 + Math.random() * 3.5;
    }


  }

  get hover() {
    return Math.sin(this.bob) * this.size * 0.05;
  }

  draw(ctx) {
    const s = this.size;
    if (s <= 0) return;

    // Below this the finer anatomy reads as noise rather than detail.
    const detail = s > 34;

    // Purple, with a warm cream belly and pink membranes. Gold for the eye: it is
    // purple's complement, so it stays legible against the scales at any size.
    const scales = 'hsl(276, 38%, 52%)';
    const scalesLight = 'hsl(282, 44%, 65%)';
    const scalesDark = 'hsl(268, 36%, 34%)';
    const belly = 'hsl(44, 62%, 86%)';
    const bellyEdge = 'hsl(38, 42%, 70%)';
    const horn = 'hsl(44, 30%, 91%)';
    const membrane = 'hsl(330, 52%, 66%)';
    const membraneDark = 'hsl(326, 42%, 48%)';
    const ink = 'hsl(276, 34%, 12%)';

    const flapA = Math.sin(this.flap);          // -1 up, +1 down
    const huff = this.huffT;
    const lunge = huff * s * 0.16;

    ctx.save();
    ctx.translate(this.x, this.y + this.hover);
    // Mirrored to face the balloon. Clamped away from exactly zero: a zero scale is
    // not invertible and the whole frame would be dropped mid-turn.
    ctx.scale(this.facing >= 0 ? Math.max(this.facing, 0.05) : Math.min(this.facing, -0.05), 1);

    // --- tail: behind everything, curling down and back ------------------
    // Drawn as a filled shape whose two edges converge, so it tapers. A stroked
    // line cannot taper, which made the first version look like a hose.
    const tailSway = Math.sin(this.flap * 0.5) * s * 0.1;
    const tailTipX = -s * 0.74 + tailSway * 1.6;
    const tailTipY = s * 1.34;
    ctx.fillStyle = scales;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.04);
    ctx.bezierCurveTo(-s * 0.86, s * 0.24, -s * 1.06 + tailSway, s * 0.84, tailTipX, tailTipY);
    ctx.bezierCurveTo(-s * 0.86 + tailSway, s * 0.82, -s * 0.66, s * 0.34, -s * 0.24, s * 0.24);
    ctx.closePath();
    ctx.fill();

    // Spade fin at the tip.
    ctx.fillStyle = membrane;
    ctx.beginPath();
    ctx.moveTo(tailTipX + s * 0.02, tailTipY - s * 0.04);
    ctx.quadraticCurveTo(tailTipX - s * 0.26, tailTipY + s * 0.04, tailTipX - s * 0.12, tailTipY + s * 0.26);
    ctx.quadraticCurveTo(tailTipX + s * 0.02, tailTipY + s * 0.1, tailTipX + s * 0.16, tailTipY + s * 0.2);
    ctx.quadraticCurveTo(tailTipX + s * 0.16, tailTipY + s * 0.02, tailTipX + s * 0.02, tailTipY - s * 0.04);
    ctx.closePath();
    ctx.fill();

    // Ridge scutes along the tail.
    if (detail) {
      ctx.fillStyle = scalesDark;
      for (const t of [0.32, 0.52, 0.72]) {
        const px = -s * 0.3 + (tailTipX + s * 0.3) * t - s * 0.1 * Math.sin(t * 3);
        const py = -s * 0.04 + (tailTipY + s * 0.04) * t * t;
        ctx.beginPath();
        ctx.ellipse(px, py, s * 0.05, s * 0.028, 0.9, 0, TAU);
        ctx.fill();
      }
    }

    this.drawWing(ctx, -1, flapA, { membrane: membraneDark, bone: scalesDark, detail, s, huff });
    this.drawLimbs(ctx, scalesDark, horn, s, true);

    // --- body ------------------------------------------------------------
    const chest = 1 + huff * 0.1; // it fills its lungs
    const bodyFill = ctx.createLinearGradient(-s * 0.4, -s * 0.5, s * 0.4, s * 0.5);
    bodyFill.addColorStop(0, scalesLight);
    bodyFill.addColorStop(0.55, scales);
    bodyFill.addColorStop(1, scalesDark);
    ctx.fillStyle = bodyFill;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.12, s * 0.52 * chest, s * 0.46 * chest, -0.22, 0, TAU);
    ctx.fill();

    // Belly plates, following the curve of the underside.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, s * 0.12, s * 0.52 * chest, s * 0.46 * chest, -0.22, 0, TAU);
    ctx.clip();
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(s * 0.18, s * 0.3, s * 0.36, s * 0.28, -0.3, 0, TAU);
    ctx.fill();
    if (detail) {
      ctx.strokeStyle = bellyEdge;
      ctx.lineWidth = Math.max(1, s * 0.022);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.1 + i * s * 0.13, s * 0.52);
        ctx.quadraticCurveTo(s * 0.06 + i * s * 0.13, s * 0.3, s * 0.02 + i * s * 0.13, s * 0.06);
        ctx.stroke();
      }
    }
    ctx.restore();

    this.drawLimbs(ctx, scales, horn, s, false);

    // --- neck and head ---------------------------------------------------
    // The neck is a tapering S rising to the right; the head tips back further as
    // it huffs, the way anything does before it blows.
    const tilt = -huff * 0.2;
    const neck = ctx.createLinearGradient(0, s * 0.1, s * 0.7, -s * 1.0);
    neck.addColorStop(0, scales);
    neck.addColorStop(1, scalesLight);
    ctx.strokeStyle = neck;
    ctx.lineWidth = s * 0.3;
    ctx.beginPath();
    ctx.moveTo(s * 0.1, -s * 0.16);
    ctx.quadraticCurveTo(s * 0.52, -s * 0.42, s * 0.46 + lunge * 0.5, -s * 0.82 - lunge);
    ctx.stroke();
    // Throat, lighter, and it swells with the breath.
    ctx.strokeStyle = belly;
    ctx.lineWidth = s * (0.12 + huff * 0.05);
    ctx.beginPath();
    ctx.moveTo(s * 0.2, -s * 0.16);
    ctx.quadraticCurveTo(s * 0.6, -s * 0.44, s * 0.55 + lunge * 0.5, -s * 0.8 - lunge);
    ctx.stroke();

    ctx.save();
    ctx.translate(s * 0.46 + lunge * 0.5, -s * 0.9 - lunge);
    ctx.rotate(tilt);

    // Dorsal ridge, from the back of the skull down the neck.
    if (detail) {
      ctx.fillStyle = membrane;
      for (const [dx, dy, h] of [[-0.3, 0.16, 0.2], [-0.16, 0.42, 0.24], [0.0, 0.66, 0.2]]) {
        ctx.beginPath();
        ctx.moveTo(-s * (0.16 - dx * 0.4), s * dy);
        ctx.lineTo(-s * (0.42 - dx * 0.3), s * (dy - h * 0.5));
        ctx.lineTo(-s * (0.1 - dx * 0.4), s * (dy - h));
        ctx.closePath();
        ctx.fill();
      }
    }

    // Skull, then a short rounded snout: the head is deliberately too big.
    const skull = ctx.createRadialGradient(-s * 0.08, -s * 0.14, s * 0.05, 0, 0, s * 0.44);
    skull.addColorStop(0, scalesLight);
    skull.addColorStop(1, scales);
    ctx.fillStyle = skull;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.3, s * 0.28, -0.15, 0, TAU);
    ctx.fill();

    // Muzzle: set well out along the snout line so it actually protrudes.
    ctx.beginPath();
    ctx.ellipse(s * 0.29, -s * 0.27, s * 0.23, s * 0.155, -0.72, 0, TAU);
    ctx.fill();

    // Brow ridge. Set high and back: level with the eye it simply covered it, and
    // the eye only appeared when the head tilted back to huff.
    ctx.fillStyle = scalesDark;
    ctx.beginPath();
    ctx.ellipse(s * 0.03, -s * 0.24, s * 0.115, s * 0.045, -0.4, 0, TAU);
    ctx.fill();

    // Horns: short, thick and tapered, sweeping up and back. Filled shapes rather
    // than strokes, or they read as a pair of white eyebrows.
    for (const [baseX, baseY, tipXo, tipYo, width] of [
      [-0.1, -0.2, -0.34, -0.26, 0.08],
      [-0.17, -0.04, -0.36, -0.1, 0.07],
    ]) {
      ctx.fillStyle = horn;
      ctx.beginPath();
      ctx.moveTo(s * baseX, s * (baseY - width));
      ctx.quadraticCurveTo(
        s * (baseX + tipXo * 0.5), s * (baseY + tipYo * 0.9),
        s * (baseX + tipXo), s * (baseY + tipYo),
      );
      ctx.quadraticCurveTo(
        s * (baseX + tipXo * 0.45), s * (baseY + tipYo * 0.45),
        s * baseX, s * (baseY + width),
      );
      ctx.closePath();
      ctx.fill();
    }

    if (detail) {
      // Ear frill, behind the jaw.
      ctx.fillStyle = membrane;
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, s * 0.0);
      ctx.quadraticCurveTo(-s * 0.42, s * 0.06, -s * 0.36, s * 0.22);
      ctx.quadraticCurveTo(-s * 0.22, s * 0.14, -s * 0.14, s * 0.13);
      ctx.closePath();
      ctx.fill();
    }

    // The mouth opens along the axis of the snout: a dark lens that widens with the
    // breath, with a lip below it. A properly hinged jaw was the first attempt and it
    // did not survive being drawn small — the pieces overlapped into a pale smudge,
    // where this stays legible at any size.
    const gape = Math.min(1, huff * this.huffPower);
    if (gape > 0.02) {
      const snoutAngle = -0.72;              // the muzzle points up and forward
      const cx = s * 0.36;
      const cy = -s * 0.28;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(snoutAngle);

      ctx.fillStyle = 'hsl(288, 44%, 21%)';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.15, s * (0.015 + gape * 0.1), 0, 0, TAU);
      ctx.fill();

      // A hint of warmth deep in the throat, kept small and well inside the mouth.
      if (gape > 0.5) {
        ctx.fillStyle = `hsla(34, 90%, 70%, ${0.22 * gape})`;
        ctx.beginPath();
        ctx.ellipse(-s * 0.05, 0, s * 0.045, s * gape * 0.035, 0, 0, TAU);
        ctx.fill();
      }

      // Lower lip, dropping with the gape.
      ctx.strokeStyle = belly;
      ctx.lineCap = 'round';
      ctx.lineWidth = s * 0.035;
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, s * gape * 0.09);
      ctx.quadraticCurveTo(0, s * (0.03 + gape * 0.13), s * 0.14, s * gape * 0.05);
      ctx.stroke();

      ctx.restore();
    }

    // Nostril, with a wisp of breath.
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(s * 0.44, -s * 0.42, s * 0.03, s * 0.023, -0.6, 0, TAU);
    ctx.fill();

    // Eye: amber iris, round pupil, catchlight. Big, and set forward.
    const open = this.blinkT > 0 ? 0.15 : 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(s * 0.12, -s * 0.07, s * 0.1, s * 0.095 * open, -0.15, 0, TAU);
    ctx.fill();
    if (open > 0.5) {
      ctx.fillStyle = 'hsl(38, 88%, 56%)';
      ctx.beginPath();
      ctx.arc(s * 0.135, -s * 0.07, s * 0.072, 0, TAU);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(s * 0.145, -s * 0.07, s * 0.04, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(s * 0.17, -s * 0.095, s * 0.021, 0, TAU);
      ctx.fill();
    } else {
      ctx.strokeStyle = scalesDark;
      ctx.lineWidth = s * 0.03;
      ctx.beginPath();
      ctx.moveTo(s * 0.03, -s * 0.07);
      ctx.lineTo(s * 0.22, -s * 0.07);
      ctx.stroke();
    }

    // Cheek scales.
    if (detail) {
      ctx.fillStyle = scalesDark;
      for (const [dx, dy] of [[-0.02, 0.12], [0.08, 0.16]]) {
        ctx.beginPath();
        ctx.ellipse(s * dx, s * dy, s * 0.035, s * 0.026, 0.2, 0, TAU);
        ctx.fill();
      }
    }

    ctx.restore();

    this.drawWing(ctx, 1, flapA, { membrane, bone: scales, detail, s, huff });
    ctx.restore();

    // Outside the mirror: the breath aims at the balloon in world coordinates.
    this.drawBreath(ctx);
  }

  // The breath itself: a cone of air widening from the mouth up to the balloon. The
  // particles alone were too faint to read as the cause of anything, and this is the
  // whole point of the dragon being there.
  drawBreath(ctx) {
    const power = Math.max(this.huffT, this.cheerT > 0 ? 0.35 : 0);
    if (power <= 0.02) return;

    const s = this.size;
    const { x: mx, y: my } = this.mouth;
    // Aim at the balloon, so the jet always connects the two.
    const dx = this.scene.balloonX - mx;
    const dy = (this.scene.balloonY + this.scene.radius * 0.6) - my;
    const length = Math.max(s * 0.6, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);

    const reach = length * (0.45 + power * 0.75);
    const mouthWidth = s * 0.12;
    const farWidth = s * (0.3 + power * 0.42);

    const fade = ctx.createLinearGradient(0, 0, reach, 0);
    fade.addColorStop(0, `rgba(255, 255, 255, ${0.82 * power})`);
    fade.addColorStop(0.45, `rgba(255, 255, 255, ${0.42 * power})`);
    fade.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = fade;

    // A cone with a slightly billowing edge rather than a hard triangle.
    ctx.beginPath();
    ctx.moveTo(0, -mouthWidth);
    ctx.quadraticCurveTo(reach * 0.5, -farWidth * 0.85, reach, -farWidth);
    ctx.quadraticCurveTo(reach * 1.06, 0, reach, farWidth);
    ctx.quadraticCurveTo(reach * 0.5, farWidth * 0.85, 0, mouthWidth);
    ctx.closePath();
    ctx.fill();

    // A small bright core just past the lips. Any bigger and it sat over the face
    // as a white blob, hiding the dragon doing the work.
    const core = ctx.createRadialGradient(s * 0.5, 0, 0, s * 0.5, 0, s * 0.26);
    core.addColorStop(0, `rgba(255, 255, 255, ${0.6 * power})`);
    core.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(s * 0.5, 0, s * 0.26, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  // A membrane wing on finger struts, hinged at the shoulder. The shape is fixed and
  // the whole wing rotates for the beat — reshaping it per frame was what made the
  // first version look like a rectangular banner rather than a wing.
  // `side` -1 is the far wing: behind the body, darker and slightly foreshortened.
  drawWing(ctx, side, flapA, { membrane, bone, detail, s, huff }) {
    // Wings sweep down hard on the breath, which is the "puff" half of huff and puff.
    // Swept well up so they frame the dragon instead of covering it: set on the
    // shoulders, the first version fanned straight across the torso and the head.
    const beat = flapA * 0.5 - huff * 0.45;
    const angle = (side > 0 ? -0.95 : -0.75) + beat;
    const L = s * 1.2;

    // Where the trailing edge scallops meet the finger struts.
    const joints = [
      [-L, -s * 0.26],
      [-L * 0.64, s * 0.0],
      [-L * 0.42, s * 0.22],
      [-L * 0.18, s * 0.34],
    ];

    ctx.save();
    ctx.translate(-s * 0.16, -s * 0.34);
    ctx.rotate(angle);
    ctx.scale(1, side > 0 ? 1 : 0.9);

    ctx.fillStyle = membrane;
    ctx.globalAlpha = side > 0 ? 0.94 : 0.7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-L * 0.45, -s * 0.56, joints[0][0], joints[0][1]);
    // Each scallop bows outwards between one strut and the next.
    ctx.quadraticCurveTo(-L * 0.78, s * 0.1, joints[1][0], joints[1][1]);
    ctx.quadraticCurveTo(-L * 0.54, s * 0.3, joints[2][0], joints[2][1]);
    ctx.quadraticCurveTo(-L * 0.3, s * 0.44, joints[3][0], joints[3][1]);
    ctx.quadraticCurveTo(-L * 0.08, s * 0.36, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Leading edge: the arm bone, thicker at the shoulder.
    ctx.strokeStyle = bone;
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-L * 0.45, -s * 0.56, joints[0][0], joints[0][1]);
    ctx.stroke();

    if (detail) {
      ctx.lineWidth = s * 0.03;
      for (const [jx, jy] of joints.slice(1)) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(jx, jy);
        ctx.stroke();
      }
      // Thumb claw at the wrist.
      ctx.lineWidth = s * 0.035;
      ctx.beginPath();
      ctx.moveTo(joints[0][0] + s * 0.06, joints[0][1] + s * 0.02);
      ctx.lineTo(joints[0][0] - s * 0.1, joints[0][1] - s * 0.06);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Two limbs a side: forelimbs tucked up under the chest, hind legs hanging, both
  // with three claws. `far` draws the shaded pair behind the body.
  drawLimbs(ctx, colour, claw, s, far) {
    const offset = far ? -s * 0.1 : 0;
    const kick = Math.sin(this.flap * 0.5) * s * 0.04;

    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';

    // Foreleg, tucked.
    ctx.lineWidth = s * 0.11;
    ctx.beginPath();
    ctx.moveTo(s * 0.24 + offset, s * 0.16);
    ctx.quadraticCurveTo(s * 0.42 + offset, s * 0.3, s * 0.34 + offset, s * 0.46 + kick);
    ctx.stroke();

    // Hind leg, heavier, hanging with a bent knee.
    ctx.lineWidth = s * 0.15;
    ctx.beginPath();
    ctx.moveTo(-s * 0.1 + offset, s * 0.34);
    ctx.quadraticCurveTo(-s * 0.02 + offset, s * 0.62, -s * 0.14 + offset, s * 0.82 + kick);
    ctx.stroke();

    ctx.strokeStyle = claw;
    ctx.lineWidth = s * 0.035;
    for (const [px, py] of [[s * 0.34 + offset, s * 0.48 + kick], [-s * 0.14 + offset, s * 0.84 + kick]]) {
      for (const spread of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + spread * s * 0.09, py + s * 0.09);
        ctx.stroke();
      }
    }
  }
}
