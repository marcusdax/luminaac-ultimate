// Bridge, Phase 3: safe zones (geofencing), accounts and passkeys, device pairing,
// on-device feeling estimates, and opt-in federated learning.
// Same in-memory document as bridge.js (window.__bridge).
import { getMedia, confidence, partOfDay, moodAV } from "./shared.js";
import { currentPosition, mapLink } from "./geo.js";
import * as emo from "./emotion.js";
import * as fc from "./fl-core.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const esc = B.esc;
const db = () => B.db;
const defaults = { safety: { consent: false, consentBy: "", consentAt: 0, zones: [], sendLocation: true, watch: true, events: [] }, emoBase: { n: 0 }, fl: { optIn: false, version: 0, global: null, local: null, sent: [] } };
for (const [k, v] of Object.entries(defaults)) if (!db()[k]) db()[k] = structuredClone(v);
const server = () => (db().sync.url || "").replace(/\/+$/, "");
async function call(method, path, body, { auth = true, url } = {}) {
  const base = (url || server()).replace(/\/+$/, "");
  if (!base) throw new Error("Add your server address first");
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(auth && db().sync.key && { Authorization: `Bearer ${db().sync.key}` }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status, body: j });
  return j.data;
}

// =============== Safe zones ===============
let map = null, mapLayer = null, preview = null, tileErrors = 0;
function renderSafety() {
  const s = db().safety;
  $("#geoState").textContent = s.consent ? `On · ${s.zones.length} zone${s.zones.length === 1 ? "" : "s"}` : "Off";
  $("#geoConsentBox").hidden = s.consent;
  $("#geoOn").hidden = !s.consent;
  $("#btnGeoOff").hidden = !s.consent;
  const f = $("#formGeoPrefs"); f.sendLocation.checked = !!s.sendLocation; f.watch.checked = s.watch !== false;
  f.sendLocation.disabled = f.watch.disabled = !s.consent;
  $("#zoneList").innerHTML = s.zones.map((z) => `<li class="${z.type === "danger" ? "is-danger" : ""}"><b>${esc(z.name)}</b> <span class="soft">${z.type === "danger" ? "Danger area · " : ""}${z.shape === "poly" ? `drawn shape, ${z.pts.length} points` : `${z.r} m · ${z.lat.toFixed(4)}, ${z.lng.toFixed(4)}`}</span>${z.shape === "poly" ? ` <button class="btn quiet small" type="button" data-editzone="${esc(z.id)}" aria-label="Edit the shape of ${esc(z.name)}">Edit shape</button>` : ""} <button class="btn quiet small" type="button" data-delzone="${esc(z.id)}" aria-label="Remove ${esc(z.name)}">Remove</button></li>`).join("") || `<li class="soft">No zones yet. Tap the map or use the form.</li>`;
  const ev = db().alerts.filter((a) => /^(zone|danger)-/.test(a.kind)).slice(0, 8);
  $("#geoEvents").innerHTML = ev.map((a) => `<li>${{ "zone-enter": "Arrived at", "zone-leave": "Left", "danger-enter": "Urgent: near", "danger-leave": "Moved away from" }[a.kind]} <b>${esc(a.zone || "")}</b> <span class="soft">${B.fmtDay(a.t)} ${B.fmtTime(a.t)}</span>${a.loc ? ` <a href="${mapLink(a.loc)}" target="_blank" rel="noopener">Map</a>` : ""}</li>`).join("") || `<li class="soft">Nothing yet.</li>`;
  if (s.consent) drawMap();
}
function drawMap() {
  const box = $("#zoneMap"), L = window.L;
  if (!L) { box.hidden = true; $("#mapNote").textContent = "The map isn't available. Add zones with the form: type a place's latitude and longitude, or use where you are now."; return; }
  const zones = db().safety.zones;
  if (!map) {
    const z0 = zones[0], c = z0 ? (z0.shape === "poly" ? { lat: z0.pts[0][0], lng: z0.pts[0][1] } : z0) : { lat: 41.8781, lng: -87.6298 };
    map = L.map(box, { scrollWheelZoom: false }).setView([c.lat, c.lng], zones.length ? 15 : 12);
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    tiles.on("tileerror", () => { if (++tileErrors === 4) { $("#mapNote").textContent = "Map pictures can't load right now (offline?). Your zones still work. Use the form below to add one."; box.classList.add("offline"); } });
    map.on("click", (e) => { if (B.drawing) return; const f = $("#formZone"); f.lat.value = e.latlng.lat.toFixed(5); f.lng.value = e.latlng.lng.toFixed(5); showPreview(); f.name.focus(); });
    mapLayer = L.layerGroup().addTo(map);
    B.safetyMap = map;
    $("#mapNote").textContent = "Tap the map to place a round zone and name it below, or draw your own shape.";
  }
  setTimeout(() => map.invalidateSize(), 50);
  mapLayer.clearLayers();
  zones.forEach((z) => {
    const style = z.type === "danger" ? { color: "#b8372f", weight: 3, fillOpacity: 0.18, dashArray: "8 4" } : { color: "#2f6f9f", weight: 2, fillOpacity: 0.15 };
    const shape = z.shape === "poly" ? L.polygon(z.pts, style) : L.circle([z.lat, z.lng], { radius: z.r, ...style });
    if (B.editingZone !== z.id) shape.bindTooltip(z.name, { permanent: true, direction: "center", className: "zone-label" + (z.type === "danger" ? " is-danger" : "") }).addTo(mapLayer);
  });
  document.dispatchEvent(new CustomEvent("safety:drawn", { detail: { map } }));
}
function showPreview() {
  const f = $("#formZone"), lat = parseFloat(f.lat.value), lng = parseFloat(f.lng.value), r = +f.r.value;
  $("#rOut").textContent = `${r} m`;
  if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  preview?.remove();
  preview = window.L.circle([lat, lng], { radius: r, color: "#c9781a", dashArray: "6 6", weight: 2, fillOpacity: 0.1 }).addTo(map);
}
$("#formZone").addEventListener("input", showPreview);
$("#btnGeoConsent").addEventListener("click", () => $("#geoConsent").showModal());
$("#formGeoConsent").addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  Object.assign(db().safety, { consent: true, consentBy: db().profile.caregiver || "parent", consentAt: Date.now(), watch: true });
  B.save("Turned on safe zones (parent consent recorded)"); renderSafety(); B.toast("Safe zones are on. Add your first zone.");
});
$("#btnHere").addEventListener("click", async () => {
  B.toast("Finding where you are…");
  const p = await currentPosition();
  if (!p) return B.toast("Couldn't get your location. Type it in, or tap the map.");
  const f = $("#formZone"); f.lat.value = p.lat.toFixed(5); f.lng.value = p.lng.toFixed(5); showPreview();
  map?.setView([p.lat, p.lng], 16);
});
$("#formZone").addEventListener("submit", (e) => {
  e.preventDefault(); const f = e.currentTarget;
  const z = { id: "z" + Math.random().toString(36).slice(2, 8), name: f.name.value.trim(), lat: +parseFloat(f.lat.value).toFixed(5), lng: +parseFloat(f.lng.value).toFixed(5), r: +f.r.value };
  if (!z.name || Math.abs(z.lat) > 90 || Math.abs(z.lng) > 180 || !Number.isFinite(z.lat + z.lng)) return B.toast("Check the name and the position.");
  db().safety.zones.push(z); preview?.remove(); preview = null;
  B.save(`Added safe zone "${z.name}"`); f.reset(); $("#rOut").textContent = "150 m"; renderSafety();
  map?.setView([z.lat, z.lng], 15);
});
B.renderSafety = renderSafety;
$("#zoneList").addEventListener("click", (e) => {
  const id = e.target.closest("[data-delzone]")?.dataset.delzone; if (!id) return;
  db().safety.zones = db().safety.zones.filter((z) => z.id !== id); B.save("Removed a safe zone"); renderSafety();
});
$("#formGeoPrefs").addEventListener("change", (e) => { db().safety[e.target.name] = e.target.checked; B.save(`Location setting changed: ${e.target.name}`); });
$("#btnGeoOff").addEventListener("click", () => {
  if (!confirm("Turn off safe zones and delete all zones?")) return;
  db().safety = { ...structuredClone(defaults.safety), sendLocation: false };
  db().alerts.forEach((a) => delete a.loc);
  B.save("Turned off safe zones and deleted zones and locations"); renderSafety();
});

