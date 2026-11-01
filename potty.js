// My Voice: Potty Path, the child's side. A calm, predictable toilet routine with
// a companion, a silent sit timer, a body check, add-only tokens and a World that
// only grows. Off until a caregiver turns it on (Bridge → Potty, or access.potty).
// The TOILET button is the child's voice: it always speaks and always works, even
// when the plan is paused or retired. See docs/POTTY-PATH.md.
import { load, speak, raiseAlert } from "./shared.js";
import * as C from "./potty-core.js";
import * as S from "./potty-store.js";
import { ICON, COMPANIONS, littlePotty } from "./potty-icons.js";

const mv = document.querySelector(".mv");
const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enabled = () => !!load().access?.potty || localStorage.getItem("luminaac:potty-dev") === "1";
const proto = () => C.protocolOf(load().potty?.protocol);
const still = () => { try { return JSON.parse(localStorage.getItem("luminaac:settings") || "{}").stillness || matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const childName = () => load().profile?.child || "";

S.useServer(() => load());

// ---------- Entry row on the Talk view ----------
const host = document.createElement("div");
host.innerHTML = `
  <div class="pp-entry" id="ppEntry" hidden>
    <button type="button" class="pp-toilet" id="ppToilet"><span class="pp-ico" aria-hidden="true">${ICON.toilet}</span><span>I need the toilet</span></button>
    <button type="button" class="pp-world-btn" id="ppWorldBtn" hidden><span aria-hidden="true" id="ppWorldE">🚂</span> <span id="ppWorldL">My train</span></button>
    <button type="button" class="pp-hold" id="ppStartHold" aria-label="Grown-up: press and hold to start a toilet try">Grown-up: hold to start a try</button>
  </div>
  <dialog class="pp" id="pp" aria-labelledby="ppTitle">
    <h2 id="ppTitle" class="pp-sr">Potty Path</h2>
    <div class="pp-top"><ol class="pp-path" id="ppPath" aria-hidden="true"></ol><span class="pp-new" id="ppNew" hidden></span></div>
    <div class="pp-stage" id="ppStage" aria-live="polite"></div>
    <div class="pp-bottom">
      <div class="pp-comp" id="ppComp"></div>
      <div class="pp-tokens" id="ppTokens" aria-label="Tokens"></div>
    </div>
    <div class="pp-always" role="group" aria-label="Always here">
      <button type="button" class="pp-abtn" id="ppBreak">${ICON.break}<span>Break</span></button>
      <button type="button" class="pp-abtn" id="ppHelp">${ICON.help}<span>Help</span></button>
      <button type="button" class="pp-abtn" id="ppStop">${ICON.stop}<span>Stop</span></button>
    </div>
    <div class="pp-grown" id="ppGrown">
      <button type="button" class="pp-hold" id="ppGrownHold" aria-label="Grown-up: press and hold to log">Grown-up (hold)</button>
      <div class="pp-gbar" id="ppGBar" hidden></div>
    </div>
  </dialog>
  <dialog class="pp-book" id="ppBook" aria-labelledby="ppBookT">
    <h2 id="ppBookT">My World</h2>
    <div class="pp-bookpage" id="ppBookPage"></div>
    <div class="pp-bookrow"><button type="button" class="mv-pbtn quiet" id="ppBookPrev">Back</button><span id="ppBookN" class="pp-booknum"></span><button type="button" class="mv-pbtn quiet" id="ppBookNext">Next</button></div>
    <button type="button" class="mv-close" id="ppBookClose">Close</button>
  </dialog>`;
const safety = $("mvSafety");
(safety || mv.firstElementChild).after(host.firstElementChild);
mv.append(...host.children);

// ---------- Sound: one cue per event, always the same ----------
let actx;
function chime(kind) {
  const p = proto(); if (p.sound !== "soft") return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === "celebrate" ? [523.25, 659.25, 783.99] : [523.25, 659.25];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.16;
      o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.4);
    });
  } catch {}
}
function line(text) { if (proto().sound !== "silent") speak(text, 0.85); }

// ---------- State ----------
let cur = null, lastVoidSeen = Date.now(), renderTimer = 0, dismissed = new Set(), lastUndo = null;
const greeted = new Set();
const events = () => S.read().events;
const session = () => C.activeSession(events(), proto());
const rec = (kind, data = {}, by = "child", sid = cur?.id) => S.record(kind, data, { by, sessionId: sid });

