// LuminAAC app. Vanilla ES modules, no build step, works offline
// (except optional ARASAAC pictures). All data lives in localStorage.
import { CORE, FOLDERS, QUICK, SCALE, CALM_NEEDS, PLANS, contextMatchForRules } from "./vocab.js";
import { KOKORO_VOICES } from "./ai.js";
import { speakUtterance } from "./speech.js";
import { load, activeRules, exportUnifiedBackup, wipeUnifiedData } from "./shared.js";
import { mergeSchedules, pushTrail, modelingSpeechOpts } from "./slp.js";

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
const state = { words: [], folder: "core", view: "talk", plan: PLANS[0].id, unlocked: false, breathing: null, modeling: false, trail: [] };

const CLASS_NAMES = {
  people: "People", action: "Actions", describe: "Describing", thing: "Things & places",
  social: "Social", question: "Questions", negate: "Stop & no", little: "Little words",
};

// Boards imported from .obf / .obz files (stored on the shared db by support.js).
const OBF_PREFIX = "obf:";
const importedBoards = () => { try { return load().importedBoards || []; } catch { return []; } };
function folderWords(id) {
  if (id.startsWith(OBF_PREFIX)) return importedBoards().find((b) => OBF_PREFIX + b.id === id)?.words ?? [];
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

// ---------- Strip ----------
function syncDataFromStore() {
  data.log = store.get("log", []);
  data.counts = store.get("counts", {});
  data.pairs = store.get("pairs", {});
  data.moments = store.get("moments", []);
}

function renderStrip(fresh = false) {
  const box = $("#stripWords");
  box.textContent = "";
  state.words.forEach((w, i) => {
    if (i > 0) box.append(" ");
    const s = document.createElement("span");
    s.className = "word" + (fresh && i === state.words.length - 1 ? " new" : "");
    s.textContent = w.w;
    box.append(s);
  });
  $("#strip").setAttribute("aria-label", state.words.length ? `Message: ${messageText()}. Tap to speak.` : "Message is empty");
  window.dispatchEvent(new CustomEvent("luminaac:strip-changed", { detail: { words: state.words.map((w) => w.w) } }));
}
// What is spoken can differ from what is shown (an imported board's "vocalization").
const spokenOf = (w) => w.say || w.w;
const messageText = () => state.words.map(spokenOf).join(" ");

function speakMessage() {
  if (!state.words.length) { toast("Add a word first"); return; }
  const text = messageText();
  const spans = $$("#stripWords .word");
  const starts = [];
  let pos = 0;
  state.words.forEach((w) => { starts.push(pos); pos += spokenOf(w).length + 1; });
  const isMod = state.modeling;
  speakUtterance(text, {
    mode: isMod ? "modeling" : "child",
    kind: isMod ? "modeling" : "message",
    words: state.words.map(spokenOf),
    onWordBoundary(_idx, ci) {
      const idx = starts.findLastIndex((s) => s <= ci);
      spans.forEach((s, j) => {
        s.classList.toggle("lit", j === idx);
        s.classList.toggle("done", j < idx);
      });
    },
    onEnd() { spans.forEach((s) => s.classList.remove("lit", "done")); },
  });
  syncDataFromStore();
}

function addWord(item) {
  if (document.documentElement.dataset.exploring === "1") return;
  // Imported-board buttons can navigate or run a safe action instead of adding a word.
  if (item.action === ":home") { state.folder = "core"; renderFolders(); renderGrid(); return; }
  if (item.action === ":backspace") { state.words.pop(); renderStrip(); renderNext(); return; }
  if (item.action === ":clear") { state.words = []; renderStrip(); renderNext(); return; }
  if (item.action === ":speak") { speakMessage(); return; }
  if (item.action === ":space") return;
  if (item.loadBoard && importedBoards().some((b) => b.id === item.loadBoard)) {
    state.folder = OBF_PREFIX + item.loadBoard; renderFolders(); renderGrid(); return;
  }
  // Aided Language Stimulation: partner models the word.
  if (state.modeling) { modelWord(item); return; }
  state.words.push(item);
  renderStrip(true);
  if (settings.speakOnTap) speakUtterance(spokenOf(item), { mode: "child", skipLog: true });
  renderNext();
}

function modelWord(item) {
  state.words.push(item);
  state.trail = pushTrail(state.trail, item.w);
  renderStrip(true);
  paintTrail();
  if (settings.speakOnTap) speakUtterance(spokenOf(item), { ...modelingSpeechOpts(load()), skipLog: true, words: [spokenOf(item)] });
  renderNext();
}
function paintTrail() {
  $$(".modeling-hi, .is-modeled, .modeled").forEach((el) => {
    el.classList.remove("modeling-hi", "is-modeled", "modeled");
    el.removeAttribute("data-trail");
    el.removeAttribute("data-modeled");
  });
  const lows = state.trail.map((t) => t.toLowerCase());
  $$(".grid .tile, .next-row .next-chip").forEach((el) => {
    const i = lows.indexOf(String(el.dataset.w || "").toLowerCase());
    if (i >= 0) {
      el.classList.add("modeling-hi", "is-modeled", "modeled");
      el.dataset.trail = String(i + 1);
      el.dataset.modeled = "true";
    }
  });
}
function setModeling(on) {
  const changed = state.modeling !== !!on;
  state.modeling = !!on;
  state.trail = [];
  if (changed) { state.words = []; renderStrip(); renderNext(); }
  const btn = $("#modelToggle");
  btn.setAttribute("aria-pressed", String(state.modeling));
  btn.textContent = state.modeling ? "Partner modeling: ON" : "Partner modeling";
  $("#modelBanner").hidden = !state.modeling;
  document.body.classList.toggle("is-modeling", state.modeling);
  document.documentElement.dataset.modeling = state.modeling ? "true" : "false";
  paintTrail();
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
    b.dataset.w = item.w;
    b.textContent = item.w;
    b.addEventListener("click", () => addWord(item));
    row.append(b);
  });
  paintTrail();
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
  b.addEventListener("click", () => onTap(item));
  return b;
}

