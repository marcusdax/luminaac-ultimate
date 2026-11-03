// My Voice: Sound Path, the child's side. Short, fun voice practice inside the
// AAC app: Sing and Tap (two drums, two notes), Word Train (each part of a word is
// a carriage), Sound World (your voice moves things) and "Say it with me" (after
// a board word that is a current target, a soft 3-second "your turn").
// Rules shared with Potty Path: Break and Stop always on screen, no losing, no
// score that goes down, any voice counts. The grown-up is the judge; with no
// grown-up there every try is simply "tried". Nothing is recorded: the microphone
// is only measured for loudness and pitch, on the device. See docs/SOUND-PATH.md.
// Increment B adds Watch my mouth (a family member's own short clip, kept on the
// device), Mouth Mirror (camera, off by default: a face copies jaw and lips, nothing
// recorded) and Sound and treat (pairing a sound with a favourite thing, SLP-led).
import { load, getMedia } from "./shared.js";
import * as C from "./sound-core.js";
import * as St from "./sound-store.js";
import { level, pitch, judgeTry, praise, stickerFor } from "./games.js";
import * as ASR from "./asr.js";

const mv = document.querySelector(".mv");
const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cfg = () => ({ rung: 0, targets: [], tries: 5, cas: false, sayWithMe: true, ...(load().sound || {}) });
const enabled = () => !!load().access?.sound || localStorage.getItem("luminaac:sound-dev") === "1";
const gset = () => ({ mic: false, volume: 0.7, quiet: false, calm: false, reward: "stickers", ...(load().games?.settings || {}) });
const calm = () => gset().calm || matchMedia("(prefers-reduced-motion: reduce)").matches;
const micOK = () => gset().mic && !!navigator.mediaDevices?.getUserMedia;

