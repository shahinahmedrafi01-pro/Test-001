/* ============================================================
 * Pixel Kingdom — Procedural Pixel-Art Module (PK.Sprites)
 * ------------------------------------------------------------
 * All art is generated in code (Canvas 2D rects). No external
 * images. init() must be called after PK.Data exists; it reads
 * PK.Data.ITEMS lazily for item icons and never throws.
 * ============================================================ */
var PK = PK || {};

(function () {
'use strict';

/* ================= 1. UTILITIES ================= */

function px(g, x, y, w, h, c) {
  g.fillStyle = c;
  g.fillRect(x | 0, y | 0, w | 0, h | 0);
}

function cnv(w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// f < 1 darkens, f > 1 lightens a #rrggbb color
function shade(hex, f) {
  var n = parseInt(hex.slice(1), 16);
  var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  g = Math.max(0, Math.min(255, Math.round(g * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// deterministic 0..1 pseudo-random from ints (stable across runs)
function rnd2(x, y, s) {
  var h = (x * 374761393 + y * 668265263 + s * 974711) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// scatter n 1px speckles over a 16x16 tile
function speckle(g, seed, n, dark, light) {
  for (var i = 0; i < n; i++) {
    var x = Math.floor(rnd2(i, 7, seed) * 16);
    var y = Math.floor(rnd2(i, 13, seed) * 16);
    px(g, x, y, 1, 1, rnd2(i, 29, seed) < 0.62 ? dark : light);
  }
}

// horizontal mirror of a canvas
function flipH(c) {
  var o = cnv(c.width, c.height);
  var g = o.getContext('2d');
  g.translate(c.width, 0);
  g.scale(-1, 1);
  g.drawImage(c, 0, 0);
  return o;
}

// build a canvas by running painter(g)
function spr(w, h, painter) {
  var c = cnv(w, h);
  painter(c.getContext('2d'));
  return c;
}

// small animated flame, base at (x, y+3), ph = 0/1
function flame(g, x, y, ph) {
  var outer = ph ? '#ff9933' : '#ff6611';
  var inner = ph ? '#ffdd55' : '#ff9933';
  px(g, x, y, 4, 3, outer);
  px(g, x + 1, y - 2, 2, 3, inner);
  px(g, x + 1, y - 4, 1, 2, '#fff2b0');
}

/* ================= 2. TILES (16x16) ================= */

function paintGrass(g, seed) {
  var base = '#45a049';
  px(g, 0, 0, 16, 16, base);
  speckle(g, seed, 16, shade(base, 0.82), shade(base, 1.14));
  // a few grass blades
  for (var i = 0; i < 5; i++) {
    var x = Math.floor(rnd2(i, 3, seed + 50) * 15);
    var y = Math.floor(rnd2(i, 5, seed + 50) * 14);
    px(g, x, y, 1, 2, shade(base, 0.7));
  }
}
function paintGrass2(g, seed) {
  var base = '#3d8b40';
  px(g, 0, 0, 16, 16, base);
  speckle(g, seed, 18, shade(base, 0.8), shade(base, 1.12));
}
function paintDirt(g, seed) {
  var base = '#8a6239';
  px(g, 0, 0, 16, 16, base);
  speckle(g, seed, 18, shade(base, 0.78), shade(base, 1.16));
}
function paintSand(g, seed) {
  var base = '#e0c47a';
  px(g, 0, 0, 16, 16, base);
  speckle(g, seed, 14, shade(base, 0.86), '#f4e3a8');
}
function paintStone(g) {
  var base = '#8f8f96';
  px(g, 0, 0, 16, 16, base);
  speckle(g, 77, 14, shade(base, 0.78), shade(base, 1.1));
  px(g, 3, 5, 5, 1, shade(base, 0.7));   // cracks
  px(g, 9, 11, 4, 1, shade(base, 0.7));
}
function paintSnow(g) {
  var base = '#eef4f8';
  px(g, 0, 0, 16, 16, base);
  speckle(g, 78, 10, '#cfdde8', '#ffffff');
}
function paintPath(g) {
  var base = '#c2a165';
  px(g, 0, 0, 16, 16, base);
  speckle(g, 79, 14, shade(base, 0.84), shade(base, 1.1));
  px(g, 0, 0, 16, 1, shade(base, 0.8));
  px(g, 0, 15, 16, 1, shade(base, 0.8));
}
function paintWoodFloor(g) {
  var base = '#9a6b3f';
  px(g, 0, 0, 16, 16, base);
  for (var y = 0; y < 16; y += 4) {
    px(g, 0, y + 3, 16, 1, '#6f4a2a');
    px(g, (y * 3) % 16, y, 1, 3, '#6f4a2a');
  }
  speckle(g, 80, 6, shade(base, 0.85), base);
}
function paintStoneFloor(g) {
  var base = '#7d7d84';
  px(g, 0, 0, 16, 16, base);
  px(g, 0, 7, 16, 1, '#5c5c63');
  px(g, 7, 0, 1, 16, '#5c5c63');
  px(g, 0, 15, 16, 1, '#5c5c63');
  speckle(g, 81, 8, shade(base, 0.85), shade(base, 1.08));
}
function paintBridge(g) {
  var base = '#8f6238';
  px(g, 0, 0, 16, 16, '#3f9fe0'); // water under bridge
  for (var x = 0; x < 16; x += 4) px(g, x, 2, 3, 12, base);
  px(g, 0, 2, 16, 1, '#6b4726');
  px(g, 0, 13, 16, 1, '#6b4726');
  px(g, 0, 0, 16, 2, '#6b4726'); // rails
  px(g, 0, 14, 16, 2, '#6b4726');
}
function paintDarkStone(g) {
  var base = '#4a4a55';
  px(g, 0, 0, 16, 16, base);
  px(g, 0, 7, 16, 1, '#34343e');
  px(g, 5, 0, 1, 7, '#34343e');
  px(g, 11, 8, 1, 8, '#34343e');
  px(g, 0, 15, 16, 1, '#34343e');
  speckle(g, 82, 8, shade(base, 0.8), shade(base, 1.15));
}
function paintCobble(g) {
  var base = '#9b9b9b';
  px(g, 0, 0, 16, 16, '#767676');
  var stones = [[0,0,7,7],[8,0,8,7],[0,8,5,8],[6,8,5,8],[12,8,4,8]];
  for (var i = 0; i < stones.length; i++) {
    var s = stones[i];
    px(g, s[0] + 1, s[1] + 1, s[2] - 1, s[3] - 1, i % 2 ? base : shade(base, 1.06));
    px(g, s[0] + 1, s[1] + 1, s[2] - 1, 1, shade(base, 1.18));
  }
}
function paintWater(g, deep, ph) {
  var base = deep ? '#1e56c8' : '#3f9fe0';
  var dark = deep ? '#17418f' : '#2f7fc4';
  var wave = deep ? '#6fa8ff' : '#bfe6ff';
  px(g, 0, 0, 16, 16, base);
  speckle(g, deep ? 11 : 21, 10, dark, dark);
  for (var i = 0; i < 4; i++) {
    var x = (i * 4 + (ph ? 2 : 0)) % 16;
    px(g, x, 3 + i * 3, 3, 1, wave);
  }
}

// static tile painters: name -> painter(g, variant)
var TILE_PAINTERS = {
  grass:        function (g, v) { paintGrass(g, 100 + v); },
  grass2:       function (g, v) { paintGrass2(g, 200 + v); },
  dirt:         function (g, v) { paintDirt(g, 300 + v); },
  sand:         function (g, v) { paintSand(g, 400 + v); },
  stone:        function (g) { paintStone(g); },
  snow:         function (g) { paintSnow(g); },
  path:         function (g) { paintPath(g); },
  wood_floor:   function (g) { paintWoodFloor(g); },
  stone_floor:  function (g) { paintStoneFloor(g); },
  bridge:       function (g) { paintBridge(g); },
  dark_stone:   function (g) { paintDarkStone(g); },
  cobble:       function (g) { paintCobble(g); },
  water_deep:   function (g) { paintWater(g, true, 0); },
  water_shallow:function (g) { paintWater(g, false, 0); }
};

var TILES = {}; // name -> canvas (variant 0), built in init()

function tile(name, variant) {
  if (name == null) return null;
  var v = variant | 0;
  if (v === 0 && TILES[name]) return TILES[name];
  var p = TILE_PAINTERS[name];
  if (!p) return null;
  var c = cnv(16, 16);
  p(c.getContext('2d'), v);
  return c;
}
function tileVar(name, v) { return tile(name, v); }

/* ================= 3. ANIMATED TILESETS ================= */

function paintCampfire(g, ph) {
  px(g, 2, 12, 2, 2, '#8f8f96');
  px(g, 12, 12, 2, 2, '#8f8f96');
  px(g, 3, 10, 2, 2, '#7a7a80');
  px(g, 11, 10, 2, 2, '#7a7a80');
  px(g, 4, 11, 8, 2, '#6b4a2a');   // logs
  px(g, 5, 10, 6, 1, '#54371e');
  flame(g, 6, ph ? 7 : 6, ph);
}
function paintFountain(g, ph) {
  px(g, 2, 11, 12, 4, '#8f8f96');
  px(g, 2, 11, 12, 1, '#a5a5ab');
  px(g, 4, 9, 8, 2, ph ? '#4aa3e8' : '#3f9fe0');
  px(g, 7, 4, 2, 6, '#8f8f96');
  px(g, 6, 2, 4, 2, '#a5a5ab');
  px(g, 5, 4, 1, 5, '#bfe6ff');
  px(g, 10, 4, 1, 5, '#bfe6ff');
  if (ph) px(g, 4, 9, 8, 1, '#dcf2ff');
  else px(g, 6, 9, 4, 1, '#dcf2ff');
}
function paintTorch(g, ph) {
  px(g, 7, 8, 2, 7, '#6b4a2a');
  px(g, 7, 14, 2, 1, '#54371e');
  flame(g, 6, ph ? 5 : 4, ph);
}
function paintWaystone(g, ph) {
  px(g, 5, 19, 6, 3, '#6f6f75');
  px(g, 6, 4, 4, 16, '#8f8f96');
  px(g, 6, 4, 1, 16, '#a5a5ab');
  px(g, 9, 4, 1, 16, '#6f6f75');
  var rc = ph ? '#7fd4ff' : '#2f7fc4';
  px(g, 7, 8, 2, 3, rc);
  px(g, 7, 14, 2, 3, rc);
}
function paintFurnace(g, ph) {
  px(g, 2, 4, 12, 11, '#7a7a80');
  px(g, 2, 4, 12, 2, '#8f8f96');
  px(g, 5, 8, 6, 6, '#2a2a30');
  var fc = ph ? '#ffdd55' : '#ff9933';
  px(g, 6, 10, 4, 3, fc);
  px(g, 7, 8, 2, 2, '#fff2b0');
  px(g, 4, 2, 8, 2, '#6f6f75');
}

// name -> [frame canvases]; built in init()
var TILESET_DEFS = {
  water_deep:    { w: 16, h: 16, n: 2, paint: function (g, ph) { paintWater(g, true, ph); } },
  water_shallow: { w: 16, h: 16, n: 2, paint: function (g, ph) { paintWater(g, false, ph); } },
  campfire:      { w: 16, h: 16, n: 2, paint: paintCampfire },
  fountain:      { w: 16, h: 16, n: 2, paint: paintFountain },
  torch:         { w: 16, h: 16, n: 2, paint: paintTorch },
  waystone:      { w: 16, h: 24, n: 2, paint: paintWaystone },
  furnace:       { w: 16, h: 16, n: 2, paint: paintFurnace }
};
var SETS = {};

function tileset(name) { return SETS[name] || null; }

function frame(name, tick) {
  var set = SETS[name];
  if (set && set.length) {
    var i = Math.floor((tick || 0) * 4) % set.length;
    if (i < 0) i += set.length;
    return set[i];
  }
  return tile(name) || obj(name) || null;
}

/* ================= 4. HUMANOID PAINTER (player + NPCs) =================
 * 16x24 chibi. o = {dir, phase, skin, hair, shirt, pants, boots,
 *   hairStyle, beard, beardColor, hood, hoodColor, hat, helmet, crown,
 *   robe, apron, mask, cape, capeColor, angry}
 * phase: 0 idle, 1 walk1, 2 walk2, 3 walk1-mirror
 */
function paintHumanoid(g, o) {
  var skin = o.skin || '#f2c18a';
  var hair = o.hair || '#5a3a22';
  var shirt = o.shirt || '#3f7fbf';
  var pants = o.pants || '#4a3b2a';
  var boots = o.boots || '#5b4632';
  var dir = o.dir || 'down';
  var ph = (o.phase | 0) % 4;
  var hD = shade(hair, 0.72), sD = shade(skin, 0.78), shD = shade(shirt, 0.68);
  var legL = [0, -1, 0, 1][ph], legR = [0, 1, 0, -1][ph];
  var armO = [0, 1, 0, -1][ph];
  var eye = o.eyeColor || '#22222c';

  function bodyFront() {
    // cape behind body
    if (o.cape) {
      var cc = o.capeColor || '#7a2e2e';
      px(g, 2, 11, 2, 9, cc); px(g, 12, 11, 2, 9, cc);
      px(g, 2, 19, 12, 2, shade(cc, 0.8));
    }
    // arms (swing with walk)
    px(g, 2, 11 + armO, 2, 5, shirt); px(g, 12, 11 - armO, 2, 5, shirt);
    px(g, 2, 16 + armO, 2, 2, skin);  px(g, 12, 16 - armO, 2, 2, skin);
    // tunic
    if (o.robe) {
      px(g, 4, 11, 8, 10, shirt);
      px(g, 4, 11, 1, 10, shade(shirt, 1.18));
      px(g, 11, 11, 1, 10, shD);
      px(g, 4, 19, 8, 2, shD);
    } else {
      px(g, 4, 11, 8, 7, shirt);
      px(g, 4, 11, 1, 7, shade(shirt, 1.18));
      px(g, 11, 11, 1, 7, shD);
      px(g, 4, 15, 8, 2, '#3a2c1c');       // belt
      px(g, 7, 15, 2, 2, '#d8a928');       // buckle
      if (o.apron) px(g, 6, 12, 4, 7, '#7a5230');
      // legs + boots
      px(g, 5, 18 + legL, 2, 4, pants);
      px(g, 9, 18 + legR, 2, 4, pants);
      px(g, 4, 22 + legL, 4, 2, boots);
      px(g, 8, 22 + legR, 4, 2, boots);
    }
  }
  function headFront() {
    px(g, 3, 1, 10, 7, hair);             // hair back mass
    if (o.hairStyle === 'long') px(g, 2, 4, 2, 9, hair), px(g, 12, 4, 2, 9, hair);
    px(g, 4, 3, 8, 7, skin);              // face
    px(g, 3, 0, 10, 3, hair);             // hair top
    px(g, 3, 3, 10, 1, hair);             // fringe
    px(g, 3, 4, 1, 5, hair); px(g, 12, 4, 1, 5, hair); // side hair
    px(g, 3, 6, 1, 2, sD); px(g, 12, 6, 1, 2, sD);     // ears
    px(g, 5, 6, 2, 2, eye); px(g, 9, 6, 2, 2, eye);    // eyes
    if (o.angry) { px(g, 5, 5, 2, 1, hD); px(g, 9, 5, 2, 1, hD); }
    if (o.mask) px(g, 4, 5, 8, 2, '#2c2c34');          // bandit mask
    px(g, 7, 8, 2, 1, sD);                             // mouth
    if (o.beard) px(g, 4, 8, 8, 3, o.beardColor || shade(hair, 1.4));
  }
  function headBack() {
    px(g, 3, 0, 10, 9, hair);
    px(g, 3, 0, 10, 2, shade(hair, 1.12));
    px(g, 11, 2, 2, 7, hD);
    px(g, 4, 9, 8, 1, skin); // neck
  }
  function headSide() { // facing right
    px(g, 3, 0, 10, 3, hair);
    px(g, 3, 3, 4, 7, hair);              // back hair
    px(g, 7, 3, 6, 7, skin);              // face profile
    px(g, 13, 6, 1, 2, sD);               // nose
    px(g, 10, 6, 2, 2, eye);
    if (o.mask) px(g, 8, 5, 5, 2, '#2c2c34');
    if (o.beard) px(g, 8, 8, 5, 3, o.beardColor || shade(hair, 1.4));
  }
  function headgearFront() {
    if (o.hood) {
      var hc = o.hoodColor || shade(shirt, 0.7);
      px(g, 2, 0, 12, 10, hc);
      px(g, 4, 3, 8, 7, skin);
      px(g, 5, 6, 2, 2, eye); px(g, 9, 6, 2, 2, eye);
      px(g, 2, 0, 12, 1, shade(hc, 1.15));
    } else if (o.hat) {
      px(g, 1, 3, 14, 2, '#6b4a2a');
      px(g, 5, 0, 6, 3, '#6b4a2a');
      px(g, 5, 2, 6, 1, '#3d2c17');
    } else if (o.helmet) {
      px(g, 3, 0, 10, 4, '#9aa2ad');
      px(g, 3, 0, 10, 1, '#c3c9d1');
      px(g, 7, 3, 2, 5, '#6f757e');
    } else if (o.crown) {
      px(g, 4, 1, 8, 2, '#e8b923');
      px(g, 4, 0, 2, 1, '#e8b923'); px(g, 7, 0, 2, 1, '#e8b923'); px(g, 10, 0, 2, 1, '#e8b923');
    }
  }

  if (dir === 'up') {
    bodyFront();
    headBack();
    if (o.hood) { var hc2 = o.hoodColor || shade(shirt, 0.7); px(g, 2, 0, 12, 10, hc2); }
    else if (o.helmet) { px(g, 3, 0, 10, 4, '#9aa2ad'); }
    else if (o.hat) { px(g, 1, 3, 14, 2, '#6b4a2a'); px(g, 5, 0, 6, 3, '#6b4a2a'); }
    else if (o.crown) { px(g, 4, 1, 8, 2, '#e8b923'); }
  } else if (dir === 'side') {
    bodyFront();
    headSide();
    if (o.hood) { var hc3 = o.hoodColor || shade(shirt, 0.7); px(g, 2, 0, 12, 10, hc3); px(g, 6, 3, 7, 7, skin); px(g, 10, 6, 2, 2, eye); }
    else if (o.helmet) { px(g, 3, 0, 10, 4, '#9aa2ad'); }
    else if (o.hat) { px(g, 1, 3, 14, 2, '#6b4a2a'); px(g, 5, 0, 6, 3, '#6b4a2a'); }
    else if (o.crown) { px(g, 4, 1, 8, 2, '#e8b923'); }
  } else { // down
    bodyFront();
    headFront();
    headgearFront();
  }
}

function playerFrames(colors) {
  colors = colors || {};
  var spec = {
    skin: colors.skin || '#f2c18a',
    hair: colors.hair || '#5a3a22',
    shirt: colors.shirt || '#3f7fbf',
    pants: colors.pants || '#4a3b2a',
    boots: colors.boots || '#5b4632'
  };
  function dirSet(dir) {
    var arr = [];
    for (var ph = 0; ph < 4; ph++) {
      arr.push(spr(16, 24, (function (d, p) {
        return function (g) { paintHumanoid(g, { dir: d, phase: p, skin: spec.skin, hair: spec.hair, shirt: spec.shirt, pants: spec.pants, boots: spec.boots }); };
      })(dir, ph)));
    }
    return arr;
  }
  var right = dirSet('side');
  return {
    down: dirSet('down'),
    up: dirSet('up'),
    right: right,
    left: right.map(flipH)
  };
}

/* ================= 5. NPCs ================= */

var NPC_DEFS = {
  elder:      { skin: '#e8b98a', hair: '#e8e8e8', shirt: '#6a4a8a', pants: '#3a3a4a', boots: '#4a3a2a', robe: true, beard: true, beardColor: '#f0f0f0', staff: true },
  blacksmith: { skin: '#d8a06a', hair: '#2c1e12', shirt: '#8a3a2e', pants: '#4a3b2a', boots: '#3a2c1c', apron: true, angry: true },
  merchant:   { skin: '#f2c18a', hair: '#3a2a1a', shirt: '#7a5aaa', pants: '#3a3a4a', boots: '#5b4632', robe: true, hat: true },
  guard:      { skin: '#e8b98a', hair: '#4a3a2a', shirt: '#5a7a9a', pants: '#3a3f4a', boots: '#3a3a3a', helmet: true, spear: true },
  herbalist:  { skin: '#d8a06a', hair: '#3a5a2a', shirt: '#4a8a4a', pants: '#3a4a2a', boots: '#4a3a2a', robe: true, hood: true, hoodColor: '#3a6a3a', hairStyle: 'long' },
  villager:   { skin: '#f2c18a', hair: '#6a4a2a', shirt: '#8a8a5a', pants: '#4a4a5a', boots: '#5b4632' },
  villager2:  { skin: '#d8a06a', hair: '#1a1a1a', shirt: '#b06a4a', pants: '#3a3a4a', boots: '#4a3a2a', hairStyle: 'long' }
};

function paintNpcExtras(g, kind) {
  if (kind === 'elder') { // staff in hand
    px(g, 13, 8, 1, 13, '#6b4a2a');
    px(g, 12, 5, 3, 3, '#7fd4ff');
  } else if (kind === 'guard') { // spear
    px(g, 13, 4, 1, 17, '#6b4a2a');
    px(g, 13, 2, 1, 2, '#c3c9d1');
  }
}

function npcFrames(kind) {
  var def = NPC_DEFS[kind] || NPC_DEFS.villager;
  function dirSet(dir) {
    var arr = [];
    for (var ph = 0; ph < 2; ph++) {
      arr.push(spr(16, 24, (function (d, p) {
        return function (g) {
          var o = { dir: d, phase: p };
          for (var k in def) o[k] = def[k];
          paintHumanoid(g, o);
          if (d === 'down') paintNpcExtras(g, kind);
        };
      })(dir, ph)));
    }
    return arr;
  }
  var right = dirSet('side');
  return {
    down: dirSet('down'),
    up: dirSet('up'),
    right: right,
    left: right.map(flipH)
  };
}

/* ================= 6. ENEMIES =================
 * Each def: {w, h, paint(g, view, phase)}. view is 'front'|'side'|'back'
 * but most enemies reuse the same art for all views; left is auto-flipped.
 */

function paintSlimeBody(g, ox, oy, w, h, color, crown, angry) {
  var cD = shade(color, 0.7), cL = shade(color, 1.18);
  px(g, ox + 3, oy, w - 6, 2, cL);
  px(g, ox + 1, oy + 2, w - 2, h - 4, color);
  px(g, ox, oy + 3, w, h - 5, color);
  px(g, ox + 1, oy + h - 2, w - 2, 2, cD);
  px(g, ox + 3, oy + h - 1, w - 6, 1, shade(color, 0.55));
  var ex = ox + Math.floor(w / 2), ey = oy + Math.floor(h / 2) - 1;
  var ec = angry ? '#c62e2e' : '#22222c';
  px(g, ex - 3, ey, 2, 2, ec); px(g, ex + 1, ey, 2, 2, ec);
  if (!angry) { px(g, ex - 3, ey, 1, 1, '#fff'); px(g, ex + 1, ey, 1, 1, '#fff'); }
  if (angry) { px(g, ex - 3, ey - 1, 2, 1, shade(color, 0.6)); px(g, ex + 1, ey - 1, 2, 1, shade(color, 0.6)); }
  if (crown) {
    px(g, ex - 5, oy - 1, 10, 3, '#e8b923');
    px(g, ex - 5, oy - 3, 2, 2, '#e8b923'); px(g, ex - 1, oy - 3, 2, 2, '#e8b923'); px(g, ex + 3, oy - 3, 2, 2, '#e8b923');
    px(g, ex - 2, oy, 4, 1, '#c62e2e');
  }
}

function paintWolf(g, phase) {
  var base = '#7a7a7a', d = shade(base, 0.72), l = shade(base, 1.15);
  px(g, 0, 3, 2, 2, d);                       // tail
  px(g, 2, 4, 11, 5, base);                   // body
  px(g, 2, 4, 11, 1, l);
  px(g, 2, 8, 11, 1, d);
  px(g, 11, 2, 4, 5, base);                   // head
  px(g, 11, 1, 2, 2, d);                      // ear
  px(g, 14, 4, 2, 2, l);                      // snout
  px(g, 15, 4, 1, 1, '#22222c');              // nose
  px(g, 12, 3, 2, 2, '#c62e2e');              // eye
  var legs = [3, 6, 9, 12];
  for (var i = 0; i < 4; i++) {
    var lift = (phase === 1 && i % 2 === 0) ? 1 : 0; // alternate legs lift on walk frame
    px(g, legs[i], 9 - lift, 2, 3, d);
  }
}

function paintGoblin(g, phase, scale) {
  scale = scale || 1;
  var s = scale, green = '#58b368', gd = shade(green, 0.7);
  var oy = phase ? -1 : 0;
  function R(x, y, w, h, c) { px(g, x * s, (y + oy) * s, w * s, h * s, c); }
  R(0, 4, 2, 3, gd); R(10, 4, 2, 3, gd);      // ears
  R(2, 2, 8, 7, green);                        // head
  R(2, 2, 8, 2, shade(green, 1.15));
  R(4, 5, 2, 2, '#c62e2e'); R(7, 5, 2, 2, '#c62e2e'); // angry eyes
  R(5, 8, 3, 1, gd);                           // mouth
  R(1, 9, 2, 4, green); R(9, 9, 2, 4, green);   // arms
  R(3, 9, 6, 5, '#5a3d22');                    // loincloth
  R(3, 14, 2, 3, green); R(7, 14, 2, 3, green); // legs
  R(2, 16, 4, 2, gd); R(6, 16, 4, 2, gd);      // feet
}
function paintBow(g, x, y) {
  var b = '#6b4a2a';
  px(g, x, y, 1, 8, b);
  px(g, x + 1, y + 1, 1, 1, b); px(g, x + 2, y + 2, 1, 1, b);
  px(g, x + 1, y + 6, 1, 1, b); px(g, x + 2, y + 5, 1, 1, b);
  px(g, x + 3, y + 3, 1, 2, '#d8cfc0'); // string
}

function paintSkeleton(g, phase) {
  var w = '#e8e8e8', d = '#b9b9c0';
  var oy = phase ? -1 : 0;
  function R(x, y, ww, hh, c) { px(g, x, y + oy, ww, hh, c); }
  R(3, 2, 6, 6, w);                            // skull
  R(3, 2, 6, 1, '#ffffff');
  R(4, 4, 2, 2, '#22222c'); R(7, 4, 2, 2, '#22222c');
  R(4, 7, 5, 1, d);                            // teeth
  R(5, 9, 2, 1, d);                            // neck
  for (var i = 0; i < 3; i++) R(4, 10 + i * 2, 5, 1, w); // ribs
  R(2, 10, 2, 4, w); R(9, 10, 2, 4, w);        // arms
  R(4, 15, 2, 3, w); R(7, 15, 2, 3, w);        // legs
  R(3, 17, 4, 1, d); R(6, 17, 4, 1, d);
}

function paintBat(g, phase) {
  var b = '#5a3a7a', d = shade(b, 0.65);
  if (phase === 0) { // wings up
    px(g, 0, 0, 5, 4, d); px(g, 9, 0, 5, 4, d);
    px(g, 1, 4, 3, 2, b); px(g, 10, 4, 3, 2, b);
  } else {           // wings down
    px(g, 0, 5, 5, 4, d); px(g, 9, 5, 5, 4, d);
  }
  px(g, 5, 4, 4, 4, b);                        // body
  px(g, 5, 2, 1, 2, d); px(g, 8, 2, 1, 2, d);  // ears
  px(g, 6, 5, 1, 1, '#ff5a5a'); px(g, 8, 5, 1, 1, '#ff5a5a');
}

function paintSpider(g, phase) {
  var b = '#3a2a4a', d = shade(b, 0.6);
  var lo = phase ? 1 : 0;
  for (var i = 0; i < 4; i++) {
    var y = 2 + i * 2;
    px(g, 0, y + (i % 2 ? lo : 0), 4, 1, d);
    px(g, 10, y + (i % 2 ? 0 : lo), 4, 1, d);
  }
  px(g, 4, 3, 6, 5, b);                        // abdomen
  px(g, 5, 2, 4, 3, shade(b, 1.2));            // head
  px(g, 5, 3, 1, 1, '#ff5a5a'); px(g, 8, 3, 1, 1, '#ff5a5a');
  px(g, 6, 2, 2, 1, '#ff5a5a');
}

function paintGolem(g, phase) {
  var base = '#8a8a92', d = shade(base, 0.68), l = shade(base, 1.15);
  px(g, 6, 17, 4, 6, base); px(g, 14, 17, 4, 6, base); // legs
  px(g, 6, 21, 4, 2, d); px(g, 14, 21, 4, 2, d);
  px(g, 5, 8, 14, 10, base);                   // torso
  px(g, 5, 8, 14, 2, l);
  px(g, 5, 16, 14, 2, d);
  px(g, 8, 11, 3, 3, d); px(g, 13, 13, 3, 2, d); // cracks
  var ay = phase ? -2 : 0;
  px(g, 1, 9 + ay, 4, 8, base); px(g, 19, 9 - ay, 4, 8, base); // arms
  px(g, 1, 15 + ay, 4, 2, d); px(g, 19, 15 - ay, 4, 2, d);
  px(g, 9, 3, 6, 6, base);                     // head
  px(g, 9, 3, 6, 1, l);
  px(g, 10, 5, 2, 2, '#ff9933'); px(g, 13, 5, 2, 2, '#ff9933');
  px(g, 6, 9, 2, 2, '#4a8a4a'); px(g, 16, 14, 2, 2, '#4a8a4a'); // moss
}

function paintWraith(g, phase) {
  var oy = phase ? -1 : 1;
  var b = '#9fd4e8', d = '#5a8aa8';
  function R(x, y, w, h, c) { px(g, x, y + oy, w, h, c); }
  R(4, 2, 6, 4, d);                            // hood
  R(5, 4, 4, 4, '#1a2a3a');                    // face void
  R(5, 5, 2, 2, '#7fd4ff'); R(8, 5, 2, 2, '#7fd4ff'); // glowing eyes
  R(4, 8, 6, 5, b);                            // body
  R(4, 13, 2, 3, b); R(6, 13, 2, 4, b); R(8, 13, 2, 3, b); // wisps
  R(2, 9, 2, 4, shade(b, 0.85)); R(10, 9, 2, 4, shade(b, 0.85)); // arms
}

function paintCrawler(g, phase) {
  var b = '#5a3a6a', d = shade(b, 0.6), l = shade(b, 1.25);
  var lo = phase ? 1 : 0;
  for (var i = 0; i < 4; i++) {
    var x = 2 + i * 3;
    px(g, x, 7 + (i % 2 ? lo : 0), 1, 3, d);
  }
  px(g, 2, 4, 9, 4, b);                        // segments
  px(g, 2, 4, 9, 1, l);
  px(g, 5, 4, 1, 4, d); px(g, 8, 4, 1, 4, d);
  px(g, 11, 3, 3, 4, shade(b, 1.15));          // head
  px(g, 13, 5, 2, 1, '#ff5a5a');               // mandible
  px(g, 11, 4, 1, 1, '#ff5a5a'); px(g, 12, 4, 1, 1, '#ff5a5a');
}

function paintTroll(g, phase) {
  var base = '#4a7a3a', d = shade(base, 0.68), l = shade(base, 1.15);
  var ay = phase ? -2 : 0;
  px(g, 8, 17, 3, 6, d); px(g, 13, 17, 3, 6, d); // legs
  px(g, 6, 8, 12, 10, base);                   // torso
  px(g, 6, 8, 12, 2, l);
  px(g, 7, 12, 3, 2, '#5a9a4a'); px(g, 13, 15, 4, 2, '#5a9a4a'); // moss
  px(g, 1, 9 + ay, 5, 9, base); px(g, 18, 9 - ay, 5, 9, base);   // arms
  px(g, 1, 16 + ay, 5, 2, d); px(g, 18, 16 - ay, 5, 2, d);
  px(g, 9, 2, 6, 7, base);                      // head
  px(g, 10, 5, 2, 2, '#ffdd55'); px(g, 13, 5, 2, 2, '#ffdd55');
  px(g, 9, 8, 1, 2, '#e8e8e8'); px(g, 15, 8, 1, 2, '#e8e8e8');   // tusks
}

function paintGoblinWarlord(g, phase) {
  var green = '#58b368', gd = shade(green, 0.7);
  var oy = phase ? -1 : 0;
  function R(x, y, w, h, c) { px(g, x, y + oy, w, h, c); }
  R(4, 8, 3, 14, '#7a2e2e'); R(17, 8, 3, 14, '#7a2e2e'); // cape
  R(6, 2, 12, 4, '#3a3a4a');                   // horned helmet
  R(4, 0, 3, 3, '#e8e8e8'); R(17, 0, 3, 3, '#e8e8e8');   // horns
  R(7, 5, 10, 7, green);                       // face
  R(9, 8, 3, 2, '#c62e2e'); R(14, 8, 3, 2, '#c62e2e');
  R(6, 12, 12, 8, '#4a5a3a');                  // armor torso
  R(6, 12, 12, 2, '#9aa2ad');
  R(3, 12, 3, 7, green);                       // arms
  R(2, 10, 2, 10, '#6b4a2a');                  // axe haft
  R(0, 6, 6, 5, '#9aa2ad');                    // axe head
  R(9, 20, 3, 3, green); R(13, 20, 3, 3, green);
}

function paintSkeletonLord(g, phase) {
  var w = '#e8e8e8', d = '#b9b9c0';
  var oy = phase ? -1 : 0;
  function R(x, y, ww, hh, c) { px(g, x, y + oy, ww, hh, c); }
  R(5, 10, 3, 12, '#3a2a5a'); R(16, 10, 3, 12, '#3a2a5a'); // cape
  R(8, 2, 8, 7, w);                            // skull
  R(7, 0, 10, 3, '#e8b923');                   // crown
  R(7, 0, 2, 1, '#fff2b0'); R(11, 0, 2, 1, '#fff2b0'); R(15, 0, 2, 1, '#fff2b0');
  R(10, 5, 3, 3, '#7a2ee8'); R(14, 5, 3, 3, '#7a2ee8'); // purple eyes
  R(8, 10, 8, 10, '#6a6a72');                  // armor
  R(8, 10, 8, 2, '#9aa2ad');
  for (var i = 0; i < 3; i++) R(10, 13 + i * 2, 5, 1, d);
  R(5, 11, 3, 7, w);                           // arm
  R(18, 8, 2, 12, '#c3c9d1');                  // sword
  R(17, 6, 4, 2, '#e8b923');
  R(10, 20, 3, 3, w); R(14, 20, 3, 3, w);
}

// map enemy view names to humanoid directions
function hdir(v) { return v === 'back' ? 'up' : (v === 'side' ? 'side' : 'down'); }

var ENEMIES = {
  slime:             { w: 14, h: 10, paint: function (g, v, ph) { if (ph) paintSlimeBody(g, 0, 2, 14, 8, '#4fc34f'); else paintSlimeBody(g, 1, 0, 12, 10, '#4fc34f'); } },
  slime_big:         { w: 20, h: 15, paint: function (g, v, ph) { if (ph) paintSlimeBody(g, 0, 3, 20, 12, '#4fc34f'); else paintSlimeBody(g, 2, 0, 16, 15, '#4fc34f'); } },
  wolf:              { w: 16, h: 12, paint: function (g, v, ph) { paintWolf(g, ph); } },
  goblin:            { w: 12, h: 18, paint: function (g, v, ph) { paintGoblin(g, ph); } },
  goblin_archer:     { w: 14, h: 18, paint: function (g, v, ph) { paintGoblin(g, ph); paintBow(g, 11, 8); } },
  skeleton:          { w: 12, h: 18, paint: function (g, v, ph) { paintSkeleton(g, ph); } },
  skeleton_archer:   { w: 14, h: 18, paint: function (g, v, ph) { paintSkeleton(g, ph); paintBow(g, 11, 8); } },
  bat:               { w: 14, h: 10, paint: function (g, v, ph) { paintBat(g, ph); } },
  spider:            { w: 14, h: 10, paint: function (g, v, ph) { paintSpider(g, ph); } },
  bandit:            { w: 16, h: 24, paint: function (g, v, ph) { paintHumanoid(g, { dir: hdir(v), phase: ph, skin: '#d8a06a', hair: '#2c1e12', shirt: '#4a4a5a', pants: '#3a3a4a', boots: '#2c2c34', hood: true, hoodColor: '#3a3a44', mask: true, angry: true }); } },
  bandit_brute:      { w: 16, h: 24, paint: function (g, v, ph) { paintHumanoid(g, { dir: hdir(v), phase: ph, skin: '#c89868', hair: '#1a1a1a', shirt: '#6a3a2e', pants: '#2c2c34', boots: '#1a1a1a', hood: true, hoodColor: '#2c2c34', mask: true, angry: true }); } },
  undead_knight:     { w: 16, h: 24, paint: function (g, v, ph) { paintHumanoid(g, { dir: hdir(v), phase: ph, skin: '#9a9a8a', hair: '#3a3a3a', shirt: '#5a6a7a', pants: '#3a3f4a', boots: '#2c2c34', helmet: true, angry: true, eyeColor: '#7fd4ff' }); if (v !== 'back') { px(g, 13, 8, 2, 12, '#c3c9d1'); px(g, 12, 6, 4, 2, '#e8b923'); } } },
  stone_golem:       { w: 24, h: 24, paint: function (g, v, ph) { paintGolem(g, ph); } },
  ice_wraith:        { w: 14, h: 18, paint: function (g, v, ph) { paintWraith(g, ph); } },
  cave_crawler:      { w: 14, h: 10, paint: function (g, v, ph) { paintCrawler(g, ph); } },
  moss_troll:        { w: 24, h: 24, paint: function (g, v, ph) { paintTroll(g, ph); } },
  boss_slime_king:   { w: 32, h: 32, paint: function (g, v, ph) { if (ph) paintSlimeBody(g, 1, 9, 30, 22, '#58c74f', true, true); else paintSlimeBody(g, 3, 6, 26, 26, '#58c74f', true, true); } },
  boss_goblin_warlord:{ w: 24, h: 24, paint: function (g, v, ph) { paintGoblinWarlord(g, ph); } },
  boss_skeleton_lord:{ w: 24, h: 24, paint: function (g, v, ph) { paintSkeletonLord(g, ph); } },
  __fallback:        { w: 14, h: 10, paint: function (g, v, ph) { if (ph) paintSlimeBody(g, 0, 2, 14, 8, '#ff00ff'); else paintSlimeBody(g, 1, 0, 12, 10, '#ff00ff'); } }
};

function enemyFrames(id) {
  var def = ENEMIES[id] || ENEMIES.__fallback;
  function viewSet(view) {
    var arr = [];
    for (var ph = 0; ph < 2; ph++) {
      arr.push(spr(def.w, def.h, (function (vw, p) {
        return function (g) { def.paint(g, vw, p); };
      })(view, ph)));
    }
    return arr;
  }
  var right = viewSet('side');
  return {
    down: viewSet('front'),
    up: viewSet('back'),
    right: right,
    left: right.map(flipH)
  };
}

/* ================= 7. ITEM ICONS (16x16) ================= */

function roundBg(g, bg) {
  px(g, 2, 0, 12, 16, bg);
  px(g, 0, 2, 16, 12, bg);
  px(g, 1, 1, 14, 14, bg);
  var bd = shade(bg, 0.62);
  px(g, 2, 0, 12, 1, bd); px(g, 2, 15, 12, 1, bd);
  px(g, 0, 2, 1, 12, bd); px(g, 15, 2, 1, 12, bd);
}

function drawIconShape(g, shape, fg, bg) {
  var fD = shade(fg, 0.62), fL = shade(fg, 1.3);
  var i;
  switch (shape) {
    case 'sword':
      px(g, 3, 11, 2, 3, '#6b4a2a'); px(g, 2, 10, 5, 1, '#d8a928'); px(g, 3, 13, 2, 1, '#3d2c17');
      for (i = 0; i < 6; i++) px(g, 5 + i, 10 - i, 2, 1, fD);
      for (i = 0; i < 6; i++) px(g, 5 + i, 9 - i, 2, 1, fg);
      px(g, 11, 2, 2, 2, fL);
      break;
    case 'dagger':
      px(g, 4, 11, 2, 3, '#6b4a2a'); px(g, 3, 10, 4, 1, '#d8a928');
      for (i = 0; i < 4; i++) px(g, 6 + i, 9 - i, 2, 1, fg);
      px(g, 9, 5, 2, 1, fL);
      break;
    case 'axe':
      for (i = 0; i < 8; i++) px(g, 4 + i, 12 - i, 1, 1, '#6b4a2a');
      px(g, 9, 2, 4, 5, fg); px(g, 9, 2, 4, 1, fL); px(g, 9, 6, 4, 1, fD);
      break;
    case 'bow': {
      var pts = [[5, 3], [7, 2], [9, 2], [11, 4], [12, 6], [12, 9], [11, 11], [9, 13], [7, 13]];
      for (i = 0; i < pts.length; i++) px(g, pts[i][0], pts[i][1], 2, 2, fg);
      px(g, 6, 3, 1, 10, '#d8cfc0');
      px(g, 2, 7, 5, 1, fD);
      break;
    }
    case 'staff':
      for (i = 0; i < 9; i++) px(g, 4 + i, 12 - i, 1, 1, '#6b4a2a');
      px(g, 11, 1, 4, 4, fg); px(g, 12, 2, 2, 2, fL);
      break;
    case 'spear':
      for (i = 0; i < 10; i++) px(g, 2 + i, 13 - i, 1, 1, '#6b4a2a');
      px(g, 11, 1, 3, 3, fg); px(g, 12, 0, 1, 1, fL);
      break;
    case 'helmet':
      px(g, 4, 5, 8, 6, fg); px(g, 4, 5, 8, 1, fL); px(g, 4, 10, 8, 1, fD);
      px(g, 3, 9, 10, 2, fD);
      px(g, 6, 7, 4, 1, '#22222c');
      break;
    case 'chest':
      px(g, 3, 4, 10, 9, fg); px(g, 3, 4, 10, 1, fL); px(g, 3, 12, 10, 1, fD);
      px(g, 7, 4, 2, 9, fD); px(g, 4, 8, 8, 1, fD);
      break;
    case 'legs':
      px(g, 3, 3, 10, 3, fg);
      px(g, 4, 6, 3, 7, fg); px(g, 9, 6, 3, 7, fg);
      px(g, 6, 6, 1, 7, fD); px(g, 9, 6, 1, 7, fD);
      break;
    case 'boots':
      px(g, 3, 4, 3, 4, fg); px(g, 10, 4, 3, 4, fg);
      px(g, 2, 8, 5, 4, fg); px(g, 9, 8, 5, 4, fg);
      px(g, 2, 11, 5, 1, fD); px(g, 9, 11, 1, 1, fD); px(g, 9, 11, 5, 1, fD);
      break;
    case 'shield':
      px(g, 4, 2, 8, 11, fg); px(g, 4, 2, 8, 1, fL);
      px(g, 5, 12, 6, 2, fD);
      px(g, 6, 4, 4, 5, fD); px(g, 7, 5, 2, 3, fL);
      break;
    case 'ring':
      px(g, 6, 4, 4, 1, fg); px(g, 6, 11, 4, 1, fg);
      px(g, 5, 5, 1, 6, fg); px(g, 10, 5, 1, 6, fg);
      px(g, 7, 1, 2, 3, fL);
      break;
    case 'potion':
      px(g, 7, 2, 2, 3, fg); px(g, 6, 2, 4, 1, fD);
      px(g, 4, 5, 8, 8, shade(fg, 0.75));
      px(g, 5, 8, 6, 4, fL);
      break;
    case 'food':
      px(g, 5, 5, 6, 7, fg); px(g, 5, 5, 6, 1, fL); px(g, 4, 6, 1, 4, fD);
      px(g, 7, 3, 2, 2, '#6b4a2a'); px(g, 8, 2, 3, 2, '#4a8a4a');
      break;
    case 'meat':
      px(g, 3, 3, 7, 7, fg); px(g, 3, 3, 7, 2, fL);
      px(g, 8, 8, 4, 2, '#e8e8e8'); px(g, 11, 7, 2, 4, '#e8e8e8');
      break;
    case 'ore':
      px(g, 3, 8, 5, 5, '#8f8f96'); px(g, 8, 6, 5, 6, '#7a7a80'); px(g, 6, 3, 4, 4, '#9b9b9b');
      px(g, 4, 9, 2, 2, fg); px(g, 9, 7, 2, 2, fg); px(g, 7, 4, 2, 2, fL);
      break;
    case 'wood':
      px(g, 2, 5, 9, 3, '#8a5a2e'); px(g, 2, 9, 9, 3, '#7a4e26');
      px(g, 11, 5, 3, 3, '#d8b078'); px(g, 11, 9, 3, 3, '#c9a068');
      px(g, 12, 6, 1, 1, '#8a5a2e'); px(g, 12, 10, 1, 1, '#7a4e26');
      break;
    case 'gem':
      px(g, 7, 2, 2, 2, fL);
      px(g, 5, 4, 6, 2, fg); px(g, 4, 6, 8, 2, fg);
      px(g, 6, 8, 4, 2, fD); px(g, 7, 10, 2, 2, fD);
      break;
    case 'key':
      px(g, 3, 3, 5, 5, fg); px(g, 4, 4, 3, 3, bg);
      px(g, 7, 7, 2, 6, fg); px(g, 7, 10, 3, 1, fg); px(g, 7, 12, 2, 1, fg);
      break;
    case 'coin':
      px(g, 4, 9, 8, 3, '#c9962e'); px(g, 4, 9, 8, 1, '#f4d35e');
      px(g, 5, 6, 8, 3, '#c9962e'); px(g, 5, 6, 8, 1, '#f4d35e');
      px(g, 6, 3, 8, 3, '#c9962e'); px(g, 6, 3, 8, 1, '#f4d35e');
      break;
    case 'book':
      px(g, 4, 3, 8, 10, fg); px(g, 4, 3, 2, 10, fD);
      px(g, 6, 3, 6, 10, shade(fg, 1.12));
      px(g, 7, 5, 4, 1, fD); px(g, 7, 7, 4, 1, fD); px(g, 7, 9, 3, 1, fD);
      break;
    case 'herb':
      for (i = 0; i < 6; i++) px(g, 4 + i, 11 - i, 3, 1, fg);
      px(g, 9, 3, 2, 3, fL);
      px(g, 7, 12, 2, 2, '#6b4a2a');
      break;
    case 'tool':
      for (i = 0; i < 9; i++) px(g, 4 + i, 11 - i, 1, 2, '#6b4a2a');
      px(g, 3, 2, 10, 2, fg); px(g, 3, 2, 2, 3, fg); px(g, 11, 2, 2, 3, fg);
      break;
    default: // misc: star
      px(g, 7, 2, 2, 12, fL);
      px(g, 2, 7, 12, 2, fL);
      px(g, 4, 4, 2, 2, fg); px(g, 10, 4, 2, 2, fg);
      px(g, 4, 10, 2, 2, fg); px(g, 10, 10, 2, 2, fg);
      break;
  }
}

var ICON_CACHE = {};

function itemIcon(id) {
  if (id == null) id = '__unknown__';
  if (ICON_CACHE[id]) return ICON_CACHE[id];
  var c = cnv(16, 16);
  var g = c.getContext('2d');
  var icon = null;
  try {
    var items = (PK.Data && PK.Data.ITEMS) ? PK.Data.ITEMS : null;
    var def = items ? items[id] : null;
    icon = def ? def.icon : null;
  } catch (e) { icon = null; }
  if (icon && icon.bg && icon.fg && icon.shape) {
    roundBg(g, icon.bg);
    drawIconShape(g, icon.shape, icon.fg, icon.bg);
  } else {
    roundBg(g, '#5a5a5a');
    px(g, 6, 3, 4, 1, '#ffffff'); px(g, 5, 4, 1, 3, '#ffffff'); px(g, 10, 4, 1, 3, '#ffffff');
    px(g, 6, 7, 4, 1, '#ffffff'); px(g, 7, 8, 1, 2, '#ffffff'); px(g, 7, 11, 1, 1, '#ffffff');
  }
  ICON_CACHE[id] = c;
  return c;
}

/* ================= 8. WORLD OBJECTS ================= */

var OBJ_DEFS = {
  tree_oak: { w: 16, h: 24, paint: function (g) {
    px(g, 7, 14, 2, 10, '#6b4a2a'); px(g, 7, 14, 1, 10, '#7a5636'); px(g, 5, 19, 1, 3, '#54371e');
    px(g, 4, 4, 8, 10, '#2e7d32'); px(g, 3, 6, 10, 7, '#2e7d32'); px(g, 2, 8, 12, 4, '#388e3c');
    px(g, 4, 4, 8, 2, '#43a047');
    speckle(g, 301, 10, '#256528', '#43a047');
  } },
  tree_pine: { w: 16, h: 24, paint: function (g) {
    px(g, 7, 18, 2, 6, '#5a3d22');
    px(g, 5, 12, 6, 7, '#1e5a2a'); px(g, 4, 7, 8, 6, '#256528'); px(g, 3, 2, 10, 6, '#2e7d32');
    px(g, 7, 2, 2, 17, '#388e3c');
  } },
  tree_dead: { w: 16, h: 24, paint: function (g) {
    px(g, 7, 10, 2, 14, '#5a4632'); px(g, 5, 14, 1, 6, '#4a3826');
    px(g, 4, 6, 4, 2, '#5a4632'); px(g, 8, 4, 4, 2, '#5a4632');
    px(g, 2, 4, 3, 1, '#5a4632'); px(g, 11, 2, 3, 1, '#5a4632');
  } },
  rock: { w: 16, h: 16, paint: function (g) {
    px(g, 3, 6, 10, 8, '#8f8f96'); px(g, 4, 4, 7, 3, '#9b9b9b');
    px(g, 3, 6, 10, 2, '#a5a5ab'); px(g, 3, 12, 10, 2, '#6f6f75');
  } },
  bush: { w: 16, h: 16, paint: function (g) {
    px(g, 3, 7, 10, 6, '#2e7d32'); px(g, 2, 9, 12, 4, '#388e3c'); px(g, 4, 7, 8, 2, '#43a047');
    speckle(g, 302, 8, '#256528', '#43a047');
  } },
  flowers: { w: 16, h: 16, paint: function (g) {
    function flower(x, y, c) { px(g, x, y + 3, 1, 5, '#2e7d32'); px(g, x - 1, y + 1, 3, 3, c); px(g, x, y + 2, 1, 1, '#ffdd55'); }
    flower(3, 5, '#e85a7a'); flower(8, 7, '#f4d35e'); flower(12, 4, '#9f7fd4');
  } },
  grass_tuft: { w: 16, h: 16, paint: function (g) {
    px(g, 3, 10, 1, 5, '#45a049'); px(g, 5, 8, 1, 7, '#4caf50'); px(g, 7, 10, 1, 5, '#3d8b40');
    px(g, 10, 9, 1, 6, '#4caf50'); px(g, 12, 11, 1, 4, '#45a049');
  } },
  ore_copper:  { w: 16, h: 16, paint: function (g) { paintOreRock(g, '#c97b4a'); } },
  ore_iron:    { w: 16, h: 16, paint: function (g) { paintOreRock(g, '#c3c9d1'); } },
  ore_gold:    { w: 16, h: 16, paint: function (g) { paintOreRock(g, '#e8b923'); } },
  ore_mithril: { w: 16, h: 16, paint: function (g) { paintOreRock(g, '#7fd4ff'); } },
  chest: { w: 16, h: 16, paint: function (g) {
    px(g, 2, 6, 12, 8, '#8a5a2e'); px(g, 2, 6, 12, 2, '#9a6a38');
    px(g, 2, 6, 2, 8, '#6b4423'); px(g, 12, 6, 2, 8, '#6b4423');
    px(g, 2, 9, 12, 1, '#6b4423');
    px(g, 7, 8, 2, 4, '#e8b923');
  } },
  chest_open: { w: 16, h: 16, paint: function (g) {
    px(g, 2, 10, 12, 5, '#8a5a2e'); px(g, 2, 2, 12, 4, '#9a6a38'); px(g, 2, 5, 2, 5, '#6b4423');
    px(g, 4, 11, 8, 2, '#2a1e12');
    px(g, 5, 10, 2, 2, '#e8b923'); px(g, 9, 10, 2, 1, '#7fd4ff');
  } },
  sign: { w: 16, h: 16, paint: function (g) {
    px(g, 7, 7, 2, 8, '#6b4a2a');
    px(g, 3, 3, 10, 5, '#8a5a2e'); px(g, 3, 3, 10, 1, '#9a6a38'); px(g, 5, 5, 6, 1, '#6b4423');
  } },
  bedroll: { w: 16, h: 16, paint: function (g) {
    px(g, 2, 9, 12, 5, '#8a3a3a'); px(g, 2, 9, 12, 1, '#a04a4a');
    px(g, 2, 9, 2, 5, '#d8b078'); px(g, 12, 9, 2, 5, '#d8b078');
  } },
  workbench: { w: 16, h: 16, paint: function (g) {
    px(g, 1, 8, 14, 3, '#8a5a2e'); px(g, 1, 8, 14, 1, '#9a6a38');
    px(g, 2, 11, 2, 4, '#6b4423'); px(g, 12, 11, 2, 4, '#6b4423');
    px(g, 5, 5, 3, 3, '#7a7a80'); px(g, 11, 4, 1, 4, '#6b4a2a');
  } },
  anvil: { w: 16, h: 16, paint: function (g) {
    px(g, 6, 11, 4, 4, '#3a3a42'); px(g, 4, 9, 8, 2, '#4a4a52');
    px(g, 2, 5, 12, 4, '#5a5a64'); px(g, 2, 5, 12, 1, '#7a7a84');
  } },
  door: { w: 16, h: 16, paint: function (g) {
    px(g, 3, 1, 10, 14, '#6b4423'); px(g, 4, 2, 8, 12, '#8a5a2e'); px(g, 4, 2, 8, 1, '#9a6a38');
    px(g, 7, 7, 2, 2, '#e8b923'); px(g, 6, 2, 1, 12, '#6b4423');
  } },
  pillar: { w: 16, h: 24, paint: function (g) {
    px(g, 4, 18, 8, 4, '#6f6f75');
    px(g, 5, 4, 6, 14, '#8f8f96'); px(g, 5, 4, 1, 14, '#a5a5ab'); px(g, 10, 4, 1, 14, '#6f6f75');
    px(g, 4, 2, 8, 2, '#7a7a80');
  } },
  pillar_broken: { w: 16, h: 24, paint: function (g) {
    px(g, 4, 18, 8, 4, '#6f6f75');
    px(g, 5, 10, 6, 8, '#8f8f96'); px(g, 5, 10, 1, 8, '#a5a5ab');
    px(g, 5, 8, 6, 2, '#6f6f75');
    px(g, 11, 13, 3, 2, '#7a7a80');
  } },
  stalagmite: { w: 16, h: 16, paint: function (g) {
    px(g, 6, 6, 4, 9, '#8f8f96'); px(g, 7, 3, 2, 3, '#9b9b9b');
    px(g, 6, 6, 1, 9, '#a5a5ab'); px(g, 3, 12, 10, 3, '#6f6f75');
  } },
  bones: { w: 16, h: 16, paint: function (g) {
    px(g, 3, 10, 6, 2, '#e8e8e8'); px(g, 8, 8, 5, 2, '#d8d8d8');
    px(g, 4, 6, 2, 5, '#e8e8e8'); px(g, 10, 10, 2, 2, '#e8e8e8');
    px(g, 5, 4, 4, 3, '#d8d8d8');
    px(g, 6, 5, 1, 1, '#22222c'); px(g, 8, 5, 1, 1, '#22222c');
  } },
  mushroom: { w: 16, h: 16, paint: function (g) {
    px(g, 7, 9, 2, 6, '#e8d8b8');
    px(g, 3, 4, 10, 6, '#c63a3a'); px(g, 3, 8, 10, 2, '#a82e2e');
    px(g, 5, 5, 2, 2, '#ffffff'); px(g, 9, 6, 2, 2, '#ffffff'); px(g, 7, 4, 1, 1, '#ffffff');
  } },
  well: { w: 16, h: 16, paint: function (g) {
    px(g, 3, 9, 10, 5, '#8f8f96'); px(g, 3, 9, 10, 1, '#a5a5ab'); px(g, 5, 10, 6, 2, '#2a2a30');
    px(g, 3, 2, 2, 7, '#6b4a2a'); px(g, 11, 2, 2, 7, '#6b4a2a');
    px(g, 2, 0, 12, 3, '#a83a3a'); px(g, 2, 0, 12, 1, '#c04a4a');
  } },
  counter: { w: 16, h: 16, paint: function (g) {
    px(g, 1, 8, 14, 6, '#8a5a2e'); px(g, 1, 8, 14, 1, '#9a6a38'); px(g, 1, 11, 14, 1, '#6b4423');
    px(g, 4, 4, 3, 4, '#c9962e'); px(g, 10, 5, 3, 3, '#4a8a4a');
  } },
  bookshelf: { w: 16, h: 16, paint: function (g) {
    px(g, 2, 1, 12, 14, '#6b4a2a');
    px(g, 3, 2, 10, 4, '#8a5a2e'); px(g, 3, 8, 10, 4, '#8a5a2e');
    px(g, 3, 2, 2, 4, '#a83a3a'); px(g, 5, 2, 2, 4, '#3a6aa8'); px(g, 7, 2, 2, 4, '#3a8a4a'); px(g, 9, 3, 2, 3, '#c9962e');
    px(g, 3, 8, 2, 4, '#7a3aa8'); px(g, 5, 9, 2, 3, '#a83a3a'); px(g, 8, 8, 2, 4, '#3a6aa8'); px(g, 10, 9, 2, 3, '#3a8a4a');
  } },
  banner: { w: 16, h: 24, paint: function (g) {
    px(g, 7, 0, 2, 22, '#6b4a2a'); px(g, 2, 0, 12, 2, '#6b4a2a');
    px(g, 3, 2, 8, 13, '#a83a3a'); px(g, 3, 2, 8, 2, '#c04a4a');
    px(g, 5, 5, 4, 4, '#e8b923'); px(g, 6, 6, 2, 2, '#a83a3a');
  } }
};

function paintOreRock(g, color) {
  px(g, 3, 6, 10, 8, '#7a7a80'); px(g, 4, 4, 7, 3, '#8f8f96');
  px(g, 3, 6, 10, 1, '#9b9b9b'); px(g, 3, 12, 10, 2, '#5c5c63');
  px(g, 4, 7, 3, 3, color); px(g, 9, 9, 3, 2, shade(color, 1.2)); px(g, 7, 11, 2, 2, color);
}

var OBJ_CACHE = {};

function obj(name) {
  if (name == null) return null;
  if (OBJ_CACHE[name]) return OBJ_CACHE[name];
  var def = OBJ_DEFS[name];
  if (!def) return null;
  var c = spr(def.w, def.h, def.paint);
  OBJ_CACHE[name] = c;
  return c;
}

/* ================= 9. DRAW + MINIMAP ================= */

// Draw a tile/object sprite so its BOTTOM-CENTER lands at (dx, dy).
function draw(ctx, name, dx, dy, frameIdx) {
  if (!ctx || name == null) return;
  var fi = (frameIdx | 0);
  var c = null;
  var set = SETS[name];
  if (set && set.length) {
    var i = ((fi % set.length) + set.length) % set.length;
    c = set[i];
  } else {
    c = tile(name) || obj(name);
  }
  if (!c) return;
  ctx.drawImage(c, Math.round(dx - c.width / 2), Math.round(dy - c.height));
}

// tile ids: 0 grass,1 grass2,2 dirt,3 sand,4 stone,5 water_deep,
// 6 water_shallow,7 snow,8 path,9 wood_floor,10 stone_floor,
// 11 bridge,12 dark_stone,13 cobble
var MINIMAP = {
  0: '#45a049', 1: '#3d8b40', 2: '#8a6239', 3: '#e0c47a',
  4: '#8f8f96', 5: '#1e56c8', 6: '#3f9fe0', 7: '#eef4f8',
  8: '#c2a165', 9: '#9a6b3f', 10: '#7d7d84', 11: '#8f6238',
  12: '#4a4a55', 13: '#9b9b9b'
};

function minimapColor(tileId) {
  return MINIMAP[tileId] || '#000000';
}

/* ================= 10. INIT + EXPORT ================= */

function init() {
  var name;
  for (name in TILE_PAINTERS) {
    if (Object.prototype.hasOwnProperty.call(TILE_PAINTERS, name)) {
      TILES[name] = tile(name, 0);
    }
  }
  for (name in TILESET_DEFS) {
    if (Object.prototype.hasOwnProperty.call(TILESET_DEFS, name)) {
      (function (sname) {
        var d = TILESET_DEFS[sname], arr = [];
        for (var i = 0; i < d.n; i++) {
          arr.push(spr(d.w, d.h, (function (idx) {
            return function (g) { d.paint(g, idx); };
          })(i)));
        }
        SETS[sname] = arr;
      })(name);
    }
  }
  // Pre-warm item icons if PK.Data is already present (never throws).
  try {
    if (PK.Data && PK.Data.ITEMS) {
      for (var id in PK.Data.ITEMS) {
        if (Object.prototype.hasOwnProperty.call(PK.Data.ITEMS, id)) itemIcon(id);
      }
    }
  } catch (e) { /* PK.Data optional */ }
  PK.Sprites.ready = true;
}

PK.Sprites = {
  init: init,
  tile: tile,
  tileVar: tileVar,
  tileset: tileset,
  frame: frame,
  playerFrames: playerFrames,
  enemyFrames: enemyFrames,
  npcFrames: npcFrames,
  itemIcon: itemIcon,
  obj: obj,
  draw: draw,
  minimapColor: minimapColor,
  ready: false
};

})();
