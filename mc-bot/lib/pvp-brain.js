'use strict'
// PvP brain — the ULTRA HARD combat brain (Phase 2), MERGED BUILD.
//
// This is the Phase 2 brain from ~/workspace/pvp-bot/bots/pvp-bot.js,
// adapted for the merged Madara_1ea build:
//   * attachPvpBrain(bot, opts) attaches to an EXISTING mineflayer bot
//     (Madara's connection lifecycle owns the bot: reconnect ladder,
//     spawn watchdog, AuthMe login) instead of creating its own.
//   * The local chat control block is gone. Control arrives via
//     bot.brain's API (fightPlayerByName / stopAll / comeToEntity /
//     comboPlayerByName), driven by the Discord panel and by in-game
//     whispers in bot.js.
//   * Armor care is FULLY AUTOMATIC (Rafi's spec): spare swap runs in
//     every mode, and XP-bottle Mending repair fires on its own in any
//     safe window — idle, target dead/far, right after a pearl-out,
//     between fights. No command is ever required.
//   * Fix round 2: repair triggers only when a worn Mending piece is at
//     <=10% durability remaining (it previously fired on ANY damage, so
//     the bot started mending the moment it was hit), and the spare swap
//     is only the fallback when repair is impossible (no Mending / no XP
//     bottles). Also added: AUTO-RETALIATION while idle — casual hits
//     (fist / non-weapon) are ignored; sword/axe/spear/mace hits engage
//     the attacker; arrow hits engage if the shooter is reachable, else
//     the bot shield-blocks facing him; an incoming mace dive gets a
//     pre-emptive shield raise. Attribution uses the vanilla
//     damage_event packet (exact on 1.20.2+), with a swing-proximity
//     fallback. See the retaliation section below.
//   * Fix round 3 (Rafi's live-test specs, 2026-11-17): normal-mode
//     fights are SWORD ONLY (spear gap-close off); swings require a
//     clear line of sight and a stalled chase hops up and over blocks;
//     a target that runs 14+ blocks away gets an ender pearl thrown at
//     him (pearl chase), and the retaliation stand-down leash no longer
//     applies while the bot still carries pearls; a sword fight that
//     drags 45 s+ against the same target switches to a crystal
//     finisher — obsidian + end crystal placed fast next to the
//     target, a protective block in front of the bot first, then the
//     crystal is hit to detonate.
//   * Fix round 4 (Rafi's specs, 2026-11-17 evening): (1) an
//     ESCALATION LADDER for non-weapon attackers — hits 1-2 ignored,
//     hit 3 gets ONE bare-hand punch back, hit 4 makes the bot draw
//     its sword and just stand (warning pose), hit 5 engages fully.
//     Weapon attacks keep the round-2 rules unchanged. (2) A
//     multi-attacker SPECIAL MODE: with 2+ distinct recent opponents
//     the bot pearls away briefly, comes back and spams obsidian +
//     end crystal SUPER FAST (no humanized delays in this mode),
//     detonating each crystal with a BARE HAND; if its totems are
//     nearly out while outnumbered, it falls back to the aerial
//     pearl + wind-charge + mace combo. The /shop auto-buy idea is
//     postponed by Rafi and NOT part of this round.
//   * Sword/armor lookups are tier-generic (any *_sword / *_helmet / ...)
//     with the original diamond names preferred, so the brain works with
//     whatever kit the bot is actually given; diamond-kit behaviour is
//     unchanged (that is what the Phase 2 tests ran).
//
// Everything else — the custom combat loop (mineflayer-pvp is NOT used:
// that plugin grants a free swing on range re-entry), full-charge-only
// swings, humanized 120–250 ms reactions, A/D strafing, W-tap sprint
// resets, verified crit logic, pearl-out vs crystal / respawn anchor,
// the pearl + wind-charge + mace combo, spear Lunge gap-close with the
// protocol >= 768 LpVec3 velocity fix, totem upkeep, gapple discipline
// and hotbar self-organization — is the Phase 2 code, unchanged.

const mineflayerPathfinder = require('mineflayer-pathfinder')
const { pathfinder, goals, Movements } = mineflayerPathfinder
const { Vec3 } = require('vec3')

// Vanilla attack speeds -> full-charge cooldown in ms. The server counts
// attack strength in whole ticks: a sword (1.6/s, 12.5-tick period) is at
// full strength from 12 ticks (600 ms) on. Phase 2 uses 608 ms + jitter so
// we match the stock plugin's 12-tick cadence without ever swinging early.
const WEAPON_COOLDOWN_MS = {
  diamond_sword: 608,
  netherite_sword: 608,
  wooden_sword: 608,
  stone_sword: 608,
  iron_sword: 608,
  golden_sword: 608,
  diamond_axe: 1005,
  netherite_axe: 1005,
  iron_axe: 1005,
  stone_axe: 1090,
  wooden_axe: 1005,
  mace: 1640, // 0.6/s
  wooden_spear: 900,
  stone_spear: 900,
  copper_spear: 900,
  iron_spear: 900,
  golden_spear: 900,
  diamond_spear: 900,
  netherite_spear: 900
}
const DEFAULT_COOLDOWN_MS = 270 // bare hand / other items (4.0/s)
const SWING_RANGE = 3.45 // just inside the plugin's 3.5 attackRange
const SWAP_THRESHOLD = 30 // durability points left -> swap in a spare (fallback only, see checkArmorSwap)
// Rafi's rule (fix round 2): automatic Mending repair starts ONLY when a
// worn piece is down to about 10% durability REMAINING — not on any damage.
const REPAIR_TRIGGER_REMAINING = 0.10
// Auto-retaliation (fix round 2): a ranged attacker at/under this distance
// (and pathfindable) is chased; beyond it the bot shield-blocks instead.
const RETALIATE_REACH_BLOCKS = 20
const BLOCK_FORGET_MS = 6000 // no landed hit for this long + threat gone/passive -> stand down
const RETALIATE_LEASH_BLOCKS = 32 // retaliation target farther than this...
const RETALIATE_LEASH_MS = 8000 // ...for this long -> give up and stand idle
// Fix round 3 (Rafi's specs from the 2026-11-17 live test):
//  * normal-mode fights use the SWORD only — the spear gap-close is off;
//  * a block in front no longer stalls the fight: swings need a clear
//    line of sight, and a bot that pushes forward without moving hops up
//    and over the obstacle;
//  * a target that runs far away mid-fight gets an ender pearl thrown
//    at him, so the fight resumes on top of him;
//  * if a sword fight drags on too long against the same target, the
//    bot switches to a crystal finisher: obsidian + end crystal placed
//    fast next to the target, a protective block placed in front of the
//    bot first so the blast does not hurt the bot, then the crystal is
//    hit to detonate. Falls back to the sword when materials run out
//    or placement keeps failing (e.g. protected land).
const PEARL_CHASE_MIN_BLOCKS = 14 // target farther than this, sustained...
const PEARL_CHASE_SUSTAIN_MS = 1200 // ...for this long -> pearl to him
const PEARL_CHASE_COOLDOWN_MS = 4000
const CRYSTAL_AFTER_MS = 45000 // sword fight vs the same target dragging this long -> crystals
const CRYSTAL_COOLDOWN_MS = 20000
// Fix round 4 (Rafi's specs, 2026-11-17 evening):
//  * ESCALATION LADDER for non-weapon attackers (bare hand, a totem or
//    any non-weapon item/block in hand): per-attacker hit counter —
//    hits 1-2 ignored, hit 3 = ONE bare-hand punch back (no fight),
//    hit 4 = sword drawn, standing pose only, hit 5 = full engage.
//    The counter resets after this long without a hit from that player.
const LADDER_RESET_MS = 30000
//  * SPECIAL MODE: distinct players who hit the bot (or were commanded
//    as targets) count as opponents while they stay "recent" — this is
//    the window their last hit must fall inside.
const ATTACKER_WINDOW_MS = 20000
const SPECIAL_COOLDOWN_MS = 8000 // gap between special-mode actions
//  * REVISED multi-attacker flow (Rafi, 2026-11-17 22:20, supersedes
//    the totem-low-first flow): 2+ opponents -> AT MOST 2 fast crystal
//    blasts, then the aerial MACE COMBO, and the bot STAYS on the mace
//    combo while outnumbered (a 3rd attacker changes nothing). The
//    totem-low trigger is secondary now — it only matters when there
//    are no crystals left to open with.
const CRYSTAL_SPAM_MAX = 2 // crystals per spam run (Rafi: at most 2)
const CRYSTAL_SPAM_CAP_MS = 20000 // hard cap for one spam run
const MULTI_COMBO_COOLDOWN_MS = 4000 // gap between repeated mace combos while outnumbered
//  * PERSISTENT FINISHER CLOCK (Rafi, 2026-11-17 22:20): the 45 s
//    crystal-finisher threshold is accumulated FIGHT time against one
//    target — it only grows while the bot is actually in 'fight' mode
//    against that target, PAUSES through heals / escapes / pearl-outs,
//    survives a stand-down + re-engage inside this grace window, and
//    resets only when the target changes, dies, or the fight is over
//    for good (commanded stop / grace expired).
const FIGHT_CLOCK_GRACE_MS = 20000
//  * MACE FALLBACK (kept for reporting/back-compat): totems nearly out
//    = no spare totem beyond the offhand one.
const MACE_FALLBACK_MIN_SPECIAL_MS = 5000
const MACE_FALLBACK_COOLDOWN_MS = 45000
//  * WATER ESCAPE (Rafi's live bug, seen twice): head under water for
//    this long mid-fight -> swim up, get to shore, resume the chase.
const DEEP_WATER_CONFIRM_MS = 400
const WATER_ESCAPE_COOLDOWN_MS = 6000
//  * CLIMB (Rafi, 2026-11-17): target this far above the bot with the
//    bot this close horizontally -> climb (ladder / vine / scaffolding)
//    instead of standing underneath.
const CLIMB_MIN_DY = 2.0
const CLIMB_MAX_HORIZ = 9
const CLIMB_COOLDOWN_MS = 8000

const rand = (min, max) => min + Math.random() * (max - min)
const randInt = (min, max) => Math.floor(rand(min, max + 1))
// Humanized reaction window — set by attachPvpBrain opts (defaults match
// the Phase 2 test config: 120–250 ms).
let REACTION_MIN_MS = 120
let REACTION_MAX_MS = 250
const reactionDelay = () => rand(REACTION_MIN_MS, REACTION_MAX_MS)
const sleep = ms => new Promise(r => setTimeout(r, ms))

