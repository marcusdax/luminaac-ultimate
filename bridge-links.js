// Safety Links (docs/SOUND-PATH.md §5.2) in the Bridge's Safety hub:
// - "We're going out together": door and gate alerts stay calm until then.
// - The "if found" page: a QR for a shoe, wristband or backpack. A minimal page
//   with what the caregiver chose: first name, "I use a tablet", how to approach,
//   a call button. Never an address or a location. Switch it off any time.
// - The wandering plan sheet: what searchers ask for first, on one printable page.
// - Bluetooth "is he near?": Android/Chrome only, a backup sensor, never the plan.
import { api } from "./shared.js";
import { bleState, batteryDue } from "./safety-core.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const esc = B.esc;
const db = () => B.db;
const online = () => !!(db().sync?.url && db().sync?.key);
const isParent = () => !db().account || db().account.role === "parent";
const base = () => db().sync.url.replace(/\/+$/, "");
const plan = () => (db().safety.plan ||= {});
const name = () => db().profile.child || "your child";

// Shrink a photo to a small JPEG data URL (it travels in the family document).
function smallPhoto(file, size = 240) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const c = document.createElement("canvas"), k = Math.min(1, size / Math.max(img.width, img.height)); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.8)); };
    img.onerror = rej; img.src = url;
  });
}

const card = document.createElement("section");
card.className = "card links-card"; card.setAttribute("aria-labelledby", "h-links");
card.innerHTML = `<div class="card-head"><h2 id="h-links">If they go missing</h2></div>
  <div id="outBox"></div>
  <h3 class="h3">"If found" QR page</h3>
  <p class="soft">A QR sticker for a shoe, wristband or backpack. Whoever finds ${esc(name())} scans it and sees how to help and a button to call you. No address, no location, nothing else. You choose every line and can switch it off.</p>
  <div id="foundOff" hidden><p class="soft small">Needs a family account, so the page works for anyone who scans it. <button class="link-btn" type="button" data-go="account">Set one up in Account and devices</button></p></div>
  <form class="form" id="formFound" hidden>
    <label>First name only <input name="name" maxlength="40" required /></label>
    <label>How they talk <input name="speaks" maxlength="160" placeholder="I don't speak. I use a tablet to talk." /></label>
    <label>How to approach <textarea name="approach" maxlength="300" rows="2" placeholder="Speak softly. Don't touch. Give them space."></textarea></label>
    <label>What calms them <textarea name="calms" maxlength="300" rows="2" placeholder="Trains. Counting slowly."></textarea></label>
    <label>Medical (optional) <input name="medical" maxlength="300" placeholder="Epilepsy: call 999 for a seizure over 5 minutes" /></label>
    <div class="row gap"><label>Call <input name="phone" type="tel" maxlength="24" required /></label><label>Or call <input name="phone2" type="tel" maxlength="24" /></label></div>
    <label>Photo (optional) <input name="photo" type="file" accept="image/*" /></label>
    <div class="row gap"><button class="btn" type="submit">Save and show the QR</button><button class="btn quiet danger" type="button" id="btnFoundOff" hidden>Switch the page off</button></div>
  </form>
  <div id="foundQr" class="found-qr" hidden></div>
  <h3 class="h3">Wandering plan sheet</h3>
  <p class="soft">One printable page for police and searchers: photo, how ${esc(name())} communicates, triggers, favourite places, nearby water and your trackers. Print it now and keep it by the door.</p>
  <form class="form" id="formPlan">
    <label>Photo <input name="photo" type="file" accept="image/*" /></label>
    <label>Looks like (height, hair, usual clothes) <input name="looks" maxlength="200" /></label>
    <label>How they communicate <textarea name="comm" maxlength="400" rows="2" placeholder="Uses LuminAAC on a tablet. Understands short sentences. May not answer to their name."></textarea></label>
    <label>Sensory triggers <textarea name="triggers" maxlength="400" rows="2" placeholder="Sirens, shouting, being grabbed."></textarea></label>
    <label>Places they're drawn to <textarea name="places" maxlength="400" rows="2" placeholder="The park pond, the railway bridge, the bus stop."></textarea></label>
    <label>What helps <textarea name="helps" maxlength="400" rows="2" placeholder="Their favourite song, saying 'train', a calm voice."></textarea></label>
    <div class="row gap"><button class="btn quiet" type="submit">Save</button><button class="btn" type="button" id="btnPlanPrint">Print the sheet</button></div>
  </form>
  <h3 class="h3">Bluetooth: is he near?</h3>
  <div id="bleBox"></div>`;
