// Unit tests for sound-core.js. Run: node tests/sound.test.mjs
import * as S from "../sound-core.js";
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };
const { MIN, DAY } = S;
const now = Date.UTC(2026, 9, 31, 18);
let n = 0;
const ev = (kind, data = {}, o = {}) => S.makeEvent(kind, data, { id: o.id || "x" + ++n, dev: "A", t: o.t ?? now, tz: 0, by: o.by || "caregiver" });
const tryE = (target, judge, d = 0, k = 0) => ev("try", { target, judge, game: "sing" }, { t: now - d * DAY - (60 - k) * MIN });

// ---------- Words and sounds ----------
t("phonemes: digraphs and vowels", S.phonemesOf("choo choo").join() === "ch,o" && S.phonemesOf("shoe").includes("sh"));
t("phonemes: y after a consonant is a vowel", S.phonemesOf("puppy").includes("i") && S.phonemesOf("yes").includes("y"));
t("syllables: water → wa ter", S.syllables("water").join() === "wa,ter");
t("syllables: two words split on space", S.syllables("more train").join() === "more,train");
t("syllables: one-syllable word stays whole", S.syllables("ball").join() === "ball");
t("targetOf uses the family's approximation for syllables", S.targetOf({ id: "w1", say: "water", approx: "wawa", rung: 5 }).syll.join() === "wa,wa");
t("melody: two notes, high then low", (() => { const m = S.melody(["ba", "by"]); return m[0].hz > m[1].hz; })());

// ---------- Mastery ----------
const got3days = [tryE("ma", "got", 2), tryE("ma", "got", 1), tryE("ma", "got", 0)];
t("got it on 3 different days = mastered", S.targetStats(got3days, "ma").mastered);
t("3 got on one day is not mastered yet", !S.targetStats([tryE("ma", "got", 0, 1), tryE("ma", "got", 0, 2), tryE("ma", "got", 0, 3)], "ma").mastered);
t("retracted tries don't count", (() => { const x = [...got3days, ev("retract", { targetId: got3days[0].id })]; return !S.targetStats(x, "ma").mastered; })());

// ---------- Engine ----------
const T = [{ id: "ma" }, { id: "ba" }];
const fixed = () => 0.99;
t("new target → blocked practice with feedback every try", (() => { const x = S.nextTry([], T, now, fixed); return x.mode === "blocked" && x.feedback === "every" && x.target.id === "ma" && x.showModel; })());
t("blocked stays on the target being learned", S.nextTry([tryE("ba", "close", 0, 1)], T, now, fixed).target.id === "ba");
const reliable = [..."12345"].flatMap((k, i) => [tryE("ma", "got", 0, i * 2), tryE("ba", "got", 0, i * 2 + 1)]);
t("reliable targets → mixed practice", S.nextTry(reliable, T, now, fixed).mode === "mixed");
t("mixed avoids repeating the last target", S.nextTry(reliable, T, now, fixed).target.id !== "ba");
t("apraxia setting keeps practice blocked", S.nextTry(reliable, T, now, fixed, { cas: true }).mode === "blocked");
t("feedback fades in mixed practice", (() => { const odd = [...reliable, tryE("ma", "got", 0, 20)]; return S.nextTry(odd, T, now, fixed).feedback === "light"; })());
const hard = Array.from({ length: 10 }, (_, i) => tryE("ma", "tried", 0, i));
t("below 50% → suggest easier and show the model", (() => { const x = S.nextTry(hard, T, now, fixed); return x.suggest === "easier" && x.showModel; })());
const easy = Array.from({ length: 10 }, (_, i) => tryE(i % 2 ? "ma" : "ba", "got", 0, i));
t("above 85% → suggest harder", S.nextTry(easy, T, now, fixed).suggest === "harder");
t("2 breaks today → done for today", S.nextTry([ev("break"), ev("break")], T, now, fixed).stopToday);
t("1 stop today → done for today", S.nextTry([ev("stop")], T, now, fixed).stopToday);
t("yesterday's stop doesn't block today", !S.nextTry([ev("stop", {}, { t: now - DAY })], T, now, fixed).stopToday);
t("no targets → no target, explained", (() => { const x = S.nextTry([], [], now); return x.target === null && /Add some/.test(x.why[0]); })());
t("engine is deterministic with a seeded rng", JSON.stringify(S.nextTry(reliable, T, now, () => 0.3)) === JSON.stringify(S.nextTry(reliable, T, now, () => 0.3)));
t("a 'tried' is never scored below zero", S.targetStats(hard, "ma").rate === 0);

// ---------- Inventory, week and ladder ----------
const inv = S.inventory([tryE("ma", "got"), ev("heard", { sound: "bubu" }), ev("word_use", { word: "water", approx: "wawa" })]);
const at = (p) => inv.find((x) => x.ph === p);
t("inventory: tries marked got add sounds", at("m").n === 1);
t("inventory: heard sounds count", at("b").n === 1);
t("inventory: words used for meaning show as in-word", at("w").level === "word");
t("inventory: 'tried' adds nothing", S.inventory([tryE("ss", "tried")]).find((x) => x.ph === "s").n === 0);
const wk = S.weekly([tryE("ma", "got"), tryE("ba", "close"), ev("heard", { sound: "da" }), ev("word_use", { word: "more" })], now);
t("weekly: counts tries, sounds, words and child-started", wk.tries === 2 && wk.words === 1 && wk.started === 2 && wk.sounds >= 3);
t("rung advice: most targets mastered → suggest next rung", (() => { const ev2 = [...got3days, tryE("ba", "got", 2), tryE("ba", "got", 1), tryE("ba", "got", 0)]; const a = S.rungAdvice(ev2, [{ id: "ma" }, { id: "ba" }, { id: "da" }], 2); return a && a.to === 3; })());
t("rung advice: hard going → suggest going back", (() => { const a = S.rungAdvice(Array.from({ length: 20 }, (_, i) => tryE("ma", "tried", 0, i)), T, 2); return a?.back && a.to === 1; })());
t("rung advice: nothing to say early on", S.rungAdvice([], T, 2) === null);
t("suggested targets prefer sounds already heard", S.suggestTargets([ev("heard", { sound: "bababa" })], 2)[0].id === "ba");
t("merge is a union by id", S.merge(got3days, got3days.slice(0, 1)).length === 3);
t("unknown kinds throw", (() => { try { S.makeEvent("score"); return false; } catch { return true; } })());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
