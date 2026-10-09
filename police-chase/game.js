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
  click: function () { this.tone(520, 0.06, "square", 0.05); }
};

/* ---------- constants ---------- */
var LANES = 4;
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
["hud", "hud-score", "hud-best", "hud-dist", "hud-speed", "hud-lives",
 "chase-fill", "chase-wrap", "hud-speed-num", "power-row", "touch-controls",
 "banner", "menu", "howto", "pause", "over", "over-score", "over-best",
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

try { best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) { best = 0; }

function resetGame() {
  lane = 1; lives = 3; score = 0; distM = 0;
  speedKmh = 70; elapsed = 0;
  traffic = []; police = []; pickups = []; parts = []; popups = [];
  spawnT = 1.2; pickupT = 8; policeT = 20; lastLane = -1;
  iframes = 0; shieldT = 0; phaseT = 0; nitroT = 0;
  surgeT = 0; surgeBuild = 0; chaseMeter = 0; shake = 0; sirenT = 0;
  px = laneX(1); tilt = 0;
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

function spawnPolice() {
  var l = randi(0, LANES - 1);
  var aggro = clamp(0.30 + elapsed * 0.004, 0.30, 1.0);
  police.push({
    lane: l, x: laneX(l), y: H + 70, w: 38, h: 68,
    // police top speed grows over time; starts a bit slower than the player
    top: speedKmh * (0.80 + Math.min(0.30, elapsed * 0.0022)),
    aggro: aggro, flash: Math.random() * 10
  });
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
  if (iframes > 0 || phaseT > 0) return;
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
  if (lives <= 0) gameOver();
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

/* ---------- per-frame update ---------- */
function update(dt) {
  elapsed += dt;

  // speed: grows over time; nitro adds a kick
  var target = Math.min(240, 70 + elapsed * 0.55);
  speedKmh += (target - speedKmh) * Math.min(1, dt * 2);
  var effSpeed = speedKmh + (nitroT > 0 ? 60 : 0);
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
  // police — first wave at ~20s, then more + meaner
  if (elapsed > 20) {
    policeT -= dt;
    var want = Math.min(4, 1 + Math.floor((elapsed - 20) / 40));
    if (policeT <= 0 && police.length < want) { spawnPolice(); policeT = rand(4, 8); }
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

  // particles + popups
  for (var m = parts.length - 1; m >= 0; m--) {
    var q = parts[m];
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 300 * dt; q.life -= dt;
    if (q.life <= 0) parts.splice(m, 1);
  }
  for (var n = popups.length - 1; n >= 0; n--) {
    var u = popups[n]; u.y -= 40 * dt; u.life -= dt;
    if (u.life <= 0) popups.splice(n, 1);
  }

  sirenT += dt;
  updateHUD();
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
  // nitro flames
  if (nitroT > 0 && state === "playing") {
    for (var f = 0; f < 3; f++)
      parts.push({ x: px + rand(-8, 8), y: playerY + playerH() / 2, vx: rand(-30, 30), vy: rand(120, 260),
        life: 0.25, max: 0.25, color: choice(["#fb923c", "#facc15", "#ef4444"]), r: rand(3, 7) });
  }
  // player (blink while iframes)
  var blink = iframes > 0 && Math.floor(performance.now() / 120) % 2 === 0;
  if (!blink) drawCar(px, playerY, 36, 66, "#ef2d2d", { stripe: "#f8fafc", tilt: tilt, ghost: phaseT > 0, shield: shieldT > 0 });
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
function updatePowerRow() {
  var h = "";
  function chip(label, t, color) {
    if (t > 0) h += '<span class="pchip" style="border-color:' + color + ';color:' + color + '">' + label + " " + t.toFixed(0) + "s</span>";
  }
  chip("NITRO", nitroT, "#fb923c");
  chip("SHIELD", shieldT, "#60a5fa");
  chip("PHASE", phaseT, "#22d3ee");
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
function gameOver() {
  state = "gameover";
  AudioSys.over();
  burst(px, playerY, "#ef4444", 40, 320);
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
function moveLeft() { if (state === "playing" && lane > 0) { lane--; AudioSys.ensure(); } }
function moveRight() { if (state === "playing" && lane < LANES - 1) { lane++; AudioSys.ensure(); } }

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
px = laneX(1);
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
  clearEntities: function () { traffic = []; police = []; pickups = []; },
  set: function (k, v) {
    ({ lives: 1, score: 1, elapsed: 1, iframes: 1, shieldT: 1, phaseT: 1, nitroT: 1, chaseMeter: 1, policeT: 1, spawnT: 1, pickupT: 1 })[k];
    if (k === "lives") lives = v; else if (k === "score") score = v;
    else if (k === "elapsed") elapsed = v; else if (k === "iframes") iframes = v;
    else if (k === "shieldT") shieldT = v; else if (k === "phaseT") phaseT = v;
    else if (k === "nitroT") nitroT = v; else if (k === "chaseMeter") chaseMeter = v;
    else if (k === "policeT") policeT = v; else if (k === "spawnT") spawnT = v;
    else if (k === "pickupT") pickupT = v;
  }
};
