// Milestone 2 UI for My Voice (index.html): body map, choice boards, gestalt
// phrases, sensory quick bar, vocabulary search + morphology bar, and the
// caregiver tools for phrases / choice boards / schedules / Open Board Format.
// All text is inserted with textContent (imported boards are untrusted input).
// Everything stays on this device. All speech goes through speakUtterance().

import { load, persist, putMedia, raiseAlert } from "./shared.js";
import { speakUtterance } from "./speech.js";
import { CORE, FOLDERS } from "./vocab.js";
import {
  BODY_REGIONS, SENSATIONS, SENSORY_QUICK, painPhrase, reliefFor, recordPain,
  addGestalt, removeGestalt, mitigateGestalt, gestaltSpeechOpts, GESTALT_STAGES, GESTALT_MAX,
  saveChoiceBoard, removeChoiceBoard, choiceSentence, CHOICE_MIN, CHOICE_MAX,
  saveSchedule, removeSchedule, searchVocab, morphVariants,
} from "./slp.js";
import { buildObz, parseBoardFile } from "./obf.js";
import {
  VISEME_POSTURES, visemeForPhoneme, renderVisemeSvg, SOUND_BLOCKS, SYMPHONY_WORDS,
  composeSymphonyWord, playSymphonyNote, playSymphonySequence,
  SOUNDSCAPE_PRESETS, startSoundscape, stopSoundscape, activeSoundscapeId,
} from "./symphony.js";
import {
  DIET_TEXTURES, GI_STATES, classifyKpIndex, estimateSolarKp, fetchLiveSolarKp,
  logDietEntry, logSolarObservation, correlateBiometrics, BIOMETRICS_BANNER,
} from "./biometrics.js";
import {
  buildFirstResponderProfile, activateBlanketSearchParty, closeAndWipeBlanketSearchParty,
} from "./safety-blanket.js";

const $ = (s, el = document) => el.querySelector(s);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

function mutate(fn) { const db = load(); const r = fn(db); persist(db); return r; }
const isModeling = () => typeof document !== "undefined" && (document.body?.classList?.contains("is-modeling") || document.documentElement?.dataset?.modeling === "true");
function say(text, kind, fn, extra = {}) {
  const mode = isModeling() ? "modeling" : (extra.mode || "child");
  return speakUtterance(text, { ...extra, mode, kind: isModeling() ? "modeling" : kind, functionTag: fn });
}
const tile = (label, emoji, c, onTap, extra = {}) => {
  const b = h("button", { type: "button", class: "sx-tile" + (extra.class ? " " + extra.class : ""), "data-c": c || "little", "data-w": label, ...(extra.attrs || {}) },
    h("span", { class: "pic", "aria-hidden": "true", text: emoji || "" }), h("span", { class: "label", text: label }));
  if (extra.pressed != null) {
    b.setAttribute("aria-pressed", String(extra.pressed));
    b.classList.toggle("is-selected", Boolean(extra.pressed));
  }
  b.addEventListener("click", onTap);
  return b;
};

// ============================================================
// Sensory quick bar: rendered inside #view-talk (#mvSensoryBar) and #sxBar
// ============================================================
function renderSensoryBar() {
  for (const sel of ["#mvSensoryBar", "#sxBar"]) {
    const bar = $(sel);
    if (!bar) continue;
    bar.textContent = "";
    for (const q of SENSORY_QUICK) {
      const b = h("button", { type: "button", class: "sx-btn", "data-c": q.c, "data-w": q.w, "aria-label": `${q.w}. Says: ${q.say}` },
        h("span", { class: "pic", "aria-hidden": "true", text: q.e }), h("span", { class: "label", text: q.w }));
      b.addEventListener("click", () => say(q.say, "quick", q.fn));
      bar.append(b);
    }
  }
}

// ============================================================
// Inline Talk / Calm sections (#mvChoiceBoards, #mvGestalts, #mvBodyMap)
// ============================================================
const ui = {
  tab: "body",
  region: null,
  sensation: null,
  relief: null,
  board: null,
  chunks: new Set(),
  visemeId: "bilabial",
  symphonySeq: ["m", "oh", "r"],
  targetWord: "more",
};

