/* ============================================================
   GitHub Games — Diamond Shop backend (Google Apps Script)
   ------------------------------------------------------------
   SETUP (Sir does this once, ~5 min):
   1. Create a new Google Sheet (any name).
   2. In the Sheet: Extensions > Apps Script.
   3. Delete the default Code.gs content, paste THIS whole file.
   4. Project Settings (gear icon) > Script Properties > Add:
        Property: ADMIN_KEY
        Value:    <pick a long secret key, e.g. 20+ random letters/numbers>
      NEVER share this key or put it in the website code.
      The admin types it in the Shop Admin panel each time.
   5. Deploy > New deployment > type: Web app
        Execute as: Me
        Who has access: Anyone
      Deploy > copy the Web app URL (ends with /exec).
   6. Send that URL to the site admin to put in arcade.js
      (SHOP_API_URL). Do NOT send the ADMIN_KEY to anyone.
   ------------------------------------------------------------
   SECURITY NOTES (honest):
   - The site is static, so there is no real login. The admin key
     is a simple gate, not bank-grade security.
   - Package prices live HERE (server-side). The site only sends
     the package id, so nobody can fake diamonds/amount by
     editing the website code.
   - ALWAYS verify amount + TrxID in your bKash app before
     marking an order Complete. Fake TrxIDs are possible.
   ============================================================ */

var SHEET_NAME = "Orders";
var HEADERS = ["Timestamp", "OrderID", "Username", "Package", "Diamonds", "Amount", "TrxID", "Status"];

/* package id -> { diamonds, amount (taka) } — the ONLY price list that matters */
var PACKAGES = {
  p90:  { diamonds: 90,  amount: 90  },
  p180: { diamonds: 180, amount: 160 },
  p270: { diamonds: 270, amount: 250 },
  p449: { diamonds: 449, amount: 400 }
};

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
  }
  return sh;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function readBody(e) {
  try { return JSON.parse(e.postData.contents || "{}"); }
  catch (err) { return {}; }
}

function checkKey(key) {
  var want = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  return want && key && key === want;
}

/* ---------------- POST: new order OR admin complete ---------------- */
function doPost(e) {
  var b = readBody(e);

  /* admin: mark one order complete (only from pending) */
  if (b.action === "complete") {
    if (!checkKey(b.key)) return json({ ok: false, error: "unauthorized" });
    var sh = getSheet();
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(b.id)) {
        if (data[i][7] === "complete") return json({ ok: true, already: true });
        if (data[i][7] !== "pending") return json({ ok: false, error: "order not pending" });
        sh.getRange(i + 1, 8).setValue("complete");
        return json({ ok: true });
      }
    }
    return json({ ok: false, error: "order not found" });
  }

  /* admin: mark one order cancelled (fake TrxID / no payment). Final. */
  if (b.action === "cancel") {
    if (!checkKey(b.key)) return json({ ok: false, error: "unauthorized" });
    var sh2 = getSheet();
    var data2 = sh2.getDataRange().getValues();
    for (var j = 1; j < data2.length; j++) {
      if (String(data2[j][1]) === String(b.id)) {
        if (data2[j][7] !== "pending") return json({ ok: false, error: "order not pending" });
        sh2.getRange(j + 1, 8).setValue("cancelled");
        return json({ ok: true });
      }
    }
    return json({ ok: false, error: "order not found" });
  }

  /* player: place a new order — only pkg id is trusted from the client */
  var username = String(b.username || "").trim().slice(0, 24);
  var trxid = String(b.trxid || "").trim().toUpperCase().slice(0, 24);
  var pkg = PACKAGES[b.pkg];
  if (!username || username.length < 2) return json({ ok: false, error: "username too short" });
  if (!trxid || trxid.length < 6) return json({ ok: false, error: "invalid TrxID" });
  if (!pkg) return json({ ok: false, error: "unknown package" });

  var id = "ORD" + Date.now().toString(36).toUpperCase();
  getSheet().appendRow([new Date(), id, username, b.pkg, pkg.diamonds, pkg.amount, trxid, "pending"]);
  return json({ ok: true, orderId: id });
}

/* ---------------- GET: admin list OR player's fulfilled orders ---------------- */
function doGet(e) {
  var p = (e && e.parameter) || {};

  /* admin: full order list */
  if (p.action === "list") {
    if (!checkKey(p.key)) return json({ ok: false, error: "unauthorized" });
    var data = getSheet().getDataRange().getValues();
    var out = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      out.push({
        time: r[0], id: r[1], username: r[2], pkg: r[3],
        diamonds: r[4], amount: r[5], trxid: r[6], status: r[7]
      });
    }
    return json({ ok: true, orders: out });
  }

  /* player: fulfilled (complete) orders for one username */
  if (p.action === "status") {
    var username = String(p.username || "").trim().toLowerCase();
    if (!username) return json({ ok: false, error: "missing username" });
    var rows = getSheet().getDataRange().getValues();
    var fulfilled = [];
    for (var j = 1; j < rows.length; j++) {
      var row = rows[j];
      if (String(row[2]).trim().toLowerCase() === username && row[7] === "complete") {
        fulfilled.push({ id: row[1], diamonds: row[4], pkg: row[3] });
      }
    }
    return json({ ok: true, fulfilled: fulfilled });
  }

  return json({ ok: true, service: "diamond-shop" });
}
