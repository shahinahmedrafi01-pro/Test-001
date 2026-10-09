const mineflayer = require('mineflayer');

const config = {
  host: process.env.MC_HOST || 'mc.havencraft.pro',
  port: parseInt(process.env.MC_PORT || '2566', 10),
  username: process.env.MC_USER || 'Madara_1ea',
  loginCommand: process.env.MC_LOGIN_CMD || '',
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
const hiiCooldown = {}; // username -> last !hii trigger timestamp

function sendLogin() {
  if (!config.loginCommand) {
    log('Cannot login: MC_LOGIN_CMD secret is not set!');
    return;
  }
  const now = Date.now();
  if (now - lastLoginSent < 10000) return; // don't spam
  lastLoginSent = now;
  try {
    bot.chat(config.loginCommand);
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
    // !hii command -> bot says "hii" (15s cooldown per user to avoid spam)
    if (message.trim().toLowerCase() === '!hii') {
      const now = Date.now();
      if (now - (hiiCooldown[username] || 0) < 15000) return;
      hiiCooldown[username] = now;
      try {
        bot.chat('hii');
        log(`Said hii (triggered by ${username}).`);
      } catch (e) { log('hii reply failed: ' + e.message); }
    }
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

process.on('uncaughtException', (err) => {
  log('UNCAUGHT: ' + err.message);
  scheduleReconnect();
});

startBot();
