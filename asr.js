// Small-vocabulary word recognition for Sound Path's "Say the word" game.
// Off by default. Two engines, both opt-in in the Bridge:
//  - "device": vosk-browser (Apache-2.0) running on this device with a small model the
//    family hosts or downloads once (vosk-model-small-en-us, Apache-2.0, about 40 MB).
//    Recognition is limited to the game's few words (a grammar), which suits AAC users'
//    approximations far better than open dictation. Audio never leaves the device.
//  - "browser": the browser's own speech recognition. In Chrome and Safari this may send
//    audio to Google or Apple. The Bridge says so before it can be turned on.
// The recogniser only ever suggests "I heard it". It never marks a try as wrong; the
// grown-up judge still decides, and with no grown-up every try is "tried".

export const norm = (s = "") => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
export function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
// Grammar for the recogniser: the targets, their family-approved forms, and "[unk]" so
// anything else is not forced onto a target.
export function grammar(targets) {
  const w = new Set();
  for (const t of targets) for (const x of [t.say, t.approx, t.show]) { const v = norm(x); if (v && v.length < 30) w.add(v); }
  return [...w, "[unk]"];
}
// Did any alternative match the target? got = the word or the family's form; close = one edit away (3+ letters).
export function judgeHeard(alts, target) {
  const forms = [target.say, target.approx, target.show].map(norm).filter(Boolean);
  let best = null;
  for (const raw of alts || []) {
    const h = norm(raw); if (!h || h === "[unk]") continue;
    for (const word of h.split(" ")) for (const f of forms) {
      if (word === f || h === f) return { match: "got", heard: f };
      if (f.length >= 3 && lev(word, f) <= 1) best ||= { match: "close", heard: word };
    }
  }
  return best || { match: null };
}

// ---- Engines (browser only) ----
export function available(engine) {
  if (engine === "browser") return !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
  if (engine === "device") return typeof WebAssembly === "object" && !!globalThis.navigator?.mediaDevices?.getUserMedia;
  return false;
}
// Listen for up to ms. Resolves with an array of heard alternatives ([] if nothing).
export async function listenFor(engine, targets, ms = 4000, opts = {}) {
  if (engine === "browser") return browserListen(targets, ms);
  if (engine === "device") return deviceListen(targets, ms, opts.modelUrl);
  return [];
}
function browserListen(targets, ms) {
  const R = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  return new Promise((res) => {
    const r = new R(); r.lang = opts_lang(); r.interimResults = false; r.maxAlternatives = 5;
    const out = []; const done = () => { clearTimeout(tm); try { r.stop(); } catch {} res(out); };
    r.onresult = (e) => { for (const x of e.results) for (const a of x) out.push(a.transcript); done(); };
    r.onerror = r.onend = done;
    const tm = setTimeout(done, ms);
    try { r.start(); } catch { done(); }
  });
}
const opts_lang = () => document.documentElement.lang || "en-US";
let vosk = null;
// Pinned version. Families who want zero third-party requests can self-host it and the model.
export const VOSK_URL = "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js";
async function deviceListen(targets, ms, modelUrl) {
  if (!modelUrl) return [];
  if (!vosk) {
    // vosk-browser is loaded only when the family turned this on and set a model address.
    const Vosk = globalThis.Vosk || (await new Promise((res) => { const s = Object.assign(document.createElement("script"), { src: VOSK_URL, crossOrigin: "anonymous" }); s.onload = () => res(globalThis.Vosk); s.onerror = () => res(null); document.head.append(s); }));
    if (!Vosk?.createModel) return [];
    vosk = { model: await Vosk.createModel(modelUrl) };
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const ctx = new AudioContext(); const rec = new vosk.model.KaldiRecognizer(ctx.sampleRate, JSON.stringify(grammar(targets)));
  const out = [];
  rec.on("result", (m) => m.result?.text && out.push(m.result.text));
  const src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1);
  proc.onaudioprocess = (e) => { try { rec.acceptWaveform(e.inputBuffer); } catch {} };
  src.connect(proc); proc.connect(ctx.destination);
  await new Promise((r) => setTimeout(r, ms));
  try { rec.retrieveFinalResult?.(); } catch {}
  await new Promise((r) => setTimeout(r, 300));
  proc.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close(); rec.remove?.();
  return out;
}
