"use strict";
/* Galaxy Defender — complete space shooter. Zero dependencies.
   Canvas 2D + DOM UI + WebAudio synth. Save: one localStorage key. */
(function () {
  var W = 480, H = 720;
  var SAVE_KEY = "galaxyDefenderSave";

  /* ================= data tables ================= */
  var SHIPS = {
    interceptor: { name: "Interceptor", price: 0, hp: 100, shield: 0, speed: 260, dmg: 1.0, charges: 1, color: "#22d3ee", desc: "Balanced all-rounder. Free." },
    falcon: { name: "Falcon", price: 500, hp: 80, shield: 0, speed: 340, dmg: 0.9, charges: 2, color: "#f472b6", desc: "Fast and nimble. Starts with +1 ability charge." },
    titan: { name: "Titan", price: 1000, hp: 160, shield: 50, speed: 200, dmg: 1.2, charges: 1, color: "#fbbf24", desc: "Slow tank with heavy armor and shields." }
  };
  var WEAPONS = {
    laser: { name: "Laser", price: 0, dmg: 10, rate: 6, desc: "Reliable pulse laser." },
    spread: { name: "Spread Shot", price: 300, dmg: 7, rate: 5, desc: "3-way fan of bolts." },
    plasma: { name: "Plasma Cannon", price: 800, dmg: 25, rate: 2.5, desc: "Heavy bolts that pierce enemies." },
    homing: { name: "Homing Missiles", price: 1200, dmg: 15, rate: 3, desc: "Missiles that seek the nearest enemy." }
  };
  var UPGRADES = [
    /* 10 levels. Costs continue the existing increment pattern
       (+100,+150,+200,+250 -> +300,+350,+400,+450,+500). */
    { id: "dmg", name: "Damage", desc: "+10% damage per level", costs: [100, 200, 350, 550, 800, 1100, 1450, 1850, 2300, 2800] },
    { id: "rate", name: "Fire Rate", desc: "+8% fire rate per level", costs: [100, 200, 350, 550, 800, 1100, 1450, 1850, 2300, 2800] },
    { id: "hp", name: "Max HP", desc: "+20 max HP per level", costs: [100, 200, 350, 550, 800, 1100, 1450, 1850, 2300, 2800] },
    { id: "shield", name: "Shield", desc: "+15 max shield per level", costs: [100, 200, 350, 550, 800, 1100, 1450, 1850, 2300, 2800] },
    { id: "speed", name: "Speed", desc: "+5% movement speed per level", costs: [100, 200, 350, 550, 800, 1100, 1450, 1850, 2300, 2800] },
    { id: "cd", name: "Ability Cooldown", desc: "-8% ability recharge per level", costs: [150, 300, 500, 750, 1000, 1350, 1750, 2200, 2700, 3250] }
  ];
  var ENEMIES = {
    drone: { hp: 20, speed: 90, pts: 10, radius: 14, color: "#f87171" },
    weaver: { hp: 30, speed: 110, pts: 15, radius: 15, color: "#fb923c" },
    tank: { hp: 80, speed: 50, pts: 30, radius: 22, color: "#a78bfa" },
    sniper: { hp: 25, speed: 130, pts: 25, radius: 13, color: "#f472b6" }
  };
  var BOSSES = [
    { id: "dreadnought", name: "DREADNOUGHT", hp: 800, color: "#ef4444" },
    { id: "hive", name: "HIVE QUEEN", hp: 1500, color: "#a78bfa" },
    { id: "leviathan", name: "VOID LEVIATHAN", hp: 2500, color: "#22d3ee" }
  ];
  var STAGES = ["Asteroid Field", "Alien Territory", "Nebula Sector", "Enemy Base", "Final Assault"];
  var MISSIONS = [
    { id: "firstblood", name: "First Blood", desc: "Destroy 1 enemy", target: 1, reward: 50, metric: "kills" },
    { id: "wave5", name: "Wave 5", desc: "Reach wave 5", target: 5, reward: 150, metric: "wave" },
    { id: "bossslayer", name: "Boss Slayer", desc: "Defeat 1 boss", target: 1, reward: 300, metric: "bosses" },
    { id: "score10k", name: "Score 10,000", desc: "Reach 10,000 score in one run", target: 10000, reward: 500, metric: "score" },
    { id: "collector", name: "Collector", desc: "Collect 10 power-ups", target: 10, reward: 200, metric: "powerups" },
    { id: "survivor", name: "Survivor", desc: "Survive 5 minutes in one run", target: 300, reward: 250, metric: "survive" }
  ];
  var ACHIEVEMENTS = [
    { id: "firstkill", name: "First Kill", desc: "Destroy your first enemy", icon: "💥" },
    { id: "wave5", name: "Wave 5", desc: "Reach wave 5", icon: "🌊" },
    { id: "bossslayer", name: "Boss Slayer", desc: "Defeat a boss", icon: "👾" },
    { id: "score10k", name: "10,000 Score", desc: "Reach 10,000 score", icon: "⭐" },
    { id: "sharpshooter", name: "Sharpshooter", desc: "100 total kills", icon: "🎯" },
    { id: "untouchable", name: "Untouchable", desc: "Clear a wave without taking damage", icon: "🛡️" },
    { id: "collector", name: "Collector", desc: "Collect 10 power-ups", icon: "📦" },
    { id: "survivor", name: "Survivor", desc: "Survive 5 minutes in one run", icon: "⏳" }
  ];
  var POWERUPS = {
    rapid: { icon: "🚀", name: "Rapid Fire", dur: 8, color: "#ffd166" },
    damage: { icon: "✖️", name: "Damage ×2", dur: 8, color: "#f87171" },
    repair: { icon: "❤️", name: "Repair +30 HP", color: "#4ade80" },
    shield: { icon: "🛡️", name: "Shield +40", color: "#38bdf8" },
    speed: { icon: "⚡", name: "Speed Boost", dur: 8, color: "#f472b6" }
  };
  var ABILITIES = [
    { id: "emp", name: "EMP", icon: "⚡", cd: 45, desc: "Stun all enemies 3s" },
    { id: "nova", name: "Nova Bomb", icon: "💥", cd: 60, desc: "300 damage to all on screen" },
    { id: "time", name: "Time Dilation", icon: "⏳", cd: 50, desc: "Enemies 50% speed for 5s" }
  ];
  var TUTORIAL = [
    "<p><strong>Welcome, Pilot!</strong> Your ship is at the bottom of the screen. Move with <strong>WASD / Arrow keys</strong> or the left joystick on touch.</p><p>Destroy enemies to earn score and credits.</p>",
    "<p><strong>Shooting:</strong> Your ship fires automatically (<strong>Auto-fire</strong> is on by default). Hold <strong>Space</strong> to shoot if you turn Auto-fire off in Settings.</p><p>Different weapons and upgrades are available in the Hangar and Lab.</p>",
    "<p><strong>Stay alive:</strong> Dodge red enemy bullets. Your <strong>shield</strong> absorbs damage first. You have <strong>3 lives</strong> per run.</p><p>Grab falling power-ups for Rapid Fire, Damage ×2, Repair, Shield and Speed.</p>",
    "<p><strong>Abilities:</strong> Press <strong>1 / 2 / 3</strong> — EMP stuns, Nova Bomb nukes the screen, Time Dilation slows enemies.</p><p>Beat bosses for +500 credits. Good luck, Defender!</p>"
  ];

  /* ================= save ================= */
  function defaultSave() {
    return {
      credits: 0,
      ships: ["interceptor"], ship: "interceptor",
      weapons: ["laser"], weapon: "laser",
      upgrades: { dmg: 0, rate: 0, hp: 0, shield: 0, speed: 0, cd: 0 },
      missions: {}, achievements: [], highscores: [],
      settings: { soundOn: false, soundVol: 70, musicVol: 40, autoFire: true, shake: true, quality: "high", reduced: false },
      campaignStage: 1, bestScore: 0, totalKills: 0,
      tutorialSeen: false, runSnapshot: null,
      stats: { kills: 0, wave: 0, bosses: 0, powerups: 0, score: 0, survive: 0 }
    };
  }
  function loadSave() {
    var s = defaultSave();
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return s;
      var d = JSON.parse(raw);
      if (!d || typeof d !== "object") return s;
      if (typeof d.credits === "number" && d.credits >= 0) s.credits = Math.floor(d.credits);
      if (Array.isArray(d.ships)) s.ships = d.ships.filter(function (x) { return SHIPS[x]; });
      if (SHIPS[d.ship]) s.ship = d.ship;
      if (Array.isArray(d.weapons)) s.weapons = d.weapons.filter(function (x) { return WEAPONS[x]; });
      if (WEAPONS[d.weapon]) s.weapon = d.weapon;
      if (d.upgrades && typeof d.upgrades === "object") UPGRADES.forEach(function (u) {
        var v = d.upgrades[u.id];
        if (typeof v === "number" && v >= 0 && v <= 10) s.upgrades[u.id] = Math.floor(v);
      });
      if (d.missions && typeof d.missions === "object") s.missions = d.missions;
      if (Array.isArray(d.achievements)) s.achievements = d.achievements.filter(function (x) { return ACHIEVEMENTS.some(function (a) { return a.id === x; }); });
      if (Array.isArray(d.highscores)) s.highscores = d.highscores.filter(function (x) { return x && typeof x.score === "number"; }).slice(0, 5);
      if (d.settings && typeof d.settings === "object") {
        ["soundOn", "autoFire", "shake", "reduced"].forEach(function (k) { if (typeof d.settings[k] === "boolean") s.settings[k] = d.settings[k]; });
        ["soundVol", "musicVol"].forEach(function (k) { if (typeof d.settings[k] === "number") s.settings[k] = Math.max(0, Math.min(100, d.settings[k])); });
        if (d.settings.quality === "low" || d.settings.quality === "high") s.settings.quality = d.settings.quality;
      }
      if (typeof d.campaignStage === "number") s.campaignStage = Math.max(1, Math.min(5, Math.floor(d.campaignStage)));
      if (typeof d.bestScore === "number") s.bestScore = Math.max(0, Math.floor(d.bestScore));
      if (typeof d.totalKills === "number") s.totalKills = Math.max(0, Math.floor(d.totalKills));
      if (typeof d.tutorialSeen === "boolean") s.tutorialSeen = d.tutorialSeen;
      if (d.runSnapshot && typeof d.runSnapshot === "object") s.runSnapshot = d.runSnapshot;
      if (d.stats && typeof d.stats === "object") ["kills", "wave", "bosses", "powerups", "score", "survive"].forEach(function (k) {
        if (typeof d.stats[k] === "number") s.stats[k] = Math.max(0, d.stats[k]);
      });
      if (!s.ships.length) s.ships = ["interceptor"];
      if (!s.weapons.length) s.weapons = ["laser"];
      if (!s.ships.includes(s.ship)) s.ship = s.ships[0];
      if (!s.weapons.includes(s.weapon)) s.weapon = s.weapons[0];
    } catch (e) {
      // Corrupt save: discard it and write clean defaults so the bad
      // value does not linger in storage.
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(defaultSave())); } catch (e2) {}
      return defaultSave();
    }
    return s;
  }
  var save = loadSave();
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

  /* ================= dom helpers ================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  /* Toasts: one copy per message, max 3 on screen, auto-fade after
     a while, tap to dismiss. Spamming a recharging ability can no
     longer flood the screen. */
  function dismissToast(t) {
    if (!t || t._gone) return; t._gone = true;
    if (t._timer) clearTimeout(t._timer);
    t.classList.add("toast-out");
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }
  function toast(msg) {
    var box = $("toasts");
    /* Same message already visible? Refresh its timer, don't stack. */
    var kids = box.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].textContent === msg) {
        var old = kids[i];
        if (old._timer) clearTimeout(old._timer);
        old._timer = setTimeout(function () { dismissToast(old); }, 2600);
        return;
      }
    }
    /* Cap: drop the oldest toast. Remove it SYNCHRONOUSLY — dismissToast
       only fades first and removes 300ms later, so calling it in a loop
       on an already-fading toast spins forever (frozen tab). Each pass
       below removes exactly one child, so the loop always terminates. */
    while (box.children.length >= 3) {
      var old = box.children[0];
      if (old._timer) clearTimeout(old._timer);
      if (old.parentNode) old.parentNode.removeChild(old);
    }
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    t.addEventListener("click", function () { dismissToast(t); });
    box.appendChild(t);
    t._timer = setTimeout(function () { dismissToast(t); }, 2600);
  }
  var bannerTimer = null;
  function banner(text, warn) {
    var b = $("banner");
    b.textContent = text;
    b.className = "banner" + (warn ? " warn" : "");
    b.classList.remove("hidden");
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.classList.add("hidden"); }, 2200);
  }

  /* ================= audio (synth, OFF by default) ================= */
  var AC = null, masterGain = null, musicGain = null, musicStep = 0, musicTimer = 0;
  function ensureAudio() {
    if (AC) { if (AC.state === "suspended") { try { AC.resume(); } catch (e) {} } return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = AC.createGain();
      masterGain.gain.value = save.settings.soundOn ? save.settings.soundVol / 100 : 0;
      masterGain.connect(AC.destination);
      musicGain = AC.createGain();
      musicGain.gain.value = (save.settings.soundOn ? save.settings.musicVol / 100 : 0) * 0.35;
      musicGain.connect(masterGain);
    } catch (e) { AC = null; }
  }
  function applyAudioSettings() {
    if (!AC || !masterGain) return;
    try {
      masterGain.gain.value = save.settings.soundOn ? save.settings.soundVol / 100 : 0;
      musicGain.gain.value = (save.settings.soundOn ? save.settings.musicVol / 100 : 0) * 0.35;
    } catch (e) {}
  }
  function tone(freq, dur, type, vol, slideTo, dest) {
    if (!AC || !save.settings.soundOn) return;
    try {
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, AC.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), AC.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.1, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
      o.connect(g); g.connect(dest || masterGain);
      o.start(); o.stop(AC.currentTime + dur + 0.02);
    } catch (e) {}
  }
  function noiseBurst(dur, vol) {
    if (!AC || !save.settings.soundOn) return;
    try {
      var len = Math.floor(AC.sampleRate * dur);
      var buf = AC.createBuffer(1, len, AC.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = AC.createBufferSource(); src.buffer = buf;
      var g = AC.createGain(); g.gain.value = vol || 0.2;
      src.connect(g); g.connect(masterGain);
      src.start();
    } catch (e) {}
  }
  var SFX = {
    shoot: function () { tone(880, 0.08, "square", 0.05, 220); },
    hit: function () { tone(200, 0.05, "square", 0.05); },
    explosion: function (big) { noiseBurst(big ? 0.5 : 0.25, big ? 0.3 : 0.15); tone(120, 0.3, "sawtooth", 0.1, 40); },
    pickup: function () { tone(660, 0.08, "sine", 0.12); setTimeout(function () { tone(990, 0.1, "sine", 0.12); }, 70); },
    powerup: function () { tone(520, 0.1, "sine", 0.12); setTimeout(function () { tone(780, 0.12, "sine", 0.12); }, 80); },
    boss: function () { tone(80, 0.6, "sawtooth", 0.18, 40); tone(60, 0.8, "triangle", 0.12, 30); },
    ability: function () { tone(440, 0.2, "sine", 0.14, 880); },
    hurt: function () { tone(160, 0.18, "sawtooth", 0.14, 60); }
  };
  function musicTick(dt) {
    if (!AC || !save.settings.soundOn) return;
    musicTimer -= dt;
    if (musicTimer > 0) return;
    musicTimer = 0.42;
    var bass = [55, 55, 65.41, 49, 55, 55, 73.42, 58.27];
    var note = bass[musicStep % bass.length];
    tone(note, 0.38, "triangle", 0.5, null, musicGain);
    if (musicStep % 4 === 0) tone(note * 4, 0.3, "sine", 0.18, null, musicGain);
    musicStep++;
  }
  document.addEventListener("pointerdown", ensureAudio, { passive: true });
  document.addEventListener("keydown", ensureAudio);

  /* ================= canvas + resize ================= */
  var canvas = $("game"), ctx = canvas.getContext("2d");
  var DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    var shell = $("game-shell");
    shell.style.width = Math.floor(W * scale) + "px";
    shell.style.height = Math.floor(H * scale) + "px";
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  /* ================= screens ================= */
  var state = "menu"; // menu | playing | paused | stageclear | gameover | victory
  var prevScreen = "menu";
  var screenIds = ["menu", "screen-play", "screen-hangar", "screen-lab", "screen-missions", "screen-achievements", "screen-settings", "screen-howto", "screen-pause", "screen-stageclear", "screen-gameover", "screen-victory", "tutorial-overlay"];
  function showScreen(id) {
    if (id !== "screen-settings" && id !== "screen-pause") prevScreen = id;
    screenIds.forEach(function (s) { $(s).classList.add("hidden"); });
    if (id) $(id).classList.remove("hidden");
    if (id === "menu") { renderHighscores($("highscores")); $("menu-credits").textContent = save.credits; $("btn-continue").classList.toggle("hidden", !save.runSnapshot); }
    if (id === "screen-hangar") renderHangar();
    if (id === "screen-lab") renderLab();
    if (id === "screen-missions") renderMissions();
    if (id === "screen-achievements") renderAchievements();
    if (id === "screen-settings") renderSettings();
  }
  function goBack() { showScreen(prevScreen === "screen-settings" ? "menu" : (prevScreen || "menu")); }

  /* ================= input ================= */
  var keys = {};
  var touch = { active: false, dx: 0, dy: 0, fire: false, joyId: null };
  var isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  window.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    keys[k] = true;
    if (k === "p" || k === "escape") { if (state === "playing") pauseGame(); else if (state === "paused") resumeGame(); }
    if (k === "m") toggleSound();
    if (state === "playing" && ["1", "2", "3"].includes(k)) useAbility(Number(k) - 1);
  });
  window.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });
  document.addEventListener("visibilitychange", function () { if (document.hidden && state === "playing") pauseGame(); });
  /* Touch fallback: on touch-capable devices that don't report a coarse
     pointer, show the touch controls on first touch during a run. */
  document.addEventListener("touchstart", function () {
    if (!isTouch) { isTouch = true; if (state === "playing") $("touch-controls").classList.remove("hidden"); }
  }, { passive: true });

  var joy = $("joystick"), knob = $("joy-knob");
  function joyMove(e) {
    var r = joy.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
    var len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    touch.dx = dx; touch.dy = dy;
    knob.style.transform = "translate(" + (dx * 28) + "px," + (dy * 28) + "px)";
  }
  joy.addEventListener("pointerdown", function (e) { touch.joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
  joy.addEventListener("pointermove", function (e) { if (touch.joyId === e.pointerId) joyMove(e); });
  function joyEnd(e) { if (touch.joyId === e.pointerId) { touch.joyId = null; touch.dx = 0; touch.dy = 0; knob.style.transform = ""; } }
  joy.addEventListener("pointerup", joyEnd);
  joy.addEventListener("pointercancel", joyEnd);
  document.querySelectorAll(".ab").forEach(function (b) {
    b.addEventListener("click", function () { useAbility(Number(b.getAttribute("data-ab"))); });
  });
  $("pause-btn").addEventListener("click", function () { if (state === "playing") pauseGame(); });
  $("sound-toggle").addEventListener("click", toggleSound);
  function toggleSound() {
    save.settings.soundOn = !save.settings.soundOn;
    persist(); applyAudioSettings();
    $("sound-toggle").textContent = save.settings.soundOn ? "🔊" : "🔇";
    if (save.settings.soundOn) ensureAudio();
  }
  $("sound-toggle").textContent = save.settings.soundOn ? "🔊" : "🔇";

  /* ================= helpers ================= */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
  function nearestEnemy(x, y, maxD) {
    var best = null, bd = maxD;
    G.enemies.forEach(function (e) { var d = dist(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } });
    if (G.boss) { var d = dist(x, y, G.boss.x, G.boss.y); if (d < bd) best = G.boss; }
    return best;
  }

  /* ================= run state ================= */
  var G = null;
  var enemyId = 0;

  function computeStats() {
    var ship = SHIPS[save.ship], u = save.upgrades;
    return {
      maxHp: ship.hp + 20 * u.hp,
      maxShield: ship.shield + 15 * u.shield,
      speed: ship.speed * (1 + 0.05 * u.speed),
      dmgMul: ship.dmg * (1 + 0.10 * u.dmg),
      fireMul: 1 + 0.08 * u.rate,
      /* Floor 0.2 so all 10 Cooldown levels give real progression
         (level 10 = 20% of base recharge; charges still gate uses). */
      cdMul: Math.max(0.2, 1 - 0.08 * u.cd),
      charges: ship.charges
    };
  }

  function startRun(mode, snapshot) {
    var snap = snapshot || null;
    G = {
      mode: mode, stage: 1, wave: 0, score: 0, runCredits: 0, lives: 3,
      time: 0, kills: 0, bosses: 0, powerupsGot: 0, bossIndex: 0,
      bullets: [], ebullets: [], enemies: [], particles: [], powerups: [],
      spawnQueue: [], spawnTimer: 0, interTimer: 0, waveState: "intro",
      boss: null, combo: 0, comboTimer: 0, damageThisWave: 0,
      empTimer: 0, timeTimer: 0, shake: 0, flash: 0,
      pu: { rapid: 0, damage: 0, speed: 0 },
      charges: [], recharge: [0, 0, 0], recorded: false, over: false
    };
    var st = computeStats();
    G.player = { x: W / 2, y: H - 90, hp: st.maxHp, maxHp: st.maxHp, shield: st.maxShield, maxShield: st.maxShield,
      speed: st.speed, dmgMul: st.dmgMul, fireMul: st.fireMul, cdMul: st.cdMul, radius: 14,
      invuln: 0, fireCd: 0, maxCharges: st.charges };
    G.charges = [st.charges, st.charges, st.charges];
    if (snap) {
      G.stage = snap.stage || 1; G.score = snap.score || 0; G.runCredits = snap.runCredits || 0;
      G.lives = snap.lives || 3; G.time = snap.time || 0; G.wave = snap.wave || 0;
      if (snap.boss) startBoss(snap.boss.kind, snap.boss.param);
      else proceed();
    } else {
      save.runSnapshot = null; persist();
      if (mode === "bossrush") startBoss("rush", 0);
      else proceed();
    }
    state = "playing";
    showScreen(null);
    $("hud").classList.remove("hidden");
    if (isTouch) $("touch-controls").classList.remove("hidden");
    updateHUD(true);
  }

  function snapshotRun(bossInfo) {
    var wave = bossInfo ? (bossInfo.kind === "campaign" ? G.wave : G.wave - 1) : G.wave - 1;
    save.runSnapshot = { mode: G.mode, stage: G.stage, wave: Math.max(0, wave),
      score: G.score, runCredits: G.runCredits, lives: G.lives, time: G.time, boss: bossInfo || null };
    persist();
  }

  function proceed() {
    var next = G.wave + 1;
    if (G.mode === "bossrush") { startBoss("rush", G.bossIndex); return; }
    if (G.mode === "campaign") {
      if (G.wave >= G.stage * 3) { startBoss("campaign", G.stage); return; }
      startWave(next); return;
    }
    if (G.mode === "endless" || G.mode === "timeattack") {
      if (next % 5 === 0) { startBoss("endless", Math.floor(next / 5)); return; }
      startWave(next); return;
    }
  }

  function startWave(n) {
    G.wave = n; G.waveState = "spawning"; G.damageThisWave = 0;
    var count = 6 + 2 * n;
    G.spawnQueue = [];
    for (var i = 0; i < count; i++) {
      var r = Math.random(), type = "drone";
      if (n >= 4 && r < 0.18) type = "sniper";
      else if (n >= 3 && r < 0.42) type = "tank";
      else if (n >= 2 && r < 0.65) type = "weaver";
      G.spawnQueue.push(type);
    }
    G.spawnTimer = 0;
    banner("WAVE " + n);
    if (n > save.stats.wave) { save.stats.wave = n; persist(); }
    if (n >= 5) unlockAchievement("wave5");
    snapshotRun(null);
  }

  function startBoss(kind, param) {
    var idx, cycle = 0;
    if (kind === "campaign") {
      // Stages 1-3: Dreadnought, Hive Queen, Leviathan. Stage 4: Dreadnought (harder).
      // Stage 5 finale is always the Void Leviathan (harder).
      if (param === 5) { idx = 2; cycle = 1; }
      else { idx = (param - 1) % 3; cycle = Math.floor((param - 1) / 3); }
    }
    else if (kind === "endless") { idx = (param - 1) % 3; cycle = param - 1; G.wave = param * 5; }
    else { idx = param % 3; cycle = Math.floor(param / 3); G.wave = param + 1; G.bossIndex = param; /* keep the rush chain in sync (Continue/resume) */ }
    var base = BOSSES[idx];
    var hp = Math.round(base.hp * (1 + 0.5 * cycle));
    G.boss = { kind: kind, param: param, type: base.id, name: base.name, hp: hp, maxHp: hp,
      x: W / 2, y: 110, age: 0, fireTimer: 2, radialTimer: 2.5, spawnTimer: 3, spiralAngle: 0, spiralTimer: 0,
      radius: 46, color: base.color };
    G.waveState = "boss";
    banner("⚠ " + base.name + " APPROACHES ⚠", true);
    SFX.boss();
    if (save.settings.shake && !save.settings.reduced) G.shake = 10;
    $("boss-bar-wrap").classList.remove("hidden");
    $("boss-name").textContent = base.name;
    snapshotRun({ kind: kind, param: param });
  }

  function waveClear() {
    var bonus = 25 * Math.max(1, G.wave);
    G.score += bonus;
    toast("Wave clear! +" + bonus + " bonus");
    if (G.damageThisWave === 0) unlockAchievement("untouchable");
    G.waveState = "inter"; G.interTimer = 1.4;
  }

  function stageClear() {
    state = "stageclear";
    save.campaignStage = Math.max(save.campaignStage, G.stage + 1);
    $("sc-title").textContent = "STAGE " + G.stage + " CLEAR!";
    $("sc-stats").innerHTML = "Score: <strong>" + G.score + "</strong><br>Credits earned: <strong>" + G.runCredits + "</strong><br>Stage: <strong>" + esc(STAGES[G.stage - 1]) + "</strong>";
    save.runSnapshot = { mode: "campaign", stage: G.stage + 1, wave: G.stage * 3, score: G.score, runCredits: G.runCredits, lives: G.lives, time: G.time, boss: null };
    persist();
    showScreen("screen-stageclear");
  }
  function nextStage() {
    G.stage++;
    state = "playing";
    showScreen(null);
    proceed();
  }

  function finishRun() {
    if (G.recorded) return; G.recorded = true;
    save.runSnapshot = null;
    if (G.score > save.bestScore) save.bestScore = G.score;
    /* Hub profile reads this key to show the player's best score. */
    try {
      var prev = Number(localStorage.getItem("galaxyDefenderBest") || 0);
      if (G.score > prev) localStorage.setItem("galaxyDefenderBest", String(G.score));
    } catch (e) {}
    if (G.time > save.stats.survive) save.stats.survive = Math.floor(G.time);
    if (G.score > 0) {
      save.highscores.push({ name: "Pilot", score: G.score, mode: G.mode, date: new Date().toISOString().slice(0, 10) });
      save.highscores.sort(function (a, b) { return b.score - a.score; });
      save.highscores = save.highscores.slice(0, 5);
    }
    persist();
  }
  function endRun(reason) {
    state = "gameover"; G.over = true;
    finishRun();
    $("go-title").textContent = reason === "timeup" ? "TIME UP!" : "GAME OVER";
    $("go-score").textContent = G.score;
    $("go-credits").textContent = G.runCredits;
    $("go-best").textContent = save.bestScore;
    renderHighscores($("go-highscores"));
    showScreen("screen-gameover");
  }
  function victory() {
    state = "victory"; G.over = true;
    finishRun();
    $("vic-score").textContent = G.score;
    $("vic-credits").textContent = G.runCredits;
    showScreen("screen-victory");
  }
  function pauseGame() { if (state !== "playing") return; state = "paused"; showScreen("screen-pause"); }
  function resumeGame() { if (state !== "paused") return; state = "playing"; showScreen(null); }
  function quitToMenu() {
    G = null; state = "menu";
    $("hud").classList.add("hidden"); $("touch-controls").classList.add("hidden");
    $("boss-bar-wrap").classList.add("hidden");
    showScreen("menu");
  }
  function restartRun() { if (G) startRun(G.mode); }

  /* ================= combat ================= */
  function spawnEnemy(type, x, y) {
    var e = ENEMIES[type];
    var hpMul = 1 + 0.05 * Math.max(0, G.wave - 1);
    var spdMul = Math.min(2, 1 + 0.05 * Math.max(0, G.wave - 1));
    var ex = x !== undefined ? x : 30 + Math.random() * (W - 60);
    G.enemies.push({ id: ++enemyId, type: type, x: ex, y: y !== undefined ? y : -30, baseX: ex,
      hp: Math.round(e.hp * hpMul), maxHp: Math.round(e.hp * hpMul), speed: e.speed * spdMul,
      radius: e.radius, age: 0, phase: Math.random() * Math.PI * 2,
      shootTimer: 1 + Math.random(), flash: 0 });
  }
  function enemyShoot(e, speed) {
    var p = G.player;
    var a = Math.atan2(p.y - e.y, p.x - e.x);
    G.ebullets.push({ x: e.x, y: e.y + 10, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5, dmg: 10 });
    SFX.shoot();
  }
  function radialBurst(x, y, n, speed) {
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      G.ebullets.push({ x: x, y: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5, dmg: 10 });
    }
  }
  function aimedSpread(x, y, n) {
    var p = G.player;
    var base = Math.atan2(p.y - y, p.x - x);
    for (var i = 0; i < n; i++) {
      var a = base + (i - (n - 1) / 2) * 0.18;
      G.ebullets.push({ x: x, y: y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 5, dmg: 10 });
    }
  }
  function shoot() {
    var p = G.player, w = WEAPONS[save.weapon];
    var dmg = w.dmg * p.dmgMul * (G.pu.damage > 0 ? 2 : 1);
    var bx = p.x, by = p.y - 16;
    if (save.weapon === "spread") {
      [-0.22, 0, 0.22].forEach(function (a) {
        G.bullets.push({ x: bx, y: by, vx: Math.sin(a) * 520, vy: -Math.cos(a) * 520, dmg: dmg, r: 4, pierce: false, homing: false });
      });
    } else if (save.weapon === "plasma") {
      G.bullets.push({ x: bx, y: by, vx: 0, vy: -460, dmg: dmg, r: 6, pierce: true, homing: false, hitIds: [] });
    } else if (save.weapon === "homing") {
      G.bullets.push({ x: bx, y: by, vx: 0, vy: -420, dmg: dmg, r: 5, pierce: false, homing: true });
    } else {
      G.bullets.push({ x: bx, y: by, vx: 0, vy: -560, dmg: dmg, r: 4, pierce: false, homing: false });
    }
    SFX.shoot();
  }
  function registerKill(pts) {
    G.kills++; save.totalKills++;
    if (G.comboTimer > 0) G.combo++; else G.combo = 1;
    G.comboTimer = 3;
    var mult = Math.min(5, 1 + 0.25 * (G.combo - 1));
    G.score += Math.round(pts * mult);
    G.runCredits += 5; save.credits += 5;
    save.stats.kills = save.totalKills;
    if (G.score > save.stats.score) save.stats.score = G.score;
    if (G.kills === 1) unlockAchievement("firstkill");
    if (save.totalKills >= 100) unlockAchievement("sharpshooter");
    if (G.score >= 10000) unlockAchievement("score10k");
    persist();
  }
  function damageEnemy(e, dmg, idx) {
    e.hp -= dmg; e.flash = 0.08;
    if (e.hp <= 0) {
      var pts = ENEMIES[e.type].pts;
      G.enemies.splice(idx, 1);
      explode(e.x, e.y, ENEMIES[e.type].color, 14);
      SFX.explosion(false);
      registerKill(pts);
      maybeDrop(e.x, e.y);
    }
  }
  function damageBoss(dmg) {
    var b = G.boss; if (!b) return;
    b.hp -= dmg;
    if (b.hp <= 0) killBoss();
  }
  function killBoss() {
    var b = G.boss; G.boss = null;
    explode(b.x, b.y, b.color, 30);
    SFX.explosion(true);
    if (save.settings.shake && !save.settings.reduced) G.shake = 14;
    G.score += 500; G.runCredits += 500; save.credits += 500;
    G.bosses++; save.stats.bosses++;
    $("boss-bar-wrap").classList.add("hidden");
    toast("Boss defeated! +500 credits");
    unlockAchievement("bossslayer");
    persist();
    if (G.mode === "campaign") {
      if (G.stage >= 5) victory();
      else stageClear();
    } else {
      /* Boss Rush: the chain must advance — defeating a boss spawns
         the NEXT boss (Dreadnought -> Hive Queen -> Leviathan, then
         the loop repeats with +50% HP per cycle). */
      if (G.mode === "bossrush") { G.bossIndex++; toast("Boss down! Boss " + (G.bossIndex + 1) + " incoming…"); }
      G.waveState = "inter"; G.interTimer = G.mode === "bossrush" ? 3 : 2;
    }
  }
  function damagePlayer(amount) {
    var p = G.player;
    if (p.invuln > 0 || G.over) return;
    G.damageThisWave += amount;
    var remaining = amount;
    if (p.shield > 0) { var absorbed = Math.min(p.shield, remaining); p.shield -= absorbed; remaining -= absorbed; }
    if (remaining > 0) p.hp -= remaining;
    G.flash = 0.25;
    if (save.settings.shake && !save.settings.reduced) G.shake = Math.min(12, G.shake + 6);
    SFX.hurt();
    if (p.hp <= 0) loseLife();
  }
  function loseLife() {
    G.lives--;
    explode(G.player.x, G.player.y, "#22d3ee", 24);
    SFX.explosion(true);
    if (G.lives <= 0) { endRun("gameover"); return; }
    var p = G.player;
    p.hp = p.maxHp; p.shield = p.maxShield;
    p.x = W / 2; p.y = H - 90; p.invuln = 2;
    G.ebullets = [];
    banner("SHIP DESTROYED — " + G.lives + (G.lives === 1 ? " LIFE" : " LIVES") + " LEFT", true);
  }
  function useAbility(i) {
    if (state !== "playing" || !G) return;
    if (G.charges[i] <= 0) { toast(ABILITIES[i].name + " recharging…"); return; }
    G.charges[i]--;
    if (G.charges[i] < G.player.maxCharges && G.recharge[i] <= 0) G.recharge[i] = ABILITIES[i].cd * G.player.cdMul;
    SFX.ability();
    if (i === 0) { G.empTimer = 3; toast("⚡ EMP! Enemies stunned"); }
    else if (i === 1) {
      G.shake = 16; G.flash = 0.3;
      for (var j = G.enemies.length - 1; j >= 0; j--) damageEnemy(G.enemies[j], 300, j);
      if (G.boss) damageBoss(300);
      explode(W / 2, H / 2, "#ffd166", 30);
      toast("💥 NOVA BOMB!");
    }
    else if (i === 2) { G.timeTimer = 5; toast("⏳ Time Dilation!"); }
  }
  function maybeDrop(x, y) {
    if (Math.random() < 0.12 && G.powerups.length < 8) {
      var keys = Object.keys(POWERUPS);
      var type = keys[Math.floor(Math.random() * keys.length)];
      G.powerups.push({ x: x, y: y, type: type, vy: 60, age: 0 });
    }
  }
  function applyPowerup(type) {
    var p = G.player;
    SFX.powerup();
    if (type === "repair") { p.hp = Math.min(p.maxHp, p.hp + 30); toast("❤️ +30 HP"); }
    else if (type === "shield") { p.shield = Math.min(p.maxShield, p.shield + 40); toast("🛡️ +40 Shield"); }
    else { G.pu[type] = POWERUPS[type].dur; toast(POWERUPS[type].icon + " " + POWERUPS[type].name + "!"); }
    G.powerupsGot++; save.stats.powerups++;
    if (save.stats.powerups >= 10) unlockAchievement("collector");
    persist();
  }
  function explode(x, y, color, n) {
    var cap = save.settings.quality === "low" ? 60 : 150;
    var count = save.settings.reduced ? Math.floor(n / 2) : n;
    for (var i = 0; i < count; i++) {
      if (G.particles.length >= cap) break;
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 160;
      G.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.5, maxLife: 0.9, color: color, size: 2 + Math.random() * 3 });
    }
  }
  function unlockAchievement(id) {
    if (save.achievements.includes(id)) return;
    save.achievements.push(id);
    var a = ACHIEVEMENTS.find(function (x) { return x.id === id; });
    if (a) toast("🏆 Achievement: " + a.name);
    persist();
  }

  /* ================= update ================= */
  function update(dt) {
    G.time += dt;
    musicTick(dt);
    if (G.empTimer > 0) G.empTimer -= dt;
    if (G.timeTimer > 0) G.timeTimer -= dt;
    if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }
    for (var i = 0; i < 3; i++) {
      if (G.charges[i] < G.player.maxCharges) {
        G.recharge[i] -= dt;
        if (G.recharge[i] <= 0) {
          G.charges[i]++;
          G.recharge[i] = G.charges[i] < G.player.maxCharges ? ABILITIES[i].cd * G.player.cdMul : 0;
        }
      }
    }
    ["rapid", "damage", "speed"].forEach(function (k) { if (G.pu[k] > 0) G.pu[k] -= dt; });
    if (G.mode === "timeattack" && G.time >= 180) { endRun("timeup"); return; }
    if (G.time >= 300) unlockAchievement("survivor");
    if (G.player.invuln > 0) G.player.invuln -= dt;
    updatePlayer(dt);
    updateSpawning(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePowerups(dt);
    updateParticles(dt);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
    if (G.flash > 0) G.flash -= dt;
  }
  function updatePlayer(dt) {
    var p = G.player;
    var mx = 0, my = 0;
    if (keys["arrowleft"] || keys["a"]) mx -= 1;
    if (keys["arrowright"] || keys["d"]) mx += 1;
    if (keys["arrowup"] || keys["w"]) my -= 1;
    if (keys["arrowdown"] || keys["s"]) my += 1;
    if (touch.dx || touch.dy) { mx = touch.dx; my = touch.dy; }
    var len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }
    var spd = p.speed * (G.pu.speed > 0 ? 1.5 : 1);
    p.x = clamp(p.x + mx * spd * dt, 20, W - 20);
    p.y = clamp(p.y + my * spd * dt, 60, H - 20);
    p.fireCd -= dt;
    var wantFire = save.settings.autoFire || keys[" "] || touch.fire;
    if (wantFire && p.fireCd <= 0) {
      shoot();
      p.fireCd = 1 / (WEAPONS[save.weapon].rate * p.fireMul * (G.pu.rapid > 0 ? 1.8 : 1));
    }
  }
  function updateSpawning(dt) {
    if (G.waveState === "spawning") {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        if (G.spawnQueue.length) {
          if (G.enemies.length < 40) { spawnEnemy(G.spawnQueue.shift()); G.spawnTimer = 0.55; }
          else G.spawnTimer = 0.3;
        } else G.waveState = "combat";
      }
    } else if (G.waveState === "combat") {
      if (G.enemies.length === 0 && !G.boss) waveClear();
    } else if (G.waveState === "inter") {
      G.interTimer -= dt;
      if (G.interTimer <= 0) proceed();
    }
  }
  function updateEnemies(dt) {
    var speedMul = (G.timeTimer > 0 ? 0.5 : 1) * (G.empTimer > 0 ? 0 : 1);
    for (var i = G.enemies.length - 1; i >= 0; i--) {
      var e = G.enemies[i];
      e.age += dt;
      if (e.flash > 0) e.flash -= dt;
      if (speedMul > 0) {
        if (e.type === "drone") e.y += e.speed * speedMul * dt;
        else if (e.type === "weaver") { e.y += e.speed * speedMul * dt; e.x = e.baseX + Math.sin(e.age * 3 + e.phase) * 50; }
        else if (e.type === "tank") { if (e.y < 120) e.y += e.speed * speedMul * dt; e.shootTimer -= dt; if (e.shootTimer <= 0) { enemyShoot(e, 180); e.shootTimer = 2; } }
        else if (e.type === "sniper") { if (e.y < 90) e.y += e.speed * speedMul * dt; e.shootTimer -= dt; if (e.shootTimer <= 0) { enemyShoot(e, 300); e.shootTimer = 1.2; } }
      }
      if (e.y > H + 50 || e.y < -80) G.enemies.splice(i, 1);
    }
    var b = G.boss;
    if (b && G.empTimer <= 0) {
      b.age += dt;
      b.x = W / 2 + Math.sin(b.age * 0.5) * 120;
      b.fireTimer -= dt; b.radialTimer -= dt;
      if (b.type === "dreadnought") {
        if (b.radialTimer <= 0) { radialBurst(b.x, b.y + 30, 8, 160); b.radialTimer = 2.5; }
        if (b.fireTimer <= 0) { aimedSpread(b.x, b.y + 30, 3); b.fireTimer = 3.5; }
      } else if (b.type === "hive") {
        if (b.radialTimer <= 0) { radialBurst(b.x, b.y + 30, 6, 150); b.radialTimer = 3; }
        b.spawnTimer -= dt;
        if (b.spawnTimer <= 0) { if (G.enemies.length < 40) spawnEnemy("drone", b.x + (Math.random() * 60 - 30), b.y + 40); b.spawnTimer = 3; }
      } else if (b.type === "leviathan") {
        b.spiralAngle += dt * 2.4;
        b.spiralTimer -= dt;
        if (b.spiralTimer <= 0) {
          G.ebullets.push({ x: b.x, y: b.y + 20, vx: Math.cos(b.spiralAngle) * 170, vy: Math.sin(b.spiralAngle) * 170 + 40, r: 5, dmg: 10 });
          G.ebullets.push({ x: b.x, y: b.y + 20, vx: Math.cos(b.spiralAngle + Math.PI) * 170, vy: Math.sin(b.spiralAngle + Math.PI) * 170 + 40, r: 5, dmg: 10 });
          b.spiralTimer = 0.18;
        }
        if (b.fireTimer <= 0) { aimedSpread(b.x, b.y + 30, 3); b.fireTimer = 2; }
      }
    }
  }
  function updateBullets(dt) {
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var b = G.bullets[i];
      if (b.homing) {
        var tgt = nearestEnemy(b.x, b.y, 320);
        if (tgt) {
          var a = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          var cur = Math.atan2(b.vy, b.vx);
          var diff = Math.atan2(Math.sin(a - cur), Math.cos(a - cur));
          var na = cur + clamp(diff, -3.5 * dt, 3.5 * dt);
          var sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) { G.bullets.splice(i, 1); continue; }
      var consumed = false;
      for (var j = G.enemies.length - 1; j >= 0; j--) {
        var e = G.enemies[j];
        if (dist(b.x, b.y, e.x, e.y) < b.r + e.radius) {
          if (b.pierce && b.hitIds.indexOf(e.id) !== -1) continue;
          if (b.pierce) b.hitIds.push(e.id);
          damageEnemy(e, b.dmg, j);
          SFX.hit();
          if (!b.pierce) consumed = true;
          break;
        }
      }
      if (consumed) { G.bullets.splice(i, 1); continue; }
      if (G.boss) {
        var bo = G.boss;
        if (dist(b.x, b.y, bo.x, bo.y) < b.r + bo.radius) {
          damageBoss(b.dmg);
          if (!b.pierce) { G.bullets.splice(i, 1); continue; }
        }
      }
    }
    for (var k = G.ebullets.length - 1; k >= 0; k--) {
      var eb = G.ebullets[k];
      eb.x += eb.vx * dt; eb.y += eb.vy * dt;
      if (eb.y < -20 || eb.y > H + 20 || eb.x < -20 || eb.x > W + 20) { G.ebullets.splice(k, 1); continue; }
      var p = G.player;
      if (dist(eb.x, eb.y, p.x, p.y) < eb.r + p.radius) {
        G.ebullets.splice(k, 1);
        damagePlayer(eb.dmg);
      }
    }
    for (var m = G.enemies.length - 1; m >= 0; m--) {
      var en = G.enemies[m];
      if (dist(en.x, en.y, G.player.x, G.player.y) < en.radius + G.player.radius - 2) {
        explode(en.x, en.y, ENEMIES[en.type].color, 10);
        G.enemies.splice(m, 1);
        damagePlayer(25);
      }
    }
  }
  function updatePowerups(dt) {
    var p = G.player;
    for (var i = G.powerups.length - 1; i >= 0; i--) {
      var pu = G.powerups[i];
      pu.age += dt; pu.y += pu.vy * dt;
      var d = dist(pu.x, pu.y, p.x, p.y);
      if (d < 90) { pu.x += (p.x - pu.x) * 4 * dt; pu.y += (p.y - pu.y) * 4 * dt; }
      if (d < 28) { G.powerups.splice(i, 1); applyPowerup(pu.type); continue; }
      if (pu.y > H + 30) G.powerups.splice(i, 1);
    }
  }
  function updateParticles(dt) {
    for (var i = G.particles.length - 1; i >= 0; i--) {
      var pt = G.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { G.particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.98; pt.vy *= 0.98;
    }
  }

  /* ================= render ================= */
  var stars = [];
  for (var s = 0; s < 100; s++) stars.push({ x: Math.random() * W, y: Math.random() * H, layer: Math.random() < 0.5 ? 1 : 2, size: 0.6 + Math.random() * 1.4 });
  var nebulae = [
    { x: 90, y: 160, r: 150, c: "124,58,237" },
    { x: 380, y: 420, r: 170, c: "34,211,238" },
    { x: 200, y: 560, r: 140, c: "244,114,182" }
  ];
  function updateStars(dt) {
    var n = save.settings.quality === "low" ? 40 : 100;
    for (var i = 0; i < n; i++) {
      var st = stars[i];
      st.y += (st.layer === 1 ? 24 : 60) * dt;
      if (st.y > H) { st.y = -2; st.x = Math.random() * W; }
    }
  }
  function render() {
    ctx.fillStyle = "#05060f"; ctx.fillRect(0, 0, W, H);
    nebulae.forEach(function (nb) {
      if (save.settings.quality === "low") {
        ctx.fillStyle = "rgba(" + nb.c + ",0.10)";
        ctx.beginPath(); ctx.arc(nb.x, nb.y, nb.r, 0, Math.PI * 2); ctx.fill();
      } else {
        var g = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
        g.addColorStop(0, "rgba(" + nb.c + ",0.20)");
        g.addColorStop(1, "rgba(" + nb.c + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(nb.x, nb.y, nb.r, 0, Math.PI * 2); ctx.fill();
      }
    });
    var n = save.settings.quality === "low" ? 40 : 100;
    for (var i = 0; i < n; i++) {
      var st = stars[i];
      ctx.fillStyle = st.layer === 1 ? "rgba(150,180,220,0.6)" : "rgba(255,255,255,0.9)";
      ctx.fillRect(st.x, st.y, st.size, st.size);
    }
    if (!G) return;
    ctx.save();
    if (G.shake > 0 && !save.settings.reduced) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
    drawPowerups(); drawEnemies(); drawBoss(); drawPlayer(); drawBullets(); drawParticles();
    ctx.restore();
    if (G.flash > 0) { ctx.fillStyle = "rgba(239,68,68," + Math.min(0.35, G.flash * 1.2).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H); }
  }
  function drawPlayer() {
    var p = G.player;
    if (p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0) return;
    var shipColor = SHIPS[save.ship].color;
    // engine flame
    var fl = 10 + Math.random() * 8;
    ctx.fillStyle = "#f97316";
    ctx.beginPath(); ctx.moveTo(p.x - 5, p.y + 12); ctx.lineTo(p.x + 5, p.y + 12); ctx.lineTo(p.x, p.y + 12 + fl); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shipColor;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 16); ctx.lineTo(p.x + 11, p.y + 12); ctx.lineTo(p.x - 11, p.y + 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x + 4, p.y + 6); ctx.lineTo(p.x - 4, p.y + 6); ctx.closePath(); ctx.fill();
    /* Wing tips + canopy so the ship reads as a fighter, not a triangle. */
    ctx.fillStyle = shipColor;
    ctx.beginPath(); ctx.moveTo(p.x - 11, p.y + 12); ctx.lineTo(p.x - 18, p.y + 17); ctx.lineTo(p.x - 7, p.y + 16); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(p.x + 11, p.y + 12); ctx.lineTo(p.x + 18, p.y + 17); ctx.lineTo(p.x + 7, p.y + 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(p.x, p.y - 3, 2.5, 0, Math.PI * 2); ctx.fill();
    if (p.shield > 0) {
      ctx.strokeStyle = "rgba(56,189,248,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 24 + Math.sin(G.time * 4) * 2, 0, Math.PI * 2); ctx.stroke();
    }
  }
  function drawEnemies() {
    G.enemies.forEach(function (e) {
      var col = e.flash > 0 ? "#ffffff" : ENEMIES[e.type].color;
      if (G.empTimer > 0) col = "#fde68a";
      ctx.fillStyle = col;
      if (e.type === "drone") {
        ctx.beginPath(); ctx.moveTo(e.x, e.y + 14); ctx.lineTo(e.x + 12, e.y - 10); ctx.lineTo(e.x - 12, e.y - 10); ctx.closePath(); ctx.fill();
      } else if (e.type === "weaver") {
        ctx.beginPath(); ctx.moveTo(e.x, e.y - 14); ctx.lineTo(e.x + 13, e.y); ctx.lineTo(e.x, e.y + 14); ctx.lineTo(e.x - 13, e.y); ctx.closePath(); ctx.fill();
      } else if (e.type === "tank") {
        ctx.beginPath();
        for (var i = 0; i < 6; i++) { var a = (i / 6) * Math.PI * 2; var px = e.x + Math.cos(a) * 20, py = e.y + Math.sin(a) * 20; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(e.x, e.y + 12); ctx.lineTo(e.x + 10, e.y - 8); ctx.lineTo(e.x - 10, e.y - 8); ctx.closePath(); ctx.fill();
      }
      if (e.hp < e.maxHp) {
        ctx.fillStyle = "rgba(10,16,34,0.8)"; ctx.fillRect(e.x - 13, e.y - e.radius - 9, 26, 4);
        ctx.fillStyle = "#4ade80"; ctx.fillRect(e.x - 13, e.y - e.radius - 9, 26 * Math.max(0, e.hp / e.maxHp), 4);
      }
      /* Distinct cockpit/core detail per enemy type, so each
         category reads as its own ship, not a bare shape. */
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      if (e.type === "drone") {
        ctx.beginPath(); ctx.arc(e.x, e.y - 1, 3, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === "weaver") {
        ctx.beginPath(); ctx.moveTo(e.x, e.y - 5); ctx.lineTo(e.x + 4, e.y); ctx.lineTo(e.x, e.y + 5); ctx.lineTo(e.x - 4, e.y); ctx.closePath(); ctx.fill();
      } else if (e.type === "tank") {
        ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(e.x, e.y, 3.5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(e.x, e.y - 1, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(e.x - 1, e.y + 6, 2, 5);
      }
    });
  }
  function drawBoss() {
    var b = G.boss; if (!b) return;
    ctx.fillStyle = b.color;
    if (b.type === "dreadnought") {
      /* Capital ship: armored hull + swept wings + twin cannons. */
      ctx.beginPath();
      ctx.moveTo(b.x - 62, b.y - 8); ctx.lineTo(b.x - 30, b.y - 26); ctx.lineTo(b.x + 30, b.y - 26); ctx.lineTo(b.x + 62, b.y - 8);
      ctx.lineTo(b.x + 62, b.y + 10); ctx.lineTo(b.x + 30, b.y + 26); ctx.lineTo(b.x - 30, b.y + 26); ctx.lineTo(b.x - 62, b.y + 10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(b.x - 54, b.y - 1, 16, 5);
      ctx.fillRect(b.x + 38, b.y - 1, 16, 5);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
    } else if (b.type === "hive") {
      /* Hive Queen: orb + four orbiting pods + glowing core. */
      ctx.beginPath(); ctx.arc(b.x, b.y, 42, 0, Math.PI * 2); ctx.fill();
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (d) {
        ctx.beginPath(); ctx.arc(b.x + d[0] * 46, b.y + d[1] * 30, 10, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(b.x, b.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, Math.PI * 2); ctx.fill();
    } else {
      /* Void Leviathan: serpent diamond + fins + eye. */
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 44); ctx.lineTo(b.x + 34, b.y); ctx.lineTo(b.x, b.y + 44); ctx.lineTo(b.x - 34, b.y); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(b.x - 34, b.y - 6); ctx.lineTo(b.x - 52, b.y); ctx.lineTo(b.x - 34, b.y + 6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(b.x + 34, b.y - 6); ctx.lineTo(b.x + 52, b.y); ctx.lineTo(b.x + 34, b.y + 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#0b1220";
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawBullets() {
    G.bullets.forEach(function (b) {
      if (save.weapon === "plasma") { ctx.fillStyle = "#fb923c"; }
      else if (save.weapon === "homing") { ctx.fillStyle = "#f472b6"; }
      else { ctx.fillStyle = "#a5f3fc"; }
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    });
    G.ebullets.forEach(function (b) {
      ctx.fillStyle = "#ef4444";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, Math.PI * 2); ctx.fill();
    });
  }
  /* Pictorial glyph for each power-up, drawn inside the orb so every
     pickup is recognizable at a glance — no more letter codes. */
  function drawPowerupGlyph(type, x, y) {
    ctx.fillStyle = "#04121a";
    ctx.strokeStyle = "#04121a";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    if (type === "rapid") { /* rocket */
      ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 3, y + 2); ctx.lineTo(x - 3, y + 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 3, y + 2); ctx.lineTo(x - 5.5, y + 5.5); ctx.lineTo(x - 3, y + 5.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 3, y + 2); ctx.lineTo(x + 5.5, y + 5.5); ctx.lineTo(x + 3, y + 5.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 1.5, y + 2); ctx.lineTo(x + 1.5, y + 2); ctx.lineTo(x, y + 6.5); ctx.closePath(); ctx.fill();
    } else if (type === "damage") { /* crosshair */
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill();
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
        ctx.beginPath(); ctx.moveTo(x + d[0] * 6.5, y + d[1] * 6.5); ctx.lineTo(x + d[0] * 8.5, y + d[1] * 8.5); ctx.stroke();
      });
    } else if (type === "repair") { /* medical cross */
      ctx.fillRect(x - 2, y - 6, 4, 12);
      ctx.fillRect(x - 6, y - 2, 12, 4);
    } else if (type === "shield") { /* shield with check */
      ctx.beginPath(); ctx.moveTo(x, y - 7);
      ctx.quadraticCurveTo(x + 5.5, y - 6, x + 5.5, y - 2.5);
      ctx.quadraticCurveTo(x + 5.5, y + 3.5, x, y + 7.5);
      ctx.quadraticCurveTo(x - 5.5, y + 3.5, x - 5.5, y - 2.5);
      ctx.quadraticCurveTo(x - 5.5, y - 6, x, y - 7);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x - 1, y + 2.5); ctx.lineTo(x + 3.5, y - 2.5); ctx.stroke();
    } else { /* speed: lightning bolt */
      ctx.beginPath(); ctx.moveTo(x + 2, y - 7); ctx.lineTo(x - 3.5, y + 1); ctx.lineTo(x - 0.5, y + 1);
      ctx.lineTo(x - 2, y + 7); ctx.lineTo(x + 4, y - 2); ctx.lineTo(x + 0.5, y - 2); ctx.closePath(); ctx.fill();
    }
  }
  function drawPowerups() {
    G.powerups.forEach(function (pu) {
      var info = POWERUPS[pu.type];
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.arc(pu.x, pu.y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(pu.x, pu.y, 13, 0, Math.PI * 2); ctx.stroke();
      drawPowerupGlyph(pu.type, pu.x, pu.y);
    });
  }
  function drawParticles() {
    G.particles.forEach(function (pt) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      /* Round sparks, not squares. */
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size / 2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /* ================= HUD ================= */
  var hudCache = {};
  function setText(id, val) { if (hudCache[id] !== val) { hudCache[id] = val; $(id).textContent = val; } }
  function updateHUD() {
    if (!G) return;
    var p = G.player;
    $("hp-bar").style.width = Math.max(0, p.hp / p.maxHp * 100) + "%";
    $("shield-bar").style.width = Math.max(0, p.shield / p.maxShield * 100) + "%";
    setText("hp-text", Math.max(0, Math.ceil(p.hp)));
    setText("shield-text", Math.max(0, Math.ceil(p.shield)));
    setText("lives", "♥".repeat(G.lives) + "♡".repeat(Math.max(0, 3 - G.lives)));
    setText("score", G.score);
    setText("credits-hud", save.credits);
    setText("stage-label", G.mode === "campaign" ? STAGES[G.stage - 1].toUpperCase() : G.mode === "bossrush" ? "BOSS RUSH" : G.mode === "timeattack" ? "TIME ATTACK" : "ENDLESS");
    setText("wave-label", G.mode === "bossrush" ? "BOSS " + (G.bossIndex + 1) : "WAVE " + G.wave);
    if (G.mode === "timeattack") {
      $("timer").classList.remove("hidden");
      var tl = Math.max(0, 180 - G.time);
      setText("timer", Math.floor(tl / 60) + ":" + String(Math.floor(tl % 60)).padStart(2, "0"));
    } else $("timer").classList.add("hidden");
    var mult = Math.min(5, 1 + 0.25 * (G.combo - 1));
    var comboEl = $("combo");
    if (G.combo >= 2) { comboEl.classList.remove("hidden"); setText("combo", "COMBO ×" + mult.toFixed(2)); }
    else comboEl.classList.add("hidden");
    var puHtml = "";
    ["rapid", "damage", "speed"].forEach(function (k) { if (G.pu[k] > 0) puHtml += '<span class="pu-tag">' + POWERUPS[k].icon + " " + POWERUPS[k].name + " " + Math.ceil(G.pu[k]) + "s</span>"; });
    if (hudCache.pu !== puHtml) { hudCache.pu = puHtml; $("powerup-timers").innerHTML = puHtml; }
    if (G.boss) $("boss-bar").style.width = Math.max(0, G.boss.hp / G.boss.maxHp * 100) + "%";
    for (var i = 0; i < 3; i++) {
      var btn = $("ab-" + i);
      var cdEl = btn.querySelector(".ab-cd");
      var chEl = btn.querySelector(".ab-charges");
      var cdTxt = G.recharge[i] > 0 ? Math.ceil(G.recharge[i]) + "s" : "";
      if (hudCache["cd" + i] !== cdTxt) { hudCache["cd" + i] = cdTxt; cdEl.textContent = cdTxt; }
      var chTxt = "×" + G.charges[i];
      if (hudCache["ch" + i] !== chTxt) { hudCache["ch" + i] = chTxt; chEl.textContent = chTxt; }
      btn.style.opacity = G.charges[i] > 0 ? "1" : "0.5";
    }
  }

  /* ================= screens: renderers ================= */
  function drawHangarPreview() {
    var c = $("hangar-preview");
    if (!c) return;
    var x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = "rgba(255,255,255,0.15)";
    for (var i = 0; i < 20; i++) x.fillRect(Math.random() * c.width, Math.random() * c.height, 1.5, 1.5);
    var col = SHIPS[save.ship].color;
    var cx = c.width / 2, cy = c.height / 2;
    x.fillStyle = col;
    x.beginPath(); x.moveTo(cx, cy - 30); x.lineTo(cx + 22, cy + 24); x.lineTo(cx - 22, cy + 24); x.closePath(); x.fill();
    x.fillStyle = "#fff";
    x.font = "bold 13px system-ui, sans-serif"; x.textAlign = "center";
    x.fillText(SHIPS[save.ship].name, cx, cy + 44);
  }
  function renderHangar() {
    $("hangar-credits").textContent = save.credits;
    $("ship-list").innerHTML = Object.keys(SHIPS).map(function (id) {
      var s = SHIPS[id], owned = save.ships.includes(id), sel = save.ship === id;
      var bars = [["HP", s.hp, 160], ["SPD", s.speed, 340], ["DMG", s.dmg, 1.2]].map(function (b) {
        return '<div class="statbar"><span>' + b[0] + '</span><div class="track"><div class="fill" style="width:' + Math.round(b[1] / b[2] * 100) + '%"></div></div></div>';
      }).join("");
      var btn = sel ? '<button class="btn sm primary" disabled>✓ SELECTED</button>'
        : owned ? '<button class="btn sm" data-select-ship="' + id + '">Select</button>'
        : '<button class="btn sm" data-buy-ship="' + id + '">Buy — ' + s.price + ' 💎</button>';
      return '<div class="item-card' + (sel ? " selected" : "") + '"><h4>' + esc(s.name) + '</h4><p>' + esc(s.desc) + '</p>' + bars + '<div class="row"><span>' + (s.charges > 1 ? "⚡ Charges: " + s.charges : "") + '</span>' + btn + '</div></div>';
    }).join("");
    $("weapon-list").innerHTML = Object.keys(WEAPONS).map(function (id) {
      var w = WEAPONS[id], owned = save.weapons.includes(id), sel = save.weapon === id;
      var btn = sel ? '<button class="btn sm primary" disabled>✓ SELECTED</button>'
        : owned ? '<button class="btn sm" data-select-weapon="' + id + '">Select</button>'
        : '<button class="btn sm" data-buy-weapon="' + id + '">Buy — ' + w.price + ' 💎</button>';
      return '<div class="item-card' + (sel ? " selected" : "") + '"><h4>' + esc(w.name) + '</h4><p>' + esc(w.desc) + '</p><div class="row"><span>DMG ' + w.dmg + ' · ' + w.rate + '/s</span>' + btn + '</div></div>';
    }).join("");
    drawHangarPreview();
  }
  function renderLab() {
    $("lab-credits").textContent = save.credits;
    $("upgrade-list").innerHTML = UPGRADES.map(function (u) {
      var lvl = save.upgrades[u.id];
      var maxLvl = u.costs.length;
      var maxed = lvl >= maxLvl;
      var cost = maxed ? 0 : u.costs[lvl];
      var pips = "";
      for (var i = 0; i < maxLvl; i++) pips += '<span class="' + (i < lvl ? "" : "off") + '">●</span>';
      var btn = maxed ? '<button class="btn sm" disabled>MAXED</button>'
        : '<button class="btn sm" data-buy-up="' + u.id + '"' + (save.credits < cost ? " disabled" : "") + '>Buy — ' + cost + ' 💎</button>';
      return '<div class="item-card"><h4>' + esc(u.name) + '</h4><p>' + esc(u.desc) + '</p><div class="pips">' + pips + '</div><div class="row"><span>Level ' + lvl + ' / ' + maxLvl + '</span>' + btn + '</div></div>';
    }).join("");
  }
  function missionProgress(m) {
    if (m.metric === "kills") return save.stats.kills;
    if (m.metric === "wave") return save.stats.wave;
    if (m.metric === "bosses") return save.stats.bosses;
    if (m.metric === "score") return Math.max(save.stats.score, G && state === "playing" ? G.score : 0);
    if (m.metric === "powerups") return save.stats.powerups;
    if (m.metric === "survive") return Math.max(save.stats.survive, G && state === "playing" ? Math.floor(G.time) : 0);
    return 0;
  }
  function renderMissions() {
    $("mission-list").innerHTML = MISSIONS.map(function (m) {
      var prog = missionProgress(m), done = prog >= m.target, claimed = save.missions[m.id] && save.missions[m.id].claimed;
      var btn = claimed ? '<button class="btn sm" disabled>✓ Claimed</button>'
        : done ? '<button class="btn sm primary" data-claim="' + m.id + '">Claim +' + m.reward + ' 💎</button>'
        : '<button class="btn sm" disabled>' + prog + ' / ' + m.target + '</button>';
      return '<div class="item-card"><h4>' + esc(m.name) + '</h4><p>' + esc(m.desc) + '</p><div class="progress"><div class="fill" style="width:' + Math.min(100, prog / m.target * 100) + '%"></div></div><div class="row"><span>' + prog + ' / ' + m.target + ' · Reward ' + m.reward + ' 💎</span>' + btn + '</div></div>';
    }).join("");
  }
  function renderAchievements() {
    $("achievement-list").innerHTML = ACHIEVEMENTS.map(function (a) {
      var un = save.achievements.includes(a.id);
      return '<div class="item-card ach' + (un ? " unlocked" : "") + '"><div class="row"><span class="badge">' + (un ? a.icon : "🔒") + '</span><h4>' + esc(a.name) + '</h4></div><p>' + esc(a.desc) + '</p></div>';
    }).join("");
  }
  function renderHighscores(el) {
    if (!el) return;
    if (!save.highscores.length) { el.innerHTML = "No flights logged yet."; return; }
    el.innerHTML = save.highscores.map(function (h, i) {
      return '<div class="hs-row"><span>' + (i + 1) + ". " + esc(h.name) + " · " + esc(h.mode) + " · " + esc(h.date) + '</span><strong>' + h.score + '</strong></div>';
    }).join("");
  }
  function renderSettings() {
    $("set-sound-on").textContent = save.settings.soundOn ? "ON" : "OFF";
    $("set-sound-vol").value = save.settings.soundVol;
    $("set-music-vol").value = save.settings.musicVol;
    $("set-autofire").textContent = save.settings.autoFire ? "ON" : "OFF";
    $("set-shake").textContent = save.settings.shake ? "ON" : "OFF";
    $("set-quality").textContent = save.settings.quality.toUpperCase();
    $("set-reduced").textContent = save.settings.reduced ? "ON" : "OFF";
  }

  /* ================= menu wiring ================= */
  $("btn-play").addEventListener("click", function () { showScreen("screen-play"); });
  $("btn-continue").addEventListener("click", function () { if (save.runSnapshot) startRun(save.runSnapshot.mode, save.runSnapshot); });
  $("btn-hangar").addEventListener("click", function () { showScreen("screen-hangar"); });
  $("btn-lab").addEventListener("click", function () { showScreen("screen-lab"); });
  $("btn-missions").addEventListener("click", function () { showScreen("screen-missions"); });
  $("btn-achievements").addEventListener("click", function () { showScreen("screen-achievements"); });
  $("btn-settings").addEventListener("click", function () { settingsReturn = null; showScreen("screen-settings"); });
  $("btn-howto").addEventListener("click", function () { showScreen("screen-howto"); });
  $("btn-play-back").addEventListener("click", function () { showScreen("menu"); });
  $("btn-hangar-back").addEventListener("click", function () { showScreen("menu"); });
  $("btn-lab-back").addEventListener("click", function () { showScreen("menu"); });
  $("btn-missions-back").addEventListener("click", function () { showScreen("menu"); });
  $("btn-achievements-back").addEventListener("click", function () { showScreen("menu"); });
  $("btn-howto-back").addEventListener("click", function () { showScreen("menu"); });
  $("btn-howto-tutorial").addEventListener("click", function () { showTutorial(0); });
  $("btn-tutorial-again").addEventListener("click", function () { showTutorial(0); });
  $("btn-resume").addEventListener("click", resumeGame);
  $("btn-restart").addEventListener("click", function () { if (G) startRun(G.mode); });
  var settingsReturn = null;
  $("btn-pause-settings").addEventListener("click", function () { settingsReturn = "screen-pause"; showScreen("screen-settings"); });
  $("btn-settings-back").addEventListener("click", function () {
    if (settingsReturn) { var r = settingsReturn; settingsReturn = null; showScreen(r); }
    else goBack();
  });
  $("btn-quit").addEventListener("click", quitToMenu);
  $("btn-next-stage").addEventListener("click", nextStage);
  $("btn-sc-menu").addEventListener("click", quitToMenu);
  $("btn-go-restart").addEventListener("click", function () { if (G) startRun(G.mode); });
  $("btn-go-menu").addEventListener("click", quitToMenu);
  $("btn-vic-again").addEventListener("click", function () { startRun("campaign"); });
  $("btn-vic-menu").addEventListener("click", quitToMenu);
  $("btn-reset-save").addEventListener("click", function () {
    if (confirm("Reset ALL Galaxy Defender save data? This cannot be undone.")) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      save = loadSave(); G = null; state = "menu";
      $("hud").classList.add("hidden"); $("touch-controls").classList.add("hidden");
      showScreen("menu"); toast("Save data reset.");
    }
  });
  document.querySelectorAll(".mode-card").forEach(function (c) {
    c.addEventListener("click", function () { startRun(c.getAttribute("data-mode")); });
  });
  $("ship-list").addEventListener("click", function (e) {
    var buy = e.target.closest("[data-buy-ship]"), sel = e.target.closest("[data-select-ship]");
    if (buy) {
      var id = buy.getAttribute("data-buy-ship"), s = SHIPS[id];
      if (save.credits < s.price) { toast("Not enough credits."); return; }
      save.credits -= s.price; save.ships.push(id); persist(); toast(s.name + " purchased!");
      renderHangar();
    } else if (sel) {
      save.ship = sel.getAttribute("data-select-ship"); persist(); renderHangar();
    }
  });
  $("weapon-list").addEventListener("click", function (e) {
    var buy = e.target.closest("[data-buy-weapon]"), sel = e.target.closest("[data-select-weapon]");
    if (buy) {
      var id = buy.getAttribute("data-buy-weapon"), w = WEAPONS[id];
      if (save.credits < w.price) { toast("Not enough credits."); return; }
      save.credits -= w.price; save.weapons.push(id); persist(); toast(w.name + " purchased!");
      renderHangar();
    } else if (sel) {
      save.weapon = sel.getAttribute("data-select-weapon"); persist(); renderHangar();
    }
  });
  $("upgrade-list").addEventListener("click", function (e) {
    var buy = e.target.closest("[data-buy-up]");
    if (!buy) return;
    var u = UPGRADES.find(function (x) { return x.id === buy.getAttribute("data-buy-up"); });
    var lvl = save.upgrades[u.id];
    if (lvl >= u.costs.length) return;
    var cost = u.costs[lvl];
    if (save.credits < cost) { toast("Not enough credits."); return; }
    save.credits -= cost; save.upgrades[u.id] = lvl + 1; persist();
    toast(u.name + " upgraded to level " + (lvl + 1) + "!");
    renderLab();
  });
  $("mission-list").addEventListener("click", function (e) {
    var claim = e.target.closest("[data-claim]");
    if (!claim) return;
    var m = MISSIONS.find(function (x) { return x.id === claim.getAttribute("data-claim"); });
    if (!m || (save.missions[m.id] && save.missions[m.id].claimed)) return;
    if (missionProgress(m) < m.target) { toast("Mission not complete yet."); return; }
    save.missions[m.id] = { claimed: true };
    save.credits += m.reward; persist();
    toast("+" + m.reward + " credits claimed!");
    renderMissions();
  });
  $("set-sound-on").addEventListener("click", function () { toggleSound(); renderSettings(); });
  $("set-sound-vol").addEventListener("input", function (e) { save.settings.soundVol = Number(e.target.value); persist(); applyAudioSettings(); });
  $("set-music-vol").addEventListener("input", function (e) { save.settings.musicVol = Number(e.target.value); persist(); applyAudioSettings(); });
  $("set-autofire").addEventListener("click", function () { save.settings.autoFire = !save.settings.autoFire; persist(); renderSettings(); });
  $("set-shake").addEventListener("click", function () { save.settings.shake = !save.settings.shake; persist(); renderSettings(); });
  $("set-quality").addEventListener("click", function () { save.settings.quality = save.settings.quality === "high" ? "low" : "high"; persist(); renderSettings(); });
  $("set-reduced").addEventListener("click", function () { save.settings.reduced = !save.settings.reduced; persist(); renderSettings(); });

  /* ================= tutorial ================= */
  var tutStep = 0;
  function showTutorial(step) {
    tutStep = step;
    $("tut-step").textContent = (step + 1) + " / 4";
    $("tut-text").innerHTML = TUTORIAL[step];
    $("btn-tut-prev").disabled = step === 0;
    $("btn-tut-next").classList.toggle("hidden", step === 3);
    $("btn-tut-done").classList.toggle("hidden", step < 3);
    $("tutorial-overlay").classList.remove("hidden");
  }
  function hideTutorial() { $("tutorial-overlay").classList.add("hidden"); save.tutorialSeen = true; persist(); }
  $("btn-tut-prev").addEventListener("click", function () { if (tutStep > 0) showTutorial(tutStep - 1); });
  $("btn-tut-next").addEventListener("click", function () { if (tutStep < 3) showTutorial(tutStep + 1); });
  $("btn-tut-done").addEventListener("click", hideTutorial);

  /* ================= main loop ================= */
  var last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateStars(dt);
    if (state === "playing" && G) update(dt);
    render();
    if (state === "playing" && G) updateHUD();
  }
  showScreen("menu");
  if (!save.tutorialSeen) setTimeout(function () { showTutorial(0); }, 700);
  requestAnimationFrame(loop);

  /* ================= test hooks ================= */
  window.__gd = {
    state: function () { return { state: state, score: G ? G.score : 0, wave: G ? G.wave : 0, lives: G ? G.lives : 0, hp: G ? Math.ceil(G.player.hp) : 0, credits: save.credits, mode: G ? G.mode : null, stage: G ? G.stage : 0, boss: G && G.boss ? G.boss.name : null }; },
    score: function () { return G ? G.score : 0; },
    wave: function () { return G ? G.wave : 0; },
    credits: function () { return save.credits; },
    start: function (mode) { startRun(mode || "endless"); },
    pause: function () { pauseGame(); },
    resume: function () { resumeGame(); },
    endRun: function () { if (G) endRun("gameover"); },
    boss: function () { return G && G.boss ? { name: G.boss.name, type: G.boss.type, hp: G.boss.hp, maxHp: G.boss.maxHp } : null; },
    bossIndex: function () { return G ? G.bossIndex : -1; },
    killBoss: function () { if (G && G.boss) killBoss(); },
    stats: function () { return G ? { dmgMul: G.player.dmgMul, fireMul: G.player.fireMul, maxHp: G.player.maxHp, maxShield: G.player.maxShield, speed: G.player.speed, cdMul: G.player.cdMul } : null; },
    upgrades: function () { return { upgrades: save.upgrades, credits: save.credits }; },
    spawnPowerup: function (type, x, y) { if (G) G.powerups.push({ x: x || 240, y: y || 200, type: type, vy: 0, age: 0 }); }
  };
})();
