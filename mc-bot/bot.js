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

let failCount = 0;
let bot = null;
let afkTimer = null;

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
    setTimeout(() => {
      try {
        if (config.loginCommand) {
          bot.chat(config.loginCommand);
          log('Sent login command.');
        }
      } catch (e) { log('Login chat failed: ' + e.message); }
    }, 4000);
    startAntiAfk();
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    log(`<${username}> ${message}`);
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
