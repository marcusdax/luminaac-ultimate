// Word games in My Voice (docs/GAMES-CONCEPT.md). One shared frame: a dark band
// with "All done" always in the top-right corner, a scene, and the child's real
// board tiles (same colours, pictures and Talk columns) as the controller.
// Rules live in play-core.js. Turns and the World stay on this device.
import { load, persist, speak } from "./shared.js";
import { CORE } from "./vocab.js";
import { level, pitch } from "./games.js";
import * as P from "./play-core.js";

const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const WORLD = "luminaac:play-world";
const lexicon = new Map(CORE.map((c) => [c.w.toLowerCase(), c]));
// Words the games need that aren't on the core board: same classes as the Fitzgerald Key.
const EXTRA = {
  park: ["thing", "🌳"], home: ["thing", "🏠"], school: ["thing", "🏫"], fast: ["describe", "⚡"], slow: ["describe", "🐢"], again: ["social", "🔁"],
  wait: ["little", "⏳"], water: ["thing", "💧"], flower: ["thing", "🌸"], tree: ["thing", "🌳"], sun: ["thing", "☀️"], grow: ["action", "🌱"], pretty: ["describe", "✨"],
};
for (const x of [...P.CAST, ...P.STAGES]) EXTRA[x.w] ||= ["thing", x.e];
for (const x of P.ACTS) EXTRA[x.w] ||= ["action", x.e];
const wordItem = (w) => lexicon.get(w.toLowerCase()) || (EXTRA[w] ? { w, c: EXTRA[w][0], e: EXTRA[w][1] } : { w, c: "little", e: "" });

const settings = () => P.playSettings(load().games?.settings || {});
const world = () => { try { return JSON.parse(localStorage.getItem(WORLD)) || { pieces: [] }; } catch { return { pieces: [] }; } };
const saveWorld = (w) => { try { localStorage.setItem(WORLD, JSON.stringify(w)); } catch {} };

// ---------- Soft sound effects (speech is his voice and always speaks) ----------
let actx = null;
function chime(freq = 660) {
  const s = settings(); if (s.sound === "off") return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime, v = s.sound === "soft" ? 0.05 : 0.12;
    o.type = "sine"; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.4);
  } catch {}
}

// ---------- The frame ----------
const dlg = document.createElement("dialog");
dlg.className = "pk"; dlg.id = "pk"; dlg.setAttribute("aria-labelledby", "pkTitle");
dlg.innerHTML = `<header class="pk-top">
    <h2 id="pkTitle"></h2>
    <p class="pk-strip" id="pkStrip" aria-live="polite"></p>
    <button type="button" class="pk-done" id="pkDone">All done</button>
  </header>
  <div class="pk-scene" id="pkScene"></div>
  <p class="pk-note" id="pkNote" aria-live="polite"></p>
  <div class="pk-tiles" id="pkTiles" role="group" aria-label="Words"></div>`;
document.body.append(dlg);

let cur = null, started = 0, turns = 0, capTimer = 0, cleanup = [];
const api = {
  get settings() { return settings(); },
  scene: (html) => { $("pkScene").innerHTML = html; return $("pkScene"); },
  el: (sel) => $("pkScene").querySelector(sel),
  note: (t) => { $("pkNote").textContent = t || ""; },
  say: (t) => { if (t) speak(t); },
  chime,
  still: () => settings().motion === "still" || matchMedia("(prefers-reduced-motion: reduce)").matches,
  strip(words) { $("pkStrip").innerHTML = words.map((w, i) => `<span${i === words.length - 1 ? ' class="is-lit"' : ""}>${esc(w)}</span>`).join(" "); },
  // Real board tiles, in their Talk columns. Each tap speaks the word, like Talk.
  tiles(words, onTap, { label = "Words" } = {}) {
    const box = $("pkTiles"); box.textContent = ""; box.setAttribute("aria-label", label); box.hidden = !words.length;
    let said = [];
    for (const { w, col, row } of P.layoutTiles(words, CORE)) {
      const it = wordItem(w), b = document.createElement("button");
      b.type = "button"; b.className = "tile"; b.dataset.c = it.c; b.dataset.w = it.w;
      b.style.gridColumn = String(col); b.style.gridRow = String(row);
      b.innerHTML = `<span class="pic" aria-hidden="true">${esc(it.e || "")}</span><span class="label">${esc(it.w)}</span>`;
      b.addEventListener("click", () => { turns++; said = [...said, it.w].slice(-3); api.strip(said); speak(it.w); onTap(it.w, b); });
      box.append(b);
    }
  },
  // Every try adds to the World; "landmark" for the big moments. Never removed.
  piece(kind = "try") { saveWorld(P.addPiece(world(), cur.id, kind)); },
  onClose(fn) { cleanup.push(fn); },
  timer(fn, ms) { const id = setTimeout(fn, ms); cleanup.push(() => clearTimeout(id)); return id; },
};

