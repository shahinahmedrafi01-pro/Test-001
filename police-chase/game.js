"use strict";
/* ============================================================
   POLICE CHASE — endless highway racer for Rafi's Mini Arcade
   Top-down retro arcade: dodge traffic, outrun the cops.
   ============================================================ */

/* ---------- tiny helpers ---------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ---------- audio (Web Audio, OFF by default) ---------- */
var AudioSys = {
  ctx: null, enabled: false,
  ensure: function () {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  tone: function (freq, dur, type, vol, slideTo) {
    if (!this.enabled) return;
    var ctx = this.ensure(); if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "square"; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    g.gain.value = vol || 0.08;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  },
  noise: function (dur, vol) {
    if (!this.enabled) return;
    var ctx = this.ensure(); if (!ctx) return;
    var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = ctx.createBufferSource(); s.buffer = buf;
    var g = ctx.createGain(); g.gain.value = vol || 0.15;
    s.connect(g); g.connect(ctx.destination); s.start();
  },
  crash: function () { this.noise(0.35, 0.25); this.tone(90, 0.3, "sawtooth", 0.12, 40); },
  pickup: function () { this.tone(660, 0.09, "square", 0.07); this.tone(990, 0.12, "square", 0.06); },
  nearmiss: function () { this.tone(300, 0.12, "sine", 0.06, 900); },
  siren: function () { this.tone(700, 0.35, "triangle", 0.05, 950); this.tone(950, 0.35, "triangle", 0.05, 700); },
  over: function () { this.tone(220, 0.5, "sawtooth", 0.1, 55); },
  thud: function () { this.noise(0.2, 0.2); this.tone(70, 0.25, "sawtooth", 0.12, 35); },
  beam: function () { this.tone(1200, 0.5, "sine", 0.04, 300); },
  boom: function () { this.noise(0.5, 0.2); this.tone(60, 0.4, "sawtooth", 0.1, 30); },
  click: function () { this.tone(520, 0.06, "square", 0.05); }
};

/* ---------- constants ---------- */
var LANES = 5;
var PPK = 2.4;              // pixels per (km/h) for road scroll speed
var BEST_KEY = "policeChaseBest";

/* ---------- canvas / layout ---------- */
var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");
var W = 0, H = 0, DPR = 1;
var roadX = 0, roadW = 0, laneW = 0, playerY = 0, carScale = 1;

function layout() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  roadW = Math.min(W * 0.86, 520);
  roadX = (W - roadW) / 2;
  laneW = roadW / LANES;
  playerY = H * 0.78;
  carScale = clamp(Math.min(W, H) / 700, 0.72, 1.15);
}
function laneX(i) { return roadX + laneW * (i + 0.5); }
window.addEventListener("resize", layout);

/* ---------- DOM ---------- */
function $(id) { return document.getElementById(id); }
var el = {};
["hud", "hud-score", "hud-best", "hud-dist", "hud-speed", "hud-lives", "hud-walls",
 "chase-fill", "chase-wrap", "hud-speed-num", "power-row", "touch-controls",
 "banner", "menu", "howto", "pause", "over", "over-title", "over-sub", "over-score", "over-best",
 "over-dist", "btn-pause", "btn-sound", "newbest"
].forEach(function (id) { el[id.replace(/-/g, "_")] = $(id); });

/* ---------- game state ---------- */
var state = "menu";           // menu | howto | playing | paused | gameover
var lane = 1, px = 0;         // player lane + smoothed x
var tilt = 0;                 // visual lean when switching lanes
var lives = 3, score = 0, best = 0, distM = 0;
var speedKmh = 70, elapsed = 0;
var traffic = [], police = [], pickups = [], parts = [], popups = [];
var spawnT = 1, pickupT = 9, policeT = 20, lastLane = -1;
var iframes = 0, shieldT = 0, phaseT = 0, nitroT = 0;
var surgeT = 0, surgeBuild = 0;
var chaseMeter = 0, shake = 0, roadOff = 0, sirenT = 0;
var pursuitT = 0, wallHits = 0, slowT = 0, scrapeCD = 0;
var ufo = null, ufoT = 20, heli = null, heliT = 14, bombs = [];
var arresting = false, arrestT = 0, wobX = 0;

try { best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) { best = 0; }

function resetGame() {
  lane = 2; lives = 3; score = 0; distM = 0;
  speedKmh = 70; elapsed = 0;
  traffic = []; police = []; pickups = []; parts = []; popups = []; bombs = [];
  spawnT = 1.2; pickupT = 8; policeT = 20; lastLane = -1;
  iframes = 0; shieldT = 0; phaseT = 0; nitroT = 0;
  surgeT = 0; surgeBuild = 0; chaseMeter = 0; shake = 0; sirenT = 0;
  pursuitT = 0; wallHits = 0; slowT = 0; scrapeCD = 0;
  ufo = null; ufoT = rand(18, 28); heli = null; heliT = rand(12, 22);
  arresting = false; arrestT = 0; wobX = 0;
  px = laneX(2); tilt = 0;
  updateWallPips();
}

/* ---------- entities ---------- */
var TRAFFIC_COLORS = ["#3b82f6", "#a855f7", "#eab308", "#9ca3af", "#f97316", "#14b8a6"];

