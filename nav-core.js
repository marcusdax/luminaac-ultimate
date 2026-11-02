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
