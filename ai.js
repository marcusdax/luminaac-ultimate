// Page-side client for ai-worker.js: lazy, opt-in, cached, with progress,
// plus deterministic offline fallbacks for child prosody and semantic search.

export const MODELS = {
  ser: { id: "onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX", mb: 95, name: "speech feelings model" },
  tts: { id: "onnx-community/Kokoro-82M-v1.0-ONNX", mb: 92, name: "natural voice (Kokoro)" },
  embed: { id: "Xenova/all-MiniLM-L6-v2", mb: 23, name: "semantic symbol search (MiniLM)" },
  expand: { id: "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA", mb: 118, name: "telegraphic utterance expander (SmolLM2)" },
};

const kv = (id, name) => Object.assign([id, name], { id, name });
export const KOKORO_VOICES = [
  kv("af_heart", "Heart, American English"),
  kv("af_sky", "Sky (bright child-friendly), American English"),
  kv("af_nicole", "Nicole (calm soft), American English"),
  kv("af_bella", "Bella, American English"),
  kv("am_puck", "Puck (upbeat youth), American English"),
  kv("am_michael", "Michael, American English"),
  kv("bf_isabella", "Isabella, British English"),
  kv("bf_emma", "Emma, British English"),
  kv("bm_george", "George, British English"),
];

export function shapeProsody({ pitchSemitones = 0, emotion = null, rate = 1 } = {}) {
  const rawSemi = Number(pitchSemitones);
  const clampedSemi = Number.isFinite(rawSemi) ? Math.max(-12, Math.min(12, rawSemi)) : 0;
  const emoMap = {
    excited: { semi: 1.5, rateMul: 1.08, pitchDelta: 0.12 },
    happy: { semi: 1.0, rateMul: 1.04, pitchDelta: 0.08 },
    calm: { semi: -0.5, rateMul: 0.92, pitchDelta: -0.05 },
    sad: { semi: -1.0, rateMul: 0.9, pitchDelta: -0.08 },
    upset: { semi: 0, rateMul: 0.95, pitchDelta: 0 },
  };
  const emo = emoMap[String(emotion || "").toLowerCase()] || { semi: 0, rateMul: 1, pitchDelta: 0 };
  const totalSemi = Math.max(-12, Math.min(12, clampedSemi + emo.semi));
  const playbackRate = Math.pow(2, totalSemi / 12);
  const pitch = Math.max(0.5, Math.min(2.0, +(1 + totalSemi * 0.05 + emo.pitchDelta).toFixed(3)));
  const baseRate = Number(rate) || 1;
  return {
    pitchSemitones: clampedSemi,
    totalSemitones: totalSemi,
    playbackRate,
    pitch,
    rate: baseRate,
    emotion: emotion || null,
  };
}
export const applyChildProsody = shapeProsody;

// ---------- Deterministic Offline Semantic Embedding & Search ----------
const CONCEPT_CLUSTERS = [
  ["drink", "water", "juice", "milk", "thirsty", "thirst", "beverage", "hydration", "cup", "sip", "bottle"],
  ["eat", "food", "hungry", "hunger", "snack", "apple", "banana", "crackers", "sandwich", "pizza", "pasta", "cereal", "chicken", "lunch", "dinner", "breakfast", "meal"],
  ["bathroom", "toilet", "restroom", "potty", "washroom", "pee", "poop", "diaper"],
  ["loud", "noisy", "noise", "headphones", "earmuffs", "quiet", "silence", "ears", "sound"],
  ["bright", "light", "lights", "eyes", "dark", "dim", "sunglasses"],
  ["hurt", "hurts", "pain", "ache", "ouch", "sore", "sharp", "sick", "stomach", "tummy", "head", "throat", "medicine", "doctor", "ice"],
  ["itchy", "scratch", "skin", "rash", "cream", "lotion", "hot", "cold", "tight", "coat", "blanket", "shoes"],
  ["happy", "excited", "glad", "joy", "smile", "laugh", "fun", "funny", "yay"],
  ["sad", "upset", "cry", "crying", "angry", "mad", "frustrated", "scared", "afraid", "overwhelmed", "wobbly", "worried"],
  ["calm", "breathe", "relax", "rest", "peace", "hug", "squeeze", "space", "break", "pause"],
  ["go", "outside", "park", "playground", "swing", "walk", "run", "leave", "home", "school", "store", "car", "bus", "pool", "library"],
  ["play", "toy", "ball", "blocks", "game", "book", "story", "music", "song", "draw", "drawing", "tablet", "tv"],
  ["mom", "mother", "dad", "father", "parent", "family", "grandma", "grandpa", "brother", "sister", "teacher", "friend", "doctor"],
  ["stop", "no", "not", "don't", "dont", "all done", "finished", "enough", "wait"],
  ["help", "please", "need", "want", "more", "again", "open", "turn"],
  ["what", "where", "who", "when", "why", "how", "question", "look", "see"],
];