function spawnTraffic() {
  // avoid spawning a full wall: don't repeat last lane twice while it is still near top
  var l = randi(0, LANES - 1), guard = 0;
  while (l === lastLane && guard++ < 8) l = randi(0, LANES - 1);
  lastLane = l;
  var kind = Math.random();
  var t;
  if (kind < 0.14) {           // road barrier — static, full road speed
    t = { kind: "barrier", lane: l, x: laneX(l), y: -40, w: 44, h: 30, vy: 0 };
  } else if (kind < 0.34) {    // truck — long + slow
    t = { kind: "truck", lane: l, x: laneX(l), y: -110, w: 40, h: 104, vy: rand(0.32, 0.42), color: choice(TRAFFIC_COLORS) };
  } else {                     // car
    t = { kind: "car", lane: l, x: laneX(l), y: -80, w: 36, h: 66, vy: rand(0.38, 0.58), color: choice(TRAFFIC_COLORS) };
  }
  t.passed = false;
  traffic.push(t);
}

function spawnPolice(chaseMode) {
  var l = randi(0, LANES - 1);
  var aggro = clamp(0.30 + elapsed * 0.004, 0.30, 1.0);
  police.push({
    lane: l, x: laneX(l), y: H + 70, w: 38, h: 68,
    // chase cops run slightly faster than the player; patrol cops start slower
    top: chaseMode ? speedKmh * 1.06 : speedKmh * (0.80 + Math.min(0.30, elapsed * 0.0022)),
    mode: chaseMode ? "chase" : "cruise",
    aggro: aggro, flash: Math.random() * 10
  });
  AudioSys.siren();
}

/* pursuit: triggered by a crash or a wall scrape; cops chase hard, then fall behind */
function triggerPursuit() {
  if (arresting || state !== "playing") return;
  var was = pursuitT > 0;
  pursuitT = 10;
  if (!was) { banner("PURSUIT!", "#ef4444"); AudioSys.siren(); }
  for (var i = 0; i < police.length; i++) {
    if (police[i].mode !== "surround") police[i].mode = "chase";
  }
  if (police.length < 3) spawnPolice(true);
}

/* scraping the roadside wall: slows the car, cops catch up; 3 hits = arrested */
function wallScrape(dir) {
  if (scrapeCD > 0 || arresting || state !== "playing") return;
  scrapeCD = 0.9;
  wallHits++;
  slowT = 2.2;
  shake = Math.max(shake, 8);
  var wx = dir < 0 ? roadX - 10 : roadX + roadW + 10;
  burst(wx, playerY, "#fbbf24", 16, 200);
  popup(px, playerY - 60, "WALL HIT!", "#fbbf24");
  AudioSys.thud();
  updateWallPips(); updatePowerRow();
  triggerPursuit();
  if (wallHits >= 3) startArrest();
}

function startArrest() {
  if (arresting || state !== "playing") return;
  arresting = true; arrestT = 2.0;
  traffic = []; pickups = []; bombs = []; ufo = null; heli = null; wobX = 0;
  police = [];
  function slot(ox, oy) {
    police.push({ x: px + ox * 2.5, y: playerY + oy * 2.5 + 160, w: 38, h: 68,
      top: 0, aggro: 0, flash: Math.random() * 10, mode: "surround",
      tx: px + ox, ty: playerY + oy });
  }
  slot(-72, -30); slot(72, -30); slot(0, 96);
  banner("STOP! POLICE!", "#ef4444");
  AudioSys.siren();
}

function spawnPickup() {
  var l = randi(0, LANES - 1);
  var r = Math.random(), type;
  if (r < 0.30) type = "nitro";
  else if (r < 0.55) type = "shield";
  else if (r < 0.80) type = "phase";
  else type = "repair";
  // don't offer repair at full health
  if (type === "repair" && lives >= 3) type = "nitro";
  pickups.push({ type: type, lane: l, x: laneX(l), y: -40, bob: Math.random() * 6 });
}

function burst(x, y, color, n, spd) {
  for (var i = 0; i < (n || 14); i++) {
    parts.push({ x: x, y: y, vx: rand(-1, 1) * (spd || 160), vy: rand(-1, 0.6) * (spd || 160),
      life: rand(0.3, 0.8), max: 0.8, color: color, r: rand(2, 5) });
  }
}
function popup(x, y, text, color) {
  popups.push({ x: x, y: y, text: text, color: color || "#fff", life: 1.1 });
}
function banner(text, color) {
  var b = el.banner;
  b.textContent = text; b.style.color = color || "#fff";
  b.classList.remove("hidden"); b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
  clearTimeout(b._t); b._t = setTimeout(function () { b.classList.add("hidden"); }, 1100);
}

/* ---------- collision ---------- */
function overlap(ax, ay, aw, ah, bx, by, bw, bh, shrink) {
  var s = shrink == null ? 0.78 : shrink;
  aw *= s; ah *= s; bw *= s; bh *= s;
  return Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2;
}
function playerW() { return 36 * carScale; }
function playerH() { return 66 * carScale; }

function hitPlayer(srcX, srcY) {
  if (iframes > 0 || phaseT > 0 || arresting) return;
  if (shieldT > 0) {
    shieldT = 0;
    burst(srcX, srcY, "#60a5fa", 22, 220);
    popup(px, playerY - 60, "BLOCKED!", "#60a5fa");
    AudioSys.pickup();
    updatePowerRow();
    return;
  }
  lives--;
  iframes = 1.6; shake = 14;
  burst(px, playerY, "#f97316", 26, 260);
  burst(px, playerY, "#ef4444", 16, 200);
  AudioSys.crash();
  updateLives();
  triggerPursuit();
  if (lives <= 0) gameOver("busted");
}

