// symphony.js — Gamified Lip-Viseme Articulatory Coach, Sound Symphony Word Composer,
// and Web Audio Acoustic Co-Regulation Studio for LuminAAC Ultimate.
//
// Grounded in:
//   • Auditory-Motor Mapping Training (AMMT; Wan et al., 2011 PMID:21980480;
//     Chenausky et al., 2016 PMID:27829034; Yan et al., 2021 PMID:34705567)
//   • Dynamic Temporal and Tactile Cueing (DTTC; Strand et al., 2014 PMID:25092638)
//   • Voice-selective & musical pitch processing in auditory cortex (Belin, Zatorre et al., Nature 2000 PMID:10659849)
//   • Polyvagal acoustic co-regulation & hyperacusis masking (Porges, 2007 PMID:17049418)
//
// Pure ES module: works in Node.js (deterministic state & synthesis descriptors)
// and in the browser (Web Audio API + animated SVG lip-viseme coach).

export const VISEME_POSTURES = {
  rest: {
    id: "rest",
    name: "Relaxed Ready Lips",
    label: "Relaxed Ready Lips",
    emoji: "😌",
    phonemes: [],
    cue: "Take a gentle breath and relax your jaw and lips.",
    svgPath: "M 26 52 Q 60 50 94 52 Q 60 56 26 52 Z",
    innerPath: "M 32 52 L 88 52",
    lipRx: 34,
    lipRy: 4,
    jawOpen: 0.08,
    color: "#4a6b82",
  },
  bilabial: {
    id: "bilabial",
    name: "Lips Together Hum / Pop",
    label: "Lips Together Hum / Pop",
    emoji: "🐝",
    phonemes: ["m", "b", "p"],
    cue: "Press both lips gently together, then hum or pop them open!",
    svgPath: "M 24 52 Q 60 50 96 52 Q 60 55 24 52 Z",
    innerPath: "M 30 52 L 90 52",
    lipRx: 36,
    lipRy: 4,
    jawOpen: 0.1,
    color: "#2f8a4c",
  },
  "round-vowel": {
    id: "round-vowel",
    name: "Round Circle Lips",
    label: "Round Circle Lips",
    emoji: "⭕",
    phonemes: ["oh", "oo", "w", "r"],
    cue: "Make a round circle with your lips like blowing a bubble!",
    svgPath: "M 38 50 C 38 34, 82 34, 82 50 C 82 66, 38 66, 38 50 Z",
    innerPath: "M 46 50 C 46 40, 74 40, 74 50 C 74 60, 46 60, 46 50 Z",
    lipRx: 22,
    lipRy: 16,
    jawOpen: 0.55,
    color: "#2f6fb3",
  },
  "open-vowel": {
    id: "open-vowel",
    name: "Wide Open Singing Mouth",
    label: "Wide Open Singing Mouth",
    emoji: "☀️",
    phonemes: ["aa", "ah", "ae", "uh"],
    cue: "Open your mouth wide and warm like singing 'Ahhh'!",
    svgPath: "M 26 46 C 36 28, 84 28, 94 46 C 88 74, 32 74, 26 46 Z",
    innerPath: "M 34 48 C 42 36, 78 36, 86 48 C 80 68, 40 68, 34 48 Z",
    lipRx: 34,
    lipRy: 22,
    jawOpen: 0.9,
    color: "#c7651c",
  },
  smile: {
    id: "smile",
    name: "Bright Smile Sound",
    label: "Bright Smile Sound",
    emoji: "😊",
    phonemes: ["ee", "eh", "i", "y"],
    cue: "Stretch your lips into a gentle smile and let the sound shine!",
    svgPath: "M 20 48 Q 60 38 100 48 Q 60 66 20 48 Z",
    innerPath: "M 28 49 Q 60 43 92 49 Q 60 60 28 49 Z",
    lipRx: 40,
    lipRy: 10,
    jawOpen: 0.35,
    color: "#8c6500",
  },
  alveolar: {
    id: "alveolar",
    name: "Tongue-Tip Tap / Whisper",
    label: "Tongue-Tip Tap / Whisper",
    emoji: "🔔",
    phonemes: ["t", "d", "n", "s", "l", "el"],
    cue: "Touch the tip of your tongue right behind your top teeth!",
    svgPath: "M 26 48 Q 60 42 94 48 Q 60 62 26 48 Z",
    innerPath: "M 34 49 Q 60 45 86 49 Q 60 57 34 49 Z",
    lipRx: 34,
    lipRy: 8,
    jawOpen: 0.3,
    color: "#6e4fae",
  },
  velar: {
    id: "velar",
    name: "Soft Back-of-Mouth Breath",
    label: "Soft Back-of-Mouth Breath",
    emoji: "🌬️",
    phonemes: ["k", "g", "h", "er"],
    cue: "Let a soft warm breeze come from the back of your mouth!",
    svgPath: "M 30 48 C 40 36, 80 36, 90 48 C 82 66, 38 66, 30 48 Z",
    innerPath: "M 38 49 C 45 40, 75 40, 82 49 C 76 60, 44 60, 38 49 Z",
    lipRx: 30,
    lipRy: 14,
    jawOpen: 0.5,
    color: "#b84a80",
  },
};
VISEME_POSTURES.rounded = VISEME_POSTURES["round-vowel"];
VISEME_POSTURES.open = VISEME_POSTURES["open-vowel"];

