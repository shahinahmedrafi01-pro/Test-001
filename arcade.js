"use strict";
/* GitHub Games — hub logic. All state lives in localStorage; game scores use the games' own keys. */
(function () {

  /* ---------------- game catalog (real, installed games only) ---------------- */
  var GAMES = [
    {
      id: "police-chase",
      title: "Police Chase",
      genre: "Arcade Racing",
      categories: ["Racing", "Action"],
      tagline: "Outrun the cops, dodge the traffic. How long can you survive?",
      description: "A top-down endless highway racer. Automatic forward driving on a 5-lane highway — switch lanes to dodge traffic, trucks and road barriers while police cars chase you down. Crashes and wall scrapes trigger pursuits; three wall hits and you're surrounded.",
      controls: "← → or A / D to switch lanes · swipe on touch screens · P to pause",
      features: ["5-lane endless highway", "Police pursuits & surges", "Nitro, Shield, Phase & Repair pickups", "UFO & helicopter events", "Best score saved on this device"],
      credits: "Original game built for this site.",
      route: "police-chase/",
      cover: "img/cover-police-chase.jpg",
      scoreKey: "policeChaseBest",
      scoreLabel: "Best score"
    }
  ];
  var SCORE_KEYS = ["policeChaseBest", "dinoHi", "alienDefenseBest"]; // legacy keys cleared by "reset best scores"

  /* ---------------- storage helpers ---------------- */
  function lsGet(k, fb) {
    try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); }
    catch (e) { return fb; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var store = {
    get favs() { return lsGet("gg_favs", []); },
    set favs(v) { lsSet("gg_favs", v); },
    get recent() { return lsGet("gg_recent", []); },
    set recent(v) { lsSet("gg_recent", v.slice(0, 10)); },
    get name() { var n = lsGet("gg_name", ""); return typeof n === "string" && n.trim() ? n.trim() : "Player"; },
    set name(v) { lsSet("gg_name", String(v).slice(0, 24)); },
    get accent() { return lsGet("gg_accent", "cyan"); },
    set accent(v) { lsSet("gg_accent", v); },
    get anim() {
      var v = lsGet("gg_anim", null);
      if (v === null && window.matchMedia) return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      return v !== false;
    },
    set anim(v) { lsSet("gg_anim", !!v); },
    get compact() { return lsGet("gg_compact", false) === true; },
    set compact(v) { lsSet("gg_compact", !!v); }
  };

  function gameById(id) { for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i]; return null; }
  function bestScore(g) {
    if (!g.scoreKey) return null;
    try { var v = parseInt(localStorage.getItem(g.scoreKey) || "0", 10); return isNaN(v) ? 0 : v; }
    catch (e) { return 0; }
  }
  function relTime(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    var d = Math.floor(s / 86400);
    return d === 1 ? "yesterday" : d + "d ago";
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------------- dom refs ---------------- */
  function $(id) { return document.getElementById(id); }
  var sidebar = $("sidebar"), backdrop = $("backdrop");

  /* ---------------- toast & confirm ---------------- */
  var toastT = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.hidden = true; }, 2200);
  }
  var confirmCb = null;
  function askConfirm(title, msg, okLabel, cb) {
    $("cf-title").textContent = title;
    $("cf-msg").textContent = msg;
    $("cf-ok").textContent = okLabel || "Confirm";
    confirmCb = cb;
    openModal("confirm-modal");
  }
  $("cf-ok").addEventListener("click", function () {
    closeModals();
    if (confirmCb) { var cb = confirmCb; confirmCb = null; cb(); }
  });

  /* ---------------- modals ---------------- */
  function openModal(id) { $(id).hidden = false; }
  function closeModals() {
    ["info-modal", "about-modal", "confirm-modal"].forEach(function (id) { $(id).hidden = true; });
  }
  document.querySelectorAll("[data-close]").forEach(function (b) {
    b.addEventListener("click", closeModals);
  });
  ["info-modal", "about-modal", "confirm-modal"].forEach(function (id) {
    $(id).addEventListener("click", function (e) { if (e.target === $(id)) closeModals(); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeModals(); deselectCard(); closeAvatarMenu(); closeDrawer(); }
  });

  /* ---------------- game cards ---------------- */
  function cardHTML(g) {
    var fav = store.favs.indexOf(g.id) !== -1;
    return '<article class="gcard' + (fav ? " is-fav" : "") + '" data-id="' + g.id + '" tabindex="0" role="button" aria-label="' + esc(g.title) + '">' +
      '<div class="cover"><img src="' + g.cover + '" alt="' + esc(g.title) + ' cover" loading="lazy">' +
      '<span class="fav-flag" title="Favorite">★</span>' +
      '<div class="card-actions"><div class="ca-title">' + esc(g.title) + '</div>' +
      '<div class="ca-row">' +
      '<a class="btn-play" href="' + g.route + '" data-play="' + g.id + '">▶ Play</a>' +
      '<button class="icon-btn" data-info="' + g.id + '" aria-label="Game details">ⓘ</button>' +
      '<button class="icon-btn fav' + (fav ? " is-fav" : "") + '" data-fav="' + g.id + '" aria-label="Toggle favorite" aria-pressed="' + fav + '">' + (fav ? "★" : "☆") + "</button>" +
      "</div></div></div>" +
      '<div class="gtitle">' + esc(g.title) + '</div><div class="gsub">' + esc(g.genre) + "</div></article>";
  }
  function renderGrid(el, games) { el.innerHTML = games.map(cardHTML).join(""); }

  var selectedCard = null;
  function deselectCard() {
    if (selectedCard) { selectedCard.classList.remove("selected"); selectedCard = null; }
  }
  function toggleFav(id) {
    var favs = store.favs, i = favs.indexOf(id);
    if (i === -1) { favs.push(id); toast("Added to favorites"); }
    else { favs.splice(i, 1); toast("Removed from favorites"); }
    store.favs = favs;
    refreshDynamic();
  }

  document.addEventListener("click", function (e) {
    var favBtn = e.target.closest("[data-fav]");
    if (favBtn) { e.preventDefault(); e.stopPropagation(); toggleFav(favBtn.getAttribute("data-fav")); return; }
    var infoBtn = e.target.closest("[data-info]");
    if (infoBtn) { e.preventDefault(); e.stopPropagation(); openInfo(infoBtn.getAttribute("data-info")); return; }
    var playLink = e.target.closest("[data-play]");
    if (playLink) { recordRecent(playLink.getAttribute("data-play")); return; } // then navigate normally
    var card = e.target.closest(".gcard");
    if (card) {
      if (selectedCard === card) deselectCard();
      else { deselectCard(); card.classList.add("selected"); selectedCard = card; }
      return;
    }
    if (!e.target.closest(".modal")) deselectCard();
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("gcard")) {
      e.preventDefault();
      var card = e.target;
      if (selectedCard === card) deselectCard();
      else { deselectCard(); card.classList.add("selected"); selectedCard = card; }
    }
  });

  /* ---------------- info modal ---------------- */
  function openInfo(id) {
    var g = gameById(id); if (!g) return;
    $("im-cover").src = g.cover; $("im-cover").alt = g.title + " cover";
    $("im-title").textContent = g.title;
    $("im-genre").innerHTML = g.categories.map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("");
    $("im-desc").textContent = g.description;
    $("im-controls").textContent = g.controls;
    $("im-features").innerHTML = g.features.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("");
    $("im-credits").textContent = g.credits;
    var pl = $("im-play");
    pl.href = g.route; pl.setAttribute("data-play", g.id);
    openModal("info-modal");
  }

  /* ---------------- recently played ---------------- */
  function recordRecent(id) {
    var r = store.recent.filter(function (x) { return x.id !== id; });
    r.unshift({ id: id, ts: Date.now() });
    store.recent = r;
  }

  /* ---------------- views ---------------- */
  var currentView = "home", currentCat = "All", currentSort = "name", currentQuery = "";
  function setView(name) {
    currentView = name;
    document.querySelectorAll(".nav-item[data-view]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-view") === name);
    });
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("is-active", v.id === "view-" + name);
    });
    deselectCard(); closeDrawer(); closeAvatarMenu();
    if (name === "profile") renderProfile();
    if (name === "favorites") renderFavorites();
    if (name === "recent") renderRecent();
    if (name === "home") renderHome();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("[data-view]").forEach(function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
  });
  document.querySelectorAll("[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-goto")); });
  });

  function filteredGames() {
    var q = currentQuery.trim().toLowerCase();
    var list = GAMES.filter(function (g) {
      var okCat = currentCat === "All" || g.categories.indexOf(currentCat) !== -1;
      var okQ = !q || g.title.toLowerCase().indexOf(q) !== -1 || g.genre.toLowerCase().indexOf(q) !== -1;
      return okCat && okQ;
    });
    if (currentSort === "recent") {
      var order = {}; store.recent.forEach(function (r, i) { order[r.id] = i; });
      list.sort(function (a, b) {
        var ai = order[a.id] == null ? 1e9 : order[a.id], bi = order[b.id] == null ? 1e9 : order[b.id];
        return ai - bi || a.title.localeCompare(b.title);
      });
    } else list.sort(function (a, b) { return a.title.localeCompare(b.title); });
    return list;
  }

  function renderHome() {
    renderGrid($("home-grid"), GAMES.slice(0, 6));
    var r = store.recent.map(function (x) { return gameById(x.id); }).filter(Boolean).slice(0, 6);
    var hr = $("home-recent");
    if (!r.length) hr.innerHTML = '<p class="dim sm" style="padding:8px 2px">Play something — it will show up here.</p>';
    else renderGrid(hr, r);
  }
  function renderLibrary() {
    var list = filteredGames();
    renderGrid($("lib-grid"), list);
    $("lib-empty").hidden = list.length > 0;
  }
  function renderCategories() {
    var cats = ["All"];
    GAMES.forEach(function (g) { g.categories.forEach(function (c) { if (cats.indexOf(c) === -1) cats.push(c); }); });
    $("cat-chips").innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === currentCat ? " is-active" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
    $("cat-chips").querySelectorAll("[data-cat]").forEach(function (b) {
      b.addEventListener("click", function () { currentCat = b.getAttribute("data-cat"); renderCategories(); });
    });
    var list = GAMES.filter(function (g) { return currentCat === "All" || g.categories.indexOf(currentCat) !== -1; });
    renderGrid($("cat-grid"), list);
  }
  function renderFavorites() {
    var favs = store.favs.map(gameById).filter(Boolean);
    renderGrid($("fav-grid"), favs);
    $("fav-empty").hidden = favs.length > 0;
    var badge = $("fav-count");
    badge.hidden = !favs.length; badge.textContent = favs.length;
  }
  function renderRecent() {
    var r = store.recent.map(function (x) { return { g: gameById(x.id), ts: x.ts }; }).filter(function (x) { return x.g; });
    var el = $("recent-list");
    $("recent-empty").hidden = r.length > 0;
    el.innerHTML = r.map(function (x) {
      return '<div class="recent-item"><img src="' + x.g.cover + '" alt=""><div class="ri-body"><strong>' + esc(x.g.title) + "</strong><small>Played " + relTime(x.ts) + "</small></div>" +
        '<a class="btn-play sm" href="' + x.g.route + '" data-play="' + x.g.id + '">▶ Play</a></div>';
    }).join("");
  }

  /* ---------------- search & sort ---------------- */
  var searchEl = $("search");
  searchEl.addEventListener("input", function () {
    currentQuery = searchEl.value;
    if (currentView !== "library") setView("library");
    else renderLibrary();
  });
  $("lib-clear").addEventListener("click", function () { searchEl.value = ""; currentQuery = ""; renderLibrary(); });
  $("sort").addEventListener("change", function () { currentSort = $("sort").value; renderLibrary(); });

  /* ---------------- profile ---------------- */
  function renderProfile() {
    var name = store.name;
    $("prof-name").textContent = name;
    $("menu-username").textContent = name;
    var initial = (name.trim()[0] || "P").toUpperCase();
    $("prof-avatar").textContent = initial;
    $("avatar-initial").textContent = initial;

    function mini(g, extra) {
      return '<a class="mini-item" href="' + g.route + '" data-play="' + g.id + '"><img src="' + g.cover + '" alt=""><span>' + esc(g.title) + "</span>" + (extra || "") + "</a>";
    }
    var favs = store.favs.map(gameById).filter(Boolean);
    $("prof-favs").innerHTML = favs.length ? favs.map(function (g) { return mini(g); }).join("") : '<p class="dim sm">No favorites yet.</p>';
    var rec = store.recent.map(function (x) { return { g: gameById(x.id), ts: x.ts }; }).filter(function (x) { return x.g; }).slice(0, 5);
    $("prof-recent").innerHTML = rec.length ? rec.map(function (x) { return mini(x.g, "<small>" + relTime(x.ts) + "</small>"); }).join("") : '<p class="dim sm">Nothing played yet.</p>';
    $("prof-scores").innerHTML = GAMES.map(function (g) {
      var s = bestScore(g);
      return '<div class="score-row"><img src="' + g.cover + '" alt=""><span>' + esc(g.title) + ' <small class="dim">· ' + esc(g.scoreLabel || "Best") + "</small></span><strong>" + (s == null ? "—" : s.toLocaleString("en-US")) + "</strong></div>";
    }).join("");
  }
  $("name-edit").addEventListener("click", function () {
    $("name-editor").hidden = false;
    $("name-input").value = store.name;
    $("name-input").focus(); $("name-input").select();
  });
  function closeNameEditor() { $("name-editor").hidden = true; }
  $("name-cancel").addEventListener("click", closeNameEditor);
  $("name-save").addEventListener("click", function () {
    var v = $("name-input").value.trim();
    if (v) { store.name = v; renderProfile(); toast("Display name saved"); }
    closeNameEditor();
  });

  /* ---------------- settings ---------------- */
  function applyAccent(a) {
    document.documentElement.setAttribute("data-accent", a);
    document.querySelectorAll(".sw").forEach(function (s) {
      s.classList.toggle("is-active", s.getAttribute("data-accent") === a);
    });
  }
  document.querySelectorAll(".sw").forEach(function (s) {
    s.addEventListener("click", function () { store.accent = s.getAttribute("data-accent"); applyAccent(store.accent); });
  });
  function syncToggles() {
    $("tgl-anim").setAttribute("aria-checked", String(store.anim));
    $("tgl-sidebar").setAttribute("aria-checked", String(store.compact));
    document.body.classList.toggle("no-anim", !store.anim);
    document.body.classList.toggle("side-compact", store.compact && window.innerWidth > 900);
  }
  $("tgl-anim").addEventListener("click", function () { store.anim = !store.anim; syncToggles(); });
  $("tgl-sidebar").addEventListener("click", function () { store.compact = !store.compact; syncToggles(); });
  $("side-collapse").addEventListener("click", function () { store.compact = !store.compact; syncToggles(); });

  $("btn-reset-scores").addEventListener("click", function () {
    askConfirm("Reset best scores?", "This clears saved best scores for all games on this device.", "Reset", function () {
      SCORE_KEYS.forEach(lsDel);
      renderProfile(); toast("Best scores reset");
    });
  });
  $("btn-clear-recent").addEventListener("click", function () {
    askConfirm("Clear recently played?", "Your recently played list will be emptied.", "Clear", function () {
      store.recent = []; refreshDynamic(); toast("Recently played cleared");
    });
  });
  $("btn-clear-favs").addEventListener("click", function () {
    askConfirm("Clear favorites?", "All favorited games will be removed.", "Clear", function () {
      store.favs = []; refreshDynamic(); toast("Favorites cleared");
    });
  });

  /* ---------------- avatar menu ---------------- */
  var avatarMenu = $("avatar-menu"), avatarBtn = $("avatar-btn");
  function closeAvatarMenu() { avatarMenu.hidden = true; avatarBtn.setAttribute("aria-expanded", "false"); }
  avatarBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = avatarMenu.hidden;
    avatarMenu.hidden = !open;
    avatarBtn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#avatar-menu") && !e.target.closest("#avatar-btn")) closeAvatarMenu();
  });
  $("menu-about").addEventListener("click", function () { closeAvatarMenu(); openModal("about-modal"); });

  /* ---------------- mobile drawer ---------------- */
  function openDrawer() { document.body.classList.add("drawer-open"); backdrop.hidden = false; }
  function closeDrawer() { document.body.classList.remove("drawer-open"); backdrop.hidden = true; }
  $("hamburger").addEventListener("click", openDrawer);
  $("drawer-close").addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);

  /* ---------------- refresh & init ---------------- */
  function refreshDynamic() {
    renderFavorites(); renderRecent();
    if (currentView === "home") renderHome();
    if (currentView === "library") renderLibrary();
    if (currentView === "profile") renderProfile();
  }

  applyAccent(store.accent);
  syncToggles();
  window.addEventListener("resize", syncToggles);
  renderHome(); renderLibrary(); renderCategories(); renderFavorites(); renderRecent(); renderProfile();
  setView("home");
})();