function say(text, rate = 0.7) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.rate = rate; u.volume = gset().volume; speechSynthesis.speak(u);
}
let ac = null;
const actx = () => (ac ||= new (window.AudioContext || window.webkitAudioContext)());
function tone(hz, dur = 0.45, vol = 0.8) {
  if (gset().quiet) return;
  try {
    const a = actx(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = "triangle"; o.frequency.value = hz;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2 * gset().volume * vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch {}
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Markup ----------
const host = document.createElement("div");
host.innerHTML = `
  <details class="mv-personality mv-sound" id="spBox" hidden>
    <summary><span aria-hidden="true">🎵</span> Sound Path</summary>
    <div class="mv-ptiles" id="spTiles" role="group" aria-label="Sound Path games"></div>
  </details>
  <dialog class="mv-player sp" id="sp" aria-labelledby="spTitle">
    <h2 id="spTitle"></h2>
    <div class="sp-stage" id="spStage"></div>
    <p class="mv-step-text" id="spSay" aria-live="polite"></p>
    <div class="mv-meter" id="spMeter" hidden aria-hidden="true"><i id="spMeterBar"></i></div>
    <div class="mv-player-row" id="spRow"></div>
    <div class="sp-judge" id="spJudge" hidden role="group" aria-label="Grown-up: how was that try?"></div>
    <p class="mv-shelf" id="spShelf" aria-live="polite"></p>
    <div class="sp-always" role="group" aria-label="Always here">
      <button type="button" class="sp-abtn" id="spBreak">Break</button>
      <button type="button" class="sp-abtn" id="spStop">Stop</button>
      <button type="button" class="pp-hold sp-hold" id="spGrown" aria-label="Grown-up: press and hold to judge tries">Grown-up (hold)</button>
    </div>
  </dialog>
  <div class="sp-chip" id="spChip" hidden role="status"></div>`;
const games = mv.querySelector(".mv-games");
(games || mv.lastElementChild).after(host.firstElementChild);
mv.append(...host.children);

const GAMES = [
  { id: "sing", e: "🥁", label: "Sing and Tap", go: () => targetLoop(singTurn) },
  { id: "train", e: "🚂", label: "Word Train", go: () => targetLoop(trainTurn) },
  { id: "world", e: "🎈", label: "Sound World", go: worldGame },
  { id: "word", e: "🗣️", label: "Say the word", go: () => targetLoop(wordTurn) },
  { id: "mouth", e: "👄", label: "Watch my mouth", go: () => targetLoop(mouthTurn) },
  { id: "mirror", e: "🪞", label: "Mouth Mirror", go: mirrorGame, when: () => cfg().mirror },
  { id: "treat", e: "🎁", label: "Sound and treat", go: treatGame, when: () => cfg().treat },
];
function renderEntry() {
  const on = enabled(), box = $("spTiles");
  $("spBox").hidden = !on; if (!on) return;
  box.textContent = "";
  for (const g of GAMES.filter((x) => !x.when || x.when())) {
    const b = document.createElement("button"); b.type = "button"; b.className = "tile mv-ptile"; b.dataset.c = "action";
    b.innerHTML = `<span class="pic" aria-hidden="true">${g.e}</span><span class="label">${esc(g.label)}</span>`;
    b.addEventListener("click", () => start(g)); box.append(b);
  }
  const w = C.weekly(St.events());
  if (w.tries) box.insertAdjacentHTML("beforeend", `<p class="mv-gnote">${w.tries} voice tr${w.tries === 1 ? "y" : "ies"} this week</p>`);
}

// ---------- Session ----------
let game = null, tries = 0, shelf = [], paused = false, grown = false, running = 0;
const dlg = $("sp");
function start(g) {
  game = g; tries = 0; shelf = []; paused = false; running++;
  $("spTitle").textContent = g.label; $("spShelf").textContent = ""; $("spSay").textContent = ""; $("spJudge").hidden = true;
  dlg.classList.toggle("is-calm", calm());
  dlg.showModal(); g.go();
}
function end() { running++; stopMic(); stopCam(); game = null; speechSynthesis?.cancel(); renderEntry(); }
dlg.addEventListener("close", end);
dlg.addEventListener("cancel", (e) => { e.preventDefault(); stopNow(); });
$("spStop").addEventListener("click", stopNow);
function stopNow() { if (game) St.record("stop", { game: game.id }); closing("All done. See you later."); }
$("spBreak").addEventListener("click", () => {
  if (!game) return;
  if (paused) return;
  paused = true; running++; stopMic(); stopCam(); St.record("break", { game: game.id });
  stage(`<p class="sp-big">Break</p><p class="sp-soft">Take your time.</p>`); prompt("");
  row(btn("Back to it", () => { paused = false; game.go(); }), btn("All done", () => closing("All done. Thank you for playing."), "quiet"));
});
// Hold to show the judge bar; it then stays for this session.
holdBtn($("spGrown"), 800, () => { grown = true; $("spGrown").textContent = "Grown-up judging ✓"; });
function holdBtn(b, ms, fn) {
  let t0 = 0, iv = 0;
  const step = () => { const p = Math.min(1, (performance.now() - t0) / ms); b.style.setProperty("--hold", p); if (p >= 1) { cancel(); fn(); } };
  const go = (e) => { e.preventDefault(); t0 = performance.now(); clearInterval(iv); iv = setInterval(step, 30); };
  const cancel = () => { clearInterval(iv); b.style.setProperty("--hold", 0); };
  b.addEventListener("pointerdown", go); ["pointerup", "pointerleave", "pointercancel"].forEach((k) => b.addEventListener(k, cancel));
  b.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) go(e); }); b.addEventListener("keyup", cancel);
}
function closing(text) {
  running++; stopMic(); stopCam();
  stage(`<p class="sp-big">${esc(text)}</p>${shelf.length ? `<p class="sp-stickers" aria-label="${shelf.length} stickers">${shelf.join(" ")}</p>` : ""}`);
  prompt(""); say(text); $("spJudge").hidden = true;
  row(btn("Close", () => dlg.close()));
}
function btn(label, fn, cls = "") { const b = document.createElement("button"); b.type = "button"; b.className = "mv-pbtn " + cls; b.innerHTML = label; b.addEventListener("click", fn); return b; }
const row = (...b) => { const r = $("spRow"); r.textContent = ""; r.append(...b); };
const stage = (h) => { $("spStage").innerHTML = h; };
const prompt = (t) => { $("spSay").textContent = t; };

