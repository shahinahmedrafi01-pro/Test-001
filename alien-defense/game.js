"use strict";
/* ============================================================
   ALIEN DEFENSE — 2D arcade space shooter
   Part of Rafi's Mini Arcade. Vanilla JS + Canvas + Web Audio.
   ============================================================ */

// ---------- DOM ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const el = (id) => document.getElementById(id);
const hudEl = el("hud"), scoreEl = el("hud-score"), bestEl = el("hud-best"),
  waveEl = el("hud-wave"), livesEl = el("hud-lives"),
  bossBarEl = el("boss-bar"), bossFillEl = el("boss-fill"),
  powerBarEl = el("power-bar"), bannerEl = el("banner");

// ---------- utils ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

// ---------- viewport ----------
let W = 0, H = 0, DPR = 1, SZ = 1, SPD = 1, defenseY = 0;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.parentElement.getBoundingClientRect();
  W = Math.max(280, r.width); H = Math.max(420, r.height);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  SZ = clamp(Math.min(W, H) / 430, 0.72, 1.35);   // sprite scale
  SPD = clamp(H / 720, 0.7, 1.4);                  // speed scale
  defenseY = H - 170 * SZ;
  if (player) { player.x = clamp(player.x, 24, W - 24); player.y = H - 90 * SZ; }
}
window.addEventListener("resize", resize);

// ---------- audio (Web Audio API, generated sounds) ----------
const Sound = {
  enabled: false,
  ctx: null, noiseBuf: null,
  init() {
    try {
      if (!this.enabled) this.enabled = localStorage.getItem("alienDefenseSound") === "1";
    } catch (e) {}
    this.updateBtn();
  },
  ensure() {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        const len = this.ctx.sampleRate * 0.4, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        this.noiseBuf = buf;
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    } catch (e) { return null; }
  },
  tone(f, dur, type, vol, slideTo, delay) {
    const ac = this.ensure(); if (!ac) return;
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(f, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(dur, vol) {
    const ac = this.ensure(); if (!ac || !this.noiseBuf) return;
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = this.noiseBuf;
    g.gain.setValueAtTime(vol || 0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    s.connect(g); g.connect(ac.destination); s.start();
  },
  shoot()   { this.tone(720, 0.09, "square", 0.05, 240); },
  explode() { this.noise(0.25, 0.16); this.tone(320, 0.22, "sawtooth", 0.07, 55); },
  hit()     { this.tone(160, 0.3, "sawtooth", 0.14, 50); this.noise(0.2, 0.12); },
  power()   { this.tone(520, 0.1, "sine", 0.1); this.tone(660, 0.1, "sine", 0.1, 0, 0.09); this.tone(880, 0.14, "sine", 0.1, 0, 0.18); },
  wave()    { this.tone(440, 0.12, "triangle", 0.1); this.tone(587, 0.16, "triangle", 0.1, 0, 0.12); },
  bossWarn(){ for (let i = 0; i < 3; i++) this.tone(110, 0.22, "sawtooth", 0.12, 90, i * 0.3); },
  bossDown(){ this.noise(0.7, 0.2); this.tone(400, 0.6, "sawtooth", 0.1, 40); },
  over()    { this.tone(330, 0.25, "triangle", 0.12, 220); this.tone(220, 0.3, "triangle", 0.12, 140, 0.25); this.tone(140, 0.5, "triangle", 0.12, 70, 0.55); },
  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem("alienDefenseSound", this.enabled ? "1" : "0"); } catch (e) {}
    if (this.enabled) { this.ensure(); this.power(); }
    this.updateBtn();
  },
  updateBtn() {
    const b = el("btn-sound");
    if (b) b.textContent = "SOUND: " + (this.enabled ? "ON" : "OFF");
  }
};

// ---------- game state ----------
let state = "menu";           // menu | playing | paused | transition | gameover
let score = 0, best = 0, wave = 0, lives = 3, killStreak = 0;
let player = null;
let bullets = [], enemies = [], ebullets = [], powerups = [], particles = [], floats = [], stars = [], planets = [];
let spawnQueue = [], spawnT = 0, spawnInterval = 1;
let bannerT = 0, bossDefT = 0, shake = 0, flash = 0, time = 0;
let boss = null;
let firing = false;
const keys = {};
const MAX_LIVES = 5;

const ETYPES = {
  basic:   { hp: 1, speed: 95,  score: 10, r: 16, fire: 0 },
  fast:    { hp: 1, speed: 175, score: 20, r: 12, fire: 0 },
  armored: { hp: 3, speed: 62,  score: 30, r: 20, fire: 0.5 },
  elite:   { hp: 2, speed: 115, score: 50, r: 16, fire: 1.1 },
};
const PCOLORS = { rapid: "#22d3ee", double: "#a78bfa", shield: "#34d399", repair: "#fb7185" };
const PNAMES = { rapid: "RAPID", double: "DOUBLE", shield: "SHIELD", repair: "+1 LIFE" };