function applyPickup(p) {
  if (p.type === "nitro") { nitroT = 5; banner("NITRO!", "#fb923c"); }
  else if (p.type === "shield") { shieldT = 9; banner("SHIELD!", "#60a5fa"); }
  else if (p.type === "phase") { phaseT = 5; banner("PHASE!", "#22d3ee"); }
  else if (p.type === "repair") { lives = Math.min(3, lives + 1); banner("+1 LIFE", "#4ade80"); updateLives(); }
  score += 50;
  burst(p.x, p.y, "#fff", 12, 140);
  AudioSys.pickup();
  updatePowerRow();
}

/* ---------- special events: UFO + helicopter ---------- */
function updateFx(dt) {
  for (var m = parts.length - 1; m >= 0; m--) {
    var q = parts[m];
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 300 * dt; q.life -= dt;
    if (q.life <= 0) parts.splice(m, 1);
  }
  for (var n = popups.length - 1; n >= 0; n--) {
    var u = popups[n]; u.y -= 40 * dt; u.life -= dt;
    if (u.life <= 0) popups.splice(n, 1);
  }
}

/* UFO flyby: tries to abduct the car with a tractor beam, always fails */
function updateUFO(dt) {
  ufoT -= dt;
  if (!ufo && ufoT <= 0 && !arresting) {
    var fromLeft = Math.random() < 0.5;
    ufo = { x: fromLeft ? -70 : W + 70, y: H * 0.16,
      vx: (fromLeft ? 1 : -1) * rand(120, 180), mode: "fly", t: 0 };
    AudioSys.beam();
    popup(clamp(ufo.x, 40, W - 40), ufo.y + 34, "UFO!", "#e879f9");
  }
  if (!ufo) return;
  var u = ufo;
  if (u.mode === "fly") {
    u.x += u.vx * dt;
    if (Math.abs(u.x - px) < 50) { u.mode = "abduct"; u.t = 2.4; }
    else if ((u.vx > 0 && u.x > W + 80) || (u.vx < 0 && u.x < -80)) { ufo = null; ufoT = rand(25, 42); }
  } else if (u.mode === "abduct") {
    u.t -= dt; u.x += u.vx * dt * 0.25;
    wobX = Math.sin(elapsed * 28) * 7;
    if (u.t <= 0) {
      u.mode = "leave"; u.vx *= 2.4; wobX = 0;
      popup(px, playerY - 95, "ABDUCTION FAILED!", "#4ade80");
    }
  } else {
    u.x += u.vx * dt;
    if ((u.vx > 0 && u.x > W + 90) || (u.vx < 0 && u.x < -90)) { ufo = null; ufoT = rand(25, 42); }
  }
}

/* helicopter: drops bombs that slow the car but never damage it */
function updateHeli(dt) {
  heliT -= dt;
  if (!heli && heliT <= 0 && !arresting) {
    var fl = Math.random() < 0.5;
    heli = { x: fl ? -80 : W + 80, y: H * 0.10,
      vx: (fl ? 1 : -1) * rand(90, 130), dropT: 0.8, drops: 3, rotor: 0 };
    popup(clamp(heli.x, 40, W - 40), heli.y + 30, "HELICOPTER!", "#fbbf24");
  }
  if (heli) {
    var h = heli;
    h.x += h.vx * dt; h.rotor += dt * 20; h.dropT -= dt;
    if (h.dropT <= 0 && h.drops > 0) {
      h.drops--; h.dropT = 1.3;
      bombs.push({ x: h.x + rand(-10, 10), y: h.y + 12, vy: 60, ty: rand(H * 0.30, H * 0.72) });
    }
    if (h.drops <= 0 && ((h.vx > 0 && h.x > W + 90) || (h.vx < 0 && h.x < -90))) {
      heli = null; heliT = rand(20, 36);
    }
  }
  for (var bi = bombs.length - 1; bi >= 0; bi--) {
    var b = bombs[bi];
    b.vy += 520 * dt; b.y += b.vy * dt;
    if (b.y >= b.ty) {
      bombs.splice(bi, 1);
      burst(b.x, b.ty, "#f97316", 20, 240);
      burst(b.x, b.ty, "#78716c", 12, 120);
      shake = Math.max(shake, 6); AudioSys.boom();
      if (Math.abs(b.x - px) < 110 && Math.abs(b.ty - playerY) < 140) {
        slowT = 2.5; updatePowerRow();
        popup(px, playerY - 70, "SLOWED!", "#fbbf24");
      }
    }
  }
}