// ---------- Microphone (measured on the device, never recorded) ----------
let mic = null;
async function startMic() {
  if (mic) return mic;
  const my = running;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
  // Closed or stopped while the browser was asking: release the microphone at once.
  if (my !== running || !game) { stream.getTracks().forEach((t) => t.stop()); throw new Error("closed"); }
  const a = actx(); await a.resume?.();
  const an = a.createAnalyser(); an.fftSize = 2048; a.createMediaStreamSource(stream).connect(an);
  return (mic = { stream, an, buf: new Float32Array(an.fftSize), rate: a.sampleRate });
}
function stopMic() { mic?.stream.getTracks().forEach((t) => t.stop()); mic = null; $("spMeter").hidden = true; }
// Listen for `ms`. onFrame gets { level, hz, burst } where burst marks the start of a new sound.
function listen(ms, onFrame) {
  const my = running;
  return new Promise((res) => {
    if (!mic) return res(null);
    const frames = []; let was = false;
    $("spMeter").hidden = false;
    const iv = setInterval(() => {
      if (!mic || my !== running) { clearInterval(iv); return res(judgeTry(frames)); }
      mic.an.getFloatTimeDomainData(mic.buf);
      const lv = level(mic.buf), hz = lv > 0.3 ? pitch(mic.buf, mic.rate) : 0, on = lv >= 0.35;
      frames.push({ level: lv, hz });
      $("spMeterBar").style.setProperty("--l", lv.toFixed(2));
      onFrame?.({ level: lv, hz, burst: on && !was }); was = on;
      if (frames.length * 50 >= ms) { clearInterval(iv); res(judgeTry(frames)); }
    }, 50);
  });
}

// ---------- Target games: one shared loop ----------
async function targetLoop(turn) {
  const my = running, c = cfg();
  const plan = C.nextTry(St.events(), c.targets, Date.now(), Math.random, { cas: c.cas });
  if (plan.stopToday) return closing("That's all for today. See you tomorrow.");
  if (!plan.target) { stage(`<p class="sp-soft">A grown-up can choose sounds to practise in the Bridge (Sound Path).</p>`); row(btn("Close", () => dlg.close())); return; }
  if (tries >= Math.max(3, Math.min(6, c.tries))) return closing("All done! Great voice today.");
  const result = await turn(plan.target, plan, my);
  if (my !== running || !game) return;
  const judge = await getJudge(plan.target);
  if (my !== running || !game) return;
  tries++;
  St.record("try", { target: plan.target.id, say: plan.target.approx || plan.target.say, judge, game: game.id, voiced: result ? result.heard : undefined, ms: result?.ms || undefined, ...(result?.asr && { asr: result.asr }) }, { by: grown ? "caregiver" : "child" });
  reward(plan.feedback, result, judge);
  row(btn("Next", () => targetLoop(turn)), btn("All done", () => closing("All done! Great voice today."), "quiet"));
}
function getJudge(target) {
  if (!grown) return Promise.resolve("tried");
  const bar = $("spJudge"); bar.hidden = false; bar.textContent = "";
  bar.insertAdjacentHTML("beforeend", `<span class="sp-jl">Grown-up: "${esc(target.approx || target.show)}" was…</span>`);
  return new Promise((res) => {
    const done = (j) => { clearTimeout(tm); bar.hidden = true; res(j); };
    for (const [j, l] of [["got", "✓ Got it"], ["close", "~ Close"], ["tried", "· Tried"]]) bar.append(btn(l, () => done(j), j === "got" ? "" : "quiet"));
    const tm = setTimeout(() => done("tried"), 20e3);
  });
}
function reward(feedback, result, judge) {
  const n = St.events().filter((e) => e.kind === "try").length, r = gset().reward;
  shelf.push(r === "stars" ? "⭐" : r === "quiet" ? "✓" : stickerFor(n - 1));
  $("spShelf").textContent = `${r === "quiet" ? "Turns" : "Stickers"}: ${shelf.join(" ")}`;
  // Reward every round; spoken praise fades to every other try once a target is reliable.
  if (feedback === "every") { const m = judge === "got" ? "You said it!" : praise(result ? { long: result.long, ok: result.heard } : { ok: true }); prompt(m); say(m, 0.85); }
  else prompt("✓");
  if (!calm()) { const s = $("spStage"); s.classList.remove("pop"); void s.offsetWidth; s.classList.add("pop"); }
}
// "Your turn": the microphone if allowed, otherwise an "I did it" button. Never a fail.
async function yourTurn(ms, onFrame, extra = []) {
  prompt("Your turn!");
  if (micOK()) {
    try { await startMic(); } catch { /* fall back to the button */ }
    if (mic) { row(...extra); return listen(ms, onFrame); }
  }
  return new Promise((res) => { row(...extra, btn("I did it", () => res(null))); setTimeout(() => res(null), ms + 6000); });
}

