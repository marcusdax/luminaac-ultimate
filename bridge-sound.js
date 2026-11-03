// Bridge: the Sound Path tab. Turn it on, see the ladder and its suggestions,
// pick targets (sounds they already make come first), log sounds and words you
// hear, see the sound inventory and the week, coaching, and the SLP sheet.
// The plan lives in the Bridge document (db.sound) so it reaches My Voice; the
// practice log lives only on the device that played (sound-store.js).
import * as C from "./sound-core.js";
import * as St from "./sound-store.js";
import { putMedia, getMedia } from "./shared.js";

const B = window.__bridge;
const db = () => B.db;
const esc = B.esc;
const $ = (s) => document.querySelector(s);
const name = () => db().profile.child || "your child";
const cfg = () => (db().sound ||= { rung: 0, targets: [], tries: 5, cas: false, sayWithMe: true });
const html = (el, s) => { el.innerHTML = s; return el; };
const save = (what) => { B.save(what || "Updated Sound Path"); render(); };
function btn(label, fn, cls = "btn quiet") { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.innerHTML = label; b.addEventListener("click", fn); return b; }

function renderOn() {
  const on = !!db().access.sound;
  html($("#spOn"), `<label class="check"><input type="checkbox" id="spEnable" ${on ? "checked" : ""}/> Show Sound Path games in My Voice</label>
    <p class="soft small">Short, playful voice practice inside ${esc(name())}'s talker. The talker stays their main voice: every board word is also a model they can copy. No mouth or tongue exercises (research doesn't support them), no automatic scoring, and nothing is recorded. You're the judge; with no grown-up there, every try simply counts as "tried".</p>
    <p class="soft small">Games use the microphone only if "Let games listen with the microphone" is on in <a href="#play" data-go="play">Videos and games</a>. Without it, there's an "I did it" button.</p>`);
  $("#spEnable").addEventListener("change", (e) => { db().access.sound = e.target.checked; cfg(); save(e.target.checked ? "Turned on Sound Path" : "Turned off Sound Path"); });
  $("#spOn [data-go]")?.addEventListener("click", (e) => { e.preventDefault(); B.show("play"); });
}

function renderLadder() {
  const c = cfg(), evs = St.events(), adv = C.rungAdvice(evs, c.targets, c.rung), R = C.RUNGS[c.rung];
  html($("#spLadder"), `<div class="pot-ladder" aria-hidden="true">${C.RUNGS.map((r) => `<span class="${r.id <= c.rung ? "on" : ""}"></span>`).join("")}</div>
    <p><b>Rung ${c.rung}: ${esc(R.name)}</b><br><span class="small">${esc(R.goal)}</span></p>
    ${adv ? `<div class="pot-flag" role="status"><b>${adv.back ? `Make it easier: back to rung ${adv.to}?` : `Ready for rung ${adv.to}: ${esc(C.RUNGS[adv.to].name)}?`}</b><span class="soft small"> ${esc(adv.why)} You decide${c.cas ? ", with your SLP" : ""}.</span><div class="row gap" id="spAdvBtns"></div></div>` : ""}
    <label>Rung <select id="spRung">${C.RUNGS.map((r) => `<option value="${r.id}" ${r.id === c.rung ? "selected" : ""}>${r.id}. ${esc(r.name)}</option>`).join("")}</select></label>
    <p class="soft small">A target is "got it" after you mark it on 3 different days. Going back a rung is normal and loses nothing.</p>`);
  if (adv) {
    const box = $("#spAdvBtns");
    box.append(btn(adv.back ? "Yes, easier" : "Yes, move up", () => { St.record("rung", { action: "confirm", to: adv.to }, { by: "caregiver" }); c.rung = adv.to; save("Updated Sound Path"); }, "btn"));
    if (!adv.back) box.append(btn("Not yet", () => { St.record("rung", { action: "decline", to: adv.to }, { by: "caregiver" }); render(); }));
  }
  $("#spRung").addEventListener("change", (e) => { c.rung = +e.target.value; save(); });
}

