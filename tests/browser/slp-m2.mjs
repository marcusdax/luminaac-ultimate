// End-to-end check for M2: partner modeling, word endings, find a word, scripts,
// choice boards, routines in Plans, the body map, quick phrases and the Bridge editors.
// Run: python3 -m http.server 8765 (repo root), then
//   NODE_PATH=$(npm root -g) node tests/browser/slp-m2.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:8765";
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); } };

const browser = await chromium.launch();
// One context, so My Voice and the Bridge share storage like two tabs on one device.
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { window.__spoken = []; speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 5); }; });
await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));

const ls = (k, fb) => page.evaluate(([k, fb]) => { try { return JSON.parse(localStorage.getItem("luminaac:" + k)) ?? fb; } catch { return fb; } }, [k, fb]);
const spoken = () => page.evaluate(() => window.__spoken.slice());
const clearSpoken = () => page.evaluate(() => (window.__spoken.length = 0));
const strip = () => page.$$eval("#stripWords .word", (s) => s.map((x) => x.textContent));
const tilePos = () => page.$$eval("#grid .tile", (ts) => ts.map((t) => { const r = t.getBoundingClientRect(); return `${t.dataset.w}@${Math.round(r.left)},${Math.round(r.top)}`; }));
const clearStrip = () => page.click("#btnClear");
const setBridge = (patch) => page.evaluate(async (patch) => { const S = await import("./shared.js"); const db = S.load(); Object.assign(db, patch); S.persist(db); }, patch);

// ---------- Partner modeling ----------
const actionWord = await page.$eval("#grid .tile[data-c=action]", (t) => t.dataset.w);
await check("Modeling: turning it on shows the banner and keeps the board still", async () => {
  const before = await tilePos();
  await page.evaluate(() => window.__myvoice.openCare());
  await page.click("#modelToggle");
  await page.waitForTimeout(150);
  assert.equal(await page.isVisible("#modelBanner"), true);
  assert.equal(await page.evaluate(() => document.body.classList.contains("modeling")), true);
  assert.equal(await page.evaluate(() => window.__myvoice.view), "talk");
  assert.deepEqual(await tilePos(), before);
});
await check("Modeling: taps leave a numbered trail", async () => {
  const words = await page.$$eval("#grid .tile", (ts) => ts.slice(0, 2).map((t) => t.dataset.w));
  for (const w of words) await page.click(`#grid .tile[data-w="${w}"]`);
  const steps = await page.$$eval("#grid .tile.modeled", (ts) => ts.map((t) => t.dataset.step));
  assert.deepEqual(steps, ["1", "2"]);
});
await check("Modeling: speaking is kept out of the child's log, counts and next-word ideas", async () => {
  const log0 = (await ls("log", [])).length, counts0 = JSON.stringify(await ls("counts", {})), pairs0 = JSON.stringify(await ls("pairs", {})), m0 = (await ls("modeling", [])).length;
  await clearSpoken();
  await page.click("#btnSpeak");
  await page.waitForTimeout(100);
  assert.equal((await ls("log", [])).length, log0);
  assert.equal(JSON.stringify(await ls("counts", {})), counts0);
  assert.equal(JSON.stringify(await ls("pairs", {})), pairs0);
  assert.equal((await ls("modeling", [])).length, m0 + 1);
  assert.equal((await spoken()).length, 1);
});
await check("Modeling: can be silent", async () => {
  await page.evaluate(() => window.__myvoice.openCare());
  await page.uncheck("#settings [name=modelSpeak]");
  await page.click("#lockBtn");
  await clearStrip(); await clearSpoken();
  await page.click(`#grid .tile[data-w="${actionWord}"]`);
  await page.click("#btnSpeak");
  await page.waitForTimeout(100);
  assert.deepEqual(await spoken(), []);
  await page.evaluate(() => window.__myvoice.openCare());
  await page.check("#settings [name=modelSpeak]");
});
await check("Modeling: Stop clears the banner and trail; the child's words count again", async () => {
  await page.click("#modelStop");
  assert.equal(await page.isVisible("#modelBanner"), false);
  assert.equal(await page.$$eval("#grid .tile.modeled", (t) => t.length), 0);
  await page.evaluate(() => window.__myvoice.show("talk"));
  await clearStrip();
  const log0 = (await ls("log", [])).length;
  await page.click(`#grid .tile[data-w="${actionWord}"]`);
  await page.click("#btnSpeak");
  await page.waitForTimeout(100);
  assert.equal((await ls("log", [])).length, log0 + 1);
});

