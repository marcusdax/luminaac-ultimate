// Bridge, Phase 2: safety alerts, stories/routines/practice (LunaScript),
// access settings for My Voice, extra insights, and the optional server
// (sync, live alerts, share links). Edits the same in-memory document as bridge.js.
import { uid, confidence, api, INTENTS, partOfDay } from "./shared.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const esc = B.esc;
const db = () => B.db;

// ---------- Alerts ----------
const KIND = { help: { e: "🙋", t: "needs help" }, home: { e: "🏠", t: "wants to go home" }, custom: { e: "🔔", t: "sent an alert" }, "zone-enter": { e: "📍", t: "arrived at" }, "zone-leave": { e: "🚶", t: "left" }, silent: { e: "📵", t: "'s device stopped checking in" }, back: { e: "📶", t: "'s device is checking in again" } };
const where = (a) => {
  if (!a?.loc || typeof a.loc !== "object") return "";
  const lat = Number(a.loc.lat);
  const lng = Number(a.loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  const latSafe = esc(String(lat));
  const lngSafe = esc(String(lng));
  const accRaw = a.loc.acc;
  const accSafe = Number.isFinite(Number(accRaw)) && accRaw !== "" && accRaw !== null ? esc(String(Number(accRaw))) : esc(accRaw || "?");
  return ` <a class="soft" href="https://www.openstreetmap.org/?mlat=${latSafe}&amp;mlon=${lngSafe}#map=17/${latSafe}/${lngSafe}" target="_blank" rel="noopener">See where (within ${accSafe} m)</a>`;
};
function renderAlerts() {
  const open = db().alerts.filter((a) => !a.ack);
  const bar = $("#alertBar");
  bar.hidden = !open.length;
  bar.innerHTML = open.slice(0, 3).map((a) => `<div class="alert-item"><span class="alert-e" aria-hidden="true">${KIND[a.kind]?.e || "🔔"}</span>
    <p><b>${esc(db().profile.child || a.from || "Your child")}${(KIND[a.kind]?.t || "").startsWith("'") ? "" : " "}${KIND[a.kind]?.t || "sent an alert"}${a.zone ? " " + esc(a.zone) : ""}</b> <span class="soft">at ${B.fmtTime(a.t)}${a.message && !a.zone ? ` · "${esc(a.message)}"` : ""}</span>${where(a)}</p>
    <button class="btn" type="button" data-ack="${esc(a.id)}">I'm on my way</button></div>`).join("");
}
$("#alertBar").addEventListener("click", (e) => {
  const id = e.target.closest("[data-ack]")?.dataset.ack; if (!id) return;
  const a = db().alerts.find((x) => x.id === id); if (!a) return;
  a.ack = { by: db().profile.caregiver || "caregiver", t: Date.now() };
  B.save(`Answered an alert (${a.kind})`); renderAlerts(); B.toast("Marked as answered.");
  if (db().sync.url && db().sync.key) api(db(), "POST", `/api/alerts/${encodeURIComponent(id)}/ack`, { by: a.ack.by }).catch(() => {});
});
function chime() {
  try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 660; g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.9); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 1); } catch {}
}
let lastAlertCount = db().alerts.filter((a) => !a.ack).length;
function onAlertsChanged() { const n = db().alerts.filter((a) => !a.ack).length; const more = n > lastAlertCount; if (more) chime(); lastAlertCount = n; renderAlerts(); if (more) window.LuminMotion?.arrive($("#alertBar .alert-item")); }

