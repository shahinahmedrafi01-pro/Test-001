/* ============================================================
   PIXEL KINGDOM — entities.js
   Player, enemies (+boss AI), NPCs, projectiles, drops, combat.
   Depends: PK (utils), PK.Data, PK.World, PK.Sprites, PK.FX,
            PK.Systems (inventory/quests/skills/achievements), PK.Audio, PK.UI.
   ============================================================ */
var PK = PK || {};

PK.Entities = (function () {
  'use strict';
  var U = PK.Utils, C = PK.Config, T = C.T;
  var W2P = C.TILE * C.ZOOM; // not used; entities work in PIXELS where 1 tile = 16px world units
  var TILE = C.TILE;

  var game = null; // set by init: {settings, time}
  var player = null;
  var enemies = [], npcs = [], projectiles = [], drops = [];
  var boss = null; // active boss ref for boss bar
  var bossesKilled = {};
  var spawnT = 0;
  var gameTime = 0;

  var DIRS = ['down', 'up', 'left', 'right'];
  var DIRV = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

  /* ================= PLAYER ================= */
  function baseStatsFor(cls, level) {
    var c = PK.Data.CLASSES[cls].stats;
    return {
      maxhp: Math.round(c.hp + (level - 1) * 14),
      maxmp: Math.round(c.mp + (level - 1) * 8),
      maxstamina: Math.round(c.stamina + (level - 1) * 4),
      atk: c.atk + (level - 1) * 1.6,
      def: c.def + (level - 1) * 1.1,
      spd: c.spd,
      crit: c.crit + (level - 1) * 0.15
    };
  }
  function xpNext(level) { return Math.floor(80 * Math.pow(level, 1.5)); }

  function newPlayer(name, cls, appearance) {
    var p = {
      kind: 'player', name: name, cls: cls, appearance: appearance,
      x: 80 * TILE + 8, y: 98 * TILE + 8, dir: 'down', moving: false, animT: 0,
      level: 1, xp: 0, skillPoints: 0, gold: 20,
      hp: 1, mp: 1, stamina: 100,
      skills: {}, cds: {},
      attackCd: 0, hurtT: 0, swingT: 0, dead: false, respawnT: 0,
      status: { poison: 0, burn: 0, freeze: 0, slow: 0 },
      statusTick: 0, regenT: 0, kills: {}, gathered: 0, crafted: 0,
      chestsOpened: 0, steps: 0, playtime: 0,
      buffs: [], // {stat, amt, until}
      spawnX: 80 * TILE + 8, spawnY: 98 * TILE + 8,
      r: 9
    };
    p.xpNext = xpNext(1);
    recompute(p);
    p.hp = p.maxhp; p.mp = p.maxmp; p.stamina = p.maxstamina;
    return p;
  }

  function equipStats(p) {
    var s = { atk: 0, def: 0, hp: 0, mp: 0, spd: 0, crit: 0 };
    var eq = PK.Systems.Inv.equipment(p);
    for (var slot in eq) {
      var it = eq[slot];
      if (!it) continue;
      var d = PK.Data.ITEMS[it.id];
      if (d && d.stats) for (var k in d.stats) s[k] = (s[k] || 0) + d.stats[k];
    }
    return s;
  }
  function skillStats(p) {
    var s = { atk: 0, def: 0, hp: 0, mp: 0, spd: 0, crit: 0, lifesteal: 0 };
    var tree = PK.Data.SKILLS[p.cls] || [];
    for (var i = 0; i < tree.length; i++) {
      var n = tree[i], pts = p.skills[n.id] || 0;
      if (pts > 0 && n.kind === 'passive' && n.effect && n.effect.stat) {
        s[n.effect.stat] = (s[n.effect.stat] || 0) + n.effect.per * pts;
      }
    }
    return s;
  }
  function recompute(p) {
    var b = baseStatsFor(p.cls, p.level), e = equipStats(p), sk = skillStats(p);
    var buff = { atk: 0, def: 0, spd: 0, crit: 0 };
    for (var i = 0; i < p.buffs.length; i++) {
      var bs = p.buffs[i].stat;
      if (buff[bs] !== undefined) buff[bs] += p.buffs[i].amt;
    }
    p.maxhp = Math.round(b.maxhp + e.hp + sk.hp);
    p.maxmp = Math.round(b.maxmp + e.mp + sk.mp);
    p.maxstamina = Math.round(b.maxstamina);
    p.atk = b.atk + e.atk + sk.atk + buff.atk;
    p.def = b.def + e.def + sk.def + buff.def;
    p.spd = b.spd + (e.spd || 0) + (sk.spd || 0) + buff.spd; // tiles/sec
    p.crit = b.crit + (e.crit || 0) + (sk.crit || 0);
    p.lifesteal = sk.lifesteal || 0;
    p.hp = Math.min(p.hp, p.maxhp); p.mp = Math.min(p.mp, p.maxmp);
  }

  function addXP(n) {
    if (!player || player.dead) return;
    player.xp += n;
    PK.FX.dmgNum(player.x, player.y - 18, '+' + Math.round(n) + ' XP', 'xp');
    PK.Systems.Quests.event('xp', n);
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext;
      player.level++;
      player.xpNext = xpNext(player.level);
      player.skillPoints++;
      player.hp = player.maxhp; player.mp = player.maxmp;
      PK.FX.levelupFx(player.x, player.y);
      PK.Audio.sfx('levelup');
      PK.UI.toast('Level up! You are now level ' + player.level + ' (+1 skill point)');
      PK.Systems.Ach.checkLevel(player.level);
      recompute(player);
    }
    PK.UI.refreshHUD();
  }

  function healPlayer(hp, mp) {
    if (!player || player.dead) return;
    if (hp) { player.hp = Math.min(player.maxhp, player.hp + hp); PK.FX.dmgNum(player.x, player.y - 14, '+' + Math.round(hp), 'heal'); }
    if (mp) player.mp = Math.min(player.maxmp, player.mp + mp);
    PK.FX.healFx(player.x, player.y);
    PK.Audio.sfx('heal');
    PK.UI.refreshHUD();
  }

  /* ================= ENEMIES ================= */
  function spawnEnemy(type, tx, ty, opts) {
    var d = PK.Data.ENEMIES[type];
    if (!d) return null;
    opts = opts || {};
    var scale = d.scale || 1;
    var e = {
      kind: 'enemy', type: type, def: d,
      name: d.name, x: tx * TILE + 8, y: ty * TILE + 8,
      hp: d.hp * (opts.hpMult || 1), maxhp: d.hp * (opts.hpMult || 1),
      atk: d.atk * (opts.atkMult || 1),
      dir: 'down', animT: Math.random() * 10, moving: false,
      state: 'idle', stateT: U.rand(Math.random, 1, 3), tx2: 0, ty2: 0,
      windup: 0, attackT: 0, hurtT: 0, kx: 0, ky: 0,
      r: 9 * scale, boss: !!d.boss, phase: 0, specialT: U.rand(Math.random, 4, 8),
      telegraph: null, // {x,y,r,t,dur,dmg}
      dead: false, deadT: 0, hitDone: false,
      homeX: tx * TILE + 8, homeY: ty * TILE + 8
    };
    enemies.push(e);
    return e;
  }

  function spawnBoss(id) {
    if (bossesKilled[id] || boss) return null;
    var sp = PK.World.bossSpawns()[id];
    if (!sp) return null;
    var b = spawnEnemy(id, sp.tx, sp.ty);
    if (b) {
      boss = b;
      PK.Audio.sfx('boss_roar');
      PK.FX.shake(10, 0.6);
      PK.UI.toast('⚠ ' + b.name + ' appears!', 'boss');
      PK.UI.showBossBar(b);
    }
    return b;
  }

  function damageEnemy(e, raw, opts) {
    opts = opts || {};
    if (e.dead) return 0;
    var crit = Math.random() * 100 < player.crit;
    var dmg = raw * U.rand(Math.random, 0.9, 1.1) * (crit ? 1.6 : 1);
    dmg = dmg * (1 - (e.def.def || 0) / ((e.def.def || 0) + 60));
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.hurtT = 0.18;
    // knockback
    var a = U.angleTo(player.x, player.y, e.x, e.y);
    e.kx += Math.cos(a) * (opts.knockback || 60);
    e.ky += Math.sin(a) * (opts.knockback || 60);
    PK.FX.hitSpark(e.x, e.y - 8, crit ? '#ffb300' : '#ffffff');
    PK.FX.dmgNum(e.x, e.y - 14, dmg, crit ? 'crit' : 'enemy');
    if (!opts.silent) PK.Audio.sfx(crit ? 'crit' : 'hit');
    if (opts.effect) {
      if (opts.effect.poison) e.statusP = Math.max(e.statusP || 0, opts.effect.poison);
      if (opts.effect.burn) e.statusB = Math.max(e.statusB || 0, opts.effect.burn);
      if (opts.effect.slow) e.slowT = Math.max(e.slowT || 0, opts.effect.slow);
    }
    if (player.lifesteal > 0) player.hp = Math.min(player.maxhp, player.hp + dmg * player.lifesteal / 100);
    // aggro
    if (e.state === 'idle' || e.state === 'wander') { e.state = 'chase'; e.stateT = 0; }
    // boss phases
    if (e.boss) {
      var frac = e.hp / e.maxhp;
      var d = e.def;
      if (d.phases && e.phase < d.phases.length && frac <= d.phases[e.phase].at) {
        e.phase++;
        PK.UI.toast('⚠ ' + e.name + ' grows furious!', 'boss');
        PK.Audio.sfx('boss_roar');
        PK.FX.shake(8, 0.5);
        e.atk *= 1.25;
        bossSpecial(e, true);
      }
      PK.UI.showBossBar(e);
    }
    if (e.hp <= 0) killEnemy(e);
    return dmg;
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true; e.deadT = 0;
    PK.Audio.sfx('kill');
    PK.FX.blood(e.x, e.y);
    var d = e.def;
    addXP(d.xp);
    player.kills[e.type] = (player.kills[e.type] || 0) + 1;
    // gold
    var gold = Math.round(U.rand(Math.random, d.gold[0], d.gold[1]));
    if (gold > 0) { player.gold += gold; PK.FX.dmgNum(e.x, e.y - 26, '+' + gold + 'g', 'gold'); }
    // loot
    (d.loot || []).forEach(function (L) {
      if (Math.random() < L.chance) {
        var q = Math.round(U.rand(Math.random, L.min, L.max));
        dropItem(L.id, q, e.x + U.rand(Math.random, -12, 12), e.y + U.rand(Math.random, -12, 12));
      }
    });
    PK.Systems.Quests.event('kill', e.type);
    PK.Systems.Ach.checkKill(e.type);
    if (e.boss) {
      bossesKilled[e.type] = true;
      boss = null;
      PK.UI.hideBossBar();
      PK.UI.toast('👑 ' + e.name + ' defeated!', 'boss');
      PK.FX.shake(12, 0.8);
      PK.Systems.Ach.checkBoss(e.type);
      PK.Audio.music(null);
    }
    PK.UI.refreshHUD();
  }

  function dropItem(id, qty, x, y) {
    drops.push({ id: id, qty: qty, x: x, y: y, vx: U.rand(Math.random, -40, 40), vy: U.rand(Math.random, -60, -10), t: Math.random() * 10 });
    if (drops.length > 120) drops.splice(0, drops.length - 120);
  }

  /* ================= PLAYER COMBAT ================= */
  function equippedWeapon() {
    var eq = PK.Systems.Inv.equipment(player);
    var w = eq.weapon ? PK.Data.ITEMS[eq.weapon.id] : null;
    return { item: eq.weapon, def: w };
  }
  function playerAttack() {
    var p = player;
    if (!p || p.dead || p.attackCd > 0) return;
    if (p.stamina < 4) { PK.UI.toast('Too exhausted...'); return; }
    var w = equippedWeapon(), wd = w.def;
    var wtype = 'melee';
    if (wd && wd.ammoType) wtype = 'ranged';
    else if (wd && wd.id && wd.id.indexOf('wpn_staff') === 0) wtype = 'magic';
    else if (wd && wd.id && (wd.id.indexOf('wpn_bow') === 0)) wtype = 'ranged';

    var atkSpeed = (wd && wd.atkSpeed) || 2.2;
    p.attackCd = 1 / atkSpeed;
    p.stamina = Math.max(0, p.stamina - 4);
    p.swingT = 0.22;
    p.moving = false;

    var dmgBase = p.atk + (wd && wd.dmg ? wd.dmg : 2);
    var range = ((wd && wd.range) || 1.3) * TILE;

    if (wtype === 'melee') {
      PK.Audio.sfx('swing');
      var a = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[p.dir];
      var hitAny = false;
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead) continue;
        var d = U.dist(p.x, p.y, e.x, e.y);
        if (d > range + e.r) continue;
        var ea = U.angleTo(p.x, p.y, e.x, e.y);
        var diff = Math.abs(((ea - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff < 1.1) {
          damageEnemy(e, dmgBase, { effect: wd && wd.effect, knockback: 90 });
          hitAny = true;
        }
      }
      // also hit resource nodes in front (chop/mine with attack)
      if (!hitAny) {
        var nx = p.x + Math.cos(a) * TILE, ny = p.y + Math.sin(a) * TILE;
        tryGatherAt(nx, ny, true);
      }
      damageWeapon(w);
    } else if (wtype === 'ranged') {
      // needs arrows
      var ammoId = (wd && wd.ammoType) || 'ammo_arrow';
      if (PK.Systems.Inv.count(player, ammoId) <= 0) { PK.UI.toast('No arrows!'); PK.Audio.sfx('error'); p.attackCd = 0.3; return; }
      PK.Systems.Inv.remove(player, ammoId, 1);
      PK.Audio.sfx('bow');
      var a2 = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[p.dir];
      fireProjectile(p.x, p.y - 6, Math.cos(a2) * 320, Math.sin(a2) * 320, dmgBase, 'player', 'arrow', { effect: wd && wd.effect });
      damageWeapon(w);
    } else { // magic
      var cost = 8;
      if (p.mp < cost) { PK.UI.toast('Not enough mana!'); PK.Audio.sfx('error'); p.attackCd = 0.3; return; }
      p.mp -= cost;
      PK.Audio.sfx('fireball');
      var a3 = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[p.dir];
      PK.FX.magic(p.x, p.y - 6, '#b388ff');
      fireProjectile(p.x, p.y - 6, Math.cos(a3) * 260, Math.sin(a3) * 260, dmgBase * 1.2, 'player', 'magic', { effect: { burn: 3 } });
      damageWeapon(w);
    }
    PK.UI.refreshHUD();
  }

  function damageWeapon(w) {
    if (w.item && w.def && w.def.dur) {
      w.item.dur = (w.item.dur === undefined ? w.def.dur : w.item.dur) - 1;
      if (w.item.dur <= 0) {
        PK.UI.toast('Your ' + w.def.name + ' broke!');
        PK.Audio.sfx('error');
        PK.Systems.Inv.equipment(player).weapon = null;
        recompute(player);
        PK.UI.refreshPanels();
      }
    }
  }

  function fireProjectile(x, y, vx, vy, dmg, from, kind, opts) {
    opts = opts || {};
    projectiles.push({ x: x, y: y, vx: vx, vy: vy, dmg: dmg, from: from, kind: kind, life: 0, maxLife: 2.2, effect: opts.effect, mult: opts.mult || 1, aoe: opts.aoe || 0 });
  }

  function useSkill(idx) {
    var p = player;
    if (!p || p.dead) return;
    var tree = PK.Data.SKILLS[p.cls] || [];
    var actives = tree.filter(function (n) { return n.kind === 'active'; });
    var sk = actives[idx];
    if (!sk || !(p.skills[sk.id] > 0)) { PK.UI.toast('Skill not learned (press K)'); return; }
    if ((p.cds[sk.id] || 0) > 0) { PK.UI.toast('Skill on cooldown'); return; }
    var ef = sk.effect || {};
    if (p.mp < (ef.mana || 0)) { PK.UI.toast('Not enough mana!'); PK.Audio.sfx('error'); return; }
    p.mp -= ef.mana || 0;
    p.cds[sk.id] = ef.cd || 8;
    var a = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[p.dir];
    var w = equippedWeapon();
    var dmgBase = p.atk + (w.def && w.def.dmg ? w.def.dmg : 2);

    if (ef.dash) {
      var d = ef.dash * TILE;
      var nx = p.x + Math.cos(a) * d, ny = p.y + Math.sin(a) * d;
      if (!PK.World.collideCircle(nx, ny, p.r)) { p.x = nx; p.y = ny; }
      PK.FX.burst(p.x, p.y, { n: 10, color: '#80deea', speed: 120, life: 0.4 });
      PK.Audio.sfx('dash');
    } else if (ef.teleport) {
      var t2 = ef.teleport * TILE;
      var mx = p.x + Math.cos(a) * t2, my = p.y + Math.sin(a) * t2;
      if (!PK.World.collideCircle(mx, my, p.r)) { PK.FX.magic(p.x, p.y, '#b388ff'); p.x = mx; p.y = my; PK.FX.magic(p.x, p.y, '#b388ff'); }
      PK.Audio.sfx('teleport');
    } else if (ef.aoe) {
      var R = ef.aoe * TILE;
      PK.Audio.sfx(ef.freeze ? 'frost' : 'explode');
      PK.FX.burst(p.x, p.y, { n: 22, color: ef.freeze ? '#b3e5fc' : '#ff8a65', speed: 200, life: 0.6 });
      PK.FX.shake(6, 0.3);
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dead) continue;
        if (U.dist(p.x, p.y, e.x, e.y) <= R + e.r) {
          var eff = {};
          if (ef.slow) eff.slow = ef.slow;
          if (ef.freeze) e.freezeT = Math.max(e.freezeT || 0, ef.freeze);
          damageEnemy(e, dmgBase * (ef.dmgMult || 1), { effect: eff, knockback: 140 });
        }
      }
    } else if (ef.shield) {
      p.buffs.push({ stat: 'def', amt: p.def * 0.6, until: gameTime + ef.duration });
      PK.FX.magic(p.x, p.y, '#ffe082');
      PK.Audio.sfx('buff');
      PK.UI.toast('Shield Wall! Defense up for ' + ef.duration + 's');
    } else if (ef.multishot) {
      PK.Audio.sfx('bow');
      for (var k = -1; k <= 1; k++) {
        var aa = a + k * 0.25;
        fireProjectile(p.x, p.y - 6, Math.cos(aa) * 320, Math.sin(aa) * 320, dmgBase * 0.8, 'player', 'arrow', {});
      }
    } else if (ef.poisonArrows) {
      p.poisonArrowsUntil = gameTime + ef.duration;
      PK.Audio.sfx('buff');
      PK.UI.toast('Poison arrows for ' + ef.duration + 's!');
    } else {
      // single-target projectile nuke
      PK.Audio.sfx('fireball');
      fireProjectile(p.x, p.y - 6, Math.cos(a) * 300, Math.sin(a) * 300, dmgBase * (ef.dmgMult || 2), 'player', ef.freeze ? 'ice' : 'fire', { effect: { burn: ef.burn || 0 }, aoe: ef.aoe || 0 });
    }
    recompute(p);
    PK.UI.refreshHUD();
  }

  /* ================= DAMAGE TO PLAYER ================= */
  function damagePlayer(raw, src) {
    var p = player;
    if (!p || p.dead || p.hurtT > 0) return 0;
    var dmg = raw * U.rand(Math.random, 0.9, 1.1);
    dmg = dmg * (1 - p.def / (p.def + 60));
    dmg = Math.max(1, Math.round(dmg));
    p.hp -= dmg;
    p.hurtT = 0.35;
    PK.FX.blood(p.x, p.y - 8);
    PK.FX.dmgNum(p.x, p.y - 16, dmg, 'player');
    PK.FX.shake(4, 0.2);
    PK.Audio.sfx('hit');
    if (src && src.x !== undefined) {
      var a = U.angleTo(src.x, src.y, p.x, p.y);
      p.kx = Math.cos(a) * 120; p.ky = Math.sin(a) * 120;
    }
    // armor durability damage
    var eq = PK.Systems.Inv.equipment(p);
    ['head', 'chest', 'legs', 'boots'].forEach(function (s) {
      var it = eq[s];
      if (it) {
        var d = PK.Data.ITEMS[it.id];
        if (d && d.dur) {
          it.dur = (it.dur === undefined ? d.dur : it.dur) - 1;
          if (it.dur <= 0) { PK.UI.toast('Your ' + d.name + ' broke!'); eq[s] = null; recompute(p); PK.UI.refreshPanels(); }
        }
      }
    });
    if (p.hp <= 0) killPlayer();
    PK.UI.refreshHUD();
    return dmg;
  }

  function killPlayer() {
    var p = player;
    p.dead = true; p.hp = 0; p.respawnT = 3;
    PK.Audio.sfx('death');
    PK.FX.burst(p.x, p.y, { n: 24, color: '#e53935', speed: 140, life: 0.9 });
    var lost = Math.floor(p.gold * 0.1);
    p.gold -= lost;
    PK.UI.onPlayerDeath(lost);
  }
  function respawn() {
    var p = player;
    p.dead = false; p.hp = p.maxhp; p.mp = p.maxmp; p.stamina = p.maxstamina;
    p.x = p.spawnX; p.y = p.spawnY;
    p.status = { poison: 0, burn: 0, freeze: 0, slow: 0 };
    enemies.forEach(function (e) { if (!e.boss && U.dist(e.x, e.y, p.x, p.y) < 10 * TILE) { e.state = 'idle'; e.hp = e.maxhp; } });
    PK.Audio.sfx('respawn');
    PK.UI.toast('You wake up at the waystone...');
    PK.UI.refreshHUD();
  }

  /* ================= INTERACT ================= */
  function tryGatherAt(wx, wy, fromAttack) {
    var tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    var near = PK.World.featuresNear(tx, ty, 2);
    for (var i = 0; i < near.length; i++) {
      var f = near[i];
      if (!PK.World.NODE_DROPS[f.type]) continue;
      if (!PK.World.isNodeReady(f, gameTime)) continue;
      if (Math.abs(f.tx - tx) > 1 || Math.abs(f.ty - ty) > 1) continue;
      gatherNode(f);
      return true;
    }
    return false;
  }
  function equippedToolKind() {
    var eq = PK.Systems.Inv.equipment(player);
    var w = eq.weapon ? PK.Data.ITEMS[eq.weapon.id] : null;
    if (!w || w.type !== 'tool') return null;
    if (w.toolKind) return w.toolKind;
    if (w.id.indexOf('axe') >= 0) return 'axe';
    if (w.id.indexOf('pickaxe') >= 0 || w.id.indexOf('pick') >= 0) return 'pickaxe';
    return null;
  }
  function gatherNode(f) {
    var res = PK.World.gather(f, equippedToolKind(), gameTime);
    if (!res) return;
    var p = player;
    res.drops.forEach(function (dp) {
      var leftover = PK.Systems.Inv.add(p, dp[0], dp[1]);
      if (leftover > 0) dropItem(dp[0], leftover, p.x, p.y);
    });
    p.gathered++;
    addXP(3);
    PK.Systems.Quests.event('gather', res.drops[0][0]);
    PK.Systems.Ach.checkGather(p.gathered);
    var sfx = f.type.indexOf('ore') === 0 || f.type === 'rock' ? 'mine' : (f.type === 'bush' ? 'pickup' : 'chop');
    PK.Audio.sfx(sfx);
    PK.FX.leafBurst(f.tx * TILE + 8, f.ty * TILE + 8);
    PK.UI.refreshHUD(); PK.UI.refreshPanels();
  }

  function interact() {
    var p = player;
    if (!p || p.dead) return;
    // NPCs first
    var bestNpc = null, bd = 2.2 * TILE;
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i], d = U.dist(p.x, p.y, n.x, n.y);
      if (d < bd) { bd = d; bestNpc = n; }
    }
    if (bestNpc) { PK.UI.openDialog(bestNpc.id); return; }
    var it = PK.World.nearestInteractable(p.x, p.y, 1.8 * TILE);
    if (!it) { tryGatherAt(p.x + DIRV[p.dir][0] * TILE, p.y + DIRV[p.dir][1] * TILE, false); return; }
    if (it.kind === 'node') { gatherNode(it.ref); }
    else if (it.kind === 'chest') {
      var res = PK.World.openChest(it.ref.id);
      if (res) {
        p.chestsOpened++;
        if (res.gold) { p.gold += res.gold; PK.FX.dmgNum(p.x, p.y - 20, '+' + res.gold + 'g', 'gold'); }
        res.loot.forEach(function (L) {
          var left = PK.Systems.Inv.add(p, L.id, L.qty);
          if (left > 0) dropItem(L.id, left, p.x, p.y);
          var d = PK.Data.ITEMS[L.id];
          PK.UI.toast('Found: ' + (d ? d.name : L.id) + (L.qty > 1 ? ' x' + L.qty : ''));
        });
        PK.Audio.sfx('chest');
        PK.FX.burst(it.ref.tx * TILE + 8, it.ref.ty * TILE + 8, { n: 14, color: '#ffd54f', speed: 100, life: 0.7 });
        PK.Systems.Ach.checkChests(p.chestsOpened);
        PK.UI.refreshHUD(); PK.UI.refreshPanels();
      }
    }
    else if (it.kind === 'sign') { PK.UI.showSign(it.ref.text); }
    else if (it.kind === 'station') {
      var k = it.ref.kind;
      if (k === 'workbench' || k === 'furnace' || k === 'anvil') PK.UI.openCrafting(k);
      else if (k === 'campfire') PK.UI.openCrafting('campfire');
      else if (k === 'bedroll') {
        p.hp = p.maxhp; p.mp = p.maxmp; p.stamina = p.maxstamina;
        healPlayer(0, 0);
        PK.UI.toast('You rest... fully recovered.');
        PK.Audio.sfx('heal');
        PK.Game.advanceTime(120);
      }
      else if (k === 'torch') { PK.UI.toast('A flickering torch.'); }
    }
    else if (it.kind === 'waystone') {
      var ws = it.ref;
      if (!ws.unlocked) {
        PK.World.unlockWaystone(ws.id);
        PK.Audio.sfx('teleport');
        PK.FX.magic(ws.tx * TILE + 8, ws.ty * TILE + 8, '#80deea');
        PK.UI.toast('Waystone unlocked: ' + ws.name + ' — fast travel available (M)');
        p.spawnX = ws.tx * TILE + 8; p.spawnY = ws.ty * TILE + 8;
      } else {
        PK.UI.openFastTravel();
      }
    }
  }

  /* ================= UPDATE ================= */
  function moveWithCollision(e, dx, dy) {
    var nx = e.x + dx;
    if (!PK.World.collideCircle(nx, e.y, e.r)) e.x = nx;
    var ny = e.y + dy;
    if (!PK.World.collideCircle(e.x, ny, e.r)) e.y = ny;
    e.x = U.clamp(e.x, TILE, (PK.World.W - 1) * TILE);
    e.y = U.clamp(e.y, TILE, (PK.World.H - 1) * TILE);
  }

  function updatePlayer(dt, input) {
    var p = player;
    p.playtime += dt;
    if (p.dead) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) respawn();
      return;
    }
    // timers
    if (p.attackCd > 0) p.attackCd -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.swingT > 0) p.swingT -= dt;
    for (var sk in p.cds) if (p.cds[sk] > 0) p.cds[sk] -= dt;
    // buffs expiry
    for (var bi = p.buffs.length - 1; bi >= 0; bi--) {
      if (gameTime >= p.buffs[bi].until) { p.buffs.splice(bi, 1); recompute(p); }
    }
    // status effects
    var st = p.status;
    ['poison', 'burn', 'freeze', 'slow'].forEach(function (k) { if (st[k] > 0) st[k] -= dt; });
    p.statusTick -= dt;
    if (p.statusTick <= 0) {
      p.statusTick = 0.5;
      if (st.poison > 0) { p.hp -= Math.max(1, p.maxhp * 0.02); PK.FX.dmgNum(p.x, p.y - 14, 'psn', 'enemy'); }
      if (st.burn > 0) { p.hp -= Math.max(1, p.maxhp * 0.03); PK.FX.burst(p.x, p.y - 8, { n: 3, color: '#ff7043', speed: 40, life: 0.4, up: 30 }); }
      if (p.hp <= 0) { killPlayer(); return; }
    }
    var frozen = st.freeze > 0;
    // movement
    var mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    p.moving = !!(mx || my) && !frozen;
    if (p.moving) {
      var len = Math.sqrt(mx * mx + my * my); mx /= len; my /= len;
      if (Math.abs(mx) > Math.abs(my)) p.dir = mx > 0 ? 'right' : 'left';
      else p.dir = my > 0 ? 'down' : 'up';
      var sprint = input.sprint && p.stamina > 1 && (mx || my);
      var spd = p.spd * TILE * (st.slow > 0 ? 0.6 : 1) * (sprint ? 1.5 : 1);
      if (sprint) p.stamina = Math.max(0, p.stamina - 12 * dt);
      moveWithCollision(p, mx * spd * dt, my * spd * dt);
      // knockback decay
      p.animT += dt * (sprint ? 11 : 8);
      p.steps += spd * dt / TILE;
      if (Math.floor(p.steps * 2) !== Math.floor((p.steps - spd * dt / TILE) * 2)) { /* footstep */ }
    } else p.animT += dt * 2;
    // knockback
    if (p.kx || p.ky) {
      moveWithCollision(p, p.kx * dt, p.ky * dt);
      p.kx *= Math.pow(0.001, dt); p.ky *= Math.pow(0.001, dt);
      if (Math.abs(p.kx) < 5) p.kx = 0;
      if (Math.abs(p.ky) < 5) p.ky = 0;
    }
    // regen
    p.regenT -= dt;
    if (p.regenT <= 0) {
      p.regenT = 1;
      if (!p.moving) p.stamina = Math.min(p.maxstamina, p.stamina + 10);
      p.hp = Math.min(p.maxhp, p.hp + p.maxhp * 0.008);
      p.mp = Math.min(p.maxmp, p.mp + p.maxmp * 0.02);
    }
    // boss proximity trigger
    if (!boss) {
      var bs = PK.World.bossSpawns();
      for (var id in bs) {
        if (bossesKilled[id]) continue;
        if (U.dist(p.x, p.y, bs[id].tx * TILE, bs[id].ty * TILE) < 9 * TILE) { spawnBoss(id); break; }
      }
    }
    PK.UI.refreshHUDLite();
  }

  function bossSpecial(e, phaseTrigger) {
    // telegraphed AoE slam
    e.telegraph = { x: e.x, y: e.y, r: 3 * TILE, t: 0, dur: 1.1, dmg: e.atk * 1.6 };
    PK.Audio.sfx('boss_roar');
  }

  function updateEnemy(e, dt) {
    var p = player;
    if (e.dead) { e.deadT += dt; return; }
    var d = e.def;
    if (e.hurtT > 0) e.hurtT -= dt;
    // status
    if (e.statusP > 0) { e.statusP -= dt; e.hp -= d.hp * 0.02 * dt * 10 * 0.1; }
    if (e.statusB > 0) { e.statusB -= dt; e.hp -= e.maxhp * 0.04 * dt; if (Math.random() < dt * 6) PK.FX.burst(e.x, e.y - 8, { n: 2, color: '#ff7043', speed: 40, life: 0.4, up: 30 }); }
    if (e.hp <= 0 && !e.dead) { killEnemy(e); return; }
    if (e.freezeT > 0) { e.freezeT -= dt; return; }
    var slowM = e.slowT > 0 ? 0.6 : 1;
    if (e.slowT > 0) e.slowT -= dt;
    // knockback
    if (e.kx || e.ky) {
      moveWithCollision(e, e.kx * dt, e.ky * dt);
      e.kx *= Math.pow(0.0005, dt); e.ky *= Math.pow(0.0005, dt);
      if (Math.abs(e.kx) < 5) e.kx = 0;
      if (Math.abs(e.ky) < 5) e.ky = 0;
    }
    // telegraph resolution
    if (e.telegraph) {
      e.telegraph.t += dt;
      if (e.telegraph.t >= e.telegraph.dur) {
        var tg = e.telegraph; e.telegraph = null;
        PK.FX.shake(7, 0.35);
        PK.FX.burst(tg.x, tg.y, { n: 20, color: '#ff8a65', speed: 220, life: 0.5 });
        PK.Audio.sfx('explode');
        if (U.dist(p.x, p.y, tg.x, tg.y) < tg.r) damagePlayer(tg.dmg, e);
      }
    }

    var distP = p.dead ? 1e9 : U.dist(e.x, e.y, p.x, p.y);
    var aggro = (d.aggro || 6) * TILE;
    var atkRange = (d.attackRange || 1.1) * TILE;
    var spd = (d.spd || 1.6) * TILE * slowM * (e.boss && e.phase > 0 ? 1.2 : 1);

    e.stateT -= dt;
    switch (e.state) {
      case 'idle':
        e.moving = false;
        if (distP < aggro) { e.state = 'chase'; }
        else if (e.stateT <= 0) { e.state = 'wander'; e.stateT = U.rand(Math.random, 2, 5); pickWander(e); }
        break;
      case 'wander':
        e.moving = true;
        moveToward(e, e.tx2, e.ty2, spd * 0.4, dt);
        if (distP < aggro) e.state = 'chase';
        else if (e.stateT <= 0 || U.dist(e.x, e.y, e.tx2, e.ty2) < 6) { e.state = 'idle'; e.stateT = U.rand(Math.random, 1, 4); }
        break;
      case 'chase': {
        if (distP > aggro * 1.8 || p.dead) {
          // leash back home
          if (U.dist(e.x, e.y, e.homeX, e.homeY) > 4 * TILE) { e.hp = e.maxhp; }
          e.state = 'idle'; e.stateT = 1; e.moving = false; break;
        }
        if (d.ranged) {
          // keep distance, shoot
          e.moving = false;
          if (distP > atkRange * 1.6) { moveToward(e, p.x, p.y, spd, dt); e.moving = true; }
          else if (distP < atkRange * 0.7) { moveToward(e, e.x * 2 - p.x, e.y * 2 - p.y, spd, dt); e.moving = true; }
          faceDir(e, p.x, p.y);
          e.attackT -= dt;
          if (e.attackT <= 0 && distP < atkRange * 2.2) {
            e.attackT = d.attackCd || 2;
            e.windup = 0.35;
            PK.Audio.sfx('bow');
          }
          if (e.windup > 0) {
            e.windup -= dt;
            if (e.windup <= 0) {
              var a = U.angleTo(e.x, e.y, p.x, p.y);
              fireProjectile(e.x, e.y - 6, Math.cos(a) * 200, Math.sin(a) * 200, e.atk, 'enemy', 'bolt', {});
            }
          }
        } else {
          if (distP <= atkRange) {
            e.state = 'windup'; e.windup = e.boss ? 0.7 : 0.4; e.moving = false;
            faceDir(e, p.x, p.y);
          } else {
            e.moving = true;
            moveToward(e, p.x, p.y, spd, dt);
            faceDir(e, p.x, p.y);
          }
        }
        // boss specials
        if (e.boss) {
          e.specialT -= dt;
          if (e.specialT <= 0) { e.specialT = U.rand(Math.random, 6, 11); bossSpecial(e); }
        }
        break;
      }
      case 'windup':
        e.moving = false;
        e.windup -= dt;
        if (e.windup <= 0) {
          // strike if still in range
          if (U.dist(e.x, e.y, p.x, p.y) <= atkRange * 1.4) damagePlayer(e.atk, e);
          e.state = 'chase';
          e.attackT = d.attackCd || 1.6;
        }
        break;
    }
    // separation
    for (var i = 0; i < enemies.length; i++) {
      var o = enemies[i];
      if (o === e || o.dead) continue;
      var dd = U.dist(e.x, e.y, o.x, o.y), min = e.r + o.r;
      if (dd < min && dd > 0.01) {
        var push = (min - dd) * 0.5, pa = U.angleTo(o.x, o.y, e.x, e.y);
        moveWithCollision(e, Math.cos(pa) * push, Math.sin(pa) * push);
      }
    }
    e.animT += dt * (e.moving ? 8 : 3);
  }
  function pickWander(e) {
    var a = Math.random() * Math.PI * 2, r = U.rand(Math.random, 1, 3) * TILE;
    e.tx2 = e.homeX + Math.cos(a) * r; e.ty2 = e.homeY + Math.sin(a) * r;
  }
  function moveToward(e, tx, ty, spd, dt) {
    var a = U.angleTo(e.x, e.y, tx, ty);
    moveWithCollision(e, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt);
  }
  function faceDir(e, tx, ty) {
    var dx = tx - e.x, dy = ty - e.y;
    e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }

  function updateProjectiles(dt) {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var pr = projectiles[i];
      pr.life += dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      var dead = pr.life >= pr.maxLife;
      var tx = Math.floor(pr.x / TILE), ty = Math.floor(pr.y / TILE);
      if (!dead && PK.World.isSolidTile(tx, ty)) {
        // arrows stick? just die with spark
        PK.FX.hitSpark(pr.x, pr.y, '#cfd8dc');
        dead = true;
      }
      if (!dead) {
        if (pr.from === 'player') {
          for (var j = 0; j < enemies.length; j++) {
            var e = enemies[j];
            if (e.dead) continue;
            if (U.dist2(pr.x, pr.y, e.x, e.y - 4) < (e.r + 4) * (e.r + 4)) {
              var eff = pr.effect || {};
              if (player.poisonArrowsUntil && gameTime < player.poisonArrowsUntil) eff.poison = 5;
              damageEnemy(e, pr.dmg * pr.mult, { effect: eff, knockback: 60, silent: true });
              PK.Audio.sfx('hit');
              if (pr.aoe > 0) {
                PK.FX.burst(pr.x, pr.y, { n: 16, color: '#ff8a65', speed: 180, life: 0.5 });
                for (var k = 0; k < enemies.length; k++) {
                  var e2 = enemies[k];
                  if (e2 === e || e2.dead) continue;
                  if (U.dist(pr.x, pr.y, e2.x, e2.y) < pr.aoe * TILE) damageEnemy(e2, pr.dmg * pr.mult * 0.6, { silent: true });
                }
              }
              dead = true; break;
            }
          }
        } else {
          var p = player;
          if (!p.dead && U.dist2(pr.x, pr.y, p.x, p.y - 4) < (p.r + 4) * (p.r + 4)) {
            damagePlayer(pr.dmg, pr);
            dead = true;
          }
        }
      }
      if (dead) projectiles.splice(i, 1);
    }
  }

  function updateDrops(dt) {
    var p = player;
    for (var i = drops.length - 1; i >= 0; i--) {
      var d = drops[i];
      d.t += dt;
      if (d.vx || d.vy) {
        d.x += d.vx * dt; d.y += d.vy * dt;
        d.vx *= Math.pow(0.01, dt); d.vy *= Math.pow(0.01, dt);
        if (Math.abs(d.vx) < 4) d.vx = 0;
        if (Math.abs(d.vy) < 4) d.vy = 0;
      }
      if (p.dead) continue;
      var dd = U.dist(d.x, d.y, p.x, p.y);
      if (dd < 2.2 * TILE) { var a = U.angleTo(d.x, d.y, p.x, p.y); d.x += Math.cos(a) * 130 * dt; d.y += Math.sin(a) * 130 * dt; }
      if (dd < 0.7 * TILE) {
        var left = PK.Systems.Inv.add(p, d.id, d.qty);
        if (left <= 0) {
          var item = PK.Data.ITEMS[d.id];
          PK.Audio.sfx('pickup');
          PK.FX.dmgNum(p.x, p.y - 22, (item ? item.name : d.id) + (d.qty > 1 ? ' x' + d.qty : ''), 'xp');
          drops.splice(i, 1);
          PK.UI.refreshPanels();
        } else d.qty = left;
      }
    }
  }

  function updateNPCs(dt) {
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      n.animT = (n.animT || 0) + dt * 2;
      // face player when near
      if (player && !player.dead && U.dist(n.x, n.y, player.x, player.y) < 3 * TILE) faceDir(n, player.x, player.y);
    }
  }

  /* spawner */
  function updateSpawner(dt) {
    spawnT -= dt;
    if (spawnT > 0) return;
    spawnT = 2.5;
    var p = player;
    if (!p || p.dead) return;
    var night = PK.Game.isNight();
    // count per region
    var counts = {};
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead || e.boss) continue;
      var r = PK.World.biomeAt(Math.floor(e.x / TILE), Math.floor(e.y / TILE));
      counts[r] = (counts[r] || 0) + 1;
    }
    var table = PK.World.spawnTable;
    for (var reg in table) {
      var list = table[reg];
      if (!list.length) continue;
      var cap = reg === PK.World.biomeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) ? 7 : 5;
      if ((counts[reg] || 0) >= cap) continue;
      if (Math.random() < 0.55) {
        var rd = PK.World.regionDef(reg);
        for (var tries = 0; tries < 12; tries++) {
          var tx = Math.round(rd.cx + (Math.random() * 2 - 1) * rd.rx * 0.9);
          var ty = Math.round(rd.cy + (Math.random() * 2 - 1) * rd.ry * 0.9);
          if (PK.World.biomeAt(tx, ty) !== reg) continue;
          if (PK.World.isSolidTile(tx, ty)) continue;
          var wx = tx * TILE + 8, wy = ty * TILE + 8;
          if (U.dist(wx, wy, p.x, p.y) < 9 * TILE) continue;
          if (U.dist(wx, wy, p.x, p.y) > 26 * TILE) continue;
          // weighted pick
          var total = 0, k;
          for (k = 0; k < list.length; k++) total += list[k][1];
          var roll = Math.random() * total, type = list[0][0];
          for (k = 0; k < list.length; k++) { roll -= list[k][1]; if (roll <= 0) { type = list[k][0]; break; } }
          // night bonus: tougher variants
          var hpMult = 1, atkMult = 1;
          if (night && Math.random() < 0.4) { hpMult = 1.5; atkMult = 1.3; }
          var lvlScale = 1 + (p.level - 1) * 0.06;
          spawnEnemy(type, tx, ty, { hpMult: hpMult * lvlScale, atkMult: atkMult * (1 + (p.level - 1) * 0.04) });
          break;
        }
      }
    }
  }

  /* ================= RENDER ================= */
  function drawShadow(ctx, x, y, r, cam) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x - cam.x, y - cam.y + r * 0.7, r * 0.9, r * 0.35, 0, 0, 7);
    ctx.fill();
  }

  function render(ctx, cam, tick, extras) {
    var S = PK.Sprites;
    // drops
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      var bob = Math.sin(d.t * 5) * 2;
      var icon = S.itemIcon(d.id);
      var sx = d.x - cam.x, sy = d.y - cam.y - 6 + bob;
      drawShadow(ctx, d.x, d.y + 2, 6, cam);
      ctx.drawImage(icon, sx - 8 * 1.5, sy - 8 * 1.5, 24, 24);
      if (d.qty > 1) {
        ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.strokeText('x' + d.qty, sx + 6, sy + 10); ctx.fillText('x' + d.qty, sx + 6, sy + 10);
      }
    }
    // build y-sorted list
    var drawables = [];
    for (var e2 = 0; e2 < enemies.length; e2++) if (!enemies[e2].dead || enemies[e2].deadT < 0.6) drawables.push(enemies[e2]);
    for (var n2 = 0; n2 < npcs.length; n2++) drawables.push(npcs[n2]);
    if (player) drawables.push(player);
    if (extras) for (var x2 = 0; x2 < extras.length; x2++) drawables.push(extras[x2]);
    drawables.sort(function (a, b) { return a.y - b.y; });

    for (var di = 0; di < drawables.length; di++) {
      var o = drawables[di];
      if (o.kind === 'player') renderPlayer(ctx, o, cam, tick);
      else if (o.kind === 'enemy') renderEnemy(ctx, o, cam, tick);
      else if (o.kind === 'feature') drawFeatureExtra(ctx, o, cam);
      else renderNPC(ctx, o, cam, tick);
    }
    // projectiles
    for (var pi = 0; pi < projectiles.length; pi++) {
      var pr = projectiles[pi];
      var px = pr.x - cam.x, py = pr.y - cam.y;
      if (pr.kind === 'arrow') {
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(pr.vy, pr.vx));
        ctx.fillStyle = '#d7ccc8'; ctx.fillRect(-8, -1, 14, 2);
        ctx.fillStyle = '#616161'; ctx.fillRect(4, -2, 4, 4);
        ctx.restore();
      } else {
        var col = pr.kind === 'fire' ? '#ff7043' : (pr.kind === 'ice' ? '#b3e5fc' : '#ce93d8');
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(px, py, 2.5, 0, 7); ctx.fill();
      }
    }
  }

  function renderPlayer(ctx, p, cam, tick) {
    var S = PK.Sprites;
    if (p.dead) {
      ctx.save(); ctx.globalAlpha = 0.6;
      var fr = S.playerFrames(p.appearance).down[0];
      ctx.translate(p.x - cam.x, p.y - cam.y);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(fr, -12, -36, 24, 36);
      ctx.restore();
      return;
    }
    var frames = S.playerFrames(p.appearance)[p.dir];
    var fi = p.moving ? Math.floor(p.animT) % 4 : 0;
    var img = frames[fi] || frames[0];
    var flash = p.hurtT > 0 && Math.floor(tick * 20) % 2 === 0;
    drawShadow(ctx, p.x, p.y, 9, cam);
    var sx = p.x - cam.x, sy = p.y - cam.y;
    var zw = 16 * 1.6, zh = 24 * 1.6;
    if (flash) { ctx.save(); ctx.globalAlpha = 0.55; }
    ctx.drawImage(img, sx - zw / 2, sy - zh, zw, zh);
    if (flash) ctx.restore();
    // swing arc
    if (p.swingT > 0) {
      var a = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[p.dir];
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sx, sy - 14, 26, a - 0.9, a + 0.9);
      ctx.stroke();
    }
    // name + hp bar (small)
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeText(p.name, sx, sy - zh - 14); ctx.fillText(p.name, sx, sy - zh - 14);
    bar(ctx, sx - 16, sy - zh - 12, 32, 4, p.hp / p.maxhp, '#e53935');
  }
  function bar(ctx, x, y, w, h, frac, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#333'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * U.clamp(frac, 0, 1), h);
  }
  function renderEnemy(ctx, e, cam, tick) {
    var S = PK.Sprites;
    var set = S.enemyFrames(e.type);
    var frames = set[e.dir] || set.down;
    var fi = Math.floor(e.animT) % frames.length;
    var fade = e.dead ? Math.max(0, 1 - e.deadT / 0.6) : 1;
    var sc = (e.boss ? 2.2 : 1.5) * (e.def.scale || 1);
    var img = frames[fi];
    var wpx = img.width * sc, hpx = img.height * sc;
    var flash = e.hurtT > 0;
    var windup = e.state === 'windup';
    drawShadow(ctx, e.x, e.y, e.r * 0.9, cam);
    ctx.save();
    ctx.globalAlpha = fade;
    if (flash && Math.floor(tick * 20) % 2 === 0) ctx.globalAlpha = fade * 0.5;
    if (windup) { ctx.translate(e.x - cam.x, e.y - cam.y); ctx.scale(1.15, 1.15); ctx.translate(-(e.x - cam.x), -(e.y - cam.y)); }
    ctx.drawImage(img, e.x - cam.x - wpx / 2, e.y - cam.y - hpx + e.r * 0.5, wpx, hpx);
    ctx.restore();
    if (e.boss && e.telegraph) {
      var tg = e.telegraph, k = tg.t / tg.dur;
      ctx.strokeStyle = 'rgba(255,60,60,' + (0.4 + 0.6 * k) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tg.x - cam.x, tg.y - cam.y, tg.r * k, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,60,60,0.15)';
      ctx.beginPath(); ctx.arc(tg.x - cam.x, tg.y - cam.y, tg.r, 0, 7); ctx.fill();
    }
    if (!e.dead && e.hp < e.maxhp) {
      var bw = e.boss ? 64 : 30;
      bar(ctx, e.x - cam.x - bw / 2, e.y - cam.y - hpx + e.r * 0.5 - 8, bw, 5, e.hp / e.maxhp, e.boss ? '#ff5722' : '#e53935');
      if (e.boss) {
        ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffccbc'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.strokeText(e.name, e.x - cam.x, e.y - cam.y - hpx + e.r * 0.5 - 12);
        ctx.fillText(e.name, e.x - cam.x, e.y - cam.y - hpx + e.r * 0.5 - 12);
      }
    }
  }
  function drawFeatureExtra(ctx, o, cam) {
    var src = o.f || o.chest || o.station || o.sign || o.waystone;
    if (!src) return;
    var x = src.tx * TILE + 8, y = src.ty * TILE + TILE;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x - cam.x, y - cam.y - 2, 13, 5, 0, 0, 7);
    ctx.fill();
    if (PK._drawFeature) PK._drawFeature(o, x, y);
  }
  function renderNPC(ctx, n, cam, tick) {
    var S = PK.Sprites;
    var set = S.npcFrames(n.kind);
    var frames = set[n.dir || 'down'] || set.down;
    var img = frames[Math.floor((n.animT || 0)) % frames.length];
    var zw = 16 * 1.6, zh = 24 * 1.6;
    drawShadow(ctx, n.x, n.y, 9, cam);
    ctx.drawImage(img, n.x - cam.x - zw / 2, n.y - cam.y - zh, zw, zh);
    var dlg = PK.Data.DIALOGS[n.id];
    if (dlg) {
      ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe082'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeText(dlg.name, n.x - cam.x, n.y - cam.y - zh - 6);
      ctx.fillText(dlg.name, n.x - cam.x, n.y - cam.y - zh - 6);
    }
  }

  /* ================= SERIALIZE ================= */
  function serialize() {
    var p = player;
    return {
      name: p.name, cls: p.cls, appearance: p.appearance,
      x: p.x, y: p.y, dir: p.dir, level: p.level, xp: p.xp, skillPoints: p.skillPoints,
      hp: p.hp, mp: p.mp, stamina: p.stamina, gold: p.gold,
      skills: p.skills, kills: p.kills, gathered: p.gathered, crafted: p.crafted,
      chestsOpened: p.chestsOpened, steps: Math.floor(p.steps), playtime: p.playtime,
      spawnX: p.spawnX, spawnY: p.spawnY,
      bossesKilled: Object.keys(bossesKilled)
    };
  }
  function deserialize(d) {
    player = newPlayer(d.name, d.cls, d.appearance);
    player.inv = PK.Systems.Inv.create(); // placeholder; real inv assigned by loader
    player.x = d.x; player.y = d.y; player.dir = d.dir || 'down';
    player.level = d.level; player.xp = d.xp; player.xpNext = xpNext(d.level);
    player.skillPoints = d.skillPoints || 0;
    player.skills = d.skills || {};
    player.kills = d.kills || {}; player.gathered = d.gathered || 0;
    player.crafted = d.crafted || 0; player.chestsOpened = d.chestsOpened || 0;
    player.steps = d.steps || 0; player.playtime = d.playtime || 0;
    player.spawnX = d.spawnX; player.spawnY = d.spawnY;
    player.gold = d.gold || 0;
    bossesKilled = {};
    (d.bossesKilled || []).forEach(function (id) { bossesKilled[id] = true; });
    recompute(player);
    player.hp = Math.min(d.hp, player.maxhp); player.mp = Math.min(d.mp, player.maxmp);
    player.stamina = d.stamina !== undefined ? d.stamina : player.maxstamina;
  }

  function init(g) {
    game = g;
    npcs = PK.World.npcs().map(function (n) {
      return { kind: 'npc', id: n.id, npcKind: n.kind, x: n.tx * TILE + 8, y: n.ty * TILE + 8, dir: 'down', animT: Math.random() * 4, r: 9 };
    });
    // npcFrames keyed by kind
    npcs.forEach(function (n) { n.kind2 = n.npcKind; });
  }
  // renderNPC uses n.kind — fix: store frame kind in n.kind
  function fixNpcKinds() { npcs.forEach(function (n) { n.frameKind = n.npcKind; }); }

  function update(dt, input) {
    gameTime += dt;
    updatePlayer(dt, input);
    for (var i = enemies.length - 1; i >= 0; i--) {
      updateEnemy(enemies[i], dt);
      if (enemies[i].dead && enemies[i].deadT > 0.6) enemies.splice(i, 1);
    }
    updateProjectiles(dt);
    updateDrops(dt);
    updateNPCs(dt);
    updateSpawner(dt);
  }

  function reset() {
    enemies = []; projectiles = []; drops = [];
    boss = null; bossesKilled = {}; player = null; gameTime = 0;
  }

  return {
    init: init, reset: reset,
    newPlayer: newPlayer, recompute: recompute,
    get player() { return player; },
    set player(v) { player = v; },
    get enemies() { return enemies; },
    get npcs() { return npcs; },
    get drops() { return drops; },
    get boss() { return boss; },
    get time() { return gameTime; },
    bossesKilled: function () { return bossesKilled; },
    spawnEnemy: spawnEnemy, spawnBoss: spawnBoss,
    update: update, render: render,
    playerAttack: playerAttack, damagePlayer: damagePlayer,
    damageEnemy: damageEnemy, healPlayer: healPlayer, addXP: addXP,
    useSkill: useSkill, interact: interact, dropItem: dropItem,
    serialize: serialize, deserialize: deserialize,
    equippedWeapon: equippedWeapon, equippedToolKind: equippedToolKind,
    faceDir: faceDir
  };
})();

// NPC frame-kind patch: renderNPC expects n.kind to be the sprite kind.
// We remap at init time via a wrapper applied in main.js after init.
(function () {
  var origInit = PK.Entities.init;
  PK.Entities.init = function (g) {
    origInit(g);
    PK.Entities.npcs.forEach(function (n) { n.kind = n.npcKind; });
  };
})();
