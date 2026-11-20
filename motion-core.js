// Motion rules (docs/MOTION-CONCEPT.md), pure so they run in node tests.
// One gate decides how much may move; the game rules for Lantern Sky, Tide
// Pool, Sound Garden, Aurora Feelings and Word Train live here too.
//
// Levels: 0 still · 1 confirmations only · 2 UI transitions · 3 ambient skies.

// ---------- The gate ----------
export const SETTING_LEVEL = { still: 0, small: 1, gentle: 3 };
export function motionLevel({ reduced = false, still = false, setting = "gentle", battery = null, charging = true, cores = 8, memory = 8 } = {}) {
  if (reduced || still) return 0;
  let lv = SETTING_LEVEL[setting] ?? 3;
  if (battery != null && battery < 0.2 && !charging) lv = Math.min(lv, 1);
  if (cores <= 2 || memory <= 2) lv = Math.min(lv, 2); // low-end tablet: no shaders or 3D
  return lv;
}
export const allows = (level, need) => level >= need;
export const NEEDS = { confirm: 1, ui: 2, ambient: 3 };

// ---------- Timing ----------
// Calm breathing: in for 4 s, out for 6 s. Returns the horizon height, 0 (low) to 1 (high).
export function breathPhase(ms, inMs = 4000, outMs = 6000) {
  const t = ((ms % (inMs + outMs)) + inMs + outMs) % (inMs + outMs);
  const ease = (x) => 0.5 - Math.cos(Math.PI * x) / 2;
  return t < inMs ? ease(t / inMs) : 1 - ease((t - inMs) / outMs);
}
export const breathing = (ms, inMs = 4000, outMs = 6000) => (((ms % (inMs + outMs)) + inMs + outMs) % (inMs + outMs)) < inMs ? "in" : "out";

// Where a flying word starts, relative to where it lands (FLIP).
export function flight(from, to) {
  const s = Math.max(0.2, Math.min(1, (to.height || 1) / (from.height || 1)));
  return { dx: from.left + from.width / 2 - (to.left + to.width / 2), dy: from.top + from.height / 2 - (to.top + to.height / 2), s: 1 / s };
}

// Number ticker: whole-number steps from a to b, at most n frames, always ending on b.
export function tickerSteps(a, b, n = 20) {
  a = Math.round(+a || 0); b = Math.round(+b || 0);
  const k = Math.max(1, Math.min(n, Math.abs(b - a)));
  return Array.from({ length: k }, (_, i) => Math.round(a + ((b - a) * (i + 1)) / k));
}

// ---------- Scene skies (shader-sky.js) ----------
// Mid-value, low-chroma colours from DESIGN.md §6, as 0..1 RGB for the shader.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const SKIES = {
  dawn: { a: "#f1dcc9", b: "#e6cbb8", c: "#f2b33d", mode: 0, cycle: 60 },
  day: { a: "#d6e6ee", b: "#c4d9e3", c: "#ffffff", mode: 0, cycle: 60 },
  dusk: { a: "#c9c3d9", b: "#a9a2c0", c: "#f2b33d", mode: 0, cycle: 70 },
  night: { a: "#26303f", b: "#1a222e", c: "#e6ecef", mode: 2, cycle: 80 },
  sea: { a: "#cfe3e2", b: "#a9cdcb", c: "#ffffff", mode: 1, cycle: 50 },
  rails: { a: "#dcd6c8", b: "#cbc4b3", c: "#f2b33d", mode: 0, cycle: 60 },
};
export function skyParams(scene = "day", level = 3) {
  const s = SKIES[scene] || SKIES.day;
  // Slowest drift is 40 s a cycle (--t-ambient). Below level 3 the sky is a still frame.
  return { a: hex(s.a), b: hex(s.b), c: hex(s.c), mode: s.mode, speed: level >= 3 ? 1 / Math.max(40, s.cycle) : 0 };
}

// ---------- Lantern Sky ----------
export const LANTERN_WORDS = ["I", "want", "more", "go", "look", "like", "big", "you", "play", "stop", "help", "all done"];
export const LANTERN_MAX = 6;
const LANTERN_SLOTS = [[0.18, 0.22], [0.5, 0.14], [0.82, 0.24], [0.3, 0.5], [0.7, 0.5], [0.5, 0.34]];
// Each tap adds a lantern. Oldest drifts away past six, so the sky never crowds.
export function lanternAdd(state = { lanterns: [] }, word, n = 0) {
  const [x, y] = LANTERN_SLOTS[n % LANTERN_MAX]; // the six live lanterns always have six different slots
  const lanterns = [...state.lanterns, { w: word, id: n, x, y }].slice(-LANTERN_MAX);
  return { lanterns, gone: state.lanterns.length >= LANTERN_MAX ? state.lanterns[0] : null };
}
// On Speak, lanterns line up left to right in the order they were tapped: a sentence constellation.
export function constellation(lanterns) {
  const n = lanterns.length, gap = n > 1 ? 0.76 / (n - 1) : 0;
  return lanterns.map((l, i) => ({ ...l, x: n > 1 ? 0.12 + i * gap : 0.5, y: 0.3 + (i % 2 ? 0.06 : 0) }));
}
export const lanternSentence = (lanterns) => lanterns.map((l) => l.w).join(" ");