// ---------- Stories, routines, sound practice ----------
function parseSteps(text) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*)\s*(.*)$/u.exec(l);
    return m ? { e: m[1], text: m[2] || m[1] } : { e: "•", text: l };
  });
}
function renderRoutines() {
  const sl = $("#storyList"); sl.textContent = "";
  db().stories.forEach((st) => sl.append(item(`${st.steps[0]?.e || "📖"} ${st.title} · ${st.kind === "routine" ? "routine" : "story"}, ${st.steps.length} steps`, () => { db().stories = db().stories.filter((x) => x !== st); B.save(`Removed story "${st.title}"`); renderRoutines(); })));
  const pl = $("#practiceList"); pl.textContent = "";
  db().practice.targets.forEach((p) => {
    const week = p.tries.filter((t) => t.t > Date.now() - 7 * 864e5);
    pl.append(item(`${p.e} "${p.sound}" as in ${p.word} · ${week.filter((t) => t.ok).length} tries said this week`, () => { db().practice.targets = db().practice.targets.filter((x) => x !== p); B.save(`Removed practice "${p.sound}"`); renderRoutines(); }));
  });
  $("#rewardPick").value = db().practice.reward;
  const cbl = $("#choiceBoardList");
  if (cbl) {
    cbl.textContent = "";
    (db().choiceBoards || []).forEach((cb) => {
      const opts = (cb.options || []).map((o) => `${o.e || ""} ${o.label || o.w}`.trim()).join(", ");
      cbl.append(item(`${cb.title}: ${opts}`, () => {
        db().choiceBoards = (db().choiceBoards || []).filter((x) => x.id !== cb.id);
        B.save(`Removed choice board "${cb.title}"`);
        renderRoutines();
      }));
    });
  }
}
function item(text, onRemove) {
  const li = document.createElement("li");
  li.append(Object.assign(document.createElement("span"), { textContent: text }));
  const b = Object.assign(document.createElement("button"), { type: "button", className: "btn quiet small", textContent: "Remove" });
  b.setAttribute("aria-label", `Remove ${text}`); b.addEventListener("click", onRemove); li.append(b);
  return li;
}
$("#formStory").addEventListener("submit", (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  const steps = parseSteps(f.get("steps")); if (!steps.length) return;
  db().stories.push({ id: uid("st"), title: f.get("title").trim(), kind: f.get("kind"), steps });
  e.target.reset(); B.save("Added a story"); renderRoutines(); B.toast("Saved. It's in My stories on My Voice.");
});
$("#formPractice").addEventListener("submit", (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  db().practice.targets.push({ id: uid("pr"), sound: f.get("sound").trim(), word: f.get("word").trim(), e: f.get("e").trim() || "🔤", tries: [] });
  e.target.reset(); B.save("Added a practice sound"); renderRoutines();
});
$("#rewardPick").addEventListener("change", (e) => { db().practice.reward = e.target.value; B.save("Changed practice reward"); });
$("#formChoiceBoard")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const opts = parseSteps(f.get("options")).map((s) => ({ label: s.text, w: s.text, e: s.e === "•" ? "" : s.e, c: "thing" })).slice(0, 8);
  if (opts.length < 2) { B.toast("Please enter at least 2 options."); return; }
  db().choiceBoards = [...(db().choiceBoards || []), { id: uid("cb"), title: f.get("title").trim(), options: opts }];
  e.target.reset();
  B.save("Added a choice board");
  renderRoutines();
  B.toast("Choice board saved to My Voice.");
});

