// The Bridge: caregiver portal. Capture, annotate, learn, share, protect.
import { load, persist, uid, confidence, putMedia, getMedia, clearMedia, speak, ROLES, seed } from "./shared.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDay = (t) => new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

let db = load();
const save = (what) => { if (what) db.audit.unshift({ t: Date.now(), what }); db.audit = db.audit.slice(0, 40); persist(db); };

let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600); }

// ---------- Retention ----------
function applyRetention() {
  const days = Number(db.privacy.retainDays);
  if (!days) return;
  const cutoff = Date.now() - days * 864e5;
  const before = db.moments.length;
  db.moments = db.moments.filter((m) => m.t >= cutoff);
  if (db.moments.length !== before) save(`Removed ${before - db.moments.length} old moments`);
}

// ---------- Tabs ----------
let current = "today";
function show(tab) {
  $$(".panel").forEach((p) => (p.hidden = p.id !== `tab-${tab}`));
  $$("button.tab").forEach((b) => (b.dataset.tab === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  ({ today: renderToday, signals: renderSignals, vocab: renderVocab, insights: renderInsights, team: renderTeam, privacy: renderPrivacy })[tab]?.();
  current = tab;
  window.dispatchEvent(new CustomEvent("bridge:show", { detail: tab }));
  history.replaceState(null, "", `#${tab}`);
  $("#main").focus({ preventScroll: true });
}
$$("button.tab").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));

function renderHeader() {
  const name = db.profile.child || "your child";
  $$(".child-name").forEach((e) => (e.textContent = name));
  $("#who").textContent = db.profile.caregiver ? `${db.profile.caregiver} · ${ROLES[db.profile.role] || "Parent"}` : "";
}

// ---------- Rolling buffer capture ----------
// Two staggered MediaRecorders restart every 2N seconds, offset by N.
// At capture, the one that has run at least N seconds holds the last N seconds
// as a complete, playable file. Nothing older than 2N seconds ever exists.
const cap = { stream: null, recs: [], timers: [], mode: "audio", ctx: null, raf: 0 };

function pickMime(video) {
  const opts = video ? ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"] : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return opts.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
}

function startSlot(i) {
  const N = db.capture.seconds;
  const slot = cap.recs[i] || (cap.recs[i] = {});
  const rec = new MediaRecorder(cap.stream, { mimeType: pickMime(cap.mode === "video") || undefined });
  slot.rec = rec; slot.chunks = []; slot.started = Date.now(); slot.keep = false;
  rec.ondataavailable = (e) => e.data.size && slot.chunks.push(e.data);
  rec.onstop = () => {
    if (slot.keep) finishCapture(new Blob(slot.chunks, { type: rec.mimeType }), Math.min(N, Math.round((Date.now() - slot.started) / 1000)));
    slot.chunks = [];
    if (cap.stream) startSlot(i);
  };
  rec.start(1000);
  clearTimeout(cap.timers[i]);
  cap.timers[i] = setTimeout(() => rec.state === "recording" && rec.stop(), 2 * N * 1000);
}

async function startListening() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast("This browser can't record. Try a practice moment instead."); return; }
  cap.mode = $("input[name=cmode]:checked").value;
  try {
    cap.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: cap.mode === "video" ? { facingMode: "environment", width: 640 } : false });
  } catch { toast("Microphone permission was not given."); return; }
  const v = $("#preview");
  if (cap.mode === "video") { v.srcObject = cap.stream; v.hidden = false; v.play().catch(() => {}); }
  startSlot(0);
  cap.timers[2] = setTimeout(() => cap.stream && startSlot(1), db.capture.seconds * 1000);
  meter();
  $("#btnCapture").disabled = false;
  $("#btnListen").textContent = "Stop listening";
  $("#captureStatus").textContent = `Listening. Only the last ${db.capture.seconds} seconds are kept, and only if you tap.`;
  document.body.classList.add("is-listening");
}

