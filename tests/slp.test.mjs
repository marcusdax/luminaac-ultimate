// Speech-language tools (M2): word endings, search, body map, scripts, choices, plans.
// Run: node tests/slp.test.mjs
import { verbForms, plural, wordForms, searchWords, bodySentence, BODY, SENSATIONS, scriptParts, scriptText, canMix, normalizeScript, parseOptions, validChoice, choiceSentence, allPlans } from "../slp-core.js";
import { CORE, FOLDERS, PLANS } from "../vocab.js";
let pass = 0, fail = 0;
const t = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  got: " + JSON.stringify(got)}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Word endings
const v = { eat: ["eating", "eats", "ate"], play: ["playing", "plays", "played"], stop: ["stopping", "stops", "stopped"], make: ["making", "makes", "made"],
  cry: ["crying", "cries", "cried"], go: ["going", "goes", "went"], watch: ["watching", "watches", "watched"], like: ["liking", "likes", "liked"],
  open: ["opening", "opens", "opened"], help: ["helping", "helps", "helped"], run: ["running", "runs", "ran"], see: ["seeing", "sees", "saw"], tie: ["tying", "ties", "tied"] };
for (const [w, want] of Object.entries(v)) t(`verb forms of "${w}"`, eq(verbForms(w), want), verbForms(w));
const p = { dog: "dogs", box: "boxes", baby: "babies", child: "children", tooth: "teeth", toy: "toys", bus: "buses" };
for (const [w, want] of Object.entries(p)) t(`plural of "${w}"`, plural(w) === want, plural(w));
t("no endings for phrases", wordForms({ w: "all done", c: "action" }).length === 0);
t("no endings for social words", wordForms({ w: "hello", c: "social" }).length === 0);
t("no endings for names with capitals", wordForms({ w: "Mom", c: "people" }).length === 0);
t("action word gets 3 forms", wordForms({ w: "want", c: "action" }).length === 3, wordForms({ w: "want", c: "action" }));
t("thing gets its plural", eq(wordForms({ w: "ball", c: "thing" }), ["balls"]));
t("fish has no separate plural", wordForms({ w: "fish", c: "thing" }).length === 0);
const actions = [...CORE, ...FOLDERS.flatMap((f) => f.words)].filter((x) => x.c === "action" && /^[a-z]+$/.test(x.w));
t("every one-word action on the board gets forms that are words", actions.every((x) => wordForms(x).every((f) => /^[a-z]+$/.test(f) && f !== x.w)), actions.map((x) => [x.w, wordForms(x)]));

// Search
const sources = [{ id: "core", label: "Core words", words: CORE }, ...FOLDERS.map((f) => ({ id: f.id, label: f.label, words: f.words }))];
const first = searchWords(CORE[0].w, sources);
t("exact match comes first", first[0]?.item.w === CORE[0].w && first[0].folder.id === "core", first[0]);
const anyFolderWord = FOLDERS[0].words[0];
const r = searchWords(anyFolderWord.w.slice(0, 3), sources);
t("prefix search finds a folder word and names its folder", r.some((h) => h.item.w === anyFolderWord.w && h.folder.label === FOLDERS[0].label), r.map((h) => h.item.w));
t("empty query finds nothing", searchWords("  ", sources).length === 0);
t("results are capped", searchWords("e", sources, 5).length <= 5);
const dup = searchWords("x", [{ id: "a", label: "A", words: [{ w: "box" }] }, { id: "b", label: "B", words: [{ w: "Box" }] }]);
t("a word is listed once, in its first folder", dup.length === 1 && dup[0].folder.id === "a");
t("search is case-insensitive", searchWords("BOX", [{ id: "a", label: "A", words: [{ w: "box" }] }]).length === 1);

// Body map
t("hurts sentence", bodySentence("tummy", "hurts") === "My tummy hurts.");
t("plural part agrees", bodySentence("teeth", "hurts") === "My teeth hurt." && bodySentence("feet", "itchy") === "My feet feel itchy.");
t("sensation sentence", bodySentence("head", "hot") === "My head feels hot.");
t("part only defaults to hurts", bodySentence("ears") === "My ears hurt." && bodySentence("chest") === "My chest hurts.");
t("unknown part gives nothing", bodySentence("tail", "hurts") === "");
t("every part has a box on the 200x400 figure", BODY.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= 200 && b.y + b.h <= 400));
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
t("no two body parts overlap", BODY.every((a, i) => BODY.every((b, j) => i === j || !overlap(a, b))), BODY.flatMap((a, i) => BODY.filter((b, j) => j > i && overlap(a, b)).map((b) => a.id + "/" + b.id)));
t("every part is at least 24 units tall and wide (24 px or more on screen)", BODY.every((b) => b.w >= 24 && b.h >= 24), BODY.filter((b) => b.w < 24 || b.h < 24).map((b) => b.id));
t("8 sensations including the spec's five", ["hurts", "sharp", "itchy", "hot", "tight"].every((s) => SENSATIONS.some((x) => x.id === s)));

// Scripts
t("script parts split on /", eq(scriptParts("let's go / to the park"), ["let's go", "to the park"]));
t("spoken text joins parts", scriptText({ text: "let's go /  to the park" }) === "let's go to the park");
t("stage 1 is said whole", !canMix({ text: "let's go / to the park", stage: 1 }));
t("stage 2 with parts can mix", canMix({ text: "let's go / to the park", stage: 2 }));
t("stage 2 with one part cannot mix", !canMix({ text: "to infinity and beyond", stage: 2 }));
const n = normalizeScript({ id: "g1", text: " a /b ", e: "", stage: 9 });
t("normalize clamps stage and fills picture", n.stage === 6 && n.e === "💬" && n.text === "a / b", n);

// Choices
const opts = parseOptions("🍎 apple\n🧀 cheese\n\ncrackers");
t("options parse emoji and plain lines", eq(opts, [{ e: "🍎", w: "apple" }, { e: "🧀", w: "cheese" }, { e: "", w: "crackers" }]), opts);
t("one option is not a choice", validChoice({ title: "Snack", options: opts.slice(0, 1) }) !== "");
t("nine options is too many", validChoice({ title: "Snack", options: Array(9).fill({ w: "x" }) }) !== "");
t("two options with a title is fine", validChoice({ title: "Snack", options: opts.slice(0, 2) }) === "");
t("missing title is caught", validChoice({ title: " ", options: opts }) !== "");
t("lead-in joins the option", choiceSentence({ lead: "I want" }, { w: "apple" }) === "I want apple" && choiceSentence({}, { w: "apple" }) === "apple");

// Plans
const plans = allPlans(PLANS, [{ id: "st2", title: "Morning", kind: "routine", steps: [{ e: "🪥", text: "Brush teeth" }] }, { id: "st1", title: "Dentist", kind: "story", steps: [{ e: "🚗", text: "We drive" }] }]);
t("routines join the built-in plans, stories do not", plans.length === PLANS.length + 1 && plans.at(-1).id === "routine:st2" && plans.at(-1).steps[0].t === "Brush teeth", plans.at(-1));
t("routine steps have say lists", Array.isArray(plans.at(-1).steps[0].say));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