// ---------- Access settings (applied live in My Voice by access.js) ----------
const clampMs = (v) => Math.min(1000, Math.max(0, Number(v) || 0));
function renderAccess() {
  const f = $("#formAccess"), a = db().access;
  f.mode.value = a.mode; f.size.value = a.size; f.dwell.value = String(a.dwell);
  if (f.acceptMs) f.acceptMs.value = String(clampMs(a.acceptMs));
  if (f.debounceMs) f.debounceMs.value = String(clampMs(a.debounceMs));
  f.scan.checked = !!a.scan; f.scanMs.value = String(a.scanMs);
  if (f.scanMode) f.scanMode.value = a.scanMode || "linear";
  if (f.scanAudio) f.scanAudio.checked = !!a.scanAudio;
  if (f.scanLoops) f.scanLoops.value = String(a.scanLoops || 0);
  f.safety.checked = a.safety !== false;
  $("#sizeOut").textContent = `${a.size}%`;
  if ($("#acceptOut")) $("#acceptOut").textContent = `${clampMs(a.acceptMs)} ms`;
  if ($("#debounceOut")) $("#debounceOut").textContent = `${clampMs(a.debounceMs)} ms`;
}
$("#formAccess").addEventListener("change", (e) => {
  const f = e.currentTarget, a = db().access;
  a.mode = f.mode.value; a.size = +f.size.value; a.dwell = +f.dwell.value;
  if (f.acceptMs) a.acceptMs = clampMs(f.acceptMs.value);
  if (f.debounceMs) a.debounceMs = clampMs(f.debounceMs.value);
  a.scan = f.scan.checked; a.scanMs = +f.scanMs.value;
  if (f.scanMode) a.scanMode = f.scanMode.value;
  if (f.scanAudio) a.scanAudio = f.scanAudio.checked;
  if (f.scanLoops) a.scanLoops = +f.scanLoops.value || 0;
  a.safety = f.safety.checked;
  B.save("Changed how My Voice responds"); renderAccess(); B.toast("Saved. My Voice updates right away.");
});
$("#formAccess").size.addEventListener("input", (e) => ($("#sizeOut").textContent = `${e.target.value}%`));
$("#formAccess").acceptMs?.addEventListener("input", (e) => ($("#acceptOut").textContent = `${clampMs(e.target.value)} ms`));
$("#formAccess").debounceMs?.addEventListener("input", (e) => ($("#debounceOut").textContent = `${clampMs(e.target.value)} ms`));

