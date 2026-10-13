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
      cover: "img/cover-police-chase.svg",
      price: 30, // one-time unlock price in diamonds (0 / absent = free)
      scoreKey: "policeChaseBest",
      scoreLabel: "Best score"
    }
  ];
  var AVATARS = [
    { id: "racer", src: "img/avatars/avatar-racer.svg", label: "Racer" },
    { id: "ninja", src: "img/avatars/avatar-ninja.svg", label: "Ninja cat" },
    { id: "car", src: "img/avatars/avatar-car.svg", label: "Sports car" },
    { id: "badge", src: "img/avatars/avatar-badge.svg", label: "Police badge" }
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
    set compact(v) { lsSet("gg_compact", !!v); },
    get avatar() { var a = lsGet("gg_avatar", ""); return AVATARS.some(function (x) { return x.id === a; }) ? a : ""; },
    set avatar(v) { lsSet("gg_avatar", String(v)); },
    get diamonds() { var v = lsGet("gg_diamonds", 0); return typeof v === "number" && v > 0 ? Math.floor(v) : 0; },
    set diamonds(v) { lsSet("gg_diamonds", Math.max(0, Math.floor(v))); },
    get shopUser() { return lsGet("gg_shop_user", ""); },
    set shopUser(v) { lsSet("gg_shop_user", String(v || "").slice(0, 24)); },
    get shopOrders() { var v = lsGet("gg_orders", []); return Array.isArray(v) ? v : []; },
    set shopOrders(v) { lsSet("gg_orders", v); },
    get claimed() { var v = lsGet("gg_claimed", []); return Array.isArray(v) ? v : []; },
    set claimed(v) { lsSet("gg_claimed", v); },
    get owned() { var v = lsGet("gg_owned", []); return Array.isArray(v) ? v : []; },
    set owned(v) { lsSet("gg_owned", v); },
    get bonuses() { var v = lsGet("gg_bonuses", {}); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; },
    set bonuses(v) { lsSet("gg_bonuses", v); }
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
    ["info-modal", "about-modal", "confirm-modal", "shop-modal", "buy-modal"].forEach(function (id) { $(id).hidden = true; });
  }
  document.querySelectorAll("[data-close]").forEach(function (b) {
    b.addEventListener("click", closeModals);
  });
  ["info-modal", "about-modal", "confirm-modal", "shop-modal", "buy-modal"].forEach(function (id) {
    $(id).addEventListener("click", function (e) { if (e.target === $(id)) closeModals(); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeModals(); deselectCard(); closeAvatarMenu(); closeDrawer(); }
  });

  /* ---------------- game cards ---------------- */
  function isOwned(id) { return store.owned.indexOf(id) !== -1; }
  function cardHTML(g) {
    var fav = store.favs.indexOf(g.id) !== -1;
    var owned = isOwned(g.id);
    var priceTag = g.price ? (owned ? '<div class="gprice owned">✓ Owned</div>' : '<div class="gprice">🔒 ' + g.price + " 💎 to unlock</div>") : "";
    var playLabel = g.price && !owned ? "🔒 " + g.price + " 💎" : "▶ Play";
    return '<article class="gcard' + (fav ? " is-fav" : "") + '" data-id="' + g.id + '" tabindex="0" role="button" aria-label="' + esc(g.title) + '">' +
      '<div class="cover"><img src="' + g.cover + '" alt="' + esc(g.title) + ' cover" loading="lazy">' +
      '<span class="fav-flag" title="Favorite">★</span>' +
      '<div class="card-actions"><div class="ca-title">' + esc(g.title) + '</div>' +
      '<div class="ca-row">' +
      '<a class="btn-play" href="' + g.route + '" data-play="' + g.id + '">' + playLabel + '</a>' +
      '<button class="icon-btn" data-info="' + g.id + '" aria-label="Game details">ⓘ</button>' +
      '<button class="icon-btn fav' + (fav ? " is-fav" : "") + '" data-fav="' + g.id + '" aria-label="Toggle favorite" aria-pressed="' + fav + '">' + (fav ? "★" : "☆") + "</button>" +
      "</div></div></div>" +
      '<div class="gtitle">' + esc(g.title) + '</div><div class="gsub">' + esc(g.genre) + "</div>" + priceTag + "</article>";
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
    if (playLink) {
      var pid = playLink.getAttribute("data-play");
      var pg = gameById(pid);
      if (pg && pg.price && !isOwned(pid)) { e.preventDefault(); openBuyModal(pg); return; } // paywalled -> buy first
      recordRecent(pid); return; // then navigate normally
    }
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
    pl.textContent = g.price && !isOwned(g.id) ? "🔒 Buy — " + g.price + " 💎" : "▶  Play";
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
    var fab = $("shop-fab");
    if (fab) fab.hidden = (name === "shop");
    if (name === "profile") renderProfile();
    if (name === "favorites") renderFavorites();
    if (name === "recent") renderRecent();
    if (name === "home") renderHome();
    if (name === "shop") renderShop();
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
  function currentAvatar() { return AVATARS.filter(function (x) { return x.id === store.avatar; })[0] || null; }
  function renderAvatars() {
    var a = currentAvatar();
    var initial = (store.name.trim()[0] || "P").toUpperCase();
    var pa = $("prof-avatar"), ab = $("avatar-btn");
    if (a) {
      pa.innerHTML = '<img src="' + a.src + '" alt="Profile picture">';
      pa.classList.add("has-img");
      ab.innerHTML = '<img src="' + a.src + '" alt="">';
      ab.classList.add("has-img");
    } else {
      pa.textContent = initial; pa.classList.remove("has-img");
      ab.innerHTML = '<span id="avatar-initial">' + esc(initial) + "</span>";
      ab.classList.remove("has-img");
    }
    $("avatar-presets").innerHTML =
      '<button class="avatar-opt' + (a ? "" : " is-active") + '" data-av="" aria-label="Use initial letter"><span>' + esc(initial) + "</span></button>" +
      AVATARS.map(function (x) {
        return '<button class="avatar-opt' + (a && a.id === x.id ? " is-active" : "") + '" data-av="' + x.id + '" aria-label="' + esc(x.label) + '"><img src="' + x.src + '" alt=""></button>';
      }).join("");
  }
  function renderProfile() {
    var name = store.name;
    $("prof-name").textContent = name;
    $("menu-username").textContent = name;
    renderAvatars();

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
  $("avatar-presets").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-av]") : null;
    if (!b) return;
    store.avatar = b.getAttribute("data-av");
    renderAvatars();
    toast("Profile picture updated");
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

  /* ---------------- diamond balance displays ---------------- */
  function syncDiamondDisplays() {
    var n = store.diamonds.toLocaleString("en-US");
    var sb = $("shop-balance"); if (sb) sb.textContent = n;
    var tb = $("topbar-diamonds-n"); if (tb) tb.textContent = n;
  }
  /* Register a diamond account: first time a username is created on
     this device it gets a +30 welcome bonus. New username = new account. */
  function registerAccount(u) {
    u = String(u || "").trim();
    if (u.length < 2) { toast("Enter a username (min 2 characters)"); return false; }
    store.shopUser = u;
    var b = store.bonuses;
    if (!b[u]) {
      b[u] = true; store.bonuses = b;
      store.diamonds = store.diamonds + 30;
      toast("Welcome bonus +30 💎!");
    }
    syncDiamondDisplays();
    return true;
  }

  /* ---------------- buy game (one-time unlock) ---------------- */
  var buyTarget = null;
  function syncFeatured() {
    var btn = document.querySelector('#featured [data-play="police-chase"]');
    if (btn) btn.textContent = isOwned("police-chase") ? "▶ Play Now" : "🔒 Buy — 30 💎";
  }
  function renderBuyModal() {
    if (!buyTarget) return;
    var hasAccount = store.shopUser.length >= 2;
    $("buy-balance").textContent = store.diamonds.toLocaleString("en-US");
    $("buy-username-row").hidden = hasAccount;
    $("buy-account-note").hidden = !hasAccount;
    $("buy-account-name").textContent = store.shopUser;
    var canBuy = hasAccount && store.diamonds >= buyTarget.price;
    var needMore = hasAccount && store.diamonds < buyTarget.price;
    $("buy-confirm").hidden = !canBuy;
    $("buy-shop").hidden = !needMore;
    var need = $("buy-need-note");
    if (needMore) {
      need.hidden = false;
      need.textContent = "You need " + (buyTarget.price - store.diamonds) + " more diamonds to unlock this game.";
    } else need.hidden = true;
  }
  function openBuyModal(g) {
    buyTarget = g;
    $("buy-title").textContent = "Unlock " + g.title;
    $("buy-username").value = store.shopUser;
    renderBuyModal();
    openModal("buy-modal");
  }
  $("buy-create").addEventListener("click", function () {
    if (registerAccount($("buy-username").value)) renderBuyModal();
  });
  $("buy-confirm").addEventListener("click", function () {
    if (!buyTarget) return;
    var g = buyTarget;
    askConfirm("Unlock " + g.title + "?", g.price + " diamonds will be deducted. One-time purchase — play forever.", "Unlock", function () {
      store.diamonds = store.diamonds - g.price;
      var owned = store.owned;
      if (owned.indexOf(g.id) === -1) owned.push(g.id);
      store.owned = owned;
      syncDiamondDisplays(); syncFeatured(); refreshDynamic();
      toast(g.title + " unlocked! Enjoy!");
      window.location.href = g.route;
    });
  });
  $("buy-shop").addEventListener("click", function () { closeModals(); setView("shop"); });
  $("shop-fab").addEventListener("click", function () { setView("shop"); });
  $("topbar-diamonds").addEventListener("click", function () { setView("shop"); });

  /* ---------------- diamond shop ---------------- */
  /* Backend: Google Apps Script web app (see shop-backend/Code.gs).
     SHOP_API_URL is the deployed Web app URL (ends with /exec).
     It stays empty until the backend is deployed — the shop then
     shows "backend not connected" instead of broken ordering. */
  var SHOP_API_URL = "";
  var BKASH_NUMBER = "01516523070";
  var PACKAGES = [
    { id: "p90", name: "90 Diamonds", diamonds: 90, price: 90 },
    { id: "p180", name: "180 Diamonds", diamonds: 180, price: 160 },
    { id: "p270", name: "270 Diamonds", diamonds: 270, price: 250 },
    { id: "p449", name: "449 Diamonds", diamonds: 449, price: 400 }
  ];
  var adminKey = ""; // typed in the Admin panel each session, never stored

  function shopApi(params, body) {
    if (!SHOP_API_URL) return Promise.reject(new Error("Shop backend not connected"));
    if (body) {
      return fetch(SHOP_API_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); });
    }
    var qs = Object.keys(params).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); }).join("&");
    return fetch(SHOP_API_URL + "?" + qs).then(function (r) { return r.json(); });
  }
  function pkgById(id) { for (var i = 0; i < PACKAGES.length; i++) if (PACKAGES[i].id === id) return PACKAGES[i]; return null; }

  function renderShop() {
    syncDiamondDisplays();
    $("shop-user-input").value = store.shopUser;
    $("shop-backend-note").hidden = !!SHOP_API_URL;
    $("shop-packs").innerHTML = PACKAGES.map(function (p) {
      return '<div class="pack-card"><div class="pack-diamonds">💎 ' + p.diamonds + "</div>" +
        '<div class="pack-name">' + esc(p.name) + "</div>" +
        '<div class="pack-price">৳' + p.price + "</div>" +
        '<button class="btn-play" data-buy="' + p.id + '">Buy</button></div>';
    }).join("");
    renderMyOrders();
  }
  function renderMyOrders() {
    var el = $("shop-orders");
    var list = store.shopOrders;
    if (!list.length) { el.innerHTML = '<p class="dim sm">No orders from this device yet.</p>'; return; }
    el.innerHTML = list.map(function (o) {
      return '<div class="mini-item"><span>💎 ' + o.diamonds + " — ৳" + o.amount + "</span><small>" + esc(o.id) + " · " + esc(o.status) + "</small></div>";
    }).join("");
  }

  var checkoutPkg = null;
  function openCheckout(id) {
    checkoutPkg = pkgById(id); if (!checkoutPkg) return;
    if (!SHOP_API_URL) { toast("Shop backend not connected yet"); return; }
    $("sh-pack-name").textContent = checkoutPkg.name;
    $("sh-pack-price").textContent = "৳" + checkoutPkg.price;
    $("sh-username").value = store.shopUser;
    $("sh-step1").hidden = false; $("sh-step2").hidden = true; $("sh-done").hidden = true;
    openModal("shop-modal");
  }
  $("shop-packs").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-buy]") : null;
    if (b) openCheckout(b.getAttribute("data-buy"));
  });
  $("sh-continue").addEventListener("click", function () {
    var u = $("sh-username").value.trim();
    if (u.length < 2) { toast("Enter a username (min 2 characters)"); return; }
    store.shopUser = u;
    $("sh-pack-name2").textContent = checkoutPkg.name;
    $("sh-amount").textContent = "৳" + checkoutPkg.price;
    $("sh-bkash-num").textContent = BKASH_NUMBER;
    $("sh-trxid").value = "";
    $("sh-step1").hidden = true; $("sh-step2").hidden = false;
  });
  $("sh-back").addEventListener("click", function () {
    $("sh-step1").hidden = false; $("sh-step2").hidden = true;
  });
  $("sh-place").addEventListener("click", function () {
    var u = $("sh-username").value.trim();
    var trx = $("sh-trxid").value.trim().toUpperCase();
    if (u.length < 2) { toast("Enter a username"); return; }
    if (!/^[A-Z0-9]{6,24}$/.test(trx)) { toast("Enter a valid TrxID (6+ letters/numbers)"); return; }
    var btn = $("sh-place"); btn.disabled = true; btn.textContent = "Placing…";
    shopApi(null, { username: u, pkg: checkoutPkg.id, trxid: trx }).then(function (res) {
      btn.disabled = false; btn.textContent = "Place Order";
      if (!res.ok) { toast(res.error || "Order failed, try again"); return; }
      var orders = store.shopOrders;
      orders.unshift({ id: res.orderId, username: u, pkg: checkoutPkg.id, diamonds: checkoutPkg.diamonds, amount: checkoutPkg.price, status: "pending", ts: Date.now() });
      store.shopOrders = orders;
      $("sh-order-id").textContent = res.orderId;
      $("sh-done-user").textContent = u;
      $("sh-step2").hidden = true; $("sh-done").hidden = false;
      renderMyOrders();
    }).catch(function () {
      btn.disabled = false; btn.textContent = "Place Order";
      toast("Could not reach the shop backend. Try again.");
    });
  });
  $("shop-claim").addEventListener("click", function () {
    var u = $("shop-user-input").value.trim();
    if (!registerAccount(u)) return;
    if (!SHOP_API_URL) { toast("Account ready! Shop backend not connected yet."); return; }
    var btn = $("shop-claim"); btn.disabled = true; btn.textContent = "Checking…";
    shopApi({ action: "status", username: u }).then(function (res) {
      btn.disabled = false; btn.textContent = "Create Account / Claim";
      if (!res.ok) { toast("Could not check orders"); return; }
      var claimed = store.claimed, gained = 0, fresh = [];
      (res.fulfilled || []).forEach(function (f) {
        if (claimed.indexOf(f.id) === -1) { gained += f.diamonds; claimed.push(f.id); fresh.push(f); }
      });
      store.claimed = claimed;
      if (gained > 0) {
        store.diamonds = store.diamonds + gained;
        toast("+" + gained + " diamonds added!");
        var orders = store.shopOrders.map(function (o) {
          if (fresh.some(function (f) { return f.id === o.id; })) o.status = "complete";
          return o;
        });
        store.shopOrders = orders;
      } else toast("No new diamonds to claim yet.");
      renderShop();
    }).catch(function () {
      btn.disabled = false; btn.textContent = "Create Account / Claim";
      toast("Could not reach the shop backend. Try again.");
    });
  });

  /* shop admin (Settings) */
  $("admin-load").addEventListener("click", function () {
    adminKey = $("admin-key").value;
    if (!adminKey) { toast("Enter the admin key"); return; }
    if (!SHOP_API_URL) { toast("Shop backend not connected yet"); return; }
    var btn = $("admin-load"); btn.disabled = true; btn.textContent = "Loading…";
    shopApi({ action: "list", key: adminKey }).then(function (res) {
      btn.disabled = false; btn.textContent = "Load Orders";
      if (!res.ok) { toast(res.error === "unauthorized" ? "Wrong admin key" : "Could not load orders"); return; }
      renderAdminOrders(res.orders || []);
    }).catch(function () {
      btn.disabled = false; btn.textContent = "Load Orders";
      toast("Could not reach the shop backend. Try again.");
    });
  });
  function renderAdminOrders(orders) {
    var el = $("admin-orders");
    if (!orders.length) { el.innerHTML = '<p class="dim sm">No orders yet.</p>'; return; }
    el.innerHTML = orders.map(function (o) {
      var when = o.time ? new Date(o.time).toLocaleString() : "";
      return '<div class="admin-row"><div><strong>' + esc(o.username) + "</strong> — 💎 " + o.diamonds + " · ৳" + o.amount +
        '<br><small class="dim">' + esc(o.trxid) + " · " + esc(when) + " · " + esc(o.id) + "</small></div>" +
        '<span class="pill ' + (o.status === "complete" ? "done" : "pend") + '">' + esc(o.status) + "</span>" +
        (o.status === "pending" ? '<button class="btn-play sm" data-complete="' + esc(o.id) + '" data-amt="' + o.amount + '" data-trx="' + esc(o.trxid) + '">Complete</button>' : "") +
        "</div>";
    }).join("");
  }
  $("admin-orders").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-complete]") : null;
    if (!b) return;
    var id = b.getAttribute("data-complete");
    askConfirm("Mark order Complete?", "Only continue if you verified ৳" + b.getAttribute("data-amt") + " / TrxID " + b.getAttribute("data-trx") + " in your bKash app.", "Mark Complete", function () {
      shopApi(null, { action: "complete", id: id, key: adminKey }).then(function (res) {
        if (!res.ok) { toast(res.error || "Could not complete"); return; }
        toast("Order completed — diamonds will be claimable.");
        $("admin-load").click();
      }).catch(function () { toast("Could not reach the shop backend."); });
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
  syncDiamondDisplays(); syncFeatured();
  renderHome(); renderLibrary(); renderCategories(); renderFavorites(); renderRecent(); renderProfile();
  setView("home");
})();
