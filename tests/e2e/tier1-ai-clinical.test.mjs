import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import {
  AAC_CONVERSATION_VECTORS,
  CLINICAL_LOG_FIXTURE,
  ROOT,
  SUPERSEDES_FIXTURE,
  WATCHDOG_ADVERSARIAL_VECTORS,
  launchBrowser,
  loadAppModule,
  startStaticServer,
} from "./harness.mjs";

let staticSrv;
let browser;

before(async () => {
  staticSrv = await startStaticServer();
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
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
// Feature 14: Kokoro-82M Child-Friendly Expressive Voice Upgrade (5 tests)
// ============================================================================
describe("Tier 1 — Feature 14: Kokoro-82M Child-Friendly Expressive Voice Upgrade", () => {
  test("F14.1 ai.js KOKORO_VOICES includes af_sky, af_nicole, am_puck, and bf_isabella", async () => {
    const ai = await import("../../ai.js");
    const ids = (ai.KOKORO_VOICES || []).map((v) => v.id || v);
    for (const expected of ["af_sky", "af_nicole", "am_puck", "bf_isabella"]) {
      assert.ok(ids.includes(expected), `KOKORO_VOICES missing required preset "${expected}"`);
    }
  });

  test("F14.2 Caregiver voice selector exposes expanded Kokoro presets in My Voice", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.tapAndHold("#careBtn", 2150);
      await page.waitForFunction(() => !document.querySelector("#view-care").hidden);
      const optionValues = await page.evaluate(() =>
        [...document.querySelectorAll('#settings select[name="voice"] option')].map((o) => o.value)
      );
      const hasExpanded = ["af_sky", "af_nicole", "am_puck", "bf_isabella"]
        .every((id) => optionValues.some((v) => v.includes(id)));
      assert.ok(hasExpanded, `Voice selector must include expanded Kokoro presets; got ${optionValues.join(", ")}`);
    } finally {
      await ctx.close();
    }
  });

  test("F14.3 Child pitch/semitone & emotion prosody shaping works without extra model download", async () => {
    const speech = await loadAppModule("speech.js");
    const ai = await import("../../ai.js");
    const prosodyFn = ai.shapeProsody || ai.applyChildProsody || speech.speakUtterance;
    assert.equal(typeof prosodyFn, "function");

    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, childPitchSemitones: 3 },
        },
      });
      const calls = await page.evaluate(async () => {
        const { speakUtterance } = await import("/speech.js");
        await speakUtterance("I feel excited", { mode: "child", emotion: "excited", pitchSemitones: 3 });
        await new Promise((r) => setTimeout(r, 60));
        return window.__speechCalls;
      });
      assert.ok(calls.length >= 1, "Speech fallback must execute with prosody options");
      assert.ok(calls.at(-1).pitch >= 1.0, "Positive child semitones should preserve/raise pitch");
    } finally {
      await ctx.close();
    }
  });

  test("F14.4 Offline uncached Kokoro falls back cleanly to speechSynthesis without throwing", async () => {
    await loadAppModule("speech.js");
    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await openMyVoice(ctx, {
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "kokoro:af_sky", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.setOffline(true);
      await page.click('#grid .tile[data-w="hello"], #grid .tile[data-w="I"]');
      await page.click("#btnSpeak");
      await page.waitForFunction(() => window.__speechCalls.length > 0);
      assert.ok((await page.evaluate(() => window.__speechCalls.length)) > 0);
    } finally {
      await ctx.close();
    }
  });

  test("F14.5 ai-worker.js uses Apache-2.0 Kokoro-82M-v1.0-ONNX and zero extra proprietary voice models", () => {
    const workerSrc = readFileSync(path.join(ROOT, "ai-worker.js"), "utf8");
    assert.ok(workerSrc.includes("Kokoro-82M-v1.0-ONNX"));
    assert.ok(!/elevenlabs|playht|bark-proprietary|coqui-xtts-cpml/i.test(workerSrc));
  });
});