function renderInlineTalkSections() {
  const db = load();

  // 1. Choice Boards on Talk view
  const cbRoot = $("#mvChoiceBoards");
  if (cbRoot) {
    cbRoot.textContent = "";
    const boards = db.choiceBoards || [];
    for (const board of boards) {
      const sec = h("section", { class: "mv-choice-sec", "aria-label": board.title || "Choice board" });
      sec.append(h("h2", { class: "h2", text: board.title || "Choices" }));
      const g = h("div", { class: "sx-grid sx-choices", role: "group", "aria-label": board.title || "Choices" });
      for (const o of (board.options || []).slice(0, CHOICE_MAX)) {
        const label = o.w || o.label || String(o);
        g.append(tile(label, o.e, o.c || "thing", () => say(choiceSentence({ w: label }), "choice", "request")));
      }
      sec.append(g);
      cbRoot.append(sec);
    }
  }

  // 2. GLP / NLA Gestalts & Scripts on Talk view
  const gRoot = $("#mvGestalts");
  if (gRoot) {
    gRoot.textContent = "";
    const list = db.gestalts || [];
    gRoot.append(h("h2", { class: "h2", text: "Gestalts & scripts" }));
    if (list.length) {
      const wrap = h("div", { class: "sx-phrases" });
      for (const g of list) {
        const card = h("div", { class: "sx-phrase-card" });
        const main = h("button", { type: "button", class: "sx-tile sx-phrase", "data-c": "social", "data-w": g.text, "aria-label": `Say: ${g.text}` },
          h("span", { class: "pic", "aria-hidden": "true", text: "💬" }), h("span", { class: "label", text: g.text }));
        main.addEventListener("click", () => say(g.text, "gestalt", "social", gestaltSpeechOpts(g)));
        card.append(main);
        if (Number(g.stage) >= 2) {
          const mitBtn = h("button", {
            type: "button",
            class: "ghost-btn",
            "aria-label": `Mitigate and edit into strip: ${g.text}`,
            text: "Mitigate into strip",
            onclick: () => {
              const parts = mitigateGestalt(g.text);
              window.dispatchEvent(new CustomEvent("luminaac:set-words", {
                detail: { words: parts.map((w) => ({ w, c: "social", e: "" })) },
              }));
            },
          });
          card.append(mitBtn);
        }
        wrap.append(card);
      }
      gRoot.append(wrap);
    }
  }
}

function renderInlineCalmBodyMap() {
  const root = $("#mvBodyMap");
  if (!root) return;
  root.textContent = "";
  renderBodyMapInto(root);
}

function renderBodyMapInto(p) {
  p.append(h("h2", { class: "h2", text: "Body & pain check-in" }));
  const regGroup = h("div", { class: "sx-grid", role: "group", "aria-label": "Places on the body" });
  for (const r of BODY_REGIONS) {
    regGroup.append(tile(r.label, r.e, "little", () => {
      ui.region = r.id;
      if (ui.sensation) triggerPainUtterance(ui.region, ui.sensation);
      renderInlineCalmBodyMap();
      renderMore();
    }, { pressed: ui.region === r.id, attrs: { "data-body-part": r.id } }));
  }
  p.append(regGroup);

  p.append(h("h3", { class: "h3", text: "How does it feel?" }));
  const sensGroup = h("div", { class: "sx-grid", role: "group", "aria-label": "Sensation descriptors" });
  for (const s of SENSATIONS) {
    sensGroup.append(tile(s.label, s.e, s.c, () => {
      ui.sensation = s.id;
      if (ui.region) triggerPainUtterance(ui.region, ui.sensation);
      renderInlineCalmBodyMap();
      renderMore();
    }, { pressed: ui.sensation === s.id, attrs: { "data-sensation": s.id } }));
  }
  p.append(sensGroup);

  if (ui.region && ui.sensation) {
    const phrase = painPhrase(ui.region, ui.sensation);
    p.append(h("div", { class: "sx-said", role: "status", "aria-live": "polite" }, h("strong", { text: phrase })));
    p.append(h("h3", { class: "h3", text: "What would help?" }));
    const relGroup = h("div", { class: "sx-grid", role: "group", "aria-label": "What would help" });
    for (const r of reliefFor(ui.region, ui.sensation)) {
      relGroup.append(tile(r, "", "action", () => {
        ui.relief = r;
        say(r, "body", "request");
        mutate((db) => { const last = db.painLog?.[db.painLog.length - 1]; if (last) last.relief = r; });
        renderInlineCalmBodyMap();
        renderMore();
      }, { pressed: ui.relief === r }));
    }
    p.append(relGroup);
  }

  p.append(h("h3", { class: "h3", text: "Acoustic co-regulation soundscapes" }));
  const scGroup = h("div", { class: "sx-grid", role: "group", "aria-label": "Acoustic co-regulation soundscapes" });
  const activeSc = activeSoundscapeId();
  for (const preset of SOUNDSCAPE_PRESETS) {
    scGroup.append(tile(preset.label, "🎧", "social", () => {
      if (activeSoundscapeId() === preset.id) stopSoundscape();
      else startSoundscape(preset.id);
      renderInlineCalmBodyMap();
      renderMore();
    }, { pressed: activeSc === preset.id, attrs: { "data-soundscape": preset.id } }));
  }
  if (activeSc) {
    scGroup.append(tile("Stop soundscape", "⏹️", "neg", () => {
      stopSoundscape();
      renderInlineCalmBodyMap();
      renderMore();
    }, { attrs: { "data-soundscape-stop": "true" } }));
  }
  p.append(scGroup);
}

