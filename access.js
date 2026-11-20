// Access options for My Voice, set from the Bridge (Vocabulary → "How My Voice responds").
// From the spec: age-appropriate modes (pediatric / adult / senior), dynamic button
// sizing, dwell-click, and switch scanning (1 switch = Space/Enter, 2 switches = Tab to move).
import { load, onBridgeChange } from "./shared.js";
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

// ---------- Touch: hold to choose, ignore repeat taps (tremor and unsteady hands) ----------
// Buttons already act on release: a click needs the press and the release on the same
// button, so sliding off cancels (WCAG 2.5.2). These two settings add, per child:
//  acceptMs     the press must last this long before it counts (brushing past a tile does nothing)
//  tapDebounce  after a choice, further taps are ignored for this long (no double picks)
// Only pointer taps are filtered: keyboard, switch and dwell clicks (detail 0) pass through.
// It listens on window in the capture phase, so it runs before any other click handler.
let press = null, lastPick = -Infinity;
const touchTarget = (el) => el?.closest?.("main button, main .tile, .mv-player button");
const clearAccept = () => document.querySelectorAll(".accepting").forEach((x) => x.classList.remove("accepting"));
window.addEventListener("pointerdown", (e) => {
  const t = touchTarget(e.target);
  press = t ? { t, at: performance.now() } : null;
  clearAccept();
  if (t && cfg.acceptMs > 0) { t.style.setProperty("--accept-ms", `${cfg.acceptMs}ms`); t.classList.add("accepting"); }
}, true);
window.addEventListener("pointerup", clearAccept, true);
window.addEventListener("pointercancel", () => { clearAccept(); press = null; }, true);
window.addEventListener("click", (e) => {
  const t = touchTarget(e.target);
  if (!t || e.detail === 0) return;
  const now = performance.now();
  const held = press && press.t === t ? now - press.at : 0;
  const tooShort = cfg.acceptMs > 0 && held < cfg.acceptMs;
  const tooSoon = cfg.tapDebounce > 0 && now - lastPick < cfg.tapDebounce && !t.closest(".mv-sos"); // safety always gets through
  press = null;
  if (tooShort || tooSoon) { e.stopImmediatePropagation(); e.preventDefault(); return; }
  lastPick = now;
}, true);

// ---------- Switch scanning (logic in scan-core.js) ----------
let scanner = null, els = [], lastPress = 0, holdTimer = 0, previewing = null;
function items() {
  const dlg = document.querySelector("dialog[open]");
  const scope = dlg || document;
  // Section headers (<summary>) and checkboxes are choices too: "My things", "Explore quietly".
  const sel = dlg ? "button, summary, input[type=checkbox]" : "main button, main .tile, main summary, main input[type=checkbox], nav .nav-btn";
  return [...scope.querySelectorAll(sel)].filter((el) => (el.offsetParent !== null || el.closest("label")?.offsetParent) && !el.disabled && !el.closest("details:not([open]) > :not(summary)"));
}
const sc = () => settings(cfg);
function paint(idx) {
  document.querySelectorAll(".scan-hi, .scan-row").forEach((x) => x.classList.remove("scan-hi", "scan-row"));
  const group = idx.map((i) => els[i]).filter(Boolean);
  group.forEach((el) => el.classList.add(group.length > 1 ? "scan-row" : "scan-hi"));
  if (group[0]) { group[0].focus({ preventScroll: false }); }
  // Auditory scanning: a quiet preview of each item. It never talks over the child: if
  // a message (or anything that isn't our own preview) is speaking, the preview waits.
  if (sc().auditory && group.length && window.speechSynthesis) {
    if (window.luminaacVoice?.busy || (speechSynthesis.speaking && !previewing)) return;
    const words = group.length > 1 ? `row, ${label(group[0])}` : label(group[0]);
    const u = new SpeechSynthesisUtterance(words); u.volume = 0.5; u.rate = 1.1;
    u.onend = u.onerror = () => { if (previewing === u) previewing = null; };
    if (previewing) speechSynthesis.cancel(); // replace our own previous preview only
    previewing = u; speechSynthesis.speak(u);
  }
}
const label = (el) => (el.getAttribute("aria-label") || el.dataset.w || (el.matches("input") ? el.closest("label")?.textContent : el.textContent) || "").trim().split(",")[0].slice(0, 40);
// Typing in a text field (Caregiver forms) must keep Space and Enter for typing.
const typing = (el) => el?.isContentEditable || (el?.matches?.("input, textarea, select") && !el.matches("input[type=checkbox], input[type=radio], input[type=button], input[type=submit]"));
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
  if (!cfg.scan || typing(e.target)) return;
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

onBridgeChange(apply);
apply();
