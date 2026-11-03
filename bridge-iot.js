// Safety: smart-home sensors and wearable trackers.
// Sensors (door, gate, pool alarm, bed, motion, a tracker's own alerts) get a
// secret web link on the family server. Anything that can call a URL (Home
// Assistant, SmartThings or Alexa through IFTTT, many tracker apps) posts to it,
// and the Bridge shows the alert, urgent ones with the triple chime.
// Wearable trackers (AngelSense, AirTag, SmartTag…) are quick "Open" buttons
// kept in the family document, so they are one tap away when it matters.
import { api } from "./shared.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const esc = B.esc;
const db = () => B.db;
const online = () => !!(db().sync?.url && db().sync?.key);
const isParent = () => !db().account || db().account.role === "parent";
const base = () => db().sync.url.replace(/\/+$/, "");

const KINDS = { door: ["🚪", "Door"], gate: ["🚧", "Gate"], window: ["🪟", "Window"], pool: ["🏊", "Pool alarm"], motion: ["👣", "Motion"], bed: ["🛏️", "Bed or chair"], wearable: ["⌚", "Tracker alert"], other: ["📡", "Other"] };
const URGENT = ["door", "gate", "pool", "wearable"];
// Where each tracker's own map opens. Families can paste any other https link.
const TRACKERS = {
  angelsense: ["AngelSense", "https://my.angelsense.com/"], airtag: ["AirTag / Find My", "https://www.icloud.com/find"],
  smarttag: ["Samsung SmartTag", "https://smartthingsfind.samsung.com/"], google: ["Google Find Hub", "https://www.google.com/android/find"],
  jiobit: ["Jiobit", "https://www.jiobit.com/"], life360: ["Life360 / Tile", "https://www.life360.com/"], other: ["Other tracker", ""],
};
const T = () => (db().safety.trackers ||= []);

const card = document.createElement("section");
card.className = "card iot-card"; card.id = "iotCard"; card.setAttribute("aria-labelledby", "h-iot");
card.innerHTML = `<div class="card-head"><h2 id="h-iot">Sensors and wearables</h2><span class="pill" id="iotState"></span></div>
  <h3 class="h3">Wearable trackers</h3>
  <p class="soft">Keep your child's tracker one tap away. These buttons open the tracker's own map.</p>
  <div class="iot-trackers" id="trackerBtns"></div>
  <details class="iot-add"><summary>Add a tracker</summary>
    <form class="form" id="formTracker">
      <label>Tracker <select name="kind">${Object.entries(TRACKERS).map(([k, [n]]) => `<option value="${k}">${esc(n)}</option>`).join("")}</select></label>
      <label>Name on the button <input name="name" maxlength="40" placeholder="Sam's watch" required /></label>
      <label>Link to its map <input name="url" type="url" inputmode="url" placeholder="https://" /></label>
      <p class="soft small">Filled in for the trackers above. Use the address you sign in to on the web, or paste a share link.</p>
      <label>Attached to <input name="attached" maxlength="40" placeholder="Backpack, left shoe, wristband" /></label>
      <label>Photo of it on them (optional) <input name="photo" type="file" accept="image/*" /></label>
      <label>Remind me to check the battery on <input name="battery" type="date" /></label>
      <p class="soft small" id="trackerNote"></p>
      <button class="btn" type="submit">Add tracker</button>
    </form>
  </details>
  <h3 class="h3">Sensors and alarms</h3>
  <p class="soft">Door, gate and pool alarms, bed sensors, or your tracker's own alerts can ring here. Each one gets a private web link to call when it goes off.</p>
  <div id="iotOff" hidden><p class="soft">Sensors need a family account so alerts reach every caregiver. <button class="link-btn" type="button" id="btnIotSetup">Set one up in Account and devices</button></p></div>
  <div id="iotOn" hidden>
    <ul class="mini-list" id="sensorList"></ul>
    <form class="form" id="formSensor">
      <div class="row gap"><label>Name <input name="name" maxlength="60" required placeholder="Back door" /></label>
      <label>Type <select name="kind">${Object.entries(KINDS).map(([k, [e, n]]) => `<option value="${k}">${e} ${esc(n)}</option>`).join("")}</select></label></div>
      <label class="check"><input type="checkbox" name="urgent" checked /> Urgent: loud alert, like a water alert</label>
      <fieldset class="iot-research" hidden><legend>Research mode (optional, wristbands only)</legend>
        <p class="soft small">Some wristbands can send heart rate. In research studies, a rise while sitting still sometimes came 1–3 minutes before a meltdown. If you turn this on, a quiet "calm check?" can appear here for grown-ups only. It is never shown to your child, it is not a diagnosis, and it can be wrong. Readings are kept for 1 hour. Talk to your child's clinician first.</p>
        <label class="check"><input type="checkbox" name="research" /> I agree to research mode for this wristband</label>
        <label>Resting heart rate, if you know it <input name="rest" type="number" min="40" max="160" inputmode="numeric" /></label>
      </fieldset>
      <button class="btn" type="submit">Add sensor</button>
    </form>
    <div id="sensorNew" class="iot-new" hidden></div>
    <details class="iot-help"><summary>How to connect a sensor</summary>
      <ul>
        <li><b>IFTTT</b> (works with SmartThings, Ring, Alexa, Google Home, many trackers): make an applet. If your sensor triggers, then <i>Webhooks → Make a web request</i>. Paste the link, method <code>POST</code>, content type <code>application/json</code>, body <code>{"message":"opened"}</code>.</li>
        <li><b>Home Assistant</b>: add a <code>rest_command</code> with the link and <code>method: post</code>, then call it from an automation.</li>
        <li><b>Anything else</b> that can open a web address can call the link. Adding <code>?message=…</code> sets the words shown.</li>
        <li><b>Event names</b> make alerts smarter: send <code>{"event":"door_open"}</code>. Also <code>gate_open</code>, <code>window_open</code>, <code>pool_motion</code>, <code>wearable_sos</code>, <code>wearable_left_zone</code>, <code>seizure_alert</code>, <code>location</code> (with <code>lat</code> and <code>lng</code>) and, in research mode, <code>arousal</code> (with <code>hr</code>).</li>
        <li><b>Door rule:</b> a door or gate opening is urgent unless someone pressed "Going out together". The alert says whether their tablet has moved.</li>
      </ul>
      <p class="soft small">Anyone with the link can raise an alert, so keep it private. Remove the sensor here to switch its link off.</p>
    </details>
  </div>`;