function triggerPainUtterance(regionId, sensationId) {
  ui.relief = null;
  const phrase = painPhrase(regionId, sensationId);
  const row = mutate((db) => recordPain(db, regionId, sensationId));
  say(phrase, "body", "request");
  if (row.sensitive) {
    raiseAlert("custom", "Said something hurts or feels wrong in a private place. Please check in gently.");
  }
}

// ============================================================
// More view (child-facing)
// ============================================================
const TABS = [
  ["body", "My body", "🫶"],
  ["choices", "Choices", "🔀"],
  ["phrases", "My phrases", "💬"],
  ["symphony", "Sound symphony", "🎵"],
];

function renderTabs() {
  const bar = $("#sxTabs");
  if (!bar) return;
  bar.textContent = "";
  for (const [id, label, e] of TABS) {
    const b = h("button", { type: "button", class: "folder", role: "tab", "aria-selected": String(ui.tab === id), id: "sxTab-" + id, "aria-controls": "sxPanel" },
      h("span", { class: "pic", "aria-hidden": "true", text: e }), label);
    b.addEventListener("click", () => { ui.tab = id; renderMore(); });
    bar.append(b);
  }
}

function renderMore() {
  renderTabs();
  const p = $("#sxPanel");
  if (!p) return;
  p.textContent = "";
  p.setAttribute("role", "tabpanel");
  p.setAttribute("aria-labelledby", "sxTab-" + ui.tab);
  if (ui.tab === "body") renderBodyMapInto(p);
  else if (ui.tab === "choices") renderChoices(p);
  else if (ui.tab === "symphony") renderSymphony(p);
  else renderPhrases(p);
}

