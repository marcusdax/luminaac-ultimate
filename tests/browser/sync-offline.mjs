// End-to-end check for M1 features 3 and 4:
//  3. A Bridge change saved in this tab redraws My Voice without a reload; the backup
//     includes the Bridge document; "Erase history" also clears exploring taps.
//  4. Emoji picture fields accept multi-part emoji; the service worker stores every
//     OpenMoji symbol for offline use.
// Run: python3 -m http.server 8765 (repo root), then
//   NODE_PATH=$(npm root -g) node tests/browser/sync-offline.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
// The cache name follows sw.js, so bumping the version never breaks this test.
const SW_VERSION = /const VERSION = "([^"]+)"/.exec((await import("node:fs")).readFileSync(new URL("../../sw.js", import.meta.url), "utf8"))[1];

const BASE = process.argv[2] || "http://localhost:8765";
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { speechSynthesis.speak = () => {}; });
await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));

// ---- 3: same-tab redraw ----
await check("A My things tile saved in this tab appears without a reload", async () => {
  await page.evaluate(async () => {
    const S = await import("./shared.js");
    const db = S.load();
    db.personality.push({ id: "test-tile", label: "Grandpa's tractor", e: "🚜", kind: "custom" });
    S.persist(db);
  });
  await page.waitForTimeout(150);
  const labels = await page.$$eval("#mvPersonality .label", (els) => els.map((e) => e.textContent));
  assert.ok(labels.includes("Grandpa's tractor"), labels.join(", "));
});

await check("Backup file includes the Bridge document", async () => {
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => document.getElementById("exportBtn").click()),
  ]);
  const text = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
  const j = JSON.parse(text);
  assert.ok(j.bridge && Array.isArray(j.bridge.personality), "no bridge in backup");
  assert.ok(j.bridge.personality.some((p) => p.label === "Grandpa's tractor"));
  assert.ok(Array.isArray(j.log), "talker log still there");
});

await check("Erase history also clears exploring taps", async () => {
  await page.evaluate(async () => {
    const S = await import("./shared.js");
    const db = S.load(); db.exploration.push({ t: Date.now(), word: "go" }); S.persist(db);
  });
  page.once("dialog", (d) => d.accept());
  await page.evaluate(() => document.getElementById("resetBtn").click());
  await page.waitForTimeout(150);
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:bridge")).exploration.length);
  assert.equal(n, 0);
});

// ---- 4: emoji fields and offline symbols ----
const FAMILY = "👨‍👩‍👧"; // 8 UTF-16 code units: did not fit maxlength="4"
await check("Custom word picture field keeps a multi-part emoji", async () => {
  const v = await page.evaluate((e) => { const i = document.querySelector('input[name="e"]'); i.value = ""; i.focus(); return i.maxLength; }, FAMILY);
  assert.ok(v >= FAMILY.length, `maxlength ${v}`);
});
await check("Bridge My things picture field keeps a multi-part emoji", async () => {
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/bridge.html`); await p2.waitForTimeout(400);
  const ml = await p2.evaluate(() => document.querySelector('input[name="e"][placeholder="🕺"]').maxLength);
  await p2.close();
  assert.ok(ml >= FAMILY.length, `maxlength ${ml}`);
});

await check("Service worker stores every OpenMoji symbol for offline use", async () => {
  const want = readdirSync(new URL("../../vendor/openmoji/", import.meta.url)).filter((f) => f.endsWith(".svg"));
  await page.evaluate(() => navigator.serviceWorker.register("sw.js"));
  const got = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 60; i++) {
      const keys = await caches.keys();
      const shell = keys.find((k) => k.endsWith("-shell"));
      if (shell) { const reqs = await (await caches.open(shell)).keys(); const n = reqs.filter((r) => r.url.includes("/vendor/openmoji/")).length; if (n > 120) return { shell, n }; }
      await new Promise((r) => setTimeout(r, 250));
    }
    return { n: 0 };
  });
  assert.equal(got.n, want.length);
  assert.equal(got.shell, `${SW_VERSION}-shell`);
});

await check("No page errors", () => assert.deepEqual(errors, []));
await browser.close();
for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
