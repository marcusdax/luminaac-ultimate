// On-device emotion estimates. Nothing here sends audio, video or features anywhere.
// Voice: prosody from Web Audio (pitch, pitch movement, loudness, tempo).
// Speech model (optional): wav2vec2 emotion classifier via Transformers.js (see ai.js).
// Face (optional): Human (MIT, vladmandic/human), vendored locally; voice-only if it can't run.
// Every result is an estimate for a caregiver to confirm, never a fact.
export const LABELS = { excited: { e: "🤩", t: "excited" }, happy: { e: "😊", t: "happy" }, calm: { e: "😌", t: "calm" }, upset: { e: "😣", t: "upset" }, sad: { e: "😔", t: "low or tired" } };

function pitchOf(buf, rate) { // autocorrelation, 75–700 Hz (children's voices run high)
  const n = buf.length; let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n); if (rms < 0.01) return 0;
  const minLag = Math.floor(rate / 700), maxLag = Math.floor(rate / 75);
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0; for (let i = 0; i + lag < n; i++) s += buf[i] * buf[i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  let e0 = 0; for (let i = 0; i < n; i++) e0 += buf[i] * buf[i];
  return best / e0 > 0.3 && bestLag ? rate / bestLag : 0;
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

export function features(samples, rate) {
  const N = 2048, H = 1024, pitches = [], energy = [];
  for (let i = 0; i + N <= samples.length; i += H) {
    const f = samples.subarray(i, i + N);
    let s = 0; for (let k = 0; k < N; k++) s += f[k] * f[k];
    energy.push(Math.sqrt(s / N));
    const p = pitchOf(f, rate); if (p) pitches.push(p);
  }
  const db = energy.map((e) => 20 * Math.log10(e + 1e-6));
  let onsets = 0; for (let i = 1; i < db.length; i++) if (db[i] - db[i - 1] > 6 && db[i] > -40) onsets++;
  const secs = samples.length / rate || 1;
  const semis = pitches.map((p) => 12 * Math.log2(p / 100));
  const half = Math.floor(semis.length / 2);
  return {
    pitch: Math.round(mean(pitches)), pitchVar: +sd(semis).toFixed(2),
    slope: +(mean(semis.slice(half)) - mean(semis.slice(0, half))).toFixed(2),
    loud: +mean(db).toFixed(1), loudVar: +sd(db).toFixed(1),
    tempo: +(onsets / secs).toFixed(2), voiced: +(pitches.length / Math.max(1, energy.length)).toFixed(2), secs: +secs.toFixed(1),
  };
}
// Map prosody to arousal/valence relative to this child's own baseline when we
// have one (people differ a lot), else to broad defaults.
export function estimate(f, base) {
  const b = base && base.n >= 3 ? base : { pitchVar: 2.5, loud: -30, tempo: 1.2, pitch: 260 };
  const z = (v, m, s) => Math.max(-2, Math.min(2, (v - m) / s));
  const arousal = Math.max(-1, Math.min(1, 0.45 * z(f.loud, b.loud, 8) + 0.3 * z(f.pitchVar, b.pitchVar, 1.5) + 0.25 * z(f.tempo, b.tempo, 1)));
  const valence = Math.max(-1, Math.min(1, 0.5 * z(f.slope, 0, 2) + 0.3 * z(f.pitch, b.pitch, 80) - 0.4 * Math.max(0, z(f.loudVar, 6, 4))));
  let label = arousal > 0.35 ? (valence >= 0 ? "excited" : "upset") : arousal < -0.35 ? (valence >= 0 ? "calm" : "sad") : valence > 0.3 ? "happy" : "calm";
  if (f.voiced < 0.05 && f.loud < -50) label = "calm";
  const conf = +Math.min(0.75, (0.3 + 0.35 * Math.max(Math.abs(arousal), Math.abs(valence))) * (0.6 + 0.4 * Math.min(1, f.voiced * 2))).toFixed(2);
  return { label, conf, arousal: +arousal.toFixed(2), valence: +valence.toFixed(2) };
}
export async function fromBlob(blob, base) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const ab = await ctx.decodeAudioData(await blob.arrayBuffer());
    const ch = ab.getChannelData(0);
    const f = features(ch, ab.sampleRate);
    return { ...estimate(f, base), features: f, sources: ["voice"] };
  } finally { ctx.close?.(); }
}
// Optional face expression (Human by Vladimir Mandic, MIT). The library and the two
// small models it needs (BlazeFace detector 0.6 MB, emotion 0.8 MB) are vendored in
// vendor/human, so nothing is fetched from a CDN and it works offline. Images and
// video frames are analysed in this tab only.
let human = null;
const FACE_MAP = { happy: "happy", surprise: "excited", angry: "upset", fear: "upset", disgust: "upset", sad: "sad", neutral: "calm" };
export async function loadFace() {
  if (human) return human;
  const base = new URL("./vendor/human/", import.meta.url).href;
  const { default: Human } = await import(base + "human.esm.js");
  const h = new Human({ modelBasePath: base + "models/", backend: "webgl", cacheSensitivity: 0, filter: { enabled: false },
    face: { enabled: true, detector: { maxDetected: 1, rotation: false, minConfidence: 0.6 }, emotion: { enabled: true, minConfidence: 0.05 }, mesh: { enabled: false }, iris: { enabled: false }, description: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false } },
    body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false } });
  await h.load(); await h.warmup().catch(() => {});
  return (human = h);
}
// input: <video>, <img> or <canvas>. Returns an estimate, or { status } explaining why not.
export async function fromImage(input) {
  if (input instanceof HTMLVideoElement && (!input.videoWidth || input.readyState < 2)) return { status: "no-video" };
  let h; try { h = await loadFace(); } catch (e) { return { status: "unavailable", error: e.message }; }
  const r = await h.detect(input);
  const f = r.face?.[0];
  if (!f) return { status: "no-face" };
  const em = (f.emotion || []).slice().sort((a, b) => b.score - a.score);
  if (!em.length) return { status: "no-expression", faceScore: f.score };
  return { label: FACE_MAP[em[0].emotion] || "calm", conf: +Math.min(0.75, em[0].score).toFixed(2), raw: em.map((e) => ({ emotion: e.emotion, score: +e.score.toFixed(3) })), faceScore: +f.score.toFixed(2), sources: ["face"] };
}
export async function fromVideo(video) { const r = await fromImage(video).catch(() => null); return r && r.label ? r : null; } // voice-only when no face