$("#tab-safety .grid").append(card);

let sensors = [];
function renderTrackers() {
  const list = T();
  $("#trackerBtns").innerHTML = list.length ? list.map((x) => `<span class="iot-tracker">${x.photo ? `<img src="${esc(x.photo)}" alt="" class="iot-photo">` : ""}<a class="btn quiet" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">⌚ Open ${esc(x.name)}</a>${x.attached || x.battery ? ` <span class="soft small">${esc([x.attached && `on ${x.attached}`, x.battery && `battery check ${x.battery}`].filter(Boolean).join(" · "))}</span>` : ""} <button class="link-btn small" type="button" data-tdel="${esc(x.id)}" aria-label="Remove ${esc(x.name)}">Remove</button></span>`).join("")
    : `<p class="soft small">No trackers added.</p>`;
}
function renderSensors() {
  const on = online() && isParent();
  $("#iotOff").hidden = on; $("#iotOn").hidden = !on;
  $("#iotState").textContent = `${T().length} tracker${T().length === 1 ? "" : "s"} · ${on ? `${sensors.length} sensor${sensors.length === 1 ? "" : "s"}` : "sensors off"}`;
  if (!on) return;
  $("#sensorList").innerHTML = sensors.length ? sensors.map((s) => `<li><span>${KINDS[s.kind]?.[0] || "📡"} <b>${esc(s.name)}</b> <span class="soft">${esc(KINDS[s.kind]?.[1] || "")}${s.urgent ? " · urgent" : ""}${s.research ? " · research mode" : ""} · ${s.last ? `last alert ${B.fmtDay(s.last)} ${B.fmtTime(s.last)}` : "no alerts yet"}</span></span> <button class="link-btn small" type="button" data-sdel="${esc(s.id)}" aria-label="Remove ${esc(s.name)}">Remove</button></li>`).join("")
    : `<li class="soft">No sensors yet.</li>`;
}
async function loadSensors() {
  if (!online() || !isParent()) return renderSensors();
  try { sensors = await api(db(), "GET", "/api/sensors"); } catch {}
  renderSensors();
}

