// My Voice, Phase 3: safe-zone watching (only after parent consent), device
// pairing by QR or code, and pulling the child-scoped settings from the server.
import { load, persist, raiseAlert, api, defaultServer } from "./shared.js";
import * as X from "./e2ee-store.js";
import { watch, allZones, eventText } from "./geo.js";

const $ = (s, el = document) => el.querySelector(s);
const note = (msg) => { const t = $("#toast"); if (!t) return; t.textContent = msg; t.hidden = false; setTimeout(() => (t.hidden = true), 3500); };

// ---------- Safe zones ----------
let watcher = null;
function geoChip(text, on) {
  let c = $("#mvGeo");
  if (!c) { c = Object.assign(document.createElement("p"), { id: "mvGeo", className: "mv-geo" }); $("#mvSafety")?.after(c); }
  c.hidden = !text; c.textContent = text || ""; c.classList.toggle("is-on", !!on);
}
function syncWatch() {
  const s = load().safety;
  const want = s?.consent && s.watch !== false && allZones(s).length && "geolocation" in navigator;
  if (want && !watcher) {
    watcher = watch(() => allZones(load().safety), (ev, pos) => {
      const d = load(), danger = ev.kind.startsWith("danger");
      // Danger alerts always carry the location: finding a child near water fast matters more than the setting.
      raiseAlert(ev.kind, eventText(ev), { zone: ev.zone.name, ...(ev.water && { water: true }), ...((d.safety.sendLocation || danger) && { loc: pos }) });
    }, (pos, err) => (pos && (lastPos = pos), geoChip(err ? "📍 Safe zones are on, but this device can't find its location." : "📍 Safe zones on. Your grown-ups get a note when you arrive or leave.", !err)));
    heartbeat();
    geoChip("📍 Safe zones on. Your grown-ups get a note when you arrive or leave.", true);
  } else if (!want && watcher) { watcher.stop(); watcher = null; geoChip(""); heartbeat(); }
}
// Heartbeat for the server's dead-man check: while this paired device shares its
// location, it checks in every few minutes. If it goes quiet (battery, offline, app
// closed), the server tells the family. The web can't run this in the background;
// the native app (native/) can.
let lastPos = null, beat = null;
async function heartbeat() {
  const d = load(); if (!d.device || !d.sync?.key) return;
  const sharing = !!(watcher && d.safety?.sendLocation);
  try { const r = await api(d, "POST", "/api/devices/heartbeat", { sharing, ...(sharing && lastPos && { loc: lastPos }) }); clearTimeout(beat); if (sharing) beat = setTimeout(heartbeat, (r.nextBeatSec || 300) * 1000); }
  catch { clearTimeout(beat); beat = setTimeout(heartbeat, 60000); }
}
window.addEventListener("storage", (e) => { if (e.key === "luminaac:bridge") syncWatch(); });
syncWatch();

// ---------- Pairing ----------
const panel = document.createElement("article");
panel.className = "panel";
panel.innerHTML = `<h2 class="h2">This device</h2>
  <p class="soft" id="pairState"></p>
  <button class="ghost-btn" type="button" id="btnPairMV">Pair with my family</button>`;
const settingsPanel = $("#settings")?.closest(".panel");
settingsPanel?.after(panel);

const dlg = document.createElement("dialog");
dlg.className = "mv-pair"; dlg.setAttribute("aria-labelledby", "mvPairT");
dlg.innerHTML = `<form method="dialog" class="mv-pair-form">
  <h2 id="mvPairT">Pair with your family</h2>
  <p>Ask a grown-up to open the Bridge, go to Account and devices, and tap "Show pairing code".</p>
  <div class="mv-scan" id="mvScan" hidden><video id="mvScanV" playsinline muted aria-label="Camera view for scanning the pairing QR code"></video></div>
  <button class="ghost-btn" type="button" id="btnScan">Scan the QR code</button>
  <label>Server address <input name="url" type="url" inputmode="url" required placeholder="http://localhost:3001" /></label>
  <label>6-digit code <input name="code" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="one-time-code" /></label>
  <label>Name for this device <input name="name" maxlength="40" placeholder="Sam's tablet" /></label>
  <p class="soft" id="mvPairMsg" role="status"></p>
  <div class="mv-pair-row"><button class="ghost-btn" value="cancel" formnovalidate>Not now</button><button class="solid-btn" value="ok">Pair</button></div>
</form>`;
document.body.append(dlg);
const form = $("form", dlg);