function attachPvpBrain (bot, opts = {}) {
  if (typeof opts.reactionMinMs === 'number') REACTION_MIN_MS = opts.reactionMinMs
  if (typeof opts.reactionMaxMs === 'number') REACTION_MAX_MS = opts.reactionMaxMs
  bot.loadPlugin(pathfinder)

  // Velocity decode fix for protocol >= 1.21.2 (768): entity_velocity
  // packets there arrive already decoded to blocks/tick (LpVec3), but
  // mineflayer 4.39 still applies the legacy /8000 notch conversion to
  // them, shrinking every server-sent velocity — knockback, wind-charge
  // bursts, spear Lunge impulses — to ~zero (measured: a Lunge III
  // impulse of 1.374 blocks/tick arrived at the client and the bot did
  // not move at all). Re-apply the raw packet velocity after
  // mineflayer's own handler (registered during createBot, so this one
  // runs after it). Inert on 1.21.1 (protocol 767, old encoding).
  // MERGED BUILD: Madara connects with version auto-detect, so the
  // registry (and thus the protocol number) may not exist yet when the
  // brain is attached. Try immediately, and again on login.
  let velocityFixActive = false
  function setupVelocityFix () {
    if (velocityFixActive) return
    try {
      const protocol = bot.registry && bot.registry.version ? bot.registry.version.version : 0
      if (protocol >= 768 && bot._client) {
        velocityFixActive = true
        bot._client.on('entity_velocity', packet => {
          if (!packet.velocity) return
          const raw = new Vec3(packet.velocity.x, packet.velocity.y, packet.velocity.z)
          const entityId = packet.entityId
          // Defer past the end of the packet-processing stack: mineflayer's
          // built-in entity handler is registered after this one (plugins
          // inject when the connection starts, after createBot returns), so
          // a synchronous write here would be overwritten by its /8000
          // conversion. setImmediate runs after all packet handlers, still
          // before the next 50 ms physics tick.
          setImmediate(() => {
            const entity = bot.entities[entityId]
            if (entity) entity.velocity.update(raw)
          })
        })
        // eslint-disable-next-line no-console
        console.log('[MadaraPvP] velocity decode fix active (protocol ' + protocol + ')')
      }
    } catch (e) {}
  }
  setupVelocityFix()
  bot.once('login', setupVelocityFix)

  const brain = {
    mode: 'idle', // idle | fight | eat | pearlout | come | combo | repair | lunge-test | block
    target: null,
    targetName: null,
    busy: false, // an async routine (eat / combo / repair / lunge test) owns the bot
    // auto-retaliation (fix round 2)
    retaliation: false, // the current fight was started by self-defense, not by a command
    retaliationOutSince: 0, // leash timer: target out of range since when
    block: null, // { name, entityId, since, lastHitAt, lastCheckAt, lastRaiseAt, reason } while shield-blocking
    lastDamage: null, // last attributed damage taken { at, attackerName, weapon, projectile, sourceTypeId }
    lastIgnoredHit: null, // last casual (fist / non-weapon) hit that was deliberately ignored
    // timing
    engageAt: 0, // do not swing before this time (reaction delay)
    lastSwingAt: 0,
    lastSwingFalling: false,
    swingReadyAt: 0, // cooldown + jitter gate for the next swing
    // movement
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    nextStrafeSwitchAt: 0,
    sprintResetUntil: 0,
    // aim
    aimPoint: null, // smoothed Vec3 we actually look at
    aimErr: new Vec3(0, 0, 0),
    nextAimErrAt: 0,
    // crits
    wantCrit: false,
    critJumpAt: 0,
    nextCritAttemptAt: 0,
    critPractice: false, // harness toggle (!pvp crits): attempt crits at any close range
    // survival
    lastTotemCheckAt: 0,
    offhandWasTotem: false,
    totemReequipAt: 0, // fix round 3b: human-delayed totem re-equip (TotemGuard)
    turnCapYaw: 0.55, // fix round 3b: capped head-turn rate (AntiCheat Aim)
    turnCapPitch: 0.45,
    lastEatAt: 0,
    eating: false,
    // pearl-out
    threatSeenAt: 0,
    threatItem: null,
    pearlOut: null, // { item, displacement, success, at } once resolved
    // spear
    spearReadyAt: 0,
    spearEquipped: false,
    // fix round 3
    swordOnly: true, // normal-mode fights: sword only, no spear gap-close
    fightStartedAt: 0, // when the current fight vs fightTargetId began
    fightTargetId: null,
    farSince: 0, // target continuously beyond pearl-chase range since
    nextPearlChaseAt: 0,
    nextCrystalAt: 0,
    crystalAfterMs: 0, // test override; 0 = CRYSTAL_AFTER_MS
    // fix round 3d (cobweb escape + fire/water bucket)
    webSince: 0,
    nextWebEscapeAt: 0,
    fireSince: 0,
    nextWaterAt: 0,
    // fix round 4 (escalation ladder + multi-attacker special mode)
    ladder: new Map(), // entityId -> { count, lastHitAt, name } non-weapon provocation counts
    ladderBusy: false, // a ladder punch / sword-pose routine owns the hands
    ladderPose: null, // { name, at } while the sword-warning pose is up
    opponents: new Map(), // entityId -> { name, lastHitAt, entity } this fight's opponents
    specialSince: 0, // 2+ opponents continuously since (0 = not in special territory)
    nextSpecialAt: 0,
    nextMaceFallbackAt: 0,
    maceFallbackMinMs: 0, // test override; 0 = MACE_FALLBACK_MIN_SPECIAL_MS
    // fix round 4 revision (2026-11-17 22:20): persistent finisher
    // clock + revised multi-attacker flow + water escape + climb
    fightClockTargetId: null, // entity id the accumulated fight clock belongs to
    fightTimeMs: 0, // accumulated FIGHT-mode ms vs fightClockTargetId (pauses, never wall-clock)
    fightClockExpiresAt: 0, // after a stand-down, the clock is wiped at this time
    lastClockTickAt: 0,
    prevDecisionMode: 'idle',
    multiCrystalDone: false, // this outnumbered episode already had its <=2 crystal blasts
    multiSeenAt: 0, // last time 2+ opponents were counted
    nextComboAt: 0,
    lastCombo: null, // last multi-mode mace combo { at, targetName }
    maceLockTargetId: null, // fix round 4 (22:29): a player the mace has HIT stays the combo target until he dies
    deepWaterSince: 0,
    nextWaterEscapeAt: 0,
    nextClimbAt: 0,
    lastCrystalSpam: null, // last spam result { blasts, firstBlastAt, bareHand, reason }
    lastMaceFallback: null, // { at, targetName, totemSpares }
    lastCrystal: null, // last crystal-finisher result { blasts, botDamage, reason }
    stuckPos: null, // obstacle-hop tracking (pushing forward, not moving)
    stuckSince: 0,
    jumpUntil: 0,
    // upkeep timers
    lastSwapCheckAt: 0,
    lastRepairCheckAt: 0,
    lastFightRepairCheckAt: 0,
    // feature results for tests and reporting
    comboResult: null,
    comboId: 0,
    lastRepair: null,
    lungeResult: null,
    // stats / events for tests and reporting
    stats: { swings: 0, critSwings: 0, critVerified: 0, critParticlesSeen: 0, gapplesEaten: 0, totemPops: 0, pearlOuts: 0, armorSwaps: 0, xpBottlesUsed: 0, spearLunges: 0, opponentSwings: 0, retaliations: 0, shieldBlocks: 0, ignoredHits: 0, pearlChases: 0, healPearls: 0, webEscapes: 0, waterUses: 0, crystalBlasts: 0, ladderPunches: 0, ladderPoses: 0, crystalSpamBlasts: 0, specialModes: 0, maceFallbacks: 0, waterEscapes: 0, climbs: 0, maceCombos: 0 },
    events: [],
    debugParticles: []
  }
  bot.brain = brain

  function logEvent (msg) {
    brain.events.push(msg)
    // eslint-disable-next-line no-console
    console.log('[MadaraPvP] ' + msg)
  }
  brain.logEvent = logEvent

  // ---------------------------------------------------------------- helpers
  function heldItemName () {
    const held = bot.inventory.slots[bot.getEquipmentDestSlot('hand')]
    return held ? held.name : null
  }

  // Tier-generic sword lookup (merged build): any *_sword, preferring the
  // one already sitting in hotbar slot 0. With a diamond kit this finds
  // exactly the diamond sword the Phase 2 code looked up by name.
  function findSwordItem () {
    const items = bot.inventory.items()
    const inBar = items.find(i => i.slot === 36 && i.name.endsWith('_sword'))
    return inBar || items.find(i => i.name.endsWith('_sword')) || null
  }
  brain.findSwordItem = findSwordItem

  function cooldownFor (itemName) {
    return WEAPON_COOLDOWN_MS[itemName] || DEFAULT_COOLDOWN_MS
  }

  function clearControls () {
    for (const c of ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']) {
      bot.setControlState(c, false)
    }
  }
  brain.clearControls = clearControls

  function targetDist () {
    if (!brain.target || !brain.target.position) return Infinity
    return brain.target.position.distanceTo(bot.entity.position)
  }

  function targetHeldName () {
    return entityHeldName(brain.target)
  }

  function entityHeldName (e) {
    if (!e) return null
    const held = e.heldItem || (e.equipment && e.equipment[0])
    return held ? held.name : null
  }
  brain.entityHeldName = entityHeldName

  // ------------------------------------------------- item data (durability)
  // prismarine-item exposes parsed components (1.20.5+ item format); the
  // legacy synthesized nbt Damage tag is the fallback.
  function damageOf (item) {
    if (!item) return 0
    if (Array.isArray(item.components)) {
      const c = item.components.find(x => x.type === 'damage')
      if (c && typeof c.data === 'number') return c.data
    }
    if (item.nbt && item.nbt.value && item.nbt.value.Damage) return item.nbt.value.Damage.value
    return 0
  }
  brain.itemDamage = damageOf

  function enchantIds (item) {
    const ids = []
    if (!item) return ids
    const push = e => { if (e && typeof e.id === 'number') ids.push(e.id) }
    if (Array.isArray(item.components)) {
      const c = item.components.find(x => x.type === 'enchantments' || x.type === 'stored_enchantments')
      if (c && c.data && Array.isArray(c.data.enchantments)) c.data.enchantments.forEach(push)
    }
    const enc = item.enchants
    const list = Array.isArray(enc) ? enc : (enc && Array.isArray(enc.enchantments) ? enc.enchantments : [])
    list.forEach(push)
    return ids
  }

  function hasEnchant (item, name) {
    try {
      const reg = bot.registry.enchantmentsByName[name]
      if (!reg) return false
      return enchantIds(item).includes(reg.id)
    } catch (e) { return false }
  }
  brain.hasEnchant = hasEnchant

  const ARMOR_DESTS = ['head', 'torso', 'legs', 'feet']
  function armorPieces () {
    return ARMOR_DESTS
      .map(d => bot.inventory.slots[bot.getEquipmentDestSlot(d)])
      .filter(Boolean)
  }

  // Fraction of durability REMAINING on a piece (1 = pristine, 0 = broken).
  function remainingFraction (item) {
    if (!item || !item.maxDurability) return null
    return (item.maxDurability - damageOf(item)) / item.maxDurability
  }
  brain.remainingFraction = remainingFraction

  // Fix round 2 (Rafi's rule): repair is triggered only when a worn
  // Mending piece is at <= REPAIR_TRIGGER_REMAINING of its durability.
  // Before this, ANY damage (damageOf > 0) started a repair, so the bot
  // began mending the moment it was first hit.
  function repairTriggered () {
    return armorPieces().some(i => {
      if (!hasEnchant(i, 'mending')) return false
      const f = remainingFraction(i)
      return f !== null && f <= REPAIR_TRIGGER_REMAINING + 1e-9
    })
  }
  brain.repairTriggered = repairTriggered
  brain.armorState = function () {
    return armorPieces().map(i => ({
      name: i.name,
      damage: damageOf(i),
      maxDurability: i.maxDurability || null,
      remaining: i.maxDurability ? i.maxDurability - damageOf(i) : null,
      mending: hasEnchant(i, 'mending')
    }))
  }

  // ------------------------------------------------------- hotbar organizing
  // Desired layout: bar 0 sword, 1 axe, 2 pearls, 3 wind charges, 4 gapples,
  // 5 mace.
  const HOTBAR_LAYOUT = [
    [0, 'diamond_sword'],
    [1, 'diamond_axe'],
    [2, 'ender_pearl'],
    [3, 'wind_charge'],
    [4, 'golden_apple'],
    [5, 'mace']
  ]

  async function organizeHotbar () {
    const items = () => bot.inventory.items()
    const slotOf = name => {
      let it = items().find(i => i.name === name)
      // Tier-generic fallbacks (merged build): any sword / any real axe.
      if (!it && name === 'diamond_sword') it = items().find(i => i.name.endsWith('_sword'))
      if (!it && name === 'diamond_axe') it = items().find(i => i.name.endsWith('_axe') && !i.name.endsWith('pickaxe'))
      return it ? it.slot : -1
    }
    const emptyMainSlot = () => {
      const used = new Set(items().map(i => i.slot))
      for (let s = 9; s <= 35; s++) if (!used.has(s)) return s
      return -1
    }
    // Phase 1: any desired item sitting in the WRONG hotbar slot goes to a
    // buffer slot in the main inventory, so phase 2 swaps cannot displace it.
    for (const [idx, name] of HOTBAR_LAYOUT) {
      const s = slotOf(name)
      if (s >= 36 && s !== 36 + idx) {
        const buf = emptyMainSlot()
        if (buf >= 0) await bot.moveSlotItem(s, buf).catch(() => {})
      }
    }
    // Phase 2: place each desired item into its hotbar slot.
    for (const [idx, name] of HOTBAR_LAYOUT) {
      const dest = 36 + idx
      let s = slotOf(name)
      if (s === -1 || s === dest) continue
      const occupant = items().find(i => i.slot === dest)
      if (occupant) {
        const buf = emptyMainSlot()
        if (buf >= 0) await bot.moveSlotItem(dest, buf).catch(() => {})
      }
      s = slotOf(name)
      if (s >= 0 && s !== dest) await bot.moveSlotItem(s, dest).catch(() => {})
    }
  }

  // Full pre-fight routine: armor on, hotbar organized, totem in offhand,
  // sword in hand. Returns a summary the harness can verify.
  async function prepareFight () {
    // Tier-generic armor equip (merged build): best piece per slot by max
    // durability, skipping a swap when the worn piece is at least as good.
    // With the Phase 2 diamond kit this equips exactly the diamond pieces
    // the original code named one by one.
    for (const [suffix, dest] of [
      ['_helmet', 'head'],
      ['_chestplate', 'torso'],
      ['_leggings', 'legs'],
      ['_boots', 'feet']
    ]) {
      const candidates = bot.inventory.items()
        .filter(i => i.name.endsWith(suffix))
        .sort((a, b) => ((b.maxDurability || 0) - damageOf(b)) - ((a.maxDurability || 0) - damageOf(a)))
      if (!candidates.length) continue
      const worn = bot.inventory.slots[bot.getEquipmentDestSlot(dest)]
      const wornRemaining = worn && worn.maxDurability ? worn.maxDurability - damageOf(worn) : -1
      const best = candidates[0]
      if (wornRemaining >= (best.maxDurability || 0) - damageOf(best)) continue
      await bot.equip(best, dest).catch(() => {})
    }
    await organizeHotbar()
    await equipTotemOffhand()
    bot.setQuickBarSlot(0)
    const hotbar = []
    for (let i = 0; i < 6; i++) {
      const it = bot.inventory.slots[36 + i]
      hotbar.push(it ? it.name : null)
    }
    const off = bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')]
    return { hotbar, offhand: off ? off.name : null }
  }
  brain.prepareFight = prepareFight

  async function equipTotemOffhand () {
    const offSlot = bot.getEquipmentDestSlot('off-hand')
    const off = bot.inventory.slots[offSlot]
    if (off && off.name === 'totem_of_undying') { brain.offhandWasTotem = true; return }
    const totem = bot.inventory.items().find(i => i.name === 'totem_of_undying')
    if (totem) {
      await bot.equip(totem, 'off-hand').catch(() => {})
      brain.offhandWasTotem = true
    }
  }

  // ------------------------------------------------------------- fight start
  function startFight (entity, source) {
    if (!entity || !entity.position) return false
    // A commanded fight supersedes any shield-block stance.
    if (brain.block) {
      try { bot.deactivateItem() } catch (e) {}
      brain.block = null
    }
    brain.retaliation = false // commanded fights are not leash-limited
    brain.retaliationOutSince = 0
    brain.target = entity
    brain.targetName = entity.username || 'unknown'
    brain.mode = 'fight'
    registerOpponent(entity) // fix round 4: a fight target counts as an opponent
    // Fix round 4 revision: the crystal-finisher clock is PERSISTENT
    // per target. Re-engaging the SAME player (after a heal, a pearl-
    // out, a target-gone stand-down...) keeps the accumulated fight
    // time; only a DIFFERENT target starts a fresh clock.
    if (brain.fightClockTargetId !== entity.id) {
      brain.fightClockTargetId = entity.id
      brain.fightTimeMs = 0
      brain.fightStartedAt = Date.now()
    }
    brain.fightClockExpiresAt = 0
    brain.fightTargetId = entity.id
    brain.farSince = 0
    brain.engageAt = Date.now() + reactionDelay() // humanized reaction
    brain.threatSeenAt = 0
    brain.threatItem = null
    brain.pearlOut = null
    brain.aimPoint = null
    brain.spearReadyAt = 0
    brain.spearEquipped = false
    logEvent(`fight started vs ${brain.targetName} (via ${source}), reaction delay until t+${Math.round(brain.engageAt - Date.now())}ms`)
    // Merged build: no harness prepares the bot any more — a fight command
    // (panel or whisper) must be enough. Gear up in the background; the
    // humanized reaction delay covers the first equips, and the decision
    // loop keeps the offhand totem topped up from there.
    if (!brain.busy) prepareFight().catch(() => {})
    return true
  }
  brain.startFight = startFight

  function stopAll (source) {
    if (brain.block) {
      try { bot.deactivateItem() } catch (e) {}
      brain.block = null
    }
    brain.retaliation = false
    brain.retaliationOutSince = 0
    brain.mode = 'idle'
    brain.target = null
    brain.targetName = null
    brain.fightStartedAt = 0
    brain.fightTargetId = null
    // a commanded stop ends the fight for good: the persistent
    // finisher clock is wiped too (fix round 4 revision)
    brain.fightClockTargetId = null
    brain.fightTimeMs = 0
    brain.fightClockExpiresAt = 0
    brain.multiCrystalDone = false
    brain.maceLockTargetId = null
    brain.farSince = 0
    brain.opponents.clear() // fix round 4: the fight is over, so is its opponent set
    brain.specialSince = 0
    brain.wantCrit = false
    brain.comboId++ // cancels a running combo
    clearControls()
    try { bot.pathfinder.setGoal(null) } catch (e) {}
    logEvent(`stopped (via ${source})`)
  }
  brain.stopAll = stopAll

  // ------------------------------------------------------------------- aim
  function updateAim (dt) {
    const t = brain.target
    if (!t || !t.position) return
    const now = Date.now()
    if (now > brain.nextAimErrAt) {
      // small human-like aim error, re-rolled every 300-600 ms
      brain.aimErr = new Vec3(rand(-0.14, 0.14), rand(-0.08, 0.10), rand(-0.14, 0.14))
      brain.nextAimErrAt = now + rand(300, 600)
      brain.turnCapYaw = rand(0.50, 0.62)
      brain.turnCapPitch = rand(0.40, 0.50)
    }
    const chest = t.position.offset(0, 1.30, 0).plus(brain.aimErr)
    if (!brain.aimPoint) brain.aimPoint = chest.clone()
    // chase the target point at a limited speed -> visible tracking lag,
    // instead of a perfect instant snap.
    const delta = chest.minus(brain.aimPoint)
    const maxStep = 16 * dt // blocks per second of aim travel
    if (delta.norm() > maxStep) delta.scale(maxStep / delta.norm())
    brain.aimPoint.add(delta)
    // Fix round 3b (after Rafi's live test drew AntiCheat Aim Type Y/B
    // flags and a kick): NO instant lookAt snaps in a fight. The head
    // ROTATES toward the aim point at a capped, slightly randomized
    // rate (~0.5 rad/tick ≈ a fast human flick) — same yaw/pitch math
    // as mineflayer's own lookAt, stepped instead of snapped. Tracking
    // a strafing target needs ~0.07 rad/tick, so combat tracking is
    // unaffected; only the robotic snap is gone.
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0)
    const d = brain.aimPoint.minus(eye)
    const wantYaw = Math.atan2(-d.x, -d.z)
    const wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
    let dYaw = wantYaw - bot.entity.yaw
    while (dYaw > Math.PI) dYaw -= 2 * Math.PI
    while (dYaw < -Math.PI) dYaw += 2 * Math.PI
    const capY = brain.turnCapYaw || 0.55
    const capP = brain.turnCapPitch || 0.45
    const stepYaw = Math.max(-capY, Math.min(capY, dYaw))
    const dPitch = wantPitch - bot.entity.pitch
    const stepPitch = Math.max(-capP, Math.min(capP, dPitch))
    bot.look(bot.entity.yaw + stepYaw, bot.entity.pitch + stepPitch, true)
  }

  // Fix round 4 revision (Rafi, 2026-11-17 22:20): the MACE COMBO must
  // aim with the same humanized turn-rate caps as normal fighting —
  // Rafi is explicit that the combo must not trip AntiCheat Aim flags.
  // stepAim rotates the head ONE capped step toward a point (same caps
  // as updateAim); aimAtSmooth repeats it on a ~50 ms tick until the
  // head is on the point or the budget runs out. Every lookAt(...,true)
  // snap in the combo path was replaced by one of these.
  function stepAim (point) {
    if (!point || !bot.entity) return
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0)
    const d = point.minus(eye)
    const wantYaw = Math.atan2(-d.x, -d.z)
    const wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
    let dYaw = wantYaw - bot.entity.yaw
    while (dYaw > Math.PI) dYaw -= 2 * Math.PI
    while (dYaw < -Math.PI) dYaw += 2 * Math.PI
    const capY = brain.turnCapYaw || 0.55
    const capP = brain.turnCapPitch || 0.45
    const stepYaw = Math.max(-capY, Math.min(capY, dYaw))
    const dPitch = wantPitch - bot.entity.pitch
    const stepPitch = Math.max(-capP, Math.min(capP, dPitch))
    bot.look(bot.entity.yaw + stepYaw, bot.entity.pitch + stepPitch, true)
  }
  brain.stepAim = stepAim

  async function aimAtSmooth (point, budgetMs) {
    const deadline = Date.now() + (budgetMs || 500)
    while (Date.now() < deadline) {
      stepAim(point)
      // aligned? compare wanted vs current angles
      const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0)
      const d = point.minus(eye)
      const wantYaw = Math.atan2(-d.x, -d.z)
      let dYaw = wantYaw - bot.entity.yaw
      while (dYaw > Math.PI) dYaw -= 2 * Math.PI
      while (dYaw < -Math.PI) dYaw += 2 * Math.PI
      const wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
      if (Math.abs(dYaw) < 0.06 && Math.abs(wantPitch - bot.entity.pitch) < 0.06) break
      await sleep(50)
    }
  }
  brain.aimAtSmooth = aimAtSmooth

  // -------------------------------------------------------------- crit logic
  function targetCornered () {
    const t = brain.target
    if (!t || !t.position) return false
    const dir = t.position.minus(bot.entity.position)
    dir.y = 0
    if (dir.norm() === 0) return false
    dir.normalize()
    const behind = t.position.plus(dir.scaled(0.9))
    const b1 = bot.blockAt(behind.offset(0, 0, 0))
    const b2 = bot.blockAt(behind.offset(0, 1, 0))
    const solid = b => b && b.boundingBox === 'block'
    return solid(b1) || solid(b2)
  }

  function maybeStartCrit (now, dist) {
    if (brain.wantCrit) return
    if (now < brain.nextCritAttemptAt) return
    if (dist > 2.95) return
    if (!bot.entity.onGround) return
    // Phase 2 fix: only jump when the swing is actually imminent — Phase 1
    // jumped on its own schedule and the held swing usually expired before
    // the bot was falling, so no swing ever met the crit condition.
    if (brain.swingReadyAt - now > 170) return
    const t = brain.target
    const airborne = t && t.onGround === false
    if (!airborne && !brain.critPractice && !targetCornered()) return
    brain.wantCrit = true
    brain.critJumpAt = now
    brain.nextCritAttemptAt = now + randInt(1100, 1600)
    bot.setControlState('jump', true)
    setTimeout(() => bot.setControlState('jump', false), 55)
  }

  // ------------------------------------------------------------ attack logic
  // Line of sight to the target's body (fix round 3): a swing through a
  // wall is a wasted swing — the live test showed the bot standing at a
  // block, swinging at the player behind it. Raycast from the bot's eyes
  // to the target's chest; any solid block in the way blocks the swing,
  // and the chase (with its obstacle hop) takes over instead.
  function hasLineOfSight () {
    const t = brain.target
    if (!t || !t.position || !bot.entity) return false
    try {
      const eye = bot.entity.position.offset(0, 1.62, 0)
      const chest = t.position.offset(0, 1.1, 0)
      const dir = chest.minus(eye)
      const dist = dir.norm()
      if (dist === 0) return true
      dir.normalize()
      return !bot.world.raycast(eye, dir, dist)
    } catch (e) { return true }
  }
  brain.hasLineOfSight = hasLineOfSight

  function trySwing (now, dist) {
    if (now < brain.engageAt) return
    if (now < brain.swingReadyAt) return
    if (dist > SWING_RANGE) return
    if (!hasLineOfSight()) return
    // If a crit jump is in progress, hold the swing until we are GENUINELY
    // falling (that is what makes it a critical hit) — but never hold too
    // long, and give up on the crit if the target slipped out of range.
    // Threshold -0.18, not -0.05: a local probe showed swings released at
    // vy ~ -0.08 land as NORMAL hits (the client reads -0.078 in the tick
    // it touches ground again), while a swing at vy = -0.30 dealt true
    // crit damage (9.83 HP vs 7 on an unarmored target).
    if (brain.wantCrit) {
      const falling = bot.entity.velocity.y < -0.18
      const heldTooLong = now - brain.critJumpAt > 540
      if (dist > 3.6) brain.wantCrit = false
      else if (!falling && !heldTooLong) return
    }
    const wasCrit = brain.wantCrit && bot.entity.velocity.y < -0.18 && !bot.entity.onGround
    bot.attack(brain.target)
    brain.stats.swings++
    if (wasCrit) brain.stats.critSwings++
    brain.lastSwingAt = now
    brain.lastSwingFalling = wasCrit
    brain.wantCrit = false
    // full-charge gate: weapon cooldown + a small random jitter
    brain.swingReadyAt = now + cooldownFor(heldItemName()) + rand(0, 35)
    // W-tap: brief sprint release right after the swing so the next
    // approach re-sprints (sprint-reset knockback pattern). Forward stays
    // held (Phase 2) so the reset does not push us out of range.
    brain.sprintResetUntil = now + rand(60, 110)
  }

  // --------------------------------------------------------- movement logic
  function fightMovement (now, dist) {
    const inReset = now < brain.sprintResetUntil
    let forward = false
    let back = false
    let sprint = false
    // Phase 2 spacing: settle in a tight 2.4-2.95 band — inside BOTH our
    // 3.45 swing gate and the plugin's 3.5 attackRange at all times.
    // Crossing the 3.5 boundary is what gifts mineflayer-pvp its free
    // re-entry swing, and our own knockback is kept small in-band by
    // walking (not sprinting) the hits, so the target stays in range too.
    if (dist > 2.95) { forward = true; sprint = dist > 3.05 && !inReset }
    else if (dist < 1.85) { back = true }
    else if (inReset) { forward = true; sprint = false } // W-tap: hold W, drop sprint only
    // strafe while anywhere near melee band
    let left = false
    let right = false
    if (dist <= 4.4) {
      if (now > brain.nextStrafeSwitchAt) {
        if (Math.random() < 0.8) brain.strafeDir *= -1
        brain.nextStrafeSwitchAt = now + rand(350, 850)
      }
      left = brain.strafeDir === 1
      right = brain.strafeDir !== 1
    }
    bot.setControlState('forward', forward)
    bot.setControlState('back', back)
    bot.setControlState('left', left)
    bot.setControlState('right', right)
    bot.setControlState('sprint', sprint)
    // Fix round 3: obstacle hop. Pushing forward but barely moving means
    // a block is in the way — pulse jump so the bot hops up and over it
    // and keeps going at the player, instead of standing at the block.
    // (The crit logic owns the jump control while a crit is winding up.)
    if (!brain.wantCrit) {
      const nowPos = bot.entity.position
      if (forward && dist > 2.95) {
        if (!brain.stuckPos) { brain.stuckPos = nowPos.clone(); brain.stuckSince = now }
        const moved = Math.hypot(nowPos.x - brain.stuckPos.x, nowPos.z - brain.stuckPos.z)
        if (moved > 0.6) { brain.stuckPos = nowPos.clone(); brain.stuckSince = now } else if (now - brain.stuckSince > 500) brain.jumpUntil = now + 260
      } else {
        brain.stuckPos = null
        brain.stuckSince = 0
      }
      bot.setControlState('jump', now < brain.jumpUntil)
    }
  }

  // ------------------------------------------------------------ pearl-out
  async function doPearlOut (itemName) {
    const from = bot.entity.position.clone()
    brain.mode = 'pearlout'
    brain.stats.pearlOuts++
    logEvent(`PEARL-OUT: opponent holding ${itemName} — disengaging`)
    clearControls()
    try { bot.pathfinder.setGoal(null) } catch (e) {}
    const pearl = bot.inventory.items().find(i => i.name === 'ender_pearl')
    if (!pearl) {
      brain.pearlOut = { item: itemName, displacement: 0, success: false, reason: 'no pearl in inventory' }
      brain.mode = 'idle'
      brain.target = null
      return
    }
    try {
      await bot.equip(pearl, 'hand')
      // Aim away from the opponent, slightly up, at open ground.
      const away = bot.entity.position.minus(brain.target.position)
      away.y = 0
      if (away.norm() === 0) away.x = 1
      away.normalize()
      const aimPoint = bot.entity.position.plus(away.scaled(34)).offset(0, 6.5, 0)
      await bot.lookAt(aimPoint, true)
      bot.activateItem()
      // Wait for the teleport to land (or time out).
      const deadline = Date.now() + 4500
      let displacement = 0
      while (Date.now() < deadline) {
        await sleep(100)
        displacement = bot.entity.position.distanceTo(from)
        if (displacement >= 20) break
      }
      displacement = bot.entity.position.distanceTo(from)
      brain.pearlOut = {
        item: itemName,
        displacement: Math.round(displacement * 10) / 10,
        success: displacement >= 20
      }
      logEvent(`pearl-out resolved: displacement ${brain.pearlOut.displacement} blocks, success=${brain.pearlOut.success}`)
      // re-equip the sword for whatever comes next
      const sword = findSwordItem()
      if (sword) await bot.equip(sword, 'hand').catch(() => {})
    } catch (e) {
      brain.pearlOut = { item: itemName, displacement: 0, success: false, reason: e.message }
    }
    brain.mode = 'idle'
    brain.target = null
    brain.targetName = null
    clearControls()
  }

  // ------------------------------------------------------------ pearl chase
  // Fix round 3: the target ran far away mid-fight — throw an ender
  // pearl at him and resume the fight on top of him, instead of letting
  // him escape. Same near-flat throw ballistics as the combo's step 1.
  async function doPearlChase () {
    const target = brain.target
    if (!target || !target.isValid || !target.position) return
    const pearl = bot.inventory.items().find(i => i.name === 'ender_pearl')
    if (!pearl) {
      logEvent('pearl chase wanted but no ender pearl in inventory')
      brain.nextPearlChaseAt = Date.now() + PEARL_CHASE_COOLDOWN_MS
      brain.farSince = 0
      return
    }
    brain.busy = true
    brain.mode = 'pearlchase'
    brain.stats.pearlChases++
    clearControls()
    try { bot.pathfinder.setGoal(null) } catch (e) {}
    const from = bot.entity.position.clone()
    logEvent(`pearl chase: ${brain.targetName} is ${targetDist().toFixed(1)} blocks away — pearling to him`)
    try {
      await bot.equip(pearl, 'hand')
      await bot.lookAt(target.position.offset(0, 1.2, 0), true)
      bot.activateItem()
      await waitTeleported(from, 3000, 1.2, target.position, 2.5)
    } catch (e) {
      logEvent('pearl chase failed: ' + e.message)
    }
    const sword = findSwordItem()
    if (sword) await bot.equip(sword, 'hand').catch(() => {})
    brain.nextPearlChaseAt = Date.now() + PEARL_CHASE_COOLDOWN_MS
    brain.farSince = 0
    brain.busy = false
    if (brain.target && brain.target.isValid) brain.mode = 'fight'
    else { brain.mode = 'idle'; brain.target = null; brain.targetName = null }
  }

  // ------------------------------------------------------- crystal finisher
  // Fix round 3 (Rafi's spec): when a sword fight drags on too long
  // against the same target, finish him with crystals — obsidian + end
  // crystal placed FAST next to him, a protective block placed in front
  // of the bot first so the blast does not hurt the bot, then the
  // crystal is hit to detonate. Repeats while he lives and materials
  // last; falls back to the sword when they run out or placement keeps
  // failing (protected land).
  const COVER_BLOCK_NAMES = ['cobblestone', 'netherrack', 'stone', 'deepslate', 'tuff', 'dirt', 'end_stone', 'nether_bricks', 'oak_planks', 'spruce_planks', 'stone_bricks', 'bricks', 'sandstone', 'gravel']
  // CRYSTALS ONLY (Rafi, 2026-11-17): Madara's inventory also holds
  // respawn anchors, but the bot must NEVER place or use one itself —
  // an anchor blast digs a huge crater. All crystal-role lookups go
  // through this filter, so an anchor can never be picked as a base,
  // a crystal, or a cover block. (An OPPONENT holding an anchor is a
  // different thing — that stays a pearl-out threat, as before.)
  const FORBIDDEN_SELF_USE = new Set(['respawn_anchor'])
  function crystalMaterials () {
    const items = bot.inventory.items().filter(i => !FORBIDDEN_SELF_USE.has(i.name))
    const obsidian = items.find(i => i.name === 'obsidian')
    const crystal = items.find(i => i.name === 'end_crystal')
    let cover = items.find(i => COVER_BLOCK_NAMES.includes(i.name))
    if (!cover && obsidian && obsidian.count > 2) cover = obsidian // spare obsidian doubles as cover
    return { obsidian, crystal, cover }
  }
  brain.forbiddenSelfUse = FORBIDDEN_SELF_USE
  brain.crystalMaterials = crystalMaterials

  // Where the obsidian base goes: the target's own feet cell first (the
  // crystal then sits at his waist — maximum damage), else a horizontal
  // neighbour at feet level. The cell must be air, the cell below solid,
  // the cell above air, and the base within the bot's reach.
  function findCrystalSpot () {
    const t = brain.target
    if (!t || !t.position || !bot.entity) return null
    const feet = t.position.floored()
    // Only the 4 horizontal neighbours: the target's OWN feet cell can
    // never be filled while he stands in it (vanilla refuses to place a
    // solid block inside a player's bounding box — the first round-3
    // test failed exactly there), and a neighbour cell that his box
    // overlaps is refused for the same reason.
    const cells = [feet.offset(1, 0, 0), feet.offset(-1, 0, 0), feet.offset(0, 0, 1), feet.offset(0, 0, -1)]
    const ok = []
    for (const cell of cells) {
      // does the target's bounding box (0.6 wide, 1.8 tall) overlap this cell?
      const overlapX = t.position.x + 0.3 > cell.x && t.position.x - 0.3 < cell.x + 1
      const overlapZ = t.position.z + 0.3 > cell.z && t.position.z - 0.3 < cell.z + 1
      if (overlapX && overlapZ) continue
      const below = bot.blockAt(cell.offset(0, -1, 0))
      const at = bot.blockAt(cell)
      const above = bot.blockAt(cell.offset(0, 1, 0))
      if (!below || below.boundingBox !== 'block') continue
      if (!at || at.boundingBox !== 'empty') continue
      if (!above || above.boundingBox !== 'empty') continue
      if (bot.entity.position.distanceTo(cell.offset(0.5, 0.5, 0.5)) > 4.6) continue
      ok.push(cell)
    }
    if (!ok.length) return null
    // closest to the BOT first: fastest to place, and the bot is already
    // standing on that side of the target
    ok.sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b))
    return ok[0]
  }

  async function doCrystalFinisher () {
    const target = brain.target
    if (!target || !target.isValid || !target.position) return
    brain.busy = true
    brain.mode = 'crystal'
    clearControls()
    try { bot.pathfinder.setGoal(null) } catch (e) {}
    const startedAt = Date.now()
    const healthBefore = bot.health
    const result = { blasts: 0, botDamage: 0, reason: null, cycles: 0 }
    brain.lastCrystal = result
    logEvent(`crystal finisher: accumulated sword fight vs ${brain.targetName} reached ${Math.round(brain.fightTimeMs / 1000)}s — switching to crystals`)
    let consecutiveFails = 0
    try {
      while (brain.mode === 'crystal' && brain.target === target && target.isValid && target.position) {
        if (Date.now() - startedAt > 45000) { result.reason = 'finisher time cap (45s)'; break }
        const mats = crystalMaterials()
        if (!mats.obsidian || !mats.crystal) { result.reason = 'out of obsidian or crystals'; break }
        if (!mats.cover) { result.reason = 'no cover block available — will not blast unprotected'; break }
        result.cycles++
        // 1) get within placing + hitting distance of the target
        const distT = targetDist()
        if (distT > 2.9) {
          try {
            bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2.0))
            const deadline = Date.now() + 3500
            while (Date.now() < deadline && brain.mode === 'crystal' && target.isValid && targetDist() > 2.9) await sleep(90)
            bot.pathfinder.setGoal(null)
          } catch (e) {}
        }
        if (brain.mode !== 'crystal' || !target.isValid) break
        // 2) an already-placed crystal near the target (e.g. the last
        // cycle's detonation swing missed) is reused before placing more
        let crystalEntity = Object.values(bot.entities).find(e =>
          e && e.position && e.position.distanceTo(target.position) < 3.2 &&
          ((e.name || '').includes('crystal') || (e.displayName || '').includes('Crystal')))
        let spot = null
        if (!crystalEntity) {
          // 3) find the base spot next to (or under) the target — and
          // re-verify it is still in reach at the moment of placing (a
          // target sliding from knockback made a stale spot fail with
          // "the block is still air" in the first round-3 test).
          spot = findCrystalSpot()
          if (!spot || bot.entity.position.distanceTo(spot.offset(0.5, 0.5, 0.5)) > 4.4) {
            consecutiveFails++
            logEvent('crystal finisher: no valid base spot near the target')
            if (consecutiveFails >= 2) { result.reason = 'no placeable spot (protected land?)'; break }
            await sleep(300)
            continue
          }
          const below = bot.blockAt(spot.offset(0, -1, 0))
          // 4) obsidian base — a refused placement fails THIS cycle,
          // not the whole finisher
          try {
            await bot.equip(mats.obsidian, 'hand')
            await bot.placeBlock(below, new Vec3(0, 1, 0))
            await sleep(60) // fix round 4 revision: faster crystal cycle (Rafi)
            const placed = bot.blockAt(spot)
            if (!placed || placed.name !== 'obsidian') throw new Error('obsidian did not register')
          } catch (e) {
            consecutiveFails++
            logEvent('crystal finisher: obsidian placement failed (' + e.message + ')')
            if (consecutiveFails >= 3) { result.reason = 'obsidian placement keeps failing'; break }
            await sleep(250)
            continue
          }
          // 5) end crystal on top of the base
          const baseBlock = bot.blockAt(spot)
          const matsNow = crystalMaterials()
          if (!matsNow.crystal) { result.reason = 'out of crystals mid-cycle'; break }
          try {
            await bot.equip(matsNow.crystal, 'hand')
            await bot.placeBlock(baseBlock, new Vec3(0, 1, 0))
          } catch (e) {
            consecutiveFails++
            logEvent('crystal finisher: crystal placement failed (' + e.message + ')')
            if (consecutiveFails >= 3) { result.reason = 'crystal placement keeps failing'; break }
            await sleep(250)
            continue
          }
          await sleep(60) // fix round 4 revision: faster crystal cycle (Rafi)
          // 6) the crystal entity should now exist just above the base
          crystalEntity = Object.values(bot.entities).find(e =>
            e && e.position && e.position.distanceTo(spot.offset(0.5, 1, 0.5)) < 2.2 &&
            ((e.name || '').includes('crystal') || (e.displayName || '').includes('Crystal')))
          if (!crystalEntity) {
            consecutiveFails++
            logEvent('crystal finisher: crystal entity did not appear after placement')
            if (consecutiveFails >= 2) { result.reason = 'crystal placement not spawning'; break }
            continue
          }
        }
        consecutiveFails = 0
        const baseCell = spot || crystalEntity.position.offset(-0.5, -1, -0.5).floored()
        // 6) protective cover in front of the bot, between bot and
        // crystal. PROBE-VERIFIED geometry (local A/B, crystal on a
        // 1-block base, bot 2.5 blocks away, full netherite): a block
        // at FEET level alone gives NO protection (5.72 damage, same as
        // uncovered — the crystal sits high and the blast rays pass
        // over it), while a block at WAIST level cuts it to 0.21. So
        // the cover is two blocks: feet block as the support, waist
        // block as the actual shield.
        const coverMats = crystalMaterials()
        if (coverMats.cover) {
          const bp = bot.entity.position
          const dir = crystalEntity.position.minus(bp)
          dir.y = 0
          if (dir.norm() > 0.01) {
            dir.normalize()
            const front = new Vec3(Math.floor(bp.x + dir.x * 1.15), Math.floor(bp.y), Math.floor(bp.z + dir.z * 1.15))
            if (front.distanceTo(baseCell) > 0.9) {
              await bot.equip(coverMats.cover, 'hand').catch(() => {})
              const frontAt = bot.blockAt(front)
              const frontBelow = bot.blockAt(front.offset(0, -1, 0))
              if (frontAt && frontAt.boundingBox === 'empty' && frontBelow && frontBelow.boundingBox === 'block') {
                await bot.placeBlock(frontBelow, new Vec3(0, 1, 0)).catch(() => {})
              }
              const waist = front.offset(0, 1, 0)
              const waistAt = bot.blockAt(waist)
              const support = bot.blockAt(front)
              if (waistAt && waistAt.boundingBox === 'empty' && support && support.boundingBox === 'block') {
                const coverNow = crystalMaterials().cover
                if (coverNow) {
                  await bot.equip(coverNow, 'hand').catch(() => {})
                  await bot.placeBlock(support, new Vec3(0, 1, 0)).catch(() => {})
                }
              }
            }
          }
        }
        // 7) sword back in hand, look at the crystal, hit it — blast
        const sword = findSwordItem()
        if (sword) await bot.equip(sword, 'hand').catch(() => {})
        await bot.lookAt(crystalEntity.position.offset(0, 0.4, 0), true)
        bot.attack(crystalEntity)
        brain.stats.crystalBlasts++
        result.blasts++
        logEvent(`crystal finisher: blast #${result.blasts} on ${brain.targetName}`)
        await sleep(rand(120, 200)) // fix round 4 revision: faster pace between blasts (Rafi)
        // loop: if he survived and materials remain, place the next one — fast
      }
    } catch (e) {
      result.reason = e.message
      logEvent('crystal finisher stopped: ' + e.message)
    }
    result.botDamage = Math.max(0, Math.round((healthBefore - bot.health) * 10) / 10)
    if (!result.reason) result.reason = (target.isValid && brain.target === target) ? 'target still standing — back to sword' : 'target gone'
    logEvent(`crystal finisher done: ${JSON.stringify(result)}`)
    const sword = findSwordItem()
    if (sword) await bot.equip(sword, 'hand').catch(() => {})
    brain.nextCrystalAt = Date.now() + CRYSTAL_COOLDOWN_MS
    brain.busy = false
    if (brain.target === target && target.isValid && brain.mode === 'crystal') {
      brain.mode = 'fight'
      brain.fightTimeMs = 0 // the persistent clock re-arms after a crystal round
      brain.fightStartedAt = Date.now()
      brain.aimPoint = null
    } else if (brain.mode === 'crystal') {
      brain.mode = 'idle'
      brain.target = null
      brain.targetName = null
    }
    clearControls()
  }
  brain.doCrystalFinisher = doCrystalFinisher

  // --------------------------------------- fix round 3d: cobweb + fire
  // Rafi (2026-11-17): (1) stuck in a cobweb mid-fight -> ender pearl
  // 10-15 blocks away to escape, recover, then re-engage. (2) On fire
  // and the fire is really hurting -> place the water bucket at its
  // feet and pick it straight back up (he stocks one in the inventory).
  async function throwPearlDirection (dir, dist) {
    const pearl = bot.inventory.items().find(i => i.name === 'ender_pearl')
    if (!pearl) return false
    await bot.equip(pearl, 'hand').catch(() => {})
    const before = bot.entity.position.clone()
    await bot.lookAt(bot.entity.position.plus(dir.scaled(dist)).offset(0, 2.4, 0), true)
    bot.activateItem()
    return waitTeleported(before, 1300)
  }

  // Pearl AWAY from a position, turning ~120 degrees between retries.
  async function pearlAwayFrom (fromPos, dist, tries) {
    const away0 = bot.entity.position.minus(fromPos)
    away0.y = 0
    if (away0.norm() <= 0.01) return false
    away0.normalize()
    for (let attempt = 0; attempt < tries; attempt++) {
      const ang = attempt * 2.1 + rand(-0.25, 0.25)
      const dir = new Vec3(
        away0.x * Math.cos(ang) - away0.z * Math.sin(ang), 0,
        away0.x * Math.sin(ang) + away0.z * Math.cos(ang))
      if (await throwPearlDirection(dir, dist)) return true
    }
    return false
  }

  function inCobweb () {
    if (!bot.entity) return false
    const p = bot.entity.position
    const a = bot.blockAt(p)
    const b = bot.blockAt(p.offset(0, 0.6, 0))
    return (a && a.name === 'cobweb') || (b && b.name === 'cobweb')
  }

  function isOnFire () {
    const e = bot.entity
    if (!e) return false
    if (typeof e.onFire === 'boolean') return e.onFire
    const m = e.metadata && e.metadata[0]
    return typeof m === 'number' ? (m & 0x01) !== 0 : false
  }

  async function doCobwebEscape () {
    if (brain.busy) return
    brain.busy = true
    brain.mode = 'escape'
    const targetAtStart = brain.target
    brain.stats.webEscapes++
    logEvent('stuck in a cobweb — pearling out')
    try {
      let out = false
      if (targetAtStart && targetAtStart.position) {
        out = await pearlAwayFrom(targetAtStart.position, 12.5, 2)
      }
      if (!out) {
        const yaw = bot.entity.yaw
        await throwPearlDirection(new Vec3(-Math.sin(yaw), 0, -Math.cos(yaw)), 12.5)
      }
      const sword = findSwordItem()
      if (sword) await bot.equip(sword, 'hand').catch(() => {})
      // hurt after the escape? let the heal rule fire immediately
      if (bot.health <= 10) brain.lastEatAt = 0
    } catch (e) {
      logEvent('cobweb escape failed: ' + e.message)
    }
    brain.nextWebEscapeAt = Date.now() + 6000
    brain.busy = false
    if (brain.target && brain.target.isValid) {
      brain.mode = 'fight'
      brain.aimPoint = null
    } else {
      brain.mode = 'idle'
      brain.target = null
    }
  }

  async function doWaterBucket () {
    if (brain.busy) return
    const bucket = bot.inventory.items().find(i => i.name === 'water_bucket')
    if (!bucket) return
    brain.busy = true
    brain.mode = 'escape' // hold position ~1s so the scoop-back lands
    try { bot.pathfinder.setGoal(null) } catch (e) {}
    brain.stats.waterUses++
    logEvent('on fire and it is hurting — water bucket at my feet')
    try {
      await bot.equip(bucket, 'hand')
      // placeBlock is REFUSED for the bot's own feet cell (probe-
      // water.js) — the vanilla way works: look straight down and
      // use the bucket; the server raycasts and puts the water in
      // the feet cell. A second look-down + use scoops it back.
      await bot.equip(bucket, 'hand')
      try { bot.clearControlStates() } catch (e) {}
      const placePos = bot.entity.position.clone()
      await bot.lookAt(placePos.offset(0, -1, 0), true)
      bot.activateItem()
      await sleep(400) // water is down, fire is out
      // Scoop it straight back up. The empty bucket only fills from a
      // SOURCE block — if the bot drifted into the flowing edge, a
      // straight-down use misses, so aim at the placed source cell.
      const srcCell = placePos.floored().offset(0.5, 0.4, 0.5)
      for (let i = 0; i < 3; i++) {
        await bot.lookAt(srcCell, true)
        bot.activateItem()
        await sleep(350)
        if (bot.inventory.items().some(it => it.name === 'water_bucket')) break
      }
      const sword = findSwordItem()
      if (sword) await bot.equip(sword, 'hand').catch(() => {})
    } catch (e) {
      logEvent('water bucket failed: ' + e.message)
    }
    brain.nextWaterAt = Date.now() + 5000
    brain.busy = false
    if (brain.target && brain.target.isValid) {
      brain.mode = 'fight'
      brain.aimPoint = null
    } else {
      brain.mode = 'idle'
      brain.target = null
    }
  }

  // --------------------------------- fix round 4: water escape + climb
  // WATER ESCAPE (Rafi's live bug, seen TWICE): Madara pearled into
  // water mid-fight and stood UNDERWATER staring at the player, never
  // getting out. The fight loop's movement has no swim behaviour, so
  // a dedicated routine owns the bot: swim UP (jump held), drive
  // toward the nearest shore cell, hop out onto land, resume chase.
  function headInWater () {
    if (!bot.entity) return false
    const p = bot.entity.position
    const feet = bot.blockAt(p)
    const eye = bot.blockAt(p.offset(0, 1.62, 0))
    return !!(feet && feet.name === 'water' && eye && eye.name === 'water')
  }
  brain.headInWater = headInWater

  // Nearest standable dry cell (empty cell + empty above + solid
  // below) by horizontal distance — the shore to swim for.
  function findShore () {
    if (!bot.entity) return null
    const bp = bot.entity.position
    let best = null
    let bestD = Infinity
    for (let dx = -12; dx <= 12; dx++) {
      for (let dz = -12; dz <= 12; dz++) {
        for (let dy = -2; dy <= 5; dy++) {
          const cell = new Vec3(Math.floor(bp.x) + dx, Math.floor(bp.y) + dy, Math.floor(bp.z) + dz)
          const at = bot.blockAt(cell)
          if (!at || at.boundingBox !== 'empty' || at.name === 'water') continue
          const above = bot.blockAt(cell.offset(0, 1, 0))
          if (!above || above.boundingBox !== 'empty') continue
          const below = bot.blockAt(cell.offset(0, -1, 0))
          if (!below || below.boundingBox !== 'block') continue
          const d = Math.hypot(cell.x + 0.5 - bp.x, cell.z + 0.5 - bp.z)
          if (d < bestD) { bestD = d; best = cell.offset(0.5, 0, 0.5) }
        }
      }
    }
    return best
  }
  brain.findShore = findShore

  async function doWaterEscape () {
    if (brain.busy) return
    brain.busy = true
    brain.mode = 'escape'
    brain.stats.waterEscapes++
    logEvent('deep water mid-fight — swimming up and out to shore')
    try {
      const shore = findShore()
      const deadline = Date.now() + 9000
      while (Date.now() < deadline) {
        const p = bot.entity.position
        const feetBlock = bot.blockAt(p)
        const below = bot.blockAt(p.offset(0, -0.6, 0))
        const onLand = !(feetBlock && feetBlock.name === 'water') && !!below && below.boundingBox === 'block' && bot.entity.onGround
        if (onLand && !headInWater()) break
        const dest = shore || (brain.target && brain.target.position)
        if (dest) await bot.lookAt(new Vec3(dest.x, p.y + 0.5, dest.z), true).catch(() => {})
        bot.setControlState('jump', true) // swim up; at the ledge, hop out
        bot.setControlState('forward', true)
        bot.setControlState('sprint', false)
        await sleep(120)
      }
      logEvent(`water escape done: headInWater=${headInWater()}, pos=${bot.entity.position}`)
    } catch (e) {
      logEvent('water escape failed: ' + e.message)
    }
    clearControls()
    brain.nextWaterEscapeAt = Date.now() + WATER_ESCAPE_COOLDOWN_MS
    brain.busy = false
    if (brain.target && brain.target.isValid) {
      brain.mode = 'fight'
      brain.aimPoint = null
    } else {
      brain.mode = 'idle'
      brain.target = null
      brain.targetName = null
    }
  }
  brain.doWaterEscape = doWaterEscape

  // CLIMB (Rafi, 2026-11-17): the fight target is ABOVE the bot and a
  // ladder / vine / scaffolding leads up — climb to him instead of
  // standing underneath. No digging and no 1x1 towering: climb only.
  //
  // Implementation (rebuilt after R4-5 runs 3-4): the pathfinder's
  // goto could not be trusted with ladders — it left the bot pressed
  // against the ladder's face with its centre OUTSIDE the ladder cell
  // (x=113.7 vs the cell at 114), where vanilla never engages the
  // climb, and its move set has no reliable ladder-top exit. So the
  // climb is driven in phases like a player does it:
  //   A) walk INTO the climbable column's cell at the bot's level
  //      (a plain GoalBlock goto — the centre ends inside the cell);
  //   B) manual drive: aim at the target, hold FORWARD (toward the
  //      wall = up the ladder; on flat ground at the top it simply
  //      walks), adding JUMP only when height progress stalls (the
  //      top-out pop onto the ledge);
  //   C) if at the target's height but still short of him, a plain
  //      pathfinder walk across the top.
  const CLIMBABLE_NAMES = new Set(['ladder', 'vine', 'scaffolding'])
  function findClimbColumn () {
    if (!bot.entity) return null
    const bp = bot.entity.position
    let best = null
    let bestD = Infinity
    for (let dx = -6; dx <= 6; dx++) {
      for (let dz = -6; dz <= 6; dz++) {
        for (let dy = -1; dy <= 3; dy++) {
          const cell = new Vec3(Math.floor(bp.x) + dx, Math.floor(bp.y) + dy, Math.floor(bp.z) + dz)
          const b = bot.blockAt(cell)
          if (!b || !CLIMBABLE_NAMES.has(b.name)) continue
          const d = Math.hypot(cell.x + 0.5 - bp.x, cell.z + 0.5 - bp.z)
          if (d < bestD) { bestD = d; best = { x: cell.x, y: cell.y, z: cell.z } }
        }
      }
    }
    return best
  }
  brain.findClimbColumn = findClimbColumn

  async function doClimb () {
    const target = brain.target
    if (!target || !target.isValid || !target.position || brain.busy) return
    brain.busy = true
    brain.mode = 'climb'
    brain.stats.climbs++
    logEvent(`climb: target ${target.username} is above — climbing to him`)
    const arrivedClimb = () => target.isValid && target.position &&
      bot.entity.position.distanceTo(target.position) <= 2.6 &&
      (target.position.y - bot.entity.position.y) <= 1.6
    try {
      // Phase A: get the bot's centre INTO the climbable column.
      const col = findClimbColumn()
      if (col && !arrivedClimb()) {
        try {
          const mv = new Movements(bot)
          mv.canDig = false
          bot.pathfinder.setMovements(mv)
          await Promise.race([bot.pathfinder.goto(new goals.GoalBlock(col.x, col.y, col.z)).catch(() => {}), sleep(5000)])
          bot.pathfinder.setGoal(null)
        } catch (e) {}
      }
      // Phase B: manual climb drive.
      if (!arrivedClimb()) {
        const dl = Date.now() + 14000
        let lastY = bot.entity.position.y
        let lastProgressAt = Date.now()
        while (Date.now() < dl && brain.mode === 'climb' && target.isValid && target.position && !arrivedClimb()) {
          stepAim(target.position.offset(0, 1.0, 0))
          bot.setControlState('forward', true)
          bot.setControlState('sprint', false)
          const y = bot.entity.position.y
          if (y > lastY + 0.05) { lastY = y; lastProgressAt = Date.now() }
          bot.setControlState('jump', Date.now() - lastProgressAt > 1200)
          await sleep(120)
        }
        clearControls()
      }
      // Phase C: at his height but not yet at him — walk the top.
      if (!arrivedClimb() && target.isValid && target.position &&
        (target.position.y - bot.entity.position.y) <= 1.2) {
        try {
          const mv = new Movements(bot)
          mv.canDig = false
          bot.pathfinder.setMovements(mv)
          await Promise.race([bot.pathfinder.goto(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 1.8)).catch(() => {}), sleep(6000)])
          bot.pathfinder.setGoal(null)
        } catch (e) {}
      }
      logEvent(`climb done: arrived=${arrivedClimb()}, pos=${bot.entity.position}`)
    } catch (e) {
      logEvent('climb failed: ' + e.message)
    }
    try { bot.pathfinder.setMovements(new Movements(bot)) } catch (e) {}
    brain.nextClimbAt = Date.now() + CLIMB_COOLDOWN_MS
    brain.busy = false
    if (brain.target && brain.target.isValid) {
      brain.mode = 'fight'
      brain.aimPoint = null
    } else {
      brain.mode = 'idle'
      brain.target = null
      brain.targetName = null
    }
    clearControls()
  }
  brain.doClimb = doClimb

  // ------------------------------------------------------------ eating
  async function doEat () {
    brain.eating = true
    brain.busy = true
    brain.mode = 'eat'
    // The 6 s re-trigger gate in the decision loop runs from the START of
    // any attempt — success, skip or abort. (First Phase 2 suite: aborted /
    // skipped attempts did not reset the gate, so the bot fled four times
    // in one Medium fight, ate nothing, and lost ~7 s of swing time.)
    brain.lastEatAt = Date.now()
    const targetAtStart = brain.target
    logEvent(`health ${bot.health.toFixed(1)} <= 10 — creating distance, then eating a golden apple`)
    let aborted = false
    let pearledAway = false
    try {
      // Fix round 3c — Rafi's heal rule (2026-11-17): the FIRST choice
      // is an ender pearl AWAY from the target. The foot-flee below
      // almost never opened the 4.2-block eating gap against an
      // opponent glued to the bot, so in Rafi's live test the bot ate
      // nothing and lived on totem regen alone. If a pearl fails to
      // teleport the bot (hit a wall / never landed), turn ~120
      // degrees and throw again — up to 3 tries — then fall back to
      // the foot-flee. (After a successful pearl the flee loop sees
      // the gap is already open and exits at once.)
      if (bot.inventory.items().some(i => i.name === 'ender_pearl') && targetAtStart && targetAtStart.position) {
        const away0 = bot.entity.position.minus(targetAtStart.position)
        away0.y = 0
        if (away0.norm() > 0.01) {
          away0.normalize()
          for (let attempt = 0; attempt < 3 && !pearledAway; attempt++) {
            const pearl = bot.inventory.items().find(i => i.name === 'ender_pearl')
            if (!pearl) break
            const ang = attempt * 2.1 + rand(-0.25, 0.25)
            const dir = new Vec3(
              away0.x * Math.cos(ang) - away0.z * Math.sin(ang), 0,
              away0.x * Math.sin(ang) + away0.z * Math.cos(ang))
            brain.stats.healPearls++
            logEvent(`heal: pearling away from the target (attempt ${attempt + 1})`)
            await bot.equip(pearl, 'hand').catch(() => {})
            const before = bot.entity.position.clone()
            await bot.lookAt(bot.entity.position.plus(dir.scaled(14)).offset(0, 2.4, 0), true)
            bot.activateItem()
            pearledAway = await waitTeleported(before, 1300)
            if (!pearledAway) logEvent('heal pearl did not land — turning to a new direction')
          }
        }
      }
      // Phase 1: sprint directly away WITH strafing until a gap opens,
      // max ~1.4 s. A sprinting pursuer (the plugin bot pathfinds at full
      // sprint) nearly matches our speed, so the flee almost never opens
      // the textbook 6.5 blocks — it ends around 4.5-5.
      const fleeDeadline = Date.now() + 1400
      let fleeStrafe = Math.random() < 0.5 ? 'left' : 'right'
      let nextFleeStrafeAt = 0
      while (Date.now() < fleeDeadline) {
        if (!targetAtStart || !targetAtStart.position) break
        if (targetDist() >= 5.5) break
        const nowF = Date.now()
        if (nowF > nextFleeStrafeAt) {
          fleeStrafe = fleeStrafe === 'left' ? 'right' : 'left'
          nextFleeStrafeAt = nowF + rand(280, 480)
        }
        const awayPoint = bot.entity.position.plus(bot.entity.position.minus(targetAtStart.position).scaled(2))
        await bot.lookAt(awayPoint.offset(0, 1.4, 0), true)
        bot.setControlState('forward', true)
        bot.setControlState('sprint', true)
        bot.setControlState('left', fleeStrafe === 'left')
        bot.setControlState('right', fleeStrafe === 'right')
        await sleep(60)
      }
      clearControls()
      // Phase 2: eat if the gap is usable (>= 4.2). Abort only if the
      // opponent gets inside 3.0 — actually inside its own swing range
      // and landing repeated hits. One hit during the eat is an acceptable
      // trade for absorption + regen (Phase 1 ate through hits and the
      // sustain won fights; the first Phase 2 suite's 4-block abort and
      // 5-block requirement meant zero apples were ever eaten).
      const gapNow = targetAtStart && targetAtStart.position ? targetDist() : Infinity
      const apple = bot.inventory.items().find(i => i.name === 'golden_apple')
      if (apple && gapNow >= 4.2) {
        await bot.equip(apple, 'hand')
        let consumeDone = false
        bot.consume().then(() => { consumeDone = true }).catch(() => { consumeDone = true })
        const watchDeadline = Date.now() + 2200
        while (!consumeDone && Date.now() < watchDeadline) {
          await sleep(80)
          if (targetAtStart && targetAtStart.position && targetDist() < 3.0) { aborted = true; break }
        }
        if (aborted) {
          try { bot.deactivateItem() } catch (e) {}
          logEvent('eat ABORTED — opponent inside 3 blocks, back to fighting')
          await sleep(120)
        } else if (consumeDone) {
          brain.stats.gapplesEaten++
          brain.lastEatAt = Date.now()
          logEvent('golden apple eaten')
          // Fix round 3c: stay out a few seconds so the regen +
          // absorption actually restore health before re-engaging
          // (Rafi: heal up first, THEN go back and fight). The fight
          // loop + pearl chase close the distance again afterwards.
          const recDeadline = Date.now() + 2600
          while (Date.now() < recDeadline && bot.health < 16) {
            if (targetAtStart && targetAtStart.position && targetDist() < 3.5) break
            await sleep(200)
          }
        }
      } else if (apple) {
        logEvent(`eat skipped — gap too small (distance ${gapNow === Infinity ? 'n/a' : gapNow.toFixed(1)}), will retry after the cooldown`)
      }
      const sword = findSwordItem()
      if (sword) await bot.equip(sword, 'hand').catch(() => {})
    } catch (e) {
      logEvent('eat interrupted: ' + e.message)
    }
    brain.eating = false
    brain.busy = false
    if (brain.target && brain.target.isValid) {
      brain.mode = 'fight'
      brain.aimPoint = null
    } else {
      brain.mode = 'idle'
      brain.target = null
    }
  }

  // ------------------------------------------------- spear Lunge gap-close
  // Spears exist only in Minecraft 1.21.11+. Every spear path is guarded by
  // item availability, so on 1.21.1 (no spear items exist) this never fires.
  function findSpear () {
    return bot.inventory.items().find(i => i.name.endsWith('_spear'))
  }

  async function spearGapClose () {
    const spear = findSpear()
    if (!spear || brain.busy) return
    brain.busy = true
    brain.spearReadyAt = Date.now() + 5000 // Lunge is a gap-closer, not a spam tool
    try {
      await bot.equip(spear, 'hand')
      brain.spearEquipped = true
      // the equip reset the attack meter — hold the first jab until the
      // spear is fully charged, or it lands as a weak partial hit
      brain.swingReadyAt = Math.max(brain.swingReadyAt, Date.now() + 900)
      logEvent(`spear gap-close: ${spear.name} equipped at ${targetDist().toFixed(1)} blocks`)
      // The physics loop swings the spear (its cooldown is in the table);
      // a landed jab with Lunge propels the bot toward the target.
      brain.stats.spearLunges++
    } catch (e) {}
    brain.busy = false
  }

  // Isolated lunge measurement for tests: NO movement input at all — any
  // displacement after the jab is the Lunge enchantment's propulsion.
  async function spearLungeTest (entity) {
    const result = { hasSpear: false, spearName: null, distBefore: null, swung: false, displacementToward: 0, displacementTotal: 0, error: null }
    brain.lungeResult = result
    const spear = findSpear()
    if (!spear) { result.error = 'no spear in inventory'; return }
    result.hasSpear = true
    result.spearName = spear.name
    if (!entity || !entity.position) { result.error = 'target not visible'; return }
    if (brain.busy) { result.error = 'bot busy'; return }
    brain.busy = true
    brain.mode = 'lunge-test'
    clearControls()
    try {
      await bot.equip(spear, 'hand')
      // Switching items resets the attack meter, and a spear jab needs a
      // full charge (diamond spear ~1.05 s) — a jab fired right after the
      // equip is a weak partial hit and does not trigger Lunge. Wait it out.
      await sleep(1250)
      await bot.lookAt(entity.position.offset(0, 1.3, 0), true)
      const before = bot.entity.position.clone()
      const dir = entity.position.minus(before)
      dir.y = 0
      const dist0 = dir.norm()
      dir.normalize()
      result.distBefore = Math.round(dist0 * 100) / 100
      bot.attack(entity)
      result.swung = true
      brain.stats.swings++
      let maxToward = 0
      let maxTotal = 0
      const deadline = Date.now() + 800
      while (Date.now() < deadline) {
        await sleep(40)
        const delta = bot.entity.position.minus(before)
        delta.y = 0
        const toward = delta.x * dir.x + delta.z * dir.z
        if (toward > maxToward) maxToward = toward
        if (delta.norm() > maxTotal) maxTotal = delta.norm()
      }
      result.displacementToward = Math.round(maxToward * 100) / 100
      result.displacementTotal = Math.round(maxTotal * 100) / 100
      logEvent(`lunge test: ${spear.name} jab at ${result.distBefore} blocks -> displacement toward target ${result.displacementToward} (total ${result.displacementTotal})`)
    } catch (e) {
      result.error = e.message
    }
    brain.mode = 'idle'
    brain.busy = false
  }
  brain.spearLungeTest = spearLungeTest

  // ------------------------------------------ auto-retaliation (self-defense)
  // Fix round 2, Rafi's spec: while the bot stands idle with its kit, WHO
  // hits it and WITH WHAT decides the response:
  //   bare hand / non-weapon item -> NO response at all (a casual hit)
  //   sword / axe / spear         -> attacker becomes the target; kill him
  //   mace                        -> same (plus a pre-emptive shield raise
  //                                  when a mace dive is spotted incoming)
  //   bow / crossbow (arrow hit)  -> if the shooter is reachable, go kill
  //                                  him; if not, raise a shield and block
  //                                  facing him until the threat passes
  // One retaliation target at a time; when it dies, leaves, or stays out
  // of range (leash), the bot goes back to standing idle. All reactions go
  // through the usual humanized 120-250 ms delay — nothing is instant.
  //
  // Attribution method (probed on the local 1.21.1 server): the vanilla
  // `damage_event` packet names the victim (entityId), the responsible
  // living entity (sourceCauseId — the shooter for projectiles, the
  // attacker for melee) and the direct source (sourceDirectId — the arrow
  // entity for projectiles, the attacker himself for melee). That is
  // exact attribution on any 1.20.2+ server. The weapon is read from the
  // attacker's held item at hit time (a mace hit reports damage type
  // "player_attack" on 1.21.1, so the held item is the only weapon
  // signal). Fallback for servers without the packet: a health drop plus
  // a nearby player who swung within the last 700 ms inside melee reach.
  // Limits: the fallback can misattribute when several players brawl next
  // to the bot, and a shooter who swaps weapons within the arrow's flight
  // time is classified by the weapon in hand when the arrow lands.
  //
  // WIRE QUIRK (probed + verified): sourceCauseId / sourceDirectId are
  // optVarInts on the wire — the real entity id is (value - 1), and 0
  // means "no entity". minecraft-data types them as plain varints, so
  // minecraft-protocol hands us the raw shifted value; resolving
  // bot.entities with it directly finds nothing (this exact bug made the
  // first version of this feature silently ignore every hit). entityId,
  // by contrast, is a plain varint and matches bot.entity.id as-is.
  function classifyHeldItem (name) {
    if (!name) return 'unarmed'
    if (name === 'mace') return 'mace'
    if (name === 'bow' || name === 'crossbow') return 'ranged'
    if (name.endsWith('_spear')) return 'spear'
    if (name.endsWith('_sword')) return 'sword'
    if (name.endsWith('_axe') && !name.endsWith('pickaxe')) return 'axe'
    return 'nonweapon'
  }
  brain.classifyHeldItem = classifyHeldItem

  function startRetaliation (entity) {
    endBlock('engaging the attacker')
    if (startFight(entity, 'retaliation')) {
      brain.retaliation = true
      brain.retaliationOutSince = 0
      brain.stats.retaliations++
    }
  }
  brain.startRetaliation = startRetaliation

  // Can the bot actually get to this attacker? Distance gate + a real
  // pathfinder probe (planning only — the bot does not move). A partial
  // path only counts if it ends within hitting distance of the attacker.
  function isReachable (entity) {
    if (!entity || !entity.position || !bot.entity) return false
    const dist = entity.position.distanceTo(bot.entity.position)
    if (dist > RETALIATE_REACH_BLOCKS) return false
    try {
      const movements = new Movements(bot)
      const goal = new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, 2)
      const res = bot.pathfinder.getPathTo(movements, goal, 800)
      if (res.status === 'success') return true
      if (res.status === 'partial' && res.path && res.path.length) {
        const end = res.path[res.path.length - 1]
        return Math.hypot(end.x - entity.position.x, end.z - entity.position.z) <= 4.5
      }
      return false
    } catch (e) {
      return dist <= RETALIATE_REACH_BLOCKS // pathfinder unavailable: distance-only
    }
  }
  brain.isReachable = isReachable

  async function enterBlock (attacker, reason) {
    if (brain.mode === 'fight' || brain.mode === 'block') return
    const shield = bot.inventory.items().find(i => i.name === 'shield')
    brain.mode = 'block'
    brain.block = { name: attacker.username, entityId: attacker.id, since: Date.now(), lastHitAt: Date.now(), lastCheckAt: 0, lastRaiseAt: 0, reason }
    if (!shield) {
      // Spec behaviour needs a shield; without one there is nothing to
      // block with — stay idle and say so in the log (graceful skip).
      logEvent(`shield block wanted (${reason} threat from ${attacker.username}) but NO shield in inventory — staying idle`)
      brain.mode = 'idle'
      brain.block = null
      return
    }
    brain.stats.shieldBlocks++
    logEvent(`shield block: ${reason} threat from ${attacker.username} — raising shield`)
    try {
      await bot.lookAt(attacker.position.offset(0, 1.4, 0), true)
      await bot.equip(shield, 'off-hand')
      bot.activateItem(true) // raise the off-hand shield
      brain.block.lastRaiseAt = Date.now()
    } catch (e) {
      logEvent('shield raise failed: ' + e.message)
    }
  }

  function endBlock (why) {
    if (brain.mode !== 'block' || !brain.block) return
    try { bot.deactivateItem() } catch (e) {}
    brain.block = null
    brain.mode = 'idle'
    logEvent('shield block ended: ' + why)
    equipTotemOffhand().catch(() => {}) // back to the usual idle offhand
  }
  brain.endBlock = endBlock

  // Periodic block upkeep, called from the decision loop while blocking.
  function manageBlock (now) {
    const blk = brain.block
    if (!blk) return
    const e = bot.entities[blk.entityId]
    if (!e || !e.isValid || !e.position) { endBlock('threat gone'); return }
    try { bot.lookAt(e.position.offset(0, 1.4, 0), true) } catch (err) {}
    if (now - (blk.lastRaiseAt || 0) > 1500) { // keep the shield up
      blk.lastRaiseAt = now
      try { bot.activateItem(true) } catch (err) {}
    }
    if (blk.reason === 'mace-dive') {
      const horiz = Math.hypot(e.position.x - bot.entity.position.x, e.position.z - bot.entity.position.z)
      if (e.onGround && horiz <= 4.5) {
        logEvent('retaliation: mace diver landed next to the bot — engaging')
        startRetaliation(e)
      } else if (now - blk.since > 2600) {
        endBlock('mace dive passed without a hit')
      }
      return
    }
    // Ranged threat: re-check reachability every ~2 s — if he comes
    // within reach, stop blocking and go kill him.
    if (now - (blk.lastCheckAt || 0) > 2000) {
      blk.lastCheckAt = now
      if (isReachable(e)) {
        logEvent('retaliation: ranged attacker is now reachable — engaging')
        startRetaliation(e)
        return
      }
    }
    // Stand down only when the threat has clearly passed: no landed hit
    // for a while AND (far beyond bow-retaliation range OR no longer
    // holding a ranged weapon).
    const dist = e.position.distanceTo(bot.entity.position)
    if (now - blk.lastHitAt > BLOCK_FORGET_MS && (dist > 40 || classifyHeldItem(entityHeldName(e)) !== 'ranged')) {
      endBlock('ranged threat has passed')
    }
  }

  function onRangedAttack (attacker) {
    if (brain.mode === 'block' && brain.block) {
      brain.block.lastHitAt = Date.now()
      brain.block.entityId = attacker.id
      brain.block.name = attacker.username
      return
    }
    if (brain.mode !== 'idle' || brain.busy) return
    // Humanized reaction: the decision itself waits 120-250 ms.
    setTimeout(() => {
      if (!attacker.isValid || !attacker.position) return
      if (brain.mode !== 'idle' || brain.busy) return
      const dist = attacker.position.distanceTo(bot.entity.position)
      if (isReachable(attacker)) {
        logEvent(`retaliation: shot by ${attacker.username}, reachable at ${dist.toFixed(1)} blocks — engaging`)
        startRetaliation(attacker)
      } else {
        logEvent(`retaliation: shot by ${attacker.username}, NOT reachable at ${dist.toFixed(1)} blocks — shield block`)
        enterBlock(attacker, 'ranged').catch(() => {})
      }
    }, reactionDelay())
  }

  function handleAttack (attacker, weaponName, kind) {
    if (!attacker || attacker === bot.entity || !attacker.isValid || !attacker.position) return
    const cls = classifyHeldItem(weaponName)
    if (brain.mode === 'block' && brain.block) {
      brain.block.lastHitAt = Date.now()
      // A weapon hit at close quarters ends the block: engage him.
      if (cls === 'sword' || cls === 'axe' || cls === 'spear' || cls === 'mace') {
        logEvent(`retaliation: ${attacker.username} closed in with a ${weaponName} — engaging`)
        startRetaliation(attacker)
      }
      return
    }
    // Fix round 4: a hit landing DURING a fight registers the hitter
    // as another opponent of this fight (the special-mode counter in
    // the decision loop decides what to do about 2+ opponents). It
    // never switches the current target by itself.
    if (brain.mode === 'fight') { registerOpponent(attacker); return }
    if (brain.mode !== 'idle' || brain.busy) return // busy with something else: not a new provocation
    if (kind === 'projectile' || cls === 'ranged') {
      onRangedAttack(attacker)
      return
    }
    if (cls === 'sword' || cls === 'axe' || cls === 'spear' || cls === 'mace') {
      brain.ladder.delete(attacker.id) // a weapon settles it — the ladder no longer applies
      logEvent(`retaliation: hit by ${attacker.username} with ${weaponName} (${kind}) — engaging`)
      startRetaliation(attacker)
    } else {
      // Bare hand / totem / any non-weapon item or block: the fix
      // round 4 ESCALATION LADDER decides (hits 1-2 ignored, as
      // before; then a punch back, a sword pose, then a real fight).
      ladderHit(attacker, weaponName)
    }
  }
  brain.handleAttack = handleAttack

  // ------------------------------------------ fix round 4: ladder + special
  // (1) ESCALATION LADDER (Rafi, 2026-11-17): a player who keeps hitting
  // the idle bot with a bare hand, a totem, or any non-weapon item/block
  // is NOT ignored forever and NOT fought at once. Per attacker:
  //   hit 1, hit 2 -> nothing (the old casual-hit behaviour)
  //   hit 3        -> ONE bare-hand punch back, still no fight
  //   hit 4        -> the bot draws its sword and just STANDS holding
  //                   it (a visible warning), still no attack
  //   hit 5        -> full PvP engage against that attacker
  // The count resets when the player goes LADDER_RESET_MS without a
  // hit. Weapon hits never touch the ladder — they engage immediately
  // under the round-2 rules, and they clear any ladder count the
  // player had built up.
  function ladderHit (attacker, weaponName) {
    const now = Date.now()
    let entry = brain.ladder.get(attacker.id)
    if (!entry || now - entry.lastHitAt > LADDER_RESET_MS) {
      entry = { count: 0, lastHitAt: 0, name: attacker.username }
      brain.ladder.set(attacker.id, entry)
    }
    entry.count++
    entry.lastHitAt = now
    entry.name = attacker.username
    logEvent(`ladder: non-weapon hit #${entry.count} from ${attacker.username} with ${weaponName || 'bare hand'}`)
    if (entry.count >= 5) {
      brain.ladder.delete(attacker.id)
      logEvent(`ladder: ${attacker.username} pushed it to hit #5 — engaging for real`)
      startRetaliation(attacker)
    } else if (entry.count === 4) {
      ladderPose(attacker).catch(() => {})
    } else if (entry.count === 3) {
      ladderPunch(attacker).catch(() => {})
    } else {
      // hits 1-2: exactly the old ignore bookkeeping
      brain.stats.ignoredHits++
      brain.lastIgnoredHit = { name: attacker.username, weapon: weaponName || null, at: now }
    }
  }
  brain.ladderHit = ladderHit

  // Make the main hand GENUINELY empty on the SERVER. A quickbar
  // switch is NOT enough: probe-punch.js (local Paper 1.21.1) showed
  // the server still applying the OLD item to the very next attack
  // (a full 7.5-damage netherite-sword hit with the client showing an
  // empty hand) or eating the swing entirely. The reliable route is a
  // real inventory move: the held stack goes into an empty main-
  // inventory slot, leaving the selected hotbar slot truly empty.
  // The item is MOVED, never dropped (Rafi's no-drop rule). Returns
  // false when there is no empty slot to move it to (the caller then
  // attacks with whatever is held — a crystal still detonates, it
  // just is not the bare-hand click Rafi asked for).
  async function makeHandBare () {
    const handSlot = bot.getEquipmentDestSlot('hand')
    if (!bot.inventory.slots[handSlot]) return true
    const used = new Set(bot.inventory.items().map(i => i.slot))
    let dest = -1
    for (let s = 9; s <= 35; s++) if (!used.has(s)) { dest = s; break }
    if (dest >= 0) {
      await bot.moveSlotItem(handSlot, dest).catch(() => {})
      if (!bot.inventory.slots[bot.getEquipmentDestSlot('hand')]) return true
    }
    // fallback: quickbar switch to an empty hotbar slot (client-side
    // empty; the server may still apply the old item to one swing —
    // logged by callers via the false return when even this fails)
    for (let i = 0; i < 9; i++) {
      if (!bot.inventory.slots[36 + i]) {
        bot.setQuickBarSlot(i)
        return !bot.inventory.slots[bot.getEquipmentDestSlot('hand')]
      }
    }
    return false
  }
  brain.makeHandBare = makeHandBare
  brain.ensureBareHand = makeHandBare // back-compat alias (now async)

  // Hit 3: a single bare-hand punch. Deliberately NOT a fight: no
  // target, no mode change — one swing and back to standing idle.
  async function ladderPunch (attacker) {
    if (brain.ladderBusy) return
    brain.ladderBusy = true
    try {
      await sleep(reactionDelay())
      if (brain.mode !== 'idle' || !attacker.isValid || !attacker.position) return
      if (bot.entity.position.distanceTo(attacker.position) > 3.6) {
        logEvent(`ladder: punch-back at ${attacker.username} skipped — he stepped out of reach`)
        return
      }
      const bare = await makeHandBare()
      // A real item change resets the attack-strength meter server-
      // side; give the fist ~300 ms to charge so the punch lands as a
      // real hit instead of a feather tap (probe-punch.js trial B).
      await sleep(300)
      if (brain.mode !== 'idle' || !attacker.isValid || !attacker.position) return
      await bot.lookAt(attacker.position.offset(0, 1.2, 0), true)
      bot.attack(attacker)
      brain.stats.swings++
      brain.stats.ladderPunches++
      brain.lastLadderPunch = { at: Date.now(), bare, targetName: attacker.username }
      brain.swingReadyAt = Date.now() + DEFAULT_COOLDOWN_MS + rand(0, 35)
      logEvent(`ladder: ONE bare-hand punch back at ${attacker.username} (hit #3 warning, hand truly empty: ${bare})`)
    } catch (e) {
      logEvent('ladder punch failed: ' + e.message)
    }
    brain.ladderBusy = false
  }

  // Hit 4: sword in hand, standing still. No swing, no fight — the
  // drawn sword IS the message. Waits out a punch still in flight so
  // the punch stays bare-handed.
  async function ladderPose (attacker) {
    const deadline = Date.now() + 1200
    while (brain.ladderBusy && Date.now() < deadline) await sleep(60)
    if (brain.ladderBusy) return
    brain.ladderBusy = true
    try {
      if (brain.mode !== 'idle') return
      const sword = findSwordItem()
      if (!sword) { logEvent('ladder: sword pose wanted but no sword in inventory'); return }
      await bot.equip(sword, 'hand')
      brain.ladderPose = { name: attacker.username, at: Date.now() }
      brain.stats.ladderPoses++
      logEvent(`ladder: sword drawn, standing warning pose for ${attacker.username} (hit #4)`)
    } catch (e) {
      logEvent('ladder pose failed: ' + e.message)
    }
    brain.ladderBusy = false
  }

  // (2) SPECIAL MODE bookkeeping: who is currently fighting the bot.
  // The commanded/retaliation target registers in startFight; anyone
  // else who lands a hit mid-fight registers in handleAttack. Entries
  // expire ATTACKER_WINDOW_MS after their last hit (the live target's
  // entry is refreshed by the decision loop, so a 1v1 never expires).
  function registerOpponent (entity) {
    if (!entity || entity === bot.entity || !entity.username) return
    brain.opponents.set(entity.id, { name: entity.username, lastHitAt: Date.now(), entity })
  }
  brain.registerOpponent = registerOpponent

  function recentOpponentCount (now) {
    let n = 0
    for (const [id, o] of brain.opponents) {
      if (!o.entity || !o.entity.isValid || !o.entity.position || now - o.lastHitAt > ATTACKER_WINDOW_MS) {
        brain.opponents.delete(id)
        continue
      }
      n++
    }
    return n
  }
  brain.recentOpponentCount = recentOpponentCount

  // Totems "nearly out" (Rafi's fallback trigger): nothing spare beyond
  // the one sitting in the offhand.
  function spareTotemCount () {
    let offSlot = -1
    try { offSlot = bot.getEquipmentDestSlot('off-hand') } catch (e) {}
    let n = 0
    for (const it of bot.inventory.items()) {
      if (it.name !== 'totem_of_undying') continue
      if (it.slot === offSlot) continue
      n += it.count
    }
    return n
  }
  brain.spareTotemCount = spareTotemCount
  function totemLow () { return spareTotemCount() === 0 }
  brain.totemLow = totemLow

  function hasComboMats () {
    const items = bot.inventory.items()
    return items.some(i => i.name === 'ender_pearl') &&
      items.some(i => i.name === 'wind_charge') &&
      items.some(i => i.name === 'mace')
  }
  brain.hasComboMats = hasComboMats

  // SPECIAL MODE — crystal spam (Rafi, 2026-11-17): outnumbered, the
  // bot stops sword-fighting fair: pearl AWAY briefly, come straight
  // back, then obsidian + end crystal placed as fast as the server
  // accepts them and each crystal DETONATED BY A BARE-HAND CLICK
  // (placing alone does not count — the crystal must explode). No
  // humanized delays, no aim cap, no cover in this mode: speed is the
  // whole point (Rafi explicitly waived the humanizing here). Chains
  // up to CRYSTAL_SPAM_MAX blasts, retargeting to another live
  // opponent when the current one drops, then back to the sword.
  async function doCrystalSpam () {
    const target = brain.target
    if (!target || !target.isValid || !target.position) return
    brain.busy = true
    brain.mode = 'crystalspam'
    clearControls()
    try { bot.pathfinder.setGoal(null) } catch (e) {}
    const startedAt = Date.now()
    const result = { blasts: 0, reason: null, startedAt, firstBlastAt: null, bareHand: false, targetName: brain.targetName }
    brain.lastCrystalSpam = result
    brain.stats.specialModes++
    logEvent(`SPECIAL MODE: outnumbered (${recentOpponentCount(startedAt)} opponents) — crystal spam on ${brain.targetName}`)
    try {
      // 1) brief distance first (Rafi: move away, then come back in)
      if (target.position && bot.inventory.items().some(i => i.name === 'ender_pearl')) {
        await pearlAwayFrom(target.position, 12, 2)
      }
      // 2) the chain
      while (result.blasts < CRYSTAL_SPAM_MAX && Date.now() - startedAt < CRYSTAL_SPAM_CAP_MS) {
        if (brain.mode !== 'crystalspam') { result.reason = 'interrupted'; break }
        let t = (brain.target && brain.target.isValid && brain.target.position) ? brain.target : null
        if (!t) {
          for (const o of brain.opponents.values()) {
            if (o.entity && o.entity.isValid && o.entity.position) {
              t = o.entity
              brain.target = t
              brain.targetName = t.username
              logEvent(`crystal spam: retargeting to ${t.username}`)
              break
            }
          }
        }
        if (!t) { result.reason = 'all opponents gone'; break }
        const mats = crystalMaterials()
        if (!mats.obsidian || !mats.crystal) { result.reason = 'out of obsidian or crystals'; break }
        // close back in to placing distance — fast, no finesse. The
        // opening pearl-away lands FAR (~36 blocks, the known pearl
        // ballistics deviation), so if the gap is big the bot pearls
        // straight back toward the target first, then pathfinds with
        // a longer deadline (run-2 failure: a 3.5 s walk-back never
        // arrived, so no spot was ever in reach).
        const gapNow = t.position.distanceTo(bot.entity.position)
        if (gapNow > 6 && bot.inventory.items().some(i => i.name === 'ender_pearl')) {
          const dir = t.position.minus(bot.entity.position)
          dir.y = 0
          if (dir.norm() > 0.01) {
            dir.normalize()
            await throwPearlDirection(dir, Math.min(14, gapNow * 0.7)).catch(() => {})
          }
        }
        if (t.isValid && t.position && t.position.distanceTo(bot.entity.position) > 2.9) {
          try {
            bot.pathfinder.setGoal(new goals.GoalNear(t.position.x, t.position.y, t.position.z, 2.0))
            const dl = Date.now() + 6000
            while (Date.now() < dl && brain.mode === 'crystalspam' && t.isValid && t.position && t.position.distanceTo(bot.entity.position) > 2.9) await sleep(70)
            bot.pathfinder.setGoal(null)
          } catch (e) {}
        }
        if (brain.mode !== 'crystalspam' || !t.isValid || !t.position) break
        // an already-placed crystal near the target is detonated first
        let crystalEntity = Object.values(bot.entities).find(e =>
          e && e.position && e.position.distanceTo(t.position) < 3.2 &&
          ((e.name || '').includes('crystal') || (e.displayName || '').includes('Crystal')))
        if (!crystalEntity) {
          brain.target = t // findCrystalSpot reads the brain target
          let spot = findCrystalSpot()
          // retry: shuffle closer and look again instead of giving up
          // on the first null (the target may have drifted meanwhile)
          for (let attempt = 0; !spot && attempt < 3 && brain.mode === 'crystalspam' && t.isValid && t.position; attempt++) {
            try {
              bot.pathfinder.setGoal(new goals.GoalNear(t.position.x, t.position.y, t.position.z, 1.6))
              const dl2 = Date.now() + 2500
              while (Date.now() < dl2 && brain.mode === 'crystalspam' && t.isValid && t.position) {
                spot = findCrystalSpot()
                if (spot) break
                await sleep(80)
              }
              bot.pathfinder.setGoal(null)
            } catch (e) {}
            spot = spot || findCrystalSpot()
          }
          if (!spot) { result.reason = 'no placeable spot near the target'; break }
          const below = bot.blockAt(spot.offset(0, -1, 0))
          try {
            await bot.equip(mats.obsidian, 'hand')
            await bot.placeBlock(below, new Vec3(0, 1, 0))
            await sleep(110)
            const placed = bot.blockAt(spot)
            if (!placed || placed.name !== 'obsidian') throw new Error('obsidian did not register')
          } catch (e) { result.reason = 'obsidian placement failed: ' + e.message; break }
          const matsNow = crystalMaterials()
          if (!matsNow.crystal) { result.reason = 'out of crystals mid-chain'; break }
          try {
            await bot.equip(matsNow.crystal, 'hand')
            await bot.placeBlock(bot.blockAt(spot), new Vec3(0, 1, 0))
          } catch (e) {
            // EXPECTED, not a failure: placeBlock always rejects for
            // end crystals ("the block is still air") because a
            // crystal is an ENTITY — the block mineflayer waits to see
            // change stays air even though the crystal spawned. (The
            // round-3 finisher hits the same rejection and survives it
            // by re-finding the entity.) The entity lookup below is
            // the real verdict on whether the placement worked.
          }
          await sleep(120)
          crystalEntity = Object.values(bot.entities).find(e =>
            e && e.position && e.position.distanceTo(spot.offset(0.5, 1, 0.5)) < 2.2 &&
            ((e.name || '').includes('crystal') || (e.displayName || '').includes('Crystal')))
          if (!crystalEntity) { result.reason = 'crystal entity did not appear after placement'; break }
        }
        // DETONATE — bare hand (Rafi's explicit rule for this mode);
        // the hand is emptied with a real inventory move, not just a
        // quickbar switch (probe-punch.js showed the switch is not
        // honoured by the server for the very next attack)
        result.bareHand = await makeHandBare()
        await bot.lookAt(crystalEntity.position.offset(0, 0.4, 0), true)
        bot.attack(crystalEntity)
        brain.stats.crystalBlasts++
        brain.stats.crystalSpamBlasts++
        result.blasts++
        if (!result.firstBlastAt) result.firstBlastAt = Date.now()
        logEvent(`crystal spam: blast #${result.blasts} on ${t.username} (bare-hand detonation: ${result.bareHand})`)
        await sleep(90)
      }
    } catch (e) {
      result.reason = e.message
      logEvent('crystal spam stopped: ' + e.message)
    }
    if (!result.reason) result.reason = result.blasts >= CRYSTAL_SPAM_MAX ? 'chain complete' : 'stopped'
    result.durationMs = Date.now() - startedAt
    logEvent(`crystal spam done: ${JSON.stringify(result)}`)
    const sword = findSwordItem()
    if (sword) await bot.equip(sword, 'hand').catch(() => {})
    brain.nextSpecialAt = Date.now() + SPECIAL_COOLDOWN_MS
    brain.busy = false
    if (brain.target && brain.target.isValid && brain.mode === 'crystalspam') {
      brain.mode = 'fight'
      brain.aimPoint = null
    } else if (brain.mode === 'crystalspam') {
      brain.mode = 'idle'
      brain.target = null
      brain.targetName = null
    }
    clearControls()
  }
  brain.doCrystalSpam = doCrystalSpam

  // Another player's health as this client can read it: mineflayer
  // exposes entity.health when the entity's health metadata is being
  // tracked; otherwise the raw living-entity health metadata slot is
  // the fallback. null = unreadable (callers treat it as "highest",
  // so a known-hurt opponent always wins the pick).
  function entityHealth (e) {
    if (!e) return null
    if (typeof e.health === 'number' && isFinite(e.health) && e.health > 0) return e.health
    const m = e.metadata && e.metadata[9]
    if (typeof m === 'number' && isFinite(m) && m > 0) return m
    return null
  }
  brain.entityHealth = entityHealth

  // Multi-attacker mace targeting (Rafi, 2026-11-17 22:29):
  //  * INITIAL PICK = the LOWEST-health live opponent (re-picked the
  //    same way after every kill);
  //  * NO MID-KILL SWITCHING: once the mace has HIT a player, that
  //    player stays the combo target until he is DEAD — Wind Burst
  //    launches the bot after the hit and it dives back onto the same
  //    player, even if someone else's health drops lower meanwhile;
  //  * only a death (or the target vanishing) releases the lock.
  function pickLowestHealthOpponent () {
    let best = null
    let bestHp = Infinity
    for (const o of brain.opponents.values()) {
      const e = o.entity
      if (!e || !e.isValid || !e.position) continue
      const hp = entityHealth(e)
      const v = hp === null ? Infinity : hp
      if (v < bestHp) { bestHp = v; best = e }
    }
    return best
  }
  brain.pickLowestHealthOpponent = pickLowestHealthOpponent

  function pickMaceTarget () {
    if (brain.maceLockTargetId) {
      const locked = bot.entities[brain.maceLockTargetId]
      if (locked && locked.isValid && locked.position) return locked
      brain.maceLockTargetId = null // he died / vanished — the lock releases
    }
    return pickLowestHealthOpponent() || ((brain.target && brain.target.isValid) ? brain.target : null)
  }
  brain.pickMaceTarget = pickMaceTarget

  // SPECIAL MODE — mace combo (Rafi's revised flow, 2026-11-17
  // 22:20): outnumbered, after at most 2 crystal blasts the bot goes
  // aerial — pearl + wind-charge + mace (Phase-2 machinery, now with
  // capped aim) — and STAYS on the combo while outnumbered, working
  // through the attackers lowest-health-first with the hit-lock
  // above. startCombo owns the bot while it runs and ends in idle;
  // if the target is still standing, the sword fight resumes against
  // the SAME player.
  async function doMaceCombo () {
    const target = pickMaceTarget()
    if (!target) return
    brain.nextComboAt = Date.now() + MULTI_COMBO_COOLDOWN_MS
    brain.nextMaceFallbackAt = Date.now() + MACE_FALLBACK_COOLDOWN_MS
    brain.stats.maceFallbacks++
    brain.stats.maceCombos++
    brain.lastMaceFallback = { at: Date.now(), targetName: target.username, totemSpares: spareTotemCount() }
    brain.lastCombo = { at: Date.now(), targetName: target.username, locked: brain.maceLockTargetId === target.id, healthSeen: entityHealth(target) }
    logEvent(`SPECIAL MODE: mace combo on ${target.username} (${brain.maceLockTargetId === target.id ? 'locked target' : 'lowest-health pick'}, health seen: ${entityHealth(target)})`)
    // the interim sword fight stays on the same player too
    brain.target = target
    brain.targetName = target.username
    await startCombo(target)
    // A landed mace hit LOCKS this target until he dies (Rafi's rule).
    if (brain.comboResult && brain.comboResult.maceSwung && target.isValid) {
      brain.maceLockTargetId = target.id
      logEvent(`mace combo: hit landed on ${target.username} — target LOCKED until he dies`)
    }
    if (!target.isValid) brain.maceLockTargetId = null
    if (target.isValid && bot.health > 0 && brain.mode === 'idle') {
      brain.mode = 'fight'
      brain.target = target
      brain.targetName = target.username
      brain.aimPoint = null
      logEvent('mace combo done — back to the fight on the same target')
    }
  }
  brain.doMaceCombo = doMaceCombo
  brain.doMaceFallback = doMaceCombo // back-compat alias

  // Primary attribution: the vanilla damage_event packet (1.20.2+).
  function onDamageEvent (pkt) {
    try {
      if (!bot.entity || pkt.entityId !== bot.entity.id) return
      // optVarInt decode (see the wire-quirk note above): 0 = absent.
      const causeId = pkt.sourceCauseId > 0 ? pkt.sourceCauseId - 1 : -1
      const directId = pkt.sourceDirectId > 0 ? pkt.sourceDirectId - 1 : -1
      const cause = causeId >= 0 ? bot.entities[causeId] : null
      const projectile = directId >= 0 && directId !== causeId
      if (!cause || cause === bot.entity || cause.type !== 'player') {
        brain.lastDamage = { at: Date.now(), attackerName: null, weapon: null, projectile, sourceTypeId: pkt.sourceTypeId }
        return
      }
      const weapon = entityHeldName(cause)
      brain.lastDamage = { at: Date.now(), attackerName: cause.username, weapon, projectile, sourceTypeId: pkt.sourceTypeId }
      handleAttack(cause, weapon, projectile ? 'projectile' : 'melee')
    } catch (e) {}
  }
  if (bot._client) bot._client.on('damage_event', onDamageEvent)

  // Fallback attribution (servers without damage_event): a health drop
  // with no packet attribution in the last 400 ms -> the player who swung
  // most recently inside melee reach.
  const recentSwings = new Map() // entityId -> timestamp
  const diveSamples = new Map() // entityId -> { y, at } for fall-speed measuring
  let lastHealthSeen = null
  bot.on('health', () => {
    const h = bot.health
    if (lastHealthSeen !== null && h < lastHealthSeen) {
      if (!brain.lastDamage || Date.now() - brain.lastDamage.at > 400) {
        let best = null
        let bestAt = 0
        for (const [id, at] of recentSwings) {
          if (Date.now() - at > 700 || at <= bestAt) continue
          const e = bot.entities[id]
          if (!e || e === bot.entity || e.type !== 'player' || !e.position) continue
          if (e.position.distanceTo(bot.entity.position) > 4.5) continue
          best = e
          bestAt = at
        }
        if (best) {
          brain.lastDamage = { at: Date.now(), attackerName: best.username, weapon: entityHeldName(best), projectile: false, sourceTypeId: null }
          handleAttack(best, entityHeldName(best), 'melee-fallback')
        }
      }
    }
    lastHealthSeen = h
  })

  // ------------------------------------------------------------ mace combo
  // pearl up-forward -> wind charge launch -> pearl toward target from the
  // air -> mace swing while falling. See the header for the grounded-pearl
  // fallback (second wind charge) and why it exists.
  async function waitTeleported (fromPos, timeoutMs, stepThreshold, targetPos, totalThreshold) {
    let prev = bot.entity.position.clone()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await sleep(50)
      const pos = bot.entity.position
      if (pos.distanceTo(prev) > stepThreshold) return true
      if (totalThreshold && pos.distanceTo(fromPos) > totalThreshold) return true
      prev = pos.clone()
    }
    if (targetPos && bot.entity.position.distanceTo(targetPos) <= 4.5) return true
    return false
  }

  async function diveAndSmash (target, result) {
    const mace = bot.inventory.items().find(i => i.name === 'mace')
    if (!mace) { result.error = 'no mace in inventory'; return false }
    await bot.equip(mace, 'hand')
    let peakY = bot.entity.position.y
    const deadline = Date.now() + 4500
    let swung = false
    while (Date.now() < deadline) {
      if (brain.mode !== 'combo') break // cancelled / superseded mid-dive
      if (!target.isValid || !target.position) break
      const bp = bot.entity.position
      if (bp.y > peakY) peakY = bp.y
      stepAim(target.position.offset(0, 1.2, 0)) // capped aim (round 4 revision — no snaps in the combo)
      const horiz = Math.hypot(target.position.x - bp.x, target.position.z - bp.z)
      // Gentle steering only — NO sprint in the air: a probe of the failed
      // suite run showed sprint-drift overshooting the target by ~7
      // blocks during the fall. Walk-drift, and stop pushing inside 1.4.
      bot.setControlState('forward', horiz > 1.4)
      bot.setControlState('sprint', false)
      const falling = bot.entity.velocity.y < -0.12
      const dist = bp.distanceTo(target.position)
      if (falling && dist <= 3.3) {
        bot.attack(target)
        result.maceSwung = true
        result.fallDistanceAtSwing = Math.round((peakY - bp.y) * 10) / 10
        result.swingAt = Date.now()
        brain.stats.swings++
        swung = true
        logEvent(`combo: MACE SWING while falling, fall distance ~${result.fallDistanceAtSwing} blocks`)
        break
      }
      if (bot.entity.onGround) {
        if (dist <= 3.3) {
          // Landed next to the target without a falling swing: a grounded
          // hit is NOT a smash — recorded honestly as such.
          bot.attack(target)
          result.maceSwung = true
          result.fallDistanceAtSwing = 0
          result.groundedSwing = true
          result.swingAt = Date.now()
          brain.stats.swings++
          swung = true
          logEvent('combo: landed next to target — grounded mace swing (NOT a smash)')
        }
        break
      }
      await sleep(40)
    }
    clearControls()
    return swung
  }

  // Throw a wind charge at the bot's own feet and track the launch.
  // Waits for the bot to be grounded and settled first: the burst's boost
  // falls off sharply if the bot is still sliding (e.g. just teleported),
  // which produced launch heights varying from 2.8 to 6.1 blocks in tests.
  async function throwWindChargeAtFeet (byName, step) {
    const settleDeadline = Date.now() + 800
    while (Date.now() < settleDeadline) {
      const v = bot.entity.velocity
      if (bot.entity.onGround && Math.abs(v.x) < 0.05 && Math.abs(v.z) < 0.05) break
      await sleep(50)
    }
    const wc = byName('wind_charge')
    if (!wc) throw new Error('no wind charge in inventory')
    await bot.equip(wc, 'hand')
    await aimAtSmooth(bot.entity.position.offset(0, -4, 0), 400) // capped aim (round 4 revision)
    const groundY = bot.entity.position.y
    bot.activateItem()
    step('wind charge thrown at feet')
    let maxY = groundY
    const launchDeadline = Date.now() + 1600
    while (Date.now() < launchDeadline) {
      await sleep(50)
      if (bot.entity.position.y > maxY) maxY = bot.entity.position.y
      if (bot.entity.velocity.y < 0 && maxY > groundY + 1.5) break // apex passed
    }
    const gain = Math.round((maxY - groundY) * 10) / 10
    step(`wind charge launch: apex y=${maxY.toFixed(1)} (~${gain} blocks gained)`)
    return gain
  }

  async function startCombo (entity) {
    if (brain.busy || !entity || !entity.position) return false
    const myId = ++brain.comboId
    brain.busy = true
    brain.mode = 'combo'
    brain.comboTarget = entity
    const result = { steps: [], path: null, maceSwung: false, groundedSwing: false, fallDistanceAtSwing: 0, swingAt: null, error: null }
    brain.comboResult = result
    const step = s => { result.steps.push(s); logEvent('combo: ' + s) }
    const cancelled = () => brain.comboId !== myId
    const byName = n => bot.inventory.items().find(i => i.name === n)
    clearControls()
    try { bot.pathfinder.setGoal(null) } catch (e) {}
    try {
      await sleep(reactionDelay())
      // -- step 1: pearl up-forward toward the target
      const pearl = byName('ender_pearl')
      if (!pearl) throw new Error('no ender pearl in inventory')
      await bot.equip(pearl, 'hand')
      const dirTo = entity.position.minus(bot.entity.position)
      dirTo.y = 0
      if (dirTo.norm() === 0) dirTo.x = 1
      dirTo.normalize()
      const eye = bot.entity.position.offset(0, 1.62, 0)
      // Flat throw: a local ballistics probe showed steep pearl arcs fly
      // 25-50 blocks (far past any arena target), while a near-flat throw
      // lands ~10 blocks out and a down-forward throw ~3.
      await aimAtSmooth(eye.plus(dirTo.scaled(10)).offset(0, 0.8, 0), 600) // capped aim (round 4 revision)
      const from1 = bot.entity.position.clone()
      bot.activateItem()
      step('pearl #1 thrown flat toward target')
      const tp1 = await waitTeleported(from1, 3000, 1.2, null, 2.5)
      step(tp1 ? 'pearl #1 teleport landed' : 'pearl #1 teleport NOT detected (timeout)')
      if (cancelled()) throw new Error('combo cancelled')
      await sleep(reactionDelay())
      // -- step 2: wind charge at feet -> launch for height
      const launchGain = await throwWindChargeAtFeet(byName, step)
      if (cancelled()) throw new Error('combo cancelled')
      // -- step 3: pearl toward the target from the air (or dive directly)
      const horiz = Math.hypot(entity.position.x - bot.entity.position.x, entity.position.z - bot.entity.position.z)
      let dived = false
      if (horiz <= 3.2 && launchGain >= 3.5) {
        result.path = 'direct dive from the wind-charge apex (target already below)'
        dived = await diveAndSmash(entity, result)
      } else {
        const pearl2 = byName('ender_pearl')
        if (!pearl2) throw new Error('no second ender pearl')
        await bot.equip(pearl2, 'hand')
        // Down-forward short throw (probe: lands ~3-6 blocks toward the
        // target) — aiming at the chest from height overshot by ~10+.
        const dir2 = entity.position.minus(bot.entity.position)
        dir2.y = 0
        if (dir2.norm() === 0) dir2.x = 1
        dir2.normalize()
        const eye2 = bot.entity.position.offset(0, 1.62, 0)
        await aimAtSmooth(eye2.plus(dir2.scaled(3)).offset(0, -1.2, 0), 500) // capped aim (round 4 revision)
        const from2 = bot.entity.position.clone()
        bot.activateItem()
        step('pearl #2 thrown toward target from the air')
        const tp2 = await waitTeleported(from2, 2200, 2.4, entity.position, null)
        step(tp2 ? 'pearl #2 teleport landed' : 'pearl #2 teleport NOT detected (timeout)')
        await sleep(120)
        const horizNow = Math.hypot(entity.position.x - bot.entity.position.x, entity.position.z - bot.entity.position.z)
        if (!bot.entity.onGround && bot.entity.velocity.y < -0.05 && horizNow <= 3.2) {
          result.path = 'pearl #2 arrived airborne above the target — diving straight onto it'
          dived = await diveAndSmash(entity, result)
        } else {
          // Otherwise the pearl leaves us grounded (a pearl teleport
          // resets fall distance — no smash is possible) or too far from
          // the target. Deterministic recovery: close in on the ground,
          // relaunch with a second wind charge directly above the target,
          // and dive from that height. One retry if the dive misses.
          result.path = 'wind-charge relaunch above the target, then dive (pearl landing could not be smashed from)'
          for (let attempt = 1; attempt <= 2 && !dived; attempt++) {
            if (cancelled()) throw new Error('combo cancelled')
            const h = Math.hypot(entity.position.x - bot.entity.position.x, entity.position.z - bot.entity.position.z)
            if (h > 2.6) {
              step(`closing in on the ground (${h.toFixed(1)} blocks out)`)
              const closeDeadline = Date.now() + 1600
              while (Date.now() < closeDeadline) {
                const hh = Math.hypot(entity.position.x - bot.entity.position.x, entity.position.z - bot.entity.position.z)
                if (hh <= 2.6) break
                stepAim(entity.position.offset(0, 1.2, 0)) // capped aim (round 4 revision)
                bot.setControlState('forward', true)
                bot.setControlState('sprint', true)
                await sleep(50)
              }
              clearControls()
            }
            step(`wind charge relaunch #${attempt} next to the target`)
            await throwWindChargeAtFeet(byName, step)
            dived = await diveAndSmash(entity, result)
          }
        }
      }
      if (!dived && !result.error) result.error = 'mace swing never came off'
    } catch (e) {
      result.error = e.message
      step('combo aborted: ' + e.message)
    }
    const sword = findSwordItem()
    if (sword) await bot.equip(sword, 'hand').catch(() => {})
    brain.mode = 'idle'
    brain.comboTarget = null
    brain.busy = false
    clearControls()
    logEvent('combo finished: ' + JSON.stringify(result))
    return true
  }
  brain.startCombo = startCombo

  // ------------------------------------------------------- mending repair
  async function repairArmor () {
    if (brain.busy) return false
    const damagedMending = () => armorPieces().filter(i => hasEnchant(i, 'mending') && damageOf(i) > 0)
    if (!damagedMending().length) {
      brain.lastRepair = { ran: false, reason: 'no damaged Mending armor equipped' }
      return false
    }
    const bottleCount = () => {
      const b = bot.inventory.items().find(i => i.name === 'experience_bottle')
      return b ? b.count : 0
    }
    if (!bottleCount()) {
      brain.lastRepair = { ran: false, reason: 'no XP bottles in inventory' }
      return false
    }
    brain.busy = true
    const prevMode = brain.mode
    brain.mode = 'repair'
    clearControls()
    const before = {}
    for (const i of damagedMending()) before[i.name] = damageOf(i)
    let thrown = 0
    logEvent('repair: throwing XP bottles to mend ' + JSON.stringify(before))
    try {
      // Cap is only a runaway guard: a nearly-broken netherite piece
      // needs ~50+ bottles at real orb-pickup efficiency.
      while (damagedMending().length && bottleCount() > 0 && thrown < 128) {
        // Merged build (fully automatic repair): a repair that began in a
        // safe window during a fight aborts the moment the opponent closes
        // back in — survival first, mending second.
        if (prevMode === 'fight' && brain.target && brain.target.isValid && brain.target.position && targetDist() < 6) {
          logEvent('repair aborted — opponent closed inside 6 blocks')
          break
        }
        const bottle = bot.inventory.items().find(i => i.name === 'experience_bottle')
        await bot.equip(bottle, 'hand')
        await bot.lookAt(bot.entity.position.offset(0, -4, 0), true)
        bot.activateItem()
        thrown++
        brain.stats.xpBottlesUsed++
        await sleep(rand(260, 420)) // human-speed throwing
        if (thrown % 4 === 0) await sleep(rand(500, 800)) // let the orbs drift in
      }
      await sleep(900) // final orb pickup
    } catch (e) {
      logEvent('repair interrupted: ' + e.message)
    }
    const after = {}
    for (const i of armorPieces()) if (hasEnchant(i, 'mending')) after[i.name] = damageOf(i)
    brain.lastRepair = { ran: true, thrown, before, after }
    logEvent('repair done: ' + JSON.stringify(brain.lastRepair))
    const sword = findSwordItem()
    if (sword) await bot.equip(sword, 'hand').catch(() => {})
    brain.mode = (prevMode === 'fight' && brain.target && brain.target.isValid) ? 'fight' : 'idle'
    brain.busy = false
    return true
  }
  brain.repairArmor = repairArmor

  // ------------------------------------------------------- spare-armor swap
  // Fix round 2 (Rafi's rule): the swap is a FALLBACK for when repair is
  // impossible — the piece has no Mending, or there are no XP bottles.
  // A Mending piece with bottles at hand is left alone here: the <=10%
  // repair trigger owns it (and 30 points is below 10% remaining on every
  // diamond/netherite piece, so repair always fires first for those).
  let swapBusy = false
  async function checkArmorSwap () {
    if (swapBusy || brain.busy || brain.eating) return
    try {
      const bottlesAvailable = bot.inventory.items().some(i => i.name === 'experience_bottle')
      for (const dest of ARMOR_DESTS) {
        const worn = bot.inventory.slots[bot.getEquipmentDestSlot(dest)]
        if (!worn || !worn.maxDurability) continue
        const remaining = worn.maxDurability - damageOf(worn)
        if (remaining > SWAP_THRESHOLD) continue
        if (bottlesAvailable && hasEnchant(worn, 'mending')) continue // repair will handle it
        const spare = bot.inventory.items()
          .filter(i => i.name === worn.name)
          .sort((a, b) => damageOf(a) - damageOf(b))[0]
        if (!spare) continue
        if (spare.maxDurability - damageOf(spare) <= remaining) continue
        swapBusy = true
        await sleep(rand(150, 300)) // human-speed inventory action
        await bot.equip(spare, dest)
        brain.stats.armorSwaps++
        logEvent(`armor swap: ${worn.name} had ${remaining} durability left — spare equipped (${spare.maxDurability - damageOf(spare)} left)`)
        swapBusy = false
        return
      }
    } catch (e) { swapBusy = false }
  }

  // --------------------------------------------- crit verification (server)
  // A critical hit makes the SERVER spawn crit particles at the victim.
  // Counting those (near the target, right after our own falling swing) is
  // real verification — Phase 1 only inferred crits from bot-side velocity.
  function onParticlePacket (packet) {
    try {
      if (brain.debugParticles.length < 3) {
        brain.debugParticles.push(JSON.stringify(packet).slice(0, 220))
      }
      // 1.21.x wire shape: packet.particle.type is the particle NAME
      // string ('crit', 'sweep_attack', ...). Numeric-id shapes are kept
      // as fallbacks for other versions.
      let ptype = null
      if (packet.particle && typeof packet.particle.type === 'string') ptype = packet.particle.type
      else if (packet.particle && typeof packet.particle.id === 'number' && bot.registry && bot.registry.particles) {
        const def = bot.registry.particles[packet.particle.id]
        if (def) ptype = def.name
      } else if (typeof packet.particleId === 'number' && bot.registry && bot.registry.particles) {
        const def = bot.registry.particles[packet.particleId]
        if (def) ptype = def.name
      }
      if (ptype !== 'crit') return
      const t = brain.target || brain.comboTarget
      if (!t || !t.position) return
      if (typeof packet.x !== 'number') return
      const d = Math.hypot(packet.x - t.position.x, packet.y - (t.position.y + 1), packet.z - t.position.z)
      if (d > 2.4) return
      brain.stats.critParticlesSeen++
      if (Date.now() - brain.lastSwingAt <= 350 && brain.lastSwingFalling) {
        brain.stats.critVerified++
        logEvent('VERIFIED CRIT — server crit particles at the target after a falling swing')
      }
    } catch (e) {}
  }
  if (bot._client) {
    bot._client.on('particle', onParticlePacket)
    bot._client.on('world_particles', onParticlePacket)
  }

  // Track the target's swings (hit-trading stats for the test report) and
  // remember every player's recent swing (fallback damage attribution).
  bot.on('entitySwingArm', entity => {
    if (brain.target && entity === brain.target) brain.stats.opponentSwings++
    if (entity && entity.type === 'player' && entity !== bot.entity) {
      recentSwings.set(entity.id, Date.now())
    }
  })

  // ------------------------------------------------------------- main loops
  let lastTickAt = Date.now()
  bot.on('physicsTick', () => {
    const now = Date.now()
    const dt = Math.min(0.1, (now - lastTickAt) / 1000)
    lastTickAt = now
    if (brain.mode !== 'fight' || brain.eating) return
    const t = brain.target
    if (!t || !t.isValid || !t.position) {
      logEvent('target gone — fight over')
      brain.mode = 'idle'
      brain.target = null
      clearControls()
      return
    }
    const dist = targetDist()
    updateAim(dt)
    fightMovement(now, dist)
    maybeStartCrit(now, dist)
    trySwing(now, dist)
  })

  // Slower decision loop: survival checks + threat scan + upkeep.
  const decisionTimer = setInterval(() => {
    const now = Date.now()
    if (!bot.entity) return
    // spare-armor swap upkeep (any mode except mid-combo / lunge test)
    if (now - brain.lastSwapCheckAt > 500) {
      brain.lastSwapCheckAt = now
      if (brain.mode !== 'combo' && brain.mode !== 'lunge-test') checkArmorSwap().catch(() => {})
    }
    // safe-moment repair: idle + a Mending piece down to <=10% durability
    // remaining (fix round 2 trigger) + bottles at hand. This one trigger
    // covers most of Rafi's automatic-repair spec: the bot is idle between
    // fights, its target just died (the fight loop drops to idle), and a
    // pearl-out ends in idle too.
    if (brain.mode === 'idle' && !brain.busy && now - brain.lastRepairCheckAt > 1500) {
      brain.lastRepairCheckAt = now
      const hasBottles = bot.inventory.items().some(i => i.name === 'experience_bottle')
      if (hasBottles && repairTriggered()) {
        repairArmor().catch(() => {})
      }
    }
    // Fully automatic repair, fight lull (merged build): the target is
    // still engaged but far away and the bot is healthy — a safe window
    // inside the fight. Same <=10% trigger (fix round 2). repairArmor
    // restores fight mode when done and aborts early if the opponent
    // closes inside 6 blocks.
    if (brain.mode === 'fight' && !brain.busy && !brain.eating && now - brain.lastFightRepairCheckAt > 4000) {
      brain.lastFightRepairCheckAt = now
      if (targetDist() >= 14 && bot.health >= 18) {
        const hasBottles = bot.inventory.items().some(i => i.name === 'experience_bottle')
        if (hasBottles && repairTriggered()) {
          logEvent('safe window in fight (target far) — automatic Mending repair')
          repairArmor().catch(() => {})
        }
      }
    }
    // ---- auto-retaliation upkeep (fix round 2) ----
    // Shield-block management: face the threat, keep the shield up,
    // engage if he becomes reachable, stand down when the threat passes.
    if (brain.mode === 'block' && brain.block) {
      manageBlock(now)
    }
    // Mace-dive early warning: a player falling fast toward the bot with
    // a mace in hand gets a pre-emptive shield raise (the dive itself is
    // then handled by manageBlock / the damage attribution on landing).
    // Fall speed is measured from position deltas: the server sends no
    // velocity packets for a plain gravity fall, so a remote player's
    // entity.velocity stays ~0 while he drops.
    if (brain.mode === 'idle' && !brain.busy && bot.entity) {
      for (const e of Object.values(bot.entities)) {
        if (!e || e.type !== 'player' || e === bot.entity || !e.position) continue
        if (entityHeldName(e) !== 'mace') continue
        const horiz = Math.hypot(e.position.x - bot.entity.position.x, e.position.z - bot.entity.position.z)
        if (horiz > 8) { diveSamples.delete(e.id); continue }
        const prev = diveSamples.get(e.id)
        diveSamples.set(e.id, { y: e.position.y, at: now })
        if (!prev || now - prev.at < 50) continue
        const vyPerSec = (e.position.y - prev.y) / ((now - prev.at) / 1000)
        const above = e.position.y - bot.entity.position.y
        if (horiz <= 6.5 && above >= 1.2 && vyPerSec < -7) {
          logEvent(`retaliation: mace dive incoming from ${e.username} (fall speed ${vyPerSec.toFixed(1)} b/s) — pre-emptive shield raise`)
          enterBlock(e, 'mace-dive').catch(() => {})
          break
        }
      }
    }
    // Retaliation leash: a self-defense target that stays out of range
    // for a sustained period is given up on — back to standing idle.
    // (Commanded fights are never leashed; startFight clears the flag.)
    // Fix round 3: while the bot still carries ender pearls there is no
    // stand-down — the pearl chase closes the gap instead (Rafi: a
    // retaliation fight ends when the attacker is dead, not when he
    // runs). The leash remains for the no-pearl case only.
    if (brain.retaliation && brain.mode === 'fight') {
      const hasPearl = bot.inventory.items().some(i => i.name === 'ender_pearl')
      if (!hasPearl && targetDist() > RETALIATE_LEASH_BLOCKS) {
        if (!brain.retaliationOutSince) brain.retaliationOutSince = now
        else if (now - brain.retaliationOutSince > RETALIATE_LEASH_MS) {
          logEvent('retaliation: target out of range for 8s — standing down')
          stopAll('retaliation-leash')
        }
      } else {
        brain.retaliationOutSince = 0
      }
    }
    // Fix round 4 revision: PERSISTENT FINISHER CLOCK. Accumulated
    // fight time grows ONLY while the bot is in 'fight' mode against
    // the clock's target; every other mode (eat, escape, pearl-out,
    // idle stand-down...) PAUSES it. Leaving fight mode starts a
    // grace countdown — re-engaging the same target inside the grace
    // window keeps the accumulated time; past it, the clock wipes.
    {
      const dtClock = Math.max(0, Math.min(500, now - (brain.lastClockTickAt || now)))
      brain.lastClockTickAt = now
      if (brain.prevDecisionMode === 'fight' && brain.mode !== 'fight' &&
        brain.fightClockTargetId !== null && !brain.fightClockExpiresAt) {
        brain.fightClockExpiresAt = now + FIGHT_CLOCK_GRACE_MS
      }
      brain.prevDecisionMode = brain.mode
      if (brain.mode === 'fight' && brain.target && brain.fightClockTargetId === brain.target.id) {
        brain.fightTimeMs += dtClock
        brain.fightClockExpiresAt = 0
      } else if (brain.fightClockTargetId !== null && brain.fightClockExpiresAt && now > brain.fightClockExpiresAt) {
        brain.fightTimeMs = 0
        brain.fightClockTargetId = null
        brain.fightClockExpiresAt = 0
      }
    }
    if (brain.mode === 'fight' && !brain.eating) {
      // fix round 4: opponent bookkeeping — the live target's entry is
      // refreshed so a 1v1 never expires; 2+ distinct recent opponents
      // opens special territory and starts its clock.
      if (brain.target) registerOpponent(brain.target)
      const oppCount = recentOpponentCount(now)
      if (oppCount >= 2) { if (!brain.specialSince) brain.specialSince = now } else brain.specialSince = 0
      // totem upkeep (+ pop detection)
      if (now - brain.lastTotemCheckAt > 400) {
        brain.lastTotemCheckAt = now
        const off = bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')]
        const hasTotem = off && off.name === 'totem_of_undying'
        if (!hasTotem && brain.offhandWasTotem && bot.health > 0) {
          brain.stats.totemPops++
          logEvent('totem popped — re-equipping')
        }
        brain.offhandWasTotem = !!hasTotem
        if (hasTotem) {
          brain.totemReequipAt = 0
        } else if (!brain.totemReequipAt) {
          // Fix round 3b: TotemGuard flagged the bot's INSTANT totem
          // re-equip (AutoTotemA, VL 3/4 in Rafi's live test). A human
          // needs a moment to swap a fresh totem in — wait a randomized
          // 500-1100 ms before re-equipping.
          brain.totemReequipAt = now + rand(500, 1100)
        } else if (now >= brain.totemReequipAt) {
          brain.totemReequipAt = 0
          equipTotemOffhand().catch(() => {})
        }
      }
      // pearl-out threat scan
      const held = targetHeldName()
      if (held === 'end_crystal' || held === 'respawn_anchor') {
        if (!brain.threatSeenAt) {
          brain.threatSeenAt = now
          brain.threatItem = held
        } else if (now - brain.threatSeenAt >= reactionDelay() && brain.mode === 'fight') {
          doPearlOut(brain.threatItem).catch(() => {})
          return
        }
      } else {
        brain.threatSeenAt = 0
        brain.threatItem = null
      }
      // fix round 4: CLIMB — the target is well above the bot and
      // close horizontally: climb (ladder/vine/scaffolding) instead
      // of standing underneath him.
      if (!brain.busy && !brain.eating && brain.target && brain.target.position && now >= brain.nextClimbAt && !headInWater()) {
        const dyT = brain.target.position.y - bot.entity.position.y
        const hdT = Math.hypot(brain.target.position.x - bot.entity.position.x, brain.target.position.z - bot.entity.position.z)
        if (dyT >= CLIMB_MIN_DY && hdT <= CLIMB_MAX_HORIZ) {
          doClimb().catch(() => {})
        }
      }
      // fix round 3: pearl chase — the target ran far away and stays
      // away; pearl to him and resume. Skipped at low health (a pearl
      // costs health on landing) and while another action owns the bot.
      if (!brain.busy && !brain.eating && bot.health > 6) {
        const dFar = targetDist()
        if (dFar > PEARL_CHASE_MIN_BLOCKS) {
          if (!brain.farSince) brain.farSince = now
          else if (now - brain.farSince > PEARL_CHASE_SUSTAIN_MS && now >= brain.nextPearlChaseAt) {
            doPearlChase().catch(() => {})
          }
        } else brain.farSince = 0
      }
      // fix round 4 REVISED SPECIAL MODE (Rafi, 2026-11-17 22:20):
      // 2+ opponents -> AT MOST 2 fast crystal blasts (once per
      // outnumbered episode), then the aerial MACE COMBO, repeated
      // while still outnumbered (a 3rd attacker changes nothing).
      // Totem-low no longer gates the combo — it is the primary flow.
      // Checked BEFORE the 45 s finisher: outnumbered is urgent.
      if (oppCount >= 2) brain.multiSeenAt = now
      else if (brain.multiCrystalDone && now - (brain.multiSeenAt || 0) > 10000) brain.multiCrystalDone = false
      if (!brain.busy && oppCount >= 2) {
        const comboMats = hasComboMats()
        const matsS = crystalMaterials()
        const spamMats = !!(matsS.obsidian && matsS.crystal)
        if (!brain.multiCrystalDone && spamMats && now >= brain.nextSpecialAt) {
          brain.multiCrystalDone = true
          doCrystalSpam().catch(() => {})
        } else if (comboMats && now >= brain.nextComboAt && (brain.multiCrystalDone || !spamMats)) {
          doMaceCombo().catch(() => {})
        }
      }
      // fix round 3 + 4 revision: crystal finisher — the ACCUMULATED
      // sword fight against this same target (persistent clock above)
      // has dragged past the threshold; switch to crystals (the
      // finisher itself falls back to the sword when materials end).
      if (!brain.busy && !brain.eating &&
        brain.target && brain.target.id === brain.fightClockTargetId &&
        brain.fightTimeMs >= (brain.crystalAfterMs || CRYSTAL_AFTER_MS) &&
        now >= brain.nextCrystalAt) {
        const mats = crystalMaterials()
        if (mats.obsidian && mats.crystal && mats.cover) doCrystalFinisher().catch(() => {})
        else brain.nextCrystalAt = now + CRYSTAL_COOLDOWN_MS
      }
      // spear gap-close: target parked in the 3.5-4.6 band (inert on 1.21.1).
      // Fix round 3: OFF in normal mode — Rafi's rule is sword only; the
      // lunge test hook below stays available for the test harness.
      const dist = targetDist()
      if (!brain.swordOnly && !brain.busy && dist > SWING_RANGE && dist <= 4.6 && now >= brain.spearReadyAt && findSpear()) {
        spearGapClose().catch(() => {})
      }
      if (brain.spearEquipped && dist <= SWING_RANGE) {
        const sword = findSwordItem()
        if (sword) {
          brain.spearEquipped = false
          bot.equip(sword, 'hand').catch(() => {})
          logEvent('spear gap-close done — sword re-equipped')
        }
      }
      // fix round 4: WATER ESCAPE — head under water mid-fight for
      // more than a moment: swim out to shore and resume (Rafi saw
      // the bot stand underwater staring, twice). Runs before the
      // cobweb/fire checks: drowning stillness is the worse bug.
      if (!brain.busy && !brain.eating) {
        if (headInWater()) {
          if (!brain.deepWaterSince) brain.deepWaterSince = now
          else if (now - brain.deepWaterSince > DEEP_WATER_CONFIRM_MS && now >= brain.nextWaterEscapeAt) {
            brain.deepWaterSince = 0
            doWaterEscape().catch(() => {})
          }
        } else brain.deepWaterSince = 0
      }
      // fix round 3d: cobweb escape + fire/water bucket
      if (!brain.busy && !brain.eating) {
        if (inCobweb()) {
          if (!brain.webSince) brain.webSince = now
          // Rafi (2026-11-17): escape IMMEDIATELY when a web lands on
          // the bot — the 150 ms here is just two decision ticks of
          // confirmation, not a wait.
          if (now - brain.webSince > 150 && now >= brain.nextWebEscapeAt) {
            brain.webSince = 0
            doCobwebEscape().catch(() => {})
          }
        } else brain.webSince = 0
        if (isOnFire()) {
          if (!brain.fireSince) brain.fireSince = now
          // Rafi: if the fire has not gone out by itself within
          // ~2-3 seconds, put it out with the water bucket.
          if (now - brain.fireSince > 2500 && now >= brain.nextWaterAt &&
            bot.inventory.items().some(i => i.name === 'water_bucket')) {
            doWaterBucket().catch(() => {})
          }
        } else brain.fireSince = 0
      }
      // eat check (gated on busy + fight mode since round 3d: an
      // ungated doEat once fired DURING a cobweb escape and the two
      // sequences fought over the bot)
      if (!brain.busy && brain.mode === 'fight' && bot.health <= 10 && bot.health > 0 && now - brain.lastEatAt > 6000) {
        const apple = bot.inventory.items().find(i => i.name === 'golden_apple')
        if (apple) doEat().catch(() => {})
      }
    }
  }, 100)
  bot.on('end', () => clearInterval(decisionTimer))

  bot.on('death', () => {
    if (brain.block) {
      try { bot.deactivateItem() } catch (e) {}
      brain.block = null
    }
    brain.retaliation = false
    brain.retaliationOutSince = 0
    brain.ladder.clear() // fix round 4: death wipes provocations + opponents
    brain.opponents.clear()
    brain.specialSince = 0
    brain.fightClockTargetId = null // fix round 4 revision: death wipes the finisher clock
    brain.fightTimeMs = 0
    brain.fightClockExpiresAt = 0
    brain.maceLockTargetId = null
    brain.multiCrystalDone = false
    brain.mode = 'idle'
    brain.target = null
    clearControls()
  })

  // ------------------------------------------------------------ control API
  // Merged build: the Phase 1/2 in-game chat control is replaced by this
  // API. bot.js drives it from (a) the Discord #bot-panel and (b) in-game
  // whispers — both allowlist-gated in bot.js / lib/panel-commands.js.
  function findPlayer (name) {
    return Object.values(bot.entities).find(e => e.type === 'player' && e.username === name)
  }
  brain.findPlayer = findPlayer

  brain.fightPlayerByName = function (name, source) {
    const entity = findPlayer(name)
    if (!entity) { logEvent(`fight command (via ${source}): player ${name} not visible`); return false }
    return startFight(entity, source)
  }

  brain.comboPlayerByName = function (name, source) {
    const entity = findPlayer(name)
    if (!entity) { logEvent(`combo command (via ${source}): player ${name} not visible`); return false }
    startCombo(entity).catch(() => {})
    return true
  }

  brain.comeToEntity = function (entity, source) {
    if (!entity || !entity.position) return false
    stopAll(source)
    brain.mode = 'come'
    try { bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2.2)) } catch (e) { brain.mode = 'idle'; return false }
    logEvent(`coming to ${entity.username} (via ${source})`)
    return true
  }

  brain.comeToPlayerByName = function (name, source) {
    const entity = findPlayer(name)
    if (!entity) { logEvent(`come command (via ${source}): player ${name} not visible`); return false }
    return brain.comeToEntity(entity, source)
  }

  // Test/debug aids kept from the Phase 2 harness (not panel-exposed).
  brain.setCritPractice = function (on) {
    brain.critPractice = !!on
    logEvent('crit practice mode ' + (brain.critPractice ? 'ON' : 'OFF'))
  }
  brain.lungeTestPlayerByName = function (name) {
    const entity = findPlayer(name)
    if (entity) { spearLungeTest(entity).catch(() => {}); return true }
    return false
  }

  bot.on('goal_reached', () => {
    if (brain.mode === 'come') {
      brain.mode = 'idle'
      logEvent('reached commander')
    }
  })

  return brain
}

module.exports = { attachPvpBrain }
