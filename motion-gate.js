// The one motion gate (docs/MOTION-CONCEPT.md §4). Every animated module asks
// it first. It reads the phone's reduce-motion setting, Still mode in Talk, the
// grown-up's Movement setting from the Bridge, the battery and the device, and
// keeps <html data-ml="0..3"> current so CSS can follow the same level.
import { motionLevel, flight } from "./motion-core.js";
import { playSettings } from "./play-core.js";

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
let battery = null, charging = true, cur = -1;
const subs = new Set();

function compute() {
  return motionLevel({
    reduced: !!mq?.matches,
    still: !!read("luminaac:settings").stillness || document.body?.classList.contains("still"),
    setting: playSettings(read("luminaac:bridge").games?.settings || {}).motion,
    battery, charging,
    cores: navigator.hardwareConcurrency || 8,
    memory: navigator.deviceMemory || 8,
  });
}
export function refresh() {
  const lv = compute();
  document.documentElement.dataset.ml = String(lv);
  if (lv !== cur) { cur = lv; subs.forEach((f) => { try { f(lv); } catch {} }); }
  return lv;
}
export const level = () => (cur < 0 ? refresh() : cur);
export const onChange = (fn) => { subs.add(fn); return () => subs.delete(fn); };

mq?.addEventListener?.("change", refresh);
addEventListener("storage", (e) => { if (e.key === "luminaac:bridge" || e.key === "luminaac:settings") refresh(); });
addEventListener("motion:refresh", refresh);
navigator.getBattery?.().then((b) => {
  const up = () => { battery = b.level; charging = b.charging; refresh(); };
  b.addEventListener("levelchange", up); b.addEventListener("chargingchange", up); up();
}).catch(() => {});
if (document.body) new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ["class"] });
refresh();

const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)"; // --ease
const rect = (el) => el.getBoundingClientRect();

// A word flies from the tile to its place in the strip (level 1+). The strip
// word waits, then appears as the ghost lands, so the child sees where it went.
export function flyTo(src, dst, ms = 220) {
  if (level() < 1 || !src?.isConnected || !dst?.isConnected || !Element.prototype.animate) return;
  const a = rect(src), b = rect(dst);
  if (!a.width || !b.width) return;
  const f = flight(a, b); // the tile's offset from where the strip word sits
  const g = src.cloneNode(true);
  g.removeAttribute("id"); g.setAttribute("aria-hidden", "true"); g.classList.add("mg-ghost"); g.tabIndex = -1;
  Object.assign(g.style, { position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: "0", zIndex: "60", pointerEvents: "none", transformOrigin: "50% 50%" });
  document.body.append(g);
  dst.style.opacity = "0";
  const k = g.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${-f.dx}px, ${-f.dy}px) scale(${Math.max(0.25, b.height / a.height)})`, opacity: 0.35 },
  ], { duration: ms, easing: EASE });
  const end = () => { g.remove(); dst.style.opacity = ""; };
  k.onfinish = end; k.oncancel = end;
}

// The lit pill slides from the old nav item to the new one (level 2+), with no
// overshoot, so a second tap mid-slide never jerks.
export function pillMove(from, to, ms = 180) {
  if (level() < 2 || !from || !to || from === to || !Element.prototype.animate) return;
  const host = to.parentElement;
  if (!host || from.parentElement !== host) return;
  const a = rect(from), b = rect(to), h = rect(host);
  if (!a.width || !b.width) return;
  // The pill sits inside the bar, under the buttons' icons and labels.
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.classList.add("mg-pill-host");
  const p = document.createElement("span");
  p.className = "mg-pill"; p.setAttribute("aria-hidden", "true");
  Object.assign(p.style, { left: `${b.left - h.left + host.scrollLeft}px`, top: `${b.top - h.top + host.scrollTop}px`, width: `${b.width}px`, height: `${b.height}px` });
  host.prepend(p);
  to.classList.add("mg-hold");
  const k = p.animate([
    { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)`, width: `${a.width}px`, height: `${a.height}px` },
    { transform: "translate(0,0)", width: `${b.width}px`, height: `${b.height}px` },
  ], { duration: ms, easing: EASE });
  const end = () => { p.remove(); to.classList.remove("mg-hold"); };
  k.onfinish = end; k.oncancel = end;
}

// Board changes with a short View Transition (level 2+), so "food lives inside
// that tab" has a place. Falls back to a plain swap.
// The change itself never waits on the animation: if the browser holds the
// transition (a background tab, a busy frame), the swap still lands in 250 ms.
export function swap(fn) {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  if (level() >= 2 && document.startViewTransition && !document.hidden) {
    try {
      const vt = document.startViewTransition(run);
      for (const p of [vt.ready, vt.finished, vt.updateCallbackDone]) p?.catch(() => {}); // a skipped transition is fine
      setTimeout(run, 250); return;
    } catch {}
  }
  run();
}

// A count ticks up once (Bridge only).
export function tick(el, to, ms = 600) {
  const from = +(el.dataset.n ?? 0);
  el.dataset.n = String(to);
  if (level() < 2 || from === +to) { el.textContent = String(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const x = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - x, 3);
    el.textContent = String(Math.round(from + (to - from) * e));
    if (x < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

window.LuminGate = { level, onChange, refresh, flyTo, pillMove, swap, tick };
