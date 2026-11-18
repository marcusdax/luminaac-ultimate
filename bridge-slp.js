// Bridge, M2: choice boards and gestalt scripts for My Voice.
// Edits the same in-memory document as bridge.js; My Voice picks changes up at once.
import { uid } from "./shared.js";
import { parseOptions, validChoice, normalizeScript, scriptParts, NLA_STAGES } from "./slp-core.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const db = () => B.db;

function item(text, onRemove) {
  const li = document.createElement("li");
  li.append(Object.assign(document.createElement("span"), { textContent: text }));
  const b = Object.assign(document.createElement("button"), { type: "button", className: "btn quiet small", textContent: "Remove" });
  b.setAttribute("aria-label", `Remove ${text}`); b.addEventListener("click", onRemove); li.append(b);
  return li;
}

function render() {
  const d = db(); d.choices ||= []; d.scripts ||= [];
  const cl = $("#choiceList"); cl.textContent = "";
  d.choices.forEach((c) => cl.append(item(`${c.e || "🤔"} ${c.title} · ${c.options.map((o) => o.w).join(", ")}`, () => {
    d.choices = d.choices.filter((x) => x !== c); B.save(`Removed choice board "${c.title}"`); render();
  })));
  const sl = $("#scriptList"); sl.textContent = "";
  d.scripts.forEach((sc) => sl.append(item(`${sc.e} "${sc.text}" · stage ${sc.stage}${scriptParts(sc.text).length > 1 ? `, ${scriptParts(sc.text).length} parts` : ""}${sc.source ? ` · from ${sc.source}` : ""}`, () => {
    d.scripts = d.scripts.filter((x) => x !== sc); B.save("Removed a script"); render();
  })));
}

const stage = $("#scriptStage");
Object.entries(NLA_STAGES).forEach(([n, label]) => stage.add(new Option(label, n)));

$("#formChoice").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const c = { id: uid("ch"), title: f.get("title").trim(), e: f.get("e").trim() || "🤔", lead: f.get("lead").trim(), options: parseOptions(f.get("options")) };
  const err = validChoice(c);
  $("#choiceErr").textContent = err;
  if (err) return;
  (db().choices ||= []).push(c);
  e.target.reset(); B.save(`Added choice board "${c.title}"`); render(); B.toast("Saved. It's in Plans on My Voice.");
});
$("#formScript").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const sc = normalizeScript({ id: uid("sc"), text: f.get("text"), e: f.get("e"), stage: f.get("stage"), source: f.get("source") });
  if (!sc.text) return;
  (db().scripts ||= []).push(sc);
  e.target.reset(); B.save("Added a script"); render(); B.toast("Saved. It's in the Scripts tab on My Voice.");
});

addEventListener("bridge:show", (e) => { if (e.detail === "routines") render(); });
addEventListener("bridge:reload", render);
render();