// ---------- Insights extras ----------
function renderInsightsPlus() {
  const d = db();
  const aac = JSON.parse(localStorage.getItem("luminaac:log") || "[]");
  const parts = ["morning", "afternoon", "evening", "night"];
  const counts = Object.fromEntries(parts.map((p) => [p, 0]));
  [...aac.map((l) => l.t), ...d.moments.map((m) => m.t)].forEach((t) => counts[partOfDay(new Date(t))]++);
  const max = Math.max(1, ...Object.values(counts));
  const best = parts.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  $("#podChart").innerHTML = `<ul class="hbars">${parts.map((p) => `<li><span>${p[0].toUpperCase() + p.slice(1)}</span><i style="--w:${(counts[p] / max) * 100}%"></i><b>${counts[p]}</b></li>`).join("")}</ul>
    <p class="soft">${counts[best] ? `Most happens in the ${best}. That's a good time for new words or a story.` : "As My Voice is used, you'll see the busiest times here."}</p>`;
  const fb = d.feedback.filter((x) => x.t > Date.now() - 30 * 864e5), acc = fb.filter((x) => x.accepted).length;
  $("#suggStats").innerHTML = fb.length
    ? `<div class="stats"><div class="stat"><b>${Math.round((acc / fb.length) * 100)}%</b><span>of suggestions used</span></div><div class="stat"><b>${fb.length}</b><span>chances in 30 days</span></div></div>
       <p class="soft">When "Not these" comes up often for one signal, check it in Signals. ${d.signals.filter((s) => confidence(s) < 50).length} signal(s) are below the line and resting.</p>`
    : `<p class="soft">Each time a suggestion is used or passed over with "Not these", it counts here, and the signal's confidence moves with it.</p>`;
  const ic = {}; d.moments.forEach((m) => m.intent && (ic[m.intent] = (ic[m.intent] || 0) + 1));
  const total = Object.values(ic).reduce((a, b) => a + b, 0);
  $("#intentStats").innerHTML = total
    ? `<ul class="hbars">${Object.entries(ic).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<li><span>${esc(INTENTS[k] || k)}</span><i style="--w:${(n / total) * 100}%"></i><b>${n}</b></li>`).join("")}</ul>`
    : `<p class="soft">When you explain a moment, pick what kind of message it was. Patterns show up here.</p>`;
  const ms = d.milestones || [];
  $("#milestoneList").innerHTML = ms.length ? ms.slice().reverse().map((m) => `<li><span>${esc(m.n)} messages said</span><span class="soft">${B.fmtDay(m.t)}</span></li>`).join("")
    : `<li><span class="soft">The first milestone is 5 messages in My Voice. ${esc(d.spoken || 0)} so far.</span></li>`;
}

// ---------- Optional server ----------
const status = (t) => ($("#syncStatus").textContent = t);
function newKey() { const a = new Uint8Array(18); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c])); }
function renderSync() {
  const f = $("#formSync"), s = db().sync;
  f.url.value = s.url; f.key.value = s.key || "";
  status(s.url ? (s.last ? `Connected. Last synced ${B.fmtDay(s.last)} at ${B.fmtTime(s.last)} (version ${s.version}).` : "Not synced yet.") : "Not connected. Everything stays on this device.");
  $("#btnShareLink").disabled = !s.url;
  const ul = $("#shareLinks"); ul.textContent = "";
  (s.links || []).filter((l) => !l.revoked && l.expires > Date.now()).forEach((l) => {
    const li = document.createElement("li");
    const a = Object.assign(document.createElement("a"), { href: s.url.replace(/\/+$/, "") + l.path, textContent: `${l.role} link`, target: "_blank", rel: "noopener" });
    li.append(a, Object.assign(document.createElement("span"), { className: "soft", textContent: ` until ${B.fmtDay(l.expires)}` }));
    const b = Object.assign(document.createElement("button"), { type: "button", className: "btn quiet small", textContent: "Turn off" });
    b.addEventListener("click", async () => { try { await api(db(), "DELETE", l.path); } catch {} l.revoked = true; B.save(`Turned off a ${l.role} link`); renderSync(); });
    li.append(b); ul.append(li);
  });
}
function mergeTelemetry(d, telemetry) {
  if (!telemetry || typeof telemetry !== "object") return;
  const dedupe = (a = [], b = [], keyFn, limit) => {
    const m = new Map();
    for (const x of a) m.set(keyFn(x), x);
    for (const x of b) m.set(keyFn(x), x);
    return [...m.values()].sort((x, y) => (x.t || 0) - (y.t || 0)).slice(-limit);
  };
  if (Array.isArray(telemetry.exploration) && telemetry.exploration.length) {
    d.exploration = dedupe(d.exploration, telemetry.exploration, (x) => `${x.t}|${x.word}`, 500);
  }
  if (Array.isArray(telemetry.feedback) && telemetry.feedback.length) {
    d.feedback = dedupe(d.feedback, telemetry.feedback, (x) => `${x.t}|${x.signalId || ""}|${x.accepted}`, 2000);
  }
  if (Array.isArray(telemetry.log) && telemetry.log.length) {
    try {
      const cur = JSON.parse(localStorage.getItem("luminaac:log") || "[]");
      const mergedLog = dedupe(Array.isArray(cur) ? cur : [], telemetry.log, (x) => `${x.t}|${x.text}|${x.kind || ""}`, 5000);
      localStorage.setItem("luminaac:log", JSON.stringify(mergedLog));
    } catch {}
  }
}
async function syncNow() {
  const d = db();
  status("Syncing…");
  try {
    const srv = await api(d, "GET", "/api/sync").catch(() => null);
    if (srv?.telemetry) mergeTelemetry(d, srv.telemetry);
  } catch {}
  const { media, account, device, ...rest } = d; void media; void account; void device;
  const body = { doc: { ...rest, sync: { ...d.sync, key: "" } }, baseVersion: d.sync.version };
  try {
    const r = await api(d, "PUT", "/api/sync", body);
    d.sync.version = r.version; d.sync.last = Date.now();
  } catch (e) {
    if (e.status !== 409) { status(`Couldn't reach the server (${e.message}). Your data is safe here.`); return; }
    // Conflict: another device synced first. Take theirs, keep our local-only items, and push again.
    const server = e.body.details;
    const mine = { alerts: d.alerts, feedback: d.feedback, exploration: d.exploration, sync: d.sync, account: d.account, device: d.device };
    const merged = { ...server.doc, ...mine };
    merged.moments = mergeById(server.doc.moments, d.moments);
    merged.signals = mergeById(server.doc.signals, d.signals, (a, b) => ({ ...b, confirmations: Math.max(a.confirmations, b.confirmations), rejections: Math.max(a.rejections, b.rejections) }));
    merged.sync.version = server.serverVersion;
    B.db = merged;
    try { const r = await api(merged, "PUT", "/api/sync", { doc: { ...merged, sync: { ...merged.sync, key: "" } }, baseVersion: server.serverVersion }); merged.sync.version = r.version; merged.sync.last = Date.now(); }
    catch (e2) { status(`Merged, but couldn't save to the server (${e2.message}).`); }
  }
  B.save("Synced with server"); renderSync(); connectStream();
}
function mergeById(a = [], b = [], pick = (x, y) => y) { const m = new Map(a.map((x) => [x.id, x])); b.forEach((y) => m.set(y.id, m.has(y.id) ? pick(m.get(y.id), y) : y)); return [...m.values()]; }
$("#formSync").addEventListener("submit", (e) => {
  e.preventDefault(); const f = e.currentTarget;
  const key = f.key.value.trim() || newKey();
  if (key.length < 16) { status("The family key needs at least 16 characters."); return; }
  db().sync = { ...db().sync, url: f.url.value.trim(), key };
  B.save("Connected a server"); syncNow();
});
$("#btnNewKey").addEventListener("click", () => { $("#formSync").key.value = newKey(); status("New key made. Copy it to your other devices, then connect."); });
$("#btnDisconnect").addEventListener("click", () => { db().sync = { url: "", key: "", version: 0, last: 0, links: [] }; B.save("Disconnected the server"); stream?.close(); renderSync(); });
$("#btnShareLink").addEventListener("click", async () => {
  try {
    await syncNow();
    const l = await api(db(), "POST", "/api/share", { role: $("#shareRole").value, expiresInDays: 30 });
    db().sync.links = [...(db().sync.links || []), l]; B.save(`Created a ${l.role} link`); renderSync();
    navigator.clipboard?.writeText(db().sync.url.replace(/\/+$/, "") + l.path).then(() => B.toast("Link copied. It's read-only and ends in 30 days."), () => {});
  } catch (e) { status(`Couldn't create a link (${e.message}).`); }
});