$("#tab-safety .grid").append(card);
card.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) B.show(g.dataset.go); });

// ---------- Going out together ----------
let outUntil = 0;
function renderOut() {
  const box = $("#outBox");
  if (!online()) { box.innerHTML = ""; return; }
  const on = outUntil > Date.now();
  box.innerHTML = `<div class="out-row ${on ? "is-on" : ""}"><p><b>${on ? `Out together until ${B.fmtTime(outUntil)}` : "At home"}</b><br><span class="soft small">${on ? "Door and gate alerts are calm until then." : "A door or gate opening is an urgent alert. Going out with them? Tell the sensors first."}</span></p>
    <span class="row gap">${on ? `<button class="btn quiet" type="button" data-out="0">We're back</button>` : `<button class="btn" type="button" data-out="60">Going out together (1 hour)</button><button class="btn quiet" type="button" data-out="180">3 hours</button>`}</span></div>`;
}
$("#outBox").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-out]"); if (!b) return;
  try { outUntil = (await api(db(), "POST", "/api/safety/out", { minutes: +b.dataset.out })).until; renderOut(); B.toast(outUntil ? "Door alerts are calm while you're out together." : "Welcome back. Door alerts are urgent again."); }
  catch (err) { B.toast(err.message || "Couldn't reach the family server."); }
});
async function loadOut() { if (!online()) return renderOut(); try { outUntil = (await api(db(), "GET", "/api/safety/out")).until; } catch {} renderOut(); }

// ---------- "If found" page ----------
let found = null;
const foundLink = (path) => { const tok = path.split("/").pop(), u = new URL("found.html", location.href); u.search = ""; u.hash = ""; u.searchParams.set("t", tok); if (new URL(base()).origin !== location.origin) u.searchParams.set("s", base()); return u.href; };
function renderFound() {
  const on = online() && isParent();
  $("#foundOff").hidden = on; $("#formFound").hidden = !on; if (!on) { $("#foundQr").hidden = true; return; }
  const f = $("#formFound"), v = found?.fields || {};
  for (const k of ["name", "speaks", "approach", "calms", "medical", "phone", "phone2"]) if (document.activeElement !== f[k]) f[k].value = v[k] ?? (k === "name" ? db().profile.child || "" : "");
  $("#btnFoundOff").hidden = !found;
  const qr = $("#foundQr"); qr.hidden = !found; if (!found) return;
  const link = foundLink(found.path);
  let svg = "";
  if (window.qrcode) { const q = window.qrcode(0, "M"); q.addData(link); q.make(); svg = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }
  qr.innerHTML = `<div class="found-sticker">${svg}<p><b>If found, scan me</b></p></div>
    <p class="small"><a href="${esc(link)}" target="_blank" rel="noopener">Open the page</a> to see what a finder sees.</p>
    <p class="row gap"><button class="btn quiet" type="button" id="btnFoundCopy">Copy link</button><button class="btn quiet" type="button" id="btnFoundPrint">Print stickers</button></p>
    <p class="soft small">Iron-on labels, shoe tags or a wristband all work. An NFC tag can hold the same link.</p>`;
  $("#btnFoundCopy").onclick = () => navigator.clipboard?.writeText(link).then(() => B.toast("Link copied."), () => B.toast("Select the link and copy it."));
  $("#btnFoundPrint").onclick = () => printHTML(`<div class="found-sheet">${Array.from({ length: 12 }, () => `<div class="found-sticker">${svg}<p><b>If found, scan me</b><br>${esc(v.name || "")} doesn't speak</p></div>`).join("")}</div>`);
}
async function loadFound() { if (!online() || !isParent()) return renderFound(); try { found = await api(db(), "GET", "/api/found"); } catch {} renderFound(); }
$("#formFound").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.currentTarget, body = {};
  for (const k of ["name", "speaks", "approach", "calms", "medical", "phone", "phone2"]) body[k] = f[k].value.trim();
  if (f.photo.files[0]) { try { body.photo = await smallPhoto(f.photo.files[0], 200); } catch {} } else if (found?.fields?.photo) body.photo = found.fields.photo;
  try { found = await api(db(), "POST", "/api/found", body); f.photo.value = ""; renderFound(); B.save("Updated the \"if found\" page"); }
  catch (err) { B.toast(err.message || "Couldn't save the page."); }
});
$("#btnFoundOff").addEventListener("click", async () => {
  if (!confirm("Switch the \"if found\" page off? Every sticker's QR will stop working. You can make a new one later.")) return;
  try { await api(db(), "DELETE", "/api/found"); found = null; renderFound(); B.save("Switched off the \"if found\" page"); } catch { B.toast("Couldn't switch it off."); }
});

