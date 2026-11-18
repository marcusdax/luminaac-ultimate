// neural-features.js: wires up Whisper ASR, MMS TTS, and neural word prediction.
// All features are opt-in via Bridge settings and gated by localStorage flags:
//   "luminaac:neural-predict"  = "1"  — word prediction bar
//   "luminaac:tts-lang"        = ISO 639-3 code (e.g. "spa") — MMS voice language
//   "luminaac:neural-asr"      = "1"  — Whisper ASR for caregiver dictation
// None of these are on by default. Audio and text never leave the device.
import { transcribe, predictWords, speakMms, stopMms, synthMmsTts, load as loadModel, MODELS, MMS_MB, mmsTtsModelId, cachedMms } from "./ai.js";

// -------------------------------------------------------------------------
// Language registry — the 60 most-common MMS languages for the Bridge UI.
// The full model family covers 1,107 languages; any ISO 639-3 code works.
// -------------------------------------------------------------------------
export const MMS_LANGUAGES = {
  eng: "English", spa: "Spanish", fra: "French", deu: "German", ita: "Italian",
  por: "Portuguese", ara: "Arabic", cmn: "Mandarin Chinese", jpn: "Japanese",
  kor: "Korean", hin: "Hindi", ben: "Bengali", rus: "Russian", pol: "Polish",
  nld: "Dutch", swe: "Swedish", nor: "Norwegian", dan: "Danish", fin: "Finnish",
  tur: "Turkish", vie: "Vietnamese", tha: "Thai", ind: "Indonesian", msa: "Malay",
  tgl: "Filipino", hau: "Hausa", yor: "Yoruba", ibo: "Igbo", swa: "Swahili",
  amh: "Amharic", zul: "Zulu", afr: "Afrikaans", ukr: "Ukrainian", ces: "Czech",
  slk: "Slovak", hrv: "Croatian", ron: "Romanian", hun: "Hungarian", ell: "Greek",
  heb: "Hebrew", far: "Persian", urd: "Urdu", tam: "Tamil", tel: "Telugu",
  kan: "Kannada", mal: "Malayalam", guj: "Gujarati", pan: "Punjabi", mar: "Marathi",
  nep: "Nepali", cat: "Catalan", bul: "Bulgarian", srp: "Serbian", slv: "Slovenian",
  est: "Estonian", lav: "Latvian", lit: "Lithuanian", gle: "Irish", cym: "Welsh",
  sqi: "Albanian", kat: "Georgian",
};

// -------------------------------------------------------------------------
// Settings helpers
// -------------------------------------------------------------------------
export const getTtsLang = () => localStorage.getItem("luminaac:tts-lang") || "eng";
export const setPredictEnabled = (on) => localStorage.setItem("luminaac:neural-predict", on ? "1" : "0");
export const getPredictEnabled = () => localStorage.getItem("luminaac:neural-predict") === "1";
export const setAsrEnabled = (on) => localStorage.setItem("luminaac:neural-asr", on ? "1" : "0");
export const getAsrEnabled = () => localStorage.getItem("luminaac:neural-asr") === "1";
export const setTtsLang = (lang) => localStorage.setItem("luminaac:tts-lang", lang || "eng");

// Use MMS when language is set to anything other than English
export const shouldUseMms = (lang) => lang && lang !== "eng";

// -------------------------------------------------------------------------
// Neural word prediction bar
// -------------------------------------------------------------------------
let predBar = null, predAbort = null;

// Call once after the sentence bar is in the DOM.
// sentenceBar: the element that shows the current phrase being built.
// onInsert(word): called when the user taps a prediction chip.
export function initPredictionBar(sentenceBar, onInsert) {
  if (predBar) return;
  predBar = document.createElement("div");
  predBar.className = "pred-bar";
  predBar.setAttribute("role", "group");
  predBar.setAttribute("aria-label", "Word suggestions");
  predBar.hidden = true;
  sentenceBar.before(predBar);

  // Warm up the prediction model in the background if the flag is already set
  if (getPredictEnabled()) _warmPredict();

  predBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".pred-btn");
    if (btn) onInsert?.(btn.dataset.word);
  });
}

function _warmPredict() {
  loadModel("predict", { onProgress: () => {} }).catch(() => {});
}

// Call whenever the sentence bar text changes.
export async function updatePredictions(text) {
  if (!predBar || !getPredictEnabled()) {
    if (predBar) predBar.hidden = true;
    return;
  }
  predAbort?.abort();
  const ctrl = new AbortController();
  predAbort = ctrl;

  try {
    const trimmed = (text || "").trim();
    if (trimmed.length < 2) { predBar.hidden = true; return; }

    const result = await predictWords(trimmed, { count: 5 });
    if (ctrl.signal.aborted) return;

    const words = result?.predictions?.filter(Boolean) ?? [];
    if (!words.length) { predBar.hidden = true; return; }

    predBar.innerHTML = words
      .map((w) => `<button class="pred-btn" type="button" data-word="${w.replace(/"/g, "&quot;")}">${w}</button>`)
      .join("");
    predBar.hidden = false;
  } catch {
    if (!ctrl.signal.aborted && predBar) predBar.hidden = true;
  }
}

