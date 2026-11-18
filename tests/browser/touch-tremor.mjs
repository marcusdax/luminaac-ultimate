// End-to-end check for M1 feature 6: hold to choose and ignore repeat taps.
// Run: python3 -m http.server 8765 (repo root), then
//   NODE_PATH=$(npm root -g) node tests/browser/touch-tremor.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:8765";
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { window.__spoken = []; speechSynthesis.speak = (u) => window.__spoken.push(u.text); });
await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));

const setAccess = (a) => page.evaluate(async (a) => { const S = await import("./shared.js"); const db = S.load(); Object.assign(db.access, a); S.persist(db); }, a);
const strip = () => page.evaluate(() => [...document.querySelectorAll("#stripWords .word")].map((w) => w.textContent));
const clear = () => page.locator("#btnClear").click({ force: true });
async function press(sel, holdMs) {
  const box = await page.locator(sel).first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(holdMs); await page.mouse.up();
  await page.waitForTimeout(80);
}
const TILE = '.grid .tile[data-w="want"]';

await setAccess({ acceptMs: 0, tapDebounce: 0 }); await page.waitForTimeout(100);
await check("Off by default: a quick tap chooses", async () => { await clear(); await press(TILE, 30); assert.deepEqual(await strip(), ["want"]); });

await setAccess({ acceptMs: 500 }); await page.waitForTimeout(100);
await check("Hold 0.5 s: a quick tap does nothing", async () => { await clear(); await press(TILE, 60); assert.deepEqual(await strip(), []); });
await check("Hold 0.5 s: a held press chooses", async () => { await clear(); await press(TILE, 650); assert.deepEqual(await strip(), ["want"]); });
await check("Hold 0.5 s: the ring shows while holding", async () => {
  const box = await page.locator(TILE).boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await page.waitForTimeout(100);
  const on = await page.locator(TILE).evaluate((t) => t.classList.contains("accepting"));
  await page.mouse.up(); await page.waitForTimeout(50);
  const off = await page.locator(TILE).evaluate((t) => t.classList.contains("accepting"));
  assert.ok(on && !off, `during ${on}, after ${off}`);
});
await check("Hold 0.5 s: a keyboard press still chooses at once", async () => {
  await clear(); await page.locator(TILE).focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(80);
  assert.deepEqual(await strip(), ["want"]);
});

await setAccess({ acceptMs: 0, tapDebounce: 1000 }); await page.waitForTimeout(100);
await check("Ignore 1 s: a quick double tap counts once", async () => {
  await clear(); await page.waitForTimeout(1100); await press(TILE, 30); await press('.grid .tile[data-w="go"]', 30);
  assert.deepEqual(await strip(), ["want"]);
});
await check("Ignore 1 s: a tap after the pause counts", async () => { await page.waitForTimeout(1100); await press('.grid .tile[data-w="go"]', 30); assert.deepEqual(await strip(), ["want", "go"]); });
await check("Ignore 1 s: I need help is never paused", async () => {
  await page.evaluate(() => (window.__spoken = [])); await press(TILE, 30); await press('.mv-sos[data-kind="help"]', 30);
  const s = await page.evaluate(() => window.__spoken); assert.ok(s.includes("I need help"), s.join("|"));
});

await setAccess({ acceptMs: 0, tapDebounce: 0 });
await check("Bridge form saves both settings", async () => {
  const b = await ctx.newPage(); await b.goto(`${BASE}/bridge.html`); await b.waitForTimeout(500);
  await b.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
  await b.evaluate(() => { const f = document.getElementById("formAccess"); f.acceptMs.value = "300"; f.tapDebounce.value = "2000"; f.dispatchEvent(new Event("change", { bubbles: true })); });
  await b.waitForTimeout(100);
  const a = await b.evaluate(() => JSON.parse(localStorage.getItem("luminaac:bridge")).access);
  await b.close();
  assert.deepEqual([a.acceptMs, a.tapDebounce], [300, 2000]);
});

await check("No page errors", () => assert.deepEqual(errors, []));
await browser.close();
for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
