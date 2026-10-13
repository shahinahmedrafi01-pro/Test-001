/* ============================================================
   PIXEL KINGDOM — mobile.js
   Touch controls: virtual joystick + action buttons.
   Writes into PK.Mobile.state, merged by main.js each frame.
   Depends: PK (utils), PK.UI, PK.Entities.
   ============================================================ */
var PK = PK || {};

PK.Mobile = (function () {
  'use strict';
  var state = { mx: 0, my: 0, sprint: false, attack: false, interact: false, skills: [false, false, false] };
  var _isTouch = null;
  var joyActive = false, joyId = null, joyOX = 0, joyOY = 0;

  function isTouch() {
    if (_isTouch === null) {
      _isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
    }
    return _isTouch;
  }

  function init() {
    if (!isTouch()) return;
    document.body.classList.add('touch');
    var mc = document.getElementById('mobile-controls');
    mc.innerHTML =
      '<div id="joy-zone"><div id="joy-base"><div id="joy-knob"></div></div></div>' +
      '<div id="mob-btns">' +
        '<button id="mb-skill1" class="mob-btn skill">Q</button>' +
        '<button id="mb-skill2" class="mob-btn skill">E</button>' +
        '<button id="mb-skill3" class="mob-btn skill">R</button>' +
        '<button id="mb-sprint" class="mob-btn small">🏃</button>' +
        '<button id="mb-interact" class="mob-btn">✋</button>' +
        '<button id="mb-attack" class="mob-btn big">⚔️</button>' +
      '</div>';
    mc.style.display = 'block';

    var zone = document.getElementById('joy-zone'),
        base = document.getElementById('joy-base'),
        knob = document.getElementById('joy-knob');

    function setKnob(dx, dy) {
      var max = 44;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      state.mx = Math.abs(dx / max) < 0.18 ? 0 : dx / max;
      state.my = Math.abs(dy / max) < 0.18 ? 0 : dy / max;
    }
    zone.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      joyActive = true; joyId = t.identifier;
      joyOX = t.clientX; joyOY = t.clientY;
      base.style.left = (joyOX - 60) + 'px';
      base.style.top = (joyOY - 60) + 'px';
      base.style.display = 'block';
      setKnob(0, 0);
      PK.Audio.unlock();
    }, { passive: false });
    zone.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (!joyActive) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === joyId) setKnob(t.clientX - joyOX, t.clientY - joyOY);
      }
    }, { passive: false });
    function joyEnd(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joyId) {
          joyActive = false; joyId = null;
          state.mx = 0; state.my = 0;
          knob.style.transform = 'translate(0,0)';
          base.style.display = 'none';
        }
      }
    }
    zone.addEventListener('touchend', joyEnd);
    zone.addEventListener('touchcancel', joyEnd);

    function holdBtn(id, on, off) {
      var b = document.getElementById(id);
      b.addEventListener('touchstart', function (e) { e.preventDefault(); on(); b.classList.add('held'); PK.Audio.unlock(); }, { passive: false });
      var end = function (e) { e.preventDefault(); if (off) off(); b.classList.remove('held'); };
      b.addEventListener('touchend', end);
      b.addEventListener('touchcancel', end);
    }
    holdBtn('mb-attack', function () { state.attack = true; }, function () { state.attack = false; });
    holdBtn('mb-interact', function () { state.interact = true; }, function () { state.interact = false; });
    holdBtn('mb-skill1', function () { state.skills[0] = true; }, function () { state.skills[0] = false; });
    holdBtn('mb-skill2', function () { state.skills[1] = true; }, function () { state.skills[1] = false; });
    holdBtn('mb-skill3', function () { state.skills[2] = true; }, function () { state.skills[2] = false; });
    // sprint toggles
    document.getElementById('mb-sprint').addEventListener('touchstart', function (e) {
      e.preventDefault();
      state.sprint = !state.sprint;
      this.classList.toggle('held', state.sprint);
    }, { passive: false });

    // prevent page scroll/zoom gestures on the game
    document.addEventListener('touchmove', function (e) {
      if (e.target.closest('#overlays .panel-body')) return; // allow panel scroll
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  }

  // merge into a fresh input object each frame (called by main.js)
  function poll(input) {
    if (Math.abs(state.mx) > 0.01 || Math.abs(state.my) > 0.01) {
      if (state.mx < -0.18) input.left = true;
      if (state.mx > 0.18) input.right = true;
      if (state.my < -0.18) input.up = true;
      if (state.my > 0.18) input.down = true;
    }
    if (state.sprint) input.sprint = true;
    return input;
  }
  function consumeButtons() {
    var b = { attack: state.attack, interact: state.interact, skills: state.skills.slice() };
    state.attack = false; state.interact = false;
    state.skills = [false, false, false];
    return b;
  }

  return { isTouch: isTouch, init: init, poll: poll, consumeButtons: consumeButtons, state: state };
})();
