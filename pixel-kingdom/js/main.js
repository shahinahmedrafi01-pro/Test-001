/* ============================================================
   PIXEL KINGDOM — main.js
   Boot, game states, input, main loop, camera, world rendering,
   day/night, weather, autosave, save/load, debug hooks.
   Depends: everything.
   ============================================================ */
var PK = PK || {};

PK.Game = (function () {
  'use strict';
  var U = PK.Utils, C = PK.Config, T = C.T, TILE = C.TILE;

  var state = 'title'; // title|create|play
  var paused = false;
  var canvas, ctx, vw = 0, vh = 0;
  var cam = { x: 0, y: 0 };
  var keysDown = {};
  var dayTime = 0.32; // 0..1, 0=midnight
  var settings = null;
  var currentSlot = null;
  var autosaveT = C.AUTOSAVE_EVERY;
  var tick = 0;
  var lastTs = 0;
  var promptCd = 0;
  var introShown = false;

  /* ================= INIT ================= */
  function init() {
    settings = PK.Save.loadSettings();
    if (settings.keys) PK.Keys = settings.keys;
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    resize();
    window.addEventListener('resize', resize);

    PK.Sprites.init();
    PK.Audio.init();
    applySettingsToAudio();
    PK.UI.init();
    PK.Mobile.init();
    bindKeys();
    bindMouse();

    // first user gesture unlocks audio
    function unlockOnce() { PK.Audio.unlock(); }
    window.addEventListener('pointerdown', unlockOnce, { once: false });
    window.addEventListener('keydown', unlockOnce, { once: false });

    window.addEventListener('blur', function () {
      if (state === 'play' && !PK.UI.openPanel && PK.Entities.player && !PK.Entities.player.dead) {
        PK.UI.togglePanel('pause');
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) lastTs = 0;
    });

    PK.UI.showScreen('title');
    requestAnimationFrame(loop);
    window.__PK = makeDebug();
    window.__PK.ready = true;
  }

  function applySettingsToAudio() {
    PK.Audio.setMaster(settings.master);
    PK.Audio.setMusic(settings.music);
    PK.Audio.setSfx(settings.sfx);
    if (settings.muted && !PK.Audio.muted) PK.Audio.toggleMute();
  }

  var dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  /* ================= INPUT ================= */
  function bindKeys() {
    // (re)bind held-key tracking; action keys handled via keydown dispatch
  }
  window.addEventListener('keydown', function (e) {
    if (e.repeat) { keysDown[e.code] = true; return; }
    keysDown[e.code] = true;
    if (state !== 'play') return;
    var p = PK.Entities.player;
    if (!p) return;
    if (PK.UI.openPanel || dialogOpen()) return;
    var K = PK.Keys;
    if (e.code === K.attack) { PK.Entities.playerAttack(); e.preventDefault(); }
    else if (e.code === K.interact) { PK.Entities.interact(); }
    else if (e.code === K.skill1) PK.Entities.useSkill(0);
    else if (e.code === K.skill2) PK.Entities.useSkill(1);
    else if (e.code === K.skill3) PK.Entities.useSkill(2);
    else if (/^Digit[1-8]$/.test(e.code)) {
      PK.Systems.Inv.hotbarUse(p, +e.code.slice(5) - 1);
    }
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keysDown[e.code] = false; });

  function dialogOpen() {
    return !!document.querySelector('#overlays .dialog, #overlays .confirm, .overlay .sign');
  }

  function bindMouse() {
    canvas.addEventListener('mousedown', function (e) {
      PK.Audio.unlock();
      if (state !== 'play' || PK.UI.openPanel || dialogOpen()) return;
      var p = PK.Entities.player;
      if (!p || p.dead) return;
      // face click point (screen -> world)
      var wx = cam.x + e.clientX / Z, wy = cam.y + e.clientY / Z;
      var dx = wx - p.x, dy = wy - p.y;
      if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left';
      else p.dir = dy > 0 ? 'down' : 'up';
      PK.Entities.playerAttack();
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function readInput() {
    var K = PK.Keys, d = keysDown;
    var input = {
      up: !!(d[K.up] || d[K.up2]),
      down: !!(d[K.down] || d[K.down2]),
      left: !!(d[K.left] || d[K.left2]),
      right: !!(d[K.right] || d[K.right2]),
      sprint: !!(d[K.sprint] || d['ShiftRight'])
    };
    PK.Mobile.poll(input);
    return input;
  }
  function pollMobileButtons() {
    var b = PK.Mobile.consumeButtons();
    if (state !== 'play' || PK.UI.openPanel || dialogOpen()) return;
    var p = PK.Entities.player;
    if (!p || p.dead) return;
    if (b.attack) PK.Entities.playerAttack();
    if (b.interact) PK.Entities.interact();
    b.skills.forEach(function (s, i) { if (s) PK.Entities.useSkill(i); });
  }

  /* ================= NEW / LOAD / SAVE ================= */
  function startNewGame(name, cls, appearance) {
    PK.World.init((Math.random() * 1e9) | 0);
    PK.Entities.reset();
    PK.Entities.init({});
    var p = PK.Entities.newPlayer(name, cls, appearance);
    p.inv = PK.Systems.Inv.create();
    PK.Entities.player = p;
    // starter kit
    var c = PK.Data.CLASSES[cls];
    (c.startItems || []).forEach(function (id) { PK.Systems.Inv.add(p, id, id.indexOf('ammo_') === 0 ? 20 : (id.indexOf('food_') === 0 || id.indexOf('pot_') === 0 ? 3 : 1)); });
    if (c.startWeapon) {
      PK.Systems.Inv.add(p, c.startWeapon, 1);
      for (var i = 0; i < p.inv.slots.length; i++) {
        if (p.inv.slots[i] && p.inv.slots[i].id === c.startWeapon) {
          var def = PK.Data.ITEMS[c.startWeapon];
          p.inv.equipment.weapon = { id: c.startWeapon, dur: def.dur };
          p.inv.slots[i] = null;
          break;
        }
      }
    }
    PK.Entities.recompute(p);
    p.hp = p.maxhp; p.mp = p.maxmp;
    PK.Systems.Quests.reset();
    PK.Systems.Ach.reset();
    PK.Systems.Quests.accept(PK.Data.STARTER_QUEST, true);
    dayTime = 0.32;
    introShown = false;
    state = 'play';
    PK.UI.showGame();
    PK.UI.refreshHUD();
    // pick autosave slot: first empty, else slot 1
    var list = PK.Save.list();
    currentSlot = 1;
    for (var i = 0; i < list.length; i++) if (!list[i]) { currentSlot = i + 1; break; }
    quickSave(true);
    showIntro();
    PK.UI.toast('Welcome to Pixel Kingdom, ' + name + '!');
  }

  function showIntro() {
    if (introShown) return;
    introShown = true;
    var pages = [
      'Centuries ago, the Pixel Kingdom shone brighter than any realm... until the Shadow shattered the King\'s Crown and its jewels scattered to the wilds.',
      'Monsters rose. Villages fell silent. The last spark of hope fled to Greenfield Village.',
      'You are that spark. Find Elder Maren — your quest begins now. ⚔️'
    ];
    var i = 0;
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="panel intro"><h2>📖 The Fallen Kingdom</h2><p id="intro-t"></p><div class="row-btns"><button id="intro-n" class="px-btn big">Next ▶</button></div></div>';
    document.body.appendChild(ov);
    function show() { ov.querySelector('#intro-t').textContent = pages[i]; }
    show();
    ov.querySelector('#intro-n').addEventListener('click', function () {
      PK.Audio.sfx('dialog');
      i++;
      if (i >= pages.length) { ov.remove(); }
      else show();
    });
  }

  function collectSave() {
    var p = PK.Entities.player;
    return {
      version: PK.Config.SAVE_VERSION,
      seed: PK.World.seed(),
      dayTime: dayTime,
      playtime: p.playtime,
      player: PK.Entities.serialize(),
      inv: p.inv,
      quests: PK.Systems.Quests.serialize(),
      ach: PK.Systems.Ach.serialize(),
      world: PK.World.serialize()
    };
  }
  function saveSlot(n) {
    var ok = PK.Save.save(n, collectSave());
    if (ok) { currentSlot = n; PK.UI.toast('💾 Saved to slot ' + n); PK.Audio.sfx('save'); }
    else { PK.UI.toast('Save failed!'); PK.Audio.sfx('error'); }
    return ok;
  }
  function quickSave(silent) {
    if (!currentSlot) return false;
    var ok = PK.Save.save(currentSlot, collectSave());
    if (ok && !silent) { PK.UI.toast('💾 Autosaved'); }
    return ok;
  }
  function loadSlot(n) {
    var d = PK.Save.load(n);
    if (!d) { PK.UI.toast('No save in slot ' + n); return false; }
    if (d.error) { PK.UI.toast('Save error: ' + d.error); PK.Audio.sfx('error'); return false; }
    PK.World.init(d.seed);
    PK.World.deserialize(d.world);
    PK.Entities.reset();
    PK.Entities.init({});
    PK.Entities.deserialize(d.player);
    PK.Entities.player.inv = d.inv || PK.Systems.Inv.create();
    PK.Entities.recompute(PK.Entities.player);
    PK.Systems.Quests.deserialize(d.quests);
    PK.Systems.Ach.deserialize(d.ach);
    dayTime = d.dayTime !== undefined ? d.dayTime : 0.32;
    currentSlot = n;
    state = 'play';
    introShown = true;
    PK.UI.showGame();
    PK.UI.refreshHUD();
    PK.UI.toast('📂 Loaded save from slot ' + n);
    PK.Audio.sfx('open');
    return true;
  }
  function toTitle() {
    quickSave(true);
    state = 'title';
    PK.UI.closePanel();
    PK.UI.showScreen('title');
  }

  /* ================= DAY/NIGHT ================= */
  function advanceTime(sec) { dayTime = (dayTime + sec / PK.Config.DAY_LENGTH) % 1; }
  function isNight() { return dayTime < 0.22 || dayTime > 0.78; }
  function darkness() {
    if (dayTime < 0.2 || dayTime > 0.8) return 0.55;
    if (dayTime < 0.28) return 0.55 * (1 - (dayTime - 0.2) / 0.08);
    if (dayTime > 0.72) return 0.55 * ((dayTime - 0.72) / 0.08);
    return 0;
  }

  /* ================= LOOP ================= */
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (document.hidden) return;
    tick += dt;

    if (state === 'play' && PK.Entities.player) {
      var busy = !!PK.UI.openPanel || dialogOpen() || !introShown;
      if (!busy && !paused) {
        var input = readInput();
        pollMobileButtons();
        PK.Entities.update(dt, input);
        PK.Systems.Quests.update(PK.Entities.player);
        dayTime = (dayTime + dt / PK.Config.DAY_LENGTH) % 1;
        PK.FX.updateWeather(dt, PK.World.biomeAt(Math.floor(PK.Entities.player.x / TILE), Math.floor(PK.Entities.player.y / TILE)), isNight());
        // autosave
        autosaveT -= dt;
        if (autosaveT <= 0) { autosaveT = C.AUTOSAVE_EVERY; quickSave(); }
        // music context
        var p = PK.Entities.player;
        PK.Audio.update(dt, {
          combat: PK.Entities.enemies.some(function (e) { return !e.dead && e.state === 'chase'; }),
          boss: !!PK.Entities.boss,
          dungeon: PK.World.biomeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) === 'caves',
          village: PK.World.biomeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) === 'village',
          night: isNight()
        });
        updatePrompt();
        // achievements: steps/regions
        if (Math.floor(p.steps) % 500 === 0) PK.Systems.Ach.checkSteps(Math.floor(p.steps));
      }
      PK.FX.update(dt);
      updateCamera(dt);
      render();
      PK.UI.refreshHUDLite();
    }
  }

  function updateCamera(dt) {
    var p = PK.Entities.player;
    if (!p) return;
    var tx = p.x - vw / (2 * Z), ty = p.y - vh / (2 * Z);
    var k = 1 - Math.pow(0.001, dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    var maxX = PK.World.W * TILE - vw / Z, maxY = PK.World.H * TILE - vh / Z;
    cam.x = U.clamp(cam.x, Math.min(0, maxX), Math.max(0, maxX));
    cam.y = U.clamp(cam.y, Math.min(0, maxY), Math.max(0, maxY));
    if (maxX < 0) cam.x = maxX / 2;
    if (maxY < 0) cam.y = maxY / 2;
  }

  function updatePrompt() {
    promptCd -= 1;
    if (promptCd > 0) return;
    promptCd = 12;
    var p = PK.Entities.player;
    if (!p || p.dead || PK.UI.openPanel) { PK.UI.setPrompt(null); return; }
    // NPC
    var best = null, bd = 2.2 * TILE;
    PK.Entities.npcs.forEach(function (n) {
      var d = U.dist(p.x, p.y, n.x, n.y);
      if (d < bd) { bd = d; best = n; }
    });
    if (best) {
      var dlg = PK.Data.DIALOGS[best.id];
      PK.UI.setPrompt('[F] Talk to ' + (dlg ? dlg.name : 'villager'));
      return;
    }
    var it = PK.World.nearestInteractable(p.x, p.y, 1.8 * TILE);
    if (!it) { PK.UI.setPrompt(null); return; }
    var labels = {
      node: '[F] Gather', chest: '[F] Open chest', sign: '[F] Read sign',
      station: '[F] Use ' + it.ref.kind, waystone: it.ref.unlocked ? '[F] Fast travel' : '[F] Activate waystone'
    };
    PK.UI.setPrompt(labels[it.kind] || '[F] Interact');
  }

  /* ================= RENDER ================= */
  var Z = C.ZOOM; // 3
  var camZero = { x: 0, y: 0 };
  function render() {
    var p = PK.Entities.player;
    // screen-space clear
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, vw, vh);
    var sh = PK.FX.shakeOffset();
    // world transform: zoom + camera
    ctx.setTransform(dpr * Z, 0, 0, dpr * Z, (-cam.x + sh.x) * dpr * Z, (-cam.y + sh.y) * dpr * Z);
    ctx.imageSmoothingEnabled = false;

    // visible tile range in world units
    var x0 = Math.max(0, Math.floor(cam.x / TILE) - 1),
        x1 = Math.min(PK.World.W - 1, Math.ceil((cam.x + vw / Z) / TILE) + 1),
        y0 = Math.max(0, Math.floor(cam.y / TILE) - 1),
        y1 = Math.min(PK.World.H - 1, Math.ceil((cam.y + vh / Z) / TILE) + 1);
    var S = PK.Sprites, names = C.TILE_NAMES;
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var t = PK.World.tileAt(tx, ty);
        var name = names[t];
        var img;
        if (name === 'water_deep' || name === 'water_shallow') img = S.frame(name, tick);
        else img = S.tile(name);
        ctx.drawImage(img, tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    // extras (features, chests, stations, signs, waystones)
    var extras = collectExtras();
    PK.Entities.render(ctx, camZero, tick, extras);
    PK.FX.renderWorld(ctx, camZero);
    PK.FX.renderNumbers(ctx, camZero);
    // back to screen space for weather + lighting
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    PK.FX.renderWeather(ctx, vw, vh, null);
    var lights = collectLights().map(function (L) {
      return { x: (L.x - cam.x + sh.x) * Z, y: (L.y - cam.y + sh.y) * Z, r: L.r * Z, flicker: L.flicker };
    });
    PK.FX.renderLighting(ctx, vw, vh, camZero, darkness(), lights);
  }

  function collectExtras() {
    var extras = [];
    var TILEL = TILE;
    var x0 = Math.max(0, Math.floor(cam.x / TILEL) - 2),
        x1 = Math.min(PK.World.W - 1, Math.ceil((cam.x + vw / Z) / TILEL) + 2),
        y0 = Math.max(0, Math.floor(cam.y / TILEL) - 2),
        y1 = Math.min(PK.World.H - 1, Math.ceil((cam.y + vh / Z) / TILEL) + 2);
    function inR(tx, ty) { return tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1; }
    // features
    var feats = PK.World.featuresNear(Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2), Math.ceil(Math.max(x1 - x0, y1 - y0) / 2) + 2);
    feats.forEach(function (f) {
      if (!inR(f.tx, f.ty)) return;
      extras.push({ kind: 'feature', y: f.ty * TILEL + TILEL, f: f });
    });
    // chests
    PK.World.chests().forEach(function (c) {
      if (!inR(c.tx, c.ty)) return;
      extras.push({ kind: 'feature', y: c.ty * TILEL + TILEL, chest: c });
    });
    // stations
    PK.World.stations().forEach(function (s) {
      if (!inR(s.tx, s.ty)) return;
      extras.push({ kind: 'feature', y: s.ty * TILEL + TILEL, station: s });
    });
    // signs
    PK.World.signs().forEach(function (s) {
      if (!inR(s.tx, s.ty)) return;
      extras.push({ kind: 'feature', y: s.ty * TILEL + TILEL, sign: s });
    });
    // waystones
    PK.World.waystones().forEach(function (w) {
      if (!inR(w.tx, w.ty)) return;
      extras.push({ kind: 'feature', y: w.ty * TILEL + TILEL, waystone: w });
    });
    return extras;
  }

  function drawFeatureSprite(f, x, y) {
    var S = PK.Sprites;
    var name = f.type || (f.chest ? 'chest' : (f.station ? f.station.kind : (f.sign ? 'sign' : (f.waystone ? 'waystone' : null))));
    if (f.chest) name = f.chest.opened ? 'chest_open' : 'chest';
    if (!name) return;
    var img;
    try {
      if (['campfire', 'furnace', 'torch', 'waystone', 'fountain'].indexOf(name) >= 0) img = S.frame(name, tick);
      else img = S.obj(name);
    } catch (e) { return; }
    if (!img) return;
    var harvested = f.harvested;
    ctx.save();
    if (harvested) ctx.globalAlpha = 0.35;
    var wpx = img.width * 2, hpx = img.height * 2;
    // features drawn 2x (32px tiles) for presence; characters at 1.6x
    ctx.drawImage(img, x - wpx / 2, y - hpx, wpx, hpx);
    ctx.restore();
    if (f.waystone && f.waystone.unlocked) {
      ctx.fillStyle = 'rgba(128,222,234,' + (0.25 + 0.15 * Math.sin(tick * 4)) + ')';
      ctx.beginPath(); ctx.arc(x, y - 20, 14, 0, 7); ctx.fill();
    }
  }

  function collectLights() {
    var lights = [];
    var p = PK.Entities.player;
    if (p && !p.dead) lights.push({ x: p.x, y: p.y - 10, r: 110 });
    var x0 = Math.floor(cam.x / TILE) - 2, x1 = Math.ceil((cam.x + vw / Z) / TILE) + 2;
    var y0 = Math.floor(cam.y / TILE) - 2, y1 = Math.ceil((cam.y + vh / Z) / TILE) + 2;
    PK.World.stations().forEach(function (s) {
      if (s.tx < x0 || s.tx > x1 || s.ty < y0 || s.ty > y1) return;
      if (s.kind === 'campfire' || s.kind === 'torch' || s.kind === 'furnace')
        lights.push({ x: s.tx * TILE + 8, y: s.ty * TILE, r: 130, flicker: true });
      if (s.kind === 'waystone') lights.push({ x: s.tx * TILE + 8, y: s.ty * TILE, r: 90 });
    });
    return lights;
  }

  // expose feature drawing to entities.render via extras
  PK._drawFeature = drawFeatureSprite;

  /* ================= DEBUG HOOKS (for automated tests) ================= */
  function makeDebug() {
    return {
      ready: false,
      game: null, // set below
      startNew: function (name, cls) {
        startNewGame(name || 'Tester', cls || 'warrior', { skin: '#f1c27d', hair: '#4a3226', shirt: '#3f51b5', pants: '#5d4037' });
      },
      state: function () { return { mode: state, player: PK.Entities.player ? { x: PK.Entities.player.x, y: PK.Entities.player.y, hp: PK.Entities.player.hp, level: PK.Entities.player.level } : null, enemies: PK.Entities.enemies.length }; },
      key: function (code, down) { keysDown[code] = down !== false; },
      attack: function () { PK.Entities.playerAttack(); },
      interact: function () { PK.Entities.interact(); },
      teleport: function (tx, ty) { var p = PK.Entities.player; p.x = tx * TILE + 8; p.y = ty * TILE + 8; },
      give: function (id, qty) { return PK.Systems.Inv.add(PK.Entities.player, id, qty || 1); },
      save: function (n) { return saveSlot(n || 1); },
      load: function (n) { return loadSlot(n || 1); },
      spawn: function (type, tx, ty) { return PK.Entities.spawnEnemy(type, tx === undefined ? 80 : tx, ty === undefined ? 90 : ty); },
      tick: function (n, dt) { // step the simulation manually
        for (var i = 0; i < (n || 1); i++) {
          var input = readInput();
          PK.Entities.update(dt || 0.05, input);
          PK.Systems.Quests.update(PK.Entities.player);
        }
      }
    };
  }

  var api = {
    init: init,
    state: state,
    settings: null,
    startNewGame: startNewGame,
    loadSlot: loadSlot, saveSlot: saveSlot, quickSave: quickSave,
    toTitle: toTitle,
    bindKeys: bindKeys,
    dayTime: function () { return dayTime; },
    isNight: isNight,
    advanceTime: advanceTime,
    get currentSlot() { return currentSlot; }
  };
  // settings getter live
  Object.defineProperty(api, 'settings', { get: function () { return settings; } });
  Object.defineProperty(api, 'state', { get: function () { return state; } });
  return api;
})();

document.addEventListener('DOMContentLoaded', function () { PK.Game.init(); });