// ---------- 1. Sing and Tap (Auditory-Motor Mapping Training, adapted) ----------
let singRate = 0.6;
async function singTurn(target, plan, my) {
  const m = C.melody(target.syll);
  stage(`<div class="sp-word" aria-hidden="true">${esc(target.e || "")}</div><div class="sp-drums">${m.map((x, i) => `<button type="button" class="sp-drum ${i % 2 ? "lo" : "hi"}" data-i="${i}" aria-label="Drum ${i + 1}: ${esc(x.s)}"><span>${esc(x.s)}</span></button>`).join("")}</div>`);
  const drums = [...$("spStage").querySelectorAll(".sp-drum")];
  let taps = 0;
  drums.forEach((d, i) => d.addEventListener("click", () => { taps++; tone(m[i].hz); flash(d); }));
  prompt(plan.showModel ? "Listen and watch the drums." : "Listen.");
  row();
  for (let k = 0; k < (plan.showModel ? 2 : 1); k++) {
    for (let i = 0; i < m.length; i++) {
      if (my !== running) return null;
      flash(drums[i]); tone(m[i].hz, 0.6); say(m[i].s, singRate);
      await wait(900 / singRate);
    }
    await wait(400);
  }
  const r = await yourTurn(4500, null);
  if (!taps && !(r?.heard)) singRate = Math.max(0.45, singRate - 0.05); else singRate = Math.min(0.75, singRate + 0.03);
  return r;
}
function flash(el) { if (!el) return; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); }

// ---------- 2. Word Train ----------
async function trainTurn(target, plan, my) {
  const parts = target.syll.length ? target.syll : [target.say];
  stage(`<div class="sp-train" aria-hidden="true"><span class="sp-engine">🚂</span>${parts.map((p) => `<span class="sp-car"><b>${esc(p)}</b></span>`).join("")}</div>`);
  const cars = [...$("spStage").querySelectorAll(".sp-car")];
  prompt("Listen.");
  row();
  for (let i = 0; i < parts.length; i++) { if (my !== running) return null; flash(cars[i]); say(parts[i], 0.6); await wait(1100); }
  say(target.say, 0.7); await wait(1200);
  cars.forEach((c) => c.classList.add("off"));
  let next = 0;
  const couple = () => { if (next < cars.length) { cars[next].classList.remove("off"); cars[next].classList.add("on"); tone(330 + next * 60, 0.25); next++; } };
  cars.forEach((c) => c.addEventListener("click", couple));
  const r = await yourTurn(3500 + parts.length * 900, (f) => { if (f.burst) couple(); });
  while (next < cars.length) couple();
  const tr = $("spStage").querySelector(".sp-train"); if (tr && !calm()) tr.classList.add("go");
  say(target.say, 0.8);
  return r;
}

// ---------- 4. Say the word (optional word recognition, see asr.js) ----------
// The picture and word, a slow model, then "your turn". With recognition on, hearing the
// word (or the family's form of it) gets a big "I heard you say ...". Not hearing it changes
// nothing: no "wrong", no retry demand, and the grown-up judge still decides.
async function wordTurn(target, plan, my) {
  stage(`<div class="sp-word" aria-hidden="true">${esc(target.e || "")}</div><p class="sp-bigword">${esc(target.show)}</p>`);
  prompt("Listen."); row();
  say(target.say, 0.65); await wait(1600);
  if (plan.showModel) { say(target.say, 0.65); await wait(1600); }
  if (my !== running) return null;
  const c = cfg(), eng = c.asr || "off";
  if (eng !== "off" && micOK() && ASR.available(eng)) {
    prompt("Your turn! Say it.");
    row();
    const alts = await ASR.listenFor(eng, [target], 4500, { modelUrl: c.asrModel }).catch(() => []);
    if (my !== running) return null;
    const j = ASR.judgeHeard(alts, target);
    if (j.match) { prompt(`I heard you say "${esc(j.heard)}"!`); say(`${j.heard}!`, 0.85); flash($("spStage").querySelector(".sp-bigword")); await wait(1200); }
    return { heard: true, asr: j.match || "none" };
  }
  return yourTurn(4500, null);
}