function renderSymphony(p) {
  p.append(h("h1", { class: "h1", text: "Sound Symphony & Lip Coach" }));
  const posture = VISEME_POSTURES[ui.visemeId] || VISEME_POSTURES.rest;
  const stage = h("div", { class: "symphony-stage", id: "symphonyStage" });
  const vBox = h("div", { class: "symphony-viseme-box", id: "symphonyVisemeBox" });
  vBox.innerHTML = renderVisemeSvg(posture.id, { active: true });
  const infoBox = h("div", {},
    h("p", { class: "symphony-cue", id: "symphonyPostureLabel", text: `${posture.emoji} ${posture.label}` }),
    h("p", { class: "note", id: "symphonyPostureCue", text: posture.cue }),
    h("p", { class: "note", text: "Tap sound blocks below to hear their musical note and see how your lips & tongue move, then blend them into a word!" })
  );
  stage.append(vBox, infoBox);
  p.append(stage);

  p.append(h("h3", { class: "h3", text: "1. Pick a target symphony word (or compose freely)" }));
  const wordGrid = h("div", { class: "sx-grid", role: "group", "aria-label": "Target symphony words" });
  for (const w of SYMPHONY_WORDS) {
    wordGrid.append(tile(`${w.word} (${w.blocks.join(" + ")})`, w.emoji, w.c, () => {
      ui.targetWord = w.word;
      ui.symphonySeq = [...w.blocks];
      ui.visemeId = visemeForPhoneme(w.blocks[0]).id;
      renderMore();
    }, { pressed: ui.targetWord === w.word, attrs: { "data-symphony-word": w.word } }));
  }
  p.append(wordGrid);

  p.append(h("h3", { class: "h3", text: "2. Tap sound instrument blocks (pentatonic AMMT scale)" }));
  const blockGrid = h("div", { class: "sx-grid", role: "group", "aria-label": "Phoneme instrument blocks" });
  for (const b of SOUND_BLOCKS) {
    blockGrid.append(tile(`${b.label} · ${b.note}`, "🎶", b.color || "action", () => {
      ui.visemeId = b.viseme;
      if (ui.symphonySeq.length >= 4) ui.symphonySeq = [];
      ui.symphonySeq.push(b.id);
      playSymphonyNote(b);
      renderMore();
    }, { attrs: { "data-sound-block": b.id } }));
  }
  p.append(blockGrid);

  const composed = composeSymphonyWord(ui.symphonySeq);
  const strip = h("div", { class: "symphony-strip", id: "symphonyStrip", role: "status", "aria-live": "polite" },
    h("strong", { text: ui.symphonySeq.length ? `Notes: ${ui.symphonySeq.join(" → ")} = "${composed.word}"` : "Tap sound blocks to start composing" })
  );
  const playBtn = h("button", {
    type: "button",
    class: "solid-btn",
    id: "symphonyPlayBtn",
    text: `🎵 Play Symphony & Speak "${composed.word || ui.targetWord}"`,
    onclick: async () => {
      const seq = ui.symphonySeq.length ? ui.symphonySeq : ["m", "oh", "r"];
      const res = composeSymphonyWord(seq);
      await playSymphonySequence(seq, {
        stepMs: 180,
        onViseme: (visemeId) => {
          ui.visemeId = visemeId;
          const box = $("#symphonyVisemeBox");
          if (box) box.innerHTML = renderVisemeSvg(visemeId, { active: true });
        }
      });
      say(res.word, "symphony", "social");
    }
  });
  const clearBtn = h("button", {
    type: "button",
    class: "ghost-btn",
    id: "symphonyClearBtn",
    text: "Clear notes",
    onclick: () => { ui.symphonySeq = []; ui.visemeId = "rest"; renderMore(); }
  });
  p.append(strip, h("div", { class: "sx-chunks" }, playBtn, clearBtn));
}

function focusPanel() { $("#sxPanel")?.focus({ preventScroll: true }); }

function renderChoices(p) {
  const boards = load().choiceBoards || [];
  if (!boards.length) {
    p.append(h("h1", { class: "h1", text: "Choices" }), h("p", { class: "note", text: "No choice boards yet. A caregiver can make one in the Caregiver area (press and hold Caregiver)." }));
    return;
  }
  if (!boards.some((b) => b.id === ui.board)) ui.board = null;
  if (!ui.board) {
    p.append(h("h1", { class: "h1", text: "Pick a board" }));
    const g = h("div", { class: "sx-grid", role: "group", "aria-label": "Choice boards" });
    for (const b of boards) g.append(tile(b.title, "🔀", "little", () => { ui.board = b.id; renderMore(); focusPanel(); }));
    p.append(g);
    return;
  }
  const board = boards.find((b) => b.id === ui.board);
  p.append(h("h1", { class: "h1", text: board.title }));
  const g = h("div", { class: "sx-grid sx-choices", role: "group", "aria-label": board.title });
  for (const o of board.options) {
    const label = o.w || o.label || String(o);
    g.append(tile(label, o.e, o.c, () => say(choiceSentence({ w: label }), "choice", "request")));
  }
  p.append(g, h("button", { type: "button", class: "ghost-btn", text: "Other boards", onclick: () => { ui.board = null; renderMore(); focusPanel(); } }));
}

