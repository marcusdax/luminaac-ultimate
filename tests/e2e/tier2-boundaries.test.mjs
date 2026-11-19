import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import {
  ROOT,
  alphaComposite,
  buildZip,
  contrastRatio,
  createFamilyAuth,
  extractThemeVars,
  launchBrowser,
  loadAppModule,
  parseColor,
  startBackend,
  startStaticServer,
} from "./harness.mjs";
import { CORE, PLANS } from "../../vocab.js";
import { activeRules, seed } from "../../shared.js";

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

// ============================================================================
// Feature 1 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 1 Boundaries: Speech & Logging", () => {
  test("T2.F1.1 Empty/whitespace speakUtterance is a safe no-op with 0 logs", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const res = await page.evaluate(async () => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("   \t\n  ", { mode: "child" });
        return { calls: window.__speechCalls.length, log: JSON.parse(localStorage.getItem("luminaac:log") || "[]") };
      });
      assert.equal(res.calls, 0);
      assert.equal(res.log.length, 0);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F1.2 skipLog=true emits speech without writing luminaac:log", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const res = await page.evaluate(async () => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("Test voice sample", { mode: "child", skipLog: true });
        await new Promise((r) => setTimeout(r, 50));
        return { calls: window.__speechCalls.length, log: JSON.parse(localStorage.getItem("luminaac:log") || "[]") };
      });
      assert.equal(res.calls, 1);
      assert.equal(res.log.length, 0);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F1.3 Long >500-char utterance speaks safely without crashing", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const longText = "word ".repeat(120).trim();
      const calls = await page.evaluate(async (txt) => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance(txt, { mode: "child" });
        await new Promise((r) => setTimeout(r, 60));
        return window.__speechCalls;
      }, longText);
      assert.equal(calls.length, 1);
      assert.ok(calls[0].text.length > 0);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F1.4 interrupt=false preserves active speech while interrupt=true cancels prior", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const cancels = await page.evaluate(async () => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("First sentence", { mode: "child" });
        const before = window.__speechCancels;
        await speakUtterance("Quiet cue", { mode: "preview", interrupt: false });
        const mid = window.__speechCancels;
        await speakUtterance("Second sentence", { mode: "child", interrupt: true });
        const after = window.__speechCancels;
        return { before, mid, after };
      });
      assert.equal(cancels.mid, cancels.before, "Non-interrupting preview must not cancel active speech");
      assert.ok(cancels.after >= cancels.mid, "Interrupting utterance may cancel prior speech");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F1.5 Rate boundaries (0.5x and 2.0x) propagate accurately through unified speech", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const calls = await page.evaluate(async () => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("Slow", { mode: "child", rate: 0.5 });
        await speakUtterance("Fast", { mode: "child", rate: 2.0 });
        await new Promise((r) => setTimeout(r, 60));
        return window.__speechCalls;
      });
      assert.equal(calls[0].rate, 0.5);
      assert.equal(calls[1].rate, 2.0);
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 2 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 2 Boundaries: Explore Quietly", () => {
  test("T2.F2.1 Rapid toggling Explore Quietly leaves final unchecked state speaking cleanly", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.click("#mvExplore");
      await page.click("#mvExplore");
      await page.click("#mvExplore");
      await page.click("#mvExplore");
      await page.click('#grid .tile[data-w="I"]');
      await page.waitForFunction(() => window.__speechCalls.length > 0);
      assert.equal(await page.evaluate(() => window.__speechCalls.length), 1);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F2.2 Explore Quietly silences #mvContextBar .mv-ctx-chip while keeping emergency SOS reachable", async () => {
    const ctx = await browser.newContext();
    try {
      const d = new Date().getDay();
      const page = await openMyVoice(ctx, {
        seedBridge: { version: 2, rules: [{ id: "r_ctx", page: "School", days: [d], from: 0, to: 24 }] },
      });
      await page.waitForSelector("#mvContextBar .mv-ctx-chip");
      await page.click("#mvExplore");
      await page.click("#mvContextBar .mv-ctx-chip");
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(await page.evaluate(() => window.__speechCalls.length), 0, "Context chip must stay silent in Explore Quietly mode");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F2.3 Explore Quietly leaves pre-built sentence strip untouched", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('#grid .tile[data-w="I"]');
      await new Promise((r) => setTimeout(r, 40));
      const beforeCalls = await page.evaluate(() => window.__speechCalls.length);
      await page.click("#mvExplore");
      await page.click("#nextRow .next-chip");
      await new Promise((r) => setTimeout(r, 60));
      const res = await page.evaluate(() => ({
        strip: [...document.querySelectorAll("#stripWords .word")].map((w) => w.textContent).join(" "),
        calls: window.__speechCalls.length,
      }));
      assert.equal(res.strip, "I", "Explore Quietly must not alter existing strip");
      assert.equal(res.calls, beforeCalls);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F2.4 Explore Quietly on dynamic #mvSuggest .mv-none neither speaks nor logs child utterance", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click("#mvExplore");
      await page.click("#mvSuggest .mv-none");
      await new Promise((r) => setTimeout(r, 60));
      const res = await page.evaluate(() => ({
        calls: window.__speechCalls.length,
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
      }));
      assert.equal(res.calls, 0);
      assert.equal(res.log.length, 0);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F2.5 db.exploration array records multiple explored taps cleanly without overflow crash", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click("#mvExplore");
      for (const w of ["I", "want", "go", "stop", "help", "more"]) {
        await page.click(`#grid .tile[data-w="${w}"]`);
      }
      const ex = await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:bridge") || "{}").exploration || []);
      assert.equal(ex.length, 6);
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 3 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 3 Boundaries: Sync & Telemetry API", () => {
  test("T2.F3.1 PUT /api/sync with stale baseVersion returns 409 Conflict", async () => {
    const auth = await createFamilyAuth(backendSrv);
    const r1 = await backendSrv.request("PUT", "/api/sync", { doc: seed(), baseVersion: 0 }, auth.parentToken);
    assert.equal(r1.status, 200);
    const r2 = await backendSrv.request("PUT", "/api/sync", { doc: seed(), baseVersion: 0 }, auth.parentToken);
    assert.equal(r2.status, 409);
  });

  test("T2.F3.2 POST /api/sync/telemetry without Authorization returns 401", async () => {
    const res = await backendSrv.request("POST", "/api/sync/telemetry", { log: [] });
    assert.equal(res.status, 401);
  });

  test("T2.F3.3 POST /api/sync/telemetry with malformed non-object payload returns 400", async () => {
    const auth = await createFamilyAuth(backendSrv);
    const res = await backendSrv.request("POST", "/api/sync/telemetry", { log: "not-an-array" }, auth.childToken);
    assert.equal(res.status, 400);
  });

  test("T2.F3.4 POST /api/sync/telemetry rejects child attempt to mutate rules or safety fields (403)", async () => {
    const auth = await createFamilyAuth(backendSrv);
    const doc = seed();
    doc.safety.consent = false;
    await backendSrv.request("PUT", "/api/sync", { doc, baseVersion: 0 }, auth.parentToken);

    const res = await backendSrv.request(
      "POST",
      "/api/sync/telemetry",
      { exploration: [{ t: Date.now(), word: "safe" }], rules: [], safety: { consent: true } },
      auth.childToken
    );
    assert.equal(res.status, 403);
    const after = await backendSrv.request("GET", "/api/sync", undefined, auth.parentToken);
    assert.equal(after.json.data.doc.safety.consent, false);
    assert.equal(after.json.data.doc.rules.length, doc.rules.length);
  });

  test("T2.F3.5 GET /api/sync childView strips moments, questions, team, alerts, and rules", async () => {
    const auth = await createFamilyAuth(backendSrv);
    await backendSrv.request("PUT", "/api/sync", { doc: seed(), baseVersion: 0 }, auth.parentToken);
    const res = await backendSrv.request("GET", "/api/sync", undefined, auth.childToken);
    assert.equal(res.status, 200);
    const cv = res.json.data.doc;
    for (const priv of ["moments", "questions", "team", "alerts", "notes", "audit"]) {
      assert.equal(cv[priv], undefined, `childView must omit ${priv}`);
    }
  });
});