function renderTargets() {
  const c = cfg(), evs = St.events(), el = $("#spTargets");
  const list = c.targets.map(C.targetOf);
  html(el, `<ul class="sp-tlist" id="spTList"></ul>
    <p class="small"><b>Suggested for rung ${c.rung}</b> <span class="soft">(sounds they already make come first)</span></p><p class="row gap" id="spSugg" style="flex-wrap:wrap"></p>
    <form class="form inline-form" id="spAdd"><label>Word <input name="say" required maxlength="24" placeholder="water" /></label><label>Good-enough form <input name="approx" maxlength="24" placeholder="wa-wa" /></label><button class="btn quiet">Add</button></form>
    <p class="soft small">The good-enough form is what counts as success for now ("wa" for water). Communication first, perfect sounds later. Words also trigger "Say it with me" when tapped on the board.</p>`);
  const ul = $("#spTList");
  if (!list.length) ul.innerHTML = `<li class="soft">No targets yet. Pick 2–4 below.</li>`;
  for (const t of list) {
    const s = C.targetStats(evs, t.id), li = document.createElement("li");
    li.innerHTML = `<span aria-hidden="true">${esc(t.e || "🗣️")}</span><span><b>${esc(t.show)}</b>${t.approx ? ` <span class="soft">(${esc(t.approx)} counts)</span>` : ""}<br><span class="soft small">${s.mastered ? "Got it ✓" : `${s.gotDays} of 3 days marked "got it"`} · ${s.tries} tr${s.tries === 1 ? "y" : "ies"}</span></span>`;
    const x = btn("Remove", () => { c.targets = c.targets.filter((y) => y.id !== t.id); save(); }, "link-btn"); x.setAttribute("aria-label", `Remove ${t.show}`); li.append(x);
    ul.append(li);
  }
  const sg = $("#spSugg");
  for (const s of C.suggestTargets(evs, c.rung, c.targets).slice(0, 8)) sg.append(btn(`${s.e} ${esc(s.show)}`, () => { c.targets = [...c.targets, { id: s.id }].slice(-12); save(); }));
  if (!sg.children.length) sg.innerHTML = `<span class="soft small">All of this rung's ideas are in the list. Add your own words below.</span>`;
  $("#spAdd").addEventListener("submit", (e) => {
    e.preventDefault(); const f = e.target, sayW = f.say.value.trim().toLowerCase(); if (!sayW) return;
    c.targets = [...c.targets, { id: "w-" + sayW.replace(/[^a-z0-9]+/g, "-").slice(0, 20) + "-" + Date.now().toString(36).slice(-4), say: sayW, word: sayW, approx: f.approx.value.trim().toLowerCase() || undefined, rung: Math.max(4, c.rung) }].slice(-12);
    save();
  });
}

function renderInventory() {
  const inv = C.inventory(St.events(), cfg().targets);
  const chip = (x) => `<button type="button" class="sp-ph lv-${x.level}" data-ph="${esc(x.ph)}" aria-label="${esc(x.ph)}: ${x.level === "none" ? "not heard yet" : x.level === "word" ? "used in words" : x.level === "often" ? "heard often" : "heard"}. Tap to log hearing it.">${esc(x.ph)}</button>`;
  html($("#spInv"), `<p class="small"><b>Vowels</b></p><div class="sp-phs">${inv.filter((x) => x.vowel).map(chip).join("")}</div>
    <p class="small"><b>Consonants</b> <span class="soft">(early ones first)</span></p><div class="sp-phs">${inv.filter((x) => !x.vowel).map(chip).join("")}</div>
    <p class="soft small sp-key"><span class="sp-ph lv-none">·</span> not yet <span class="sp-ph lv-once">·</span> heard <span class="sp-ph lv-often">·</span> often <span class="sp-ph lv-word">·</span> in words</p>
    <form class="form inline-form" id="spWord"><label>Heard a word used to mean something <input name="word" required maxlength="24" placeholder="more" /></label><label>How it sounded <input name="approx" maxlength="24" placeholder="mo" /></label><button class="btn quiet">Log it</button></form>`);
  $("#spInv").querySelectorAll("[data-ph]").forEach((b) => b.addEventListener("click", () => { St.record("heard", { sound: b.dataset.ph, spontaneous: true }, { by: "caregiver" }); B.toast(`Logged: heard "${b.dataset.ph}"`); render(); }));
  $("#spWord").addEventListener("submit", (e) => { e.preventDefault(); const f = e.target, w = f.word.value.trim(); if (!w) return; St.record("word_use", { word: w, approx: f.approx.value.trim() || undefined, spontaneous: true }, { by: "caregiver" }); B.toast("Logged. Every word counts."); render(); });
}