// ---------- Tide Pool ----------
export const SHELLS = [
  { w: "crab", e: "🦀", x: 0.2, y: 0.35 }, { w: "fish", e: "🐟", x: 0.75, y: 0.3 }, { w: "blue", e: "💙", x: 0.5, y: 0.6 },
  { w: "more", e: "➕", x: 0.15, y: 0.75 }, { w: "star", e: "⭐", x: 0.85, y: 0.72 },
];
// A ripple grows from (x, y) at `speed` (pool widths per second). Shells inside `reach` open, nearest first.
export function rippleHits(shells, x, y, { reach = 0.35, speed = 0.25, open = [] } = {}) {
  return shells
    .map((s, i) => ({ i, w: s.w, d: Math.hypot(s.x - x, s.y - y) }))
    .filter((h) => h.d <= reach && !open.includes(h.i))
    .sort((a, b) => a.d - b.d)
    .map((h) => ({ ...h, ms: Math.round((h.d / speed) * 1000) }));
}
// The Motion slider sets the ripple: still = the nearest shell opens at once.
export const rippleFor = (level) => (level >= 3 ? { reach: 0.35, speed: 0.25 } : level >= 1 ? { reach: 0.3, speed: 1 } : { reach: 2, speed: Infinity });
export function stillHit(shells, x, y, open = []) {
  const h = rippleHits(shells, x, y, { reach: 2, speed: 1, open })[0];
  return h ? [{ ...h, ms: 0 }] : [];
}

// ---------- Sound Garden ----------
// Loudness (0..1, measured on the device and thrown away) grows the plant; a
// long sound (held 1.2 s) or reaching full height makes it bloom. Growth eases,
// so the plant never jumps.
export function gardenGrow(s = { h: 0, held: 0, bloomed: false }, loud, dtMs = 100) {
  if (s.bloomed) return { ...s, event: null };
  const voiced = loud >= 0.3;
  const held = voiced ? s.held + dtMs : Math.max(0, s.held - dtMs * 2);
  const h = Math.min(1, s.h + (voiced ? 0.012 + loud * 0.02 : 0) * (dtMs / 100));
  const bloomed = h >= 1 || held >= 1200;
  return { h: bloomed ? 1 : h, held, bloomed, event: bloomed ? "bloom" : voiced && !s.held ? "start" : null };
}
export const gardenTap = (s = { h: 0, held: 0, bloomed: false }) => gardenGrow({ ...s, held: 0 }, 0.6, 1000);

// ---------- Aurora Feelings ----------
// Each feeling has a colour and a pace. Even "excited" stays under the Calm
// budget: one wave every 6 s or slower.
export const FEELINGS = [
  { id: "calm", e: "😌", rgb: "#5f8fb0", period: 14 }, { id: "happy", e: "😊", rgb: "#d9a441", period: 10 },
  { id: "excited", e: "🤩", rgb: "#d9784a", period: 6 }, { id: "sad", e: "😢", rgb: "#6d6fa8", period: 16 },
  { id: "worried", e: "😟", rgb: "#8a7fa3", period: 12 }, { id: "angry", e: "😠", rgb: "#b5574b", period: 8 },
];
export function auroraFor(id, level = 3) {
  const f = FEELINGS.find((x) => x.id === id) || FEELINGS[0];
  return { ...f, color: hex(f.rgb), speed: level >= 3 ? 1 / Math.max(6, f.period) : 0, say: `I feel ${f.id}.` };
}

// ---------- Word Train ----------
export const TRAIN_WORDS = ["I", "want", "juice", "go", "park", "more", "big", "train", "you", "look", "eat", "play"];
export const TRAIN_MAX = 6;
export const trainCouple = (cars, w) => (cars.length >= TRAIN_MAX ? cars : [...cars, w]);
export const trainUncouple = (cars) => cars.slice(0, -1);
export function trainSwap(cars, i, j) {
  if (i === j || i < 0 || j < 0 || i >= cars.length || j >= cars.length) return cars;
  const c = [...cars]; [c[i], c[j]] = [c[j], c[i]]; return c;
}
// Where carriage i sits on the loop (0..1 around), for the 3D track.
export const carT = (i, head) => (((head - i * 0.06) % 1) + 1) % 1;
