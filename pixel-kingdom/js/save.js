/* ============================================================
   PIXEL KINGDOM — save.js
   localStorage persistence: 3 slots, autosave, export/import,
   versioning + validation.
   Depends: PK (utils.js).
   ============================================================ */
var PK = PK || {};

PK.Save = (function () {
  'use strict';
  var KEY = PK.Config.SAVE_KEY, VER = PK.Config.SAVE_VERSION;

  function readAll() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return {};
      var d = JSON.parse(raw);
      return (d && typeof d === 'object') ? d : {};
    } catch (e) { return {}; }
  }
  function writeAll(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); return true; }
    catch (e) { return false; }
  }

  function slotKey(n) { return 'slot' + n; }

  function list() {
    var all = readAll(), out = [];
    for (var i = 1; i <= 3; i++) {
      var s = all[slotKey(i)];
      if (s && s.version === VER && s.player) {
        out.push({ slot: i, name: s.player.name, cls: s.player.cls, level: s.player.level,
          playtime: s.playtime || 0, date: s.savedAt || 0 });
      } else out.push(null);
    }
    return out;
  }

  function validate(d) {
    if (!d || typeof d !== 'object') return 'Not a save object';
    if (d.version !== VER) return 'Incompatible save version (' + d.version + ' vs ' + VER + ')';
    if (!d.player || typeof d.player.name !== 'string') return 'Missing player data';
    if (!d.world || typeof d.world.seed !== 'number') return 'Missing world data';
    if (!d.inv || !Array.isArray(d.inv.slots)) return 'Missing inventory data';
    return null;
  }

  function save(slot, data) {
    data.version = VER;
    data.savedAt = Date.now();
    var all = readAll();
    all[slotKey(slot)] = data;
    return writeAll(all);
  }
  function load(slot) {
    var all = readAll(), d = all[slotKey(slot)];
    if (!d) return null;
    var err = validate(d);
    if (err) return { error: err };
    return d;
  }
  function erase(slot) {
    var all = readAll();
    delete all[slotKey(slot)];
    return writeAll(all);
  }
  function exportSlot(slot) {
    var all = readAll(), d = all[slotKey(slot)];
    return d ? JSON.stringify(d) : null;
  }
  function importSlot(slot, json) {
    var d;
    try { d = JSON.parse(json); } catch (e) { return 'Invalid JSON: ' + e.message; }
    var err = validate(d);
    if (err) return err;
    var all = readAll();
    all[slotKey(slot)] = d;
    return writeAll(all) ? null : 'Could not write to localStorage';
  }

  /* ---- settings (separate key) ---- */
  var SKEY = PK.Config.SETTINGS_KEY;
  function loadSettings() {
    try {
      var d = JSON.parse(localStorage.getItem(SKEY) || '{}');
      return Object.assign({ master: 0.8, music: 0.7, sfx: 0.9, muted: false,
        quality: 'high', screenshake: true, reducedMotion: false, showDamage: true,
        keys: null }, d || {});
    } catch (e) { return {}; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {}
  }

  return {
    list: list, save: save, load: load, erase: erase,
    exportSlot: exportSlot, importSlot: importSlot, validate: validate,
    loadSettings: loadSettings, saveSettings: saveSettings
  };
})();