function renderPair() {
  const d = load();
  $("#pairState").textContent = d.device ? `Paired as "${d.device.name}". It gets your family's words and stories, and sends alerts.` : "Not paired. Everything works on this device on its own.";
  $("#btnPairMV").textContent = d.device ? "Unpair this device" : "Pair with my family";
}
$("#btnPairMV").addEventListener("click", async () => {
  const d = load();
  if (d.device) {
    if (!confirm("Unpair this device? It will stop syncing and sending alerts.")) return;
    try { await api(d, "DELETE", `/api/devices/${d.device.id}`); } catch {}
    d.device = null; d.sync = { url: "", key: "", version: 0, last: 0 }; persist(d); renderPair(); return;
  }
  form.url.value ||= d.sync.url || defaultServer(); dlg.showModal();
});
let scanStream = null;
async function stopScan() { scanStream?.getTracks().forEach((t) => t.stop()); scanStream = null; $("#mvScan").hidden = true; }
$("#btnScan").addEventListener("click", async () => {
  try {
    if (!window.jsQR) await new Promise((ok, no) => document.head.append(Object.assign(document.createElement("script"), { src: "vendor/jsQR.js", onload: ok, onerror: no })));
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const v = $("#mvScanV"); v.srcObject = scanStream; await v.play(); $("#mvScan").hidden = false;
    const c = document.createElement("canvas"), x = c.getContext("2d", { willReadFrequently: true });
    const tick = () => {
      if (!scanStream) return;
      if (v.videoWidth) {
        c.width = v.videoWidth; c.height = v.videoHeight; x.drawImage(v, 0, 0);
        const r = window.jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if (r?.data && applyLink(r.data)) { stopScan(); $("#mvPairMsg").textContent = "Got it. Give this device a name, then tap Pair."; return; }
      }
      requestAnimationFrame(tick);
    };
    tick();
  } catch { $("#mvPairMsg").textContent = "The camera isn't available. Type the code instead."; stopScan(); }
});
function applyLink(text) {
  try { const u = new URL(text); const h = new URLSearchParams(u.hash.slice(1)); if (!h.get("pair")) return false; form.code.value = h.get("pair"); form.url.value = h.get("u") || form.url.value; return true; } catch { return false; }
}
form.addEventListener("submit", async (e) => {
  stopScan();
  if (e.submitter?.value !== "ok") return;
  e.preventDefault();
  const url = form.url.value.trim().replace(/\/+$/, ""), name = form.name.value.trim() || "My Voice";
  try {
    const r = await fetch(url + "/api/devices/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: form.code.value.trim(), name }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    const d = load(); d.sync = { ...d.sync, url, key: j.data.deviceKey, version: 0 }; d.device = { id: j.data.deviceId, kind: j.data.kind, name }; persist(d);
    dlg.close(); renderPair(); note("Paired. Getting your words and stories…"); await pull(); history.replaceState(null, "", location.pathname);
  } catch (err) { $("#mvPairMsg").textContent = err.message; }
});

// Child-scoped pull: only the parts My Voice needs (see backend childView).
async function pull() {
  const d = load(); if (!d.device || !d.sync.key) return;
  try {
    const r = await api(d, "GET", "/api/sync");
    if (r?.doc?.e2eeChild) { // end-to-end encrypted: open it here, or ask a parent for the key
      const opened = await X.openDoc(r.doc);
      if (!opened) { await askForKey(d); return; }
      r.doc = opened;
    }
    if (!r?.doc) return;
    const x = load();
    for (const k of ["signals", "stories", "practice", "safety"]) if (r.doc[k]) x[k] = r.doc[k];
    // Phase 7: take the caregiver's video list and game settings; keep this device's own history.
    if (r.doc.videos) x.videos = { ...x.videos, on: r.doc.videos.on, thumbs: r.doc.videos.thumbs, list: r.doc.videos.list || [] };
    if (r.doc.games) x.games = { ...x.games, settings: { ...x.games?.settings, ...r.doc.games.settings }, goals: r.doc.games.goals || [] };
    if (r.doc.access) x.access = { ...x.access, ...r.doc.access };
    if (r.doc.profile?.child) x.profile.child = r.doc.profile.child;
    x.sync.version = r.version; x.sync.last = Date.now(); persist(x); syncWatch();
  } catch (e) { if (e.status === 401) { const x = load(); x.device = null; x.sync.key = ""; persist(x); renderPair(); note("This device was switched off by your family."); } }
}
// Encrypted family: this device asks for the key once; a parent approves it in the Bridge
// after checking the 6-digit code shown here matches the one on their screen.
async function askForKey(d) {
  try {
    if (!X.get().pending) await X.request(d, d.device?.name || "My Voice");
    const r = await X.check(d);
    if (r.done) { note(`Encryption key received. Safety code ${r.code}. It should match the code your family saw.`); return pull(); }
    const code = await X.deviceCode();
    note(`Your family uses end-to-end encryption. Ask a parent to open the Bridge, Account, End-to-end encryption, and approve "${d.device?.name || "My Voice"}" when it shows the code ${code}.`);
    setTimeout(() => pull(), 15000);
  } catch {}
}
// Opened from the pairing QR: index.html#pair=123456&u=https://server
(function fromHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.get("pair")) return;
  form.code.value = h.get("pair"); form.url.value = h.get("u") || "";
  $("#mvPairMsg").textContent = "Pairing code filled in. Give this device a name, then tap Pair.";
  dlg.showModal(); form.name.focus();
})();
renderPair();
pull();
setInterval(pull, 5 * 60e3);
