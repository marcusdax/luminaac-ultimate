// Bridge: validation labelling (Insights). Each caregiver labels moments on their own;
// others' labels and the written meaning stay hidden while they do. See docs/VALIDATION-STUDY.md.
import * as L from "./labels-core.js";
import { INTENTS } from "./shared.js";
const B = window.__bridge, $ = (s, el = document) => el.querySelector(s), db = () => B.db;
const ME = "luminaac:rater";
const card = document.createElement("section");
card.className = "card"; card.id = "labCard"; card.setAttribute("aria-labelledby", "h-lab");
card.innerHTML = `<h2 id="h-lab">Check how well we agree</h2>
  <p class="soft">For a validation study, or just for your team. Two or more people who know your child each say what a moment meant, on their own. LuminAAC shows how often you agree. Others' answers stay hidden until you're done.</p>
  <form id="labWho" class="row gap" style="flex-wrap:wrap;align-items:end"><label>Your name for this (stays in the family) <input id="labMe" maxlength="40" autocomplete="name" placeholder="Mom" required /></label><button class="btn quiet" type="submit">Start labelling</button></form>
  <div id="labBox" aria-live="polite"></div>
  <div id="labStats"></div>
  <p class="row gap" style="flex-wrap:wrap"><button class="btn quiet" type="button" id="labCsv">Download anonymous results (CSV)</button><button class="btn quiet" type="button" id="labJson">Download agreement summary (JSON)</button></p>
  <p class="soft small">The download has no names, notes, recordings, places or times. Moment ids are scrambled differently each time, and raters are letters.</p>`;
const anchor = $("#tab-insights .split") || $("#tab-insights");
anchor.append(card);

const labels = () => (db().labels ||= {});
const me = () => localStorage.getItem(ME) || "";
const moments = () => (db().moments || []).map((m) => ({ id: m.id, cues: m.aac || [], suggested: m.suggested || "", kind: m.kind, context: m.context, dur: m.dur }));
function render() {
  $("#labMe").value = me();
  const box = $("#labBox"), stats = $("#labStats");
  const all = moments();
  if (!me()) { box.innerHTML = `<p class="soft">Type your name above, then start.</p>`; }
  else {
    const left = L.todo(labels(), all, me());
    if (!left.length) box.innerHTML = `<p>You've labelled all ${all.length} moments. Thank you.</p>`;
    else {
      const m = left[0];
      box.innerHTML = `<div class="lab-item"><p class="soft small">${all.length - left.length + 1} of ${all.length}</p>
        <p><b>${B.esc(m.kind === "video" ? "Video" : m.kind === "audio" ? "Sound" : "Moment")}</b>${m.dur ? `, ${m.dur} seconds` : ""}${m.context ? `: ${B.esc(m.context)}` : ""}</p>
        ${m.cues.length ? `<p class="soft">Words tapped: ${m.cues.map(B.esc).join(", ")}</p>` : ""}
        <fieldset class="lab-choices"><legend>What do you think it meant?</legend></fieldset></div>`;
      const fs = box.querySelector("fieldset");
      for (const [k, v] of [...Object.entries(INTENTS), [L.UNSURE, "Not sure"]]) {
        const b = Object.assign(document.createElement("button"), { type: "button", className: `btn${k === L.UNSURE ? " quiet" : ""}`, textContent: v });
        b.addEventListener("click", () => { (labels()[m.id] ||= {})[me()] = k; B.save("Labelled a moment"); render(); box.querySelector("button")?.focus(); });
        fs.append(b);
      }
    }
  }
  const rs = L.raters(labels());
  if (rs.length < 2) { stats.innerHTML = `<p class="soft">Agreement shows once two people have labelled.</p>`; return; }
  const done = rs.every((r) => !L.todo(labels(), all, r).length) || !L.todo(labels(), all, me()).length;
  if (!done) { stats.innerHTML = `<p class="soft">Finish your own labels to see agreement.</p>`; return; }
  const rows = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = L.agreement(labels(), rs[i], rs[j]);
    rows.push(`<tr><td>${B.esc(rs[i])} and ${B.esc(rs[j])}</td><td>${a.n}</td><td>${a.agree == null ? "" : Math.round(a.agree * 100) + "%"}</td><td>${a.kappa ?? ""} (${L.kappaWords(a.kappa)})</td></tr>`);
  }
  stats.innerHTML = `<table class="lab-table"><caption class="soft">"Not sure" answers are left out.</caption><thead><tr><th scope="col">People</th><th scope="col">Moments</th><th scope="col">Agree</th><th scope="col">Kappa</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}
$("#labWho").addEventListener("submit", (e) => { e.preventDefault(); localStorage.setItem(ME, $("#labMe").value.trim().slice(0, 40)); render(); $("#labBox button")?.focus(); });
const dl = (name, text, type) => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
const salt = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, "0")).join("");
$("#labCsv").addEventListener("click", async () => { const ex = await L.exportAnon(labels(), moments(), salt()); dl(`luminaac-agreement-${B.dayKey(Date.now())}.csv`, ex.csv, "text/csv"); });
$("#labJson").addEventListener("click", async () => { const ex = await L.exportAnon(labels(), moments(), salt()); dl(`luminaac-agreement-${B.dayKey(Date.now())}.json`, JSON.stringify({ tool: "LuminAAC", version: "0.14", raters: ex.raters, categories: [...Object.keys(INTENTS), L.UNSURE], pairs: ex.stats, items: ex.rows }, null, 2), "application/json"); });
render();
window.addEventListener("bridge:show", (e) => { if (e.detail === "insights") render(); });
window.addEventListener("bridge:reload", render);
