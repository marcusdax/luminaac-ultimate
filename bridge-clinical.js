// Bridge, M3: communication report for caregivers and SLPs.
// Reads My Voice's logs on this device (luminaac:log, luminaac:modeling). Corrections
// go to db.clinical.revisions, which only ever grows: each entry names the one it supersedes.
import { report, revise, FUNCTIONS, toCSV } from "./clinical-core.js";
import { CORE } from "./vocab.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const esc = B.esc;
const DAY = 864e5;
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const core = new Set(CORE.map((x) => x.w.toLowerCase()).flatMap((w) => w.split(/\s+/)));
const date = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function current() {
  const d = B.db; d.clinical ||= { revisions: [] };
  const days = +$("#clinRange").value, to = Date.now();
  return report({ log: read("luminaac:log"), modeling: read("luminaac:modeling"), revisions: d.clinical.revisions, core, from: to - days * DAY, to });
}

function render() {
  const r = current(), d = B.db;
  const fig = (label, value, source) => `<div class="stat"><b>${value ?? "–"}</b><span>${esc(label)}</span><small class="soft">${esc(source)}</small></div>`;
  const src = r.sources.acts ? `${r.sources.acts} of the child's messages, ${date(r.sources.first)} to ${date(r.sources.last)}` : "No messages from My Voice in this period on this device.";
  $("#clinBody").innerHTML = `<p class="soft">${esc(src)}</p>
    <table class="clin-table"><caption class="sr-only">What the messages were for</caption>
      <thead><tr><th scope="col">What it was for</th><th scope="col">Messages</th><th scope="col">Share</th><th scope="col">Examples</th></tr></thead>
      <tbody>${Object.values(r.functions).map((f) => `<tr><th scope="row">${esc(f.label)}</th><td>${f.n}${f.corrected ? ` <span class="soft">(${f.corrected} corrected)</span>` : ""}</td><td>${f.pct == null ? "–" : f.pct + "%"}</td><td>${f.examples.map((x) => `“${esc(x)}”`).join(", ")}</td></tr>`).join("")}</tbody></table>
    <div class="stats">${fig("core words", r.core.pct == null ? null : r.core.pct + "%", r.core.source)}
      ${fig("words per built message (MLU)", r.mlu.value, r.mlu.source)}
      ${fig("said independently", r.independence.pct == null ? null : r.independence.pct + "%", r.independence.source)}</div>`;
  $("#clinCount").textContent = r.rows.length;
  const opts = (sel) => Object.entries(FUNCTIONS).map(([v, l]) => `<option value="${v}"${v === sel ? " selected" : ""}>${l}</option>`).join("");
  $("#clinRows").innerHTML = r.rows.length ? `<ul class="mini-list">${r.rows.slice(-60).reverse().map((x) => `<li><span><b>“${esc(x.text)}”</b> <span class="soft">${date(x.t)} · ${esc(x.kind)}${x.helped ? " · sentence helper" : ""} · ${esc(x.why)}</span></span>
      <label class="sr-only" for="fn-${esc(x.key)}">What “${esc(x.text)}” was for</label><select id="fn-${esc(x.key)}" data-key="${esc(x.key)}">${opts(x.fn)}</select></li>`).join("")}</ul>` : `<p class="soft">Nothing to check yet.</p>`;
  const revs = d.clinical.revisions;
  $("#clinRevCount").textContent = revs.length;
  $("#clinHist").innerHTML = revs.slice().reverse().map((v) => `<li><span>${new Date(v.t).toLocaleString()} · ${esc(v.by)} read “${esc(v.key.split(":").slice(1).join(":"))}” as <b>${esc(FUNCTIONS[v.fn])}</b>${v.supersedes ? ` <span class="soft">(replaces ${esc(v.supersedes)})</span>` : ""}${v.note ? ` · ${esc(v.note)}` : ""}</span></li>`).join("") || `<li class="soft">No corrections yet.</li>`;
}

$("#clinRows").addEventListener("change", (e) => {
  const sel = e.target.closest("select[data-key]"); if (!sel) return;
  const d = B.db; d.clinical ||= { revisions: [] };
  const by = d.profile.caregiver || (d.profile.role ? d.profile.role[0].toUpperCase() + d.profile.role.slice(1) : "Caregiver");
  d.clinical.revisions = revise(d.clinical.revisions, { key: sel.dataset.key, fn: sel.value, by });
  B.save("Corrected a message in the communication report"); render(); B.toast("Saved. The old reading stays in the history.");
});
$("#clinRange").addEventListener("change", render);
$("#clinCsv").addEventListener("click", () => {
  const r = current();
  const rows = r.rows.map((x) => ({ date: new Date(x.t).toISOString(), message: x.text, kind: x.kind, helped: x.helped ? "yes" : "", function: FUNCTIONS[x.fn], reason: x.why }));
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([toCSV(rows, ["date", "message", "kind", "helped", "function", "reason"])], { type: "text/csv" })), download: `luminaac-messages-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
});
$("#clinJson").addEventListener("click", () => {
  const r = current();
  B.download(`luminaac-report-${new Date().toISOString().slice(0, 10)}.json`, { note: "Draft. Caregiver or SLP review required.", made: new Date().toISOString(), periodDays: +$("#clinRange").value, ...r, revisions: B.db.clinical?.revisions || [] });
});
addEventListener("bridge:show", (e) => { if (e.detail === "insights") render(); });
addEventListener("bridge:reload", render);
addEventListener("storage", (e) => { if (e.key === "luminaac:log" || e.key === "luminaac:modeling") render(); });
render();