function open(g) {
  cur = g; started = Date.now(); turns = 0; cleanup = [];
  $("pkTitle").textContent = g.name; $("pkStrip").textContent = ""; api.note(""); $("pkTiles").textContent = "";
  dlg.dataset.scene = g.scene; dlg.classList.toggle("pk-still", api.still());
  dlg.showModal();
  RUN[g.id](api);
  const s = settings();
  clearInterval(capTimer);
  capTimer = setInterval(() => { if (P.minutesLeft(started, s.minutes) === 0) rest(); }, 15000);
}
// The session cap is a rest point: everything he made is kept.
function rest() {
  clearInterval(capTimer); cleanup.splice(0).forEach((f) => { try { f(); } catch {} });
  api.scene(`<div class="pk-rest"><span aria-hidden="true">🌙</span><p>Time for a rest. Your world kept everything.</p></div>`);
  $("pkTiles").textContent = ""; api.say("Time for a rest.");
}
function close() {
  if (!cur) return; // already closed ("All done" and the close event both land here)
  clearInterval(capTimer); cleanup.splice(0).forEach((f) => { try { f(); } catch {} });
  if (cur && turns) { const d = load(); d.games ||= { settings: {}, goals: [], plays: [] }; (d.games.plays ||= []).push({ t: Date.now(), g: `play:${cur.id}`, n: turns }); d.games.plays = d.games.plays.slice(-2000); persist(d); }
  cur = null; renderMenu();
}
$("pkDone").addEventListener("click", () => { dlg.close(); close(); });
dlg.addEventListener("close", close);
dlg.addEventListener("cancel", () => {}); // Escape closes, same as All done

// ---------- 1. Word Garden ----------
const GARDEN_WORDS = ["flower", "water", "more", "big", "little", "tree", "grow", "sun", "look", "pretty", "I", "like"];
const PLANT = { 1: "🌱", 2: "🌿" }, BLOOM = ["🌻", "🌷", "🌼", "🌸"];
function garden(k) {
  let st = { plants: [], last: null };
  k.scene(`<div class="pk-garden"><div class="pk-sky-sun" aria-hidden="true"></div><ul class="pk-plants" aria-label="Garden"></ul><div class="pk-ground"></div></div>`);
  k.note("Tap a word to plant it. Two words together make it bloom.");
  const draw = () => { k.el(".pk-plants").innerHTML = st.plants.map((p) => `<li class="pk-plant s${p.stage}"><span class="pk-pic" aria-hidden="true">${p.stage === 3 ? BLOOM[p.w.length % BLOOM.length] : PLANT[p.stage]}</span><span class="pk-lbl">${esc(p.w)}</span></li>`).join(""); };
  k.tiles(GARDEN_WORDS.slice(0, k.settings.tiles), (w) => {
    const r = P.gardenStep(st, w, Date.now(), k.settings.combos); st = r.state; draw();
    if (r.event === "bloom") { k.say(r.say); k.chime(880); k.piece("landmark"); k.note(`${r.say} It bloomed!`); }
    else { k.chime(r.event === "sprout" ? 660 : 740); k.piece(); k.note(r.event === "sprout" ? `A ${w} is growing.` : `The ${w} grew!`); }
  });
}