const EMBED_DIM = 64;

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function embedTextSync(text) {
  const vec = new Float32Array(EMBED_DIM);
  const raw = String(text ?? "").trim().toLowerCase();
  if (!raw) {
    vec[0] = 1;
    return vec;
  }

  // 1. Activate semantic concept clusters (dims 0..15)
  for (let c = 0; c < CONCEPT_CLUSTERS.length; c++) {
    for (const kw of CONCEPT_CLUSTERS[c]) {
      if (raw.includes(kw)) {
        vec[c] += 2.5;
      }
    }
  }

  // 2. Activate word stems and character 3-grams (dims 16..63)
  const words = raw.split(/[\s,.;:!?()"'-]+/).filter(Boolean);
  for (const w of words) {
    const stem = w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w;
    const slot = 16 + (fnv1a(stem) % (EMBED_DIM - 16));
    vec[slot] += 1.5;
    for (let i = 0; i <= w.length - 3; i++) {
      const tri = w.slice(i, i + 3);
      const tSlot = 16 + (fnv1a(tri) % (EMBED_DIM - 16));
      vec[tSlot] += 0.5;
    }
  }

  // 3. Also hash non-ASCII symbols/emojis so emoji queries match emoji docs
  for (const ch of [...raw]) {
    if (ch.codePointAt(0) > 127) {
      const eSlot = 16 + (ch.codePointAt(0) % (EMBED_DIM - 16));
      vec[eSlot] += 2.0;
    }
  }

  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;
  } else {
    vec[0] = 1;
  }
  return vec;
}

export async function embedText(text) {
  return embedTextSync(text);
}

export function cosineSim(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export async function semanticSimilarity(a, b) {
  return cosineSim(embedTextSync(a), embedTextSync(b));
}

export function semanticSearchSync(query, docs = [], { limit = 10 } = {}) {
  const q = String(query ?? "").trim();
  if (!q || !Array.isArray(docs) || !docs.length) return [];
  const qLow = q.toLowerCase();
  const qVec = embedTextSync(qLow);
  const scored = docs.map((doc) => {
    const dText = typeof doc === "string"
      ? doc
      : [doc.text, doc.label, doc.w, doc.vocalization, doc.name, doc.meaning, doc.phrase, ...(Array.isArray(doc.cues) ? doc.cues : [])]
          .filter(Boolean)
          .join(" ");
    const dLow = dText.toLowerCase();
    let score = cosineSim(qVec, embedTextSync(dLow));
    if (dLow.includes(qLow)) score += 0.5;
    return { doc, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => (typeof x.doc === "object" ? { ...x.doc, score: x.score } : x.doc));
}

export async function semanticSearch(query, docs = [], opts = {}) {
  return semanticSearchSync(query, docs, opts);
}

// ---------- Worker RPC ----------
const workers = {}, pending = new Map(); let seq = 0;
function worker(task) {
  if (workers[task]) return workers[task];
  const w = new Worker(new URL("./ai-worker.js", import.meta.url), { type: "module", name: `luminaac-${task}` });
  w.onmessage = ({ data }) => {
    const p = pending.get(data.id); if (!p) return;
    if (data.type === "progress") { p.files[data.file] = { loaded: data.loaded, total: data.total || p.files[data.file]?.total || 0, done: data.status === "done" }; return p.onProgress?.(sum(p.files, task)); }
    if (data.type === "note") return p.onNote?.(data.text);
    pending.delete(data.id);
    data.type === "result" ? p.res(data.result) : p.rej(new Error(data.error));
  };
  w.onerror = (e) => { for (const [id, p] of pending) { p.rej(new Error(e.message || "AI worker failed")); pending.delete(id); } delete workers[task]; };
  return (workers[task] = w);
}
function sum(files, task) {
  let loaded = 0, total = 0; for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
  total = Math.max(total, (MODELS[task]?.mb || 50) * 1e6 * 0.9);
  return { loaded, total, pct: Math.min(100, Math.round((loaded / total) * 100)), mb: +(loaded / 1e6).toFixed(1) };
}
function ask(task, msg, { onProgress, onNote, transfer = [] } = {}) {
  return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej, onProgress, onNote, files: {} }); worker(task).postMessage({ id, task, wasm: typeof localStorage !== "undefined" && localStorage.getItem("luminaac:ai-wasm") === "1", ...msg }, transfer); });
}
export const load = (task, opts) => ask(task, { type: "load" }, opts);
export async function cached(task) {
  try { const c = await caches.open("transformers-cache"); return (await c.keys()).some((r) => r.url.includes(MODELS[task].id) && r.url.endsWith(".onnx")); } catch { return false; }
}
export async function to16k(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const ab = await ctx.decodeAudioData(await blob.arrayBuffer());
    const secs = Math.min(ab.duration, 20), off = new OfflineAudioContext(1, Math.max(1, Math.ceil(secs * 16000)), 16000);
    const src = off.createBufferSource(); src.buffer = ab; src.connect(off.destination); src.start();
    return (await off.startRendering()).getChannelData(0);
  } finally { ctx.close?.(); }
}
export async function classifySpeech(input, opts) {
  const audio = input instanceof Float32Array ? input : await to16k(input);
  const copy = new Float32Array(audio);
  return ask("ser", { type: "classify", audio: copy }, { ...opts, transfer: [copy.buffer] });
}
export async function synthesize(text, voice, opts = {}) {
  if (!workers.tts && !(await cached("tts"))) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 40) : 0;
    try {
      const r = await fetch("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js", { method: "HEAD", signal: ctrl?.signal });
      if (!r.ok) throw new Error("Kokoro CDN unreachable");
    } finally {
      if (t) clearTimeout(t);
    }
  }
  return ask("tts", { type: "speak", text, voice, speed: opts.speed }, opts);
}
let player = null;
export async function speakKokoro(text, voice, opts = {}) {
  const r = await synthesize(text, voice, opts);
  player?.stop?.();
  const ctx = (speakKokoro.ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  if (ctx.state === "suspended") await ctx.resume();
  const buf = ctx.createBuffer(1, r.audio.length, r.rate); buf.copyToChannel(r.audio, 0);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const prosody = shapeProsody(opts);
  if (src.playbackRate) src.playbackRate.value = prosody.playbackRate;
  src.connect(ctx.destination);
  player = src; opts.onStart?.(buf.duration / (prosody.playbackRate || 1));
  await new Promise((ok) => { src.onended = ok; src.start(); });
  return r;
}
export const stopKokoro = () => { try { player?.stop(); } catch {} };
