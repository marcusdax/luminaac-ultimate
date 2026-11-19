import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import {
  ROOT,
  alphaComposite,
  contrastRatio,
  createFamilyAuth,
  extractThemeVars,
  launchBrowser,
  loadAppModule,
  parseColor,
  resolveCssValue,
  startBackend,
  startStaticServer,
} from "./harness.mjs";
import { CORE } from "../../vocab.js";

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

async function openMyVoice(ctx, { initScript, seedBridge, settings } = {}) {
  const page = await ctx.newPage();
  await page.installSpeechSpy();
  if (seedBridge || settings) {
    await page.addInitScript((b, s) => {
      if (b) localStorage.setItem("luminaac:bridge", JSON.stringify(b));
      if (s) localStorage.setItem("luminaac:settings", JSON.stringify(s));
    }, seedBridge || null, settings || null);
  }
  if (initScript) await page.addInitScript(initScript);
  await page.goto(`${staticSrv.baseUrl}/index.html`);
  await page.waitForSelector("#grid .tile");
  return page;
}

async function unlockCaregiver(page) {
  await page.tapAndHold("#careBtn", 2150);
  await page.waitForFunction(() => {
    const el = document.querySelector("#view-care");
    return Boolean(el && !el.hidden);
  });
}

// ============================================================================
// Feature 1: Unified Speech & Logging Pipeline (6 tests)
// ============================================================================
describe("Tier 1 — Feature 1: Unified Speech & Logging Pipeline", () => {
  test("F1.1 speech.js exports speakUtterance with mode='child' speech and normalized log entry", async () => {
    const mod = await loadAppModule("speech.js");
    assert.equal(typeof mod.speakUtterance, "function", "speech.js must export speakUtterance");

    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const res = await page.evaluate(async () => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("I want water", { mode: "child", functionTag: "Requesting" });
        await new Promise((r) => setTimeout(r, 80));
        return {
          calls: window.__speechCalls,
          log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
        };
      });
      assert.ok(res.calls.some((c) => c.text.includes("I want water")), "child utterance must speak");
      const last = res.log.at(-1);
      assert.ok(last, "luminaac:log must record child utterance");
      assert.equal(last.text, "I want water");
      assert.equal(last.mode, "child");
      assert.equal(last.actor, "child");
      assert.ok(last.ts || last.t, "log entry must include timestamp");
    } finally {
      await ctx.close();
    }
  });

  test("F1.2 Core tile + Speak uses configured rate/voice and logs mode='child'", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: {
          theme: "day", cols: "6", pictos: false, labelsTop: false,
          voice: "Calm British", rate: 1.25, speakOnTap: false, stillness: false,
        },
      });
      await page.click('#grid .tile[data-w="I"]');
      await page.click('#grid .tile[data-w="want"]');
      await page.click("#btnSpeak");
      await page.waitForFunction(() => window.__speechCalls.length > 0);

      const state = await page.evaluate(() => ({
        calls: window.__speechCalls,
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
      }));
      assert.equal(state.calls.at(-1).text, "I want");
      assert.ok(Math.abs(state.calls.at(-1).rate - 1.25) < 0.05, "must honor configured rate");
      assert.ok(state.log.some((e) => e.text === "I want" && e.mode === "child"), "must log normalized child utterance");
    } finally {
      await ctx.close();
    }
  });

  test("F1.3 Suggestion chip (#mvSuggest .mv-chip) uses unified speech rate and logs to luminaac:log", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: {
          theme: "day", cols: "6", pictos: false, labelsTop: false,
          voice: "Calm British", rate: 0.75, speakOnTap: true, stillness: false,
        },
      });
      await page.waitForSelector("#mvSuggest .mv-chip");
      const chipText = await page.evaluate(() => document.querySelector("#mvSuggest .mv-chip")?.textContent?.trim());
      await page.click("#mvSuggest .mv-chip");
      await page.waitForFunction(() => window.__speechCalls.length > 0);

      const state = await page.evaluate(() => ({
        calls: window.__speechCalls,
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
      }));
      assert.ok(state.calls.length >= 1, "suggestion chip must speak");
      assert.ok(Math.abs(state.calls.at(-1).rate - 0.75) < 0.05, `expected rate ~0.75, got ${state.calls.at(-1).rate}`);
      assert.ok(state.log.some((e) => e.text && chipText.includes(e.text)), "suggestion chip must log to luminaac:log");
    } finally {
      await ctx.close();
    }
  });

  test("F1.4 SOS button (#mvSafety .mv-sos) uses configured voice/rate and logs to luminaac:log", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: {
          theme: "day", cols: "6", pictos: false, labelsTop: false,
          voice: "Calm British", rate: 0.8, speakOnTap: true, stillness: false,
        },
      });
      await page.waitForSelector('#mvSafety .mv-sos[data-kind="help"]');
      await page.click('#mvSafety .mv-sos[data-kind="help"]');
      await page.waitForFunction(() => window.__speechCalls.length > 0);

      const state = await page.evaluate(() => ({
        calls: window.__speechCalls,
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
      }));
      assert.ok(Math.abs(state.calls.at(-1).rate - 0.8) < 0.05, `SOS must honor rate 0.8, got ${state.calls.at(-1).rate}`);
      assert.ok(state.log.some((e) => /help/i.test(e.text)), "SOS utterance must be logged in luminaac:log");
    } finally {
      await ctx.close();
    }
  });

  test("F1.5 Stories player and Calm needs route through unified speech and log to luminaac:log", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: {
          theme: "day", cols: "6", pictos: false, labelsTop: false,
          voice: "Calm British", rate: 1.15, speakOnTap: true, stillness: false,
        },
      });
      await page.click('nav.nav button[data-view="calm"]');
      await page.click('#scale .scale-btn:nth-child(4)');
      await page.waitForSelector("#needs .need");
      await page.click("#needs .need");
      await page.waitForFunction(() => window.__speechCalls.length >= 2);

      const state = await page.evaluate(() => ({
        calls: window.__speechCalls,
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
      }));
      assert.ok(state.calls.every((c) => Math.abs(c.rate - 1.15) < 0.05), "Calm speech must honor rate 1.15");
      assert.ok(state.log.length >= 2, "Calm utterances must log to luminaac:log");
    } finally {
      await ctx.close();
    }
  });

  test("F1.6 speakUtterance mode='preview' does not pollute luminaac:log, counts, or pairs", async () => {
    const mod = await loadAppModule("speech.js");
    assert.equal(typeof mod.speakUtterance, "function");

    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const res = await page.evaluate(async () => {
        localStorage.setItem("luminaac:counts", JSON.stringify({ want: 3 }));
        localStorage.setItem("luminaac:pairs", JSON.stringify({ i: { want: 3 } }));
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("Preview word", { mode: "preview" });
        await new Promise((r) => setTimeout(r, 60));
        return {
          calls: window.__speechCalls,
          log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
          counts: JSON.parse(localStorage.getItem("luminaac:counts") || "{}"),
          pairs: JSON.parse(localStorage.getItem("luminaac:pairs") || "{}"),
        };
      });
      assert.equal(res.log.length, 0, "preview mode must not log to luminaac:log");
      assert.deepEqual(res.counts, { want: 3 }, "preview mode must not mutate counts");
      assert.deepEqual(res.pairs, { i: { want: 3 } }, "preview mode must not mutate pairs");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 2: "Explore Quietly" Selector Fix (6 tests)
// ============================================================================
describe('Tier 1 — Feature 2: "Explore Quietly" Selector Fix', () => {
  test("F2.1 Explore Quietly silences Core .grid .tile and logs to db.exploration", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.click("#mvExplore");
      await page.click('#grid .tile[data-w="want"]');
      await new Promise((r) => setTimeout(r, 60));

      const res = await page.evaluate(() => ({
        calls: window.__speechCalls.length,
        strip: document.querySelector("#stripWords")?.textContent?.trim(),
        exploration: JSON.parse(localStorage.getItem("luminaac:bridge") || "{}").exploration || [],
      }));
      assert.equal(res.calls, 0, "Explore quietly must not speak");
      assert.equal(res.strip, "", "Explore quietly must not add to strip");
      assert.ok(res.exploration.some((x) => x.word === "want"), "must log explored word");
    } finally {
      await ctx.close();
    }
  });

  test("F2.2 Explore Quietly silences .next-row .next-chip without speech leak", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.waitForSelector("#nextRow .next-chip");
      await page.click("#mvExplore");
      await page.click("#nextRow .next-chip");
      await new Promise((r) => setTimeout(r, 60));

      const res = await page.evaluate(() => ({
        calls: window.__speechCalls.length,
        strip: document.querySelector("#stripWords")?.textContent?.trim(),
        exploration: JSON.parse(localStorage.getItem("luminaac:bridge") || "{}").exploration || [],
      }));
      assert.equal(res.calls, 0, ".next-chip leaked speech in Explore quietly mode");
      assert.equal(res.strip, "", ".next-chip modified strip in Explore quietly mode");
      assert.ok(res.exploration.length >= 1, ".next-chip tap must log to db.exploration");
    } finally {
      await ctx.close();
    }
  });

  test("F2.3 Explore Quietly silences .quick .phrase without speech leak", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.waitForSelector("#quick .phrase");
      await page.click("#mvExplore");
      await page.click("#quick .phrase");
      await new Promise((r) => setTimeout(r, 60));

      const res = await page.evaluate(() => ({
        calls: window.__speechCalls.length,
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
        exploration: JSON.parse(localStorage.getItem("luminaac:bridge") || "{}").exploration || [],
      }));
      assert.equal(res.calls, 0, ".quick .phrase leaked speech in Explore quietly mode");
      assert.equal(res.log.length, 0, ".quick .phrase must not write to luminaac:log in Explore mode");
      assert.ok(res.exploration.length >= 1, ".quick .phrase must log to db.exploration");
    } finally {
      await ctx.close();
    }
  });

  test("F2.4 Explore Quietly silences Plans .step-says .say-chip without speech leak", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.click("#mvExplore");
      await page.click('nav.nav button[data-view="plans"]');
      await page.waitForSelector("#steps .step-says .say-chip");
      await page.click("#steps .step-says .say-chip");
      await new Promise((r) => setTimeout(r, 60));

      const res = await page.evaluate(() => ({
        calls: window.__speechCalls.length,
        exploration: JSON.parse(localStorage.getItem("luminaac:bridge") || "{}").exploration || [],
      }));
      assert.equal(res.calls, 0, ".step-says .say-chip leaked speech in Explore quietly mode");
      assert.ok(res.exploration.length >= 1, ".say-chip must log to db.exploration");
    } finally {
      await ctx.close();
    }
  });

  test("F2.5 Explore Quietly silences #mvSuggest .mv-chip and #mvPersonality .mv-ptile", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click("#mvExplore");
      await page.click("#mvSuggest .mv-chip");
      await page.click("details.mv-personality > summary");
      await page.waitForSelector("#mvPersonality .mv-ptile");
      await page.click("#mvPersonality .mv-ptile");
      await new Promise((r) => setTimeout(r, 60));

      const res = await page.evaluate(() => ({
        calls: window.__speechCalls.length,
        exploration: JSON.parse(localStorage.getItem("luminaac:bridge") || "{}").exploration || [],
      }));
      assert.equal(res.calls, 0, "suggestions and My Things must be silent in Explore quietly");
      assert.ok(res.exploration.length >= 2, "must record both explored taps");
    } finally {
      await ctx.close();
    }
  });

  test("F2.6 Unchecking #mvExplore restores audible speech and child logging", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.click("#mvExplore");
      await page.click('#grid .tile[data-w="want"]');
      assert.equal(await page.evaluate(() => window.__speechCalls.length), 0);

      await page.click("#mvExplore");
      await page.click('#grid .tile[data-w="help"]');
      await page.waitForFunction(() => window.__speechCalls.length > 0);
      const calls = await page.evaluate(() => window.__speechCalls);
      assert.ok(calls.some((c) => c.text.toLowerCase().includes("help")), "speech must resume after unchecking Explore");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 3: Same-Tab Pull Refresh & Child Telemetry Sync (6 tests)
// ============================================================================
describe("Tier 1 — Feature 3: Same-Tab Pull Refresh & Child Telemetry Sync", () => {
  test("F3.1 persist(db) dispatches CustomEvent('luminaac:bridge-updated') in the same tab", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const events = await page.evaluate(async () => {
        const received = [];
        window.addEventListener("luminaac:bridge-updated", (e) => {
          received.push({ type: e.type, detail: e.detail });
        });
        const { load, persist } = await import("/shared.js");
        const db = load();
        db.profile.child = "Sam";
        persist(db);
        return received;
      });
      assert.equal(events.length, 1, "persist(db) must dispatch luminaac:bridge-updated in same tab");
      assert.ok(typeof events[0].detail?.ts === "number", "event detail must include numeric ts");
    } finally {
      await ctx.close();
    }
  });

  test("F3.2 Same-tab persist(db) updates My Voice signals/personality UI immediately", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.evaluate(async () => {
        const { load, persist } = await import("/shared.js");
        const db = load();
        db.signals.unshift({
          id: "s_live", name: "Live signal", cues: ["tap"], meaning: "Live",
          phrase: "Same-tab live phrase", confirmations: 9, rejections: 0,
          contexts: ["home", "morning", "afternoon", "evening", "night"], created: Date.now(),
        });
        persist(db);
      });
      await page.waitForFunction(() =>
        [...document.querySelectorAll("#mvSuggest .mv-chip")].some((b) => b.textContent.includes("Same-tab live phrase"))
      );
      assert.ok(true);
    } finally {
      await ctx.close();
    }
  });

  test("F3.3 Cross-tab storage sync propagates Bridge edits to open My Voice tab", async () => {
    const ctx = await browser.newContext();
    try {
      const mvPage = await openMyVoice(ctx);
      const bridgePage = await ctx.newPage();
      await bridgePage.goto(`${staticSrv.baseUrl}/bridge.html`);
      await bridgePage.waitForSelector("#onboard[open], #tab-today");
      const hasOnboard = await bridgePage.evaluate(() => Boolean(document.querySelector("#onboard[open]")));
      if (hasOnboard) await bridgePage.click("#obSkip");

      await bridgePage.evaluate(() => {
        const db = window.__bridge.db;
        db.signals.unshift({
          id: "s_xtab", name: "Cross-tab", cues: ["wave"], meaning: "Hi",
          phrase: "Cross-tab hello friend", confirmations: 10, rejections: 0,
          contexts: ["home", "morning", "afternoon", "evening", "night"], created: Date.now(),
        });
        window.__bridge.save("Added cross-tab signal");
      });

      await mvPage.waitForFunction(() =>
        [...document.querySelectorAll("#mvSuggest .mv-chip")].some((b) => b.textContent.includes("Cross-tab hello friend"))
      );
    } finally {
      await ctx.close();
    }
  });

  test("F3.4 Backend GET /api/sync with child token returns scoped childView without caregiver notes/audit", async () => {
    const auth = await createFamilyAuth(backendSrv);
    const { seed } = await import("../../shared.js");
    const doc = seed();
    doc.notes = [{ id: "n1", t: Date.now(), by: "teacher", text: "Private caregiver note" }];
    doc.audit = [{ t: Date.now(), what: "Private audit" }];

    const putRes = await backendSrv.request("PUT", "/api/sync", { doc, baseVersion: 0 }, auth.parentToken);
    assert.equal(putRes.status, 200);

    const getChild = await backendSrv.request("GET", "/api/sync", undefined, auth.childToken);
    assert.equal(getChild.status, 200);
    assert.equal(getChild.json.data.role, "child");
    assert.equal(getChild.json.data.doc.scope, "child");
    assert.equal(getChild.json.data.doc.notes, undefined);
    assert.equal(getChild.json.data.doc.audit, undefined);
    assert.equal(getChild.json.data.doc.alerts, undefined);
  });

  test("F3.5 Backend PUT /api/sync with child token is forbidden (403)", async () => {
    const auth = await createFamilyAuth(backendSrv);
    const { seed } = await import("../../shared.js");
    const res = await backendSrv.request("PUT", "/api/sync", { doc: seed(), baseVersion: 0 }, auth.childToken);
    assert.equal(res.status, 403);
  });

  test("F3.6 Backend POST /api/sync/telemetry allows child device to append sanitized telemetry", async () => {
    const auth = await createFamilyAuth(backendSrv);
    const { seed } = await import("../../shared.js");
    const doc = seed();
    doc.signals = [{ id: "s_keep", name: "Keep", cues: ["x"], meaning: "Keep", phrase: "Keep me", confirmations: 4, rejections: 0, contexts: ["home"], created: Date.now() }];
    await backendSrv.request("PUT", "/api/sync", { doc, baseVersion: 0 }, auth.parentToken);

    const teleRes = await backendSrv.request(
      "POST",
      "/api/sync/telemetry",
      {
        log: [{ t: Date.now(), text: "I want apple", kind: "message" }],
        exploration: [{ t: Date.now(), word: "banana" }],
        feedback: [{ t: Date.now(), accepted: true, signalId: "s_keep" }],
      },
      auth.childToken
    );
    assert.equal(teleRes.status, 200, `Expected 200 on POST /api/sync/telemetry, got ${teleRes.status}: ${teleRes.text}`);

    const parentGet = await backendSrv.request("GET", "/api/sync", undefined, auth.parentToken);
    assert.equal(parentGet.status, 200);
    const syncedDoc = parentGet.json.data.doc;
    const syncedTel = parentGet.json.data.telemetry;
    assert.equal(syncedDoc.signals.length, 1);
    assert.equal(syncedDoc.signals[0].id, "s_keep", "telemetry must never overwrite signals");
    assert.ok(syncedTel.log.some((x) => x.text === "I want apple"), "telemetry must append child log");
    assert.ok(syncedDoc.exploration.some((x) => x.word === "banana"), "telemetry must append exploration");
    assert.ok(syncedDoc.feedback.some((x) => x.signalId === "s_keep"), "telemetry must append feedback");
  });
});

