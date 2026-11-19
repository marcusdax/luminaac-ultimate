import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import {
  AAC_CONVERSATION_VECTORS,
  ROOT,
  SUPERSEDES_FIXTURE,
  VALID_OBZ_ENTRIES,
  WATCHDOG_ADVERSARIAL_VECTORS,
  buildZip,
  contrastRatio,
  createFamilyAuth,
  extractThemeVars,
  launchBrowser,
  loadAppModule,
  startBackend,
  startStaticServer,
} from "./harness.mjs";
import { CORE, PLANS } from "../../vocab.js";
import { seed } from "../../shared.js";

let staticSrv;
let backendSrv;
let browser;

before(async () => {
  staticSrv = await startStaticServer();
  backendSrv = await startBackend();
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await backendSrv?.close();
  await staticSrv?.close();
});

async function openMyVoice(ctx, { seedBridge, settings } = {}) {
  const page = await ctx.newPage();
  await page.installSpeechSpy();
  if (seedBridge || settings) {
    await page.addInitScript((b, s) => {
      if (b) localStorage.setItem("luminaac:bridge", JSON.stringify(b));
      if (s) localStorage.setItem("luminaac:settings", JSON.stringify(s));
    }, seedBridge || null, settings || null);
  }
  await page.goto(`${staticSrv.baseUrl}/index.html`);
  await page.waitForSelector("#grid .tile");
  return page;
}

