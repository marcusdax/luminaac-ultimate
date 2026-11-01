// "My Voice" additions to the Talk view: proactive suggestions from learned
// signals, context pages, the Personality page, Play-moment buttons, and
// Exploration mode (browse without speaking; taps are logged for caregivers).
import { load, persist, suggest, activeRules, getMedia, speak, partOfDay, recordFeedback, raiseAlert, MILESTONES } from "./shared.js";

const talk = document.getElementById("view-talk");
let db = load();

const wrap = document.createElement("div");
wrap.className = "mv";
wrap.innerHTML = `
  <div class="mv-safety" id="mvSafety" role="group" aria-label="Get a grown-up">
    <button type="button" class="mv-sos" data-kind="help"><span aria-hidden="true">🙋</span> I need help</button>
    <button type="button" class="mv-sos is-home" data-kind="home"><span aria-hidden="true">🏠</span> Take me home</button>
  </div>
  <div class="mv-bar">
    <div class="mv-suggest" role="group" aria-label="Suggestions from learned signals" id="mvSuggest"></div>
    <label class="mv-explore"><input type="checkbox" id="mvExplore"> <span>Explore quietly</span></label>
  </div>
  <p class="mv-context" id="mvContext"></p>
  <details class="mv-personality">
    <summary><span aria-hidden="true">🌟</span> My things</summary>
    <div class="mv-ptiles" id="mvPersonality" role="group" aria-label="My favorite people, things, and memories"></div>
  </details>
  <details class="mv-personality mv-stories">
    <summary><span aria-hidden="true">📖</span> My stories and practice</summary>
    <div class="mv-ptiles" id="mvStories" role="group" aria-label="Stories, routines and sound practice"></div>
  </details>
  <dialog class="mv-player" id="mvPlayer" aria-labelledby="mvPlayerTitle">
    <form method="dialog">
      <h2 id="mvPlayerTitle"></h2>
      <div class="mv-steps" id="mvSteps" aria-hidden="true"></div>
      <p class="mv-step-pic" id="mvStepPic" aria-hidden="true"></p>
      <p class="mv-step-text" id="mvStepText" aria-live="polite"></p>
      <p class="mv-reward" id="mvReward" aria-live="polite"></p>
      <div class="mv-player-row" id="mvPlayerRow"></div>
      <button class="mv-close" value="close">Close</button>
    </form>
  </dialog>`;
talk.prepend(wrap);

function render() {
  db = load();
  const sugg = suggest(db).slice(0, 3);
  const box = document.getElementById("mvSuggest");
  box.textContent = "";
  sugg.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mv-chip" + (i === 0 ? " is-top" : "");
    b.textContent = s.phrase;
    b.setAttribute("aria-label", `Suggestion: ${s.phrase}`);
    b.addEventListener("click", () => say(s.phrase, { signal: s.id }));
    box.append(b);
  });
  if (sugg.length) {
    const no = document.createElement("button");
    no.type = "button"; no.className = "mv-none"; no.textContent = "Not these";
    no.addEventListener("click", () => { db = load(); sugg.forEach((s) => { recordFeedback(db, false, s); const x = db.signals.find((y) => y.id === s.id); if (x) x.rejections += 1; }); persist(db); render(); });
    box.append(no);
  }
  if (!sugg.length) box.innerHTML = `<span class="mv-empty">Suggestions appear as the Bridge learns signals.</span>`;
  document.getElementById("mvSafety").hidden = db.access.safety === false;
  renderStories();
  const rules = activeRules(db).map((r) => r.page);
  document.getElementById("mvContext").textContent =
    `It's ${partOfDay()} at ${db.profile.place}` + (rules.length ? ` · showing ${rules.join(", ")} words first` : "");
  const pt = document.getElementById("mvPersonality");
  pt.textContent = "";
  db.personality.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tile mv-ptile";
    b.dataset.c = "thing";
    b.innerHTML = `<span class="pic" aria-hidden="true">${p.e}</span><span class="label"></span>${p.momentId ? '<span class="mv-play" aria-hidden="true">▶</span>' : ""}`;
    b.querySelector(".label").textContent = p.label;
    b.setAttribute("aria-label", p.label + (p.momentId ? ", plays a moment" : ""));
    b.addEventListener("click", () => playOrSay(p));
    pt.append(b);
  });
}

function exploring() { return document.getElementById("mvExplore").checked; }

function say(text, meta = {}) {
  if (exploring()) { logExplore(text); return; }
  speak(text);
  if (meta.signal) {
    db = load();
    const s = db.signals.find((x) => x.id === meta.signal);
    if (s) { s.confirmations += 1; recordFeedback(db, true, s); persist(db); }
  }
  countMessage();
}

// Gentle milestones: a quiet note, never a flashing reward.
function countMessage() {
  db = load();
  db.spoken = (db.spoken || 0) + 1;
  if (MILESTONES.includes(db.spoken)) {
    db.milestones = [...(db.milestones || []), { n: db.spoken, t: Date.now() }];
    note(`${db.spoken} messages said. Lovely talking.`);
  }
  persist(db);
}
function note(msg) { const t = document.getElementById("toast"); if (!t) return; t.textContent = msg; t.hidden = false; setTimeout(() => (t.hidden = true), 3000); }

