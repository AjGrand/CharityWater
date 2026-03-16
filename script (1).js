const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Responsive canvas ──────────────────────────────────────────────────────
const BASE_W = 800;
const BASE_H = 400;
canvas.width  = BASE_W;
canvas.height = BASE_H;

// ── UI elements ────────────────────────────────────────────────────────────
const scoreEl   = document.getElementById('score-display');
const livesEl   = document.getElementById('lives-display');
const levelEl   = document.getElementById('level-display');
const speedEl   = document.getElementById('speed-display');
const eventEl   = document.getElementById('event-display');
const overlay   = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg   = document.getElementById('overlay-message');
const overlayBtn   = document.getElementById('overlay-btn');
const btnLeft  = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnJump  = document.getElementById('btn-jump');

// ── Constants ──────────────────────────────────────────────────────────────
const GROUND_Y   = BASE_H - 60;
const GRAVITY    = 0.55;
const JUMP_VEL   = -13;
const PLAYER_W   = 36;
const PLAYER_H   = 44;
const PLAYER_X   = 100;
const MOVE_ACCEL = 0.8;
const MOVE_FRICTION = 0.72;
const MOVE_MAX_SPEED = 4.2;
const DINO_BASE_SPEED = 3.8;
const DINO_SPEED_STEP = 0.04;
const DINO_MAX_MULTIPLIER = 1.8;

// ── State ──────────────────────────────────────────────────────────────────
let score, lives, level, speed, spawnTimer, levelTimer;
let player, obstacles, drops, particles;
let keys, running, raf;
let bgStars = [];

// ── Helpers ────────────────────────────────────────────────────────────────
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

function heartString(n) {
  return '❤️'.repeat(Math.max(n, 0));
}

function currentRunSpeed() {
  return DINO_BASE_SPEED * speed;
}

// ── Stars ──────────────────────────────────────────────────────────────────
function initStars() {
  bgStars = [];
  for (let i = 0; i < 80; i++) {
    bgStars.push({
      x: rand(0, BASE_W),
      y: rand(0, GROUND_Y - 20),
      r: rand(0.5, 2),
      a: rand(0.2, 0.9),
    });
  }
}

// ── Init / Reset ───────────────────────────────────────────────────────────
function initGame() {
  score      = 0;
  lives      = 3;
  level      = 1;
  speed      = 1;
  spawnTimer = 0;
  levelTimer = 0;

  player = {
    x: PLAYER_X,
    y: GROUND_Y - PLAYER_H,
    vx: 0,
    vy: 0,
    onGround: true,
    invincible: 0,
    facing: 1,
  };

  obstacles = [];
  drops     = [];
  particles = [];
  keys      = {};

  initStars();
  updateUI();
  setEventText('Ready');
}

function updateUI() {
  scoreEl.textContent = `💧 Drops: ${score}`;
  livesEl.textContent = `Lives: ${heartString(lives)}`;
  levelEl.textContent = `Mission: ${level}`;
  speedEl.textContent = `Speed: ${speed.toFixed(1)}x`;
}

function setEventText(message) {
  if (eventEl) eventEl.textContent = `Status: ${message}`;
}

function setControlKey(key, isDown) {
  keys[key] = isDown;
}

function bindHoldButton(el, key) {
  if (!el) return;

  const press = e => {
    e.preventDefault();
    setControlKey(key, true);
    el.classList.add('active');
  };

  const release = e => {
    e.preventDefault();
    setControlKey(key, false);
    el.classList.remove('active');
  };

  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);

  // Fallback for browsers with incomplete pointer events
  el.addEventListener('touchstart', press, { passive: false });
  el.addEventListener('touchend', release, { passive: false });
  el.addEventListener('touchcancel', release, { passive: false });
}

// ── Particles ──────────────────────────────────────────────────────────────
function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const spd   = rand(1.5, 5);
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 1,
      decay: rand(0.03, 0.07),
      r: rand(2, 5),
      color,
    });
  }
}

