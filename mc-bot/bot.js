'use strict'
// Madara_1ea — MERGED BUILD (PvP brain + Madara lifecycle).
//
// Built from the live Madara code (~/workspace/mc-bot-render/bot.js) with
// the Phase 2 PvP brain (lib/pvp-brain.js) merged in, per Rafi's spec:
//
//   KEPT from Madara: Minecraft connection + AuthMe login flow (env-driven,
//     MC_LOGIN_CMD — never hardcoded), the Render health server, the
//     Discord bridge + #bot-panel with the SAME allowlist semantics
//     (DISCORD_OWNER_ID + DISCORD_ALLOWED_IDS), the spawn watchdog and the
//     reconnect ladder, minimal anti-AFK (gentle look-around), and the
//     idle auto-totem upkeep.
//   REMOVED (extras OFF): greetings + double-crouch behaviour, !hii,
//     whisper owner pings. The bot idles silently, standing at its spot.
//   RESTORED 2026-11-21 (Rafi's order, exactly five): playerlist image
//     card (!p / playerlist), status image card (!s / status) — now with
//     the bot's own HEALTH + HUNGER on it — both cards auto-delete after
//     1 minute (a reply to a deleted card gets a mention notice), mention
//     alerts (both directions), and join/leave owner pings.
//   ADDED: the full Phase 2 PvP brain — custom combat loop, humanized
//     120–250 ms reactions, crits, pearl-out rule, mace combo, spear
//     Lunge, hotbar self-organization, and FULLY AUTOMATIC armor care
//     (spare swap + XP-bottle Mending repair in safe windows, no command
//     needed). Controls: Discord panel (!pvp fight/stop/come/combo) and
//     in-game whispers from allowlisted players ("pvp fight" / "pvp stop").

const mineflayer = require('mineflayer')
const http = require('http')
const { attachPvpBrain } = require('./lib/pvp-brain')
const {
  isAllowedPanelUser,
  isAllowedMcName,
  parsePanelCommand,
  parseWhisperCommand,
  parsePrivateMessage
} = require('./lib/panel-commands')

const config = {
  host: process.env.MC_HOST || 'mc.havencraft.pro',
  port: parseInt(process.env.MC_PORT || '2566', 10),
  username: process.env.MC_USER || 'Madara_1ea',
  loginCommand: (process.env.MC_LOGIN_CMD || '').trim(),
  // Discord bridge (optional - only used if DISCORD_MC_TOKEN is set)
  discordToken: process.env.DISCORD_MC_TOKEN || '',
  discordChannelId: process.env.DISCORD_CHANNEL_ID || '',
  discordOwnerId: process.env.DISCORD_OWNER_ID || '',
  // Extra Discord users allowed to use the bridge channel (comma-separated IDs).
  discordAllowedIds: (process.env.DISCORD_ALLOWED_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // In-game usernames allowed to drive the bot by whisper (/msg). Rafi's
  // own accounts by default (the live code's status feature already knew
  // alxxq + mother_one; .Rafi_PRX is his Bedrock name). Override with
  // MC_PVP_ALLOWLIST (comma-separated) — not a secret, just a name list.
  pvpAllowlist: (process.env.MC_PVP_ALLOWLIST || 'alxxq,.Rafi_PRX,mother_one')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function log (msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}
function sleep (ms) { return new Promise((r) => setTimeout(r, ms)) }

log(`Login command configured: ${config.loginCommand ? 'YES' : 'NO (MC_LOGIN_CMD secret missing!)'}`)
log(`Discord allowlist: ${config.discordAllowedIds.length} extra user(s) allowed in the bridge channel.`)
log(`PvP whisper allowlist: ${config.pvpAllowlist.join(', ')}`)

// Health server for Render Web Service hosting: Render gives the service a
// PORT and expects it to answer HTTP; UptimeRobot pings it to keep the free
// service awake. (Same as the live build.)
if (process.env.PORT) {
  const healthPort = parseInt(process.env.PORT, 10)
  http
    .createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Madara_1ea bot is running.')
    })
    .listen(healthPort, () => log(`Health server listening on port ${healthPort}.`))
}

let failCount = 0
let bot = null
let brain = null // the PvP brain attached to the current bot instance
let afkTimer = null
let totemTimer = null
let spawnWatchdogTimer = null // forces a reconnect if a connection hangs before spawn
let reconnectScheduled = false // prevents double-scheduling when kick+end fire together
let lastLoginSent = 0

// Track messages the bot itself sends, so the relay doesn't echo them back.
let lastBotSay = { text: '', at: 0 }
function botSay (text) {
  lastBotSay = { text: String(text), at: Date.now() }
  bot.chat(text)
}

function sendLogin () {
  if (!config.loginCommand) {
    log('Cannot login: MC_LOGIN_CMD secret is not set!')
    return
  }
  const now = Date.now()
  if (now - lastLoginSent < 10000) return // don't spam
  lastLoginSent = now
  try {
    botSay(config.loginCommand)
    log('Sent login command.')
  } catch (e) { log('Login chat failed: ' + e.message) }
}

function brainBusy () {
  return !!(brain && (brain.busy || brain.mode !== 'idle'))
}

