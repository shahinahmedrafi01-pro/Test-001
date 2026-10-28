const mineflayer = require('mineflayer');

const config = {
  host: process.env.MC_HOST || 'mc.havencraft.pro',
  port: parseInt(process.env.MC_PORT || '2566', 10),
  username: process.env.MC_USER || 'Madara_1ea',
  loginCommand: (process.env.MC_LOGIN_CMD || '').trim(),
  // Discord bridge (optional - only used if DISCORD_MC_TOKEN is set)
  discordToken: process.env.DISCORD_MC_TOKEN || '',
  discordChannelId: process.env.DISCORD_CHANNEL_ID || '',
  discordOwnerId: process.env.DISCORD_OWNER_ID || '',
};

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

log(`Login command configured: ${config.loginCommand ? 'YES' : 'NO (MC_LOGIN_CMD secret missing!)'}`);

let failCount = 0;
let bot = null;
let afkTimer = null;
let behaviorTimers = [];
let lastLoginSent = 0;
let lastHiiAt = 0; // global cooldown so !hii can't spam from any path

function tryHiiReply() {
  const now = Date.now();
  if (now - lastHiiAt < 20000) return; // 20s global cooldown
  lastHiiAt = now;
  try {
    botSay('hii');
    log('Said hii.');
  } catch (e) { log('hii reply failed: ' + e.message); }
}

function sendLogin() {
  if (!config.loginCommand) {
    log('Cannot login: MC_LOGIN_CMD secret is not set!');
    return;
  }
  const now = Date.now();
  if (now - lastLoginSent < 10000) return; // don't spam
  lastLoginSent = now;
  try {
    botSay(config.loginCommand);
    log('Sent login command.');
  } catch (e) { log('Login chat failed: ' + e.message); }
}

