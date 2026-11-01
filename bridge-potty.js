// Bridge: the Potty Path tab. Consent, the medical check and sensory setup, a
// one-handed live console, coaching scripts, the log, explainable hints, the plan,
// print-outs and calendar reminders, two-device handoff (QR, or the server with
// optional end-to-end encryption) and the toilet data controls.
// The plan (protocol) lives in the shared Bridge document (db.potty) so it reaches
// My Voice; the toilet log itself lives only in potty-store.js. See docs/POTTY-PATH.md.
import * as C from "./potty-core.js";
import * as S from "./potty-store.js";
import { ICON } from "./potty-icons.js";

const B = window.__bridge;
const db = () => B.db;
const esc = B.esc;
const $ = (s, el = document) => el.querySelector(s);
const P = () => (db().potty ||= { protocol: { ...C.DEFAULT_PROTOCOL }, paused: false });
const proto = () => C.protocolOf(P().protocol);
const store = () => S.read();
const evs = () => store().events;
const name = () => db().profile.child || "your child";
const fmtT = (t) => B.fmtTime(t);
const html = (el, s) => { el.innerHTML = s; return el; };
S.useServer(() => B.db);

// Saving the plan never logs what changed (content-free audit line).
function saveProto(changes, changedWhat) {
  P().protocol = { ...proto(), ...changes, updatedAt: Date.now(), updatedBy: S.deviceId() };
  if (changedWhat) P().protocol.changed = { what: changedWhat, at: Date.now() };
  B.save("Updated toilet plan"); render();
}
const log = (kind, data = {}, sid) => { const e = S.record(kind, data, { by: "caregiver", sessionId: sid }); lastUndo = { id: e.id, at: Date.now() }; return e; };
let lastUndo = null;
function award(n, why, sid) { if (n > 0) S.record("token_award", { n, why }, { by: "system", sessionId: sid }); }
function btn(label, fn, cls = "btn quiet") { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.innerHTML = label; b.addEventListener("click", fn); return b; }

// ---------- Turn on + consent ----------
function renderOn() {
  const el = $("#potOn"), s = store(), on = !!db().access.potty;
  if (!s.profile.consentAt) {
    html(el, `<form class="form" id="potConsent">
      <p>Potty Path keeps a toilet log <b>on this device only</b>. Nothing is sent anywhere unless you turn that on later, and you can delete it any time.</p>
      <label>Your name (parent or guardian) <input name="by" required maxlength="60" autocomplete="name" /></label>
      <label class="check"><input type="checkbox" name="ok" required /> I'm ${esc(name())}'s parent or guardian and I agree to keep this log</label>
      <label class="check"><input type="checkbox" name="doc" /> We've talked to ${esc(name())}'s doctor about constipation and toileting (recommended first)</label>
      <button class="btn" type="submit">Turn on Potty Path</button></form>`);
    $("#potConsent").addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target;
      if (!f.by.value.trim() || !f.ok.checked) return;
      await S.update((st) => { st.profile.consentBy = f.by.value.trim(); st.profile.consentAt = Date.now(); st.profile.doctorChecked = f.doc.checked; });
      db().access.potty = true; P(); B.save("Turned on Potty Path"); B.toast("Potty Path is on. Start with Getting ready below."); render();
    });
    return;
  }
  html(el, `<label class="check"><input type="checkbox" id="potEnable" ${on ? "checked" : ""}/> Show the TOILET button and Potty Path in My Voice</label>
    <p class="soft small">Turned on by ${esc(s.profile.consentBy)} on ${new Date(s.profile.consentAt).toLocaleDateString()}. The TOILET button always speaks and always works, even when the plan is paused.</p>
    <p class="soft small">On a tablet in the bathroom, add My Voice to the home screen and turn on Guided Access (iPad) or screen pinning (Android) so it stays on the right screen.</p>`);
  $("#potEnable").addEventListener("change", (e) => { db().access.potty = e.target.checked; B.save(e.target.checked ? "Turned on Potty Path" : "Turned off Potty Path"); render(); });
}

