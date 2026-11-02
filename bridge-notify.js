// Phone and computer notifications (Web Push) for alerts, team chat and the
// optional weekly summary. Each browser subscribes on its own; each person
// chooses what they get and when to be left alone. Urgent alerts ("I need help",
// "Take me home", a danger area, a device gone quiet) always come through.
import { api } from "./shared.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const KEY = "luminaac:push";
const db = () => B.db;
const online = () => !!(db().sync?.url && db().sync?.key);
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
const saved = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const keep = (v) => (v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY));
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const keyBytes = (b64) => { const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };

const card = document.createElement("section");
card.className = "card"; card.id = "notifyCard"; card.setAttribute("aria-labelledby", "h-notify");
card.innerHTML = `<div class="card-head"><h2 id="h-notify">Notifications</h2><span class="pill" id="pushState">Off</span></div>
  <p class="soft">Get alerts and team messages on this phone or computer, even when LuminAAC is closed. Each person chooses their own.</p>
  <div id="pushWhy" class="soft"></div>
  <div class="row gap" id="pushBtns">
    <button class="btn" type="button" id="btnPushOn">Turn on notifications</button>
    <button class="btn quiet" type="button" id="btnPushTest" hidden>Send a test</button>
    <button class="btn quiet" type="button" id="btnPushOff" hidden>Turn off on this browser</button>
  </div>
  <form class="form" id="formPush" hidden>
    <fieldset><legend>What to send me</legend>
      <label class="check"><input type="checkbox" name="alerts" checked /> Safety alerts</label>
      <label class="check"><input type="checkbox" name="urgentOnly" /> Only urgent alerts (help, take me home, danger areas)</label>
      <label class="check"><input type="checkbox" name="chat" checked /> Team chat messages</label>
      <label class="check"><input type="checkbox" name="summary" /> The weekly summary, if the family turned it on</label>
      <label class="check"><input type="checkbox" name="emailFallback" checked /> Email me an urgent alert if no notification gets through</label>
    </fieldset>
    <fieldset><legend>Quiet hours</legend>
      <label class="check"><input type="checkbox" name="quietOn" /> Hold non-urgent notifications</label>
      <div class="row gap"><label>From <input type="time" name="from" value="21:00" /></label><label>To <input type="time" name="to" value="07:00" /></label></div>
      <p class="soft small">Urgent alerts always come through. Times use this device's time zone.</p>
    </fieldset>
    <button class="btn" type="submit">Save notification settings</button>
  </form>
  <p class="soft" id="pushStatus" role="status"></p>`;
($("#h-dev")?.closest(".card") || $("#tab-account .grid")).after(card);

const status = (m) => ($("#pushStatus").textContent = m);
function prefsFromForm() {
  const f = $("#formPush").elements;
  return { alerts: f.alerts.checked, urgentOnly: f.urgentOnly.checked, chat: f.chat.checked, summary: f.summary.checked, emailFallback: f.emailFallback.checked, quiet: { on: f.quietOn.checked, from: f.from.value || "21:00", to: f.to.value || "07:00", tz: tz() } };
}
function fillForm(p = {}) {
  const f = $("#formPush").elements;
  f.alerts.checked = p.alerts !== false; f.urgentOnly.checked = !!p.urgentOnly; f.chat.checked = p.chat !== false; f.summary.checked = !!p.summary; f.emailFallback.checked = p.emailFallback !== false;
  f.quietOn.checked = !!p.quiet?.on; f.from.value = p.quiet?.from || "21:00"; f.to.value = p.quiet?.to || "07:00";
}
function render() {
  const s = saved(), on = !!s && supported() && Notification.permission === "granted";
  let why = "";
  if (!online()) why = "Notifications need a family account or a paired server. Set one up in Your account above.";
  else if (!supported()) why = ios && !standalone ? "On iPhone and iPad, first add LuminAAC to your Home Screen (Share, then Add to Home Screen), open it from there, and turn notifications on." : "This browser can't receive notifications.";
  else if (Notification.permission === "denied") why = "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.";
  $("#pushWhy").textContent = why;
  $("#pushState").textContent = on ? "On" : "Off";
  $("#btnPushOn").hidden = on || !!why;
  $("#btnPushTest").hidden = $("#btnPushOff").hidden = $("#formPush").hidden = !on;
  if (on) fillForm(s.prefs);
}
async function turnOn() {
  status("Asking this browser for permission…");
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { status("Permission was not given, so notifications stay off."); return render(); }
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await api(db(), "GET", "/api/push/key");
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== publicKey) { await sub.unsubscribe(); sub = null; }
    sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const name = /Android|iPhone|iPad/.test(navigator.userAgent) ? "Phone" : "Computer";
    const out = await api(db(), "POST", "/api/push", { subscription: sub.toJSON(), name, prefs: { ...prefsFromForm(), alerts: true, chat: true } });
    keep({ id: out.id, prefs: out.prefs }); status("Notifications are on for this browser."); B.toast("Notifications are on.");
  } catch (e) { status(`Couldn't turn notifications on: ${e.message}`); }
  render();
}
async function turnOff() {
  const s = saved();
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); await sub?.unsubscribe(); } catch {}
  if (s && online()) await api(db(), "DELETE", "/api/push/" + s.id).catch(() => {});
  keep(null); status("Notifications are off for this browser."); render();
}
$("#btnPushOn").addEventListener("click", turnOn);
$("#btnPushOff").addEventListener("click", turnOff);
$("#btnPushTest").addEventListener("click", async () => {
  const s = saved(); if (!s) return;
  try { await api(db(), "POST", "/api/push/test", { id: s.id }); status("Test sent. It should arrive in a few seconds."); }
  catch (e) { status(e.status === 404 ? "This browser's subscription has gone. Turn notifications on again." : `The test didn't send: ${e.message}`); if (e.status === 404) { keep(null); render(); } }
});
$("#formPush").addEventListener("submit", async (e) => {
  e.preventDefault(); const s = saved(); if (!s) return;
  try { const out = await api(db(), "PUT", "/api/push/" + s.id, { prefs: prefsFromForm() }); keep({ id: s.id, prefs: out.prefs }); status("Notification settings saved."); }
  catch (err) { status(`Couldn't save: ${err.message}`); }
});
new MutationObserver(() => !$("#tab-account").hidden && render()).observe($("#tab-account"), { attributes: true, attributeFilter: ["hidden"] });
render();
window.__notify = { render, saved };

