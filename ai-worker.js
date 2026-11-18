// On-device AI models, run in a Web Worker so the page stays responsive.
// Each message names its task (the URL query is lost when the service worker serves this file):
//   task "ser"          speech emotion recognition: wav2vec2 fine-tuned for emotion (ONNX, q8)
//   task "tts"          Kokoro 82M text-to-speech (ONNX, q8) through kokoro-js
//   task "asr"          Whisper tiny speech recognition (ONNX, q8) — full utterances
//   task "predict"      DistilGPT2 word prediction (ONNX, q8) — next-word suggestions
//   task "tts-mms-{L}"  MMS text-to-speech for language L (fp32) — 1,100+ languages
// Libraries load from jsDelivr (pinned versions) and models from the Hugging Face hub,
// the first time only: Transformers.js keeps model files in Cache Storage
// ("transformers-cache") and the service worker keeps the library files, so both work
// offline afterwards. Audio and text never leave the device.
const TF = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/dist/transformers.min.js";
const KOKORO = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
export const SER_MODEL = "onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX";
export const TTS_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const ASR_MODEL = "onnx-community/whisper-tiny";
export const PREDICT_MODEL = "Xenova/distilgpt2";
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
async function loadAsr(id) {
  const { pipeline, env } = await import(TF);
  env.allowLocalModels = false; env.useBrowserCache = true;
  const opts = { dtype: "q8", progress_callback: progress(id) };
  if (await hasWebGPU()) {
    try { const p = await pipeline("automatic-speech-recognition", ASR_MODEL, { ...opts, device: "webgpu" }); backend = "webgpu"; return p; }
    catch (e) { self.postMessage({ id, type: "note", text: `WebGPU ASR failed; using WebAssembly` }); }
  }
  const p = await pipeline("automatic-speech-recognition", ASR_MODEL, { ...opts, device: "wasm" }); backend = "wasm"; return p;
}
async function loadPredict(id) {
  const { pipeline, env } = await import(TF);
  env.allowLocalModels = false; env.useBrowserCache = true;
  const p = await pipeline("text-generation", PREDICT_MODEL, { dtype: "q8", device: "wasm", progress_callback: progress(id) }); backend = "wasm"; return p;
}
async function loadMmsTts(id, lang) {
  const { pipeline, env } = await import(TF);
  env.allowLocalModels = false; env.useBrowserCache = true;
  // MMS models are small (~50 MB) but need fp32 for speech quality on most languages
  const p = await pipeline("text-to-speech", `facebook/mms-tts-${lang}`, { dtype: "fp32", device: "wasm", progress_callback: progress(id) }); backend = "wasm"; return p;
}

self.onmessage = async ({ data: m }) => {
  const reply = (x) => self.postMessage({ id: m.id, ...x });
  try {
    if (!task) { task = m.task; forceWasm = !!m.wasm; }
    const mmslang = task?.startsWith("tts-mms") ? (task.slice(8) || "eng") : null;
    if (!ready) ready = task === "ser" ? loadSer(m.id)
      : task === "tts" ? loadTts(m.id)
      : task === "asr" ? loadAsr(m.id)
      : task === "predict" ? loadPredict(m.id)
      : mmslang ? loadMmsTts(m.id, mmslang)
      : Promise.reject(new Error("unknown task"));
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
    if (task === "asr" && m.type === "transcribe") {
      const t0 = performance.now();
      const opts = {};
      if (m.lang) opts.language = m.lang;
      if (m.translate) opts.task = "translate";
      const out = await model(m.audio, opts);
      return reply({ type: "result", result: { text: (out.text || "").trim(), backend, ms: Math.round(performance.now() - t0) } });
    }
    if (task === "predict" && m.type === "complete") {
      const t0 = performance.now();
      const count = Math.min(8, m.count || 5);
      const outs = await model(m.text || "", { max_new_tokens: 4, num_beams: count, num_return_sequences: count, do_sample: false });
      const seen = new Set();
      const predictions = (Array.isArray(outs) ? outs : [outs])
        .map((o) => {
          const added = (o.generated_text || "").slice((m.text || "").length).trimStart();
          return added.split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, "");
        })
        .filter((w) => w && w.length > 0 && !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()));
      return reply({ type: "result", result: { predictions, backend, ms: Math.round(performance.now() - t0) } });
    }
    if (mmslang && m.type === "speak") {
      const t0 = performance.now();
      const out = await model(String(m.text).slice(0, 300));
      const audio = out.audio instanceof Float32Array ? out.audio : new Float32Array(out.audio);
      return self.postMessage({ id: m.id, type: "result", result: { audio, rate: out.sampling_rate, backend, ms: Math.round(performance.now() - t0) } }, [audio.buffer]);
    }
    reply({ type: "error", error: "unknown request" });
  } catch (e) { reply({ type: "error", error: e?.message || String(e) }); }
};
