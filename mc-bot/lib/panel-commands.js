'use strict'
// Command parsing + allowlist gates for the merged Madara build.
//
// Pure functions only — no Discord, no mineflayer — so the panel surface
// can be unit-tested without connecting anything (see
// test-panel-parser.js). bot.js wires these to the real transports:
//
//   Discord #bot-panel  -> parsePanelCommand(text)
//   In-game /msg        -> parseWhisperCommand(text)
//
// REMOVED panel commands (Rafi's order — extras OFF): the live bot's
// `!p` / `playerlist` and `!s` / `status` (image cards) are NOT parsed
// here; they fall through to { type: 'unknown-command' } and the panel
// answers with the PvP command list instead.

// ------------------------------------------------------------------ gates
// Discord panel gate: the owner, plus the extra allowlisted Discord IDs
// (DISCORD_ALLOWED_IDS) — identical semantics to the live bot.
function isAllowedPanelUser (authorId, cfg) {
  if (!authorId) return false
  if (cfg.discordOwnerId && authorId === cfg.discordOwnerId) return true
  return Array.isArray(cfg.discordAllowedIds) && cfg.discordAllowedIds.includes(authorId)
}

// In-game whisper gate: Minecraft usernames, case-insensitive (Bedrock
// names keep their leading dot, e.g. ".Rafi_PRX").
function isAllowedMcName (username, allowlist) {
  if (!username || !Array.isArray(allowlist)) return false
  const u = String(username).toLowerCase()
  return allowlist.some(n => String(n).toLowerCase() === u)
}

// ------------------------------------------------------- Discord panel
// Returns one of:
//   { type: 'pvp', action: 'fight'|'combo', target: '<player>' }
//   { type: 'pvp', action: 'stop'|'come' }
//   { type: 'say', text }          — !say <msg>  (panel basic, kept)
//   { type: 'cmd', text }          — !cmd <cmd>  (panel basic, kept; text has no leading /)
//   { type: 'relay', text }        — plain message -> game chat (bridge basic, kept)
//   { type: 'unknown-command' }    — starts with ! but is not a known command
//   { type: 'ignore' }             — empty
function parsePanelCommand (raw) {
  const text = String(raw || '').trim()
  if (!text) return { type: 'ignore' }
  const low = text.toLowerCase()

  if (low === '!pvp stop') return { type: 'pvp', action: 'stop' }
  if (low === '!pvp come') return { type: 'pvp', action: 'come' }
  let m = text.match(/^!pvp\s+fight\s+(\S+)\s*$/i)
  if (m) return { type: 'pvp', action: 'fight', target: m[1] }
  m = text.match(/^!pvp\s+combo\s+(\S+)\s*$/i)
  if (m) return { type: 'pvp', action: 'combo', target: m[1] }
  if (low.startsWith('!pvp')) return { type: 'unknown-command' }

  if (low.startsWith('!say ')) {
    const t = text.slice(5).trim()
    return t ? { type: 'say', text: t } : { type: 'ignore' }
  }
  if (low.startsWith('!cmd ')) {
    const t = text.slice(5).trim().replace(/^\/+/, '')
    return t ? { type: 'cmd', text: t } : { type: 'ignore' }
  }
  if (low.startsWith('!')) return { type: 'unknown-command' }

  return { type: 'relay', text: text.replace(/\s*\n\s*/g, ' ').trim() }
}

// ------------------------------------------------------- in-game /msg
// Rafi's duel flow: he TPs the bot to himself in-game, then whispers it.
//   "pvp fight" -> the bot starts fighting the SENDER
//   "pvp stop"  -> the bot stands down
// Anything else returns null (ordinary whispers are not commands).
function parseWhisperCommand (raw) {
  const text = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (text === 'pvp fight') return { action: 'fight-sender' }
  if (text === 'pvp stop') return { action: 'stop' }
  return null
}

module.exports = {
  isAllowedPanelUser,
  isAllowedMcName,
  parsePanelCommand,
  parseWhisperCommand
}
