// M3: voice shaping, meaning search, sentence helper and its watchdog, communication report.
// Run: node tests/m3.test.mjs
import { plan, prosody, factor, VOICES } from "../voice-core.js";
import { related, cosine, rankByVector, linkSignal, words } from "../semantic-core.js";
import { watchdog, expandRules, parseModelText, choose, prompt } from "../expand-core.js";
import { classify, report, revise, latest, toCSV, msgKey } from "../clinical-core.js";
import { CORE, FOLDERS } from "../vocab.js";
let pass = 0, fail = 0;
const t = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  got: " + JSON.stringify(got)}`); };
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;

// ---------- Voice ----------
t("the spec's four lighter Kokoro voices are offered", ["af_sky", "af_nicole", "am_puck", "bf_isabella"].every((v) => VOICES.some(([id]) => id === v)));
t("12 semitones doubles the pitch", near(factor(12), 2));
{
  const p = plan({ text: "I want juice", speed: 1, semitones: 3 });
  t("pitch up keeps the words' length: synth speed × playback rate = speed", near(p.synthSpeed * p.playbackRate, 1, 2e-3), p);
  t("pitch up plays faster than 1", p.playbackRate > 1.18 && p.playbackRate < 1.2, p);
}
t("no pitch, plain words: nothing changes", (() => { const p = plan({ text: "I want juice" }); return p.playbackRate === 1 && p.synthSpeed === 1 && p.mood === "plain"; })());
t("excitement is brighter", prosody("Yay, my turn!").mood === "bright" && plan({ text: "yay!" }).semitones === 1);
t("sadness is softer and slower", (() => { const p = plan({ text: "I'm sad" }); return p.mood === "soft" && p.deviceRate < 1 && p.semitones === -1; })());
t("expressive can be turned off", plan({ text: "yay!", expressive: false }).mood === "plain");
t("device pitch stays in 0.1 to 2", (() => { const p = plan({ semitones: 40 }); return p.devicePitch <= 2 && p.devicePitch >= 0.1; })());
t("speed setting is respected", near(plan({ text: "hello", speed: 0.8 }).deviceRate, 0.8));

// ---------- Meaning search ----------
const has = (q, w) => related(q).some((r) => r.w === w);
t("thirsty finds drink and water", has("thirsty", "drink") && has("thirsty", "water"));
t("works inside a sentence and with endings", has("I'm so hungry", "eat") && has("hurts", "doctor"));
t("unknown words find nothing", related("xylophone").length === 0);
const board = new Set([...CORE, ...FOLDERS.flatMap((f) => f.words)].map((x) => x.w.toLowerCase()));
const shown = ["thirsty", "hungry", "tired", "hurt", "toilet", "loud"].map((q) => [q, related(q).filter((r) => board.has(r.w)).length]);
t("each common idea leads to at least one word that is on the board", shown.every(([, n]) => n >= 1), shown);
t("cosine of a vector with itself is 1", near(cosine([1, 2, 3], [1, 2, 3]), 1));
t("cosine of opposite vectors is -1", near(cosine([1, 0], [-1, 0]), -1));
t("zero vector is safe", cosine([0, 0], [1, 1]) === 0);
const r = rankByVector([1, 0], ["a", "b", "c"], [[0.9, 0.1], [0, 1], [0.6, 0.4]]);
t("vector ranking orders by similarity and drops weak matches", r.map((x) => x.item).join() === "a,c", r);
const signals = [
  { id: "s1", name: "Window hum", cues: ["hum", "looks at window"], meaning: "Go to the park?", phrase: "I want to go to the park" },
  { id: "s2", name: "Soft hmm at the jar", cues: ["soft hmm", "kitchen"], meaning: "Wants a cookie", phrase: "I want cookies please" },
];
t("an explanation links to the signal it shares words with", linkSignal("he hums by the window, wants the park", signals)?.signal.id === "s1");
t("cookie links by stem (cookies)", linkSignal("asking for a cookie again", signals)?.signal.id === "s2");
t("nothing in common links to nothing", linkSignal("she sneezed", signals) === null);
t("the link says which words matched", (linkSignal("park window", signals)?.why || []).includes("park"));
t("stop words are ignored", !words("the and to").length);

// ---------- Sentence helper watchdog ----------
const W = (i, c) => watchdog(i, c).ok;
// Calibration set: short messages and fuller sentences a person might mean. Written
// for this test in the style of AAC conversation corpora (not copied from one).
const KEEP = [
  ["want juice", "I want juice, please"], ["want juice", "Can I have juice?"], ["want juice", "I want juice"],
  ["more", "I want more, please"], ["go park", "Can we go to the park?"], ["help", "Can you help me?"], ["help", "Help me, please"],
  ["no bath", "I don't want a bath"], ["mom help", "Mom, can you help me?"], ["tired", "I am tired"], ["stop", "Stop, please"],
  ["eat cookie", "I want to eat a cookie"], ["play outside", "Let's play outside"], ["I happy", "I am happy"],
];
for (const [i, c] of KEEP) t(`keeps "${c}" for "${i}"`, W(i, c), watchdog(i, c));
const DROP = [
  ["want juice", "I want apple juice", "adds a thing"], ["want juice", "I want water", "changes the thing"], ["go park", "Let's go to the zoo", "changes the place"],
  ["want juice", "I don't want juice", "adds a no"], ["no bath", "I want a bath", "drops the no"], ["mom help", "Dad, can you help me?", "changes the person"],
  ["tired", "I am tired and hungry", "adds a feeling"], ["eat cookie", "cookie eat", "changes the order"], ["more", "I would really like to have some more of that delicious food please", "too long"],
  ["happy", "I am sad", "flips the feeling"], ["want juice", "", "empty"],
];
for (const [i, c, why] of DROP) t(`rejects "${c}" for "${i}" (${why})`, !W(i, c), watchdog(i, c));

