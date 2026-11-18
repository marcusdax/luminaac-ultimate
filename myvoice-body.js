// Body map for My Voice (milestone M2, interoception).
// "Something hurts" in Calm opens a picture of a body. The child presses where,
// then how it feels, and My Voice says it: "My tummy feels sharp."
// Every part is a real button, so touch, keyboard, dwell and switch scanning all reach it.
import { BODY, SENSATIONS, RELIEF, bodySentence } from "./slp-core.js";

const $ = (s, el = document) => el.querySelector(s);
const open = $("#bodyOpen"), box = $("#bodyMap");
const voice = () => window.luminaacVoice;
const say = (text, kind) => { voice()?.say(text); voice()?.record(text, kind); };
const pick = { part: null, feel: null };

// A simple front-view figure on a 200 x 400 grid (the same grid as BODY in slp-core.js).
const FIGURE = `<svg class="body-fig" viewBox="0 0 200 400" aria-hidden="true">
  <g fill="var(--paper-raised)" stroke="var(--ink-soft)" stroke-width="3" stroke-linejoin="round">
    <ellipse cx="100" cy="58" rx="34" ry="44"/>
    <rect x="86" y="100" width="28" height="20" rx="6"/>
    <path d="M64 124 Q100 112 136 124 L136 252 L64 252 Z"/>
    <path d="M62 128 L36 134 L24 214 L44 218 L58 160 Z"/>
    <path d="M138 128 L164 134 L176 214 L156 218 L142 160 Z"/>
    <path d="M66 252 L98 252 L96 360 L70 360 Z"/>
    <path d="M102 252 L134 252 L130 360 L104 360 Z"/>
    <path d="M62 360 L98 360 L98 384 L56 384 Z"/>
    <path d="M102 360 L138 360 L144 384 L102 384 Z"/>
  </g>
</svg>`;

function render() {
  const parts = BODY.map((p) => `<button type="button" class="body-part" data-part="${p.id}" aria-pressed="${pick.part === p.id}"
    style="left:${(p.x / 200) * 100}%;top:${(p.y / 400) * 100}%;width:${(p.w / 200) * 100}%;height:${(p.h / 400) * 100}%"><span>${p.label}</span></button>`).join("");
  const part = BODY.find((p) => p.id === pick.part);
  const sentence = part ? bodySentence(part.id, pick.feel) : "";
  box.innerHTML = `<h2 class="h2">Where does it feel wrong?</h2>
    <div class="body-cols">
      <div class="body-figure">${FIGURE}${parts}</div>
      <div class="body-side">
        <h3 class="h3">How does it feel?</h3>
        <div class="body-chips" role="group" aria-label="How it feels">${SENSATIONS.map((s) => `<button type="button" class="phrase body-feel" data-feel="${s.id}" aria-pressed="${pick.feel === s.id}" ${part ? "" : "disabled"}><span class="pic" aria-hidden="true">${s.e}</span>${s.w}</button>`).join("")}</div>
        <p class="body-say" aria-live="polite">${sentence ? `<button type="button" class="solid-btn" id="bodySay">Say "${sentence}"</button>` : `<span class="soft">Press a part of the body first.</span>`}</p>
        <h3 class="h3">What would help?</h3>
        <div class="body-chips" role="group" aria-label="What would help">${RELIEF.map((r, i) => `<button type="button" class="phrase body-relief" data-relief="${i}"><span class="pic" aria-hidden="true">${r.e}</span>${r.w}</button>`).join("")}</div>
      </div>
    </div>`;
}

open?.addEventListener("click", () => {
  const show = box.hidden;
  box.hidden = !show;
  open.setAttribute("aria-expanded", String(show));
  if (show) { pick.part = pick.feel = null; render(); box.scrollIntoView({ block: "nearest" }); }
});
box?.addEventListener("click", (e) => {
  const part = e.target.closest("[data-part]"), feel = e.target.closest("[data-feel]"), relief = e.target.closest("[data-relief]");
  if (part) {
    pick.part = part.dataset.part; pick.feel = null; render();
    voice()?.say(BODY.find((p) => p.id === pick.part).label);
    $(`[data-part="${pick.part}"]`, box)?.focus();
  } else if (feel && pick.part) {
    pick.feel = feel.dataset.feel; render();
    say(bodySentence(pick.part, pick.feel), "body");
    $(`[data-feel="${pick.feel}"]`, box)?.focus();
  } else if (e.target.closest("#bodySay")) {
    say(bodySentence(pick.part, pick.feel), "body");
  } else if (relief) {
    say(RELIEF[+relief.dataset.relief].w, "body");
  }
});
