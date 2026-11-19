import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  FOOD_OBF,
  VALID_OBF,
  VALID_OBZ_ENTRIES,
  buildZip,
  launchBrowser,
  loadAppModule,
  startStaticServer,
} from "./harness.mjs";
import { CORE, PLANS } from "../../vocab.js";

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
// Feature 9: Aided Language Stimulation (ALS) Modeling Mode (5 tests)
// ============================================================================
describe("Tier 1 — Feature 9: Aided Language Stimulation (ALS) Modeling Mode", () => {
  test("F9.1 My Voice exposes accessible Modeling Mode toggle and displays active banner when enabled", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const toggleSel = await page.evaluate(() => {
        const candidates = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")];
        const match = candidates.find((el) => {
          const text = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.id || ""}`;
          return /model/i.test(text);
        });
        if (!match) return null;
        if (!match.id) match.id = "__e2e_model_toggle";
        return `#${match.id}`;
      });
      assert.ok(toggleSel, "My Voice must expose an accessible Modeling Mode toggle");
      await page.click(toggleSel);
      await page.waitForFunction(() => {
        const bodyText = document.body.innerText;
        const hasFlag = document.body.classList.contains("is-modeling") || document.documentElement.dataset.modeling === "true";
        return hasFlag || /modeling mode|partner modeling/i.test(bodyText);
      });
      assert.ok(true);
    } finally {
      await ctx.close();
    }
  });

  test("F9.2 Tapping Core tiles in Modeling Mode logs mode='modeling' and actor='partner'", async () => {
    await loadAppModule("speech.js");
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const toggled = await page.evaluate(() => {
        const el = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")]
          .find((n) => /model/i.test(`${n.textContent || ""} ${n.getAttribute("aria-label") || ""} ${n.id || ""}`));
        if (!el) return false;
        el.click();
        return true;
      });
      assert.ok(toggled, "Modeling toggle must exist");
      await page.click('#grid .tile[data-w="I"]');
      await page.click('#grid .tile[data-w="want"]');
      await page.click("#btnSpeak");
      await new Promise((r) => setTimeout(r, 80));

      const log = await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:log") || "[]"));
      assert.ok(log.length >= 1, "Modeled utterance must log to luminaac:log");
      assert.ok(log.every((e) => e.mode === "modeling" && e.actor === "partner"), "Modeled logs must carry mode='modeling', actor='partner'");
    } finally {
      await ctx.close();
    }
  });

  test("F9.3 Modeling Mode NEVER increments luminaac:counts or luminaac:pairs", async () => {
    await loadAppModule("speech.js");
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.evaluate(() => {
        localStorage.setItem("luminaac:counts", JSON.stringify({ want: 2 }));
        localStorage.setItem("luminaac:pairs", JSON.stringify({ i: { want: 2 } }));
        const el = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")]
          .find((n) => /model/i.test(`${n.textContent || ""} ${n.getAttribute("aria-label") || ""} ${n.id || ""}`));
        el?.click();
      });
      await page.click('#grid .tile[data-w="I"]');
      await page.click('#grid .tile[data-w="want"]');
      await page.click('#grid .tile[data-w="more"]');
      await page.click("#btnSpeak");
      await new Promise((r) => setTimeout(r, 80));

      const stats = await page.evaluate(() => ({
        counts: JSON.parse(localStorage.getItem("luminaac:counts") || "{}"),
        pairs: JSON.parse(localStorage.getItem("luminaac:pairs") || "{}"),
      }));
      assert.deepEqual(stats.counts, { want: 2 }, "Modeling Mode must NOT modify luminaac:counts");
      assert.deepEqual(stats.pairs, { i: { want: 2 } }, "Modeling Mode must NOT modify luminaac:pairs");
    } finally {
      await ctx.close();
    }
  });

  test("F9.4 Modeling Mode creates visual highlight trail while preserving invariant 30 CORE tile positions", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.evaluate(() => {
        const el = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")]
          .find((n) => /model/i.test(`${n.textContent || ""} ${n.getAttribute("aria-label") || ""} ${n.id || ""}`));
        el?.click();
      });
      await page.click('#grid .tile[data-w="want"]');
      const state = await page.evaluate(() => {
        const tile = document.querySelector('#grid .tile[data-w="want"]');
        const hasTrail = tile.classList.contains("is-modeled") || tile.classList.contains("modeled") || tile.hasAttribute("data-modeled");
        const coreWords = [...document.querySelectorAll("#grid .tile")].map((e) => e.dataset.w).slice(0, 30);
        return { hasTrail, coreWords };
      });
      assert.ok(state.hasTrail, "Modeled tile must display visual highlight trail");
      assert.deepEqual(state.coreWords, CORE.map((c) => c.w), "CORE positions must remain invariant during modeling");
    } finally {
      await ctx.close();
    }
  });

  test("F9.5 db.access.modelingAudio=false makes Modeling Mode silent (visual-only)", async () => {
    await loadAppModule("speech.js");
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "standard", size: 100, dwell: 0, scan: false, scanMs: 1500, safety: true, modelingAudio: false },
        },
        settings: { theme: "day", cols: "6", pictos: false, labelsTop: false, voice: "", rate: 1, speakOnTap: true, stillness: false },
      });
      await page.evaluate(() => {
        const el = [...document.querySelectorAll("button, input[type=checkbox], [role=switch]")]
          .find((n) => /model/i.test(`${n.textContent || ""} ${n.getAttribute("aria-label") || ""} ${n.id || ""}`));
        el?.click();
      });
      await page.click('#grid .tile[data-w="want"]');
      await page.click("#btnSpeak");
      await new Promise((r) => setTimeout(r, 80));

      const res = await page.evaluate(() => ({
        calls: window.__speechCalls.length,
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
      }));
      assert.equal(res.calls, 0, "Silent modeling mode must emit 0 speech calls");
      assert.ok(res.log.some((e) => e.mode === "modeling"), "Silent modeling must still record partner modeling log");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 10: Gestalt Language Processing (GLP / NLA) Script Bank (5 tests)
