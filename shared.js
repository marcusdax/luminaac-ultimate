import { currentPosition } from "./geo.js";
import { speakUtterance, configureSpeech } from "./speech.js";
import { starterGestalts } from "./slp.js";
// Shared data layer for "My Voice" (index.html) and "The Bridge" (bridge.html).
// Metadata in localStorage (luminaac:bridge), media blobs in IndexedDB.
const KEY = "luminaac:bridge";
const BOARD_KEYS = ["settings", "log", "counts", "pairs", "moments", "custom", "plans"];

export const ROLES = { parent: "Parent", teacher: "Teacher", therapist: "Therapist", family: "Family" };

export function seed() {
  const now = Date.now(), H = 3600e3, D = 24 * H;
  return {
    version: 2,
    profile: { child: "", caregiver: "", role: "parent", onboarded: false, place: "home" },
    privacy: { retainDays: 30, blurFaces: true, shareMedia: false, autoDetect: true, cloudBackup: false },
    capture: { seconds: 15 },
    moments: [
      { id: "m1", t: now - 2 * H, kind: "audio", dur: 15, context: "breakfast · looking at window", aac: ["more"], meaning: "He's excited about going to the park after breakfast.", by: "parent", signalId: "s1", media: null },
      { id: "m2", t: now - 1 * D, kind: "audio", dur: 15, context: "car ride home", aac: [], meaning: "Soft 'hmm' + looks at cookie jar means she wants cookies.", by: "parent", signalId: "s2", media: null },
      { id: "m3", t: now - 2 * D, kind: "video", dur: 15, context: "classroom transition", aac: ["stop"], meaning: "", by: "teacher", signalId: null, media: null },
    ],
    signals: [
      { id: "s1", name: "Window hum", cues: ["hum", "looks at window", "rocking"], meaning: "Go to the park?", phrase: "I want to go to the park", confirmations: 6, rejections: 1, contexts: ["morning", "home"], created: now - 9 * D },
      { id: "s2", name: "Soft hmm at the jar", cues: ["soft hmm", "eye point", "kitchen"], meaning: "Wants a cookie", phrase: "I want cookies please", confirmations: 4, rejections: 0, contexts: ["afternoon", "home"], created: now - 14 * D },
      { id: "s3", name: "Hand flap by the window", cues: ["hand flapping", "near window"], meaning: "Outside", phrase: "Can we go outside?", confirmations: 3, rejections: 2, contexts: ["school"], created: now - 5 * D },
    ],
    questions: [
      { id: "q1", text: "A new high sound showed up 12 times this week, often just before transitions. What do you think it means?", status: "open" },
      { id: "q2", text: "\"All done\" is often used about 15 minutes into mealtime. Add a button for \"I don't like this food\"?", status: "open", suggestPhrase: "I don't like this food" },
    ],
    personality: [
      { id: "p1", label: "Uncle John's silly dance", e: "🕺", kind: "person", momentId: null },
      { id: "p2", label: "The big red balloon", e: "🎈", kind: "memory", momentId: null },
      { id: "p3", label: "Calming fish video", e: "🐠", kind: "calm", momentId: null },
      { id: "p4", label: "Grandma's visits", e: "👵", kind: "person", momentId: null },
    ],
    rules: [
      { id: "r1", page: "School", days: [1, 2, 3, 4, 5], from: 8, to: 15 },
      { id: "r2", page: "Bedtime", days: [0, 1, 2, 3, 4, 5, 6], from: 19, to: 21 },
    ],
    team: [
      { id: "t1", name: "Ms. Rivera", role: "teacher", access: "signals", invited: now - 4 * D },
      { id: "t2", name: "Dr. Chen (SLP)", role: "therapist", access: "full", invited: now - 10 * D },
    ],
    notes: [
      { id: "n1", t: now - 1 * D, by: "teacher", text: "Used the window hum twice at recess. Offered 'outside' and he smiled." },
    ],
    exploration: [],
    // Phase 2 (folded in from LuminAAC-Repository, luminaac, LuminAAC-Advanced and the spec doc)
    alerts: [],
    feedback: [],
    access: {
      mode: "standard",
      size: 100,
      dwell: 0,
      acceptMs: 0,
      debounceMs: 0,
      scan: false,
      scanMs: 1500,
      scanMode: "linear",
      scanAudio: false,
      scanLoops: 0,
      safety: true,
    },
    stories: [
      { id: "st1", title: "Going to the dentist", kind: "story", steps: [
        { e: "🚗", text: "We drive to the dentist." },
        { e: "🪑", text: "I sit in the big chair. It moves up." },
        { e: "🦷", text: "The dentist counts my teeth. I can hold my fish toy." },
        { e: "⭐", text: "All done. Then we go to the park." } ] },
      { id: "st2", title: "Morning routine", kind: "routine", steps: [
        { e: "🚽", text: "Bathroom" }, { e: "🪥", text: "Brush teeth" }, { e: "👕", text: "Get dressed" }, { e: "🥣", text: "Breakfast" } ] },
    ],
    practice: { reward: "stars", targets: [
      { id: "pr1", sound: "m", word: "more", e: "➕", tries: [] },
      { id: "pr2", sound: "b", word: "bubble", e: "🫧", tries: [] },
      { id: "pr3", sound: "s", word: "sun", e: "☀️", tries: [] } ] },
    sync: { url: "", key: "", version: 0, last: 0 },
    // Milestone 2: SLP tools. Starter gestalts are generic; caregivers replace them with the child's own.
    gestalts: starterGestalts(),
    choiceBoards: [],
    schedules: [],
    importedBoards: [],
    painLog: [],
    dietLog: [],
    solarLog: [],
    // Phase 3. Everything here is off until a parent turns it on.
    safety: { consent: false, consentBy: "", consentAt: 0, zones: [], sendLocation: true, watch: true, events: [] },
    account: null, // { email, name, role, family } when signed in; local-only mode needs none
    device: null, // { id, name, kind } when this device was paired with a code
    emoBase: { n: 0 }, // this child's prosody baseline, from confirmed moments only
    fl: { optIn: false, version: 0, global: null, local: null, sent: [] },
    audit: [{ t: now, what: "Sample data loaded" }],
  };
}

