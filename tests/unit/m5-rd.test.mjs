import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VISEME_POSTURES, visemeForPhoneme, renderVisemeSvg,
  SOUND_BLOCKS, SYMPHONY_WORDS, composeSymphonyWord,
  playSymphonyNote, playSymphonySequence,
  SOUNDSCAPE_PRESETS, startSoundscape, stopSoundscape, activeSoundscapeId,
} from "../../symphony.js";
import {
  DIET_TEXTURES, GI_STATES, KP_BANDS, BIOMETRICS_BANNER,
  classifyKpIndex, estimateSolarKp, fetchLiveSolarKp,
  logDietEntry, logSolarObservation, correlateBiometrics,
} from "../../biometrics.js";
import {
  buildFirstResponderProfile, activateBlanketSearchParty,
  closeAndWipeBlanketSearchParty, buildWelfareSituationReport,
} from "../../safety-blanket.js";

describe("Round 2 R&D — Sound Symphony Composer & Lip-Viseme Articulatory Coach (symphony.js)", () => {
  it("maps phonemes to articulatory viseme postures and renders accessible SVG", () => {
    assert.equal(visemeForPhoneme("m").id, "bilabial");
    assert.equal(visemeForPhoneme("oh").id, "round-vowel");
    assert.equal(visemeForPhoneme("aa").id, "open-vowel");
    assert.equal(visemeForPhoneme("t").id, "alveolar");
    assert.equal(visemeForPhoneme("unknown-xyz").id, "rest");

    const svg = renderVisemeSvg("bilabial", { active: true });
    assert.match(svg, /<svg/);
    assert.match(svg, /data-viseme="bilabial"/);
    assert.match(svg, /aria-label=/);
  });

  it("composes 2–4 phoneme blocks into target core words and blends freeform sequences", () => {
    const more = composeSymphonyWord(["m", "oh", "r"]);
    assert.equal(more.matched, true);
    assert.equal(more.word, "more");
    assert.equal(more.notes.length, 3);
    assert.deepEqual(more.visemes, ["bilabial", "round-vowel", "round-vowel"]);

    const water = composeSymphonyWord(["w", "aa", "t", "er"]);
    assert.equal(water.matched, true);
    assert.equal(water.word, "water");
    assert.equal(water.notes.length, 4);

    const mama = composeSymphonyWord(["m", "aa", "m", "aa"]);
    assert.equal(mama.matched, true);
    assert.equal(mama.word, "mama");

    const help = composeSymphonyWord(["h", "eh", "l", "p"]);
    assert.equal(help.matched, true);
    assert.equal(help.word, "help");

    const freeform = composeSymphonyWord(["b", "aa"]);
    assert.equal(freeform.matched, false);
    assert.equal(freeform.word, "baa");
  });

  it("synthesizes pentatonic notes and manages acoustic co-regulation soundscapes cleanly in headless environments", async () => {
    assert.ok(SOUND_BLOCKS.length >= 12);
    assert.ok(SYMPHONY_WORDS.length >= 8);
    assert.equal(SOUNDSCAPE_PRESETS.length, 5);

    const noteRes = playSymphonyNote("m", { audioCtx: null });
    assert.equal(noteRes.freq, 261.63);
    assert.equal(noteRes.viseme, "bilabial");

    const visitedVisemes = [];
    const seqRes = await playSymphonySequence(["m", "oh", "r"], {
      stepMs: 15,
      onViseme: (v) => visitedVisemes.push(v),
    });
    assert.equal(seqRes.word, "more");
    assert.ok(visitedVisemes.includes("bilabial"));
    assert.equal(visitedVisemes[visitedVisemes.length - 1], "rest");

    const sc = startSoundscape("pink-shield", { audioCtx: null });
    assert.equal(sc.active, true);
    assert.equal(activeSoundscapeId(), "pink-shield");
    const stopped = stopSoundscape();
    assert.equal(stopped.stopped, true);
    assert.equal(activeSoundscapeId(), null);
  });
});