function renderWeek() {
  const w = C.weekly(St.events());
  html($("#spWeek"), `<p><b>${w.tries}</b> voice tr${w.tries === 1 ? "y" : "ies"} this week${w.days ? ` over ${w.days} day${w.days === 1 ? "" : "s"} (about ${w.perDay} a day)` : ""}</p>
    <p class="small">${w.sounds} different sounds · ${w.words} word${w.words === 1 ? "" : "s"} used for meaning · ${w.started} things they started · ${w.copied} copied in games</p>
    <p class="small">You marked ${w.got} "got it" and ${w.close} "close".</p>
    <p class="soft small">Counts, never scores. A quiet week is fine.</p>`);
}

function renderSettings() {
  const c = cfg();
  html($("#spSettings"), `<label>Tries per game <select id="spTries">${[3, 4, 5, 6].map((n) => `<option ${n === c.tries ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <label class="check"><input type="checkbox" id="spCas" ${c.cas ? "checked" : ""}/> Apraxia of speech (CAS) or suspected: one target at a time, slower changes</label>
    <label class="check"><input type="checkbox" id="spSay" ${c.sayWithMe ? "checked" : ""}/> "Say it with me": after tapping a target word on the board, a soft 3-second "your turn"</label>
    <label>Word recognition in "Say the word"
      <select id="spAsr"><option value="off">Off (a grown-up judges, or every try counts)</option><option value="device">On this device (vosk, needs a model address)</option><option value="browser">The browser's speech service</option></select></label>
    <label id="spAsrModelL" hidden>Model address <input id="spAsrModel" type="url" placeholder="https://your-site/models/vosk-model-small-en-us-0.15.tar.gz" value="${esc(c.asrModel || "")}" /></label>
    <p class="soft small" id="spAsrNote"></p>`);
  const note = () => {
    const v = $("#spAsr").value; $("#spAsrModelL").hidden = v !== "device";
    $("#spAsrNote").textContent = v === "browser" ? "In Chrome and Safari this sends the microphone audio to Google or Apple to turn it into words. Use the on-device option if that isn't OK." : v === "device" ? "Runs on this device; audio never leaves it. The model (about 40 MB, Apache-2.0) downloads once from the address you give. It only listens for the practice words. The microphone also has to be allowed in Games settings." : "Recognition only ever adds an 'I heard you'. It never marks a try wrong.";
  };
  $("#spAsr").value = c.asr || "off"; note();
  $("#spAsr").addEventListener("change", (e) => { c.asr = e.target.value; save(); note(); });
  $("#spAsrModel").addEventListener("change", (e) => { c.asrModel = e.target.value.trim(); save(); });
  $("#spTries").addEventListener("change", (e) => { c.tries = +e.target.value; save(); });
  $("#spCas").addEventListener("change", (e) => { c.cas = e.target.checked; save(); });
  $("#spSay").addEventListener("change", (e) => { c.sayWithMe = e.target.checked; save(); });
}

// ---------- Increment B: family video models, Mouth Mirror, Sound and treat ----------
// Clips are 3-second close-ups recorded here and kept in this browser's storage
// (IndexedDB), never uploaded. Record on the tablet the child uses, or move a clip
// with "Download" and "Add a clip file".
const FAVS = [["🚂", "Train"], ["🫧", "Bubbles"], ["🎵", "Music"], ["🐶", "Dog"], ["🍪", "Cookie"], ["🚗", "Car"], ["⚽", "Ball"], ["🦕", "Dino"]];
let rec = null;
async function recordClip(t, li) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return B.toast("This browser can't record video.");
  if (rec) return;
  const out = li.querySelector(".sp-rec");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 480, height: 480 }, audio: true });
    out.hidden = false; out.innerHTML = `<video playsinline muted autoplay></video><p class="small" role="status">Get close, face the camera. Say "${esc(t.approx || t.say)}" slowly once…</p>`;
    out.querySelector("video").srcObject = stream;
    const chunks = [], mr = new MediaRecorder(stream);
    rec = mr; mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    for (const n of [3, 2, 1]) { out.querySelector("p").textContent = `Recording in ${n}…`; await new Promise((r) => setTimeout(r, 700)); }
    mr.start(); out.querySelector("p").textContent = `Recording: say "${t.approx || t.say}" now.`;
    await new Promise((r) => setTimeout(r, 3000)); mr.stop();
    await new Promise((r) => (mr.onstop = r)); stream.getTracks().forEach((x) => x.stop());
    const blob = new Blob(chunks, { type: mr.mimeType || "video/webm" });
    out.innerHTML = `<video playsinline controls></video><p class="row gap"></p>`;
    out.querySelector("video").src = URL.createObjectURL(blob);
    out.querySelector("p").append(btn("Keep it", async () => { await putMedia("clip:" + t.id, blob); (cfg().clips ||= {})[t.id] = Date.now(); out.hidden = true; save(`Recorded a "Watch my mouth" clip for "${t.show}"`); }, "btn"), btn("Try again", () => { out.hidden = true; recordClip(t, li); }));
  } catch { out.hidden = true; B.toast("The camera or microphone couldn't start."); }
  finally { rec = null; }
}
async function renderModels() {
  const c = cfg(), el = $("#spModels"), list = c.targets.map(C.targetOf);
  const fav = c.treatThing || { e: "🚂", label: "Train" };
  html(el, `<h3 class="h3">Watch my mouth</h3>
    <p class="soft small">Record a 3-second close-up of a familiar face saying each target, slowly. ${esc(name())} sees it slow, then at normal speed. Clips stay on this device and are never uploaded.</p>
    <ul class="sp-tlist" id="spClips"></ul>
    <h3 class="h3">Mouth Mirror</h3>
    <label class="check"><input type="checkbox" id="spMirror" ${c.mirror ? "checked" : ""}/> Mouth Mirror may use the front camera</label>
    <p class="soft small">A friendly face copies ${esc(name())}'s jaw and lips: open (ah), round (oo) and closed (mm). Only jaw and lips: the camera can't reliably see the tongue. It runs on the device; nothing is recorded or sent. Leave it off if they don't like the camera. Without it, "I did it" works the same.</p>
    <h3 class="h3">Sound and treat <span class="pill">with your SLP</span></h3>
    <label class="check"><input type="checkbox" id="spTreat" ${c.treat ? "checked" : ""}/> Show Sound and treat</label>
    <p class="soft small">The target sound plays while their favourite thing shows, to make the sound worth listening to. Nothing is asked of them. Research on this is mixed and small, so use it with your SLP.</p>
    <div id="spTreatSet" ${c.treat ? "" : "hidden"}>
      <label>Sound <select id="spTreatTarget">${list.map((t) => `<option value="${esc(t.id)}" ${t.id === c.treatTarget ? "selected" : ""}>${esc(t.show)}</option>`).join("")}</select></label>
      <p class="small">Favourite thing</p><p class="row gap" id="spFavs" style="flex-wrap:wrap">${FAVS.map(([e, l]) => `<button type="button" class="btn quiet${fav.e === e ? " is-on" : ""}" data-fe="${e}" data-fl="${l}" aria-pressed="${fav.e === e}">${e} ${l}</button>`).join("")}</p>
      <label>Times a day <select id="spTreatN">${[5, 10, 15].map((n) => `<option ${n === (c.treatPerDay || 10) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    </div>`);
  const ul = $("#spClips");
  if (!list.length) ul.innerHTML = `<li class="soft">Choose targets first.</li>`;
  for (const t of list) {
    const has = !!(await getMedia("clip:" + t.id).catch(() => null)), li = document.createElement("li");
    li.innerHTML = `<span aria-hidden="true">${esc(t.e || "🗣️")}</span><span><b>${esc(t.show)}</b><br><span class="soft small">${has ? "Clip on this device ✓" : c.clips?.[t.id] ? "Recorded on another device" : "No clip yet"}</span></span><span class="row gap"></span><div class="sp-rec" hidden></div>`;
    const acts = li.querySelector(".row");
    acts.append(btn(has ? "Record again" : "Record", () => recordClip(t, li)));
    if (has) acts.append(btn("Download", async () => { const b = await getMedia("clip:" + t.id); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `luminaac-clip-${t.id}.webm`; a.click(); }, "link-btn"));
    const file = document.createElement("label"); file.className = "link-btn"; file.innerHTML = `Add a clip file<input type="file" accept="video/*" hidden>`;
    file.querySelector("input").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 8e6) return B.toast("That clip is too big. Keep it to a few seconds."); await putMedia("clip:" + t.id, f); (cfg().clips ||= {})[t.id] = Date.now(); save(`Added a "Watch my mouth" clip for "${t.show}"`); });
    acts.append(file); ul.append(li);
  }
  $("#spMirror").addEventListener("change", (e) => { c.mirror = e.target.checked; save(e.target.checked ? "Allowed the camera for Mouth Mirror" : "Stopped the camera for Mouth Mirror"); });
  $("#spTreat").addEventListener("change", (e) => { c.treat = e.target.checked; if (c.treat && !c.treatTarget) c.treatTarget = list[0]?.id; save(e.target.checked ? "Turned on Sound and treat" : "Turned off Sound and treat"); });
  $("#spTreatTarget")?.addEventListener("change", (e) => { c.treatTarget = e.target.value; save(); });
  $("#spTreatN")?.addEventListener("change", (e) => { c.treatPerDay = +e.target.value; save(); });
  $("#spFavs")?.addEventListener("click", (e) => { const b = e.target.closest("[data-fe]"); if (!b) return; c.treatThing = { e: b.dataset.fe, label: b.dataset.fl }; save(); });
}