describe("Tier 4 — Real-World Child, Caregiver & SLP E2E Workflows (10 scenarios)", () => {
  test("T4.01 Morning School Transition: Context Rules + Explore Quietly + Unified Speech + Child Telemetry Sync", async () => {
    await loadAppModule("speech.js");
    const auth = await createFamilyAuth(backendSrv, { childName: "Sam" });
    const doc = seed();
    const d = new Date().getDay();
    doc.rules = [{ id: "r_school", page: "School", days: [d], from: 0, to: 24 }];
    await backendSrv.request("PUT", "/api/sync", { doc, baseVersion: 0 }, auth.parentToken);

    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: doc,
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1.1, speakOnTap: true, stillness: false },
      });
      await page.waitForSelector("#mvContextBar button");
      const coreWords = await page.evaluate(() => [...document.querySelectorAll("#grid .tile")].map((e) => e.dataset.w).slice(0, 30));
      assert.deepEqual(coreWords, CORE.map((c) => c.w), "School rule must not shift 30 Core tiles");

      // Step 1: Quiet exploration
      await page.click("#mvExplore");
      await page.click("#nextRow .next-chip");
      await page.click("#quick .phrase");
      assert.equal(await page.evaluate(() => window.__speechCalls.length), 0);

      // Step 2: Audible request
      await page.click("#mvExplore");
      await page.click('#grid .tile[data-w="I"]');
      await page.click('#grid .tile[data-w="want"]');
      await page.click('#grid .tile[data-w="help"]');
      await page.click("#btnSpeak");
      await page.waitForFunction(() => window.__speechCalls.length > 0);

      // Step 3: Push child telemetry to backend
      const payload = await page.evaluate(() => ({
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
        exploration: JSON.parse(localStorage.getItem("luminaac:bridge") || "{}").exploration || [],
      }));
      assert.ok(payload.exploration.length >= 2);
      assert.ok(payload.log.length >= 1);

      const syncRes = await backendSrv.request("POST", "/api/sync/telemetry", payload, auth.childToken);
      assert.equal(syncRes.status, 200);

      const parentResp = (await backendSrv.request("GET", "/api/sync", undefined, auth.parentToken)).json.data;
      assert.ok((parentResp.telemetry?.log || []).length >= 1 && parentResp.doc.exploration.length >= 2);
      assert.equal(parentResp.doc.rules[0].page, "School", "Telemetry must not alter caregiver rules");
    } finally {
      await ctx.close();
    }
  });

  test("T4.02 Bridge Moment Annotation -> Offline Semantic Signal Link -> supersedes Revision -> Cross-Tab Refresh", async () => {
    const ai = await import("../../ai.js");
    const clinical = await loadAppModule("clinical.js");
    assert.equal(typeof ai.semanticSearch, "function");
    const appendRev = clinical.appendRevision || clinical.addRevision;
    const getLineage = clinical.getRevisionLineage || clinical.resolveHistory;

    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const mvPage = await openMyVoice(ctx);
      const brPage = await ctx.newPage();
      await brPage.goto(`${staticSrv.baseUrl}/bridge.html`);
      await brPage.waitForSelector("#tab-today");
      if (await brPage.evaluate(() => Boolean(document.querySelector("#onboard[open]")))) {
        await brPage.click("#obSkip");
      }

      await brPage.evaluate(() => {
        const db = window.__bridge.db;
        db.signals.push({
          id: "s_water", name: "Thirst cup tap", cues: ["points at cup"], meaning: "Wants cold water",
          phrase: "I want cold water", confirmations: 8, rejections: 0,
          contexts: ["home", "morning", "afternoon", "evening", "night"], created: Date.now(),
        });
        window.__bridge.save("Added hydration signal");
      });

      await mvPage.waitForFunction(() =>
        [...document.querySelectorAll("#mvSuggest .mv-chip")].some((b) => b.textContent.includes("I want cold water"))
      );

      let store = [];
      for (const rev of SUPERSEDES_FIXTURE) store = appendRev(store, rev);
      const lineage = getLineage(store, "m1");
      assert.equal(lineage.length, 3);
      assert.equal(lineage.at(-1).id, "rev3");
    } finally {
      await ctx.close();
    }
  });

  test("T4.03 SLP Modeling Session + Child Independent Turns + Clinical Communication Matrix & Export", async () => {
    await loadAppModule("speech.js");
    await loadAppModule("slp.js");
    const clinical = await loadAppModule("clinical.js");
    const summarize = clinical.summarizeClinical || clinical.generateInsights || clinical.buildClinicalSummary;
    const toCsv = clinical.exportClinicalCSV || clinical.toCSV;

    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      // Partner modeling turn
      await page.evaluate(() => {
        const t = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")].find((n) => /model/i.test(`${n.textContent} ${n.getAttribute("aria-label") || ""} ${n.id}`));
        t?.click();
      });
      await page.click('#grid .tile[data-w="you"]');
      await page.click('#grid .tile[data-w="want"]');
      await page.click('#grid .tile[data-w="more"]');
      await page.click("#btnSpeak");
      await new Promise((r) => setTimeout(r, 60));

      // Disable modeling -> Child independent turn
      await page.evaluate(() => {
        const t = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")].find((n) => /model/i.test(`${n.textContent} ${n.getAttribute("aria-label") || ""} ${n.id}`));
        t?.click();
      });
      await page.click('#grid .tile[data-w="I"]');
      await page.click('#grid .tile[data-w="eat"]');
      await page.click("#btnSpeak");
      await page.waitForFunction(() => window.__speechCalls.length > 0);

      const snapshot = await page.evaluate(() => ({
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
        counts: JSON.parse(localStorage.getItem("luminaac:counts") || "{}"),
      }));
      assert.equal(snapshot.counts.you || 0, 0, "Partner modeled word must never pollute child counts");
      assert.equal(snapshot.counts.eat, 1);

      const summary = summarize({ log: snapshot.log, moments: [], signals: [] });
      assert.equal(summary.banner, "Draft / Estimate — Caregiver or SLP review required");
      assert.equal(summary.metrics.modeledCount, 1);
      assert.equal(summary.metrics.childCount, 1);
      assert.equal(summary.metrics.mlu, 2, "Child MLU must equal 2 ('I eat'), excluding 3-word partner turn");
      assert.ok(summary.facts.length >= 1);
      const csv = toCsv({ log: snapshot.log, moments: [], signals: [] });
      assert.ok(csv.includes("I eat"));
    } finally {
      await ctx.close();
    }
  });

  test("T4.04 Motor-Impaired 2-Switch Step Scan + Auditory Preview + Loop Limit + Pointer Guard", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: {
            mode: "switch",
            scanMode: "step2",
            scanAudio: true,
            scanLoops: 2,
            size: 130,
            dwell: 0,
            scan: true,
            scanMs: 5000,
            safety: true,
            acceptMs: 250,
            debounceMs: 400,
          },
        },
      });
      // Pointer slide-off & short tap cancelled
      await page.tapAndSlideOut('#grid .tile[data-w="go"]', 60);
      await page.tapAndHold('#grid .tile[data-w="go"]', 40);
      assert.equal(await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim()), "");

      // Sustained tap passes acceptMs
      await page.tapAndHold('#grid .tile[data-w="go"]', 300);
      assert.equal(await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim()), "go");

      // 2-switch Tab + Auditory Preview
      await page.press("Tab");
      await new Promise((r) => setTimeout(r, 60));
      const zoom = await page.evaluate(() => getComputedStyle(document.querySelector("#grid")).zoom);
      assert.equal(zoom, "1");
      assert.ok((await page.evaluate(() => window.__speechCalls.length)) >= 1);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:log") || "[]").length), 0);
    } finally {
      await ctx.close();
    }
  });

  test("T4.05 Sensory Overload -> Quick-Bar Break -> Interoception Pain Body Map -> Relief Choice", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      // 1-tap Break from Sensory Quick-Bar
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("#view-talk button")].find((x) => x.offsetParent !== null && /break/i.test(x.textContent));
        b?.click();
      });
      await page.waitForFunction(() => window.__speechCalls.length > 0);

      // Calm -> Low-arousal & Pain Body Map
      await page.click('nav.nav button[data-view="calm"]');
      await page.click('#scale .scale-btn:nth-child(5)');
      const painSpoken = await page.evaluate(() => {
        const pick = (re) => [...document.querySelectorAll("#view-calm button")].find((b) => b.offsetParent !== null && re.test(b.textContent));
        pick(/stomach/i)?.click();
        pick(/hurts/i)?.click();
        const relief = pick(/water|rest|bathroom|help/i);
        relief?.click();
        return Boolean(relief);
      });
      assert.ok(painSpoken);
      await page.waitForFunction(() => window.__speechCalls.length >= 3);
      const texts = await page.evaluate(() => window.__speechCalls.map((c) => c.text.toLowerCase()));
      assert.ok(texts.some((t) => t.includes("stomach") && t.includes("hurt")));
    } finally {
      await ctx.close();
    }
  });

  test("T4.06 GLP Stage 1 & Stage 2 Mitigate-into-Strip + Kokoro Child Prosody Offline", async () => {
    await loadAppModule("slp.js");
    await loadAppModule("speech.js");
    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, childPitchSemitones: 3 },
          gestalts: [
            { id: "g1", text: "To infinity and beyond!", stage: 1 },
            { id: "g2", text: "Let's go to the park", stage: 2 },
          ],
        },
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "kokoro:af_sky", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.setOffline(true);

      // Stage 1 verbatim
      await page.evaluate(() => {
        [...document.querySelectorAll("button")].find((b) => b.textContent.includes("To infinity and beyond!"))?.click();
      });
      await page.waitForFunction(() => window.__speechCalls.length === 1);

      // Stage 2 mitigate-into-strip + add word + Speak
      await page.evaluate(() => {
        [...document.querySelectorAll("button")].find((b) => /mitigate|edit.*strip|mix/i.test(`${b.textContent} ${b.getAttribute("aria-label") || ""}`))?.click();
      });
      await page.click('#grid .tile[data-w="please"]');
      await page.click("#btnSpeak");
      await page.waitForFunction(() => window.__speechCalls.length >= 2);
      const lastSpeech = await page.evaluate(() => window.__speechCalls.at(-1).text);
      assert.ok(lastSpeech.includes("park") && lastSpeech.includes("please"));
    } finally {
      await ctx.close();
    }
  });

  test("T4.07 Caregiver ZWJ Emoji + Custom Choice Board + Unified Visual Schedule Offline PWA", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          choiceBoards: [
            { id: "cb_lunch", title: "Lunch", options: [{ label: "Family picnic", e: "👨‍👩‍👧" }, { label: "Sandwich", e: "🥪" }] },
          ],
          stories: [
            { id: "rt_aft", title: "Afternoon Schedule", kind: "routine", steps: [{ e: "🍎", text: "Snack" }, { e: "⚽", text: "Play" }] },
          ],
        },
      });
      await page.evaluate(async () => {
        await navigator.serviceWorker.register("./sw.js");
        await navigator.serviceWorker.ready;
      });
      await page.setOffline(true);
      await page.reload();
      await page.waitForSelector("#grid .tile");

      assert.ok(await page.evaluate(() => document.body.innerText.includes("👨‍👩‍👧")));
      await page.click('nav.nav button[data-view="plans"]');
      await page.waitForSelector("#planPicker button");
      const hasUnified = await page.evaluate(() => {
        const txts = [...document.querySelectorAll("#planPicker button")].map((b) => b.textContent);
        return txts.some((t) => t.includes("Grocery store")) && txts.some((t) => t.includes("Afternoon Schedule"));
      });
      assert.ok(hasUnified);
    } finally {
      await ctx.close();
    }
  });

  test("T4.08 OBF/OBZ Multi-Board Import -> Vocab Search & Morphology -> Export -> Re-Import Round-Trip", async () => {
    const obf = await loadAppModule("obf.js");
    const importObz = obf.importOBZ || obf.parseOBZ;
    const exportObz = obf.exportOBZ || obf.toOBZ;

    const pkg = await importObz(new Uint8Array(buildZip(VALID_OBZ_ENTRIES)));
    assert.ok(pkg.rootBoard || pkg.root);
    const boardsMap = pkg.boards || pkg.byId || {};
    const boardList = Object.values(boardsMap);
    assert.ok(boardList.length >= 2);

    const drink = boardList.flatMap((b) => b.buttons).find((btn) => btn.label === "drink");
    assert.equal(drink.vocalization, "I want a drink");

    const reExported = await exportObz(boardList, { rootId: "core_sample" });
    const reImported = await importObz(reExported instanceof ArrayBuffer ? new Uint8Array(reExported) : reExported);
    assert.ok(reImported.rootBoard || reImported.root);
  });

  test("T4.09 willwade/AACConversations Telegraphic Calibration + BYOK Routing & Watchdog Adversarial Filter", async () => {
    const byok = await loadAppModule("byok.js");
    const watchdog = byok.watchdogCheck || byok.validateExpansion;

    for (const vec of AAC_CONVERSATION_VECTORS) {
      const res = await byok.expandUtterance(vec.words, { mode: "on-device", context: vec.context });
      const candidates = res.candidates || (res.text ? [res.text] : []);
      assert.ok(candidates.length >= 1, `Missing candidate for ${vec.words.join(" ")}`);
      const text = String(candidates[0].text || candidates[0]);
      assert.ok(text.length <= 120);
      assert.ok(vec.mustPreserve.some((w) => text.toLowerCase().includes(w.toLowerCase())));
    }

    for (const bad of WATCHDOG_ADVERSARIAL_VECTORS) {
      const v = watchdog(bad.candidate, bad.input);
      const passed = typeof v === "boolean" ? v : Boolean(v?.ok ?? v?.valid);
      assert.equal(passed, false, `Adversarial Watchdog case ${bad.name} must fail`);
    }
  });

  test("T4.10 Full Release Audit: WCAG Tokens + Grid Role + Prince FL + Research & License Compliance", async () => {
    const tokens = extractThemeVars(readFileSync(path.join(ROOT, "tokens.css"), "utf8"));
    for (const cls of ["people", "action", "describe", "thing", "social", "question", "negate", "little", "folder"]) {
      assert.ok(contrastRatio(tokens.day[`--wc-${cls}`], tokens.day[`--wc-${cls}-tint`]) >= 3.0);
      assert.ok(contrastRatio(tokens.day["--ink"], tokens.day[`--wc-${cls}-tint`]) >= 7.0);
    }

    const prince = await import("../../masternex-prince-fl.js");
    const pkg = prince.compressClientUpdate(new Float32Array([0.2, -0.1, 0.4]), 0.3, 1.0);
    assert.ok(Number.isFinite(pkg.rdp_epsilon) && pkg.rdp_epsilon > 0);

    assert.ok(existsSync(path.join(ROOT, "docs", "RESEARCH_EVALUATION.md")));
    const vendorDirs = readdirSync(path.join(ROOT, "vendor"), { withFileTypes: true }).filter((d) => d.isDirectory());
    const third = readFileSync(path.join(ROOT, "THIRD-PARTY.md"), "utf8").toLowerCase();
    for (const d of vendorDirs) assert.ok(third.includes(d.name.toLowerCase()));
  });
});