export function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && v.version === 2) {
      // Forward-migrate documents saved before Phase 2: fill any missing top-level keys.
      const d = seed();
      for (const k of Object.keys(d)) if (v[k] === undefined) v[k] = d[k];
      v.access = { ...d.access, ...v.access };
      return v;
    }
  } catch {}
  return seed();
}

// Communication intents (from the caregiver dashboard in LuminAAC-Repository/caregiver-app)
export const INTENTS = { help: "Asking for help", emotion: "Showing a feeling", need: "Body need (food, drink, toilet, rest)", social: "Being social", preference: "Telling a preference", request: "Asking to do or go" };

// Gentle milestones (LuminAAC-Repository index.html had 5/10/25/50/100 messages).
export const MILESTONES = [5, 10, 25, 50, 100, 250, 500];

// Record whether a suggestion was used or passed over (mirrors POST /api/predictions/feedback).
export function recordFeedback(db, accepted, s) {
  db.feedback.push({ t: Date.now(), accepted, signalId: s?.id || null, confidence: s ? confidence(s) / 100 : null, pod: partOfDay(), place: db.profile.place, mood: currentMood(db), intent: s?.intent || null });
  db.feedback = db.feedback.slice(-2000);
}

// ---------- Optional server (backend/) ----------
export async function api(db, method, path, body) {
  if (!db.sync?.url || !db.sync?.key) throw new Error("Server not set up");
  const r = await fetch(db.sync.url.replace(/\/+$/, "") + path, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${db.sync.key}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status, body: j });
  return j.data;
}

// Raise a safety alert from My Voice. Always stored locally (so a Bridge open in
// another tab on this device hears it at once) and sent to the server if set up.
export function raiseAlert(kind, message, extra = {}) {
  const db = load();
  const a = { id: uid("a"), kind, message, t: Date.now(), ack: null, from: db.profile.child || "My Voice", sent: false, ...extra };
  db.alerts = [a, ...db.alerts].slice(0, 200);
  persist(db);
  // "Take me home" carries where they are, only if a parent turned safe zones on and allowed it.
  const wantLoc = kind === "home" && !a.loc && db.safety?.consent && db.safety.sendLocation;
  const locate = wantLoc ? currentPosition(8000) : Promise.resolve(null);
  locate.then((loc) => {
    if (loc) { const d = load(); const x = d.alerts.find((y) => y.id === a.id); if (x) { x.loc = loc; persist(d); } a.loc = loc; }
    if (db.sync.url && db.sync.key) return api(db, "POST", "/api/alerts", { ...a, sent: undefined }).then(() => { const d = load(); const x = d.alerts.find((y) => y.id === a.id); if (x) { x.sent = true; persist(d); } });
  }).catch(() => {});
  return a;
}
export function persist(db) {
  const ts = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    try { window.dispatchEvent(new CustomEvent("luminaac:bridge-updated", { detail: { ts } })); } catch {}
  }
}
export const uid = (p = "x") => p + Math.random().toString(36).slice(2, 9);

export function confidence(s) {
  // Beta(1,1) prior: (confirmations+1)/(total+2); shown as a whole percent.
  return Math.round(((s.confirmations + 1) / (s.confirmations + s.rejections + 2)) * 100);
}