function startBot() {
  log(`Connecting as ${config.username} to ${config.host}:${config.port} (fails so far: ${failCount})`);
  bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: false, // auto-detect server version
  });

  bot.on('spawn', () => {
    log(`Spawned. Server version: ${bot.version}`);
    failCount = 0;
    lastLoginSent = 0;
    // join notification (10-min cooldown so reconnect loops don't spam pings)
    const nowJ = Date.now();
    if (nowJ - lastJoinPingAt > 10 * 60 * 1000) {
      lastJoinPingAt = nowJ;
      pingOwner('🔔 Madara has joined the Minecraft server!');
      log('Sent join notification to Discord.');
    }
    setTimeout(sendLogin, 4000);
    // retry login a few times in case the auth plugin was slow
    setTimeout(sendLogin, 12000);
    setTimeout(sendLogin, 25000);
    startAntiAfk();
    startBehavior();
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    log(`<${username}> ${message}`);
    // AuthMe-style prompt -> send login right away
    if (/\/login|please login|log in/i.test(message)) {
      log('Server asked for login, sending command...');
      setTimeout(sendLogin, 1500);
    }
    // !hii command -> bot says "hii"
    if (message.trim().toLowerCase() === '!hii') {
      log(`!hii from ${username}.`);
      tryHiiReply();
    }
  });

  // Raw-message fallback: some servers use custom chat formats that mineflayer's
  // 'chat' event doesn't parse. This keeps the Discord relay, !hii and login
  // detection working on those servers too.
  bot.on('messagestr', (msgStr, _pos, _orig, sender) => {
    try {
      const s = (msgStr || '').trim();
      if (!s) return;
      const senderName = nameForSender(sender);
      // skip the bot's own messages
      if (senderName === config.username) return;
      // never relay anything containing the login command
      if (config.loginCommand && s.includes(config.loginCommand)) return;
      // Private message TO the bot: /msg or /r (reply) -> always notify the
      // owner, even with no keyword. Checked BEFORE the bot-name guard below,
      // because a reply addressed as "[Name -> Madara_1ea]" contains the bot's
      // name, so that guard would otherwise drop it. Shares the mention
      // cooldown; not relayed as public chat.
      const priv = privateMsgInfo(s);
      if (priv) {
        // skip echo of the bot's own !say (a !say'd whisper-shaped string)
        if (!(lastBotSay.text && Date.now() - lastBotSay.at < 8000 && s.includes(lastBotSay.text))) {
          var wName = senderName || priv.sender;
          var nowW = Date.now();
          if (config.discordOwnerId && nowW - lastMcMentionPingAt > 5 * 60 * 1000) {
            lastMcMentionPingAt = nowW;
            sendToDiscord(`<@${config.discordOwnerId}> 🔔 /msg from ${wName || 'someone'}: ${priv.text}`);
            log(`Whisper (/msg or /r) alert from ${wName || 'unknown'}.`);
          }
        }
        return; // handled — don't relay whispers as public chat
      }
      if (!senderName) {
        // unknown sender: fall back to text heuristics
        if (s.includes(config.username)) return;
        // skip echo of something the bot just said itself (e.g. via !say)
        if (lastBotSay.text && Date.now() - lastBotSay.at < 8000 && s.includes(lastBotSay.text)) return;
      }
      // AuthMe rejected the login -> tell the owner the password is wrong.
      if (/wrong password|incorrect password|not registered|login failed/i.test(s)) {
        log('AuthMe says the login failed (wrong password?).');
        if (config.discordOwnerId) sendToDiscord(`<@${config.discordOwnerId}> ⚠️ MC login failed — wrong password? Please update the MC_LOGIN_CMD secret.`);
      }
      // Madara/Rafi/Admin mention alert for in-game chat: ping the owner on Discord.
      // Requires a known player sender so join/leave/system messages can't false-trigger.
      // 5-minute cooldown for in-game mentions: no mention spam.
      if (config.discordOwnerId && senderName && (s.toLowerCase().includes('madara') || s.toLowerCase().includes('rafi') || s.toLowerCase().includes('admin'))) {
        const now = Date.now();
        if (now - lastMcMentionPingAt > 5 * 60 * 1000) {
          lastMcMentionPingAt = now;
          sendToDiscord(`<@${config.discordOwnerId}> 🔔 Someone mentioned you on the server!`);
          log(`Mention alert (MC) from ${senderName}.`);
        }
      }
      // login prompt fallback
      if (/\/login|please login|log in/i.test(s)) {
        log('Server asked for login (raw), sending command...');
        setTimeout(sendLogin, 1500);
      }
      // !hii fallback for custom chat formats
      if (/!hii\s*$/i.test(s)) {
        log(`!hii detected${senderName ? ' from ' + senderName : ''} (raw).`);
        tryHiiReply();
      }
      // relay -> Discord, with the sender's in-game name when known
      const out = senderName ? `<${senderName}> ${s}` : prettyRelay(s);
      sendToDiscord(sanitize(out));
    } catch (e) { /* ignore */ }
  });

  bot.on('kicked', (reason) => {
    log('KICKED: ' + JSON.stringify(reason).slice(0, 300));
    scheduleReconnect();
  });

  bot.on('error', (err) => log('ERROR: ' + err.message));
  bot.on('end', () => {
    log('Connection ended.');
    scheduleReconnect();
  });

  // Totem pop detection: entity_status 35 on our own entity = a totem just popped.
  bot._client.on('entity_status', (packet) => {
    try {
      if (!bot || !bot.entity) return;
      if (packet.entityId === bot.entity.id && packet.entityStatus === 35) {
        log('Totem popped! Scheduling replacement...');
        scheduleTotemRefill();
      }
    } catch (e) { /* ignore */ }
  });
}

/* ---------- anti-AFK: gentle look-around ---------- */
function startAntiAfk() {
  if (afkTimer) clearInterval(afkTimer);
  afkTimer = setInterval(() => {
    if (!bot || !bot.entity || behaviorBusy) return;
    try {
      const yaw = bot.entity.yaw + (Math.random() - 0.5) * 1.2;
      const pitch = (Math.random() - 0.5) * 0.4;
      bot.look(yaw, pitch, true);
    } catch (e) { /* ignore */ }
  }, 30000);
}

