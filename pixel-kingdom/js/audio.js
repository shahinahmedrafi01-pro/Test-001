/* ============================================================================
 * Pixel Kingdom - Audio Module (PK.Audio)
 * ----------------------------------------------------------------------------
 * All audio is synthesized with the Web Audio API. No external audio files.
 *
 * Public contract (called by the game engine):
 *   PK.Audio.init()            - set defaults; does NOT create AudioContext
 *   PK.Audio.unlock()          - call on first user gesture; creates/resumes
 *                                the AudioContext (autoplay-policy safe)
 *   PK.Audio.sfx(name)         - play a one-shot sound effect; unknown names
 *                                are ignored silently, never throws
 *   PK.Audio.music(name|null)  - start a looping track, or stop with null;
 *                                quick fade (~0.5s) between tracks
 *   PK.Audio.setMaster(v)      - master volume 0..1
 *   PK.Audio.setMusic(v)       - music volume 0..1
 *   PK.Audio.setSfx(v)         - sfx volume 0..1
 *   PK.Audio.toggleMute()      - flips mute, returns new muted bool
 *   PK.Audio.update(dt, ctx)   - optional auto track-switching from game state
 *   PK.Audio.muted             - current mute state (read-only)
 * ========================================================================== */

var PK = PK || {};

(function () {
'use strict';

/* ---------------------------------------------------------------------------
 * 1. State
 * ------------------------------------------------------------------------- */
var state = {
  ctx: null,          // AudioContext (created lazily in unlock())
  masterGain: null,   // -> destination
  musicGain: null,    // -> masterGain
  sfxGain: null,      // -> masterGain
  noiseBuf: null,     // shared white-noise buffer

  initialized: false,
  unlocked: false,
  muted: false,

  masterVol: 0.8,
  musicVol: 0.7,
  sfxVol: 0.9,

  // music sequencer
  currentTrack: null, // track actually playing
  desiredTrack: null, // last target passed to music()
  seqTimer: null,     // setInterval id
  seqStep: 0,         // current 16th-note step
  seqNext: 0,         // audio-time of next scheduled step

  // update() auto-switch throttle
  autoAcc: 2.0        // start >= 2 so the first update() may switch at once
};

/* ---------------------------------------------------------------------------
 * 2. Small helpers
 * ------------------------------------------------------------------------- */

// midi note number -> frequency (Hz)
function mtof(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function clamp01(v) {
  v = Number(v);
  if (isNaN(v)) { return 0; }
  if (v < 0) { return 0; }
  if (v > 1) { return 1; }
  return v;
}

// AudioContext exists and is usable
function ready() {
  return !!(state.unlocked && state.ctx && state.masterGain);
}

// Resume a suspended context (autoplay policy) - never throws
function ensureRunning() {
  try {
    if (state.ctx && state.ctx.state === 'suspended') {
      state.ctx.resume();
    }
  } catch (e) { /* ignore */ }
}

/* ---------------------------------------------------------------------------
 * 3. Sound primitives (SFX)
 * ------------------------------------------------------------------------- */

// One oscillator blip with a simple attack/decay envelope.
// o = {freq, freqEnd, dur, type, vol, delay}
function tone(o) {
  if (!ready() || state.muted) { return; }
  try {
    var t0 = state.ctx.currentTime + (o.delay || 0);
    var osc = state.ctx.createOscillator();
    var g = state.ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(Math.max(1, o.freq || 440), t0);
    if (o.freqEnd && o.freqEnd > 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t0 + (o.dur || 0.15));
    }
    var peak = (o.vol == null ? 0.3 : o.vol) * state.sfxVol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || 0.15));
    osc.connect(g);
    g.connect(state.sfxGain);
    osc.start(t0);
    osc.stop(t0 + (o.dur || 0.15) + 0.05);
  } catch (e) { /* never throw */ }
}

