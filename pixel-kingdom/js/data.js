/* ============================================================
   PIXEL KINGDOM — Game Data Module
   Plain script, global namespace only. No modules, no assets.
   Defines: PK.Data = { RARITY, RARITY_COLOR, CLASSES, ITEMS,
     ENEMIES, RECIPES, QUESTS, DIALOGS, SKILLS, ACHIEVEMENTS,
     REGIONS, STARTER_QUEST }
   ============================================================ */
var PK = PK || {};

(function () {
'use strict';

/* ---------------- 1) RARITY ---------------- */
var RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
var RARITY_COLOR = ['#9aa0a6', '#4caf50', '#2196f3', '#9c27b0', '#ff9800', '#f44336'];

/* ---------------- 2) CLASSES ---------------- */
var CLASSES = {
  warrior: {
    name: 'Warrior',
    desc: 'A stalwart melee fighter. High health and defense; excels with swords and axes up close.',
    stats: { hp: 120, mp: 30, stamina: 100, atk: 12, def: 8, spd: 4.2, crit: 5 },
    startWeapon: 'wpn_wooden_sword',
    startItems: ['food_bread', 'food_bread', 'pot_minor_heal', 'arm_leather_boots']
  },
  ranger: {
    name: 'Ranger',
    desc: 'A swift hunter of the wilds. Fast and deadly from afar with bow and dagger.',
    stats: { hp: 90, mp: 50, stamina: 110, atk: 10, def: 5, spd: 5.0, crit: 12 },
    startWeapon: 'wpn_wooden_bow',
    startItems: ['food_apple', 'food_apple', 'pot_minor_heal', 'ammo_arrow', 'arm_cloth_boots']
  },
  mage: {
    name: 'Mage',
    desc: 'A wielder of arcane forces. Fragile but devastating; commands staves and spells.',
    stats: { hp: 80, mp: 120, stamina: 80, atk: 14, def: 4, spd: 4.4, crit: 8 },
    startWeapon: 'wpn_apprentice_staff',
    startItems: ['food_bread', 'pot_minor_mana', 'pot_minor_mana', 'arm_cloth_robe']
  }
};

/* ---------------- 3) ITEMS ----------------
   type: weapon|armor|tool|consumable|material|quest|treasure|ammo
   rarity: 0-5 index into RARITY                                    */
var ITEMS = {

/* ===== WEAPONS (23) ===== */
wpn_wooden_sword: { id:'wpn_wooden_sword', name:'Wooden Sword', desc:'A training blade carved from oak. Better than bare fists.', type:'weapon', rarity:0, stack:1, price:8, slot:'weapon', dmg:6, atkSpeed:1.6, range:1.2, cooldown:0.35, dur:60, repairable:true, icon:{bg:'#5a3d2b',fg:'#c9a06a',shape:'sword'} },
wpn_stone_club: { id:'wpn_stone_club', name:'Stone Club', desc:'A heavy branch capped with lashed stone. Slow but crushing.', type:'weapon', rarity:0, stack:1, price:14, slot:'weapon', dmg:9, atkSpeed:1.1, range:1.2, cooldown:0.55, dur:70, repairable:true, icon:{bg:'#4a4a4a',fg:'#8d8d8d',shape:'axe'} },
wpn_wooden_bow: { id:'wpn_wooden_bow', name:'Wooden Bow', desc:'A simple hunting bow. Requires arrows.', type:'weapon', rarity:0, stack:1, price:12, slot:'weapon', dmg:7, atkSpeed:1.2, range:7, cooldown:0.6, dur:60, repairable:true, ammoType:'arrow', icon:{bg:'#5a3d2b',fg:'#c9a06a',shape:'bow'} },
wpn_copper_dagger: { id:'wpn_copper_dagger', name:'Copper Dagger', desc:'Fast and light. Finds the gaps in armor.', type:'weapon', rarity:1, stack:1, price:28, slot:'weapon', dmg:9, atkSpeed:2.4, range:1.0, cooldown:0.25, dur:80, repairable:true, stats:{crit:3}, icon:{bg:'#7a4a2b',fg:'#e08a4c',shape:'dagger'} },
wpn_copper_sword: { id:'wpn_copper_sword', name:'Copper Sword', desc:'A sturdy copper blade, the first real weapon of an adventurer.', type:'weapon', rarity:1, stack:1, price:45, slot:'weapon', dmg:12, atkSpeed:1.6, range:1.2, cooldown:0.35, dur:100, repairable:true, icon:{bg:'#7a4a2b',fg:'#e08a4c',shape:'sword'} },
wpn_copper_axe: { id:'wpn_copper_axe', name:'Copper Axe', desc:'Doubles as a woodcutting tool in a pinch.', type:'weapon', rarity:1, stack:1, price:48, slot:'weapon', dmg:14, atkSpeed:1.1, range:1.2, cooldown:0.5, dur:110, repairable:true, icon:{bg:'#7a4a2b',fg:'#e08a4c',shape:'axe'} },
wpn_iron_sword: { id:'wpn_iron_sword', name:'Iron Sword', desc:'The trusted blade of kingdom guards.', type:'weapon', rarity:2, stack:1, price:120, slot:'weapon', dmg:17, atkSpeed:1.6, range:1.2, cooldown:0.35, dur:140, repairable:true, icon:{bg:'#5c6670',fg:'#cfd8dc',shape:'sword'} },
wpn_iron_axe: { id:'wpn_iron_axe', name:'Iron Axe', desc:'A brutal chopping axe favored by bandit brutes.', type:'weapon', rarity:2, stack:1, price:130, slot:'weapon', dmg:20, atkSpeed:1.1, range:1.2, cooldown:0.5, dur:150, repairable:true, icon:{bg:'#5c6670',fg:'#cfd8dc',shape:'axe'} },
wpn_iron_spear: { id:'wpn_iron_spear', name:'Iron Spear', desc:'Keep enemies at spear\'s length.', type:'weapon', rarity:2, stack:1, price:125, slot:'weapon', dmg:18, atkSpeed:1.3, range:1.9, cooldown:0.45, dur:130, repairable:true, icon:{bg:'#5c6670',fg:'#cfd8dc',shape:'spear'} },
wpn_iron_bow: { id:'wpn_iron_bow', name:'Iron Bow', desc:'Reinforced limbs give arrows real bite.', type:'weapon', rarity:2, stack:1, price:135, slot:'weapon', dmg:16, atkSpeed:1.3, range:7.5, cooldown:0.55, dur:130, repairable:true, ammoType:'arrow', icon:{bg:'#5c6670',fg:'#cfd8dc',shape:'bow'} },
wpn_apprentice_staff: { id:'wpn_apprentice_staff', name:'Apprentice Staff', desc:'A novice mage\'s focus. Channels raw mana.', type:'weapon', rarity:0, stack:1, price:10, slot:'weapon', dmg:8, atkSpeed:1.2, range:6, cooldown:0.6, dur:70, repairable:true, stats:{mp:10}, icon:{bg:'#4a3b6b',fg:'#b39ddb',shape:'staff'} },
wpn_oak_staff: { id:'wpn_oak_staff', name:'Oakheart Staff', desc:'Carved from the heart of an ancient oak. Hums with quiet power.', type:'weapon', rarity:2, stack:1, price:150, slot:'weapon', dmg:15, atkSpeed:1.3, range:6.5, cooldown:0.55, dur:140, repairable:true, stats:{mp:15}, icon:{bg:'#4a3b6b',fg:'#9ccc65',shape:'staff'} },
wpn_steel_sword: { id:'wpn_steel_sword', name:'Steel Sword', desc:'Kingdom-forged steel. Sharp, balanced, deadly.', type:'weapon', rarity:3, stack:1, price:320, slot:'weapon', dmg:25, atkSpeed:1.7, range:1.2, cooldown:0.32, dur:200, repairable:true, icon:{bg:'#37474f',fg:'#eceff1',shape:'sword'} },
wpn_steel_axe: { id:'wpn_steel_axe', name:'Steel War Axe', desc:'A soldier\'s answer to heavy armor.', type:'weapon', rarity:3, stack:1, price:340, slot:'weapon', dmg:29, atkSpeed:1.15, range:1.2, cooldown:0.48, dur:210, repairable:true, icon:{bg:'#37474f',fg:'#eceff1',shape:'axe'} },
wpn_steel_bow: { id:'wpn_steel_bow', name:'Steel Longbow', desc:'Sings when drawn. Arrows fly true and far.', type:'weapon', rarity:3, stack:1, price:350, slot:'weapon', dmg:24, atkSpeed:1.4, range:8.5, cooldown:0.5, dur:200, repairable:true, ammoType:'arrow', icon:{bg:'#37474f',fg:'#eceff1',shape:'bow'} },
wpn_hunters_bow: { id:'wpn_hunters_bow', name:'Hunter\'s Bow', desc:'A ranger\'s prized bow, strung with spider silk.', type:'weapon', rarity:2, stack:1, price:180, slot:'weapon', dmg:20, atkSpeed:1.5, range:8, cooldown:0.5, dur:150, repairable:true, ammoType:'arrow', stats:{crit:5}, icon:{bg:'#33691e',fg:'#aed581',shape:'bow'} },
wpn_mithril_sword: { id:'wpn_mithril_sword', name:'Mithril Sword', desc:'Feather-light, impossibly sharp. A legend in the making.', type:'weapon', rarity:4, stack:1, price:900, slot:'weapon', dmg:35, atkSpeed:1.8, range:1.3, cooldown:0.3, dur:300, repairable:true, stats:{crit:5}, icon:{bg:'#00695c',fg:'#80cbc4',shape:'sword'} },
wpn_mithril_bow: { id:'wpn_mithril_bow', name:'Mithril Bow', desc:'Bends starlight into arrows.', type:'weapon', rarity:4, stack:1, price:950, slot:'weapon', dmg:33, atkSpeed:1.5, range:9.5, cooldown:0.45, dur:300, repairable:true, ammoType:'arrow', stats:{crit:6}, icon:{bg:'#00695c',fg:'#80cbc4',shape:'bow'} },
wpn_mithril_staff: { id:'wpn_mithril_staff', name:'Archmage Staff', desc:'Topped with a crystal shard. Spells practically cast themselves.', type:'weapon', rarity:4, stack:1, price:980, slot:'weapon', dmg:31, atkSpeed:1.4, range:7.5, cooldown:0.5, dur:280, repairable:true, stats:{mp:25}, icon:{bg:'#00695c',fg:'#80cbc4',shape:'staff'} },
wpn_frost_spear: { id:'wpn_frost_spear', name:'Frost Spear', desc:'Forged in the peaks. Its touch slows the blood of foes.', type:'weapon', rarity:4, stack:1, price:750, slot:'weapon', dmg:40, atkSpeed:1.3, range:2.0, cooldown:0.45, dur:260, repairable:true, effect:{slow:4}, icon:{bg:'#01579b',fg:'#b3e5fc',shape:'spear'} },
wpn_moon_dagger: { id:'wpn_moon_dagger', name:'Moon Dagger', desc:'A blade that drinks moonlight. Strikes faster than thought.', type:'weapon', rarity:3, stack:1, price:420, slot:'weapon', dmg:22, atkSpeed:2.6, range:1.0, cooldown:0.22, dur:180, repairable:true, stats:{crit:10}, icon:{bg:'#311b92',fg:'#d1c4e9',shape:'dagger'} },
wpn_ember_blade: { id:'wpn_ember_blade', name:'Ember Blade', desc:'Trophy of the Goblin Warlord. Still burns with cave-fire.', type:'weapon', rarity:4, stack:1, price:1100, slot:'weapon', dmg:48, atkSpeed:1.7, range:1.3, cooldown:0.32, dur:320, repairable:true, effect:{burn:5}, icon:{bg:'#bf360c',fg:'#ffab91',shape:'sword'} },
wpn_kingsbane: { id:'wpn_kingsbane', name:'Kingsbane', desc:'The lost blade of the Pixel Kingdom. Its return heralds the kingdom\'s restoration.', type:'weapon', rarity:5, stack:1, price:5000, slot:'weapon', dmg:60, atkSpeed:1.8, range:1.4, cooldown:0.3, dur:500, repairable:true, stats:{crit:10, atk:5}, effect:{burn:3}, icon:{bg:'#4a148c',fg:'#ffeb3b',shape:'sword'} },

/* ===== ARMOR (31) ===== */
/* Cloth set */
arm_cloth_cap: { id:'arm_cloth_cap', name:'Cloth Cap', desc:'Simple traveler\'s cap.', type:'armor', rarity:0, stack:1, price:6, slot:'head', stats:{def:1, mp:5}, icon:{bg:'#6d4c41',fg:'#d7ccc8',shape:'helmet'} },
arm_cloth_robe: { id:'arm_cloth_robe', name:'Cloth Robe', desc:'Light robe favored by apprentice mages.', type:'armor', rarity:0, stack:1, price:10, slot:'chest', stats:{def:2, mp:8}, icon:{bg:'#6d4c41',fg:'#d7ccc8',shape:'chest'} },
arm_cloth_pants: { id:'arm_cloth_pants', name:'Cloth Pants', desc:'Comfortable and quiet.', type:'armor', rarity:0, stack:1, price:8, slot:'legs', stats:{def:1, mp:4}, icon:{bg:'#6d4c41',fg:'#d7ccc8',shape:'legs'} },
arm_cloth_boots: { id:'arm_cloth_boots', name:'Cloth Boots', desc:'Soft-soled boots for silent steps.', type:'armor', rarity:0, stack:1, price:7, slot:'boots', stats:{def:1, spd:0.1}, icon:{bg:'#6d4c41',fg:'#d7ccc8',shape:'boots'} },
/* Leather set */
arm_leather_cap: { id:'arm_leather_cap', name:'Leather Cap', desc:'Treated hide cap. Smells of the wilds.', type:'armor', rarity:1, stack:1, price:25, slot:'head', stats:{def:3}, icon:{bg:'#4e342e',fg:'#a1887f',shape:'helmet'} },
arm_leather_tunic: { id:'arm_leather_tunic', name:'Leather Tunic', desc:'Sturdy ranger\'s tunic.', type:'armor', rarity:1, stack:1, price:45, slot:'chest', stats:{def:5, spd:0.1}, icon:{bg:'#4e342e',fg:'#a1887f',shape:'chest'} },
arm_leather_leggings: { id:'arm_leather_leggings', name:'Leather Leggings', desc:'Flexible and tough.', type:'armor', rarity:1, stack:1, price:35, slot:'legs', stats:{def:4}, icon:{bg:'#4e342e',fg:'#a1887f',shape:'legs'} },
arm_leather_boots: { id:'arm_leather_boots', name:'Leather Boots', desc:'Broken-in boots made for long roads.', type:'armor', rarity:1, stack:1, price:30, slot:'boots', stats:{def:3, spd:0.2}, icon:{bg:'#4e342e',fg:'#a1887f',shape:'boots'} },
/* Iron set */
arm_iron_helm: { id:'arm_iron_helm', name:'Iron Helm', desc:'Standard-issue kingdom guard helm.', type:'armor', rarity:2, stack:1, price:90, slot:'head', stats:{def:6, hp:10}, icon:{bg:'#455a64',fg:'#b0bec5',shape:'helmet'} },
arm_iron_chestplate: { id:'arm_iron_chestplate', name:'Iron Chestplate', desc:'Dented but dependable.', type:'armor', rarity:2, stack:1, price:150, slot:'chest', stats:{def:10, hp:15}, icon:{bg:'#455a64',fg:'#b0bec5',shape:'chest'} },
arm_iron_greaves: { id:'arm_iron_greaves', name:'Iron Greaves', desc:'Clanks when you run. Worth it.', type:'armor', rarity:2, stack:1, price:110, slot:'legs', stats:{def:8, hp:10}, icon:{bg:'#455a64',fg:'#b0bec5',shape:'legs'} },
arm_iron_boots: { id:'arm_iron_boots', name:'Iron Boots', desc:'Heavy. Very heavy. Very protective.', type:'armor', rarity:2, stack:1, price:95, slot:'boots', stats:{def:6}, icon:{bg:'#455a64',fg:'#b0bec5',shape:'boots'} },
/* Steel set */
arm_steel_helm: { id:'arm_steel_helm', name:'Steel Helm', desc:'Kingdom-forged. Polished to a mirror shine.', type:'armor', rarity:3, stack:1, price:260, slot:'head', stats:{def:10, hp:20}, icon:{bg:'#263238',fg:'#eceff1',shape:'helmet'} },
arm_steel_plate: { id:'arm_steel_plate', name:'Steel Plate', desc:'The pride of the royal forge.', type:'armor', rarity:3, stack:1, price:420, slot:'chest', stats:{def:16, hp:30}, icon:{bg:'#263238',fg:'#eceff1',shape:'chest'} },
arm_steel_greaves: { id:'arm_steel_greaves', name:'Steel Greaves', desc:'Articulated for surprising mobility.', type:'armor', rarity:3, stack:1, price:320, slot:'legs', stats:{def:12, hp:20}, icon:{bg:'#263238',fg:'#eceff1',shape:'legs'} },
arm_steel_boots: { id:'arm_steel_boots', name:'Steel Boots', desc:'March through anything.', type:'armor', rarity:3, stack:1, price:280, slot:'boots', stats:{def:10, spd:0.1}, icon:{bg:'#263238',fg:'#eceff1',shape:'boots'} },
/* Mithril set */
arm_mithril_helm: { id:'arm_mithril_helm', name:'Mithril Helm', desc:'Light as silk, hard as dragon scale.', type:'armor', rarity:4, stack:1, price:700, slot:'head', stats:{def:15, hp:35, mp:10}, icon:{bg:'#004d40',fg:'#a7ffeb',shape:'helmet'} },
arm_mithril_plate: { id:'arm_mithril_plate', name:'Mithril Plate', desc:'Worn by the heroes of the old kingdom.', type:'armor', rarity:4, stack:1, price:1100, slot:'chest', stats:{def:24, hp:50, mp:10}, icon:{bg:'#004d40',fg:'#a7ffeb',shape:'chest'} },
arm_mithril_greaves: { id:'arm_mithril_greaves', name:'Mithril Greaves', desc:'You barely feel them.', type:'armor', rarity:4, stack:1, price:850, slot:'legs', stats:{def:18, hp:35}, icon:{bg:'#004d40',fg:'#a7ffeb',shape:'legs'} },
arm_mithril_boots: { id:'arm_mithril_boots', name:'Mithril Boots', desc:'Silent, swift, unbreakable.', type:'armor', rarity:4, stack:1, price:750, slot:'boots', stats:{def:14, spd:0.3}, icon:{bg:'#004d40',fg:'#a7ffeb',shape:'boots'} },
/* Shields (offhand) */
arm_wooden_shield: { id:'arm_wooden_shield', name:'Wooden Shield', desc:'Better than hiding behind your hands.', type:'armor', rarity:0, stack:1, price:10, slot:'offhand', stats:{def:3}, icon:{bg:'#5a3d2b',fg:'#c9a06a',shape:'shield'} },
arm_iron_shield: { id:'arm_iron_shield', name:'Iron Shield', desc:'Embossed with the old kingdom\'s crest.', type:'armor', rarity:2, stack:1, price:120, slot:'offhand', stats:{def:8, hp:10}, icon:{bg:'#455a64',fg:'#b0bec5',shape:'shield'} },
arm_steel_shield: { id:'arm_steel_shield', name:'Steel Shield', desc:'A wall you can carry.', type:'armor', rarity:3, stack:1, price:300, slot:'offhand', stats:{def:13, hp:20}, icon:{bg:'#263238',fg:'#eceff1',shape:'shield'} },
arm_mithril_shield: { id:'arm_mithril_shield', name:'Mithril Shield', desc:'Turns aside blades like rain.', type:'armor', rarity:4, stack:1, price:800, slot:'offhand', stats:{def:18, hp:30}, icon:{bg:'#004d40',fg:'#a7ffeb',shape:'shield'} },
/* Accessories */
arm_ring_power: { id:'arm_ring_power', name:'Ring of Power', desc:'A band of warm iron. Your strikes hit harder.', type:'armor', rarity:2, stack:1, price:200, slot:'accessory', stats:{atk:4}, icon:{bg:'#4e342e',fg:'#ffca28',shape:'ring'} },
arm_ring_swift: { id:'arm_ring_swift', name:'Ring of Swiftness', desc:'Wind seems to push you along.', type:'armor', rarity:2, stack:1, price:200, slot:'accessory', stats:{spd:0.3, crit:3}, icon:{bg:'#1b5e20',fg:'#aed581',shape:'ring'} },
arm_ring_life: { id:'arm_ring_life', name:'Ring of Vitality', desc:'Pulses gently with stored life.', type:'armor', rarity:3, stack:1, price:380, slot:'accessory', stats:{hp:40}, icon:{bg:'#b71c1c',fg:'#ef9a9a',shape:'ring'} },
arm_amulet_guard: { id:'arm_amulet_guard', name:'Guardian Amulet', desc:'An old soldier\'s charm. Wards off harm.', type:'armor', rarity:3, stack:1, price:400, slot:'accessory', stats:{def:8, hp:20}, icon:{bg:'#0d47a1',fg:'#90caf9',shape:'ring'} },
arm_amulet_mage: { id:'arm_amulet_mage', name:'Arcane Amulet', desc:'Hums with trapped starlight.', type:'armor', rarity:3, stack:1, price:420, slot:'accessory', stats:{mp:30, atk:3}, icon:{bg:'#4a148c',fg:'#ce93d8',shape:'ring'} },
arm_lucky_charm: { id:'arm_lucky_charm', name:'Lucky Charm', desc:'A four-leaf pixel. Fortune favors you.', type:'armor', rarity:1, stack:1, price:90, slot:'accessory', stats:{crit:6}, icon:{bg:'#33691e',fg:'#ffeb3b',shape:'ring'} },
arm_crown_plate: { id:'arm_crown_plate', name:'Crownplate of the Fallen King', desc:'Breastplate of the last king. Taken from the Skeleton Lord\'s hoard.', type:'armor', rarity:4, stack:1, price:1500, slot:'chest', stats:{def:28, hp:60, atk:4}, icon:{bg:'#3e2723',fg:'#ffd54f',shape:'chest'} },

/* ===== TOOLS (10) ===== */
tool_wooden_axe: { id:'tool_wooden_axe', name:'Wooden Axe', desc:'For chopping trees. Slow going.', type:'tool', rarity:0, stack:1, price:8, dur:50, repairable:true, icon:{bg:'#5a3d2b',fg:'#c9a06a',shape:'tool'} },
tool_stone_axe: { id:'tool_stone_axe', name:'Stone Axe', desc:'Chops wood and cracks skulls with equal ease.', type:'tool', rarity:0, stack:1, price:16, dur:80, repairable:true, icon:{bg:'#4a4a4a',fg:'#bdbdbd',shape:'tool'} },
tool_iron_axe: { id:'tool_iron_axe', name:'Iron Axe', desc:'A lumberjack\'s pride.', type:'tool', rarity:2, stack:1, price:90, dur:160, repairable:true, icon:{bg:'#455a64',fg:'#b0bec5',shape:'tool'} },
tool_steel_axe: { id:'tool_steel_axe', name:'Steel Axe', desc:'Fells ancient trees in a few swings.', type:'tool', rarity:3, stack:1, price:240, dur:260, repairable:true, icon:{bg:'#263238',fg:'#eceff1',shape:'tool'} },
tool_stone_pick: { id:'tool_stone_pick', name:'Stone Pickaxe', desc:'Breaks stone and soft ores.', type:'tool', rarity:0, stack:1, price:16, dur:80, repairable:true, icon:{bg:'#4a4a4a',fg:'#9e9e9e',shape:'tool'} },
tool_iron_pick: { id:'tool_iron_pick', name:'Iron Pickaxe', desc:'Bites into copper and iron veins.', type:'tool', rarity:2, stack:1, price:95, dur:160, repairable:true, icon:{bg:'#455a64',fg:'#b0bec5',shape:'tool'} },
tool_steel_pick: { id:'tool_steel_pick', name:'Steel Pickaxe', desc:'Cracks the hardest rock.', type:'tool', rarity:3, stack:1, price:250, dur:260, repairable:true, icon:{bg:'#263238',fg:'#eceff1',shape:'tool'} },
tool_mithril_pick: { id:'tool_mithril_pick', name:'Mithril Pickaxe', desc:'Sings against stone. Mines mithril veins.', type:'tool', rarity:4, stack:1, price:600, dur:400, repairable:true, icon:{bg:'#004d40',fg:'#a7ffeb',shape:'tool'} },
tool_fishing_rod: { id:'tool_fishing_rod', name:'Fishing Rod', desc:'Catch fish in rivers and lakes.', type:'tool', rarity:1, stack:1, price:40, dur:120, repairable:true, icon:{bg:'#5a3d2b',fg:'#90caf9',shape:'tool'} },
tool_torch: { id:'tool_torch', name:'Torch', desc:'Light the dark places of the world.', type:'tool', rarity:0, stack:20, price:3, dur:30, repairable:false, icon:{bg:'#3e2723',fg:'#ffb300',shape:'tool'} },

/* ===== CONSUMABLES (20) ===== */
food_bread: { id:'food_bread', name:'Bread', desc:'Fresh from the village oven. Restores health.', type:'consumable', rarity:0, stack:20, price:5, heal:{hp:25, mp:0}, icon:{bg:'#6d4c41',fg:'#ffcc80',shape:'food'} },
food_apple: { id:'food_apple', name:'Apple', desc:'Crisp orchard apple.', type:'consumable', rarity:0, stack:20, price:4, heal:{hp:15, mp:0}, icon:{bg:'#1b5e20',fg:'#e53935',shape:'food'} },
food_berries: { id:'food_berries', name:'Wild Berries', desc:'Sweet forest berries. Herbalists love them.', type:'consumable', rarity:0, stack:30, price:3, heal:{hp:10, mp:5}, icon:{bg:'#1b5e20',fg:'#ab47bc',shape:'food'} },
food_grilled_berries: { id:'food_grilled_berries', name:'Grilled Berries', desc:'Campfire-roasted berries. Warm and sweet.', type:'consumable', rarity:0, stack:20, price:8, heal:{hp:30, mp:10}, icon:{bg:'#4e342e',fg:'#ce93d8',shape:'food'} },
food_raw_meat: { id:'food_raw_meat', name:'Raw Meat', desc:'Best cooked before eating.', type:'consumable', rarity:0, stack:20, price:6, heal:{hp:8, mp:0}, icon:{bg:'#4e342e',fg:'#ef9a9a',shape:'meat'} },
food_cooked_meat: { id:'food_cooked_meat', name:'Cooked Meat', desc:'Hearty campfire meal. Restores lots of health.', type:'consumable', rarity:1, stack:20, price:15, heal:{hp:60, mp:0}, icon:{bg:'#4e342e',fg:'#ffab91',shape:'meat'} },
food_fish: { id:'food_fish', name:'Raw Fish', desc:'Fresh from the river.', type:'consumable', rarity:0, stack:20, price:6, heal:{hp:8, mp:0}, icon:{bg:'#01579b',fg:'#80deea',shape:'meat'} },
food_roast_fish: { id:'food_roast_fish', name:'Roast Fish', desc:'Crispy and nourishing.', type:'consumable', rarity:1, stack:20, price:14, heal:{hp:50, mp:0}, icon:{bg:'#4e342e',fg:'#ffcc80',shape:'meat'} },
food_stew: { id:'food_stew', name:'Hearty Stew', desc:'Meat, herbs, and patience. A full meal.', type:'consumable', rarity:1, stack:10, price:25, heal:{hp:90, mp:10}, icon:{bg:'#3e2723',fg:'#ffb74d',shape:'food'} },
food_honey: { id:'food_honey', name:'Wild Honey', desc:'Golden and energizing.', type:'consumable', rarity:1, stack:20, price:12, heal:{hp:20, mp:20}, icon:{bg:'#f57f17',fg:'#fff176',shape:'food'} },
food_cheese: { id:'food_cheese', name:'Cheese Wheel', desc:'Aged in the village cellar.', type:'consumable', rarity:1, stack:10, price:18, heal:{hp:45, mp:0}, icon:{bg:'#f9a825',fg:'#fff9c4',shape:'food'} },
food_mushroom_soup: { id:'food_mushroom_soup', name:'Mushroom Soup', desc:'Earthy cave mushrooms in a warm broth.', type:'consumable', rarity:1, stack:10, price:22, heal:{hp:55, mp:15}, icon:{bg:'#4e342e',fg:'#d7ccc8',shape:'food'} },
food_trail_mix: { id:'food_trail_mix', name:'Trail Mix', desc:'Nuts, berries, and dried meat for the road.', type:'consumable', rarity:1, stack:20, price:16, heal:{hp:35, mp:10}, icon:{bg:'#5d4037',fg:'#dcedc8',shape:'food'} },
pot_minor_heal: { id:'pot_minor_heal', name:'Minor Health Potion', desc:'Restores 60 HP. Every adventurer\'s best friend.', type:'consumable', rarity:1, stack:10, price:30, heal:{hp:60, mp:0}, icon:{bg:'#b71c1c',fg:'#ef9a9a',shape:'potion'} },
pot_major_heal: { id:'pot_major_heal', name:'Major Health Potion', desc:'Restores 180 HP. For when things go badly.', type:'consumable', rarity:2, stack:10, price:90, heal:{hp:180, mp:0}, icon:{bg:'#b71c1c',fg:'#ffffff',shape:'potion'} },
pot_minor_mana: { id:'pot_minor_mana', name:'Minor Mana Potion', desc:'Restores 50 MP.', type:'consumable', rarity:1, stack:10, price:30, heal:{hp:0, mp:50}, icon:{bg:'#0d47a1',fg:'#90caf9',shape:'potion'} },
pot_major_mana: { id:'pot_major_mana', name:'Major Mana Potion', desc:'Restores 140 MP.', type:'consumable', rarity:2, stack:10, price:90, heal:{hp:0, mp:140}, icon:{bg:'#0d47a1',fg:'#ffffff',shape:'potion'} },
pot_antidote: { id:'pot_antidote', name:'Antidote', desc:'Cures poison and burning.', type:'consumable', rarity:1, stack:10, price:35, heal:{hp:10, mp:0}, effect:{cure:true}, icon:{bg:'#1b5e20',fg:'#a5d6a7',shape:'potion'} },
pot_stamina_draught: { id:'pot_stamina_draught', name:'Stamina Draught', desc:'Restores stamina and quickens your step briefly.', type:'consumable', rarity:1, stack:10, price:28, heal:{hp:0, mp:0}, effect:{stamina:60}, icon:{bg:'#e65100',fg:'#ffcc80',shape:'potion'} },
pot_bandage: { id:'pot_bandage', name:'Bandage', desc:'Stops bleeding. Restores 40 HP.', type:'consumable', rarity:0, stack:20, price:8, heal:{hp:40, mp:0}, icon:{bg:'#8d6e63',fg:'#efebe9',shape:'misc'} },

/* ===== MATERIALS (28) ===== */
mat_wood: { id:'mat_wood', name:'Wood', desc:'Sturdy timber from forest trees.', type:'material', rarity:0, stack:99, price:2, icon:{bg:'#4e342e',fg:'#a1887f',shape:'wood'} },
mat_stone: { id:'mat_stone', name:'Stone', desc:'Rough-hewn rock.', type:'material', rarity:0, stack:99, price:2, icon:{bg:'#424242',fg:'#9e9e9e',shape:'ore'} },
mat_fiber: { id:'mat_fiber', name:'Plant Fiber', desc:'Tough strands for rope and bandages.', type:'material', rarity:0, stack:99, price:2, icon:{bg:'#33691e',fg:'#c5e1a5',shape:'herb'} },
mat_coal: { id:'mat_coal', name:'Coal', desc:'Fuel for furnaces and forges.', type:'material', rarity:0, stack:99, price:4, icon:{bg:'#212121',fg:'#616161',shape:'ore'} },
mat_copper_ore: { id:'mat_copper_ore', name:'Copper Ore', desc:'Smelt into copper ingots at a furnace.', type:'material', rarity:1, stack:99, price:6, icon:{bg:'#5d4037',fg:'#ff8a65',shape:'ore'} },
mat_copper_ingot: { id:'mat_copper_ingot', name:'Copper Ingot', desc:'Workable copper for the workbench.', type:'material', rarity:1, stack:99, price:14, icon:{bg:'#6d4c41',fg:'#ffab91',shape:'ore'} },
mat_iron_ore: { id:'mat_iron_ore', name:'Iron Ore', desc:'The backbone of the kingdom\'s armies.', type:'material', rarity:2, stack:99, price:10, icon:{bg:'#37474f',fg:'#b0bec5',shape:'ore'} },
mat_iron_ingot: { id:'mat_iron_ingot', name:'Iron Ingot', desc:'Solid iron, ready for smithing.', type:'material', rarity:2, stack:99, price:24, icon:{bg:'#455a64',fg:'#cfd8dc',shape:'ore'} },
mat_gold_ore: { id:'mat_gold_ore', name:'Gold Ore', desc:'Glitters with promise.', type:'material', rarity:3, stack:99, price:25, icon:{bg:'#5d4037',fg:'#ffd54f',shape:'ore'} },
mat_gold_ingot: { id:'mat_gold_ingot', name:'Gold Ingot', desc:'Pure and heavy. Merchants drool over it.', type:'material', rarity:3, stack:99, price:60, icon:{bg:'#f9a825',fg:'#fff176',shape:'ore'} },
mat_steel_ingot: { id:'mat_steel_ingot', name:'Steel Ingot', desc:'Forged from iron and coal at high heat.', type:'material', rarity:3, stack:99, price:55, icon:{bg:'#263238',fg:'#eceff1',shape:'ore'} },
mat_mithril_ore: { id:'mat_mithril_ore', name:'Mithril Ore', desc:'Rare silvery ore from the high peaks.', type:'material', rarity:4, stack:99, price:60, icon:{bg:'#004d40',fg:'#80cbc4',shape:'ore'} },
mat_mithril_ingot: { id:'mat_mithril_ingot', name:'Mithril Ingot', desc:'Light, strong, and worth a fortune.', type:'material', rarity:4, stack:99, price:150, icon:{bg:'#00695c',fg:'#b2dfdb',shape:'ore'} },
mat_leather: { id:'mat_leather', name:'Leather', desc:'Tanned hide for light armor.', type:'material', rarity:1, stack:99, price:8, icon:{bg:'#4e342e',fg:'#a1887f',shape:'misc'} },
mat_wolf_pelt: { id:'mat_wolf_pelt', name:'Wolf Pelt', desc:'Thick fur, prized by the guard captain.', type:'material', rarity:1, stack:99, price:12, icon:{bg:'#616161',fg:'#e0e0e0',shape:'misc'} },
mat_slime_gel: { id:'mat_slime_gel', name:'Slime Gel', desc:'Jiggly alchemical base for potions.', type:'material', rarity:0, stack:99, price:4, icon:{bg:'#2e7d32',fg:'#a5d6a7',shape:'misc'} },
mat_bone: { id:'mat_bone', name:'Bone', desc:'Brittle remains of the undead.', type:'material', rarity:1, stack:99, price:5, icon:{bg:'#795548',fg:'#efebe9',shape:'misc'} },
mat_wolf_fang: { id:'mat_wolf_fang', name:'Wolf Fang', desc:'Sharp trophy from a slain wolf.', type:'material', rarity:1, stack:99, price:10, icon:{bg:'#616161',fg:'#ffffff',shape:'misc'} },
mat_goblin_ear: { id:'mat_goblin_ear', name:'Goblin Ear', desc:'Proof of a goblin slain.', type:'material', rarity:1, stack:99, price:8, icon:{bg:'#33691e',fg:'#dcedc8',shape:'misc'} },
mat_spider_silk: { id:'mat_spider_silk', name:'Spider Silk', desc:'Stronger than steel thread.', type:'material', rarity:2, stack:99, price:18, icon:{bg:'#eceff1',fg:'#ffffff',shape:'misc'} },
mat_crystal_shard: { id:'mat_crystal_shard', name:'Crystal Shard', desc:'Crackles with latent mana.', type:'material', rarity:2, stack:99, price:22, icon:{bg:'#4a148c',fg:'#ce93d8',shape:'gem'} },
mat_dragon_scale: { id:'mat_dragon_scale', name:'Dragon Scale', desc:'A scale from a long-dead wyrm. Nearly indestructible.', type:'material', rarity:5, stack:99, price:400, icon:{bg:'#b71c1c',fg:'#ff8a80',shape:'gem'} },
mat_herb: { id:'mat_herb', name:'Medicinal Herb', desc:'Healing leaves gathered in the wilds.', type:'material', rarity:0, stack:99, price:3, icon:{bg:'#1b5e20',fg:'#9ccc65',shape:'herb'} },
mat_mushroom: { id:'mat_mushroom', name:'Cave Mushroom', desc:'Glows faintly. Edible when cooked.', type:'material', rarity:0, stack:99, price:3, icon:{bg:'#4a148c',fg:'#ce93d8',shape:'herb'} },
mat_ember_shard: { id:'mat_ember_shard', name:'Ember Shard', desc:'A fragment of living flame.', type:'material', rarity:3, stack:99, price:45, icon:{bg:'#bf360c',fg:'#ffab91',shape:'gem'} },
mat_frost_shard: { id:'mat_frost_shard', name:'Frost Shard', desc:'Cold enough to burn.', type:'material', rarity:3, stack:99, price:45, icon:{bg:'#01579b',fg:'#b3e5fc',shape:'gem'} },
mat_ancient_bark: { id:'mat_ancient_bark', name:'Ancient Bark', desc:'Bark from the oldest trees. Steeped in forest magic.', type:'material', rarity:3, stack:99, price:35, icon:{bg:'#3e2723',fg:'#a5d6a7',shape:'wood'} },
mat_ironwood: { id:'mat_ironwood', name:'Ironwood', desc:'Wood hard as iron from the deep forest.', type:'material', rarity:2, stack:99, price:20, icon:{bg:'#3e2723',fg:'#bcaaa4',shape:'wood'} },

/* ===== QUEST ITEMS (8) ===== */
quest_rusty_key: { id:'quest_rusty_key', name:'Rusty Key', desc:'Opens something old in the Ember Caves.', type:'quest', rarity:1, stack:1, price:0, icon:{bg:'#4e342e',fg:'#bcaaa4',shape:'key'} },
quest_sealed_letter: { id:'quest_sealed_letter', name:'Sealed Letter', desc:'A letter for the guard captain, sealed with wax.', type:'quest', rarity:0, stack:1, price:0, icon:{bg:'#f5f5f5',fg:'#b71c1c',shape:'book'} },
quest_herbal_satchel: { id:'quest_herbal_satchel', name:'Herbal Satchel', desc:'Yara\'s satchel of rare herbs.', type:'quest', rarity:1, stack:1, price:0, icon:{bg:'#1b5e20',fg:'#a5d6a7',shape:'misc'} },
quest_forge_hammer: { id:'quest_forge_hammer', name:'Forge Hammer', desc:'Borin\'s lucky hammer, lost in the caves.', type:'quest', rarity:2, stack:1, price:0, icon:{bg:'#37474f',fg:'#cfd8dc',shape:'tool'} },
quest_ancient_tablet: { id:'quest_ancient_tablet', name:'Ancient Tablet', desc:'Runes describe the fall of the old kingdom.', type:'quest', rarity:3, stack:1, price:0, icon:{bg:'#4e342e',fg:'#ffcc80',shape:'book'} },
quest_wardens_sigil: { id:'quest_wardens_sigil', name:'Warden\'s Sigil', desc:'Mark of the mountain wardens.', type:'quest', rarity:3, stack:1, price:0, icon:{bg:'#01579b',fg:'#b3e5fc',shape:'misc'} },
quest_hermit_beads: { id:'quest_hermit_beads', name:'Hermit\'s Beads', desc:'Prayer beads carved from frost crystal.', type:'quest', rarity:3, stack:1, price:0, icon:{bg:'#01579b',fg:'#e1f5fe',shape:'ring'} },
quest_crown_fragment: { id:'quest_crown_fragment', name:'Crown Fragment', desc:'A shard of the true crown. It yearns to be whole.', type:'quest', rarity:5, stack:1, price:0, icon:{bg:'#4a148c',fg:'#ffd54f',shape:'gem'} },

/* ===== TREASURES (10) ===== */
trea_ancient_coin: { id:'trea_ancient_coin', name:'Ancient Coin', desc:'Currency of the fallen kingdom. Collectors pay well.', type:'treasure', rarity:2, stack:99, price:50, icon:{bg:'#6d4c41',fg:'#ffd54f',shape:'coin'} },
trea_old_amulet: { id:'trea_old_amulet', name:'Old Amulet', desc:'Lost in the hidden grove long ago.', type:'treasure', rarity:2, stack:1, price:120, icon:{bg:'#33691e',fg:'#ffeb3b',shape:'ring'} },
trea_ruby: { id:'trea_ruby', name:'Ruby', desc:'A blood-red gem.', type:'treasure', rarity:3, stack:99, price:150, icon:{bg:'#b71c1c',fg:'#ef9a9a',shape:'gem'} },
trea_sapphire: { id:'trea_sapphire', name:'Sapphire', desc:'Deep as the mountain sky.', type:'treasure', rarity:3, stack:99, price:150, icon:{bg:'#0d47a1',fg:'#90caf9',shape:'gem'} },
trea_emerald: { id:'trea_emerald', name:'Emerald', desc:'Green as the deep forest.', type:'treasure', rarity:3, stack:99, price:150, icon:{bg:'#1b5e20',fg:'#a5d6a7',shape:'gem'} },
trea_diamond: { id:'trea_diamond', name:'Diamond', desc:'Flawless and blinding.', type:'treasure', rarity:4, stack:99, price:400, icon:{bg:'#eceff1',fg:'#ffffff',shape:'gem'} },
trea_golden_idol: { id:'trea_golden_idol', name:'Golden Idol', desc:'An idol from the old temple.', type:'treasure', rarity:4, stack:1, price:800, icon:{bg:'#f9a825',fg:'#fff176',shape:'misc'} },
trea_silver_chalice: { id:'trea_silver_chalice', name:'Silver Chalice', desc:'Once drank from by kings.', type:'treasure', rarity:3, stack:1, price:350, icon:{bg:'#78909c',fg:'#eceff1',shape:'misc'} },
trea_pearl: { id:'trea_pearl', name:'River Pearl', desc:'Smooth and lustrous.', type:'treasure', rarity:2, stack:99, price:90, icon:{bg:'#f5f5f5',fg:'#e1bee7',shape:'gem'} },
trea_crown_jewel: { id:'trea_crown_jewel', name:'Crown Jewel of the Pixel Kingdom', desc:'The heart of the true crown. Return it to Elder Maren.', type:'treasure', rarity:5, stack:1, price:5000, icon:{bg:'#4a148c',fg:'#ffeb3b',shape:'gem'} },

/* ===== AMMO (2) ===== */
ammo_arrow: { id:'ammo_arrow', name:'Arrow', desc:'Standard arrow. Bows need these.', type:'ammo', rarity:0, stack:999, price:1, ammoType:'arrow', icon:{bg:'#5a3d2b',fg:'#d7ccc8',shape:'misc'} },
ammo_fire_arrow: { id:'ammo_fire_arrow', name:'Fire Arrow', desc:'Ignites on impact, burning the target.', type:'ammo', rarity:2, stack:999, price:5, ammoType:'arrow', effect:{burn:4}, icon:{bg:'#bf360c',fg:'#ffab91',shape:'misc'} }

};

/* ---------------- 4) ENEMIES ----------------
   spd tiles/sec, aggro tiles, attackRange tiles, attackCd sec.
   Balanced for player levels 1-20.                       */
var ENEMIES = {

/* --- Early game: forest / plains (player lv 1-5) --- */
slime: { id:'slime', name:'Slime', hp:24, atk:5, def:0, spd:1.4, xp:12, aggro:5, attackRange:1.1, attackCd:1.4, scale:1,
  loot:[{id:'mat_slime_gel',chance:0.9,min:1,max:2},{id:'food_berries',chance:0.2,min:1,max:2}], gold:[2,6], regions:['forest','plains'] },
slime_big: { id:'slime_big', name:'Big Slime', hp:60, atk:9, def:1, spd:1.2, xp:28, aggro:6, attackRange:1.3, attackCd:1.6, scale:1.6,
  loot:[{id:'mat_slime_gel',chance:1,min:2,max:4},{id:'pot_minor_heal',chance:0.15,min:1,max:1}], gold:[6,14], regions:['forest'] },
wolf: { id:'wolf', name:'Wolf', hp:45, atk:10, def:1, spd:2.8, xp:24, aggro:7, attackRange:1.2, attackCd:1.2, scale:1,
  loot:[{id:'mat_wolf_pelt',chance:0.7,min:1,max:1},{id:'mat_wolf_fang',chance:0.4,min:1,max:2},{id:'food_raw_meat',chance:0.6,min:1,max:2}], gold:[4,10], regions:['forest','plains'] },
bat: { id:'bat', name:'Cave Bat', hp:30, atk:8, def:0, spd:2.6, xp:18, aggro:6, attackRange:1.1, attackCd:1.0, scale:0.9,
  loot:[{id:'mat_leather',chance:0.4,min:1,max:1},{id:'food_berries',chance:0.2,min:1,max:1}], gold:[3,8], regions:['caves'] },
cave_crawler: { id:'cave_crawler', name:'Cave Crawler', hp:55, atk:11, def:2, spd:2.0, xp:30, aggro:6, attackRange:1.2, attackCd:1.3, scale:1,
  loot:[{id:'mat_bone',chance:0.5,min:1,max:2},{id:'mat_coal',chance:0.4,min:1,max:2}], gold:[5,12], regions:['caves'] },
bandit: { id:'bandit', name:'Bandit', hp:55, atk:12, def:2, spd:2.2, xp:32, aggro:8, attackRange:1.2, attackCd:1.3, scale:1,
  loot:[{id:'food_bread',chance:0.4,min:1,max:2},{id:'trea_ancient_coin',chance:0.15,min:1,max:1},{id:'pot_minor_heal',chance:0.2,min:1,max:1}], gold:[10,25], regions:['plains','village'] },
spider: { id:'spider', name:'Ruins Spider', hp:65, atk:13, def:2, spd:2.4, xp:36, aggro:7, attackRange:1.2, attackCd:1.2, scale:1,
  loot:[{id:'mat_spider_silk',chance:0.7,min:1,max:2},{id:'mat_bone',chance:0.3,min:1,max:1}], gold:[6,14], regions:['ruins'] },

/* --- Mid game: caves / ruins (player lv 6-12) --- */
goblin: { id:'goblin', name:'Goblin', hp:85, atk:15, def:3, spd:2.2, xp:48, aggro:8, attackRange:1.2, attackCd:1.3, scale:1,
  loot:[{id:'mat_goblin_ear',chance:0.8,min:1,max:2},{id:'mat_iron_ore',chance:0.3,min:1,max:2},{id:'pot_minor_heal',chance:0.2,min:1,max:1}], gold:[8,20], regions:['caves'] },
goblin_archer: { id:'goblin_archer', name:'Goblin Archer', hp:70, atk:14, def:2, spd:2.0, xp:52, aggro:9, attackRange:6.5, attackCd:2.0, ranged:true, projSpeed:7, scale:1,
  loot:[{id:'mat_goblin_ear',chance:0.8,min:1,max:1},{id:'ammo_arrow',chance:0.5,min:4,max:8}], gold:[8,20], regions:['caves'] },
skeleton: { id:'skeleton', name:'Skeleton', hp:110, atk:18, def:4, spd:2.0, xp:62, aggro:8, attackRange:1.3, attackCd:1.4, scale:1,
  loot:[{id:'mat_bone',chance:0.9,min:1,max:3},{id:'trea_ancient_coin',chance:0.25,min:1,max:2}], gold:[10,24], regions:['ruins'] },
skeleton_archer: { id:'skeleton_archer', name:'Skeleton Archer', hp:90, atk:17, def:3, spd:1.9, xp:66, aggro:9, attackRange:7, attackCd:2.1, ranged:true, projSpeed:7.5, scale:1,
  loot:[{id:'mat_bone',chance:0.9,min:1,max:2},{id:'ammo_arrow',chance:0.5,min:4,max:8},{id:'pot_minor_mana',chance:0.2,min:1,max:1}], gold:[10,24], regions:['ruins'] },
bandit_brute: { id:'bandit_brute', name:'Bandit Brute', hp:140, atk:22, def:5, spd:1.9, xp:80, aggro:8, attackRange:1.4, attackCd:1.6, scale:1.25,
  loot:[{id:'food_cooked_meat',chance:0.4,min:1,max:2},{id:'trea_ancient_coin',chance:0.3,min:1,max:2},{id:'pot_major_heal',chance:0.15,min:1,max:1}], gold:[20,45], regions:['plains'] },
moss_troll: { id:'moss_troll', name:'Moss Troll', hp:180, atk:24, def:6, spd:1.6, xp:95, aggro:7, attackRange:1.5, attackCd:1.8, scale:1.5,
  loot:[{id:'mat_ancient_bark',chance:0.8,min:1,max:2},{id:'mat_ironwood',chance:0.6,min:1,max:2},{id:'food_honey',chance:0.4,min:1,max:2}], gold:[15,35], regions:['forest'] },

/* --- Late game: ruins / peaks (player lv 13-20) --- */
undead_knight: { id:'undead_knight', name:'Undead Knight', hp:260, atk:32, def:10, spd:2.1, xp:150, aggro:9, attackRange:1.4, attackCd:1.5, scale:1.15,
  loot:[{id:'mat_bone',chance:0.8,min:2,max:4},{id:'trea_sapphire',chance:0.2,min:1,max:1},{id:'mat_iron_ingot',chance:0.4,min:1,max:2}], gold:[30,70], regions:['ruins','peaks'] },
stone_golem: { id:'stone_golem', name:'Stone Golem', hp:340, atk:38, def:14, spd:1.3, xp:190, aggro:7, attackRange:1.6, attackCd:2.0, scale:1.7,
  loot:[{id:'mat_stone',chance:1,min:3,max:6},{id:'mat_iron_ore',chance:0.6,min:2,max:4},{id:'mat_crystal_shard',chance:0.4,min:1,max:2}], gold:[25,60], regions:['peaks'] },
ice_wraith: { id:'ice_wraith', name:'Ice Wraith', hp:220, atk:36, def:6, spd:2.6, xp:175, aggro:9, attackRange:5.5, attackCd:2.2, ranged:true, projSpeed:6, scale:1.1,
  loot:[{id:'mat_frost_shard',chance:0.7,min:1,max:2},{id:'pot_minor_mana',chance:0.4,min:1,max:2},{id:'trea_sapphire',chance:0.25,min:1,max:1}], gold:[30,65], regions:['peaks'] },

/* --- Bosses --- */
boss_slime_king: { id:'boss_slime_king', name:'Slime King', hp:600, atk:26, def:6, spd:1.5, xp:400, aggro:12, attackRange:1.8, attackCd:1.8, boss:true, scale:2.6,
  phases:[ {at:0.5, desc:'The Slime King splits! Minions ooze forth.', summons:['slime','slime','slime_big']}, {at:0.25, desc:'The Slime King crouches... JUMP SLAM incoming!', telegraph:'jump_slam'} ],
  loot:[{id:'trea_crown_jewel',chance:1,min:1,max:1},{id:'mat_dragon_scale',chance:0.5,min:1,max:1},{id:'mat_slime_gel',chance:1,min:5,max:10}], gold:[200,400], regions:['forest'] },
boss_goblin_warlord: { id:'boss_goblin_warlord', name:'Goblin Warlord', hp:1200, atk:40, def:10, spd:2.0, xp:700, aggro:14, attackRange:1.5, attackCd:1.6, boss:true, scale:1.6,
  phases:[ {at:0.66, desc:'The Warlord howls! Goblin archers rush to his side.', summons:['goblin_archer','goblin_archer']}, {at:0.33, desc:'The Warlord ENRAGES! Attack speed surges.', enrage:{atkMul:1.4, spdMul:1.25}} ],
  loot:[{id:'wpn_ember_blade',chance:1,min:1,max:1},{id:'trea_golden_idol',chance:0.6,min:1,max:1},{id:'mat_gold_ingot',chance:1,min:2,max:4}], gold:[400,700], regions:['caves'] },
boss_skeleton_lord: { id:'boss_skeleton_lord', name:'Skeleton Lord', hp:2000, atk:52, def:14, spd:1.9, xp:1100, aggro:14, attackRange:1.6, attackCd:1.7, boss:true, scale:1.8,
  phases:[ {at:0.66, desc:'The Skeleton Lord raises a wall of bone!', telegraph:'bone_wall', summons:['skeleton','skeleton']}, {at:0.33, desc:'The Skeleton Lord spins into a whirling storm of blades!', telegraph:'spin_attack', enrage:{atkMul:1.25}} ],
  loot:[{id:'arm_crown_plate',chance:1,min:1,max:1},{id:'trea_diamond',chance:0.7,min:1,max:2},{id:'mat_bone',chance:1,min:5,max:10}], gold:[600,1000], regions:['ruins'] }
};

/* ---------------- 5) RECIPES ---------------- */
var RECIPES = [
/* --- hand --- */
{id:'r_torch', name:'Torch', station:'hand', inputs:{mat_wood:2, mat_coal:1}, output:{id:'tool_torch', qty:4}},
{id:'r_bandage', name:'Bandage', station:'hand', inputs:{mat_fiber:3}, output:{id:'pot_bandage', qty:2}},
/* --- workbench --- */
{id:'r_wooden_sword', name:'Wooden Sword', station:'workbench', inputs:{mat_wood:5}, output:{id:'wpn_wooden_sword', qty:1}},
{id:'r_wooden_bow', name:'Wooden Bow', station:'workbench', inputs:{mat_wood:6, mat_fiber:2}, output:{id:'wpn_wooden_bow', qty:1}},
{id:'r_stone_club', name:'Stone Club', station:'workbench', inputs:{mat_wood:3, mat_stone:4}, output:{id:'wpn_stone_club', qty:1}},
{id:'r_stone_axe', name:'Stone Axe', station:'workbench', inputs:{mat_wood:3, mat_stone:3}, output:{id:'tool_stone_axe', qty:1}},
{id:'r_stone_pick', name:'Stone Pickaxe', station:'workbench', inputs:{mat_wood:3, mat_stone:3}, output:{id:'tool_stone_pick', qty:1}},
{id:'r_wooden_shield', name:'Wooden Shield', station:'workbench', inputs:{mat_wood:6}, output:{id:'arm_wooden_shield', qty:1}},
{id:'r_arrows', name:'Arrows x12', station:'workbench', inputs:{mat_wood:2, mat_stone:1}, output:{id:'ammo_arrow', qty:12}},
{id:'r_fire_arrows', name:'Fire Arrows x8', station:'workbench', level:8, inputs:{ammo_arrow:8, mat_coal:2, mat_ember_shard:1}, output:{id:'ammo_fire_arrow', qty:8}},
{id:'r_copper_dagger', name:'Copper Dagger', station:'workbench', inputs:{mat_copper_ingot:2, mat_wood:1}, output:{id:'wpn_copper_dagger', qty:1}},
{id:'r_copper_sword', name:'Copper Sword', station:'workbench', inputs:{mat_copper_ingot:4, mat_wood:2}, output:{id:'wpn_copper_sword', qty:1}},
{id:'r_copper_axe', name:'Copper Axe', station:'workbench', inputs:{mat_copper_ingot:3, mat_wood:2}, output:{id:'wpn_copper_axe', qty:1}},
{id:'r_leather_cap', name:'Leather Cap', station:'workbench', inputs:{mat_leather:3}, output:{id:'arm_leather_cap', qty:1}},
{id:'r_leather_tunic', name:'Leather Tunic', station:'workbench', inputs:{mat_leather:5}, output:{id:'arm_leather_tunic', qty:1}},
{id:'r_leather_boots', name:'Leather Boots', station:'workbench', inputs:{mat_leather:4}, output:{id:'arm_leather_boots', qty:1}},
{id:'r_iron_sword', name:'Iron Sword', station:'workbench', level:5, inputs:{mat_iron_ingot:5, mat_wood:2}, output:{id:'wpn_iron_sword', qty:1}},
{id:'r_iron_bow', name:'Iron Bow', station:'workbench', level:6, inputs:{mat_wood:5, mat_iron_ingot:2, mat_fiber:2}, output:{id:'wpn_iron_bow', qty:1}},
{id:'r_iron_shield', name:'Iron Shield', station:'workbench', level:5, inputs:{mat_iron_ingot:4, mat_wood:2}, output:{id:'arm_iron_shield', qty:1}},
{id:'r_fishing_rod', name:'Fishing Rod', station:'workbench', inputs:{mat_wood:4, mat_fiber:3}, output:{id:'tool_fishing_rod', qty:1}},
/* --- furnace --- */
{id:'r_copper_ingot', name:'Smelt Copper Ingot', station:'furnace', inputs:{mat_copper_ore:2, mat_coal:1}, output:{id:'mat_copper_ingot', qty:1}},
{id:'r_iron_ingot', name:'Smelt Iron Ingot', station:'furnace', inputs:{mat_iron_ore:2, mat_coal:1}, output:{id:'mat_iron_ingot', qty:1}},
{id:'r_gold_ingot', name:'Smelt Gold Ingot', station:'furnace', level:6, inputs:{mat_gold_ore:2, mat_coal:1}, output:{id:'mat_gold_ingot', qty:1}},
{id:'r_steel_ingot', name:'Forge Steel Ingot', station:'furnace', level:8, inputs:{mat_iron_ingot:2, mat_coal:2}, output:{id:'mat_steel_ingot', qty:1}},
{id:'r_mithril_ingot', name:'Forge Mithril Ingot', station:'furnace', level:12, inputs:{mat_mithril_ore:2, mat_coal:2}, output:{id:'mat_mithril_ingot', qty:1}},
{id:'r_charcoal', name:'Charcoal', station:'furnace', inputs:{mat_wood:4}, output:{id:'mat_coal', qty:2}},
/* --- anvil --- */
{id:'r_steel_sword', name:'Steel Sword', station:'anvil', level:9, inputs:{mat_steel_ingot:5, mat_wood:2}, output:{id:'wpn_steel_sword', qty:1}},
{id:'r_steel_axe', name:'Steel War Axe', station:'anvil', level:9, inputs:{mat_steel_ingot:4, mat_wood:2}, output:{id:'wpn_steel_axe', qty:1}},
{id:'r_steel_bow', name:'Steel Longbow', station:'anvil', level:10, inputs:{mat_steel_ingot:3, mat_wood:4, mat_spider_silk:2}, output:{id:'wpn_steel_bow', qty:1}},
{id:'r_steel_helm', name:'Steel Helm', station:'anvil', level:9, inputs:{mat_steel_ingot:4}, output:{id:'arm_steel_helm', qty:1}},
{id:'r_steel_plate', name:'Steel Plate', station:'anvil', level:10, inputs:{mat_steel_ingot:6}, output:{id:'arm_steel_plate', qty:1}},
{id:'r_mithril_sword', name:'Mithril Sword', station:'anvil', level:13, inputs:{mat_mithril_ingot:5, mat_wood:2}, output:{id:'wpn_mithril_sword', qty:1}},
{id:'r_mithril_plate', name:'Mithril Plate', station:'anvil', level:14, inputs:{mat_mithril_ingot:6}, output:{id:'arm_mithril_plate', qty:1}},
{id:'r_mithril_helm', name:'Mithril Helm', station:'anvil', level:13, inputs:{mat_mithril_ingot:4}, output:{id:'arm_mithril_helm', qty:1}},
/* --- campfire --- */
{id:'r_cooked_meat', name:'Cooked Meat', station:'campfire', inputs:{food_raw_meat:1}, output:{id:'food_cooked_meat', qty:1}},
{id:'r_roast_fish', name:'Roast Fish', station:'campfire', inputs:{food_fish:1}, output:{id:'food_roast_fish', qty:1}},
{id:'r_grilled_berries', name:'Grilled Berries', station:'campfire', inputs:{food_berries:5}, output:{id:'food_grilled_berries', qty:1}},
{id:'r_mushroom_soup', name:'Mushroom Soup', station:'campfire', inputs:{mat_mushroom:3, food_berries:2}, output:{id:'food_mushroom_soup', qty:1}},
{id:'r_stew', name:'Hearty Stew', station:'campfire', level:4, inputs:{food_raw_meat:2, mat_herb:2}, output:{id:'food_stew', qty:1}},
{id:'r_minor_heal', name:'Brew Minor Health Potion', station:'campfire', level:3, inputs:{mat_herb:3, mat_slime_gel:1}, output:{id:'pot_minor_heal', qty:1}},
{id:'r_minor_mana', name:'Brew Minor Mana Potion', station:'campfire', level:4, inputs:{mat_herb:2, mat_crystal_shard:1}, output:{id:'pot_minor_mana', qty:1}},
{id:'r_antidote', name:'Brew Antidote', station:'campfire', level:3, inputs:{mat_herb:2, mat_mushroom:1}, output:{id:'pot_antidote', qty:1}}
];

/* ---------------- 6) QUESTS ----------------
   World anchors: village (80,100), forest (35,80), ruins (85,135),
   caves entrance (125,85), peaks (80,25), hidden grove (28,60),
   peaks shrine (80,18).                                    */
var QUESTS = [
/* ===== MAIN QUEST CHAIN (q1..q9) ===== */
{ id:'q1', name:'Ashes of the Kingdom', type:'main', giver:'elder_maren',
  desc:'The Pixel Kingdom has fallen to monsters and ruin. Speak with Elder Maren in the village to begin the restoration.',
  objectives:[{kind:'talk', target:'elder_maren', count:1}],
  rewards:{xp:40, gold:20, items:['food_bread','food_bread','pot_minor_heal']},
  next:'q2', intro:'Long ago the Pixel Kingdom shone like a gem... then the shadows came.' },
{ id:'q2', name:'First Blood', type:'main', giver:'elder_maren',
  desc:'Prove you can defend the village. Defeat 5 slimes in the forest or plains.',
  objectives:[{kind:'kill', target:'slime', count:5}],
  rewards:{xp:80, gold:40, items:['wpn_copper_sword']},
  next:'q3' },
{ id:'q3', name:'Tools of the Trade', type:'main', giver:'blacksmith_borin',
  desc:'Borin needs raw materials to forge real gear. Gather 8 wood and 5 stone.',
  objectives:[{kind:'gather', target:'mat_wood', count:8},{kind:'gather', target:'mat_stone', count:5}],
  rewards:{xp:90, gold:30, items:['tool_stone_axe','tool_stone_pick']},
  next:'q4' },
{ id:'q4', name:'Trouble in Ember Caves', type:'main', giver:'guard_captain',
  desc:'Goblins pour from the Ember Caves east of the village. Slay 8 goblins in the caves.',
  objectives:[{kind:'kill', target:'goblin', count:8}],
  rewards:{xp:160, gold:80, items:['pot_major_heal','arm_iron_shield']},
  next:'q5' },
{ id:'q5', name:'The Goblin Warlord', type:'main', giver:'guard_captain',
  desc:'The Goblin Warlord commands the caves from his arena. End him.',
  objectives:[{kind:'kill', target:'boss_goblin_warlord', count:1}],
  rewards:{xp:350, gold:200, items:['wpn_ember_blade','trea_ruby']},
  next:'q6' },
{ id:'q6', name:'Whispers in the Ruins', type:'main', giver:'elder_maren',
  desc:'Ancient ruins south of the village stir with undead. Scout the ruins (85,135) and destroy 10 skeletons.',
  objectives:[{kind:'reach', target:'ruins', count:1, x:85, y:135, r:8},{kind:'kill', target:'skeleton', count:10}],
  rewards:{xp:300, gold:150, items:['arm_steel_helm','pot_major_mana']},
  next:'q7' },
{ id:'q7', name:'The Skeleton Lord', type:'main', giver:'elder_maren',
  desc:'The Skeleton Lord rules the ruins from his bone arena. Destroy him and claim the Crownplate.',
  objectives:[{kind:'kill', target:'boss_skeleton_lord', count:1}],
  rewards:{xp:500, gold:350, items:['arm_crown_plate','trea_diamond']},
  next:'q8' },
{ id:'q8', name:'The Slime King', type:'main', giver:'elder_maren',
  desc:'A monstrous Slime King has claimed the deep forest clearing. Slay it and recover the Crown Jewel.',
  objectives:[{kind:'kill', target:'boss_slime_king', count:1}],
  rewards:{xp:450, gold:300, items:['quest_crown_fragment','trea_emerald']},
  next:'q9' },
{ id:'q9', name:'Crown of the Pixel Kingdom', type:'main', giver:'elder_maren',
  desc:'Return the Crown Jewel of the Pixel Kingdom to Elder Maren and restore the kingdom.',
  objectives:[{kind:'deliver', target:'trea_crown_jewel', count:1}],
  rewards:{xp:600, gold:500, items:['wpn_kingsbane']},
  next:null, intro:'The crown is whole. The kingdom breathes again.' },

/* ===== SIDE QUESTS (8) ===== */
{ id:'sq_wolf_pelts', name:'Wolf Pelts', type:'side', giver:'guard_captain',
  desc:'Wolves threaten travelers on the roads. Cull 6 wolves.',
  objectives:[{kind:'kill', target:'wolf', count:6}],
  rewards:{xp:120, gold:90, items:['arm_leather_tunic']},
  next:null },
{ id:'sq_berry_delivery', name:'Berry Delivery', type:'side', giver:'herbalist_yara',
  desc:'Yara needs 10 wild berries for her remedies. Deliver them to her.',
  objectives:[{kind:'deliver', target:'food_berries', count:10}],
  rewards:{xp:80, gold:40, items:['pot_minor_heal','pot_minor_heal','pot_antidote']},
  next:null },
{ id:'sq_lost_amulet', name:'The Lost Amulet', type:'side', giver:'villager',
  desc:'A villager lost a precious amulet in the hidden grove (28,60). Find the grove and recover it.',
  objectives:[{kind:'reach', target:'hidden_grove', count:1, x:28, y:60, r:6},{kind:'gather', target:'trea_old_amulet', count:1}],
  rewards:{xp:110, gold:70, items:['arm_lucky_charm']},
  next:null },
{ id:'sq_iron_forge', name:'Iron for the Forge', type:'side', giver:'blacksmith_borin',
  desc:'Borin\'s forge is running dry. Deliver 12 iron ingots.',
  objectives:[{kind:'deliver', target:'mat_iron_ingot', count:12}],
  rewards:{xp:180, gold:120, items:['wpn_iron_sword','tool_iron_pick']},
  next:null },
{ id:'sq_bandit_bounty', name:'Bandit Bounty', type:'side', giver:'guard_captain',
  desc:'Bandits rob merchants on the plains roads. Bring justice to 6 bandits.',
  objectives:[{kind:'kill', target:'bandit', count:6}],
  rewards:{xp:150, gold:140, items:['trea_ancient_coin','trea_ancient_coin']},
  next:null },
{ id:'sq_potion_brewing', name:'Potion Brewing', type:'side', giver:'herbalist_yara',
  desc:'Learn the healer\'s art: craft 3 minor health potions at a campfire.',
  objectives:[{kind:'craft', target:'pot_minor_heal', count:3}],
  rewards:{xp:100, gold:50, items:['pot_major_heal','mat_herb','mat_herb','mat_herb']},
  next:null },
{ id:'sq_ancient_coins', name:'Ancient Coins', type:'side', giver:'merchant_lila',
  desc:'Lila collects coins of the fallen kingdom. Gather 5 ancient coins for her.',
  objectives:[{kind:'gather', target:'trea_ancient_coin', count:5}],
  rewards:{xp:130, gold:160, items:['arm_ring_swift']},
  next:null },
{ id:'sq_hermit_staff', name:'The Hermit\'s Staff', type:'side', giver:'villager',
  desc:'A hermit vanished at the peaks shrine (80,18). Climb the peaks and reach the shrine to learn his fate.',
  objectives:[{kind:'reach', target:'peaks_shrine', count:1, x:80, y:18, r:6}],
  rewards:{xp:220, gold:100, items:['wpn_oak_staff','arm_amulet_mage']},
  next:null }
];

/* ---------------- 7) DIALOGS ---------------- */
var DIALOGS = {
elder_maren: { name:'Elder Maren', role:'Village Elder',
  lines:[
    'Welcome, traveler. Our kingdom lies in ashes, but embers still burn.',
    'Monsters infest the forest, goblins plague the eastern caves, and the dead walk the southern ruins.',
    'You have the look of someone who could change that. Will you help us restore the Pixel Kingdom?',
    'Start small: the slimes in the forest are bold enough to threaten our farms.',
    'Bring me the Crown Jewel when the bosses fall, and we shall crown a new dawn.'
  ],
  hint:'Quest giver for the main story. Talk to her to advance the kingdom\'s restoration.' },
blacksmith_borin: { name:'Blacksmith Borin', role:'Blacksmith', shop:'forge',
  lines:[
    'Hah! A customer with all their limbs! What can Borin forge for you?',
    'Bring me ore and ingots and I\'ll hammer them into something that bites back.',
    'My forge hammer went missing in the Ember Caves... goblins, probably. Keep an eye out.',
    'Steel beats iron, iron beats copper. Remember that when something big is chewing on you.',
    'Take a look at my wares — every blade is guaranteed goblin-tested!'
  ],
  hint:'Sells weapons and armor. Buy gear or gather materials for him.' },
merchant_lila: { name:'Merchant Lila', role:'Traveling Merchant', shop:'general',
  lines:[
    'Welcome, welcome! Finest goods this side of the ruins, I swear it!',
    'I buy anything shiny and sell everything useful. That\'s the merchant\'s creed.',
    'Ancient coins of the old kingdom? I pay top coin for those, no questions asked.',
    'Word of advice, dear: never sell your last health potion. You\'ll regret it.',
    'Browse my stock — it changes whenever I restock from the caravans!'
  ],
  hint:'General store. Buys loot and sells consumables, materials, and oddities.' },
guard_captain: { name:'Captain Rook', role:'Guard Captain',
  lines:[
    'Halt! ...Oh, you\'re the one Maren sent. At ease.',
    'My guards are stretched thin. Goblins in the east, bandits on the roads, wolves everywhere.',
    'If you can fight, I have bounties. Wolves, bandits, goblins — name your prey.',
    'The Goblin Warlord himself nests deep in the Ember Caves. That one\'s personal.',
    'Stay sharp out there. The kingdom\'s counting on blades like yours.'
  ],
  hint:'Offers combat bounties. Report back after clearing his contracts.' },
herbalist_yara: { name:'Herbalist Yara', role:'Herbalist', shop:'herbalist',
  lines:[
    'Shhh... the herbs can hear you. Welcome to my garden, traveler.',
    'Berries, mushrooms, healing leaves — the wilds provide, if you know where to look.',
    'I can teach you to brew potions at a campfire. Slime gel makes a fine base, oddly enough.',
    'Feeling poorly? My antidotes cure what the caves inflict.',
    'Take some remedies with you. The ruins are unkind to the unprepared.'
  ],
  hint:'Sells potions, herbs, and remedies. Teaches brewing.' },
villager: { name:'Villager', role:'Villager',
  lines:[
    'They say the old kingdom\'s crown is shattered across the land...',
    'My cousin swears he saw a hermit climbing the peaks last winter. Never came back down.',
    'If you\'re heading into the forest, watch for the big slimes. Nasty things.',
    'Borin\'s prices are fair, but Lila will haggle if you smile.',
    'Stay safe out there. We\'ve lost enough good people already.'
  ],
  hint:'A friendly local. Villagers sometimes know rumors worth following.' }
};

/* ---------------- 8) SKILLS ----------------
   1 skill point per level. Actives max 1, passives max 5. */
var SKILLS = {
warrior: [
  {id:'w_power_strike', name:'Power Strike', desc:'A devastating overhead blow dealing 2.2x damage.', max:1, req:null, kind:'active', icon:'sword', effect:{dmgMult:2.2, mana:12, cd:8}},
  {id:'w_whirlwind', name:'Whirlwind', desc:'Spin and strike all enemies within 2.5 tiles.', max:1, req:'w_power_strike', kind:'active', icon:'axe', effect:{dmgMult:1.5, aoe:2.5, mana:20, cd:14}},
  {id:'w_shield_wall', name:'Shield Wall', desc:'Raise your guard: +60% defense for 6s.', max:1, req:'w_whirlwind', kind:'active', icon:'shield', effect:{shield:0.6, duration:6, mana:25, cd:25}},
  {id:'w_brawler', name:'Brawler', desc:'+2 attack per rank.', max:5, req:null, kind:'passive', icon:'sword', effect:{stat:'atk', per:2}},
  {id:'w_iron_skin', name:'Iron Skin', desc:'+3 defense per rank.', max:5, req:'w_brawler', kind:'passive', icon:'shield', effect:{stat:'def', per:3}},
  {id:'w_vitality', name:'Vitality', desc:'+15 max HP per rank.', max:5, req:'w_iron_skin', kind:'passive', icon:'misc', effect:{stat:'hp', per:15}},
  {id:'w_bloodlust', name:'Bloodlust', desc:'Heal 2% of damage dealt per rank.', max:5, req:'w_vitality', kind:'passive', icon:'meat', effect:{stat:'lifesteal', per:0.02}},
  {id:'w_swiftness', name:'Swift Foot', desc:'+4% move speed per rank.', max:5, req:'w_brawler', kind:'passive', icon:'boots', effect:{stat:'spd', per:0.04}}
],
ranger: [
  {id:'r_multishot', name:'Multishot', desc:'Fire 3 arrows in a spread.', max:1, req:null, kind:'active', icon:'bow', effect:{dmgMult:1.0, arrows:3, mana:15, cd:10}},
  {id:'r_dash', name:'Dash', desc:'Quickly dash forward 4 tiles, evading harm.', max:1, req:'r_multishot', kind:'active', icon:'boots', effect:{dash:4, mana:10, cd:6}},
  {id:'r_poison_arrow', name:'Poison Arrows', desc:'Toggle: arrows poison enemies for 5s.', max:1, req:'r_dash', kind:'active', icon:'bow', effect:{poison:5, mana:30, cd:20}},
  {id:'r_sharpshooter', name:'Sharpshooter', desc:'+3% crit chance per rank.', max:5, req:null, kind:'passive', icon:'bow', effect:{stat:'crit', per:3}},
  {id:'r_longstrider', name:'Longstrider', desc:'+5% move speed per rank.', max:5, req:'r_sharpshooter', kind:'passive', icon:'boots', effect:{stat:'spd', per:0.05}},
  {id:'r_steady_aim', name:'Steady Aim', desc:'+2 attack per rank.', max:5, req:'r_longstrider', kind:'passive', icon:'bow', effect:{stat:'atk', per:2}},
  {id:'r_tough_hide', name:'Tough Hide', desc:'+10 max HP per rank.', max:5, req:'r_steady_aim', kind:'passive', icon:'chest', effect:{stat:'hp', per:10}},
  {id:'r_mana_flow', name:'Mana Flow', desc:'+8 max MP per rank.', max:5, req:'r_sharpshooter', kind:'passive', icon:'potion', effect:{stat:'mp', per:8}}
],
mage: [
  {id:'m_fireball', name:'Fireball', desc:'Hurl a blazing orb dealing 3x damage and burning the target.', max:1, req:null, kind:'active', icon:'staff', effect:{dmgMult:3.0, burn:4, mana:18, cd:6}},
  {id:'m_frost_nova', name:'Frost Nova', desc:'Freeze and slow all enemies within 3 tiles.', max:1, req:'m_fireball', kind:'active', icon:'staff', effect:{dmgMult:1.2, aoe:3, slow:5, mana:22, cd:16}},
  {id:'m_blink', name:'Blink', desc:'Teleport 5 tiles in your facing direction.', max:1, req:'m_frost_nova', kind:'active', icon:'staff', effect:{teleport:5, mana:20, cd:12}},
  {id:'m_arcane_power', name:'Arcane Power', desc:'+3 attack per rank.', max:5, req:null, kind:'passive', icon:'staff', effect:{stat:'atk', per:3}},
  {id:'m_mana_pool', name:'Mana Pool', desc:'+12 max MP per rank.', max:5, req:'m_arcane_power', kind:'passive', icon:'potion', effect:{stat:'mp', per:12}},
  {id:'m_spell_crit', name:'Spell Crit', desc:'+2% crit chance per rank.', max:5, req:'m_mana_pool', kind:'passive', icon:'staff', effect:{stat:'crit', per:2}},
  {id:'m_iron_will', name:'Iron Will', desc:'+2 defense per rank.', max:5, req:'m_arcane_power', kind:'passive', icon:'shield', effect:{stat:'def', per:2}},
  {id:'m_vitality', name:'Vitality', desc:'+10 max HP per rank.', max:5, req:'m_iron_will', kind:'passive', icon:'misc', effect:{stat:'hp', per:10}}
]
};

/* ---------------- 9) ACHIEVEMENTS ---------------- */
var ACHIEVEMENTS = [
{id:'first_blood', name:'First Blood', desc:'Defeat your first enemy.', xp:20},
{id:'treasure_hunter', name:'Treasure Hunter', desc:'Open 10 treasure chests.', xp:60},
{id:'dungeon_delver', name:'Dungeon Delver', desc:'Enter the Ember Caves.', xp:40},
{id:'boss_slayer_1', name:'Warlord Slayer', desc:'Defeat the Goblin Warlord.', xp:150},
{id:'boss_slayer_2', name:'Lord Slayer', desc:'Defeat the Skeleton Lord.', xp:200},
{id:'boss_slayer_3', name:'King Slayer', desc:'Defeat the Slime King.', xp:250},
{id:'master_crafter', name:'Master Crafter', desc:'Craft 25 items.', xp:100},
{id:'gatherer', name:'Gatherer', desc:'Gather 100 resources.', xp:80},
{id:'rich', name:'Rich', desc:'Hold 1000 gold at once.', xp:80},
{id:'explorer', name:'Explorer', desc:'Visit all 6 regions of the kingdom.', xp:120},
{id:'quest_complete_5', name:'Reliable Hand', desc:'Complete 5 quests.', xp:90},
{id:'level_10', name:'Rising Hero', desc:'Reach level 10.', xp:100},
{id:'level_20', name:'Living Legend', desc:'Reach level 20.', xp:250},
{id:'kingdom_savior', name:'Kingdom Savior', desc:'Restore the Crown of the Pixel Kingdom.', xp:500},
{id:'marathon', name:'Marathon', desc:'Walk 5000 tiles across the kingdom.', xp:90}
];

/* ---------------- 10) REGIONS ---------------- */
var REGIONS = [
{id:'plains', name:'Greenfield Plains', desc:'Rolling grasslands dotted with farms and bandit camps.'},
{id:'village', name:'Emberhold Village', desc:'The last safe settlement. Home to merchants, the forge, and Elder Maren.'},
{id:'forest', name:'Whisperwood Forest', desc:'Ancient woods crawling with slimes, wolves, and the Slime King\'s brood.'},
{id:'ruins', name:'Sunken Ruins', desc:'Shattered halls of the old kingdom, now haunted by the undead.'},
{id:'caves', name:'Ember Caves', desc:'Torch-lit tunnels rich with ore — and goblins.'},
{id:'peaks', name:'Frostpeak Mountains', desc:'Snowy heights where golems and wraiths guard mithril veins.'}
];

/* ---------------- 11) STARTER QUEST ---------------- */
var STARTER_QUEST = 'q1';

/* ---------------- Export ---------------- */
PK.Data = {
  RARITY: RARITY,
  RARITY_COLOR: RARITY_COLOR,
  CLASSES: CLASSES,
  ITEMS: ITEMS,
  ENEMIES: ENEMIES,
  RECIPES: RECIPES,
  QUESTS: QUESTS,
  DIALOGS: DIALOGS,
  SKILLS: SKILLS,
  ACHIEVEMENTS: ACHIEVEMENTS,
  REGIONS: REGIONS,
  STARTER_QUEST: STARTER_QUEST
};

})();
