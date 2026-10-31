// My Voice, Phase 4: natural-voice preview and download progress, install button.
import * as ai from "./ai.js";
const $ = (s, el = document) => el.querySelector(s);
const sel = $("#voiceSelect");
if (sel) {
  const box = document.createElement("div");
  box.className = "voice-extra";
  box.innerHTML = `<button class="ghost-btn" type="button" id="btnVoicePreview">Preview voice</button>
    <progress id="voiceProg" max="100" value="0" hidden aria-label="Natural voice download"></progress>
    <p class="soft small" id="voiceNote" role="status"></p>`;
  sel.closest("label").after(box);
  const note = $("#voiceNote"), prog = $("#voiceProg");
  const describe = async () => {
    if (!sel.value.startsWith("kokoro:")) { note.textContent = ""; return; }
    note.textContent = (await ai.cached("tts")) ? "Natural voice is on this device. Works offline." : `Natural voice: about ${ai.MODELS.tts.mb} MB downloads the first time it speaks, then it works offline. It runs on this device.`;
  };
  sel.addEventListener("change", describe); describe();
  window.addEventListener("voice:progress", (e) => {
    const p = e.detail; if (p.done || p.pct >= 100) { prog.hidden = true; describe(); return; }
    prog.hidden = false; prog.value = p.pct; note.textContent = `Getting the natural voice ready… ${p.pct}% (${p.mb} of about ${ai.MODELS.tts.mb} MB)`;
  });
  $("#btnVoicePreview").addEventListener("click", async (e) => {
    const b = e.currentTarget, text = "Hi! This is how I sound.";
    if (!sel.value.startsWith("kokoro:")) {
      if (!("speechSynthesis" in window)) { note.textContent = "This device can't speak aloud."; return; }
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text);
      const v = speechSynthesis.getVoices().find((x) => x.name === sel.value); if (v) u.voice = v; speechSynthesis.speak(u); return;
    }
    b.disabled = true;
    try {
      await ai.speakKokoro(text, sel.value.slice(7), { onProgress: (p) => window.dispatchEvent(new CustomEvent("voice:progress", { detail: p })), onStart: () => window.dispatchEvent(new CustomEvent("voice:progress", { detail: { done: true } })) });
    } catch (err) {
      note.textContent = `The natural voice couldn't load (${err.message}). The device voice is used instead.`; prog.hidden = true;
      if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } finally { b.disabled = false; }
  });
}
// Install button in the settings panel (shown only when the browser offers it).
const panel = $("#settings")?.closest(".panel");
if (panel) { const b = Object.assign(document.createElement("button"), { type: "button", className: "ghost-btn", textContent: "Install My Voice on this device", hidden: true }); b.dataset.install = ""; panel.append(b); }