// ── Spawning ───────────────────────────────────────────────────────────────
function spawnObjects() {
  // always spawn at least 1 drop per wave, sometimes extras
  const dropCount = randInt(3, 5);
  const obsCount  = randInt(0, 2);

  // spread them so they don't all stack
  let startX = BASE_W + 80;

  for (let i = 0; i < obsCount; i++) {
    const h = randInt(28, 54);
    const w = randInt(28, 48);
    obstacles.push({
      x: startX + rand(0, 40),
      y: GROUND_Y - h,
      w, h,
    });
    startX += rand(460, 700);
  }

  // Drops appear at varied heights
  for (let i = 0; i < dropCount; i++) {
    drops.push({
      x: startX + rand(30, 120),
      y: rand(GROUND_Y - 180, GROUND_Y - 30),
      r: 14,
      wobble: 0,
      collected: false,
    });
    startX += rand(80, 160);
  }
}

// ── Collision ──────────────────────────────────────────────────────────────
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(cx, rx + rw));
  const nearY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < cr * cr;
}

// ── Update ─────────────────────────────────────────────────────────────────
function update() {
  if (!running) return;

  levelTimer++;
  // Dino-like speed ramp: small bumps every ~7 seconds at 60fps
  if (levelTimer >= 520) {
    levelTimer = 0;
    level++;
    speed = Math.min(DINO_MAX_MULTIPLIER, 1 + (level - 1) * DINO_SPEED_STEP);
    updateUI();
  }

  // ── Player movement ────────────────────────────────────────────────────
  const leftHeld = keys['ArrowLeft'] || keys['a'] || keys['A'];
  const rightHeld = keys['ArrowRight'] || keys['d'] || keys['D'];

  if (leftHeld && !rightHeld) {
    player.vx -= MOVE_ACCEL;
    player.facing = -1;
  } else if (rightHeld && !leftHeld) {
    player.vx += MOVE_ACCEL;
    player.facing = 1;
  } else {
    player.vx *= MOVE_FRICTION;
    if (Math.abs(player.vx) < 0.05) player.vx = 0;
  }

  player.vx = Math.max(-MOVE_MAX_SPEED, Math.min(MOVE_MAX_SPEED, player.vx));
  player.x += player.vx;

  // Clamp to canvas and stop sliding at walls
  if (player.x < 0) {
    player.x = 0;
    player.vx = 0;
  } else if (player.x > BASE_W - PLAYER_W) {
    player.x = BASE_W - PLAYER_W;
    player.vx = 0;
  }

  // Jump
  if ((keys['ArrowUp'] || keys[' '] || keys['w'] || keys['W']) && player.onGround) {
    player.vy = JUMP_VEL;
    player.onGround = false;
  }

  // Gravity
  player.vy += GRAVITY;
  player.y  += player.vy;

  if (player.y >= GROUND_Y - PLAYER_H) {
    player.y  = GROUND_Y - PLAYER_H;
    player.vy = 0;
    player.onGround = true;
  }

  if (player.invincible > 0) player.invincible--;

  // ── Spawn timer ────────────────────────────────────────────────────────
  spawnTimer++;
  const spawnInterval = Math.max(75, 130 - (level - 1) * 3);
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObjects();
  }

  // ── Move obstacles ─────────────────────────────────────────────────────
  const runSpeed = currentRunSpeed();
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x -= runSpeed;
    if (o.x + o.w < 0) { obstacles.splice(i, 1); continue; }

    // Collision with player
    if (player.invincible === 0 &&
        rectsOverlap(player.x, player.y, PLAYER_W, PLAYER_H, o.x, o.y, o.w, o.h)) {
      lives--;
      player.invincible = 90; // 1.5 s grace period
      spawnParticles(player.x + PLAYER_W / 2, player.y + PLAYER_H / 2, '#ff6b35', 12);
      setEventText('Ouch! Hit an obstacle');
      updateUI();
      if (lives <= 0) { gameOver(); return; }
    }
  }

  // ── Move drops ─────────────────────────────────────────────────────────
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.x -= runSpeed;
    d.wobble += 0.12;
    if (d.x + d.r < 0) { drops.splice(i, 1); continue; }

    // Collect
    if (!d.collected &&
        circleRectOverlap(d.x, d.y, d.r, player.x, player.y, PLAYER_W, PLAYER_H)) {
      d.collected = true;
      score++;
      // +1 life every 5 drops (max 9)
      if (score % 5 === 0 && lives < 9) {
        lives++;
        spawnParticles(d.x, d.y, '#ff6b35', 14);
        setEventText('Bonus life earned!');
      } else {
        setEventText('Collected a water drop!');
      }
      spawnParticles(d.x, d.y, '#FFC907', 10);
      drops.splice(i, 1);
      updateUI();
    }
  }

  // ── Particles ──────────────────────────────────────────────────────────
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x   += p.vx;
    p.y   += p.vy;
    p.vy  += 0.15;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ── Drawing helpers ────────────────────────────────────────────────────────