/* ---------- per-frame update ---------- */
function update(dt) {
  elapsed += dt;
  if (scrapeCD > 0) scrapeCD -= dt;
  if (slowT > 0) { slowT -= dt; if (slowT <= 0) updatePowerRow(); }

  // arrest sequence: surrounded — the car is stopped while cops close in
  if (arresting) {
    arrestT -= dt;
    speedKmh += (0 - speedKmh) * Math.min(1, dt * 3);
    var allIn = true;
    for (var si = 0; si < police.length; si++) {
      var sc = police[si];
      sc.x += (sc.tx - sc.x) * Math.min(1, dt * 3.5);
      sc.y += (sc.ty - sc.y) * Math.min(1, dt * 3.5);
      sc.flash += dt * 10;
      if (Math.abs(sc.tx - sc.x) > 10 || Math.abs(sc.ty - sc.y) > 10) allIn = false;
    }
    updateFx(dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 40);
    if (arrestT <= 0 && allIn) gameOver("arrested");
    updateHUD();
    return;
  }

  // speed: grows over time; nitro adds a kick; walls + bombs slow you down
  var target = Math.min(240, 70 + elapsed * 0.55);
  speedKmh += (target - speedKmh) * Math.min(1, dt * 2);
  var effSpeed = (speedKmh + (nitroT > 0 ? 60 : 0)) * (slowT > 0 ? 0.55 : 1);
  var roadV = effSpeed * PPK;             // px/s of road scroll
  roadOff = (roadOff + roadV * dt) % 60;

  distM += effSpeed * dt / 3.6;
  score += effSpeed * dt * 0.12 * (nitroT > 0 ? 2 : 1);

  // timers
  if (iframes > 0) iframes -= dt;
  if (shieldT > 0) { shieldT -= dt; if (shieldT <= 0) updatePowerRow(); }
  if (phaseT > 0) { phaseT -= dt; if (phaseT <= 0) updatePowerRow(); }
  if (nitroT > 0) { nitroT -= dt; if (nitroT <= 0) updatePowerRow(); }
  if (surgeT > 0) surgeT -= dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 40);

  // player lane smoothing + lean
  var tx = laneX(lane);
  var dx = tx - px;
  px += dx * Math.min(1, dt * 10);
  tilt += ((dx > 4 ? 0.16 : dx < -4 ? -0.16 : 0) - tilt) * Math.min(1, dt * 8);

  // traffic spawning — denser over time
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnTraffic();
    var interval = Math.max(0.34, 1.15 - elapsed * 0.0085);
    spawnT = interval * rand(0.7, 1.3);
  }
  // pickups
  pickupT -= dt;
  if (pickupT <= 0) { spawnPickup(); pickupT = rand(9, 15); }
  // police patrols — first wave at ~20s, then more + meaner
  if (elapsed > 20) {
    policeT -= dt;
    var want = Math.min(4, 1 + Math.floor((elapsed - 20) / 40));
    if (policeT <= 0 && police.length < want) { spawnPolice(false); policeT = rand(4, 8); }
  }
  // pursuit: chase hard for a while, then fall behind
  if (pursuitT > 0) {
    pursuitT -= dt;
    if (pursuitT <= 0) {
      pursuitT = 0;
      for (var pi = 0; pi < police.length; pi++)
        if (police[pi].mode === "chase") police[pi].mode = "fallback";
      popup(px, playerY - 80, "YOU LOST THEM!", "#4ade80");
    }
  }

  // traffic motion + collisions + near miss
  var pw = playerW(), ph = playerH();
  for (var i = traffic.length - 1; i >= 0; i--) {
    var t = traffic[i];
    var ownV = t.kind === "barrier" ? 0 : t.vy * effSpeed * PPK;
    t.y += (roadV - ownV) * dt;
    if (t.y > H + 120) { traffic.splice(i, 1); continue; }
    // near miss: passed player closely without touching
    if (!t.passed && t.y - t.h / 2 > playerY + ph / 2) {
      t.passed = true;
      var lat = Math.abs(t.x - px);
      if (lat < (t.w + pw) / 2 + 26 && phaseT <= 0) {
        score += 25; popup(px, playerY - 70, "CLOSE! +25", "#fde047"); AudioSys.nearmiss();
      }
    }
    if (phaseT <= 0 && overlap(px, playerY, pw, ph, t.x, t.y, t.w * carScale, t.h * carScale)) {
      burst(t.x, t.y, "#fbbf24", 18, 200);
      traffic.splice(i, 1);
      hitPlayer(t.x, t.y);
      if (state !== "playing") return;
    }
  }

  // police motion: faster than player => climbs the screen toward the player
  var surgeMul = surgeT > 0 ? 1.45 : 1;
  var nearest = 1e9;
  for (var j = police.length - 1; j >= 0; j--) {
    var c = police[j];
    c.flash += dt * 8;
    if (c.mode === "surround") {
      c.x += (c.tx - c.x) * Math.min(1, dt * 3.5);
      c.y += (c.ty - c.y) * Math.min(1, dt * 3.5);
      continue;
    }
    if (c.mode === "chase") c.top += (speedKmh * 1.06 - c.top) * Math.min(1, dt * 2);
    else if (c.mode === "fallback") c.top += (speedKmh * 0.6 - c.top) * Math.min(1, dt * 2);
    c.y -= (c.top * surgeMul - effSpeed) * PPK * dt;
    // homing toward the player's lane
    var hx = px - c.x;
    c.x += clamp(hx, -1, 1) * c.aggro * laneW * 1.6 * dt * surgeMul;
    c.x = clamp(c.x, roadX + 20, roadX + roadW - 20);
    if (c.y > H + 90 || c.y < playerY - 320) { police.splice(j, 1); continue; }
    var behind = c.y - playerY;
    if (behind > 0 && behind < nearest) nearest = behind;
    if (phaseT <= 0 && overlap(px, playerY, pw, ph, c.x, c.y, c.w * carScale, c.h * carScale)) {
      burst(c.x, c.y, "#3b82f6", 20, 220);
      police.splice(j, 1);
      hitPlayer(c.x, c.y);
      if (state !== "playing") return;
    }
  }

  // chase meter: pressure from the closest cop behind
  var want2 = nearest < 1e8 ? clamp(1 - nearest / 420, 0, 1) : 0;
  chaseMeter += (want2 - chaseMeter) * Math.min(1, dt * 3);
  if (chaseMeter > 0.85 && surgeT <= 0) {
    surgeBuild += dt;
    if (surgeBuild > 1.6) { surgeT = 3; surgeBuild = 0; chaseMeter = 0.35; banner("POLICE SURGE!", "#ef4444"); AudioSys.siren(); }
  } else surgeBuild = Math.max(0, surgeBuild - dt);

  // pickups drift down with the road
  for (var k = pickups.length - 1; k >= 0; k--) {
    var p = pickups[k];
    p.y += roadV * dt; p.bob += dt * 4;
    if (p.y > H + 40) { pickups.splice(k, 1); continue; }
    if (overlap(px, playerY, pw, ph, p.x, p.y, 40, 40, 1)) {
      pickups.splice(k, 1);
      applyPickup(p);
    }
  }

  updateFx(dt);
  updateUFO(dt);
  updateHeli(dt);

  sirenT += dt;
  updateHUD();
}