// Pentatonic scale frequencies (C4, D4, E4, G4, A4, C5) — every combination sounds consonant.
export const PENTATONIC_HZ = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

export const SOUND_BLOCKS = [
  { id: "m", label: "mmm", speak: "muh", viseme: "bilabial", hz: 261.63, freq: 261.63, note: "C4", color: "social", instrument: "Warm Cello Hum", e: "🐝" },
  { id: "b", label: "buh", speak: "buh", viseme: "bilabial", hz: 293.66, freq: 293.66, note: "D4", color: "action", instrument: "Soft Drum Pop", e: "🫧" },
  { id: "p", label: "puh", speak: "puh", viseme: "bilabial", hz: 329.63, freq: 329.63, note: "E4", color: "action", instrument: "Bubble Pluck", e: "🎈" },
  { id: "w", label: "wuh", speak: "wuh", viseme: "round-vowel", hz: 293.66, freq: 293.66, note: "D4", color: "thing", instrument: "Gentle Flute", e: "🌊" },
  { id: "g", label: "guh", speak: "guh", viseme: "velar", hz: 329.63, freq: 329.63, note: "E4", color: "action", instrument: "Wooden Marimba", e: "🟢" },
  { id: "h", label: "hhh", speak: "huh", viseme: "velar", hz: 261.63, freq: 261.63, note: "C4", color: "social", instrument: "Wind Chime", e: "🌬️" },
  { id: "t", label: "tuh", speak: "tuh", viseme: "alveolar", hz: 392.0, freq: 392.0, note: "G4", color: "little", instrument: "Light Bell Tap", e: "🔔" },
  { id: "d", label: "duh", speak: "duh", viseme: "alveolar", hz: 293.66, freq: 293.66, note: "D4", color: "people", instrument: "Warm Kalimba", e: "🥁" },
  { id: "l", label: "lll", speak: "luh", viseme: "alveolar", hz: 440.0, freq: 440.0, note: "A4", color: "describe", instrument: "Harp String", e: "🎶" },
  { id: "r", label: "rrr", speak: "ruh", viseme: "round-vowel", hz: 392.0, freq: 392.0, note: "G4", color: "describe", instrument: "Mellow Horn", e: "🦁" },
  { id: "aa", label: "ah", speak: "ah", viseme: "open-vowel", hz: 329.63, freq: 329.63, note: "E4", color: "place", instrument: "Open Choir Pad", e: "☀️" },
  { id: "oh", label: "oh", speak: "oh", viseme: "round-vowel", hz: 392.0, freq: 392.0, note: "G4", color: "describe", instrument: "Golden Chime", e: "⭕" },
  { id: "eh", label: "eh", speak: "eh", viseme: "smile", hz: 329.63, freq: 329.63, note: "E4", color: "action", instrument: "Soft Piano", e: "✨" },
  { id: "ee", label: "ee", speak: "ee", viseme: "smile", hz: 523.25, freq: 523.25, note: "C5", color: "social", instrument: "Bright Glockenspiel", e: "😊" },
  { id: "er", label: "er", speak: "er", viseme: "velar", hz: 440.0, freq: 440.0, note: "A4", color: "thing", instrument: "Warm String", e: "🌟" },
  { id: "el", label: "ul", speak: "ul", viseme: "alveolar", hz: 440.0, freq: 440.0, note: "A4", color: "thing", instrument: "Silver Bell", e: "🫧" },
];

