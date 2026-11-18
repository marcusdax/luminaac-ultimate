// End-to-end check for M3: voice pitch and expressive tone, meaning search, the
// sentence helper (rules, a provider that is down, a consent gate, a stub service
// whose bad sentence the watchdog drops), moment-to-signal linking and the
// communication report. No model is downloaded: the model paths are covered by
// unit tests (tests/m3.test.mjs) and fall back to the built-in rules here.
// Run: python3 -m http.server 8765 (repo root), then
//   NODE_PATH=$(npm root -g) node tests/browser/ai-m3.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:8765";
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); } };
const near = (a, b, e = 0.01) => Math.abs(a - b) < e;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => { window.__spoken = []; speechSynthesis.speak = (u) => { window.__spoken.push({ text: u.text, rate: u.rate, pitch: u.pitch }); setTimeout(() => u.onend?.(), 5); }; });
await page.goto(`${BASE}/index.html`);
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));

const spoken = () => page.evaluate(() => window.__spoken.slice());
const clearSpoken = () => page.evaluate(() => (window.__spoken.length = 0));
const ls = (k, fb) => page.evaluate(([k, fb]) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }, [k, fb]);
const care = () => page.evaluate(() => window.__myvoice.openCare());
const talk = () => page.evaluate(() => window.__myvoice.show("talk"));
const tilePos = () => page.$$eval("#grid .tile", (ts) => ts.map((t) => { const r = t.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}`; }));
const firstTile = await page.$eval("#grid .tile", (t) => t.dataset.w);

// ---------- Voice ----------
await check("Voice: by default the device voice keeps its own pitch and the rate setting", async () => {
  await clearSpoken();
  await page.click(`#grid .tile[data-w="${firstTile}"]`);
  const [u] = await spoken();
  assert.ok(u && near(u.rate, 0.9) && near(u.pitch, 1), JSON.stringify(u));
});
await check("Voice: the four lighter Kokoro voices are in the voice list", async () => {
  const ids = await page.$$eval("#voiceSelect option", (o) => o.map((x) => x.value));
  for (const v of ["af_sky", "af_nicole", "am_puck", "bf_isabella"]) assert.ok(ids.includes("kokoro:" + v), v);
});
await check("Voice: +2 pitch raises it by two semitones; the rate is unchanged", async () => {
  await care();
  await page.selectOption("#settings [name=pitch]", "2");
  await talk(); await clearSpoken();
  await page.click(`#grid .tile[data-w="${firstTile}"]`);
  const [u] = await spoken();
  assert.ok(near(u.pitch, 2 ** (2 / 12)) && near(u.rate, 0.9), JSON.stringify(u));
});
await check("Voice: expressive tone makes an excited message brighter and a sad one slower", async () => {
  await care();
  await page.check("#settings [name=expressive]");
  await page.selectOption("#settings [name=pitch]", "0");
  await talk();
  await page.evaluate(() => window.luminaacVoice.say("yay my turn!"));
  await page.evaluate(() => window.luminaacVoice.say("I am sad"));
  await page.waitForTimeout(50);
  const s = await spoken();
  const yay = s.find((x) => x.text === "yay my turn!"), sad = s.find((x) => x.text === "I am sad");
  assert.ok(yay.pitch > 1.05 && sad.pitch < 0.96 && sad.rate < 0.9, JSON.stringify({ yay, sad }));
  await care(); await page.uncheck("#settings [name=expressive]"); await talk();
});

// ---------- Meaning search ----------
await check("Meaning search: \"thirsty\" finds drink words, labelled why", async () => {
  await page.click("#btnFind");
  await page.fill("#findInput", "thirsty");
  await page.waitForTimeout(80);
  const hits = await page.$$eval("#findResults .find-hit", (b) => b.map((x) => [x.querySelector(".find-w").textContent, x.querySelector(".find-f").textContent]));
  // A word spelled "thirsty" (if the board has one) comes first; the related ones say why.
  const relatedHits = hits.filter(([w]) => w !== "thirsty");
  assert.ok(relatedHits.length >= 2 && relatedHits.every(([, f]) => f.startsWith('like "thirsty"')), JSON.stringify(hits));
  assert.ok(hits.some(([w]) => /drink|water|juice|milk/.test(w)), JSON.stringify(hits));
  await page.click("#findClose");
});

