// Redesign R2 (docs/REDESIGN.md): a Log button that gathers every quick record in
// one sheet, role views (parent, teacher, therapist, aide, family) that decide
// which hubs show first, and a handoff card for drop-off and pick-up.
// A view never changes permissions; access.js and the server still decide.
import { redesignOn, ROLE_VIEWS, LOG_KINDS, logChoices, hubsFor, handoff, viewFor } from "./nav-core.js";
import { currentMood, uid } from "./shared.js";
import * as PS from "./potty-store.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const db = () => B.db;
const VKEY = "luminaac:view", CKEY = "luminaac:log-counts";
const getView = () => { try { return localStorage.getItem(VKEY) || db().profile.role || "parent"; } catch { return "parent"; } };
const counts = () => { try { return JSON.parse(localStorage.getItem(CKEY)) || {}; } catch { return {}; } };
const bump = (k) => { const c = counts(); c[k] = (c[k] || 0) + 1; try { localStorage.setItem(CKEY, JSON.stringify(c)); } catch {} };
const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

if (B && redesignOn()) init();

function init() {
  // ---- Role view chooser (top of the hub bar) and hub filtering ----
  const bar = $(".rd-hubs");
  const pick = document.createElement("div");
  pick.className = "rd-view";
  pick.innerHTML = `<label for="viewRole">View</label><select id="viewRole">${Object.entries(ROLE_VIEWS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}<option value="all">Everything</option></select>`;
  // Desktop: top of the side rail. Phone: under the page title, so the bottom bar keeps room for the hubs.
  const mq = matchMedia("(max-width: 760px)");
  const place = () => (mq.matches ? $("#h-today")?.after(pick) : bar?.prepend(pick));
  place(); mq.addEventListener("change", place);
  const applyView = () => {
    const v = getView(), hubs = hubsFor(v, v === "all");
    $("#viewRole").value = v;
    document.querySelectorAll(".rd-hub").forEach((b) => (b.hidden = !hubs.includes(b.dataset.hub)));
    const order = v === "all" ? hubs : viewFor(v).hubs; // reorder: the role's first hub leads
    order.forEach((h, i) => { const b = $(`.rd-hub[data-hub="${h}"]`); if (b) b.style.order = i + 1; });
    renderLogSheet(); renderHandoff();
  };
  $("#viewRole").addEventListener("change", (e) => { try { localStorage.setItem(VKEY, e.target.value); } catch {} applyView(); B.toast(`Showing the ${e.target.selectedOptions[0].text.toLowerCase()} view. What each person may see is unchanged.`); });

  // ---- Log button and sheet ----
  const fab = document.createElement("button");
  fab.type = "button"; fab.className = "rd-log"; fab.id = "btnLog";
  fab.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg><span>Log</span>`;
  document.body.append(fab);
  const sheet = document.createElement("dialog");
  sheet.className = "sheet rd-logsheet"; sheet.id = "logSheet"; sheet.setAttribute("aria-labelledby", "h-log");
  sheet.innerHTML = `<h2 id="h-log">Log something</h2><div id="logBody"></div><p class="soft" id="logStatus" role="status"></p>
    <div class="row gap"><button class="btn quiet" type="button" id="btnLogClose">Close</button></div>`;
  document.body.append(sheet);
  fab.addEventListener("click", () => { renderLogSheet(); $("#logStatus").textContent = ""; sheet.showModal(); });
  $("#btnLogClose").addEventListener("click", () => sheet.close());
  const pottyOn = () => !!db().access?.potty;
  function renderLogSheet() {
    const ch = logChoices(getView() === "all" ? "parent" : getView(), counts(), (k) => k !== "potty" || pottyOn());
    $("#logBody").innerHTML = `<div class="rd-logchoices">${ch.map((k) => `<button type="button" class="btn quiet" data-log="${k}">${LOG_KINDS[k]}</button>`).join("")}</div><form class="form" id="logForm" hidden></form>`;
  }
  const FORMS = {
    note: `<label>Note <textarea name="text" rows="3" maxlength="500" required></textarea></label>`,
    meal: `<label>What they ate or drank <input name="text" maxlength="120" required placeholder="Toast and milk" /></label><label>How much <select name="amount"><option>All</option><option>Most</option><option>Some</option><option>None</option></select></label>`,
    word: `<label>Word or sound you heard <input name="text" maxlength="60" required placeholder="ba" /></label><label class="check"><input type="checkbox" name="unprompted" checked /> Said without a prompt</label>`,
    behaviour: `<label>What happened <input name="text" maxlength="160" required /></label><label>Just before <input name="before" maxlength="160" /></label><label>What helped <input name="after" maxlength="160" /></label>`,
    potty: `<fieldset><legend>Toilet</legend><label class="check"><input type="radio" name="what" value="toilet" checked /> Used the toilet</label><label class="check"><input type="radio" name="what" value="wet" /> Accident</label><label class="check"><input type="radio" name="what" value="dry" /> Dry check, dry</label></fieldset>`,
  };
  $("#logBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-log]"); if (!b) return;
    const k = b.dataset.log;
    if (k === "moment") { sheet.close(); B.show("today"); bump(k); setTimeout(() => ($("#btnCapture")?.disabled ? $("#btnListen") : $("#btnCapture"))?.focus(), 50); return; }
    if (k === "sound") { sheet.close(); B.show("sound"); bump(k); return; }
    const f = $("#logForm"); f.hidden = false; f.dataset.kind = k;
    f.innerHTML = `<h3 class="h3">${LOG_KINDS[k]}</h3>${FORMS[k]}<button class="btn" type="submit">Save</button>`;
    f.querySelector("input,textarea")?.focus();
  });
  $("#logBody").addEventListener("submit", (e) => {
    e.preventDefault(); const f = e.target, k = f.dataset.kind, d = Object.fromEntries(new FormData(f));
    const by = db().profile.role || "parent", t = Date.now();
    if (k === "potty") {
      if (d.what === "toilet") PS.record("void", { where: "toilet" }); else if (d.what === "wet") PS.record("wet", {}); else PS.record("dry_check", { dry: true });
    } else {
      const text = k === "meal" ? `${d.text} (${String(d.amount).toLowerCase()})` : k === "word" ? `Heard "${d.text}"${d.unprompted ? ", without a prompt" : ""}` : k === "behaviour" ? [d.text, d.before && `Before: ${d.before}`, d.after && `Helped: ${d.after}`].filter(Boolean).join(". ") : d.text;
      db().notes.unshift({ id: uid("n"), t, by, kind: k, text: String(text).slice(0, 500) });
      B.save(`Logged: ${LOG_KINDS[k].toLowerCase()}`);
    }
    bump(k); $("#logStatus").textContent = `Saved: ${LOG_KINDS[k]}.`; f.hidden = true; renderHandoff();
    window.dispatchEvent(new CustomEvent("bridge:logged", { detail: k }));
  });

  // ---- Handoff card (Home) ----
  const card = document.createElement("section");
  card.className = "card rd-handoff"; card.id = "handoffCard"; card.setAttribute("aria-labelledby", "h-handoff");
  card.innerHTML = `<div class="card-head"><h2 id="h-handoff">Handoff</h2><button class="btn quiet" type="button" id="btnHandoffCopy">Copy for the next person</button></div><dl class="rd-hand" id="handoffList"></dl>`;
  $("#tab-today .capture-card")?.before(card);
  let lastText = "";
  function renderHandoff() {
    let potty = []; try { potty = PS.read().events || []; } catch {}
    const h = handoff({ notes: db().notes || [], potty, mood: currentMood(db()), alerts: db().alerts || [], moments: db().moments || [] });
    const rows = [
      ["Last ate", h.ate ? `${h.ate.text}, ${ago(h.ate.t)}` : "Nothing logged in the last 12 hours"],
      ...(pottyOn() || h.toilet ? [["Last toilet", h.toilet ? `${h.toilet.text}, ${ago(h.toilet.t)}` : "Nothing logged in the last 12 hours"]] : []),
      ["Mood now", h.mood ? h.mood[0].toUpperCase() + h.mood.slice(1) : "Not known"],
      ["Said today", h.said.length ? h.said.join(", ") : "Nothing explained yet"],
      ["Watch for", h.watch.length ? h.watch.join("; ") : "Nothing flagged"],
    ];
    $("#handoffList").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${B.esc(v)}</dd></div>`).join("");
    lastText = `Handoff for ${db().profile.child || "today"}\n` + rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  }
  $("#btnHandoffCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(lastText); B.toast("Copied. Paste it into a message or the notebook."); } catch { B.toast("Couldn't copy here. Select the text instead."); } });
  window.addEventListener("bridge:show", (e) => e.detail === "today" && renderHandoff());
  applyView();
}