// ---------- 2. Conductor ----------
function conductor(k) {
  let st = { moving: false, speed: 1, dest: null, lastTrip: null };
  const X = { park: 70, home: 84, school: 70 }, Y = { park: 18, home: 48, school: 76 }; // signs
  const STOP = { park: [56, 36], home: [70, 52], school: [56, 70] }; // where the train halts, on the track before each sign
  k.scene(`<div class="pk-rails"><svg class="pk-track" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M2 52 H50 Q60 52 70 22 M50 52 H90 M50 52 Q60 52 70 80" fill="none"/></svg>
    ${P.PLACES.map((p) => `<span class="pk-sign" style="left:${X[p]}%;top:${Y[p]}%">${esc(wordItem(p).e)} ${p}</span>`).join("")}
    <svg class="pk-train" viewBox="0 0 120 70" role="img" aria-label="The train"><rect x="4" y="22" width="70" height="34" rx="7" fill="#2f6fb3"/><rect x="66" y="6" width="34" height="50" rx="7" fill="#22313d"/><rect x="73" y="13" width="20" height="16" rx="3" fill="#f2b33d"/><rect x="100" y="34" width="14" height="22" rx="4" fill="#c7651c"/><circle cx="22" cy="58" r="9" fill="#22313d"/><circle cx="52" cy="58" r="9" fill="#22313d"/><circle cx="84" cy="58" r="9" fill="#22313d"/></svg></div>`);
  const train = k.el(".pk-train");
  const place = (x, y, ms) => { train.style.transitionDuration = k.still() ? "0ms" : `${ms}ms`; train.style.left = `${x}%`; train.style.top = `${y}%`; };
  place(6, 52, 0);
  k.note("The train waits for you. Choose a place, then go.");
  k.tiles(["go", "stop", "fast", "slow", "more", "again", "park", "home", "school"], (w) => {
    const r = P.conductorStep(st, w); st = r.state; k.say(r.say);
    if (r.anim === "trip") {
      const ms = P.tripMs(st.speed); place(...STOP[st.dest], ms);
      k.timer(() => { if (st.moving && st.dest) { k.say(`We're at the ${st.dest}!`); k.chime(880); k.piece("landmark"); st = { ...st, moving: false }; k.note(`At the ${st.dest}. Where next?`); } }, k.still() ? 300 : ms);
    } else if (r.anim === "roll") { place(30, 52, P.tripMs(st.speed) / 2); k.piece(); }
    else if (r.anim === "stop") { const b = train.getBoundingClientRect(), p = k.el(".pk-rails").getBoundingClientRect(); place(((b.left - p.left) / p.width) * 100, ((b.top - p.top) / p.height) * 100, 0); k.note("Stopped. Tap go when you're ready."); }
    else k.chime();
  });
}

// ---------- 3. Feelings Weather ----------
function weather(k) {
  k.scene(`<div class="pk-weather"><div class="pk-big" aria-hidden="true">🌤️</div><p class="pk-weather-say">What is your sky like?</p><div class="pk-breath" hidden><button type="button" class="pk-cloud">Breathe with the cloud</button></div></div>`);
  k.note("Pick the sky that feels like you. Every sky is OK.");
  let left = 0, breathing = false;
  const big = k.el(".pk-big"), wrap = k.el(".pk-weather"), breath = k.el(".pk-breath"), cloud = k.el(".pk-cloud");
  const box = $("pkTiles"); box.textContent = ""; box.hidden = false; box.setAttribute("aria-label", "Weather");
  P.WEATHER.forEach((x, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tile"; b.dataset.c = "describe"; b.style.gridColumn = String(i + 1);
    b.innerHTML = `<span class="pic" aria-hidden="true">${x.e}</span><span class="label">${x.id}</span>`;
    b.addEventListener("click", () => {
      turns++; big.textContent = x.e; wrap.style.background = x.sky; k.strip([x.id]);
      k.say(`My sky is ${x.id}. I feel ${x.feel}.`); k.el(".pk-weather-say").textContent = `I feel ${x.feel}.`; k.piece();
      left = P.stormSteps(x.id); breath.hidden = !left;
      k.note(left ? "If you want, breathe with the cloud. The sky can clear one breath at a time." : "Thank you for telling me.");
    });
    box.append(b);
  });
  cloud.addEventListener("click", () => {
    if (breathing || !left) return; breathing = true; cloud.classList.add("is-in"); k.note("Breathe in…");
    k.timer(() => { cloud.classList.remove("is-in"); cloud.classList.add("is-out"); k.note("…and out."); }, 4000);
    k.timer(() => {
      cloud.classList.remove("is-out"); breathing = false; left = P.afterBreath(left);
      if (!left) { big.textContent = "🌈"; wrap.style.background = "#e8eef0"; breath.hidden = true; k.say("The sky is clearing."); k.note("The sky is clearing. Well done."); k.piece("landmark"); }
      else k.note(`${left} more breath${left > 1 ? "s" : ""} if you want.`);
    }, 10000);
  });
}

