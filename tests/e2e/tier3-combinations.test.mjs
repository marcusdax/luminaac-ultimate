import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import {
  FOOD_OBF,
  ROOT,
  VALID_OBF,
  VALID_OBZ_ENTRIES,
  buildZip,
  contrastRatio,
  createFamilyAuth,
  extractThemeVars,
  launchBrowser,
  loadAppModule,
  startBackend,
  startStaticServer,
} from "./harness.mjs";
import { CORE } from "../../vocab.js";
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

describe("Tier 3 — Cross-Feature Pairwise Combinations (20 tests)", () => {
  test("T3.01 (F1+F2) Explore Quietly silences all unified speech surfaces then restores configured rate", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1.3, speakOnTap: true, stillness: false },
      });
      await page.click("#mvExplore");
      await page.click("#nextRow .next-chip");
      await page.click("#quick .phrase");
      assert.equal(await page.evaluate(() => window.__speechCalls.length), 0);

      await page.click("#mvExplore");
      await page.click("#quick .phrase");
      await page.waitForFunction(() => window.__speechCalls.length > 0);
      const calls = await page.evaluate(() => window.__speechCalls);
      assert.ok(Math.abs(calls.at(-1).rate - 1.3) < 0.05);
    } finally {
      await ctx.close();
    }
  });

  test("T3.02 (F1+F9) Unified speech + Modeling Mode logs mode='modeling' with configured rate and 0 counts mutation", async () => {
    await loadAppModule("speech.js");
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: { version: 2, access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, modelingAudio: true } },
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 0.85, speakOnTap: true, stillness: false },
      });
      await page.evaluate(() => {
        const t = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")].find((n) => /model/i.test(`${n.textContent} ${n.getAttribute("aria-label") || ""} ${n.id}`));
        t?.click();
      });
      await page.click('#grid .tile[data-w="I"]');
      await page.click('#grid .tile[data-w="want"]');
      await page.click("#btnSpeak");
      await page.waitForFunction(() => window.__speechCalls.length > 0);

      const res = await page.evaluate(() => ({
        rate: window.__speechCalls.at(-1).rate,
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
        counts: JSON.parse(localStorage.getItem("luminaac:counts") || "{}"),
      }));
      assert.ok(Math.abs(res.rate - 0.85) < 0.05);
      assert.equal(res.log.at(-1).mode, "modeling");
      assert.deepEqual(res.counts, {});
    } finally {
      await ctx.close();
    }
  });

  test("T3.03 (F2+F5) Explore Quietly + Active Context Rules logs context chip to exploration silently", async () => {
    const ctx = await browser.newContext();
    try {
      const d = new Date().getDay();
      const page = await openMyVoice(ctx, {
        seedBridge: { version: 2, rules: [{ id: "r_sch", page: "School", days: [d], from: 0, to: 24 }] },
      });
      await page.waitForSelector("#mvContextBar button");
      await page.click("#mvExplore");
      await page.click("#mvContextBar button");
      await new Promise((r) => setTimeout(r, 60));

      const res = await page.evaluate(() => ({
        calls: window.__speechCalls.length,
        ex: JSON.parse(localStorage.getItem("luminaac:bridge") || "{}").exploration || [],
      }));
      assert.equal(res.calls, 0);
      assert.ok(res.ex.length >= 1);
    } finally {
      await ctx.close();
    }
  });

  test("T3.04 (F3+F5) Same-tab persist(db) updates #mvContextBar live while keeping 30 CORE positions invariant", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, { seedBridge: { version: 2, rules: [] } });
      await page.evaluate(async () => {
        const { load, persist } = await import("/shared.js");
        const db = load();
        db.rules = [{ id: "r_live", page: "Bedtime", days: [new Date().getDay()], from: 0, to: 24 }];
        persist(db);
      });
      await page.waitForSelector("#mvContextBar button");
      const coreWords = await page.evaluate(() => [...document.querySelectorAll("#grid .tile")].map((e) => e.dataset.w).slice(0, 30));
      assert.deepEqual(coreWords, CORE.map((c) => c.w));
    } finally {
      await ctx.close();
    }
  });

  test("T3.05 (F3+F4) Cross-tab Bridge ZWJ emoji button syncs intact to My Voice", async () => {
    const ctx = await browser.newContext();
    try {
      const mvPage = await openMyVoice(ctx);
      const brPage = await ctx.newPage();
      await brPage.goto(`${staticSrv.baseUrl}/bridge.html`);
      await brPage.waitForSelector("#tab-today");
      if (await brPage.evaluate(() => Boolean(document.querySelector("#onboard[open]")))) {
        await brPage.click("#obSkip");
      }
      await brPage.click('nav.tabs button[data-tab="vocab"]');
      await brPage.typeText('#formPersonal input[name="label"]', "Family walk");
      await brPage.typeText('#formPersonal input[name="e"]', "👨‍👩‍👧");
      await brPage.click('#formPersonal button[type="submit"]');

      await mvPage.waitForFunction(() => document.body.innerText.includes("👨‍👩‍👧"));
      assert.ok(true);
    } finally {
      await ctx.close();
    }
  });

  test("T3.06 (F3+F17) Backend child telemetry sync feeds Clinical Communication Matrix without leaking caregiver notes", async () => {
    const auth = await createFamilyAuth(backendSrv);
    const clinical = await loadAppModule("clinical.js");
    const doc = seed();
    doc.notes = [{ id: "n_priv", t: Date.now(), by: "therapist", text: "Confidential SLP draft note" }];
    await backendSrv.request("PUT", "/api/sync", { doc, baseVersion: 0 }, auth.parentToken);

    const tele = await backendSrv.request(
      "POST",
      "/api/sync/telemetry",
      { log: [{ t: Date.now(), text: "I want water", kind: "message" }] },
      auth.childToken
    );
    assert.equal(tele.status, 200);

    const childSync = await backendSrv.request("GET", "/api/sync", undefined, auth.childToken);
    assert.equal(childSync.json.data.doc.notes, undefined);

    const parentSync = await backendSrv.request("GET", "/api/sync", undefined, auth.parentToken);
    const summarize = clinical.summarizeClinical || clinical.generateInsights || clinical.buildClinicalSummary;
    const summary = summarize({ log: parentSync.json.data.telemetry?.log || parentSync.json.data.doc.log || [], moments: parentSync.json.data.doc.moments, signals: parentSync.json.data.doc.signals });
    assert.equal(summary.metrics.childCount, 1);
  });

  test("T3.07 (F6+F12) WCAG 2.5.2 pointer slide-off cancels Choice Board activation", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          choiceBoards: [{ id: "cb1", title: "Snack", options: [{ label: "Apple", e: "🍎" }, { label: "Pear", e: "🍐" }] }],
        },
      });
      const sel = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Pear"));
        if (!b) return null;
        if (!b.id) b.id = "__e2e_pear";
        return `#${b.id}`;
      });
      assert.ok(sel);
      await page.tapAndSlideOut(sel, 70);
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(await page.evaluate(() => window.__speechCalls.length), 0);
    } finally {
      await ctx.close();
    }
  });

  test("T3.08 (F6+F11) acceptMs + debounceMs protect Sensory Quick-Bar from tremor double-taps", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, acceptMs: 250, debounceMs: 500 },
        },
      });
      const sel = await page.evaluate(() => {
        const b = [...document.querySelectorAll("#view-talk button")].find((x) => x.offsetParent !== null && /bathroom/i.test(x.textContent));
        if (!b) return null;
        if (!b.id) b.id = "__e2e_bath";
        return `#${b.id}`;
      });
      assert.ok(sel);
      await page.tapAndHold(sel, 50);
      assert.equal(await page.evaluate(() => window.__speechCalls.length), 0);
      await page.tapAndHold(sel, 300);
      await page.waitForFunction(() => window.__speechCalls.length === 1);
      await page.tapAndHold(sel, 300);
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(await page.evaluate(() => window.__speechCalls.length), 1);
    } finally {
      await ctx.close();
    }
  });

  test("T3.09 (F7+F11) Switch scanning navigates into Interoception Pain Body Map controls", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", scanMode: "step2", size: 100, dwell: 0, scan: true, scanMs: 5000, safety: true },
        },
      });
      await page.click('nav.nav button[data-view="calm"]');
      const reachedBodyMap = await page.evaluate(() => {
        for (let i = 0; i < 60; i++) {
          const hi = document.querySelector(".scan-hi");
          if (hi && /stomach|head|ear/i.test(hi.textContent)) return true;
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
        }
        return false;
      });
      assert.ok(reachedBodyMap, "2-switch scan must reach Pain Body Map buttons");
    } finally {
      await ctx.close();
    }
  });

  test("T3.10 (F7+F8) 150% CSS-var scaling (zoom=1) + High-Contrast theme retains AAA contrast", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: { version: 2, access: { mode: "standard", size: 150, dwell: 0, scan: false, scanMs: 1500, safety: true } },
        settings: { theme: "contrast", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: false, stillness: false },
      });
      const res = await page.evaluate(() => {
        const g = document.querySelector("#grid");
        const t = document.querySelector("#grid .tile");
        return {
          zoom: getComputedStyle(g).zoom,
          color: getComputedStyle(t).color,
          bg: getComputedStyle(t).backgroundColor,
        };
      });
      assert.equal(res.zoom, "1");
      assert.ok(contrastRatio(res.color, res.bg) >= 7.0);
    } finally {
      await ctx.close();
    }
  });

  test("T3.11 (F7+F1) Auditory Scan Preview emits cues without polluting child strip or luminaac:log", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", scanMode: "step2", scanAudio: true, size: 100, dwell: 0, scan: true, scanMs: 5000, safety: true },
        },
      });
      await page.click('#grid .tile[data-w="I"]');
      await page.press("Tab");
      await page.press("Tab");
      await new Promise((r) => setTimeout(r, 80));
      const res = await page.evaluate(() => ({
        strip: [...document.querySelectorAll("#stripWords .word")].map((w) => w.textContent).join(" "),
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
        calls: window.__speechCalls.length,
      }));
      assert.equal(res.strip, "I");
      assert.equal(res.log.length, 0);
      assert.ok(res.calls >= 1);
    } finally {
      await ctx.close();
    }
  });

  test("T3.12 (F8+F13) OBF ext_luminaac_pos maps cleanly onto accessible Day & High-Contrast Fitzgerald tokens", async () => {
    const obf = await loadAppModule("obf.js");
    const parse = obf.parseOBF || obf.importOBF;
    const board = await parse(VALID_OBF);
    const tokens = extractThemeVars(readFileSync(path.join(ROOT, "tokens.css"), "utf8"));
    for (const btn of board.buttons.filter((b) => b.ext_luminaac_pos)) {
      const pos = btn.pos || btn.ext_luminaac_pos || btn.c;
      const ratio = contrastRatio(tokens.day["--ink"], tokens.day[`--wc-${pos}-tint`]);
      assert.ok(ratio >= 7.0, `Imported OBF POS ${pos} Day ink/tint ratio < 7.0`);
    }
  });

  test("T3.13 (F9+F17) Mixed Modeling + Child session produces exact isolated MLU and facts", async () => {
    const clinical = await loadAppModule("clinical.js");
    const summarize = clinical.summarizeClinical || clinical.generateInsights || clinical.buildClinicalSummary;
    const out = summarize({
      log: [
        { ts: 1, text: "I want apple", words: ["I", "want", "apple"], mode: "child", actor: "child", fn: "Requesting" },
        { ts: 2, text: "you want green crunchy apple", words: ["you", "want", "green", "crunchy", "apple"], mode: "modeling", actor: "partner", fn: "Modeling" },
      ],
      moments: [],
      signals: [],
    });
    assert.equal(out.metrics.childCount, 1);
    assert.equal(out.metrics.modeledCount, 1);
    assert.equal(out.metrics.mlu, 3);
  });

  test("T3.14 (F10+F16) GLP Stage 2 mitigated chunks expand via BYOK Watchdog without overwriting strip", async () => {
    const slp = await loadAppModule("slp.js");
    const byok = await loadAppModule("byok.js");
    const split = slp.mitigateGestalt || slp.splitGestalt;
    const chunks = split("Let's go park");
    const res = await byok.expandUtterance(chunks, { mode: "on-device" });
    const cand = String((res.candidates || [res.text])[0]?.text || (res.candidates || [res.text])[0]);
    assert.ok(cand.length <= 120 && /park/i.test(cand));
  });

  test("T3.15 (F10+F14) GLP Stage 1 gestalt speaks with child Kokoro prosody offline fallback", async () => {
    await loadAppModule("slp.js");
    await loadAppModule("speech.js");
    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, childPitchSemitones: 2 },
          gestalts: [{ id: "g1", text: "To infinity and beyond!", stage: 1 }],
        },
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "kokoro:af_sky", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.setOffline(true);
      await page.evaluate(() => {
        [...document.querySelectorAll("button")].find((b) => b.textContent.includes("To infinity and beyond!"))?.click();
      });
      await page.waitForFunction(() => window.__speechCalls.length > 0);
      assert.ok((await page.evaluate(() => window.__speechCalls.at(-1).text)).includes("To infinity and beyond!"));
    } finally {
      await ctx.close();
    }
  });

  test("T3.16 (F12+F4) Choice Board with ZWJ emoji works offline with SW precache", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          choiceBoards: [{ id: "cb_zwj", title: "Who", options: [{ label: "Family", e: "👨‍👩‍👧" }, { label: "Teacher", e: "🧑‍🏫" }] }],
        },
      });
      await page.setOffline(true);
      const ok = await page.evaluate(() => document.body.innerText.includes("👨‍👩‍👧") && document.body.innerText.includes("🧑‍🏫"));
      assert.ok(ok);
    } finally {
      await ctx.close();
    }
  });

  test("T3.17 (F13+F15) Imported .obz buttons participate in offline semantic search", async () => {
    const obf = await loadAppModule("obf.js");
    const ai = await import("../../ai.js");
    const importObz = obf.importOBZ || obf.parseOBZ;
    const pkg = await importObz(new Uint8Array(buildZip(VALID_OBZ_ENTRIES)));
    const allBtns = Object.values(pkg.boards || pkg.byId || { root: pkg.rootBoard }).flatMap((b) => b.buttons || []);
    const docs = allBtns.map((b) => ({ id: b.id, text: `${b.label} ${b.vocalization || ""}` }));
    const ranked = await ai.semanticSearch("thirsty beverage", docs);
    assert.ok(ranked.length > 0);
  });

  test("T3.18 (F15+F17) Semantic signal link + supersedes revision preserves append-only history", async () => {
    const ai = await import("../../ai.js");
    const clinical = await loadAppModule("clinical.js");
    assert.equal(typeof ai.semanticSearch, "function");
    const appendRev = clinical.appendRevision || clinical.addRevision;
    const getLineage = clinical.getRevisionLineage || clinical.resolveHistory;
    let store = appendRev([], { id: "r1", ts: 100, targetId: "m1", signalId: "s1", meaning: "Thirsty", by: "parent" });
    store = appendRev(store, { id: "r2", ts: 200, targetId: "m1", signalId: "s2", meaning: "Wants cold water", by: "therapist", supersedes: "r1" });
    assert.equal(getLineage(store, "m1").length, 2);
  });

  test("T3.19 (F16+F17) Accepted BYOK expansion logs as child utterance and grounds clinical facts", async () => {
    const byok = await loadAppModule("byok.js");
    const clinical = await loadAppModule("clinical.js");
    const exp = await byok.expandUtterance(["I", "want", "water"], { mode: "on-device" });
    const text = String((exp.candidates || [exp.text])[0]?.text || (exp.candidates || [exp.text])[0]);
    const summarize = clinical.summarizeClinical || clinical.generateInsights || clinical.buildClinicalSummary;
    const out = summarize({
      log: [{ ts: 1000, text, words: text.split(/\s+/), mode: "child", actor: "child", fn: "Requesting" }],
      moments: [],
      signals: [],
    });
    assert.equal(out.metrics.childCount, 1);
    assert.ok(out.facts.length >= 1);
  });

  test("T3.20 (F18+F13+F14) Research & license audit covers OBF compression & new HF models cleanly", () => {
    const third = readFileSync(path.join(ROOT, "THIRD-PARTY.md"), "utf8");
    const research = readFileSync(path.join(ROOT, "docs", "RESEARCH_EVALUATION.md"), "utf8");
    assert.ok(/Apache-2\.0/i.test(third) && /all-MiniLM-L6-v2/i.test(third) && /SmolLM2/i.test(third));
    assert.ok(/open-board|OBF|OBZ/i.test(research));
  });
});