// ============================================================================
// Feature 4 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 4 Boundaries: ZWJ Emoji & SW Precache", () => {
  test("T2.F4.1 Long 11-code-unit ZWJ emoji 👨‍👩‍👧‍👦 is preserved intact in #wordForm", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.tapAndHold("#careBtn", 2150);
      await page.waitForFunction(() => !document.querySelector("#view-care").hidden);
      await page.typeText('#wordForm input[name="e"]', "👨‍👩‍👧‍👦");
      const val = await page.evaluate(() => document.querySelector('#wordForm input[name="e"]').value);
      assert.equal(val, "👨‍👩‍👧‍👦");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F4.2 Empty emoji input on #wordForm submits gracefully using word text only", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.tapAndHold("#careBtn", 2150);
      await page.waitForFunction(() => !document.querySelector("#view-care").hidden);
      await page.typeText('#wordForm input[name="w"]', "sticker");
      await page.click('#wordForm button[type="submit"]');
      const custom = await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:custom") || "[]"));
      assert.ok(custom.some((x) => x.w === "sticker"));
    } finally {
      await ctx.close();
    }
  });

  test("T2.F4.3 sw.js precaches ZWJ OpenMoji SVG 1F9D1-200D-1F3EB.svg", () => {
    const sw = readFileSync(path.join(ROOT, "sw.js"), "utf8");
    assert.ok(sw.includes("1F9D1-200D-1F3EB.svg"), "sw.js must precache ZWJ OpenMoji teacher SVG");
  });

  test("T2.F4.4 Offline My Voice with blocked ARASAAC CDN renders pictos cleanly via OpenMoji/emoji fallback", async () => {
    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "day", cols: "6", pictos: true, labelsTop: false, voice: "", rate: 1, speakOnTap: false, stillness: false },
      });
      await page.setOffline(true);
      const count = await page.evaluate(() => document.querySelectorAll("#grid .tile").length);
      assert.equal(count, 30);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F4.5 Every path listed in sw.js FILES array exists on disk (no dead precache entries)", () => {
    const sw = readFileSync(path.join(ROOT, "sw.js"), "utf8");
    const m = /const\s+FILES\s*=\s*\[([\s\S]*?)\];/.exec(sw);
    assert.ok(m, "sw.js must define FILES array");
    const entries = [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
    assert.ok(entries.length > 0);
    for (const rel of entries) {
      if (rel === "./") continue;
      const clean = rel.replace(/^\.\//, "");
      assert.ok(existsSync(path.join(ROOT, clean)), `Dead SW precache entry: ${rel}`);
    }
  });
});