export function hidePredictionBar() {
  if (predBar) predBar.hidden = true;
}

// -------------------------------------------------------------------------
// MMS TTS integration
// -------------------------------------------------------------------------
// Call to warm-load the MMS model for the current language in the background.
export function warmMmsTts(lang) {
  if (!shouldUseMms(lang)) return;
  loadModel(`tts-mms-${lang}`, { onProgress: () => {} }).catch(() => {});
}

// Speak text using MMS (non-English) or return null for Kokoro/speechSynthesis fallback.
// opts.onProgress(pct) is called during model download if the model is not cached.
export async function speakWithMms(text, lang, opts = {}) {
  if (!shouldUseMms(lang)) return null;
  return speakMms(text, lang, opts);
}

export { stopMms };

// Get download size hint for the current language's MMS model
export async function mmsSizeInfo(lang) {
  const isLoaded = await cachedMms(lang);
  return { mb: MMS_MB, cached: isLoaded, modelId: mmsTtsModelId(lang) };
}

// -------------------------------------------------------------------------
// Whisper ASR — caregiver dictation and open-vocabulary recognition
// -------------------------------------------------------------------------
// Transcribe a Blob or Float32Array. Returns { text, ms }.
// lang is a Whisper language name ("english", "spanish", …); omit for auto-detect.
export async function dictate(input, opts = {}) {
  if (!getAsrEnabled()) return null;
  return transcribe(input, { lang: opts.lang, translate: opts.translate, onProgress: opts.onProgress });
}

// -------------------------------------------------------------------------
// Bridge settings UI helpers — rendered by bridge.js / bridge-p7.js
// -------------------------------------------------------------------------
export function renderNeuralSettings(container) {
  if (!container) return;
  const lang = getTtsLang();
  container.innerHTML = `
    <section class="neural-settings" aria-label="AI voice and prediction">
      <h3 class="settings-h3">AI voice and word prediction</h3>

      <label class="settings-row toggle-row">
        <span class="settings-label">
          Word prediction
          <small>Suggests next words as you build a sentence (${MODELS.predict.mb} MB, downloads once)</small>
        </span>
        <input type="checkbox" id="nf-predict-on" class="visually-hidden"${getPredictEnabled() ? " checked" : ""}>
        <span class="toggle" aria-hidden="true"></span>
      </label>

      <label class="settings-row toggle-row">
        <span class="settings-label">
          Speech recognition
          <small>Understand full sentences, not just the word game (${MODELS.asr.mb} MB, downloads once)</small>
        </span>
        <input type="checkbox" id="nf-asr-on" class="visually-hidden"${getAsrEnabled() ? " checked" : ""}>
        <span class="toggle" aria-hidden="true"></span>
      </label>

      <div class="settings-row">
        <label class="settings-label" for="nf-tts-lang">
          Voice language
          <small>Choose a language for MMS (1,100+ languages, ~${MMS_MB} MB per language)</small>
        </label>
        <select id="nf-tts-lang" class="settings-select">
          ${Object.entries(MMS_LANGUAGES)
            .map(([code, name]) => `<option value="${code}"${code === lang ? " selected" : ""}>${name}</option>`)
            .join("")}
        </select>
      </div>
      <p class="settings-note" id="nf-lang-note" aria-live="polite"></p>
    </section>`;

  container.querySelector("#nf-predict-on").addEventListener("change", (e) => {
    setPredictEnabled(e.target.checked);
    if (e.target.checked) _warmPredict();
  });
  container.querySelector("#nf-asr-on").addEventListener("change", (e) => {
    setAsrEnabled(e.target.checked);
  });
  container.querySelector("#nf-tts-lang").addEventListener("change", async (e) => {
    const newLang = e.target.value;
    setTtsLang(newLang);
    const note = container.querySelector("#nf-lang-note");
    if (shouldUseMms(newLang)) {
      const { cached, mb, modelId } = await mmsSizeInfo(newLang);
      note.textContent = cached
        ? `${MMS_LANGUAGES[newLang] || newLang} is ready offline.`
        : `${MMS_LANGUAGES[newLang] || newLang} will download ~${mb} MB on first use (${modelId}).`;
      warmMmsTts(newLang);
    } else {
      note.textContent = "";
    }
  });
}
