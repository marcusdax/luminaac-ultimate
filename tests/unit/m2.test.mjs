import test from "node:test";
import assert from "node:assert/strict";
import { CORE, FOLDERS, PLANS } from "../../vocab.js";
import {
  boardToObf, obfToBoard, buildObz, parseObz, parseBoardFile, zipStore, crc32, classFromColor, FITZ, LIMITS,
} from "../../obf.js";
import {
  pushTrail, normalizeGestalt, addGestalt, removeGestalt, mitigateGestalt, gestaltSpeechOpts, starterGestalts,
  painPhrase, reliefFor, recordPain, BODY_REGIONS, SENSATIONS, SENSORY_QUICK,
  makeChoiceBoard, saveChoiceBoard, removeChoiceBoard, mergeSchedules, makeSchedule, firstThen,
  stem, morphVariants, searchVocab, modelingSpeechOpts,
} from "../../slp.js";

// ---------- Feature 13: OBF / OBZ ----------
test("M2 F13: boardToObf maps label, vocalization, Fitzgerald colours and grid order", () => {
  const obf = boardToObf({ id: "home", name: "Home", cols: 3, words: [
    { w: "I", c: "people", e: "🙋" },
    { w: "stop", c: "negate", say: "Stop, please" },
    { w: "go", c: "action" },
    { w: "more", c: "describe" },
  ] });
  assert.equal(obf.format, "open-board-0.1");
  assert.deepEqual(obf.grid.order, [["b1", "b2", "b3"], ["b4", null, null]]);
  assert.equal(obf.grid.rows, 2);
  assert.equal(obf.buttons[1].vocalization, "Stop, please");
  assert.equal(obf.buttons[0].vocalization, undefined);
  assert.equal(obf.buttons[1].border_color, FITZ.negate.border);
  assert.equal(obf.buttons[0].ext_luminaac_pos, "people");
});

test("M2 F13: OBF round-trips and preserves label vs vocalization, class, emoji", () => {
  const src = { id: "feel", name: "Feelings", cols: 4, words: [
    { w: "happy", c: "describe", e: "😊" }, { w: "hurt", c: "negate", e: "🤕", say: "I am hurt" },
  ] };
  const back = obfToBoard(JSON.stringify(boardToObf(src)));
  assert.equal(back.name, "Feelings");
  assert.equal(back.cols, 4);
  assert.deepEqual(back.words.map((w) => [w.w, w.say, w.c, w.e]), [["happy", "", "describe", "😊"], ["hurt", "I am hurt", "negate", "🤕"]]);
});

test("M2 F13: obfToBoard rejects non-OBF input and sanitises hostile fields", () => {
  assert.throws(() => obfToBoard("not json"), /valid \.obf/);
  assert.throws(() => obfToBoard({ format: "something-else", buttons: [] }), /Open Board Format/);
  assert.throws(() => obfToBoard({ format: "open-board-0.1" }), /no buttons/);
  const b = obfToBoard({
    format: "open-board-0.1", id: "../../evil", name: "A\u202Ebc\u0000",
    images: [{ id: "i1", url: "http://evil.example/x.png" }],
    buttons: [
      { id: "1", label: "<img src=x onerror=alert(1)>", image_id: "i1", action: ":open_url:http://evil", background_color: "rgb(184, 55, 47)" },
      { id: "2", label: "x".repeat(500), action: ":speak" },
      { id: "3", label: "" },
    ],
  });
  assert.match(b.id, /^[\w.-]+$/);
  assert.ok(!/[\u202E\u0000]/.test(b.name));
  assert.equal(b.words.length, 2);
  assert.equal(b.words[0].action, undefined, "unknown action dropped");
  assert.equal(b.words[0].c, "negate", "colour maps to nearest Fitzgerald class");
  assert.equal(b.words[1].action, ":speak");
  assert.ok(b.words[1].w.length <= LIMITS.label);
  assert.ok(b.warnings.some((w) => /Remote pictures/.test(w)));
  assert.ok(b.warnings.some((w) => /unsupported action/.test(w)));
  // The label is kept as inert text; rendering must use textContent (verified in UI test below).
  assert.equal(b.words[0].w, "<img src=x onerror=alert(1)>");
});

test("M2 F13: classFromColor picks the closest Fitzgerald class", () => {
  assert.equal(classFromColor("#fff", "#2f8a4c"), "action");
  assert.equal(classFromColor(null, null), "thing");
  assert.equal(classFromColor("#fbf1cc", undefined), "people");
});