function startBot () {
  log(`Connecting as ${config.username} to ${config.host}:${config.port} (fails so far: ${failCount})`)
  bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: false // auto-detect server version
  })
  brain = attachPvpBrain(bot, { reactionMinMs: 120, reactionMaxMs: 250 })

  // Spawn watchdog: a connection can hang silently — no spawn, no error, no
  // kick (seen 2026-11-10 on Render) — and the event-based reconnect would
  // never fire. If this bot has not spawned within 90s, force a reconnect.
  const thisBot = bot
  if (spawnWatchdogTimer) clearTimeout(spawnWatchdogTimer)
  spawnWatchdogTimer = setTimeout(() => {
    if (bot === thisBot) {
      log('Spawn watchdog: not spawned after 90s, forcing a reconnect.')
      scheduleReconnect()
    }
  }, 90000)

  bot.on('spawn', () => {
    if (spawnWatchdogTimer) { clearTimeout(spawnWatchdogTimer); spawnWatchdogTimer = null }
    log(`Spawned. Server version: ${bot.version}`)
    failCount = 0
    lastLoginSent = 0
    // join notification (10-min cooldown so reconnect loops don't spam pings)
    const nowJ = Date.now()
    if (nowJ - lastJoinPingAt > 10 * 60 * 1000) {
      lastJoinPingAt = nowJ
      pingOwner('🔔 Madara has joined the Minecraft server!')
      log('Sent join notification to Discord.')
    }
    setTimeout(sendLogin, 4000)
    // retry login a few times in case the auth plugin was slow
    setTimeout(sendLogin, 12000)
    setTimeout(sendLogin, 25000)
    startAntiAfk()
    startTotemUpkeep()
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    // AuthMe-style prompt -> send login right away. (The live build's !hii
    // reply is REMOVED in the merged build — extras OFF.)
    if (/\/login|please login|log in/i.test(message)) {
      log('Server asked for login, sending command...')
      setTimeout(sendLogin, 1500)
    }
  })

  // Vanilla/Paper whisper event -> PvP duel control (allowlisted only).
  bot.on('whisper', (username, message) => {
    handleWhisper(username, message, 'whisper-event')
  })

  // Raw-message fallback: some servers use custom chat formats that
  // mineflayer's 'chat' event doesn't parse. This keeps the login-prompt
  // detection, the whisper control (Essentials-style /msg formats) and the
  // Discord relay working on those servers too. NO mention alerts and NO
  // whisper owner-pings in the merged build — whispers are either PvP
  // commands or dropped silently.
  bot.on('messagestr', (msgStr, _pos, _orig, sender) => {
    try {
      const s = (msgStr || '').trim()
      if (!s) return
      const senderName = nameForSender(sender)
      // skip the bot's own messages
      if (senderName === config.username) return
      // never relay anything containing the login command
      if (config.loginCommand && s.includes(config.loginCommand)) return
      // Private message TO the bot: /msg or /r -> PvP whisper control.
      const priv = privateMsgInfo(s)
      if (priv) {
        // skip echo of the bot's own !say (a !say'd whisper-shaped string)
        if (!(lastBotSay.text && Date.now() - lastBotSay.at < 8000 && s.includes(lastBotSay.text))) {
          handleWhisper(senderName || priv.sender, priv.text, 'messagestr')
        }
        return // whispers are never relayed as public chat
      }
      if (!senderName) {
        // unknown sender: fall back to text heuristics
        if (s.includes(config.username)) return
        // skip echo of something the bot just said itself (e.g. via !say)
        if (lastBotSay.text && Date.now() - lastBotSay.at < 8000 && s.includes(lastBotSay.text)) return
      }
      // AuthMe rejected the login -> log it (the live build pinged the
      // owner on Discord; owner pings are REMOVED in the merged build).
      if (/wrong password|incorrect password|not registered|login failed/i.test(s)) {
        log('AuthMe says the login failed (wrong password?). Check the MC_LOGIN_CMD secret.')
      }
      // Madara/Rafi/Admin mention alert for in-game chat: ping the owner on
      // Discord. Requires a known player sender so join/leave/system
      // messages can't false-trigger. 5-minute cooldown: no mention spam.
      if (config.discordOwnerId && senderName && /madara|rafi|admin/i.test(s)) {
        const nowM = Date.now()
        if (nowM - lastMcMentionPingAt > 5 * 60 * 1000) {
          lastMcMentionPingAt = nowM
          sendToDiscord(`<@${config.discordOwnerId}> 🔔 Someone mentioned you on the server!`)
          log(`Mention alert (MC) from ${senderName}.`)
        }
      }
      // login prompt fallback
      if (/\/login|please login|log in/i.test(s)) {
        log('Server asked for login (raw), sending command...')
        setTimeout(sendLogin, 1500)
      }
      // relay -> Discord, with the sender's in-game name when known
      const out = senderName ? `<${senderName}> ${s}` : prettyRelay(s)
      sendToDiscord(sanitize(out))
    } catch (e) { /* ignore */ }
  })

  bot.on('kicked', (reason) => {
    log('KICKED: ' + JSON.stringify(reason).slice(0, 300))
    scheduleReconnect()
  })

  bot.on('error', (err) => log('ERROR: ' + err.message))
  bot.on('end', () => {
    log('Connection ended.')
    scheduleReconnect()
  })

  // Totem pop detection: entity_status 35 on our own entity = a totem just
  // popped. Round 5: the pop is stamped into the PvP brain in ANY mode —
  // the brain's single choke point (delayed, F-key swap) owns every
  // offhand refill now. The debounced refill below only tops up the
  // MAIN hand while idle, as before.
  bot._client.on('entity_status', (packet) => {
    try {
      if (!bot || !bot.entity) return
      if (packet.entityId === bot.entity.id && packet.entityStatus === 35) {
        if (brain && brain.noteTotemPop) { try { brain.noteTotemPop() } catch (e) {} }
        if (!brainBusy()) {
          log('Totem popped! Scheduling replacement...')
          scheduleTotemRefill()
        }
      }
    } catch (e) { /* ignore */ }
  })
}