describe("Round 2 R&D — Diet/Gut-Brain & Solar/Geomagnetic Storm Kp Biometrics (biometrics.js)", () => {
  it("classifies NOAA planetary Kp index values (0–9) into geomagnetic storm bands", () => {
    const quiet = classifyKpIndex(1.7);
    assert.equal(quiet.level, "quiet");
    assert.equal(quiet.isStorm, false);

    const stormMinor = classifyKpIndex(5.4);
    assert.equal(stormMinor.level, "storm-minor");
    assert.equal(stormMinor.isStorm, true);

    const stormMajor = classifyKpIndex(7.8);
    assert.equal(stormMajor.level, "storm-major");
    assert.equal(stormMajor.isStorm, true);

    const offlineEst = estimateSolarKp(1735689600000);
    assert.equal(offlineEst.source, "offline-bartels-cycle25-model");
    assert.ok(offlineEst.kp >= 0 && offlineEst.kp <= 9);
  });

  it("fetches live NOAA Kp when mock fetch succeeds and falls back deterministically when offline", async () => {
    const live = await fetchLiveSolarKp({
      fetchImpl: async () => ({
        ok: true,
        json: async () => [
          ["time_tag", "Kp"],
          ["2026-11-18 00:00:00", "6.33"]
        ]
      })
    });
    assert.equal(live.source, "noaa-swpc-live");
    assert.equal(live.kp, 6.3);
    assert.equal(live.isStorm, true);

    const fallback = await fetchLiveSolarKp({
      fetchImpl: async () => { throw new Error("offline"); }
    });
    assert.equal(fallback.source, "offline-bartels-cycle25-model");
  });

  it("logs diet/gut-brain and solar observations and computes fact-separated correlations with draft banner", () => {
    assert.ok(DIET_TEXTURES.length >= 5);
    assert.ok(GI_STATES.length >= 4);
    assert.ok(KP_BANDS.length === 4);

    const db = { dietLog: [], solarLog: [], painLog: [], log: [] };
    const now = Date.now();

    logDietEntry(db, { t: now - 3600e3, meal: "Oatmeal", texture: "smooth", hydrationMl: 300, giStatus: "comfortable" });
    logDietEntry(db, { t: now - 1800e3, meal: "Crackers", texture: "crunchy", hydrationMl: 200, giStatus: "stomach-ache" });
    db.painLog.push({ id: "p1", t: now - 1200e3, region: "tummy", sensation: "hurts" });

    logSolarObservation(db, { t: now - 7200e3, kp: 6.2, sensoryState: "overwhelmed by loud noise" });
    logSolarObservation(db, { t: now - 3600e3, kp: 1.5, sensoryState: "regulated" });

    const rep = correlateBiometrics(db);
    assert.equal(rep.banner, BIOMETRICS_BANNER);
    assert.equal(rep.facts.dietEntriesCount, 2);
    assert.equal(rep.facts.giDistressCount, 1);
    assert.equal(rep.facts.totalHydrationMl, 500);
    assert.equal(rep.facts.solarObservationsCount, 2);
    assert.equal(rep.facts.stormObservationsCount, 1);
    assert.equal(rep.correlations.stormDysregulationRate, 1);
    assert.equal(rep.correlations.quietDysregulationRate, 0);
    assert.equal(rep.correlations.giPainOverlapRate, 1);
    assert.ok(rep.correlations.insights.some((s) => /Kp ≥ 5/.test(s)));
  });

  it("activates and cryptographically wipes Blanket Search Party and builds source-verified Welfare Situation Report", () => {
    const db = { profile: { child: "Leo" } };
    const prof = buildFirstResponderProfile(db);
    assert.equal(prof.waterHazardPriority, true);
    assert.throws(() => activateBlanketSearchParty(db, { caregiverConfirmed: false }), /caregiverConfirmed/);

    const sp = activateBlanketSearchParty(db, { caregiverConfirmed: true, clothing: "Blue shirt", optInPhoto: true });
    assert.equal(sp.status, "active");
    const closed = closeAndWipeBlanketSearchParty(db, "found_safe");
    assert.equal(closed.piiAndPhotoWiped, true);
    assert.equal(db.activeSearchParty.clothing, "[CRYPTOGRAPHICALLY_WIPED]");

    assert.throws(
      () => buildWelfareSituationReport({
        confirmedBy: "cw",
        addressLine: "100 Main",
        hazardProfile: [{ flag: "potential_violent_family_member", source: "ai_guess" }],
      }),
      /verified non-AI source/
    );
    const sr = buildWelfareSituationReport({
      confirmedBy: "cw-1",
      addressLine: "100 Main St",
      hazardProfile: [{ flag: "potential_violent_resident", source: "caseworker_verified_history", officerSafetyNote: "Prior violent incident" }],
    });
    assert.equal(sr.potentialViolenceOrWeaponRisk, true);
    assert.equal(sr.tier12DispatchBlocked, true);
  });
});