let lastFolderSig = "";
function orderedFolderList() {
  const db = load();
  const rules = activeRules(db);
  const { activeFolderIds } = contextMatchForRules(rules, FOLDERS, data.custom, db.signals);
  const activeSet = new Set(activeFolderIds);
  const activeFolders = FOLDERS.filter((f) => activeSet.has(f.id));
  const restFolders = FOLDERS.filter((f) => !activeSet.has(f.id));
  const imported = importedBoards().map((b) => ({ id: OBF_PREFIX + b.id, label: b.name, e: "📥" }));
  return { list: [{ id: "core", label: "Core words", e: "⭐" }, ...activeFolders, ...restFolders, ...imported], activeSet };
}

function renderFolders() {
  const bar = $("#folders");
  bar.textContent = "";
  const { list, activeSet } = orderedFolderList();
  lastFolderSig = `${state.folder}|${[...activeSet].join(",")}`;
  list.forEach((f) => {
    const isCtx = activeSet.has(f.id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "folder" + (isCtx ? " is-context" : "");
    b.dataset.f = f.id;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(state.folder === f.id));
    if (isCtx) {
      b.dataset.context = "true";
      b.setAttribute("aria-label", `${f.label} (active now)`);
    }
    b.innerHTML = `<span class="pic" aria-hidden="true">${f.e}</span>`;
    b.append(f.label);
    if (isCtx) {
      const badge = document.createElement("span");
      badge.className = "ctx-tag";
      badge.textContent = "Now";
      b.append(badge);
    }
    b.addEventListener("click", () => { state.folder = f.id; renderFolders(); renderGrid(); });
    bar.append(b);
  });
}

function renderGrid() {
  const grid = $("#grid");
  const cols = Math.max(1, Number(settings.cols) || 6);
  grid.setAttribute("role", "grid");
  grid.style.setProperty("--cols", String(cols));
  grid.textContent = "";
  const words = folderWords(state.folder);
  const rowCount = Math.max(1, Math.ceil(words.length / cols));
  grid.setAttribute("aria-colcount", String(cols));
  grid.setAttribute("aria-rowcount", String(rowCount));

  for (let i = 0; i < words.length; i += cols) {
    const row = document.createElement("div");
    row.className = "grid-row";
    row.setAttribute("role", "row");
    row.style.setProperty("--cols", String(cols));
    for (const w of words.slice(i, i + cols)) {
      const cell = document.createElement("div");
      cell.className = "grid-cell";
      cell.setAttribute("role", "gridcell");
      cell.append(tile(w, addWord));
      row.append(cell);
    }
    grid.append(row);
  }
  const used = [...new Set(words.map((w) => w.c))];
  $("#legend").innerHTML = used.map((c) => `<span data-c="${c}"><i></i>${CLASS_NAMES[c]}</span>`).join("");
  loadPictos(grid);
  paintTrail();
}