// ============================================================================
describe("Tier 1 — Feature 10: Gestalt Language Processing (GLP / NLA) Script Bank", () => {
  test("F10.1 slp.js exports GLP/NLA helpers and My Voice renders Gestalts section", async () => {
    const slp = await loadAppModule("slp.js");
    assert.ok(typeof slp.mitigateGestalt === "function" || typeof slp.renderGestalts === "function" || typeof slp.getGestalts === "function",
      "slp.js must export GLP/NLA gestalt helpers");

    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const hasGestaltsUi = await page.evaluate(() => Boolean(
        document.querySelector("#mvGestalts, [data-gestalts], .mv-gestalts") ||
        /gestalt|script/i.test(document.body.innerText)
      ));
      assert.ok(hasGestaltsUi, "My Voice must render GLP/NLA Gestalts/Scripts UI");
    } finally {
      await ctx.close();
    }
  });

  test("F10.2 Caregiver gestalt with NLA stage tag persists in luminaac:bridge and syncs to My Voice", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          gestalts: [{ id: "g1", text: "To infinity and beyond!", stage: 1, meaning: "Ready to go" }],
        },
      });
      const visible = await page.evaluate(() => document.body.innerText.includes("To infinity and beyond!"));
      assert.ok(visible, "Seeded gestalt script must render in My Voice");
    } finally {
      await ctx.close();
    }
  });

  test("F10.3 Stage 1 one-tap gestalt speaks full phrase verbatim and logs mode='child'", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          gestalts: [{ id: "g1", text: "To infinity and beyond!", stage: 1 }],
        },
      });
      const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("To infinity and beyond!"));
        if (!btn) return false;
        btn.click();
        return true;
      });
      assert.ok(clicked, "Stage 1 gestalt button must exist");
      await page.waitForFunction(() => window.__speechCalls.length > 0);
      const res = await page.evaluate(() => ({
        calls: window.__speechCalls,
        log: JSON.parse(localStorage.getItem("luminaac:log") || "[]"),
      }));
      assert.ok(res.calls.some((c) => c.text.includes("To infinity and beyond!")), "Stage 1 must speak verbatim");
      assert.ok(res.log.some((e) => e.text.includes("To infinity and beyond!") && e.mode === "child"));
    } finally {
      await ctx.close();
    }
  });

  test("F10.4 Stage 2 mitigate-into-strip loads editable chunks into #stripWords", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          gestalts: [{ id: "g2", text: "Let's go to the park", stage: 2 }],
        },
      });
      const mitigated = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) =>
          /mitigate|edit.*strip|mix/i.test(`${b.textContent} ${b.getAttribute("aria-label") || ""}`)
        );
        if (!btn) return false;
        btn.click();
        return true;
      });
      assert.ok(mitigated, "Stage 2 gestalt must provide a Mitigate / Edit-into-strip action");
      const stripText = await page.evaluate(() => document.querySelector("#stripWords")?.textContent?.trim() || "");
      assert.ok(stripText.includes("park") && stripText.includes("go"), `Expected mitigated chunks in strip, got "${stripText}"`);
    } finally {
      await ctx.close();
    }
  });

  test("F10.5 GLP gestalt preserves optional audioClipId and momentId metadata across bridge sync", async () => {
    const slp = await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          gestalts: [{ id: "g_clip", text: "Time for music!", stage: 1, audioClipId: "clip_42", momentId: "m1" }],
        },
      });
      const stored = await page.evaluate(() => {
        const db = JSON.parse(localStorage.getItem("luminaac:bridge") || "{}");
        return (db.gestalts || []).find((g) => g.id === "g_clip");
      });
      assert.ok(slp && stored, "Gestalt entry must persist in luminaac:bridge");
      assert.equal(stored.audioClipId, "clip_42");
      assert.equal(stored.momentId, "m1");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 11: Interoception Pain Body Map & Sensory Quick-Bar (5 tests)
