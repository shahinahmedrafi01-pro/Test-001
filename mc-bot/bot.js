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

log(`Login command configured: ${config.loginCommand ? 'YES' : 'NO (MC_LOGIN_CMD secret missing!)'}`);

let failCount = 0;
let bot = null;
let afkTimer = null;
let lastLoginSent = 0;

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
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    log(`<${username}> ${message}`);
    // AuthMe-style prompt -> send login right away
    if (/\/login|please login|log in/i.test(message)) {
      log('Server asked for login, sending command...');
      setTimeout(sendLogin, 1500);
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

function startAntiAfk() {
  if (afkTimer) clearInterval(afkTimer);
  afkTimer = setInterval(() => {
    if (!bot || !bot.entity) return;
    try {
      const yaw = bot.entity.yaw + (Math.random() - 0.5) * 1.2;
      const pitch = (Math.random() - 0.5) * 0.4;
      bot.look(yaw, pitch, true);
    } catch (e) { /* ignore */ }
  }, 45000);
}

function scheduleReconnect() {
  if (afkTimer) { clearInterval(afkTimer); afkTimer = null; }
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