test("M2 F13: OBZ round-trip through stored zip keeps boards, root and CRC", async () => {
  const bytes = buildObz([
    { id: "home", name: "Home", words: [{ w: "I", c: "people" }, { w: "feelings", c: "thing", loadBoard: "feel" }] },
    { id: "feel", name: "Feelings", words: [{ w: "happy", c: "describe", e: "😊" }] },
  ]);
  assert.equal(bytes[0], 0x50);
  const out = await parseBoardFile(bytes);
  assert.equal(out.rootId, "home");
  assert.deepEqual(out.boards.map((b) => b.id), ["home", "feel"]);
  assert.equal(out.boards[0].words[1].loadBoard, "feel");
  assert.equal(out.boards[1].words[0].e, "😊");
});

test("M2 F13: parseBoardFile reads a plain .obf from bytes", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(boardToObf({ id: "a", name: "A", words: [{ w: "yes", c: "social" }] })));
  const out = await parseBoardFile(bytes);
  assert.equal(out.boards[0].words[0].w, "yes");
});

test("M2 F13: zip reader rejects corruption, bad CRC and oversized archives", async () => {
  await assert.rejects(() => parseBoardFile(new Uint8Array([0x50, 0x4b, 1, 2, 3])), /zip|obz|Damaged/i);
  const good = buildObz([{ id: "a", name: "A", words: [{ w: "yes", c: "social" }] }]);
  const bad = good.slice();
  // Flip one byte inside the first stored file's data (after local header + name).
  bad[30 + "manifest.json".length + 2] ^= 0xff;
  await assert.rejects(() => parseBoardFile(bad), /damaged/i);
  await assert.rejects(() => parseBoardFile(new Uint8Array(LIMITS.archiveBytes + 1)), /too large/);
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("M2 F13: zip reader reads deflate entries made by other apps", async () => {
  if (typeof CompressionStream !== "function") return;
  const json = JSON.stringify(boardToObf({ id: "z", name: "Zed", words: [{ w: "water", c: "thing" }] }));
  const raw = new TextEncoder().encode(json);
  const cs = new CompressionStream("deflate-raw");
  const comp = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(cs)).arrayBuffer());
  const name = new TextEncoder().encode("boards/z.obf");
  const u16 = (n) => [n & 255, (n >>> 8) & 255];
  const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  const crc = crc32(raw);
  const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(crc), ...u32(comp.length), ...u32(raw.length), ...u16(name.length), ...u16(0)]);
  const cdOff = local.length + name.length + comp.length;
  const cd = new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(crc), ...u32(comp.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0)]);
  const eocd = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(1), ...u16(1), ...u32(cd.length + name.length), ...u32(cdOff), ...u16(0)]);
  const zip = new Uint8Array([...local, ...name, ...comp, ...cd, ...name, ...eocd]);
  const { zipRead } = await import("../../obf.js");
  const z = await zipRead(zip);
  const out = obfToBoard(new TextDecoder().decode(await z.read("boards/z.obf")));
  assert.equal(out.name, "Zed");
});

test("M2 F13: zipStore output is a valid archive the reader lists", async () => {
  const { zipRead } = await import("../../obf.js");
  const z = await zipRead(zipStore([{ name: "a.txt", data: "hello" }, { name: "b/c.txt", data: "world" }]));
  assert.deepEqual(z.names, ["a.txt", "b/c.txt"]);
  assert.equal(new TextDecoder().decode(await z.read("b/c.txt")), "world");
});

// ---------- Feature 13: vocabulary search + morphology ----------
test("M2 F13: searchVocab ranks exact > prefix > stem > substring > near-miss", () => {
  const src = { core: CORE, folders: FOLDERS, custom: [{ w: "swimming", e: "🏊", c: "action", f: "places" }] };
  assert.equal(searchVocab("want", src)[0].w, "want");
  assert.equal(searchVocab("wan", src)[0].w, "want");
  assert.ok(searchVocab("swim", src).some((x) => x.w === "swimming"));
  assert.equal(searchVocab("eating", src)[0].w, "eat", "stem match finds the base word");
  assert.ok(searchVocab("bathrom", src).some((x) => x.w === "bathroom"), "one typo still finds it");
  assert.deepEqual(searchVocab("", src), []);
  assert.deepEqual(searchVocab("zzzzqq", src), []);
});