/* ---------- lively behavior: crouch + greet ---------- */
let behaviorBusy = false;
const greetCooldown = {}; // username -> last greet timestamp

async function doubleCrouch() {
  if (behaviorBusy || !bot || !bot.entity) return;
  behaviorBusy = true;
  try {
    for (let i = 0; i < 2; i++) {
      bot.setControlState('sneak', true);
      await sleep(700);
      bot.setControlState('sneak', false);
      await sleep(700);
    }
    log('Did double-crouch.');
  } catch (e) { /* ignore */ }
  behaviorBusy = false;
}

function nearestPlayer(maxDist) {
  let best = null, bestD = maxDist;
  for (const name of Object.keys(bot.players)) {
    if (name === bot.username) continue;
    const p = bot.players[name];
    if (!p || !p.entity || !bot.entity) continue;
    const d = bot.entity.position.distanceTo(p.entity.position);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

async function greetIfPlayerNear() {
  if (behaviorBusy || !bot || !bot.entity) return;
  const p = nearestPlayer(6);
  if (!p) return;
  const now = Date.now();
  if (now - (greetCooldown[p.username] || 0) < 60000) return; // once per minute per player
  greetCooldown[p.username] = now;
  behaviorBusy = true;
  try {
    await bot.lookAt(p.entity.position.offset(0, 1.5, 0));
    log(`Greeting ${p.username}: looking + double-crouch.`);
    await sleep(500);
    for (let i = 0; i < 2; i++) {
      bot.setControlState('sneak', true);
      await sleep(700);
      bot.setControlState('sneak', false);
      await sleep(700);
    }
  } catch (e) { /* ignore */ }
  behaviorBusy = false;
}

function startBehavior() {
  clearBehavior();
  // every 2 minutes: crouch twice (sit-stand, sit-stand)
  behaviorTimers.push(setInterval(() => doubleCrouch(), 2 * 60 * 1000));
  // every 3 seconds: if a player is within 6 blocks, look at them + double-crouch
  behaviorTimers.push(setInterval(() => greetIfPlayerNear(), 3000));
  // every 15 seconds: top up empty hands with totems (covers "became empty" cases)
  behaviorTimers.push(setInterval(() => refillTotems(), 15000));
  log('Behavior timers started (double-crouch every 2 min, greet nearby players).');
}
function clearBehavior() {
  behaviorTimers.forEach(clearInterval);
  behaviorTimers = [];
  behaviorBusy = false;
}

/* ---------- auto-totem: keep Totems of Undying in both hands ---------- */
const TOTEM_REPLACE_DELAY_MS = 6000; // configurable replacement delay
let totemRefillTimer = null;
let totemRefillBusy = false;
let lastNoTotemLogAt = 0;

function handHasTotem(dest) {
  try {
    if (!bot || !bot.inventory) return false;
    const slot = bot.getEquipmentDestSlot(dest); // 'off-hand' or 'hand'
    const item = bot.inventory.slots[slot];
    return !!item && item.name === 'totem_of_undying';
  } catch (e) { return false; }
}

// Find a totem in the main inventory, ignoring ones already equipped,
// so we never steal a totem from one hand to fill the other.
function findSpareTotem() {
  try {
    if (!bot || !bot.inventory) return null;
    const skip = new Set();
    try { skip.add(bot.getEquipmentDestSlot('off-hand')); } catch (e) {}
    try { skip.add(bot.getEquipmentDestSlot('hand')); } catch (e) {}
    return bot.inventory.items().find((it) => it && it.name === 'totem_of_undying' && !skip.has(it.slot)) || null;
  } catch (e) { return null; }
}

// One refill pass: offhand first (survival priority), then main hand.
// Lock-guarded so repeated pops can never overlap; no totems -> do nothing.
async function refillTotems() {
  if (totemRefillBusy) return;
  if (!bot || !bot.entity || !bot.inventory) return;
  totemRefillBusy = true;
  try {
    for (const dest of ['off-hand', 'hand']) {
      if (handHasTotem(dest)) continue;
      const totem = findSpareTotem();
      if (!totem) {
        const nowL = Date.now();
        if (nowL - lastNoTotemLogAt > 5 * 60 * 1000) {
          lastNoTotemLogAt = nowL;
          log(`Auto-totem: no spare totem for ${dest} (waiting for one).`);
        }
        continue;
      }
      try {
        await bot.equip(totem, dest);
        log(`Auto-totem: equipped totem to ${dest}.`);
      } catch (e) {
        log(`Auto-totem equip failed (${dest}): ${e.message}`);
      }
    }
  } catch (e) { /* ignore */ }
  totemRefillBusy = false;
}

// Debounced: pops during the wait collapse into a single refill pass.
function scheduleTotemRefill() {
  if (totemRefillTimer) return; // already scheduled
  totemRefillTimer = setTimeout(() => {
    totemRefillTimer = null;
    refillTotems();
  }, TOTEM_REPLACE_DELAY_MS);
}

/* ---------- reconnect logic ---------- */
function scheduleReconnect() {
  if (afkTimer) { clearInterval(afkTimer); afkTimer = null; }
  clearBehavior();
  try { if (bot) bot.quit(); } catch (e) {}
  bot = null;
  failCount++;
  // 1st failure: retry in 15s. Repeated failures (server restarting/down):
  // retry every 2 minutes.
  const delay = failCount >= 2 ? 120000 : 15000;
  log(`Reconnecting in ${delay / 1000}s ... (consecutive fails: ${failCount})`);
  setTimeout(startBot, delay);
}

/* ---------- Discord bridge (remote control + chat relay) ---------- */
let discordClient = null;
let discordChannel = null;
let lastMadaraPingAt = 0; // anti-spam cooldown for Discord-side Madara mention alerts
let lastMcMentionPingAt = 0; // anti-spam cooldown for in-game (MC) mention alerts: 10 min
let lastJoinPingAt = 0; // anti-spam cooldown for join notifications

function sanitize(s) {
  return String(s).replace(/@/g, '@\u200b'); // stop @everyone / @here pings
}
function sendToDiscord(text) {
  if (!discordChannel) return;
  discordChannel.send(String(text).slice(0, 1900)).catch(() => {});
}
// Mention the owner on Discord (fire-and-forget).
function pingOwner(text) {
  if (!config.discordOwnerId) return;
  sendToDiscord(`<@${config.discordOwnerId}> ${text}`);
}
// Awaitable version for shutdown paths where the process is about to exit.
async function pingOwnerAsync(text) {
  if (!config.discordOwnerId || !discordChannel) return false;
  try {
    await discordChannel.send(`<@${config.discordOwnerId}> ${text}`.slice(0, 1900));
    return true;
  } catch (e) { return false; }
}

// Track messages the bot itself sends, so the relay doesn't echo them back.
let lastBotSay = { text: '', at: 0 };
function botSay(text) {
  lastBotSay = { text: String(text), at: Date.now() };
  bot.chat(text);
}

// Turn HavenCraft-style "RANK name » message" into clean "<name> message".
// Anything else (auctions, join/leave, system) is passed through as-is.
function prettyRelay(s) {
  const clean = String(s).replace(/§[0-9a-fk-or]/gi, '');
  const m = clean.match(/^(.*?)»\s*([\s\S]*)$/);
  if (m) {
    const tokens = m[1].trim().split(/\s+/);
    let name = tokens[tokens.length - 1] || '';
    name = name.replace(/^[^a-zA-Z0-9_]+/, '').replace(/[^a-zA-Z0-9_]+$/, '');
    if (name) return `<${name}> ${m[2].trim()}`;
  }
  return clean.trim();
}

// Detect a private message TO the bot: /msg or /r (reply).
// Formats: "[RANK ~Name [RANK] -> me]", "[RANK ~Name -> Madara_1ea]",
// "Name -> me: text", "Name whispers: text" / "Name whispers to you: text".
// Returns { sender, text } or null. Color codes are stripped first.
function privateMsgInfo(s) {
  try {
    var clean = String(s || '').replace(/§[0-9a-fk-or]/gi, '');
    var me = config.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = clean.match(new RegExp('\\[(.*)->\\s*(?:me|' + me + ')\\]', 'i'));
    if (m) {
      var inner = m[1].replace(/\[[^\]]*\]/g, ' ');
      var toks = inner.replace(/[~.]/g, ' ').trim().split(/\s+/);
      var name = null;
      for (var i = toks.length - 1; i >= 0; i--) {
        var t = toks[i].replace(/^[^A-Za-z0-9_]+/, '').replace(/[^A-Za-z0-9_]+$/, '');
        if (/^[A-Za-z0-9_]{3,16}$/.test(t)) { name = t; break; }
      }
      var text = clean.replace(new RegExp('^.*->\\s*(?:me|' + me + ')\\]\\s*', 'i'), '').trim();
      return { sender: name, text: text || clean };
    }
    m = clean.match(new RegExp('^\\s*([A-Za-z0-9_]{3,16})\\s*->\\s*(?:me|' + me + ')\\s*:?\\s*([\\s\\S]*)$', 'i'));
    if (m) return { sender: m[1], text: m[2].trim() };
    m = clean.match(/^\s*([A-Za-z0-9_]{3,16})\s+whispers(?:\s+to\s+you)?\s*:\s*([\s\S]*)$/i);
    if (m) return { sender: m[1], text: m[2].trim() };
  } catch (e) { /* ignore */ }
  return null;
}

// Resolve a chat packet sender UUID -> player name via the tab list.
function nameForSender(sender) {
  if (!sender || !bot || !bot.players) return null;
  const su = String(sender).toLowerCase().replace(/-/g, '');
  if (!su) return null;
  for (const name of Object.keys(bot.players)) {
    const p = bot.players[name];
    const pu = String((p && p.uuid) || '').toLowerCase().replace(/-/g, '');
    if (pu && pu === su) return name;
  }
  return null;
}

async function startDiscord() {
  if (!config.discordToken) {
    log('Discord bridge disabled (DISCORD_MC_TOKEN not set).');
    return;
  }
  let Discord;
  try {
    Discord = require('discord.js');
  } catch (e) {
    log('discord.js not installed, Discord bridge disabled.');
    return;
  }
  discordClient = new Discord.Client({
    intents: [
      Discord.GatewayIntentBits.Guilds,
      Discord.GatewayIntentBits.GuildMessages,
      Discord.GatewayIntentBits.MessageContent,
    ],
  });

  discordClient.on('ready', async () => {
    log(`Discord logged in as ${discordClient.user.tag}`);
    if (!config.discordChannelId) {
      log('DISCORD_CHANNEL_ID not set, bridge channel unknown.');
      return;
    }
    try {
      discordChannel = await discordClient.channels.fetch(config.discordChannelId);
      log('Discord bridge channel ready.');
      sendToDiscord('🟢 MC bridge online.');
    } catch (e) {
      log('Discord channel fetch failed: ' + e.message);
    }
  });

  discordClient.on('messageCreate', async (msg) => {
    try {
      if (!msg || !msg.author || msg.author.bot) return;
      if (config.discordChannelId && msg.channelId !== config.discordChannelId) return;
      // Madara/Admin mention alert: anyone typing "madara"/"madara_1ea"/"admin" pings the owner.
      // Checked before the owner-only gate so other people can call for him too.
      const contentLower = (msg.content || '').toLowerCase();
      if (config.discordOwnerId && (contentLower.includes('madara') || contentLower.includes('admin'))) {
        const now = Date.now();
        if (now - lastMadaraPingAt > 5 * 60 * 1000) { // 5-min cooldown against ping spam
          lastMadaraPingAt = now;
          await msg.reply(`<@${config.discordOwnerId}> — someone mentioned Madara! 👀`).catch(() => {});
          log('Madara mention alert sent.');
        }
        return; // call-outs are not relayed to the game
      }
      if (config.discordOwnerId && msg.author.id !== config.discordOwnerId) return; // owner only
      const text = (msg.content || '').trim();
      if (!text) return;
      const low = text.toLowerCase();

      // Playerlist -> reply with online players (not sent to the game)
      if (low === 'playerlist' || low === '!players' || low === '!p') {
        await replyPlayerList(msg);
        return;
      }

      // Status -> reply with the sender's surroundings (not sent to the game)
      if (low === 'status' || low === '!s') {
        await replyStatus(msg);
        return;
      }

      let mcText = null;
      if (low.startsWith('!say ')) {
        mcText = text.slice(5).trim(); // starts with / => runs as a command
      } else if (low.startsWith('!cmd ')) {
        mcText = '/' + text.slice(5).trim().replace(/^\/+/, '');
      } else if (low.startsWith('!')) {
        await msg.reply('Commands: Playerlist | !p | Status | !s | !say <msg> | !cmd <command>').catch(() => {});
        return;
      } else {
        // direct mode: plain message -> game chat (no !say needed)
        mcText = text.replace(/\s*\n\s*/g, ' ').trim();
      }
      if (!mcText) return;
      if (!bot || !bot.entity) {
        await msg.reply('MC bot is not connected right now, try again in a bit.').catch(() => {});
        return;
      }
      botSay(mcText);
      log(`Discord -> MC: ${mcText.slice(0, 80)}`);
      await msg.react('✅').catch(() => {});
    } catch (e) {
      log('Discord message handler error: ' + e.message);
    }
  });

async function replyPlayerList(msg) {
  if (!bot || !bot.entity) {
    await msg.reply('MC bot is not connected right now, try again in a bit.').catch(() => {});
    return;
  }
  // Every player in the tab list, no exclusions — including the bot itself.
  const names = Object.keys(bot.players || {}).sort();
  const entries = names.map((n) => {
    const p = bot.players[n];
    const ping = p && typeof p.ping === 'number' ? p.ping : null;
    return ping === null ? `${n}-?ping` : `${n}-${ping}ping`;
  });
  const text = entries.length
    ? `Online Players: ${entries.join(', ')}`
    : 'Online Players: N/A';
  // Each player's own Minecraft head next to their name + ping (mc-heads).
  // Bedrock '.' prefix is stripped for the lookup; a name with no premium
  // account simply shows no thumbnail in Discord, the text list still covers it.
  const embeds = names.map((n) => {
    const p = bot.players[n];
    const ping = p && typeof p.ping === 'number' ? p.ping : null;
    const headName = n.replace(/^\./, '');
    return {
      title: n,
      description: ping === null ? '?ping' : `${ping}ping`,
      thumbnail: { url: `https://mc-heads.net/avatar/${encodeURIComponent(headName)}/64` },
    };
  });
  try {
    if (embeds.length === 0) {
      await msg.reply(text).catch(() => {});
    } else if (embeds.length <= 10) {
      await msg.reply({ content: text.slice(0, 1900), embeds }).catch(() => {});
    } else {
      await msg.reply({ content: text.slice(0, 1900), embeds: embeds.slice(0, 10) }).catch(() => {});
      for (let i = 10; i < embeds.length; i += 10) {
        await msg.reply({ embeds: embeds.slice(i, i + 10) }).catch(() => {});
      }
    }
  } catch (e) {
    // Embed send failed -> fall back to the plain text list.
    await msg.reply(text.slice(0, 1900)).catch(() => {});
  }
  log(`Discord playerlist -> ${entries.length} players.`);
}

// The command sender's known in-game accounts, in order. The Discord bridge is
// owner-only, so the sender is always the owner.
const STATUS_SENDER_NAMES = ['alxxq', 'mother_one'];

// 'iron_golem' -> 'Iron Golem', 'zombie' -> 'Zombie'.
function humanizeEntityName(name) {
  return String(name || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function replyStatus(msg) {
  if (!bot || !bot.entity) {
    await msg.reply('MC bot is not connected right now, try again in a bit.').catch(() => {});
    return;
  }
  // The sender's in-game entity when online and near the bot. Otherwise fall
  // back to the bot's own surroundings, so the command always returns a
  // result instead of only an error (the server only sends entity data for
  // the bot's surroundings, so a far-away/offline sender has no tracked entity).
  let senderName = null;
  let refPos = null;
  for (const n of STATUS_SENDER_NAMES) {
    const p = bot.players ? bot.players[n] : null;
    if (p && p.entity) { senderName = n; refPos = p.entity.position; break; }
  }
  const isFallback = !refPos;
  if (isFallback) refPos = bot.entity.position;
  const pos = refPos;
  const x = Math.floor(pos.x), y = Math.floor(pos.y), z = Math.floor(pos.z);
  let blockName = 'Unknown';
  try {
    const b = bot.blockAt(pos.offset(0, -1, 0));
    if (b) blockName = b.displayName || b.name || 'Unknown';
  } catch (e) { /* keep Unknown */ }
  // 3D scan: 20 blocks in all directions, including above and below.
  const RADIUS = 20;
  const nearbyPlayers = [];
  const entityCounts = {};
  for (const e of Object.values(bot.entities || {})) {
    if (!e || !e.position) continue;
    let d;
    try { d = e.position.distanceTo(pos); } catch (err) { continue; }
    if (d > RADIUS) continue;
    if (e.type === 'player') {
      const un = e.username;
      if (un && un !== senderName && un !== bot.username) nearbyPlayers.push(un);
    } else {
      if (bot.entity && e.id === bot.entity.id) continue;
      const key = humanizeEntityName(e.name || 'Unknown');
      entityCounts[key] = (entityCounts[key] || 0) + 1;
    }
  }
  nearbyPlayers.sort();
  const entityList = Object.keys(entityCounts).sort().map((k) => `${k} - ${entityCounts[k]}x`);
  const lines = [];
  if (isFallback) lines.push("Note: You are not online near the bot — showing the bot's surroundings.");
  lines.push(
    `Position: ${x} ${y} ${z}`,
    `Block: ${blockName}`,
    `Nearby Players: ${nearbyPlayers.length ? nearbyPlayers.join(', ') : 'N/A'}`,
    `Nearby Entities: ${entityList.length ? entityList.join(', ') : 'N/A'}`,
  );
  await msg.reply(lines.join('\n').slice(0, 1900)).catch(() => {});
  log(`Discord status -> ${senderName || 'bot (fallback)'} at ${x} ${y} ${z}, ${nearbyPlayers.length} players, ${entityList.length} entity types nearby.`);
}

  discordClient.on('error', (e) => log('Discord ERROR: ' + (e && e.message)));
  try {
    await discordClient.login(config.discordToken);
  } catch (e) {
    log('Discord login failed: ' + e.message);
    discordClient = null;
  }
}

process.on('uncaughtException', (err) => {
  log('UNCAUGHT: ' + err.message);
  scheduleReconnect();
});

// Graceful shutdown: GitHub Actions sends SIGTERM when the job hits its
// timeout (the 5h scheduled restart) or when a newer run cancels this one.
// Notify Discord first, then exit. Capped at 5s so a slow Discord can't hang us.
let sigtermHandled = false;
process.on('SIGTERM', () => {
  if (sigtermHandled) return;
  sigtermHandled = true;
  log('SIGTERM received: workflow is stopping the bot. Sending leave notification...');
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 5000));
  Promise.race([pingOwnerAsync('⚠️ Madara is leaving the Minecraft server!'), timeout])
    .catch(() => {})
    .finally(() => {
      try { if (bot) bot.quit('Shutting down'); } catch (e) {}
      try { if (discordClient) discordClient.destroy(); } catch (e) {}
      process.exit(0);
    });
});

startDiscord();
startBot();
