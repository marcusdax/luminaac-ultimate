// Access options for My Voice, set from the Bridge (Vocabulary → "How My Voice responds").
// From the spec: age-appropriate modes (pediatric / adult / senior), dynamic button
// sizing, dwell-click, and switch scanning (1 switch = Space/Enter, 2 switches = Tab to move).
import { load } from "./shared.js";

const root = document.documentElement;
let dwellTimer = 0, scanTimer = 0, scanIdx = -1, cfg = load().access;

function apply() {
  cfg = load().access;
  root.dataset.mode = cfg.mode || "standard";
  root.style.setProperty("--board-zoom", String((cfg.size || 100) / 100));
  root.style.setProperty("--dwell-ms", `${cfg.dwell || 0}ms`);
  stopScan();
  if (cfg.scan) startScan();
}

// ---------- Dwell-click ----------
const target = (el) => el?.closest?.("main button, main .tile, nav .nav-btn, .mv-player button");
document.addEventListener("pointerover", (e) => {
  if (!cfg.dwell || e.pointerType === "touch") return;
  const t = target(e.target); if (!t || t.classList.contains("dwelling")) return;
  clearTimeout(dwellTimer); document.querySelectorAll(".dwelling").forEach((x) => x.classList.remove("dwelling"));
  t.classList.add("dwelling");
  dwellTimer = setTimeout(() => { t.classList.remove("dwelling"); t.click(); }, cfg.dwell);
});
document.addEventListener("pointerout", (e) => {
  const t = target(e.target); if (!t || t.contains(e.relatedTarget)) return;
  clearTimeout(dwellTimer); t.classList.remove("dwelling");
});

// ---------- Switch scanning ----------
function items() {
  const dlg = document.querySelector("dialog[open]");
  const scope = dlg || document;
  return [...scope.querySelectorAll(dlg ? "button" : "main button, main .tile, nav .nav-btn")].filter((el) => el.offsetParent !== null && !el.disabled && !el.closest("details:not([open]) > :not(summary)"));
}
function step() {
  const list = items(); if (!list.length) return;
  document.querySelectorAll(".scan-hi").forEach((x) => x.classList.remove("scan-hi"));
  scanIdx = (scanIdx + 1) % list.length;
  const el = list[scanIdx];
  el.classList.add("scan-hi");
  el.focus({ preventScroll: false });
}
function startScan() { scanIdx = -1; step(); scanTimer = setInterval(step, Math.max(600, cfg.scanMs || 1500)); }
function stopScan() { clearInterval(scanTimer); document.querySelectorAll(".scan-hi").forEach((x) => x.classList.remove("scan-hi")); }
document.addEventListener("keydown", (e) => {
  if (!cfg.scan) return;
  if (e.key === " " || e.key === "Enter") {
    const el = document.querySelector(".scan-hi");
    if (el) { e.preventDefault(); el.click(); clearInterval(scanTimer); scanIdx = -1; setTimeout(() => { if (cfg.scan) startScan(); }, 400); }
  }
});

window.addEventListener("storage", (e) => { if (e.key === "luminaac:bridge") apply(); });
apply();