function renderQuick() {
  const q = $("#quick");
  q.textContent = "";
  QUICK.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "phrase";
    b.dataset.c = p.c;
    b.dataset.w = p.w;
    b.innerHTML = `<span class="pic" aria-hidden="true">${p.e}</span>`;
    b.append(p.w);
    b.addEventListener("click", () => speakUtterance(p.w, {
      mode: "child",
      kind: "quick",
      functionTag: p.c === "negate" ? "protest" : p.c === "social" ? "social" : "request",
    }));
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
  img.onload = () => { pic.textContent = ""; pic.append(img); };
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
    b.addEventListener("click", () => speakUtterance(n.w, { mode: "child", kind: "calm", functionTag: "request" }));
    needs.append(b);
  });
}

function pickScale(s, btn) {
  $$(".scale-btn").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  speakUtterance(s.say, { mode: "child", kind: "scale", functionTag: "emotion" });
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
  let inhale = true;
  const step = () => {
    orb.classList.toggle("in", inhale);
    cue.textContent = inhale ? "Breathe in" : "Breathe out";
    inhale = !inhale;
  };
  step();
  state.breathing = setInterval(step, 4000);
  $("#breatheToggle").textContent = "Pause breathing";
}
function stopBreathing() {
  clearInterval(state.breathing);
  state.breathing = null;
  $("#orb").classList.remove("in");
  $("#breatheToggle").textContent = "Start breathing";
}