function startSession({ prompted, by, signal, bowel = false, cleanup = false }) {
  const sid = C.rid();
  S.record("session_start", { prompted, bowel, cleanup }, { by, sessionId: sid });
  if (signal) {
    S.record("signal", { modality: signal }, { by: by === "child" ? "child" : "caregiver", sessionId: sid });
    award(C.tokensFor("signal", {}, proto()), "signal", sid);
  }
  dismissed.delete(sid);
  open();
  return sid;
}
function award(n, why, sid) { if (n > 0) S.record("token_award", { n, why }, { by: "system", sessionId: sid }); }

// ---------- The TOILET button (the child's voice) ----------
$("ppToilet").addEventListener("click", () => {
  speak("I need the toilet");
  const s = session();
  if (s) { rec("signal", { modality: "aac_button" }, "child", s.id); award(C.tokensFor("signal", {}, proto()), "signal", s.id); open(); }
  else startSession({ prompted: false, by: "child", signal: "aac_button" });
  raiseAlert("potty", `${childName() || "Your child"} needs the toilet`);
});
// A TOILET or BATHROOM word tapped on the main board also counts as asking.
document.getElementById("view-talk")?.addEventListener("click", (e) => {
  if (!enabled()) return;
  const t = e.target.closest(".grid .tile, .next-row .tile");
  const w = (t?.dataset.w || t?.textContent || "").trim().toLowerCase();
  if (t && /^(toilet|bathroom|potty|pee|poo|wee)$/.test(w)) S.record("signal", { modality: "aac_button", word: w }, { by: "child", sessionId: session()?.id });
});

// ---------- Press-and-hold helper (keeps grown-up controls away from accidental taps) ----------
function hold(btn, ms, fn) {
  let t0 = 0, raf = 0;
  const step = () => { const p = Math.min(1, (performance.now() - t0) / ms); btn.style.setProperty("--hold", p); if (p >= 1) { cancel(); fn(); } else raf = requestAnimationFrame(step); };
  const start = (e) => { e.preventDefault(); t0 = performance.now(); btn.classList.add("holding"); raf = requestAnimationFrame(step); };
  const cancel = () => { cancelAnimationFrame(raf); btn.classList.remove("holding"); btn.style.setProperty("--hold", 0); };
  btn.addEventListener("pointerdown", start); ["pointerup", "pointerleave", "pointercancel"].forEach((k) => btn.addEventListener(k, cancel));
  btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { if (!e.repeat) start(e); } });
  btn.addEventListener("keyup", cancel);
}
hold($("ppStartHold"), 900, () => startSession({ prompted: true, by: "caregiver" }));
let gbarTimer = 0;
hold($("ppGrownHold"), 900, () => { $("ppGBar").hidden = false; $("ppGrownHold").hidden = true; renderGrown(); clearTimeout(gbarTimer); gbarTimer = setTimeout(hideGrown, 90e3); });
function hideGrown() { $("ppGBar").hidden = true; $("ppGrownHold").hidden = false; }

// ---------- Dialog ----------
const dlg = $("pp");
function open() {
  if (!dlg.open) { dlg.showModal(); document.documentElement.dataset.potty = "open"; }
  render();
}
dlg.addEventListener("close", () => { delete document.documentElement.dataset.potty; clearInterval(renderTimer); if (cur) dismissed.add(cur.id); hideGrown(); });
dlg.addEventListener("cancel", (e) => { e.preventDefault(); stop(); }); // Escape = the Stop button

$("ppBreak").addEventListener("click", () => { if (!cur) return; if (cur.state === "coregulate") rec("resume"); else rec("pause", { why: "child break" }); render(); });
$("ppHelp").addEventListener("click", () => { speak("I need help"); raiseAlert("help", "I need help (toilet)"); flash("Told your grown-ups"); });
$("ppStop").addEventListener("click", stop);
function stop() {
  if (!cur || cur.state === "ended") { dlg.close(); renderEntry(); return; }
  if (cur.state === "sitting" || cur.state === "body_check") { rec("sit_end", { by: "stop" }); settleSit(); }
  else if (cur.state === "approach" && !cur.sits) { rec("refuse", {}); line("Okay. Later."); }
  else rec("session_end", { early: true });
  render();
}
function flash(text) { const t = $("toast"); if (!t) return; t.textContent = text; t.hidden = false; setTimeout(() => (t.hidden = true), 3000); }
// When a sit finishes with no pee, trying still earns its token (if the caregiver wants that).
function settleSit() {
  const s = C.foldSession(events().filter((e) => e.sessionId === cur?.id).sort(C.order), proto());
  if (!s.voids.length && !events().some((e) => e.sessionId === s.id && e.kind === "token_award" && e.data.why === "sit")) award(C.tokensFor("sit_done", {}, proto()), "sit", s.id);
}