// ---------- Wandering plan sheet ----------
function renderPlan() { const f = $("#formPlan"), p = plan(); for (const k of ["looks", "comm", "triggers", "places", "helps"]) if (document.activeElement !== f[k]) f[k].value = p[k] || ""; }
$("#formPlan").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.currentTarget, p = plan();
  for (const k of ["looks", "comm", "triggers", "places", "helps"]) p[k] = f[k].value.trim().slice(0, 400);
  if (f.photo.files[0]) { try { p.photo = await smallPhoto(f.photo.files[0], 360); } catch {} f.photo.value = ""; }
  B.save("Updated the wandering plan"); B.toast("Saved.");
});
function planHTML() {
  const p = plan(), s = db().safety, water = (s.water?.features || []).filter((x) => !x.ignored).map((x) => x.name).filter(Boolean);
  const zones = (s.zones || []).map((z) => `${z.name}${z.type === "danger" ? " (danger area)" : ""}`);
  const tr = (s.trackers || []).map((t) => `${t.name}${t.attached ? `, on ${t.attached}` : ""}`);
  const row = (h, v) => (v ? `<h2>${h}</h2><p>${esc(v).replace(/\n/g, "<br>")}</p>` : "");
  return `<h1>Missing child: ${esc(db().profile.child || "")}</h1>
    ${p.photo ? `<img src="${p.photo}" alt="" style="max-width:260px;border:1px solid #000">` : ""}
    <p><b>Autistic and does not speak.</b> May not answer to their name. Approach calmly and slowly.</p>
    ${row("Looks like", p.looks)}${row("How they communicate", p.comm)}${row("Sensory triggers: avoid", p.triggers)}${row("Places they're drawn to", p.places)}${row("What helps", p.helps)}
    ${water.length ? `<h2>Water nearby: check first</h2><p>${water.slice(0, 20).map(esc).join(", ")}</p>` : ""}
    ${zones.length ? `<h2>Places on their safety map</h2><p>${zones.map(esc).join(", ")}</p>` : ""}
    ${tr.length ? `<h2>Trackers</h2><p>${tr.map(esc).join("; ")}</p>` : ""}
    <h2>Parent or carer</h2><p>${esc(db().profile.caregiver || "")} ${esc(found?.fields?.phone || "")}</p>
    <p style="margin-top:2em;font-size:.9em">Printed ${new Date().toLocaleString()} from LuminAAC.</p>`;
}
function printHTML(h) {
  let box = document.querySelector(".pot-print"); if (!box) { box = document.createElement("div"); box.className = "pot-print"; document.body.append(box); }
  box.innerHTML = h; document.body.classList.add("printing-potty");
  const done = () => { document.body.classList.remove("printing-potty"); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done); setTimeout(() => window.print(), 50);
}
$("#btnPlanPrint").addEventListener("click", () => printHTML(planHTML()));

