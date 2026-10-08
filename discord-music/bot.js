// Discord Music Bot — 24/7 nonstop loop
// Commands: !play <YouTube link> | !stop | !now
// Stays in the voice channel even when alone. When a track ends, it loops again.

const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;
const STATE_FILE = path.join(__dirname, 'now-playing.txt');
const PREFIX = '!';

if (!TOKEN) {
  console.error('DISCORD_TOKEN is not set.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

const player = createAudioPlayer();
let connection = null;
let currentUrl = null;
let looping = false;
let procs = null;
let errorStreak = 0;
let playStartAt = 0;

function killProcs() {
  if (!procs) return;
  for (const p of [procs.ytdlp, procs.ffmpeg]) {
    try { p.kill('SIGKILL'); } catch (_) {}
  }
  procs = null;
}

// Build yt-dlp args: player clients that bypass YouTube's datacenter IP
// "Sign in to confirm you're not a bot" check, plus optional authenticated
// cookies (YT_COOKIES secret) which is the most reliable fix.
const COOKIE_FILE = path.join(__dirname, '.yt-cookies.txt');

function ytDlpArgs(url) {
  const args = ['--no-playlist', '--no-warnings', '--no-progress',
    '--extractor-args', 'youtube:player_client=android,ios,web'];
  if (process.env.YT_COOKIES) {
    try {
      fs.writeFileSync(COOKIE_FILE, process.env.YT_COOKIES);
      args.push('--cookies', COOKIE_FILE);
      console.log('Using YouTube cookies for extraction.');
    } catch (e) { console.error('Could not write cookies file:', e.message); }
  }
  args.push('-f', 'bestaudio/best', '-o', '-', url);
  return args;
}

// yt-dlp extracts YouTube audio -> ffmpeg converts to Ogg/Opus -> Discord plays it
function spawnAudio(url) {
  const ytdlp = spawn(
    'yt-dlp',
    ytDlpArgs(url),
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const ffmpeg = spawn(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-analyzeduration', '0',
     '-i', 'pipe:0', '-f', 'ogg', '-c:a', 'libopus', '-ar', '48000', '-ac', '2', '-b:a', '96k', 'pipe:1'],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  ytdlp.stdout.pipe(ffmpeg.stdin);
  ytdlp.stderr.on('data', (d) => console.error('[yt-dlp]', d.toString().trim().slice(0, 200)));
  ffmpeg.stderr.on('data', (d) => console.error('[ffmpeg]', d.toString().trim().slice(0, 200)));
  ytdlp.on('error', (e) => console.error('[yt-dlp] spawn error:', e.message));
  ffmpeg.on('error', (e) => console.error('[ffmpeg] spawn error:', e.message));
  return { ytdlp, ffmpeg, out: ffmpeg.stdout };
}

async function playCurrent() {
  if (!currentUrl || !looping) return;
  killProcs();
  try {
    const s = spawnAudio(currentUrl);
    procs = s;
    const resource = createAudioResource(s.out, { inputType: StreamType.OggOpus });
    playStartAt = Date.now();
    player.play(resource);
    console.log('Playing:', currentUrl);
  } catch (e) {
    console.error('playCurrent failed:', e.message);
    errorStreak++;
    setTimeout(() => { if (looping && currentUrl) playCurrent(); }, 5000);
  }
}

function stopAll() {
  looping = false;
  currentUrl = null;
  errorStreak = 0;
  killProcs();
  player.stop(true);
  try { fs.unlinkSync(STATE_FILE); } catch (_) {}
}

async function ensureVoice() {
  if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) return connection;
  let channel = null;
  if (VOICE_CHANNEL_ID) {
    try { channel = await client.channels.fetch(VOICE_CHANNEL_ID); }
    catch (e) { console.error('Voice channel fetch failed:', e.message); }
  }
  if (!channel || !channel.isVoiceBased()) {
    console.error('VOICE_CHANNEL_ID is missing or not a voice channel.');
    return null;
  }
  connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });
  connection.subscribe(player);
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch (_) {
      console.warn('Voice disconnected, rejoining in 5s...');
      setTimeout(() => { connection = null; ensureVoice(); }, 5000);
    }
  });
  connection.on('error', (e) => console.error('Voice connection error:', e.message));
  return connection;
}

// Track ended -> loop the same URL again (nonstop)
player.on(AudioPlayerStatus.Idle, () => {
  if (!looping || !currentUrl) return;
  if (Date.now() - playStartAt > 30000) errorStreak = 0; // clean finish resets streak
  const delay = errorStreak > 3 ? 15000 : 500;
  if (errorStreak > 8) errorStreak = 0; // gentle infinite retry, never hammer
  setTimeout(() => { if (looping && currentUrl) playCurrent(); }, delay);
});

player.on('error', (e) => {
  console.error('Audio player error:', e.message);
  errorStreak++; // Idle follows and replays with backoff
});

const YT_RE = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch|shorts|live|embed)|youtu\.be\/)/i;

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  if (!msg.content.startsWith(PREFIX)) return;
  const parts = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = (parts.shift() || '').toLowerCase();
  const arg = parts.join(' ');

  if (cmd === 'play') {
    if (!arg) return msg.reply('ব্যবহার: `!play <YouTube link>`');
    if (!YT_RE.test(arg)) return msg.reply('YouTube লিংক দাও।');
    const conn = await ensureVoice();
    if (!conn) return msg.reply('Voice channel-এ join করতে পারছি না। VOICE_CHANNEL_ID ঠিক আছে কিনা দেখো।');
    currentUrl = arg;
    looping = true;
    errorStreak = 0;
    try { fs.writeFileSync(STATE_FILE, arg); } catch (_) {}
    playCurrent();
    return msg.reply(`🔁 Nonstop loop চালু: ${arg}`);
  }

  if (cmd === 'stop') {
    if (!looping && !currentUrl) return msg.reply('এখন কিছু বাজছে না।');
    stopAll();
    return msg.reply('⏹ থামিয়ে দিলাম।');
  }

  if (cmd === 'now') {
    return msg.reply(currentUrl ? `🔁 Loop চলছে: ${currentUrl}` : 'এখন কিছু বাজছে না। `!play <link>` দাও।');
  }
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await ensureVoice();
  try {
    const saved = fs.readFileSync(STATE_FILE, 'utf8').trim();
    if (saved) {
      currentUrl = saved;
      looping = true;
      console.log('Resuming loop:', saved);
      playCurrent();
    } else {
      console.log('No saved track. Waiting for !play.');
    }
  } catch (_) {
    console.log('No saved track. Waiting for !play.');
  }
  // keep-alive: rejoin if the voice connection ever drops
  setInterval(async () => {
    const st = connection && connection.state.status;
    if (!connection || st === VoiceConnectionStatus.Destroyed || st === VoiceConnectionStatus.Disconnected) {
      console.log('Keep-alive: rejoining voice...');
      connection = null;
      await ensureVoice();
    }
  }, 60000);
});

client.on('error', (e) => console.error('Client error:', e.message));
process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', (e && e.message) || e));

client.login(TOKEN);