export const SYMPHONY_WORDS = [
  { id: "more", word: "more", emoji: "➕", e: "➕", c: "describe", blocks: ["m", "oh", "r"], melodyHz: [261.63, 329.63, 392.0] },
  { id: "water", word: "water", emoji: "💧", e: "💧", c: "thing", blocks: ["w", "aa", "t", "er"], melodyHz: [261.63, 329.63, 392.0, 523.25] },
  { id: "mama", word: "mama", emoji: "👩", e: "👩", c: "people", blocks: ["m", "aa", "m", "aa"], melodyHz: [329.63, 392.0, 329.63, 261.63] },
  { id: "dada", word: "dada", emoji: "👨", e: "👨", c: "people", blocks: ["d", "aa", "d", "aa"], melodyHz: [293.66, 392.0, 293.66, 261.63] },
  { id: "help", word: "help", emoji: "🆘", e: "🆘", c: "action", blocks: ["h", "eh", "l", "p"], melodyHz: [261.63, 329.63, 392.0, 440.0] },
  { id: "bubble", word: "bubble", emoji: "🫧", e: "🫧", c: "thing", blocks: ["b", "aa", "b", "el"], melodyHz: [261.63, 329.63, 392.0, 523.25] },
  { id: "happy", word: "happy", emoji: "😊", e: "😊", c: "describe", blocks: ["h", "aa", "p", "ee"], melodyHz: [293.66, 329.63, 392.0, 523.25] },
  { id: "go", word: "go", emoji: "🚶", e: "🚶", c: "action", blocks: ["g", "oh"], melodyHz: [329.63, 392.0] },
];

export function visemeForPhoneme(phonemeId) {
  const clean = String(phonemeId || "").trim().toLowerCase();
  if (!clean) return VISEME_POSTURES.rest;
  const block = SOUND_BLOCKS.find((b) => b.id === clean || b.label === clean);
  if (block && VISEME_POSTURES[block.viseme]) return VISEME_POSTURES[block.viseme];
  for (const v of Object.values(VISEME_POSTURES)) {
    if (Array.isArray(v.phonemes) && v.phonemes.includes(clean)) return v;
  }
  return VISEME_POSTURES.rest;
}

export function renderVisemeSvg(postureOrPhoneme = "rest", { active = false } = {}) {
  const v = typeof postureOrPhoneme === "string"
    ? (VISEME_POSTURES[postureOrPhoneme] || visemeForPhoneme(postureOrPhoneme))
    : (postureOrPhoneme || VISEME_POSTURES.rest);
  const glow = active ? `filter="drop-shadow(0 0 8px ${v.color})"` : "";
  return `<svg viewBox="0 0 120 96" width="120" height="96" class="sx-viseme-svg" data-viseme="${v.id}" role="img" aria-label="${v.name}: ${v.cue}">
    <rect x="6" y="6" width="108" height="84" rx="22" fill="#f7f9f8" stroke="${v.color}" stroke-width="3" />
    <path d="${v.svgPath}" fill="${v.color}" fill-opacity="0.22" stroke="${v.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" ${glow} />
    <path d="${v.innerPath}" fill="#1c2630" fill-opacity="0.82" stroke="${v.color}" stroke-width="2" stroke-linecap="round" />
  </svg>`;
}