// =============== Accounts and passkeys ===============
const status = (t) => ($("#acctStatus").textContent = t);
function signedIn(out, url) {
  db().sync = { ...db().sync, url, key: out.token, version: db().sync.version || 0 };
  db().account = { email: out.user.email, name: out.user.name, role: out.role, family: out.family, passkeys: out.user.passkeys, emailVerified: out.user.emailVerified || null };
  B.save(`Signed in as ${out.role}`); renderAccount(); dispatchEvent(new Event("bridge:account"));
}
function renderAccount() {
  const a = db().account;
  $("#acctOut").hidden = !!a; $("#acctIn").hidden = !a;
  $("#acctState").textContent = a ? `Signed in · ${a.role}` : db().device ? `Paired device · ${db().device.kind === "bridge" ? "caregiver" : "My Voice"}` : "Not signed in";
  const f = $("#formAcct"); if (!f.url.value) f.url.value = db().sync.url || "http://localhost:3001";
  if (a) {
    $("#acctWho").innerHTML = `<b>${esc(a.name || a.email)}</b> <span class="soft">${esc(a.email)} · ${esc(roleName(a.role))} for ${esc(a.family?.name || "your family")}</span>`;
    const v = $("#acctVerify"); v.hidden = false;
    v.innerHTML = a.emailVerified ? `<span aria-hidden="true">✅</span> Email confirmed` : `<span aria-hidden="true">✉️</span> Please confirm your email so you can reset your password if you forget it. <button class="link-btn" type="button" id="btnVerifySend">Send the email again</button>`;
    $("#passkeyList").innerHTML = (a.passkeys || []).map((k) => `<li>🔑 ${esc(k.name)} <span class="soft">added ${B.fmtDay(k.created)}</span></li>`).join("");
    renderFamily(); renderDevices();
  } else { $("#famBox").innerHTML = `<p class="soft">Sign in to see your family's members and children.</p>`; }
  $("#formJoin").url.value ||= db().sync.url || "http://localhost:3001";
}
const roleName = (r) => ({ parent: "Parent / admin", teacher: "Teacher", therapist: "Therapist", family: "Family" })[r] || r;
$("#formAcct").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.currentTarget, mode = e.submitter?.value || "login", url = f.url.value.trim().replace(/\/+$/, "");
  status(mode === "login" ? "Signing in…" : "Creating your account…");
  try {
    const body = { email: f.email.value, password: f.password.value };
    if (mode === "register") Object.assign(body, { name: db().profile.caregiver, familyName: `${db().profile.child || "Our"}'s family`, childName: db().profile.child, invite: f.invite.value.trim() || undefined, familyKey: !f.invite.value.trim() && db().sync.key && !db().account ? db().sync.key : undefined });
    const out = await call("POST", `/api/auth/${mode}`, body, { auth: false, url });
    f.password.value = ""; signedIn(out, url); status(mode === "login" ? "Signed in." : "Account created. You're the parent / admin for this family.");
  } catch (err) { status(err.message); }
});
$("#btnSignOut").addEventListener("click", async () => {
  try { await call("POST", "/api/auth/logout"); } catch {}
  db().account = null; db().sync = { ...db().sync, key: "" }; B.save("Signed out"); renderAccount(); dispatchEvent(new Event("bridge:account")); status("Signed out. Everything on this device is still here.");
});
// ---- Email verification and password reset ----
$("#acctVerify").addEventListener("click", async (e) => {
  if (e.target.id !== "btnVerifySend") return;
  try { const r = await call("POST", "/api/auth/verify/send"); if (r?.emailVerified) { db().account.emailVerified = r.emailVerified; B.save(); renderAccount(); } status(`Sent. Check ${db().account.email} for a link from LuminAAC.`); }
  catch (err) { status(err.message); }
});
$("#btnForgot").addEventListener("click", () => { $("#formAcct").hidden = true; const f = $("#formForgot"); f.hidden = false; f.email.value = $("#formAcct").email.value; f.email.focus(); });
$("#btnForgotCancel").addEventListener("click", () => { $("#formForgot").hidden = true; $("#formAcct").hidden = false; $("#btnForgot").focus(); });
$("#formForgot").addEventListener("submit", async (e) => {
  e.preventDefault(); const url = $("#formAcct").url.value.trim().replace(/\/+$/, "");
  try { await call("POST", "/api/auth/reset/request", { email: e.currentTarget.email.value }, { auth: false, url }); status("If that email has an account, a reset link is on its way. It works once, for 30 minutes."); }
  catch (err) { status(err.message); }
});
const linkServer = () => db().sync.url || $("#formAcct").url.value || "http://localhost:3001";
async function handleLinkHash() {
  const m = /^#(verify|reset)=([\w-]{20,})$/.exec(location.hash); if (!m) return;
  history.replaceState(null, "", location.pathname); // keep the token out of history and screenshots
  B.show("account");
  if (m[1] === "verify") {
    try { const r = await call("POST", "/api/auth/verify", { token: m[2] }, { auth: false, url: linkServer() }); if (db().account?.email === r.email) { db().account.emailVerified = r.emailVerified; B.save("Email confirmed"); } renderAccount(); status(`Thanks. ${r.email} is confirmed.`); }
    catch (err) { status(err.message); }
    return;
  }
  const d = $("#dlgReset"), f = $("#formReset"); f.reset(); $("#resetMsg").textContent = "";
  f.onsubmit = async (e) => {
    if (e.submitter?.value !== "ok") return;
    e.preventDefault();
    try {
      await call("POST", "/api/auth/reset", { token: m[2], password: f.password.value }, { auth: false, url: linkServer() });
      d.close(); if (db().account) { db().account = null; db().sync = { ...db().sync, key: "" }; B.save("Password changed, signed out"); }
      renderAccount(); status("Password changed. Sign in with your new password.");
    } catch (err) { $("#resetMsg").textContent = err.message; }
  };
  d.showModal(); f.password.focus();
}
window.addEventListener("hashchange", handleLinkHash);
setTimeout(handleLinkHash, 0);
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
$("#btnAddPasskey").addEventListener("click", async () => {
  if (!window.PublicKeyCredential) return status("This browser doesn't support passkeys.");
  try {
    const o = await call("POST", "/api/auth/passkey/register/options", {});
    const cred = await navigator.credentials.create({ publicKey: { ...o, challenge: unb64u(o.challenge), user: { ...o.user, id: unb64u(o.user.id) }, excludeCredentials: o.excludeCredentials.map((c) => ({ ...c, id: unb64u(c.id) })) } });
    const u = await call("POST", "/api/auth/passkey/register/verify", { challenge: o.challenge, name: navigator.userAgentData?.platform ? `${navigator.userAgentData.platform} passkey` : "Passkey", credential: { id: cred.id, response: { clientDataJSON: b64u(cred.response.clientDataJSON), attestationObject: b64u(cred.response.attestationObject) } } });
    db().account.passkeys = u.passkeys; B.save("Added a passkey"); renderAccount(); status("Passkey added. Next time, sign in without a password.");
  } catch (err) { status(err.name === "NotAllowedError" ? "Passkey setup was cancelled." : err.message); }
});
$("#btnPasskeyLogin").addEventListener("click", async () => {
  const url = $("#formAcct").url.value.trim().replace(/\/+$/, "");
  if (!window.PublicKeyCredential) return status("This browser doesn't support passkeys.");
  try {
    const o = await call("POST", "/api/auth/passkey/login/options", {}, { auth: false, url });
    const a = await navigator.credentials.get({ publicKey: { challenge: unb64u(o.challenge), rpId: o.rpId, userVerification: o.userVerification, timeout: o.timeout } });
    const out = await call("POST", "/api/auth/passkey/login/verify", { challenge: o.challenge, credential: { id: a.id, response: { clientDataJSON: b64u(a.response.clientDataJSON), authenticatorData: b64u(a.response.authenticatorData), signature: b64u(a.response.signature) } } }, { auth: false, url });
    signedIn(out, url); status("Signed in with your passkey.");
  } catch (err) { status(err.name === "NotAllowedError" ? "Passkey sign-in was cancelled." : err.message); }
});
async function renderFamily() {
  const box = $("#famBox");
  try {
    const f = await call("GET", "/api/family");
    const admin = f.you === "parent";
    box.innerHTML = `<p><b>${esc(f.name)}</b></p>
      <h3>Children</h3><ul class="mini-list">${f.children.map((c) => `<li>🧒 ${esc(c.name)}</li>`).join("") || `<li class="soft">None yet</li>`}</ul>
      ${admin ? `<form id="formChild" class="row gap"><label>Add a child <input name="name" required maxlength="40" /></label><button class="btn quiet" type="submit">Add</button></form>` : ""}
      <h3>Members</h3><ul class="mini-list">${f.members.map((m) => `<li>${esc(m.name || m.email || "Member")} <span class="pill">${esc(roleName(m.role))}</span></li>`).join("")}</ul>
      ${admin ? `<div class="row gap"><label>Invite a <select id="invRole"><option value="teacher">teacher</option><option value="therapist">therapist</option><option value="family">family member</option><option value="parent">co-parent</option></select></label><button class="btn quiet" type="button" id="btnInvite">Create invite code</button></div><p class="soft" id="invOut" role="status"></p>
      <p class="soft small">Teachers and family see what your share settings allow. Therapists also see insights. Only parents can change data, pair devices or invite.</p>` : `<p class="soft small">You can see what this family shares with your role.</p>`}`;
    $("#formChild")?.addEventListener("submit", async (e) => { e.preventDefault(); await call("POST", "/api/family/children", { name: e.currentTarget.name.value }); renderFamily(); });
    $("#btnInvite")?.addEventListener("click", async () => { const r = await call("POST", "/api/family/invites", { role: $("#invRole").value }); $("#invOut").innerHTML = `Invite code for a ${esc(r.role)}: <code class="code">${esc(r.code)}</code>. It works once, for 7 days.`; });
  } catch (err) { box.innerHTML = `<p class="soft">${esc(err.message)}</p>`; }
}

