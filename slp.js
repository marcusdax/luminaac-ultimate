// SLP / autism-care logic for LuminAAC (Milestone 2). Pure ES module: no DOM,
// no network. The UI lives in support.js; data lives on the shared bridge `db`.

import { cleanText } from "./obf.js";
import { PLANS } from "./vocab.js";

const uid = (p) => p + Math.random().toString(36).slice(2, 9);

// ---------- ALS modeling ----------
export const MODELING_TRAIL_MAX = 5;
export function pushTrail(trail, word, max = MODELING_TRAIL_MAX) {
  const w = cleanText(word, 80);
  if (!w) return trail.slice();
  return [...trail.filter((x) => x.toLowerCase() !== w.toLowerCase()), w].slice(-max);
}
export function modelingSpeechOpts(db) {
  void db;
  return { mode: "modeling", kind: "modeling", functionTag: "modeling", interrupt: false };
}

// ---------- Gestalt language processing (NLA) ----------
export const GESTALT_STAGES = {
  1: "Stage 1: whole phrase (gestalt)",
  2: "Stage 2: mix and mitigate",
  3: "Stage 3: single words, new sentences",
  4: "Stage 4+: grammar",
};
export const GESTALT_MAX = 120;

export function starterGestalts() {
  return [
    { id: "g_start1", text: "Ready, set, go!", stage: 1, tags: ["play"], source: "starter" },
    { id: "g_start2", text: "Time for a snack", stage: 1, tags: ["food"], source: "starter" },
    { id: "g_start3", text: "All done, let's clean up", stage: 1, tags: ["routine"], source: "starter" },
  ];
}

export function getGestalts(db) {
  return Array.isArray(db?.gestalts) ? db.gestalts : starterGestalts();
}

export function normalizeGestalt(g) {
  const text = cleanText(g?.text, GESTALT_MAX);
  if (!text) throw new Error("A gestalt needs some words");
  const stage = Math.min(4, Math.max(1, Math.round(Number(g?.stage)) || 1));
  const tags = Array.isArray(g?.tags) ? [...new Set(g.tags.map((t) => cleanText(t, 24).toLowerCase()).filter(Boolean))].slice(0, 6) : [];
  const out = {
    id: g?.id ? cleanText(g.id, 40) : uid("g"),
    text,
    stage,
    tags,
    audioClipId: g?.audioClipId ? cleanText(g.audioClipId, 60) : null,
    note: cleanText(g?.note, 160),
    source: g?.source === "starter" ? "starter" : "caregiver",
    t: Number(g?.t) || Date.now(),
  };
  if (g?.momentId) out.momentId = cleanText(g.momentId, 60);
  if (g?.meaning) out.meaning = cleanText(g.meaning, 160);
  return out;
}

export function addGestalt(db, g) {
  const n = normalizeGestalt(g);
  db.gestalts = [...(db.gestalts || []).filter((x) => x.id !== n.id), n].slice(-200);
  return n;
}
export function removeGestalt(db, id) {
  db.gestalts = (db.gestalts || []).filter((x) => x.id !== id);
}
export function gestaltSpeechOpts(g) {
  return { mode: "child", kind: "gestalt", functionTag: "social", audioClipId: g?.audioClipId || undefined };
}
export function mitigateGestalt(text, maxChunks = 4) {
  const clean = cleanText(text, GESTALT_MAX);
  if (!clean) return [];
  const byPunct = clean.split(/[,;:.!?]+/).map((s) => s.trim()).filter(Boolean);
  let chunks = byPunct.length > 1 ? byPunct : [];
  if (!chunks.length) {
    const words = clean.split(" ");
    if (words.length <= 1) return words;
    const size = Math.max(1, Math.ceil(words.length / Math.min(maxChunks, Math.ceil(words.length / 2))));
    for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(" "));
  }
  if (chunks.length > maxChunks) chunks = chunks.slice(0, maxChunks);
  return chunks;
}
export const splitGestalt = mitigateGestalt;

// ---------- Interoception body map ----------
export const BODY_REGIONS = [
  { id: "head", label: "head", e: "🤕", plural: false },
  { id: "eyes", label: "eyes", e: "👁️", plural: true },
  { id: "ears", label: "ears", e: "👂", plural: true },
  { id: "mouth", label: "mouth or teeth", e: "🦷", plural: false },
  { id: "throat", label: "throat", e: "🗣️", plural: false },
  { id: "chest", label: "chest", e: "🫁", plural: false },
  { id: "stomach", label: "stomach", e: "🫃", plural: false },
  { id: "skin", label: "skin", e: "🧴", plural: false },
  { id: "back", label: "back", e: "🧍", plural: false },
  { id: "arm", label: "arm", e: "💪", plural: false },
  { id: "hand", label: "hand", e: "✋", plural: false },
  { id: "leg", label: "leg", e: "🦵", plural: false },
  { id: "foot", label: "foot", e: "🦶", plural: false },
  { id: "private", label: "private part", e: "🛑", plural: false, sensitive: true },
];
const REGION_ALIASES = {
  tummy: { id: "tummy", label: "tummy", e: "🫃", plural: false },
  ear: { id: "ears", label: "ears", e: "👂", plural: true },
  eye: { id: "eyes", label: "eyes", e: "👁️", plural: true },
};
function resolveRegion(regionId) {
  return BODY_REGIONS.find((x) => x.id === regionId) || REGION_ALIASES[regionId] || null;
}

