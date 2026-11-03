// LuminAAC app. Vanilla ES modules, no build step, works offline
// (except optional ARASAAC pictures). All data lives in localStorage.
import { CORE, FOLDERS, QUICK, SCALE, CALM_NEEDS, PLANS } from "./vocab.js";
import { KOKORO_VOICES } from "./ai.js";
import { hasVoice, hasPhoto, playVoice, applyPhoto } from "./symbols.js";
import { buildOBZ, readOBZ, wordsFromBoard, mergeWords } from "./obf-core.js";
import { flyTo, swap, pillMove } from "./motion-gate.js";
import { mountCalmSky } from "./shader-sky.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const WEEK = 7 * 24 * 3600 * 1000;

// ---------- Storage (fails soft: private windows still work) ----------
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem("luminaac:" + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("luminaac:" + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const DEFAULTS = {
  theme: "auto", cols: "6", pictos: true, labelsTop: false,
  voice: "", rate: 0.9, speakOnTap: true, stillness: false,
};
const settings = { ...DEFAULTS, ...store.get("settings", {}) };
const data = {
  log: store.get("log", []),            // [{t, text, kind}]
  counts: store.get("counts", {}),      // word -> n
  pairs: store.get("pairs", {}),        // prev -> {next: n}
  moments: store.get("moments", []),
  custom: store.get("custom", []),      // [{w,e,c,f}]
  plans: store.get("plans", {}),        // planId -> stepsDone[]
  pictoIds: { not: 0, "don't": 0, ...store.get("pictoIds", {}) },  // word -> ARASAAC id | 0 (0 = no ARASAAC match: use OpenMoji, skip the search)
};
const save = (k) => store.set(k, data[k]);

// ---------- State ----------
const state = { words: [], folder: "core", view: "talk", plan: PLANS[0].id, unlocked: false, breathing: null };

const CLASS_NAMES = {
  people: "People", action: "Actions", describe: "Describing", thing: "Things & places",
  social: "Social", question: "Questions", negate: "Stop & no", little: "Little words",
};

function folderWords(id) {
  const base = id === "core" ? CORE : FOLDERS.find((f) => f.id === id)?.words ?? [];
  return base.concat(data.custom.filter((x) => x.f === id));
}
const lexicon = new Map();
function rebuildLexicon() {
  lexicon.clear();
  [...CORE, ...FOLDERS.flatMap((f) => f.words), ...data.custom].forEach((x) => {
    if (!lexicon.has(x.w.toLowerCase())) lexicon.set(x.w.toLowerCase(), x);
  });
}

// ---------- Speech ----------
let voices = [];
function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  voices = speechSynthesis.getVoices().filter((v) => v.lang?.startsWith("en"));
  const sel = $("#voiceSelect");
  sel.length = 1; sel.querySelectorAll("optgroup").forEach((g) => g.remove());
  // Opt-in natural voices (Kokoro, on-device). They download about 92 MB the first time.
  const nat = document.createElement("optgroup"); nat.label = "Natural voices (download about 92 MB once)";
  KOKORO_VOICES.forEach(([id, name]) => nat.append(new Option(name, "kokoro:" + id)));
  const dev = document.createElement("optgroup"); dev.label = "This device's voices";
  voices.forEach((v) => dev.append(new Option(`${v.name} (${v.lang})`, v.name)));
  sel.append(nat); if (voices.length) sel.append(dev);
  sel.value = settings.voice;
}

function say(text, opts = {}) {
  const { onWord, onEnd } = opts;
  // A caregiver's own recording of this exact word or phrase wins over any synthetic voice.
  if (!opts.system && !opts.synth && hasVoice(text)) {
    speechSynthesis?.cancel?.();
    playVoice(text).then((ok) => (ok ? onEnd?.() : say(text, { ...opts, synth: true })));
    return;
  }
  if (String(settings.voice || "").startsWith("kokoro:") && !opts.system) {
    // Natural voice runs on this device in a worker; any failure falls back to the system voice.
    const starts = [...text.matchAll(/\S+/g)].map((m) => m.index); let timer;
    speechSynthesis?.cancel?.();
    import("./ai.js").then((ai) => ai.speakKokoro(text, settings.voice.slice(7), {
      speed: Number(settings.rate) || 1,
      onProgress: (p) => window.dispatchEvent(new CustomEvent("voice:progress", { detail: p })),
      onStart: (secs) => { let i = 0; onWord?.(0); window.dispatchEvent(new CustomEvent("voice:progress", { detail: { pct: 100, done: true } })); timer = setInterval(() => { i += 1; if (i < starts.length) onWord?.(starts[i]); else clearInterval(timer); }, (secs * 1000) / Math.max(1, starts.length)); },
    })).then(() => { clearInterval(timer); onEnd?.(); })
      .catch(() => { clearInterval(timer); toast("The natural voice isn't available right now, so the device voice is speaking."); say(text, { ...opts, system: true }); });
    return;
  }
  if (!("speechSynthesis" in window)) { toast("This device can't speak aloud. The message is shown on screen."); onEnd?.(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = voices.find((x) => x.name === settings.voice);
  if (v) u.voice = v;
  u.rate = Number(settings.rate);
  let gotBoundary = false;
  let timer;
  u.onboundary = (e) => {
    if (e.name && e.name !== "word") return;
    gotBoundary = true;
    clearInterval(timer);
    onWord?.(e.charIndex);
  };
  u.onstart = () => {
    onWord?.(0);
    // Some voices never send word boundaries; estimate pacing instead.
    let i = 0;
    const starts = [...text.matchAll(/\S+/g)].map((m) => m.index);
    timer = setInterval(() => {
      if (gotBoundary) return clearInterval(timer);
      i += 1;
      if (i < starts.length) onWord?.(starts[i]); else clearInterval(timer);
    }, 330 / u.rate);
  };
  u.onend = u.onerror = () => { clearInterval(timer); onEnd?.(); };
  speechSynthesis.speak(u);
}

function record(text, kind = "message") {
  data.log.push({ t: Date.now(), text, kind });
  if (data.log.length > 5000) data.log.splice(0, data.log.length - 5000);
  save("log");
}

// ---------- Strip ----------
function renderStrip(fresh = false) {
  const box = $("#stripWords");
  box.textContent = "";
  state.words.forEach((w, i) => {
    const s = document.createElement("span");
    s.className = "word" + (fresh && i === state.words.length - 1 ? " new" : "");
    s.textContent = w.w;
    box.append(s);
  });
  $("#strip").setAttribute("aria-label", state.words.length ? `Message: ${messageText()}. Tap to speak.` : "Message is empty");
}
const messageText = () => state.words.map((w) => w.w).join(" ");

function speakMessage() {
  if (!state.words.length) { toast("Add a word first"); return; }
  const text = messageText();
  const spans = $$("#stripWords .word");
  const starts = [];
  let pos = 0;
  state.words.forEach((w) => { starts.push(pos); pos += w.w.length + 1; });
  say(text, {
    onWord(ci) {
      let idx = starts.findLastIndex((s) => s <= ci);
      spans.forEach((s, j) => {
        s.classList.toggle("lit", j === idx);
        s.classList.toggle("done", j < idx);
      });
    },
    onEnd() { spans.forEach((s) => s.classList.remove("lit", "done")); },
  });
  record(text);
  state.words.forEach((w, i) => {
    const k = w.w.toLowerCase();
    data.counts[k] = (data.counts[k] || 0) + 1;
    if (i > 0) {
      const p = state.words[i - 1].w.toLowerCase();
      (data.pairs[p] ||= {})[k] = (data.pairs[p][k] || 0) + 1;
    }
  });
  save("counts"); save("pairs");
}

function addWord(item, src) {
  state.words.push(item);
  renderStrip(true);
  if (src) flyTo(src, $("#stripWords .word:last-child")); // the word travels to the strip (docs/MOTION-CONCEPT.md)
  if (settings.speakOnTap) say(item.w);
  renderNext();
}

// ---------- Next-word ideas (learned locally from what's been said) ----------
const STARTERS = {
  people: ["want", "need", "like", "feel"],
  action: ["more", "help", "a break", "that"],
  negate: ["like", "want", "that", "go"],
  default: ["please", "more", "all done", "help"],
};
function renderNext() {
  const row = $("#nextRow");
  row.textContent = "";
  const last = state.words.at(-1);
  let ideas;
  if (!last) {
    ideas = ["I", "help", "what", "stop"];
    $("#nextLabel").textContent = "Start with";
  } else {
    const learned = Object.entries(data.pairs[last.w.toLowerCase()] || {})
      .sort((a, b) => b[1] - a[1]).map(([w]) => w);
    ideas = [...new Set([...learned, ...(STARTERS[last.c] || STARTERS.default)])]
      .filter((w) => w.toLowerCase() !== last.w.toLowerCase())
      .slice(0, 5);
    $("#nextLabel").textContent = "Next";
  }
  ideas.forEach((w) => {
    const item = lexicon.get(w.toLowerCase()) || { w, c: "little" };
    const b = document.createElement("button");
    b.type = "button";
    b.className = "next-chip";
    b.dataset.c = item.c;
    b.textContent = item.w;
    b.addEventListener("click", () => addWord(item, b));
    row.append(b);
  });
}

// ---------- Board ----------
function tile(item, onTap) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tile";
  b.dataset.c = item.c;
  b.dataset.w = item.w;
  if (item.p) b.dataset.p = item.p; // pinned ARASAAC id when search picks the wrong sense
  b.setAttribute("aria-label", `${item.w}, ${CLASS_NAMES[item.c] || ""}`);
  const pic = document.createElement("span");
  pic.className = "pic";
  pic.setAttribute("aria-hidden", "true");
  pic.textContent = item.e || "";
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = item.w;
  b.append(pic, label);
  applyPhoto(pic, item.w); // a photo symbol replaces the picture when a caregiver added one
  b.addEventListener("click", () => onTap(item, b));
  return b;
}

function renderFolders() {
  const bar = $("#folders");
  bar.textContent = "";
  [{ id: "core", label: "Core words", e: "⭐" }, ...FOLDERS].forEach((f) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "folder";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(state.folder === f.id));
    b.innerHTML = `<span class="pic" aria-hidden="true">${f.e}</span>`;
    b.append(f.label);
    b.addEventListener("click", () => swap(() => { state.folder = f.id; renderFolders(); renderGrid(); }));
    bar.append(b);
  });
}