// ---- Weekly care-team summary (opt-in) ----
const wk = document.createElement("section");
wk.className = "card"; wk.id = "weeklyCard"; wk.setAttribute("aria-labelledby", "h-weekly");
wk.innerHTML = `<div class="card-head"><h2 id="h-weekly">Weekly summary for the care team</h2><span class="pill" id="wkState">Off</span></div>
  <p class="soft">Once a week, a short note with counts only: moments, the words said most, alerts and team messages. Never notes, places, videos or recordings.</p>
  <div id="wkOff" hidden><p class="soft">This needs a family account or a paired server.</p></div>
  <div id="wkOn" class="form" hidden>
    <h3 class="h3">Preview</h3>
    <ul class="mini-list" id="wkPreview"></ul>
    <label class="check"><input type="checkbox" id="wkFamily" /> Send the weekly summary to our care team</label>
    <label class="check"><input type="checkbox" id="wkEmail" /> Email it to me</label>
    <p class="soft small" id="wkEmailNote"></p>
    <p class="soft small">To get it as a notification instead, tick "The weekly summary" in Account and devices, Notifications. Everyone can stop it from the link in each email.</p>
  </div>
  <p class="soft" id="wkStatus" role="status"></p>`;
($("#h-digest")?.closest(".card") || $("#tab-insights")).after(wk);
async function renderWeekly() {
  const on = online(); $("#wkOff").hidden = on; $("#wkOn").hidden = !on;
  if (!on) { $("#wkState").textContent = "Off"; return; }
  try {
    const s = await api(db(), "GET", "/api/summary/preview");
    $("#wkPreview").innerHTML = s.lines.map((l) => `<li>${B.esc(l)}</li>`).join("");
    $("#wkFamily").checked = s.on; $("#wkFamily").disabled = (db().account?.role || "parent") !== "parent";
    $("#wkEmail").checked = s.emailMe; $("#wkEmail").disabled = !s.canEmail;
    $("#wkEmailNote").textContent = s.canEmail ? "" : "To get it by email, sign in with an account and confirm your email address.";
    $("#wkState").textContent = s.on ? "On" : "Off";
  } catch (e) { $("#wkStatus").textContent = `Couldn't load the summary: ${e.message}`; }
}
for (const [id, k] of [["#wkFamily", "on"], ["#wkEmail", "emailMe"]]) $(id).addEventListener("change", async (e) => {
  try { await api(db(), "PUT", "/api/summary", { [k]: e.target.checked }); $("#wkStatus").textContent = "Saved."; renderWeekly(); }
  catch (err) { e.target.checked = !e.target.checked; $("#wkStatus").textContent = `Couldn't save: ${err.message}`; }
});
new MutationObserver(() => !$("#tab-insights").hidden && renderWeekly()).observe($("#tab-insights"), { attributes: true, attributeFilter: ["hidden"] });
renderWeekly();