// ---------- Built-in rules ----------
const it = (...ws) => ws.map(([w, c]) => ({ w, c }));
const rules = [
  it(["want", "action"], ["juice", "thing"]), it(["more", "little"]), it(["go", "action"], ["outside", "thing"]), it(["help", "action"]),
  it(["no", "negate"], ["bath", "thing"]), it(["stop", "negate"]), it(["Mom", "people"], ["help", "action"]), it(["tired", "describe"]),
  it(["juice", "thing"]), it(["play", "action"]),
];
for (const items of rules) {
  const out = expandRules(items), input = items.map((x) => x.w).join(" ");
  t(`rules for "${input}" all pass the watchdog`, out.length >= 1 && out.every((c) => W(input, c)), out.map((c) => [c, watchdog(input, c).reason]));
}
t("choose drops the child's own words and repeats, keeps 3", (() => { const o = choose(it(["want", "action"], ["juice", "thing"]), ["want juice", "I want juice", "I want juice.", "I want water", "Can I have juice?", "I want juice, please", "Juice, please want"]); return o.length === 3 && !o.includes("want juice") && !o.includes("I want water"); })());
t("model text is cleaned of numbers and quotes", JSON.stringify(parseModelText('1. "I want juice"\n2) Can I have juice?\n- Juice, please')) === JSON.stringify(["I want juice", "Can I have juice?", "Juice, please"]));
t("the prompt holds only the message words", /"want juice"/.test(prompt("want juice")) && !/name|child's name|location/i.test(prompt("want juice").replace("(who may be a child)", "")));

// ---------- Communication report ----------
const C = [["I want more juice", "requesting"], ["no", "protesting"], ["stop", "protesting"], ["what is that?", "asking"], ["where mom", "asking"], ["hello", "social"], ["thank you", "social"], ["big dog", "commenting"], ["I like trains", "commenting"], ["help me please", "requesting"], ["all done", "protesting"]];
for (const [txt, fn] of C) t(`"${txt}" reads as ${fn}`, classify(txt).fn === fn, classify(txt));
t("each reading says which rule it used", /rule|question|no|want|greeting|comment/.test(classify("no").why));
const T0 = Date.UTC(2026, 10, 1);
const log = [
  { t: T0 + 1, text: "I want juice", kind: "message" }, { t: T0 + 2, text: "no", kind: "message" }, { t: T0 + 3, text: "Help me please", kind: "quick" },
  { t: T0 + 4, text: "what that", kind: "message" }, { t: T0 + 5, text: "My tummy hurts.", kind: "body" }, { t: T0 + 6, text: "calm 3", kind: "scale" },
];
const modeling = [{ t: T0 + 7, text: "I want more", kind: "modeling" }, { t: T0 + 8, text: "go park", kind: "modeling" }];
const core = new Set(["i", "want", "no", "what", "that", "more", "go"]);
const rep = report({ log, modeling, core });
t("only the child's own acts count (scale is not a message, modeling is separate)", rep.sources.acts === 5 && rep.independence.modeled === 2);
t("independent percentage", rep.independence.pct === 71.4, rep.independence);
t("MLU uses built messages only", rep.mlu.value === 2 && /3 built messages/.test(rep.mlu.source), rep.mlu);
t("core vs fringe counts words in built messages", rep.core.n === 5 && rep.core.fringe === 1 && rep.core.pct === 83.3, rep.core);
t("function counts add up to all acts", Object.values(rep.functions).reduce((a, f) => a + f.n, 0) === 5);
t("report is marked draft and has sources", rep.draft === true && rep.sources.first === T0 + 1 && rep.sources.last === T0 + 5);
t("every row cites a rule", rep.rows.every((r) => r.why.startsWith("rule:")));
// Corrections
const key = msgKey(log[4]);
let revs = revise([], { key, fn: "requesting", by: "Dr. Chen (SLP)", note: "asking for help", t: T0 + 100 });
revs = revise(revs, { key, fn: "commenting", by: "parent", t: T0 + 200 });
t("corrections are appended, never rewritten", revs.length === 2 && revs[0].fn === "requesting" && revs[1].supersedes === revs[0].id && revs[0].supersedes === null);
t("the latest correction wins", latest(revs).get(key).fn === "commenting");
const rep2 = report({ log, modeling, core, revisions: revs });
t("a corrected row says who corrected it", rep2.rows.find((r) => r.key === key).why === "corrected by parent" && rep2.functions.commenting.corrected === 1);
t("unknown function is refused", (() => { try { revise([], { key, fn: "shouting" }); return false; } catch { return true; } })());
t("helped sentences count as acts but not in sentence length", (() => { const r3 = report({ log: [...log, { t: T0 + 9, text: "I want juice, please", kind: "message", helped: true }], core }); return r3.sources.acts === 6 && r3.mlu.value === 2; })());
t("date range filters", report({ log, modeling, core, from: T0 + 3, to: T0 + 4 }).sources.acts === 2);
t("empty log gives empty figures, not errors", (() => { const e = report({}); return e.mlu.value === null && e.core.pct === null && e.independence.pct === null; })());
// CSV
const csv = toCSV([{ a: 'say "hi"', b: "=cmd()" }, { a: "x,y", b: 2 }], ["a", "b"]);
t("CSV quotes cells and escapes quotes", csv.split("\r\n")[1] === `"say ""hi""","'=cmd()"`, csv);
t("CSV keeps commas inside cells", csv.split("\r\n")[2] === `"x,y","2"`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