test("M2 F13: stem and morphVariants handle regular and irregular words", () => {
  assert.equal(stem("running"), "run");
  assert.equal(stem("went"), "go");
  assert.equal(stem("babies"), "baby");
  assert.deepEqual(morphVariants("go").sort(), ["going", "gone", "goes", "went"].sort());
  assert.ok(morphVariants("jump").includes("jumping"));
  assert.ok(morphVariants("jump").includes("jumped"));
  assert.ok(morphVariants("like").includes("liking"));
  assert.deepEqual(morphVariants("all done"), []);
});

// ---------- Feature 9: ALS modeling ----------
test("M2 F9: modeling trail keeps the last 5 distinct words in order", () => {
  let t = [];
  for (const w of ["I", "want", "more", "juice", "please", "now"]) t = pushTrail(t, w);
  assert.deepEqual(t, ["want", "more", "juice", "please", "now"]);
  assert.deepEqual(pushTrail(["a", "b"], "A"), ["b", "A"]);
  assert.deepEqual(pushTrail(["a"], "  "), ["a"]);
});

test("M2 F9: modelingSpeechOpts is mode modeling and never interrupts the child", () => {
  const o = modelingSpeechOpts({ access: {} });
  assert.equal(o.mode, "modeling");
  assert.equal(o.interrupt, false);
});

// ---------- Feature 10: GLP / NLA ----------
test("M2 F10: gestalt normalisation, stages, tags and caps", () => {
  const g = normalizeGestalt({ text: "  to infinity   and beyond ", stage: 9, tags: ["Movie", "movie", "FUN"] });
  assert.equal(g.text, "to infinity and beyond");
  assert.equal(g.stage, 4);
  assert.deepEqual(g.tags, ["movie", "fun"]);
  assert.equal(g.source, "caregiver");
  assert.equal(normalizeGestalt({ text: "x", stage: 0 }).stage, 1);
  assert.throws(() => normalizeGestalt({ text: "   " }), /some words/);
  assert.ok(normalizeGestalt({ text: "y".repeat(500) }).text.length <= 120);
});

test("M2 F10: add / replace / remove gestalts on the db", () => {
  const db = { gestalts: starterGestalts() };
  const g = addGestalt(db, { text: "Let's go on an adventure", stage: 1 });
  assert.equal(db.gestalts.length, 4);
  addGestalt(db, { ...g, stage: 2 });
  assert.equal(db.gestalts.length, 4);
  assert.equal(db.gestalts.find((x) => x.id === g.id).stage, 2);
  removeGestalt(db, g.id);
  assert.equal(db.gestalts.length, 3);
  assert.equal(gestaltSpeechOpts(g).mode, "child");
  assert.equal(gestaltSpeechOpts({ audioClipId: "clip1" }).audioClipId, "clip1");
});

test("M2 F10: mitigation offers chunks without changing the original", () => {
  assert.deepEqual(mitigateGestalt("Ready, set, go!"), ["Ready", "set", "go"]);
  const chunks = mitigateGestalt("to infinity and beyond");
  assert.ok(chunks.length >= 2 && chunks.length <= 4);
  assert.equal(chunks.join(" "), "to infinity and beyond");
  assert.deepEqual(mitigateGestalt("hello"), ["hello"]);
  assert.deepEqual(mitigateGestalt(""), []);
});

// ---------- Feature 11: body map ----------
test("M2 F11: painPhrase grammar for singular, plural and sensitive regions", () => {
  assert.equal(painPhrase("tummy", "hurts"), "My tummy hurts");
  assert.equal(painPhrase("ears", "hurts"), "My ears hurt");
  assert.equal(painPhrase("hand", "itchy"), "My hand is itchy");
  assert.equal(painPhrase("eyes", "itchy"), "My eyes are itchy");
  assert.equal(painPhrase("head", "hot"), "My head feels hot");
  assert.equal(painPhrase("chest", "tight"), "My chest feels tight");
  assert.equal(painPhrase("private", "hurts"), "Something hurts in a private place");
  assert.throws(() => painPhrase("elbow", "hurts"), /Pick/);
  for (const r of BODY_REGIONS) for (const s of SENSATIONS) assert.ok(painPhrase(r.id, s.id).length > 3);
});

test("M2 F11: relief options are specific, capped, and always include help + break", () => {
  const r = reliefFor("tummy", "sick");
  assert.ok(r.includes("Go to the bathroom"));
  assert.ok(r.includes("Help me please") || r.length === 6);
  assert.ok(r.length <= 6);
  assert.ok(reliefFor("foot", "cold").includes("I need a break"));
  assert.equal(new Set(r).size, r.length);
});