// ============================================================================
// Feature 15: Offline Semantic Symbol Search & Moment-to-Signal Linking (5 tests)
// ============================================================================
describe("Tier 1 — Feature 15: Offline Semantic Symbol Search & Moment-to-Signal Linking", () => {
  test("F15.1 ai-worker.js defines 'embed' task with Xenova/all-MiniLM-L6-v2 and ai.js exposes MODELS.embed", async () => {
    const workerSrc = readFileSync(path.join(ROOT, "ai-worker.js"), "utf8");
    assert.ok(workerSrc.includes("all-MiniLM-L6-v2"), "ai-worker.js must configure Xenova/all-MiniLM-L6-v2");
    assert.ok(/["']embed["']/.test(workerSrc), "ai-worker.js must handle 'embed' task");

    const ai = await import("../../ai.js");
    assert.ok(ai.MODELS?.embed, "ai.js MODELS must declare 'embed' metadata");
    assert.ok(ai.MODELS.embed.id.includes("all-MiniLM-L6-v2"));
  });

  test("F15.2 ai.js / embed fallback ranks semantically similar AAC concepts offline without CDN", async () => {
    const ai = await import("../../ai.js");
    const embedFn = ai.embedText || ai.semanticSimilarity || ai.semanticSearch;
    assert.equal(typeof embedFn, "function", "ai.js must export deterministic offline semantic search/embed helper");

    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await openMyVoice(ctx);
      await page.setOffline(true);
      const ranked = await page.evaluate(async () => {
        const mod = await import("/ai.js");
        if (typeof mod.semanticSearch === "function") {
          return mod.semanticSearch("thirsty beverage", [
            { id: "drink", text: "drink water juice milk" },
            { id: "shoes", text: "put on shoes coat" },
          ]);
        }
        const q = await mod.embedText("thirsty beverage");
        const d1 = await mod.embedText("drink water juice");
        const d2 = await mod.embedText("put on shoes");
        const dot = (a, b) => a.reduce((s, x, i) => s + x * (b[i] || 0), 0);
        return dot(q, d1) > dot(q, d2) ? [{ id: "drink" }, { id: "shoes" }] : [{ id: "shoes" }, { id: "drink" }];
      });
      assert.equal(ranked[0].id, "drink", "Offline semantic search must rank 'drink' above 'shoes' for 'thirsty beverage'");
    } finally {
      await ctx.close();
    }
  });

  test("F15.3 Bridge smart() Moment-to-Signal linking matches semantically related moment offline", async () => {
    const ai = await import("../../ai.js");
    assert.ok(ai.MODELS?.embed || typeof ai.semanticSearch === "function");

    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await ctx.newPage();
      await page.goto(`${staticSrv.baseUrl}/bridge.html`);
      await page.waitForSelector("#tab-today");
      if (await page.evaluate(() => Boolean(document.querySelector("#onboard[open]")))) {
        await page.click("#obSkip");
      }
      await page.setOffline(true);
      await page.evaluate(() => {
        const db = window.__bridge.db;
        db.signals.push({
          id: "s_hyd", name: "Thirst cue", cues: ["reaches for cup"], meaning: "Needs hydration beverage",
          phrase: "I want water", confirmations: 5, rejections: 0, contexts: ["home"], created: Date.now(),
        });
        db.moments.unshift({
          id: "m_thirst", t: Date.now(), kind: "audio", dur: 10, context: "kitchen",
          aac: [], meaning: "", by: "parent", signalId: null, media: null,
        });
        window.__bridge.save();
        window.__bridge.show("today");
      });
      await page.waitForSelector(".moment button, #moments button");
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) => /explain|annotate|edit/i.test(b.textContent));
        btn?.click();
      });
      await page.waitForSelector("#annotate[open]");
      await page.fill("#annText", "Child looks thirsty and points at empty cup");
      await page.waitForFunction(() => {
        const txt = document.querySelector("#annSmart")?.textContent || "";
        return txt.includes("Thirst cue") || txt.trim().length > 0;
      });
      const smartTxt = await page.evaluate(() => document.querySelector("#annSmart")?.textContent || "");
      assert.ok(/thirst/i.test(smartTxt), `Bridge smart() should semantically link 'thirst/cup' moment to 'Thirst cue', got "${smartTxt}"`);
    } finally {
      await ctx.close();
    }
  });

  test("F15.4 My Voice semantic symbol search surfaces 'drink'/'water' for 'thirsty' offline", async () => {
    const ai = await import("../../ai.js");
    assert.ok(ai.MODELS?.embed);

    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await openMyVoice(ctx);
      await page.setOffline(true);
      const searchSel = await page.evaluate(() => {
        const inp = [...document.querySelectorAll("input[type='search'], input[placeholder*='search' i], input[aria-label*='search' i]")]
          .find((el) => el.offsetParent !== null);
        if (!inp) return null;
        if (!inp.id) inp.id = "__e2e_sem_search";
        return `#${inp.id}`;
      });
      assert.ok(searchSel, "Vocab search input must exist");
      await page.typeText(searchSel, "thirsty");
      await page.waitForFunction(() => /drink|water|thirsty/i.test(document.body.innerText));
      assert.ok(true);
    } finally {
      await ctx.close();
    }
  });

  test("F15.5 Blocked HuggingFace/jsDelivr CDN never crashes or hangs semantic search", async () => {
    const ai = await import("../../ai.js");
    assert.ok(ai.MODELS?.embed);
    const ctx = await browser.newContext({ blockExternal: true });
    try {
      const page = await openMyVoice(ctx);
      const t0 = Date.now();
      const ok = await page.evaluate(async () => {
        const mod = await import("/ai.js");
        if (typeof mod.semanticSearch === "function") {
          const out = await mod.semanticSearch("hungry", [{ id: "eat", text: "eat food snack" }]);
          return Array.isArray(out) && out.length > 0;
        }
        return false;
      });
      assert.ok(ok, "Semantic search must succeed offline with deterministic fallback");
      assert.ok(Date.now() - t0 < 2000, "Offline fallback must resolve immediately (<2s)");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 16: Opt-In Telegraphic Expansion + K-Dense BYOK & Watchdog (6 tests)
// ============================================================================
describe("Tier 1 — Feature 16: Telegraphic Expansion + K-Dense BYOK & Watchdog", () => {
  test("F16.1 ai-worker.js configures SmolLM2-135M-Instruct-ONNX-MHA 'expand' task and byok.js exists", async () => {
    const workerSrc = readFileSync(path.join(ROOT, "ai-worker.js"), "utf8");
    assert.ok(workerSrc.includes("SmolLM2-135M-Instruct-ONNX-MHA"), "ai-worker.js must configure SmolLM2-135M-Instruct-ONNX-MHA");
    assert.ok(/["']expand["']/.test(workerSrc), "ai-worker.js must handle 'expand' task");

    const byok = await loadAppModule("byok.js");
    assert.equal(typeof byok.expandUtterance, "function", "byok.js must export expandUtterance");
    assert.equal(typeof (byok.watchdogCheck || byok.validateExpansion), "function", "byok.js must export Watchdog validator");
  });

  test("F16.2 Default 'on-device' mode expands AACConversations telegraphic vectors with 0 external fetch calls", async () => {
    const byok = await loadAppModule("byok.js");
    let fetchCount = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCount += 1;
      throw new Error("External fetch forbidden in on-device mode");
    };
    try {
      for (const vec of AAC_CONVERSATION_VECTORS.slice(0, 3)) {
        const res = await byok.expandUtterance(vec.words, { mode: "on-device", context: vec.context });
        const candidates = res.candidates || (res.text ? [res.text] : []);
        assert.ok(candidates.length >= 1, `Expected expansion candidate for ${vec.words.join(" ")}`);
        const text = String(candidates[0].text || candidates[0]);
        assert.ok(text.length <= 120, `Candidate exceeded 120 chars: ${text}`);
        assert.ok(
          vec.mustPreserve.some((w) => text.toLowerCase().includes(w.toLowerCase())),
          `Candidate "${text}" dropped core intent (${vec.mustPreserve.join("/")})`
        );
      }
      assert.equal(fetchCount, 0, "on-device mode must make 0 external fetch calls");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("F16.3 'ollama' mode calls only localhost:11434 and falls back deterministically when unreachable", async () => {
    const byok = await loadAppModule("byok.js");
    const urls = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      throw new Error("ECONNREFUSED");
    };
    try {
      const res = await byok.expandUtterance(["I", "want", "water"], { mode: "ollama" });
      assert.ok(urls.length === 0 || urls.every((u) => u.startsWith("http://localhost:11434")), `Ollama must only target localhost:11434, got ${urls}`);
      const candidates = res.candidates || (res.text ? [res.text] : []);
      assert.ok(candidates.length >= 1, "Must fall back deterministically when Ollama is unreachable");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("F16.4 'api' mode refuses external egress when egressAck is false/missing", async () => {
    const byok = await loadAppModule("byok.js");
    let fetchCount = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "I want water." } }] }), { status: 200 });
    };
    try {
      const res = await byok.expandUtterance(["I", "want", "water"], {
        mode: "api",
        apiKey: "sk-test-123",
        endpoint: "https://api.example.test/v1/chat/completions",
        egressAck: false,
      });
      assert.equal(fetchCount, 0, "API mode MUST NOT call fetch without explicit egressAck === true");
      assert.ok(res.egressBlocked || res.error || res.fallback, "Must indicate egress acknowledgement required");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("F16.5 Deterministic Watchdog rejects oversized (>120), intent-dropping, and unsafe/PII candidates", async () => {
    const byok = await loadAppModule("byok.js");
    const watchdog = byok.watchdogCheck || byok.validateExpansion;
    for (const vec of WATCHDOG_ADVERSARIAL_VECTORS) {
      const verdict = watchdog(vec.candidate, vec.input);
      const passed = typeof verdict === "boolean" ? verdict : Boolean(verdict?.ok ?? verdict?.valid);
      assert.equal(passed, false, `Watchdog MUST reject adversarial vector "${vec.name}": ${vec.candidate}`);
    }
  });

  test("F16.6 Opt-in expansion NEVER auto-mutates #stripWords until child taps a candidate chip", async () => {
    await loadAppModule("byok.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('#grid .tile[data-w="I"]');
      await page.click('#grid .tile[data-w="want"]');
      await page.click('#grid .tile[data-w="water"], #folders .folder[data-f="food"]');
      const beforeStrip = await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim());

      await page.evaluate(async () => {
        const { expandUtterance } = await import("/byok.js");
        await expandUtterance(["I", "want", "water"], { mode: "on-device" });
      });
      const afterStrip = await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim());
      assert.equal(afterStrip, beforeStrip, "Expansion must never overwrite #stripWords without explicit child selection");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 17: K-Dense Clinical Traceability, supersedes History & Export (6 tests)
// ============================================================================
describe("Tier 1 — Feature 17: Clinical Traceability, supersedes History & SLP Export", () => {
  test("F17.1 clinical.js returns Draft banner and grounded facts citing input record IDs", async () => {
    const clinical = await loadAppModule("clinical.js");
    const summarize = clinical.summarizeClinical || clinical.generateInsights || clinical.buildClinicalSummary;
    assert.equal(typeof summarize, "function", "clinical.js must export clinical summary function");

    const out = summarize({ log: CLINICAL_LOG_FIXTURE, moments: [], signals: [] });
    assert.equal(out.banner, "Draft / Estimate — Caregiver or SLP review required");
    assert.ok(Array.isArray(out.facts) && out.facts.length > 0, "Clinical summary must provide explicit source facts");
    for (const f of out.facts) {
      assert.ok(f.id && f.source && f.detail, "Each fact must carry id, source, and detail");
    }
  });

  test("F17.2 clinical.js classifies Communication Matrix functions (Requesting/Protesting/Commenting/Social/Asking)", async () => {
    const clinical = await loadAppModule("clinical.js");
    const summarize = clinical.summarizeClinical || clinical.generateInsights || clinical.buildClinicalSummary;
    const out = summarize({ log: CLINICAL_LOG_FIXTURE, moments: [], signals: [] });
    const fns = out.metrics?.functions || {};
    for (const k of ["Requesting", "Protesting", "Commenting", "Social", "Asking"]) {
      assert.equal(fns[k], 1, `Expected count 1 for Communication Matrix function ${k}, got ${fns[k]}`);
    }
  });

  test("F17.3 clinical.js isolates child MLU, uniqueWords, and coreRatio from modeling turns", async () => {
    const clinical = await loadAppModule("clinical.js");
    const summarize = clinical.summarizeClinical || clinical.generateInsights || clinical.buildClinicalSummary;
    const out = summarize({ log: CLINICAL_LOG_FIXTURE, moments: [], signals: [] });
    assert.equal(out.metrics.childCount, 5);
    assert.equal(out.metrics.modeledCount, 1);
    assert.ok(Math.abs(out.metrics.mlu - 2.2) < 0.01, `Expected MLU 2.2 (excluding 4-word modeled turn), got ${out.metrics.mlu}`);
    assert.equal(out.metrics.uniqueWords, 11, "Partner-only words ('you', 'more', 'pizza') must be excluded from child uniqueWords");
    assert.ok(out.metrics.coreRatio > 0.45 && out.metrics.coreRatio < 0.65, `Unexpected coreRatio ${out.metrics.coreRatio}`);
  });

  test("F17.4 Append-only supersedes history preserves prior records and reconstructs ordered lineage", async () => {
    const clinical = await loadAppModule("clinical.js");
    const appendRev = clinical.appendRevision || clinical.addRevision;
    const getLineage = clinical.getRevisionLineage || clinical.resolveHistory;
    assert.equal(typeof appendRev, "function", "clinical.js must export appendRevision");
    assert.equal(typeof getLineage, "function", "clinical.js must export getRevisionLineage");

    let store = [];
    for (const rev of SUPERSEDES_FIXTURE) store = appendRev(store, rev);
    assert.equal(store.length, 3, "All revisions must be preserved append-only (never overwritten)");
    const lineage = getLineage(store, "m1");
    assert.deepEqual(lineage.map((r) => r.id), ["rev1", "rev2", "rev3"]);
    assert.equal(lineage.at(-1).meaning, "Wants cold peeled apple slices");
  });

  test("F17.5 clinical.js exports RFC 4180 CSV and JSON for SLP handoff", async () => {
    const clinical = await loadAppModule("clinical.js");
    const toCsv = clinical.exportClinicalCSV || clinical.toCSV;
    const toJson = clinical.exportClinicalJSON || clinical.toJSON;
    assert.equal(typeof toCsv, "function", "clinical.js must export CSV exporter");
    assert.equal(typeof toJson, "function", "clinical.js must export JSON exporter");

    const csv = toCsv({ log: CLINICAL_LOG_FIXTURE, moments: [], signals: [] });
    assert.ok(typeof csv === "string" && csv.includes("Requesting") && csv.includes("\n"), "CSV export must have rows & headers");
    const jsonStr = toJson({ log: CLINICAL_LOG_FIXTURE, moments: [], signals: [] });
    const parsed = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
    assert.equal(parsed.banner, "Draft / Estimate — Caregiver or SLP review required");
  });

  test("F17.6 masternex-prince-fl.js integrates cleanly with fl-core / backend FL with finite RDP epsilon", async () => {
    const prince = await import("../../masternex-prince-fl.js");
    const flCoreSrc = readFileSync(path.join(ROOT, "fl-core.js"), "utf8");
    const flServerSrc = readFileSync(path.join(ROOT, "backend/flserver.js"), "utf8");
    assert.ok(
      flCoreSrc.includes("masternex-prince-fl") || flServerSrc.includes("masternex-prince-fl"),
      "masternex-prince-fl.js must be integrated into fl-core.js or backend/flserver.js"
    );
    const pkg = prince.compressClientUpdate(new Float32Array([0.1, -0.2, 0.3]), 0.3, 1.0);
    assert.ok(Number.isFinite(pkg.rdp_epsilon) && pkg.rdp_epsilon > 0);
  });
});

// ============================================================================
// Feature 18: Research Evaluation, Clinical Rationale & Docs + License Audit (5 tests)
// ============================================================================
describe("Tier 1 — Feature 18: Research Evaluation, Documentation & License Audit", () => {
  test("F18.1 docs/RESEARCH_EVALUATION.md exists and evaluates HuggingFace, K-Dense, GitHub, and SLP/Autism candidates", () => {
    const docPath = path.join(ROOT, "docs", "RESEARCH_EVALUATION.md");
    assert.ok(existsSync(docPath), "docs/RESEARCH_EVALUATION.md must exist");
    const txt = readFileSync(docPath, "utf8");
    for (const term of ["HuggingFace", "K-Dense", "GitHub", "Kokoro", "all-MiniLM-L6-v2", "SmolLM2", "AACConversations", "Apache-2.0"]) {
      assert.ok(txt.toLowerCase().includes(term.toLowerCase()), `RESEARCH_EVALUATION.md missing "${term}"`);
    }
  });

  test("F18.2 README.md, RESEARCH-OSS.md, ACCESSIBILITY.md, and THIRD-PARTY.md reflect new modules & features", () => {
    const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
    const research = readFileSync(path.join(ROOT, "RESEARCH-OSS.md"), "utf8");
    const a11y = readFileSync(path.join(ROOT, "ACCESSIBILITY.md"), "utf8");
    const third = readFileSync(path.join(ROOT, "THIRD-PARTY.md"), "utf8");

    assert.ok(readme.includes("speech.js") && readme.includes("clinical.js"), "README.md must document new modules");
    assert.ok(research.includes("all-MiniLM-L6-v2") && research.includes("AACConversations"), "RESEARCH-OSS.md must cover new HF/GitHub picks");
    assert.ok(/two-switch|2-switch/i.test(a11y) && /row-column/i.test(a11y) && /pointer/i.test(a11y), "ACCESSIBILITY.md must document upgraded access ergonomics");
    assert.ok(third.includes("all-MiniLM-L6-v2") && third.includes("SmolLM2"), "THIRD-PARTY.md must declare new runtime models");
  });

  test("F18.3 License audit: zero GPL, AGPL, or CC BY-NC-SA bundled assets in repo", () => {
    const third = readFileSync(path.join(ROOT, "THIRD-PARTY.md"), "utf8");
    const vendorEntries = readdirSync(path.join(ROOT, "vendor"));
    assert.ok(!vendorEntries.some((n) => /arasaac/i.test(n)), "ARASAAC (CC BY-NC-SA) must remain online-only, never bundled in vendor/");
    const swText = readFileSync(path.join(ROOT, "sw.js"), "utf8");
    assert.ok(!/arasaac/i.test(swText), "sw.js must not precache CC BY-NC-SA ARASAAC assets");
    assert.ok(!/\bAGPL\b|\bGPL-3\.0\b|\bGPL-2\.0\b/i.test(third), "THIRD-PARTY.md must not introduce copyleft GPL/AGPL deps");
  });

  test("F18.4 Every vendored subdirectory in vendor/ is documented in THIRD-PARTY.md", () => {
    const third = readFileSync(path.join(ROOT, "THIRD-PARTY.md"), "utf8").toLowerCase();
    const dirs = readdirSync(path.join(ROOT, "vendor"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name.toLowerCase());
    for (const d of dirs) {
      assert.ok(third.includes(d), `Vendored directory vendor/${d} must be attributed in THIRD-PARTY.md`);
    }
  });

  test("F18.5 ACCESSIBILITY.md no longer claims two-switch scanning is missing and documents low-arousal/contrast", () => {
    const a11y = readFileSync(path.join(ROOT, "ACCESSIBILITY.md"), "utf8");
    assert.ok(!/two-switch step scanning not built/i.test(a11y), "ACCESSIBILITY.md must remove stale 'two-switch step scanning not built' note");
    assert.ok(/low-arousal|contrast/i.test(a11y), "ACCESSIBILITY.md must document contrast & low-arousal compliance");
  });
});