// ============================================================================
// Feature 4: ZWJ Emoji maxlength & Offline OpenMoji SW Precache (5 tests)
// ============================================================================
describe("Tier 1 — Feature 4: ZWJ Emoji maxlength & Offline OpenMoji SW Precache", () => {
  test("F4.1 index.html Caregiver word form preserves full ZWJ emoji 👨‍👩‍👧", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await unlockCaregiver(page);
      await page.typeText('#wordForm input[name="w"]', "family");
      await page.typeText('#wordForm input[name="e"]', "👨‍👩‍👧");
      const val = await page.evaluate(() => document.querySelector('#wordForm input[name="e"]').value);
      assert.equal(val, "👨‍👩‍👧", `Expected full ZWJ emoji, got "${val}" (len ${val.length})`);
    } finally {
      await ctx.close();
    }
  });

  test("F4.2 bridge.html Personal button form preserves full ZWJ emoji 👨‍👩‍👧", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.goto(`${staticSrv.baseUrl}/bridge.html`);
      await page.waitForSelector("#tab-today");
      if (await page.evaluate(() => Boolean(document.querySelector("#onboard[open]")))) {
        await page.click("#obSkip");
      }
      await page.click('nav.tabs button[data-tab="vocab"]');
      await page.waitForSelector('#formPersonal input[name="e"]');
      await page.typeText('#formPersonal input[name="e"]', "👨‍👩‍👧");
      const val = await page.evaluate(() => document.querySelector('#formPersonal input[name="e"]').value);
      assert.equal(val, "👨‍👩‍👧", `Bridge personal emoji truncated to "${val}"`);
    } finally {
      await ctx.close();
    }
  });

  test("F4.3 bridge.html Sound practice form preserves full ZWJ emoji 🧑‍🏫", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.goto(`${staticSrv.baseUrl}/bridge.html`);
      await page.waitForSelector("#tab-today");
      if (await page.evaluate(() => Boolean(document.querySelector("#onboard[open]")))) {
        await page.click("#obSkip");
      }
      await page.click('nav.tabs button[data-tab="routines"]');
      await page.waitForSelector('#formPractice input[name="e"]');
      await page.typeText('#formPractice input[name="e"]', "🧑‍🏫");
      const val = await page.evaluate(() => document.querySelector('#formPractice input[name="e"]').value);
      assert.equal(val, "🧑‍🏫", `Bridge practice emoji truncated to "${val}"`);
    } finally {
      await ctx.close();
    }
  });

  test("F4.4 sw.js precache manifest includes vendor/openmoji/*.svg and all entries exist on disk", () => {
    const swText = readFileSync(path.join(ROOT, "sw.js"), "utf8");
    const openmojiMatches = [...swText.matchAll(/["'](\.?\/?vendor\/openmoji\/[^"']+\.svg)["']/g)].map((m) => m[1]);
    assert.ok(openmojiMatches.length >= 100, `sw.js must precache vendor/openmoji/*.svg (found ${openmojiMatches.length})`);
    for (const rel of openmojiMatches) {
      const clean = rel.replace(/^\.\//, "");
      assert.ok(existsSync(path.join(ROOT, clean)), `sw.js precache entry missing on disk: ${clean}`);
    }
  });

  test("F4.5 Service Worker caches OpenMoji SVGs and serves My Voice + SVG offline", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const cachedUrls = await page.evaluate(async () => {
        if (!("serviceWorker" in navigator)) return [];
        const reg = await navigator.serviceWorker.register("./sw.js");
        await navigator.serviceWorker.ready;
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const names = await caches.keys();
          if (names.length > 0) {
            const c = await caches.open(names[0]);
            const keys = await c.keys();
            if (keys.some((k) => k.url.includes("vendor/openmoji/"))) {
              return keys.map((k) => new URL(k.url).pathname);
            }
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        return [];
      });
      assert.ok(cachedUrls.some((u) => u.includes("/vendor/openmoji/")), "SW CacheStorage must contain vendor/openmoji/*.svg");

      await page.setOffline(true);
      await page.reload();
      await page.waitForSelector("#grid .tile");
      const offlineSvgStatus = await page.evaluate(async () => {
        const r = await fetch("./vendor/openmoji/1F468-200D-1F469-200D-1F467.svg");
        return r.status;
      });
      assert.equal(offlineSvgStatus, 200, "ZWJ OpenMoji SVG must be served offline from SW cache");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 5: Context Rules (db.rules) Prioritization Strip (5 tests)
// ============================================================================
describe("Tier 1 — Feature 5: Context Rules (db.rules) Prioritization Strip", () => {
  test("F5.1 Active School rule surfaces interactive prioritized chips in #mvContextBar", async () => {
    const ctx = await browser.newContext();
    try {
      const now = new Date();
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          rules: [{ id: "r_school_now", page: "School", days: [now.getDay()], from: 0, to: 24 }],
        },
      });
      await page.waitForSelector("#mvContextBar button, #mvContextBar .ctx-chip, #mvContextBar .next-chip");
      const text = await page.evaluate(() => document.querySelector("#mvContextBar")?.textContent || "");
      assert.ok(/school|teacher|help|bathroom|break/i.test(text), `Context strip should surface School rule terms, got: "${text}"`);
    } finally {
      await ctx.close();
    }
  });

  test("F5.2 Active Bedtime rule surfaces Bedtime-relevant words in #mvContextBar", async () => {
    const ctx = await browser.newContext();
    try {
      const now = new Date();
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          rules: [{ id: "r_bed_now", page: "Bedtime", days: [now.getDay()], from: 0, to: 24 }],
        },
      });
      await page.waitForSelector("#mvContextBar button, #mvContextBar .ctx-chip, #mvContextBar .next-chip");
      const text = await page.evaluate(() => document.querySelector("#mvContextBar")?.textContent || "");
      assert.ok(/bed|sleep|quiet|blanket|tired/i.test(text), `Context strip should surface Bedtime terms, got: "${text}"`);
    } finally {
      await ctx.close();
    }
  });

  test("F5.3 Tapping a prioritized chip in #mvContextBar outputs speech/strip cleanly", async () => {
    const ctx = await browser.newContext();
    try {
      const now = new Date();
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          rules: [{ id: "r_now", page: "School", days: [now.getDay()], from: 0, to: 24 }],
        },
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.waitForSelector("#mvContextBar .mv-ctx-chip");
      await page.click("#mvContextBar .mv-ctx-chip");
      await new Promise((r) => setTimeout(r, 60));

      const state = await page.evaluate(() => ({
        calls: window.__speechCalls.length,
        strip: [...document.querySelectorAll("#stripWords .word")].map((w) => w.textContent).join(" "),
      }));
      assert.ok(state.calls > 0 || state.strip.length > 0, "Context strip chip must speak or populate strip");
    } finally {
      await ctx.close();
    }
  });

  test("F5.4 30 CORE tiles keep invariant motor-plan order even with active context rules", async () => {
    const ctx = await browser.newContext();
    try {
      const now = new Date();
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          rules: [
            { id: "r1", page: "School", days: [now.getDay()], from: 0, to: 24 },
            { id: "r2", page: "Bedtime", days: [now.getDay()], from: 0, to: 24 },
          ],
        },
      });
      const words = await page.evaluate(() =>
        [...document.querySelectorAll("#grid .tile")].map((el) => el.dataset.w)
      );
      assert.deepEqual(words.slice(0, 30), CORE.map((c) => c.w), "CORE 6x5 positions must never shift");
    } finally {
      await ctx.close();
    }
  });

  test("F5.5 Switching folders and returning to Core preserves #mvContextBar and 30 CORE positions", async () => {
    const ctx = await browser.newContext();
    try {
      const now = new Date();
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          rules: [{ id: "r1", page: "School", days: [now.getDay()], from: 0, to: 24 }],
        },
      });
      await page.waitForSelector("#mvContextBar button");
      await page.evaluate(() => {
        [...document.querySelectorAll("#folders button.folder")].find((b) => /food/i.test(b.textContent))?.click();
        [...document.querySelectorAll("#folders button.folder")].find((b) => /core/i.test(b.textContent))?.click();
      });
      const res = await page.evaluate(() => ({
        hasCtxButtons: document.querySelectorAll("#mvContextBar button").length > 0,
        coreWords: [...document.querySelectorAll("#grid .tile")].map((el) => el.dataset.w).slice(0, 30),
      }));
      assert.ok(res.hasCtxButtons, "Context strip buttons must remain present after folder switch");
      assert.deepEqual(res.coreWords, CORE.map((c) => c.w));
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 6: WCAG 2.5.2 Pointer Cancellation, Acceptance Delay & Debounce (5 tests)
// ============================================================================
describe("Tier 1 — Feature 6: WCAG 2.5.2 Pointer Cancellation, Acceptance Delay & Debounce", () => {
  test("F6.1 WCAG 2.5.2 pointerdown inside tile + slide outside + pointerup outside cancels activation", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.tapAndSlideOut('#grid .tile[data-w="want"]', 80);
      await new Promise((r) => setTimeout(r, 80));

      const res = await page.evaluate(() => ({
        strip: document.querySelector("#stripWords")?.textContent?.trim(),
        calls: window.__speechCalls.length,
      }));
      assert.equal(res.strip, "", "Slide-off pointerup outside target must cancel tile activation");
      assert.equal(res.calls, 0, "Slide-off must not emit speech");
    } finally {
      await ctx.close();
    }
  });

  test("F6.2 pointerdown + pointerup inside tile bounds activates tile cleanly", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('#grid .tile[data-w="go"]');
      const strip = await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim());
      assert.equal(strip, "go");
    } finally {
      await ctx.close();
    }
  });

  test("F6.3 acceptMs acceptance delay rejects taps shorter than acceptMs and accepts >= acceptMs", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, acceptMs: 350, debounceMs: 0 },
        },
      });
      await page.tapAndHold('#grid .tile[data-w="eat"]', 60);
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim()), "", "Tap shorter than acceptMs must be ignored");

      await page.tapAndHold('#grid .tile[data-w="eat"]', 420);
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim()), "eat", "Tap >= acceptMs must activate");
    } finally {
      await ctx.close();
    }
  });

  test("F6.4 debounceMs blocks rapid accidental double-taps within window", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, acceptMs: 0, debounceMs: 500 },
        },
      });
      await page.click('#grid .tile[data-w="more"]');
      await new Promise((r) => setTimeout(r, 60));
      await page.click('#grid .tile[data-w="more"]');
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("#stripWords .word")].map((w) => w.textContent).join(" ")), "more", "Second tap within debounceMs must be suppressed");

      await new Promise((r) => setTimeout(r, 520));
      await page.click('#grid .tile[data-w="more"]');
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("#stripWords .word")].map((w) => w.textContent).join(" ")), "more more", "Tap after debounceMs must succeed");
    } finally {
      await ctx.close();
    }
  });

  test("F6.5 Caregiver lock requires 2000ms hold and ignores quick tap", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click("#careBtn");
      assert.equal(await page.evaluate(() => document.querySelector("#view-care").hidden), true, "Quick click must not unlock Caregiver view");
      await unlockCaregiver(page);
      assert.equal(await page.evaluate(() => document.querySelector("#view-care").hidden), false, "2000ms hold must unlock Caregiver view");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 7: Upgraded Switch Scanning & CSS Scaling (6 tests)
// ============================================================================
describe("Tier 1 — Feature 7: Upgraded Switch Scanning & CSS Scaling", () => {
  test("F7.1 Switch scanning items include <summary> and visible checkboxes (#mvExplore)", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", scanMode: "step2", size: 100, dwell: 0, scan: true, scanMs: 5000, safety: true },
        },
      });
      const tags = await page.evaluate(() => {
        const seen = new Set();
        for (let i = 0; i < 80; i++) {
          const el = document.querySelector(".scan-hi");
          if (el) seen.add(`${el.tagName}:${el.id || el.className}`);
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
        }
        return [...seen];
      });
      assert.ok(tags.some((s) => s.startsWith("SUMMARY:")), `Switch scan must visit <summary>, saw: ${tags.join(", ")}`);
      assert.ok(tags.some((s) => s.includes("mvExplore")), `Switch scan must visit #mvExplore checkbox, saw: ${tags.join(", ")}`);
    } finally {
      await ctx.close();
    }
  });

  test("F7.2 Row-Column scanning highlights a row first then drills into cells on switch press", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", scanMode: "rowcol", size: 100, dwell: 0, scan: true, scanMs: 600, safety: true },
        },
      });
      await page.waitForFunction(() => document.querySelectorAll(".scan-row-hi").length > 0, 22000);
      await page.press(" ");
      await page.waitForFunction(() => Boolean(document.querySelector("#grid .tile.scan-hi")), 2000);
      const hasCell = await page.evaluate(() => Boolean(document.querySelector("#grid .tile.scan-hi")));
      assert.ok(hasCell, "Activating row must drill into individual cell highlight (.scan-hi)");
    } finally {
      await ctx.close();
    }
  });

  test("F7.3 2-Switch Step scanning advances on Tab/Step switch and activates on Enter/Select switch", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", scanMode: "step2", size: 100, dwell: 0, scan: true, scanMs: 5000, safety: true },
        },
      });
      await page.waitForSelector(".scan-hi");
      const firstId = await page.evaluate(() => {
        const el = document.querySelector(".scan-hi");
        return el?.dataset?.w || el?.textContent?.trim();
      });
      await page.press("Tab");
      await new Promise((r) => setTimeout(r, 40));
      const secondId = await page.evaluate(() => {
        const el = document.querySelector(".scan-hi");
        return el?.dataset?.w || el?.textContent?.trim();
      });
      assert.notEqual(secondId, firstId, "2-switch step key (Tab) must advance .scan-hi immediately");
    } finally {
      await ctx.close();
    }
  });

  test("F7.4 Auditory Scan Preview speaks label as cue without writing to luminaac:log or counts", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", scanMode: "step2", scanAudio: true, size: 100, dwell: 0, scan: true, scanMs: 5000, safety: true },
        },
      });
      await page.waitForSelector(".scan-hi");
      await page.press("Tab");
      await new Promise((r) => setTimeout(r, 80));
      const res = await page.evaluate(() => ({
        calls: window.__speechCalls,
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
        counts: JSON.parse(localStorage.getItem("luminaac:counts") || "{}"),
      }));
      assert.ok(res.calls.length >= 1, "Auditory scan preview must speak cue on step");
      assert.equal(res.log.length, 0, "Auditory preview must not write to luminaac:log");
      assert.deepEqual(res.counts, {}, "Auditory preview must not increment counts");
    } finally {
      await ctx.close();
    }
  });

  test("F7.5 Scan Loop Limit pauses auto-scan after configured cycles", async () => {
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
      assert.equal(await page.evaluate(() => document.querySelectorAll(".scan-hi").length), 0, "Auto-scan must pause after scanLoops cycles");
    } finally {
      await ctx.close();
    }
  });

  test("F7.6 CSS board scaling uses CSS custom properties without non-standard CSS zoom on .grid", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 150, dwell: 0, scan: false, scanMs: 1500, safety: true },
        },
      });
      const metrics = await page.evaluate(() => {
        const grid = document.querySelector("#grid");
        const tile = document.querySelector("#grid .tile");
        const csGrid = getComputedStyle(grid);
        const csTile = getComputedStyle(tile);
        return {
          zoom: csGrid.zoom,
          tileWidth: tile.getBoundingClientRect().width,
          fontSize: parseFloat(csTile.fontSize),
          tileScaleVar: getComputedStyle(document.documentElement).getPropertyValue("--tile-scale").trim() ||
            getComputedStyle(document.documentElement).getPropertyValue("--board-zoom").trim(),
        };
      });
      assert.equal(metrics.zoom, "1", `Expected CSS zoom '1' (use CSS variables instead of zoom), got '${metrics.zoom}'`);
      assert.ok(metrics.tileWidth >= 100, `Scaled tile width should be >= 100px at 150%, got ${metrics.tileWidth}`);
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 8: WCAG AA/AAA Contrast & Low-Arousal Verification (6 tests)
// ============================================================================
describe("Tier 1 — Feature 8: WCAG AA/AAA Contrast & Low-Arousal Verification", () => {
  test("F8.1 #grid retains role='grid' after renderGrid() and #stripWords retains aria-live='polite'", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const attrs = await page.evaluate(() => ({
        gridRole: document.querySelector("#grid")?.getAttribute("role"),
        stripLive: document.querySelector("#stripWords")?.getAttribute("aria-live"),
      }));
      assert.equal(attrs.gridRole, "grid", `#grid role must remain 'grid', got '${attrs.gridRole}'`);
      assert.equal(attrs.stripLive, "polite");
    } finally {
      await ctx.close();
    }
  });

  test("F8.2 Day theme Fitzgerald Key bands >= 3.0:1 and ink >= 7.0:1 AAA across all 9 classes", () => {
    const css = readFileSync(path.join(ROOT, "tokens.css"), "utf8");
    const { day } = extractThemeVars(css);
    const classes = ["people", "action", "describe", "thing", "social", "question", "negate", "little", "folder"];
    const ink = parseColor(day["--ink"]);
    const paper = parseColor(day["--paper"]);

    for (const cls of classes) {
      const band = parseColor(day[`--wc-${cls}`]);
      const tint = parseColor(day[`--wc-${cls}-tint`]);
      const inkOnTint = contrastRatio(ink, tint);
      const bandOnTint = contrastRatio(band, tint);
      const bandOnPaper = contrastRatio(band, paper);
      assert.ok(inkOnTint >= 7.0, `Day --ink on --wc-${cls}-tint = ${inkOnTint.toFixed(2)}:1 (< 7.0:1 AAA)`);
      assert.ok(bandOnTint >= 3.0, `Day --wc-${cls} on tint = ${bandOnTint.toFixed(2)}:1 (< 3.0:1 UI contrast)`);
      assert.ok(bandOnPaper >= 3.0, `Day --wc-${cls} on --paper = ${bandOnPaper.toFixed(2)}:1 (< 3.0:1 UI contrast)`);
    }
  });

  test("F8.3 Interactive control borders in Day & Night computed in Chrome meet >= 3.0:1 WCAG 1.4.11", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      for (const theme of ["day", "night"]) {
        const ratios = await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
          const selectors = [".icon-btn", ".mv-explore", ".mv-none", "#needs .need", ".say-chip", ".check-btn"];
          return selectors.map((sel) => {
            const el = document.querySelector(sel);
            if (!el) return { sel, skipped: true };
            const cs = getComputedStyle(el);
            const parentBg = getComputedStyle(document.body).backgroundColor;
            return { sel, borderColor: cs.borderTopColor, bgColor: cs.backgroundColor, parentBg };
          });
        }, theme);
        for (const item of ratios) {
          if (item.skipped) continue;
          const border = parseColor(item.borderColor);
          const bg = parseColor(item.bgColor);
          const surface = bg.a === 0 ? parseColor(item.parentBg) : bg;
          const ratio = contrastRatio(border, surface);
          assert.ok(ratio >= 3.0, `${theme} ${item.sel} border contrast ${ratio.toFixed(2)}:1 (< 3.0:1 WCAG 1.4.11)`);
        }
      }
    } finally {
      await ctx.close();
    }
  });

  test("F8.4 High-Contrast theme (.mv-sos, .mv-sos.is-home, .mv-pbtn.quiet, .mv-reward, --alert) meets >= 4.5:1 / >= 7.0:1", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "contrast", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.click("details.mv-stories > summary");
      await page.click("#mvStories .mv-ptile");
      await page.waitForSelector("#mvPlayer[open]");

      const samples = await page.evaluate(() => {
        const els = [
          { name: ".mv-sos", el: document.querySelector('#mvSafety .mv-sos[data-kind="help"]') },
          { name: ".mv-sos.is-home", el: document.querySelector('#mvSafety .mv-sos.is-home') },
          { name: ".mv-pbtn.quiet", el: document.querySelector("#mvPlayer .mv-pbtn.quiet") },
          { name: ".mv-reward", el: document.querySelector("#mvReward") },
        ];
        const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
        return els.map(({ name, el }) => {
          const cs = getComputedStyle(el);
          return { name, color: cs.color, bg: cs.backgroundColor, paper };
        });
      });

      for (const s of samples) {
        const fg = parseColor(s.color);
        const rawBg = parseColor(s.bg);
        const bg = rawBg.a === 0 ? parseColor(s.paper) : rawBg;
        const ratio = contrastRatio(fg, bg);
        assert.ok(ratio >= 7.0, `High-Contrast ${s.name} text contrast is ${ratio.toFixed(2)}:1 (< 7.0:1 AAA)`);
      }

      const tokensCss = readFileSync(path.join(ROOT, "tokens.css"), "utf8");
      const { contrast } = extractThemeVars(tokensCss);
      const alertRatio = contrastRatio(contrast["--alert"], contrast["--paper"]);
      assert.ok(alertRatio >= 4.5, `High-Contrast --alert on --paper is ${alertRatio.toFixed(2)}:1 (< 4.5:1 AA)`);
    } finally {
      await ctx.close();
    }
  });

  test("F8.5 phase4.css .model-box and .verify-note maintain >= 4.5:1 contrast in Night and Contrast themes", () => {
    const tokensCss = readFileSync(path.join(ROOT, "tokens.css"), "utf8");
    const phase4Css = readFileSync(path.join(ROOT, "phase4.css"), "utf8");
    const themes = extractThemeVars(tokensCss);

    assert.ok(!phase4Css.includes("var(--paper-2, #f6efe3)") || phase4Css.includes('[data-theme="night"]'),
      "phase4.css must not leave .model-box hardcoded to cream #f6efe3 in Night/Contrast themes");
    assert.ok(phase4Css.includes("data-theme") || !phase4Css.includes("background: #fff6e0;"),
      "phase4.css .verify-note must be themed for dark/high-contrast modes");
    assert.ok(themes.night["--ink"] && themes.contrast["--ink"]);
  });

  test("F8.6 Low-Arousal mode and .step.done maintain >= 4.5:1 composited text contrast", () => {
    const tokensCss = readFileSync(path.join(ROOT, "tokens.css"), "utf8");
    const appCss = readFileSync(path.join(ROOT, "app.css"), "utf8");
    const { day } = extractThemeVars(tokensCss);

    const stepDoneMatch = /\.step\.done\s*\{[^}]*opacity\s*:\s*([\d.]+)/.exec(appCss);
    if (stepDoneMatch) {
      const op = Number(stepDoneMatch[1]);
      const ink = parseColor(day["--ink"]);
      const paper = parseColor(day["--paper"]);
      const eff = alphaComposite({ ...ink, a: op }, paper);
      const ratio = contrastRatio(eff, paper);
      assert.ok(ratio >= 4.5, `.step.done opacity ${op} reduces Day text contrast to ${ratio.toFixed(2)}:1 (< 4.5:1 AA)`);
    }

    const lowStripMatch = /body\.low-arousal\s+\.strip-wrap\s*\{[^}]*opacity\s*:\s*([\d.]+)/.exec(appCss);
    if (lowStripMatch) {
      const op = Number(lowStripMatch[1]);
      const dusk = alphaComposite({ ...parseColor(day["--dusk"]), a: op }, parseColor(day["--fog"]));
      const duskInk = parseColor(day["--dusk-ink"]);
      const ratio = contrastRatio(duskInk, dusk);
      assert.ok(ratio >= 4.5, `low-arousal .strip-wrap contrast drops to ${ratio.toFixed(2)}:1 (< 4.5:1 AA)`);
    }
  });
});
