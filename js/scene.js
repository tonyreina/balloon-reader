// The sky: balloon physics plus everything drawn behind it.
// Physics runs in CSS pixels; the canvas is scaled for device pixel ratio.

const TAU = Math.PI * 2;

// Air drag, as a velocity multiplier per second. Everything else is derived
// from it so the numbers below can be expressed in sky-heights, which keeps
// the game feeling identical on a phone and on a wide monitor.
const DRAG = 0.32;
const DRAG_K = Math.log(1 / DRAG);

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;

    this.sink = 0.045;  // sky-heights lost per second when nobody reads
    this.lift = 0.115;  // sky-heights gained per correct word

    this.balloonX = 0;
    this.balloonY = 0;
    this.velocity = 0;
    this.squish = 0;      // 0..1, brief stretch when puffed
    this.sway = 0;

    this.puffs = [];
    this.sparkles = [];
    this.clouds = [];
    this.hills = [];
    this.grounded = false;
    this.escaping = false;
    this.topInset = 58; // HUD height: the balloon must stay clear of it

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.width = Math.max(rect.width, 1);
    this.height = Math.max(rect.height, 1);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (!this.clouds.length) this.seedBackground();
    this.balloonX = this.width * 0.5;
    if (!this.balloonY) this.balloonY = this.ceilingY + this.span * 0.22;
  }

  seedBackground() {
    // Deterministic-ish scatter so the sky looks hand-placed, not noisy.
    this.clouds = [
      { x: 0.15, y: 0.18, scale: 1.0, speed: 6 },
      { x: 0.62, y: 0.10, scale: 0.7, speed: 9 },
      { x: 0.85, y: 0.34, scale: 1.2, speed: 4 },
      { x: 0.38, y: 0.46, scale: 0.85, speed: 7 },
      { x: 0.05, y: 0.58, scale: 0.6, speed: 11 },
    ].map((c) => ({ ...c, x: c.x * 1.0 }));
  }

  get radius() {
    return Math.max(30, Math.min(this.width, this.height) * 0.085);
  }

  get floorY() {
    return this.height - this.radius * 0.55;
  }

  get span() {
    return Math.max(this.floorY - this.ceilingY, 1);
  }

  get ceilingY() {
    return Math.max(this.radius * 1.15, this.topInset + this.radius);
  }

  reset() {
    // Starts near the top, with enough headroom that early puffs visibly lift it.
    this.balloonY = this.ceilingY + this.span * 0.22;
    this.velocity = 0;
    this.grounded = false;
    this.escaping = false;
    this.puffs.length = 0;
    this.sparkles.length = 0;
  }

  // A correct word: a puff of air lifts the balloon.
  puff(power = 1) {
    // With this drag, an impulse of v0 carries the balloon v0 / DRAG_K pixels,
    // so one word lifts it by `lift` of the sky regardless of screen size.
    const impulse = this.lift * this.span * DRAG_K;
    this.velocity = Math.min(this.velocity, this.span * 0.03) - impulse * power;
    this.velocity = Math.max(this.velocity, -impulse * 1.7);
    this.squish = 1;
    this.sway = (Math.random() - 0.5) * 0.5;

    const count = 8 + Math.round(power * 6);
    for (let i = 0; i < count; i++) {
      this.puffs.push({
        x: this.balloonX + (Math.random() - 0.5) * this.radius * 1.1,
        y: this.balloonY + this.radius * 1.5,
        vx: (Math.random() - 0.5) * 55,
        vy: 70 + Math.random() * 90,
        life: 1,
        size: 5 + Math.random() * 11,
      });
    }
  }

  celebrate() {
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * TAU;
      this.sparkles.push({
        x: this.balloonX,
        y: this.balloonY,
        vx: Math.cos(angle) * (60 + Math.random() * 110),
        vy: Math.sin(angle) * (60 + Math.random() * 110),
        life: 1,
        hue: Math.round(Math.random() * 360),
      });
    }
  }

  // Balloon leaves the top of the screen after a finished sentence.
  escape() {
    this.escaping = true;
    this.celebrate();
  }

  update(dt) {
    if (this.escaping) {
      this.velocity -= this.span * 1.6 * dt;
      this.balloonY += this.velocity * dt;
    } else if (!this.grounded) {
      this.velocity += this.sink * this.span * DRAG_K * dt;
      this.velocity *= Math.pow(DRAG, dt); // drag → a gentle terminal fall
      this.balloonY += this.velocity * dt;

      const ceiling = this.ceilingY;
      if (this.balloonY < ceiling) {
        this.balloonY = ceiling;
        this.velocity = Math.max(this.velocity, -8);
      }
      if (this.balloonY > this.floorY) {
        this.balloonY = this.floorY;
        this.velocity = 0;
        this.grounded = true;
      }
    }

    this.squish = Math.max(0, this.squish - dt * 3.2);
    this.sway *= Math.pow(0.25, dt);
    this.time = (this.time || 0) + dt;

    for (const cloud of this.clouds) {
      cloud.x -= (cloud.speed * dt) / Math.max(this.width, 1);
      if (cloud.x < -0.25) cloud.x = 1.25;
    }

    this.puffs = this.puffs.filter((p) => {
      p.life -= dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy *= Math.pow(0.5, dt);
      return p.life > 0;
    });

    this.sparkles = this.sparkles.filter((s) => {
      s.life -= dt * 1.1;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 140 * dt;
      return s.life > 0;
    });
  }

  // Fraction of the sky the balloon has left before it lands (1 = top).
  get altitude() {
    const span = this.floorY - this.ceilingY;
    return span <= 0 ? 0 : 1 - (this.balloonY - this.ceilingY) / span;
  }

  render() {
    const { ctx, width: w, height: h } = this;
    ctx.clearRect(0, 0, w, h);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#4aa3e8');
    sky.addColorStop(0.55, '#9ad4f5');
    sky.addColorStop(1, '#dff3fb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    this.drawSun(w * 0.86, h * 0.12, Math.min(w, h) * 0.075);
    for (const cloud of this.clouds) {
      this.drawCloud(cloud.x * w, cloud.y * h, cloud.scale * Math.min(w, h) * 0.075);
    }
    this.drawGround();

    for (const p of this.puffs) {
      ctx.globalAlpha = Math.max(0, p.life) * 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.4 - p.life * 0.4), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.drawBalloon();

    for (const s of this.sparkles) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = `hsl(${s.hue} 95% 62%)`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5 * s.life + 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawSun(x, y, r) {
    const { ctx } = this;
    const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.6);
    glow.addColorStop(0, 'rgba(255, 244, 180, 0.95)');
    glow.addColorStop(1, 'rgba(255, 244, 180, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  drawCloud(x, y, r) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const blobs = [[0, 0, 1], [-r * 0.9, r * 0.25, 0.72], [r * 0.95, r * 0.3, 0.66], [r * 0.3, -r * 0.5, 0.6]];
    for (const [dx, dy, scale] of blobs) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r * scale, 0, TAU);
      ctx.fill();
    }
  }

  drawGround() {
    const { ctx, width: w, height: h } = this;
    const grassTop = h - Math.max(28, h * 0.06);

    ctx.fillStyle = '#8fd06a';
    ctx.beginPath();
    ctx.moveTo(0, grassTop + 12);
    ctx.bezierCurveTo(w * 0.25, grassTop - 14, w * 0.6, grassTop + 18, w, grassTop - 4);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#6cb84f';
    ctx.beginPath();
    ctx.moveTo(0, grassTop + 26);
    ctx.bezierCurveTo(w * 0.35, grassTop + 6, w * 0.7, grassTop + 34, w, grassTop + 16);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }

  drawBalloon() {
    const { ctx } = this;
    const r = this.radius;
    const x = this.balloonX + Math.sin((this.time || 0) * 1.7) * r * 0.12 + this.sway * r;
    const y = this.balloonY;

    // Stretch tall on a puff, then settle back to round.
    const stretch = 1 + this.squish * 0.16;
    const widen = 1 - this.squish * 0.12;

    ctx.save();
    ctx.translate(x, y);

    // String
    ctx.strokeStyle = 'rgba(60, 50, 45, 0.55)';
    ctx.lineWidth = Math.max(1.4, r * 0.045);
    ctx.beginPath();
    ctx.moveTo(0, r * stretch * 1.02);
    ctx.quadraticCurveTo(r * 0.28, r * stretch * 1.5, this.sway * r * 0.6, r * stretch * 1.9);
    ctx.stroke();

    // Body
    const body = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.15, 0, 0, r * 1.25);
    body.addColorStop(0, '#ff8f8a');
    body.addColorStop(0.45, '#ef3f45');
    body.addColorStop(1, '#b3181f');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * widen, r * stretch, 0, 0, TAU);
    ctx.fill();

    // Knot
    ctx.fillStyle = '#c22128';
    ctx.beginPath();
    ctx.moveTo(-r * 0.16, r * stretch * 0.97);
    ctx.lineTo(r * 0.16, r * stretch * 0.97);
    ctx.lineTo(0, r * stretch * 1.16);
    ctx.closePath();
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.42, r * 0.2, r * 0.32, -0.5, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}