// ---------- 4. Story Stage ----------
function stage(k) {
  const pick = { who: null, act: null, where: null };
  k.scene(`<div class="pk-stage"><div class="pk-set" aria-hidden="true"></div><span class="pk-actor" aria-hidden="true"></span><p class="pk-line"></p><button type="button" class="pk-play" disabled>Play it</button></div>`);
  k.note("Choose who, what they do, and where. Then play it.");
  const step = (kind) => {
    const lists = { who: P.CAST, act: P.ACTS, where: P.STAGES };
    k.tiles(lists[kind].map((x) => x.w), (w) => {
      pick[kind] = w; k.chime();
      const actor = k.el(".pk-actor"), set = k.el(".pk-set");
      if (kind === "who") actor.textContent = P.CAST.find((x) => x.w === w).e;
      if (kind === "where") set.textContent = P.STAGES.find((x) => x.w === w).e;
      const done = pick.who && pick.act && pick.where;
      k.el(".pk-line").textContent = pick.who ? P.sentence(pick) : "";
      k.el(".pk-play").disabled = !done;
      step(kind === "who" ? "act" : kind === "act" ? "where" : "who");
    }, { label: kind === "who" ? "Who" : kind === "act" ? "Does what" : "Where" });
  };
  step("who");
  k.el(".pk-play").addEventListener("click", () => {
    const actor = k.el(".pk-actor"), line = P.sentence(pick);
    actor.className = `pk-actor do-${pick.act}`; k.say(line); turns++; k.piece("landmark");
    k.timer(() => { actor.className = "pk-actor"; }, 3500);
  });
}

// ---------- 5. Pattern Lab ----------
function sort(k) {
  let round = null, n = 0;
  const boxes = k.settings.tiles <= 6 ? 2 : k.settings.tiles <= 9 ? 3 : 4;
  k.scene(`<div class="pk-lab"><div class="pk-item" aria-live="polite"></div><div class="pk-boxes"></div></div>`);
  $("pkTiles").hidden = true;
  const next = () => {
    round = P.sortRound(Math.floor(n / 5) % 2 ? "color" : "kind", boxes);
    k.el(".pk-item").textContent = round.item;
    k.el(".pk-boxes").innerHTML = round.boxes.map((b) => `<button type="button" class="pk-box" data-box="${b.box}"><span aria-hidden="true">${b.e}</span>${b.box}</button>`).join("");
    k.note("Where does it go?");
  };
  k.el(".pk-boxes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-box]"); if (!b) return; turns++;
    const r = P.sortTry(round, b.dataset.box); k.say(r.say);
    if (r.ok) { n++; k.chime(780); k.piece(n % 5 ? "try" : "landmark"); b.classList.add("is-got"); k.timer(next, k.still() ? 300 : 900); }
    else k.el(`[data-box="${r.hint}"]`).classList.add("is-hint");
  });
  next();
}