// Live alerts from other devices over Server-Sent Events (fetch-based so the key stays in a header).
let stream = null;
async function connectStream() {
  stream?.close(); const d = db(); if (!d.sync.url || !d.sync.key) return;
  const ctrl = new AbortController(); stream = { close: () => ctrl.abort() };
  try {
    const r = await fetch(d.sync.url.replace(/\/+$/, "") + "/api/alerts/stream", { headers: { Authorization: `Bearer ${d.sync.key}` }, signal: ctrl.signal });
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /event: (\w+)/.exec(chunk)?.[1], data = /data: (.*)/.exec(chunk)?.[1];
        if (!ev || !data) continue;
        const a = JSON.parse(data), list = db().alerts, have = list.find((x) => x.id === a.id);
        if (have) Object.assign(have, a); else list.unshift(a);
        B.save(); onAlertsChanged();
      }
    }
  } catch {}
}

// ---------- Wiring ----------
const intentSel = $("#annIntent");
Object.entries(INTENTS).forEach(([v, t]) => intentSel.append(new Option(t, v)));
function onShow(tab) {
  renderAlerts();
  if (tab === "routines") renderRoutines();
  if (tab === "vocab") renderAccess();
  if (tab === "insights") renderInsightsPlus();
  if (tab === "privacy") renderSync();
}
window.addEventListener("bridge:show", (e) => onShow(e.detail));
window.addEventListener("bridge:reload", onAlertsChanged);
onShow(B.current);
connectStream();
addEventListener("bridge:account", () => connectStream());