function stopListening() {
  cap.timers.forEach(clearTimeout);
  const s = cap.stream; cap.stream = null;
  cap.recs.forEach((r) => r.rec?.state === "recording" && r.rec.stop());
  s?.getTracks().forEach((t) => t.stop());
  cancelAnimationFrame(cap.raf); cap.ctx?.close(); cap.ctx = null;
  $("#preview").hidden = true;
  $("#btnCapture").disabled = true;
  $("#btnListen").textContent = "Start listening";
  $("#captureStatus").innerHTML = `Start listening and LuminAAC keeps only the last <b>${db.capture.seconds}</b> seconds, on this device. When something meaningful happens, tap once to keep it.`;
  document.body.classList.remove("is-listening");
}

function meter() {
  try {
    cap.ctx = new AudioContext();
    const an = cap.ctx.createAnalyser(); an.fftSize = 64;
    cap.ctx.createMediaStreamSource(cap.stream).connect(an);
    const buf = new Uint8Array(an.frequencyBinCount), bars = $$("#listenViz i");
    const loop = () => { an.getByteFrequencyData(buf); bars.forEach((b, i) => b.style.setProperty("--h", (buf[i * 3] || 0) / 255)); cap.raf = requestAnimationFrame(loop); };
    loop();
  } catch { /* meter is decorative */ }
}

function captureNow() {
  const N = db.capture.seconds * 1000;
  const live = cap.recs.filter((r) => r.rec?.state === "recording");
  const best = live.sort((a, b) => a.started - b.started).find((r) => Date.now() - r.started >= N) || live[0];
  if (!best) return;
  best.keep = true;
  clearTimeout(cap.timers[cap.recs.indexOf(best)]);
  best.rec.stop();
  toast("Got it. Now tell us what it meant.");
}

async function finishCapture(blob, dur) {
  const id = uid("m");
  const recent = (JSON.parse(localStorage.getItem("luminaac:log") || "[]")).filter((l) => Date.now() - l.t < 60e3).map((l) => l.text);
  const m = { id, t: Date.now(), kind: cap.mode, dur, context: db.profile.place, aac: recent.slice(-3), meaning: "", by: db.profile.role, signalId: null, media: id };
  try { await putMedia(id, blob); } catch { m.media = null; }
  db.moments.unshift(m); save("Captured a moment");
  renderToday(); openAnnotate(id);
}

$("#btnListen").addEventListener("click", () => (cap.stream ? stopListening() : startListening()));
$("#btnCapture").addEventListener("click", captureNow);
$("#btnDemo").addEventListener("click", () => {
  const ctxs = ["snack time · pointing at fridge", "bath time · splashing", "after school · rocking by the door", "story time · humming"];
  const m = { id: uid("m"), t: Date.now(), kind: "audio", dur: db.capture.seconds, context: ctxs[Math.floor(Math.random() * ctxs.length)], aac: [], meaning: "", by: db.profile.role, signalId: null, media: null };
  db.moments.unshift(m); save("Added a practice moment"); renderToday(); openAnnotate(m.id);
});
document.addEventListener("keydown", (e) => { if (e.key === " " && e.target === document.body && cap.stream) { e.preventDefault(); captureNow(); } });