// ---------- 6. My Turn, Your Turn ----------
function turnsGame(k) {
  let st = { who: "child", n: 0, round: "blocks" };
  const ICON = { blocks: "🧱", drum: "🥁", picture: "⭐" };
  k.scene(`<div class="pk-table"><div class="pk-half pk-grown"><button type="button" class="pk-turn" data-who="grown-up"></button></div>
    <div class="pk-mid" aria-live="polite"></div>
    <div class="pk-half pk-kid"><button type="button" class="pk-turn" data-who="child"></button></div></div>`);
  k.note("Pass the lit token back and forth. Grown-up on top, you below.");
  let pile = [];
  const draw = () => {
    for (const b of k.el(".pk-table").querySelectorAll(".pk-turn")) {
      const mine = b.dataset.who === st.who;
      b.classList.toggle("is-lit", mine); b.disabled = !mine;
      b.innerHTML = mine ? `<span aria-hidden="true">${ICON[st.round]}</span> My turn` : "Wait";
    }
    k.el(".pk-mid").textContent = pile.join(" ");
  };
  k.el(".pk-table").addEventListener("click", (e) => {
    const b = e.target.closest(".pk-turn"); if (!b || b.disabled) return; turns++;
    pile = [...pile, ICON[st.round]].slice(-14); k.chime(st.round === "drum" ? 220 : 660);
    k.say(st.who === "child" ? "My turn!" : "Your turn!"); k.piece();
    st = P.nextTurn(st); draw();
  });
  k.tiles(["more", "again", "look", "wait"], () => {});
  draw();
}

// ---------- 7. Sound Pond ----------
function pond(k) {
  let st = { held: 0, x: 0 }, mic = null, iv = 0;
  k.scene(`<div class="pk-pond"><span class="pk-fish" role="img" aria-label="A fish">🐟</span><span class="pk-goal" aria-hidden="true">🪷</span></div>`);
  const pondEl = k.el(".pk-pond"), fish = k.el(".pk-fish");
  const ripple = () => { if (k.still()) return; const r = document.createElement("span"); r.className = "pk-ripple"; r.style.left = `${8 + st.x * 80}%`; pondEl.append(r); setTimeout(() => r.remove(), 1200); };
  const drawFish = (y) => { fish.style.left = `${4 + st.x * 82}%`; if (y != null) fish.style.top = `${70 - y * 55}%`; };
  const arrive = () => { k.say("The fish swam across!"); k.chime(880); k.piece("landmark"); k.note("The fish made it! Make a long sound to swim again."); st = { held: 0, x: 0 }; setTimeout(() => drawFish(), 1500); };
  const allowed = load().games?.settings?.mic && navigator.mediaDevices?.getUserMedia;
  const tapMode = () => {
    k.note("Tap the water to make ripples. Each tap swims the fish a little.");
    pondEl.addEventListener("click", () => { turns++; ripple(); st = { ...st, x: Math.min(1, st.x + 0.1) }; drawFish(); k.chime(520); if (st.x >= 1) arrive(); else k.piece(); });
  };
  if (!allowed) return tapMode();
  k.note("Make a sound. Loud makes ripples, high or low moves the fish. A long aaah swims it across.");
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } }).then((stream) => {
    const a = new (window.AudioContext || window.webkitAudioContext)(), an = a.createAnalyser(); an.fftSize = 2048;
    a.createMediaStreamSource(stream).connect(an); mic = { stream, a }; const buf = new Float32Array(an.fftSize);
    iv = setInterval(() => {
      an.getFloatTimeDomainData(buf); const lv = level(buf), hz = lv > 0.3 ? pitch(buf, a.sampleRate) : 0;
      const f = P.pondFrame(st, lv, hz); st = { held: f.held, x: f.x };
      if (f.ripple && Math.random() < 0.35) ripple(); drawFish(f.y);
      if (f.arrived) { turns++; arrive(); }
    }, 100);
  }).catch(tapMode);
  k.onClose(() => { clearInterval(iv); mic?.stream.getTracks().forEach((t) => t.stop()); mic?.a.close?.(); });
  $("pkTiles").hidden = true;
}