// ============================================================================
describe("Tier 1 — Feature 11: Interoception Pain Body Map & Sensory Quick-Bar", () => {
  test("F11.1 Sensory Quick-Bar exposes Stop, No, Help, Bathroom, Break in 1 tap on Talk view", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const found = await page.evaluate(() => {
        const bar = document.querySelector("#mvSensoryBar, #quick, [aria-label*='sensory' i], [aria-label*='quick' i]");
        if (!bar) return [];
        return [...document.querySelectorAll("#view-talk button")]
          .filter((b) => b.offsetParent !== null)
          .map((b) => b.textContent.trim().toLowerCase());
      });
      for (const word of ["stop", "no", "help", "bathroom", "break"]) {
        assert.ok(found.some((t) => t.includes(word)), `Sensory Quick-Bar must keep "${word}" reachable in 1 tap`);
      }
    } finally {
      await ctx.close();
    }
  });

  test("F11.2 Interoception Pain Body Map renders keyboard-accessible body regions", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('nav.nav button[data-view="calm"]');
      const regions = await page.evaluate(() => {
        const btns = [...document.querySelectorAll("#view-calm button, [data-body-part]")]
          .map((b) => `${b.dataset.bodyPart || ""} ${b.textContent}`.trim().toLowerCase());
        return btns;
      });
      for (const part of ["head", "stomach", "ear"]) {
        assert.ok(regions.some((r) => r.includes(part)), `Pain Body Map must expose accessible "${part}" region`);
      }
    } finally {
      await ctx.close();
    }
  });

  test("F11.3 Selecting body region + sensation descriptor speaks body-pain utterance", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('nav.nav button[data-view="calm"]');
      const ok = await page.evaluate(() => {
        const stomach = [...document.querySelectorAll("button")].find((b) => /stomach/i.test(b.textContent) && b.offsetParent !== null);
        const hurts = [...document.querySelectorAll("button")].find((b) => /hurts/i.test(b.textContent) && b.offsetParent !== null);
        if (!stomach || !hurts) return false;
        stomach.click();
        hurts.click();
        return true;
      });
      assert.ok(ok, "Body region 'stomach' and sensation 'hurts' must be clickable");
      await page.waitForFunction(() => window.__speechCalls.length > 0);
      const calls = await page.evaluate(() => window.__speechCalls);
      assert.ok(calls.some((c) => /stomach/i.test(c.text) && /hurt/i.test(c.text)), "Must speak stomach hurts utterance");
    } finally {
      await ctx.close();
    }
  });

  test("F11.4 Selecting body region + sensation surfaces 1-tap relief choices", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('nav.nav button[data-view="calm"]');
      const relief = await page.evaluate(() => {
        const stomach = [...document.querySelectorAll("button")].find((b) => /stomach/i.test(b.textContent) && b.offsetParent !== null);
        const hurts = [...document.querySelectorAll("button")].find((b) => /hurts/i.test(b.textContent) && b.offsetParent !== null);
        if (!stomach || !hurts) return [];
        stomach.click();
        hurts.click();
        return [...document.querySelectorAll("#view-calm button")]
          .filter((b) => b.offsetParent !== null)
          .map((b) => b.textContent.trim().toLowerCase());
      });
      assert.ok(relief.some((t) => /water|rest|bathroom|help|quiet/.test(t)), "Pain selection must surface linked relief choices");
    } finally {
      await ctx.close();
    }
  });

  test("F11.5 Interoception Pain Body Map regions are reachable during switch scanning", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          access: { mode: "switch", scanMode: "two-switch", size: 100, dwell: 0, scan: true, scanMs: 5000, safety: true },
        },
      });
      await page.click('nav.nav button[data-view="calm"]');
      const scannable = await page.evaluate(() => {
        const stomach = [...document.querySelectorAll("button")].find((b) => /stomach/i.test(b.textContent) && b.offsetParent !== null);
        return Boolean(stomach && !stomach.disabled && stomach.closest("main"));
      });
      assert.ok(scannable, "Body map buttons inside <main> must be visible, enabled, and scannable");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 12: Customizable Choice Boards & Unified First-Then / Schedules (5 tests)