// Filtered noise burst.
// o = {dur, vol, filterFreq, filterType, delay}
function noise(o) {
  if (!ready() || state.muted) { return; }
  try {
    var t0 = state.ctx.currentTime + (o.delay || 0);
    var src = state.ctx.createBufferSource();
    src.buffer = state.noiseBuf;
    src.loop = true;
    var f = state.ctx.createBiquadFilter();
    f.type = o.filterType || 'lowpass';
    f.frequency.value = o.filterFreq || 1000;
    var g = state.ctx.createGain();
    var peak = (o.vol == null ? 0.3 : o.vol) * state.sfxVol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || 0.2));
    src.connect(f);
    f.connect(g);
    g.connect(state.sfxGain);
    src.start(t0);
    src.stop(t0 + (o.dur || 0.2) + 0.05);
  } catch (e) { /* never throw */ }
}

/* ---------------------------------------------------------------------------
 * 4. SFX library - every sound is a tiny synth recipe
 * ------------------------------------------------------------------------- */
var SFX = {
  /* -- combat -- */
  swing:  function () { noise({ dur: 0.12, vol: 0.20, filterFreq: 2800, filterType: 'highpass' }); },
  hit:    function () {
    tone({ freq: 210, freqEnd: 80, dur: 0.12, type: 'square', vol: 0.35 });
    noise({ dur: 0.08, vol: 0.25, filterFreq: 1400 });
  },
  crit:   function () {
    tone({ freq: 420, freqEnd: 90, dur: 0.18, type: 'square', vol: 0.45 });
    noise({ dur: 0.14, vol: 0.30, filterFreq: 2200 });
    tone({ freq: 1200, freqEnd: 1800, dur: 0.10, type: 'sine', vol: 0.15, delay: 0.02 });
  },
  kill:   function () {
    tone({ freq: 320, freqEnd: 50, dur: 0.32, type: 'sawtooth', vol: 0.35 });
    noise({ dur: 0.20, vol: 0.20, filterFreq: 900 });
  },
  bow:    function () {
    tone({ freq: 280, freqEnd: 640, dur: 0.10, type: 'triangle', vol: 0.25 });
    noise({ dur: 0.10, vol: 0.18, filterFreq: 3500, filterType: 'highpass', delay: 0.05 });
  },
  shoot:  function () { tone({ freq: 820, freqEnd: 190, dur: 0.11, type: 'square', vol: 0.28 }); },
  dash:   function () {
    noise({ dur: 0.18, vol: 0.22, filterFreq: 1500, filterType: 'highpass' });
    tone({ freq: 380, freqEnd: 820, dur: 0.15, type: 'sine', vol: 0.18 });
  },

  /* -- magic -- */
  fireball: function () {
    noise({ dur: 0.40, vol: 0.35, filterFreq: 1100 });
    tone({ freq: 220, freqEnd: 70, dur: 0.38, type: 'sawtooth', vol: 0.28 });
  },
  frost:  function () {
    tone({ freq: 1400, freqEnd: 2500, dur: 0.32, type: 'sine', vol: 0.22 });
    noise({ dur: 0.30, vol: 0.14, filterFreq: 4200, filterType: 'highpass' });
  },
  freeze: function () {
    tone({ freq: 1250, freqEnd: 320, dur: 0.28, type: 'sine', vol: 0.28 });
    noise({ dur: 0.18, vol: 0.20, filterFreq: 2600, filterType: 'highpass' });
  },
  heal:   function () {
    tone({ freq: 520, freqEnd: 1040, dur: 0.42, type: 'sine', vol: 0.26 });
    tone({ freq: 780, freqEnd: 1560, dur: 0.42, type: 'sine', vol: 0.14, delay: 0.08 });
  },
  buff:   function () {
    tone({ freq: 440, freqEnd: 880, dur: 0.30, type: 'triangle', vol: 0.26 });
    tone({ freq: 660, freqEnd: 1320, dur: 0.30, type: 'triangle', vol: 0.20, delay: 0.10 });
  },
  poison: function () {
    tone({ freq: 300, freqEnd: 210, dur: 0.22, type: 'triangle', vol: 0.28 });
    tone({ freq: 260, freqEnd: 180, dur: 0.22, type: 'triangle', vol: 0.24, delay: 0.16 });
  },
  explode: function () {
    noise({ dur: 0.65, vol: 0.50, filterFreq: 480 });
    tone({ freq: 120, freqEnd: 28, dur: 0.55, type: 'sawtooth', vol: 0.42 });
  },
  boss_roar: function () {
    tone({ freq: 95, freqEnd: 34, dur: 0.90, type: 'sawtooth', vol: 0.55 });
    tone({ freq: 140, freqEnd: 50, dur: 0.90, type: 'square', vol: 0.25, delay: 0.05 });
    noise({ dur: 0.90, vol: 0.35, filterFreq: 260 });
  },

  /* -- gathering / crafting -- */
  chop:   function () {
    noise({ dur: 0.10, vol: 0.32, filterFreq: 1100 });
    tone({ freq: 160, freqEnd: 75, dur: 0.10, type: 'triangle', vol: 0.30 });
  },
  mine:   function () {
    tone({ freq: 1250, freqEnd: 900, dur: 0.06, type: 'square', vol: 0.22 });
    noise({ dur: 0.09, vol: 0.24, filterFreq: 2100, filterType: 'bandpass' });
  },
  craft:  function () {
    for (var i = 0; i < 3; i++) {
      tone({ freq: 480 + i * 90, dur: 0.06, type: 'square', vol: 0.24, delay: i * 0.09 });
    }
    noise({ dur: 0.12, vol: 0.14, filterFreq: 2600, delay: 0.24 });
  },
  smelt:  function () {
    noise({ dur: 0.50, vol: 0.26, filterFreq: 750 });
    tone({ freq: 150, freqEnd: 95, dur: 0.45, type: 'triangle', vol: 0.20 });
  },

  /* -- pickups / economy -- */
  pickup: function () {
    tone({ freq: 660, dur: 0.07, type: 'sine', vol: 0.30 });
    tone({ freq: 880, dur: 0.10, type: 'sine', vol: 0.30, delay: 0.07 });
  },
  coin:   function () {
    tone({ freq: 987.77, dur: 0.06, type: 'square', vol: 0.20 });
    tone({ freq: 1318.5, dur: 0.28, type: 'square', vol: 0.20, delay: 0.06 });
  },
  chest:  function () {
    tone({ freq: 190, freqEnd: 420, dur: 0.16, type: 'triangle', vol: 0.30 });
    tone({ freq: 987.77, dur: 0.06, type: 'square', vol: 0.18, delay: 0.14 });
    tone({ freq: 1318.5, dur: 0.25, type: 'square', vol: 0.18, delay: 0.20 });
  },
  eat:    function () {
    noise({ dur: 0.08, vol: 0.26, filterFreq: 700 });
    noise({ dur: 0.08, vol: 0.24, filterFreq: 600, delay: 0.12 });
  },
  drink:  function () {
    tone({ freq: 320, freqEnd: 620, dur: 0.14, type: 'sine', vol: 0.26 });
    tone({ freq: 380, freqEnd: 700, dur: 0.14, type: 'sine', vol: 0.24, delay: 0.15 });
  },

  /* -- progression / story -- */
  levelup: function () {
    var n = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < n.length; i++) {
      tone({ freq: n[i], dur: 0.13, type: 'square', vol: 0.22, delay: i * 0.10 });
    }
  },
  quest:  function () {
    tone({ freq: 440, freqEnd: 660, dur: 0.18, type: 'triangle', vol: 0.28 });
    tone({ freq: 660, freqEnd: 880, dur: 0.20, type: 'triangle', vol: 0.26, delay: 0.16 });
  },
  quest_done: function () {
    var n = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (var i = 0; i < n.length; i++) {
      tone({ freq: n[i], dur: i === n.length - 1 ? 0.45 : 0.13, type: 'square', vol: 0.22, delay: i * 0.11 });
    }
  },
  dialog: function () { tone({ freq: 810, dur: 0.035, type: 'square', vol: 0.16 }); },
  save:   function () {
    tone({ freq: 880, dur: 0.08, type: 'sine', vol: 0.28 });
    tone({ freq: 1174.7, dur: 0.14, type: 'sine', vol: 0.28, delay: 0.09 });
  },
  teleport: function () {
    tone({ freq: 280, freqEnd: 1900, dur: 0.42, type: 'sine', vol: 0.26 });
    noise({ dur: 0.40, vol: 0.12, filterFreq: 3800, filterType: 'highpass', delay: 0.05 });
  },

  /* -- ui / world -- */
  ui:     function () { tone({ freq: 620, dur: 0.05, type: 'sine', vol: 0.20 }); },
  open:   function () { tone({ freq: 210, freqEnd: 480, dur: 0.14, type: 'triangle', vol: 0.26 }); },
  close:  function () { tone({ freq: 480, freqEnd: 210, dur: 0.14, type: 'triangle', vol: 0.26 }); },
  error:  function () {
    tone({ freq: 210, freqEnd: 150, dur: 0.16, type: 'square', vol: 0.30 });
    tone({ freq: 210, freqEnd: 150, dur: 0.16, type: 'square', vol: 0.30, delay: 0.18 });
  },
  death:  function () {
    tone({ freq: 420, freqEnd: 38, dur: 0.80, type: 'sawtooth', vol: 0.40 });
    noise({ dur: 0.50, vol: 0.22, filterFreq: 600, delay: 0.10 });
  },
  respawn: function () {
    tone({ freq: 220, freqEnd: 880, dur: 0.50, type: 'sine', vol: 0.26 });
    tone({ freq: 440, freqEnd: 1320, dur: 0.50, type: 'sine', vol: 0.14, delay: 0.10 });
  },
  step:   function () { noise({ dur: 0.05, vol: 0.07, filterFreq: 480 }); },
  splash: function () { noise({ dur: 0.30, vol: 0.24, filterFreq: 1900 }); },
  jump_land: function () {
    tone({ freq: 150, freqEnd: 60, dur: 0.10, type: 'triangle', vol: 0.26 });
    noise({ dur: 0.08, vol: 0.16, filterFreq: 700 });
  }
};

