// My Voice, Phase 4: natural-voice preview and download progress, install button.
import * as ai from "./ai.js";
import { speakUtterance } from "./speech.js";
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
  $("#btnVoicePreview").addEventListener("click", (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    speakUtterance("Hi! This is how I sound.", {
      mode: "child",
      voiceOverride: sel.value,
      skipLog: true,
      onEnd: () => { b.disabled = false; },
    });
  });
}
// Install button in the settings panel (shown only when the browser offers it).
const panel = $("#settings")?.closest(".panel");
if (panel) { const b = Object.assign(document.createElement("button"), { type: "button", className: "ghost-btn", textContent: "Install My Voice on this device", hidden: true }); b.dataset.install = ""; panel.append(b); }