// ============================================================================
describe("Tier 1 — Feature 12: Customizable Choice Boards & Unified First-Then / Schedules", () => {
  test("F12.1 Choice Board with 2-8 options renders in My Voice and speaks selected choice", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          choiceBoards: [
            {
              id: "cb1",
              title: "Snack Choice",
              options: [
                { label: "Apple", e: "🍎" },
                { label: "Crackers", e: "🍘" },
                { label: "Banana", e: "🍌" },
              ],
            },
          ],
        },
      });
      const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Crackers"));
        if (!btn) return false;
        btn.click();
        return true;
      });
      assert.ok(clicked, "Choice board option 'Crackers' must render as clickable button");
      await page.waitForFunction(() => window.__speechCalls.length > 0);
      const log = await page.evaluate(() => JSON.parse(localStorage.getItem("luminaac:log") || "[]"));
      assert.ok(log.some((e) => e.text.includes("Crackers") && e.mode === "child"));
    } finally {
      await ctx.close();
    }
  });

  test("F12.2 Bridge UI allows creating and persisting a customizable Choice Board", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.goto(`${staticSrv.baseUrl}/bridge.html`);
      await page.waitForSelector("#tab-today");
      if (await page.evaluate(() => Boolean(document.querySelector("#onboard[open]")))) {
        await page.click("#obSkip");
      }
      await page.click('nav.tabs button[data-tab="routines"]');
      const hasChoiceForm = await page.evaluate(() => /choice/i.test(document.querySelector("#tab-routines")?.textContent || ""));
      assert.ok(hasChoiceForm, "Bridge Routines tab must expose Choice Board authoring");
    } finally {
      await ctx.close();
    }
  });

  test("F12.3 Unified First-Then / Visual Schedules merges static PLANS and dynamic db.stories routines", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx, {
        seedBridge: {
          version: 2,
          stories: [
            {
              id: "rt_custom",
              title: "After-School Routine",
              kind: "routine",
              steps: [
                { e: "🎒", text: "Hang up bag" },
                { e: "🍎", text: "Eat snack" },
              ],
            },
          ],
        },
      });
      await page.click('nav.nav button[data-view="plans"]');
      await page.waitForSelector("#planPicker button");
      const titles = await page.evaluate(() =>
        [...document.querySelectorAll("#planPicker button")].map((b) => b.textContent.trim())
      );
      assert.ok(titles.some((t) => t.includes(PLANS[0].title)), "Static PLANS must remain in unified #planPicker");
      assert.ok(titles.some((t) => t.includes("After-School Routine")), "Dynamic db.stories routine must appear in unified #planPicker");
    } finally {
      await ctx.close();
    }
  });

  test("F12.4 Editing a schedule in Bridge reflects in My Voice #plans on storage sync", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const mvPage = await openMyVoice(ctx);
      const bridgePage = await ctx.newPage();
      await bridgePage.goto(`${staticSrv.baseUrl}/bridge.html`);
      await bridgePage.waitForSelector("#tab-today");
      if (await bridgePage.evaluate(() => Boolean(document.querySelector("#onboard[open]")))) {
        await bridgePage.click("#obSkip");
      }
      await bridgePage.evaluate(() => {
        const db = window.__bridge.db;
        db.stories.push({
          id: "rt_sync",
          title: "Evening Wind-Down",
          kind: "routine",
          steps: [{ e: "📖", text: "Read story" }, { e: "🛏️", text: "Lights out" }],
        });
        window.__bridge.save("Added routine");
      });

      await mvPage.click('nav.nav button[data-view="plans"]');
      await mvPage.waitForFunction(() =>
        [...document.querySelectorAll("#planPicker button")].some((b) => b.textContent.includes("Evening Wind-Down"))
      );
      assert.ok(true);
    } finally {
      await ctx.close();
    }
  });

  test("F12.5 Completing step 1 in #view-plans advances #firstThen 'Now' and 'Next' cards", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('nav.nav button[data-view="plans"]');
      await page.waitForSelector("#steps .check-btn");
      const beforeNow = await page.evaluate(() => document.querySelector("#firstThen .ft-card.now")?.textContent || "");
      await page.click("#steps .check-btn");
      const afterNow = await page.evaluate(() => document.querySelector("#firstThen .ft-card.now")?.textContent || "");
      assert.notEqual(afterNow, beforeNow, "Checking off step 1 must advance First-Then 'Now' card");
    } finally {
      await ctx.close();
    }
  });
});

