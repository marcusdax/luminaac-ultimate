// End-to-end check for M1 feature 5: the "Now" context strip.
// A Bridge rule that is active right now puts that page's words in their own row;
// tapping one adds it like any word; the core grid never moves; Explore quietly
// covers it; adding or removing a rule updates the row without a reload.
// Run: python3 -m http.server 8765 (repo root), then
//   NODE_PATH=$(npm root -g) node tests/browser/context-strip.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:8765";
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); } };
const ALWAYS = { days: [0, 1, 2, 3, 4, 5, 6], from: 0, to: 24 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { window.__spoken = []; speechSynthesis.speak = (u) => window.__spoken.push(u.text); });
// Start with no rules active, so the test controls the clock-independent state.
await page.addInitScript(() => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  const d = JSON.parse(localStorage.getItem("luminaac:bridge") || "null");
  if (d) { d.rules = []; localStorage.setItem("luminaac:bridge", JSON.stringify(d)); }
});
await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));

const setRules = (rules) => page.evaluate(async (rules) => { const S = await import("./shared.js"); const db = S.load(); db.rules = rules; S.persist(db); }, rules);
const grid = () => page.$$eval("#grid .tile", (ts) => ts.slice(0, 30).map((t) => { const r = t.getBoundingClientRect(); return `${t.dataset.w}@${Math.round(r.left)},${Math.round(r.top)}`; }));
const ctx = () => page.evaluate(() => ({ hidden: document.getElementById("ctx").hidden, label: document.getElementById("ctxLabel").textContent, words: [...document.querySelectorAll("#ctxRow .ctx-chip")].map((b) => b.dataset.w) }));

await setRules([]); await page.waitForTimeout(100);
await check("No active rule: no Now row", async () => assert.equal((await ctx()).hidden, true));

const before = await grid();
await setRules([{ id: "r1", page: "School", ...ALWAYS }]);
await page.waitForTimeout(150);
await check("School rule shows School words without a reload", async () => {
  const c = await ctx();
  assert.equal(c.hidden, false); assert.equal(c.label, "Now: School");
  assert.ok(c.words.includes("teacher") && c.words.includes("bathroom"), c.words.join(","));
});
await check("Core grid tiles stay in exactly the same places", async () => assert.deepEqual(await grid(), before));

await check("Tapping a Now word adds it to the message", async () => {
  await page.evaluate(() => (window.__spoken = []));
  await page.locator("#ctxRow .ctx-chip", { hasText: "teacher" }).click();
  const strip = await page.evaluate(() => document.getElementById("stripWords").textContent.trim());
  assert.equal(strip, "teacher");
});

await check("Explore quietly covers the Now row", async () => {
  await page.locator("#btnClear").click();
  await page.locator("#mvExplore").check();
  await page.evaluate(() => (window.__spoken = []));
  await page.locator("#ctxRow .ctx-chip", { hasText: "lunch" }).click();
  const r = await page.evaluate(() => ({ strip: document.getElementById("stripWords").textContent.trim(), spoken: window.__spoken.length }));
  await page.locator("#mvExplore").uncheck();
  assert.deepEqual(r, { strip: "", spoken: 0 });
});

await setRules([{ id: "r2", page: "Food & drink", ...ALWAYS }]);
await page.waitForTimeout(150);
await check("A rule naming a board folder shows that folder's words", async () => {
  const c = await ctx();
  assert.equal(c.label, "Now: Food & drink"); assert.ok(c.words.includes("water"), c.words.join(","));
});

await setRules([{ id: "r3", page: "Swimming", ...ALWAYS }]);
await page.waitForTimeout(150);
await check("A rule with no matching words shows no empty row", async () => assert.equal((await ctx()).hidden, true));

await setRules([{ id: "r4", page: "Bedtime", days: [], from: 0, to: 24 }]);
await page.waitForTimeout(150);
await check("A rule that is not active today shows nothing", async () => assert.equal((await ctx()).hidden, true));

await check("Context line says where the words are", async () => {
  await setRules([{ id: "r1", page: "School", ...ALWAYS }]); await page.waitForTimeout(150);
  const t = await page.evaluate(() => document.getElementById("mvContext").textContent);
  assert.match(t, /School words are in the Now row/);
});

await check("No page errors", () => assert.deepEqual(errors, []));
await browser.close();
for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