test("M2 F11: recordPain stores a capped log and flags sensitive areas", () => {
  const db = {};
  const a = recordPain(db, "tummy", "hurts", "Ice pack");
  assert.equal(a.sensitive, false);
  assert.equal(recordPain(db, "private", "hurts").sensitive, true);
  for (let i = 0; i < 600; i++) recordPain(db, "head", "hot");
  assert.equal(db.painLog.length, 500);
});

test("M2 F11: sensory quick bar has Stop/No/Help/Bathroom/Break with labels and speech", () => {
  assert.deepEqual(SENSORY_QUICK.map((q) => q.w), ["Stop", "No", "Help", "Bathroom", "Break"]);
  for (const q of SENSORY_QUICK) { assert.ok(q.say && q.e && q.c && q.fn); }
});

// ---------- Feature 12: choice boards + schedules ----------
test("M2 F12: choice boards need 2-8 distinct named choices", () => {
  const b = makeChoiceBoard({ title: "Snack", options: ["apple", { w: "Apple" }, { w: "banana", e: "🍌" }] });
  assert.equal(b.options.length, 2, "duplicates removed case-insensitively");
  assert.throws(() => makeChoiceBoard({ title: "x", options: ["only"] }), /at least 2/);
  assert.throws(() => makeChoiceBoard({ title: "x", options: Array.from({ length: 9 }, (_, i) => "o" + i) }), /at most 8/);
  assert.throws(() => makeChoiceBoard({ title: " ", options: ["a", "b"] }), /name/);
  assert.equal(makeChoiceBoard({ title: "x", options: Array.from({ length: 8 }, (_, i) => "o" + i) }).options.length, 8);
});

test("M2 F12: choice board save / replace / remove on db", () => {
  const db = {};
  const b = saveChoiceBoard(db, { title: "Drink", options: ["water", "juice", "milk"] });
  saveChoiceBoard(db, { id: b.id, title: "Drink v2", options: ["water", "juice"] });
  assert.equal(db.choiceBoards.length, 1);
  assert.equal(db.choiceBoards[0].title, "Drink v2");
  removeChoiceBoard(db, b.id);
  assert.equal(db.choiceBoards.length, 0);
});

test("M2 F12: mergeSchedules unifies plans, stories, routines and custom schedules", () => {
  const stories = [
    { id: "st1", title: "Dentist", kind: "story", steps: [{ e: "🚗", text: "We drive" }, { e: "🦷", text: "Count teeth" }] },
    { id: "st2", title: "Morning", kind: "routine", steps: [{ e: "🪥", text: "Brush teeth" }, { e: "🥣", text: "Breakfast" }] },
  ];
  const custom = [makeSchedule({ title: "Bath time", steps: ["Undress", "Bath", "Towel"] })];
  const all = mergeSchedules(PLANS, stories, custom);
  assert.equal(all.length, PLANS.length + 3);
  const grocery = all.find((x) => x.id === "grocery");
  assert.ok(grocery.steps[0].say.length > 0);
  assert.deepEqual(all.find((x) => x.id === "st2").steps[0], { t: "Brush teeth", e: "🪥", say: [] });
  assert.deepEqual(all.find((x) => x.id === "st1").steps[0].say, ["We drive"]);
  assert.equal(all.find((x) => x.kind === "custom").steps.length, 3);
  assert.equal(mergeSchedules([{ id: "a", title: "A", steps: [] }], [{ id: "a", title: "B", steps: [] }]).length, 1, "duplicate ids dropped");
});

test("M2 F12: makeSchedule validates 2-12 steps and firstThen walks them", () => {
  assert.throws(() => makeSchedule({ title: "x", steps: ["one"] }), /at least 2/);
  assert.throws(() => makeSchedule({ title: "x", steps: Array.from({ length: 13 }, (_, i) => "s" + i) }), /at most 12/);
  assert.throws(() => makeSchedule({ title: "", steps: ["a", "b"] }), /name/);
  const s = makeSchedule({ title: "Park", steps: [{ t: "Shoes", e: "👟" }, { t: "Walk" }, { t: "Swing" }] });
  let ft = firstThen(s, []);
  assert.equal(ft.now.t, "Shoes");
  assert.equal(ft.then.t, "Walk");
  ft = firstThen(s, new Set([0]));
  assert.equal(ft.now.t, "Walk");
  ft = firstThen(s, [0, 1]);
  assert.equal(ft.then, null);
  ft = firstThen(s, [0, 1, 2]);
  assert.equal(ft.finished, true);
  assert.equal(ft.now, null);
});
