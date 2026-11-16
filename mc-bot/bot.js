'use strict'
// Madara_1ea — MERGED BUILD (PvP brain + Madara lifecycle), staging only.
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
//   REMOVED (extras OFF): status cards (!s / status), playerlist image
//     cards (!p / playerlist), greetings + double-crouch behaviour, !hii,
//     mention alerts (both directions), join/leave owner pings, whisper
//     owner pings. The bot idles silently, standing at its spot.
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
  parseWhisperCommand
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
  // popped. While the PvP brain is fighting it re-equips the offhand
  // itself; the Madara refill below only runs while idle.
  bot._client.on('entity_status', (packet) => {
    try {
      if (!bot || !bot.entity) return
      if (packet.entityId === bot.entity.id && packet.entityStatus === 35) {
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
async function refillTotems () {
  if (totemRefillBusy) return
  if (!bot || !bot.entity || !bot.inventory) return
  if (brainBusy()) return // the brain owns the hands while active
  totemRefillBusy = true
  try {
    for (const dest of ['off-hand', 'hand']) {
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

function sanitize (s) {
  return String(s).replace(/@/g, '@\u200b') // stop @everyone / @here pings
}
function sendToDiscord (text) {
  if (!discordChannel) return
  discordChannel.send(String(text).slice(0, 1900)).catch(() => {})
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
// Formats: "[RANK ~Name [RANK] -> me]", "[RANK ~Name -> Madara_1ea]",
// "Name -> me: text", "Name whispers: text" / "Name whispers to you: text".
// Returns { sender, text } or null. Color codes are stripped first.
// (Copied from the live build; the merged build uses it for whisper
// CONTROL instead of owner pings.)
function privateMsgInfo (s) {
  try {
    var clean = String(s || '').replace(/§[0-9a-fk-or]/gi, '')
    var me = config.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    var m = clean.match(new RegExp('\\[(.*)->\\s*(?:me|' + me + ')\\]', 'i'))
    if (m) {
      var inner = m[1].replace(/\[[^\]]*\]/g, ' ')
      var toks = inner.replace(/[~.]/g, ' ').trim().split(/\s+/)
      var name = null
      for (var i = toks.length - 1; i >= 0; i--) {
        var t = toks[i].replace(/^[^A-Za-z0-9_]+/, '').replace(/[^A-Za-z0-9_]+$/, '')
        if (/^[A-Za-z0-9_]{3,16}$/.test(t)) { name = t; break }
      }
      var text = clean.replace(new RegExp('^.*->\\s*(?:me|' + me + ')\\]\\s*', 'i'), '').trim()
      return { sender: name, text: text || clean }
    }
    m = clean.match(new RegExp('^\\s*([A-Za-z0-9_]{3,16})\\s*->\\s*(?:me|' + me + ')\\s*:?\\s*([\\s\\S]*)$', 'i'))
    if (m) return { sender: m[1], text: m[2].trim() }
    m = clean.match(/^\s*([A-Za-z0-9_]{3,16})\s+whispers(?:\s+to\s+you)?\s*:\s*([\s\S]*)$/i)
    if (m) return { sender: m[1], text: m[2].trim() }
  } catch (e) { /* ignore */ }
  return null
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
      // Owner + allowlist only. (The live build's mention alerts — anyone
      // typing "madara"/"admin" pinging the owner — are REMOVED.)
      if (!isAllowedPanelUser(msg.author.id, config)) return
      const parsed = parsePanelCommand(msg.content)
      if (parsed.type === 'ignore') return
      if (parsed.type === 'pvp') {
        const outcome = runPanelPvp(parsed, `discord:${msg.author.username || msg.author.id}`)
        log(`Discord panel PvP: ${msg.content} -> ${outcome}`)
        await msg.reply(outcome).catch(() => {})
        return
      }
      if (parsed.type === 'unknown-command') {
        await msg.reply('Commands: !pvp fight <player> | !pvp stop | !pvp come | !pvp combo <player> | !say <msg> | !cmd <command>').catch(() => {})
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

// Graceful shutdown. (The live build pinged the owner on Discord first;
// owner pings are REMOVED in the merged build — just quit cleanly.)
let sigtermHandled = false
process.on('SIGTERM', () => {
  if (sigtermHandled) return
  sigtermHandled = true
  log('SIGTERM received: shutting down.')
  try { if (bot) bot.quit('Shutting down') } catch (e) {}
  try { if (discordClient) discordClient.destroy() } catch (e) {}
  process.exit(0)
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