/* ---------- whisper control (Rafi's duel flow) ---------- */
// He TPs the bot to himself in-game, then whispers it:
//   /msg Madara_1ea pvp fight   -> the bot fights the SENDER
//   /msg Madara_1ea pvp stop    -> the bot stands down
// Only allowlisted in-game names (MC_PVP_ALLOWLIST) may do this. The same
// whisper can arrive via the 'whisper' event AND the messagestr fallback
// on some servers — dedupe identical commands for a few seconds.
let lastWhisperCmd = { key: '', at: 0 }
function handleWhisper (username, message, via) {
  try {
    if (!username || username === config.username) return
    const cmd = parseWhisperCommand(message)
    if (!cmd) return // an ordinary whisper, not a command — stay silent
    if (!isAllowedMcName(username, config.pvpAllowlist)) {
      log(`Whisper command from NON-allowlisted ${username} ignored (${via}).`)
      return
    }
    const key = username.toLowerCase() + '|' + cmd.action
    const now = Date.now()
    if (lastWhisperCmd.key === key && now - lastWhisperCmd.at < 3000) return
    lastWhisperCmd = { key, at: now }
    if (!brain || !bot || !bot.entity) return
    if (cmd.action === 'fight-sender') {
      const entity = brain.findPlayer(username)
      if (entity) {
        brain.startFight(entity, `whisper:${username}`)
        log(`Whisper duel: ${username} -> pvp fight (via ${via}).`)
      } else {
        log(`Whisper duel: ${username} asked to fight but is not visible.`)
      }
    } else if (cmd.action === 'stop') {
      brain.stopAll(`whisper:${username}`)
      log(`Whisper duel: ${username} -> pvp stop (via ${via}).`)
    }
  } catch (e) { log('Whisper handler error: ' + e.message) }
}

/* ---------- anti-AFK: gentle look-around (minimal, idle only) ---------- */
function startAntiAfk () {
  if (afkTimer) clearInterval(afkTimer)
  afkTimer = setInterval(() => {
    if (!bot || !bot.entity || brainBusy()) return
    try {
      const yaw = bot.entity.yaw + (Math.random() - 0.5) * 1.2
      const pitch = (Math.random() - 0.5) * 0.4
      bot.look(yaw, pitch, true)
    } catch (e) { /* ignore */ }
  }, 30000)
}

/* ---------- auto-totem while idle (kept from Madara) ---------- */
// Keeps Totems of Undying in both hands while the bot stands at its spot.
// Gated to idle: in a fight the PvP brain owns the hands (sword + offhand
// totem) and re-equips its own totem.
const TOTEM_REPLACE_DELAY_MS = 6000 // configurable replacement delay
let totemRefillTimer = null
let totemRefillBusy = false
let lastNoTotemLogAt = 0

function handHasTotem (dest) {
  try {
    if (!bot || !bot.inventory) return false
    const slot = bot.getEquipmentDestSlot(dest) // 'off-hand' or 'hand'
    const item = bot.inventory.slots[slot]
    return !!item && item.name === 'totem_of_undying'
  } catch (e) { return false }
}

// Find a totem in the main inventory, ignoring ones already equipped,
// so we never steal a totem from one hand to fill the other.
function findSpareTotem () {
  try {
    if (!bot || !bot.inventory) return null
    const skip = new Set()
    try { skip.add(bot.getEquipmentDestSlot('off-hand')) } catch (e) {}
    try { skip.add(bot.getEquipmentDestSlot('hand')) } catch (e) {}
    return bot.inventory.items().find((it) => it && it.name === 'totem_of_undying' && !skip.has(it.slot)) || null
  } catch (e) { return null }
}

// One refill pass: offhand first (survival priority), then main hand.
// Lock-guarded so repeated pops can never overlap; no totems -> do nothing.
// Round 5: the OFFHAND refill is delegated to the brain's choke point
// (brain.requestTotemRefill — delayed after a pop, F-key swap method).
// bot.js no longer equips a totem into the offhand itself; the main-hand
// top-up below is unchanged (idle-only, debounced, not the flagged
// pattern).
async function refillTotems () {
  if (totemRefillBusy) return
  if (!bot || !bot.entity || !bot.inventory) return
  if (brainBusy()) return // the brain owns the hands while active
  totemRefillBusy = true
  try {
    if (!handHasTotem('off-hand')) {
      if (brain && brain.requestTotemRefill) {
        try { await brain.requestTotemRefill('idle') } catch (e) {}
      } else if (findSpareTotem()) {
        // Brain not attached (should not happen): keep the old route.
        try { await bot.equip(findSpareTotem(), 'off-hand'); log('Auto-totem: equipped totem to off-hand.') } catch (e) {}
      }
    }
    for (const dest of ['hand']) {
      if (handHasTotem(dest)) continue
      const totem = findSpareTotem()
      if (!totem) {
        const nowL = Date.now()
        if (nowL - lastNoTotemLogAt > 5 * 60 * 1000) {
          lastNoTotemLogAt = nowL
          log(`Auto-totem: no spare totem for ${dest} (waiting for one).`)
        }
        continue
      }
      try {
        await bot.equip(totem, dest)
        log(`Auto-totem: equipped totem to ${dest}.`)
      } catch (e) {
        log(`Auto-totem equip failed (${dest}): ${e.message}`)
      }
    }
  } catch (e) { /* ignore */ }
  totemRefillBusy = false
}

// Debounced: pops during the wait collapse into a single refill pass.
function scheduleTotemRefill () {
  if (totemRefillTimer) return // already scheduled
  totemRefillTimer = setTimeout(() => {
    totemRefillTimer = null
    refillTotems()
  }, TOTEM_REPLACE_DELAY_MS)
}

function startTotemUpkeep () {
  if (totemTimer) clearInterval(totemTimer)
  // every 15 seconds: top up empty hands with totems while idle
  totemTimer = setInterval(() => refillTotems(), 15000)
}