try { best = parseInt(localStorage.getItem("alienDefenseBest") || "0", 10) || 0; } catch (e) {}

function initField() {
  stars = [];
  const n = Math.floor(clamp(W * H / 9000, 60, 160));
  for (let i = 0; i < n; i++)
    stars.push({ x: rand(0, W), y: rand(0, H), s: rand(0.6, 2.2), v: rand(8, 42), tw: rand(0, TAU) });
  planets = [];
  for (let i = 0; i < 2; i++)
    planets.push({ x: rand(0.1, 0.9) * W, y: rand(0.05, 0.5) * H, r: rand(22, 46) * SZ,
      c1: ["#3b2d6e", "#0b3b5a", "#5a2d3b"][i % 3], v: rand(4, 10) });
}

// ---------- input ----------
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if ([" ", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k === " " ? " " : k)) e.preventDefault();
  if (e.repeat) return;
  keys[k] = true;
  if (k === " ") { Sound.ensure(); firing = true; }
  if ((k === "p" || k === "escape")) {
    if (state === "playing") pauseGame();
    else if (state === "paused") resumeGame();
  }
  if (k === "enter" && state === "menu") startGame();
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  if (k === " ") firing = false;
});
window.addEventListener("blur", () => { if (state === "playing") pauseGame(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && state === "playing") pauseGame(); });

function bindHold(id, on, off) {
  const b = el(id);
  const start = (e) => { e.preventDefault(); Sound.ensure(); on(); };
  const end = (e) => { e.preventDefault(); off(); };
  b.addEventListener("pointerdown", start);
  b.addEventListener("pointerup", end);
  b.addEventListener("pointercancel", end);
  b.addEventListener("pointerleave", end);
  b.addEventListener("contextmenu", (e) => e.preventDefault());
}
if ("ontouchstart" in window || navigator.maxTouchPoints > 0) document.body.classList.add("touch");

// ---------- game flow ----------
function resetGame() {
  score = 0; wave = 0; lives = 3; killStreak = 0;
  bullets = []; enemies = []; ebullets = []; powerups = []; particles = []; floats = [];
  spawnQueue = []; boss = null; bossDefT = 0; shake = 0; flash = 0; firing = false;
  player = { x: W / 2, y: H - 90 * SZ, speed: 380, fireT: 0,
    invuln: 0, shieldT: 0, rapidT: 0, doubleT: 0, tilt: 0 };
  initField();
  updateHUD(true);
  bossBarEl.classList.add("hidden");
}

function startGame() {
  Sound.ensure();
  resetGame();
  hideOverlays();
  hudEl.classList.remove("hidden");
  state = "playing";
  startWave(1);
}

function startWave(n) {
  wave = n;
  waveEl.textContent = "WAVE " + n;
  if (n % 5 === 0) {
    spawnBoss(n);
    showBanner("BOSS INCOMING", "danger");
    Sound.bossWarn();
  } else {
    buildWave(n);
    showBanner("WAVE " + n, "");
    Sound.wave();
  }
}

function buildWave(n) {
  const q = [];
  const add = (t, c) => { for (let i = 0; i < c; i++) q.push(t); };
  add("basic", 5 + Math.min(14, n * 2));
  if (n >= 2) add("fast", Math.min(10, n));
  if (n >= 3) add("armored", Math.min(8, Math.floor(n / 2)));
  if (n >= 4) add("elite", Math.min(6, Math.floor((n - 1) / 2)));
  // shuffle
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  spawnQueue = q;
  spawnInterval = Math.max(0.32, 1.05 - n * 0.06);
  spawnT = 0.6;
}

function spawnEnemy(type) {
  const c = ETYPES[type];
  const wob = 1 + (wave - 1) * 0.05;
  enemies.push({
    type, x: rand(30 * SZ, W - 30 * SZ), y: -30,
    hp: c.hp + (type === "armored" && wave >= 8 ? 1 : 0),
    maxHp: c.hp + (type === "armored" && wave >= 8 ? 1 : 0),
    speed: c.speed * wob * SPD, score: c.score, r: c.r * SZ,
    t: rand(0, TAU), seed: rand(0, TAU),
    fireT: rand(0.8, 2.2) / Math.max(0.4, c.fire),
    fireRate: c.fire * Math.min(1.8, wob),
    dead: false,
  });
}