function renderGrid() {
  const grid = $("#grid");
  grid.setAttribute("role", "group");
  grid.style.setProperty("--cols", settings.cols);
  grid.textContent = "";
  const words = folderWords(state.folder);
  words.forEach((w) => grid.append(tile(w, addWord)));
  const used = [...new Set(words.map((w) => w.c))];
  $("#legend").innerHTML = used.map((c) => `<span data-c="${c}"><i></i>${CLASS_NAMES[c]}</span>`).join("");
  loadPictos(grid);
}

function renderQuick() {
  const q = $("#quick");
  q.textContent = "";
  QUICK.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "phrase";
    b.dataset.c = p.c;
    b.innerHTML = `<span class="pic" aria-hidden="true">${p.e}</span>`;
    b.append(p.w);
    b.addEventListener("click", () => { say(p.w); record(p.w, "quick"); });
    q.append(b);
  });
}

// ---------- ARASAAC pictograms (optional, cached ids, emoji fallback) ----------
const pictoQueue = [];
let pictoActive = 0;
function loadPictos(root) {
  if (!settings.pictos) return;
  $$(".tile", root).forEach((t) => {
    const w = t.dataset.w.toLowerCase();
    if (hasPhoto(w)) return; // the family's own photo wins
    if (t.dataset.p) return setPicto(t, t.dataset.p);
    if (data.pictoIds[w] === 0) return setMoji(t);
    if (data.pictoIds[w]) return setPicto(t, data.pictoIds[w]);
    pictoQueue.push(t);
  });
  pumpPictos();
}
function setPicto(t, id) {
  const pic = $(".pic", t);
  const img = new Image();
  img.alt = "";
  img.decoding = "async";
  img.src = `https://static.arasaac.org/pictograms/${id}/${id}_300.png`;
  img.onload = () => { if (pic.querySelector(".sym-photo")) return; pic.textContent = ""; pic.append(img); };
  img.onerror = () => setMoji(t); // ARASAAC 404 or offline: use the local OpenMoji picture
}
// Local fallback pictures (OpenMoji, CC BY-SA 4.0, vendored in vendor/openmoji).
// Same drawn style across the board, works offline, no network request leaves the device.
function setMoji(t) {
  const pic = $(".pic", t);
  if (!pic || pic.querySelector("img")) return;
  const e = pic.textContent.trim();
  if (!e) return;
  const hex = [...e].map((c) => c.codePointAt(0).toString(16).toUpperCase()).filter((h) => h !== "FE0F").join("-");
  const img = new Image();
  img.alt = ""; img.decoding = "async"; img.className = "moji";
  img.src = `vendor/openmoji/${hex}.svg`;
  img.onload = () => { pic.textContent = ""; pic.append(img); };
}
function pumpPictos() {
  while (pictoActive < 4 && pictoQueue.length) {
    const t = pictoQueue.shift();
    const w = t.dataset.w.toLowerCase();
    if (data.pictoIds[w] !== undefined) { if (data.pictoIds[w]) setPicto(t, data.pictoIds[w]); continue; }
    pictoActive++;
    fetch(`https://api.arasaac.org/v1/pictograms/en/bestsearch/${encodeURIComponent(w)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        const id = list?.[0]?._id || 0;
        data.pictoIds[w] = id;
        save("pictoIds");
        if (id && t.isConnected) setPicto(t, id); else if (t.isConnected) setMoji(t);
      })
      .catch(() => { if (t.isConnected) setMoji(t); /* offline: local picture now, retry ARASAAC next session */ })
      .finally(() => { pictoActive--; pumpPictos(); });
  }
}

// ---------- Calm ----------
function renderCalm() {
  const box = $("#scale");
  box.textContent = "";
  SCALE.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "scale-btn";
    b.dataset.c = s.hue;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<b>${s.n}</b><span>${s.label}</span>`;
    b.addEventListener("click", () => pickScale(s, b));
    box.append(b);
  });
  const needs = $("#needs");
  needs.textContent = "";
  CALM_NEEDS.forEach((n) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "need";
    b.innerHTML = `<span class="pic" aria-hidden="true">${n.e}</span>`;
    b.append(n.w);
    b.addEventListener("click", () => { say(n.w); record(n.w, "calm"); });
    needs.append(b);
  });
}