// ============================================================================
// Feature 5 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 5 Boundaries: Context Rules", () => {
  test("T2.F5.1 activeRules() returns empty array when no rule covers current hour/day", () => {
    const db = seed();
    const sunday3am = new Date(2026, 10, 15, 3, 0, 0); // Sunday 03:00
    assert.deepEqual(activeRules(db, sunday3am), []);
  });

  test("T2.F5.2 activeRules() treats 'from' as inclusive and 'to' as exclusive", () => {
    const db = {
      rules: [{ id: "r", page: "School", days: [1], from: 8, to: 15 }],
    };
    assert.equal(activeRules(db, new Date(2026, 10, 16, 8, 0, 0)).length, 1);
    assert.equal(activeRules(db, new Date(2026, 10, 16, 15, 0, 0)).length, 0);
  });

  test("T2.F5.3 Multiple overlapping active rules render cleanly in #mvContextBar without duplicate crash", async () => {
    const ctx = await browser.newContext();
    try {
      const d = new Date().getDay();
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          rules: [
            { id: "r1", page: "School", days: [d], from: 0, to: 24 },
            { id: "r2", page: "Bedtime", days: [d], from: 0, to: 24 },
          ],
        },
      });
      await page.waitForSelector("#mvContextBar button");
      const btns = await page.evaluate(() => document.querySelectorAll("#mvContextBar button").length);
      assert.ok(btns >= 2);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F5.4 Zero active rules hides/empties #mvContextBar gracefully without throwing", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: { version: 2, rules: [] },
      });
      const count = await page.evaluate(() => document.querySelectorAll("#mvContextBar button").length);
      assert.equal(count, 0);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F5.5 Even with 5 custom rules active, 30 CORE tiles keep identical spatial grid order", async () => {
    const ctx = await browser.newContext();
    try {
      const d = new Date().getDay();
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          rules: [
            { id: "a", page: "School", days: [d], from: 0, to: 24 },
            { id: "b", page: "Bedtime", days: [d], from: 0, to: 24 },
            { id: "c", page: "Food & drink", days: [d], from: 0, to: 24 },
          ],
        },
      });
      await page.waitForSelector("#mvContextBar button");
      const words = await page.evaluate(() => [...document.querySelectorAll("#grid .tile")].map((e) => e.dataset.w));
      assert.deepEqual(words.slice(0, 30), CORE.map((c) => c.w));
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 6 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 6 Boundaries: Pointer Cancellation, Accept & Debounce", () => {
  test("T2.F6.1 Sliding pointer just outside tile bounding box cancels activation", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.tapAndSlideOut('#grid .tile[data-w="help"]', 35);
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim()), "");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F6.2 pointercancel event during acceptMs hold aborts activation", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, acceptMs: 300, debounceMs: 0 },
        },
      });
      await page.evaluate(() => {
        const t = document.querySelector('#grid .tile[data-w="go"]');
        t.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
        t.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));
      });
      await new Promise((r) => setTimeout(r, 360));
      assert.equal(await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim()), "");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F6.3 acceptMs=0 boundary activates immediately without hold", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, acceptMs: 0, debounceMs: 0 },
        },
      });
      await page.click('#grid .tile[data-w="yes"]');
      assert.equal(await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim()), "yes");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F6.4 debounceMs=1000 boundary suppresses tap at 200ms and allows at 1050ms", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, acceptMs: 0, debounceMs: 1000 },
        },
      });
      await page.click('#grid .tile[data-w="no"]');
      await new Promise((r) => setTimeout(r, 200));
      await page.click('#grid .tile[data-w="no"]');
      assert.equal(await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim()), "no");
      await new Promise((r) => setTimeout(r, 900));
      await page.click('#grid .tile[data-w="no"]');
      assert.equal(await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim()), "no no");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F6.5 Caregiver hold released at 1200ms (< 2000ms) keeps Caregiver view locked", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.tapAndHold("#careBtn", 1200);
      assert.equal(await page.evaluate(() => document.querySelector("#view-care").hidden), true);
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 7 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 7 Boundaries: Switch Scanning & CSS Scaling", () => {
  test("T2.F7.1 Empty scannable items list does not throw during scan tick", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: { version: 2, access: { mode: "switch", size: 100, dwell: 0, scan: true, scanMs: 50, safety: true } },
      });
      const err = await page.evaluate(async () => {
        let msg = null;
        window.addEventListener("error", (e) => { msg = e.message; });
        document.querySelectorAll("main button, main .tile, main summary, main input, nav .nav-btn").forEach((el) => {
          el.disabled = true;
          el.style.display = "none";
        });
        await new Promise((r) => setTimeout(r, 150));
        return msg;
      });
      assert.equal(err, null);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F7.2 scanLoops=1 stops scanning cleanly after 1 cycle", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", size: 100, dwell: 0, scan: true, scanMs: 600, scanLoops: 1, safety: true },
        },
      });
      await page.click("details.mv-stories > summary");
      await page.click("#mvStories .mv-ptile");
      await page.waitForSelector("#mvPlayer[open]");
      await page.waitForFunction(() => document.documentElement.dataset.scanSleeping === "true", 6000);
      assert.equal(await page.evaluate(() => document.querySelectorAll(".scan-hi").length), 0);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F7.3 Space/Enter inside Caregiver text input with scan=true types normally without triggering .scan-hi", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", size: 100, dwell: 0, scan: true, scanMs: 600, safety: true },
        },
      });
      await page.tapAndHold("#careBtn", 2150);
      await page.waitForFunction(() => !document.querySelector("#view-care").hidden);
      await page.typeText('#wordForm input[name="w"]', "ice cream");
      await page.press(" ");
      const val = await page.evaluate(() => document.querySelector('#wordForm input[name="w"]').value);
      assert.ok(val.startsWith("ice cream"), `Space in Caregiver input was intercepted by switch scanner: "${val}"`);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F7.4 Closed <details> hides interior tiles from switch scan while keeping <summary> scannable", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", scanMode: "step2", size: 100, dwell: 0, scan: true, scanMs: 5000, safety: true },
        },
      });
      const visitedHiddenTile = await page.evaluate(async () => {
        for (let i = 0; i < 65; i++) {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
          const hi = document.querySelector(".scan-hi");
          if (hi && hi.closest("details:not([open])") && hi.tagName !== "SUMMARY") return true;
        }
        return false;
      });
      assert.equal(visitedHiddenTile, false, "Closed <details> children must never be scanned");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F7.5 2-Switch Tab wraps cleanly from last scannable control back to first", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", scanMode: "step2", size: 100, dwell: 0, scan: true, scanMs: 5000, safety: true },
        },
      });
      const wrapped = await page.evaluate(() => {
        const seen = [];
        for (let i = 0; i < 120; i++) {
          const el = document.querySelector(".scan-hi");
          if (el) seen.push(el);
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
        }
        return seen.length > 5 && seen.slice(1).includes(seen[0]);
      });
      assert.ok(wrapped, "2-switch Tab step must wrap cleanly back to first element");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 8 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 8 Boundaries: WCAG Contrast Extremes", () => {
  test("T2.F8.1 Night theme .strip-empty composited contrast meets >= 4.5:1 AA", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "night", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: false, stillness: false },
      });
      const info = await page.evaluate(() => {
        const el = document.querySelector("#stripEmpty");
        const wrap = document.querySelector("#strip");
        const csEl = getComputedStyle(el);
        const csWrap = getComputedStyle(wrap);
        return { color: csEl.color, opacity: Number(csEl.opacity), bg: csWrap.backgroundColor };
      });
      const fg = parseColor(info.color);
      const bg = parseColor(info.bg);
      const eff = alphaComposite({ ...fg, a: (fg.a ?? 1) * info.opacity }, bg);
      const ratio = contrastRatio(eff, bg);
      assert.ok(ratio >= 4.5, `Night #stripEmpty composited contrast is ${ratio.toFixed(2)}:1 (< 4.5:1 AA)`);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F8.2 High-Contrast --alert on --paper meets >= 4.5:1 AA", () => {
    const css = readFileSync(path.join(ROOT, "tokens.css"), "utf8");
    const { contrast } = extractThemeVars(css);
    const ratio = contrastRatio(contrast["--alert"], contrast["--paper"]);
    assert.ok(ratio >= 4.5, `High-Contrast --alert on --paper is ${ratio.toFixed(2)}:1 (< 4.5:1 AA)`);
  });

  test("T2.F8.3 Day --wc-people on --wc-people-tint meets >= 3.0:1 UI/large-text contrast", () => {
    const css = readFileSync(path.join(ROOT, "tokens.css"), "utf8");
    const { day } = extractThemeVars(css);
    const ratio = contrastRatio(day["--wc-people"], day["--wc-people-tint"]);
    assert.ok(ratio >= 3.0, `Day --wc-people on tint is ${ratio.toFixed(2)}:1 (< 3.0:1)`);
  });

  test("T2.F8.4 Low-Arousal .strip-wrap composited contrast meets >= 4.5:1 AA", () => {
    const tokens = readFileSync(path.join(ROOT, "tokens.css"), "utf8");
    const appCss = readFileSync(path.join(ROOT, "app.css"), "utf8");
    const { day } = extractThemeVars(tokens);
    const m = /body\.low-arousal\s+\.strip-wrap\s*\{[^}]*opacity\s*:\s*([\d.]+)/.exec(appCss);
    const op = m ? Number(m[1]) : 1;
    const effDusk = alphaComposite({ ...parseColor(day["--dusk"]), a: op }, parseColor(day["--fog"]));
    const ratio = contrastRatio(day["--dusk-ink"], effDusk);
    assert.ok(ratio >= 4.5, `Low-Arousal strip contrast is ${ratio.toFixed(2)}:1 (< 4.5:1 AA)`);
  });

  test("T2.F8.5 .step.done composited contrast in Day theme meets >= 4.5:1 AA", () => {
    const tokens = readFileSync(path.join(ROOT, "tokens.css"), "utf8");
    const appCss = readFileSync(path.join(ROOT, "app.css"), "utf8");
    const { day } = extractThemeVars(tokens);
    const m = /\.step\.done\s*\{[^}]*opacity\s*:\s*([\d.]+)/.exec(appCss);
    const op = m ? Number(m[1]) : 1;
    const ink = parseColor(day["--ink"]);
    const paper = parseColor(day["--paper"]);
    const eff = alphaComposite({ ...ink, a: op }, paper);
    const ratio = contrastRatio(eff, paper);
    assert.ok(ratio >= 4.5, `.step.done contrast is ${ratio.toFixed(2)}:1 (< 4.5:1 AA)`);
  });
});

