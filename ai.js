// Page-side client for ai-worker.js: lazy, opt-in, cached, with progress.
export const MODELS = {
  ser: { id: "onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX", mb: 95, name: "speech feelings model" },
  tts: { id: "onnx-community/Kokoro-82M-v1.0-ONNX", mb: 92, name: "natural voice (Kokoro)" },
};
export const KOKORO_VOICES = [
  ["af_heart", "Heart, American English"], ["af_bella", "Bella, American English"], ["am_michael", "Michael, American English"],
  ["bf_emma", "Emma, British English"], ["bm_george", "George, British English"],
];
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
  total = Math.max(total, MODELS[task].mb * 1e6 * 0.9);
  return { loaded, total, pct: Math.min(100, Math.round((loaded / total) * 100)), mb: +(loaded / 1e6).toFixed(1) };
}
function ask(task, msg, { onProgress, onNote, transfer = [] } = {}) {
  return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej, onProgress, onNote, files: {} }); worker(task).postMessage({ id, task, wasm: localStorage.getItem("luminaac:ai-wasm") === "1", ...msg }, transfer); /* "luminaac:ai-wasm"="1" forces WebAssembly */ });
}
export const load = (task, opts) => ask(task, { type: "load" }, opts);
// Has this model been downloaded before (works offline)?
export async function cached(task) {
  try { const c = await caches.open("transformers-cache"); return (await c.keys()).some((r) => r.url.includes(MODELS[task].id) && r.url.endsWith(".onnx")); } catch { return false; }
}
// Decode any recording and resample to 16 kHz mono, as wav2vec2 expects.
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
export const synthesize = (text, voice, opts = {}) => ask("tts", { type: "speak", text, voice, speed: opts.speed }, opts);
let player = null;
export async function speakKokoro(text, voice, opts = {}) {
  const r = await synthesize(text, voice, opts);
  player?.stop?.();
  const ctx = (speakKokoro.ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  if (ctx.state === "suspended") await ctx.resume();
  const buf = ctx.createBuffer(1, r.audio.length, r.rate); buf.copyToChannel(r.audio, 0);
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
  player = src; opts.onStart?.(buf.duration);
  await new Promise((ok) => { src.onended = ok; src.start(); });
  return r;
}
export const stopKokoro = () => { try { player?.stop(); } catch {} };