function pickScale(s, btn) {
  $$(".scale-btn").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  say(s.say);
  record(s.say, "scale");
  const high = s.n >= 3;
  $("#calmRoom").hidden = !high;
  $("#partnerCard").hidden = !high;
  document.body.classList.toggle("low-arousal", s.n >= 4);
  if (high) startBreathing(); else stopBreathing();
}

function startBreathing() {
  stopBreathing();
  const orb = $("#orb");
  const cue = $("#breatheCue");
  // In for 4 s, out for 6 s (DESIGN.md --t-breath-in / --t-breath-out). The Calm sky follows the same clock.
  let inhale = true;
  const step = () => {
    orb.classList.toggle("in", inhale);
    cue.textContent = inhale ? "Breathe in" : "Breathe out";
    state.breathing = setTimeout(step, inhale ? 4000 : 6000);
    inhale = !inhale;
  };
  calmSky.breathe(Date.now());
  step();
  $("#breatheToggle").textContent = "Pause breathing";
}
function stopBreathing() {
  clearTimeout(state.breathing);
  calmSky.breathe(null);
  state.breathing = null;
  $("#orb").classList.remove("in");
  $("#breatheToggle").textContent = "Start breathing";
}

// The Calm sky: a slow shader horizon inside the breathing panel (shader-sky.js).
const calmSky = mountCalmSky($("#breathe"));