const NOTES = { airtag: "AirTags are made for things, not people. Other iPhones nearby may show a \"found an AirTag moving with you\" alert. A Find My share link (iOS 18.2 or later) can be pasted above.", smarttag: "SmartTags are made for things. Samsung phones nearby may warn about an unknown tag.", google: "Find Hub share links expire after 7 days.", life360: "Tile has no public way to read its location, so this opens its own app." };
const note = (k) => { $("#trackerNote").textContent = NOTES[k] || ""; };
$("#formTracker").kind.addEventListener("change", (e) => { note(e.target.value); const t = TRACKERS[e.target.value]; e.target.form.url.value = t[1]; if (!e.target.form.name.value && e.target.value !== "other") e.target.form.name.placeholder = t[0]; });
$("#formTracker").url.value = TRACKERS.angelsense[1];
$("#formTracker").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.currentTarget, url = f.url.value.trim();
  if (!/^https:\/\/[^\s]+$/i.test(url)) { B.toast("Add the tracker's https:// web address."); return f.url.focus(); }
  let photo;
  if (f.photo.files[0]) photo = await new Promise((res) => { const img = new Image(), u = URL.createObjectURL(f.photo.files[0]); img.onload = () => { const c = document.createElement("canvas"), k = Math.min(1, 160 / Math.max(img.width, img.height)); c.width = img.width * k; c.height = img.height * k; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg", 0.8)); }; img.onerror = () => res(undefined); img.src = u; });
  T().push({ id: "t" + Date.now().toString(36), kind: f.kind.value, name: f.name.value.trim().slice(0, 40), url, ...(f.attached.value.trim() && { attached: f.attached.value.trim().slice(0, 40) }), ...(f.battery.value && { battery: f.battery.value }), ...(photo && { photo }) });
  B.save(`Added tracker "${f.name.value.trim()}"`); f.reset(); f.url.value = TRACKERS.angelsense[1]; note("angelsense"); f.closest("details").open = false; renderTrackers(); renderSensors(); dispatchEvent(new Event("bridge:trackers"));
});
$("#trackerBtns").addEventListener("click", (e) => {
  const id = e.target.closest("[data-tdel]")?.dataset.tdel; if (!id) return;
  db().safety.trackers = T().filter((x) => x.id !== id); B.save("Removed a tracker"); renderTrackers(); renderSensors(); dispatchEvent(new Event("bridge:trackers"));
});
$("#formSensor").kind.addEventListener("change", (e) => { e.target.form.urgent.checked = URGENT.includes(e.target.value); $(".iot-research").hidden = e.target.value !== "wearable"; });
$("#formSensor").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.currentTarget;
  try {
    const s = await api(db(), "POST", "/api/sensors", { name: f.name.value.trim(), kind: f.kind.value, urgent: f.urgent.checked, ...(f.kind.value === "wearable" && f.research.checked && { research: true, consent: true, rest: +f.rest.value || undefined }) });
    const link = base() + s.path;
    sensors.push(s); f.reset(); $(".iot-research").hidden = true; renderSensors();
    const box = $("#sensorNew"); box.hidden = false;
    box.innerHTML = `<p><b>Link for ${esc(s.name)}</b>. Copy it now: it is shown only once.</p><p class="iot-link"><code>${esc(link)}</code></p>
      <div class="row gap"><button class="btn" type="button" id="btnCopyHook">Copy link</button><button class="btn quiet" type="button" id="btnTestHook">Send a test alert</button><button class="link-btn" type="button" id="btnHideHook">Done</button></div>`;
    $("#btnCopyHook").onclick = () => navigator.clipboard?.writeText(link).then(() => B.toast("Link copied."), () => B.toast("Select the link and copy it."));
    $("#btnTestHook").onclick = async () => { try { await fetch(link, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "test alert" }) }); B.toast("Test sent. It shows at the top in a moment."); B.pollNow?.(); setTimeout(loadSensors, 1500); } catch { B.toast("Couldn't send the test."); } };
    $("#btnHideHook").onclick = () => { box.hidden = true; box.textContent = ""; };
    B.save(`Added sensor "${s.name}"`);
  } catch (err) { B.toast(err.message || "Couldn't add the sensor."); }
});
$("#sensorList").addEventListener("click", async (e) => {
  const id = e.target.closest("[data-sdel]")?.dataset.sdel; if (!id) return;
  if (!confirm("Remove this sensor? Its link will stop working.")) return;
  try { await api(db(), "DELETE", `/api/sensors/${encodeURIComponent(id)}`); sensors = sensors.filter((s) => s.id !== id); renderSensors(); B.save("Removed a sensor"); } catch { B.toast("Couldn't remove it."); }
});
$("#btnIotSetup").addEventListener("click", () => B.show("account"));
addEventListener("bridge:show", (e) => { if (e.detail === "safety") { renderTrackers(); loadSensors(); } });
addEventListener("bridge:account", loadSensors);
renderTrackers(); renderSensors();
