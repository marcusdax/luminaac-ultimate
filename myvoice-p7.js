// My Voice, Phase 7: "My videos" (only videos a caregiver added, privacy-enhanced
// player, no autoplay or suggestions, then "talk about it") and gentle sound games.
// Engagement and game turns are written to this device only (db.videos, db.games).
import { load, persist } from "./shared.js";
import { TOPICS, NOCOOKIE, PLAYER_VARS, closeSession } from "./interests.js";
import { SOUND_PICS, FIRST_SOUNDS, ECHO_SOUNDS, matchRound, firstRound, level, pitch, judgeTry, stickerFor, praise, streak, shuffle } from "./games.js";

const mv = document.querySelector(".mv");


function init() {
  const host = document.createElement("div");
  host.innerHTML = `
  <details class="mv-personality mv-videos" id="mvVideosBox">
    <summary><span aria-hidden="true">🎬</span> My videos</summary>
    <div class="mv-ptiles" id="mvVideos" role="group" aria-label="My videos"></div>
  </details>
  <details class="mv-personality mv-games">
    <summary><span aria-hidden="true">🎶</span> Sound games</summary>
    <div class="mv-ptiles" id="mvGames" role="group" aria-label="Sound games"></div>
  </details>
  <dialog class="mv-player mv-video" id="mvVideo" aria-labelledby="mvVideoTitle">
    <h2 id="mvVideoTitle"></h2>
    <div class="mv-frame" id="mvFrame"><div id="mvYT"></div><div class="mv-end" id="mvEnd" hidden><p class="mv-end-text">All done. What did you think?</p></div></div>
    <p class="mv-vstatus" id="mvVStatus" role="status"></p>
    <div class="mv-player-row" id="mvVRow"></div>
    <div class="mv-talk" id="mvTalk" hidden><h3 id="mvTalkH">Talk about it</h3><div class="mv-talk-grid" id="mvTalkGrid" role="group" aria-labelledby="mvTalkH"></div></div>
    <button class="mv-close" type="button" id="mvVClose">Close</button>
  </dialog>
  <dialog class="mv-player mv-game" id="mvGame" aria-labelledby="mvGameTitle">
    <h2 id="mvGameTitle"></h2>
    <div class="mv-gstage" id="mvGStage"></div>
    <p class="mv-step-text" id="mvGSay" aria-live="polite"></p>
    <div class="mv-meter" id="mvMeter" hidden aria-hidden="true"><i id="mvMeterBar"></i><b id="mvPitchDot"></b></div>
    <div class="mv-player-row" id="mvGRow"></div>
    <p class="mv-shelf" id="mvShelf" aria-live="polite"></p>
    <button class="mv-close" type="button" id="mvGClose">Close</button>
  </dialog>`;
  const stories = mv.querySelector(".mv-stories");
  (stories || mv.lastElementChild).after(...host.children);
  renderVideos(); renderGames();
  addEventListener("storage", (e) => { if (e.key === "luminaac:bridge") { renderVideos(); renderGames(); } });
  $("mvVClose").addEventListener("click", closeVideo);
  $("mvVideo").addEventListener("close", closeVideo);
  $("mvGClose").addEventListener("click", () => $("mvGame").close());
  $("mvGame").addEventListener("close", endGame);
}
const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const settings = () => ({ mic: false, volume: 0.7, quiet: false, calm: false, choices: 3, reward: "stickers", ...(load().games?.settings || {}) });
const calm = () => settings().calm || matchMedia("(prefers-reduced-motion: reduce)").matches;
function btn(label, fn, cls = "") { const b = Object.assign(document.createElement("button"), { type: "button", className: "mv-pbtn " + cls }); b.innerHTML = label; b.addEventListener("click", fn); return b; }
function say(text, rate = 0.85) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.rate = rate; u.volume = settings().volume; speechSynthesis.speak(u);
}
function tile(e, label, go, extra = "") {
  const b = document.createElement("button");
  b.type = "button"; b.className = "tile mv-ptile " + extra; b.dataset.c = "action";
  b.innerHTML = `<span class="pic" aria-hidden="true">${e}</span><span class="label"></span>`;
  b.querySelector(".label").textContent = label; b.addEventListener("click", go); return b;
}