function spawnBoss(n) {
  const hp = Math.round((26 + n * 5) * clamp(SPD, 0.8, 1.2));
  boss = { x: W / 2, y: -90, ty: 120 * SZ + 40, w: 120 * SZ, h: 74 * SZ,
    hp, maxHp: hp, t: 0, atkT: 2.0, atkT2: 4.5, sumT: 7, dir: 1, dead: false };
  bossBarEl.classList.remove("hidden");
  updateBossBar();
}

function showBanner(txt, cls) {
  bannerEl.textContent = txt;
  bannerEl.className = cls || "";
  bannerT = 2.2;
}

function pauseGame() {
  if (state !== "playing") return;
  state = "paused";
  firing = false;
  el("pause-menu").classList.remove("hidden");
}
function resumeGame() {
  if (state !== "paused") return;
  el("pause-menu").classList.add("hidden");
  state = "playing";
}
function gameOver() {
  state = "gameover";
  firing = false;
  Sound.over();
  explodeAt(player.x, player.y, "#22d3ee", 30);
  const isBest = score > best;
  if (isBest) {
    best = score;
    try { localStorage.setItem("alienDefenseBest", String(best)); } catch (e) {}
  }
  el("final-score").textContent = score.toLocaleString("en-US");
  el("final-best").textContent = best.toLocaleString("en-US");
  el("final-waves").textContent = wave;
  el("new-best").classList.toggle("hidden", !isBest);
  hudEl.classList.add("hidden");
  bossBarEl.classList.add("hidden");
  el("gameover").classList.remove("hidden");
}
function hideOverlays() {
  ["menu", "howto", "pause-menu", "gameover"].forEach((id) => el(id).classList.add("hidden"));
}
function toMenu() {
  state = "menu";
  resetGame();
  hideOverlays();
  hudEl.classList.add("hidden");
  bossBarEl.classList.add("hidden");
  powerBarEl.classList.add("hidden");
  el("menu-best").textContent = best.toLocaleString("en-US");
  el("menu").classList.remove("hidden");
}

// ---------- combat ----------
function playerShoot(dt, wantFire) {
  const p = player;
  p.fireT -= dt;
  const interval = p.rapidT > 0 ? 0.11 : 0.22;
  if (wantFire && p.fireT <= 0) {
    p.fireT = interval;
    const bx = p.x, by = p.y - 24 * SZ;
    if (p.doubleT > 0) {
      bullets.push({ x: bx - 10 * SZ, y: by, vy: -640 * SPD });
      bullets.push({ x: bx + 10 * SZ, y: by, vy: -640 * SPD });
    } else {
      bullets.push({ x: bx, y: by, vy: -640 * SPD });
    }
    if (bullets.length > 40) bullets.splice(0, bullets.length - 40);
    Sound.shoot();
  }
}

function enemyShoot(e) {
  const p = player;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  const sp = 260 * SPD;
  ebullets.push({ x: e.x, y: e.y + e.r, vx: (dx / d) * sp, vy: (dy / d) * sp });
  if (ebullets.length > 60) ebullets.shift();
}

function explodeAt(x, y, color, n) {
  for (let i = 0; i < (n || 14); i++) {
    const a = rand(0, TAU), sp = rand(40, 260) * SZ;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.3, 0.8), maxLife: 0.8, color, size: rand(2, 5) * SZ });
  }
  particles.push({ x, y, ring: true, life: 0.35, maxLife: 0.35, color });
  if (particles.length > 320) particles.splice(0, particles.length - 320);
}

function floatText(x, y, txt, color) {
  floats.push({ x, y, txt, color: color || "#fff", life: 0.9 });
}

function destroyEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  killStreak++;
  let pts = e.score;
  if (killStreak > 0 && killStreak % 10 === 0) {
    const bonus = killStreak * 5;
    pts += bonus;
    floatText(e.x, e.y - 20 * SZ, "STREAK +" + bonus, "#fde047");
  }
  score += pts;
  floatText(e.x, e.y, "+" + pts, "#a5f3fc");
  explodeAt(e.x, e.y, "#fb923c", 12);
  Sound.explode();
  maybeDrop(e.x, e.y);
}

function maybeDrop(x, y) {
  if (Math.random() > 0.12) return;
  const kinds = ["rapid", "double", "shield", "repair"];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  if (kind === "repair" && lives >= MAX_LIVES) return;
  powerups.push({ x: clamp(x, 20, W - 20), y, vy: 130 * SPD, kind, t: 0 });
}