/* ---------- reconnect logic ---------- */
function scheduleReconnect () {
  if (reconnectScheduled) return // kick+end (or the watchdog) can race here
  reconnectScheduled = true
  if (afkTimer) { clearInterval(afkTimer); afkTimer = null }
  if (totemTimer) { clearInterval(totemTimer); totemTimer = null }
  try { if (bot) bot.quit() } catch (e) {}
  bot = null
  brain = null
  failCount++
  // Rafi's retry ladder (2026-11-10): 5s, 10s, 30s, 1m, then every 5 minutes.
  const RETRY_LADDER_MS = [5000, 10000, 30000, 60000, 300000]
  const delay = RETRY_LADDER_MS[Math.min(failCount, RETRY_LADDER_MS.length) - 1]
  log(`Reconnecting in ${delay / 1000}s ... (consecutive fails: ${failCount})`)
  setTimeout(() => { reconnectScheduled = false; startBot() }, delay)
}

/* ---------- Discord bridge (chat relay + #bot-panel) ---------- */
let discordClient = null
let discordChannel = null
let lastMadaraPingAt = 0 // anti-spam cooldown for Discord-side Madara mention alerts
let lastMcMentionPingAt = 0 // anti-spam cooldown for in-game (MC) mention alerts
let lastJoinPingAt = 0 // anti-spam cooldown for join notifications

function sanitize (s) {
  return String(s).replace(/@/g, '@\u200b') // stop @everyone / @here pings
}
function sendToDiscord (text) {
  if (!discordChannel) return
  discordChannel.send(String(text).slice(0, 1900)).catch(() => {})
}
// Mention the owner on Discord (fire-and-forget).
function pingOwner (text) {
  if (!config.discordOwnerId) return
  sendToDiscord(`<@${config.discordOwnerId}> ${text}`)
}
// Awaitable version for shutdown paths where the process is about to exit.
async function pingOwnerAsync (text) {
  if (!config.discordOwnerId || !discordChannel) return false
  try {
    await discordChannel.send(`<@${config.discordOwnerId}> ${text}`.slice(0, 1900))
    return true
  } catch (e) { return false }
}

// Turn HavenCraft-style "RANK name » message" into clean "<name> message".
// Anything else (auctions, join/leave, system) is passed through as-is.
function prettyRelay (s) {
  const clean = String(s).replace(/§[0-9a-fk-or]/gi, '')
  const m = clean.match(/^(.*?)»\s*([\s\S]*)$/)
  if (m) {
    const tokens = m[1].trim().split(/\s+/)
    let name = tokens[tokens.length - 1] || ''
    name = name.replace(/^[^a-zA-Z0-9_]+/, '').replace(/[^a-zA-Z0-9_]+$/, '')
    if (name) return `<${name}> ${m[2].trim()}`
  }
  return clean.trim()
}

// Detect a private message TO the bot: /msg or /r (reply).
// The parsing itself lives in lib/panel-commands.js (parsePrivateMessage)
// so it is unit-testable — see test-whisper-parser.js. It covers the
// vanilla whisper format and the Essentials bracket formats, tolerates
// rank decoration around BOTH names, and preserves Bedrock leading dots
// (the previous inline version stripped '.', which broke the allowlist
// match for ".Rafi_PRX" on the live server — fix round 2).
// Returns { sender, text } or null.
function privateMsgInfo (s) {
  return parsePrivateMessage(s, { meName: config.username, allowlist: config.pvpAllowlist })
}

// Resolve a chat packet sender UUID -> player name via the tab list.
function nameForSender (sender) {
  if (!sender || !bot || !bot.players) return null
  const su = String(sender).toLowerCase().replace(/-/g, '')
  if (!su) return null
  for (const name of Object.keys(bot.players)) {
    const p = bot.players[name]
    const pu = String((p && p.uuid) || '').toLowerCase().replace(/-/g, '')
    if (pu && pu === su) return name
  }
  return null
}

// Execute a parsed PvP panel command against the brain. Returns a short
// human-readable outcome for the panel reply.
function runPanelPvp (cmd, source) {
  if (!bot || !bot.entity || !brain) return 'MC bot is not connected right now, try again in a bit.'
  if (cmd.action === 'stop') {
    brain.stopAll(source)
    return 'PvP stopped.'
  }
  if (cmd.action === 'come') {
    // The panel operator has no in-game body; come to the first online
    // allowlisted in-game player instead.
    for (const name of config.pvpAllowlist) {
      if (brain.comeToPlayerByName(name, source)) return `Coming to ${name}.`
    }
    return 'No allowlisted player is online in-game right now.'
  }
  if (cmd.action === 'fight') {
    return brain.fightPlayerByName(cmd.target, source)
      ? `Fighting ${cmd.target}.`
      : `${cmd.target} is not visible to the bot right now.`
  }
  if (cmd.action === 'combo') {
    return brain.comboPlayerByName(cmd.target, source)
      ? `Combo started on ${cmd.target}.`
      : `${cmd.target} is not visible to the bot right now.`
  }
  return 'Unknown PvP command.'
}

/* ---------- panel info cards (restored 2026-11-21) ---------- */
// ==== PLAYERLIST-CARD-START ====
// Designed Playerlist + Status cards: rendered as PNG images in the
// HavenCraft purple style (Rafi approved the designs 2026-11-09). Heads
// come from mc-heads (Java skins; Bedrock/unknown players get its default
// Steve face). Any failure anywhere falls back to the text versions.
// Rafi's 2026-11-21 additions: the Status card also shows the bot's own
// HEALTH + HUNGER, and every card message auto-deletes after 1 minute —
// a reply to a deleted card gets a mention notice (see the panel handler).
const CARD_MAX_PLAYERS = parseInt(process.env.MC_MAX_PLAYERS || '50', 10)
const CARD_DELETE_MS = 60 * 1000 // cards disappear 1 minute after posting
const headCache = new Map()
const deletedCardIds = new Map() // card message id -> deletion time (for reply notices)
let sharpModule // undefined = not tried yet, null = unavailable

