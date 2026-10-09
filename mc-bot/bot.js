const mineflayer = require('mineflayer');

const config = {
  host: process.env.MC_HOST || 'mc.havencraft.pro',
  port: parseInt(process.env.MC_PORT || '2566', 10),
  username: process.env.MC_USER || 'Madara_1ea',
  loginCommand: process.env.MC_LOGIN_CMD || '',
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
      if (!senderName) {
        // unknown sender: fall back to text heuristics
        if (s.includes(config.username)) return;
        // skip echo of something the bot just said itself (e.g. via !say)
        if (lastBotSay.text && Date.now() - lastBotSay.at < 8000 && s.includes(lastBotSay.text)) return;
      }
      // never relay anything containing the login command
      if (config.loginCommand && s.includes(config.loginCommand)) return;
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
  log('Behavior timers started (double-crouch every 2 min, greet nearby players).');
}
function clearBehavior() {
  behaviorTimers.forEach(clearInterval);
  behaviorTimers = [];
  behaviorBusy = false;
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
let lastMadaraPingAt = 0; // anti-spam cooldown for Madara mention alerts

function sanitize(s) {
  return String(s).replace(/@/g, '@\u200b'); // stop @everyone / @here pings
}
function sendToDiscord(text) {
  if (!discordChannel) return;
  discordChannel.send(String(text).slice(0, 1900)).catch(() => {});
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
      // Madara mention alert: anyone typing "madara"/"madara_1ea" pings the owner.
      // Checked before the owner-only gate so other people can call for him too.
      const contentLower = (msg.content || '').toLowerCase();
      if (config.discordOwnerId && contentLower.includes('madara')) {
        const now = Date.now();
        if (now - lastMadaraPingAt > 60000) { // 60s cooldown against ping spam
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
      if (low === 'playerlist' || low === '!players') {
        await replyPlayerList(msg);
        return;
      }

      let mcText = null;
      if (low.startsWith('!say ')) {
        mcText = text.slice(5).trim(); // starts with / => runs as a command
      } else if (low.startsWith('!cmd ')) {
        mcText = '/' + text.slice(5).trim().replace(/^\/+/, '');
      } else if (low.startsWith('!')) {
        await msg.reply('Commands: Playerlist | !say <msg> | !cmd <command>').catch(() => {});
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
  const names = Object.keys(bot.players || {}).filter((n) => n !== bot.username).sort();
  const reply = names.length
    ? `Server ${names.length} online: ${names.join(', ')}`
    : 'Server 0 online.';
  await msg.reply(reply.slice(0, 1900)).catch(() => {});
  log(`Discord playerlist -> ${names.length} players.`);
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

startDiscord();
startBot();