function collectPower(kind) {
  const p = player;
  Sound.power();
  if (kind === "rapid") { p.rapidT = 8; floatText(p.x, p.y - 30 * SZ, "RAPID FIRE!", PCOLORS.rapid); }
  else if (kind === "double") { p.doubleT = 10; floatText(p.x, p.y - 30 * SZ, "DOUBLE SHOT!", PCOLORS.double); }
  else if (kind === "shield") { p.shieldT = 8; floatText(p.x, p.y - 30 * SZ, "SHIELD!", PCOLORS.shield); }
  else if (kind === "repair") { lives = Math.min(MAX_LIVES, lives + 1); floatText(p.x, p.y - 30 * SZ, "+1 LIFE", PCOLORS.repair); updateHUD(true); }
}

function hitPlayer() {
  const p = player;
  if (state !== "playing" || p.invuln > 0) return;
  if (p.shieldT > 0) {
    p.shieldT = 0; p.invuln = 0.8;
    explodeAt(p.x, p.y, "#34d399", 10);
    floatText(p.x, p.y - 30 * SZ, "SHIELD DOWN", "#34d399");
    Sound.hit();
    return;
  }
  lives--; killStreak = 0; p.invuln = 1.6; shake = 9; flash = 0.5;
  explodeAt(p.x, p.y, "#f87171", 18);
  Sound.hit();
  updateHUD(true);
  if (lives <= 0) gameOver();
}

function bossDie() {
  const b = boss;
  boss = null;
  bossBarEl.classList.add("hidden");
  score += 250;
  floatText(b.x, b.y, "+250 BOSS!", "#fde047");
  for (let i = 0; i < 5; i++)
    explodeAt(b.x + rand(-50, 50) * SZ, b.y + rand(-30, 30) * SZ, ["#fb923c", "#f87171", "#fde047"][i % 3], 22);
  shake = 14;
  Sound.bossDown();
  bossDefT = 2.5;
  showBanner("BOSS DEFEATED", "");
}

function updateBossBar() {
  if (!boss) return;
  bossFillEl.style.width = clamp((boss.hp / boss.maxHp) * 100, 0, 100) + "%";
}

// ---------- HUD ----------
let lastHud = {};
function updateHUD(force) {
  const set = (k, v, fn) => { if (force || lastHud[k] !== v) { lastHud[k] = v; fn(v); } };
  set("score", score, (v) => (scoreEl.textContent = v.toLocaleString("en-US")));
  set("best", Math.max(best, score), (v) => (bestEl.textContent = v.toLocaleString("en-US")));
  set("lives", lives, () => {
    livesEl.innerHTML = "";
    for (let i = 0; i < MAX_LIVES; i++) {
      const d = document.createElement("div");
      d.className = "pip" + (i < lives ? "" : " lost");
      livesEl.appendChild(d);
    }
  });
  // power-up chips
  const p = player;
  const chips = [];
  if (p) {
    if (p.rapidT > 0) chips.push(["RAPID", Math.ceil(p.rapidT)]);
    if (p.doubleT > 0) chips.push(["DOUBLE", Math.ceil(p.doubleT)]);
    if (p.shieldT > 0) chips.push(["SHIELD", Math.ceil(p.shieldT)]);
  }
  const key = chips.map((c) => c[0] + c[1]).join("|");
  set("pw", key, () => {
    powerBarEl.classList.toggle("hidden", chips.length === 0);
    powerBarEl.innerHTML = chips.map((c) => `<span class="pw-chip">${c[0]} ${c[1]}s</span>`).join("");
  });
}

