// On-device AI models, run in a Web Worker so the page stays responsive.
// Each message names its task (the URL query is lost when the service worker serves this file):
//   task "ser"     speech emotion recognition: wav2vec2 fine-tuned for emotion (ONNX, q8)
//   task "tts"     Kokoro 82M text-to-speech (ONNX, q8) through kokoro-js (Apache-2.0)
//   task "embed"   semantic symbol & signal embeddings: Xenova/all-MiniLM-L6-v2 (ONNX, q8, Apache-2.0)
//   task "expand"  opt-in telegraphic utterance expansion: onnx-community/SmolLM2-135M-Instruct-ONNX-MHA (q4f16, Apache-2.0)
const TF = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/dist/transformers.min.js";
const KOKORO = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
export const SER_MODEL = "onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX";
export const TTS_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EXPAND_MODEL = "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA";
let task = null, forceWasm = false;
let ready = null, backend = null;

async function hasWebGPU() {
  if (forceWasm) return false;
  try { return !!(self.navigator?.gpu && (await self.navigator.gpu.requestAdapter())); } catch { return false; }
}
function progress(id) {
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
  const t = await KokoroTTS.from_pretrained(TTS_MODEL, { dtype: "q8", device: "wasm", progress_callback: progress(id) }); backend = "wasm"; return t;
}
async function loadEmbed(id) {
  const { pipeline, env } = await import(TF);
  env.allowLocalModels = false; env.useBrowserCache = true;
  const opts = { dtype: "q8", device: "wasm", progress_callback: progress(id) };
  const p = await pipeline("feature-extraction", EMBED_MODEL, opts); backend = "wasm"; return p;
}
async function loadExpand(id) {
  const { pipeline, env } = await import(TF);
  env.allowLocalModels = false; env.useBrowserCache = true;
  const device = (await hasWebGPU()) ? "webgpu" : "wasm";
  const p = await pipeline("text-generation", EXPAND_MODEL, { dtype: "q4f16", device, progress_callback: progress(id) });
  backend = device;
  return p;
}

self.onmessage = async ({ data: m }) => {
  const reply = (x) => self.postMessage({ id: m.id, ...x });
  try {
    if (!task) { task = m.task; forceWasm = !!m.wasm; }
    if (!ready) {
      ready = task === "ser" ? loadSer(m.id)
        : task === "tts" ? loadTts(m.id)
        : task === "embed" ? loadEmbed(m.id)
        : task === "expand" ? loadExpand(m.id)
        : Promise.reject(new Error("unknown task"));
    }
    const model = await ready.catch((e) => { ready = null; throw e; });
    if (m.type === "load") return reply({ type: "result", result: { backend } });
    if (task === "ser" && m.type === "classify") {
      const t0 = performance.now();
      const out = await model(m.audio, { top_k: 6 });
      return reply({ type: "result", result: { scores: out, backend, ms: Math.round(performance.now() - t0) } });
    }
    if (task === "tts" && m.type === "speak") {
      const t0 = performance.now();
      const a = await model.generate(String(m.text).slice(0, 500), { voice: m.voice || "af_heart", speed: m.speed || 1 });
      const audio = a.audio instanceof Float32Array ? a.audio : new Float32Array(a.audio);
      return self.postMessage({ id: m.id, type: "result", result: { audio, rate: a.sampling_rate, backend, ms: Math.round(performance.now() - t0) } }, [audio.buffer]);
    }
    if (task === "embed" && m.type === "embed") {
      const t0 = performance.now();
      const out = await model(String(m.text || "").slice(0, 500), { pooling: "mean", normalize: true });
      return reply({ type: "result", result: { vector: Array.from(out.data || []), backend, ms: Math.round(performance.now() - t0) } });
    }
    if (task === "expand" && m.type === "expand") {
      const t0 = performance.now();
      const words = Array.isArray(m.words) ? m.words.join(" ") : String(m.words || "");
      const prompt = `Expand these child AAC words into one short, natural first-person sentence under 100 characters: "${words}"\nSentence:`;
      const out = await model(prompt, { max_new_tokens: 32, temperature: 0.2, do_sample: false });
      const raw = Array.isArray(out) ? out[0]?.generated_text || "" : String(out || "");
      const cleaned = raw.split("Sentence:").pop().trim().split("\n")[0].replace(/^["']|["']$/g, "").trim();
      return reply({ type: "result", result: { text: cleaned, backend, ms: Math.round(performance.now() - t0) } });
    }
    reply({ type: "error", error: "unknown request" });
  } catch (e) { reply({ type: "error", error: e?.message || String(e) }); }
};