// ---------- Plans ----------
function renderPlans() {
  const picker = $("#planPicker");
  picker.textContent = "";
  // One unified list: built-in plans, caregiver stories / routines, and caregiver schedules.
  const db = load();
  const schedules = mergeSchedules(PLANS, db.stories || [], db.schedules || []);
  if (!schedules.some((p) => p.id === state.plan)) state.plan = schedules[0].id;
  schedules.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "folder";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(state.plan === p.id));
    const pic = document.createElement("span");
    pic.className = "pic";
    pic.setAttribute("aria-hidden", "true");
    pic.textContent = p.e;
    b.append(pic, p.title);
    b.addEventListener("click", () => { state.plan = p.id; renderPlans(); });
    picker.append(b);
  });

  const plan = schedules.find((p) => p.id === state.plan);
  const done = new Set(data.plans[plan.id] || []);
  const current = plan.steps.findIndex((_, i) => !done.has(i));

  const ft = $("#firstThen");
  ft.textContent = "";
  const card = (small, strong, emoji, cls = "") => {
    const d = document.createElement("div");
    d.className = "ft-card" + cls;
    const s = document.createElement("small");
    s.textContent = small;
    const st = document.createElement("strong");
    if (emoji) { const e = document.createElement("span"); e.setAttribute("aria-hidden", "true"); e.textContent = emoji; st.append(e); }
    st.append(strong);
    d.append(s, st);
    return d;
  };
  if (current === -1) {
    const reset = document.createElement("div");
    reset.className = "ft-card";
    const rb = document.createElement("button");
    rb.className = "ghost-btn"; rb.type = "button"; rb.id = "planReset"; rb.textContent = "Start again";
    rb.addEventListener("click", () => { data.plans[plan.id] = []; save("plans"); renderPlans(); });
    reset.append(rb);
    ft.append(card("Finished", "All done", "🎉", " now"), reset);
  } else {
    const now = plan.steps[current];
    const then = plan.steps[current + 1];
    ft.append(card("Now", now.t, now.e, " now"), card("Then", then ? then.t : "All done", then ? then.e : "🏁"));
    if (done.size > 0) {
      const rb = document.createElement("button");
      rb.className = "ghost-btn"; rb.type = "button"; rb.id = "planReset"; rb.textContent = "Start again";
      rb.addEventListener("click", () => { data.plans[plan.id] = []; save("plans"); renderPlans(); });
      ft.append(rb);
    }
  }

  const list = $("#steps");
  list.textContent = "";
  plan.steps.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "step" + (done.has(i) ? " done" : "") + (i === current ? " current" : "");
    li.innerHTML = `<div class="step-pic" aria-hidden="true"></div>
      <div><h3></h3><div class="step-says"></div></div>
      <button class="check-btn" type="button" aria-pressed="${done.has(i)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`;
    $(".step-pic", li).textContent = s.e || "";
    $("h3", li).textContent = s.t;
    $(".check-btn", li).setAttribute("aria-label", `${s.t}: ${done.has(i) ? "done" : "mark done"}`);
    s.say.forEach((p) => {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "say-chip";
      c.dataset.w = p;
      c.textContent = p;
      c.addEventListener("click", () => speakUtterance(p, { mode: "child", kind: "plan", functionTag: "request" }));
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
}

// ---------- Caregiver ----------
function renderCare() {
  syncDataFromStore();
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
  $("#testVoice").addEventListener("click", () => speakUtterance("Hello. This is my voice.", { mode: "child", skipLog: true }));

  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportUnifiedBackup(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `luminaac-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#resetBtn").addEventListener("click", async () => {
    if (!confirm("Erase message history, word counts and moments on this device? Custom words and settings stay.")) return;
    await wipeUnifiedData({ mode: "history" });
    data.log = []; data.counts = {}; data.pairs = {}; data.moments = [];
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
  $$(".view").forEach((v) => (v.hidden = v.id !== `view-${view}`));
  $$(".nav-btn:not(a)").forEach((b) => {
    const v = b.dataset.view || "care";
    v === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current");
  });
  if (view !== "calm") { stopBreathing(); document.body.classList.remove("low-arousal"); }
  if (view === "care") renderCare();
  if (view === "plans") renderPlans();
  $("#main").focus({ preventScroll: true });
}

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
bindCareLock();
loadVoices();
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = loadVoices;

$("#btnSpeak").addEventListener("click", speakMessage);
$("#strip").addEventListener("click", speakMessage);
$("#btnBack").addEventListener("click", () => { state.words.pop(); renderStrip(); renderNext(); });
$("#btnClear").addEventListener("click", () => { state.words = []; renderStrip(); renderNext(); });
$("#breatheToggle").addEventListener("click", () => (state.breathing ? stopBreathing() : startBreathing()));
$$(".nav-btn[data-view]").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

window.addEventListener("luminaac:logged", () => {
  syncDataFromStore();
  renderNext();
  if (state.view === "care") renderCare();
});
window.addEventListener("luminaac:speech-notice", (e) => {
  if (e.detail?.message) toast(e.detail.message);
});
window.addEventListener("luminaac:add-word", (e) => {
  if (e.detail?.w) addWord(e.detail);
});
window.addEventListener("luminaac:set-words", (e) => {
  const items = Array.isArray(e.detail?.words) ? e.detail.words : [];
  state.words = items.map((x) => (typeof x === "string" ? { w: x, c: "social", e: "" } : x)).filter((x) => x && x.w);
  renderStrip(true);
  renderNext();
});
// Morphology helper: swap the last word for another form of it ("go" → "going").
window.addEventListener("luminaac:replace-last-word", (e) => {
  const w = String(e.detail?.w || "").trim();
  if (!w || !state.words.length || state.modeling) return;
  const last = state.words[state.words.length - 1];
  state.words[state.words.length - 1] = { ...last, w, say: undefined };
  renderStrip(true);
  renderNext();
});
$("#modelToggle").addEventListener("click", () => setModeling(!state.modeling));
setModeling(false);
window.addEventListener("luminaac:open-folder", (e) => {
  if (!e.detail?.id) return;
  state.folder = e.detail.id;
  renderFolders();
  renderGrid();
});
const refreshFoldersIfChanged = () => {
  const { activeSet } = orderedFolderList();
  const nextSig = `${state.folder}|${[...activeSet].join(",")}`;
  if (nextSig !== lastFolderSig) renderFolders();
  if (state.view === "plans") renderPlans();
};
window.addEventListener("luminaac:bridge-updated", refreshFoldersIfChanged);
window.addEventListener("storage", (e) => { if (e.key === "luminaac:bridge") refreshFoldersIfChanged(); });