// ============================================================================
// Feature 13: Open Board Format (.obf / .obz) Import & Export + Vocab Search (6 tests)
// ============================================================================
describe("Tier 1 — Feature 13: OBF/OBZ Interoperability & Vocab Search", () => {
  test("F13.1 obf.js imports open-board-0.1 .obf preserving label, vocalization, colors, POS, and actions", async () => {
    const obf = await loadAppModule("obf.js");
    const parse = obf.parseOBF || obf.importOBF || obf.parseBoard;
    assert.equal(typeof parse, "function", "obf.js must export parseOBF/importOBF");

    const board = await parse(VALID_OBF);
    assert.equal(board.id, "core_sample");
    const drinkBtn = board.buttons.find((b) => b.id === "b3" || b.label === "drink");
    assert.equal(drinkBtn.label, "drink");
    assert.equal(drinkBtn.vocalization, "I want a drink", "Must preserve vocalization distinct from label");

    const iBtn = board.buttons.find((b) => b.id === "b1" || b.label === "I");
    assert.equal(iBtn.pos || iBtn.ext_luminaac_pos || iBtn.c, "people", "Must preserve ext_luminaac_pos Fitzgerald class");

    const actions = board.buttons.map((b) => b.action).filter(Boolean);
    for (const act of [":speak", ":backspace", ":clear", ":home", ":space"]) {
      assert.ok(actions.includes(act), `Must preserve OBF action ${act}`);
    }
  });

  test("F13.2 obf.js provides safe offline fallback when OBF image URL fails/is missing", async () => {
    const obf = await loadAppModule("obf.js");
    const parse = obf.parseOBF || obf.importOBF || obf.parseBoard;
    const board = await parse(VALID_OBF);
    const drinkBtn = board.buttons.find((b) => b.id === "b3" || b.label === "drink");
    assert.ok(drinkBtn.label === "drink", "Button label must never be blanked on missing image");
    assert.ok(!drinkBtn.brokenError, "Missing offline image must fall back gracefully without throwing");
  });

  test("F13.3 obf.js imports .obz ZIP archive and resolves root + load_board links", async () => {
    const obf = await loadAppModule("obf.js");
    const importObz = obf.importOBZ || obf.parseOBZ;
    assert.equal(typeof importObz, "function", "obf.js must export importOBZ/parseOBZ");

    const zipBytes = buildZip(VALID_OBZ_ENTRIES);
    const pkg = await importObz(new Uint8Array(zipBytes));
    assert.ok(pkg.rootBoard || pkg.root, "OBZ import must resolve root board");
    const boards = pkg.boards || pkg.byId || {};
    const food = boards.food_board || Object.values(boards).find((b) => b.id === "food_board" || b.name === "Food");
    assert.ok(food, "OBZ import must load linked food_board from manifest paths.boards");
    assert.ok(food.buttons.some((b) => b.label === "apple"));
  });

  test("F13.4 obf.js exports .obf JSON and .obz ZIP that round-trip cleanly", async () => {
    const obf = await loadAppModule("obf.js");
    const exportObf = obf.exportOBF || obf.toOBF;
    const exportObz = obf.exportOBZ || obf.toOBZ;
    const parseObf = obf.parseOBF || obf.importOBF;
    const importObz = obf.importOBZ || obf.parseOBZ;

    assert.equal(typeof exportObf, "function", "obf.js must export exportOBF");
    assert.equal(typeof exportObz, "function", "obf.js must export exportOBZ");

    const outJson = await exportObf({ id: "roundtrip", name: "Roundtrip", buttons: VALID_OBF.buttons, grid: VALID_OBF.grid });
    const parsedJson = typeof outJson === "string" ? JSON.parse(outJson) : outJson;
    assert.equal(parsedJson.format, "open-board-0.1");
    const reImported = await parseObf(parsedJson);
    assert.equal(reImported.buttons.find((b) => b.label === "drink").vocalization, "I want a drink");

    const outZip = await exportObz([VALID_OBF, FOOD_OBF], { rootId: "core_sample" });
    assert.ok(outZip instanceof Uint8Array || outZip instanceof ArrayBuffer || Buffer.isBuffer(outZip), "exportOBZ must return ZIP bytes");
    const reZip = await importObz(outZip instanceof ArrayBuffer ? new Uint8Array(outZip) : outZip);
    assert.ok(reZip.rootBoard || reZip.root);
  });

  test("F13.5 Vocab search finds words across folders without mutating 30 CORE positions", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      const searchSel = await page.evaluate(() => {
        const inp = [...document.querySelectorAll("input[type='search'], input[placeholder*='search' i], input[aria-label*='search' i]")]
          .find((el) => el.offsetParent !== null);
        if (!inp) return null;
        if (!inp.id) inp.id = "__e2e_vocab_search";
        return `#${inp.id}`;
      });
      assert.ok(searchSel, "My Voice must provide a visible vocabulary search input");
      await page.typeText(searchSel, "pizza");
      await page.waitForFunction(() => /pizza/i.test(document.body.innerText));

      await page.typeText(searchSel, "");
      const coreWords = await page.evaluate(() =>
        [...document.querySelectorAll("#grid .tile")].map((e) => e.dataset.w).slice(0, 30)
      );
      assert.deepEqual(coreWords, CORE.map((c) => c.w), "Searching vocabulary must never reorder CORE grid");
    } finally {
      await ctx.close();
    }
  });

  test("F13.6 Morphology helper bar inflects strip word (e.g. want -> wants/wanted/wanting)", async () => {
    await loadAppModule("slp.js");
    const ctx = await browser.newContext();
    try {
      const page = await openMyVoice(ctx);
      await page.click('#grid .tile[data-w="want"]');
      const inflected = await page.evaluate(() => {
        const morphBtn = [...document.querySelectorAll("button")].find((b) =>
          b.offsetParent !== null && /^(\+s|wants|\+ed|\+ing)$/i.test(b.textContent.trim())
        );
        if (!morphBtn) return null;
        morphBtn.click();
        return document.querySelector("#stripWords")?.textContent?.trim() || "";
      });
      assert.ok(inflected && /^want(s|ed|ing)$/i.test(inflected), `Expected inflected word in strip, got "${inflected}"`);
    } finally {
      await ctx.close();
    }
  });
});