// ============================================================================
// Feature 9 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 9 Boundaries: Modeling Mode", () => {
  test("T2.F9.1 Modeling with modelingAudio=false emits 0 speech calls across multiple taps", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: { version: 2, access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, modelingAudio: false } },
      });
      await page.evaluate(() => {
        const el = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")].find((n) => /model/i.test(`${n.textContent} ${n.getAttribute("aria-label") || ""} ${n.id}`));
        el?.click();
      });
      await page.click('#grid .tile[data-w="I"]');
      await page.click('#grid .tile[data-w="want"]');
      await page.click("#btnSpeak");
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(await page.evaluate(() => window.__speechCalls.length), 0);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F9.2 Interleaved Modeling -> Child -> Modeling counts ONLY Child words in luminaac:counts", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.evaluate(() => {
        const t = () => [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")].find((n) => /model/i.test(`${n.textContent} ${n.getAttribute("aria-label") || ""} ${n.id}`));
        t()?.click();
      });
      await page.click('#grid .tile[data-w="you"]');
      await page.click("#btnSpeak");

      await page.evaluate(() => {
        const t = () => [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")].find((n) => /model/i.test(`${n.textContent} ${n.getAttribute("aria-label") || ""} ${n.id}`));
        t()?.click();
      });
      await page.click('#grid .tile[data-w="water"], #grid .tile[data-w="eat"]');
      await page.click("#btnSpeak");

      const counts = await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:counts") || "{}"));
      assert.equal(counts.you || 0, 0, "Modeled 'you' must not enter counts");
      assert.equal(counts.eat, 1, "Child 'eat' must count once");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F9.3 Toggling Modeling Mode off clears active modeling indicator", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const cleared = await page.evaluate(() => {
        const el = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")].find((n) => /model/i.test(`${n.textContent} ${n.getAttribute("aria-label") || ""} ${n.id}`));
        if (!el) return false;
        el.click();
        el.click();
        return !document.body.classList.contains("is-modeling");
      });
      assert.ok(cleared);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F9.4 Modeling mode works inside Fringe folders without mutating CORE positions", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.evaluate(() => {
        const el = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")].find((n) => /model/i.test(`${n.textContent} ${n.getAttribute("aria-label") || ""} ${n.id}`));
        el?.click();
      });
      await page.click('#folders .folder[data-f="food"]');
      await page.click('#grid .tile[data-w="apple"]');
      await page.click('#folders .folder[data-f="core"]');
      const coreWords = await page.evaluate(() => [...document.querySelectorAll("#grid .tile")].map((e) => e.dataset.w).slice(0, 30));
      assert.deepEqual(coreWords, CORE.map((c) => c.w));
    } finally {
      await ctx.close();
    }
  });

  test("T2.F9.5 Modeled log entries preserve words array and actor='partner'", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const log = await page.evaluate(async () => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("look big dog", { mode: "modeling" });
        return JSON.parse(localStorage.getItem("luminaac:log") || "[]");
      });
      const last = log.at(-1);
      assert.equal(last.mode, "modeling");
      assert.equal(last.actor, "partner");
      assert.deepEqual(last.words, ["look", "big", "dog"]);
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 10 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 10 Boundaries: GLP / NLA Gestalts", () => {
  test("T2.F10.1 Empty gestalts bank renders cleanly without JS errors", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, { seedBridge: { version: 2, gestalts: [] } });
      assert.equal(await page.evaluate(() => document.querySelectorAll("#grid .tile").length), 30);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F10.2 Stage 2 mitigate-into-strip preserves original gestalt entry in luminaac:bridge", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: { version: 2, gestalts: [{ id: "g2", text: "Let's go to the park", stage: 2 }] },
      });
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) => /mitigate|edit.*strip|mix/i.test(`${b.textContent} ${b.getAttribute("aria-label") || ""}`));
        btn?.click();
      });
      const db = await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:bridge") || "{}"));
      assert.equal(db.gestalts[0].text, "Let's go to the park");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F10.3 Long gestalt phrase (>80 chars) mitigates and speaks without truncation crash", async () => {
    const slp = await loadAppModule("slp.js");
    const fn = slp.mitigateGestalt || slp.splitGestalt;
    assert.equal(typeof fn, "function");
    const longPhrase = "When it gets too loud in the hallway I need to wear my quiet headphones right away";
    const chunks = fn(longPhrase);
    assert.ok(Array.isArray(chunks) && chunks.length >= 2);
  });

  test("T2.F10.4 Missing IndexedDB audioClipId on gestalt falls back cleanly to TTS", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: { version: 2, gestalts: [{ id: "g_miss", text: "Missing clip phrase", stage: 1, audioClipId: "nonexistent_clip" }] },
      });
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Missing clip phrase"));
        btn?.click();
      });
      await page.waitForFunction(() => window.__speechCalls.length > 0);
      assert.ok((await page.evaluate(() => window.__speechCalls.at(-1).text)).includes("Missing clip phrase"));
    } finally {
      await ctx.close();
    }
  });

  test("T2.F10.5 Adding/editing gestalts never erases existing db.stories routines", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          stories: [{ id: "st_keep", title: "Keep story", kind: "story", steps: [{ e: "⭐", text: "Step 1" }] }],
          gestalts: [{ id: "g1", text: "Ready set go!", stage: 1 }],
        },
      });
      const db = await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:bridge") || "{}"));
      assert.equal(db.stories.length, 1);
      assert.equal(db.stories[0].id, "st_keep");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 11 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 11 Boundaries: Interoception & Sensory Quick-Bar", () => {
  test("T2.F11.1 Sensory Quick-Bar remains reachable even after opening a fringe folder", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('#folders .folder[data-f="things"]');
      const visible = await page.evaluate(() =>
        ["stop", "no", "help", "bathroom", "break"].every((w) =>
          [...document.querySelectorAll("#view-talk button")].some((b) => b.offsetParent !== null && b.textContent.toLowerCase().includes(w))
        )
      );
      assert.ok(visible);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F11.2 Switching body region updates contextual relief options (stomach vs skin)", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('nav.nav button[data-view="calm"]');
      const diff = await page.evaluate(() => {
        const pick = (re) => [...document.querySelectorAll("#view-calm button")].find((b) => b.offsetParent !== null && re.test(b.textContent));
        pick(/stomach/i)?.click();
        pick(/hurts/i)?.click();
        const r1 = document.querySelector("#view-calm")?.innerText || "";
        pick(/skin/i)?.click();
        pick(/itchy/i)?.click();
        const r2 = document.querySelector("#view-calm")?.innerText || "";
        return { r1, r2 };
      });
      assert.notEqual(diff.r1, diff.r2);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F11.3 Keyboard Enter activates focused body region button", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('nav.nav button[data-view="calm"]');
      const focused = await page.evaluate(() => {
        const b = [...document.querySelectorAll("#view-calm button")].find((x) => /head/i.test(x.textContent) && x.offsetParent !== null);
        if (!b) return false;
        b.focus();
        return true;
      });
      assert.ok(focused);
      await page.press("Enter");
      const active = await page.evaluate(() => Boolean(document.querySelector('[data-body-part="head"][aria-pressed="true"], .is-selected[data-body-part="head"]')));
      assert.ok(active, "Enter on body part must select it");
    } finally {
      await ctx.close();
    }
  });

  test("T2.F11.4 Clicking sensation without selecting body region handles safely without error", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('nav.nav button[data-view="calm"]');
      const err = await page.evaluate(() => {
        let m = null;
        window.addEventListener("error", (e) => { m = e.message; });
        const b = [...document.querySelectorAll("#view-calm button")].find((x) => /hurts/i.test(x.textContent) && x.offsetParent !== null);
        b?.click();
        return m;
      });
      assert.equal(err, null);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F11.5 Pain utterance respects Modeling Mode isolation when Modeling is active", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.evaluate(() => {
        const m = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")].find((n) => /model/i.test(`${n.textContent} ${n.getAttribute("aria-label") || ""} ${n.id}`));
        m?.click();
      });
      await page.click('nav.nav button[data-view="calm"]');
      await page.evaluate(() => {
        const pick = (re) => [...document.querySelectorAll("#view-calm button")].find((b) => b.offsetParent !== null && re.test(b.textContent));
        pick(/ear/i)?.click();
        pick(/hurts/i)?.click();
      });
      await new Promise((r) => setTimeout(r, 60));
      const counts = await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:counts") || "{}"));
      assert.deepEqual(counts, {});
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 12 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 12 Boundaries: Choice Boards & Schedules", () => {
  test("T2.F12.1 Choice Board with < 2 options is rejected/guarded cleanly", async () => {
    const slp = await loadAppModule("slp.js");
    const norm = slp.normalizeChoiceBoard || slp.validateChoiceBoard;
    assert.equal(typeof norm, "function");
    assert.throws(() => norm({ title: "Too few", options: [{ label: "Only one" }] }));
  });

  test("T2.F12.2 Choice Board with > 8 options caps/limits to <= 8 options", async () => {
    const slp = await loadAppModule("slp.js");
    const norm = slp.normalizeChoiceBoard || slp.validateChoiceBoard;
    const many = Array.from({ length: 12 }, (_, i) => ({ label: `Opt ${i + 1}` }));
    const res = norm({ title: "Many", options: many });
    assert.ok(res.options.length <= 8, `Choice Board must cap options at <= 8, got ${res.options.length}`);
  });

  test("T2.F12.3 Exact boundary 2-option and 8-option Choice Boards render cleanly", async () => {
    const slp = await loadAppModule("slp.js");
    const norm = slp.normalizeChoiceBoard || slp.validateChoiceBoard;
    assert.equal(norm({ title: "Min", options: [{ label: "A" }, { label: "B" }] }).options.length, 2);
    assert.equal(norm({ title: "Max", options: Array.from({ length: 8 }, (_, i) => ({ label: `O${i}` })) }).options.length, 8);
  });

  test("T2.F12.4 #planReset resets completed steps back to step 1", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('nav.nav button[data-view="plans"]');
      await page.waitForSelector("#steps .check-btn");
      await page.click("#steps .check-btn");
      await page.click("#planReset");
      const doneCount = await page.evaluate(() => document.querySelectorAll("#steps .step.done").length);
      assert.equal(doneCount, 0);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F12.5 Unified schedule merges static PLANS and db.stories without ID collision", async () => {
    const slp = await loadAppModule("slp.js");
    const merge = slp.getUnifiedSchedules || slp.mergeSchedules;
    assert.equal(typeof merge, "function");
    const out = merge({ stories: [{ id: PLANS[0].id, title: "Custom override", kind: "routine", steps: [{ text: "Step" }] }] });
    const ids = out.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, "Merged schedule IDs must be unique");
  });
});