function renderPhrases(p) {
  const list = load().gestalts || [];
  p.append(h("h1", { class: "h1", text: "My phrases" }));
  if (!list.length) { p.append(h("p", { class: "note", text: "No phrases yet. A caregiver can add the phrases this child loves in the Caregiver area." })); return; }
  const wrap = h("div", { class: "sx-phrases" });
  for (const g of list) {
    const card = h("div", { class: "sx-phrase-card" });
    const main = h("button", { type: "button", class: "sx-tile sx-phrase", "data-c": "social", "data-w": g.text, "aria-label": `Say: ${g.text}` },
      h("span", { class: "pic", "aria-hidden": "true", text: "💬" }), h("span", { class: "label", text: g.text }));
    main.addEventListener("click", () => say(g.text, "gestalt", "social", gestaltSpeechOpts(g)));
    card.append(main);
    if (g.stage >= 2) {
      card.append(h("button", {
        type: "button",
        class: "ghost-btn",
        "aria-label": `Mitigate and edit into strip: ${g.text}`,
        text: "Mitigate into strip",
        onclick: () => {
          const parts = mitigateGestalt(g.text);
          window.dispatchEvent(new CustomEvent("luminaac:set-words", {
            detail: { words: parts.map((w) => ({ w, c: "social", e: "" })) },
          }));
        },
      }));
    }
    wrap.append(card);
  }
  p.append(wrap);
}

// ============================================================
// Vocabulary search + morphology bar (Talk view)
// ============================================================
function customWords() { try { return JSON.parse(localStorage.getItem("luminaac:custom")) || []; } catch { return []; } }
function renderSearch() {
  const input = $("#vsearch"), box = $("#vsearchRes");
  if (!input || !box) return;
  box.textContent = "";
  const q = input.value.trim();
  if (!q) return;
  const hits = searchVocab(q, { core: CORE, folders: FOLDERS, custom: customWords() }, 8);
  if (!hits.length) { box.append(h("span", { class: "note", role: "status", text: "No match. Try another word." })); return; }
  for (const it of hits) {
    box.append(tile(it.w, it.e, it.c, () => {
      window.dispatchEvent(new CustomEvent("luminaac:add-word", { detail: { w: it.w, c: it.c, e: it.e } }));
      input.value = ""; renderSearch();
    }, { class: "sx-chip" }));
  }
}
function renderMorph(words) {
  const bar = $("#morphBar");
  if (!bar) return;
  bar.textContent = "";
  const last = words?.[words.length - 1];
  const forms = last ? morphVariants(last).slice(0, 5) : [];
  bar.hidden = !forms.length;
  if (!forms.length) return;
  bar.append(h("span", { class: "next-label", text: "Change to" }));
  for (const f of forms) bar.append(tile(f, "", "little", () => window.dispatchEvent(new CustomEvent("luminaac:replace-last-word", { detail: { w: f } })), { class: "sx-chip" }));
}

// ============================================================
// Caregiver tools
// ============================================================
let pendingClip = null;
const care = { msg: null };
function note(text, bad = false) { if (care.msg) { care.msg.textContent = text; care.msg.className = "sx-msg" + (bad ? " bad" : ""); } }

function lineList(value) { return String(value || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean); }
function listItem(text, onRemove, label) {
  return h("li", {}, h("span", { text }), h("button", { type: "button", "aria-label": `Remove ${label || text}`, text: "Remove", onclick: onRemove }));
}