export const SENSATIONS = [
  { id: "hurts", label: "hurts", e: "😣", c: "negate" },
  { id: "sharp", label: "sharp", e: "⚡", c: "negate" },
  { id: "itchy", label: "itchy", e: "🧴", c: "describe" },
  { id: "hot", label: "hot", e: "🥵", c: "describe" },
  { id: "cold", label: "cold", e: "🥶", c: "describe" },
  { id: "tight", label: "tight", e: "🪢", c: "describe" },
  { id: "sick", label: "sick", e: "🤢", c: "describe" },
];
const FORMS = {
  hurts: ["hurts", "hurt"],
  sharp: ["feels sharp", "feel sharp"],
  itchy: ["is itchy", "are itchy"],
  hot: ["feels hot", "feel hot"],
  cold: ["feels cold", "feel cold"],
  tight: ["feels tight", "feel tight"],
  sick: ["feels sick", "feel sick"],
};

export function painPhrase(regionId, sensationId) {
  const r = resolveRegion(regionId);
  const s = SENSATIONS.find((x) => x.id === sensationId);
  if (!r || !s) throw new Error("Pick a place on the body and a feeling");
  if (r.sensitive) return s.id === "hurts" || s.id === "sharp" ? "Something hurts in a private place" : `Something feels ${s.label} in a private place`;
  const f = FORMS[s.id][r.plural ? 1 : 0];
  return `My ${r.label} ${f}`;
}

const RELIEF_BY_SENSATION = {
  hurts: ["Water, please", "Rest and quiet", "Ice pack", "A hug"],
  sharp: ["Tell a grown-up now", "Stop and rest"],
  itchy: ["Cream, please", "Cool water"],
  hot: ["Cool water", "Take off my coat", "Go somewhere cool"],
  cold: ["A blanket", "Warm clothes"],
  tight: ["Loosen my clothes", "Stretch with me"],
  sick: ["Go to the bathroom", "Water, please", "Lie down"],
};
const RELIEF_BY_REGION = {
  tummy: ["Go to the bathroom", "Water, please"],
  stomach: ["Go to the bathroom", "Water, please"],
  skin: ["Cream, please", "Cool water"],
  throat: ["Water, please"],
  mouth: ["Water, please"],
  ears: ["Headphones, please", "Quiet, please"],
  ear: ["Headphones, please", "Quiet, please"],
  eyes: ["Dim the lights", "Close my eyes"],
  head: ["Quiet, please", "Dim the lights"],
};
export function reliefFor(regionId, sensationId) {
  const out = [...(RELIEF_BY_REGION[regionId] || []), ...(RELIEF_BY_SENSATION[sensationId] || [])];
  out.push("Help me please", "I need a break");
  return [...new Set(out)].slice(0, 6);
}

export const SENSORY_QUICK = [
  { id: "stop", w: "Stop", say: "Stop, please", e: "✋", c: "negate", fn: "protest" },
  { id: "no", w: "No", say: "No", e: "❌", c: "negate", fn: "protest" },
  { id: "help", w: "Help", say: "Help me please", e: "🆘", c: "action", fn: "request" },
  { id: "bathroom", w: "Bathroom", say: "I need the bathroom", e: "🚻", c: "thing", fn: "request" },
  { id: "break", w: "Break", say: "I need a break", e: "⏸️", c: "negate", fn: "request" },
];

export function recordPain(db, regionId, sensationId, relief = null) {
  const phrase = painPhrase(regionId, sensationId);
  const region = resolveRegion(regionId);
  const row = { id: uid("pn"), t: Date.now(), region: regionId, sensation: sensationId, phrase, relief: relief ? cleanText(relief, 80) : null, sensitive: !!region?.sensitive };
  db.painLog = [...(db.painLog || []), row].slice(-500);
  return row;
}

// ---------- Choice boards ----------
export const CHOICE_MIN = 2;
export const CHOICE_MAX = 8;