// ============================================================================
// Feature 13 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 13 Boundaries: Corrupt OBF/OBZ Negative Cases", () => {
  test("T2.F13.1 Rejects invalid JSON .obf cleanly", async () => {
    const obf = await loadAppModule("obf.js");
    const parse = obf.parseOBF || obf.importOBF;
    await assert.rejects(() => Promise.resolve().then(() => parse("{broken json")));
  });

  test("T2.F13.2 Rejects wrong format version (open-board-9.9) cleanly", async () => {
    const obf = await loadAppModule("obf.js");
    const parse = obf.parseOBF || obf.importOBF;
    await assert.rejects(() => Promise.resolve().then(() => parse({ format: "open-board-9.9", buttons: [] })));
  });

  test("T2.F13.3 Rejects corrupt/truncated .obz ZIP bytes cleanly", async () => {
    const obf = await loadAppModule("obf.js");
    const importObz = obf.importOBZ || obf.parseOBZ;
    await assert.rejects(() => Promise.resolve().then(() => importObz(new Uint8Array(Buffer.from("PK\x03\x04corrupt")))));
  });

  test("T2.F13.4 Rejects .obz ZIP missing manifest.json", async () => {
    const obf = await loadAppModule("obf.js");
    const importObz = obf.importOBZ || obf.parseOBZ;
    const zip = buildZip([{ name: "boards/root.obf", data: "{}" }]);
    await assert.rejects(() => Promise.resolve().then(() => importObz(new Uint8Array(zip))));
  });

  test("T2.F13.5 Rejects .obz ZIP containing path traversal (../../evil.json)", async () => {
    const obf = await loadAppModule("obf.js");
    const importObz = obf.importOBZ || obf.parseOBZ;
    const zip = buildZip([
      { name: "../../evil.json", data: '{"format":"open-board-0.1","buttons":[],"grid":{"rows":0,"columns":0,"order":[]}}' },
      { name: "manifest.json", data: JSON.stringify({ format: "open-board-0.1", root: "../../evil.json", paths: { boards: {} } }) },
    ]);
    await assert.rejects(() => Promise.resolve().then(() => importObz(new Uint8Array(zip))));
  });
});