function buildCare() {
  const root = $("#supportCare");
  if (!root) return;
  root.textContent = "";
  care.msg = h("p", { class: "sx-msg", role: "status", "aria-live": "polite" });
  root.append(h("h2", { class: "h2", text: "Phrases, choices and boards" }), care.msg);

  const stageSel = h("select", { name: "stage" }, ...Object.entries(GESTALT_STAGES).map(([v, l]) => h("option", { value: v, text: l })));
  const recBtn = h("button", { type: "button", class: "ghost-btn", text: "Record your voice (5 seconds)" });
  recBtn.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { note("Recording is not available on this device.", true); return; }
    try {
      recBtn.disabled = true; recBtn.textContent = "Recording…";
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); const parts = [];
      mr.ondataavailable = (e) => e.data.size && parts.push(e.data);
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); pendingClip = { blob: new Blob(parts, { type: mr.mimeType || "audio/webm" }) }; recBtn.disabled = false; recBtn.textContent = "Recorded. Record again?"; };
      mr.start(); setTimeout(() => mr.state !== "inactive" && mr.stop(), 5000);
    } catch { recBtn.disabled = false; recBtn.textContent = "Record your voice (5 seconds)"; note("Could not use the microphone.", true); }
  });
  const gForm = h("form", { class: "moment-form", id: "sxGestaltForm" },
    h("label", {}, "Phrase the child says or loves", h("input", { name: "text", required: true, maxlength: String(GESTALT_MAX), placeholder: "To infinity and beyond" })),
    h("label", {}, "Language stage (your or the SLP's label)", stageSel),
    recBtn,
    h("p", { class: "note", text: "A recording stays on this device and is played instead of the computer voice." }),
    h("button", { class: "solid-btn", type: "submit", text: "Add phrase" }));
  gForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(gForm);
    try {
      const g = { text: f.get("text"), stage: f.get("stage") };
      if (pendingClip) { g.audioClipId = "gestalt-" + Date.now().toString(36); await putMedia(g.audioClipId, pendingClip.blob); }
      mutate((db) => addGestalt(db, g));
      pendingClip = null; recBtn.textContent = "Record your voice (5 seconds)"; gForm.reset();
      note("Phrase added."); renderCareLists(); renderInlineTalkSections(); renderMore();
    } catch (err) { note(err.message, true); }
  });
  root.append(h("h3", { class: "h3", text: "Gestalt phrases" }), gForm, h("ul", { class: "custom-list", id: "sxGestaltList" }));

  const cForm = h("form", { class: "moment-form", id: "sxChoiceForm" },
    h("label", {}, "Board name", h("input", { name: "title", required: true, maxlength: "60", placeholder: "Snack time" })),
    h("label", {}, `Choices, one per line (${CHOICE_MIN} to ${CHOICE_MAX})`, h("textarea", { name: "options", required: true, rows: "4", placeholder: "apple\nbanana\ncrackers" })),
    h("button", { class: "solid-btn", type: "submit", text: "Save choice board" }));
  cForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(cForm);
    try { mutate((db) => saveChoiceBoard(db, { title: f.get("title"), options: lineList(f.get("options")) })); cForm.reset(); note("Choice board saved."); renderCareLists(); renderInlineTalkSections(); renderMore(); }
    catch (err) { note(err.message, true); }
  });
  root.append(h("h3", { class: "h3", text: "Choice boards" }), cForm, h("ul", { class: "custom-list", id: "sxChoiceList" }));

  const sForm = h("form", { class: "moment-form", id: "sxScheduleForm" },
    h("label", {}, "Schedule name", h("input", { name: "title", required: true, maxlength: "60", placeholder: "Bath time" })),
    h("label", {}, "Steps in order, one per line (First, Then, …)", h("textarea", { name: "steps", required: true, rows: "4", placeholder: "Take off clothes\nBath\nPajamas" })),
    h("button", { class: "solid-btn", type: "submit", text: "Save schedule" }));
  sForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(sForm);
    try { mutate((db) => saveSchedule(db, { title: f.get("title"), steps: lineList(f.get("steps")).map((t) => ({ t })) })); sForm.reset(); note("Schedule saved. Find it under Plans."); renderCareLists(); }
    catch (err) { note(err.message, true); }
  });
  root.append(h("h3", { class: "h3", text: "First-Then schedules" }), sForm, h("ul", { class: "custom-list", id: "sxScheduleList" }));

  const file = h("input", { type: "file", id: "sxObfFile", accept: ".obf,.obz,.json,application/zip,application/json" });
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      if (f.size > 8 * 1024 * 1024) throw new Error("This file is too large.");
      const out = await parseBoardFile(new Uint8Array(await f.arrayBuffer()));
      mutate((db) => {
        const keep = (db.importedBoards || []).filter((b) => !out.boards.some((n) => n.id === b.id));
        db.importedBoards = [...keep, ...out.boards.map(({ id, name, cols, words }) => ({ id, name, cols, words: words.map(({ mediaSkipped, ...w }) => w) }))].slice(-20);
      });
      note(`Imported ${out.boards.length} board${out.boards.length === 1 ? "" : "s"}.${out.warnings.length ? " " + out.warnings.slice(0, 3).join(" ") : ""}`);
      renderCareLists();
      window.dispatchEvent(new CustomEvent("luminaac:bridge-updated"));
    } catch (err) { note(err.message || "That file could not be read.", true); }
    file.value = "";
  });
  const exportBtn = h("button", { type: "button", class: "ghost-btn", id: "sxObzExport", text: "Download my boards (.obz)" });
  exportBtn.addEventListener("click", () => {
    const custom = customWords();
    const home = { w: "Home", c: "little", e: "🏠", action: ":home" };
    const boards = [
      { id: "luminaac-core", name: "LuminAAC core words", cols: 6, words: [...CORE.map(({ w, c, e }) => ({ w, c, e })), ...FOLDERS.map((f) => ({ w: f.label, c: "thing", e: f.e, loadBoard: f.id }))] },
      ...FOLDERS.map((f) => ({ id: f.id, name: f.label, cols: 6, words: [home, ...f.words.concat(custom.filter((x) => x.f === f.id)).map(({ w, c, e }) => ({ w, c, e }))] })),
    ];
    const blob = new Blob([buildObz(boards)], { type: "application/zip" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `luminaac-boards-${new Date().toISOString().slice(0, 10)}.obz` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  root.append(h("h3", { class: "h3", text: "Boards from other apps (Open Board Format)" }),
    h("p", { class: "note", text: "Import .obf or .obz boards, or download yours for another AAC app. Pictures are not downloaded from the internet; the local picture set is used." }),
    h("label", { class: "sx-file" }, "Import a board file", file), exportBtn, h("ul", { class: "custom-list", id: "sxBoardList" }));

  // Holistic Diet/Gut-Brain & Solar/Geomagnetic Storm (Kp) Biometrics
  const texSel = h("select", { name: "texture" }, ...DIET_TEXTURES.map((t) => h("option", { value: t.id, text: `${t.emoji} ${t.label}` })));
  const giSel = h("select", { name: "giStatus" }, ...GI_STATES.map((g) => h("option", { value: g.id, text: `${g.emoji} ${g.label}` })));
  const dietForm = h("form", { class: "moment-form", id: "sxDietForm" },
    h("label", {}, "Meal or snack", h("input", { name: "meal", required: true, maxlength: "120", placeholder: "Gluten-free oatmeal & blueberries" })),
    h("label", {}, "Sensory food texture", texSel),
    h("label", {}, "Hydration (mL)", h("input", { name: "hydrationMl", type: "number", min: "0", max: "4000", value: "250" })),
    h("label", {}, "Gut-brain / GI comfort", giSel),
    h("button", { class: "solid-btn", type: "submit", text: "Log diet & gut-brain entry" })
  );
  dietForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(dietForm);
    mutate((db) => logDietEntry(db, {
      meal: f.get("meal"),
      texture: f.get("texture"),
      hydrationMl: Number(f.get("hydrationMl") || 0),
      giStatus: f.get("giStatus"),
    }));
    dietForm.reset();
    note("Diet & gut-brain entry logged.");
    renderCareLists();
  });

  const solarEst = estimateSolarKp();
  const solarForm = h("form", { class: "moment-form", id: "sxSolarForm" },
    h("label", {}, "Planetary Geomagnetic Kp Index (0–9)", h("input", { name: "kp", type: "number", step: "0.1", min: "0", max: "9", value: String(solarEst.kp) })),
    h("label", {}, "Observed sensory state", h("input", { name: "sensoryState", maxlength: "80", value: "regulated", placeholder: "regulated / overwhelmed / sensory seeking" })),
    h("button", { class: "solid-btn", type: "submit", text: "Log solar / geomagnetic check-in" }),
    h("button", {
      class: "ghost-btn",
      type: "button",
      id: "sxFetchNoaaBtn",
      text: "Check live NOAA solar Kp",
      onclick: async () => {
        const live = await fetchLiveSolarKp();
        const kpIn = solarForm.querySelector('input[name="kp"]');
        if (kpIn) kpIn.value = String(live.kp);
        note(`${live.badge} ${live.label} (Kp ${live.kp}, source: ${live.source})`);
      }
    })
  );
  solarForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(solarForm);
    mutate((db) => logSolarObservation(db, {
      kp: Number(f.get("kp") || 0),
      sensoryState: f.get("sensoryState") || "regulated",
    }));
    note("Solar geomagnetic observation logged.");
    renderCareLists();
  });

  root.append(
    h("h3", { class: "h3", text: "Holistic Diet, Gut-Brain & Solar Geomagnetic (Kp) Biometrics" }),
    h("div", { class: "biometrics-card", id: "sxBiometricsSummary" }),
    dietForm,
    solarForm,
    h("h3", { class: "h3", text: "Vanguard Blanket Search Party & First-Responder Profile" }),
    h("div", { class: "biometrics-card", id: "sxSearchPartyCard" })
  );

  renderCareLists();
}