function drawBackground() {
  // Desert sky — warm dusk gradient
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  grad.addColorStop(0,   '#1a0e00');
  grad.addColorStop(0.5, '#3d1f05');
  grad.addColorStop(1,   '#6b3510');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  // Stars (sparse desert night)
  bgStars.forEach(s => {
    ctx.globalAlpha = s.a * 0.7;
    ctx.fillStyle = '#ffe8a0';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Distant horizon haze
  const haze = ctx.createLinearGradient(0, GROUND_Y - 40, 0, GROUND_Y);
  haze.addColorStop(0, 'rgba(255,150,40,0)');
  haze.addColorStop(1, 'rgba(255,150,40,0.18)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, GROUND_Y - 40, BASE_W, 40);

  // Sandy / cracked earth ground
  const gGrad = ctx.createLinearGradient(0, GROUND_Y, 0, BASE_H);
  gGrad.addColorStop(0, '#a07040');
  gGrad.addColorStop(0.3, '#7a5228');
  gGrad.addColorStop(1, '#3d2510');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, GROUND_Y, BASE_W, BASE_H - GROUND_Y);

  // Crack lines in the earth
  ctx.strokeStyle = 'rgba(60,30,10,0.5)';
  ctx.lineWidth = 1;
  for (let cx = 60; cx < BASE_W; cx += 90) {
    ctx.beginPath();
    ctx.moveTo(cx, GROUND_Y + 4);
    ctx.lineTo(cx + 14, GROUND_Y + 14);
    ctx.lineTo(cx + 8, GROUND_Y + 22);
    ctx.stroke();
  }

  // Ground edge — charity: water golden glow
  ctx.strokeStyle = 'rgba(255,201,7,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(BASE_W, GROUND_Y);
  ctx.stroke();
}

function drawPlayer() {
  const px = player.x;
  const py = player.y;
  const pw = PLAYER_W;
  const ph = PLAYER_H;

  // Invincibility flash
  if (player.invincible > 0 && Math.floor(player.invincible / 6) % 2 === 0) return;

  ctx.save();
  // Flip horizontally when moving left
  if (player.facing === -1) {
    ctx.translate(px + pw, py);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(px, py);
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(pw / 2, ph + 4, pw / 2, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body — charity: water yellow shirt
  const bodyGrad = ctx.createLinearGradient(0, 0, pw, ph);
  bodyGrad.addColorStop(0, '#FFD700');
  bodyGrad.addColorStop(1, '#c98f00');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(4, ph * 0.35, pw - 8, ph * 0.65, 6);
  ctx.fill();

  // charity: water logo mark on shirt (small circle + drop)
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(pw * 0.5, ph * 0.52, 5, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#f9d49a';
  ctx.beginPath();
  ctx.arc(pw / 2, ph * 0.22, pw * 0.36, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(pw * 0.62, ph * 0.18, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#8b5e2a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pw * 0.55, ph * 0.26, 5, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // Belt — dark brown
  ctx.fillStyle = '#4a2c0a';
  ctx.fillRect(4, ph * 0.57, pw - 8, 5);

  // Legs — khaki
  const legAnim = player.onGround ? Math.sin(Date.now() * 0.015) * 6 : 0;
  ctx.fillStyle = '#8b6830';
  ctx.beginPath();
  ctx.roundRect(5,  ph * 0.88, pw * 0.38, ph * 0.18, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(pw * 0.55, ph * 0.88 + legAnim, pw * 0.38, ph * 0.18, 4);
  ctx.fill();

  ctx.restore();
}

function drawObstacles() {
  obstacles.forEach(o => {
    // Sandy desert rock
    const rGrad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
    rGrad.addColorStop(0, '#c49a60');
    rGrad.addColorStop(0.5, '#9a6e38');
    rGrad.addColorStop(1, '#5c3a18');
    ctx.fillStyle = rGrad;
    ctx.beginPath();
    ctx.roundRect(o.x, o.y, o.w, o.h, [10, 10, 4, 4]);
    ctx.fill();

    // Sun-baked highlight
    ctx.fillStyle = 'rgba(255,220,140,0.18)';
    ctx.beginPath();
    ctx.ellipse(o.x + o.w * 0.35, o.y + o.h * 0.25, o.w * 0.22, o.h * 0.12, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Dusty orange danger outline
    ctx.strokeStyle = 'rgba(255,120,30,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(o.x, o.y, o.w, o.h, [10, 10, 4, 4]);
    ctx.stroke();
  });
}

function drawDrops() {
  const now = Date.now();
  drops.forEach(d => {
    const bobY = d.y + Math.sin(d.wobble) * 4;

    ctx.save();
    ctx.translate(d.x, bobY);

    // Outer glow — charity: water clean blue
    const glow = ctx.createRadialGradient(0, 0, d.r * 0.1, 0, 0, d.r * 2.5);
    glow.addColorStop(0, 'rgba(75,175,214,0.5)');
    glow.addColorStop(0.5, 'rgba(75,175,214,0.2)');
    glow.addColorStop(1, 'rgba(75,175,214,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, d.r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Drop shape — teardrop
    ctx.beginPath();
    ctx.moveTo(0, -d.r * 1.5);
    ctx.bezierCurveTo(
      d.r * 1.1, -d.r * 0.2,
      d.r * 1.1,  d.r * 0.8,
      0,          d.r
    );
    ctx.bezierCurveTo(
      -d.r * 1.1,  d.r * 0.8,
      -d.r * 1.1, -d.r * 0.2,
      0,          -d.r * 1.5
    );
    ctx.closePath();

    // charity: water clean water blue
    const fill = ctx.createLinearGradient(-d.r, -d.r * 1.5, d.r, d.r);
    fill.addColorStop(0, '#c8eeff');
    fill.addColorStop(0.35, '#4BAFD6');
    fill.addColorStop(1, '#1a6fa0');
    ctx.fillStyle = fill;
    ctx.fill();

    // Bright shine
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.ellipse(-d.r * 0.3, -d.r * 0.7, d.r * 0.2, d.r * 0.32, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawHUD() {
  // Score badge when just collected (pulse glow)
  if (drops.length === 0 && score > 0) {
    // subtle bottom hint
  }
}

// ── Game loop ──────────────────────────────────────────────────────────────
function loop() {
  update();
  drawBackground();
  drawDrops();
  drawObstacles();
  drawPlayer();
  drawParticles();
  drawHUD();
  if (running) raf = requestAnimationFrame(loop);
}

// ── Game over / start ──────────────────────────────────────────────────────
function gameOver() {
  running = false;
  cancelAnimationFrame(raf);
  // Final frame
  drawBackground();
  drawDrops();
  drawObstacles();
  drawPlayer();
  drawParticles();

  overlayTitle.textContent = 'Mission Complete';
  overlayMsg.textContent   = `You delivered ${score} drop${score !== 1 ? 's' : ''} of clean water — reaching ${score * 5} people on mission ${level}.`;
  overlayBtn.textContent   = 'Try Again';
  overlay.classList.remove('hidden');
}

function startGame() {
  overlay.classList.add('hidden');
  initGame();
  setEventText('Mission started');
  running = true;
  raf = requestAnimationFrame(loop);
}

// ── Controls ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  setControlKey(e.key, true);
  // Prevent page scroll on space/arrows
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }
});
document.addEventListener('keyup',  e => { setControlKey(e.key, false); });

bindHoldButton(btnLeft, 'ArrowLeft');
bindHoldButton(btnRight, 'ArrowRight');
bindHoldButton(btnJump, 'ArrowUp');

window.addEventListener('blur', () => {
  keys = {};
  [btnLeft, btnRight, btnJump].forEach(btn => btn?.classList.remove('active'));
});

overlay.addEventListener('click', e => {
  if (e.target === overlayBtn) startGame();
});

// ── Boot ───────────────────────────────────────────────────────────────────
initStars();
// Draw a static preview behind the overlay
(function drawPreview() {
  drawBackground();
})();
overlay.classList.remove('hidden');
