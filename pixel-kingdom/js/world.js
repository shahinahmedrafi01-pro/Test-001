/* ============================================================
   PIXEL KINGDOM — world.js
   Deterministic tile world: terrain, regions, village, dungeons,
   resources, chests, collision, minimap.
   Depends: PK (utils.js), PK.Data (regions), PK.Sprites (minimap colors).
   ============================================================ */
var PK = PK || {};

PK.World = (function () {
  'use strict';
  var U = PK.Utils, C = PK.Config, T = C.T;

  var W = C.WORLD_W, H = C.WORLD_H;
  var tiles = new Uint8Array(W * H);
  var seed = 1337;
  var rng = U.mulberry32(seed);

  var regions = [];        // {id,name,cx,cy,rx,ry,rect?}
  var features = [];       // {type,tx,ty,solid,data}
  var featGrid = {};       // "gx,gy" -> [feature]
  var chests = [];         // {id,tx,ty,loot,opened,gold}
  var signs = [];          // {tx,ty,text}
  var stations = [];       // {kind,tx,ty} workbench|furnace|anvil|campfire|bedroll
  var waystones = [];      // {id,name,tx,ty,unlocked}
  var npcs = [];           // {id,kind,tx,ty}
  var portals = [];        // {tx,ty,ttx,tty,label} (unused walk-ins kept for future)
  var bossSpawns = {};     // bossId -> {tx,ty}
  var harvested = {};      // "tx,ty" -> respawnAt (game time)
  var openedChests = {};
  var minimapCv = null;

  function idx(tx, ty) { return ty * W + tx; }
  function inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < W && ty < H; }

  function tileAt(tx, ty) {
    if (!inBounds(tx, ty)) return T.STONE;
    return tiles[idx(tx, ty)];
  }
  function setTile(tx, ty, t) { if (inBounds(tx, ty)) tiles[idx(tx, ty)] = t; }

  function isSolidTile(tx, ty) {
    if (!inBounds(tx, ty)) return true;
    var t = tiles[idx(tx, ty)];
    if (t === T.BRIDGE) return false;
    return !!C.SOLID_TILES[t];
  }

  function addFeature(type, tx, ty, solid, data) {
    var f = { type: type, tx: tx, ty: ty, solid: !!solid, data: data || {} };
    features.push(f);
    var k = (tx >> 3) + ',' + (ty >> 3);
    (featGrid[k] = featGrid[k] || []).push(f);
    return f;
  }
  function featuresNear(tx, ty, r) {
    var out = [], gx0 = (tx - r) >> 3, gx1 = (tx + r) >> 3, gy0 = (ty - r) >> 3, gy1 = (ty + r) >> 3;
    for (var gx = gx0; gx <= gx1; gx++) for (var gy = gy0; gy <= gy1; gy++) {
      var cell = featGrid[gx + ',' + gy];
      if (cell) for (var i = 0; i < cell.length; i++) {
        var f = cell[i];
        if (Math.abs(f.tx - tx) <= r && Math.abs(f.ty - ty) <= r) out.push(f);
      }
    }
    return out;
  }
  // Circle (pixel coords) vs solid tiles + solid features
  function collideCircle(x, y, r) {
    var tx0 = Math.floor((x - r) / C.TILE), tx1 = Math.floor((x + r) / C.TILE);
    var ty0 = Math.floor((y - r) / C.TILE), ty1 = Math.floor((y + r) / C.TILE);
    for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
      if (isSolidTile(tx, ty)) {
        var rx = tx * C.TILE, ry = ty * C.TILE;
        if (U.circleRectOverlap(x, y, r, rx, ry, C.TILE, C.TILE)) return true;
      }
    }
    var ftx = Math.floor(x / C.TILE), fty = Math.floor(y / C.TILE);
    var near = featuresNear(ftx, fty, 2);
    for (var i = 0; i < near.length; i++) {
      var f = near[i];
      if (!f.solid || f.harvested) continue;
      var fx = f.tx * C.TILE + C.TILE / 2, fy = f.ty * C.TILE + C.TILE / 2;
      var fr = C.TILE * 0.32;
      var dx = x - fx, dy = y - fy;
      if (dx * dx + dy * dy < (r + fr) * (r + fr)) return true;
    }
    return false;
  }

  function defineRegions() {
    regions = [
      { id: 'village', name: 'Greenfield Village', cx: 80, cy: 100, rx: 14, ry: 12 },
      { id: 'forest', name: 'Whisper Forest', cx: 35, cy: 80, rx: 22, ry: 20 },
      { id: 'ruins', name: 'Sunken Ruins', cx: 85, cy: 136, rx: 20, ry: 16 },
      { id: 'caves', name: 'Ember Caves', cx: 133, cy: 85, rx: 19, ry: 17 },
      { id: 'peaks', name: 'Frostpeak Mountains', cx: 80, cy: 22, rx: 22, ry: 14 },
      { id: 'plains', name: 'Greenfield Plains', cx: 80, cy: 80, rx: 200, ry: 200 }
    ];
  }
  function inEllipse(tx, ty, r) {
    var dx = (tx - r.cx) / r.rx, dy = (ty - r.cy) / r.ry;
    return dx * dx + dy * dy <= 1;
  }
  function biomeAt(tx, ty) {
    // priority order: village, caves, ruins, forest, peaks, plains
    for (var i = 0; i < 5; i++) if (inEllipse(tx, ty, regions[i])) return regions[i].id;
    return 'plains';
  }
  function regionDef(id) {
    for (var i = 0; i < regions.length; i++) if (regions[i].id === id) return regions[i];
    return regions[5];
  }

  /* ---------------- generation ---------------- */
  function blob(cx, cy, r, tile, chance) {
    for (var y = Math.floor(cy - r); y <= cy + r; y++)
      for (var x = Math.floor(cx - r); x <= cx + r; x++) {
        if (!inBounds(x, y)) continue;
        var d = U.dist(x, y, cx, cy);
        if (d <= r && rng() < (chance || 0.8)) setTile(x, y, tile);
      }
  }
  function disc(cx, cy, r, tile) { blob(cx, cy, r, tile, 1); }

  function genRiver() {
    for (var y = 0; y < H; y++) {
      var cx = Math.round(55 + 7 * Math.sin(y * 0.045) + 3 * Math.sin(y * 0.013 + 2));
      for (var dx = -3; dx <= 3; dx++) {
        var x = cx + dx;
        if (!inBounds(x, y)) continue;
        var b = biomeAt(x, y);
        if (b === 'village' || b === 'caves') continue; // river bends around
        if (Math.abs(dx) <= 1) setTile(x, y, T.WATER_DEEP);
        else setTile(x, y, T.WATER_SHALLOW);
      }
    }
    // bridges
    for (var bx = -2; bx <= 2; bx++) { setTile(55 + bx, 100, T.BRIDGE); setTile(55 + bx, 60, T.BRIDGE); }
  }

  function rectTiles(x0, y0, x1, y1, tile, hollow) {
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      if (!inBounds(x, y)) continue;
      if (hollow && x > x0 && x < x1 && y > y0 && y < y1) continue;
      setTile(x, y, tile);
    }
  }

  function buildHouse(x0, y0, w, h, floorTile, doorSide) {
    // walls of stone, hollow, floor inside, door gap
    rectTiles(x0, y0, x0 + w - 1, y0 + h - 1, T.STONE, false);
    rectTiles(x0 + 1, y0 + 1, x0 + w - 2, y0 + h - 2, floorTile, false);
    var dx = x0 + Math.floor(w / 2), dy = y0 + h - 1;
    if (doorSide === 'north') dy = y0;
    if (doorSide === 'west') { dx = x0; dy = y0 + Math.floor(h / 2); }
    if (doorSide === 'east') { dx = x0 + w - 1; dy = y0 + Math.floor(h / 2); }
    setTile(dx, dy, T.PATH);
    return { x0: x0, y0: y0, x1: x0 + w - 1, y1: y0 + h - 1, door: { x: dx, y: dy } };
  }

  function genVillage() {
    disc(80, 100, 9, T.COBBLE);
    disc(80, 100, 5, T.COBBLE);
    // roads out
    for (var x = 55; x <= 80; x++) setTile(x, 100, T.PATH);
    for (var y = 100; y <= 122; y++) setTile(80, y, T.PATH);
    for (var y = 78; y <= 100; y++) setTile(80, y, T.PATH);
    for (var xx = 80; xx <= 112; xx++) setTile(xx, 92, T.PATH);
    // houses
    var hall = buildHouse(74, 88, 13, 9, T.WOOD_FLOOR, 'south');
    var smith = buildHouse(88, 94, 10, 8, T.STONE_FLOOR, 'west');
    var shop = buildHouse(70, 104, 10, 8, T.WOOD_FLOOR, 'east');
    var inn = buildHouse(86, 106, 11, 9, T.WOOD_FLOOR, 'north');
    // interiors
    addFeature('banner', 77, 89, false); addFeature('banner', 82, 89, false);
    stations.push({ kind: 'anvil', tx: 90, ty: 96 }); stations.push({ kind: 'furnace', tx: 93, ty: 96 });
    stations.push({ kind: 'workbench', tx: 78, ty: 93 });
    addFeature('counter', 73, 106, true); addFeature('bookshelf', 76, 105, true);
    stations.push({ kind: 'bedroll', tx: 89, ty: 110 }); stations.push({ kind: 'bedroll', tx: 91, ty: 110 });
    addFeature('well', 80, 103, true);
    addFeature('fountain', 80, 97, true);
    waystones.push({ id: 'ws_village', name: 'Greenfield Village', tx: 80, ty: 95, unlocked: true });
    npcs.push({ id: 'elder_maren', kind: 'elder', tx: 80, ty: 92 });
    npcs.push({ id: 'blacksmith_borin', kind: 'blacksmith', tx: 91, ty: 98 });
    npcs.push({ id: 'merchant_lila', kind: 'merchant', tx: 74, ty: 108 });
    npcs.push({ id: 'guard_captain', kind: 'guard', tx: 83, ty: 99 });
    npcs.push({ id: 'herbalist_yara', kind: 'herbalist', tx: 68, ty: 100 });
    npcs.push({ id: 'villager', kind: 'villager', tx: 77, ty: 101 });
    npcs.push({ id: 'villager2', kind: 'villager2', tx: 84, ty: 103 });
    signs.push({ tx: 80, ty: 112, text: 'Greenfield Village — founded 312 years ago. The King\'s crown lies shattered...' });
    signs.push({ tx: 56, ty: 99, text: 'West: Whisper Forest. Beware of wolves after dark.' });
    stations.push({ kind: 'campfire', tx: 80, ty: 108 });
    // starter chest in inn
    chests.push({ id: 'ch_village_inn', tx: 93, ty: 112, opened: false, gold: 25,
      loot: [{ id: 'food_bread', qty: 3 }, { id: 'pot_minor_heal', qty: 2 }] });
  }

  function genForest() {
    for (var i = 0; i < 260; i++) {
      var tx = U.randi(rng, 14, 56), ty = U.randi(rng, 60, 100);
      if (biomeAt(tx, ty) !== 'forest') continue;
      if (U.dist(tx, ty, 30, 80) < 8) continue; // boss clearing
      if (tileAt(tx, ty) === T.WATER_DEEP || tileAt(tx, ty) === T.WATER_SHALLOW) continue;
      var r = rng();
      addFeature(r < 0.6 ? 'tree_oak' : (r < 0.85 ? 'tree_pine' : 'bush'), tx, ty, true, r >= 0.85 ? { berries: true } : {});
    }
    // slime king clearing + arena ring
    disc(30, 80, 7, T.DIRT);
    for (var a = 0; a < Math.PI * 2; a += 0.15) {
      var px = Math.round(30 + Math.cos(a) * 7), py = Math.round(80 + Math.sin(a) * 7);
      if (a > 0.4 && a < 1.2) continue; // entrance gap
      addFeature('rock', px, py, true);
    }
    bossSpawns['boss_slime_king'] = { tx: 30, ty: 80 };
    signs.push({ tx: 38, ty: 80, text: 'The ground trembles here... something royal and jiggly sleeps within.' });
    waystones.push({ id: 'ws_forest', name: 'Whisper Forest', tx: 52, ty: 80, unlocked: false });
    chests.push({ id: 'ch_forest_1', tx: 28, ty: 60, opened: false, gold: 40, loot: [{ id: 'mat_iron_ore', qty: 4 }] });
    chests.push({ id: 'ch_forest_2', tx: 20, ty: 92, opened: false, gold: 15, loot: [{ id: 'food_apple', qty: 5 }] });
    stations.push({ kind: 'campfire', tx: 48, ty: 88 });
  }

  function genRuins() {
    for (var i = 0; i < 90; i++) {
      var tx = U.randi(rng, 66, 104), ty = U.randi(rng, 121, 151);
      if (biomeAt(tx, ty) !== 'ruins') continue;
      if (rng() < 0.5) setTile(tx, ty, rng() < 0.5 ? T.STONE_FLOOR : T.DIRT);
    }
    // broken path
    for (var y = 122; y <= 140; y++) { if (rng() < 0.8) setTile(85, y, T.STONE_FLOOR); }
    for (var j = 0; j < 14; j++) {
      var px2 = U.randi(rng, 68, 102), py2 = U.randi(rng, 122, 150);
      addFeature(rng() < 0.5 ? 'pillar' : 'pillar_broken', px2, py2, true);
    }
    for (var k = 0; k < 8; k++) addFeature('bones', U.randi(rng, 68, 102), U.randi(rng, 122, 150), false);
    // skeleton lord arena
    disc(85, 144, 8, T.DARK_STONE);
    for (var a2 = 0; a2 < Math.PI * 2; a2 += 0.12) {
      var qx = Math.round(85 + Math.cos(a2) * 8), qy = Math.round(144 + Math.sin(a2) * 8);
      if (a2 > 4.4 && a2 < 5.2) continue;
      setTile(qx, qy, T.STONE);
    }
    bossSpawns['boss_skeleton_lord'] = { tx: 85, ty: 144 };
    signs.push({ tx: 85, ty: 134, text: 'Sunken Ruins. The Skeleton Lord guards the fallen crown\'s jewel.' });
    waystones.push({ id: 'ws_ruins', name: 'Sunken Ruins', tx: 85, ty: 128, unlocked: false });
    chests.push({ id: 'ch_ruins_1', tx: 70, ty: 130, opened: false, gold: 80, loot: [{ id: 'mat_gold_ore', qty: 3 }, { id: 'pot_minor_mana', qty: 2 }] });
    chests.push({ id: 'ch_ruins_2', tx: 99, ty: 148, opened: false, gold: 120, loot: [{ id: 'trea_ancient_coin', qty: 2 }] });
    // gold ore in ruins
    for (var m = 0; m < 10; m++) addFeature('ore_gold', U.randi(rng, 66, 104), U.randi(rng, 122, 150), true, { amount: 3 });
  }

  function genCaves() {
    // interior: big dark_stone room with stone walls, corridor entrance from west
    rectTiles(118, 70, 150, 100, T.DARK_STONE, false);
    rectTiles(118, 70, 150, 100, T.STONE, true); // walls
    for (var y = 82; y <= 88; y++) { setTile(118, y, T.DARK_STONE); setTile(117, y, T.DIRT); } // corridor
    // pillars inside
    for (var i = 0; i < 10; i++) {
      var px = U.randi(rng, 122, 146), py = U.randi(rng, 74, 96);
      if (U.dist(px, py, 142, 85) < 9) continue;
      setTile(px, py, T.STONE); setTile(px + 1, py, T.STONE);
    }
    for (var s = 0; s < 12; s++) addFeature('stalagmite', U.randi(rng, 120, 148), U.randi(rng, 72, 98), true);
    // ores
    for (var c = 0; c < 14; c++) addFeature('ore_copper', U.randi(rng, 120, 148), U.randi(rng, 72, 98), true, { amount: 3 });
    for (var ir = 0; ir < 12; ir++) addFeature('ore_iron', U.randi(rng, 120, 148), U.randi(rng, 72, 98), true, { amount: 3 });
    for (var co = 0; co < 8; co++) addFeature('rock', U.randi(rng, 120, 148), U.randi(rng, 72, 98), true);
    // goblin warlord arena (east chamber)
    disc(142, 85, 7, T.DARK_STONE);
    for (var a = 0; a < Math.PI * 2; a += 0.14) {
      var ax = Math.round(142 + Math.cos(a) * 7), ay = Math.round(85 + Math.sin(a) * 7);
      if (a > 2.6 && a < 3.6) continue;
      setTile(ax, ay, T.STONE);
    }
    for (var t2 = 0; t2 < 6; t2++) {
      var ta = t2 / 6 * Math.PI * 2;
      stations.push({ kind: 'torch', tx: Math.round(142 + Math.cos(ta) * 6), ty: Math.round(85 + Math.sin(ta) * 6) });
    }
    bossSpawns['boss_goblin_warlord'] = { tx: 142, ty: 85 };
    signs.push({ tx: 114, ty: 85, text: 'Ember Caves. Goblins nest in the dark. Bring a weapon.' });
    waystones.push({ id: 'ws_caves', name: 'Ember Caves', tx: 112, ty: 85, unlocked: false });
    chests.push({ id: 'ch_caves_1', tx: 124, ty: 74, opened: false, gold: 60, loot: [{ id: 'mat_coal', qty: 5 }] });
    chests.push({ id: 'ch_caves_2', tx: 138, ty: 92, opened: false, gold: 90, loot: [{ id: 'pot_major_heal', qty: 1 }] });
    stations.push({ kind: 'campfire', tx: 120, ty: 90 });
  }

  function genPeaks() {
    for (var y = 6; y <= 38; y++) for (var x = 58; x <= 102; x++) {
      if (biomeAt(x, y) !== 'peaks') continue;
      var t = tileAt(x, y);
      if (t === T.GRASS || t === T.GRASS2 || t === T.DIRT) setTile(x, y, T.SNOW);
    }
    // winding path up
    var px = 80;
    for (var py = 40; py >= 14; py--) { px += U.randi(rng, -1, 1); px = U.clamp(px, 62, 98); setTile(px, py, T.PATH); setTile(px + 1, py, T.PATH); }
    // stone wall clusters
    for (var i = 0; i < 40; i++) {
      var wx = U.randi(rng, 60, 100), wy = U.randi(rng, 8, 36);
      if (tileAt(wx, wy) === T.PATH) continue;
      if (rng() < 0.6) setTile(wx, wy, T.STONE); else addFeature('rock', wx, wy, true);
    }
    // mithril deep in peaks
    for (var m = 0; m < 8; m++) addFeature('ore_mithril', U.randi(rng, 62, 98), U.randi(rng, 8, 30), true, { amount: 2 });
    for (var g = 0; g < 8; g++) addFeature('ore_gold', U.randi(rng, 62, 98), U.randi(rng, 10, 34), true, { amount: 3 });
    addFeature('tree_pine', 70, 30, true); addFeature('tree_pine', 90, 28, true);
    // shrine
    disc(80, 16, 4, T.STONE_FLOOR);
    addFeature('pillar', 78, 14, true); addFeature('pillar', 82, 14, true);
    stations.push({ kind: 'torch', tx: 78, ty: 16 }); stations.push({ kind: 'torch', tx: 82, ty: 16 });
    signs.push({ tx: 80, ty: 42, text: 'Frostpeak Mountains. The hermit\'s shrine waits above the clouds.' });
    waystones.push({ id: 'ws_peaks', name: 'Frostpeak Mountains', tx: 80, ty: 40, unlocked: false });
    chests.push({ id: 'ch_peaks_1', tx: 66, ty: 20, opened: false, gold: 150, loot: [{ id: 'mat_mithril_ore', qty: 3 }] });
    chests.push({ id: 'ch_peaks_2', tx: 80, ty: 16, opened: false, gold: 100, loot: [{ id: 'trea_crystal_shard', qty: 2 }] });
  }

  function genScatter() {
    for (var i = 0; i < 500; i++) {
      var tx = U.randi(rng, 2, W - 3), ty = U.randi(rng, 2, H - 3);
      var t = tileAt(tx, ty);
      if (t === T.WATER_DEEP || t === T.WATER_SHALLOW || t === T.STONE) continue;
      var b = biomeAt(tx, ty);
      if (b === 'village' && U.dist(tx, ty, 80, 100) < 11) continue;
      var r = rng();
      if (b === 'peaks' || b === 'caves') continue;
      if (r < 0.35) addFeature('grass_tuft', tx, ty, false);
      else if (r < 0.45) addFeature('flowers', tx, ty, false);
      else if (r < 0.52 && b !== 'ruins') addFeature('bush', tx, ty, true, { berries: true });
      else if (r < 0.58 && (b === 'plains')) addFeature('rock', tx, ty, true);
      else if (r < 0.62 && b === 'plains') addFeature('tree_oak', tx, ty, true);
    }
    // plains rocks for stone gathering
    for (var k = 0; k < 40; k++) {
      var qx = U.randi(rng, 60, 110), qy = U.randi(rng, 60, 120);
      if (biomeAt(qx, qy) === 'plains' && tileAt(qx, qy) !== T.WATER_DEEP) addFeature('rock', qx, qy, true);
    }
  }

  function buildMinimap() {
    minimapCv = document.createElement('canvas');
    minimapCv.width = W; minimapCv.height = H;
    var g = minimapCv.getContext('2d');
    var img = g.createImageData(W, H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var t = tiles[y * W + x];
      var c = PK.Sprites.minimapColor(t);
      var o = (y * W + x) * 4;
      img.data[o] = parseInt(c.substr(1, 2), 16);
      img.data[o + 1] = parseInt(c.substr(3, 2), 16);
      img.data[o + 2] = parseInt(c.substr(5, 2), 16);
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  function generate() {
    rng = U.mulberry32(seed);
    features = []; featGrid = {}; chests = []; signs = []; stations = [];
    waystones = []; npcs = []; portals = []; bossSpawns = {};
    harvested = {}; openedChests = {};
    tiles = new Uint8Array(W * H);
    // base terrain
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var r = U.hash2(x, y, seed);
      setTile(x, y, r < 0.12 ? T.GRASS2 : T.GRASS);
    }
    defineRegions();
    genRiver();
    genVillage();
    genForest();
    genRuins();
    genCaves();
    genPeaks();
    genScatter();
    // dirt patches
    for (var i = 0; i < 40; i++) blob(U.randi(rng, 10, W - 10), U.randi(rng, 45, 115), U.randi(rng, 2, 4), T.DIRT, 0.5);
    buildMinimap();
  }

  function init(s) { seed = s >>> 0 || 1337; generate(); }

  /* -------- resource gathering -------- */
  var NODE_DROPS = {
    tree_oak: [['mat_wood', 2, 4]], tree_pine: [['mat_wood', 2, 4]], tree_dead: [['mat_wood', 1, 2]],
    rock: [['mat_stone', 2, 4]],
    ore_copper: [['mat_copper_ore', 2, 3]], ore_iron: [['mat_iron_ore', 2, 3]],
    ore_gold: [['mat_gold_ore', 2, 3]], ore_mithril: [['mat_mithril_ore', 1, 2]],
    bush: [['food_berries', 2, 4]]
  };
  var NODE_TOOL = { tree_oak: 'axe', tree_pine: 'axe', tree_dead: 'axe', rock: 'pickaxe', ore_copper: 'pickaxe', ore_iron: 'pickaxe', ore_gold: 'pickaxe', ore_mithril: 'pickaxe' };

  function nodeKey(f) { return f.tx + ',' + f.ty; }
  function isNodeReady(f, gameTime) {
    var k = nodeKey(f);
    if (!harvested[k]) return true;
    if (gameTime >= harvested[k]) { delete harvested[k]; f.harvested = false; return true; }
    return false;
  }
  // returns {drops:[[id,qty]], depleted} — engine handles inventory + xp
  function gather(f, toolKind, gameTime) {
    var drops = NODE_DROPS[f.type];
    if (!drops) return null;
    var need = NODE_TOOL[f.type];
    var mult = 1;
    if (need && toolKind !== need) mult = 0.5;
    if (toolKind === need) mult = 1.5;
    var out = [];
    for (var i = 0; i < drops.length; i++) {
      var q = Math.max(1, Math.round(U.rand(rng, drops[i][1], drops[i][2]) * mult));
      out.push([drops[i][0], q]);
    }
    if (f.type === 'bush') { f.harvested = false; harvested[nodeKey(f)] = gameTime + 120; }
    else { f.harvested = true; harvested[nodeKey(f)] = gameTime + 240; }
    return { drops: out, tool: need };
  }

  function openChest(id) {
    for (var i = 0; i < chests.length; i++) {
      if (chests[i].id === id && !chests[i].opened) {
        chests[i].opened = true; openedChests[id] = true;
        return { loot: chests[i].loot.slice(), gold: chests[i].gold };
      }
    }
    return null;
  }

  function nearestInteractable(px, py, maxDist) {
    // px,py in pixels
    var best = null, bd = maxDist * maxDist;
    function consider(x, y, obj) {
      var d2 = U.dist2(px, py, x, y);
      if (d2 < bd) { bd = d2; best = obj; }
    }
    var tx = Math.floor(px / C.TILE), ty = Math.floor(py / C.TILE);
    var near = featuresNear(tx, ty, 3);
    for (var i = 0; i < near.length; i++) {
      var f = near[i];
      if (f.harvested && NODE_DROPS[f.type]) continue;
      if (NODE_DROPS[f.type] || f.type === 'chest') {
        consider(f.tx * C.TILE + 8, f.ty * C.TILE + 8, { kind: 'node', ref: f });
      }
    }
    for (var c = 0; c < chests.length; c++) {
      var ch = chests[c];
      if (!ch.opened) consider(ch.tx * C.TILE + 8, ch.ty * C.TILE + 8, { kind: 'chest', ref: ch });
    }
    for (var s = 0; s < signs.length; s++) {
      var sg = signs[s];
      consider(sg.tx * C.TILE + 8, sg.ty * C.TILE + 8, { kind: 'sign', ref: sg });
    }
    for (var st = 0; st < stations.length; st++) {
      var sn = stations[st];
      consider(sn.tx * C.TILE + 8, sn.ty * C.TILE + 8, { kind: 'station', ref: sn });
    }
    for (var wI = 0; wI < waystones.length; wI++) {
      var ws = waystones[wI];
      consider(ws.tx * C.TILE + 8, ws.ty * C.TILE + 8, { kind: 'waystone', ref: ws });
    }
    return best;
  }

  function unlockWaystone(id) {
    for (var i = 0; i < waystones.length; i++)
      if (waystones[i].id === id) { waystones[i].unlocked = true; return true; }
    return false;
  }

  function serialize() {
    return {
      openedChests: Object.keys(openedChests),
      harvested: harvested,
      waystones: waystones.filter(function (w) { return w.unlocked; }).map(function (w) { return w.id; })
    };
  }
  function deserialize(d) {
    if (!d) return;
    openedChests = {};
    (d.openedChests || []).forEach(function (id) {
      openedChests[id] = true;
      for (var i = 0; i < chests.length; i++) if (chests[i].id === id) chests[i].opened = true;
    });
    harvested = d.harvested || {};
    // mark harvested features
    for (var k in harvested) {
      var parts = k.split(','), tx = +parts[0], ty = +parts[1];
      var near = featuresNear(tx, ty, 1);
      for (var j = 0; j < near.length; j++) if (near[j].tx === tx && near[j].ty === ty && NODE_DROPS[near[j].type] && near[j].type !== 'bush') near[j].harvested = true;
    }
    (d.waystones || []).forEach(function (id) { unlockWaystone(id); });
  }

  return {
    W: W, H: H, seed: function () { return seed; },
    init: init, generate: generate,
    tileAt: tileAt, setTile: setTile, isSolidTile: isSolidTile,
    collideCircle: collideCircle, featuresNear: featuresNear,
    biomeAt: biomeAt, regionDef: regionDef, regions: function () { return regions; },
    npcs: function () { return npcs; }, chests: function () { return chests; },
    signs: function () { return signs; }, stations: function () { return stations; },
    waystones: function () { return waystones; }, bossSpawns: function () { return bossSpawns; },
    gather: gather, isNodeReady: isNodeReady, openChest: openChest,
    nearestInteractable: nearestInteractable, unlockWaystone: unlockWaystone,
    minimap: function () { return minimapCv; },
    NODE_DROPS: NODE_DROPS, NODE_TOOL: NODE_TOOL,
    serialize: serialize, deserialize: deserialize,
    spawnTable: {
      forest: [['slime', 5], ['slime_big', 1], ['wolf', 3], ['moss_troll', 1]],
      plains: [['slime', 3], ['wolf', 2], ['bandit', 2], ['bandit_brute', 1]],
      ruins: [['skeleton', 5], ['skeleton_archer', 2], ['spider', 2], ['undead_knight', 1]],
      caves: [['bat', 4], ['goblin', 5], ['goblin_archer', 2], ['cave_crawler', 2]],
      peaks: [['stone_golem', 4], ['ice_wraith', 3], ['undead_knight', 2]],
      village: []
    }
  };
})();