// ---------- update ----------
function update(dt) {
  time += dt;
  const p = player;

  // timers
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.classList.add("hidden"); }
  if (shake > 0) shake = Math.max(0, shake - dt * 30);
  if (flash > 0) flash = Math.max(0, flash - dt * 2);
  if (bossDefT > 0) bossDefT -= dt;

  // stars & planets drift
  for (const s of stars) { s.y += s.v * dt; s.tw += dt * 3; if (s.y > H + 4) { s.y = -4; s.x = rand(0, W); } }
  for (const pl of planets) { pl.y += pl.v * dt; if (pl.y - pl.r > H) { pl.y = -pl.r; pl.x = rand(0.1, 0.9) * W; } }

  // player movement
  const mv = (keys["arrowleft"] || keys["a"] ? -1 : 0) + (keys["arrowright"] || keys["d"] ? 1 : 0)
    + (touch.left ? -1 : 0) + (touch.right ? 1 : 0);
  const dir = clamp(mv, -1, 1);
  p.x = clamp(p.x + dir * p.speed * SZ * dt, 24 * SZ, W - 24 * SZ);
  p.tilt += ((dir * 0.5) - p.tilt) * Math.min(1, dt * 10);
  if (p.invuln > 0) p.invuln -= dt;
  if (p.shieldT > 0) p.shieldT -= dt;
  if (p.rapidT > 0) p.rapidT -= dt;
  if (p.doubleT > 0) p.doubleT -= dt;

  if (state === "transition") {
    updateParticles(dt);
    if (bannerT <= 0) { state = "playing"; startWave(wave + 1); }
    return;
  }

  playerShoot(dt, firing || touch.fire);

  // spawning
  if (!boss && bossDefT <= 0 && spawnQueue.length > 0) {
    spawnT -= dt;
    if (spawnT <= 0) { spawnT = spawnInterval * rand(0.7, 1.3); spawnEnemy(spawnQueue.pop()); }
  }

  // player bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.y += b.vy * dt;
    if (b.y < -30) { bullets.splice(i, 1); continue; }
    let hitSomething = false;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = b.x - e.x, dy = b.y - e.y;
      if (dx * dx + dy * dy < (e.r + 6 * SZ) * (e.r + 6 * SZ)) {
        hitSomething = true;
        e.hp--;
        explodeAt(b.x, b.y, "#a5f3fc", 3);
        if (e.hp <= 0) destroyEnemy(e);
        break;
      }
    }
    if (!hitSomething && boss && !boss.dead) {
      const dx = b.x - boss.x, dy = b.y - boss.y;
      if (Math.abs(dx) < boss.w / 2 && Math.abs(dy) < boss.h / 2) {
        hitSomething = true;
        boss.hp--;
        updateBossBar();
        explodeAt(b.x, b.y, "#fde047", 3);
        if (boss.hp <= 0) bossDie();
      }
    }
    if (hitSomething) bullets.splice(i, 1);
  }

  // enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    e.t += dt;
    const spd = e.speed;
    if (e.type === "fast") {
      e.y += spd * dt;
      e.x += Math.sin(e.t * 4 + e.seed) * 70 * SZ * dt;
    } else if (e.type === "elite" && e.y > 130 * SZ) {
      e.y += spd * 0.25 * dt;
      e.x += Math.sin(e.t * 2 + e.seed) * 90 * SZ * dt;
      e.x = clamp(e.x, 30 * SZ, W - 30 * SZ);
    } else {
      e.y += spd * dt;
    }
    // enemy fire
    if (e.fireRate > 0) {
      e.fireT -= dt * e.fireRate;
      if (e.fireT <= 0 && e.y > 0 && e.y < H * 0.7) {
        e.fireT = rand(1.6, 2.8);
        enemyShoot(e);
      }
    }
    // breach the defense line?
    if (e.y - e.r > defenseY) {
      e.dead = true;
      explodeAt(e.x, defenseY, "#f87171", 12);
      floatText(e.x, defenseY - 20, "BREACH!", "#f87171");
      hitPlayer();
      enemies.splice(i, 1);
      continue;
    }
    // ram the player?
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy < (e.r + 18 * SZ) * (e.r + 18 * SZ)) {
      e.dead = true;
      explodeAt(e.x, e.y, "#fb923c", 10);
      hitPlayer();
      enemies.splice(i, 1);
      continue;
    }
    if (e.y > H + 60) enemies.splice(i, 1);
  }

  // boss
  if (boss && !boss.dead) {
    const b = boss;
    b.t += dt;
    if (b.y < b.ty) b.y = Math.min(b.ty, b.y + 90 * SPD * dt);
    else b.x = W / 2 + Math.sin(b.t * 0.7) * (W / 2 - 80 * SZ);
    b.atkT -= dt;
    if (b.atkT <= 0) {
      b.atkT = Math.max(1.3, 2.5 - wave * 0.06);
      for (let k = -1; k <= 1; k++) {
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
        const base = Math.atan2(dy, dx) + k * 0.16, sp = 240 * SPD;
        ebullets.push({ x: b.x, y: b.y + b.h / 2, vx: Math.cos(base) * sp, vy: Math.sin(base) * sp });
      }
      Sound.tone(200, 0.15, "sawtooth", 0.07, 120);
    }
    b.atkT2 -= dt;
    if (b.atkT2 <= 0) {
      b.atkT2 = 5.2;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU + b.t;
        ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 170 * SPD, vy: Math.sin(a) * 170 * SPD });
      }
      Sound.tone(140, 0.25, "sawtooth", 0.08, 80);
    }
    b.sumT -= dt;
    if (b.sumT <= 0) {
      b.sumT = 9;
      if (enemies.length < 6) { spawnEnemy("basic"); spawnEnemy("basic"); }
    }
    // boss touches player?
    const dx = b.x - p.x, dy = b.y - p.y;
    if (Math.abs(dx) < b.w / 2 && Math.abs(dy) < b.h / 2 + 18 * SZ) hitPlayer();
  }

  // enemy bullets
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) { ebullets.splice(i, 1); continue; }
    const dx = b.x - p.x, dy = b.y - p.y;
    if (dx * dx + dy * dy < (20 * SZ) * (20 * SZ)) {
      ebullets.splice(i, 1);
      hitPlayer();
    }
  }

  // power-ups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    pu.t += dt; pu.y += pu.vy * dt;
    if (pu.y > H + 30) { powerups.splice(i, 1); continue; }
    const dx = pu.x - p.x, dy = pu.y - p.y;
    if (dx * dx + dy * dy < (30 * SZ) * (30 * SZ)) {
      powerups.splice(i, 1);
      collectPower(pu.kind);
    }
  }

  updateParticles(dt);

  // wave cleared?
  if (!boss && bossDefT <= 0 && spawnQueue.length === 0 && enemies.length === 0) {
    score += 25; // wave clear bonus
    floatText(W / 2, H / 2 - 60, "WAVE CLEAR +25", "#34d399");
    Sound.wave();
    updateHUD(true);
    state = "transition";
    showBanner("WAVE " + (wave + 1), "");
  }
  updateHUD(false);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= dt;
    if (pt.life <= 0) { particles.splice(i, 1); continue; }
    if (!pt.ring) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.98; pt.vy *= 0.98; }
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life -= dt; f.y -= 40 * dt;
    if (f.life <= 0) floats.splice(i, 1);
  }
}

