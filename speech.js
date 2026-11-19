// Unified speech output and utterance logging for LuminAAC.
// Pure ESM, safe to import in Node.js without browser globals.
// Dependency bridge via configureSpeech({ load, persist, getMedia, ... }) avoids
// circular static imports with shared.js while preserving synchronous Safari/iOS
// user-gesture activation for speechSynthesis.

const SETTINGS_KEY = "luminaac:settings";
const LOG_KEY = "luminaac:log";
const COUNTS_KEY = "luminaac:counts";
const PAIRS_KEY = "luminaac:pairs";

const DEFAULT_SETTINGS = { voice: "", rate: 0.9 };

let deps = {
  load: null,
  persist: null,
  getMedia: null,
  storage: null,
  synth: null,
  kokoroSpeak: null,
  kokoroStop: null,
  isExploring: null,
  Utterance: null,
  win: null,
  doc: null,
};

let activePlayer = null; // { stop: () => void } for active non-preview audio
let activeKokoro = false;
let activeTimer = 0;
let speechSeq = 0;

function getWin() {
  return deps.win ?? (typeof window !== "undefined" ? window : null);
}
function getDoc() {
  return deps.doc ?? (typeof document !== "undefined" ? document : null);
}
function getStorage() {
  if (deps.storage) return deps.storage;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
function getSynth() {
  if (deps.synth !== null && deps.synth !== undefined) return deps.synth;
  const w = getWin();
  if (w && "speechSynthesis" in w && w.speechSynthesis) return w.speechSynthesis;
  if (typeof speechSynthesis !== "undefined") return speechSynthesis;
  return null;
}
function getUtteranceCtor() {
  if (deps.Utterance) return deps.Utterance;
  const w = getWin();
  if (w?.SpeechSynthesisUtterance) return w.SpeechSynthesisUtterance;
  if (typeof SpeechSynthesisUtterance !== "undefined") return SpeechSynthesisUtterance;
  return null;
}

function readJson(key, fallback) {
  const s = getStorage();
  if (!s) return fallback;
  try {
    const raw = s.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  const s = getStorage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {}
}

function emitEvent(name, detail) {
  const w = getWin();
  if (!w || typeof w.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
  try {
    w.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {}
}

export function configureSpeech(next = {}) {
  deps = { ...deps, ...next };
}

export function getSpeechSettings() {
  const saved = readJson(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
}

export function isExploring() {
  if (typeof deps.isExploring === "function") return !!deps.isExploring();
  const d = getDoc();
  if (!d) return false;
  const chk = d.getElementById?.("mvExplore");
  if (chk && typeof chk.checked === "boolean") return chk.checked;
  return d.documentElement?.dataset?.exploring === "1";
}

export function stopSpeech() {
  speechSeq += 1;
  clearInterval(activeTimer);
  activeTimer = 0;
  if (activePlayer) {
    try { activePlayer.stop(); } catch {}
    activePlayer = null;
  }
  if (activeKokoro) {
    activeKokoro = false;
    if (typeof deps.kokoroStop === "function") {
      try { deps.kokoroStop(); } catch {}
    } else if (typeof window !== "undefined") {
      import("./ai.js").then((ai) => ai.stopKokoro?.()).catch(() => {});
    }
  }
  const synth = getSynth();
  try { synth?.cancel?.(); } catch {}
}

function inferFunction(text, kind) {
  if (kind === "sos") return /home/i.test(text) ? "request" : "help";
  if (kind === "scale") return "emotion";
  if (kind === "calm") return "request";
  if (kind === "story" || kind === "personal") return "social";
  if (kind === "practice") return "practice";
  const low = text.toLowerCase();
  if (/^(no|stop|not|don't)\b/.test(low)) return "protest";
  if (/^(hi|bye|yes|please|thank you|wait|my turn|your turn)\b/.test(low)) return "social";
  if (/^(what|where|who|when|why|how)\b/.test(low)) return "question";
  return "request";
}

function tokenizeWords(cleanText, explicitWords) {
  if (Array.isArray(explicitWords) && explicitWords.length) {
    return explicitWords.map((w) => String(w).trim()).filter(Boolean);
  }
  return cleanText.split(/\s+/).filter(Boolean);
}

function wordStarts(text, tokens) {
  if (tokens.length && text === tokens.join(" ")) {
    const starts = [];
    let pos = 0;
    for (const t of tokens) {
      starts.push(pos);
      pos += t.length + 1;
    }
    return starts;
  }
  return [...text.matchAll(/\S+/g)].map((m) => m.index);
}

function appendLog(entry, { updateCounts = false } = {}) {
  const log = readJson(LOG_KEY, []);
  const nextLog = Array.isArray(log) ? [...log, entry].slice(-5000) : [entry];
  writeJson(LOG_KEY, nextLog);

  if (updateCounts) {
    const counts = readJson(COUNTS_KEY, {});
    const pairs = readJson(PAIRS_KEY, {});
    const words = entry.words || [];
    words.forEach((raw, i) => {
      const k = String(raw).toLowerCase();
      if (!k) return;
      counts[k] = (counts[k] || 0) + 1;
      if (i > 0) {
        const prev = String(words[i - 1]).toLowerCase();
        if (prev) {
          (pairs[prev] ||= {})[k] = (pairs[prev][k] || 0) + 1;
        }
      }
    });
    writeJson(COUNTS_KEY, counts);
    writeJson(PAIRS_KEY, pairs);
  }

  emitEvent("luminaac:logged", { entry });
}

function speakWithSynth(cleanText, starts, { voice, rate, pitch, volume, interrupt, seq, onWordBoundary, onWord, onEnd }) {
  const synth = getSynth();
  const Utterance = getUtteranceCtor();
  const isStale = () => seq !== undefined && seq !== speechSeq;
  if (!synth || !Utterance) {
    emitEvent("luminaac:speech-notice", { message: "This device can't speak aloud. The message is shown on screen." });
    if (!isStale()) onEnd?.();
    return false;
  }
  if (interrupt !== false) {
    try { synth.cancel?.(); } catch {}
  }
  const u = new Utterance(cleanText);
  const voices = typeof synth.getVoices === "function" ? synth.getVoices() : [];
  if (voice && Array.isArray(voices)) {
    const match = voices.find((v) => v.name === voice);
    if (match) u.voice = match;
  }
  u.rate = Number(rate) || 0.9;
  if (typeof pitch === "number" && Number.isFinite(pitch)) u.pitch = pitch;
  if (typeof volume === "number") u.volume = volume;

  let gotBoundary = false;
  let timer = 0;
  const fireWord = (charIdx) => {
    if (isStale()) return;
    let idx = 0;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] <= charIdx) idx = i;
      else break;
    }
    onWordBoundary?.(idx, charIdx);
    onWord?.(charIdx, idx);
  };

  u.onboundary = (e) => {
    if (isStale()) return;
    if (e?.name && e.name !== "word") return;
    gotBoundary = true;
    clearInterval(timer);
    if (timer && activeTimer === timer) activeTimer = 0;
    fireWord(Number(e?.charIndex) || 0);
  };
  u.onstart = () => {
    if (isStale()) return;
    fireWord(0);
    let i = 0;
    timer = setInterval(() => {
      if (gotBoundary || isStale()) {
        clearInterval(timer);
        if (timer && activeTimer === timer) activeTimer = 0;
        return;
      }
      i += 1;
      if (i < starts.length) fireWord(starts[i]);
      else {
        clearInterval(timer);
        if (timer && activeTimer === timer) activeTimer = 0;
      }
    }, 330 / Math.max(0.4, u.rate || 0.9));
    activeTimer = timer;
  };
  u.onend = u.onerror = () => {
    clearInterval(timer);
    if (timer && activeTimer === timer) activeTimer = 0;
    if (isStale()) return;
    onEnd?.();
  };

  synth.speak(u);
  return true;
}

async function speakWithKokoro(cleanText, voiceId, starts, { rate, seq = speechSeq, onWordBoundary, onWord, onEnd }) {
  let timer = 0;
  activeKokoro = true;
  const fireIdx = (i) => {
    const ci = starts[i] ?? 0;
    onWordBoundary?.(i, ci);
    onWord?.(ci, i);
  };
  try {
    const fn = deps.kokoroSpeak || (async (t, v, opts) => {
      const ai = await import("./ai.js");
      return ai.speakKokoro(t, v, opts);
    });
    await fn(cleanText, voiceId, {
      speed: Number(rate) || 1,
      onProgress: (p) => { if (seq === speechSeq) emitEvent("voice:progress", p); },
      onStart: (secs) => {
        if (seq !== speechSeq) return;
        let i = 0;
        fireIdx(0);
        emitEvent("voice:progress", { pct: 100, done: true });
        timer = setInterval(() => {
          if (seq !== speechSeq) {
            clearInterval(timer);
            if (activeTimer === timer) activeTimer = 0;
            return;
          }
          i += 1;
          if (i < starts.length) fireIdx(i);
          else {
            clearInterval(timer);
            if (activeTimer === timer) activeTimer = 0;
          }
        }, (Math.max(0.2, Number(secs) || 1) * 1000) / Math.max(1, starts.length));
        activeTimer = timer;
      },
    });
    clearInterval(timer);
    if (timer && activeTimer === timer) activeTimer = 0;
    if (seq !== speechSeq) return false;
    activeKokoro = false;
    onEnd?.();
    return true;
  } catch {
    clearInterval(timer);
    if (timer && activeTimer === timer) activeTimer = 0;
    if (seq !== speechSeq) return false;
    activeKokoro = false;
    emitEvent("luminaac:speech-notice", {
      message: "The natural voice isn't available right now, so the device voice is speaking.",
    });
    return speakWithSynth(cleanText, starts, {
      voice: "",
      rate,
      interrupt: true,
      seq,
      onWordBoundary,
      onWord,
      onEnd,
    });
  }
}

function playMediaClip(blob, { onEnd, onFallback }) {
  const w = getWin();
  const AudioCtor = w?.Audio || (typeof Audio !== "undefined" ? Audio : null);
  const URLApi = w?.URL || (typeof URL !== "undefined" ? URL : null);
  if (!AudioCtor || !URLApi?.createObjectURL) return false;
  try {
    const url = URLApi.createObjectURL(blob);
    const el = new AudioCtor(url);
    const cleanup = () => {
      try { URLApi.revokeObjectURL?.(url); } catch {}
      if (activePlayer?.el === el) activePlayer = null;
    };
    activePlayer = {
      el,
      stop() {
        try { el.pause?.(); el.currentTime = 0; } catch {}
        cleanup();
      },
    };
    el.onended = () => { cleanup(); onEnd?.(); };
    el.onerror = () => { cleanup(); onFallback?.(); };
    const p = el.play?.();
    if (p && typeof p.catch === "function") {
      p.catch(() => { cleanup(); onFallback?.(); });
    }
    return true;
  } catch {
    return false;
  }
}

export function speakUtterance(text, opts = {}) {
  const {
    mode = "child",
    voiceOverride,
    rate,
    audioClipId,
    functionTag,
    kind = "message",
    words,
    skipLog = false,
    onWordBoundary,
    onWord,
    onEnd,
    interrupt,
    allowWhileExploring = false,
  } = opts;

  const cleanText = String(text ?? "").trim();
  if (!cleanText) {
    onEnd?.();
    return { mode, spoken: false, logged: false };
  }

  const effectiveMode = (!allowWhileExploring && mode === "child" && isExploring()) ? "explore" : mode;

  // 1. Explore mode: silent, logs only to db.exploration
  if (effectiveMode === "explore") {
    if (!skipLog && typeof deps.load === "function" && typeof deps.persist === "function") {
      const db = deps.load();
      db.exploration = [...(db.exploration || []), { t: Date.now(), word: cleanText }].slice(-500);
      deps.persist(db);
    }
    onEnd?.();
    return { mode: "explore", spoken: false, logged: !skipLog };
  }

  const settings = getSpeechSettings();
  const tokenList = tokenizeWords(cleanText, words);
  const starts = wordStarts(cleanText, tokenList);

  // 2. Preview mode: non-interrupting low-volume cue, zero logging
  if (effectiveMode === "preview") {
    const synth = getSynth();
    const shouldInterrupt = interrupt === true;
    if (!shouldInterrupt && (activePlayer || activeKokoro || synth?.speaking)) {
      onEnd?.();
      return { mode: "preview", spoken: false, logged: false };
    }
    if (shouldInterrupt) stopSpeech();
    const seq = shouldInterrupt ? ++speechSeq : speechSeq;
    const voice = voiceOverride !== undefined ? voiceOverride : settings.voice;
    const previewVoice = String(voice || "").startsWith("kokoro:") ? "" : voice;
    const baseRate = Number(rate ?? settings.rate ?? 0.9) || 0.9;
    const spoken = speakWithSynth(cleanText, starts, {
      voice: previewVoice,
      rate: Math.min(1.5, Math.max(0.8, baseRate * 1.05)),
      volume: 0.45,
      interrupt: shouldInterrupt,
      seq,
      onWordBoundary,
      onWord,
      onEnd,
    });
    return { mode: "preview", spoken, logged: false };
  }

  // 3. Modeling mode: logs partner utterance, NEVER increments child counts/pairs
  if (effectiveMode === "modeling") {
    const db = typeof deps.load === "function" ? deps.load() : null;
    const audible = db?.access?.modelingAudio !== false;
    const now = Date.now();
    if (!skipLog) {
      appendLog({
        t: now,
        ts: now,
        text: cleanText,
        words: tokenList,
        kind,
        mode: "modeling",
        actor: "partner",
        fn: functionTag || null,
      }, { updateCounts: false });
    }

    if (!audible) {
      if (interrupt !== false) stopSpeech();
      else {
        clearInterval(activeTimer);
        activeTimer = 0;
      }
      const seq = ++speechSeq;
      // Visual word highlight trail without emitting audio
      let i = 0;
      const fire = (idx) => {
        const ci = starts[idx] ?? 0;
        onWordBoundary?.(idx, ci);
        onWord?.(ci, idx);
      };
      if (starts.length <= 1) {
        fire(0);
        onEnd?.();
      } else {
        fire(0);
        const t = setInterval(() => {
          if (seq !== speechSeq) {
            clearInterval(t);
            if (activeTimer === t) activeTimer = 0;
            return;
          }
          i += 1;
          if (i < starts.length) fire(i);
          else {
            clearInterval(t);
            if (activeTimer === t) activeTimer = 0;
            onEnd?.();
          }
        }, 180);
        activeTimer = t;
      }
      return { mode: "modeling", spoken: false, logged: !skipLog };
    }

    const voice = voiceOverride !== undefined ? voiceOverride : settings.voice;
    const spd = Number(rate ?? settings.rate ?? 0.9) || 0.9;
    const shouldInterrupt = interrupt !== false;
    if (shouldInterrupt) stopSpeech();
    const seq = ++speechSeq;

    if (String(voice || "").startsWith("kokoro:")) {
      speakWithKokoro(cleanText, String(voice).slice(7), starts, { rate: spd, seq, onWordBoundary, onWord, onEnd });
      return { mode: "modeling", spoken: true, logged: !skipLog };
    }
    const spoken = speakWithSynth(cleanText, starts, {
      voice,
      rate: spd,
      interrupt: shouldInterrupt,
      seq,
      onWordBoundary,
      onWord,
      onEnd,
    });
    return { mode: "modeling", spoken, logged: !skipLog };
  }

  // 4. Child mode (default): logs utterance + increments counts/pairs, speaks via clip/Kokoro/device
  const now = Date.now();
  if (!skipLog) {
    appendLog({
      t: now,
      ts: now,
      text: cleanText,
      words: tokenList,
      kind,
      mode: "child",
      actor: "child",
      fn: functionTag || inferFunction(cleanText, kind),
    }, { updateCounts: true });
  }

  const voice = voiceOverride !== undefined ? voiceOverride : settings.voice;
  const spd = Number(rate ?? settings.rate ?? 0.9) || 0.9;
  const dbForPitch = typeof deps.load === "function" ? deps.load() : null;
  const rawSemi = Number(opts.pitchSemitones ?? dbForPitch?.access?.childPitchSemitones ?? 0);
  const clampedSemi = Number.isFinite(rawSemi) ? Math.max(-12, Math.min(12, rawSemi)) : 0;
  const emoDelta = opts.emotion === "excited" ? 0.15 : opts.emotion === "happy" ? 0.1 : opts.emotion === "calm" ? -0.05 : opts.emotion === "sad" ? -0.08 : 0;
  const computedPitch = Math.max(0.5, Math.min(2.0, +(1 + clampedSemi * 0.05 + emoDelta).toFixed(3)));
  const shouldInterrupt = interrupt !== false;
  if (shouldInterrupt) stopSpeech();
  const seq = ++speechSeq;

  const speakTts = () => {
    if (seq !== speechSeq) return false;
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (String(voice || "").startsWith("kokoro:") && !isOffline) {
      speakWithKokoro(cleanText, String(voice).slice(7), starts, { rate: spd, pitch: computedPitch, seq, onWordBoundary, onWord, onEnd });
      return true;
    }
    return speakWithSynth(cleanText, starts, {
      voice: String(voice || "").startsWith("kokoro:") ? "" : voice,
      rate: spd,
      pitch: computedPitch,
      interrupt: shouldInterrupt,
      seq,
      onWordBoundary,
      onWord,
      onEnd,
    });
  };

  if (audioClipId && typeof deps.getMedia === "function") {
    deps.getMedia(audioClipId).then((blob) => {
      if (seq !== speechSeq) return;
      if (blob && playMediaClip(blob, {
        onEnd: () => { if (seq === speechSeq) onEnd?.(); },
        onFallback: speakTts,
      })) return;
      speakTts();
    }).catch(() => {
      if (seq !== speechSeq) return;
      speakTts();
    });
    return { mode: "child", spoken: true, logged: !skipLog };
  }

  const spoken = speakTts();
  return { mode: "child", spoken, logged: !skipLog };
}

// CustomEvent bridge for browser modules
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("luminaac:say", (e) => {
    const detail = e?.detail;
    if (!detail || !detail.text) return;
    const { text, ...opts } = detail;
    speakUtterance(text, opts);
  });
}
