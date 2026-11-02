// Access options for My Voice, set from the Bridge (Vocabulary → "How My Voice responds").
// From the spec: age-appropriate modes (pediatric / adult / senior), dynamic button
// sizing, dwell-click, and switch scanning (1 switch = Space/Enter, 2 switches = Tab to move).
import { load } from "./shared.js";
import { settings, rowsOf, Scanner } from "./scan-core.js";

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

// ---------- Switch scanning (logic in scan-core.js) ----------
let scanner = null, els = [], lastPress = 0, holdTimer = 0;
function items() {
  const dlg = document.querySelector("dialog[open]");
  const scope = dlg || document;
  return [...scope.querySelectorAll(dlg ? "button" : "main button, main .tile, nav .nav-btn")].filter((el) => el.offsetParent !== null && !el.disabled && !el.closest("details:not([open]) > :not(summary)"));
}
const sc = () => settings(cfg);
function paint(idx) {
  document.querySelectorAll(".scan-hi, .scan-row").forEach((x) => x.classList.remove("scan-hi", "scan-row"));
  const group = idx.map((i) => els[i]).filter(Boolean);
  group.forEach((el) => el.classList.add(group.length > 1 ? "scan-row" : "scan-hi"));
  if (group[0]) { group[0].focus({ preventScroll: false }); }
  if (sc().auditory && group.length && window.speechSynthesis) {
    const words = group.length > 1 ? `row, ${label(group[0])}` : label(group[0]);
    const u = new SpeechSynthesisUtterance(words); u.volume = 0.5; u.rate = 1.1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
}
const label = (el) => (el.getAttribute("aria-label") || el.dataset.w || el.textContent || "").trim().split(",")[0].slice(0, 40);
function build() {
  const all = items(), nav = all.filter((e) => e.closest("nav")), body = all.filter((e) => !e.closest("nav"));
  els = [...body, ...nav]; // the board first, the app's tab bar last as its own row
  const pos = (e) => { const r = e.getBoundingClientRect(); return { top: r.top, left: r.left }; };
  const rows = sc().method === "rowcol" ? rowsOf(body.map(pos)) : [body.map((_, i) => i)];
  if (nav.length) rows.push(nav.map((_, i) => body.length + i));
  scanner = new Scanner(sc().method === "rowcol" ? rows : [rows.flat()], sc());
}
function tick() {
  if (!scanner) build();
  const cur = scanner.next(); paint(cur);
  if (scanner.paused) { stopTimer(); return; }
}
function stopTimer() { clearTimeout(holdTimer); clearInterval(scanTimer); }
function startScan() {
  stopTimer(); build(); tick();
  if (sc().switches === 2) return; // step scanning: switch 2 moves
  holdTimer = setTimeout(() => { scanTimer = setInterval(tick, sc().scanMs); }, sc().firstHold);
}
function stopScan() { stopTimer(); scanner = null; paint([]); }
document.addEventListener("keydown", (e) => {
  if (!cfg.scan) return;
  const sel = e.key === " " || e.key === "Enter", move = sc().switches === 2 && (e.key === "Tab" || e.key === "ArrowRight");
  if (!sel && !move) return;
  e.preventDefault();
  const now = Date.now(); if (now - lastPress < sc().debounce) return; lastPress = now;
  if (move) { tick(); return; }
  if (!scanner) { startScan(); return; }
  const r = scanner.select();
  if (r.type === "row") { stopTimer(); tick(); if (sc().switches === 1) holdTimer = setTimeout(() => { scanTimer = setInterval(tick, sc().scanMs); }, sc().firstHold); return; }
  if (r.type === "activate") { const el = els[r.index]; paint([]); stopTimer(); el?.click(); setTimeout(() => cfg.scan && startScan(), 400); return; }
  startScan(); // resume after a pause
});

window.addEventListener("storage", (e) => { if (e.key === "luminaac:bridge") apply(); });
apply();