/* ---------- sky events drawing ---------- */
function drawUFO(u) {
  var s = carScale;
  ctx.save(); ctx.translate(u.x, u.y);
  ctx.fillStyle = "rgba(232,121,249,0.16)";
  ctx.beginPath(); ctx.ellipse(0, 6 * s, 44 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#6b7280";
  ctx.beginPath(); ctx.ellipse(0, 0, 34 * s, 12 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#9ca3af";
  ctx.beginPath(); ctx.ellipse(0, -6 * s, 16 * s, 10 * s, 0, Math.PI, 0); ctx.fill();
  for (var i = 0; i < 6; i++) {
    var a = performance.now() / 300 + i / 6 * Math.PI * 2;
    ctx.fillStyle = i % 2 ? "#f0abfc" : "#fef9c3";
    ctx.beginPath(); ctx.arc(Math.cos(a) * 26 * s, 4 * s + Math.sin(a) * 4 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawBeam(u) {
  var s = carScale, topW = 30 * s, botW = 58 * s;
  var g = ctx.createLinearGradient(0, u.y, 0, playerY);
  g.addColorStop(0, "rgba(232,121,249,0.45)");
  g.addColorStop(1, "rgba(232,121,249,0.08)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(u.x - topW / 2, u.y + 8); ctx.lineTo(u.x + topW / 2, u.y + 8);
  ctx.lineTo(u.x + botW / 2, playerY); ctx.lineTo(u.x - botW / 2, playerY);
  ctx.closePath(); ctx.fill();
}
function drawHeli(h) {
  var s = carScale;
  ctx.save(); ctx.translate(h.x, h.y);
  ctx.strokeStyle = "rgba(210,210,210,0.85)"; ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.moveTo(-34 * s, 0); ctx.lineTo(34 * s, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-24 * s, 0); ctx.lineTo(24 * s, 0); ctx.stroke();
  ctx.fillStyle = "#374151";
  ctx.beginPath(); ctx.ellipse(0, 9 * s, 20 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#111827"; ctx.fillRect(-4 * s, 9 * s, 24 * s, 5 * s);
  ctx.fillStyle = "#6b7280"; ctx.fillRect(-16 * s, 21 * s, 32 * s, 3 * s);
  ctx.restore();
}

/* ---------- rendering ---------- */
function drawRoad() {
  // night ground
  ctx.fillStyle = "#0b0b18"; ctx.fillRect(0, 0, W, H);
  // scrolling roadside lights
  ctx.fillStyle = "#1e2a4a";
  for (var y = -60; y < H + 60; y += 60) {
    var yy = (y + roadOff * 1.0) % (H + 120) - 60;
    ctx.fillRect(roadX - 26, yy, 10, 22);
    ctx.fillRect(roadX + roadW + 16, yy + 30, 10, 22);
  }
  // asphalt
  ctx.fillStyle = "#23232e"; ctx.fillRect(roadX, 0, roadW, H);
  // neon edges
  ctx.fillStyle = "#22d3ee"; ctx.fillRect(roadX - 3, 0, 3, H);
  ctx.fillStyle = "#e879f9"; ctx.fillRect(roadX + roadW, 0, 3, H);
  // concrete roadside walls (scrolling segments)
  for (var wy = -40; wy < H + 40; wy += 40) {
    var wyy = (wy + roadOff) % (H + 80) - 40;
    ctx.fillStyle = "#3f3f46";
    ctx.fillRect(roadX - 17, wyy, 13, 40);
    ctx.fillRect(roadX + roadW + 4, wyy, 13, 40);
    ctx.fillStyle = "#a1a1aa";
    ctx.fillRect(roadX - 17, wyy, 13, 9);
    ctx.fillRect(roadX + roadW + 4, wyy, 13, 9);
  }
  // lane dividers
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (var l = 1; l < LANES; l++) {
    var x = roadX + laneW * l;
    for (var d = -60; d < H + 60; d += 60) {
      var dy = (d + roadOff) % (H + 120) - 60;
      ctx.fillRect(x - 2, dy, 4, 30);
    }
  }
}

function drawCar(x, y, w, h, body, opts) {
  opts = opts || {};
  var s = carScale;
  w *= s; h *= s;
  ctx.save();
  ctx.translate(x, y);
  if (opts.tilt) ctx.rotate(opts.tilt);
  if (opts.ghost) ctx.globalAlpha = 0.45 + 0.2 * Math.sin(performance.now() / 90);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(-w / 2 + 3, -h / 2 + 5, w, h);
  // wheels
  ctx.fillStyle = "#0a0a0a";
  var ww = w * 0.16, wh = h * 0.20;
  ctx.fillRect(-w / 2 - ww * 0.5, -h * 0.32, ww, wh);
  ctx.fillRect(w / 2 - ww * 0.5, -h * 0.32, ww, wh);
  ctx.fillRect(-w / 2 - ww * 0.5, h * 0.12, ww, wh);
  ctx.fillRect(w / 2 - ww * 0.5, h * 0.12, ww, wh);
  // body
  ctx.fillStyle = body; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fillRect(-w / 2, -h / 2, w * 0.28, h);
  if (opts.stripe) { ctx.fillStyle = opts.stripe; ctx.fillRect(-w * 0.1, -h / 2, w * 0.2, h); }
  // windshield + roof + rear window
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-w * 0.38, -h * 0.30, w * 0.76, h * 0.16);
  ctx.fillStyle = opts.roof || "#111827";
  ctx.fillRect(-w * 0.40, -h * 0.10, w * 0.80, h * 0.26);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-w * 0.38, h * 0.20, w * 0.76, h * 0.12);
  if (opts.police) {
    // white doors
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(-w / 2, -h * 0.06, w, h * 0.20);
    ctx.fillStyle = "#111"; ctx.font = Math.round(11 * s) + "px monospace";
    ctx.textAlign = "center"; ctx.fillText("POLICE", 0, h * 0.085);
    // flashing light bar
    var ph = Math.floor(opts.flash || 0) % 2 === 0;
    ctx.fillStyle = ph ? "#ef4444" : "#3b82f6"; ctx.fillRect(-w * 0.30, -h * 0.44, w * 0.24, h * 0.09);
    ctx.fillStyle = ph ? "#3b82f6" : "#ef4444"; ctx.fillRect(w * 0.06, -h * 0.44, w * 0.24, h * 0.09);
    if (ph) { ctx.fillStyle = "rgba(239,68,68,0.25)"; ctx.fillRect(-w, -h * 0.6, w * 2, h * 0.4); }
    else { ctx.fillStyle = "rgba(59,130,246,0.25)"; ctx.fillRect(-w, -h * 0.6, w * 2, h * 0.4); }
  }
  // headlights (front = up) and taillights
  ctx.fillStyle = "#fef9c3";
  ctx.fillRect(-w * 0.42, -h / 2 - 3, w * 0.20, 4);
  ctx.fillRect(w * 0.22, -h / 2 - 3, w * 0.20, 4);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(-w * 0.42, h / 2 - 1, w * 0.20, 4);
  ctx.fillRect(w * 0.22, h / 2 - 1, w * 0.20, 4);
  if (opts.shield) {
    ctx.strokeStyle = "rgba(96,165,250,0.9)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, Math.max(w, h) * 0.72, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawBarrier(t) {
  var s = carScale, w = t.w * s, h = t.h * s;
  ctx.save(); ctx.translate(t.x, t.y);
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(-w / 2 + 3, -h / 2 + 5, w, h);
  for (var i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? "#ef4444" : "#f8fafc";
    ctx.fillRect(-w / 2 + (w / 4) * i, -h / 2, w / 4, h);
  }
  ctx.fillStyle = "#111"; ctx.fillRect(-w / 2, -h / 2 - 4, w, 4); ctx.fillRect(-w / 2, h / 2, w, 4);
  ctx.restore();
}

var PICKUP_STYLE = {
  nitro: { c: "#fb923c", t: "N" }, shield: { c: "#60a5fa", t: "S" },
  phase: { c: "#22d3ee", t: "P" }, repair: { c: "#4ade80", t: "+" }
};
function drawPickup(p) {
  var st = PICKUP_STYLE[p.type];
  var bobY = Math.sin(p.bob) * 4, r = 17 * carScale;
  ctx.save(); ctx.translate(p.x, p.y + bobY);
  ctx.strokeStyle = st.c; ctx.lineWidth = 3;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = st.c; ctx.font = "bold " + Math.round(18 * carScale) + "px monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(st.t, 0, 1);
  ctx.restore();
}

function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
  drawRoad();
  var i;
  for (i = 0; i < pickups.length; i++) drawPickup(pickups[i]);
  for (i = 0; i < traffic.length; i++) {
    var t = traffic[i];
    if (t.kind === "barrier") drawBarrier(t);
    else if (t.kind === "truck") {
      drawCar(t.x, t.y - 18 * carScale, t.w, 52, t.color, {});
      drawCar(t.x, t.y + 30 * carScale, t.w, 40, "#1f2937", { roof: "#374151" });
    }
    else drawCar(t.x, t.y, t.w, t.h, t.color, {});
  }
  for (i = 0; i < police.length; i++) {
    var c = police[i];
    drawCar(c.x, c.y, c.w, c.h, "#111827", { police: true, flash: c.flash });
  }
  if (ufo) drawUFO(ufo);
  if (heli) drawHeli(heli);
  // nitro flames
  if (nitroT > 0 && state === "playing") {
    for (var f = 0; f < 3; f++)
      parts.push({ x: px + rand(-8, 8), y: playerY + playerH() / 2, vx: rand(-30, 30), vy: rand(120, 260),
        life: 0.25, max: 0.25, color: choice(["#fb923c", "#facc15", "#ef4444"]), r: rand(3, 7) });
  }
  // player (blink while iframes)
  var blink = iframes > 0 && Math.floor(performance.now() / 120) % 2 === 0;
  if (!blink) drawCar(px + wobX, playerY, 36, 66, "#ef2d2d", { stripe: "#f8fafc", tilt: tilt, ghost: phaseT > 0, shield: shieldT > 0 });
  if (ufo && ufo.mode === "abduct") drawBeam(ufo);
  for (i = 0; i < bombs.length; i++) {
    var bb = bombs[i];
    ctx.fillStyle = "#1f2937";
    ctx.beginPath(); ctx.arc(bb.x, bb.y, 6 * carScale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(bb.x - 1, bb.y - 9 * carScale, 2, 4);
  }
  // particles
  for (i = 0; i < parts.length; i++) {
    var q = parts[i];
    ctx.globalAlpha = Math.max(0, q.life / q.max);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - q.r / 2, q.y - q.r / 2, q.r, q.r);
  }
  ctx.globalAlpha = 1;
  // popups
  ctx.textAlign = "center";
  for (i = 0; i < popups.length; i++) {
    var u = popups[i];
    ctx.globalAlpha = Math.min(1, u.life);
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = u.color;
    ctx.fillText(u.text, u.x, u.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // police surge vignette
  if (surgeT > 0) {
    ctx.strokeStyle = "rgba(239,68,68," + (0.35 + 0.25 * Math.sin(performance.now() / 120)) + ")";
    ctx.lineWidth = 14; ctx.strokeRect(0, 0, W, H);
  }
}

/* ---------- HUD ---------- */
function fmt(n) { return Math.floor(n).toLocaleString("en-US"); }
function updateLives() {
  var s = "";
  for (var i = 0; i < 3; i++) s += i < lives ? "❤" : "🖤";
  el.hud_lives.innerHTML = s;
}
function updateWallPips() {
  el.hud_walls.textContent = "WALL " + wallHits + "/3";
  el.hud_walls.style.color = wallHits >= 2 ? "#ef4444" : "#fbbf24";
}
function updatePowerRow() {
  var h = "";
  function chip(label, t, color) {
    if (t > 0) h += '<span class="pchip" style="border-color:' + color + ';color:' + color + '">' + label + " " + t.toFixed(0) + "s</span>";
  }
  chip("NITRO", nitroT, "#fb923c");
  chip("SHIELD", shieldT, "#60a5fa");
  chip("PHASE", phaseT, "#22d3ee");
  chip("SLOWED", slowT, "#f87171");
  el.power_row.innerHTML = h;
}
function updateHUD() {
  el.hud_score.textContent = fmt(score);
  el.hud_best.textContent = fmt(best);
  el.hud_dist.textContent = distM < 1000 ? Math.floor(distM) + " m" : (distM / 1000).toFixed(2) + " km";
  el.hud_speed_num.textContent = Math.round(speedKmh + (nitroT > 0 ? 60 : 0));
  el.chase_fill.style.width = Math.round(chaseMeter * 100) + "%";
  el.chase_wrap.classList.toggle("hot", chaseMeter > 0.7);
}

/* ---------- state changes ---------- */
function showOverlay(which) {
  ["menu", "howto", "pause", "over"].forEach(function (k) {
    el[k].classList.toggle("hidden", k !== which);
  });
  var playing = !which;
  el.hud.classList.toggle("hidden", !playing && which !== "pause");
  el.chase_wrap.classList.toggle("hidden", !(state === "playing" || state === "paused"));
  el.touch_controls.classList.toggle("hidden", state !== "playing");
}
function startGame() {
  AudioSys.ensure(); AudioSys.click();
  resetGame();
  state = "playing";
  updateLives(); updatePowerRow(); updateHUD();
  showOverlay(null);
  banner("GO!", "#4ade80");
}
function pauseGame() {
  if (state !== "playing") return;
  state = "paused"; AudioSys.click(); showOverlay("pause");
}
function resumeGame() {
  if (state !== "paused") return;
  AudioSys.ensure(); AudioSys.click();
  state = "playing"; showOverlay(null);
  lastT = performance.now();
}
function gameOver(kind) {
  kind = kind || "busted";
  state = "gameover";
  arresting = false; wobX = 0;
  AudioSys.over();
  if (kind === "busted") burst(px, playerY, "#ef4444", 40, 320);
  else AudioSys.siren();
  if (kind === "arrested") {
    el.over_title.innerHTML = "&#128657; YOU ARE<br>ARRESTED! &#128657;";
    el.over_sub.textContent = "Too many wall hits - the chase is over.";
  } else {
    el.over_title.textContent = "BUSTED!";
    el.over_sub.textContent = "The cops finally caught you.";
  }
  el.over.classList.toggle("arrested", kind === "arrested");
  var isBest = score > best;
  if (isBest) { best = Math.floor(score); try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {} }
  el.over_score.textContent = fmt(score);
  el.over_best.textContent = fmt(best);
  el.over_dist.textContent = distM < 1000 ? Math.floor(distM) + " m" : (distM / 1000).toFixed(2) + " km";
  el.newbest.classList.toggle("hidden", !isBest);
  showOverlay("over");
}
function toMenu() { state = "menu"; AudioSys.click(); showOverlay("menu"); }

/* ---------- input ---------- */
function moveLeft() {
  if (state !== "playing" || arresting) return;
  if (lane > 0) { lane--; AudioSys.ensure(); } else wallScrape(-1);
}
function moveRight() {
  if (state !== "playing" || arresting) return;
  if (lane < LANES - 1) { lane++; AudioSys.ensure(); } else wallScrape(1);
}

document.addEventListener("keydown", function (e) {
  var k = e.key;
  if (k === "ArrowLeft" || k === "a" || k === "A") { moveLeft(); e.preventDefault(); }
  else if (k === "ArrowRight" || k === "d" || k === "D") { moveRight(); e.preventDefault(); }
  else if (k === "p" || k === "P" || k === "Escape") {
    if (state === "playing") pauseGame(); else if (state === "paused") resumeGame();
  }
  else if (k === "Enter" || k === " ") {
    if (state === "menu" || state === "gameover") startGame();
    else if (state === "paused") resumeGame();
    e.preventDefault();
  }
  else if (k === "m" || k === "M") toggleSound();
});

function bindBtn(id, fn) {
  var b = $(id);
  var h = function (e) { e.preventDefault(); fn(); };
  b.addEventListener("touchstart", h, { passive: false });
  b.addEventListener("mousedown", h);
}
bindBtn("btn-left", moveLeft);
bindBtn("btn-right", moveRight);
bindBtn("btn-pause", function () { if (state === "playing") pauseGame(); else if (state === "paused") resumeGame(); });

// swipe on canvas
var touchSX = 0, touchSY = 0;
canvas.addEventListener("touchstart", function (e) {
  var t = e.changedTouches[0]; touchSX = t.clientX; touchSY = t.clientY;
}, { passive: true });
canvas.addEventListener("touchend", function (e) {
  var t = e.changedTouches[0], dx = t.clientX - touchSX, dy = t.clientY - touchSY;
  if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) { dx > 0 ? moveRight() : moveLeft(); }
}, { passive: true });
document.addEventListener("touchmove", function (e) {
  if (state === "playing") e.preventDefault();
}, { passive: false });

// menu buttons
function on(id, fn) { $(id).addEventListener("click", fn); }
on("btn-start", startGame);
on("btn-howto", function () { state = "howto"; AudioSys.click(); showOverlay("howto"); });
on("btn-howto-back", toMenu);
on("btn-resume", resumeGame);
on("btn-restart", startGame);
on("btn-quit", toMenu);
on("btn-again", startGame);
on("btn-over-menu", toMenu);

function toggleSound() {
  AudioSys.enabled = !AudioSys.enabled;
  if (AudioSys.enabled) AudioSys.ensure();
  el.btn_sound.textContent = AudioSys.enabled ? "🔊 SOUND ON" : "🔇 SOUND OFF";
  el.btn_sound.classList.toggle("on", AudioSys.enabled);
}
on("btn-sound", toggleSound);

/* ---------- main loop ---------- */
var lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.05, (now - lastT) / 1000 || 0);
  lastT = now;
  if (state === "playing") update(dt);
  render();
}

/* ---------- boot ---------- */
layout();
px = laneX(2);
el.hud_best.textContent = fmt(best);
updateLives(); updatePowerRow();
showOverlay("menu");
requestAnimationFrame(function (t) { lastT = t; requestAnimationFrame(frame); });

/* ---------- headless test hooks ---------- */
window.__t = {
  get state() { return state; },
  get lives() { return lives; },
  get score() { return score; },
  get best() { return best; },
  get lane() { return lane; },
  get dist() { return distM; },
  get speed() { return speedKmh; },
  get chase() { return chaseMeter; },
  get wallHits() { return wallHits; },
  get pursuitT() { return pursuitT; },
  get slowT() { return slowT; },
  get arresting() { return arresting; },
  get lanes() { return LANES; },
  get hasUfo() { return !!ufo; },
  get hasHeli() { return !!heli; },
  get bombsN() { return bombs.length; },
  get trafficN() { return traffic.length; },
  get policeN() { return police.length; },
  get nitroT() { return nitroT; },
  get shieldT() { return shieldT; },
  get phaseT() { return phaseT; },
  get iframes() { return iframes; },
  playerX: function () { return px; },
  playerY: function () { return playerY; },
  laneX: laneX,
  start: startGame, pause: pauseGame, resume: resumeGame,
  moveLeft: moveLeft, moveRight: moveRight,
  frame: function (dt) { update(dt); },
  spawnTraffic: spawnTraffic, spawnPolice: spawnPolice, spawnPickup: spawnPickup,
  setLane: function (l) { lane = l; px = laneX(l); },
  forceSpawnAt: function (kind, l, y) {
    var t = kind === "barrier"
      ? { kind: "barrier", lane: l, x: laneX(l), y: y, w: 44, h: 30, vy: 0 }
      : { kind: "car", lane: l, x: laneX(l), y: y, w: 36, h: 66, vy: 0.4, color: "#fff", passed: true };
    traffic.push(t); return t;
  },
  forcePoliceAt: function (l, y) {
    var c = { lane: l, x: laneX(l), y: y, w: 38, h: 68, top: 300, aggro: 1, flash: 0 };
    police.push(c); return c;
  },
  forcePickupAt: function (type, l, y) {
    var p = { type: type, lane: l, x: laneX(l), y: y == null ? playerY : y, bob: 0 };
    pickups.push(p); return p;
  },
  hit: hitPlayer,
  wallScrape: wallScrape,
  triggerPursuit: triggerPursuit,
  startArrest: startArrest,
  forceBombAt: function (x, ty) {
    var b = { x: x, y: H * 0.1, vy: 60, ty: ty };
    bombs.push(b); return b;
  },
  clearEntities: function () { traffic = []; police = []; pickups = []; },
  set: function (k, v) {
    if (k === "lives") lives = v; else if (k === "score") score = v;
    else if (k === "elapsed") elapsed = v; else if (k === "iframes") iframes = v;
    else if (k === "shieldT") shieldT = v; else if (k === "phaseT") phaseT = v;
    else if (k === "nitroT") nitroT = v; else if (k === "chaseMeter") chaseMeter = v;
    else if (k === "policeT") policeT = v; else if (k === "spawnT") spawnT = v;
    else if (k === "pickupT") pickupT = v; else if (k === "scrapeCD") scrapeCD = v;
    else if (k === "slowT") slowT = v;
    else if (k === "wallHits") { wallHits = v; updateWallPips(); }
    else if (k === "pursuitT") pursuitT = v; else if (k === "ufoT") ufoT = v;
    else if (k === "heliT") heliT = v;
  }
};