// Increment D: the family's own labelled magic moments, exported for a future
// personal sound model. Only with a parent's say-so, never automatic.
async function exportSoundSet() {
  const who = prompt(`This downloads every magic moment that has a recording and a meaning, with your labels, as one file. It may contain ${name()}'s voice and your home. Keep it private and share it only with someone you trust (for example a research team with ethics approval).\n\nType your name to agree:`);
  if (!who?.trim()) return;
  const set = C.soundSet(db().moments || [], { child: db().profile.child || "", consentBy: who.trim().slice(0, 60) });
  const toB64 = (b) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(b); });
  for (const it of set.items) { const b = await getMedia(it.id).catch(() => null); it.data = b ? await toB64(b) : null; }
  set.items = set.items.filter((x) => x.data);
  if (!set.items.length) return B.toast("No recorded moments with a meaning on this device yet.");
  B.download(`luminaac-sound-set-${B.dayKey(Date.now())}.json`, set);
  B.save(`Exported ${set.items.length} labelled sound${set.items.length === 1 ? "" : "s"} (agreed by ${set.consentBy})`);
}

function renderCoach() {
  html($("#spCoach"), C.COACH.map((x) => `<div class="pot-script"><b>${esc(x.title)}</b><ul>${x.say.map((y) => `<li>${esc(y)}</li>`).join("")}</ul></div>`).join(""));
}