// ---------- 8. Copy the Robot ----------
const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
function robot(k) {
  let i = 0, cam = null, raf = 0, held = 0;
  k.scene(`<div class="pk-robot"><span class="pk-bot" aria-hidden="true">🤖</span><span class="pk-pose" aria-hidden="true"></span><p class="pk-pose-say"></p>
    <div class="pk-robot-row"><button type="button" class="pk-did">I did it</button>${load().games?.settings?.play?.camera ? '<button type="button" class="pk-cam">Use the camera</button>' : ""}</div>
    <video class="pk-video" playsinline muted hidden></video></div>`);
  const show = () => { const p = P.POSES[i % P.POSES.length]; k.el(".pk-pose").textContent = p.e; k.el(".pk-pose-say").textContent = p.say; k.say(p.say); };
  const win = () => { turns++; k.chime(880); k.say("You did it!"); k.piece(i % 4 === 3 ? "landmark" : "try"); k.el(".pk-bot").classList.add("is-happy"); setTimeout(() => k.el(".pk-bot")?.classList.remove("is-happy"), 900); i++; held = 0; setTimeout(show, 1200); };
  k.el(".pk-did").addEventListener("click", win);
  k.el(".pk-cam")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true; k.note("Starting the camera. Nothing is recorded or saved.");
    try {
      const { FilesetResolver, PoseLandmarker } = await import(`${VISION}/vision_bundle.mjs`);
      const fs = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
      const lm = await PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: POSE_MODEL }, runningMode: "VIDEO", numPoses: 1 });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 480, height: 360 } });
      const v = k.el(".pk-video"); v.srcObject = stream; v.hidden = false; await v.play(); cam = { stream, lm };
      k.note("Copy the robot. Hold the pose for a moment.");
      const loop = () => {
        if (!cam) return;
        const r = cam.lm.detectForVideo(v, performance.now()), got = P.classifyPose(r.landmarks?.[0]);
        if (got === P.POSES[i % P.POSES.length].id) { held += 1; if (held === 12) win(); } else held = Math.max(0, held - 1);
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch { k.note("The camera couldn't start. Tap \"I did it\" instead."); }
  });
  k.onClose(() => { cancelAnimationFrame(raf); cam?.stream.getTracks().forEach((t) => t.stop()); cam?.lm.close?.(); cam = null; });
  $("pkTiles").hidden = true; k.note("Copy what the robot does, then tap \"I did it\"."); show();
}

const RUN = { garden, conductor, weather, stage, sort, turns: turnsGame, pond, robot };

// ---------- Menu in My Voice (Play, under the sound games) and a door in Calm ----------
const box = document.createElement("details");
box.className = "mv-personality mv-play2"; box.open = true;
box.innerHTML = `<summary><span aria-hidden="true">🎲</span> Word games</summary><div class="mv-ptiles" id="mvPlay2" role="group" aria-label="Word games"></div>`;
(document.querySelector(".mv-games") || document.querySelector(".mv")?.lastElementChild)?.after(box);
function renderMenu() {
  const s = settings(), grid = $("mvPlay2"); if (!grid) return;
  grid.textContent = "";
  for (const g of P.shown(s)) {
    const b = document.createElement("button"); b.type = "button"; b.className = "tile mv-ptile"; b.dataset.c = "action";
    b.innerHTML = `<span class="pic" aria-hidden="true">${g.e}</span><span class="label">${esc(g.name)}</span>`;
    b.addEventListener("click", () => open(g)); grid.append(b);
  }
  const n = world().pieces.length;
  if (n) { const p = document.createElement("p"); p.className = "mv-gnote"; p.innerHTML = `My play world: ${world().pieces.slice(-24).map((x) => x.e).join(" ")} <span class="soft">(${n})</span>`; grid.append(p); }
  box.hidden = !P.shown(s).length;
  const door = document.querySelector(".pk-calm-door"); if (door) door.hidden = !P.shown(s).some((g) => g.id === "weather");
}
renderMenu();
addEventListener("storage", (e) => { if (e.key === "luminaac:bridge") renderMenu(); });
const calm = $("view-calm");
if (calm) {
  const door = document.createElement("button"); door.type = "button"; door.className = "ghost-btn pk-calm-door";
  door.innerHTML = `<span aria-hidden="true">⛅</span> Feelings weather`;
  door.addEventListener("click", () => open(P.GAMES.find((g) => g.id === "weather")));
  calm.querySelector(".scale")?.after(door);
  renderMenu();
}
window.__play = { open: (id) => open(P.GAMES.find((g) => g.id === id)) };