function setupCardFonts () {
  try {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const dir = path.join(__dirname, 'fonts')
    if (!fs.existsSync(dir)) return
    const conf = path.join(os.tmpdir(), 'mc-bot-fonts.conf')
    fs.writeFileSync(
      conf,
      `<?xml version="1.0"?><fontconfig><dir>${dir}</dir><cachedir>${os.tmpdir()}</cachedir></fontconfig>`
    )
    process.env.FONTCONFIG_FILE = conf
  } catch (_) {
    /* system fonts are fine too */
  }
}

function loadSharp () {
  if (sharpModule !== undefined) return sharpModule
  try {
    setupCardFonts()
    sharpModule = require('sharp')
  } catch (_) {
    sharpModule = null
  }
  return sharpModule
}

async function fetchHeadBase64 (name) {
  if (headCache.has(name)) return headCache.get(name)
  let out = null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch('https://mc-heads.net/avatar/' + encodeURIComponent(name) + '/100', {
      signal: ctrl.signal
    })
    clearTimeout(t)
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > 100) out = buf.toString('base64')
    }
  } catch (_) {
    /* letter tile fallback */
  }
  headCache.set(name, out)
  return out
}

function cardPingColor (ping) {
  if (ping === null) return '#9ca3af'
  if (ping < 50) return '#4ade80'
  if (ping < 120) return '#fbbf24'
  return '#f87171'
}