// Speech-emotion model (wav2vec2, 6 classes) fused with the prosody estimate.
// Model classes map onto our labels; HAPPY splits into happy/excited by prosody arousal.
export function fuseSpeech(prosody, scores, w = 0.6) {
  if (!scores?.length) return prosody;
  const p = Object.fromEntries(Object.keys(LABELS).map((k) => [k, 0]));
  for (const { label, score } of scores) {
    const L = String(label).toLowerCase();
    if (L === "happy") { const ex = prosody && prosody.arousal > 0.35 ? 0.7 : 0.2; p.excited += score * ex; p.happy += score * (1 - ex); }
    else if (L === "sad") p.sad += score; else if (L === "neutral") p.calm += score; else p.upset += score; // angry, disgust, fear
  }
  const q = Object.fromEntries(Object.keys(LABELS).map((k) => [k, prosody ? (k === prosody.label ? prosody.conf : (1 - prosody.conf) / 4) : 0.2]));
  const mix = Object.fromEntries(Object.keys(LABELS).map((k) => [k, w * p[k] + (1 - w) * q[k]]));
  const [label, top] = Object.entries(mix).sort((a, b) => b[1] - a[1])[0];
  return { ...(prosody || {}), label, conf: +Math.min(0.85, top).toFixed(2), model: scores.map(({ label, score }) => ({ label: String(label).toLowerCase(), score: +score.toFixed(3) })), sources: ["voice model", ...(prosody ? ["voice"] : [])] };
}
export function combine(voice, face) {
  if (!face) return voice; if (!voice) return face;
  if (voice.label === face.label) return { ...voice, conf: +Math.min(0.8, voice.conf + 0.1).toFixed(2), sources: ["voice", "face"] };
  return face.conf > voice.conf ? { ...voice, label: face.label, conf: face.conf, sources: ["face", "voice"] } : { ...voice, sources: ["voice", "face"] };
}
// Rolling per-child baseline of prosody, built only from moments the caregiver confirmed.
export function updateBaseline(base = { n: 0 }, f) {
  const n = Math.min((base.n || 0) + 1, 50), a = 1 / n, mix = (k) => +(((base[k] ?? f[k]) * (1 - a)) + f[k] * a).toFixed(2);
  return { n, pitch: mix("pitch"), pitchVar: mix("pitchVar"), loud: mix("loud"), tempo: mix("tempo") };
}