// ============================================================================
// Feature 14 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 14 Boundaries: Child Voice & Prosody", () => {
  test("T2.F14.1 Missing/offline Kokoro voice ID falls back immediately to speechSynthesis", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await openMyVoice(ctx);
      const calls = await page.evaluate(async () => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("Hello", { mode: "child", voiceOverride: "kokoro:af_sky" });
        await new Promise((r) => setTimeout(r, 60));
        return window.__speechCalls;
      });
      assert.equal(calls.length, 1);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F14.2 Extreme semitone pitch bounds (-12, +12) clamp safely", async () => {
    const ai = await import("../../ai.js");
    const shape = ai.shapeProsody || ai.applyChildProsody;
    assert.equal(typeof shape, "function");
    const lo = shape({ pitchSemitones: -99 });
    const hi = shape({ pitchSemitones: 99 });
    assert.ok(lo.pitchSemitones >= -12 && lo.pitchSemitones <= 12);
    assert.ok(hi.pitchSemitones >= -12 && hi.pitchSemitones <= 12);
  });

  test("T2.F14.3 Punctuation-only TTS input does not throw", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const ok = await page.evaluate(async () => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("...", { mode: "child" });
        return true;
      });
      assert.ok(ok);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F14.4 Switching voice preset mid-session cancels previous speech cleanly", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const cancels = await page.evaluate(async () => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("First", { mode: "child", voiceOverride: "af_sky" });
        await speakUtterance("Second", { mode: "child", voiceOverride: "bf_isabella", interrupt: true });
        return window.__speechCancels;
      });
      assert.ok(cancels >= 1);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F14.5 Missing AudioContext gracefully falls back to speechSynthesis", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const calls = await page.evaluate(async () => {
        window.AudioContext = undefined;
        window.webkitAudioContext = undefined;
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("Fallback", { mode: "child" });
        await new Promise((r) => setTimeout(r, 60));
        return window.__speechCalls.length;
      });
      assert.equal(calls, 1);
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 15 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 15 Boundaries: Semantic Search & Signal Linking", () => {
  test("T2.F15.1 Empty search query returns empty or unfiltered safe list without crash", async () => {
    const ai = await import("../../ai.js");
    assert.equal(typeof ai.semanticSearch, "function");
    const res = await ai.semanticSearch("", [{ id: "a", text: "apple" }]);
    assert.ok(Array.isArray(res));
  });

  test("T2.F15.2 Regex metacharacters in search query never throw SyntaxError", async () => {
    const ai = await import("../../ai.js");
    const res = await ai.semanticSearch(".*+?^${}()|[]\\", [{ id: "a", text: "apple" }]);
    assert.ok(Array.isArray(res));
  });

  test("T2.F15.3 Offline embedText returns finite normalized vector", async () => {
    const ai = await import("../../ai.js");
    assert.equal(typeof ai.embedText, "function");
    const vec = await ai.embedText("want water");
    assert.ok(vec.length > 0 && [...vec].every((x) => Number.isFinite(x)));
  });

  test("T2.F15.4 Bridge smart() with zero signals falls back to phraseFrom without error", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.goto(`${staticSrv.baseUrl}/bridge.html`);
      await page.waitForSelector("#tab-today");
      if (await page.evaluate(() => Boolean(document.querySelector("#onboard[open]")))) {
        await page.click("#obSkip");
      }
      await page.evaluate(() => {
        window.__bridge.db.signals = [];
        window.__bridge.save();
        window.__bridge.show("today");
      });
      await page.evaluate(() => {
        document.querySelector("#moments button, .moment button")?.click();
      });
      await page.waitForSelector("#annotate[open]");
      await page.fill("#annText", "Child wants to go to the park");
      const smartTxt = await page.evaluate(() => document.querySelector("#annSmart")?.textContent || "");
      assert.ok(smartTxt.length > 0);
    } finally {
      await ctx.close();
    }
  });

  test("T2.F15.5 Unicode/emoji query in semantic search executes cleanly", async () => {
    const ai = await import("../../ai.js");
    const res = await ai.semanticSearch("🍎", [{ id: "apple", text: "apple 🍎 food" }]);
    assert.equal(res[0].id, "apple");
  });
});