// ---------- Render ----------
function render() {
  const p = proto(), all = events();
  const live = C.activeSession(all, p);
  if (live) cur = live;
  else if (cur) cur = C.sessions(all, p).find((x) => x.id === cur.id) || null;
  clearInterval(renderTimer);
  if (!dlg.open || !cur) return;
  dlg.classList.toggle("is-sit", cur.state === "sitting" || cur.state === "body_check" || cur.state === "coregulate");
  dlg.classList.toggle("is-still", !!still());
  renderPath(p); renderTokens(p);
  const stage = $("ppStage"); stage.textContent = "";
  $("ppBreak").querySelector("span").textContent = cur.state === "coregulate" ? "Back" : "Break";
  $("ppBreak").hidden = cur.state === "ended";
  const v = cur.voids.at(-1);
  const justVoided = v && Date.now() - v.t < 8000;
  if (v && v.t > lastVoidSeen) { lastVoidSeen = v.t; chime("celebrate"); line(v.type === "bm" ? "Poo in the toilet!" : "Pee in the toilet!"); }
  switch (cur.state) {
    case "sitting": sitView(stage, p); break;
    case "body_check": bodyCheck(stage, p); break;
    case "coregulate": breakView(stage); break;
    case "ended": doneView(stage, p); break;
    default: stepsView(stage, p, justVoided);
  }
  companion(cur.state === "ended" ? (cur.refused ? "wave" : "proud") : cur.state === "coregulate" ? "sleepy" : justVoided ? "proud" : cur.state === "body_check" ? "wait" : cur.steps.length === 0 ? "wave" : "content");
  if (!$("ppGBar").hidden) renderGrown();
  if (["sitting", "body_check", "coregulate", "celebrate"].includes(cur.state) || justVoided) renderTimer = setInterval(render, still() ? 30e3 : 1000);
}
function renderPath(p) {
  const { list, i } = C.currentStep(cur, p);
  $("ppPath").innerHTML = list.map((s, k) => `<li class="${k < i ? "done" : k === i ? "now" : ""}${s.optional ? " opt" : ""}"></li>`).join("") + `<li class="end${i >= list.length ? " now" : ""}"></li>`;
  const ch = p.changed && Date.now() - p.changed.at < 3 * C.DAY ? p.changed.what : "";
  $("ppNew").hidden = !ch; $("ppNew").textContent = ch ? `✦ New: ${ch}` : "";
}
function renderTokens(p) {
  const box = $("ppTokens");
  if (!p.tokensOn) { box.hidden = true; return; }
  const L = C.ledger(events(), p); box.hidden = false;
  const slots = Array.from({ length: L.ratio }, (_, k) => `<span class="pp-tok${k < Math.min(L.onBoard, L.ratio) ? " on" : ""}" aria-hidden="true"></span>`).join("");
  box.innerHTML = slots; box.setAttribute("aria-label", `${Math.min(L.onBoard, L.ratio)} of ${L.ratio} tokens`);
}
function companion(mood) {
  const p = proto(), box = $("ppComp");
  const skin = COMPANIONS[p.companion];
  box.hidden = !skin;
  if (!skin) return;
  box.className = `pp-comp mood-${mood}`;
  box.innerHTML = skin.draw(mood) + (dlg.classList.contains("is-sit") ? littlePotty : "");
}
function tile(step, now, photo) {
  const b = document.createElement(now ? "button" : "div");
  if (now) b.type = "button";
  b.className = `pp-tile ${now ? "is-now" : "is-next"}`;
  b.innerHTML = `<span class="pp-tico" aria-hidden="true">${ICON[step.id] || esc(step.e)}</span><span class="pp-tlabel">${esc(step.label)}</span>`;
  b.setAttribute("aria-label", `${step.label}, ${now ? "now" : "next"}`);
  if (photo) S.getPhoto(photo).then((blob) => { if (!blob) return; const u = URL.createObjectURL(blob); b.querySelector(".pp-tico").innerHTML = `<img src="${u}" alt="" />`; }).catch(() => {});
  return b;
}
function stepPhoto(id) { return S.read().profile.stepPhotos?.[id] || ""; }
function stepsView(stage, p, justVoided) {
  const { list, i } = C.currentStep(cur, p);
  if (justVoided) stage.insertAdjacentHTML("beforeend", `<p class="pp-cheer">${cur.voids.at(-1).type === "bm" ? "Poo in the toilet!" : "Pee in the toilet!"}</p>`);
  if (cur.state === "cleanup" && !cur.steps.length) stage.insertAdjacentHTML("beforeend", `<p class="pp-soft">Let's get clean.</p>`);
  const row = document.createElement("div"); row.className = "pp-nownext";
  if (i >= list.length) {
    const d = tile(C.DONE_STEP, true); d.addEventListener("click", () => { rec("step", { step: "done" }); chime("step"); render(); });
    row.append(d); stage.append(row); return;
  }
  const step = list[i], next = list[i + 1] || C.DONE_STEP;
  const nowT = tile(step, true, stepPhoto(step.id));
  if (step.id === "sit" && p.phase <= 2) nowT.querySelector(".pp-tlabel").textContent = "Sit (clothes on is fine)";
  nowT.addEventListener("click", () => { rec("step", { step: step.id }); chime("step"); line(step.say); render(); });
  row.append(nowT, Object.assign(document.createElement("span"), { className: "pp-arrow", ariaHidden: "true", textContent: "→" }), tile(next, false, stepPhoto(next.id)));
  stage.append(row);
  if (!cur.steps.length && cur.state === "approach" && !greeted.has(cur.id)) { greeted.add(cur.id); line(cur.initiated ? "You told me! Let's go." : step.say); }
}
function sitView(stage, p) {
  const total = Math.min(cur.sitTarget, cur.sitCap), f = Math.max(0, Math.min(1, cur.sitElapsed / total));
  const shown = still() ? Math.floor(f * 8) / 8 : f; // "keep the screen still": 8 calm steps
  const kind = p.timer;
  const w = document.createElement("div"); w.className = `pp-timer t-${kind}`; w.setAttribute("role", "timer"); w.setAttribute("aria-live", "off");
  w.setAttribute("aria-label", "Sitting. The timer is filling.");
  if (kind === "jar") w.innerHTML = `<div class="pp-jar"><i style="height:${shown * 100}%"></i></div>`;
  else if (kind === "dots") w.innerHTML = `<div class="pp-dots">${[0, 1, 2, 3, 4].map((k) => `<b class="${shown >= (k + 1) / 5 ? "on" : ""}"></b>`).join("")}</div>`;
  else if (kind === "walk") w.innerHTML = `<div class="pp-walk"><span class="pp-walker" style="left:${shown * 82}%"></span><span class="pp-house" aria-hidden="true">🏠</span></div>`;
  else w.innerHTML = `<div class="pp-ring" style="--f:${shown}"><span class="pp-ringtick" ${f >= 1 ? "" : "hidden"}>${ICON.done}</span></div>`;
  stage.append(w);
  stage.insertAdjacentHTML("beforeend", `<p class="pp-soft">${cur.bowel ? "Feet flat on the stool. " : ""}Sitting.</p>`);
}
function bodyCheck(stage, p) {
  if (!cur.bodyCheck) { rec("body_check", {}, "system"); line("Check your body. Anything coming?"); }
  stage.insertAdjacentHTML("beforeend", `<div class="pp-body"><span class="pp-bico" aria-hidden="true">${ICON.body}</span><p>Check your body… anything coming?</p></div>`);
  const row = document.createElement("div"); row.className = "pp-choices";
  const mk = (ico, label, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "pp-tile is-now pp-choice"; b.innerHTML = `<span class="pp-tico" aria-hidden="true">${ico}</span><span class="pp-tlabel">${label}</span>`; b.addEventListener("click", fn); return b; };
  if (p.phase >= 5 || p.bodyBoard) {
    for (const [k, l] of [["need", "Need to go"], ["no", "Don't need"], ["unsure", "Not sure"]]) row.append(mk(ICON.body, l, () => { rec("body_answer", { answer: k }); if (k === "need") rec("more_time"); else { rec("sit_end", {}); settleSit(); } render(); }));
  } else {
    row.append(mk(ICON.stop, "All done", () => { rec("sit_end", {}); settleSit(); line("All done trying."); render(); }));
    if (cur.sitElapsed < cur.sitCap - 15) row.append(mk(ICON.more, "More time", () => { rec("more_time"); render(); }));
  }
  stage.append(row);
}
function breakView(stage) {
  stage.insertAdjacentHTML("beforeend", `<div class="pp-breakv"><p class="pp-big">Break</p><p class="pp-soft">Breathe with me.</p></div>`);
  const row = document.createElement("div"); row.className = "pp-choices";
  const back = document.createElement("button"); back.type = "button"; back.className = "pp-tile is-now pp-choice"; back.innerHTML = `<span class="pp-tico" aria-hidden="true">${ICON.sit}</span><span class="pp-tlabel">Back to it</span>`;
  back.addEventListener("click", () => { rec("resume"); render(); });
  const done = document.createElement("button"); done.type = "button"; done.className = "pp-tile is-now pp-choice"; done.innerHTML = `<span class="pp-tico" aria-hidden="true">${ICON.stop}</span><span class="pp-tlabel">All done</span>`;
  done.addEventListener("click", () => { rec("abort", {}); render(); });
  row.append(back, done); stage.append(row);
}
let worldShownFor = "";
function doneView(stage, p) {
  const L = C.ledger(events(), p);
  stage.insertAdjacentHTML("beforeend", `<p class="pp-big">${cur.refused ? "See you later." : cur.outcome === "wet" ? "All clean." : cur.outcome === "void" ? "All done. You did it!" : "All done trying."}</p>`);
  if (p.worldOn && !cur.refused) {
    const pieces = C.worldPieces(events(), p), W = C.WORLDS[p.world] || C.WORLDS.train;
    const page = pieces.slice(Math.floor(Math.max(0, pieces.length - 1) / C.PAGE) * C.PAGE);
    const fresh = worldShownFor !== cur.id; worldShownFor = cur.id;
    stage.insertAdjacentHTML("beforeend", `<div class="pp-world${fresh && !still() ? " grow" : ""}" aria-label="Your ${esc(W.label.toLowerCase())} grew">${W.head}${page.map((x, k) => `<span class="pp-piece ${x}${k === page.length - 1 ? " new" : ""}">${W.pieces[x]}</span>`).join("")}<span class="pp-piece ghost" aria-hidden="true">◌</span></div>`);
  }
  if (L.full) {
    const r = [...(S.read().profile.reinforcers || [])].sort((a, b) => a.rank - b.rank)[0];
    const box = document.createElement("div"); box.className = "pp-reward";
    box.innerHTML = `<span class="pp-rpic" aria-hidden="true">${r?.photoKey ? "" : "🎁"}</span><p>${r ? esc(r.label) + " time!" : "Reward time!"}</p>`;
    if (r?.photoKey) S.getPhoto(r.photoKey).then((b) => { if (b) box.querySelector(".pp-rpic").innerHTML = `<img src="${URL.createObjectURL(b)}" alt="" />`; });
    const given = document.createElement("button"); given.type = "button"; given.className = "mv-pbtn"; given.textContent = "Grown-up: given ✓";
    given.addEventListener("click", () => { S.record("token_redeem", { ratio: L.ratio }, { by: "caregiver", sessionId: cur.id }); render(); });
    box.append(given); stage.append(box);
  }
  const close = document.createElement("button"); close.type = "button"; close.className = "pp-tile is-now pp-closebtn"; close.innerHTML = `<span class="pp-tico" aria-hidden="true">${ICON.done}</span><span class="pp-tlabel">Close</span>`;
  close.addEventListener("click", () => { dlg.close(); renderEntry(); });
  stage.append(close);
}