// =============== My videos ===============
function renderVideos() {
  const d = load(), v = d.videos || { list: [] }, box = $("mvVideos");
  $("mvVideosBox").hidden = !v.on || !v.list.length;
  box.textContent = "";
  for (const x of v.list) {
    const t = tile(esc(x.e || "🎬"), x.title, () => openVideo(x.id), "mv-vtile");
    if (v.thumbs) { const pic = t.querySelector(".pic"); pic.innerHTML = `<img src="https://i.ytimg.com/vi/${encodeURIComponent(x.yt)}/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer" />`; }
    box.append(t);
  }
}

let ytLoading = null;
function loadYT() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return (ytLoading ||= new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api"; s.async = true;
    s.onerror = () => { ytLoading = null; rej(new Error("offline")); };
    document.head.append(s);
    setTimeout(() => { if (!window.YT?.Player) { ytLoading = null; rej(new Error("timeout")); } }, 15000);
  }));
}

let player = null, sess = null, tick = null, cur = null;
async function openVideo(id) {
  const d = load(); cur = d.videos.list.find((x) => x.id === id); if (!cur) return;
  $("mvVideoTitle").textContent = cur.title;
  $("mvEnd").hidden = true; $("mvTalk").hidden = true; $("mvFrame").hidden = false;
  $("mvVStatus").textContent = "Getting the video ready…";
  sess = { t: Date.now(), v: cur.id, w: 0, d: 0, r: 0, e: false };
  controls("loading");
  $("mvVideo").showModal();
  try {
    const YT = await loadYT();
    $("mvFrame").querySelector("#mvYT")?.remove();
    const el = document.createElement("div"); el.id = "mvYT"; $("mvFrame").prepend(el);
    player = new YT.Player(el, {
      host: NOCOOKIE, videoId: cur.yt, width: "100%", height: "100%",
      playerVars: { ...PLAYER_VARS, origin: location.origin, ...(cur.start ? { start: cur.start } : {}) },
      events: {
        onReady: () => { $("mvVStatus").textContent = "Ready. Press Play when you want."; controls("paused"); player.getIframe?.().setAttribute("title", `Video: ${cur.title}`); },
        onStateChange: (ev) => onState(ev.data),
        onError: () => { $("mvVStatus").textContent = "This video can't play here. Ask a grown-up to pick another one."; controls("error"); },
      },
    });
  } catch {
    $("mvVStatus").textContent = "Videos need the internet. Let's talk about it instead.";
    controls("error"); showTalk();
  }
}
function onState(s) {
  // 1 playing, 2 paused, 0 ended (YouTube's PlayerState)
  clearInterval(tick);
  if (s === 1) {
    controls("playing"); $("mvVStatus").textContent = "";
    tick = setInterval(() => { if (!sess) return; sess.w += 1; sess.d = Math.round(player?.getDuration?.() || sess.d); }, 1000);
  } else if (s === 2) controls("paused");
  else if (s === 0) {
    sess.e = true; sess.d = Math.round(player?.getDuration?.() || sess.d);
    // Cover the player at the end so YouTube's end screen of other videos never shows.
    $("mvEnd").hidden = false; controls("ended"); showTalk();
    $("mvVStatus").textContent = "All done.";
  }
}
function controls(state) {
  const row = $("mvVRow"); row.textContent = "";
  if (state === "loading") return;
  if (state === "playing") row.append(btn("Pause", () => player.pauseVideo()));
  if (state === "paused") row.append(btn("Play", () => player.playVideo()));
  if (state === "ended" || state === "paused" || state === "playing") row.append(btn("Watch again", again, "quiet"));
  if (state !== "error" && $("mvTalk").hidden) row.append(btn("Talk about it", showTalk, "quiet"));
}
function again() {
  if (!player || !sess) return;
  sess.r += 1; $("mvEnd").hidden = true;
  player.seekTo?.(cur.start || 0, true); player.playVideo?.();
  logTalk("again", false);
}
function showTalk() {
  if (!cur) return;
  const words = [...new Set([...(cur.words || []), ...cur.topics.flatMap((k) => TOPICS[k]?.words.slice(0, 5) || []), "i like it", "again", "all done"])].slice(0, 15);
  const g = $("mvTalkGrid"); g.textContent = "";
  for (const w of words) g.append(btnWord(w));
  $("mvTalk").hidden = false;
  [...$("mvVRow").querySelectorAll("button")].find((b) => b.textContent === "Talk about it")?.remove();
}
function btnWord(w) {
  const b = document.createElement("button"); b.type = "button"; b.className = "mv-word"; b.textContent = w;
  b.addEventListener("click", () => { say(w === "i like it" ? `I like ${cur.title}` : w); logTalk(w); if (w === "again") again(); if (w === "all done") $("mvVideo").close(); });
  return b;
}
function logTalk(word, spoken = true) {
  if (!cur) return;
  const d = load(); d.videos.talk.push({ t: Date.now(), v: cur.id, word, spoken }); d.videos.talk = d.videos.talk.slice(-2000); persist(d);
}
function closeVideo() {
  clearInterval(tick);
  if (sess) {
    const d = load(); d.videos.sessions.push(closeSession(sess)); d.videos.sessions = d.videos.sessions.slice(-1000); persist(d);
    sess = null;
  }
  try { player?.destroy?.(); } catch {}
  player = null;
  if ($("mvVideo").open) $("mvVideo").close();
}

