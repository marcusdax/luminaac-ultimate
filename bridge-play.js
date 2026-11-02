// Bridge settings for the word games (play.js): which games show, and the
// grown-up's sensory dial. Saved in games.settings.play, so it syncs to the
// child's device with the other game settings. The camera needs consent here.
import { GAMES, DEFAULTS, playSettings } from "./play-core.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const db = () => B.db;
const G = () => (db().games ||= { settings: {}, goals: [], plays: [] });
const cur = () => playSettings(G().settings || {});

const card = document.createElement("section");
card.className = "card"; card.setAttribute("aria-labelledby", "h-play2");
card.innerHTML = `<h2 id="h-play2">Word games</h2>
  <p class="soft">Eight games your child plays with their own board words. Nothing fails, nothing is taken away, and "All done" always works.</p>
  <form class="form" id="formPlay2">
    <fieldset class="play2-games"><legend>Show these games</legend>
      ${GAMES.map((g) => `<label class="check"><input type="checkbox" name="show" value="${g.id}" /> <span aria-hidden="true">${g.e}</span> ${g.name}</label>`).join("")}
    </fieldset>
    <label>Movement <select name="motion"><option value="gentle">Gentle</option><option value="still">Still: nothing moves by itself</option></select></label>
    <label>Game sounds <select name="sound"><option value="soft">Soft</option><option value="normal">Normal</option><option value="off">Off (words are still spoken)</option></select></label>
    <label>Rest after <select name="minutes"><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="0">No limit</option></select></label>
    <label>Word buttons in Word Garden <select name="tiles"><option value="4">4</option><option value="6">6</option><option value="9">9</option><option value="12">12</option></select></label>
    <label class="check"><input type="checkbox" name="combos" /> Two words together make a flower bloom</label>
    <label class="check"><input type="checkbox" name="camera" aria-describedby="camHint" /> Copy the Robot may use the camera</label>
    <p class="soft small" id="camHint">Only you can turn this on. The camera checks arm positions on the device, shows a small mirror, and records and sends nothing. Without it, your child taps "I did it".</p>
  </form>`;
$("#formGameSet").closest(".split").after(card);

function render() {
  const s = cur(), f = $("#formPlay2");
  for (const c of f.querySelectorAll('[name="show"]')) c.checked = !(s.off || []).includes(c.value);
  f.motion.value = s.motion; f.sound.value = s.sound; f.minutes.value = String(s.minutes); f.tiles.value = String(s.tiles);
  f.combos.checked = !!s.combos; f.camera.checked = !!s.camera;
}
$("#formPlay2").addEventListener("change", (e) => {
  const f = e.currentTarget, set = (G().settings ||= {});
  set.play = {
    ...DEFAULTS, ...(set.play || {}),
    off: [...f.querySelectorAll('[name="show"]')].filter((c) => !c.checked).map((c) => c.value),
    motion: f.motion.value, sound: f.sound.value, minutes: +f.minutes.value, tiles: +f.tiles.value, combos: f.combos.checked, camera: f.camera.checked,
  };
  B.save(e.target.name === "camera" ? `${f.camera.checked ? "Allowed" : "Stopped"} the camera for Copy the Robot` : "Changed word game settings");
});
addEventListener("bridge:show", (e) => { if (e.detail === "play") render(); });
render();