function renderCareLists() {
  const db = load();
  const fill = (id, rows) => { const ul = $(id); if (ul) { ul.textContent = ""; ul.append(...rows); } };
  fill("#sxGestaltList", (db.gestalts || []).map((g) => listItem(`${g.text} (stage ${g.stage}${g.audioClipId ? ", your voice" : ""})`, () => { mutate((d) => removeGestalt(d, g.id)); renderCareLists(); renderInlineTalkSections(); renderMore(); }, g.text)));
  fill("#sxChoiceList", (db.choiceBoards || []).map((b) => listItem(`${b.title}: ${b.options.map((o) => o.w || o.label).join(", ")}`, () => { mutate((d) => removeChoiceBoard(d, b.id)); renderCareLists(); renderInlineTalkSections(); renderMore(); }, b.title)));
  fill("#sxScheduleList", (db.schedules || []).map((s) => listItem(`${s.title}: ${s.steps.map((x) => x.t).join(" → ")}`, () => { mutate((d) => removeSchedule(d, s.id)); renderCareLists(); }, s.title)));
  fill("#sxBoardList", (db.importedBoards || []).map((b) => listItem(`${b.name} (${b.words.length} buttons)`, () => { mutate((d) => { d.importedBoards = (d.importedBoards || []).filter((x) => x.id !== b.id); }); renderCareLists(); window.dispatchEvent(new CustomEvent("luminaac:bridge-updated")); }, b.name)));

  const bioBox = $("#sxBiometricsSummary");
  if (bioBox) {
    bioBox.textContent = "";
    const report = correlateBiometrics(db);
    const est = estimateSolarKp();
    bioBox.append(
      h("span", { class: "biometrics-banner", text: BIOMETRICS_BANNER }),
      h("p", { class: "note", text: `${est.badge} Current solar estimate: ${est.label} — ${est.guidance}` }),
      ...report.correlations.insights.map((line) => h("p", { class: "note", text: `• ${line}` }))
    );
  }

  const spBox = $("#sxSearchPartyCard");
  if (spBox) {
    spBox.textContent = "";
    const prof = buildFirstResponderProfile(db);
    const sp = db.activeSearchParty;
    spBox.append(
      h("p", { class: "note", text: `First-Responder De-Escalation Profile: ${prof.deescalationInstructions}` }),
      h("p", { class: "note", text: sp?.status === "active" ? `ACTIVE SEARCH (${sp.searchId}) · Clothing: ${sp.clothing}` : (sp?.status === "closed" ? `Last search closed (${sp.outcome}) — PII & photo cryptographically wiped.` : "Status: Ready (Caregiver-confirmed geofence exit response).") }),
      h("div", { class: "sx-chunks" },
        h("button", {
          type: "button",
          class: "solid-btn",
          id: "sxActivateBlanketBtn",
          text: "Activate Blanket Search Party",
          onclick: () => {
            mutate((d) => activateBlanketSearchParty(d, { caregiverConfirmed: true, clothing: "Current outfit", optInPhoto: false }));
            note("Blanket Search Party activated (water-hazard priority, visual-only protocol).");
            renderCareLists();
          }
        }),
        h("button", {
          type: "button",
          class: "ghost-btn",
          id: "sxCloseBlanketBtn",
          text: "Found Safe — Wipe & Close",
          onclick: () => {
            if (!load().activeSearchParty) return;
            mutate((d) => closeAndWipeBlanketSearchParty(d, "found_safe"));
            note("Blanket Search Party closed — PII & photo cryptographically wiped.");
            renderCareLists();
          }
        })
      )
    );
  }
}

function init() {
  renderSensoryBar();
  renderInlineTalkSections();
  renderInlineCalmBodyMap();
  renderMore();
  buildCare();
  $("#vsearch")?.addEventListener("input", renderSearch);
  window.addEventListener("luminaac:strip-changed", (e) => renderMorph(e.detail?.words));
  const refreshAll = () => {
    renderInlineTalkSections();
    renderInlineCalmBodyMap();
    renderMore();
    renderCareLists();
  };
  window.addEventListener("luminaac:bridge-updated", refreshAll);
  window.addEventListener("storage", (e) => { if (e.key === "luminaac:bridge") refreshAll(); });
}
if (!globalThis.__LUMINAAC_NO_AUTO_INIT__ && typeof document !== "undefined" && ($("#sxBar") || $("#mvSensoryBar"))) init();
export { init as initSupport, renderMore, renderCareLists, renderInlineTalkSections, renderInlineCalmBodyMap };