// ---------- 3. Sound World (cause and effect, no target, nothing to get right) ----------
async function worldGame() {
  const my = running;
  stage(`<div class="sp-world"><div class="sp-sky"><span class="sp-balloon" id="spBalloon">🎈</span></div><div class="sp-track"><span class="sp-wtrain" id="spWTrain">🚂</span></div><div class="sp-jar"><i id="spJar"></i></div></div>`);
  let pos = 0, fill = 0, voicedMs = 0;
  const draw = (lv, hz) => {
    const tr = $("spWTrain"), bl = $("spBalloon"), jar = $("spJar"); if (!tr) return;
    tr.style.left = `${Math.min(88, pos)}%`; jar.style.height = `${Math.min(100, fill)}%`;
    bl.style.bottom = `${hz ? Math.min(80, Math.max(0, Math.log2(hz / 120) * 40)) : 0}%`;
  };
  if (micOK()) {
    try { await startMic(); } catch {}
  }
  if (mic) {
    prompt("Make a sound! Long sounds move the train. High sounds lift the balloon.");
    row();
    const r = await listen(20000, (f) => { if (f.level >= 0.35) { pos += 0.6; fill += 0.5; voicedMs += 50; } draw(f.level, f.hz); });
    if (my !== running) return;
    St.record("try", { target: "voice", judge: "tried", game: "world", voiced: !!r?.heard, ms: voicedMs }, { by: "child" });
  } else {
    prompt("Hold the button and make a sound!");
    const go = btn("Hold to make it go", () => {});
    let iv = 0;
    go.addEventListener("pointerdown", () => { clearInterval(iv); iv = setInterval(() => { pos += 1.2; fill += 1; draw(0.5, 200 + pos * 3); }, 50); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((k) => go.addEventListener(k, () => { clearInterval(iv); draw(0, 0); }));
    row(go);
    await wait(20000);
    clearInterval(iv);
    if (my !== running) return;
    St.record("try", { target: "voice", judge: "tried", game: "world", voiced: false }, { by: "child" });
  }
  tries++; reward("every", { heard: true, long: voicedMs >= 400 }, "tried");
  row(btn("Again", () => worldGame()), btn("All done", () => closing("All done! What a voice."), "quiet"));
}

// ---------- 5. Watch my mouth (family video models, increment B) ----------
// A 2–3 second close-up of Mum, Dad or a sibling saying the target, recorded in the
// Bridge and kept on this device. Slow first, then normal speed, then "your turn".
let clipURL = "";
async function mouthTurn(target, plan, my) {
  const blob = await getMedia("clip:" + target.id).catch(() => null);
  if (my !== running) return null;
  if (clipURL) URL.revokeObjectURL(clipURL);
  clipURL = blob ? URL.createObjectURL(blob) : "";
  stage(blob ? `<video class="sp-clip" playsinline preload="auto" aria-label="Watch the mouth say ${esc(target.show)}"></video><p class="sp-bigword">${esc(target.show)}</p>`
    : `<div class="sp-word" aria-hidden="true">${esc(target.e || "👄")}</div><p class="sp-bigword">${esc(target.show)}</p><p class="sp-soft">A grown-up can record a short clip of their mouth saying this in the Bridge.</p>`);
  row();
  if (blob) {
    const v = $("spStage").querySelector("video"); v.src = clipURL; v.volume = gset().quiet ? 0 : gset().volume;
    for (const rate of plan.showModel ? [0.6, 0.6, 1] : [0.6, 1]) {
      if (my !== running) return null;
      prompt(rate < 1 ? "Watch. Slowly." : "Watch."); v.playbackRate = rate; v.preservesPitch = true; v.currentTime = 0;
      await v.play().catch(() => {});
      await new Promise((r) => { v.onended = r; setTimeout(r, 6000 / rate); });
      await wait(500);
    }
  } else { prompt("Listen."); say(target.say, 0.6); await wait(1600); }
  if (my !== running) return null;
  return yourTurn(4500, null);
}

// ---------- 6. Mouth Mirror (camera, off by default, increment B) ----------
// A friendly face copies the child's jaw and lips live: open (ah), round (oo),
// closed (mm). MediaPipe Face Landmarker runs on the device; video is never saved
// or sent. Not during Potty Path. Without the camera, "I did it" works the same.
const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
let cam = null, camRaf = 0;
function stopCam() { cancelAnimationFrame(camRaf); cam?.stream.getTracks().forEach((t) => t.stop()); cam?.lm.close?.(); cam = null; }
const face = (open = 0.1, round = 0) => `<svg class="sp-face" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" fill="#e7c27d"/><circle cx="42" cy="48" r="6" fill="#2b2b2b"/><circle cx="78" cy="48" r="6" fill="#2b2b2b"/><ellipse class="sp-mouth" cx="60" cy="82" rx="${(22 - round * 12).toFixed(1)}" ry="${(2 + open * 18 + round * 6).toFixed(1)}" fill="#5a2a2a"/></svg>`;
async function mirrorGame() {
  const my = running;
  if (document.getElementById("pp")?.open) { stage(`<p class="sp-soft">Mouth Mirror rests while Potty Path is open.</p>`); row(btn("Close", () => dlg.close())); return; }
  let i = 0, held = 0;
  const shape = () => C.SHAPES[i % C.SHAPES.length];
  const show = () => {
    const s = shape();
    stage(`<div class="sp-mirror">${face(s.id === "open" ? 0.8 : 0.05, s.id === "round" ? 1 : 0)}<video class="sp-cam" playsinline muted ${cam ? "" : "hidden"}></video></div><p class="sp-bigword">${esc(s.show)}</p>`);
    prompt(`${s.hint}: "${s.show}"`); say(s.say, 0.6);
    if (cam) { const v = $("spStage").querySelector(".sp-cam"); v.srcObject = cam.stream; v.play().catch(() => {}); }
  };
  const win = async () => {
    if (my !== running) return;
    const s = shape(), target = C.targetOf({ id: s.id === "open" ? "ah" : s.id === "round" ? "oo" : "mm" });
    cancelAnimationFrame(camRaf); held = 0;
    const judge = await getJudge(target); if (my !== running) return;
    tries++; St.record("try", { target: target.id, say: target.say, judge, game: "mirror" }, { by: grown ? "caregiver" : "child" });
    reward("every", { heard: true }, judge); i++;
    if (tries >= Math.max(3, Math.min(6, cfg().tries))) return closing("All done! What a mirror.");
    row(btn("Next", () => { show(); controls(); if (cam) track(); }), btn("All done", () => closing("All done! What a mirror."), "quiet"));
  };
  const track = () => {
    const v = $("spStage").querySelector(".sp-cam"), m = $("spStage").querySelector(".sp-mouth");
    const loop = () => {
      if (!cam || my !== running) return;
      if (v.readyState >= 2) {
        const r = cam.lm.detectForVideo(v, performance.now()), bs = r.faceBlendshapes?.[0]?.categories;
        if (bs) { const p = C.mouthPose(bs); m?.setAttribute("rx", (22 - p.round * 12).toFixed(1)); m?.setAttribute("ry", (2 + p.open * 18 + p.round * 6).toFixed(1)); }
        if (C.mouthShape(bs) === shape().id) { if (++held >= 10) return win(); } else held = Math.max(0, held - 1);
      }
      camRaf = requestAnimationFrame(loop);
    };
    loop();
  };
  const controls = () => row(btn("I did it", win), ...(cam ? [] : [btn("Use the camera", startCam, "quiet")]));
  async function startCam() {
    prompt("Starting the camera. Nothing is recorded or saved.");
    try {
      const { FilesetResolver, FaceLandmarker } = await import(`${VISION}/vision_bundle.mjs`);
      const fs = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
      const lm = await FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 480, height: 360 } });
      if (my !== running) { stream.getTracks().forEach((t) => t.stop()); lm.close?.(); return; }
      cam = { stream, lm }; show(); controls(); track();
    } catch { prompt("The camera couldn't start. Tap \"I did it\" instead."); }
  }
  show(); controls();
}