// ---------- Grown-up bar (same-device logging) ----------
function renderGrown() {
  const bar = $("ppGBar"); if (!cur) return;
  const left = cur.state === "sitting" ? Math.max(0, Math.round(Math.min(cur.sitTarget, cur.sitCap) - cur.sitElapsed)) : null;
  bar.innerHTML = `<p class="pp-gstatus">${esc(cur.state.replace("_", " "))}${left != null ? ` · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left` : ""}</p>`;
  const b = (label, fn, cls = "") => { const x = document.createElement("button"); x.type = "button"; x.className = "pp-gbtn " + cls; x.textContent = label; x.addEventListener("click", () => { fn(); render(); }); bar.append(x); };
  const logged = (e) => { lastUndo = { id: e.id, at: Date.now() }; };
  if (cur.state === "ended") { b("Hide", hideGrown, "quiet"); return; }
  b("Pee", () => { logged(rec("void", { type: "urine", where: "toilet" }, "caregiver")); award(C.tokensFor("void", {}, proto()), "void", cur.id); });
  b("Poo", () => { logged(rec("void", { type: "bm", where: "toilet" }, "caregiver")); award(C.tokensFor("void", {}, proto()), "void", cur.id); });
  b("Wet / missed", () => logged(rec("wet", { type: "urine" }, "caregiver")));
  b("Asked ★", () => { logged(rec("signal", { modality: "other" }, "caregiver")); award(C.tokensFor("signal", {}, proto()), "signal", cur.id); });
  b("Step ✓", () => { const { list, i } = C.currentStep(cur, proto()); if (cur.state === "sitting" || cur.state === "body_check") { rec("sit_end", {}, "caregiver"); settleSit(); } else logged(rec("step", { step: list[i]?.id || "done" }, "caregiver")); });
  b(cur.state === "coregulate" ? "Resume" : "Pause (distress)", () => logged(rec(cur.state === "coregulate" ? "resume" : "distress", {}, "caregiver")));
  b("End: hard moment", () => logged(rec("abort", { escalation: true }, "caregiver")), "quiet");
  if (lastUndo && Date.now() - lastUndo.at < 5000) b("Undo", () => { S.record("retract", { targetId: lastUndo.id }, { by: "caregiver" }); lastUndo = null; }, "quiet");
  b("Hide", hideGrown, "quiet");
}