// ---------- Plans ----------
function renderPlans() {
  const picker = $("#planPicker");
  picker.textContent = "";
  PLANS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "folder";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(state.plan === p.id));
    b.innerHTML = `<span class="pic" aria-hidden="true">${p.e}</span>`;
    b.append(p.title);
    b.addEventListener("click", () => { state.plan = p.id; renderPlans(); });
    picker.append(b);
  });

  const plan = PLANS.find((p) => p.id === state.plan);
  const done = new Set(data.plans[plan.id] || []);
  const current = plan.steps.findIndex((_, i) => !done.has(i));

  const ft = $("#firstThen");
  if (current === -1) {
    ft.innerHTML = `<div class="ft-card now"><small>Finished</small><strong>🎉 All done</strong></div>
      <div class="ft-card"><button class="ghost-btn" type="button" id="planReset">Start again</button></div>`;
    $("#planReset").addEventListener("click", () => { data.plans[plan.id] = []; save("plans"); renderPlans(); });
  } else {
    const now = plan.steps[current];
    const then = plan.steps[current + 1];
    ft.innerHTML = `<div class="ft-card now"><small>Now</small><strong><span aria-hidden="true">${now.e}</span>${now.t}</strong></div>
      <div class="ft-card"><small>Then</small><strong><span aria-hidden="true">${then ? then.e : "🏁"}</span>${then ? then.t : "All done"}</strong></div>`;
  }

  const list = $("#steps");
  list.textContent = "";
  plan.steps.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "step" + (done.has(i) ? " done" : "") + (i === current ? " current" : "");
    li.innerHTML = `<div class="step-pic" aria-hidden="true">${s.e}</div>
      <div><h3></h3><div class="step-says"></div></div>
      <button class="check-btn" type="button" aria-pressed="${done.has(i)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`;
    $("h3", li).textContent = s.t;
    $(".check-btn", li).setAttribute("aria-label", `${s.t}: ${done.has(i) ? "done" : "mark done"}`);
    s.say.forEach((p) => {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "say-chip";
      c.textContent = p;
      c.addEventListener("click", () => { say(p); record(p, "plan"); });
      $(".step-says", li).append(c);
    });
    $(".check-btn", li).addEventListener("click", () => {
      done.has(i) ? done.delete(i) : done.add(i);
      data.plans[plan.id] = [...done];
      save("plans");
      renderPlans();
    });
    list.append(li);
  });
  dispatchEvent(new CustomEvent("mv:plans"));
}

