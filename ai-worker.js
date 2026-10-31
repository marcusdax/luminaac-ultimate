// On-device AI models, run in a Web Worker so the page stays responsive.
// Each message names its task (the URL query is lost when the service worker serves this file):
//   task "ser"  speech emotion recognition: wav2vec2 fine-tuned for emotion (ONNX, q8)
//   task "tts"  Kokoro 82M text-to-speech (ONNX, q8) through kokoro-js
// Libraries load from jsDelivr (pinned versions) and models from the Hugging Face hub,
// the first time only: Transformers.js keeps model files in Cache Storage
// ("transformers-cache") and the service worker keeps the library files, so both work
// offline afterwards. Audio and text never leave the device.
const TF = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/dist/transformers.min.js";
const KOKORO = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
export const SER_MODEL = "onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX";
export const TTS_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
let task = null, forceWasm = false;
let ready = null, backend = null;

async function hasWebGPU() {
  if (forceWasm) return false;
  try { return !!(self.navigator?.gpu && (await self.navigator.gpu.requestAdapter())); } catch { return false; }
}
function progress(id) { // forward per-file download progress; the page sums it up
  return (p) => { if (p.status === "progress" || p.status === "done" || p.status === "initiate") self.postMessage({ id, type: "progress", file: p.file, loaded: p.loaded || 0, total: p.total || 0, status: p.status }); };
}
async function loadSer(id) {
  const { pipeline, env } = await import(TF);
  env.allowLocalModels = false; env.useBrowserCache = true;
  const opts = { dtype: "q8", progress_callback: progress(id) };
  if (await hasWebGPU()) {
    try { const p = await pipeline("audio-classification", SER_MODEL, { ...opts, device: "webgpu" }); backend = "webgpu"; return p; }
    catch (e) { self.postMessage({ id, type: "note", text: `WebGPU failed (${e.message}); using WebAssembly` }); }
  }
  const p = await pipeline("audio-classification", SER_MODEL, { ...opts, device: "wasm" }); backend = "wasm"; return p;
}
async function loadTts(id) {
  const { KokoroTTS } = await import(KOKORO);
  // Kokoro on WebGPU needs the fp32 weights (325 MB; too big for many phones and for
  // the browser cache), so the voice runs the 92 MB q8 weights on WebAssembly.
  const t = await KokoroTTS.from_pretrained(TTS_MODEL, { dtype: "q8", device: "wasm", progress_callback: progress(id) }); backend = "wasm"; return t;
}

self.onmessage = async ({ data: m }) => {
  const reply = (x) => self.postMessage({ id: m.id, ...x });
  try {
    if (!task) { task = m.task; forceWasm = !!m.wasm; }
    if (!ready) ready = task === "ser" ? loadSer(m.id) : task === "tts" ? loadTts(m.id) : Promise.reject(new Error("unknown task"));
    const model = await ready.catch((e) => { ready = null; throw e; });
    if (m.type === "load") return reply({ type: "result", result: { backend } });
    if (task === "ser" && m.type === "classify") {
      const t0 = performance.now();
      const out = await model(m.audio, { top_k: 6 }); // all six labels
      return reply({ type: "result", result: { scores: out, backend, ms: Math.round(performance.now() - t0) } });
    }
    if (task === "tts" && m.type === "speak") {
      const t0 = performance.now();
      const a = await model.generate(String(m.text).slice(0, 500), { voice: m.voice || "af_heart", speed: m.speed || 1 });
      const audio = a.audio instanceof Float32Array ? a.audio : new Float32Array(a.audio);
      return self.postMessage({ id: m.id, type: "result", result: { audio, rate: a.sampling_rate, backend, ms: Math.round(performance.now() - t0) } }, [audio.buffer]);
    }
    reply({ type: "error", error: "unknown request" });
  } catch (e) { reply({ type: "error", error: e?.message || String(e) }); }
};