// =============== Sound games ===============
const GAMES = [
  { id: "echo", e: "🐍", label: "Copy my sound", go: playEcho },
  { id: "match", e: "🐮", label: "Who says that?", go: playMatch },
  { id: "first", e: "⚽", label: "First sounds", go: playFirst },
  { id: "turns", e: "🥁", label: "My turn, your turn", go: playTurns },
];
function renderGames() {
  const box = $("mvGames"); box.textContent = "";
  for (const g of GAMES) box.append(tile(g.e, g.label, () => startGame(g)));
  const plays = load().games?.plays || [];
  const s = streak(plays);
  if (plays.length) { const p = document.createElement("p"); p.className = "mv-gnote"; p.textContent = `${plays.length} sticker${plays.length > 1 ? "s" : ""} so far${s > 1 ? ` · ${s} days in a row` : ""}`; box.append(p); }
}

let game = null, session = [], audio = null;
function startGame(g) {
  game = g; session = [];
  $("mvGameTitle").textContent = g.label; $("mvShelf").textContent = ""; $("mvGSay").textContent = ""; $("mvMeter").hidden = true;
  $("mvGame").classList.toggle("is-calm", calm());
  $("mvGame").showModal(); g.go();
}
function endGame() { stopMic(); clearTimeout(turnTimer); game = null; renderGames(); }
function record(ok, item, extra = {}) {
  const d = load(); d.games ||= { settings: {}, goals: [], plays: [] };
  d.games.plays.push({ t: Date.now(), game: game?.id, ok: !!ok, item, ...extra }); d.games.plays = d.games.plays.slice(-3000); persist(d);
  const n = d.games.plays.length, r = settings().reward;
  session.push(r === "stars" ? "⭐" : r === "quiet" ? "✓" : stickerFor(n - 1));
  $("mvShelf").textContent = `${r === "quiet" ? "Turns" : "Stickers"} today: ${session.join(" ")}`;
  if (!settings().quiet) chime(ok);
  if (!calm()) { const s = $("mvGStage"); s.classList.remove("pop"); void s.offsetWidth; s.classList.add("pop"); }
}
function ac() { return (audio ||= new (window.AudioContext || window.webkitAudioContext)()); }
function tone(freq, at, dur = 0.18, vol = 1) {
  const a = ac(), o = a.createOscillator(), g = a.createGain();
  o.type = "sine"; o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + at); g.gain.linearRampToValueAtTime(0.25 * settings().volume * vol, a.currentTime + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + dur);
  o.connect(g).connect(a.destination); o.start(a.currentTime + at); o.stop(a.currentTime + at + dur + 0.05);
}
function chime(big) { try { (big ? [523, 659, 784] : [523, 659]).forEach((f, i) => tone(f, i * 0.12, 0.25, 0.8)); } catch {} }
const row = (...b) => { const r = $("mvGRow"); r.textContent = ""; r.append(...b); };
const stage = (html) => { $("mvGStage").innerHTML = html; };
const prompt = (t) => { $("mvGSay").textContent = t; };

