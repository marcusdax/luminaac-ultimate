// Page-side client for ai-worker.js: lazy, opt-in, cached, with progress.
import { VOICES } from "./voice-core.js";
export const MODELS = {
  ser: { id: "onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX", mb: 95, name: "speech feelings model" },
  tts: { id: "onnx-community/Kokoro-82M-v1.0-ONNX", mb: 92, name: "natural voice (Kokoro)" },
  asr: { id: "onnx-community/whisper-tiny", mb: 150, name: "speech recognition (Whisper)" },
  predict: { id: "Xenova/distilgpt2", mb: 85, name: "word prediction" },
  embed: { id: "Xenova/all-MiniLM-L6-v2", mb: 23, name: "meaning search" },
  expand: { id: "HuggingFaceTB/SmolLM2-135M-Instruct", mb: 118, name: "sentence helper" },
};
// MMS covers 1,107 languages; each model is ~50 MB and cached after first use.
export const MMS_MB = 50;
export const mmsTtsModelId = (lang) => `facebook/mms-tts-${lang}`;
export const KOKORO_VOICES = VOICES;
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
  try {
    const c = await caches.open("transformers-cache");
    const id = MODELS[task]?.id ?? (task?.startsWith("tts-mms") ? mmsTtsModelId(task.slice(8) || "eng") : null);
    if (!id) return false;
    return (await c.keys()).some((r) => r.url.includes(id) && r.url.endsWith(".onnx"));
  } catch { return false; }
}
// Check if the MMS model for a specific language is cached
export async function cachedMms(lang) {
  try {
    const c = await caches.open("transformers-cache");
    const id = mmsTtsModelId(lang);
    return (await c.keys()).some((r) => r.url.includes(id) && r.url.endsWith(".onnx"));
  } catch { return false; }
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
// opts.playbackRate above 1 raises the pitch (see voice-core.js); the caller slows
// opts.speed by the same amount, so the words take the same time.
let player = null;
export async function speakKokoro(text, voice, opts = {}) {
  const r = await synthesize(text, voice, opts);
  player?.stop?.();
  const ctx = (speakKokoro.ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  if (ctx.state === "suspended") await ctx.resume();
  const buf = ctx.createBuffer(1, r.audio.length, r.rate); buf.copyToChannel(r.audio, 0);
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
  const pr = Number(opts.playbackRate) || 1; src.playbackRate.value = pr;
  player = src; opts.onStart?.(buf.duration / pr);
  await new Promise((ok) => { src.onended = ok; src.start(); });
  return r;
}
export const stopKokoro = () => { try { player?.stop(); } catch {} };

// ---- Whisper ASR ----
// Transcribe a recording or Float32Array to text. lang is a Whisper language name
// ("english", "spanish", "french", …). translate:true converts to English.
export async function transcribe(input, opts = {}) {
  const audio = input instanceof Float32Array ? input : await to16k(input);
  const copy = new Float32Array(audio);
  return ask("asr", { type: "transcribe", audio: copy, lang: opts.lang, translate: opts.translate }, { ...opts, transfer: [copy.buffer] });
}

// ---- Neural word prediction ----
// Returns { predictions: string[], backend, ms } for next-word suggestions.
// text is the current sentence bar content (e.g. "I want").
export const predictWords = (text, opts = {}) =>
  ask("predict", { type: "complete", text: (text || "").trimEnd() + " ", count: opts.count || 5 }, opts);

// ---- MMS multilingual TTS ----
// lang is an ISO 639-3 code supported by facebook/mms-tts (e.g. "spa", "fra", "hin").
// Returns { audio: Float32Array, rate: number, backend, ms }.
export const synthMmsTts = (text, lang, opts = {}) =>
  ask(`tts-mms-${lang || "eng"}`, { type: "speak", text }, opts);

let mmsPlayer = null;
export async function speakMms(text, lang, opts = {}) {
  const r = await synthMmsTts(text, lang, opts);
  mmsPlayer?.stop?.();
  const ctx = (speakMms.ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  if (ctx.state === "suspended") await ctx.resume();
  const buf = ctx.createBuffer(1, r.audio.length, r.rate); buf.copyToChannel(r.audio, 0);
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
  mmsPlayer = src; opts.onStart?.(buf.duration);
  await new Promise((ok) => { src.onended = ok; src.start(); });
  return r;
}
export const stopMms = () => { try { mmsPlayer?.stop(); } catch {} };

// ---- Meaning search (all-MiniLM-L6-v2) ----
// Returns one 384-number vector per text, normalised, so a dot product is the cosine.
export const embed = (texts, opts = {}) => ask("embed", { type: "embed", texts: texts.map((t) => String(t).slice(0, 200)) }, opts);

// ---- Sentence helper (SmolLM2-135M-Instruct) ----
// Returns { text } with the model's raw reply. expand-core.js checks every line.
export const expandText = (promptText, opts = {}) => ask("expand", { type: "expand", prompt: promptText }, opts);