// ---------- Caregiver ----------
function renderCare() {
  const since = Date.now() - WEEK;
  const week = data.log.filter((x) => x.t >= since);
  const msgs = week.filter((x) => x.kind === "message");
  const words = msgs.reduce((n, x) => n + x.text.split(/\s+/).length, 0);
  const calm = week.filter((x) => x.kind === "scale" || x.kind === "calm").length;
  $("#stats").innerHTML = `<div><dt>Messages</dt><dd>${week.filter((x) => x.kind !== "scale").length}</dd></div>
    <div><dt>Words built</dt><dd>${words}</dd></div><div><dt>Calm visits</dt><dd>${calm}</dd></div>`;

  const top = Object.entries(data.counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const bars = $("#bars");
  bars.textContent = "";
  if (!top.length) {
    bars.innerHTML = `<li class="empty">Words will appear here after the first spoken message.</li>`;
  } else {
    const max = top[0][1];
    top.forEach(([w, n]) => {
      const item = lexicon.get(w) || { c: "little" };
      const li = document.createElement("li");
      li.dataset.c = item.c;
      li.innerHTML = `<span></span><span class="bar"><i style="width:${(n / max) * 100}%"></i></span><span class="n">${n}</span>`;
      li.firstChild.textContent = w;
      bars.append(li);
    });
  }

  const ml = $("#moments");
  ml.textContent = "";
  data.moments.slice().reverse().forEach((m) => {
    const li = document.createElement("li");
    li.innerHTML = `<b></b><span></span><br /><small></small>`;
    li.children[0].textContent = m.sign;
    li.children[1].textContent = `Means: ${m.meaning}`;
    li.children[3].textContent = [m.context, new Date(m.t).toLocaleDateString()].filter(Boolean).join(", ");
    ml.append(li);
  });

  const fs = $("#folderSelect");
  if (!fs.length) {
    [{ id: "core", label: "Core words" }, ...FOLDERS].forEach((f) => fs.add(new Option(f.label, f.id)));
  }
  const cl = $("#customList");
  cl.textContent = "";
  data.custom.forEach((c, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span></span><button type="button">Remove</button>`;
    li.firstChild.textContent = `${c.e || ""} ${c.w}`;
    li.lastChild.setAttribute("aria-label", `Remove ${c.w}`);
    li.lastChild.addEventListener("click", () => {
      data.custom.splice(i, 1); save("custom"); rebuildLexicon(); renderCare(); renderGrid();
    });
    cl.append(li);
  });
}

function bindCareForms() {
  $("#momentForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    data.moments.push({ t: Date.now(), sign: f.get("sign").trim(), meaning: f.get("meaning").trim(), context: f.get("context").trim() });
    save("moments");
    e.target.reset();
    renderCare();
    toast("Moment saved");
  });
  $("#wordForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    data.custom.push({ w: f.get("w").trim(), e: f.get("e").trim(), c: f.get("c"), f: f.get("f") });
    save("custom");
    rebuildLexicon();
    e.target.reset();
    renderCare();
    renderGrid();
    toast("Word added");
  });

  const form = $("#settings");
  form.theme.value = settings.theme;
  form.cols.value = settings.cols;
  form.pictos.checked = settings.pictos;
  form.labelsTop.checked = settings.labelsTop;
  form.rate.value = settings.rate;
  form.speakOnTap.checked = settings.speakOnTap;
  form.stillness.checked = settings.stillness;
  form.addEventListener("change", () => {
    Object.assign(settings, {
      theme: form.theme.value, cols: form.cols.value, pictos: form.pictos.checked,
      labelsTop: form.labelsTop.checked, voice: form.voice.value, rate: Number(form.rate.value),
      speakOnTap: form.speakOnTap.checked, stillness: form.stillness.checked,
    });
    store.set("settings", settings);
    applySettings();
    renderGrid();
  });
  $("#testVoice").addEventListener("click", () => say("Hello. This is my voice."));

  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), settings, ...data, pictoIds: undefined }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `luminaac-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Erase message history, word counts and moments on this device? Custom words and settings stay.")) return;
    data.log = []; data.counts = {}; data.pairs = {}; data.moments = [];
    ["log", "counts", "pairs", "moments"].forEach(save);
    renderCare();
    renderNext();
    toast("History erased");
  });
}

// Press-and-hold keeps the caregiver area out of reach of accidental taps.
function bindCareLock() {
  const btn = $("#careBtn");
  let start = 0, raf = 0;
  const HOLD = 2000;
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / HOLD);
    btn.style.setProperty("--hold", p);
    if (p >= 1) { cancel(); state.unlocked = true; show("care"); return; }
    raf = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (state.view === "care") return;
    start = performance.now();
    btn.classList.add("holding");
    raf = requestAnimationFrame(tick);
  };
  const cancel = () => { cancelAnimationFrame(raf); btn.classList.remove("holding"); btn.style.setProperty("--hold", 0); };
  btn.addEventListener("pointerdown", begin);
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, cancel));
  btn.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); begin(); } });
  btn.addEventListener("keyup", (e) => { if (e.key === "Enter" || e.key === " ") cancel(); });
  btn.addEventListener("click", () => { if (state.view !== "care") toast("Press and hold to open"); });
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  $("#lockBtn").addEventListener("click", () => show("talk"));
}

