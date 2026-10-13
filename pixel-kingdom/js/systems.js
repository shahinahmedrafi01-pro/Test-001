/* ============================================================
   PIXEL KINGDOM — systems.js
   Inventory, crafting, quests, shops, skills, achievements.
   Depends: PK (utils), PK.Data, PK.World, PK.FX, PK.Audio, PK.UI, PK.Entities.
   ============================================================ */
var PK = PK || {};
PK.Systems = {};

(function () {
  'use strict';
  var U = PK.Utils;
  var D = function () { return PK.Data; };

  /* ==================== INVENTORY ==================== */
  var Inv = {
    create: function () {
      return { slots: new Array(PK.Config.INV_SIZE).fill(null), equipment: { head: null, chest: null, legs: null, boots: null, weapon: null, offhand: null, accessory: null }, hotbar: new Array(PK.Config.HOTBAR_SIZE).fill(null), storage: new Array(28).fill(null) };
    },
    itemDef: function (id) { return D().ITEMS[id] || null; },
    equipment: function (p) { return p.inv.equipment; },

    findStack: function (p, id) {
      var def = this.itemDef(id);
      if (!def) return -1;
      for (var i = 0; i < p.inv.slots.length; i++) {
        var s = p.inv.slots[i];
        if (s && s.id === id && s.qty < def.stack) return i;
      }
      return -1;
    },
    emptySlot: function (p) {
      for (var i = 0; i < p.inv.slots.length; i++) if (!p.inv.slots[i]) return i;
      return -1;
    },
    add: function (p, id, qty) {
      var def = this.itemDef(id);
      if (!def || qty <= 0) return qty;
      qty = Math.floor(qty);
      var guard = 0;
      while (qty > 0 && guard++ < 200) {
        var si = this.findStack(p, id);
        if (si >= 0) {
          var s = p.inv.slots[si], room = def.stack - s.qty, take = Math.min(room, qty);
          s.qty += take; qty -= take;
        } else {
          var ei = this.emptySlot(p);
          if (ei < 0) break;
          var put = Math.min(def.stack, qty);
          p.inv.slots[ei] = { id: id, qty: put };
          var inst = p.inv.slots[ei];
          if (def.dur) inst.dur = def.dur;
          qty -= put;
        }
      }
      return qty; // leftover (0 = all fit)
    },
    remove: function (p, id, qty) {
      if (this.count(p, id) < qty) return false;
      var need = qty;
      for (var i = 0; i < p.inv.slots.length && need > 0; i++) {
        var s = p.inv.slots[i];
        if (s && s.id === id) {
          var take = Math.min(s.qty, need);
          s.qty -= take; need -= take;
          if (s.qty <= 0) p.inv.slots[i] = null;
        }
      }
      return true;
    },
    count: function (p, id) {
      var n = 0;
      for (var i = 0; i < p.inv.slots.length; i++) {
        var s = p.inv.slots[i];
        if (s && s.id === id) n += s.qty;
      }
      return n;
    },
    // container: 'inv'|'storage'; slot index
    get: function (p, where, i) {
      if (where === 'inv') return p.inv.slots[i];
      if (where === 'storage') return p.inv.storage[i];
      if (where === 'hot') return p.inv.hotbar[i] ? { id: p.inv.hotbar[i], qty: 1 } : null;
      if (where === 'eq') { var e = p.inv.equipment[i]; return e ? { id: e.id, qty: 1, dur: e.dur } : null; }
      return null;
    },
    clear: function (p, where, i) {
      if (where === 'inv') p.inv.slots[i] = null;
      else if (where === 'storage') p.inv.storage[i] = null;
      else if (where === 'hot') p.inv.hotbar[i] = null;
      else if (where === 'eq') p.inv.equipment[i] = null;
    },
    // move/swap between containers
    move: function (p, fw, fi, tw, ti) {
      if (fw === tw && fi === ti) return;
      var a = this.get(p, fw, fi);
      if (!a) return;
      // normalize to real refs
      var aRef = this._ref(p, fw, fi), bRef = this._ref(p, tw, ti);
      // equipment rules
      if (tw === 'eq') {
        var def = this.itemDef(a.id || a);
        var aid = (typeof a === 'object' && a.id) ? a.id : a;
        var dd = this.itemDef(aid);
        if (!dd || !dd.slot || dd.slot !== ti) { PK.UI.toast('That doesn\'t go there'); PK.Audio.sfx('error'); return; }
        // move into equipment
        this._setRef(p, tw, ti, { id: aid, dur: a.dur !== undefined ? a.dur : (dd.dur || undefined) });
        if (fw === 'inv' || fw === 'storage') this._setRef(p, fw, fi, bRef && bRef.id ? { id: bRef.id, qty: bRef.qty || 1, dur: bRef.dur } : null);
        else if (fw === 'eq') this._setRef(p, fw, fi, bRef && bRef.id ? { id: bRef.id, dur: bRef.dur } : null);
        else this._setRef(p, fw, fi, null);
        PK.Entities.recompute(p);
        PK.Audio.sfx('open');
        PK.UI.refreshPanels(); PK.UI.refreshHUD();
        return;
      }
      if (fw === 'eq') {
        // unequip to inv/storage
        var eid = a.id;
        if (tw === 'inv' || tw === 'storage') {
          var arr = tw === 'inv' ? p.inv.slots : p.inv.storage;
          if (arr[ti]) { // swap: put b into eq if valid
            var bd = this.itemDef(arr[ti].id);
            if (bd && bd.slot && bd.slot === fi) {
              arr[ti] = { id: eid, qty: 1, dur: a.dur };
              this._setRef(p, 'eq', fi, { id: arr[ti].id, dur: arr[ti].dur });
            } else { PK.UI.toast('No room'); return; }
          } else {
            arr[ti] = { id: eid, qty: 1 };
            if (a.dur !== undefined) arr[ti].dur = a.dur;
            var dd2 = this.itemDef(eid);
            if (dd2 && dd2.dur && arr[ti].dur === undefined) arr[ti].dur = dd2.dur;
            this._setRef(p, 'eq', fi, null);
          }
        } else if (tw === 'hot') { p.inv.hotbar[ti] = eid; this._setRef(p, 'eq', fi, null); }
        PK.Entities.recompute(p);
        PK.Audio.sfx('open');
        PK.UI.refreshPanels(); PK.UI.refreshHUD();
        return;
      }
      if (tw === 'hot') {
        var hid = (a && a.id) ? a.id : a;
        p.inv.hotbar[ti] = hid;
        if (fw === 'hot') p.inv.hotbar[fi] = bRef || null;
        PK.Audio.sfx('ui');
        PK.UI.refreshPanels();
        return;
      }
      // inv <-> inv, inv <-> storage, storage <-> storage
      var arrA = fw === 'inv' ? p.inv.slots : p.inv.storage;
      var arrB = tw === 'inv' ? p.inv.slots : p.inv.storage;
      // try merge stacks
      if (bRef && aRef && bRef.id === aRef.id) {
        var def = this.itemDef(aRef.id);
        var room = def.stack - bRef.qty;
        if (room > 0) {
          var take = Math.min(room, aRef.qty);
          bRef.qty += take; aRef.qty -= take;
          if (aRef.qty <= 0) this._setRef(p, fw, fi, null);
          PK.Audio.sfx('ui');
          PK.UI.refreshPanels();
          return;
        }
      }
      this._setRef(p, fw, fi, bRef);
      this._setRef(p, tw, ti, aRef);
      PK.Audio.sfx('ui');
      PK.UI.refreshPanels();
    },
    _ref: function (p, w, i) {
      if (w === 'inv') return p.inv.slots[i];
      if (w === 'storage') return p.inv.storage[i];
      if (w === 'eq') return p.inv.equipment[i];
      if (w === 'hot') return p.inv.hotbar[i];
      return null;
    },
    _setRef: function (p, w, i, v) {
      if (w === 'inv') p.inv.slots[i] = v;
      else if (w === 'storage') p.inv.storage[i] = v;
      else if (w === 'eq') p.inv.equipment[i] = v;
      else if (w === 'hot') p.inv.hotbar[i] = v;
    },
    split: function (p, where, i) {
      var s = this._ref(p, where, i);
      if (!s || s.qty < 2) return;
      var half = Math.floor(s.qty / 2);
      var ei = where === 'storage' ? this._emptyIn(p.inv.storage) : this.emptySlot(p);
      if (ei < 0) { PK.UI.toast('No empty slot'); return; }
      s.qty -= half;
      var arr = where === 'storage' ? p.inv.storage : p.inv.slots;
      arr[ei] = { id: s.id, qty: half };
      if (s.dur !== undefined) arr[ei].dur = s.dur;
      PK.Audio.sfx('ui');
      PK.UI.refreshPanels();
    },
    _emptyIn: function (arr) { for (var i = 0; i < arr.length; i++) if (!arr[i]) return i; return -1; },
    sort: function (p) {
      var items = p.inv.slots.filter(Boolean);
      var order = { weapon: 0, armor: 1, tool: 2, consumable: 3, ammo: 4, material: 5, quest: 6, treasure: 7 };
      items.sort(function (a, b) {
        var da = D().ITEMS[a.id], db = D().ITEMS[b.id];
        var oa = da ? (order[da.type] || 9) : 9, ob = db ? (order[db.type] || 9) : 9;
        if (oa !== ob) return oa - ob;
        var ra = da ? da.rarity : 0, rb = db ? db.rarity : 0;
        if (ra !== rb) return rb - ra;
        return (da ? da.name : a.id).localeCompare(db ? db.name : b.id);
      });
      // merge stacks
      var merged = [];
      items.forEach(function (s) {
        var last = merged[merged.length - 1], def = D().ITEMS[s.id];
        if (last && last.id === s.id && def && last.qty + s.qty <= def.stack) last.qty += s.qty;
        else merged.push(s);
      });
      p.inv.slots = new Array(PK.Config.INV_SIZE).fill(null);
      merged.forEach(function (s, i) { p.inv.slots[i] = s; });
      PK.Audio.sfx('ui');
      PK.UI.refreshPanels();
    },
    useItem: function (p, where, i) {
      var s = this._ref(p, where, i);
      if (!s) return;
      var def = this.itemDef(s.id);
      if (!def) return;
      if (def.type === 'consumable') {
        if (def.heal) {
          PK.Entities.healPlayer(def.heal.hp || 0, def.heal.mp || 0);
        }
        if (def.effect) {
          if (def.effect.cure) p.status = { poison: 0, burn: 0, freeze: 0, slow: 0 };
          if (def.effect.atk) p.buffs.push({ stat: 'atk', amt: def.effect.atk, until: PK.Entities.time + (def.effect.duration || 60) });
          if (def.effect.def) p.buffs.push({ stat: 'def', amt: def.effect.def, until: PK.Entities.time + (def.effect.duration || 60) });
          if (def.effect.stamina) p.stamina = Math.min(p.maxstamina, p.stamina + def.effect.stamina);
          if (def.effect.spd) p.buffs.push({ stat: 'spd', amt: def.effect.spd, until: PK.Entities.time + (def.effect.duration || 60) });
          PK.Entities.recompute(p);
        }
        PK.Audio.sfx(def.heal && def.heal.mp ? 'drink' : 'eat');
        s.qty--;
        if (s.qty <= 0) this._setRef(p, where, i, null);
        PK.UI.refreshPanels(); PK.UI.refreshHUD();
      } else if (def.type === 'weapon' || def.type === 'armor' || def.type === 'tool') {
        // quick-equip to its slot
        if (def.slot) {
          var eq = p.inv.equipment;
          var cur = eq[def.slot];
          eq[def.slot] = { id: s.id, dur: s.dur !== undefined ? s.dur : def.dur };
          s.qty--;
          if (s.qty <= 0) this._setRef(p, where, i, null);
          if (cur) { var left = this.add(p, cur.id, 1); if (left > 0) PK.Entities.dropItem(cur.id, 1, p.x, p.y); }
          PK.Entities.recompute(p);
          PK.Audio.sfx('open');
          PK.UI.refreshPanels(); PK.UI.refreshHUD();
        }
      } else {
        PK.UI.toast('Can\'t use that directly');
      }
    },
    drop: function (p, where, i, all) {
      var s = this._ref(p, where, i);
      if (!s) return;
      var n = all ? s.qty : 1;
      PK.Entities.dropItem(s.id, n, p.x + U.rand(Math.random, -8, 8), p.y + U.rand(Math.random, -8, 8));
      s.qty -= n;
      if (s.qty <= 0) this._setRef(p, where, i, null);
      PK.Audio.sfx('ui');
      PK.UI.refreshPanels();
    },
    hotbarUse: function (p, hb) {
      var id = p.inv.hotbar[hb];
      if (!id) return;
      for (var i = 0; i < p.inv.slots.length; i++) {
        var s = p.inv.slots[i];
        if (s && s.id === id) { this.useItem(p, 'inv', i); return; }
      }
      PK.UI.toast('Item not in inventory');
    },
    repairAll: function (p) {
      var cost = 0, eq = p.inv.equipment;
      for (var s in eq) {
        var it = eq[s];
        if (!it) continue;
        var def = this.itemDef(it.id);
        if (def && def.dur) {
          var cur = it.dur === undefined ? def.dur : it.dur;
          cost += Math.ceil((def.dur - cur) * def.price / def.dur * 0.4);
        }
      }
      if (cost === 0) { PK.UI.toast('Nothing to repair'); return 0; }
      if (p.gold < cost) { PK.UI.toast('Not enough gold (' + cost + 'g needed)'); PK.Audio.sfx('error'); return -1; }
      p.gold -= cost;
      for (var s2 in eq) {
        var it2 = eq[s2];
        if (!it2) continue;
        var def2 = this.itemDef(it2.id);
        if (def2 && def2.dur) it2.dur = def2.dur;
      }
      PK.Audio.sfx('craft');
      PK.UI.toast('Equipment repaired for ' + cost + 'g');
      PK.UI.refreshPanels(); PK.UI.refreshHUD();
      return cost;
    }
  };

  /* ==================== CRAFTING ==================== */
  var Craft = {
    list: function (station) {
      return D().RECIPES.filter(function (r) { return r.station === station || r.station === 'hand'; });
    },
    canCraft: function (p, recipe) {
      var missing = [];
      for (var id in recipe.inputs) {
        var need = recipe.inputs[id], have = Inv.count(p, id);
        if (have < need) {
          var def = Inv.itemDef(id);
          missing.push({ id: id, name: def ? def.name : id, need: need, have: have });
        }
      }
      return { ok: missing.length === 0, missing: missing };
    },
    craft: function (p, recipe) {
      var chk = this.canCraft(p, recipe);
      if (!chk.ok) { PK.Audio.sfx('error'); return false; }
      for (var id in recipe.inputs) Inv.remove(p, id, recipe.inputs[id]);
      var left = Inv.add(p, recipe.output.id, recipe.output.qty);
      if (left > 0) PK.Entities.dropItem(recipe.output.id, left, p.x, p.y);
      p.crafted++;
      p.craftedItems = p.craftedItems || {};
      p.craftedItems[recipe.output.id] = (p.craftedItems[recipe.output.id] || 0) + recipe.output.qty;
      PK.Entities.addXP(10 + (recipe.level || 0) * 8);
      PK.Audio.sfx(recipe.station === 'furnace' ? 'smelt' : 'craft');
      var def = Inv.itemDef(recipe.output.id);
      PK.UI.toast('Crafted: ' + (def ? def.name : recipe.output.id) + (recipe.output.qty > 1 ? ' x' + recipe.output.qty : ''));
      PK.Systems.Quests.event('craft', recipe.output.id);
      PK.Systems.Ach.checkCraft(p.crafted);
      PK.UI.refreshPanels(); PK.UI.refreshHUD();
      return true;
    }
  };

  /* ==================== QUESTS ==================== */
  var Quests = {
    state: null,
    reset: function () { this.state = { active: {}, completed: [] }; },
    get: function (qid) {
      var qs = D().QUESTS;
      for (var i = 0; i < qs.length; i++) if (qs[i].id === qid) return qs[i];
      return null;
    },
    accept: function (qid, silent) {
      var q = this.get(qid);
      if (!q || this.state.active[qid] || this.state.completed.indexOf(qid) >= 0) return false;
      var prog = q.objectives.map(function () { return 0; });
      this.state.active[qid] = { prog: prog };
      if (!silent) {
        PK.UI.toast('📜 New quest: ' + q.name);
        PK.Audio.sfx('quest');
      }
      PK.UI.refreshPanels();
      return true;
    },
    isComplete: function (qid) {
      var q = this.get(qid), st = this.state.active[qid];
      if (!q || !st) return false;
      for (var i = 0; i < q.objectives.length; i++) {
        if (st.prog[i] < q.objectives[i].count) return false;
      }
      return true;
    },
    event: function (kind, target, n) {
      n = n || 1;
      var changed = false;
      for (var qid in this.state.active) {
        var q = this.get(qid), st = this.state.active[qid];
        if (!q) continue;
        for (var i = 0; i < q.objectives.length; i++) {
          var o = q.objectives[i];
          if (o.kind === kind && o.target === target && st.prog[i] < o.count) {
            st.prog[i] = Math.min(o.count, st.prog[i] + n);
            changed = true;
          }
        }
        if (this.isComplete(qid)) this.complete(qid);
      }
      if (changed) PK.UI.refreshPanels();
    },
    update: function (p) {
      // reach + deliver checks each tick (cheap: only active quests)
      var changed = false;
      for (var qid in this.state.active) {
        var q = this.get(qid), st = this.state.active[qid];
        if (!q) continue;
        for (var i = 0; i < q.objectives.length; i++) {
          var o = q.objectives[i];
          if (st.prog[i] >= o.count) continue;
          if (o.kind === 'reach') {
            if (U.dist(p.x, p.y, o.x * PK.Config.TILE, o.y * PK.Config.TILE) < (o.r || 3) * PK.Config.TILE) {
              st.prog[i] = o.count; changed = true;
            }
          } else if (o.kind === 'deliver') {
            if (Inv.count(p, o.target) >= o.count) {
              Inv.remove(p, o.target, o.count);
              st.prog[i] = o.count; changed = true;
              PK.UI.toast('Delivered quest items');
            }
          }
        }
        if (this.isComplete(qid)) this.complete(qid);
      }
      if (changed) PK.UI.refreshPanels();
    },
    complete: function (qid) {
      var q = this.get(qid);
      if (!q || !this.state.active[qid]) return;
      delete this.state.active[qid];
      this.state.completed.push(qid);
      var p = PK.Entities.player;
      var rw = q.rewards || {};
      if (rw.xp) PK.Entities.addXP(rw.xp);
      if (rw.gold) { p.gold += rw.gold; PK.UI.toast('+' + rw.gold + ' gold'); }
      (rw.items || []).forEach(function (id) {
        var left = Inv.add(p, id, 1);
        if (left > 0) PK.Entities.dropItem(id, 1, p.x, p.y);
        var def = Inv.itemDef(id);
        PK.UI.toast('Reward: ' + (def ? def.name : id));
      });
      PK.Audio.sfx('quest_done');
      PK.UI.showQuestComplete(q);
      PK.Systems.Ach.checkQuests(this.state.completed.length);
      if (q.next) {
        var nq = this.get(q.next);
        if (nq) { this.accept(q.next, true); PK.UI.toast('📜 New quest: ' + nq.name); PK.Audio.sfx('quest'); }
      } else if (q.type === 'main') {
        // main chain ended without explicit next — check nothing
      }
      PK.UI.refreshPanels(); PK.UI.refreshHUD();
    },
    availableFrom: function (npcId) {
      // side quests whose giver is npcId and not started/completed, plus their prereqs met
      return D().QUESTS.filter(function (q) {
        if (q.giver !== npcId) return false;
        if (PK.Systems.Quests.state.completed.indexOf(q.id) >= 0) return false;
        if (PK.Systems.Quests.state.active[q.id]) return false;
        return true;
      });
    },
    turnInReady: function (npcId) {
      // active quests complete & giver is npcId (for dialog display)
      var out = [];
      for (var qid in this.state.active) {
        var q = this.get(qid);
        if (q && q.giver === npcId && this.isComplete(qid)) out.push(q);
      }
      return out;
    },
    objectiveText: function (q, i) {
      var o = q.objectives[i], st = this.state.active[q.id];
      var prog = st ? st.prog[i] : 0;
      var target = o.target;
      if (o.kind === 'kill') { var e = D().ENEMIES[target]; target = e ? e.name : target; }
      else if (o.kind === 'talk') { var n = D().DIALOGS[target]; target = n ? n.name : target; }
      else { var it = Inv.itemDef(target); target = it ? it.name : target; }
      var verbs = { kill: 'Defeat', gather: 'Gather', talk: 'Talk to', reach: 'Reach', deliver: 'Deliver', craft: 'Craft' };
      var extra = o.kind === 'reach' ? ' (' + (PK.World.regionDef(o.region || '') || {}).name + ')' : '';
      return (verbs[o.kind] || o.kind) + ' ' + target + ' ' + Math.min(prog, o.count) + '/' + o.count + extra;
    },
    serialize: function () { return this.state; },
    deserialize: function (d) { this.state = d || { active: {}, completed: [] }; }
  };

  /* ==================== SHOPS ==================== */
  var Shop = {
    _buyLock: 0,
    defs: {
      general: { name: "Lila's General Goods", filter: function (d) { return (d.type === 'consumable' || d.type === 'material' || d.type === 'tool' || d.type === 'ammo') && d.price <= 120 && d.rarity <= 1; } },
      forge: { name: "Borin's Forge", filter: function (d) { return (d.type === 'weapon' || d.type === 'armor') && d.rarity <= 2 && d.price <= 800; } },
      herbalist: { name: "Yara's Herbs & Potions", filter: function (d) { return d.type === 'consumable' && (d.id.indexOf('pot_') === 0 || d.id.indexOf('food_') === 0); } }
    },
    stock: function (shopId) {
      var def = this.defs[shopId];
      if (!def) return [];
      return Object.keys(D().ITEMS).filter(function (id) { return def.filter(D().ITEMS[id]); })
        .sort(function (a, b) { return D().ITEMS[a].price - D().ITEMS[b].price; });
    },
    buyPrice: function (id) { return Math.max(1, Math.ceil(D().ITEMS[id].price * 1.5)); },
    sellPrice: function (id) { return Math.max(1, Math.floor(D().ITEMS[id].price * 0.5)); },
    buy: function (p, shopId, id) {
      var now = performance.now();
      if (now - this._buyLock < 250) return; // double-click guard
      this._buyLock = now;
      var price = this.buyPrice(id);
      if (p.gold < price) { PK.UI.toast('Not enough gold!'); PK.Audio.sfx('error'); return; }
      var left = Inv.add(p, id, 1);
      if (left > 0) { PK.UI.toast('Inventory full!'); PK.Audio.sfx('error'); return; }
      p.gold -= price;
      PK.Audio.sfx('coin');
      PK.UI.toast('Bought ' + D().ITEMS[id].name + ' for ' + price + 'g');
      PK.UI.refreshPanels(); PK.UI.refreshHUD();
    },
    sell: function (p, where, i) {
      var s = Inv._ref(p, where, i);
      if (!s) return;
      var def = Inv.itemDef(s.id);
      if (!def || def.type === 'quest') { PK.UI.toast('Can\'t sell that'); return; }
      var price = this.sellPrice(s.id);
      p.gold += price;
      s.qty--;
      if (s.qty <= 0) Inv._setRef(p, where, i, null);
      PK.Audio.sfx('coin');
      PK.UI.toast('Sold for ' + price + 'g');
      PK.Systems.Ach.checkGold(p.gold);
      PK.UI.refreshPanels(); PK.UI.refreshHUD();
    }
  };

  /* ==================== SKILLS ==================== */
  var Skills = {
    allocate: function (p, skillId) {
      var tree = D().SKILLS[p.cls] || [];
      var node = null;
      for (var i = 0; i < tree.length; i++) if (tree[i].id === skillId) node = tree[i];
      if (!node) return;
      var pts = p.skills[skillId] || 0;
      if (p.skillPoints <= 0) { PK.UI.toast('No skill points (level up!)'); PK.Audio.sfx('error'); return; }
      if (pts >= node.max) { PK.UI.toast('Already maxed'); return; }
      if (node.req && !(p.skills[node.req] > 0)) { PK.UI.toast('Requires ' + node.req); PK.Audio.sfx('error'); return; }
      p.skills[skillId] = pts + 1;
      p.skillPoints--;
      PK.Entities.recompute(p);
      PK.Audio.sfx('buff');
      PK.UI.toast('Learned: ' + node.name + (node.max > 1 ? ' (' + (pts + 1) + '/' + node.max + ')' : ''));
      PK.UI.refreshPanels(); PK.UI.refreshHUD();
    },
    reset: function (p) {
      var total = 0;
      for (var k in p.skills) total += p.skills[k];
      if (total === 0) { PK.UI.toast('No skills to reset'); return; }
      var cost = 50 * p.level;
      PK.UI.confirm('Reset all skills for ' + cost + 'g?', function (yes) {
        if (!yes) return;
        if (p.gold < cost) { PK.UI.toast('Not enough gold'); return; }
        p.gold -= cost;
        p.skills = {};
        p.skillPoints += total;
        PK.Entities.recompute(p);
        PK.Audio.sfx('buff');
        PK.UI.refreshPanels(); PK.UI.refreshHUD();
      });
    }
  };

  /* ==================== ACHIEVEMENTS ==================== */
  var Ach = {
    unlocked: {},
    reset: function () { this.unlocked = {}; },
    is: function (id) { return !!this.unlocked[id]; },
    unlock: function (id) {
      if (this.unlocked[id]) return;
      var a = null;
      D().ACHIEVEMENTS.forEach(function (x) { if (x.id === id) a = x; });
      if (!a) return;
      this.unlocked[id] = Date.now();
      PK.UI.toast('🏆 Achievement: ' + a.name);
      PK.Audio.sfx('quest_done');
      PK.FX.floater(PK.Entities.player.x, PK.Entities.player.y - 30, '🏆 ' + a.name, '#ffd54f');
      if (a.xp) PK.Entities.addXP(a.xp);
      PK.UI.refreshPanels();
    },
    checkKill: function (type) {
      this.unlock('first_blood');
      var p = PK.Entities.player, n = 0;
      for (var k in p.kills) n += p.kills[k];
      if (n >= 100) this.unlock('slayer_100');
      if (n >= 500) this.unlock('slayer_500');
    },
    checkBoss: function (bossId) {
      var p = PK.Entities.player;
      var bk = PK.Entities.bossesKilled();
      var n = Object.keys(bk).length;
      if (n >= 1) this.unlock('boss_slayer_1');
      if (n >= 2) this.unlock('boss_slayer_2');
      if (n >= 3) this.unlock('boss_slayer_3');
    },
    checkChests: function (n) { if (n >= 1) this.unlock('treasure_1'); if (n >= 10) this.unlock('treasure_hunter'); },
    checkGather: function (n) { if (n >= 50) this.unlock('gatherer_50'); if (n >= 200) this.unlock('gatherer_200'); },
    checkLevel: function (l) { if (l >= 10) this.unlock('level_10'); if (l >= 20) this.unlock('level_20'); },
    checkCraft: function (n) { if (n >= 1) this.unlock('crafter_1'); if (n >= 25) this.unlock('master_crafter'); },
    checkGold: function (g) { if (g >= 1000) this.unlock('rich_1000'); if (g >= 5000) this.unlock('rich_5000'); },
    checkQuests: function (n) { if (n >= 5) this.unlock('quests_5'); if (n >= 12) this.unlock('quests_12'); },
    checkSteps: function (s) { if (s >= 5000) this.unlock('marathon'); },
    checkRegions: function (visited) {
      var ids = ['village', 'forest', 'ruins', 'caves', 'peaks'];
      for (var i = 0; i < ids.length; i++) if (!visited[ids[i]]) return;
      this.unlock('explorer');
    },
    serialize: function () { return this.unlocked; },
    deserialize: function (d) { this.unlocked = d || {}; }
  };

  PK.Systems.Inv = Inv;
  PK.Systems.Craft = Craft;
  PK.Systems.Quests = Quests;
  PK.Systems.Shop = Shop;
  PK.Systems.Skills = Skills;
  PK.Systems.Ach = Ach;
})();