/* ---------------------------------------------------------------------------
 * 5. Music - chiptune step sequencer
 *    Each track: { bpm, wave, bassVol, leadVol, bass:[16 midi|0], lead:[16 midi|0] }
 *    0 = rest. 16 steps loop.
 * ------------------------------------------------------------------------- */
var TRACKS = {
  // gentle arpeggio - C major
  title: {
    bpm: 92, leadWave: 'sine', bassVol: 0.16, leadVol: 0.20,
    bass: [36,0,0,0, 41,0,0,0, 43,0,0,0, 48,0,43,0],
    lead: [60,64,67,72, 65,69,72,77, 67,71,74,79, 72,76,79,84]
  },
  // warm folk waltz feel - F major
  village: {
    bpm: 100, leadWave: 'triangle', bassVol: 0.20, leadVol: 0.22,
    bass: [41,0,0,41, 46,0,0,46, 43,0,0,43, 41,0,0,0],
    lead: [69,0,72,0, 74,72,0,70, 69,0,65,0, 67,0,72,0]
  },
  // adventurous - C major pentatonic
  field: {
    bpm: 116, leadWave: 'square', bassVol: 0.20, leadVol: 0.13,
    bass: [36,0,36,0, 43,0,41,0, 36,0,36,0, 45,0,43,0],
    lead: [64,0,67,72, 0,71,0,69, 67,0,64,0, 62,0,64,0]
  },
  // dark and sparse - A minor
  dungeon: {
    bpm: 84, leadWave: 'sine', bassVol: 0.24, leadVol: 0.16,
    bass: [33,0,0,0, 0,0,33,0, 31,0,0,0, 0,0,29,0],
    lead: [57,0,0,0, 0,0,0,0, 55,0,0,0, 0,0,53,0]
  },
  // driving - E minor, with hats
  battle: {
    bpm: 140, leadWave: 'square', bassVol: 0.24, leadVol: 0.13, hats: true,
    bass: [40,40,0,40, 40,0,40,40, 38,38,0,38, 43,0,42,0],
    lead: [76,0,74,76, 79,0,76,74, 72,0,74,76, 74,72,71,72]
  },
  // intense - D minor, with hats
  boss: {
    bpm: 152, leadWave: 'sawtooth', bassVol: 0.26, leadVol: 0.12, hats: true,
    bass: [38,38,38,0, 38,0,38,38, 36,36,36,0, 41,0,40,0],
    lead: [74,0,72,74, 77,76,74,72, 70,72,74,72, 69,0,70,0]
  },
  // sparse and soft - late night
  night: {
    bpm: 68, leadWave: 'sine', bassVol: 0.15, leadVol: 0.15,
    bass: [45,0,0,0, 0,0,0,0, 41,0,0,0, 0,0,0,0],
    lead: [69,0,0,0, 0,0,0,72, 0,0,0,0, 74,0,72,0]
  }
};