// ---------- Word endings ----------
await check("Word endings: an action word offers its forms, and a tap swaps it", async () => {
  await clearStrip();
  const w = await page.$$eval("#grid .tile[data-c=action]", (ts) => ts.map((t) => t.dataset.w).find((x) => /^[a-z]+$/.test(x)));
  await page.click(`#grid .tile[data-w="${w}"]`);
  const forms = await page.$$eval("#nextRow .morph-chip", (b) => b.map((x) => x.textContent));
  assert.ok(forms.length >= 2 && forms.every((f) => f !== w && f.length > 1), JSON.stringify(forms));
  await page.click(`#nextRow .morph-chip >> text="${forms[0]}"`);
  assert.deepEqual(await strip(), [forms[0]]);
});

// ---------- Find a word ----------
await check("Find a word: shows where a word lives, adds it and opens its folder", async () => {
  await clearStrip();
  const target = await page.evaluate(async () => { const V = await import("./vocab.js"); const f = V.FOLDERS[1]; return { w: f.words[0].w, id: f.id, label: f.label }; });
  await page.click("#btnFind");
  await page.fill("#findInput", target.w);
  await page.waitForTimeout(50);
  const first = await page.$eval("#findResults .find-hit", (b) => [b.querySelector(".find-w").textContent, b.querySelector(".find-f").textContent]);
  assert.deepEqual(first, [target.w, `in ${target.label}`]);
  await page.click("#findResults .find-hit");
  assert.equal(await page.evaluate(() => document.getElementById("findDialog").open), false);
  assert.deepEqual(await strip(), [target.w]);
  assert.equal(await page.$eval(".folder[aria-selected=true]", (b) => b.lastChild.textContent.trim()), target.label);
  assert.equal(await page.$eval(`#grid .tile[data-w="${target.w}"]`, (t) => t.classList.contains("found")), true);
});
await check("Find a word: a word that isn't there says so", async () => {
  await page.click("#btnFind");
  await page.fill("#findInput", "zzqx");
  await page.waitForTimeout(50);
  assert.match(await page.textContent("#findStatus"), /No words found/);
  await page.click("#findClose");
});

// ---------- Scripts ----------
await check("Scripts: a Scripts tab appears at the end; other tabs don't move", async () => {
  const tabs = () => page.$$eval("#folders .folder", (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return `${b.textContent.trim()}@${Math.round(r.left)},${Math.round(r.top)}`; }));
  const before = await tabs();
  await setBridge({ scripts: [{ id: "g1", text: "to infinity and beyond", e: "🚀", stage: 1 }, { id: "g2", text: "let's go / to the park", e: "🌳", stage: 2 }] });
  await page.waitForTimeout(150);
  const after = await tabs();
  assert.equal(after.length, before.length + 1);
  assert.match(after.at(-1), /^💬Scripts@|^💬 ?Scripts@/u);
  assert.deepEqual(after.slice(0, -1), before);
});
await check("Scripts: stage 1 is said whole and logged as a script", async () => {
  await page.click("#folders .folder >> text=Scripts");
  await clearStrip(); await clearSpoken();
  await page.click('#grid .tile[data-w="to infinity and beyond"]');
  await page.waitForTimeout(50);
  assert.deepEqual(await spoken(), ["to infinity and beyond"]);
  assert.deepEqual(await strip(), []);
  assert.equal((await ls("log", [])).at(-1).kind, "gestalt");
});
await check("Scripts: stage 2 parts go to the strip to mix", async () => {
  await page.click('#grid .tile[data-w="let\'s go to the park"]');
  assert.deepEqual(await strip(), ["let's go", "to the park"]);
  await page.click("#btnBack");
  assert.deepEqual(await strip(), ["let's go"]);
});

// ---------- Plans: choice boards and routines ----------
await check("Choice board: shows in Plans, picking says it with the lead-in", async () => {
  await page.click(".nav-btn[data-view=plans]");
  await page.click("#planPicker .folder >> text=What snack?");
  assert.equal(await page.isVisible("#choiceBoard"), true);
  assert.equal(await page.isVisible("#steps"), false);
  assert.equal(await page.$$eval(".choice-opt", (b) => b.length), 3);
  await clearSpoken();
  await page.click(".choice-opt >> text=apple");
  await page.waitForTimeout(50);
  assert.deepEqual(await spoken(), ["I want apple"]);
  assert.equal(await page.$eval(".choice-opt[aria-pressed=true]", (b) => b.textContent.trim()), "🍎apple");
  const last = (await ls("log", [])).at(-1);
  assert.deepEqual([last.kind, last.text], ["choice", "I want apple"]);
});
await check("Routines written in the Bridge are plans with Now and Then", async () => {
  await page.click("#planPicker .folder >> text=Morning routine");
  assert.equal(await page.isVisible("#choiceBoard"), false);
  assert.match(await page.textContent("#firstThen"), /Now.*Bathroom.*Then.*Brush teeth/s);
  assert.equal(await page.$$eval("#steps .step", (s) => s.length), 4);
});