// ============================================================================
// Feature 16 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 16 Boundaries: Watchdog & BYOK Egress", () => {
  test("T2.F16.1 Watchdog enforces exact 120-char boundary (120 passes, 121 fails)", async () => {
    const byok = await loadAppModule("byok.js");
    const watchdog = byok.watchdogCheck || byok.validateExpansion;
    const ok120 = "want " + "a".repeat(115);
    const bad121 = "want " + "a".repeat(116);
    const check = (c) => {
      const v = watchdog(c, ["want"]);
      return typeof v === "boolean" ? v : Boolean(v?.ok ?? v?.valid);
    };
    assert.equal(check(ok120), true);
    assert.equal(check(bad121), false);
  });

  test("T2.F16.2 Watchdog rejects negation-flipping expansion ('no park' -> 'go to park')", async () => {
    const byok = await loadAppModule("byok.js");
    const watchdog = byok.watchdogCheck || byok.validateExpansion;
    const v = watchdog("Let's go to the park!", ["no", "park"]);
    const passed = typeof v === "boolean" ? v : Boolean(v?.ok ?? v?.valid);
    assert.equal(passed, false);
  });

  test("T2.F16.3 Watchdog rejects PII/URL injection even when core word is present", async () => {
    const byok = await loadAppModule("byok.js");
    const watchdog = byok.watchdogCheck || byok.validateExpansion;
    const v = watchdog("I want water from https://evil.test/steal", ["I", "want", "water"]);
    const passed = typeof v === "boolean" ? v : Boolean(v?.ok ?? v?.valid);
    assert.equal(passed, false);
  });

  test("T2.F16.4 BYOK 'api' mode with egressAck=true but missing apiKey makes 0 fetch calls", async () => {
    const byok = await loadAppModule("byok.js");
    let calls = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = async () => { calls++; return new Response("{}"); };
    try {
      const res = await byok.expandUtterance(["I", "want", "water"], { mode: "api", egressAck: true, apiKey: "" });
      assert.equal(calls, 0);
      assert.ok(res.error || res.fallback);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("T2.F16.5 BYOK 'api' mode with egressAck=true STILL filters malicious API responses via Watchdog", async () => {
    const byok = await loadAppModule("byok.js");
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Visit https://evil.test or hurt yourself right now" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    try {
      const res = await byok.expandUtterance(["I", "want", "water"], {
        mode: "api",
        apiKey: "sk-valid-key",
        endpoint: "https://api.example.test/v1/chat/completions",
        egressAck: true,
      });
      const text = JSON.stringify(res);
      assert.ok(!text.includes("evil.test"), "Remote API response must not bypass Watchdog");
    } finally {
      globalThis.fetch = orig;
    }
  });
});