// =============== Device pairing ===============
let pairTimer = null;
$("#btnPair").addEventListener("click", async () => {
  const box = $("#pairBox");
  try {
    const p = await call("POST", "/api/devices/pair", { kind: $("#pairKind").value });
    const page = p.kind === "bridge" ? "bridge.html" : "index.html";
    const link = new URL(page, location.href); link.hash = `pair=${p.code}&u=${encodeURIComponent(server())}`;
    let svg = "";
    if (window.qrcode) { const q = window.qrcode(0, "M"); q.addData(link.href); q.make(); svg = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }
    box.hidden = false;
    box.innerHTML = `<div class="qr" role="img" aria-label="QR code for pairing">${svg}</div>
      <div><p>On the other device, scan this code with its camera, or open LuminAAC and enter:</p>
      <p class="pair-code" aria-label="Pairing code ${p.code.split("").join(" ")}">${p.code.slice(0, 3)} ${p.code.slice(3)}</p>
      <p class="soft small" id="pairLeft">Works once, for 10 minutes.</p></div>`;
    window.LuminMotion?.fade(box);
    clearInterval(pairTimer);
    pairTimer = setInterval(() => { const s = Math.max(0, Math.round((p.expires - Date.now()) / 1000)); const el = $("#pairLeft"); if (!el) return clearInterval(pairTimer); el.textContent = s ? `Works once. ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left.` : "This code has expired. Make a new one."; if (!s) clearInterval(pairTimer); if (s % 5 === 0) renderDevices(); }, 1000);
  } catch (err) { box.hidden = false; box.textContent = err.status === 403 ? "Only a parent can pair devices." : `Couldn't start pairing: ${err.message}. Sign in or connect a server first.`; }
});
async function renderDevices() {
  const ul = $("#deviceList");
  try {
    const list = await call("GET", "/api/devices");
    ul.innerHTML = list.map((d) => `<li class="${d.revoked ? "is-off" : ""}">${d.kind === "bridge" ? "📱" : "🗣️"} <b>${esc(d.name)}</b> <span class="soft">${d.kind === "bridge" ? "caregiver" : "My Voice"} · ${d.revoked ? "switched off" : `last seen ${B.fmtDay(d.lastSeen)} ${B.fmtTime(d.lastSeen)}`}</span>${d.revoked ? "" : ` <button class="btn quiet small" type="button" data-revoke="${esc(d.id)}" aria-label="Switch off ${esc(d.name)}">Switch off</button>`}</li>`).join("") || `<li class="soft">No paired devices yet.</li>`;
  } catch { ul.innerHTML = ""; }
}
$("#deviceList").addEventListener("click", async (e) => {
  const id = e.target.closest("[data-revoke]")?.dataset.revoke; if (!id) return;
  if (!confirm("Switch off this device? It will stop syncing and sending alerts until you pair it again.")) return;
  try { await call("DELETE", `/api/devices/${id}`); B.toast("Device switched off."); } catch (err) { B.toast(err.message); }
  renderDevices();
});
async function joinWithCode(url, code, name) {
  const out = await call("POST", "/api/devices/claim", { code, name }, { auth: false, url });
  db().sync = { ...db().sync, url, key: out.deviceKey, version: 0 };
  db().device = { id: out.deviceId, kind: out.kind, name };
  B.save(`Paired this browser as a ${out.kind === "bridge" ? "caregiver" : "My Voice"} device`);
  return out;
}
$("#formJoin").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.currentTarget;
  try { await joinWithCode(f.url.value.trim().replace(/\/+$/, ""), f.code.value.trim(), f.name.value.trim() || "Caregiver phone"); status("Paired. This browser now syncs with your family."); renderAccount(); }
  catch (err) { status(err.message); }
});
// Opened from a QR code: bridge.html#pair=123456&u=https://server
(function fromHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.get("pair")) return;
  B.show("account");
  const f = $("#formJoin"); f.closest("details").open = true; f.code.value = h.get("pair"); f.url.value = h.get("u") || "";
  f.name.focus();
})();