function xmlEsc (s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Delete a card message 1 minute after it was posted, and remember its id
// so a later reply to it can be answered with the auto-delete notice.
function scheduleCardDelete (sentMsg) {
  if (!sentMsg || !sentMsg.id) return
  setTimeout(() => {
    sentMsg.delete().then(() => {
      deletedCardIds.set(sentMsg.id, Date.now())
      const cutoff = Date.now() - 60 * 60 * 1000
      for (const [id, at] of deletedCardIds) if (at < cutoff) deletedCardIds.delete(id)
    }).catch(() => {})
  }, CARD_DELETE_MS)
}

async function buildPlayerlistCard (players) {
  const sharp = loadSharp()
  if (!sharp) return null
  const W = 1280
  const PAD = 36
  const GAP = 16
  const CELL_W = (W - PAD * 2 - GAP) / 2
  const CELL_H = 78
  const GRID_Y = 100
  const rows = Math.max(1, Math.ceil(players.length / 2))
  const H = GRID_Y + rows * CELL_H + (rows - 1) * GAP + 30
  const heads = await Promise.all(players.map((p) => fetchHeadBase64(p.name)))
  const tileColors = ['#4c1d95', '#6d28d9', '#7c3aed', '#831843', '#581c87', '#701a75', '#5b21b6', '#9333ea']

  let cells = ''
  players.forEach((p, i) => {
    const x = PAD + (i % 2) * (CELL_W + GAP)
    const y = GRID_Y + Math.floor(i / 2) * (CELL_H + GAP)
    const pc = cardPingColor(p.ping)
    const pingText = p.ping === null ? '? ping' : `${p.ping} ping`
    const head = heads[i]
      ? `<clipPath id="hc${i}"><rect x="${x + 13}" y="${y + 13}" width="52" height="52" rx="10"/></clipPath><image x="${x + 13}" y="${y + 13}" width="52" height="52" clip-path="url(#hc${i})" href="data:image/png;base64,${heads[i]}"/>`
      : `<rect x="${x + 13}" y="${y + 13}" width="52" height="52" rx="10" fill="${tileColors[i % tileColors.length]}"/><text x="${x + 39}" y="${y + 51}" font-family="Poppins" font-weight="700" font-size="26" fill="#ffffff" text-anchor="middle">${xmlEsc(p.name[0].toUpperCase())}</text>`
    cells += `
    <g>
      <rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" rx="16" fill="#12121f" stroke="#26263f"/>
      ${head}
      <text x="${x + 82}" y="${y + 50}" font-family="Poppins" font-weight="600" font-size="25" fill="#f4f4fa">${xmlEsc(p.name)}</text>
      <text x="${x + CELL_W - 24}" y="${y + 50}" font-family="Poppins" font-weight="600" font-size="23" fill="${pc}" text-anchor="end">${pingText}</text>
    </g>`
  })

  const badgeText = `${players.length} / ${CARD_MAX_PLAYERS}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="26" fill="#0a0a15" stroke="#3b2d5c" stroke-width="2"/>
  <text x="${PAD}" y="60" font-family="Poppins" font-weight="700" font-size="40" fill="#ffffff">Online Players</text>
  <rect x="${W - PAD - 132}" y="24" width="132" height="46" rx="23" fill="none" stroke="#22c55e" stroke-width="2"/>
  <text x="${W - PAD - 66}" y="57" font-family="Poppins" font-weight="600" font-size="24" fill="#4ade80" text-anchor="middle">${badgeText}</text>
  ${cells}
</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}
// ==== PLAYERLIST-CARD-END ====

// Status card: same style as the Playerlist card. The HEALTH + HUNGER row
// shows the BOT's own values (another player's exact health/food is not
// visible to the bot). Returns a PNG buffer, or null for the text fallback.
async function buildStatusCard ({ position, block, health, food, nearbyPlayers, entities }) {
  const sharp = loadSharp()
  if (!sharp) return null
  const W = 1280
  const PAD = 36
  const panelW = (W - PAD * 2 - 16) / 2
  const playersJoined = nearbyPlayers.length ? nearbyPlayers.join(', ') : 'None nearby'
  const playersText = playersJoined.length > 90 ? playersJoined.slice(0, 90) + '…' : playersJoined
  const healthText = health === null || health === undefined ? '—' : `${health} / 20`
  const foodText = food === null || food === undefined ? '—' : `${food} / 20`

  let entitiesSection = ''
  let H
  if (entities.length) {
    const COLS = 3
    const GAP = 14
    const CHIP_W = (W - PAD * 2 - (COLS - 1) * GAP) / COLS
    const CHIP_H = 58
    const GRID_Y = 412
    let chips = ''
    entities.forEach(([name, count], i) => {
      const cx = PAD + (i % COLS) * (CHIP_W + GAP)
      const cy = GRID_Y + Math.floor(i / COLS) * (CHIP_H + GAP)
      const countText = `${count}x`
      const pillW = Math.max(56, countText.length * 13 + 26)
      chips += `
      <g>
        <rect x="${cx}" y="${cy}" width="${CHIP_W}" height="${CHIP_H}" rx="14" fill="#12121f" stroke="#26263f"/>
        <text x="${cx + 18}" y="${cy + 37}" font-family="Poppins" font-weight="500" font-size="20" fill="#f4f4fa">${xmlEsc(name)}</text>
        <rect x="${cx + CHIP_W - 18 - pillW}" y="${cy + 14}" width="${pillW}" height="30" rx="15" fill="#3b1470"/>
        <text x="${cx + CHIP_W - 18 - pillW / 2}" y="${cy + 36}" font-family="Poppins" font-weight="700" font-size="17" fill="#d8b4fe" text-anchor="middle">${countText}</text>
      </g>`
    })
    const rows = Math.ceil(entities.length / COLS)
    H = GRID_Y + rows * CHIP_H + (rows - 1) * GAP + 32
    entitiesSection = `
  <rect x="${PAD}" y="378" width="7" height="26" rx="3" fill="#a855f7"/>
  <text x="${PAD + 18}" y="400" font-family="Poppins" font-weight="700" font-size="23" fill="#ffffff">Nearby Entities</text>
  <text x="${W - PAD}" y="400" font-family="Poppins" font-weight="500" font-size="18" fill="#8f8fb0" text-anchor="end">${entities.length} types</text>
  ${chips}`
  } else {
    H = 412
    entitiesSection = `
  <rect x="${PAD}" y="378" width="7" height="26" rx="3" fill="#a855f7"/>
  <text x="${PAD + 18}" y="400" font-family="Poppins" font-weight="700" font-size="23" fill="#ffffff">Nearby Entities</text>
  <text x="${W - PAD}" y="400" font-family="Poppins" font-weight="500" font-size="18" fill="#8f8fb0" text-anchor="end">None nearby</text>`
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="26" fill="#0a0a15" stroke="#3b2d5c" stroke-width="2"/>
  <text x="${PAD}" y="60" font-family="Poppins" font-weight="700" font-size="40" fill="#ffffff">Status</text>
  <rect x="${W - PAD - 168}" y="24" width="168" height="46" rx="23" fill="none" stroke="#22c55e" stroke-width="2"/>
  <circle cx="${W - PAD - 140}" cy="47" r="6" fill="#4ade80"/>
  <text x="${W - PAD - 124}" y="56" font-family="Poppins" font-weight="600" font-size="21" fill="#4ade80">In Game</text>
  <rect x="${PAD}" y="92" width="${panelW}" height="98" rx="16" fill="#12121f" stroke="#26263f"/>
  <text x="${PAD + 22}" y="126" font-family="Poppins" font-weight="600" font-size="16" fill="#a78bfa" letter-spacing="3">POSITION</text>
  <text x="${PAD + 22}" y="168" font-family="Poppins" font-weight="600" font-size="31" fill="#f4f4fa">${xmlEsc(position)}</text>
  <rect x="${PAD + panelW + 16}" y="92" width="${panelW}" height="98" rx="16" fill="#12121f" stroke="#26263f"/>
  <text x="${PAD + panelW + 38}" y="126" font-family="Poppins" font-weight="600" font-size="16" fill="#a78bfa" letter-spacing="3">STANDING ON</text>
  <text x="${PAD + panelW + 38}" y="168" font-family="Poppins" font-weight="600" font-size="31" fill="#f4f4fa">${xmlEsc(block)}</text>
  <rect x="${PAD}" y="206" width="${panelW}" height="66" rx="16" fill="#12121f" stroke="#26263f"/>
  <text x="${PAD + 22}" y="232" font-family="Poppins" font-weight="600" font-size="15" fill="#f87171" letter-spacing="3">HEALTH</text>
  <text x="${PAD + 22}" y="262" font-family="Poppins" font-weight="600" font-size="25" fill="#f4f4fa">${xmlEsc(healthText)}</text>
  <rect x="${PAD + panelW + 16}" y="206" width="${panelW}" height="66" rx="16" fill="#12121f" stroke="#26263f"/>
  <text x="${PAD + panelW + 38}" y="232" font-family="Poppins" font-weight="600" font-size="15" fill="#fbbf24" letter-spacing="3">HUNGER</text>
  <text x="${PAD + panelW + 38}" y="262" font-family="Poppins" font-weight="600" font-size="25" fill="#f4f4fa">${xmlEsc(foodText)}</text>
  <rect x="${PAD}" y="288" width="${W - PAD * 2}" height="66" rx="16" fill="#12121f" stroke="#26263f"/>
  <text x="${PAD + 22}" y="329" font-family="Poppins" font-weight="600" font-size="16" fill="#a78bfa" letter-spacing="3">NEARBY PLAYERS</text>
  <text x="${PAD + 268}" y="330" font-family="Poppins" font-weight="500" font-size="22" fill="${nearbyPlayers.length ? '#f4f4fa' : '#8f8fb0'}">${xmlEsc(playersText)}</text>
  ${entitiesSection}
</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function replyPlayerList (msg) {
  if (!bot || !bot.entity) {
    await msg.reply('MC bot is not connected right now, try again in a bit.').catch(() => {})
    return
  }
  // Every player in the tab list, no exclusions — including the bot itself.
  // A-Z order, case-insensitive (Rafi's list format, 2026-11-09).
  const names = Object.keys(bot.players || {}).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  )
  const players = names.map((n) => {
    const p = bot.players[n]
    return { name: n, ping: p && typeof p.ping === 'number' ? p.ping : null }
  })
  // Designed image card first; the plain text list stays as the fallback.
  // Both forms auto-delete after 1 minute.
  try {
    const card = await buildPlayerlistCard(players)
    if (card) {
      const sent = await msg.reply({ files: [{ attachment: card, name: 'playerlist.png' }] })
      scheduleCardDelete(sent)
      log(`Discord playerlist card -> ${players.length} players.`)
      return
    }
  } catch (e) {
    log('Playerlist card failed, using text: ' + e.message)
  }
  const entries = players.map((p) => (p.ping === null ? `${p.name}-?ping` : `${p.name}-${p.ping}ping`))
  const text = entries.length
    ? `Online Players: ${entries.join(', ')}`
    : 'Online Players: N/A'
  const sentText = await msg.reply(text.slice(0, 1900)).catch(() => null)
  scheduleCardDelete(sentText)
  log(`Discord playerlist -> ${entries.length} players.`)
}

// The command sender's known in-game accounts, in order. Status always
// reports the owner's surroundings, whoever on the allowlist asked.
const STATUS_SENDER_NAMES = ['alxxq', 'mother_one']

// 'iron_golem' -> 'Iron Golem', 'zombie' -> 'Zombie'.
function humanizeEntityName (name) {
  return String(name || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

async function replyStatus (msg) {
  if (!bot || !bot.entity) {
    await msg.reply('MC bot is not connected right now, try again in a bit.').catch(() => {})
    return
  }
  // The sender's in-game entity when online and near the bot. Otherwise fall
  // back to the bot's own surroundings, so the command always returns a
  // result instead of only an error (the server only sends entity data for
  // the bot's surroundings, so a far-away/offline sender has no tracked entity).
  // The fallback is silent (no note line) per the owner's request.
  let senderName = null
  let refPos = null
  for (const n of STATUS_SENDER_NAMES) {
    const p = bot.players ? bot.players[n] : null
    if (p && p.entity) { senderName = n; refPos = p.entity.position; break }
  }
  if (!refPos) refPos = bot.entity.position
  const pos = refPos
  const x = Math.floor(pos.x); const y = Math.floor(pos.y); const z = Math.floor(pos.z)
  let blockName = 'Unknown'
  try {
    const b = bot.blockAt(pos.offset(0, -1, 0))
    if (b) blockName = b.displayName || b.name || 'Unknown'
  } catch (e) { /* keep Unknown */ }
  // The bot's own health + hunger for the card's new row.
  const health = typeof bot.health === 'number' ? Math.round(bot.health) : null
  const food = typeof bot.food === 'number' ? Math.round(bot.food) : null
  // 3D scan: 20 blocks in all directions, including above and below.
  const RADIUS = 20
  const nearbyPlayers = []
  const entityCounts = {}
  for (const e of Object.values(bot.entities || {})) {
    if (!e || !e.position) continue
    let d
    try { d = e.position.distanceTo(pos) } catch (err) { continue }
    if (d > RADIUS) continue
    if (e.type === 'player') {
      const un = e.username
      if (un && un !== senderName && un !== bot.username) nearbyPlayers.push(un)
    } else {
      if (bot.entity && e.id === bot.entity.id) continue
      const key = humanizeEntityName(e.name || 'Unknown')
      entityCounts[key] = (entityCounts[key] || 0) + 1
    }
  }
  nearbyPlayers.sort()
  const entityPairs = Object.keys(entityCounts).sort().map((k) => [k, entityCounts[k]])
  // Designed image card first; the plain text status stays as the fallback.
  // Both forms auto-delete after 1 minute.
  try {
    const card = await buildStatusCard({
      position: `${x} · ${y} · ${z}`,
      block: blockName,
      health,
      food,
      nearbyPlayers,
      entities: entityPairs
    })
    if (card) {
      const sent = await msg.reply({ files: [{ attachment: card, name: 'status.png' }] })
      scheduleCardDelete(sent)
      log(`Discord status card -> ${senderName || 'bot (fallback)'} at ${x} ${y} ${z}, HP ${health}, food ${food}, ${nearbyPlayers.length} players, ${entityPairs.length} entity types nearby.`)
      return
    }
  } catch (e) {
    log('Status card failed, using text: ' + e.message)
  }
  const entityList = entityPairs.map(([k, c]) => `${k} - ${c}x`)
  const lines = []
  lines.push(
    `Position: ${x} ${y} ${z}`,
    `Block: ${blockName}`,
    `Health: ${health === null ? 'N/A' : health + '/20'}`,
    `Hunger: ${food === null ? 'N/A' : food + '/20'}`,
    `Nearby Players: ${nearbyPlayers.length ? nearbyPlayers.join(', ') : 'N/A'}`,
    `Nearby Entities: ${entityList.length ? entityList.join(', ') : 'N/A'}`
  )
  const sentText = await msg.reply(lines.join('\n').slice(0, 1900)).catch(() => null)
  scheduleCardDelete(sentText)
  log(`Discord status -> ${senderName || 'bot (fallback)'} at ${x} ${y} ${z}, ${nearbyPlayers.length} players, ${entityPairs.length} entity types nearby.`)
}

async function startDiscord () {
  if (!config.discordToken) {
    log('Discord bridge disabled (DISCORD_MC_TOKEN not set).')
    return
  }
  let Discord
  try {
    Discord = require('discord.js')
  } catch (e) {
    log('discord.js not installed, Discord bridge disabled.')
    return
  }
  discordClient = new Discord.Client({
    intents: [
      Discord.GatewayIntentBits.Guilds,
      Discord.GatewayIntentBits.GuildMessages,
      Discord.GatewayIntentBits.MessageContent
    ]
  })

  discordClient.on('ready', async () => {
    log(`Discord logged in as ${discordClient.user.tag}`)
    if (!config.discordChannelId) {
      log('DISCORD_CHANNEL_ID not set, bridge channel unknown.')
      return
    }
    try {
      discordChannel = await discordClient.channels.fetch(config.discordChannelId)
      log('Discord bridge channel ready.')
      sendToDiscord('🟢 MC bridge online.')
    } catch (e) {
      log('Discord channel fetch failed: ' + e.message)
    }
  })

  discordClient.on('messageCreate', async (msg) => {
    try {
      if (!msg || !msg.author || msg.author.bot) return
      if (config.discordChannelId && msg.channelId !== config.discordChannelId) return
      // Reply to an auto-deleted card: tell the sender (with a mention)
      // that the card is gone, then keep processing their message.
      if (msg.reference && msg.reference.messageId && deletedCardIds.has(msg.reference.messageId)) {
        await msg.reply(`<@${msg.author.id}> That card was auto-deleted after 1 minute — send the command again for a fresh one.`).catch(() => {})
      }
      // Madara/Admin mention alert: anyone typing "madara"/"madara_1ea"/
      // "admin" pings the owner. Checked before the allowlist gate so
      // other people can call for him too (restored 2026-11-21).
      const contentLower = (msg.content || '').toLowerCase()
      if (config.discordOwnerId && (contentLower.includes('madara') || contentLower.includes('admin'))) {
        const now = Date.now()
        if (now - lastMadaraPingAt > 5 * 60 * 1000) { // 5-min cooldown against ping spam
          lastMadaraPingAt = now
          await msg.reply(`<@${config.discordOwnerId}> — someone mentioned Madara! 👀`).catch(() => {})
          log('Madara mention alert sent.')
        }
        return // call-outs are not relayed to the game
      }
      // Owner + allowlist only for everything else.
      if (!isAllowedPanelUser(msg.author.id, config)) return
      const parsed = parsePanelCommand(msg.content)
      if (parsed.type === 'ignore') return
      if (parsed.type === 'playerlist') {
        await replyPlayerList(msg)
        return
      }
      if (parsed.type === 'status') {
        await replyStatus(msg)
        return
      }
      if (parsed.type === 'pvp') {
        const outcome = runPanelPvp(parsed, `discord:${msg.author.username || msg.author.id}`)
        log(`Discord panel PvP: ${msg.content} -> ${outcome}`)
        await msg.reply(outcome).catch(() => {})
        return
      }
      if (parsed.type === 'unknown-command') {
        await msg.reply('Commands: Playerlist | !p | Status | !s | !pvp fight <player> | !pvp stop | !pvp come | !pvp combo <player> | !say <msg> | !cmd <command>').catch(() => {})
        return
      }
      // !say / !cmd / plain-message direct mode -> game chat (bridge basics)
      let mcText = null
      if (parsed.type === 'say') mcText = parsed.text
      else if (parsed.type === 'cmd') mcText = '/' + parsed.text
      else if (parsed.type === 'relay') mcText = parsed.text
      if (!mcText) return
      if (!bot || !bot.entity) {
        await msg.reply('MC bot is not connected right now, try again in a bit.').catch(() => {})
        return
      }
      botSay(mcText)
      log(`Discord -> MC: ${mcText.slice(0, 80)}`)
      await msg.react('✅').catch(() => {})
    } catch (e) {
      log('Discord message handler error: ' + e.message)
    }
  })

  discordClient.on('error', (e) => log('Discord ERROR: ' + (e && e.message)))
  try {
    await discordClient.login(config.discordToken)
  } catch (e) {
    log('Discord login failed: ' + e.message)
    discordClient = null
  }
}

process.on('uncaughtException', (err) => {
  log('UNCAUGHT: ' + err.message)
  scheduleReconnect()
})

// Graceful shutdown: notify the owner on Discord first (join/leave
// pings restored 2026-11-21), then exit. Capped at 5s so a slow Discord
// can't hang the shutdown.
let sigtermHandled = false
process.on('SIGTERM', () => {
  if (sigtermHandled) return
  sigtermHandled = true
  log('SIGTERM received: shutting down. Sending leave notification...')
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 5000))
  Promise.race([pingOwnerAsync('⚠️ Madara is leaving the Minecraft server!'), timeout])
    .catch(() => {})
    .finally(() => {
      try { if (bot) bot.quit('Shutting down') } catch (e) {}
      try { if (discordClient) discordClient.destroy() } catch (e) {}
      process.exit(0)
    })
})

if (require.main === module) {
  startDiscord()
  startBot()
}

// Test hooks (used by test-merge.js; harmless in production).
module.exports = {
  startBot,
  startDiscord,
  config,
  getBot: () => bot,
  getBrain: () => brain
}
