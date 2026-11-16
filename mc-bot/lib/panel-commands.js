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

// --------------------------------------------- private-message extraction
// Extract { sender, text } from a raw chat/system line that is a private
// message TO the bot, across the formats seen in the wild:
//   vanilla:            "Name whispers to you: text"
//   Essentials bracket: "[.Rafi_PRX -> me] text"
//                       "[ADMIN .Rafi_PRX -> me] text"        (rank-decorated sender)
//                       "[.Rafi_PRX -> Madara_1ea] text"
//                       "[.Rafi_PRX -> PRIME Madara_1ea] text" (rank-decorated receiver)
//                       "[[ADMIN] .Rafi_PRX -> me] text"      (nested rank brackets)
//   plain arrow:        "Name -> me: text"
//
// FIX (round 2): the previous extractor deleted '.' characters while
// tokenizing the sender segment, turning ".Rafi_PRX" into "Rafi_PRX" —
// which then failed the allowlist check, so on the live Essentials server
// Rafi's /msg commands were silently dropped. The sender is now resolved
// by (1) finding an allowlisted username inside the sender segment
// (case-insensitive, name-boundary aware, leading dot preserved), else
// (2) the last username-shaped token in the segment, leading dot kept.
// The receiver segment only has to CONTAIN the bot's name or the word
// "me" as a token, so rank decoration on either side is tolerated.
// Returns null when the line is not a private message to the bot.
function escapeRegExp (s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// True when `name` occurs in `segment` as a whole name (the characters
// around it are not name characters; '.' counts as a name character on
// the left so a search for "Rafi_PRX" cannot match inside ".Rafi_PRX").
function segmentHasName (segment, name) {
  if (!name) return false
  const re = new RegExp('(^|[^A-Za-z0-9_.])' + escapeRegExp(name) + '([^A-Za-z0-9_]|$)', 'i')
  return re.test(segment)
}

function resolveSender (segment, allowlist) {
  if (Array.isArray(allowlist)) {
    for (const name of allowlist) {
      if (name && segmentHasName(segment, name)) return String(name)
    }
  }
  const toks = String(segment || '').split(/\s+/)
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i].replace(/^[^A-Za-z0-9_.]+/, '').replace(/[^A-Za-z0-9_]+$/, '')
    if (/^\.?[A-Za-z0-9_]{3,16}$/.test(t) && t.toLowerCase() !== 'me') return t
  }
  return null
}

function receiverIsMe (segment, meName) {
  if (!segment) return false
  if (meName && segmentHasName(segment, meName)) return true
  return segment.split(/\s+/).some(tok => {
    const t = tok.replace(/^[^A-Za-z0-9_.]+/, '').replace(/[^A-Za-z0-9_]+$/, '')
    return t.toLowerCase() === 'me'
  })
}

function parsePrivateMessage (raw, opts) {
  const meName = (opts && opts.meName) || ''
  const allowlist = (opts && opts.allowlist) || []
  const clean = String(raw || '').replace(/§[0-9a-fk-or]/gi, '').trim()
  if (!clean) return null
  // Arrow formats: "[sender -> receiver] text" and "sender -> me: text".
  const arrow = clean.indexOf('->')
  if (arrow > 0) {
    const left = clean.slice(0, arrow)
    const right = clean.slice(arrow + 2)
    const closeIdx = right.indexOf(']')
    const recvSeg = (closeIdx >= 0 ? right.slice(0, closeIdx) : right).trim()
    if (receiverIsMe(recvSeg, meName)) {
      let text
      if (closeIdx >= 0) {
        text = right.slice(closeIdx + 1).replace(/^\s*:?\s*/, '').trim()
      } else {
        const colon = right.indexOf(':')
        text = colon >= 0 ? right.slice(colon + 1).trim() : ''
      }
      const senderSeg = left.includes('[') ? left.slice(left.lastIndexOf('[') + 1) : left
      const sender = resolveSender(senderSeg, allowlist)
      if (sender) return { sender, text }
    }
  }
  // Vanilla whisper: "Name whispers to you: text" (sender may be a
  // dotted Bedrock name).
  const wm = clean.match(/^(\.?[A-Za-z0-9_]{3,16})\s+whispers(?:\s+to\s+you)?\s*:\s*([\s\S]*)$/i)
  if (wm) return { sender: wm[1], text: wm[2].trim() }
  return null
}

module.exports = {
  isAllowedPanelUser,
  isAllowedMcName,
  parsePanelCommand,
  parseWhisperCommand,
  parsePrivateMessage
}
