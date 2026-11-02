// Bridge: the Sound Path tab. Turn it on, see the ladder and its suggestions,
// pick targets (sounds they already make come first), log sounds and words you
// hear, see the sound inventory and the week, coaching, and the SLP sheet.
// The plan lives in the Bridge document (db.sound) so it reaches My Voice; the
// practice log lives only on the device that played (sound-store.js).
import * as C from "./sound-core.js";
import * as St from "./sound-store.js";

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
  btn("Delete practice data", () => { if (confirm("Delete all Sound Path practice data on this device? This can't be undone.")) { St.deleteAll(); B.toast("Deleted."); render(); } }, "btn danger quiet"));
}

function render() {
  if ($("#tab-sound")?.hidden !== false) return;
  renderOn();
  const on = !!db().access.sound;
  ["#spLadder", "#spTargets", "#spInv", "#spWeek", "#spSettings", "#spCoach", "#spData"].forEach((s) => ($(s).closest(".card").hidden = !on));
  if (!on) return;
  renderLadder(); renderTargets(); renderInventory(); renderWeek(); renderSettings(); renderCoach(); renderData();
}
window.addEventListener("bridge:show", (e) => { if (e.detail === "sound") render(); });
window.addEventListener("bridge:reload", render);
St.onChange(render);
if (location.hash === "#sound") render();