// ---------- Views ----------
function show(view) {
  if (view === "care" && !state.unlocked) return;
  if (view !== "care") state.unlocked = false;
  state.view = view;
  const was = $(".nav-btn[aria-current]");
  $$(".view").forEach((v) => (v.hidden = v.id !== `view-${view}`));
  $$(".nav-btn:not(a)").forEach((b) => {
    const v = b.dataset.view || "care";
    v === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current");
  });
  pillMove(was, $(".nav-btn[aria-current]"));
  calmSky.active(view === "calm");
  if (view !== "calm") { stopBreathing(); document.body.classList.remove("low-arousal"); }
  if (view === "care") renderCare();
  if (view === "plans") renderPlans();
  $("#main").focus({ preventScroll: true });
  dispatchEvent(new CustomEvent("mv:show", { detail: view }));
}
// For the redesign shell (myvoice-redesign.js): switch views and know the open plan.
window.__myvoice = { show, openCare() { state.unlocked = true; show("care"); }, get view() { return state.view; }, get plan() { return state.plan; } };

function applySettings() {
  const root = document.documentElement;
  if (settings.theme === "auto") root.removeAttribute("data-theme");
  else root.dataset.theme = settings.theme === "day" ? "day" : settings.theme;
  document.body.classList.toggle("still", settings.stillness);
  document.body.classList.toggle("labels-top", settings.labelsTop);
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2400);
}