// ---------- Red flags / pause ----------
let pause = { paused: false, reasons: [], info: [] };
function renderFlags() {
  const el = $("#potFlags");
  pause = C.pauseState(evs(), store().profile, proto());
  if (P().paused !== pause.paused) { P().paused = pause.paused; B.save("Updated toilet plan"); }
  if (!store().profile.consentAt) { el.textContent = ""; return; }
  const items = pause.reasons.map((r) => `<div class="pot-flag${r.urgent ? " urgent" : ""}" role="${r.urgent ? "alert" : "status"}"><b>${r.urgent ? "Call your child's doctor today: " : "Paused: "}${esc(r.label)}</b>
    <span class="soft small">${r.urgent ? "This needs a doctor the same day." : r.code === "manual" ? "" : "Scheduled sits are off until you've checked with a doctor. The TOILET button still works."}</span>
    ${r.code === "manual" ? `<button type="button" class="link-btn" data-resume="manual">Resume the plan</button>` : r.urgent ? "" : `<button type="button" class="link-btn" data-resume="${esc(r.code)}">We've checked with our doctor: resume</button>`}</div>`);
  const info = pause.info.map((r) => `<p class="pot-flag soft">${esc(r.label)}</p>`);
  html(el, items.join("") + info.join("") + (pause.reasons.length ? `<p><button type="button" class="btn quiet" id="potDocPrint">Print a summary for the doctor</button></p>` : ""));
  el.querySelectorAll("[data-resume]").forEach((b) => b.addEventListener("click", () => { log("protocol_resume", b.dataset.resume === "manual" ? {} : { code: b.dataset.resume }); render(); }));
  $("#potDocPrint")?.addEventListener("click", () => printDoc(doctorHTML()));
}

// ---------- Live console ----------
let modality = "leads_adult", stool = "", prompt = "";
function renderLive() {
  const el = $("#potLive"), p = proto(), all = evs(), s = C.activeSession(all, p);
  $("#potPhase").textContent = `Phase ${p.phase}`;
  const gate = C.canScheduleSit(all, p, Date.now(), pause), nw = C.nextWindow(p);
  const L = C.ledger(all, p);
  let status = "No try in progress.";
  if (s) {
    const left = s.state === "sitting" ? Math.max(0, Math.round(Math.min(s.sitTarget, s.sitCap) - s.sitElapsed)) : null;
    status = `${s.initiated ? "Child asked · " : ""}${s.state.replace("_", " ")}${left != null ? ` · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left` : ""}${s.voids.length ? " · went in the toilet" : ""}`;
  }
  html(el, `<p class="pot-status" role="status">${esc(status)}</p>
    <p class="soft small">${gate.ok ? (nw ? `Next planned sit about ${fmtT(nw)}.` : "No sit times set. Add them in The plan, or use the hints.") : esc(gate.reason)}${p.tokensOn ? ` · Tokens ${Math.min(L.onBoard, L.ratio)}/${L.ratio}` : ""}</p>
    <div class="pot-console" id="potBtns"></div>
    <div class="row gap" style="margin-top:8px;flex-wrap:wrap">
      <label class="small">How they asked <select id="potMod">${Object.entries(C.MODALITIES).map(([k, v]) => `<option value="${k}" ${k === modality ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
      <label class="small">Poo type (Bristol, optional) <select id="potStool"><option value="">Not noted</option>${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${String(n) === stool ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="small">Help on this step <select id="potPrompt"><option value="">Not noted</option>${Object.entries(C.PROMPTS).map(([k, v]) => `<option value="${k}" ${k === prompt ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
    </div>`);
  $("#potMod").addEventListener("change", (e) => (modality = e.target.value));
  $("#potStool").addEventListener("change", (e) => (stool = e.target.value));
  $("#potPrompt").addEventListener("change", (e) => { prompt = e.target.value; if (prompt) log("prompt", { prompt, step: s ? C.currentStep(s, p).list[C.currentStep(s, p).i]?.id : undefined }, s?.id); });
  const box = $("#potBtns"), sid = s?.id;
  const add = (label, fn, cls) => box.append(btn(label, () => { fn(); render(); }, cls));
  if (!s) {
    add("Start a try", () => { const id = C.rid(); log("session_start", { prompted: true }, id); });
    add("Poo sit (after a meal)", () => { const id = C.rid(); log("session_start", { prompted: true, bowel: true }, id); });
  }
  add("Asked ★", () => { const id = sid || C.rid(); if (!sid) log("session_start", { prompted: false }, id); log("signal", { modality }, id); award(C.tokensFor("signal", {}, p), "signal", id); B.toast("Asking always counts most. Go now."); }, "btn");
  add("Pee in toilet", () => { log("void", { type: "urine", where: "toilet" }, sid); award(C.tokensFor("void", {}, p), "void", sid); });
  add("Poo in toilet", () => { log("void", { type: "bm", where: "toilet", stool: stool ? +stool : undefined }, sid); award(C.tokensFor("void", {}, p), "void", sid); });
  add("Dry check: dry", () => log("dry_check", { dry: true }, sid));
  add("Wet / missed", () => { if (sid) log("wet", { type: "urine" }, sid); else { const id = C.rid(); log("session_start", { prompted: true, cleanup: true }, id); log("wet", { type: "urine" }, id); } });
  add("Poo in pants / nappy", () => log("wet", { type: "bm", stool: stool ? +stool : undefined }, sid));
  add("Drink", () => log("drink"));
  add("Meal", () => log("meal"));
  if (s) {
    add("Not now", () => log("refuse", {}, sid));
    add(s.state === "coregulate" ? "Resume" : "Pause (distress)", () => log(s.state === "coregulate" ? "resume" : "distress", {}, sid));
    add("End: hard moment", () => log("abort", { escalation: true }, sid));
    add("End the try", () => log("session_end", {}, sid));
  }
  if (L.full) add("Reward given ✓", () => log("token_redeem", { ratio: L.ratio }, sid), "btn");
  if (lastUndo && Date.now() - lastUndo.at < 5000) add("Undo last", () => { S.record("retract", { targetId: lastUndo.id }, { by: "caregiver" }); lastUndo = null; });
  if (!pause.reasons.some((r) => r.code === "manual")) add("Pause the plan", () => log("protocol_pause", { manual: true, reason: "Paused by a caregiver" }));
}

// ---------- Coaching ----------
function renderCoach() {
  const s = C.activeSession(evs(), proto());
  const key = !s ? "going" : s.state === "coregulate" ? (s.escalated ? "escalation" : "distress") : s.state === "cleanup" ? "wet" : s.voids.length ? "void" : s.state === "sitting" || s.state === "body_check" ? "sitting" : "going";
  const sc = C.SCRIPTS[key];
  html($("#potCoach"), `<div class="pot-script"><b>${esc(sc.title)}</b><ul>${sc.say.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <details><summary>All scripts</summary>${Object.values(C.SCRIPTS).map((x) => `<div class="pot-script"><b>${esc(x.title)}</b><ul>${x.say.map((y) => `<li>${esc(y)}</li>`).join("")}</ul></div>`).join("")}</details>`);
}

// ---------- Today ----------
const LABEL = { session_start: (e) => (e.data.cleanup ? "Clean-up" : e.data.bowel ? "Poo sit started" : e.data.prompted === false ? "Try started by asking" : "Try started"), step: (e) => `Step: ${(C.STEPS.find((s) => s.id === e.data.step) || C.CLEANUP_STEPS.find((s) => s.id === e.data.step) || C.DONE_STEP).label}`,
  sit_end: () => "Sit finished", more_time: () => "More time", void: (e) => `${e.data.type === "bm" ? "Poo" : "Pee"} in the toilet${e.data.stool ? ` (type ${e.data.stool})` : ""}`, wet: (e) => `${e.data.type === "bm" ? "Poo" : "Wet"} (missed)`,
  dry_check: () => "Dry check: dry", signal: (e) => `Asked: ${C.MODALITIES[e.data.modality] || "yes"}`, refuse: () => "Not now", distress: () => "Distress: paused", pause: () => "Break", resume: () => "Back to it",
  abort: (e) => (e.data.escalation ? "Ended: hard moment" : "Ended"), session_end: () => "Try ended", prompt: (e) => `Help: ${C.PROMPTS[e.data.prompt] || ""}`, drink: () => "Drink", meal: () => "Meal",
  token_redeem: () => "Reward given", protocol_pause: () => "Plan paused", protocol_resume: () => "Plan resumed", body_answer: (e) => `Body check: ${{ need: "need to go", no: "don't need", unsure: "not sure" }[e.data.answer] || ""}`, note: (e) => e.data.text || "Note" };
function renderToday() {
  const today = C.dayNow(Date.now()), list = C.live(evs()).filter((e) => C.dayOf(e) === today && LABEL[e.kind] && !(e.kind === "step" && e.data.step !== "sit")).reverse();
  const c = C.todayCounts(evs(), proto());
  $("#potCounts").textContent = `${c.signals} asked · ${c.voids} in toilet · ${c.wets} missed`;
  const ul = $("#potTimeline"); ul.textContent = "";
  if (!list.length) ul.innerHTML = `<li class="soft">Nothing logged today. Logging is one tap; gaps are fine.</li>`;
  for (const e of list.slice(0, 80)) {
    const li = document.createElement("li");
    li.innerHTML = `<time>${fmtT(e.t)}</time><span>${esc(LABEL[e.kind](e))}${e.by === "child" ? " <span class='soft'>(child)</span>" : ""}</span>`;
    if (e.by !== "system") { const x = btn("Remove", () => { S.record("retract", { targetId: e.id }, { by: "caregiver" }); render(); }, "link-btn"); x.setAttribute("aria-label", `Remove ${LABEL[e.kind](e)} at ${fmtT(e.t)}`); x.style.marginLeft = "auto"; li.append(x); }
    ul.append(li);
  }
}

// ---------- Hints ----------
function renderHints() {
  const el = $("#potHints"), all = evs(), p = proto();
  const vt = C.voidTimes(all), dv = C.drinkToVoid(all), pod = C.successByPartOfDay(all, p), sug = C.suggestions(all, p);
  let h = "";
  if (vt.ready && vt.peaks.length) {
    h += `<div class="pot-hint"><b>Pees usually come around ${vt.peaks.map((x) => x.time).join(", ")}</b><span class="why">${vt.peaks.map((x) => esc(x.why)).join(". ")}.</span>
      <button type="button" class="btn quiet" id="potUseTimes">Plan sits at ${vt.peaks.map((x) => x.sitAt).join(", ")}</button></div>`;
  } else h += `<p class="pot-hint soft">Usual pee times: needs ${esc(vt.needs)}.</p>`;
  h += dv.ready ? `<p class="pot-hint"><b>About ${dv.minutes} minutes after a drink</b><span class="why">${esc(dv.why)} (spread ${dv.iqr} min). Try a sit about ${dv.sitAfter} minutes after drinks.</span></p>` : `<p class="pot-hint soft">Drink to pee: ${esc(dv.needs)}.</p>`;
  const rows = pod.rows.filter((r) => r.ready);
  if (rows.length) h += `<p class="pot-hint"><b>Sits by time of day</b><span class="why">${rows.map((r) => `${r.pod}: ${r.ok} of ${r.n} sits had a pee`).join(" · ")}${pod.flag ? `. ${pod.best} works best.` : ""}</span></p>`;
  for (const s of sug) h += `<p class="pot-hint">💡 ${esc(s.text)}${s.code === "thin" ? ` <button type="button" class="link-btn" id="potThin">Try a bigger board</button>` : s.code === "phase_up" ? ` <button type="button" class="link-btn" id="potUp">Move to phase 3</button>` : ""}</p>`;
  if (p.updatedAt && Date.now() - p.updatedAt > 30 * C.DAY) h += `<p class="pot-hint soft">Nothing has changed in a month. If it suits ${esc(name())}, change one small thing (a timer picture, a step photo) and mark it as new.</p>`;
  html(el, h + `<p class="soft small">Hints are suggestions from your log, never decisions. They need about a week of fairly full days first.</p>`);
  $("#potUseTimes")?.addEventListener("click", () => saveProto({ sitWindows: vt.peaks.map((x) => x.sitAt) }));
  $("#potThin")?.addEventListener("click", () => saveProto({ tokenRatio: p.tokenRatio < 2 ? 2 : p.tokenRatio < 3 ? 3 : 5 }, "board"));
  $("#potUp")?.addEventListener("click", () => saveProto({ phase: 3 }));
}

// ---------- Week ----------
function renderWeek() {
  const w = C.weekSummary(evs(), proto()), today = C.dayNow(Date.now());
  const per = [6, 5, 4, 3, 2, 1, 0].map((k) => C.live(evs()).filter((e) => e.kind === "signal" && C.dayOf(e) === today - k).length);
  const max = Math.max(1, ...per);
  html($("#potWeek"), `<p>${esc(name().charAt(0).toUpperCase() + name().slice(1))} asked <b>${w.signals}</b> time${w.signals === 1 ? "" : "s"}${w.precision != null ? ` · ${w.precision}% followed by a pee within 10 minutes` : ""}</p>
    <div class="pot-chart" aria-hidden="true">${per.map((n) => `<span style="height:${(n / max) * 100}%"></span>`).join("")}</div>
    <div class="pot-chart-l" aria-hidden="true">${[6, 5, 4, 3, 2, 1, 0].map((k) => `<span>${new Date(Date.now() - k * C.DAY).toLocaleDateString(undefined, { weekday: "narrow" })}</span>`).join("")}</div>
    <p class="soft small">${w.sessions} tries · ${w.toiletVoids} in the toilet · ${w.wets} missed · ${w.refusals} "not now" · ${w.distress} hard moments</p>
    ${w.modalities.length ? `<p class="small">Ways of asking: ${w.modalities.map(([k, n]) => `${esc(C.MODALITIES[k] || k)} (${n})`).join(", ")}</p>` : ""}
    <p class="soft small">No scores here. Asking in any way is the win.</p>`);
}

// ---------- The plan ----------
function renderPlan() {
  const f = $("#potPlan"), p = proto();
  const opt = (v, l, cur) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`;
  html(f, `<label>Phase <select name="phase">${C.PHASES.map(([v, l]) => opt(v, `${v}. ${l}`, p.phase)).join("")}</select></label>
    <label>Sit times <input name="sitWindows" value="${esc(p.sitWindows.join(", "))}" placeholder="07:30, 10:05, 13:00" aria-describedby="potWinH" /></label>
    <p class="soft small" id="potWinH">From your baseline: about 10 minutes before usual pee times, after waking, and 15–30 minutes after meals.</p>
    <label>Sit length <select name="sitSec">${[30, 60, 90, 120, 180, 240, 300].map((s) => opt(s, s < 60 ? "30 seconds" : `${s / 60} minute${s > 60 ? "s" : ""}`, p.sitSec)).join("")}</select></label>
    <label>Poo sit length <select name="bowelSitSec">${[180, 300, 420, 600].map((s) => opt(s, `${s / 60} minutes`, p.bowelSitSec)).join("")}</select></label>
    <p class="soft small">Sits always end at 5 minutes (10 for poo), whatever is set.</p>
    <fieldset><legend>Steps ${esc(name())} sees</legend>${C.STEPS.map((s) => `<label class="check"><input type="checkbox" name="step" value="${s.id}" ${p.steps.includes(s.id) ? "checked" : ""} ${s.id === "sit" ? "disabled" : ""}/> ${esc(s.label)}${s.optional ? " (optional)" : ""}</label>`).join("")}</fieldset>
    <fieldset><legend>Rewards</legend>
      <label class="check"><input type="checkbox" name="tokensOn" ${p.tokensOn ? "checked" : ""}/> Use a token board (only if tokens work for ${esc(name())})</label>
      <label>Tokens per reward <select name="tokenRatio">${[1, 2, 3, 5].map((n) => opt(n, String(n), p.tokenRatio)).join("")}</select></label>
      <label class="check"><input type="checkbox" name="tokenForSitting" ${p.tokenForSitting ? "checked" : ""}/> A token for trying, even with no pee</label>
      <label class="check"><input type="checkbox" name="worldOn" ${p.worldOn ? "checked" : ""}/> Show a World that grows on the "All done" screen</label>
      <label>World <select name="world">${Object.entries(C.WORLDS).map(([k, w]) => opt(k, w.label, p.world)).join("")}</select></label>
    </fieldset>
    <fieldset><legend>Look and sound</legend>
      <label>Sit timer <select name="timer">${[["circle", "Filling circle"], ["jar", "Water jar"], ["dots", "Five dots"], ["walk", "A walk home"]].map(([v, l]) => opt(v, l, p.timer)).join("")}</select></label>
      <label>Companion <select name="companion">${[["train", "Train"], ["dino", "Dinosaur"], ["blob", "Blob"], ["blob_nf", "Pebble (no face)"], ["cat", "Cat"], ["off", "None"]].map(([v, l]) => opt(v, l, p.companion)).join("")}</select></label>
      <label>Sound <select name="sound">${[["silent", "Silent (start here)"], ["voice", "Calm voice"], ["soft", "Calm voice and soft chimes"]].map(([v, l]) => opt(v, l, p.sound)).join("")}</select></label>
      <label class="check"><input type="checkbox" name="bodyBoard" ${p.bodyBoard ? "checked" : ""}/> Body check asks "need to go / don't need / not sure"</label>
    </fieldset>
    <fieldset><legend>Limits</legend>
      <label>Most planned sits a day <input type="number" name="maxSitsPerDay" min="1" max="10" value="${p.maxSitsPerDay}" /></label>
      <label>Minutes between sits (at least 20) <input type="number" name="minGapMin" min="20" max="240" value="${p.minGapMin}" /></label>
      <label>Pause after this many days with no poo <input type="number" name="bmPauseDays" min="2" max="7" value="${p.bmPauseDays}" /></label>
    </fieldset>
    <label class="check"><input type="checkbox" name="retired" ${p.retired ? "checked" : ""}/> Graduated: retire Potty Path (the TOILET button stays forever)</label>
    <p class="row gap"><button type="button" class="btn quiet" id="potEasier">Easier board</button></p>`);
  f.onchange = (e) => {
    const el = e.target, k = el.name;
    if (k === "step") return saveProto({ steps: [...f.querySelectorAll("[name=step]:checked")].map((x) => x.value).concat("sit").filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => C.STEPS.findIndex((s) => s.id === a) - C.STEPS.findIndex((s) => s.id === b)) }, "steps");
    if (k === "sitWindows") return saveProto({ sitWindows: el.value.split(/[,\s]+/).map((x) => x.trim()).filter((x) => /^\d{1,2}:\d{2}$/.test(x)).map((x) => x.padStart(5, "0")) });
    const v = el.type === "checkbox" ? el.checked : el.type === "number" || /Sec|Ratio|phase/.test(k) ? +el.value : el.value;
    const clamp = { minGapMin: [20, 240], maxSitsPerDay: [1, 10], bmPauseDays: [2, 7] }[k];
    saveProto({ [k]: clamp ? Math.min(clamp[1], Math.max(clamp[0], v || clamp[0])) : v }, { timer: "timer", companion: "friend", world: "world", tokenRatio: "board" }[k]);
  };
  $("#potEasier").addEventListener("click", () => saveProto({ tokenRatio: 1 }, "board"));
}

// ---------- Getting ready ----------
function renderSetup() {
  const el = $("#potSetup"), pr = store().profile;
  const scr = new Map((pr.screening || []).map((x) => [x.code, x.present]));
  const sens = pr.sensory || {};
  html(el, `<details open><summary><b>1. Medical check</b></summary>
      <p class="soft small">Tick anything that's true now. Any tick pauses planned sits and suggests seeing a doctor. Constipation is very common in autistic children and needs treating first.</p>
      <div id="potScreen">${C.SCREENING.map((x) => `<label class="check"><input type="checkbox" value="${x.code}" ${scr.get(x.code) ? "checked" : ""}/> ${esc(x.label)}${x.urgent ? " <b>(same-day doctor)</b>" : ""}</label>`).join("")}</div></details>
    <details><summary><b>2. What bothers ${esc(name())}?</b></summary>
      <div class="pot-sense" id="potSense">${C.SENSORY.map((x) => `<fieldset><legend>${esc(x.label)}</legend>${["yes", "no", "unsure"].map((v) => `<label class="check"><input type="radio" name="s-${x.code}" value="${v}" ${sens[x.code] === v ? "checked" : ""}/> ${v === "unsure" ? "Not sure" : v === "yes" ? "Yes" : "No"}</label>`).join("")}</fieldset>`).join("")}</div>
      ${C.SENSORY.some((x) => sens[x.code] === "yes") ? `<p><b>Your setup list</b></p><ul>${C.SENSORY.filter((x) => sens[x.code] === "yes").map((x) => `<li>${esc(x.fix)}</li>`).join("")}</ul>` : ""}
      ${pr.sensoryAt && Date.now() - pr.sensoryAt > 28 * C.DAY ? `<p class="pot-flag">It's been 4 weeks. Worth checking this list again.</p>` : ""}</details>
    <details><summary><b>3. How ${esc(name())} already shows "I need to go"</b></summary>
      <div id="potKnown">${Object.entries(C.MODALITIES).map(([k, v]) => `<label class="check"><input type="checkbox" value="${k}" ${(pr.knownSignals || []).includes(k) ? "checked" : ""}/> ${esc(v)}</label>`).join("")}</div>
      <p class="soft small">Every one of these counts as asking. Answer it straight away, and never ask for a "better" way first.</p></details>
    <details><summary><b>4. Rewards that live in the bathroom</b></summary>
      <ul class="pot-rlist" id="potRewards"></ul>
      <form class="form inline-form" id="potAddR"><label>Reward <input name="label" required maxlength="30" placeholder="Bubbles" /></label><label>Photo (optional) <input name="photo" type="file" accept="image/*" /></label><button class="btn quiet">Add</button></form>
      <p class="soft small">Photos of the object only, never of ${esc(name())}. They stay on this device. You give the real reward within a few seconds; the screen only shows the picture.</p></details>
    <details><summary><b>5. Step photos (optional)</b></summary>
      <p class="soft small">A photo of <i>your</i> toilet, tap or towel can help. Objects only; never people.</p>
      <div id="potStepPh">${C.STEPS.map((s) => `<label class="small">${esc(s.label)} <input type="file" accept="image/*" data-step="${s.id}" /> ${pr.stepPhotos?.[s.id] ? `<button type="button" class="link-btn" data-clear="${s.id}">Remove photo</button>` : ""}</label>`).join("")}</div></details>`);
  $("#potScreen").addEventListener("change", (e) => S.update((st) => {
    const l = st.profile.screening.filter((x) => x.code !== e.target.value); l.push({ code: e.target.value, present: e.target.checked, at: Date.now() }); st.profile.screening = l;
  }).then(render));
  $("#potSense").addEventListener("change", (e) => {
    const code = e.target.name.slice(2), v = e.target.value;
    S.update((st) => { st.profile.sensory = { ...st.profile.sensory, [code]: v }; st.profile.sensoryAt = Date.now(); }).then(() => {
      if (code === "flush" && v === "yes" && proto().steps.includes("flush")) { saveProto({ steps: proto().steps.filter((x) => x !== "flush") }); B.toast("Flush is now a grown-up step after they leave."); } else render();
    });
  });
  $("#potKnown").addEventListener("change", () => S.update((st) => { st.profile.knownSignals = [...document.querySelectorAll("#potKnown input:checked")].map((x) => x.value); }));
  const rl = $("#potRewards");
  (pr.reinforcers || []).sort((a, b) => a.rank - b.rank).forEach((r, i, arr) => {
    const li = document.createElement("li"); li.innerHTML = `<span class="pot-rimg"></span><span>${esc(r.label)}</span>`;
    if (r.photoKey) S.getPhoto(r.photoKey).then((b) => { if (b) li.querySelector(".pot-rimg").innerHTML = `<img src="${URL.createObjectURL(b)}" alt="" />`; });
    if (i > 0) li.append(btn("Move up", () => S.update((st) => { const x = st.profile.reinforcers; const a = x.find((y) => y.id === r.id), b2 = x.find((y) => y.id === arr[i - 1].id); [a.rank, b2.rank] = [b2.rank, a.rank]; }).then(render), "link-btn"));
    li.append(btn("Remove", () => S.update((st) => { st.profile.reinforcers = st.profile.reinforcers.filter((y) => y.id !== r.id); }).then(() => { if (r.photoKey) S.delPhoto(r.photoKey); render(); }), "link-btn"));
    rl.append(li);
  });
  if (!(pr.reinforcers || []).length) rl.innerHTML = `<li class="soft">None yet. The first one is shown when the board is full.</li>`;
  $("#potAddR").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, label = f.label.value.trim(); if (!label) return;
    let photoKey = "";
    if (f.photo.files[0]) { photoKey = "r" + C.rid().slice(0, 8); await S.putPhoto(photoKey, await S.squarePhoto(f.photo.files[0])).catch(() => (photoKey = "")); }
    await S.update((st) => { st.profile.reinforcers = [...st.profile.reinforcers, { id: C.rid().slice(0, 12), label, photoKey, rank: st.profile.reinforcers.length }]; });
    render();
  });
  $("#potStepPh").addEventListener("change", async (e) => {
    const step = e.target.dataset.step, file = e.target.files?.[0]; if (!step || !file) return;
    const key = "s-" + step; await S.putPhoto(key, await S.squarePhoto(file));
    await S.update((st) => { st.profile.stepPhotos = { ...(st.profile.stepPhotos || {}), [step]: key }; });
    saveProto({}, "photo");
  });
  $("#potStepPh").addEventListener("click", (e) => { const s = e.target.dataset.clear; if (!s) return; S.update((st) => { const x = { ...(st.profile.stepPhotos || {}) }; delete x[s]; st.profile.stepPhotos = x; }).then(() => S.delPhoto("s-" + s)).then(render); });
}

// ---------- Print and reminders ----------
function printDoc(inner) {
  let box = $(".pot-print"); if (!box) { box = document.createElement("div"); box.className = "pot-print"; document.body.append(box); }
  box.innerHTML = inner; document.body.classList.add("printing-potty");
  const done = () => { document.body.classList.remove("printing-potty"); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done); setTimeout(() => window.print(), 50);
}
function scheduleHTML() {
  const steps = [...C.stepsFor(proto()), C.DONE_STEP];
  const cell = (s, i) => `<div class="cell${s.optional ? " opt" : ""}" role="img" aria-label="Step ${i + 1}: ${esc(s.label)}"><i>${i + 1}</i>${ICON[s.id] || ""}<b>${esc(s.label)}</b></div>`;
  return `<h1>${esc(name())}'s toilet steps</h1><div class="strip">${steps.map(cell).join("")}</div><div class="grid">${steps.map(cell).join("")}</div>`;
}
function handoffHTML() {
  const pr = store().profile, p = proto(), w = C.weekSummary(evs(), p);
  const sens = C.SENSORY.filter((x) => pr.sensory?.[x.code] === "yes");
  return `<h1>${esc(name())}: toilet routine for school and helpers</h1>
    <h2>How ${esc(name())} says "I need to go"</h2><ul>${[...new Set([...(pr.knownSignals || []), ...w.modalities.map(([k]) => k)])].map((k) => `<li>${esc(C.MODALITIES[k] || k)}</li>`).join("") || "<li>Any sign at all. Go straight away.</li>"}</ul>
    <p><b>Answer every one within 3 seconds:</b> "You told me. Toilet." Then go. Never ask for a "better" way first.</p>
    <h2>Sit times</h2><p>${p.sitWindows.join(", ") || "When asked, and after meals"}. Short and calm: ${Math.round(p.sitSec / 60) || 1} minute${p.sitSec > 60 ? "s" : ""}, never more than 5.</p>
    <h2>Reward</h2><p>${esc((pr.reinforcers || []).sort((a, b) => a.rank - b.rank).map((r) => r.label).join(", ") || "Ask the family")}, given within a few seconds.</p>
    ${sens.length ? `<h2>Setup</h2><ul>${sens.map((x) => `<li>${esc(x.fix)}</li>`).join("")}</ul>` : ""}
    <h2>What to say</h2>${["going", "sitting", "void", "wet", "refuse", "distress"].map((k) => `<p><b>${esc(C.SCRIPTS[k].title)}:</b> ${C.SCRIPTS[k].say.map(esc).join(" ")}</p>`).join("")}
    <h2>Please never</h2><ul>${C.NEVER.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
}
function doctorHTML() {
  const L = C.live(evs()), now = Date.now(), bms = L.filter((e) => (e.kind === "void" || e.kind === "wet") && (e.data.type === "bm" || e.data.type === "both") && now - e.t < 14 * C.DAY);
  const w = C.weekSummary(L, proto());
  return `<h1>Toilet summary for ${esc(name())}'s doctor</h1><p>From LuminAAC Potty Path, ${new Date().toLocaleDateString()}. Logged by family; gaps are possible.</p>
    <h2>Why we paused</h2><ul>${pause.reasons.map((r) => `<li>${esc(r.label)}</li>`).join("") || "<li>Nothing flagged</li>"}</ul>
    <h2>Poos, last 14 days</h2><ul>${bms.map((e) => `<li>${new Date(e.t).toLocaleString()} · ${e.kind === "void" ? "toilet" : "pants/nappy"}${e.data.stool ? ` · Bristol type ${e.data.stool}` : ""}</li>`).join("") || "<li>None logged</li>"}</ul>
    <h2>Last 7 days</h2><p>${w.toiletVoids} in the toilet, ${w.wets} missed, ${w.signals} times asked, ${w.distress} hard moments.</p>`;
}
function renderPrint() {
  html($("#potPrint"), `<p class="row gap" style="flex-wrap:wrap"></p><p class="soft small">On iPhone and iPad, web apps can't wake you with alarms. The calendar file adds a daily reminder at each sit time instead, with no server and no names in the reminder text beyond your child's first name.</p>`);
  const row = $("#potPrint p");
  row.append(btn("Print the wall schedule", () => printDoc(scheduleHTML())), btn("Print a school handoff sheet", () => printDoc(handoffHTML())), btn("Print a doctor summary", () => printDoc(doctorHTML())),
    btn("Download calendar reminders", () => { const p = proto(); if (!p.sitWindows.length) return B.toast("Add sit times in The plan first."); const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([C.ics(p, db().profile.child)], { type: "text/calendar" })), download: "toilet-reminders.ics" }); a.click(); }));
}

// ---------- Two devices ----------
let qr = null, scanStream = null;
function renderDevices() {
  const st = store(), d = db(), server = !!(d.sync?.url && d.sync?.key);
  html($("#potDevices"), `<p class="soft small">Toilet data stays on each device. To share it between a bathroom tablet and your phone, either pass it across with QR codes (no internet needed) or send it through your LuminAAC server.</p>
    <p class="row gap" style="flex-wrap:wrap" id="potQrBtns"></p><div class="pot-qr" id="potQr"></div><video id="potScanV" playsinline muted hidden style="width:min(320px,80vw)"></video><p class="soft small" id="potQrMsg" role="status"></p>
    <hr /><label class="check"><input type="checkbox" id="potSyncOn" ${st.sync.on ? "checked" : ""} ${server ? "" : "disabled"}/> Send the toilet log to our server${server ? "" : " (set up the server in Privacy first)"}</label>
    <label class="check"><input type="checkbox" id="potE2E" ${st.sync.e2e ? "checked" : ""} ${server ? "" : "disabled"}/> Lock it so the server can't read it (recommended)</label>
    ${st.sync.e2e && st.sync.k ? `<details><summary>Lock key for your other devices</summary><p class="soft small">Show this on the other device's Potty Path tab with "Scan a code", or copy it across. Anyone with this key can read the log.</p><div class="pot-qr" id="potKeyQr"></div><input readonly value="${esc(st.sync.k)}" aria-label="Lock key" /></details>` : ""}
    <label>Paste a lock key from another device <input id="potKeyIn" autocomplete="off" /></label>
    <p class="soft small">${st.sync.on ? `Last sent ${st.sync.last ? fmtT(st.sync.last) : "never"} · ${st.sync.outbox.length} waiting${st.sync.error ? ` · ${esc(st.sync.error)}` : ""}` : "Off. Nothing about toileting leaves this device."}</p>`);
  const qb = $("#potQrBtns");
  qb.append(btn("Show my log as QR codes", showQr), btn("Scan a code", scanQr));
  if (st.sync.on) qb.append(btn("Sync now", () => S.flush().then((r) => { B.toast(r.error ? `Couldn't sync: ${r.error}` : `Sent ${r.sent || 0}, got ${r.received || 0}`); render(); })));
  $("#potSyncOn").addEventListener("change", (e) => S.setSync(e.target.checked, $("#potE2E").checked, $("#potE2E").checked && !store().sync.k ? S.newKey() : undefined).then(render));
  $("#potE2E").addEventListener("change", (e) => S.setSync($("#potSyncOn").checked, e.target.checked, e.target.checked ? store().sync.k || S.newKey() : store().sync.k).then(render));
  $("#potKeyIn").addEventListener("change", (e) => { const k = e.target.value.trim(); if (/^[A-Za-z0-9_-]{40,}$/.test(k)) S.setSync(store().sync.on, true, k).then(() => { B.toast("Lock key saved."); render(); }); else B.toast("That doesn't look like a lock key."); });
  const kq = $("#potKeyQr"); if (kq && window.qrcode) { const q = window.qrcode(0, "M"); q.addData("LPK|" + st.sync.k); q.make(); kq.innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }
}
async function showQr() {
  const recent = C.live(evs()).filter((e) => Date.now() - e.t < 14 * C.DAY);
  const all = evs().filter((e) => Date.now() - e.t < 14 * C.DAY || e.kind === "retract");
  if (!recent.length) return B.toast("Nothing logged in the last 14 days.");
  qr = { parts: await S.qrParts(all), i: 0 }; drawQr();
}
function drawQr() {
  const box = $("#potQr"); if (!qr || !window.qrcode) return;
  const q = window.qrcode(0, "L"); q.addData(qr.parts[qr.i]); q.make();
  box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  $("#potQrMsg").textContent = `Code ${qr.i + 1} of ${qr.parts.length}. Scan it on the other device.`;
  if (qr.parts.length > 1) box.append(btn(qr.i < qr.parts.length - 1 ? "Next code" : "Start again", () => { qr.i = (qr.i + 1) % qr.parts.length; drawQr(); }));
}
async function scanQr() {
  const v = $("#potScanV"), msg = $("#potQrMsg");
  if (!window.jsQR || !navigator.mediaDevices?.getUserMedia) { msg.textContent = "This browser can't scan here."; return; }
  if (window.__pottyBusy?.()) { msg.textContent = "Finish the toilet try first. The camera stays off during Potty Path."; return; }
  try { scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); } catch { msg.textContent = "The camera isn't available."; return; }
  v.srcObject = scanStream; v.hidden = false; await v.play();
  const c = document.createElement("canvas"), x = c.getContext("2d", { willReadFrequently: true }), seen = new Set();
  let added = 0;
  const stop = () => { scanStream?.getTracks().forEach((t) => t.stop()); scanStream = null; v.hidden = true; };
  const tick = async () => {
    if (!scanStream) return;
    if (v.videoWidth) {
      c.width = v.videoWidth; c.height = v.videoHeight; x.drawImage(v, 0, 0);
      const r = window.jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (r?.data?.startsWith("LPK|")) { stop(); await S.setSync(store().sync.on, true, r.data.slice(4)); msg.textContent = "Lock key saved."; render(); return; }
      if (r?.data && !seen.has(r.data)) {
        const part = await S.readQrPart(r.data);
        if (part) {
          seen.add(r.data); const before = evs().length; await S.update(() => part.events); added += evs().length - before;
          msg.textContent = `Got code ${part.part} of ${part.total} (${added} new). ${seen.size >= part.total ? "All done." : "Show the next code."}`;
          if (seen.size >= part.total) { stop(); render(); return; }
        }
      }
    }
    requestAnimationFrame(tick);
  };
  tick(); setTimeout(stop, 120e3);
}

// ---------- Data ----------
function renderData() {
  const st = store();
  html($("#potData"), `<label>Keep toilet logs for <select id="potKeep">${[28, 60, 90, 180, 365].map((d) => `<option value="${d}" ${d === st.retainDays ? "selected" : ""}>${d} days</option>`).join("")}</select></label>
    <p class="soft small">${C.live(st.events).length} entries on this device. Toilet data is never in share links, backups of the Bridge, or learning that leaves the device.</p><p class="row gap" style="flex-wrap:wrap" id="potDataBtns"></p>`);
  $("#potKeep").addEventListener("change", (e) => S.update((s) => { s.retainDays = +e.target.value; }).then(render));
  const row = $("#potDataBtns");
  row.append(btn("Download toilet data", () => B.download(`luminaac-potty-${B.dayKey(Date.now())}.json`, S.exportData())));
  const imp = Object.assign(document.createElement("label"), { className: "btn quiet file", innerHTML: `Load a toilet data file <input type="file" accept="application/json" />` });
  imp.querySelector("input").addEventListener("change", async (e) => { try { await S.importData(JSON.parse(await e.target.files[0].text())); B.toast("Loaded."); render(); } catch { B.toast("That isn't a Potty Path file."); } });
  row.append(imp, btn("Delete all toilet data", async () => {
    if (!confirm(`Delete every toilet log, photo and setting for ${name()} on this device${store().sync.on ? " and the server" : ""}? This can't be undone.`)) return;
    await S.deleteAll(db()); db().access.potty = false; B.save("Deleted toilet data"); B.toast("Deleted."); render();
  }, "btn danger quiet"));
}

// ---------- When it's hard ----------
const TROUBLE = [
  ["Holding poo in", "Pause sits and talk to your doctor: withholding usually means it hurts. Treat constipation first; then poo sits after meals, feet flat, with a favourite thing. Never push."],
  ["Constipation", "It's very common and it blocks everything else. Your doctor may suggest a stool softener; follow their plan. Potty Path pauses itself after 3 days without a poo."],
  ["Going backwards", "Illness, pain, new medicine, a move, a new school or teacher can all do it. It's information, not failure. Check with your doctor, go back a phase, and keep answering every ask."],
  ["Only poos in a nappy", "Small steps, each only while calm: nappy in the bathroom → nappy while sitting on the toilet → nappy with a hole cut in it → no nappy."],
  ["Scared of the flush", "Take Flush out of the steps (The plan). A grown-up flushes after they've left. Cover auto-flush sensors with a sticky note."],
  ["Needs everything exactly the same", "Change at most one small thing a week, show it as new at the door, and practise the change somewhere else first."],
  ["School or other bathrooms", "Print the school handoff sheet. Use the same TOILET symbol everywhere, a travel seat and step, and headphones for loud bathrooms."],
  ["It's all too much (for you)", "Logging can be just 'asked' and 'in toilet'. Gaps are fine. Pause the plan for a week if you need to; the TOILET button keeps working."],
];
function renderHelp() {
  html($("#potHelp"), `${TROUBLE.map(([t, b]) => `<details><summary>${esc(t)}</summary><p>${esc(b)}</p></details>`).join("")}
    <h3>Please never</h3><ul>${C.NEVER.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <p class="soft small">Supported toileting, or using pads for life, is a fine outcome too. The goal is comfort and a way to ask.</p>`);
}

// ---------- Render + live updates ----------
function render() {
  if ($("#tab-potty").hidden) return;
  renderOn(); renderFlags(); renderLive(); renderCoach(); renderToday(); renderHints(); renderWeek(); renderPlan(); renderSetup(); renderPrint(); renderDevices(); renderData(); renderHelp();
  const consent = !!store().profile.consentAt;
  ["#potLive", "#potCoach", "#potTimeline", "#potHints", "#potWeek", "#potPlan", "#potSetup", "#potPrint", "#potDevices", "#potData"].forEach((s) => ($(s).closest(".card").hidden = !consent));
}
let liveTimer = 0;
window.addEventListener("bridge:show", (e) => { clearInterval(liveTimer); if (e.detail === "potty") { render(); liveTimer = setInterval(() => { if (!document.querySelector("#tab-potty:not([hidden]) :focus")) { renderLive(); } }, 5000); } });
window.addEventListener("bridge:reload", render);
window.addEventListener("potty:remote", () => S.flush().then(render));
// A child's ask or a full board buzzes this phone (and toasts), wherever the Bridge is open.
let seenAsk = Date.now(), wasFull = C.ledger(evs(), proto()).full;
S.onChange(() => {
  const all = evs(), ask = all.filter((e) => e.kind === "signal" && e.by === "child" && e.t > seenAsk);
  if (ask.length) { seenAsk = Math.max(...ask.map((e) => e.t)); navigator.vibrate?.([200, 100, 200]); B.toast(`${name()} asked for the toilet. Go now.`); }
  const L = C.ledger(all, proto());
  if (L.full && !wasFull) { const r = [...(store().profile.reinforcers || [])].sort((a, b) => a.rank - b.rank)[0]; navigator.vibrate?.(300); B.toast(`Board full: give ${r ? r.label : "the reward"} now.`); }
  wasFull = L.full;
  render();
});
// Recording and the camera stay off while a toilet try is running on this device.
window.__pottyBusy = () => !!C.activeSession(evs(), proto());
if (location.hash === "#potty") render();