// ---------- 7. Sound and treat (pairing, the SLP turns it on) ----------
// The target sound plays while their favourite thing shows. Nothing is asked of
// the child. If they make a sound anyway, it is logged as "heard".
async function treatGame() {
  const my = running, c = cfg(), list = (c.targets || []).map(C.targetOf);
  const fav = c.treatThing || { e: "🚂", label: "Train" };
  const plan = C.pairingPlan(St.events(), list.find((t) => t.id === c.treatTarget) || list[0], Date.now(), c.treatPerDay || 10);
  if (!plan.target) { stage(`<p class="sp-soft">A grown-up can choose a sound in the Bridge (Sound Path).</p>`); row(btn("Close", () => dlg.close())); return; }
  if (plan.done) return closing("That's all the treats for today.");
  stage(`<div class="sp-treat"><span class="sp-fav" aria-hidden="true">${esc(fav.e)}</span><p class="sp-bigword">${esc(plan.target.show)}</p></div>`);
  prompt(fav.label ? `${fav.label}!` : ""); row();
  for (let k = 0; k < plan.reps; k++) {
    if (my !== running) return;
    flash($("spStage").querySelector(".sp-fav")); say(plan.target.say, 0.65); await wait(1800);
  }
  // Listen only after the model has finished, so the talker's own voice isn't "heard".
  let heard = false;
  if (micOK()) { try { await startMic(); heard = !!(await listen(3000))?.heard; } catch {} } else await wait(1500);
  if (my !== running) return;
  St.record("pair", { target: plan.target.id, thing: fav.label || fav.e, voiced: heard || undefined }, { by: "child" });
  if (heard) St.record("heard", { sound: plan.target.approx || plan.target.say, spontaneous: false, game: "treat" }, { by: "child" });
  tries++; reward("light", null, "tried"); prompt(heard ? "I heard you!" : `${fav.label || "Yay"}!`);
  row(btn("Again", () => treatGame()), btn("All done", () => closing("All done."), "quiet"));
}