// ---------- Boot ----------
rebuildLexicon();
applySettings();
renderStrip();
renderQuick();
renderNext();
renderFolders();
renderGrid();
renderCalm();
bindCareForms();
bindOBF();
bindCareLock();
loadVoices();
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = loadVoices;

$("#btnSpeak").addEventListener("click", speakMessage);
$("#strip").addEventListener("click", speakMessage);
$("#btnBack").addEventListener("click", () => { state.words.pop(); renderStrip(); renderNext(); });
$("#btnClear").addEventListener("click", () => { state.words = []; renderStrip(); renderNext(); });
$("#breatheToggle").addEventListener("click", () => (state.breathing ? stopBreathing() : startBreathing()));
$$(".nav-btn[data-view]").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

// ---------- Open Board Format import and export (v0.15) ----------
function myBoards() {
  const mine = (id) => data.custom.filter((x) => x.f === id).map(({ w, e, c }) => ({ w, e, c }));
  return [{ id: "core", name: "Core words", words: [...CORE, ...mine("core")].map(({ w, e, c }) => ({ w, e, c })), cols: 6 },
    ...FOLDERS.map((f) => ({ id: f.id, name: f.label, e: f.e, words: [...f.words, ...mine(f.id)].map(({ w, e, c }) => ({ w, e, c })), cols: 4 }))];
}
async function inflateRaw(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function bindOBF() {
  const sel = $("#obfFolder"), status = $("#obfStatus");
  if (!sel) return;
  [{ id: "core", label: "Core words" }, ...FOLDERS].forEach((f) => sel.add(new Option(f.label, f.id)));
  $("#btnObfExport").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([buildOBZ(myBoards())], { type: "application/zip" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `luminaac-boards-${new Date().toISOString().slice(0, 10)}.obz` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    status.textContent = "Saved your boards as an .obz file.";
  });
  $("#obfForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), file = f.get("file");
    if (!file?.size) return;
    if (file.size > 30e6) { status.textContent = "That file is too big (over 30 MB)."; return; }
    try {
      const u8 = new Uint8Array(await file.arrayBuffer());
      const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
      const words = isZip ? (await readOBZ(u8, inflateRaw)).flatMap((b) => b.words) : wordsFromBoard(JSON.parse(new TextDecoder().decode(u8)));
      const existing = [...CORE, ...FOLDERS.flatMap((x) => x.words)].map((x) => x.w);
      const add = mergeWords(data.custom, existing, words, f.get("f")).slice(0, 300);
      data.custom.push(...add); save("custom"); rebuildLexicon(); renderCare(); renderGrid();
      status.textContent = add.length ? `Added ${add.length} word${add.length > 1 ? "s" : ""}. Words you already had were skipped.` : "No new words. You already have every word on that board.";
      e.target.reset();
    } catch (err) { status.textContent = err?.message?.startsWith("This") || err?.message?.startsWith("No ") ? err.message : "That file couldn't be read as a board."; }
  });
}