// ---------- Today ----------
function renderToday() {
  renderHeader();
  const dp = $("#dayPick");
  if (!dp.value) dp.value = dayKey(Date.now());
  const day = dp.value;
  // Timeline: moments + AAC log from My Voice + flagged patterns
  const aac = JSON.parse(localStorage.getItem("luminaac:log") || "[]").filter((l) => dayKey(l.t) === day);
  const ms = db.moments.filter((m) => dayKey(m.t) === day);
  const flags = db.privacy.autoDetect ? ms.filter((m) => !m.meaning).map((m) => ({ t: m.t + 1000, label: "Possible repeated signal" })) : [];
  const items = [
    ...ms.map((m) => ({ t: m.t, type: "moment", label: m.meaning || m.context, id: m.id })),
    ...aac.map((l) => ({ t: l.t, type: "aac", label: l.text })),
    ...flags.map((f) => ({ ...f, type: "flag" })),
  ].sort((a, b) => a.t - b.t);
  const tl = $("#timeline");
  tl.innerHTML = items.length ? "" : `<p class="soft">Nothing on this day yet.</p>`;
  const start = new Date(day + "T06:00").getTime(), span = 16 * 3600e3;
  const track = document.createElement("div"); track.className = "tl-track";
  track.innerHTML = `<div class="tl-hours" aria-hidden="true">${[6, 9, 12, 15, 18, 21].map((h) => `<span style="left:${((h - 6) / 16) * 100}%">${h % 12 || 12}${h < 12 ? "am" : "pm"}</span>`).join("")}</div>`;
  items.forEach((it) => {
    const b = document.createElement(it.id ? "button" : "span");
    b.className = `tl-item k-${it.type}`;
    b.setAttribute("role", "listitem");
    b.style.left = `${Math.min(98, Math.max(1, ((it.t - start) / span) * 100))}%`;
    b.setAttribute("aria-label", `${fmtTime(it.t)}: ${it.type === "aac" ? "said" : it.type === "flag" ? "noticed" : "moment"} ${it.label}`);
    b.title = `${fmtTime(it.t)} · ${it.label}`;
    if (it.id) { b.type = "button"; b.addEventListener("click", () => openAnnotate(it.id)); }
    track.append(b);
  });
  if (items.length) tl.append(track);

  const todo = db.moments.filter((m) => !m.meaning);
  $("#todoCount").textContent = todo.length ? `${todo.length} waiting` : "All explained";
  const ul = $("#moments"); ul.textContent = "";
  db.moments.slice(0, 12).forEach((m) => {
    const li = document.createElement("li");
    li.className = "moment" + (m.meaning ? " done" : "");
    const sig = db.signals.find((s) => s.id === m.signalId);
    li.innerHTML = `<div class="m-wave" aria-hidden="true">${wave(m.id)}</div>
      <div class="m-body"><p class="m-meta">${fmtDay(m.t)}, ${fmtTime(m.t)} · ${m.kind === "video" ? "Sound and video" : "Sound"} · ${m.dur}s · by ${esc(ROLES[m.by] || m.by)}</p>
      <p class="m-text">${m.meaning ? esc(m.meaning) : `<span class="soft">${esc(m.context)}</span>`}</p>
      ${sig ? `<p class="m-sig">Taught: ${esc(sig.name)}</p>` : ""}</div>`;
    const b = document.createElement("button"); b.type = "button"; b.className = "btn " + (m.meaning ? "quiet" : "");
    b.textContent = m.meaning ? "Edit" : "Explain"; b.addEventListener("click", () => openAnnotate(m.id));
    li.append(b); ul.append(li);
  });
  renderQuestions();
}

