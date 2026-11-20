// Redesign R1 (docs/REDESIGN.md): the four Bridge hubs, old-link aliases, the
// dev switch, and the Now/Next ribbon for My Voice. Pure, so tests run in node.

export const FLAG = "luminaac:redesign-dev";

// Each hub lists the old Bridge tabs it holds, in the order they show.
export const HUBS = [
  { id: "home", label: "Home", tabs: ["today"] },
  { id: "programs", label: "Programs", tabs: ["vocab", "routines", "sound", "potty", "play"] },
  { id: "progress", label: "Progress", tabs: ["signals", "insights"] },
  { id: "circle", label: "Circle", tabs: ["team", "account", "privacy"] },
  // Safety gets its own button: parents of a child who wanders need it in one tap.
  { id: "safety", label: "Safety", tabs: ["safety"] },
];

export const hubOf = (tab) => HUBS.find((h) => h.tabs.includes(tab)) || HUBS[0];

// "#programs" opens that hub's first tab; an old "#potty" stays as it is.
export function resolveHash(hash) {
  const id = String(hash || "").replace(/^#/, "");
  const hub = HUBS.find((h) => h.id === id);
  if (hub) return hub.tabs[0];
  return HUBS.some((h) => h.tabs.includes(id)) ? id : null;
}

// Which tab a hub opens: the last one used there if it's still shown, else its first shown tab.
export function tabForHub(hubId, last = {}, isShown = () => true) {
  const hub = HUBS.find((h) => h.id === hubId);
  if (!hub) return null;
  const shown = hub.tabs.filter(isShown);
  if (last[hubId] && shown.includes(last[hubId])) return last[hubId];
  return shown[0] || hub.tabs[0];
}

// The hub layout is the default since v0.13. "?redesign=0" switches a device
// back to the classic tabs, "?redesign=1" returns it to the hubs.
export function readFlag(search, stored) {
  const m = /[?&]redesign=([01])\b/.exec(search || "");
  return m ? m[1] === "1" : stored !== "0";
}
export function redesignOn() {
  let stored = null;
  try { stored = localStorage.getItem(FLAG); } catch {}
  const on = readFlag(location.search, stored);
  try { on ? localStorage.removeItem(FLAG) : localStorage.setItem(FLAG, "0"); } catch {}
  return on;
}

// "Back to My Voice" from the Bridge reopens the Caregiver area, not Talk. The
// Bridge leaves a time stamp in sessionStorage (this tab only); My Voice honours
// it once, within a few minutes, and only with #care in the address.
export const BACK = "luminaac:back-to-care";
export function backToCare(hash, stamp, now = Date.now(), within = 5 * 60e3) {
  const t = Number(stamp);
  return hash === "#care" && t > 0 && now - t >= 0 && now - t < within;
}

// Now/Next: the plan that's under way (some steps done, not all). The plan the
// child last opened wins; with none under way the ribbon stays hidden.
export function nowNext(plans, done = {}, prefer = null) {
  const going = (p) => { const n = (done[p.id] || []).length; return n > 0 && n < p.steps.length; };
  const plan = plans.find((p) => p.id === prefer && going(p)) || plans.find(going);
  if (!plan) return null;
  const d = new Set(done[plan.id] || []);
  const i = plan.steps.findIndex((_, k) => !d.has(k));
  return { plan, now: plan.steps[i], next: plan.steps[i + 1] || null };
}

// ---- Redesign R2: role views, the Log sheet, and the handoff card ----
// A role view only changes what is shown first; access.js and the server still
// decide what each person may see. "all" shows every hub.
export const ROLE_VIEWS = {
  parent: { label: "Parent", hubs: ["home", "programs", "progress", "circle", "safety"], log: ["moment", "potty", "note", "meal", "word", "behaviour", "sound"] },
  teacher: { label: "Teacher", hubs: ["home", "programs", "circle"], log: ["note", "word", "behaviour", "meal", "potty", "moment"] },
  therapist: { label: "Therapist", hubs: ["progress", "programs", "home", "circle"], log: ["sound", "word", "note", "behaviour", "moment"] },
  aide: { label: "Aide", hubs: ["home", "programs", "circle"], log: ["potty", "meal", "behaviour", "note", "word"] },
  family: { label: "Family", hubs: ["home", "circle"], log: ["note", "moment", "meal"] },
};
export const LOG_KINDS = {
  moment: "Moment", note: "Note", meal: "Ate or drank", word: "Word or sound heard", behaviour: "Behaviour", potty: "Toilet", sound: "Sound try",
};
export const viewFor = (role) => ROLE_VIEWS[role] || ROLE_VIEWS.parent;
// Up to six choices: the ones this person uses most first, then the role's defaults.
export function logChoices(role, counts = {}, avail = () => true) {
  const base = viewFor(role).log.filter(avail);
  return [...base].sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || base.indexOf(a) - base.indexOf(b)).slice(0, 6);
}
export function hubsFor(role, all = false) {
  return all ? ["home", "programs", "progress", "circle", "safety"] : viewFor(role).hubs;
}
// Handoff: what the next person needs at drop-off or pick-up, from data already logged.
export function handoff({ notes = [], potty = [], mood = null, alerts = [], moments = [] } = {}, now = Date.now(), within = 12 * 3600e3) {
  const recent = (x) => x && now - x.t < within;
  const meal = notes.find((n) => n.kind === "meal");
  const toilet = potty.filter((e) => e.kind === "void" || e.kind === "wet").sort((a, b) => b.t - a.t)[0];
  const watch = [
    ...alerts.filter((a) => !a.ack && recent(a)).map((a) => a.message || a.kind),
    ...notes.filter((n) => n.kind === "behaviour" && recent(n)).slice(0, 2).map((n) => n.text),
  ].slice(0, 3);
  const said = moments.filter((m) => m.meaning && recent(m)).slice(0, 3).map((m) => m.meaning);
  return {
    ate: recent(meal) ? { t: meal.t, text: meal.text } : null,
    toilet: recent(toilet) ? { t: toilet.t, text: toilet.kind === "wet" ? "Accident" : (toilet.data?.where || "toilet") === "toilet" ? "Used the toilet" : "Went, not in the toilet" } : null,
    mood, watch, said,
  };
}
