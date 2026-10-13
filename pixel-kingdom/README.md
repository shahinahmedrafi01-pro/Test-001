# ⚔️ PIXEL KINGDOM

A full-scale **2D pixel-art RPG, survival & adventure game** that runs entirely in your browser. No installs, no build step, no external assets — open and play.

**Play it:** `https://shahinahmedrafi01-pro.github.io/Test-001/pixel-kingdom/`
(or open `index.html` locally / serve this folder with any static server)

---

## 🗺️ The World

A deterministic 160×160 tile open world with 6 regions:

| Region | What's there |
|---|---|
| 🌾 Greenfield Village | Safe hub: Elder, blacksmith, merchants, inn, crafting stations, waystone |
| 🌲 Whisper Forest | Slimes, wolves — and the **Slime King** 👑 |
| 🏚️ Sunken Ruins | Skeletons, ancient pillars — the **Skeleton Lord** 💀 |
| 🔥 Ember Caves | Goblins, bats, ores — the **Goblin Warlord** 👺 |
| ❄️ Frostpeak Mountains | Golems, wraiths, mithril, hermit's shrine |
| 🌾 Greenfield Plains | Bandits, resources, hidden treasure |

Day/night cycle, weather (rain/snow), torch lighting, rivers with bridges, gatherable trees/rocks/ores/berries, chests, signs, and unlockable fast-travel waystones.

## ⚔️ Features

- **Character creation** — name, 3 classes (Warrior / Ranger / Mage), appearance customization
- **Real-time combat** — melee, bows (ammo), magic staves, dodge-by-movement, crits, knockback, damage numbers, enemy telegraphs, 3 multi-phase bosses
- **Full inventory** — 28-slot grid, drag & drop, stacking, tooltips, equipment (7 slots), hotbar, storage stash, durability + repair
- **Crafting** — 42 recipes across Hand / Workbench / Furnace / Anvil / Campfire (smelt ores, cook food, forge gear)
- **Quests** — 9-quest main storyline (restore the fallen kingdom's crown) + 8 side quests, journal, objective tracker & map markers
- **Skills** — class skill trees (3 active + 5 passive abilities each), skill points per level, respec
- **Economy** — 3 merchant shops (buy/sell), loot tables, 6 rarity tiers (Common → Mythic)
- **Survival-lite** — food/healing, stamina, campfires & bedrolls, status effects (poison/burn/freeze/slow)
- **Save system** — 3 slots, autosave every 60s, export/import as JSON, version validation
- **Achievements** — 14 persistent achievements
- **Audio** — fully synthesized chiptune music (7 tracks) + 30+ SFX, volume controls, mute
- **Mobile** — virtual joystick, touch buttons, tap-to-move inventory, responsive UI

## 🕹️ Controls

**PC:** WASD / Arrows — move · Space / Click — attack · F — interact · Q/E/R — skills · Shift — sprint · 1–8 — hotbar · I — inventory · C — character · B — crafting · K — skills · J — quests · M — map · Esc — menu

**Mobile:** left joystick to move, ⚔️ attack, ✋ interact, Q/E/R skills, 🏃 sprint toggle.

## 🛠️ Tech

- Pure **HTML5 + CSS3 + vanilla JavaScript** (Canvas 2D) — zero dependencies
- All pixel art **generated procedurally in code** (`js/sprites.js`); all music/SFX **synthesized with Web Audio** (`js/audio.js`)
- Deterministic seeded world generation — the same seed always builds the same world
- Saves live in `localStorage` (nothing is sent to any server)

```
index.html          game shell
css/style.css       pixel-art UI theme
js/utils.js         config, RNG, math helpers
js/data.js          items (132), enemies (19), quests (17), recipes (42), dialogs, skills
js/sprites.js       procedural pixel-art engine
js/audio.js         synthesized music + SFX
js/world.js         world generation, collision, resources
js/entities.js      player, enemy AI, bosses, NPCs, combat
js/systems.js       inventory, crafting, quests, shops, skills, achievements
js/ui.js            HUD, menus, panels, dialogs, map
js/fx.js            particles, weather, lighting, damage numbers
js/mobile.js        touch controls
js/save.js          save slots, export/import
js/main.js          game loop, camera, input, day/night
```

## ✅ Tested

Automated browser QA: title screen, new game, movement/collision, combat kill + XP, item pickup/equip, crafting (incl. ingredient validation), quest accept/complete chain, shop buy/sell, death/respawn, save → reload → load persistence, inventory & pause panels — all passing with a clean console.

## 📜 License

Original code & procedurally generated assets — free to use and modify.
