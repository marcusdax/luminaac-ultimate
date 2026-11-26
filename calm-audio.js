// Procedural therapeutic audio for My Voice Calm Room (inspired by fukup.zip sound_library.py).
// 100% offline Web Audio API synthesis: zero external audio files, zero network calls.
// Sensory guardrails: off by default, gain capped at MAX_CALM_GAIN (0.35), smooth 1.5s fades,
// and automatic ducking whenever My Voice speaks so background audio never competes with speech.

export const MAX_CALM_GAIN = 0.35;
export const DUCK_FACTOR = 0.15;
export const FADE_SECS = 1.5;

export const CALM_PRESETS = Object.freeze([
  {
    id: "ocean",
    label: "Ocean",
    icon: "🌊",
    description: "Slow rolling waves paced to your breath",
    kind: "noise",
    filterType: "lowpass",
    baseFreq: 380,
    lfoHz: 0.1,      // 10 s cycle matches 4 s inhale + 6 s exhale
    lfoDepth: 220,
  },
  {
    id: "rain",
    label: "Rain",
    icon: "🌧️",
    description: "Soft steady rain with gentle warmth",
    kind: "noise",
    filterType: "bandpass",
    baseFreq: 950,
    q: 0.7,
    lfoHz: 0.05,
    lfoDepth: 90,
  },
  {
    id: "stream",
    label: "Stream",
    icon: "💧",
    description: "Light flowing water",
    kind: "noise",
    filterType: "bandpass",
    baseFreq: 1350,
    q: 1.1,
    lfoHz: 0.22,
    lfoDepth: 180,
  },
  {
    id: "hum",
    label: "Soft hum",
    icon: "🎵",
    description: "Warm low harmonic tone (gentle, headphones optional)",
    kind: "harmonic",
    freqLeft: 174,
    freqRight: 180,  // gentle 6 Hz theta interval
    filterFreq: 420,
  },
]);

export function clampGain(level) {
  const n = Number(level);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_CALM_GAIN, n * MAX_CALM_GAIN);
}

function makeNoiseBuffer(ctx) {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Paul Kellet's pink-ish noise filter for warmer, less harsh soundscapes
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + w * 0.1848) * 0.12));
  }
  return buf;
}

/**
 * Create a self-contained calm audio controller.
 * Accepts an optional `createContext` factory for headless unit testing.
 */
export function createCalmAudioController(createContext) {
  const makeCtx = createContext || (() => {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    return AC ? new AC() : null;
  });

  let ctx = null;
  let master = null;
  let nodes = [];
  let activeId = null;
  let userVolume = 0.55; // normalized 0..1, mapped through clampGain (<= 0.35)
  let ducked = false;

  function targetGain() {
    if (!activeId) return 0;
    const g = clampGain(userVolume);
    return ducked ? g * DUCK_FACTOR : g;
  }

  function rampGain(val, secs = FADE_SECS) {
    if (!master || !ctx) return;
    const now = ctx.currentTime || 0;
    master.gain.cancelScheduledValues?.(now);
    master.gain.setValueAtTime?.(master.gain.value ?? 0, now);
    master.gain.linearRampToValueAtTime?.(val, now + secs);
  }

  function teardownNodes() {
    for (const n of nodes) {
      try { n.stop?.(); } catch {}
      try { n.disconnect?.(); } catch {}
    }
    nodes = [];
  }

  function start(presetId) {
    const preset = CALM_PRESETS.find((p) => p.id === presetId);
    if (!preset) return false;

    if (activeId === presetId) {
      stop();
      return false;
    }

    if (!ctx) ctx = makeCtx();
    if (!ctx) {
      activeId = presetId;
      return true;
    }
    if (ctx.state === "suspended") ctx.resume?.().catch?.(() => {});

    teardownNodes();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    }

    if (preset.kind === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx);
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = preset.filterType;
      filter.frequency.value = preset.baseFreq;
      if (preset.q) filter.Q.value = preset.q;

      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = preset.lfoHz;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = preset.lfoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      src.connect(filter);
      filter.connect(master);
      src.start();
      lfo.start();
      nodes = [src, filter, lfo, lfoGain];
    } else {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = preset.filterFreq;

      const oscL = ctx.createOscillator();
      oscL.type = "sine";
      oscL.frequency.value = preset.freqLeft;

      const oscR = ctx.createOscillator();
      oscR.type = "sine";
      oscR.frequency.value = preset.freqRight;

      const subGain = ctx.createGain();
      subGain.gain.value = 0.4;

      oscL.connect(subGain);
      oscR.connect(subGain);
      subGain.connect(filter);
      filter.connect(master);
      oscL.start();
      oscR.start();
      nodes = [oscL, oscR, subGain, filter];
    }

    activeId = presetId;
    rampGain(targetGain(), FADE_SECS);
    return true;
  }

  function stop() {
    activeId = null;
    rampGain(0, 0.25);
    teardownNodes();
  }

  function setVolume(normLevel) {
    userVolume = Math.max(0, Math.min(1, Number(normLevel) || 0));
    if (activeId) rampGain(targetGain(), 0.2);
  }

  function duck() {
    ducked = true;
    if (activeId) rampGain(targetGain(), 0.15);
  }

  function unduck() {
    ducked = false;
    if (activeId) rampGain(targetGain(), 0.6);
  }

  return {
    start,
    stop,
    setVolume,
    duck,
    unduck,
    getState() {
      return {
        activeId,
        userVolume,
        ducked,
        effectiveGain: targetGain(),
      };
    },
  };
}