// ---------- Microphone (optional, on the device, nothing recorded) ----------
let mic = null;
async function startMic() {
  if (mic) return mic;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
  const a = ac(); await a.resume?.();
  const src = a.createMediaStreamSource(stream), an = a.createAnalyser(); an.fftSize = 2048; src.connect(an);
  mic = { stream, an, buf: new Float32Array(an.fftSize), rate: a.sampleRate };
  return mic;
}
function stopMic() { mic?.stream.getTracks().forEach((t) => t.stop()); mic = null; $("mvMeter").hidden = true; }
// Listen for up to `ms`, drawing a loudness bar and a pitch dot. Resolves with judgeTry().
function listen(ms = 3000, { stopOnVoice = false } = {}) {
  return new Promise((res) => {
    const frames = [], step = 50, end = Date.now() + ms; let voicedMs = 0;
    $("mvMeter").hidden = false;
    const iv = setInterval(() => {
      if (!mic) { clearInterval(iv); return res(judgeTry(frames)); }
      mic.an.getFloatTimeDomainData(mic.buf);
      const lv = level(mic.buf), hz = lv > 0.3 ? pitch(mic.buf, mic.rate) : 0;
      frames.push({ level: lv, hz });
      $("mvMeterBar").style.setProperty("--l", lv.toFixed(2));
      $("mvPitchDot").style.setProperty("--p", hz ? Math.min(1, Math.max(0, Math.log2(hz / 100) / 3)).toFixed(2) : "0");
      $("mvPitchDot").classList.toggle("on", !!hz);
      if (lv >= 0.35) voicedMs += step;
      if (Date.now() >= end || (stopOnVoice && voicedMs >= 250)) { clearInterval(iv); res(judgeTry(frames)); }
    }, step);
  });
}
const micAllowed = () => settings().mic && !!navigator.mediaDevices?.getUserMedia;
async function micTurn(onResult) {
  try { await startMic(); } catch { prompt("The microphone isn't on. Tap \"I did it\" instead."); return false; }
  prompt("Your turn. I'm listening…");
  const r = await listen(3000);
  onResult(r); return true;
}

// ---------- 1. Copy my sound (imitation, with loudness and pitch feedback) ----------
let echoI = 0;
function playEcho() {
  const s = ECHO_SOUNDS[echoI++ % ECHO_SOUNDS.length];
  stage(`<span class="mv-big" aria-hidden="true">${s.e}</span>`);
  prompt(`Listen: ${s.say}. Now you!`); say(s.say, 0.6);
  const done = (r) => {
    const ok = r ? r.heard : true;
    record(ok, s.say, r ? { ms: r.ms, hz: r.hz } : {});
    const msg = r && !r.heard ? "I didn't hear it that time. That's okay. Let's do it together." : `${praise(r || { ok: true })}${r?.long ? " That was a nice long sound." : ""}`;
    prompt(msg); say(msg);
    row(btn("Another sound", playEcho), btn("Hear it", () => say(s.say, 0.6), "quiet"));
  };
  const b = [btn("Hear it", () => say(s.say, 0.6), "quiet"), btn("I did it", () => done(null))];
  if (micAllowed()) b.unshift(btn("<span aria-hidden=\"true\">🎤</span> Use the microphone", () => micTurn(done)));
  row(...b);
}

// ---------- 2. Who says that? (sound to picture) ----------
function playMatch() {
  const r = matchRound(Math.random, settings().choices);
  let tries = 0;
  stage(`<div class="mv-choices">${r.options.map((o, i) => `<button type="button" class="mv-choice" data-i="${i}"><span aria-hidden="true">${o.e}</span><span>${o.name}</span></button>`).join("")}</div>`);
  const ask = () => { prompt(`Who says "${r.target.say}"?`); say(`Who says ${r.target.say}?`); };
  ask();
  $("mvGStage").querySelectorAll(".mv-choice").forEach((b) => b.addEventListener("click", () => {
    const o = r.options[+b.dataset.i]; tries++;
    if (o === r.target) {
      b.classList.add("is-right"); const m = `Yes! The ${o.name} says ${o.say}. ${praise({ ok: true })}`; prompt(m); say(m);
      record(true, o.name, { tries }); row(btn("Next", playMatch), btn("Say it again", () => say(o.say), "quiet"));
    } else {
      // No wrong buzzer: name what they picked, then ask again.
      const m = `That's the ${o.name}. The ${o.name} says ${o.say}. Let's find ${r.target.say}.`; prompt(m); say(m);
    }
  }));
  row(btn("Hear it", ask, "quiet"), btn("Next", playMatch, "quiet"));
}

