/* ============================================================
   PIXEL KINGDOM — ui.js
   All DOM UI: title, char creation, HUD, panels, dialogs, shops,
   map, settings, toasts, save slots.
   Depends: PK (utils), PK.Data, PK.Sprites, PK.Systems, PK.Entities,
            PK.World, PK.Save, PK.Audio, PK.Game (main).
   ============================================================ */
var PK = PK || {};

PK.UI = (function () {
  'use strict';
  var U = PK.Utils;
  var root, hud, overlays, toastRoot, minimapCv, bossBar;
  var openPanel = null;      // current panel name
  var panelData = {};        // extra data for panels (e.g. crafting station)
  var dragSel = null;        // {where, i} touch-style selection
  var lastHud = {};
  var promptEl = null;
  var dialogState = null;

  function $(id) { return document.getElementById(id); }
  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  /* ================= INIT ================= */
  function init() {
    root = $('game-root');
    buildHUD();
    buildTitle();
    buildCreate();
    overlays = $('overlays');
    toastRoot = $('toast-root');
    bindGlobalKeys();
    // animated title background
    titleAnim();
  }

  /* ================= HUD ================= */
  function buildHUD() {
    hud = $('hud');
    hud.innerHTML =
      '<div id="hud-topleft">' +
        '<div id="obj-tracker"></div>' +
      '</div>' +
      '<div id="hud-topright">' +
        '<canvas id="minimap" width="160" height="160"></canvas>' +
        '<div id="hud-clock"></div>' +
      '</div>' +
      '<div id="hud-bottomleft">' +
        '<div class="bar-row"><div class="bar-label">HP</div><div class="bar hp"><div id="bar-hp"></div><span id="bar-hp-t"></span></div></div>' +
        '<div class="bar-row"><div class="bar-label">MP</div><div class="bar mp"><div id="bar-mp"></div><span id="bar-mp-t"></span></div></div>' +
        '<div class="bar-row"><div class="bar-label">ST</div><div class="bar st"><div id="bar-st"></div></div></div>' +
        '<div class="bar-row xp"><div class="bar xpbar"><div id="bar-xp"></div><span id="bar-xp-t"></span></div></div>' +
        '<div id="hud-level"></div>' +
      '</div>' +
      '<div id="hud-bottomcenter"><div id="hotbar"></div><div id="hud-gold"></div></div>' +
      '<div id="hud-bottomright">' +
        '<div id="hud-skillbar"></div>' +
        '<div id="hud-menubtns">' +
          '<button data-p="inventory" title="Inventory (I)">🎒</button>' +
          '<button data-p="character" title="Character (C)">🧝</button>' +
          '<button data-p="crafting" title="Crafting (B)">⚒️</button>' +
          '<button data-p="skills" title="Skills (K)">✨</button>' +
          '<button data-p="quests" title="Quests (J)">📜</button>' +
          '<button data-p="map" title="Map (M)">🗺️</button>' +
          '<button data-p="pause" title="Menu (Esc)">☰</button>' +
        '</div>' +
      '</div>' +
      '<div id="boss-bar" class="hidden"><div id="boss-name"></div><div class="bar boss"><div id="boss-fill"></div></div></div>' +
      '<div id="interact-prompt" class="hidden"></div>' +
      '<div id="toast-root"></div>';
    toastRoot = $('toast-root');
    minimapCv = $('minimap');
    bossBar = $('boss-bar');
    promptEl = $('interact-prompt');
    hud.querySelectorAll('#hud-menubtns button').forEach(function (b) {
      b.addEventListener('click', function () { togglePanel(b.dataset.p); });
    });
    buildHotbar();
    buildSkillBar();
    hud.style.display = 'none';
  }

  function buildHotbar() {
    var hb = $('hotbar');
    hb.innerHTML = '';
    for (var i = 0; i < PK.Config.HOTBAR_SIZE; i++) {
      (function (i) {
        var s = el('<div class="hotbar-slot" data-i="' + i + '"><span class="hk">' + (i + 1) + '</span></div>');
        s.addEventListener('click', function () {
          if (dragSel) { // assign dragged item to hotbar
            var id = itemIdAt(dragSel.where, dragSel.i);
            if (id) { PK.Entities.player.inv.hotbar[i] = id; dragSel = null; refreshPanels(); refreshHotbar(); }
          } else {
            PK.Systems.Inv.hotbarUse(PK.Entities.player, i);
          }
        });
        hb.appendChild(s);
      })(i);
    }
  }
  function itemIdAt(where, i) {
    var p = PK.Entities.player;
    var s = PK.Systems.Inv.get(p, where, i);
    return s ? s.id : null;
  }
  function refreshHotbar() {
    var p = PK.Entities.player;
    if (!p) return;
    var hb = $('hotbar').children;
    for (var i = 0; i < hb.length; i++) {
      var id = p.inv.hotbar[i];
      var slot = hb[i];
      slot.innerHTML = '<span class="hk">' + (i + 1) + '</span>';
      if (id) {
        var icon = PK.Sprites.itemIcon(id);
        var img = iconToImg(icon, 30);
        slot.appendChild(img);
        var def = PK.Data.ITEMS[id];
        slot.title = def ? def.name : id;
      }
    }
  }
  function iconToImg(canvas, size) {
    var img = document.createElement('canvas');
    img.width = img.height = size || 32;
    var g = img.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(canvas, 0, 0, img.width, img.height);
    img.className = 'pix';
    return img;
  }

  function buildSkillBar() {
    var sb = $('hud-skillbar');
    sb.innerHTML = '';
    ['Q', 'E', 'R'].forEach(function (k, idx) {
      var d = el('<div class="skill-slot" data-i="' + idx + '"><span class="hk">' + k + '</span><div class="cd"></div></div>');
      d.title = 'Skill ' + (idx + 1);
      d.addEventListener('click', function () { PK.Entities.useSkill(idx); });
      sb.appendChild(d);
    });
  }
  function refreshSkillBar() {
    var p = PK.Entities.player;
    if (!p) return;
    var tree = (PK.Data.SKILLS[p.cls] || []).filter(function (n) { return n.kind === 'active'; });
    var sb = $('hud-skillbar').children;
    for (var i = 0; i < sb.length; i++) {
      var sk = tree[i], slot = sb[i];
      slot.querySelectorAll('.sk-icon').forEach(function (e) { e.remove(); });
      if (sk && p.skills[sk.id] > 0) {
        var ic = el('<div class="sk-icon">' + sk.name.charAt(0) + '</div>');
        slot.insertBefore(ic, slot.firstChild);
        slot.title = sk.name + ' — ' + sk.desc;
        var cd = p.cds[sk.id] || 0, max = (sk.effect && sk.effect.cd) || 8;
        slot.querySelector('.cd').style.height = (cd > 0 ? (cd / max * 100) : 0) + '%';
        slot.classList.toggle('ready', cd <= 0);
      } else {
        slot.title = 'Skill ' + (i + 1) + ' (learn in Skills panel)';
        slot.querySelector('.cd').style.height = '0%';
        slot.classList.remove('ready');
      }
    }
  }

  function setBar(id, tid, cur, max) {
    var key = id + cur + '/' + max;
    if (lastHud[id] === key) return;
    lastHud[id] = key;
    var b = $(id);
    if (b) b.style.width = U.clamp(cur / max * 100, 0, 100) + '%';
    var t = $(tid);
    if (t) t.textContent = Math.ceil(cur) + '/' + Math.ceil(max);
  }
  function refreshHUD() {
    var p = PK.Entities.player;
    if (!p || hud.style.display === 'none') return;
    setBar('bar-hp', 'bar-hp-t', p.hp, p.maxhp);
    setBar('bar-mp', 'bar-mp-t', p.mp, p.maxmp);
    setBar('bar-st', null, p.stamina, p.maxstamina);
    setBar('bar-xp', 'bar-xp-t', p.xp, p.xpNext);
    if (lastHud.lvl !== p.level) { lastHud.lvl = p.level; $('hud-level').textContent = 'Lv ' + p.level + ' ' + p.name; }
    if (lastHud.gold !== p.gold) { lastHud.gold = p.gold; $('hud-gold').textContent = '🪙 ' + U.fmtNum(p.gold); }
    refreshHotbar();
    refreshSkillBar();
    updateObjectiveTracker();
    drawMinimap();
    updateClock();
    // boss bar
    var b = PK.Entities.boss;
    if (b && !b.dead) {
      bossBar.classList.remove('hidden');
      if (lastHud.bossn !== b.name) { lastHud.bossn = b.name; $('boss-name').textContent = '☠ ' + b.name; }
      $('boss-fill').style.width = U.clamp(b.hp / b.maxhp * 100, 0, 100) + '%';
    } else bossBar.classList.add('hidden');
  }
  function refreshHUDLite() {
    // called every frame; only cheap updates
    var p = PK.Entities.player;
    if (!p || hud.style.display === 'none') return;
    setBar('bar-hp', 'bar-hp-t', p.hp, p.maxhp);
    setBar('bar-mp', 'bar-mp-t', p.mp, p.maxmp);
    setBar('bar-st', null, p.stamina, p.maxstamina);
    var b = PK.Entities.boss;
    if (b && !b.dead) {
      bossBar.classList.remove('hidden');
      $('boss-fill').style.width = U.clamp(b.hp / b.maxhp * 100, 0, 100) + '%';
    } else if (!bossBar.classList.contains('hidden')) bossBar.classList.add('hidden');
  }
  function updateClock() {
    var t = PK.Game.dayTime(); // 0..1
    var hrs = Math.floor(t * 24), mm = Math.floor((t * 24 - hrs) * 60);
    var icon = PK.Game.isNight() ? '🌙' : '☀️';
    var key = hrs + ':' + mm;
    if (lastHud.clock !== key) {
      lastHud.clock = key;
      $('hud-clock').textContent = icon + ' ' + String(hrs).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }
  }
  function updateObjectiveTracker() {
    var qs = PK.Systems.Quests.state;
    var html = '';
    var act = Object.keys(qs.active);
    // main quest first
    act.sort(function (a, b) {
      var qa = PK.Systems.Quests.get(a), qb = PK.Systems.Quests.get(b);
      return (qa.type === 'main' ? 0 : 1) - (qb.type === 'main' ? 0 : 1);
    });
    if (act.length) {
      var q = PK.Systems.Quests.get(act[0]);
      html = '<div class="obj-title">📜 ' + U.esc(q.name) + '</div>';
      for (var i = 0; i < Math.min(3, q.objectives.length); i++)
        html += '<div class="obj-line">' + U.esc(PK.Systems.Quests.objectiveText(q, i)) + '</div>';
    }
    if (lastHud.obj !== html) { lastHud.obj = html; $('obj-tracker').innerHTML = html; }
  }
  function drawMinimap() {
    var p = PK.Entities.player;
    if (!p) return;
    // throttle: every ~200ms
    var now = performance.now();
    if (lastHud.mm && now - lastHud.mm < 250) return;
    lastHud.mm = now;
    var g = minimapCv.getContext('2d');
    var mm = PK.World.minimap();
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 160, 160);
    g.drawImage(mm, 0, 0);
    // quest markers
    var qs = PK.Systems.Quests.state;
    g.fillStyle = '#ffeb3b';
    for (var qid in qs.active) {
      var q = PK.Systems.Quests.get(qid);
      if (!q) continue;
      q.objectives.forEach(function (o) {
        if (o.kind === 'reach' && o.x !== undefined) {
          g.fillRect(o.x - 2, o.y - 2, 5, 5);
        }
      });
      if (q.giver) {
        var npc = PK.Entities.npcs.find(function (n) { return n.id === q.giver; });
        if (npc) { g.fillStyle = '#ffeb3b'; g.fillRect(npc.x / 16 - 2, npc.y / 16 - 2, 5, 5); g.fillStyle = '#ffeb3b'; }
      }
    }
    // boss marker
    var b = PK.Entities.boss;
    if (b && !b.dead) { g.fillStyle = '#f44336'; g.fillRect(b.x / 16 - 3, b.y / 16 - 3, 7, 7); }
    // player
    g.fillStyle = '#fff';
    g.fillRect(p.x / 16 - 2, p.y / 16 - 2, 5, 5);
    g.strokeStyle = '#000'; g.lineWidth = 1;
    g.strokeRect(p.x / 16 - 2.5, p.y / 16 - 2.5, 6, 6);
  }
  function setPrompt(text) {
    if (!text) { promptEl.classList.add('hidden'); return; }
    if (lastHud.prompt !== text) { lastHud.prompt = text; promptEl.innerHTML = text; }
    promptEl.classList.remove('hidden');
  }

  /* ================= TITLE ================= */
  var titleCv = null, titleT = 0;
  function buildTitle() {
    var s = $('screen-title');
    s.innerHTML =
      '<canvas id="title-bg"></canvas>' +
      '<div class="title-wrap">' +
        '<div class="game-logo">⚔️ PIXEL KINGDOM ⚔️</div>' +
        '<div class="game-sub">Restore the fallen kingdom...</div>' +
        '<div class="title-btns">' +
          '<button id="btn-new" class="px-btn big">✨ New Game</button>' +
          '<button id="btn-continue" class="px-btn big">▶ Continue</button>' +
          '<button id="btn-help" class="px-btn">❓ How to Play</button>' +
          '<button id="btn-settings" class="px-btn">⚙️ Settings</button>' +
          '<button id="btn-credits" class="px-btn">🎭 Credits</button>' +
        '</div>' +
        '<div class="title-foot">v1.0 • A 2D pixel-art RPG • Progress saves locally</div>' +
      '</div>';
    $('btn-new').addEventListener('click', function () { PK.Audio.unlock(); PK.Audio.sfx('ui'); showCreate(); });
    $('btn-continue').addEventListener('click', function () { PK.Audio.unlock(); PK.Audio.sfx('ui'); openSaveSlots('load'); });
    $('btn-help').addEventListener('click', function () { PK.Audio.sfx('ui'); togglePanel('help'); });
    $('btn-settings').addEventListener('click', function () { PK.Audio.sfx('ui'); togglePanel('settings'); });
    $('btn-credits').addEventListener('click', function () { PK.Audio.sfx('ui'); togglePanel('credits'); });
    PK.Audio.music('title');
  }
  function titleAnim() {
    titleCv = $('title-bg');
    function frame() {
      if (!$('screen-title').classList.contains('active')) { requestAnimationFrame(frame); return; }
      titleT += 0.016;
      var g = titleCv.getContext('2d');
      var w = titleCv.width = titleCv.clientWidth, h = titleCv.height = titleCv.clientHeight;
      var grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0b1026'); grad.addColorStop(0.6, '#1b2a4a'); grad.addColorStop(1, '#0e3b2e');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      // stars
      g.fillStyle = '#fff';
      for (var i = 0; i < 80; i++) {
        var x = (i * 137.5) % w, y = (i * 89.3) % (h * 0.6);
        g.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(titleT * 2 + i));
        g.fillRect(x, y, 2, 2);
      }
      g.globalAlpha = 1;
      // moon
      g.fillStyle = '#f5f3ce';
      g.beginPath(); g.arc(w * 0.8, h * 0.2, 34, 0, 7); g.fill();
      g.fillStyle = '#0b1026';
      g.beginPath(); g.arc(w * 0.8 - 12, h * 0.2 - 8, 30, 0, 7); g.fill();
      // mountains silhouette
      g.fillStyle = '#101a33';
      g.beginPath(); g.moveTo(0, h * 0.75);
      for (var m = 0; m <= 10; m++) g.lineTo(w * m / 10, h * 0.75 - Math.abs(Math.sin(m * 2.3)) * h * 0.22);
      g.lineTo(w, h); g.lineTo(0, h); g.fill();
      // drifting pixel sprites if ready
      if (PK.Sprites.ready) {
        try {
          var slime = PK.Sprites.frame('slime', titleT);
          g.imageSmoothingEnabled = false;
          g.drawImage(slime, (titleT * 30) % (w + 80) - 40, h * 0.82, 48, 48);
        } catch (e) {}
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ================= CHARACTER CREATION ================= */
  var createData = { name: '', cls: 'warrior', appearance: { skin: '#f1c27d', hair: '#4a3226', shirt: '#3f51b5', pants: '#5d4037' } };
  var SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
  var HAIRS = ['#2b2b2b', '#4a3226', '#8a5a2b', '#c0c0c0', '#b71c1c'];
  var SHIRTS = ['#3f51b5', '#2e7d32', '#b71c1c', '#6a1b9a', '#00838f', '#e65100'];
  var PANTS = ['#5d4037', '#37474f', '#1b5e20', '#4e342e'];
  function buildCreate() {
    var s = $('screen-create');
    s.innerHTML =
      '<div class="panel create-panel">' +
        '<h2>✨ Create Your Hero ✨</h2>' +
        '<label class="fld">Hero name<input id="cc-name" maxlength="14" placeholder="e.g. Madara"></label>' +
        '<div class="fld">Class<div id="cc-classes" class="class-cards"></div></div>' +
        '<div class="fld">Appearance' +
          '<div class="appr-row"><span>Skin</span><div id="cc-skin" class="swatches"></div></div>' +
          '<div class="appr-row"><span>Hair</span><div id="cc-hair" class="swatches"></div></div>' +
          '<div class="appr-row"><span>Tunic</span><div id="cc-shirt" class="swatches"></div></div>' +
          '<div class="appr-row"><span>Pants</span><div id="cc-pants" class="swatches"></div></div>' +
        '</div>' +
        '<div class="create-preview"><canvas id="cc-preview" width="96" height="144"></canvas><div id="cc-desc"></div></div>' +
        '<div class="row-btns"><button id="cc-back" class="px-btn">← Back</button><button id="cc-start" class="px-btn big">⚔️ Begin Adventure</button></div>' +
      '</div>';
    function swatchRow(id, colors, key) {
      var row = $(id);
      colors.forEach(function (c) {
        var b = el('<button class="sw" style="background:' + c + '"></button>');
        b.addEventListener('click', function () {
          createData.appearance[key] = c;
          row.querySelectorAll('.sw').forEach(function (x) { x.classList.remove('sel'); });
          b.classList.add('sel');
          drawPreview();
        });
        if (createData.appearance[key] === c) b.classList.add('sel');
        row.appendChild(b);
      });
    }
    swatchRow('cc-skin', SKINS, 'skin'); swatchRow('cc-hair', HAIRS, 'hair');
    swatchRow('cc-shirt', SHIRTS, 'shirt'); swatchRow('cc-pants', PANTS, 'pants');
    var cc = $('cc-classes');
    Object.keys(PK.Data.CLASSES).forEach(function (k) {
      var c = PK.Data.CLASSES[k];
      var card = el('<div class="class-card' + (k === 'warrior' ? ' sel' : '') + '" data-k="' + k + '"><b>' + c.name + '</b><p>' + c.desc + '</p></div>');
      card.addEventListener('click', function () {
        createData.cls = k;
        cc.querySelectorAll('.class-card').forEach(function (x) { x.classList.remove('sel'); });
        card.classList.add('sel');
        $('cc-desc').textContent = c.desc;
      });
      cc.appendChild(card);
    });
    $('cc-desc').textContent = PK.Data.CLASSES.warrior.desc;
    $('cc-back').addEventListener('click', function () { showScreen('title'); });
    $('cc-start').addEventListener('click', function () {
      var name = $('cc-name').value.trim() || 'Hero';
      PK.Audio.sfx('ui');
      PK.Game.startNewGame(name, createData.cls, Object.assign({}, createData.appearance));
    });
    drawPreview();
  }
  function drawPreview() {
    if (!PK.Sprites.ready) { setTimeout(drawPreview, 300); return; }
    var cv = $('cc-preview');
    if (!cv) return;
    var g = cv.getContext('2d');
    g.clearRect(0, 0, 96, 144);
    g.imageSmoothingEnabled = false;
    try {
      var fr = PK.Sprites.playerFrames(createData.appearance).down[0];
      g.drawImage(fr, 0, 0, 96, 144);
    } catch (e) {}
  }
  function showCreate() {
    showScreen('create');
    drawPreview();
  }

  /* ================= SCREENS ================= */
  function showScreen(name) {
    ['title', 'create'].forEach(function (s) {
      $('screen-' + s).classList.toggle('active', s === name);
    });
    $('hud').style.display = name === 'game' ? 'block' : 'none';
    if (name === 'title') { PK.Audio.music('title'); }
  }
  function showGame() {
    $('screen-title').classList.remove('active');
    $('screen-create').classList.remove('active');
    $('hud').style.display = 'block';
    PK.Audio.music(null); // engine auto-switches
  }

  /* ================= PANELS ================= */
  function togglePanel(name, data) {
    if (openPanel === name) { closePanel(); return; }
    openPanel = name;
    panelData = data || {};
    renderPanel();
    PK.Audio.sfx('open');
  }
  function closePanel() {
    openPanel = null;
    overlays.innerHTML = '';
    PK.Audio.sfx('close');
  }
  function refreshPanels() {
    if (openPanel) renderPanel(true);
    refreshHotbar();
  }
  function panelShell(title, innerHtml, wide) {
    overlays.innerHTML =
      '<div class="overlay" id="ovl">' +
        '<div class="panel' + (wide ? ' wide' : '') + '">' +
          '<div class="panel-head"><h2>' + title + '</h2><button class="px-btn small" id="panel-x">✕</button></div>' +
          '<div class="panel-body">' + innerHtml + '</div>' +
        '</div>' +
      '</div>';
    $('ovl').addEventListener('click', function (e) { if (e.target.id === 'ovl') closePanel(); });
    $('panel-x').addEventListener('click', closePanel);
  }

  function renderPanel(soft) {
    var p = PK.Entities.player;
    switch (openPanel) {
      case 'inventory': renderInventory(p); break;
      case 'character': renderCharacter(p); break;
      case 'crafting': renderCrafting(p, panelData.station || 'hand'); break;
      case 'skills': renderSkills(p); break;
      case 'quests': renderQuests(p); break;
      case 'map': renderMap(p); break;
      case 'settings': renderSettings(); break;
      case 'achievements': renderAchievements(); break;
      case 'help': renderHelp(); break;
      case 'credits': renderCredits(); break;
      case 'pause': renderPause(); break;
      case 'shop': renderShop(p, panelData.shop); break;
      case 'storage': renderStorage(p); break;
      case 'fasttravel': renderFastTravel(p); break;
      case 'saves': renderSaveSlots(panelData.mode || 'save'); break;
    }
  }

  /* ---- item slot html ---- */
  function slotHtml(where, i, s) {
    var inner = '';
    if (s) {
      var def = PK.Data.ITEMS[s.id];
      inner = '<canvas class="slot-icon" data-icon="' + s.id + '" width="32" height="32"></canvas>';
      if (s.qty > 1) inner += '<span class="qty">' + s.qty + '</span>';
      var dur = s.dur !== undefined ? s.dur : (def && def.dur);
      if (def && def.dur && dur !== undefined && dur < def.dur)
        inner += '<div class="dur"><div style="width:' + (dur / def.dur * 100) + '%"></div></div>';
      if (def) inner += '<span class="rar r' + def.rarity + '"></span>';
    }
    var sel = dragSel && dragSel.where === where && dragSel.i === i ? ' sel' : '';
    return '<div class="slot' + sel + '" data-where="' + where + '" data-i="' + i + '">' + inner + '</div>';
  }
  function paintSlotIcons(rootEl) {
    rootEl.querySelectorAll('canvas.slot-icon').forEach(function (cv) {
      var g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(PK.Sprites.itemIcon(cv.dataset.icon), 0, 0, 32, 32);
    });
  }
  function bindSlots(rootEl, opts) {
    opts = opts || {};
    var isTouch = PK.Mobile.isTouch();
    rootEl.querySelectorAll('.slot').forEach(function (slotDiv) {
      var where = slotDiv.dataset.where, i = +slotDiv.dataset.i;
      // tooltip
      slotDiv.addEventListener('mouseenter', function (e) {
        var s = PK.Systems.Inv.get(PK.Entities.player, where, i);
        if (s) showTooltip(e.clientX, e.clientY, tooltipHtml(s.id, s));
      });
      slotDiv.addEventListener('mousemove', function (e) { moveTooltip(e.clientX, e.clientY); });
      slotDiv.addEventListener('mouseleave', hideTooltip);
      // desktop drag & drop
      slotDiv.draggable = true;
      slotDiv.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ where: where, i: i }));
      });
      slotDiv.addEventListener('dragover', function (e) { e.preventDefault(); });
      slotDiv.addEventListener('drop', function (e) {
        e.preventDefault();
        try {
          var d = JSON.parse(e.dataTransfer.getData('text/plain'));
          PK.Systems.Inv.move(PK.Entities.player, d.where, d.i, where, i);
        } catch (err) {}
      });
      // click: touch select-then-place OR desktop quick actions
      slotDiv.addEventListener('click', function (e) {
        var p = PK.Entities.player;
        if (isTouch || opts.tapMode) {
          if (!dragSel) {
            var s = PK.Systems.Inv.get(p, where, i);
            if (s) { dragSel = { where: where, i: i }; PK.Audio.sfx('ui'); refreshPanels(); }
          } else {
            if (dragSel.where === where && dragSel.i === i) { dragSel = null; }
            else PK.Systems.Inv.move(p, dragSel.where, dragSel.i, where, i);
            dragSel = null;
            refreshPanels();
          }
          return;
        }
        // desktop: double-click = use/equip
        // single click with dragSel from hotbar assignment handled in hotbar
      });
      slotDiv.addEventListener('dblclick', function () {
        PK.Systems.Inv.useItem(PK.Entities.player, where, i);
      });
      slotDiv.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        var p = PK.Entities.player;
        var s = PK.Systems.Inv.get(p, where, i);
        if (!s) return;
        // right-click: split stack or drop-one menu -> simple: split if stackable else drop
        if (s.qty > 1 && (where === 'inv' || where === 'storage')) PK.Systems.Inv.split(p, where, i);
        else PK.Systems.Inv.drop(p, where, i, false);
      });
    });
  }
  function tooltipHtml(id, s) {
    var def = PK.Data.ITEMS[id];
    if (!def) return U.esc(id);
    var h = '<div class="tt-name r' + def.rarity + '">' + U.esc(def.name) + '</div>';
    h += '<div class="tt-type">' + PK.Data.RARITY[def.rarity] + ' ' + def.type + '</div>';
    if (def.dmg) h += '<div class="tt-stat">⚔ Damage: ' + def.dmg + '</div>';
    if (def.stats) for (var k in def.stats) h += '<div class="tt-stat">+' + def.stats[k] + ' ' + k.toUpperCase() + '</div>';
    if (def.heal) h += '<div class="tt-stat">+' + (def.heal.hp || 0) + ' HP' + (def.heal.mp ? ' +' + def.heal.mp + ' MP' : '') + '</div>';
    if (def.atkSpeed) h += '<div class="tt-stat">Speed: ' + def.atkSpeed + '/s</div>';
    if (def.dur) {
      var cur = s && s.dur !== undefined ? s.dur : def.dur;
      h += '<div class="tt-stat">Durability: ' + cur + '/' + def.dur + '</div>';
    }
    if (def.effect) {
      var ef = [];
      if (def.effect.poison) ef.push('poison');
      if (def.effect.burn) ef.push('burn');
      if (def.effect.slow) ef.push('slow');
      if (ef.length) h += '<div class="tt-stat">✨ ' + ef.join(', ') + '</div>';
    }
    h += '<div class="tt-desc">' + U.esc(def.desc) + '</div>';
    h += '<div class="tt-price">Value: ' + def.price + 'g</div>';
    h += '<div class="tt-hint">Double-click: use/equip • Right-click: split/drop</div>';
    return h;
  }
  var tooltipEl = null;
  function showTooltip(x, y, html) {
    hideTooltip();
    tooltipEl = el('<div class="tooltip">' + html + '</div>');
    document.body.appendChild(tooltipEl);
    moveTooltip(x, y);
  }
  function moveTooltip(x, y) {
    if (!tooltipEl) return;
    var w = tooltipEl.offsetWidth, h = tooltipEl.offsetHeight;
    tooltipEl.style.left = Math.min(x + 14, window.innerWidth - w - 8) + 'px';
    tooltipEl.style.top = Math.min(y + 14, window.innerHeight - h - 8) + 'px';
  }
  function hideTooltip() { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } }

  /* ---- inventory panel ---- */
  var invTab = 'inv';
  function renderInventory(p) {
    invTab = invTab || 'inv';
    var eqNames = { head: '🪖 Head', chest: '🥋 Chest', legs: '🦵 Legs', boots: '🥾 Boots', weapon: '🗡️ Weapon', offhand: '🛡️ Off-hand', accessory: '💍 Accessory' };
    var eqHtml = '';
    Object.keys(eqNames).forEach(function (slot) {
      var it = p.inv.equipment[slot];
      eqHtml += '<div class="eq-row"><span>' + eqNames[slot] + '</span>' + slotHtml('eq', slot, it ? { id: it.id, qty: 1, dur: it.dur } : null) + '</div>';
    });
    var tabs = '<div class="tabs"><button data-t="inv" class="' + (invTab === 'inv' ? 'sel' : '') + '">🎒 Bag</button>' +
      '<button data-t="storage" class="' + (invTab === 'storage' ? 'sel' : '') + '">📦 Storage</button></div>';
    var gridHtml = '<div class="slot-grid">';
    var arr = invTab === 'inv' ? p.inv.slots : p.inv.storage;
    for (var i = 0; i < arr.length; i++) gridHtml += slotHtml(invTab, i, arr[i]);
    gridHtml += '</div>';
    var btns = '<div class="row-btns"><button id="inv-sort" class="px-btn small">🔀 Sort</button>' +
      '<button id="inv-drop" class="px-btn small">🗑️ Drop selected</button>' +
      (invTab === 'inv' ? '<button id="inv-tostorage" class="px-btn small">📦→ Storage view</button>' : '') + '</div>';
    panelShell('🎒 Inventory', '<div class="inv-wrap"><div class="eq-col">' + eqHtml + '</div><div class="bag-col">' + tabs + gridHtml + btns + '</div></div><div class="inv-hint">Drag & drop to move • Double-click to use/equip • Right-click to split/drop • Tap twice on mobile</div>');
    paintSlotIcons(overlays);
    bindSlots(overlays);
    overlays.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { invTab = b.dataset.t; renderInventory(p); });
    });
    $('inv-sort').addEventListener('click', function () { PK.Systems.Inv.sort(p); });
    $('inv-drop').addEventListener('click', function () {
      if (!dragSel) { toast('Select an item first (tap it)'); return; }
      var s = PK.Systems.Inv.get(p, dragSel.where, dragSel.i);
      confirm('Drop ' + (s ? PK.Data.ITEMS[s.id].name : 'item') + '?', function (yes) {
        if (yes) PK.Systems.Inv.drop(p, dragSel.where, dragSel.i, true);
        dragSel = null; refreshPanels();
      });
    });
  }
  function renderStorage(p) { invTab = 'storage'; openPanel = 'inventory'; renderInventory(p); }

  /* ---- character panel ---- */
  function renderCharacter(p) {
    var rows = '';
    function row(k, v) { rows += '<div class="stat-row"><span>' + k + '</span><b>' + v + '</b></div>'; }
    row('Level', p.level + ' (' + p.xp + '/' + p.xpNext + ' XP)');
    row('Class', PK.Data.CLASSES[p.cls].name);
    row('Health', Math.ceil(p.hp) + '/' + p.maxhp);
    row('Mana', Math.ceil(p.mp) + '/' + p.maxmp);
    row('Stamina', Math.ceil(p.stamina) + '/' + p.maxstamina);
    row('Attack', p.atk.toFixed(1));
    row('Defense', p.def.toFixed(1));
    row('Crit chance', p.crit.toFixed(1) + '%');
    row('Move speed', p.spd.toFixed(2) + ' t/s');
    row('Gold', U.fmtNum(p.gold));
    row('Skill points', p.skillPoints);
    row('Monsters slain', Object.keys(p.kills).reduce(function (a, k) { return a + p.kills[k]; }, 0));
    row('Resources gathered', p.gathered);
    row('Items crafted', p.crafted);
    row('Chests opened', p.chestsOpened);
    row('Distance walked', U.fmtNum(p.steps) + ' tiles');
    row('Play time', U.fmtTime(p.playtime));
    panelShell('🧝 ' + U.esc(p.name), '<div class="stat-list">' + rows + '</div>');
  }

  /* ---- crafting panel ---- */
  function renderCrafting(p, station) {
    var stations = ['hand', 'workbench', 'furnace', 'anvil', 'campfire'];
    var names = { hand: '✋ Hand', workbench: '🔨 Workbench', furnace: '🔥 Furnace', anvil: '⚒️ Anvil', campfire: '🏕️ Campfire' };
    // station availability: hand always; others need proximity
    var nearKinds = {};
    PK.World.stations().forEach(function (s) {
      if (U.dist(p.x, p.y, s.tx * 16 + 8, s.ty * 16 + 8) < 3.5 * 16) nearKinds[s.kind] = true;
    });
    function stationOk(s) { return s === 'hand' || nearKinds[s]; }
    var tabs = '<div class="tabs">' + stations.map(function (s) {
      return '<button data-s="' + s + '" class="' + (station === s ? 'sel' : '') + '"' + (stationOk(s) ? '' : ' disabled title="Find this station in the world"') + '>' + names[s] + '</button>';
    }).join('') + '</div>';
    var canUse = stationOk(station);
    var recipes = PK.Data.RECIPES.filter(function (r) { return r.station === station; });
    // hand recipes always visible under hand tab only; others need station
    var list = recipes.length ? '' : '<p class="dim">No recipes for this station yet.</p>';
    recipes.forEach(function (r) {
      var chk = PK.Systems.Craft.canCraft(p, r);
      var out = PK.Data.ITEMS[r.output.id];
      var ing = Object.keys(r.inputs).map(function (id) {
        var need = r.inputs[id], have = PK.Systems.Inv.count(p, id);
        var d = PK.Data.ITEMS[id];
        return '<span class="' + (have >= need ? 'ok' : 'miss') + '">' + (d ? d.name : id) + ' ' + have + '/' + need + '</span>';
      }).join(' • ');
      list += '<div class="recipe' + (chk.ok ? '' : ' locked') + '">' +
        '<div class="recipe-head"><b>' + U.esc(r.name) + '</b><span class="dim">→ ' + (out ? out.name : r.output.id) + (r.output.qty > 1 ? ' x' + r.output.qty : '') + '</span></div>' +
        '<div class="recipe-ing">' + ing + '</div>' +
        '<button class="px-btn small craft-btn" data-r="' + r.id + '"' + (chk.ok && canUse ? '' : ' disabled') + '>Craft</button></div>';
    });
    var note = station === 'hand' ? '<p class="dim">Hand crafting works anywhere. Other stations must be used nearby (interact with them).</p>' : '';
    panelShell('⚒️ Crafting', tabs + note + '<div class="recipe-list">' + list + '</div>');
    overlays.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { panelData.station = b.dataset.s; renderCrafting(p, b.dataset.s); });
    });
    overlays.querySelectorAll('.craft-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = PK.Data.RECIPES.find(function (x) { return x.id === b.dataset.r; });
        if (r) PK.Systems.Craft.craft(p, r);
      });
    });
  }

  /* ---- skills panel ---- */
  function renderSkills(p) {
    var tree = PK.Data.SKILLS[p.cls] || [];
    var html = '<p>Skill points: <b>' + p.skillPoints + '</b> <button id="sk-reset" class="px-btn small">Reset (' + (50 * p.level) + 'g)</button></p>';
    html += '<div class="skill-list">';
    tree.forEach(function (n) {
      var pts = p.skills[n.id] || 0;
      var reqOk = !n.req || (p.skills[n.req] > 0);
      html += '<div class="skill' + (pts > 0 ? ' learned' : '') + (reqOk ? '' : ' locked') + '">' +
        '<div class="skill-head"><b>' + U.esc(n.name) + '</b><span>' + (n.kind === 'active' ? '⚡ Active' : '🛡️ Passive') + ' ' + pts + '/' + n.max + '</span></div>' +
        '<div class="skill-desc">' + U.esc(n.desc) + (n.req ? ' <span class="dim">(Requires ' + n.req + ')</span>' : '') + '</div>' +
        (pts < n.max && reqOk ? '<button class="px-btn small sk-add" data-s="' + n.id + '">+ Learn</button>' : '') +
        '</div>';
    });
    html += '</div><p class="dim">Active skills: Q / E / R or tap the ⚡ slots.</p>';
    panelShell('✨ Skills — ' + PK.Data.CLASSES[p.cls].name, html);
    overlays.querySelectorAll('.sk-add').forEach(function (b) {
      b.addEventListener('click', function () { PK.Systems.Skills.allocate(p, b.dataset.s); });
    });
    $('sk-reset').addEventListener('click', function () { PK.Systems.Skills.reset(p); });
  }

  /* ---- quests panel ---- */
  function renderQuests(p) {
    var qs = PK.Systems.Quests;
    var html = '<h3>Active quests</h3>';
    var act = Object.keys(qs.state.active);
    if (!act.length) html += '<p class="dim">No active quests. Talk to villagers!</p>';
    act.forEach(function (qid) {
      var q = qs.get(qid);
      html += '<div class="quest ' + q.type + '"><div class="quest-head"><b>' + U.esc(q.name) + '</b><span class="qtype">' + q.type + '</span></div>';
      html += '<div class="quest-desc">' + U.esc(q.desc) + '</div>';
      for (var i = 0; i < q.objectives.length; i++) {
        var done = qs.state.active[qid].prog[i] >= q.objectives[i].count;
        html += '<div class="obj-line' + (done ? ' done' : '') + '">' + (done ? '✅ ' : '⬜ ') + U.esc(qs.objectiveText(q, i)) + '</div>';
      }
      var rw = q.rewards || {};
      html += '<div class="quest-rw dim">Reward: ' + (rw.xp || 0) + ' XP' + (rw.gold ? ', ' + rw.gold + 'g' : '') + '</div></div>';
    });
    html += '<h3>Completed (' + qs.state.completed.length + ')</h3><div class="dim">' +
      qs.state.completed.map(function (qid) { var q = qs.get(qid); return q ? U.esc(q.name) : qid; }).join(', ') + '</div>';
    panelShell('📜 Quest Journal', html, true);
  }

  /* ---- map panel ---- */
  function renderMap(p) {
    panelShell('🗺️ World Map', '<canvas id="worldmap" width="480" height="480" class="pix"></canvas><div id="map-label" class="dim"></div><div class="row-btns"><button id="map-travel" class="px-btn">⚡ Fast Travel</button></div>', true);
    var cv = $('worldmap'), g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(PK.World.minimap(), 0, 0, 480, 480);
    var sc = 480 / 160;
    // region labels
    g.font = 'bold 13px monospace'; g.textAlign = 'center';
    PK.World.regions().forEach(function (r) {
      if (r.id === 'plains') return;
      g.strokeStyle = '#000'; g.lineWidth = 3;
      g.strokeText(r.name, r.cx * sc, r.cy * sc);
      g.fillStyle = '#ffe082'; g.fillText(r.name, r.cx * sc, r.cy * sc);
    });
    // waystones
    PK.World.waystones().forEach(function (w) {
      g.fillStyle = w.unlocked ? '#80deea' : '#616161';
      g.beginPath(); g.arc(w.tx * sc, w.ty * sc, 6, 0, 7); g.fill();
      g.fillStyle = '#000'; g.font = '10px monospace';
      g.fillText(w.unlocked ? '◆' : '◇', w.tx * sc, w.ty * sc + 3);
    });
    // player
    g.fillStyle = '#fff';
    g.fillRect(p.x / 16 * sc - 4, p.y / 16 * sc - 4, 8, 8);
    $('map-travel').addEventListener('click', function () { closePanel(); openPanel = 'fasttravel'; renderFastTravel(p); });
  }
  function renderFastTravel(p) {
    var ws = PK.World.waystones().filter(function (w) { return w.unlocked; });
    var html = ws.map(function (w) {
      return '<button class="px-btn ws-btn" data-w="' + w.id + '">◆ ' + U.esc(w.name) + '</button>';
    }).join('') || '<p class="dim">No waystones unlocked yet.</p>';
    panelShell('⚡ Fast Travel', html + '<p class="dim">Touch a waystone in the world to unlock it.</p>');
    overlays.querySelectorAll('.ws-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var w = PK.World.waystones().find(function (x) { return x.id === b.dataset.w; });
        if (w) {
          PK.FX.magic(p.x, p.y, '#80deea');
          p.x = w.tx * 16 + 8; p.y = w.ty * 16 + 8;
          p.spawnX = p.x; p.spawnY = p.y;
          PK.FX.magic(p.x, p.y, '#80deea');
          PK.Audio.sfx('teleport');
          closePanel();
          toast('Traveled to ' + w.name);
        }
      });
    });
  }

  /* ---- settings ---- */
  function renderSettings() {
    var s = PK.Game.settings;
    function sliderRow(id, label, val) {
      return '<div class="set-row"><span>' + label + '</span><input type="range" id="' + id + '" min="0" max="100" value="' + Math.round(val * 100) + '"><b id="' + id + '-v">' + Math.round(val * 100) + '</b></div>';
    }
    var html = sliderRow('set-master', 'Master volume', s.master) +
      sliderRow('set-music', 'Music volume', s.music) +
      sliderRow('set-sfx', 'Effects volume', s.sfx) +
      '<div class="set-row"><span>Mute</span><button id="set-mute" class="px-btn small">' + (s.muted ? '🔇 Muted' : '🔊 Sound on') + '</button></div>' +
      '<div class="set-row"><span>Screen shake</span><button id="set-shake" class="px-btn small">' + (s.screenshake ? 'On' : 'Off') + '</button></div>' +
      '<div class="set-row"><span>Reduced motion</span><button id="set-rm" class="px-btn small">' + (s.reducedMotion ? 'On' : 'Off') + '</button></div>' +
      '<h3>Key bindings</h3><div id="keybinds"></div>' +
      '<div class="row-btns"><button id="set-save" class="px-btn">💾 Save settings</button></div>';
    panelShell('⚙️ Settings', html);
    ['master', 'music', 'sfx'].forEach(function (k) {
      $('set-' + k).addEventListener('input', function (e) {
        $('set-' + k + '-v').textContent = e.target.value;
        s[k] = e.target.value / 100;
        applyAudioSettings();
      });
    });
    $('set-mute').addEventListener('click', function () { s.muted = PK.Audio.toggleMute(); $('set-mute').textContent = s.muted ? '🔇 Muted' : '🔊 Sound on'; });
    $('set-shake').addEventListener('click', function () { s.screenshake = !s.screenshake; $('set-shake').textContent = s.screenshake ? 'On' : 'Off'; });
    $('set-rm').addEventListener('click', function () { s.reducedMotion = !s.reducedMotion; $('set-rm').textContent = s.reducedMotion ? 'On' : 'Off'; });
    renderKeybinds();
    $('set-save').addEventListener('click', function () {
      PK.Save.saveSettings(Object.assign({}, s, { keys: PK.Keys }));
      PK.Audio.sfx('save');
      toast('Settings saved');
    });
  }
  function applyAudioSettings() {
    var s = PK.Game.settings;
    PK.Audio.setMaster(s.master); PK.Audio.setMusic(s.music); PK.Audio.setSfx(s.sfx);
    if (s.muted !== PK.Audio.muted) PK.Audio.toggleMute();
  }
  function renderKeybinds() {
    var kb = $('keybinds');
    if (!kb) return;
    var labels = { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', attack: 'Attack', interact: 'Interact', skill1: 'Skill 1', skill2: 'Skill 2', skill3: 'Skill 3', sprint: 'Sprint', inventory: 'Inventory', character: 'Character', map: 'Map', quests: 'Quests', skills: 'Skills', crafting: 'Crafting', pause: 'Pause' };
    kb.innerHTML = '';
    Object.keys(labels).forEach(function (k) {
      var row = el('<div class="set-row"><span>' + labels[k] + '</span><button class="px-btn small keycap">' + (PK.Keys[k] || '').replace('Key', '') + '</button></div>');
      row.querySelector('button').addEventListener('click', function (e) {
        var btn = e.target;
        btn.textContent = 'press...';
        var h = function (ev) {
          ev.preventDefault();
          PK.Keys[k] = ev.code;
          btn.textContent = ev.code.replace('Key', '');
          window.removeEventListener('keydown', h, true);
          PK.Game.bindKeys();
        };
        window.addEventListener('keydown', h, true);
      });
      kb.appendChild(row);
    });
  }

  /* ---- achievements ---- */
  function renderAchievements() {
    var html = '<div class="ach-list">';
    PK.Data.ACHIEVEMENTS.forEach(function (a) {
      var un = PK.Systems.Ach.is(a.id);
      html += '<div class="ach' + (un ? ' un' : '') + '"><span class="ach-i">' + (un ? '🏆' : '🔒') + '</span><div><b>' + U.esc(a.name) + '</b><p>' + U.esc(a.desc) + '</p></div></div>';
    });
    html += '</div>';
    panelShell('🏆 Achievements', html, true);
  }

  /* ---- help ---- */
  function renderHelp() {
    var html =
      '<h3>🎯 Goal</h3><p>The Pixel Kingdom has fallen. Gather the shattered <b>Crown Jewels</b> by defeating the three bosses, then return the crown to Elder Maren in Greenfield Village.</p>' +
      '<h3>🕹️ Controls (PC)</h3><p class="dim">Move: WASD / Arrows • Attack: Space / Click • Interact: F • Skills: Q E R • Sprint: Shift • 1-8: hotbar<br>' +
      'I: inventory • C: character • B: crafting • K: skills • J: quests • M: map • Esc: menu</p>' +
      '<h3>📱 Mobile</h3><p class="dim">Left joystick to move, buttons to attack/interact. Tap items twice to move them.</p>' +
      '<h3>⚒️ Crafting</h3><p>Chop trees and mine rocks/ores, then use stations: Workbench, Furnace (smelt ores), Anvil (advanced gear), Campfire (cook food). Interact (F) with a station to open its recipes.</p>' +
      '<h3>💡 Tips</h3><p class="dim">• Sleep in a bedroll to fully heal.<br>• Touch waystones (◆) to unlock fast travel.<br>• Repair gear at the blacksmith.<br>• Cook raw meat — it heals much more.<br>• Bosses telegraph attacks with red circles — move away!<br>• The game autosaves every minute.</p>';
    panelShell('❓ How to Play', html, true);
  }
  function renderCredits() {
    panelShell('🎭 Credits', '<p><b>PIXEL KINGDOM</b> v1.0</p><p class="dim">A 2D pixel-art RPG built with HTML5 Canvas + vanilla JavaScript.<br>All art is generated procedurally in code. All music & SFX synthesized with Web Audio.<br><br>Made for Sir by Muse ⚔️</p>');
  }

  /* ---- pause ---- */
  function renderPause() {
    panelShell('☰ Menu',
      '<div class="pause-btns">' +
      '<button id="pz-resume" class="px-btn big">▶ Resume</button>' +
      '<button id="pz-save" class="px-btn">💾 Save Game</button>' +
      '<button id="pz-saves" class="px-btn">📂 Save Slots</button>' +
      '<button id="pz-settings" class="px-btn">⚙️ Settings</button>' +
      '<button id="pz-help" class="px-btn">❓ Help</button>' +
      '<button id="pz-ach" class="px-btn">🏆 Achievements</button>' +
      '<button id="pz-title" class="px-btn danger">🚪 Quit to Title</button>' +
      '</div>');
    $('pz-resume').addEventListener('click', closePanel);
    $('pz-save').addEventListener('click', function () { PK.Game.quickSave(); });
    $('pz-saves').addEventListener('click', function () { openPanel = 'saves'; panelData = { mode: 'save' }; renderPanel(); });
    $('pz-settings').addEventListener('click', function () { openPanel = 'settings'; renderPanel(); });
    $('pz-help').addEventListener('click', function () { openPanel = 'help'; renderPanel(); });
    $('pz-ach').addEventListener('click', function () { openPanel = 'achievements'; renderPanel(); });
    $('pz-title').addEventListener('click', function () {
      confirm('Quit to title? Unsaved progress will be lost.', function (yes) {
        if (yes) { closePanel(); PK.Game.toTitle(); }
      });
    });
  }

  /* ---- save slots ---- */
  function renderSaveSlots(mode) {
    var list = PK.Save.list();
    var html = '<div class="slot-list">';
    list.forEach(function (s, idx) {
      var n = idx + 1;
      if (s) {
        html += '<div class="save-slot"><div><b>Slot ' + n + '</b> — ' + U.esc(s.name) + ' (Lv ' + s.level + ')<br><span class="dim">' + U.fmtTime(s.playtime) + ' • ' + new Date(s.date).toLocaleDateString() + '</span></div><div class="row-btns">' +
          (mode === 'load' ? '<button class="px-btn small sl-load" data-s="' + n + '">▶ Load</button>' : '<button class="px-btn small sl-over" data-s="' + n + '">💾 Overwrite</button>') +
          '<button class="px-btn small sl-exp" data-s="' + n + '">📤 Export</button>' +
          '<button class="px-btn small danger sl-del" data-s="' + n + '">🗑️</button></div></div>';
      } else {
        html += '<div class="save-slot empty"><div><b>Slot ' + n + '</b> — <span class="dim">Empty</span></div><div class="row-btns">' +
          (mode === 'load'
            ? '<button class="px-btn small" disabled>Empty</button>'
            : '<button class="px-btn small sl-save" data-s="' + n + '">💾 Save here</button>') +
          '<button class="px-btn small sl-imp" data-s="' + n + '">📥 Import</button></div></div>';
      }
    });
    html += '</div>';
    panelShell(mode === 'load' ? '📂 Load Game' : '💾 Save Game', html, true);
    overlays.querySelectorAll('.sl-load').forEach(function (b) {
      b.addEventListener('click', function () { closePanel(); PK.Game.loadSlot(+b.dataset.s); });
    });
    overlays.querySelectorAll('.sl-save, .sl-over').forEach(function (b) {
      b.addEventListener('click', function () {
        var doSave = function () { PK.Game.saveSlot(+b.dataset.s); closePanel(); };
        if (b.classList.contains('sl-over')) confirm('Overwrite slot ' + b.dataset.s + '?', function (yes) { if (yes) doSave(); });
        else doSave();
      });
    });
    overlays.querySelectorAll('.sl-del').forEach(function (b) {
      b.addEventListener('click', function () {
        confirm('Delete save in slot ' + b.dataset.s + '?', function (yes) {
          if (yes) { PK.Save.erase(+b.dataset.s); PK.Audio.sfx('ui'); renderSaveSlots(mode); }
        });
      });
    });
    overlays.querySelectorAll('.sl-exp').forEach(function (b) {
      b.addEventListener('click', function () {
        var json = PK.Save.exportSlot(+b.dataset.s);
        if (json) {
          var blob = new Blob([json], { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'pixel-kingdom-slot' + b.dataset.s + '.json';
          a.click();
          toast('Save exported');
        }
      });
    });
    overlays.querySelectorAll('.sl-imp').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = el('<input type="file" accept=".json" style="display:none">');
        document.body.appendChild(inp);
        inp.addEventListener('change', function () {
          var f = inp.files[0];
          if (!f) return;
          var r = new FileReader();
          r.onload = function () {
            var err = PK.Save.importSlot(+b.dataset.s, r.result);
            if (err) { toast('Import failed: ' + err); PK.Audio.sfx('error'); }
            else { toast('Save imported to slot ' + b.dataset.s); PK.Audio.sfx('save'); renderSaveSlots(mode); }
          };
          r.readAsText(f);
          inp.remove();
        });
        inp.click();
      });
    });
  }
  function openSaveSlots(mode) { openPanel = 'saves'; panelData = { mode: mode }; renderPanel(); }

  /* ---- dialog ---- */
  function openDialog(npcId) {
    var dlg = PK.Data.DIALOGS[npcId];
    if (!dlg) return;
    PK.Systems.Quests.event('talk', npcId);
    var lines = dlg.lines.slice();
    dialogState = { npcId: npcId, dlg: dlg, idx: 0 };
    showDialogLine();
    PK.Audio.sfx('dialog');
  }
  function showDialogLine() {
    var st = dialogState, dlg = st.dlg;
    var line = st.idx < dlg.lines.length ? dlg.lines[st.idx] : null;
    var btns = '';
    if (line !== null) {
      btns = '<button id="dlg-next" class="px-btn">▶ Next</button>';
    } else {
      // action buttons
      var quests = PK.Systems.Quests.availableFrom(st.npcId);
      quests.forEach(function (q) {
        btns += '<button class="px-btn q-acc" data-q="' + q.id + '">📜 Accept: ' + U.esc(q.name) + '</button>';
      });
      if (dlg.shop) btns += '<button id="dlg-shop" class="px-btn">🛒 Shop</button>';
      if (st.npcId === 'blacksmith_borin') btns += '<button id="dlg-repair" class="px-btn">🔧 Repair gear</button>';
      btns += '<button id="dlg-bye" class="px-btn">👋 Bye</button>';
    }
    overlays.innerHTML =
      '<div class="overlay"><div class="panel dialog">' +
      '<div class="dlg-name">' + U.esc(dlg.name) + ' <span class="dim">' + U.esc(dlg.role || '') + '</span></div>' +
      '<div class="dlg-text">' + (line !== null ? U.esc(line) : U.esc(dlg.hint || 'Anything else?')) + '</div>' +
      '<div class="dlg-btns">' + btns + '</div>' +
      '</div></div>';
    var nx = $('dlg-next');
    if (nx) nx.addEventListener('click', function () { st.idx++; PK.Audio.sfx('dialog'); showDialogLine(); });
    overlays.querySelectorAll('.q-acc').forEach(function (b) {
      b.addEventListener('click', function () {
        PK.Systems.Quests.accept(b.dataset.q);
        overlays.innerHTML = '';
        dialogState = null;
      });
    });
    var sh = $('dlg-shop');
    if (sh) sh.addEventListener('click', function () { openPanel = 'shop'; panelData = { shop: dlg.shop }; renderPanel(); });
    var rp = $('dlg-repair');
    if (rp) rp.addEventListener('click', function () { PK.Systems.Inv.repairAll(PK.Entities.player); });
    var bye = $('dlg-bye');
    if (bye) bye.addEventListener('click', function () { overlays.innerHTML = ''; dialogState = null; PK.Audio.sfx('close'); });
  }

  /* ---- shop ---- */
  function renderShop(p, shopId) {
    var def = PK.Systems.Shop.defs[shopId] || { name: 'Shop' };
    var stock = PK.Systems.Shop.stock(shopId);
    var buyHtml = stock.map(function (id) {
      var d = PK.Data.ITEMS[id], price = PK.Systems.Shop.buyPrice(id);
      return '<div class="shop-row"><canvas class="slot-icon" data-icon="' + id + '" width="28" height="28"></canvas>' +
        '<div class="shop-info"><b class="r' + d.rarity + '">' + U.esc(d.name) + '</b><span class="dim">' + U.esc(d.desc.slice(0, 60)) + '</span></div>' +
        '<button class="px-btn small shop-buy" data-id="' + id + '">' + price + 'g</button></div>';
    }).join('');
    var sellHtml = '<div class="slot-grid sell-grid">';
    for (var i = 0; i < p.inv.slots.length; i++) {
      var s = p.inv.slots[i];
      sellHtml += '<div class="slot sell-slot" data-i="' + i + '">' + (s ? '<canvas class="slot-icon" data-icon="' + s.id + '" width="32" height="32"></canvas>' + (s.qty > 1 ? '<span class="qty">' + s.qty + '</span>' : '') : '') + '</div>';
    }
    sellHtml += '</div><p class="dim">Click an item to sell it (' + '50% value). Quest items can\'t be sold.</p>';
    panelShell('🛒 ' + U.esc(def.name) + ' <span class="dim">🪙 ' + U.fmtNum(p.gold) + '</span>',
      '<div class="tabs"><button data-t="buy" class="sel">Buy</button><button data-t="sell">Sell</button></div>' +
      '<div id="shop-buy">' + buyHtml + '</div><div id="shop-sell" style="display:none">' + sellHtml + '</div>', true);
    paintSlotIcons(overlays);
    overlays.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        overlays.querySelectorAll('.tabs button').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        $('shop-buy').style.display = b.dataset.t === 'buy' ? 'block' : 'none';
        $('shop-sell').style.display = b.dataset.t === 'sell' ? 'block' : 'none';
      });
    });
    overlays.querySelectorAll('.shop-buy').forEach(function (b) {
      b.addEventListener('click', function () { PK.Systems.Shop.buy(p, shopId, b.dataset.id); });
    });
    overlays.querySelectorAll('.sell-slot').forEach(function (sdiv) {
      sdiv.addEventListener('click', function () {
        PK.Systems.Shop.sell(p, 'inv', +sdiv.dataset.i);
      });
    });
  }

  /* ---- misc overlays ---- */
  function toast(msg, kind) {
    var t = el('<div class="toast' + (kind ? ' ' + kind : '') + '">' + U.esc(msg) + '</div>');
    toastRoot.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 3200);
    while (toastRoot.children.length > 5) toastRoot.firstChild.remove();
  }
  function confirm(msg, cb) {
    var ov = el('<div class="overlay"><div class="panel confirm"><p>' + U.esc(msg) + '</p><div class="row-btns"><button id="cf-y" class="px-btn">Yes</button><button id="cf-n" class="px-btn">No</button></div></div></div>');
    document.body.appendChild(ov);
    ov.querySelector('#cf-y').addEventListener('click', function () { ov.remove(); cb(true); });
    ov.querySelector('#cf-n').addEventListener('click', function () { ov.remove(); cb(false); });
  }
  function showSign(text) {
    var ov = el('<div class="overlay"><div class="panel sign"><p>🪧 ' + U.esc(text) + '</p><div class="row-btns"><button class="px-btn" id="sign-ok">OK</button></div></div></div>');
    document.body.appendChild(ov);
    ov.querySelector('#sign-ok').addEventListener('click', function () { ov.remove(); PK.Audio.sfx('close'); });
    PK.Audio.sfx('dialog');
  }
  function showQuestComplete(q) {
    var ov = el('<div class="quest-splash"><div>✅ QUEST COMPLETE</div><h2>' + U.esc(q.name) + '</h2></div>');
    document.body.appendChild(ov);
    setTimeout(function () { ov.classList.add('show'); }, 10);
    setTimeout(function () { ov.classList.remove('show'); setTimeout(function () { ov.remove(); }, 600); }, 2600);
  }
  function onPlayerDeath(lostGold) {
    var ov = el('<div class="overlay"><div class="panel death"><h2>💀 You Died</h2><p class="dim">You lost ' + lostGold + ' gold.</p><p>Respawning in <b id="death-n">3</b>...</p></div></div>');
    document.body.appendChild(ov);
    var n = 3;
    var iv = setInterval(function () {
      n--;
      var e = $('death-n');
      if (e) e.textContent = n;
      if (n <= 0) { clearInterval(iv); ov.remove(); }
    }, 1000);
  }
  function showBossBar() { /* handled in refreshHUD */ }
  function hideBossBar() { bossBar.classList.add('hidden'); }

  /* ---- keyboard shortcuts ---- */
  function bindGlobalKeys() {
    window.addEventListener('keydown', function (e) {
      if (PK.Game.state !== 'play') return;
      var k = e.code;
      if (k === PK.Keys.pause) { togglePanel('pause'); e.preventDefault(); }
      else if (k === PK.Keys.inventory) togglePanel('inventory');
      else if (k === PK.Keys.character) togglePanel('character');
      else if (k === PK.Keys.crafting) togglePanel('crafting', { station: 'hand' });
      else if (k === PK.Keys.skills) togglePanel('skills');
      else if (k === PK.Keys.quests) togglePanel('quests');
      else if (k === PK.Keys.map) togglePanel('map');
    });
  }

  return {
    init: init,
    showScreen: showScreen, showGame: showGame, showCreate: showCreate,
    togglePanel: togglePanel, closePanel: closePanel, refreshPanels: refreshPanels,
    refreshHUD: refreshHUD, refreshHUDLite: refreshHUDLite,
    refreshHotbar: refreshHotbar,
    setPrompt: setPrompt,
    toast: toast, confirm: confirm, showSign: showSign,
    showQuestComplete: showQuestComplete,
    openDialog: openDialog, openCrafting: function (s) { togglePanel('crafting', { station: s }); },
    openShop: function (s) { togglePanel('shop', { shop: s }); },
    openFastTravel: function () { togglePanel('fasttravel'); },
    openSaveSlots: openSaveSlots,
    showBossBar: showBossBar, hideBossBar: hideBossBar,
    onPlayerDeath: onPlayerDeath,
    get openPanel() { return openPanel; }
  };
})();