export function composeSymphonyWord(blockIds = []) {
  const ids = (Array.isArray(blockIds) ? blockIds : []).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean).slice(0, 6);
  if (!ids.length) return { word: "", matched: false, matchedPreset: null, blocks: [], visemes: [], notes: [], notesHz: [] };

  const blocks = ids.map((id, i) => SOUND_BLOCKS.find((b) => b.id === id) || {
    id,
    label: id,
    speak: id,
    viseme: visemeForPhoneme(id).id,
    hz: PENTATONIC_HZ[i % PENTATONIC_HZ.length],
    freq: PENTATONIC_HZ[i % PENTATONIC_HZ.length],
    note: "C4",
    instrument: "Chime",
    e: "🎵",
  });

  const exact = SYMPHONY_WORDS.find((sw) => sw.blocks.length === ids.length && sw.blocks.every((b, i) => b === ids[i]));
  const word = exact ? exact.word : ids.join("");
  const visemeObjs = blocks.map((b) => visemeForPhoneme(b.id));
  const visemes = visemeObjs.map((v) => v.id);
  const notesHz = exact ? exact.melodyHz : blocks.map((b, i) => b.hz || PENTATONIC_HZ[i % PENTATONIC_HZ.length]);

  return {
    word,
    matched: Boolean(exact),
    matchedPreset: exact || null,
    blocks,
    visemes,
    visemeObjects: visemeObjs,
    notes: notesHz,
    notesHz,
  };
}

export const SOUNDSCAPE_PRESETS = [
  {
    id: "pink-shield",
    name: "Warm Pink Noise Shield",
    label: "Warm Pink Noise Shield",
    kind: "pink",
    hz: 0,
    e: "🌸",
    description: "Gentle -3 dB/octave warm waterfall sound that masks sudden high-pitched classroom or household noises (hyperacusis protection).",
  },
  {
    id: "brown-blanket",
    name: "Deep Brown Noise Blanket",
    label: "Deep Brown Noise Blanket",
    kind: "brown",
    hz: 0,
    e: "🌊",
    description: "Low, rumbling ocean-like warmth (-6 dB/octave) for deep sensory grounding during overload.",
  },
  {
    id: "harmonic-432",
    name: "432 Hz Warm Harmonic Drone",
    label: "432 Hz Warm Harmonic Drone",
    kind: "harmonic",
    hz: 432,
    harmonicHz: 648,
    e: "🔔",
    description: "Soft 432 Hz root + 648 Hz fifth acoustic pad paced to a slow 4-second inhale / 4-second exhale breath cycle.",
  },
  {
    id: "solfeggio-528",
    name: "528 Hz Gentle Chime Pad",
    label: "528 Hz Gentle Chime Pad",
    kind: "harmonic",
    hz: 528,
    harmonicHz: 396,
    e: "✨",
    description: "Calm, low-intensity 528 Hz + 396 Hz pure sine harmonic pad with zero harsh transients.",
  },
  {
    id: "theta-calm",
    name: "6 Hz Theta Co-Regulation Pulse",
    label: "6 Hz Theta Co-Regulation Pulse",
    kind: "binaural",
    hz: 200,
    beatHz: 6,
    e: "🧘",
    description: "Soft 200 Hz / 206 Hz dual-tone gentle 6 Hz relaxation pulse for quiet transition routines.",
  },
];

let audioCtx = null;
let activeSoundscape = null;