// ---------- Bluetooth "is he near?" ----------
// Chrome and Edge on Android and computers only. Safari on iPhone and iPad has no
// Web Bluetooth, and nothing here pretends otherwise. Pairing lasts until the page
// closes. Signal strength needs Chrome's advertisement watching; without it, the
// connection itself is the signal (connected = near, dropped = lost signal).
let ble = null;
const LABEL = { near: ["🟢", "Near"], nearby: ["🟡", "Nearby"], far: ["🟠", "Far"], lost: ["🔴", "Lost signal"] };
function renderBle() {
  const box = $("#bleBox");
  if (!navigator.bluetooth) { box.innerHTML = `<p class="soft small">Not available in this browser. Bluetooth works in Chrome on Android or a computer, or in the LuminAAC app. iPhone and iPad browsers can't use Bluetooth. It's only ever a backup: safe zones and trackers stay the main plan.</p>`; return; }
  if (!ble) { box.innerHTML = `<p class="soft small">Pair a small Bluetooth tag or band on ${esc(name())}. This phone then shows near, far or lost signal while this page is open. A backup only, never the main plan.</p><button class="btn quiet" type="button" id="btnBle">Pair a tag</button>`; $("#btnBle").onclick = pairBle; return; }
  const st = ble.connected === false ? { state: "lost" } : ble.samples.length ? bleState(ble.samples) : { state: "near" };
  const [dot, word] = LABEL[st.state];
  box.innerHTML = `<p class="ble-state ble-${st.state}" role="status"><span aria-hidden="true">${dot}</span> <b>${esc(ble.name)}: ${word}</b>${st.rssi ? ` <span class="soft small">(${st.rssi} dBm)</span>` : ""}</p>
    <p class="soft small">${ble.watching ? "Signal strength updates every few seconds." : "This browser shows connected or lost signal only."}</p><button class="link-btn" type="button" id="btnBleOff">Stop</button>`;
  $("#btnBleOff").onclick = () => { try { ble.dev.gatt?.connected && ble.dev.gatt.disconnect(); } catch {} clearInterval(ble.iv); ble = null; renderBle(); };
}
async function pairBle() {
  try {
    const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
    ble = { dev, name: dev.name || "Tag", samples: [], connected: null, watching: false, last: "near" };
    dev.addEventListener("gattserverdisconnected", () => { if (ble?.dev === dev) { ble.connected = false; renderBle(); B.toast(`${ble.name}: lost signal`); } });
    if (dev.watchAdvertisements) {
      dev.addEventListener("advertisementreceived", (e) => { ble.samples = [...ble.samples.filter((s) => Date.now() - s.t < 60e3), { t: Date.now(), rssi: e.rssi }]; });
      try { await dev.watchAdvertisements(); ble.watching = true; } catch {}
    }
    try { await dev.gatt?.connect(); ble.connected = true; } catch { if (!ble.watching) ble.connected = false; }
    ble.iv = setInterval(() => {
      if (!ble) return;
      const st = ble.connected === false ? "lost" : ble.watching ? bleState(ble.samples).state : "near";
      if (st === "lost" && ble.last !== "lost") B.toast(`${ble.name}: lost signal`);
      ble.last = st; renderBle();
    }, 3000);
    renderBle();
  } catch (err) { if (err?.name !== "NotFoundError") B.toast("Bluetooth couldn't pair."); }
}

// Tracker battery reminders, at the top of Safety when one is due.
function renderBattery() {
  let el = $("#batteryDue");
  const due = batteryDue(db().safety.trackers || []);
  if (!due.length) { el?.remove(); return; }
  if (!el) { el = document.createElement("p"); el.id = "batteryDue"; el.className = "pot-flag"; el.setAttribute("role", "status"); $("#tab-safety .grid").before(el); }
  el.innerHTML = `🔋 ${due.map((x) => `<b>${esc(x.name)}</b> ${x.overdue ? "battery check is overdue" : `battery check due ${esc(x.battery)}`}`).join("; ")}.`;
}

function renderAll() { loadOut(); loadFound(); renderPlan(); renderBle(); renderBattery(); }
addEventListener("bridge:show", (e) => { if (e.detail === "safety") renderAll(); });
addEventListener("bridge:account", renderAll);
addEventListener("bridge:trackers", renderBattery);
renderAll();