// ---------- "Say it with me" on the main board ----------
// After a board word that is a current target, a soft "your turn" for 3 seconds.
// The board has already spoken: nothing is ever blocked or asked again.
const chip = $("spChip");
document.getElementById("view-talk")?.addEventListener("click", async (e) => {
  if (!enabled() || !cfg().sayWithMe || dlg.open) return;
  const t = e.target.closest(".grid .tile, .next-row .tile");
  const w = (t?.dataset.w || "").trim().toLowerCase(); if (!w) return;
  const target = cfg().targets.map(C.targetOf).find((x) => [x.say, x.show, x.approx, x.word].filter(Boolean).some((s) => String(s).toLowerCase() === w));
  if (!target) return;
  await wait(1100);
  chip.innerHTML = `<span aria-hidden="true">🙂</span> Your turn: <b>${esc(target.approx || target.show)}</b>`; chip.hidden = false; chip.classList.remove("heard");
  let heard = false;
  if (micOK() && (await navigator.permissions?.query({ name: "microphone" }).then((p) => p.state === "granted").catch(() => false))) {
    try { await startMic(); const r = await listen(3000); heard = !!r?.heard; } catch {}
    if (!dlg.open) stopMic();
  } else await wait(3000);
  if (heard) { chip.innerHTML = `<span aria-hidden="true">🌟</span> I heard you!`; chip.classList.add("heard"); St.record("try", { target: target.id, say: target.approx || target.say, judge: "tried", game: "say", voiced: true, spontaneous: false }, { by: "child" }); await wait(1600); }
  chip.hidden = true;
});

St.onChange(renderEntry);
addEventListener("storage", (e) => { if (e.key === "luminaac:bridge") renderEntry(); });
renderEntry();
window.__soundPath = { start: (id) => start(GAMES.find((g) => g.id === id) || GAMES[0]) };