// ---------- Safety: "I need help" / "Take me home" (Guardian pillar) ----------
let undoTimer;
document.getElementById("mvSafety").addEventListener("click", (e) => {
  const b = e.target.closest(".mv-sos"); if (!b) return;
  const msg = b.dataset.kind === "home" ? "I want to go home" : "I need help";
  speak(msg);
  const a = raiseAlert(b.dataset.kind, msg);
  const t = document.getElementById("toast");
  t.innerHTML = ""; t.append(`Told your grown-ups: "${msg}". `);
  const u = Object.assign(document.createElement("button"), { type: "button", className: "mv-undo", textContent: "Oops, undo" });
  u.addEventListener("click", () => { const d = load(); d.alerts = d.alerts.filter((x) => x.id !== a.id); persist(d); t.hidden = true; });
  t.append(u); t.hidden = false;
  clearTimeout(undoTimer); undoTimer = setTimeout(() => (t.hidden = true), 6000);
});

// ---------- Stories, routines and sound practice (LunaScript) ----------
function renderStories() {
  const box = document.getElementById("mvStories"); box.textContent = "";
  const items = [...db.stories.map((st) => ({ e: st.steps[0]?.e || "📖", label: st.title, go: () => playStory(st.id) })),
    ...db.practice.targets.map((p) => ({ e: p.e, label: `Practice "${p.sound}"`, go: () => playPractice(p.id) }))];
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tile mv-ptile"; b.dataset.c = "action";
    b.innerHTML = `<span class="pic" aria-hidden="true">${it.e}</span><span class="label"></span>`;
    b.querySelector(".label").textContent = it.label;
    b.addEventListener("click", it.go);
    box.append(b);
  });
}
const P = (id) => document.getElementById(id);
function btn(label, fn, cls = "") { const b = Object.assign(document.createElement("button"), { type: "button", className: "mv-pbtn " + cls, textContent: label }); b.addEventListener("click", fn); return b; }
function playStory(id) {
  const st = load().stories.find((x) => x.id === id); if (!st) return;
  let i = 0;
  P("mvPlayerTitle").textContent = st.title; P("mvReward").textContent = "";
  const draw = () => {
    const step = st.steps[i];
    P("mvSteps").innerHTML = st.steps.map((s, k) => `<span class="${k < i ? "done" : k === i ? "now" : ""}">${s.e}</span>`).join("");
    P("mvStepPic").textContent = step.e; P("mvStepText").textContent = step.text;
    if (st.kind === "routine" && st.steps[i + 1]) P("mvStepText").textContent = `First ${step.text.toLowerCase()}, then ${st.steps[i + 1].text.toLowerCase()}.`;
    speak(P("mvStepText").textContent);
    const row = P("mvPlayerRow"); row.textContent = "";
    if (i > 0) row.append(btn("Back", () => { i--; draw(); }, "quiet"));
    row.append(btn("Say it again", () => speak(P("mvStepText").textContent), "quiet"));
    if (step.link === "potty" && window.__pottyStart?.()) row.append(btn("Toilet steps", () => { P("mvPlayer").close(); window.__pottyStart(true); }));
    row.append(i < st.steps.length - 1 ? btn("Next", () => { i++; draw(); }) : btn("All done", () => { P("mvReward").textContent = "All done. Well done."; speak("All done. Well done."); P("mvPlayer").close(); }));
  };
  draw(); P("mvPlayer").showModal();
}
const REWARDS = { stars: "⭐ ⭐ ⭐", bubbles: "🫧 🫧 🫧", quiet: "✓" };
function playPractice(id) {
  const d = load(), pr = d.practice.targets.find((x) => x.id === id); if (!pr) return;
  P("mvPlayerTitle").textContent = `Let's practice "${pr.sound}"`;
  P("mvSteps").textContent = ""; P("mvStepPic").textContent = pr.e;
  P("mvStepText").textContent = `${pr.sound}… ${pr.sound}… ${pr.word}`;
  P("mvReward").textContent = "";
  const model = () => speak(`${pr.sound}. ${pr.sound}. ${pr.word}.`, 0.7);
  const tried = (ok) => {
    const db2 = load(), t = db2.practice.targets.find((x) => x.id === id);
    t.tries.push({ t: Date.now(), ok }); t.tries = t.tries.slice(-300); persist(db2);
    // Reward is chosen by the caregiver (stars, bubbles or a quiet tick) so it never overstimulates.
    P("mvReward").textContent = ok ? `${REWARDS[db2.practice.reward] || "✓"} Great trying!` : "Good try. Let's listen again.";
    if (!ok) model();
  };
  const row = P("mvPlayerRow"); row.textContent = "";
  row.append(btn("Hear it", model, "quiet"), btn("I said it", () => tried(true)), btn("Try again later", () => tried(false), "quiet"));
  P("mvPlayer").showModal(); model();
}

async function playOrSay(p) {
  if (exploring()) return logExplore(p.label);
  if (p.momentId) {
    const blob = await getMedia(p.momentId).catch(() => null);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const el = document.createElement(blob.type.startsWith("video") ? "video" : "audio");
      el.src = url; el.play().catch(() => speak(p.label));
      el.onended = () => URL.revokeObjectURL(url);
      return;
    }
  }
  speak(p.label);
}

function logExplore(word) {
  db = load();
  db.exploration.push({ t: Date.now(), word });
  db.exploration = db.exploration.slice(-500);
  persist(db);
}

// Exploration mode also catches taps on the main board (capture phase, no speech).
talk.addEventListener("click", (e) => {
  const t = e.target.closest(".grid .tile, .next-row .tile");
  if (t && exploring()) { e.stopPropagation(); logExplore(t.dataset.w || t.textContent.trim()); }
}, true);

window.addEventListener("storage", (e) => { if (e.key === "luminaac:bridge") render(); });
render();