// ---------- Body map ----------
await check("Body map: where and how it feels is said as a sentence", async () => {
  await page.click(".nav-btn[data-view=calm]");
  await page.click("#bodyOpen");
  assert.equal(await page.$eval(".body-feel", (b) => b.disabled), true);
  await page.click('[data-part="tummy"]');
  await clearSpoken();
  await page.click('[data-feel="sharp"]');
  await page.waitForTimeout(50);
  assert.deepEqual(await spoken(), ["My tummy feels sharp."]);
  const last = (await ls("log", [])).at(-1);
  assert.deepEqual([last.kind, last.text], ["body", "My tummy feels sharp."]);
  await clearSpoken();
  await page.click(".body-relief >> text=I need ice");
  assert.deepEqual(await spoken(), ["I need ice"]);
});
await check("Body map: every part is a button the keyboard can reach", async () => {
  const parts = await page.$$eval(".body-part", (b) => b.map((x) => [x.tagName, x.tabIndex, x.getBoundingClientRect().width > 20]));
  assert.ok(parts.length >= 12 && parts.every(([tag, ti, big]) => tag === "BUTTON" && ti === 0 && big), JSON.stringify(parts));
});

// ---------- Quick phrases ----------
await check("Quick phrases: Stop and bathroom are added after the old ones", async () => {
  await page.click(".nav-btn[data-view=talk]");
  const q = await page.$$eval("#quick .phrase", (b) => b.map((x) => x.lastChild.textContent.trim()));
  assert.deepEqual(q.slice(-2), ["Stop", "I need the bathroom"]);
  assert.equal(q[0], "I need a break");
});

// ---------- Bridge editors ----------
const bridge = await ctx.newPage();
bridge.on("pageerror", (e) => errors.push("bridge: " + e.message));
await bridge.goto(`${BASE}/bridge.html`);
await bridge.waitForTimeout(900);
await bridge.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
await bridge.evaluate(() => window.__bridge.show("routines"));
await check("Bridge: a choice board with one option is refused with a reason", async () => {
  await bridge.fill("#formChoice [name=title]", "Which toy?");
  await bridge.fill("#formChoice [name=options]", "🚂 train");
  await bridge.click("#formChoice button[type=submit]");
  assert.match(await bridge.textContent("#choiceErr"), /at least 2/);
});
await check("Bridge: a valid choice board and a script are saved for My Voice", async () => {
  await bridge.fill("#formChoice [name=options]", "🚂 train\n🧸 bear");
  await bridge.click("#formChoice button[type=submit]");
  await bridge.fill("#formScript [name=text]", "ready set / go");
  await bridge.selectOption("#scriptStage", "2");
  await bridge.click("#formScript button[type=submit]");
  await bridge.waitForTimeout(200);
  const db = await bridge.evaluate(() => JSON.parse(localStorage.getItem("luminaac:bridge")));
  const ch = db.choices.find((c) => c.title === "Which toy?");
  assert.deepEqual(ch?.options, [{ e: "🚂", w: "train" }, { e: "🧸", w: "bear" }]);
  const sc = db.scripts.find((s) => s.text === "ready set / go");
  assert.equal(sc?.stage, 2);
  assert.match(await bridge.textContent("#scriptList"), /"ready set \/ go" · stage 2, 2 parts/);
});
await check("My Voice picks up the Bridge's new choice board without a reload", async () => {
  await page.bringToFront();
  await page.click(".nav-btn[data-view=plans]");
  await page.waitForTimeout(300);
  const titles = await page.$$eval("#planPicker .folder", (b) => b.map((x) => x.lastChild.textContent.trim()));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:bridge")).choices.map((c) => c.title));
  assert.ok(titles.includes("Which toy?"), JSON.stringify({ titles, stored }));
});

await check("No page errors", async () => assert.deepEqual(errors, []));

await browser.close();
for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
