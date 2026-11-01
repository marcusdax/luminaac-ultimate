// Redesign R1: four hubs (Home, Programs, Progress, Circle) over the twelve old
// tabs. Only runs with the dev switch on (?redesign=1). It drives the existing
// tabs through B.show(), so every panel, hash link and render works unchanged.
import { HUBS, hubOf, resolveHash, tabForHub, redesignOn, BACK } from "./nav-core.js";

const ICON = {
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  programs: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h3",
  progress: "M4 20V10M10 20V4M16 20v-7M2 20h20",
  safety: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4",
  circle: "M9 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 3-5 6-5s6 2 6 5M15 15c3 0 6 2 6 5",
};

const B = window.__bridge;
if (B && redesignOn()) init();

function init() {
  document.documentElement.classList.add("rd");
  const oldTab = (id) => document.querySelector(`button.tab[data-tab="${id}"]`);
  const isShown = (id) => { const b = oldTab(id); return !!b && !b.hidden; };
  const last = {};
  // No View Transitions: on iPad Safari a whole-page snapshot could freeze taps
  // for seconds. The new panel fades in with plain CSS instead (redesign.css).
  const go = (tab) => B.show(tab);

  // "Back to My Voice" reopens the Caregiver area (see backToCare in nav-core.js).
  document.querySelectorAll('a[href="index.html"]').forEach((a) => {
    a.href = "index.html#care";
    if (a.classList.contains("pill-link")) a.textContent = "Back to My Voice";
    a.addEventListener("click", () => { try { sessionStorage.setItem(BACK, String(Date.now())); } catch {} });
  });

  const bar = document.createElement("nav");
  bar.className = "rd-hubs";
  bar.setAttribute("aria-label", "Bridge hubs");
  bar.innerHTML = HUBS.map((h) => `<button type="button" class="rd-hub" data-hub="${h.id}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[h.id]}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span>${h.label}</span></button>`).join("");
  document.querySelector(".tabs").before(bar);
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hub]");
    if (b) go(tabForHub(b.dataset.hub, last, isShown));
  });

  const sub = document.createElement("nav");
  sub.className = "rd-sub";
  sub.setAttribute("aria-label", "In this hub");
  document.getElementById("alertBar").after(sub);
  sub.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) go(b.dataset.tab); });

  const paint = (tab) => {
    const hub = hubOf(tab);
    last[hub.id] = tab;
    bar.querySelectorAll("[data-hub]").forEach((b) => (b.dataset.hub === hub.id ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    const tabs = hub.tabs.filter(isShown);
    sub.hidden = tabs.length < 2;
    sub.innerHTML = tabs.map((id) => `<button type="button" class="rd-chip" data-tab="${id}"${id === tab ? ' aria-current="page"' : ""}>${oldTab(id).textContent.trim()}</button>`).join("");
  };
  window.addEventListener("bridge:show", (e) => paint(e.detail));

  const start = resolveHash(location.hash);
  if (start && start !== B.current) B.show(start);
  else paint(B.current);
}
