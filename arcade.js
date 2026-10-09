"use strict";
/* Rafi's Mini Arcade — hub logic: show saved best scores on cards. */
(function () {
  function show(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    var v = 0;
    try { v = parseInt(localStorage.getItem(key) || "0", 10) || 0; } catch (e) {}
    el.textContent = v.toLocaleString("en-US");
  }
  show("best-dino", "dinoHi");
  show("best-alien", "alienDefenseBest");
})();