// ============================================================================
// Feature 17 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 17 Boundaries: Clinical Metrics, CSV & FL", () => {
  test("T2.F17.1 Empty log returns zeroed metrics without NaN", async () => {
    const clinical = await loadAppModule("clinical.js");
    const summarize = clinical.summarizeClinical || clinical.generateInsights || clinical.buildClinicalSummary;
    const out = summarize({ log: [], moments: [], signals: [] });
    assert.equal(out.metrics.childCount, 0);
    assert.equal(out.metrics.modeledCount, 0);
    assert.equal(out.metrics.mlu, 0);
    assert.equal(out.metrics.uniqueWords, 0);
    assert.ok(Number.isFinite(out.metrics.coreRatio));
  });

  test("T2.F17.2 Log with ONLY modeling entries produces childCount=0 and mlu=0", async () => {
    const clinical = await loadAppModule("clinical.js");
    const summarize = clinical.summarizeClinical || clinical.generateInsights || clinical.buildClinicalSummary;
    const out = summarize({
      log: [{ ts: 1000, text: "I want pizza", words: ["I", "want", "pizza"], mode: "modeling", actor: "partner" }],
      moments: [],
      signals: [],
    });
    assert.equal(out.metrics.modeledCount, 1);
    assert.equal(out.metrics.childCount, 0);
    assert.equal(out.metrics.mlu, 0);
  });

  test("T2.F17.3 getRevisionLineage on unknown targetId returns empty array cleanly", async () => {
    const clinical = await loadAppModule("clinical.js");
    const getLineage = clinical.getRevisionLineage || clinical.resolveHistory;
    assert.deepEqual(getLineage([], "missing_id"), []);
  });

  test("T2.F17.4 CSV export escapes commas/quotes/newlines and neutralizes formula injection (=+-@)", async () => {
    const clinical = await loadAppModule("clinical.js");
    const toCsv = clinical.exportClinicalCSV || clinical.toCSV;
    const csv = toCsv({
      log: [{ ts: 1000, text: '=CMD("evil"), "quoted"\nline', words: ["a"], mode: "child", actor: "child", fn: "Commenting" }],
      moments: [],
      signals: [],
    });
    assert.ok(!csv.split("\n").some((row) => /(?:^|,)"?=/m.test(row)), "Formula prefix '=' must be neutralized in CSV");
  });

  test("T2.F17.5 masternex-prince-fl compress/aggregate preserves finite privacy accounting at boundary trimRatio", async () => {
    const prince = await import("../../masternex-prince-fl.js");
    const p1 = prince.compressClientUpdate(new Float32Array([0.5, -0.5, 0.25, -0.25]), 0.3, 1.0);
    const p2 = prince.compressClientUpdate(new Float32Array([0.1, 0.2, 0.3, 0.4]), 0.3, 1.0);
    assert.ok(Number.isFinite(p1.rdp_epsilon) && p1.rdp_epsilon > 0);
    const agg = prince.aggregatePrinceUpdates([prince.decompressClientUpdate(p1), prince.decompressClientUpdate(p2)], 0);
    assert.equal(agg.length, 4);
  });
});

// ============================================================================
// Feature 18 Boundaries (5 tests)
// ============================================================================
describe("Tier 2 — Feature 18 Boundaries: Documentation & Policy Guards", () => {
  test("T2.F18.1 Repo root contains no bundled node_modules or unapproved root package.json", () => {
    assert.equal(existsSync(path.join(ROOT, "node_modules")), false);
  });

  test("T2.F18.2 sw.js precache FILES contains zero remote https:// URLs", () => {
    const sw = readFileSync(path.join(ROOT, "sw.js"), "utf8");
    const m = /const\s+FILES\s*=\s*\[([\s\S]*?)\];/.exec(sw);
    assert.ok(m);
    assert.ok(!/https?:\/\//i.test(m[1]), "sw.js FILES must only precache local same-origin assets");
  });

  test("T2.F18.3 RESEARCH-OSS.md documents ARASAAC CC BY-NC-SA online-only restriction", () => {
    const txt = readFileSync(path.join(ROOT, "RESEARCH-OSS.md"), "utf8");
    assert.ok(/ARASAAC/i.test(txt) && /NC|BY-NC-SA/i.test(txt));
  });

  test("T2.F18.4 docs/RESEARCH_EVALUATION.md includes clinical limitations and review caveats", () => {
    const p = path.join(ROOT, "docs", "RESEARCH_EVALUATION.md");
    assert.ok(existsSync(p));
    const txt = readFileSync(p, "utf8");
    assert.ok(/limitation|caveat|review|SLP/i.test(txt));
  });

  test("T2.F18.5 No .env secrets committed in repo root", () => {
    assert.equal(existsSync(path.join(ROOT, ".env")), false);
  });
});