// ---------- 3. First sounds (phoneme awareness, then say it) ----------
const PH = { m: "mmm", b: "buh", p: "puh", d: "duh", n: "nnn", t: "tuh", s: "sss", f: "fff" };
const firstPick = () => { const d = load(), own = (d.practice?.targets || []).map((p) => p.sound.toLowerCase()).filter((s) => FIRST_SOUNDS[s]); return own.length && Math.random() < 0.6 ? shuffle(own)[0] : null; };
function playFirst() {
  const r = firstRound(firstPick(), Math.random, settings().choices), ph = PH[r.sound];
  stage(`<p class="mv-sound" aria-hidden="true">${r.sound}</p><div class="mv-choices">${r.options.map((o, i) => `<button type="button" class="mv-choice" data-i="${i}"><span aria-hidden="true">${o.e}</span><span>${o.w}</span></button>`).join("")}</div>`);
  const ask = () => { prompt(`Which one starts with "${ph}"?`); say(`Which one starts with ${ph}?`, 0.75); };
  ask(); let tries = 0;
  $("mvGStage").querySelectorAll(".mv-choice").forEach((b) => b.addEventListener("click", () => {
    const o = r.options[+b.dataset.i]; tries++;
    if (o === r.target) {
      b.classList.add("is-right");
      const m = `Yes! ${o.w} starts with ${ph}. Say it with me: ${ph}, ${ph}, ${o.w}.`; prompt(m); say(m, 0.75);
      record(true, r.sound, { word: o.w, tries });
      const nx = [btn("Next", playFirst), btn("Hear it", () => say(`${ph}, ${ph}, ${o.w}`, 0.7), "quiet")];
      if (micAllowed()) nx.splice(1, 0, btn("<span aria-hidden=\"true\">🎤</span> I'll say it", () => micTurn((x) => { const t = x.heard ? praise(x) : "Nice listening. We'll try again soon."; prompt(t); say(t); })));
      row(...nx);
    } else { const m = `That's ${o.w}. ${o.w} starts with a different sound. Let's listen again.`; prompt(m); say(`${m} ${ph}`, 0.75); }
  }));
  row(btn("Hear it", ask, "quiet"), btn("Next", playFirst, "quiet"));
}

// ---------- 4. My turn, your turn (turn-taking with beats) ----------
let turnTimer = null, turnN = 0;
function playTurns() {
  turnN = 1 + (turnN % 3);
  stage(`<button type="button" class="mv-drum" id="mvDrum" aria-label="Drum. Tap for your turn"><span aria-hidden="true">🥁</span></button><div class="mv-beats" aria-hidden="true">${"<i></i>".repeat(turnN)}</div>`);
  prompt("My turn. Listen."); $("mvDrum").disabled = true;
  const beats = [...$("mvGStage").querySelectorAll(".mv-beats i")];
  beats.forEach((el, i) => setTimeout(() => { el.classList.add("on"); if (!settings().quiet) { try { tone(196, 0, 0.22); } catch {} } else say("boom", 1.1); }, 400 + i * 550));
  turnTimer = setTimeout(yourTurn, 600 + turnN * 550);
  row(btn("Stop", () => $("mvGame").close(), "quiet"));
}
function yourTurn() {
  if (!game) return;
  const drum = $("mvDrum"); drum.disabled = false; drum.focus({ preventScroll: true });
  $("mvGStage").querySelectorAll(".mv-beats i").forEach((x) => x.classList.remove("on"));
  prompt("Your turn! Tap the drum or make a sound.");
  let done = false, taps = 0;
  const finish = (how) => {
    if (done) return; done = true; clearTimeout(turnTimer);
    record(true, "turn", { how, taps }); const m = praise({ ok: true }); prompt(`${m} Now my turn again.`);
    turnTimer = setTimeout(playTurns, 1600);
  };
  drum.addEventListener("click", () => { taps++; if (!settings().quiet) { try { tone(262, 0, 0.18); } catch {} } clearTimeout(turnTimer); turnTimer = setTimeout(() => finish("tap"), 900); });
  if (micAllowed()) startMic().then(() => listen(6000, { stopOnVoice: true }).then((r) => { if (r.heard && !done) finish("voice"); })).catch(() => {});
  // Waiting is fine. After a while we just offer another go, no penalty.
  turnTimer = setTimeout(() => { if (!done && !taps) { prompt("Take your time. Tap the drum when you're ready."); } }, 8000);
  row(btn("Stop", () => $("mvGame").close(), "quiet"));
}
window.__mvGames = { GAMES, startGame };
if (mv) init();
