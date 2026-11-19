import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { MODELS, KOKORO_VOICES, shapeProsody, embedText, semanticSimilarity, semanticSearch } from "../../ai.js";
import { watchdogCheck, deterministicExpand, expandUtterance } from "../../byok.js";
import { summarizeClinical, appendRevision, getRevisionLineage, exportClinicalCSV, exportClinicalJSON, CLINICAL_BANNER } from "../../clinical.js";
import { compressClientUpdate, decompressClientUpdate, aggregatePrinceUpdates } from "../../masternex-prince-fl.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("M3 F14: KOKORO_VOICES includes expanded child-friendly presets & shapeProsody clamps [-12, 12]", () => {
  const ids = KOKORO_VOICES.map((v) => v.id);
  for (const reqId of ["af_sky", "af_nicole", "am_puck", "bf_isabella"]) {
    assert.ok(ids.includes(reqId), `Missing Kokoro preset ${reqId}`);
  }
  for (const [id, label] of KOKORO_VOICES) {
    assert.ok(id && label);
  }
  const lo = shapeProsody({ pitchSemitones: -40, emotion: "sad" });
  const hi = shapeProsody({ pitchSemitones: 40, emotion: "excited" });
  assert.equal(lo.pitchSemitones, -12);
  assert.equal(hi.pitchSemitones, 12);
  assert.ok(hi.pitch > lo.pitch);
});

test("M3 F15: deterministic offline embeddings & semanticSearch rank AAC concepts", async () => {
  assert.equal(MODELS.embed.id, "Xenova/all-MiniLM-L6-v2");
  const v = await embedText("thirsty beverage");
  assert.equal(v.length, 64);
  assert.ok([...v].every((x) => Number.isFinite(x)));
  const simDrink = await semanticSimilarity("thirsty cup", "drink water juice");
  const simShoes = await semanticSimilarity("thirsty cup", "put on shoes coat");
  assert.ok(simDrink > simShoes);

  const ranked = await semanticSearch("hungry snack", [
    { id: "coat", text: "wear warm coat" },
    { id: "food", text: "eat apple crackers sandwich" },
  ]);
  assert.equal(ranked[0].id, "food");
  assert.deepEqual(await semanticSearch("", [{ id: "a", text: "apple" }]), []);
});

test("M3 F16: BYOK adapter & Watchdog enforce local-first routing, egressAck, and intent safety", async () => {
  assert.equal(MODELS.expand.id, "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA");
  assert.equal(watchdogCheck("I want to drink some water, please.", ["I", "want", "water"]), true);
  assert.equal(watchdogCheck("Let's go to the park!", ["no", "park"]), false, "must reject negation flip");
  assert.equal(watchdogCheck("Turn the music up!", ["stop", "music"]), false, "must reject dropped stop");
  assert.equal(watchdogCheck("Visit https://evil.example/x for water", ["water"]), false, "must reject URLs");
  assert.equal(watchdogCheck("w".repeat(121), ["w"]), false, "must reject >120 chars");

  const localRes = await expandUtterance(["I", "want", "water"], { mode: "on-device" });
  assert.equal(localRes.fallback, false);
  assert.ok(localRes.text.toLowerCase().includes("water"));

  const blockedApi = await expandUtterance(["I", "want", "water"], {
    mode: "api",
    apiKey: "sk-test",
    egressAck: false,
  });
  assert.equal(blockedApi.egressBlocked, true);
  assert.ok(blockedApi.text.toLowerCase().includes("water"));
  assert.ok(deterministicExpand(["no", "like", "sandwich"])[0].toLowerCase().includes("no"));
});

test("M3 F17: clinical.js Communication Matrix, MLU isolation, supersedes lineage & CSV formula guard", () => {
  const log = [
    { id: "l1", ts: 1000, text: "I want water", words: ["I", "want", "water"], mode: "child", actor: "child", fn: "Requesting" },
    { id: "l2", ts: 2000, text: "no stop", words: ["no", "stop"], mode: "child", actor: "child", fn: "Protesting" },
    { id: "l3", ts: 3000, text: "you want more water now", words: ["you", "want", "more", "water", "now"], mode: "modeling", actor: "partner", fn: "Modeling" },
  ];
  const summary = summarizeClinical({ log, moments: [], signals: [] });
  assert.equal(summary.banner, CLINICAL_BANNER);
  assert.equal(summary.metrics.childCount, 2);
  assert.equal(summary.metrics.modeledCount, 1);
  assert.equal(summary.metrics.mlu, 2.5);
  assert.equal(summary.metrics.uniqueWords, 5);
  assert.equal(summary.metrics.functions.Requesting, 1);
  assert.equal(summary.metrics.functions.Protesting, 1);

  let revs = [];
  revs = appendRevision(revs, { id: "r1", targetId: "m1", ts: 10, meaning: "Initial" });
  revs = appendRevision(revs, { id: "r2", targetId: "m1", ts: 20, meaning: "Refined", supersedes: "r1" });
  assert.deepEqual(getRevisionLineage(revs, "m1").map((r) => r.id), ["r1", "r2"]);

  const csv = exportClinicalCSV({
    log: [{ id: "bad", ts: 1, text: "=1+1", words: ["a"], mode: "child", actor: "child", fn: "Commenting" }],
  });
  assert.ok(!csv.split("\n").some((r) => /(?:^|,)"?=/m.test(r)));
  assert.equal(JSON.parse(exportClinicalJSON({ log })).banner, CLINICAL_BANNER);

  const pkg = compressClientUpdate(new Float32Array([0.1, -0.2, 0.3, -0.4]), 0.3, 1.0);
  assert.ok(Number.isFinite(pkg.rdp_epsilon) && pkg.rdp_epsilon > 0);
  const agg = aggregatePrinceUpdates([decompressClientUpdate(pkg)], 0.2);
  assert.equal(agg.length, 4);
});

test("M4 F18: Research evaluation & repository documentation completeness", () => {
  assert.ok(existsSync(join(ROOT, "docs", "RESEARCH_EVALUATION.md")));
  const evalDoc = readFileSync(join(ROOT, "docs", "RESEARCH_EVALUATION.md"), "utf8");
  for (const kw of ["HuggingFace", "K-Dense", "GitHub", "Kokoro", "all-MiniLM-L6-v2", "SmolLM2", "AACConversations", "Apache-2.0"]) {
    assert.ok(evalDoc.includes(kw), `Missing ${kw} in docs/RESEARCH_EVALUATION.md`);
  }
  const third = readFileSync(join(ROOT, "THIRD-PARTY.md"), "utf8");
  const vendorDirs = readdirSync(join(ROOT, "vendor"), { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const d of vendorDirs) {
    assert.ok(third.toLowerCase().includes(d.name.toLowerCase()));
  }
});
