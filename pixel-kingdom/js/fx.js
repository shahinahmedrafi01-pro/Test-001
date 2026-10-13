/* ============================================================
   PIXEL KINGDOM — fx.js
   Particles, damage numbers, weather, screen shake, lighting.
   Depends: PK (utils.js).
   ============================================================ */
var PK = PK || {};

PK.FX = (function () {
  'use strict';
  var U = PK.Utils;
  var particles = [], numbers = [], floaters = [];
  var shakeT = 0, shakeMag = 0;
  var weather = 'clear'; // clear|rain|snow
  var weatherT = 0;
  var lights = []; // {x,y,r,color,flicker} refreshed each frame by engine

  function burst(x, y, opt) {
    opt = opt || {};
    var n = opt.n || 10;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (opt.speed || 90) * (0.3 + Math.random() * 0.7);
      particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 0),
        life: 0, max: (opt.life || 0.6) * (0.6 + Math.random() * 0.8),
        size: opt.size || 3, color: opt.color || '#fff',
        grav: opt.grav || 0, shrink: opt.shrink !== false
      });
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600);
  }
  function hitSpark(x, y, color) { burst(x, y, { n: 8, color: color || '#ffd54f', speed: 120, life: 0.4, size: 3 }); }
  function blood(x, y) { burst(x, y, { n: 10, color: '#e53935', speed: 110, life: 0.5, size: 3, grav: 300 }); }
  function leafBurst(x, y) { burst(x, y, { n: 8, color: '#66bb6a', speed: 70, life: 0.7, size: 3, grav: 120 }); }
  function magic(x, y, color) { burst(x, y, { n: 12, color: color || '#b388ff', speed: 80, life: 0.7, size: 3, up: 40 }); }
  function healFx(x, y) { burst(x, y, { n: 12, color: '#69f0ae', speed: 50, life: 0.9, size: 3, up: 90 }); }
  function levelupFx(x, y) {
    burst(x, y, { n: 26, color: '#ffd54f', speed: 160, life: 1.0, size: 4, up: 120 });
    burst(x, y, { n: 14, color: '#ffffff', speed: 100, life: 0.8, size: 3, up: 80 });
  }

  function dmgNum(x, y, text, kind) {
    // kind: 'player' (white), 'crit' (orange big), 'enemy' (red), 'heal' (green), 'miss' (gray), 'xp' (cyan small)
    numbers.push({ x: x + (Math.random() - 0.5) * 10, y: y - 10, text: String(text), kind: kind || 'enemy', life: 0, max: kind === 'xp' ? 1.2 : 0.9 });
    if (numbers.length > 80) numbers.splice(0, numbers.length - 80);
  }
  function floater(x, y, text, color) {
    floaters.push({ x: x, y: y, text: text, color: color || '#fff', life: 0, max: 1.6 });
  }

  function shake(mag, dur) {
    if (!PK.Game || !PK.Game.settings.screenshake) return;
    shakeMag = Math.max(shakeMag, mag); shakeT = Math.max(shakeT, dur || 0.25);
  }
  function shakeOffset() {
    if (shakeT <= 0) return { x: 0, y: 0 };
    var m = shakeMag * (shakeT / 0.25);
    return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
  }

  function setWeather(w) { weather = w; }
  function updateWeather(dt, biome, night) {
    weatherT -= dt;
    if (weatherT <= 0) {
      weatherT = 20 + Math.random() * 30;
      var r = Math.random();
      if (biome === 'peaks') weather = r < 0.5 ? 'snow' : 'clear';
      else if (night) weather = r < 0.25 ? 'rain' : 'clear';
      else weather = r < 0.18 ? 'rain' : 'clear';
    }
  }

  function update(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (var j = numbers.length - 1; j >= 0; j--) {
      var n = numbers[j];
      n.life += dt; n.y -= 46 * dt;
      if (n.life >= n.max) numbers.splice(j, 1);
    }
    for (var k = floaters.length - 1; k >= 0; k--) {
      var f = floaters[k];
      f.life += dt; f.y -= 22 * dt;
      if (f.life >= f.max) floaters.splice(k, 1);
    }
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
  }

  function renderWorld(ctx, cam) {
    var i, p, a;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      var s = p.shrink ? p.size * a + 1 : p.size;
      ctx.fillRect(p.x - cam.x - s / 2, p.y - cam.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  function renderWeather(ctx, vw, vh, cam) {
    if (weather === 'clear') return;
    var n = weather === 'rain' ? 90 : 60;
    ctx.fillStyle = weather === 'rain' ? 'rgba(174,194,224,0.5)' : 'rgba(255,255,255,0.8)';
    var t = performance.now() / 1000;
    for (var i = 0; i < n; i++) {
      var x = ((i * 97.3 + t * (weather === 'rain' ? 420 : 40)) % (vw + 40)) - 20;
      var y = ((i * 57.7 + t * (weather === 'rain' ? 520 : 60)) % (vh + 40)) - 20;
      if (weather === 'rain') ctx.fillRect(x, y + (x % 7), 2, 9);
      else ctx.fillRect(x, y, 3, 3);
    }
  }
  var NUM_STYLE = {
    player: { c: '#ffffff', s: 13 }, crit: { c: '#ffb300', s: 17 },
    enemy: { c: '#ff8a80', s: 13 }, heal: { c: '#69f0ae', s: 13 },
    miss: { c: '#b0bec5', s: 12 }, xp: { c: '#80deea', s: 11 },
    gold: { c: '#ffd54f', s: 12 }
  };
  function renderNumbers(ctx, cam) {
    ctx.textAlign = 'center';
    for (var i = 0; i < numbers.length; i++) {
      var n = numbers[i], st = NUM_STYLE[n.kind] || NUM_STYLE.enemy;
      var a = n.life > n.max * 0.6 ? 1 - (n.life - n.max * 0.6) / (n.max * 0.4) : 1;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = 'bold ' + st.s + 'px monospace';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
      var sx = n.x - cam.x, sy = n.y - cam.y;
      ctx.strokeText(n.text, sx, sy);
      ctx.fillStyle = st.c;
      ctx.fillText(n.text, sx, sy);
    }
    ctx.globalAlpha = 1;
    for (var j = 0; j < floaters.length; j++) {
      var f = floaters[j];
      ctx.globalAlpha = Math.max(0, 1 - f.life / f.max);
      ctx.font = 'bold 13px monospace';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
      var fx = f.x - cam.x, fy = f.y - cam.y;
      ctx.strokeText(f.text, fx, fy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx, fy);
    }
    ctx.globalAlpha = 1;
  }

  // day/night darkness + light radii. lights: [{x,y(px world),r,color}]
  function renderLighting(ctx, vw, vh, cam, darkness, lightList) {
    if (darkness <= 0.02 && (!lightList || !lightList.length)) return;
    var cv = renderLighting._cv;
    if (!cv) {
      cv = renderLighting._cv = document.createElement('canvas');
    }
    if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; }
    var g = cv.getContext('2d');
    g.clearRect(0, 0, vw, vh);
    g.fillStyle = 'rgba(8,8,28,' + darkness.toFixed(3) + ')';
    g.fillRect(0, 0, vw, vh);
    if (lightList && lightList.length && darkness > 0.02) {
      g.globalCompositeOperation = 'destination-out';
      for (var i = 0; i < lightList.length; i++) {
        var L = lightList[i];
        var sx = L.x - cam.x, sy = L.y - cam.y;
        if (sx < -L.r || sy < -L.r || sx > vw + L.r || sy > vh + L.r) continue;
        var flick = 1 + (L.flicker ? Math.sin(performance.now() / 130 + L.x) * 0.08 : 0);
        var gr = g.createRadialGradient(sx, sy, 0, sx, sy, L.r * flick);
        gr.addColorStop(0, 'rgba(0,0,0,0.95)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(sx, sy, L.r * flick, 0, 7); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(cv, 0, 0);
  }

  return {
    burst: burst, hitSpark: hitSpark, blood: blood, leafBurst: leafBurst,
    magic: magic, healFx: healFx, levelupFx: levelupFx,
    dmgNum: dmgNum, floater: floater,
    shake: shake, shakeOffset: shakeOffset,
    setWeather: setWeather, updateWeather: updateWeather, getWeather: function () { return weather; },
    update: update, renderWorld: renderWorld, renderWeather: renderWeather,
    renderNumbers: renderNumbers, renderLighting: renderLighting
  };
})();