// =============== Feelings (on-device estimates) ===============
let feelFor = null;
window.addEventListener("bridge:annotate", async (e) => {
  const m = db().moments.find((x) => x.id === e.detail.id); const box = $("#annFeel");
  feelFor = m?.id; box.hidden = true; box.textContent = "";
  if (!m) return;
  if (!m.emotion && m.media && m.kind !== "photo" && db().emoPrefs?.voice !== false) {
    box.hidden = false; box.innerHTML = `<p class="soft">Listening for how it sounded… (on this device only)</p>`;
    try {
      const blob = await getMedia(m.media);
      let est = blob ? await emo.fromBlob(blob, db().emoBase) : null;
      if (blob && db().emoPrefs?.ser) { // optional trained model, fused with prosody
        try {
          const ai = await import("./ai.js");
          const r = await ai.classifySpeech(blob, { onProgress: (p) => (box.innerHTML = `<p class="soft">Getting the speech feelings model ready… ${p.pct}% (${p.mb} of about ${ai.MODELS.ser.mb} MB, once only)</p>`) });
          est = emo.fuseSpeech(est, r.scores);
        } catch { /* model unavailable (offline before first download): prosody only */ }
      }
      if (est && db().emoPrefs?.face && m.kind === "video") {
        const v = $("#annMedia video"); if (v) est = emo.combine(est, await emo.fromVideo(v));
      }
      if (est && feelFor === m.id) { m.emotion = { ...est, confirmed: null, t: Date.now() }; B.save(); }
    } catch { /* unreadable audio: no estimate */ }
  }
  if (feelFor === m.id) drawFeel(m);
});
function drawFeel(m) {
  const box = $("#annFeel"), e = m.emotion;
  if (!e) { box.hidden = true; return; }
  const L = emo.LABELS[e.label] || { e: "❔", t: e.label };
  box.hidden = false;
  box.innerHTML = `<p><span aria-hidden="true">${L.e}</span> <b>Estimate: sounds ${esc(L.t)}</b> <span class="soft">(${Math.round(e.conf * 100)}% sure, from ${e.sources.join(" and ")})</span></p>
    <p class="soft small">A guess from ${e.sources.includes("voice model") ? "a speech model plus pitch, loudness and pace" : "pitch, loudness and pace"}${e.sources.includes("face") ? " and facial expression" : ""}, made on this device. You know best.</p>
    <div class="row gap" role="group" aria-label="Is this estimate right?">
      <button type="button" class="chip" data-feel="yes" aria-pressed="${e.confirmed === true}">Yes, that's right</button>
      <button type="button" class="chip" data-feel="no" aria-pressed="${e.confirmed === false}">No</button>
      <label class="feel-pick">Actually <select id="feelPick"><option value="">choose</option>${Object.entries(emo.LABELS).map(([k, v]) => `<option value="${k}">${v.t}</option>`).join("")}</select></label>
    </div>`;
}
$("#annFeel").addEventListener("click", (e) => {
  const b = e.target.closest("[data-feel]"); if (!b) return;
  const m = db().moments.find((x) => x.id === feelFor); if (!m?.emotion) return;
  m.emotion.confirmed = b.dataset.feel === "yes";
  if (m.emotion.confirmed) learnFeel(m);
  B.save(`Feeling estimate ${m.emotion.confirmed ? "confirmed" : "corrected"}`); drawFeel(m); window.LuminMotion?.pop(b);
});
$("#annFeel").addEventListener("change", (e) => {
  if (e.target.id !== "feelPick" || !e.target.value) return;
  const m = db().moments.find((x) => x.id === feelFor); if (!m?.emotion) return;
  m.emotion = { ...m.emotion, label: e.target.value, confirmed: true, corrected: true }; learnFeel(m);
  B.save("Feeling set by caregiver"); drawFeel(m);
});
function learnFeel(m) {
  if (m.emotion.features) db().emoBase = emo.updateBaseline(db().emoBase, m.emotion.features);
  const s = db().signals.find((x) => x.id === m.signalId);
  if (s) s.moods = [...new Set([...(s.moods || []), m.emotion.label])];
}
$("#formAnnotate").addEventListener("submit", () => { // after bridge.js links the signal, attach the confirmed feeling
  setTimeout(() => { const m = db().moments.find((x) => x.id === feelFor); if (m?.emotion?.confirmed) { learnFeel(m); B.save(); } }, 0);
});
function renderFeelings() {
  const ms = db().moments.filter((m) => m.emotion);
  const box = $("#feelStats");
  if (!ms.length) { box.innerHTML = `<p class="soft">No estimates yet. When you explain a recorded moment, LuminAAC suggests how it sounded, and you say if it's right.</p>`; return; }
  const ok = ms.filter((m) => m.emotion.confirmed === true), no = ms.filter((m) => m.emotion.confirmed === false && !m.emotion.corrected), pend = ms.filter((m) => m.emotion.confirmed == null);
  const counts = {}; ok.forEach((m) => (counts[m.emotion.label] = (counts[m.emotion.label] || 0) + 1));
  const max = Math.max(1, ...Object.values(counts));
  box.innerHTML = `<ul class="bars">${Object.entries(emo.LABELS).map(([k, v]) => `<li><span>${v.e} ${v.t}</span><span class="bar" style="--w:${((counts[k] || 0) / max) * 100}%"></span><b>${counts[k] || 0}</b></li>`).join("")}</ul>
    <p class="soft small">Only feelings you confirmed are counted. ${pend.length} estimate${pend.length === 1 ? "" : "s"} waiting for you. The estimates matched you ${ok.length + no.length ? Math.round((ms.filter((m) => m.emotion.confirmed && !m.emotion.corrected).length / (ok.length + no.length)) * 100) : 0}% of the time.</p>`;
}