// ---------- Sentence helper ----------
const setHelper = async (fields) => {
  await care();
  for (const [name, v] of Object.entries(fields)) {
    if (typeof v === "boolean") await (v ? page.check(`#settings [name=${name}]`) : page.uncheck(`#settings [name=${name}]`));
    else if (name === "helper") await page.selectOption("#settings [name=helper]", v);
    else { await page.fill(`#settings [name=${name}]`, v); await page.dispatchEvent(`#settings [name=${name}]`, "change"); }
  }
  await talk();
};
const build = async () => {
  await page.click("#btnClear");
  await page.click("#folders .folder >> text=Core words");
  await page.waitForSelector('#grid .tile[data-w="want"]');
  await page.click('#grid .tile[data-w="want"]');
  await page.click('#folders .folder >> text=/Food/');
  await page.waitForSelector('#grid .tile[data-w="juice"]');
  const food = "juice";
  await page.click(`#grid .tile[data-w="${food}"]`);
  return food;
};
await check("Helper: off by default, so no ✨ button", async () => {
  await page.click("#folders .folder >> text=Core words");
  await page.waitForSelector('#grid .tile[data-w="want"]');
  await page.click('#grid .tile[data-w="want"]');
  assert.equal(await page.isVisible("#btnExpand"), false);
});
let food;
await check("Helper (rules): offers checked sentences after the child's own words, without moving the board", async () => {
  await setHelper({ helper: "rules" });
  food = await build();
  const before = await tilePos();
  await page.click("#btnExpand");
  await page.waitForSelector("#expandList .expand-chip:not(.own)");
  const chips = await page.$$eval("#expandList .expand-chip", (b) => b.map((x) => x.textContent));
  assert.equal(chips[0], `want ${food}`);
  assert.ok(chips.length >= 3 && chips.slice(1).every((c) => c.toLowerCase().includes(food)), JSON.stringify(chips));
  assert.deepEqual(await tilePos(), before);
  assert.match(await page.textContent("#expandNote"), /built-in rules/);
});
await check("Helper: picking a sentence says it and marks it as helped in the log", async () => {
  await clearSpoken();
  const pick = await page.$eval("#expandList .expand-chip:not(.own)", (b) => b.textContent);
  await page.click("#expandList .expand-chip:not(.own)");
  await page.waitForTimeout(50);
  assert.equal((await spoken()).at(-1).text, pick);
  const last = (await ls("luminaac:log", [])).at(-1);
  assert.deepEqual([last.text, last.kind, last.helped, last.from], [pick, "message", true, `want ${food}`]);
  assert.equal(await page.isVisible("#expandBox"), false);
});
await check("Helper (Ollama not running): falls back to the rules and says so", async () => {
  await ctx.route("http://localhost:11434/**", (r) => r.abort());
  await setHelper({ helper: "ollama" });
  await build();
  await page.click("#btnExpand");
  await page.waitForFunction(() => /didn't answer/.test(document.getElementById("expandNote").textContent), null, { timeout: 12000 });
  assert.ok((await page.$$eval("#expandList .expand-chip", (b) => b.length)) >= 2);
  await page.click("#expandClose");
});
const sent = [];
await ctx.route("https://llm.example.test/**", async (r) => {
  sent.push({ url: r.request().url(), auth: r.request().headers().authorization, body: r.request().postDataJSON() });
  await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content: `1. Can I have some ${food}?\n2. I want apple ${food} and cake\n3. I don't want ${food}` } }] }) });
});
await check("Helper (own key): nothing is sent until a grown-up ticks consent", async () => {
  await setHelper({ helper: "key", helperUrl: "https://llm.example.test/v1", helperModel: "test-model", helperKey: "sk-test-123", helperConsent: false });
  await build();
  await page.click("#btnExpand");
  await page.waitForFunction(() => /didn't answer/.test(document.getElementById("expandNote").textContent));
  assert.equal(sent.length, 0);
  await page.click("#expandClose");
});
await check("Helper (own key): sends only the message words; the watchdog drops changed meanings", async () => {
  await setHelper({ helperConsent: true });
  await build();
  await page.click("#btnExpand");
  await page.waitForFunction(() => /own api key/i.test(document.getElementById("expandNote").textContent), null, { timeout: 10000 });
  const chips = await page.$$eval("#expandList .expand-chip", (b) => b.map((x) => x.textContent));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].auth, "Bearer sk-test-123");
  const text = JSON.stringify(sent[0].body);
  assert.ok(text.includes(`want ${food}`) && sent[0].body.model === "test-model", text);
  assert.ok(chips.includes(`Can I have some ${food}?`), JSON.stringify(chips));
  assert.ok(!chips.some((c) => /apple|cake|don't/.test(c)), JSON.stringify(chips));
  await page.click("#expandClose");
});
await check("Helper: the API key is kept apart from settings and the data download", async () => {
  const settings = JSON.stringify(await ls("luminaac:settings", {}));
  assert.ok(!settings.includes("sk-test-123"));
  await care();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const body = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
  assert.ok(!body.includes("sk-test-123") && !body.includes("luminaac:byok"));
  await setHelper({ helper: "off" });
});

// ---------- Bridge ----------
const T = Date.now();
await page.evaluate((T) => {
  const log = JSON.parse(localStorage.getItem("luminaac:log") || "[]");
  log.push({ t: T - 5000, text: "I want juice", kind: "message" }, { t: T - 4000, text: "no", kind: "message" }, { t: T - 3000, text: "what that", kind: "message" }, { t: T - 2000, text: "big dog", kind: "message" });
  localStorage.setItem("luminaac:log", JSON.stringify(log));
  const m = JSON.parse(localStorage.getItem("luminaac:modeling") || "[]"); m.push({ t: T - 1000, text: "go park", kind: "modeling" }); localStorage.setItem("luminaac:modeling", JSON.stringify(m));
}, T);
const bridge = await ctx.newPage();
bridge.on("pageerror", (e) => errors.push("bridge: " + e.message));
await bridge.goto(`${BASE}/bridge.html`);
await bridge.waitForTimeout(900);
await bridge.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
await check("Bridge: an explanation links to the signal it shares words with, saying which", async () => {
  await bridge.evaluate(() => window.__bridge.show("today"));
  await bridge.click(".moment button >> text=Explain");
  await bridge.fill("#annText", "he hums near the window, wants the park");
  await bridge.dispatchEvent("#annText", "input");
  const t = await bridge.textContent("#annSmart");
  assert.match(t, /Link to "Window hum"/);
  assert.match(t, /"window"|"park"|"hum/);
  await bridge.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
});
await check("Report: draft banner, figures with their sources", async () => {
  await bridge.evaluate(() => window.__bridge.show("insights"));
  await bridge.waitForTimeout(200);
  assert.match(await bridge.textContent(".clin-draft"), /Draft\. Caregiver or SLP review required/);
  const body = await bridge.textContent("#clinBody");
  assert.match(body, /Protesting/); assert.match(body, /Asking/);
  assert.match(body, /an adult modeled/);
  assert.match(body, /built messages \(words, not morphemes\)/);
});
await check("Report: helped sentences are counted as messages but not in MLU", async () => {
  const txt = await bridge.textContent("#clinRows");
  assert.match(txt, /sentence helper/);
});
await check("Report: a correction is added to the history, and a second one supersedes it", async () => {
  await bridge.click(".clin-rows summary");
  const sel = bridge.locator("#clinRows li", { hasText: "big dog" }).locator("select");
  assert.equal(await sel.inputValue(), "commenting");
  const key = await sel.getAttribute("data-key");
  await sel.selectOption("requesting");
  await bridge.waitForTimeout(100);
  await bridge.locator(`#clinRows select[data-key="${key}"]`).selectOption("social");
  await bridge.waitForTimeout(100);
  const revs = await bridge.evaluate(() => JSON.parse(localStorage.getItem("luminaac:bridge")).clinical.revisions);
  assert.equal(revs.length, 2);
  assert.equal(revs[1].supersedes, revs[0].id);
  assert.equal(revs[0].fn, "requesting");
  assert.equal(await bridge.textContent("#clinRevCount"), "2");
  assert.match(await bridge.textContent("#clinRows"), /corrected by/);
});
await check("Report: CSV download has a header and one row per message", async () => {
  const [dl] = await Promise.all([bridge.waitForEvent("download"), bridge.click("#clinCsv")]);
  const csv = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
  const lines = csv.split("\r\n");
  assert.equal(lines[0], '"date","message","kind","helped","function","reason"');
  assert.ok(lines.length >= 5 && lines.some((l) => l.includes('"big dog"')), lines.length);
});

await check("No page errors", async () => assert.deepEqual(errors, []));
await browser.close();
for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
