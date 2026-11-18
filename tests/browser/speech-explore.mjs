// End-to-end check for M1 features 1 and 2:
//  1. Suggestions, "I need help", Stories, Practice and My things speak through the
//     talker's one voice (configured speed) and child-chosen messages are logged.
//  2. "Explore quietly" never speaks or builds the strip from board tiles, next-word
//     chips, quick phrases or plan "say" chips, and logs them as exploration instead.
//     Safety buttons still speak while exploring.
// Run: python3 -m http.server 8765 (repo root), then
//   NODE_PATH=$(npm root -g) node tests/browser/speech-explore.mjs
import { createRequire } from "node:module";
// require() honours NODE_PATH, so a globally installed Playwright works too.
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";

const BASE = process.argv[2] || "http://localhost:8765";
// Record utterances instead of speaking; every one goes through speechSynthesis.speak.
const SPY = `window.__spoken = [];
const _speak = speechSynthesis.speak.bind(speechSynthesis);
speechSynthesis.speak = (u) => { window.__spoken.push({ text: u.text, rate: u.rate }); setTimeout(() => u.onend?.(), 0); };
localStorage.setItem("luminaac:settings", JSON.stringify({ rate: 1.2 }));`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(SPY);
await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));

const spoken = () => page.evaluate(() => window.__spoken.splice(0));
const log = () => page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:log") || "[]"));
const explored = () => page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:bridge") || "{}").exploration || []);
const strip = () => page.evaluate(() => document.getElementById("stripWords").textContent.trim());
const results = [];
// SpeechSynthesisUtterance.rate is a 32-bit float, so compare loosely.
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} is not ${b}`);
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name, e.message]); } };

// ---- Feature 1: one voice ----
await spoken();
await page.locator(".mv-chip").first().click();
let s = await spoken(); let l = await log();
check("Suggestion speaks with the configured speed", () => { assert.equal(s.length, 1); near(s[0].rate, 1.2); });
check("Suggestion is logged as a suggestion", () => assert.equal(l.at(-1).kind, "suggestion"));

await page.locator(".mv-sos[data-kind=help]").click();
s = await spoken(); l = await log();
check("I need help speaks with the configured speed", () => { assert.equal(s[0]?.text, "I need help"); near(s[0].rate, 1.2); });
check("I need help is logged as sos", () => assert.equal(l.at(-1).kind, "sos"));

await page.locator("summary", { hasText: "My things" }).click();
await page.locator("#mvPersonality .mv-ptile").first().click();
await page.waitForTimeout(200);
s = await spoken(); l = await log();
check("My things speaks with the configured speed", () => { assert.ok(s.length >= 1); near(s.at(-1).rate, 1.2); });
check("My things is logged as mything", () => assert.equal(l.at(-1).kind, "mything"));

const before = (await log()).length;
await page.locator(".nav-btn[data-view=play]").click();
await page.locator("#mvStories .mv-ptile").first().click();
await page.waitForTimeout(150);
s = await spoken();
check("Story step speaks with the configured speed", () => { assert.ok(s.length >= 1); near(s[0].rate, 1.2); });
const afterStory = (await log()).length;
check("Story narration adds nothing to the message log", () => assert.equal(afterStory, before));
await page.evaluate(() => document.getElementById("mvPlayer").close());

const practice = page.locator("#mvStories .mv-ptile", { hasText: "Practice" }).first();
if (await practice.count()) {
  await practice.click(); await page.waitForTimeout(150);
  s = await spoken();
  check("Practice model is slower than the configured speed (0.7 of 0.9)", () => near(s[0].rate, 1.2 * (0.7 / 0.9)));
  await page.evaluate(() => document.getElementById("mvPlayer").close());
}
await page.locator(".nav-btn[data-view=talk]").click();

// ---- Feature 2: Explore quietly ----
await page.locator("#mvExplore").check();
await spoken();
const exp0 = (await explored()).length, log0 = (await log()).length;
await page.locator(".grid .tile").first().click();
await page.locator("#nextRow .next-chip").first().click();
await page.locator("#quick .phrase").first().click();
s = await spoken();
check("Exploring: tile, next chip and quick phrase stay silent", () => assert.deepEqual(s, []));
const stripText = await strip();
check("Exploring: nothing is added to the strip", () => assert.equal(stripText, ""));
const exp1 = await explored();
check("Exploring: all three taps are logged as exploration", () => assert.equal(exp1.length - exp0, 3));
const log1 = (await log()).length;
check("Exploring: no child messages are logged", () => assert.equal(log1, log0));

await page.locator(".nav-btn[data-view=plans]").click();
await page.locator(".step-says .say-chip").first().click();
s = await spoken();
check("Exploring: plan say-chips stay silent", () => assert.deepEqual(s, []));
await page.locator(".nav-btn[data-view=talk]").click();

await page.locator(".mv-sos[data-kind=help]").click();
s = await spoken();
check("Exploring: I need help still speaks", () => assert.equal(s[0]?.text, "I need help"));

await page.locator("#mvExplore").uncheck();
await page.locator("#quick .phrase").first().click();
s = await spoken();
check("Explore off: quick phrase speaks again", () => assert.equal(s.length, 1));

check("No page errors", () => assert.deepEqual(errors, []));
await browser.close();
for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