// =============== Federated learning ===============
const flStatus = (t) => ($("#flStatus").textContent = t);
function samples() {
  const d = db();
  return d.feedback.filter((f) => f.signalId || f.pod).map((f) => {
    const s = d.signals.find((x) => x.id === f.signalId);
    const [a, v] = moodAV(f.mood);
    return { x: fc.featurize({ pod: f.pod || partOfDay(new Date(f.t)), place: f.place || d.profile.place, arousal: a, valence: v, intent: f.intent || s?.intent, confidence: f.confidence ?? (s ? confidence(s) / 100 : 0.5) }), y: f.accepted ? 1 : 0 };
  });
}
function renderFeelPrefs() { const f = $("#formFeel"), p = db().emoPrefs || {}; f.voice.checked = p.voice !== false; f.face.checked = !!p.face; f.ser.checked = !!p.ser; window.dispatchEvent(new CustomEvent("bridge:feelprefs")); }
$("#formFeel").addEventListener("change", (e) => { db().emoPrefs = { ...(db().emoPrefs || {}), [e.target.name]: e.target.checked }; B.save(`Feeling estimates: ${e.target.name} ${e.target.checked ? "on" : "off"}`); });
function renderFl() {
  renderFeelPrefs();
  const f = db().fl; $("#formFl").optIn.checked = !!f.optIn;
  $("#btnFlSend").disabled = !f.optIn;
  if (!$("#flStatus").textContent) flStatus(`${samples().length} suggestion choices on this device to learn from.${f.version ? ` Shared model version ${f.version}.` : ""}${f.local ? " This device's personal model is in use." : ""}`);
}
$("#formFl").addEventListener("change", (e) => { db().fl.optIn = e.target.checked; B.save(e.target.checked ? "Joined shared learning" : "Left shared learning"); flStatus(""); renderFl(); });
$("#btnFlTrain").addEventListener("click", async () => {
  const S = samples(); if (S.length < 5) return flStatus("A few more suggestion choices are needed first (at least 5).");
  let g = db().fl.global || fc.zeros();
  if (db().sync.url && db().sync.key) { try { const m = await call("GET", "/api/fl/model"); g = m.weights; db().fl.global = g; db().fl.version = m.version; } catch {} }
  const before = fc.accuracy(g, S), w = fc.train(g, S, { epochs: 30 });
  db().fl.local = w.map((x) => +x.toFixed(4)); B.save("Trained the on-device suggestion model");
  flStatus(`Trained on this device with ${S.length} choices. It now predicts ${Math.round(fc.accuracy(w, S) * 100)}% of them (was ${Math.round(before * 100)}%). Suggestions use it right away.`);
});
$("#btnFlSend").addEventListener("click", async () => {
  if (!db().fl.optIn) return;
  const S = samples(); if (S.length < 5) return flStatus("A few more suggestion choices are needed first.");
  try {
    flStatus("Getting the shared model…");
    const m = await call("GET", "/api/fl/model"); db().fl.global = m.weights; db().fl.version = m.version;
    const bud = await call("GET", "/api/fl/budget").catch(() => null);
    if (bud && bud.nextRoundEpsilon > bud.cap) return flStatus(`This device has used its privacy budget (ε ${bud.epsilon} of ${bud.cap}). It keeps learning on its own, and sends nothing more.`);
    const u = await fc.clientUpdate(m.weights, S, { epochs: 20 });
    const r = await fc.runRound({ call, update: u.encoded, onStatus: (st) => flStatus(st.step === "waiting" ? `Update ready and protected. Waiting for ${st.waiting} more famil${st.waiting === 1 ? "y" : "ies"} to join, so yours can be mixed in…` : st.step === "shared" ? "Swapped protected key pieces with the other families…" : "Sent. Waiting for the round to close…") });
    db().fl.sent = [...db().fl.sent, { t: Date.now(), round: r.round, n: S.length }].slice(-20); B.save("Sent a protected learning update");
    const after = await call("GET", "/api/fl/budget").catch(() => null);
    db().fl.version = r.version;
    flStatus(`Sent. The shared model is now version ${r.version}${r.dropped ? ` (${r.dropped} famil${r.dropped === 1 ? "y" : "ies"} dropped out and the round still worked)` : ""}.${after ? ` Privacy used by this device: ε ${after.epsilon} of ${after.cap}.` : ""}`);
  } catch (err) { flStatus(err.status === 410 ? "Not enough families stayed in this round, so nothing was used. Try again later." : `Couldn't send (${err.message}). Nothing left this device.`); }
});

// =============== Wiring ===============
function onShow(tab) {
  if (tab === "safety") renderSafety();
  if (tab === "account") renderAccount();
  if (tab === "insights") renderFeelings();
  if (tab === "privacy") renderFl();
}
window.addEventListener("bridge:show", (e) => onShow(e.detail));
window.addEventListener("bridge:reload", () => onShow(B.current));
onShow(B.current);
if (/^#(safety|account)$/.test(location.hash)) B.show(location.hash.slice(1));