function slpHTML() {
  const c = cfg(), evs = St.events(), w = C.weekly(evs), inv = C.inventory(evs, c.targets).filter((x) => x.n);
  return `<h1>Sound Path: ${esc(name())}</h1><p>From LuminAAC, ${new Date().toLocaleDateString()}. Family-judged; "got it" = the family's good-enough form on 3 different days.</p>
    <h2>Rung ${c.rung}: ${esc(C.RUNGS[c.rung].name)}${c.cas ? " (CAS setting on)" : ""}</h2>
    <table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>Target</th><th>Counts as</th><th>Tries</th><th>Days "got it"</th><th>Last 10</th></tr>
    ${c.targets.map(C.targetOf).map((t) => { const s = C.targetStats(evs, t.id); return `<tr><td>${esc(t.show)}</td><td>${esc(t.approx || "")}</td><td>${s.tries}</td><td>${s.gotDays}${s.mastered ? " ✓" : ""}</td><td>${s.rate == null ? "" : Math.round(s.rate * 100) + "%"}</td></tr>`; }).join("")}</table>
    <h2>Sounds heard</h2><p>${inv.map((x) => `${esc(x.ph)}${x.inWord ? " (in words)" : ""}`).join(", ") || "None logged yet"}</p>
    <h2>Last 7 days</h2><p>${w.tries} tries on ${w.days} days, ${w.sounds} different sounds, ${w.words} words used for meaning, ${w.started} child-started.</p>
    <h2>Notes for the SLP</h2><p>Practice is short (3–6 tries), blocked for new targets and mixed once reliable, with praise faded on reliable targets. No non-speech oral-motor exercises. Please send targets or changes back to the family.</p>`;
}
function renderData() {
  const el = $("#spData"); html(el, `<p class="row gap" style="flex-wrap:wrap"></p><p class="soft small">${St.events().length} entries on this device. Only "a try happened" and your judgement are kept; no sound is ever recorded.</p>`);
  const row = el.querySelector("p");
  row.append(btn("Print a sheet for the SLP", () => {
    let box = document.querySelector(".pot-print"); if (!box) { box = document.createElement("div"); box.className = "pot-print"; document.body.append(box); }
    box.innerHTML = slpHTML(); document.body.classList.add("printing-potty");
    const done = () => { document.body.classList.remove("printing-potty"); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done); setTimeout(() => window.print(), 50);
  }), btn("Download practice data", () => B.download(`luminaac-sound-${B.dayKey(Date.now())}.json`, St.exportData())),
  btn("Export labelled sounds", exportSoundSet),
  btn("Delete practice data", () => { if (confirm("Delete all Sound Path practice data on this device? This can't be undone.")) { St.deleteAll(); B.toast("Deleted."); render(); } }, "btn danger quiet"));
}

function render() {
  if ($("#tab-sound")?.hidden !== false) return;
  renderOn();
  const on = !!db().access.sound;
  ["#spLadder", "#spTargets", "#spInv", "#spWeek", "#spSettings", "#spModels", "#spCoach", "#spData"].forEach((s) => ($(s).closest(".card").hidden = !on));
  if (!on) return;
  renderLadder(); renderTargets(); renderInventory(); renderWeek(); renderSettings(); renderModels(); renderCoach(); renderData();
}
window.addEventListener("bridge:show", (e) => { if (e.detail === "sound") render(); });
window.addEventListener("bridge:reload", render);
St.onChange(render);
if (location.hash === "#sound") render();