// ---------- World book (browse any time, outside the bathroom) ----------
let bookPage = 0;
function renderBook() {
  const p = proto(), W = C.WORLDS[p.world] || C.WORLDS.train, pieces = C.worldPieces(events(), p);
  const pages = Math.max(1, Math.ceil(pieces.length / C.PAGE));
  bookPage = Math.max(0, Math.min(bookPage, pages - 1));
  const page = pieces.slice(bookPage * C.PAGE, (bookPage + 1) * C.PAGE);
  $("ppBookT").textContent = `My ${W.label.toLowerCase()}`;
  $("ppBookPage").innerHTML = `<div class="pp-world">${W.head}${page.map((x) => `<span class="pp-piece ${x}">${W.pieces[x]}</span>`).join("")}${page.length < C.PAGE ? '<span class="pp-piece ghost" aria-hidden="true">◌</span>' : ""}</div>`;
  $("ppBookN").textContent = `Page ${bookPage + 1} of ${pages}`;
  $("ppBookPrev").disabled = bookPage === 0; $("ppBookNext").disabled = bookPage >= pages - 1;
}
$("ppWorldBtn").addEventListener("click", () => { bookPage = 1e9; renderBook(); $("ppBook").showModal(); });
$("ppBookPrev").addEventListener("click", () => { bookPage--; renderBook(); });
$("ppBookNext").addEventListener("click", () => { bookPage++; renderBook(); });
$("ppBookClose").addEventListener("click", () => $("ppBook").close());

// ---------- Entry row + auto-open when a grown-up starts a try from the Bridge ----------
function renderEntry() {
  const on = enabled(), p = proto();
  $("ppEntry").hidden = !on;
  if (!on) { if (dlg.open) dlg.close(); return; }
  const pieces = p.worldOn ? C.worldPieces(events(), p).length : 0, W = C.WORLDS[p.world] || C.WORLDS.train;
  $("ppWorldBtn").hidden = !pieces; $("ppWorldE").textContent = W.head; $("ppWorldL").textContent = `My ${W.label.toLowerCase()}`;
  $("ppStartHold").hidden = !!p.retired;
  const live = session();
  if (live && !dlg.open && !dismissed.has(live.id) && !p.retired) { cur = live; open(); }
}
S.onChange(() => { renderEntry(); if (dlg.open) render(); });
addEventListener("storage", (e) => { if (e.key === "luminaac:bridge") renderEntry(); });
renderEntry();
window.__pottyOpen = () => dlg.open;
// The "Bathroom" step of a routine story can hand over to Potty Path (call with go=true to start).
window.__pottyStart = (go) => { if (!enabled()) return false; if (go) startSession({ prompted: true, by: "caregiver" }); return true; };