// music-voice oscillator (connects to musicGain instead of sfxGain)
function mtone(freq, t, dur, type, vol) {
  try {
    var osc = state.ctx.createOscillator();
    var g = state.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol * state.musicVol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(state.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch (e) { /* never throw */ }
}

function mnoise(t, dur, vol, filterFreq) {
  try {
    var src = state.ctx.createBufferSource();
    src.buffer = state.noiseBuf;
    src.loop = true;
    var f = state.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = filterFreq || 6000;
    var g = state.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol * state.musicVol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(state.musicGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  } catch (e) { /* never throw */ }
}

// schedule one 16th-note step of the current track at audio-time t
function scheduleStep(track, step, t) {
  var stepDur = 60 / track.bpm / 4;
  var b = track.bass[step];
  var l = track.lead[step];
  if (b) { mtone(mtof(b), t, stepDur * 2.2, 'triangle', track.bassVol); }
  if (l) { mtone(mtof(l), t, stepDur * 0.9, track.leadWave, track.leadVol); }
  if (track.hats && step % 2 === 1) { mnoise(t, 0.03, 0.05); }
}

// lookahead scheduler tick
function seqTick() {
  try {
    var track = TRACKS[state.currentTrack];
    if (!track || !state.ctx) { return; }
    var stepDur = 60 / track.bpm / 4;
    while (state.seqNext < state.ctx.currentTime + 0.15) {
      scheduleStep(track, state.seqStep, state.seqNext);
      state.seqNext += stepDur;
      state.seqStep = (state.seqStep + 1) % 16;
    }
  } catch (e) { /* never throw */ }
}

function stopSequencer() {
  if (state.seqTimer !== null) {
    try { clearInterval(state.seqTimer); } catch (e) {}
    state.seqTimer = null;
  }
}

function startSequencer(name) {
  stopSequencer();
  state.currentTrack = name;
  state.seqStep = 0;
  state.seqNext = state.ctx.currentTime + 0.06;
  state.seqTimer = setInterval(seqTick, 30);
}

/* ---------------------------------------------------------------------------
 * 6. Public API
 * ------------------------------------------------------------------------- */
var api = {

  // Set defaults. Never creates an AudioContext here (autoplay policy).
  init: function () {
    try {
      state.initialized = true;
      state.muted = false;
      state.masterVol = 0.8;
      state.musicVol = 0.7;
      state.sfxVol = 0.9;
    } catch (e) { /* never throw */ }
  },

  // Call on the first user gesture. Creates (or resumes) the AudioContext.
  // Safe to call any number of times.
  unlock: function () {
    try {
      if (!state.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { return; } // no Web Audio support - stay silent
        state.ctx = new AC();

        state.masterGain = state.ctx.createGain();
        state.masterGain.gain.value = state.muted ? 0 : state.masterVol;
        state.masterGain.connect(state.ctx.destination);

        state.musicGain = state.ctx.createGain();
        state.musicGain.gain.value = 0; // faded in when a track starts
        state.musicGain.connect(state.masterGain);

        state.sfxGain = state.ctx.createGain();
        state.sfxGain.gain.value = 1;
        state.sfxGain.connect(state.masterGain);

        // shared 1s white-noise buffer
        var len = state.ctx.sampleRate;
        state.noiseBuf = state.ctx.createBuffer(1, len, state.ctx.sampleRate);
        var d = state.noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; }
      }
      state.unlocked = true;
      ensureRunning();
    } catch (e) { /* never throw */ }
  },

  // Play a one-shot SFX. Unknown names are ignored silently.
  sfx: function (name) {
    try {
      if (!state.unlocked) { return; }
      ensureRunning();
      var fn = SFX[name];
      if (typeof fn === 'function') { fn(); }
    } catch (e) { /* never throw */ }
  },

  // Start a looping track (name) or stop (null). Quick ~0.5s fade between
  // tracks. Requesting the currently-playing track is a no-op.
  music: function (name) {
    try {
      state.desiredTrack = name || null;
      state.autoAcc = 0; // a direct request resets the auto-switch throttle
      if (!state.unlocked || !ready()) { return; }
      ensureRunning();
      if (name && !TRACKS[name]) { return; } // unknown track - ignore
      if (name === state.currentTrack) { return; } // already playing

      var now = state.ctx.currentTime;
      var target = name || null;
      var myRequest = state.desiredTrack;

      // fade out over ~0.25s
      try {
        state.musicGain.gain.cancelScheduledValues(now);
        state.musicGain.gain.setTargetAtTime(0.0001, now, 0.10);
      } catch (e) {}

      setTimeout(function () {
        try {
          // superseded by a newer music() call - abort
          if (state.desiredTrack !== myRequest) { return; }
          if (!state.ctx) { return; }
          stopSequencer();
          if (!target) {
            state.currentTrack = null;
            return;
          }
          startSequencer(target);
          // fade back in over ~0.25s (total switch ≈ 0.5s)
          var t = state.ctx.currentTime;
          try {
            state.musicGain.gain.cancelScheduledValues(t);
            state.musicGain.gain.setTargetAtTime(1.0, t, 0.10);
          } catch (e) {}
        } catch (e) { /* never throw */ }
      }, 260);
    } catch (e) { /* never throw */ }
  },

  setMaster: function (v) {
    try {
      state.masterVol = clamp01(v);
      if (state.masterGain && !state.muted) {
        state.masterGain.gain.setTargetAtTime(state.masterVol, state.ctx.currentTime, 0.02);
      }
    } catch (e) {}
  },

  setMusic: function (v) {
    try { state.musicVol = clamp01(v); } catch (e) {}
  },

  setSfx: function (v) {
    try { state.sfxVol = clamp01(v); } catch (e) {}
  },

  // Flip mute state; returns the new state.
  toggleMute: function () {
    try {
      state.muted = !state.muted;
      if (state.masterGain && state.ctx) {
        state.masterGain.gain.setTargetAtTime(
          state.muted ? 0 : state.masterVol, state.ctx.currentTime, 0.02);
      }
    } catch (e) {}
    return state.muted;
  },

  // Optional auto track-switching from game state.
  // ctx = {combat, boss, dungeon, village, night}. Switches at most once
  // per 2 seconds, and only when the desired track differs.
  update: function (dt, ctx) {
    try {
      if (!ctx || typeof dt !== 'number') { return; }
      state.autoAcc += dt;
      if (state.autoAcc < 2.0) { return; }
      var want = ctx.boss ? 'boss'
        : ctx.combat ? 'battle'
        : ctx.dungeon ? 'dungeon'
        : ctx.village ? 'village'
        : ctx.night ? 'night'
        : 'field';
      state.autoAcc = 0;
      if (want !== state.currentTrack) {
        api.music(want);
      }
    } catch (e) { /* never throw */ }
  }
};

// read-only muted flag on the public object
Object.defineProperty(api, 'muted', {
  get: function () { return state.muted; },
  enumerable: true
});

PK.Audio = api;

})();
