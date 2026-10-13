/* ============================================================
   PIXEL KINGDOM — utils.js
   Global namespace, config, math/RNG helpers.
   Loaded FIRST. No dependencies.
   ============================================================ */
var PK = PK || {};

PK.Config = {
  TILE: 16,            // art pixels per tile
  ZOOM: 3,             // screen pixels per art pixel
  WORLD_W: 160,
  WORLD_H: 160,
  SAVE_KEY: 'pixel_kingdom_saves_v1',
  SETTINGS_KEY: 'pixel_kingdom_settings_v1',
  SAVE_VERSION: 1,
  DAY_LENGTH: 480,     // seconds per full day/night cycle
  AUTOSAVE_EVERY: 60,  // seconds
  INV_SIZE: 28,
  HOTBAR_SIZE: 8,
  // Tile ids
  T: {
    GRASS: 0, GRASS2: 1, DIRT: 2, SAND: 3, STONE: 4,
    WATER_DEEP: 5, WATER_SHALLOW: 6, SNOW: 7, PATH: 8,
    WOOD_FLOOR: 9, STONE_FLOOR: 10, BRIDGE: 11,
    DARK_STONE: 12, COBBLE: 13
  },
  SOLID_TILES: { 4: true, 5: true, 6: true }, // stone, deep water, shallow water (bridge overrides)
  TILE_NAMES: ['grass','grass2','dirt','sand','stone','water_deep','water_shallow',
               'snow','path','wood_floor','stone_floor','bridge','dark_stone','cobble']
};

PK.Keys = {
  // default key bindings (rebindable in settings)
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  up2: 'ArrowUp', down2: 'ArrowDown', left2: 'ArrowLeft', right2: 'ArrowRight',
  attack: 'Space', interact: 'KeyF', skill1: 'KeyQ', skill2: 'KeyE', skill3: 'KeyR',
  sprint: 'ShiftLeft', inventory: 'KeyI', character: 'KeyC', map: 'KeyM',
  quests: 'KeyJ', skills: 'KeyK', crafting: 'KeyB', help: 'KeyH', pause: 'Escape'
};

PK.Utils = (function () {
  'use strict';
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
  function dist2(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }
  function angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }

  // Deterministic seeded RNG (mulberry32)
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Deterministic 2D hash -> [0,1)
  function hash2(x, y, seed) {
    var h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rand(rng, a, b) {
    if (a === undefined) return rng();
    if (b === undefined) { b = a; a = 0; }
    return a + rng() * (b - a);
  }
  function randi(rng, a, b) { return Math.floor(rand(rng, a, b + 1)); }
  function choice(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function shuffle(rng, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
    var nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }
  function fmtTime(sec) {
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h > 0 ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }
  function fmtNum(n) {
    n = Math.floor(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var _uid = 1;
  function uid(prefix) { return (prefix || 'id') + '_' + (_uid++); }

  return {
    clamp: clamp, lerp: lerp, dist: dist, dist2: dist2, angleTo: angleTo,
    mulberry32: mulberry32, hash2: hash2, rand: rand, randi: randi,
    choice: choice, shuffle: shuffle, circleRectOverlap: circleRectOverlap,
    fmtTime: fmtTime, fmtNum: fmtNum, esc: esc, uid: uid
  };
})();