function wave(seed) {
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<svg viewBox="0 0 60 24" width="60" height="24">${Array.from({ length: 15 }, (_, i) => { h = (h * 1103515245 + 12345) >>> 0; const v = 3 + (h % 18); return `<rect x="${i * 4}" y="${12 - v / 2}" width="2.4" height="${v}" rx="1.2"/>`; }).join("")}</svg>`;
}

function renderQuestions() {
  const ul = $("#questions"); ul.textContent = "";
  const open = db.questions.filter((q) => q.status === "open");
  if (!open.length) ul.innerHTML = `<li class="soft">No questions right now. Keep catching moments.</li>`;
  open.forEach((q) => {
    const li = document.createElement("li");
    li.innerHTML = `<p>${esc(q.text)}</p>`;
    const row = document.createElement("div"); row.className = "row gap";
    const a = Object.assign(document.createElement("button"), { type: "button", className: "btn", textContent: q.suggestPhrase ? "Add that button" : "I know what it means" });
    a.addEventListener("click", () => {
      if (q.suggestPhrase) { db.signals.push({ id: uid("s"), name: q.suggestPhrase, cues: ["mealtime"], meaning: q.suggestPhrase, phrase: q.suggestPhrase, confirmations: 1, rejections: 0, contexts: ["home"], created: Date.now() }); toast("Added to My Voice suggestions."); }
      else { const m = { id: uid("m"), t: Date.now(), kind: "audio", dur: 15, context: "the new high sound before transitions", aac: [], meaning: "", by: db.profile.role, signalId: null, media: null }; db.moments.unshift(m); openAnnotate(m.id); }
      q.status = "answered"; save("Answered a question"); renderToday();
    });
    const n = Object.assign(document.createElement("button"), { type: "button", className: "btn quiet", textContent: "Not sure yet" });
    n.addEventListener("click", () => { q.status = "later"; save(); renderQuestions(); });
    row.append(a, n); li.append(row); ul.append(li);
  });
}

// ---------- Annotation studio ----------
let annId = null;
async function openAnnotate(id) {
  const m = db.moments.find((x) => x.id === id); if (!m) return;
  annId = id;
  $("#annText").value = m.meaning || "";
  const sig = db.signals.find((s) => s.id === m.signalId);
  $("#annPhrase").value = sig?.phrase || "";
  $("#annCues").value = sig?.cues.join(", ") || "";
  $("#annIntent").value = m.intent || "";
  $("#annContext").textContent = `${fmtDay(m.t)}, ${fmtTime(m.t)} · ${m.context}${m.aac.length ? ` · My Voice had just said "${m.aac.join(" ")}"` : ""}`;
  const media = $("#annMedia"); media.textContent = "";
  if (m.media) {
    const blob = await getMedia(m.media).catch(() => null);
    if (blob) { const el = document.createElement(m.kind === "video" ? "video" : "audio"); el.controls = true; el.src = URL.createObjectURL(blob); media.append(el); }
  } else media.innerHTML = `<div class="m-wave big" aria-hidden="true">${wave(m.id)}</div>`;
  smart();
  $("#annotate").showModal();
  window.dispatchEvent(new CustomEvent("bridge:annotate", { detail: { id: m.id } }));
  $("#annText").focus();
}
function smart() {
  const text = $("#annText").value.toLowerCase();
  const box = $("#annSmart"); box.textContent = "";
  if (text.length < 3) return;
  const words = text.match(/[a-z']{3,}/g) || [];
  const hit = db.signals.find((s) => words.some((w) => (s.meaning + " " + s.phrase + " " + s.name).toLowerCase().includes(w) && !["the", "and", "she", "his", "her", "wants", "want"].includes(w)));
  if (hit) {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "chip", textContent: `Link to "${hit.name}"` });
    b.addEventListener("click", () => { $("#annPhrase").value = hit.phrase; $("#annCues").value = hit.cues.join(", "); box.dataset.link = hit.id; box.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); });
    box.append("Sounds like a signal you've taught before. ", b);
  } else if (!$("#annPhrase").value) {
    const guess = phraseFrom(text);
    if (guess) { const b = Object.assign(document.createElement("button"), { type: "button", className: "chip", textContent: `Use "${guess}"` }); b.addEventListener("click", () => ($("#annPhrase").value = guess)); box.append("Words My Voice could offer: ", b); }
  }
}
function phraseFrom(t) {
  const m = t.match(/(?:wants?|asking for|asks for)\s+(?:to\s+)?(.+?)(?:[.,]|$)/);
  if (m) return `I want ${m[1].replace(/\b(his|her)\b/g, "my")}`.slice(0, 50);
  if (/hurt|pain|sick/.test(t)) return "Something hurts";
  if (/park|outside/.test(t)) return "Can we go outside?";
  if (/excited|happy/.test(t)) return "I'm so happy!";
  return "";
}
$("#annText").addEventListener("input", smart);
$("#formAnnotate").addEventListener("submit", (e) => {
  if (e.submitter?.value !== "save") { delete $("#annSmart").dataset.link; return; }
  const m = db.moments.find((x) => x.id === annId);
  m.meaning = $("#annText").value.trim();
  const phrase = $("#annPhrase").value.trim() || phraseFrom(m.meaning.toLowerCase()) || m.meaning.slice(0, 50);
  const cues = $("#annCues").value.split(",").map((s) => s.trim()).filter(Boolean);
  const linkId = $("#annSmart").dataset.link || m.signalId;
  let s = db.signals.find((x) => x.id === linkId);
  if (s) { if (m.signalId !== s.id) s.confirmations += 1; s.phrase = phrase; s.cues = [...new Set([...s.cues, ...cues])]; }
  else {
    s = { id: uid("s"), name: cues[0] ? cues.slice(0, 2).join(" + ") : m.context.split("·")[0].trim() || "New signal", cues, meaning: m.meaning, phrase, confirmations: 1, rejections: 0, contexts: [new Date(m.t).getHours() < 11 ? "morning" : new Date(m.t).getHours() < 17 ? "afternoon" : "evening", db.profile.place], created: Date.now() };
    db.signals.push(s);
  }
  m.signalId = s.id;
  m.intent = $("#annIntent").value || null;
  delete $("#annSmart").dataset.link;
  save("Explained a moment"); renderToday();
  toast(`Thank you. "${s.phrase}" is now part of ${db.profile.child ? db.profile.child + "'s" : "their"} voice.`);
});

// ---------- Signals ----------
function renderSignals() {
  const ul = $("#signals"); ul.textContent = "";
  [...db.signals].sort((a, b) => confidence(b) - confidence(a)).forEach((s) => {
    const c = confidence(s);
    const li = document.createElement("li"); li.className = "signal";
    li.innerHTML = `<div class="sig-head"><h2>${esc(s.name)}</h2><span class="conf" style="--c:${c}" aria-label="Confidence ${c} percent">${c}%</span></div>
      <p class="sig-meaning">${esc(s.meaning)}</p>
      <p class="sig-phrase">My Voice offers: <b>"${esc(s.phrase)}"</b></p>
      <ul class="cues" aria-label="Cues">${s.cues.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
      <p class="soft">Confirmed ${s.confirmations} · not it ${s.rejections} · ${s.contexts.map(esc).join(", ")}</p>`;
    const row = document.createElement("div"); row.className = "row gap";
    const mk = (t, cls, fn) => { const b = Object.assign(document.createElement("button"), { type: "button", className: `btn ${cls}`, textContent: t }); b.addEventListener("click", fn); row.append(b); };
    mk("Hear it", "quiet", () => speak(s.phrase));
    mk("Yes, that's it", "", () => { s.confirmations++; save(`Confirmed "${s.name}"`); renderSignals(); });
    mk("Not quite", "quiet", () => { s.rejections++; save(`Corrected "${s.name}"`); renderSignals(); });
    mk("Remove", "danger quiet", () => { if (confirm(`Remove "${s.name}"?`)) { db.signals = db.signals.filter((x) => x !== s); save("Removed a signal"); renderSignals(); } });
    li.append(row); ul.append(li);
  });
}

// ---------- Vocabulary ----------
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
$(".days").insertAdjacentHTML("beforeend", DAYS.map((d, i) => `<label class="day"><input type="checkbox" name="d" value="${i}" ${i > 0 && i < 6 ? "checked" : ""}/> ${d}</label>`).join(""));
function renderVocab() {
  $("#momentPick").innerHTML = `<option value="">Just speak the words</option>` + db.moments.filter((m) => m.media).map((m) => `<option value="${m.id}">${esc(m.meaning || m.context)} (${fmtDay(m.t)})</option>`).join("");
  const pl = $("#personalList"); pl.textContent = "";
  db.personality.forEach((p) => pl.append(rowItem(`${p.e} ${p.label}${p.momentId ? " · plays a moment" : ""}`, () => { db.personality = db.personality.filter((x) => x !== p); save("Removed a button"); renderVocab(); })));
  const rl = $("#ruleList"); rl.textContent = "";
  db.rules.forEach((r) => rl.append(rowItem(`${r.page}: ${r.days.map((d) => DAYS[d]).join(" ")} · ${r.from}:00 to ${r.to}:00`, () => { db.rules = db.rules.filter((x) => x !== r); save("Removed a rule"); renderVocab(); })));
  const counts = {}; db.exploration.forEach((x) => (counts[x.word] = (counts[x.word] || 0) + 1));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 16);
  $("#exploreList").innerHTML = top.length ? top.map(([w, n]) => `<span class="chip static" style="--n:${Math.min(1, n / 6)}">${esc(w)} <b>${n}</b></span>`).join("") : `<p class="soft">Nothing yet. Turn on Explore quietly in My Voice.</p>`;
}
function rowItem(text, onRemove) {
  const li = document.createElement("li"); const span = document.createElement("span"); span.textContent = text;
  const b = Object.assign(document.createElement("button"), { type: "button", className: "link-btn", textContent: "Remove" });
  b.setAttribute("aria-label", `Remove ${text}`); b.addEventListener("click", onRemove);
  li.append(span, b); return li;
}
$("#formPersonal").addEventListener("submit", (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  db.personality.push({ id: uid("p"), label: f.get("label").trim(), e: f.get("e") || "⭐", kind: "custom", momentId: f.get("momentId") || null });
  e.target.reset(); save("Added a My things button"); renderVocab(); toast("Added to My things.");
});
$("#formRule").addEventListener("submit", (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  db.rules.push({ id: uid("r"), page: f.get("page").trim(), from: +f.get("from"), to: +f.get("to"), days: f.getAll("d").map(Number) });
  save("Added a page rule"); renderVocab(); toast("Rule saved.");
});

// ---------- Insights ----------
function renderInsights() {
  const explained = db.moments.filter((m) => m.meaning).length;
  const strong = db.signals.filter((s) => confidence(s) >= 70).length;
  const aac = JSON.parse(localStorage.getItem("luminaac:log") || "[]");
  $("#stats").innerHTML = [
    [explained, "moments explained"], [db.signals.length, "signals learned"], [strong, "signals My Voice trusts"], [aac.length, "messages spoken"],
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
  // 14-day bars
  const days = Array.from({ length: 14 }, (_, i) => dayKey(Date.now() - (13 - i) * 864e5));
  const vals = days.map((d) => db.moments.filter((m) => m.meaning && dayKey(m.t) === d).length + aac.filter((l) => dayKey(l.t) === d).length / 4);
  const max = Math.max(1, ...vals);
  $("#trend").innerHTML = `<svg viewBox="0 0 280 120" class="chart" role="img" aria-label="Daily activity for the last 14 days, highest ${Math.round(max)}">${vals.map((v, i) => `<rect x="${i * 20 + 3}" y="${105 - (v / max) * 95}" width="14" height="${Math.max(2, (v / max) * 95)}" rx="4"/>`).join("")}<line x1="0" y1="106" x2="280" y2="106"/></svg>
    <table class="sr-only"><caption>Activity by day</caption>${days.map((d, i) => `<tr><th>${d}</th><td>${vals[i].toFixed(1)}</td></tr>`).join("")}</table>`;
  // Personality map: center child, nodes = personality + strong signals
  const nodes = [...db.personality.map((p) => ({ l: p.label, e: p.e, k: "fav" })), ...db.signals.slice(0, 6).map((s) => ({ l: s.meaning, e: "💬", k: "sig" }))].slice(0, 10);
  const R = 105, cx = 160, cy = 140;
  $("#pmap").innerHTML = `<svg viewBox="-30 0 380 290" class="pmap" role="img" aria-label="Personality map: ${nodes.map((n) => esc(n.l)).join(", ")}">
    ${nodes.map((n, i) => { const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2; const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/><g class="node ${n.k}"><circle cx="${x}" cy="${y}" r="20"/><text x="${x}" y="${y + 6}" text-anchor="middle" font-size="16">${n.e}</text><text class="lbl" x="${x}" y="${y + (y > cy ? 36 : -26)}" text-anchor="middle">${esc(n.l.slice(0, 22))}</text></g>`; }).join("")}
    <circle class="me" cx="${cx}" cy="${cy}" r="30"/><text class="me-t" x="${cx}" y="${cy + 6}" text-anchor="middle">${esc((db.profile.child || "Me").slice(0, 8))}</text></svg>`;
}

// ---------- Team & sharing ----------
function renderTeam() {
  const ul = $("#teamList"); ul.textContent = "";
  db.team.forEach((t) => ul.append(rowItem(`${t.name} · ${ROLES[t.role]} · ${t.access === "full" ? "everything" : t.access === "notes" ? "signals and notes" : "signals"}`, () => { db.team = db.team.filter((x) => x !== t); save(`Removed ${t.name}`); renderTeam(); })));
  renderShare();
}
function renderShare() {
  const role = $("#viewAs").value;
  const access = { teacher: "signals", family: "signals", therapist: "full" }[role];
  const member = db.team.find((t) => t.role === role);
  const level = member?.access || access;
  const sigs = [...db.signals].filter((s) => confidence(s) >= 50).sort((a, b) => confidence(b) - confidence(a));
  let html = `<p class="soft">What ${role === "family" ? "family" : `a ${role}`} sees${member ? ` (${esc(member.name)})` : ""}:</p>
    <h3>When ${esc(db.profile.child || "they")} does this, it usually means…</h3>
    <ul class="share-sig">${sigs.map((s) => `<li><span>${esc(s.cues.join(" + "))}</span><b>${esc(s.phrase)}</b></li>`).join("")}</ul>`;
  if (level !== "signals") html += `<h3>Shared notes</h3><ul class="notes">${db.notes.map((n) => `<li><span class="soft">${fmtDay(n.t)} · ${esc(ROLES[n.by])}</span> ${esc(n.text)}</li>`).join("")}</ul>`;
  if (level === "full") html += `<p class="soft">${db.moments.length} moments${db.privacy.shareMedia ? " with recordings" : " (recordings hidden by your privacy settings)"}.</p>`;
  $("#sharePreview").innerHTML = html;
}
$("#viewAs").addEventListener("change", renderShare);
$("#formInvite").addEventListener("submit", (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  const t = { id: uid("t"), name: f.get("name").trim(), role: f.get("role"), access: f.get("access"), invited: Date.now() };
  db.team.push(t); e.target.reset(); save(`Invited ${t.name}`); renderTeam();
  toast(`Invite ready for ${t.name}. Sharing goes live when accounts launch.`);
});
$("#formNote").addEventListener("submit", (e) => {
  e.preventDefault(); db.notes.unshift({ id: uid("n"), t: Date.now(), by: db.profile.role, text: new FormData(e.target).get("text").trim() });
  e.target.reset(); save("Posted a note"); renderShare();
});
$("#btnPrint").addEventListener("click", () => { $("#viewAs").value = "teacher"; renderShare(); document.body.classList.add("print-guide"); window.print(); document.body.classList.remove("print-guide"); });
$("#btnShareFile").addEventListener("click", () => download(`luminaac-guide-${dayKey(Date.now())}.json`, { child: db.profile.child, signals: db.signals.map(({ name, cues, meaning, phrase }) => ({ name, cues, meaning, phrase })), notes: db.notes }));

// ---------- Privacy ----------
function renderPrivacy() {
  const f = $("#formPrivacy");
  f.retainDays.value = String(db.privacy.retainDays); f.seconds.value = db.capture.seconds;
  ["autoDetect", "blurFaces", "shareMedia"].forEach((k) => (f[k].checked = db.privacy[k]));
  f.place.value = db.profile.place;
  $("#audit").innerHTML = db.audit.slice(0, 10).map((a) => `<li><span class="soft">${fmtDay(a.t)} ${fmtTime(a.t)}</span> ${esc(a.what)}</li>`).join("");
}
$("#formPrivacy").addEventListener("change", (e) => {
  const f = e.currentTarget;
  db.privacy.retainDays = +f.retainDays.value;
  db.capture.seconds = Math.min(60, Math.max(5, +f.seconds.value || 15));
  ["autoDetect", "blurFaces", "shareMedia"].forEach((k) => (db.privacy[k] = f[k].checked));
  db.profile.place = f.place.value;
  $("#bufSecs").textContent = db.capture.seconds;
  applyRetention(); save("Changed privacy settings"); renderPrivacy(); toast("Saved.");
});
function download(name, obj) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("#btnExport").addEventListener("click", () => download(`luminaac-backup-${dayKey(Date.now())}.json`, db));
$("#importFile").addEventListener("change", async (e) => {
  try { const v = JSON.parse(await e.target.files[0].text()); if (v.version !== 2) throw 0; db = v; save("Restored from file"); show("today"); toast("Restored."); }
  catch { toast("That file doesn't look like a LuminAAC backup."); }
});
$("#btnWipe").addEventListener("click", async () => {
  if (!confirm("Delete every moment, recording, learned signal, and video and game history on this device? This can't be undone.")) return;
  db.moments = []; db.signals = []; db.questions = []; db.exploration = []; db.notes = [];
  if (db.videos) { db.videos.sessions = []; db.videos.talk = []; }
  if (db.games) db.games.plays = [];
  await clearMedia().catch(() => {}); save("Deleted all moments and signals"); renderPrivacy(); toast("Deleted.");
});
$("#btnRedo").addEventListener("click", () => onboard(true));

// ---------- Onboarding ----------
function onboard(force) {
  if (db.profile.onboarded && !force) return;
  const dlg = $("#onboard"); let step = 0;
  const f = $("#formOnboard");
  f.child.value = db.profile.child; f.caregiver.value = db.profile.caregiver; f.role.value = db.profile.role;
  const go = () => { $$(".ob-step", dlg).forEach((s) => (s.hidden = +s.dataset.step !== step)); $("#obNext").textContent = step === 2 ? "Let's begin" : "Next"; $(`.ob-step[data-step="${step}"] input, .ob-step[data-step="${step}"] select`, dlg)?.focus(); };
  const greet = ["LuminAAC learns from you. Let's start with a few small things.", `Hi! ${f.child.value || "Your child"} is lucky to have you. Who's teaching LuminAAC today?`, `Thanks${f.caregiver.value ? ", " + f.caregiver.value : ""}. You are ${f.child.value || "their"}'s best translator.`];
  $("#obNext").onclick = () => {
    db.profile.child = f.child.value.trim(); db.profile.caregiver = f.caregiver.value.trim(); db.profile.role = f.role.value;
    if (step < 2) { step++; $("#obText").textContent = greet[step].replace(/^Hi! Your child/, "Hi! Your child"); go(); return; }
    db.profile.onboarded = true; save("Finished setup"); dlg.close(); renderHeader(); renderToday();
  };
  $("#obSkip").onclick = () => { db.profile.onboarded = true; save(); dlg.close(); };
  go(); dlg.showModal();
}

// ---------- Boot ----------
applyRetention();
$("#bufSecs").textContent = db.capture.seconds;
$("#dayPick").addEventListener("change", renderToday);
show((location.hash.slice(1) && $(`#tab-${location.hash.slice(1)}`)) ? location.hash.slice(1) : "today");
onboard(false);
persist(db);
window.__luminaacSeed = seed; // handy for demos in the console

// Shared handle for bridge-plus.js (alerts, routines, sync, access) so both
// modules edit one in-memory document and never overwrite each other.
window.__bridge = { get db() { return db; }, set db(v) { db = v; }, save, toast, show, esc, fmtDay, fmtTime, dayKey, download, get current() { return current; } };
// My Voice in another tab writes alerts, feedback and confirmations: reload and redraw.
window.addEventListener("storage", (e) => {
  if (e.key !== "luminaac:bridge" || !e.newValue) return;
  db = load(); renderHeader();
  if (!document.querySelector("dialog[open]")) show(current);
  window.dispatchEvent(new Event("bridge:reload"));
});