function collectOptions(options) {
  const seen = new Set();
  const opts = [];
  for (const o of Array.isArray(options) ? options : []) {
    const w = cleanText(o?.w ?? o?.label ?? o, 60);
    if (!w || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    opts.push({ w, label: w, e: cleanText(o?.e, 32), c: o?.c || "thing" });
  }
  return opts;
}

export function makeChoiceBoard({ id, title, options } = {}) {
  const opts = collectOptions(options);
  if (opts.length < CHOICE_MIN) throw new Error(`A choice board needs at least ${CHOICE_MIN} different choices`);
  if (opts.length > CHOICE_MAX) throw new Error(`A choice board can have at most ${CHOICE_MAX} choices`);
  const name = cleanText(title, 60);
  if (!name) throw new Error("Give the choice board a name");
  return { id: id ? cleanText(id, 40) : uid("cb"), title: name, options: opts };
}

export function normalizeChoiceBoard({ id, title, options } = {}) {
  const opts = collectOptions(options).slice(0, CHOICE_MAX);
  if (opts.length < CHOICE_MIN) throw new Error(`A choice board needs at least ${CHOICE_MIN} different choices`);
  const name = cleanText(title, 60) || "Choices";
  return { id: id ? cleanText(id, 40) : uid("cb"), title: name, options: opts };
}
export const validateChoiceBoard = normalizeChoiceBoard;

export function saveChoiceBoard(db, board) {
  const b = makeChoiceBoard(board);
  db.choiceBoards = [...(db.choiceBoards || []).filter((x) => x.id !== b.id), b].slice(-50);
  return b;
}
export function removeChoiceBoard(db, id) {
  db.choiceBoards = (db.choiceBoards || []).filter((x) => x.id !== id);
}
export const choiceSentence = (opt) => `I want ${opt?.w ?? opt?.label ?? opt}`;

// ---------- Unified First-Then / visual schedules ----------
export function mergeSchedules(plansOrObj = [], stories = [], custom = []) {
  let plans = plansOrObj;
  if (plansOrObj && typeof plansOrObj === "object" && !Array.isArray(plansOrObj)) {
    plans = Array.isArray(plansOrObj.plans) ? plansOrObj.plans : PLANS;
    stories = Array.isArray(plansOrObj.stories) ? plansOrObj.stories : [];
    custom = Array.isArray(plansOrObj.schedules) ? plansOrObj.schedules : (Array.isArray(plansOrObj.custom) ? plansOrObj.custom : []);
  }
  const out = [];
  for (const p of plans || []) out.push({ id: p.id, title: p.title, e: p.e || "📋", kind: "plan", steps: (p.steps || []).map((s) => ({ t: s.t, e: s.e || "", say: [...(s.say || [])] })) });
  for (const s of stories || []) {
    const routine = s.kind === "routine";
    out.push({
      id: s.id, title: s.title, e: routine ? "🔁" : "📖", kind: s.kind || "story",
      steps: (s.steps || []).map((x) => ({ t: cleanText(x.text ?? x.t, 100), e: x.e || "", say: routine ? [] : [cleanText(x.text ?? x.t, 100)] })),
    });
  }
  for (const c of custom || []) out.push({ id: c.id, title: c.title, e: c.e || "🗓️", kind: "custom", steps: (c.steps || []).map((x) => ({ t: x.t, e: x.e || "", say: [...(x.say || [])] })) });
  const seen = new Set();
  return out.filter((x) => x.id && !seen.has(x.id) && seen.add(x.id));
}
export const getUnifiedSchedules = mergeSchedules;

export function makeSchedule({ id, title, e, steps } = {}) {
  const name = cleanText(title, 60);
  if (!name) throw new Error("Give the schedule a name");
  const list = (Array.isArray(steps) ? steps : []).map((s) => ({ t: cleanText(s?.t ?? s, 80), e: cleanText(s?.e, 32), say: (s?.say || []).map((x) => cleanText(x, 80)).filter(Boolean).slice(0, 4) })).filter((s) => s.t);
  if (list.length < 2) throw new Error("A schedule needs at least 2 steps (First, Then)");
  if (list.length > 12) throw new Error("A schedule can have at most 12 steps");
  return { id: id ? cleanText(id, 40) : uid("sc"), title: name, e: cleanText(e, 32) || "🗓️", steps: list };
}
export function saveSchedule(db, sched) {
  const s = makeSchedule(sched);
  db.schedules = [...(db.schedules || []).filter((x) => x.id !== s.id), s].slice(-50);
  return s;
}
export function removeSchedule(db, id) {
  db.schedules = (db.schedules || []).filter((x) => x.id !== id);
}
export function firstThen(schedule, done = []) {
  const d = done instanceof Set ? done : new Set(done);
  const idx = schedule.steps.findIndex((_, i) => !d.has(i));
  if (idx === -1) return { index: -1, now: null, then: null, finished: true };
  return { index: idx, now: schedule.steps[idx], then: schedule.steps[idx + 1] || null, finished: false };
}

// ---------- Vocabulary search + morphology ----------
const IRREGULAR = {
  go: ["goes", "going", "went", "gone"], eat: ["eats", "eating", "ate", "eaten"], drink: ["drinks", "drinking", "drank", "drunk"],
  see: ["sees", "seeing", "saw", "seen"], have: ["has", "having", "had"], do: ["does", "doing", "did", "done"],
  come: ["comes", "coming", "came"], give: ["gives", "giving", "gave", "given"], run: ["runs", "running", "ran"],
  sit: ["sits", "sitting", "sat"], take: ["takes", "taking", "took", "taken"], make: ["makes", "making", "made"],
};
const IRREG_BACK = new Map();
for (const [base, forms] of Object.entries(IRREGULAR)) for (const f of forms) IRREG_BACK.set(f, base);

export function stem(word) {
  const w = cleanText(word, 60).toLowerCase();
  if (IRREG_BACK.has(w)) return IRREG_BACK.get(w);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) { const b = w.slice(0, -3); return b.length > 2 && b.at(-1) === b.at(-2) ? b.slice(0, -1) : b; }
  if (w.length > 4 && w.endsWith("ed")) { const b = w.slice(0, -2); return b.length > 2 && b.at(-1) === b.at(-2) ? b.slice(0, -1) : b; }
  if (w.length > 3 && w.endsWith("es") && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function morphVariants(word) {
  const w = cleanText(word, 60).toLowerCase();
  if (!w || /\s/.test(w)) return [];
  const base = IRREG_BACK.get(w) || w;
  const out = new Set();
  if (IRREGULAR[base]) IRREGULAR[base].forEach((f) => out.add(f));
  else {
    const e = base.endsWith("e"), y = /[^aeiou]y$/.test(base);
    out.add(y ? base.slice(0, -1) + "ies" : /(s|x|z|ch|sh)$/.test(base) ? base + "es" : base + "s");
    out.add(e ? base.slice(0, -1) + "ing" : base + "ing");
    out.add(e ? base + "d" : y ? base.slice(0, -1) + "ied" : base + "ed");
  }
  out.delete(w);
  return [...out];
}

function editDistanceAtMost1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const SEMANTIC_CONCEPTS = {
  thirsty: ["drink", "water", "juice", "milk", "thirsty"],
  beverage: ["drink", "water", "juice", "milk"],
  hydration: ["water", "drink", "thirsty"],
  hungry: ["eat", "snack", "food", "apple", "banana", "pizza", "sandwich", "hungry"],
  bathroom: ["bathroom", "toilet", "washroom"],
  restroom: ["bathroom", "toilet"],
  loud: ["too loud", "headphones", "quiet", "a break"],
  noisy: ["too loud", "headphones", "quiet"],
  hurt: ["hurt", "sick", "help", "doctor"],
  pain: ["hurt", "sick", "help"],
  sleepy: ["tired", "sleep", "bed"],
};

export function searchVocab(query, { core = [], folders = [], custom = [] } = {}, limit = 12) {
  const q = cleanText(query, 60).toLowerCase();
  if (!q) return [];
  const qs = stem(q);
  const queryTokens = q.split(/\s+/).filter(Boolean);
  const semanticTargets = new Set();
  for (const tok of queryTokens) {
    for (const target of SEMANTIC_CONCEPTS[tok] || []) semanticTargets.add(target);
  }
  const pool = [
    ...core.map((x) => ({ ...x, where: "core" })),
    ...folders.flatMap((f) => (f.words || []).map((x) => ({ ...x, where: f.id }))),
    ...custom.map((x) => ({ ...x, where: x.f || "core" })),
  ];
  const seen = new Set();
  const scored = [];
  for (const it of pool) {
    const w = String(it.w || "").toLowerCase();
    if (!w) continue;
    const key = w + "|" + it.where;
    if (seen.has(key)) continue;
    seen.add(key);
    let s = 0;
    if (w === q) s = 100;
    else if (w.startsWith(q)) s = 80;
    else if (w.split(" ").some((p) => p.startsWith(q))) s = 65;
    else if (stem(w) === qs) s = 60;
    else if (semanticTargets.has(w)) s = 55;
    else if (q.length >= 3 && w.includes(q)) s = 45;
    else if (q.length >= 4 && editDistanceAtMost1(w, q)) s = 30;
    if (s) scored.push({ item: it, s: s - (it.where === "core" ? 0 : 1) });
  }
  scored.sort((a, b) => b.s - a.s || a.item.w.length - b.item.w.length);
  return scored.slice(0, limit).map((x) => x.item);
}