function getAudioContext(overrideCtx) {
  if (overrideCtx !== undefined) return overrideCtx;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

export function playSymphonyNote(blockOrHz = 329.63, optsOrDuration = {}) {
  const isBlockObj = blockOrHz && typeof blockOrHz === "object";
  const block = isBlockObj
    ? blockOrHz
    : (typeof blockOrHz === "string" ? SOUND_BLOCKS.find((b) => b.id === blockOrHz) : null);
  const hz = Number(block?.hz ?? block?.freq ?? blockOrHz) || 329.63;
  const viseme = block?.viseme || visemeForPhoneme(typeof blockOrHz === "string" ? blockOrHz : "").id;
  const durationMs = typeof optsOrDuration === "number" ? optsOrDuration : (optsOrDuration?.durationMs || 320);
  const ctx = getAudioContext(typeof optsOrDuration === "object" ? optsOrDuration?.audioCtx : undefined);

  if (!ctx) return { played: false, hz, freq: hz, viseme, durationMs };
  try {
    if (ctx.state === "suspended") ctx.resume?.();
    const now = ctx.currentTime;
    const dur = Math.max(0.08, Math.min(2.0, durationMs / 1000));
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(hz, now);
    sub.type = "sine";
    sub.frequency.setValueAtTime(hz * 0.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    sub.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    sub.start(now);
    osc.stop(now + dur + 0.02);
    sub.stop(now + dur + 0.02);
    return { played: true, hz, freq: hz, viseme, durationMs };
  } catch {
    return { played: false, hz, freq: hz, viseme, durationMs };
  }
}

export async function playSymphonySequence(blocksOrHz = [], optsOrStepMs = {}) {
  const opts = typeof optsOrStepMs === "number" ? { stepMs: optsOrStepMs } : (optsOrStepMs || {});
  const stepMs = Number(opts.stepMs) || 220;
  const onViseme = typeof opts.onViseme === "function" ? opts.onViseme : null;
  const composed = composeSymphonyWord(blocksOrHz);
  const items = Array.isArray(blocksOrHz) ? blocksOrHz : [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const v = typeof item === "string" ? visemeForPhoneme(item).id : "open-vowel";
    onViseme?.(v, i);
    playSymphonyNote(item, { durationMs: stepMs * 0.9, audioCtx: opts.audioCtx });
    await new Promise((r) => setTimeout(r, stepMs));
  }
  onViseme?.("rest", items.length);
  return { ...composed, count: items.length };
}

export function stopSoundscape() {
  const prev = activeSoundscape?.id || null;
  if (activeSoundscape) {
    try { activeSoundscape.stop(); } catch {}
    activeSoundscape = null;
  }
  return { stopped: true, previous: prev, active: false, id: null };
}

export function startSoundscape(presetId, opts = {}) {
  stopSoundscape();
  const preset = SOUNDSCAPE_PRESETS.find((p) => p.id === presetId) || SOUNDSCAPE_PRESETS[0];
  const ctx = getAudioContext(opts?.audioCtx);
  if (!ctx) {
    activeSoundscape = { id: preset.id, stop() {} };
    return { active: true, id: preset.id, simulated: true, preset };
  }

  try {
    if (ctx.state === "suspended") ctx.resume?.();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.12, ctx.currentTime);
    master.connect(ctx.destination);
    const nodes = [];

    if (preset.kind === "pink" || preset.kind === "brown") {
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const out = buffer.getChannelData(0);
      if (preset.kind === "pink") {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
          b6 = white * 0.115926;
        }
      } else {
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          out[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = out[i];
          out[i] *= 0.18;
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(master);
      src.start();
      nodes.push(src);
    } else if (preset.kind === "harmonic") {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = "sine";
      o2.type = "triangle";
      o1.frequency.setValueAtTime(preset.hz, ctx.currentTime);
      o2.frequency.setValueAtTime(preset.harmonicHz || preset.hz * 1.5, ctx.currentTime);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.25, ctx.currentTime);
      o1.connect(master);
      o2.connect(g2);
      g2.connect(master);
      o1.start();
      o2.start();
      nodes.push(o1, o2);
    } else if (preset.kind === "binaural") {
      const oL = ctx.createOscillator();
      const oR = ctx.createOscillator();
      oL.type = "sine";
      oR.type = "sine";
      oL.frequency.setValueAtTime(preset.hz, ctx.currentTime);
      oR.frequency.setValueAtTime(preset.hz + (preset.beatHz || 6), ctx.currentTime);
      oL.connect(master);
      oR.connect(master);
      oL.start();
      oR.start();
      nodes.push(oL, oR);
    }

    activeSoundscape = {
      id: preset.id,
      stop() {
        for (const n of nodes) {
          try { n.stop?.(); n.disconnect?.(); } catch {}
        }
        try { master.disconnect?.(); } catch {}
      },
    };
    return { active: true, id: preset.id, simulated: false, preset };
  } catch {
    activeSoundscape = { id: preset.id, stop() {} };
    return { active: true, id: preset.id, simulated: true, preset };
  }
}

export function activeSoundscapeId() {
  return activeSoundscape?.id || null;
}
export const getActiveSoundscapeId = activeSoundscapeId;
