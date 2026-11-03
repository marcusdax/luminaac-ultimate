// Bridge motion (docs/MOTION-CONCEPT.md, zone 4). Small, once-only motion for
// grown-ups: counts tick up, the 14-day chart draws in the first time it shows,
// and a soft beam runs once from the tablet to this phone when a sync lands.
// Safety and alerts never move. Everything follows motion-gate.js.
import { level, tick } from "./motion-gate.js";

const $ = (s) => document.querySelector(s);

// Counts tick up from what they showed last time (from 0 on the first view).
const shown = new WeakSet();
const stats = $("#stats");
if (stats) new MutationObserver(() => {
  for (const b of stats.querySelectorAll(".stat b")) {
    if (shown.has(b)) continue; shown.add(b);
    const key = b.nextElementSibling?.textContent || "", to = +b.textContent;
    if (!Number.isFinite(to)) continue;
    b.dataset.n = sessionGet(key); tick(b, to); sessionSet(key, to);
  }
}).observe(stats, { childList: true });
function sessionGet(k) { try { return sessionStorage.getItem("mg:" + k) ?? "0"; } catch { return "0"; } }
function sessionSet(k, v) { try { sessionStorage.setItem("mg:" + k, String(v)); } catch {} }

// The chart's bars grow once per visit, never on every refresh.
let drawn = false;
const trend = $("#trend");
if (trend) new MutationObserver(() => {
  if (drawn || level() < 2 || !trend.offsetParent) return;
  const bars = trend.querySelectorAll("rect"); if (!bars.length) return;
  drawn = true;
  bars.forEach((r, i) => { r.style.transformBox = "fill-box"; r.style.transformOrigin = "50% 100%"; r.animate?.([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 420, delay: i * 25, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "backwards" }); });
}).observe(trend, { childList: true, subtree: true });

// "Linked devices" beam beside the sync status. It shows the link is alive
// without a spinner: one dot runs from the tablet to the phone when a sync lands.
const status = $("#syncStatus");
if (status) {
  const beam = document.createElement("div");
  beam.className = "mg-beam"; beam.setAttribute("aria-hidden", "true"); beam.hidden = true;
  beam.innerHTML = `<svg viewBox="0 0 200 40"><g class="mg-dev" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><rect x="6" y="6" width="34" height="28" rx="5"/><rect x="166" y="4" width="22" height="32" rx="5"/></g>
    <path class="mg-line" d="M46 20 H160" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 9"/><circle class="mg-dot" cx="46" cy="20" r="6"/></svg>`;
  status.before(beam);
  let last = "";
  const update = () => {
    const t = status.textContent || "", on = /^Connected/.test(t);
    beam.hidden = !on;
    if (on && t !== last && /Last synced/.test(t) && last && level() >= 2) {
      beam.querySelector(".mg-dot").animate?.([{ transform: "translateX(0)", opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: "translateX(114px)", opacity: 0 }], { duration: 1100, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
    }
    last = t;
  };
  new MutationObserver(update).observe(status, { childList: true, characterData: true, subtree: true });
  update();
}