export function partOfDay(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? "night" : h < 11 ? "morning" : h < 17 ? "afternoon" : h < 20 ? "evening" : "night";
}

// Context-aware ranking for the predictive row
export function suggest(db, d = new Date()) {
  const pod = partOfDay(d), place = db.profile.place, mood = currentMood(db, d);
  return db.signals
    .map((s) => {
      let score = confidence(s);
      if (s.contexts.includes(pod)) score += 25;
      if (s.contexts.includes(place)) score += 15;
      if (mood && s.moods?.includes(mood)) score += 20; // a feeling the caregiver confirmed recently
      if (db.fl?.local) score += Math.round((predictUse(db.fl.local, s, pod, place, mood) - 0.5) * 20); // on-device model
      return { ...s, score };
    })
    .filter((s) => confidence(s) >= 50)
    .sort((a, b) => b.score - a.score);
}

export function activeRules(db, d = new Date()) {
  const rules = Array.isArray(db?.rules) ? db.rules : [];
  const day = d.getDay();
  const h = d.getHours();
  return rules.filter((r) => {
    if (!r || !Array.isArray(r.days)) return false;
    const from = Number(r.from);
    const to = Number(r.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
    if (from <= to) return r.days.includes(day) && h >= from && h < to;
    return (h >= from && r.days.includes(day)) || (h < to && r.days.includes((day + 6) % 7));
  });
}

// ---------- IndexedDB media ----------
function idb() {
  return new Promise((res, rej) => {
    if (!("indexedDB" in window)) return rej(new Error("no idb"));
    const r = indexedDB.open("luminaac-media", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("clips");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function putMedia(id, blob) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction("clips", "readwrite"); tx.objectStore("clips").put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export async function getMedia(id) {
  const db = await idb();
  return new Promise((res) => { const r = db.transaction("clips").objectStore("clips").get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
}
export async function clearMedia() {
  const db = await idb();
  return new Promise((res) => { const tx = db.transaction("clips", "readwrite"); tx.objectStore("clips").clear(); tx.oncomplete = res; });
}

export function speak(text, rateOrOpts = 0.9) {
  const opts = typeof rateOrOpts === "number"
    ? { mode: "child", rate: rateOrOpts, skipLog: true }
    : { mode: "child", skipLog: true, ...rateOrOpts };
  return speakUtterance(text, opts);
}

configureSpeech({ load, persist, getMedia });

export function exportUnifiedBackup() {
  const db = load();
  const board = {};
  for (const k of BOARD_KEYS) {
    try {
      const raw = localStorage.getItem("luminaac:" + k);
      if (raw !== null) board[k] = JSON.parse(raw);
    } catch {}
  }
  return { exported: new Date().toISOString(), ...db, board };
}

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const BOARD_ARRAY_KEYS = new Set(["log", "moments", "custom"]);
const BOARD_OBJECT_KEYS = new Set(["settings", "counts", "pairs", "plans"]);
const BRIDGE_ARRAY_FIELDS = [
  "signals", "moments", "rules", "exploration", "feedback",
  "personality", "stories", "questions", "team", "notes", "alerts", "audit", "milestones",
  "gestalts", "choiceBoards", "schedules", "importedBoards", "painLog", "dietLog", "solarLog",
];
const BRIDGE_OBJECT_FIELDS = [
  "profile", "access", "practice", "privacy", "capture", "sync", "safety", "fl", "emoBase", "emoPrefs",
];
const BRIDGE_NULLABLE_OBJECT_FIELDS = ["account", "device"];

export function importUnifiedBackup(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("Invalid backup");
  }
  const hasBoardProp = payload.board !== undefined;
  if (hasBoardProp && !isPlainObject(payload.board)) {
    throw new Error("Invalid backup");
  }
  const boardSrc = hasBoardProp
    ? payload.board
    : (payload.version !== 2 ? payload : null);
  const hasValidBoardEntry = boardSrc
    ? BOARD_KEYS.some((k) => boardSrc[k] !== undefined)
    : false;

  if (payload.version !== 2 && !hasValidBoardEntry) {
    throw new Error("Invalid backup");
  }
  if (boardSrc) {
    for (const k of BOARD_KEYS) {
      if (boardSrc[k] === undefined) continue;
      if (BOARD_ARRAY_KEYS.has(k) && !Array.isArray(boardSrc[k])) {
        throw new Error("Invalid backup");
      }
      if (BOARD_OBJECT_KEYS.has(k) && !isPlainObject(boardSrc[k])) {
        throw new Error("Invalid backup");
      }
    }
  }
  if (payload.version === 2) {
    for (const k of BRIDGE_ARRAY_FIELDS) {
      if (payload[k] !== undefined && !Array.isArray(payload[k])) {
        throw new Error("Invalid backup");
      }
    }
    for (const k of BRIDGE_OBJECT_FIELDS) {
      if (payload[k] !== undefined && !isPlainObject(payload[k])) {
        throw new Error("Invalid backup");
      }
    }
    for (const k of BRIDGE_NULLABLE_OBJECT_FIELDS) {
      if (payload[k] !== undefined && payload[k] !== null && !isPlainObject(payload[k])) {
        throw new Error("Invalid backup");
      }
    }
    if (payload.spoken !== undefined && (typeof payload.spoken !== "number" || !Number.isFinite(payload.spoken))) {
      throw new Error("Invalid backup");
    }
    if (payload.practice?.targets !== undefined && !Array.isArray(payload.practice.targets)) {
      throw new Error("Invalid backup");
    }
    if (payload.safety?.zones !== undefined && !Array.isArray(payload.safety.zones)) {
      throw new Error("Invalid backup");
    }
    if (payload.fl?.sent !== undefined && !Array.isArray(payload.fl.sent)) {
      throw new Error("Invalid backup");
    }
  }

  let boardUpdated = false;
  if (boardSrc) {
    for (const k of BOARD_KEYS) {
      if (boardSrc[k] !== undefined) {
        try {
          localStorage.setItem("luminaac:" + k, JSON.stringify(boardSrc[k]));
          boardUpdated = true;
        } catch {}
      }
    }
  }
  let bridgeUpdated = false;
  if (payload.version === 2) {
    const { board: _board, exported: _exported, ...bridgeRest } = payload;
    const d = seed();
    const migrated = { ...d, ...bridgeRest };
    for (const k of ["profile", "access", "practice", "privacy", "capture", "sync", "safety", "fl", "emoBase"]) {
      migrated[k] = { ...d[k], ...(bridgeRest[k] || {}) };
    }
    persist(migrated);
    bridgeUpdated = true;
  }
  return { bridgeUpdated, boardUpdated };
}

export async function wipeUnifiedData({ mode = "history" } = {}) {
  const emptyBoard = { log: [], counts: {}, pairs: {}, moments: [] };
  for (const [k, v] of Object.entries(emptyBoard)) {
    try { localStorage.setItem("luminaac:" + k, JSON.stringify(v)); } catch {}
  }
  const db = load();
  db.exploration = [];
  db.feedback = [];
  db.alerts = [];
  db.painLog = []; // body-map history is history, like messages; boards and phrases are setup and stay
  db.dietLog = [];
  db.solarLog = [];
  db.spoken = 0;
  db.milestones = [];
  if (mode === "all") {
    db.moments = [];
    db.signals = [];
    db.questions = [];
    db.notes = [];
    await clearMedia().catch(() => {});
  }
  persist(db);
  return db;
}

// ---------- Phase 3: feelings and the on-device model ----------
// The latest feeling estimate in the last 30 minutes that a caregiver confirmed
// (or a confident estimate not yet reviewed). Rejected estimates are ignored.
export function currentMood(db, d = new Date()) {
  const m = (db.moments || []).find((x) => x.emotion && d - x.t < 30 * 60e3 && x.emotion.confirmed !== false && (x.emotion.confirmed || x.emotion.conf >= 0.6));
  return m ? m.emotion.label : null;
}
const AV = { excited: [0.7, 0.5], happy: [0.3, 0.7], calm: [-0.5, 0.3], upset: [0.7, -0.6], sad: [-0.6, -0.5] };
export function moodAV(label) { return AV[label] || [0, 0]; }
// Same feature layout as fl-core.js featurize(); kept inline so My Voice stays tiny.
export function useFeatures(s, pod, place, mood) {
  const P = ["morning", "afternoon", "evening", "night"], L = ["home", "school", "therapy", "out"], I = ["help", "emotion", "need", "social", "preference", "request"];
  const x = new Array(17).fill(0); x[0] = 1;
  if (P.indexOf(pod) >= 0) x[1 + P.indexOf(pod)] = 1;
  if (L.indexOf(place) >= 0) x[5 + L.indexOf(place)] = 1;
  const [a, v] = moodAV(mood); x[9] = a; x[10] = v;
  if (I.indexOf(s?.intent) >= 0) x[11 + I.indexOf(s.intent)] = 1;
  x[16] = s ? confidence(s) / 100 : 0.5;
  return x;
}
export function predictUse(w, s, pod, place, mood) {
  const x = useFeatures(s, pod, place, mood);
  return 1 / (1 + Math.exp(-w.reduce((t, wi, i) => t + wi * x[i], 0)));
}