// touch button state
const touch = { left: false, right: false, fire: false };

// ---------- rendering ----------
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#070714"); g.addColorStop(0.6, "#0a0a24"); g.addColorStop(1, "#120a2e");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const pl of planets) {
    const pg = ctx.createRadialGradient(pl.x - pl.r * 0.3, pl.y - pl.r * 0.3, pl.r * 0.2, pl.x, pl.y, pl.r);
    pg.addColorStop(0, pl.c1); pg.addColorStop(1, "#050510");
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, TAU); ctx.fill();
  }
  for (const s of stars) {
    const a = 0.45 + 0.55 * Math.abs(Math.sin(s.tw));
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
}

function drawDefenseLine() {
  ctx.save();
  ctx.strokeStyle = "rgba(248,113,113,.35)";
  ctx.lineWidth = 2; ctx.setLineDash([10 * SZ, 8 * SZ]);
  ctx.beginPath(); ctx.moveTo(0, defenseY); ctx.lineTo(W, defenseY); ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  const p = player;
  if (p.invuln > 0 && Math.floor(time * 14) % 2 === 0) return; // blink
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.tilt * 0.35);
  const s = SZ;
  // engine flame
  const fl = (13 + Math.random() * 9) * s;
  ctx.fillStyle = "#fb923c";
  ctx.beginPath(); ctx.moveTo(-7 * s, 15 * s); ctx.lineTo(0, 15 * s + fl); ctx.lineTo(7 * s, 15 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fde68a";
  ctx.beginPath(); ctx.moveTo(-3.5 * s, 15 * s); ctx.lineTo(0, 15 * s + fl * 0.55); ctx.lineTo(3.5 * s, 15 * s); ctx.closePath(); ctx.fill();
  // fins
  ctx.fillStyle = "#0891b2";
  ctx.beginPath(); ctx.moveTo(-9 * s, 2 * s); ctx.lineTo(-17 * s, 15 * s); ctx.lineTo(-9 * s, 15 * s); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(9 * s, 2 * s); ctx.lineTo(17 * s, 15 * s); ctx.lineTo(9 * s, 15 * s); ctx.closePath(); ctx.fill();
  // body
  const grad = ctx.createLinearGradient(-10 * s, 0, 10 * s, 0);
  grad.addColorStop(0, "#0e7490"); grad.addColorStop(0.5, "#22d3ee"); grad.addColorStop(1, "#0e7490");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -22 * s);
  ctx.quadraticCurveTo(10 * s, -8 * s, 10 * s, 8 * s);
  ctx.lineTo(10 * s, 15 * s); ctx.lineTo(-10 * s, 15 * s); ctx.lineTo(-10 * s, 8 * s);
  ctx.quadraticCurveTo(-10 * s, -8 * s, 0, -22 * s);
  ctx.closePath(); ctx.fill();
  // cockpit
  ctx.fillStyle = "#e0f2fe";
  ctx.beginPath(); ctx.arc(0, -4 * s, 5 * s, 0, TAU); ctx.fill();
  ctx.fillStyle = "#0c4a6e";
  ctx.beginPath(); ctx.arc(0, -4 * s, 3 * s, 0, TAU); ctx.fill();
  ctx.restore();
  if (p.shieldT > 0) {
    ctx.strokeStyle = `rgba(52,211,153,${0.55 + 0.3 * Math.sin(time * 8)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 30 * s, 0, TAU); ctx.stroke();
  }
}

function drawEnemy(e) {
  const s = SZ;
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.type === "basic") {
    ctx.fillStyle = "#16a34a";
    ctx.beginPath(); ctx.ellipse(0, 2 * s, 16 * s, 8 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#4ade80";
    ctx.beginPath(); ctx.arc(0, -4 * s, 8 * s, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-4 * s, -4 * s, 2.6 * s, 0, TAU); ctx.arc(4 * s, -4 * s, 2.6 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(-4 * s, -4 * s, 1.2 * s, 0, TAU); ctx.arc(4 * s, -4 * s, 1.2 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = "#bbf7d0";
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 9 * s, 8 * s, 1.8 * s, 0, TAU); ctx.fill(); }
  } else if (e.type === "fast") {
    ctx.fillStyle = "#ea580c";
    ctx.beginPath(); ctx.moveTo(0, -13 * s); ctx.lineTo(9 * s, 10 * s); ctx.lineTo(0, 4 * s); ctx.lineTo(-9 * s, 10 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fdba74";
    ctx.beginPath(); ctx.moveTo(0, -13 * s); ctx.lineTo(4 * s, 6 * s); ctx.lineTo(0, 2 * s); ctx.lineTo(-4 * s, 6 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(0, -4 * s, 2.4 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = "#7c2d12";
    ctx.beginPath(); ctx.arc(0, -4 * s, 1.2 * s, 0, TAU); ctx.fill();
  } else if (e.type === "armored") {
    ctx.fillStyle = "#7e22ce";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2;
      const px = Math.cos(a) * 19 * s, py = Math.sin(a) * 19 * s;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#a855f7";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2;
      const px = Math.cos(a) * 12 * s, py = Math.sin(a) * 12 * s;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e9d5ff";
    ctx.beginPath(); ctx.arc(0, 0, 5 * s, 0, TAU); ctx.fill();
    // damage cracks
    if (e.hp < e.maxHp) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 * s;
      ctx.beginPath(); ctx.moveTo(-8 * s, -6 * s); ctx.lineTo(2 * s, 2 * s); ctx.lineTo(-4 * s, 10 * s); ctx.stroke();
    }
  } else if (e.type === "elite") {
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + e.t * 0.8;
      const r = (i % 2 ? 10 : 17) * s;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fca5a5";
    ctx.beginPath(); ctx.arc(0, 0, 7 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(0, 0, 3.5 * s + Math.sin(e.t * 6) * s, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawBoss() {
  const b = boss, s = SZ;
  ctx.save(); ctx.translate(b.x, b.y);
  // glow
  const gl = ctx.createRadialGradient(0, 0, 10, 0, 0, 80 * s);
  gl.addColorStop(0, "rgba(248,113,113,.25)"); gl.addColorStop(1, "transparent");
  ctx.fillStyle = gl; ctx.fillRect(-80 * s, -60 * s, 160 * s, 120 * s);
  // hull
  ctx.fillStyle = "#881337";
  ctx.beginPath(); ctx.ellipse(0, 0, 58 * s, 34 * s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#be123c";
  ctx.beginPath(); ctx.ellipse(0, -6 * s, 44 * s, 24 * s, 0, 0, TAU); ctx.fill();
  // domes
  ctx.fillStyle = "#fda4af";
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 20 * s, -14 * s, 7 * s, 0, TAU); ctx.fill(); }
  // core
  const pulse = 9 * s + Math.sin(b.t * 5) * 2.5 * s;
  ctx.fillStyle = "#fde047";
  ctx.beginPath(); ctx.arc(0, 8 * s, pulse, 0, TAU); ctx.fill();
  ctx.fillStyle = "#fff7ed";
  ctx.beginPath(); ctx.arc(0, 8 * s, pulse * 0.5, 0, TAU); ctx.fill();
  // cannons
  ctx.fillStyle = "#4c0519";
  ctx.fillRect(-46 * s, 14 * s, 10 * s, 18 * s);
  ctx.fillRect(36 * s, 14 * s, 10 * s, 18 * s);
  // lights
  ctx.fillStyle = "#fff";
  for (let i = -2; i <= 2; i++) {
    if (Math.floor(b.t * 4 + i) % 2 === 0) { ctx.beginPath(); ctx.arc(i * 22 * s, 26 * s, 2.5 * s, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}

function drawBullets() {
  for (const b of bullets) {
    const s = SZ;
    ctx.fillStyle = "rgba(34,211,238,.35)";
    ctx.fillRect(b.x - 4 * s, b.y - 11 * s, 8 * s, 22 * s);
    ctx.fillStyle = "#a5f3fc";
    ctx.fillRect(b.x - 2 * s, b.y - 9 * s, 4 * s, 18 * s);
    ctx.fillStyle = "#fff";
    ctx.fillRect(b.x - 1 * s, b.y - 7 * s, 2 * s, 10 * s);
  }
  for (const b of ebullets) {
    const r = 5.5 * SZ;
    ctx.fillStyle = "rgba(251,113,133,.35)";
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.7, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fb7185";
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = "#ffe4e6";
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.45, 0, TAU); ctx.fill();
  }
}

function drawPowerups() {
  for (const pu of powerups) {
    const s = SZ, bob = Math.sin(pu.t * 5) * 4 * s;
    const c = PCOLORS[pu.kind];
    ctx.save(); ctx.translate(pu.x, pu.y + bob);
    ctx.strokeStyle = c; ctx.lineWidth = 2.5;
    ctx.fillStyle = "rgba(5,5,18,.85)";
    ctx.beginPath(); ctx.arc(0, 0, 15 * s, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c;
    ctx.font = `900 ${Math.round(13 * s)}px 'Segoe UI',sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const label = { rapid: "R", double: "2", shield: "S", repair: "+" }[pu.kind];
    ctx.fillText(label, 0, 1 * s);
    ctx.restore();
  }
}

