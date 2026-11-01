// Phase 7: gentle sound and speech games. Pure helpers (no DOM) so they can be tested.
// No losing, no timers that punish, no scores that go down. Every try earns a sticker.

export const SOUND_PICS = [
  { e: "🐮", name: "cow", say: "moo" }, { e: "🐶", name: "dog", say: "woof woof" }, { e: "🐱", name: "cat", say: "meow" },
  { e: "🦆", name: "duck", say: "quack quack" }, { e: "🚂", name: "train", say: "choo choo" }, { e: "🐍", name: "snake", say: "sssss" },
  { e: "🐝", name: "bee", say: "bzzzz" }, { e: "🚗", name: "car", say: "beep beep" }, { e: "🐑", name: "sheep", say: "baa" },
  { e: "🦁", name: "lion", say: "roar" }, { e: "🚒", name: "fire truck", say: "nee naw" }, { e: "🐸", name: "frog", say: "ribbit" },
];

// Early sounds first (m, b, p, d, n, t), then later ones. Single-consonant starts only.
export const FIRST_SOUNDS = {
  m: [{ e: "🌙", w: "moon" }, { e: "🥛", w: "milk" }, { e: "🐭", w: "mouse" }, { e: "🐒", w: "monkey" }],
  b: [{ e: "⚽", w: "ball" }, { e: "🚌", w: "bus" }, { e: "🍌", w: "banana" }, { e: "🐝", w: "bee" }],
  p: [{ e: "🐷", w: "pig" }, { e: "🍕", w: "pizza" }, { e: "🍐", w: "pear" }, { e: "🐧", w: "penguin" }],
  d: [{ e: "🐶", w: "dog" }, { e: "🦆", w: "duck" }, { e: "🚪", w: "door" }, { e: "🦕", w: "dinosaur" }],
  n: [{ e: "👃", w: "nose" }, { e: "🪺", w: "nest" }, { e: "🍜", w: "noodles" }],
  t: [{ e: "🦷", w: "teeth" }, { e: "🐯", w: "tiger" }, { e: "🐢", w: "turtle" }, { e: "🍅", w: "tomato" }],
  s: [{ e: "☀️", w: "sun" }, { e: "🧦", w: "sock" }, { e: "🦭", w: "seal" }, { e: "🥪", w: "sandwich" }],
  f: [{ e: "🐟", w: "fish" }, { e: "🦊", w: "fox" }, { e: "🍟", w: "fries" }, { e: "🔥", w: "fire" }],
};

// Long, easy sounds to copy. Vowels and continuants are kind to new talkers.
export const ECHO_SOUNDS = [
  { e: "🐍", say: "sssss", label: "a snake sound" }, { e: "🐝", say: "bzzzz", label: "a bee sound" },
  { e: "🐮", say: "mooo", label: "a cow sound" }, { e: "👻", say: "oooo", label: "a ghost sound" },
  { e: "😮", say: "aaah", label: "a big ah" }, { e: "🚂", say: "choo choo", label: "a train sound" },
];

// Seedable random so rounds can be tested.
export function rng(seed = Date.now()) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
export function shuffle(arr, r = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Three pictures, one target. "choices" lets a caregiver make it easier (2) or harder (4).
export function matchRound(r = Math.random, choices = 3) {
  const pick = shuffle(SOUND_PICS, r).slice(0, Math.max(2, Math.min(4, choices)));
  return { target: pick[0], options: shuffle(pick, r) };
}
export function firstRound(sound, r = Math.random, choices = 3) {
  const sounds = Object.keys(FIRST_SOUNDS);
  const s = FIRST_SOUNDS[sound] ? sound : sounds[Math.floor(r() * sounds.length)];
  const target = shuffle(FIRST_SOUNDS[s], r)[0];
  const others = shuffle(sounds.filter((x) => x !== s), r).slice(0, Math.max(1, Math.min(3, choices - 1))).map((x) => shuffle(FIRST_SOUNDS[x], r)[0]);
  return { sound: s, target, options: shuffle([target, ...others], r) };
}

// ---------- Microphone helpers (all on the device) ----------
export function rms(buf) { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / Math.max(1, buf.length)); }
// Loudness 0..1 on a gentle log scale (about -60 dBFS to -10 dBFS).
export function level(buf) { const db = 20 * Math.log10(rms(buf) + 1e-9); return Math.max(0, Math.min(1, (db + 60) / 50)); }
// Autocorrelation pitch for children's voices (about 80 to 1000 Hz). Returns 0 when unvoiced or too quiet.
export function pitch(buf, rate, minHz = 80, maxHz = 1000) {
  if (rms(buf) < 0.01) return 0;
  const minLag = Math.floor(rate / maxHz), maxLag = Math.min(buf.length - 1, Math.ceil(rate / minHz));
  let best = 0, bestLag = 0;
  const n = buf.length - maxLag;
  if (n < 32) return 0;
  let e0 = 0; for (let i = 0; i < n; i++) e0 += buf[i] * buf[i];
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0, e1 = 0;
    for (let i = 0; i < n; i++) { c += buf[i] * buf[i + lag]; e1 += buf[i + lag] * buf[i + lag]; }
    corr[lag] = c / Math.sqrt(e0 * e1 || 1);
  }
  // First strong peak avoids octave errors from later, equally strong peaks.
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] > 0.8 && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) { best = corr[lag]; bestLag = lag; break; }
    if (corr[lag] > best) { best = corr[lag]; bestLag = lag; }
  }
  if (best < 0.6 || !bestLag) return 0;
  const a = corr[bestLag - 1] || 0, b = corr[bestLag], c = corr[bestLag + 1] || 0, d = a - 2 * b + c;
  const shift = d ? (0.5 * (a - c)) / d : 0; // parabolic interpolation
  return rate / (bestLag + shift);
}
// Track a try: frames of { level, hz } at a fixed step. A "voiced" frame is loud enough.
export function judgeTry(frames, { stepMs = 50, threshold = 0.35, needMs = 400 } = {}) {
  const voiced = frames.filter((f) => f.level >= threshold);
  const ms = voiced.length * stepMs;
  const hz = voiced.map((f) => f.hz).filter(Boolean).sort((a, b) => a - b);
  const med = hz.length ? hz[Math.floor(hz.length / 2)] : 0;
  // We celebrate any voice. "long" is only used for a bigger cheer, never to fail a child.
  return { heard: ms >= Math.min(needMs, 200), long: ms >= needMs, ms, hz: Math.round(med), peak: Math.max(0, ...frames.map((f) => f.level)) };
}

// ---------- Rewards and streaks ----------
export const STICKERS = ["⭐", "🌈", "🫧", "🎈", "🌻", "🐢", "🚀", "🦋", "🍀", "🐳", "🌙", "🎵"];
export const stickerFor = (n) => STICKERS[n % STICKERS.length];
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
// Days in a row with at least one turn, counting today or yesterday. A missed day just starts a new run.
export function streak(plays = [], now = Date.now()) {
  const days = new Set(plays.map((p) => day(p.t)));
  let n = 0, t = now;
  if (!days.has(day(t))) t -= 864e5;
  while (days.has(day(t))) { n++; t -= 864e5; }
  return n;
}
export function praise(result, r = Math.random) {
  const big = ["Wow, I heard you!", "What a great sound!", "You did it!", "Beautiful sound!"];
  const kind = ["Nice trying!", "Thank you for playing.", "Let's do it together.", "Good listening."];
  const list = result?.long || result?.ok ? big : kind;
  return list[Math.floor(r() * list.length)];
}
