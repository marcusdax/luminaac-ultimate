// End-to-end check for M1 feature 7: switch scanning gaps and board sizing.
// Run: python3 -m http.server 8765 (repo root), then
//   NODE_PATH=$(npm root -g) node tests/browser/scanning.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:8765";
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// A controllable speech engine: "speaking" stays true until the test ends it.
await page.addInitScript(() => {
  window.__log = []; let cur = null;
  Object.defineProperty(speechSynthesis, "speaking", { get: () => !!cur });
  speechSynthesis.speak = (u) => { window.__log.push("speak:" + u.text); cur = u; };
  speechSynthesis.cancel = () => { window.__log.push("cancel"); const u = cur; cur = null; u?.onend?.(); };
  window.__finish = () => { const u = cur; cur = null; u?.onend?.(); };
});
await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
const setAccess = (a) => page.evaluate(async (a) => { const S = await import("./shared.js"); const db = S.load(); Object.assign(db.access, a); S.persist(db); }, a);

// Step scanning (two switches): Tab moves the highlight, Enter picks; no timers in the way.
await setAccess({ scan: true, scanCfg: { method: "linear", switches: 2, debounce: 0, auditory: false } });
await page.waitForTimeout(200);

await check("Scanning can reach section headers and the Explore quietly checkbox", async () => {
  const kinds = new Set();
  for (let i = 0; i < 160; i++) {
    const k = await page.evaluate(() => { const el = document.querySelector(".scan-hi"); return el ? (el.matches("summary") ? "summary" : el.matches("input[type=checkbox]") ? "checkbox" : "other") : "none"; });
    kinds.add(k); if (kinds.has("summary") && kinds.has("checkbox")) break;
    await page.keyboard.press("Tab"); await page.waitForTimeout(20);
  }
  assert.ok(kinds.has("summary"), "no summary reached"); assert.ok(kinds.has("checkbox"), "no checkbox reached");
});

await check("Picking a section header with the switch opens it", async () => {
  for (let i = 0; i < 160; i++) {
    const isSummary = await page.evaluate(() => document.querySelector(".scan-hi")?.matches("summary"));
    if (isSummary) break;
    await page.keyboard.press("Tab"); await page.waitForTimeout(20);
  }
  const before = await page.evaluate(() => document.querySelector(".scan-hi").parentElement.open);
  await page.keyboard.press("Enter"); await page.waitForTimeout(100);
  const after = await page.evaluate(() => [...document.querySelectorAll("details")].some((d) => d.open));
  assert.ok(!before && after, `before ${before}, after ${after}`);
});

await check("Typing in a caregiver text field keeps Space and Enter", async () => {
  const ok = await page.evaluate(() => {
    const i = document.querySelector('input[name="w"]'); i.closest("section")?.removeAttribute("hidden");
    i.focus(); const ev = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    i.dispatchEvent(ev); return !ev.defaultPrevented;
  });
  assert.ok(ok, "Space was captured by scanning");
});

await setAccess({ scan: true, scanCfg: { method: "linear", switches: 2, debounce: 0, auditory: true } });
await page.waitForTimeout(200);
await check("The auditory preview never cuts off a message that is speaking", async () => {
  // The child's message, spoken the way the board speaks it (through the talker).
  await page.evaluate(() => { window.luminaacVoice.say("I want juice"); window.__log = []; });
  await page.keyboard.press("Tab"); await page.waitForTimeout(50);
  const log = await page.evaluate(() => window.__log);
  assert.ok(!log.includes("cancel") && !log.some((l) => l.startsWith("speak:")), log.join(" | "));
});
await check("When nothing else is speaking, the preview speaks", async () => {
  await page.evaluate(() => { window.__finish(); window.__log = []; });
  await page.keyboard.press("Tab"); await page.waitForTimeout(50);
  const log = await page.evaluate(() => window.__log);
  assert.ok(log.some((l) => l.startsWith("speak:")), log.join(" | "));
});
await check("A new preview replaces the previous preview", async () => {
  await page.evaluate(() => (window.__log = []));
  await page.keyboard.press("Tab"); await page.waitForTimeout(50);
  const log = await page.evaluate(() => window.__log);
  assert.deepEqual(log.slice(0, 1), ["cancel"]); assert.ok(log[1]?.startsWith("speak:"), log.join(" | "));
});

await setAccess({ scan: false, size: 160 });
await page.waitForTimeout(200);
await check("Button size uses variables, not CSS zoom", async () => {
  const z = await page.evaluate(() => getComputedStyle(document.getElementById("grid")).zoom);
  assert.ok(z === "1" || z === "normal" || z === "", `zoom is ${z}`);
});
await check("At 160% tiles are taller and the board still fits the screen", async () => {
  const m = await page.evaluate(() => ({ h: document.querySelector(".grid .tile").getBoundingClientRect().height, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  await setAccess({ size: 100 }); await page.waitForTimeout(200);
  const h100 = await page.evaluate(() => document.querySelector(".grid .tile").getBoundingClientRect().height);
  assert.ok(m.h > h100 * 1.3, `160%: ${m.h}px, 100%: ${h100}px`);
  assert.ok(m.sw <= m.cw + 1, `page scrolls sideways: ${m.sw} > ${m.cw}`);
});

await check("No page errors", () => assert.deepEqual(errors, []));
await browser.close();
for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