function drawParticles() {
  for (const pt of particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    if (pt.ring) {
      ctx.strokeStyle = pt.color;
      ctx.globalAlpha = a; ctx.lineWidth = 3 * SZ;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, (1 - a) * 46 * SZ + 6, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      ctx.globalAlpha = 1;
    }
  }
  ctx.textAlign = "center";
  for (const f of floats) {
    ctx.globalAlpha = clamp(f.life / 0.9, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = `700 ${Math.round(15 * SZ)}px 'Segoe UI',sans-serif`;
    ctx.fillText(f.txt, f.x, f.y);
    ctx.globalAlpha = 1;
  }
}

function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
  drawBackground();
  if (state === "menu") {
    for (const m of menuAliens) drawEnemy(m);
    ctx.restore();
    return;
  }
  drawDefenseLine();
  drawPowerups();
  for (const e of enemies) if (!e.dead) drawEnemy(e);
  if (boss && !boss.dead) drawBoss();
  drawBullets();
  if (state !== "gameover") drawPlayer();
  drawParticles();
  if (flash > 0) {
    ctx.fillStyle = `rgba(248,113,113,${(flash * 0.35).toFixed(2)})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---------- menu decoration ----------
let menuAliens = [];
function updateMenuBg(dt) {
  for (const s of stars) { s.y += s.v * dt * 0.4; s.tw += dt * 3; if (s.y > H + 4) { s.y = -4; s.x = rand(0, W); } }
  for (const m of menuAliens) {
    m.y += 26 * SPD * dt; m.t += dt;
    if (m.y > H + 40) { m.y = -40; m.x = rand(30, W - 30); }
  }
  updateParticles(dt);
}

// ---------- UI wiring ----------
function wireUI() {
  el("btn-play").addEventListener("click", () => { Sound.ensure(); startGame(); });
  el("btn-howto").addEventListener("click", () => el("howto").classList.remove("hidden"));
  el("btn-howto-back").addEventListener("click", () => el("howto").classList.add("hidden"));
  el("btn-sound").addEventListener("click", () => Sound.toggle());
  el("btn-pause").addEventListener("click", () => pauseGame());
  el("btn-resume").addEventListener("click", () => resumeGame());
  el("btn-restart").addEventListener("click", () => { el("pause-menu").classList.add("hidden"); startGame(); });
  el("btn-quit").addEventListener("click", () => toMenu());
  el("btn-again").addEventListener("click", () => startGame());
  el("btn-menu").addEventListener("click", () => toMenu());
  bindHold("btn-left", () => (touch.left = true), () => (touch.left = false));
  bindHold("btn-right", () => (touch.right = true), () => (touch.right = false));
  bindHold("btn-fire", () => (touch.fire = true), () => (touch.fire = false));
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (dt < 0) dt = 0;
  if (state === "playing" || state === "transition") update(dt);
  else if (state === "menu") updateMenuBg(dt);
  render();
}

// ---------- init ----------
Sound.init();
resize();
initField();
menuAliens = ["basic", "fast", "armored", "elite"].map((t, i) => ({
  type: t, x: rand(40, Math.max(80, W - 40)), y: rand(0, H * 0.5),
  r: ETYPES[t].r * SZ, t: rand(0, TAU), seed: 0, hp: 1, maxHp: 1, dead: false,
}));
el("menu-best").textContent = best.toLocaleString("en-US");
wireUI();
requestAnimationFrame(frame);
