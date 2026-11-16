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
const { pathfinder, goals } = mineflayerPathfinder
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
const SWAP_THRESHOLD = 30 // durability points left -> swap in a spare

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
    mode: 'idle', // idle | fight | eat | pearlout | come | combo | repair | lunge-test
    target: null,
    targetName: null,
    busy: false, // an async routine (eat / combo / repair / lunge test) owns the bot
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
    lastEatAt: 0,
    eating: false,
    // pearl-out
    threatSeenAt: 0,
    threatItem: null,
    pearlOut: null, // { item, displacement, success, at } once resolved
    // spear
    spearReadyAt: 0,
    spearEquipped: false,
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
    stats: { swings: 0, critSwings: 0, critVerified: 0, critParticlesSeen: 0, gapplesEaten: 0, totemPops: 0, pearlOuts: 0, armorSwaps: 0, xpBottlesUsed: 0, spearLunges: 0, opponentSwings: 0 },
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
    const t = brain.target
    if (!t) return null
    const held = t.heldItem || (t.equipment && t.equipment[0])
    return held ? held.name : null
  }

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
    brain.target = entity
    brain.targetName = entity.username || 'unknown'
    brain.mode = 'fight'
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
    brain.mode = 'idle'
    brain.target = null
    brain.targetName = null
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
    }
    const chest = t.position.offset(0, 1.30, 0).plus(brain.aimErr)
    if (!brain.aimPoint) brain.aimPoint = chest.clone()
    // chase the target point at a limited speed -> visible tracking lag,
    // instead of a perfect instant snap.
    const delta = chest.minus(brain.aimPoint)
    const maxStep = 16 * dt // blocks per second of aim travel
    if (delta.norm() > maxStep) delta.scale(maxStep / delta.norm())
    brain.aimPoint.add(delta)
    bot.lookAt(brain.aimPoint, true)
  }

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
  function trySwing (now, dist) {
    if (now < brain.engageAt) return
    if (now < brain.swingReadyAt) return
    if (dist > SWING_RANGE) return
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
    try {
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
      if (!target.isValid || !target.position) break
      const bp = bot.entity.position
      if (bp.y > peakY) peakY = bp.y
      await bot.lookAt(target.position.offset(0, 1.2, 0), true)
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
    await bot.lookAt(bot.entity.position.offset(0, -4, 0), true)
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
      await bot.lookAt(eye.plus(dirTo.scaled(10)).offset(0, 0.8, 0), true)
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
        await bot.lookAt(eye2.plus(dir2.scaled(3)).offset(0, -1.2, 0), true)
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
            const h = Math.hypot(entity.position.x - bot.entity.position.x, entity.position.z - bot.entity.position.z)
            if (h > 2.6) {
              step(`closing in on the ground (${h.toFixed(1)} blocks out)`)
              const closeDeadline = Date.now() + 1600
              while (Date.now() < closeDeadline) {
                const hh = Math.hypot(entity.position.x - bot.entity.position.x, entity.position.z - bot.entity.position.z)
                if (hh <= 2.6) break
                await bot.lookAt(entity.position.offset(0, 1.2, 0), true)
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
      while (damagedMending().length && bottleCount() > 0 && thrown < 40) {
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
  let swapBusy = false
  async function checkArmorSwap () {
    if (swapBusy || brain.busy || brain.eating) return
    try {
      for (const dest of ARMOR_DESTS) {
        const worn = bot.inventory.slots[bot.getEquipmentDestSlot(dest)]
        if (!worn || !worn.maxDurability) continue
        const remaining = worn.maxDurability - damageOf(worn)
        if (remaining > SWAP_THRESHOLD) continue
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

  // Track the target's swings (hit-trading stats for the test report).
  bot.on('entitySwingArm', entity => {
    if (brain.target && entity === brain.target) brain.stats.opponentSwings++
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
    // safe-moment repair: idle + damaged Mending armor + bottles at hand.
    // This one trigger covers most of Rafi's automatic-repair spec: the
    // bot is idle between fights, its target just died (the fight loop
    // drops to idle), and a pearl-out ends in idle too.
    if (brain.mode === 'idle' && !brain.busy && now - brain.lastRepairCheckAt > 1500) {
      brain.lastRepairCheckAt = now
      const hasBottles = bot.inventory.items().some(i => i.name === 'experience_bottle')
      if (hasBottles && armorPieces().some(i => hasEnchant(i, 'mending') && damageOf(i) > 0)) {
        repairArmor().catch(() => {})
      }
    }
    // Fully automatic repair, fight lull (merged build): the target is
    // still engaged but far away and the bot is healthy — a safe window
    // inside the fight. repairArmor restores fight mode when done and
    // aborts early if the opponent closes inside 6 blocks.
    if (brain.mode === 'fight' && !brain.busy && !brain.eating && now - brain.lastFightRepairCheckAt > 4000) {
      brain.lastFightRepairCheckAt = now
      if (targetDist() >= 14 && bot.health >= 18) {
        const hasBottles = bot.inventory.items().some(i => i.name === 'experience_bottle')
        if (hasBottles && armorPieces().some(i => hasEnchant(i, 'mending') && damageOf(i) > 0)) {
          logEvent('safe window in fight (target far) — automatic Mending repair')
          repairArmor().catch(() => {})
        }
      }
    }
    if (brain.mode === 'fight' && !brain.eating) {
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
        if (!hasTotem) equipTotemOffhand().catch(() => {})
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
      // spear gap-close: target parked in the 3.5-4.6 band (inert on 1.21.1)
      const dist = targetDist()
      if (!brain.busy && dist > SWING_RANGE && dist <= 4.6 && now >= brain.spearReadyAt && findSpear()) {
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
      // eat check
      if (bot.health <= 10 && bot.health > 0 && now - brain.lastEatAt > 6000) {
        const apple = bot.inventory.items().find(i => i.name === 'golden_apple')
        if (apple) doEat().catch(() => {})
      }
    }
  }, 100)
  bot.on('end', () => clearInterval(decisionTimer))

  bot.on('death', () => {
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
