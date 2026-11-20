// Bridge: photo symbols (camera or upload, square crop, on this device) and a
// recorded caregiver voice for any board word or My things button.
import * as S from "./symbols.js";
import { CORE, FOLDERS } from "./vocab.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const db = () => B.db;
const card = document.createElement("section");
card.className = "card"; card.id = "symCard"; card.setAttribute("aria-labelledby", "h-sym");
card.innerHTML = `<h2 id="h-sym">Photos and recorded voices</h2>
  <p class="soft">Use a real photo for a word (their cup, their teacher, the park), and record how you say it. Photos and recordings stay on this device. They are never uploaded or synced.</p>
  <div class="form">
    <label>Word or button <input id="symWord" list="symWords" maxlength="60" placeholder="cup" autocomplete="off" /></label>
    <datalist id="symWords"></datalist>
    <fieldset><legend>Photo</legend>
      <label class="btn quiet sym-file">Take or choose a photo<input type="file" id="symFile" accept="image/*" capture="environment" class="sr-only" /></label>
      <div id="symCrop" hidden>
        <canvas id="symCanvas" width="240" height="240" class="sym-canvas" role="img" aria-label="Photo preview, cropped to a square"></canvas>
        <label>Zoom <input type="range" id="symZoom" min="1" max="3" step="0.05" value="1" /></label>
        <label>Left and right <input type="range" id="symX" min="0" max="1" step="0.01" value="0.5" /></label>
        <label>Up and down <input type="range" id="symY" min="0" max="1" step="0.01" value="0.5" /></label>
        <button class="btn" type="button" id="symSavePhoto">Save photo</button>
      </div>
    </fieldset>
    <fieldset><legend>Your voice</legend>
      <div class="row gap">
        <button class="btn quiet" type="button" id="symRec" aria-pressed="false">Record</button>
        <button class="btn quiet" type="button" id="symPlay" disabled>Play it back</button>
        <button class="btn" type="button" id="symSaveVoice" disabled>Save voice</button>
      </div>
      <p class="soft small">Up to 5 seconds. Say it the way you say it at home.</p>
    </fieldset>
  </div>
  <p class="soft" id="symStatus" role="status"></p>
  <h3 class="h3">On this device</h3>
  <ul class="mini-list" id="symList"></ul>`;
($("#h-addbtn")?.closest(".card") || $("#tab-vocab .split")).after(card);

const status = (m) => ($("#symStatus").textContent = m);
const word = () => $("#symWord").value.trim();
function fillWords() {
  const words = new Set([...(db().personality || []).map((p) => p.label), ...CORE.map((c) => c.w), ...FOLDERS.flatMap((f) => (f.words || []).map((w) => w.w))]);
  $("#symWords").innerHTML = [...words].filter(Boolean).slice(0, 400).map((w) => `<option value="${B.esc(w)}">`).join("");
}
function renderList() {
  const i = S.index(), keys = [...new Set([...Object.keys(i.photos), ...Object.keys(i.voices)])].sort();
  const ul = $("#symList"); ul.textContent = "";
  if (!keys.length) { ul.innerHTML = `<li class="soft">No photos or recordings yet.</li>`; return; }
  for (const k of keys) {
    const li = document.createElement("li"); const label = (i.photos[k] || i.voices[k]).label || k;
    li.innerHTML = `<span class="sym-thumb" aria-hidden="true"></span><span class="grow">${B.esc(label)}${i.photos[k] ? " · photo" : ""}${i.voices[k] ? " · your voice" : ""}</span>`;
    if (i.photos[k]) S.applyPhoto(li.querySelector(".sym-thumb"), label);
    for (const kind of ["photo", "voice"]) if (i[kind + "s"][k]) {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "btn quiet small", textContent: `Remove ${kind}` });
      b.setAttribute("aria-label", `Remove ${kind} for ${label}`);
      b.addEventListener("click", async () => { await S.remove(label, kind); status(`Removed the ${kind} for "${label}".`); renderList(); });
      li.append(b);
    }
    ul.append(li);
  }
}

// ---- Photo: load, crop with sliders (no dragging needed), save ----
let img = null;
function draw() {
  if (!img) return;
  const c = $("#symCanvas"), r = S.cropRect(img.naturalWidth, img.naturalHeight, +$("#symZoom").value, +$("#symX").value, +$("#symY").value);
  c.getContext("2d").drawImage(img, r.x, r.y, r.side, r.side, 0, 0, c.width, c.height);
}
$("#symFile").addEventListener("change", (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  const url = URL.createObjectURL(f); const im = new Image();
  im.onload = () => { img = im; $("#symCrop").hidden = false; ["#symZoom", "#symX", "#symY"].forEach((s, i) => ($(s).value = i ? 0.5 : 1)); draw(); status("Move the sliders until the picture fills the square."); };
  im.onerror = () => status("That file couldn't be opened as a picture.");
  im.src = url;
});
["#symZoom", "#symX", "#symY"].forEach((s) => $(s).addEventListener("input", draw));
$("#symSavePhoto").addEventListener("click", async () => {
  if (!word()) { status("Type the word or button first."); $("#symWord").focus(); return; }
  if (!img) return;
  const blob = await S.cropToBlob(img, { zoom: +$("#symZoom").value, cx: +$("#symX").value, cy: +$("#symY").value });
  await S.savePhoto(word(), blob); status(`Photo saved for "${word()}". My Voice shows it next time the board opens.`); renderList();
});

// ---- Voice: record up to 5 seconds, play back, save ----
let rec = null, chunks = [], clip = null, stopTimer = null;
$("#symRec").addEventListener("click", async () => {
  if (rec?.state === "recording") { rec.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { status("This browser can't record sound."); return; }
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { status("Microphone permission was not given."); return; }
  chunks = []; rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => { clearTimeout(stopTimer); stream.getTracks().forEach((t) => t.stop()); clip = new Blob(chunks, { type: rec.mimeType || "audio/webm" }); $("#symRec").textContent = "Record again"; $("#symRec").setAttribute("aria-pressed", "false"); $("#symPlay").disabled = $("#symSaveVoice").disabled = false; status("Recorded. Play it back, then save."); };
  rec.start(); $("#symRec").textContent = "Stop"; $("#symRec").setAttribute("aria-pressed", "true"); status("Recording…");
  stopTimer = setTimeout(() => rec?.state === "recording" && rec.stop(), 5000);
});
$("#symPlay").addEventListener("click", () => { if (clip) { const u = URL.createObjectURL(clip); const a = new Audio(u); a.onended = () => URL.revokeObjectURL(u); a.play().catch(() => {}); } });
$("#symSaveVoice").addEventListener("click", async () => {
  if (!word()) { status("Type the word or button first."); $("#symWord").focus(); return; }
  if (!clip) return;
  await S.saveVoice(word(), clip); status(`Your voice is saved for "${word()}". My Voice plays it instead of the device voice.`); renderList();
});
fillWords(); renderList();
new MutationObserver(() => !$("#tab-vocab").hidden && (fillWords(), renderList())).observe($("#tab-vocab"), { attributes: true, attributeFilter: ["hidden"] });
