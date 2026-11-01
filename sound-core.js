// Sound Path core: pure logic, no DOM, no storage. My Voice, the Bridge and the
// tests share it. See docs/SOUND-PATH.md for the research behind each rule.
//
// What it is: short, child-led practice that builds new sounds, then syllables,
// then words, inside the AAC app (the board stays the reliable voice). What it
// is not: oral-motor drills, automatic speech scoring, or a test. The grown-up
// is the judge; the machine only notices "a voice happened" and never marks a
// try wrong.
//
// Data is an append-only event log like Potty Path: union-by-id merge, mistakes
// fixed with "retract", everything else derived.

export const MIN = 60e3, DAY = 24 * 60 * MIN;

// ---------- The ladder ----------
// A target moves to "got it" after the grown-up marks it on 3 different days.
// Rungs are advisory: the app suggests, a grown-up confirms, and going back is normal.
export const RUNGS = [
  { id: 0, name: "Voice on", goal: "Any voice at all: a hum, an \"ah\", a laugh." },
  { id: 1, name: "Long sounds", goal: "Sounds that can be held: ah, ee, oo, mmm, sss." },
  { id: 2, name: "Sound + vowel", goal: "An early sound with a vowel: ma, ba, da." },
  { id: 3, name: "Same sound twice", goal: "mama, baba, bye-bye, choo-choo." },
  { id: 4, name: "Two different parts", goal: "bubble, hello, puppy." },
  { id: 5, name: "Words they use", goal: "Simple forms of their own board words (\"wa\" for water)." },
  { id: 6, name: "Two words", goal: "\"more train\", \"go out\": board and voice together." },
];

// Catalogue of ready targets. `syll` drives Sing and Tap and Word Train.
// Early-developing consonants (m b p w h n d t) come first on purpose.
export const CATALOG = [
  { id: "voice", rung: 0, say: "aaah", show: "any voice", syll: ["aaah"], e: "🎵" },
  { id: "ah", rung: 1, say: "aaah", show: "ah", syll: ["aaah"], e: "😮" },
  { id: "ee", rung: 1, say: "eeee", show: "ee", syll: ["eeee"], e: "😁" },
  { id: "oo", rung: 1, say: "ooooh", show: "oo", syll: ["ooooh"], e: "👻" },
  { id: "mm", rung: 1, say: "mmmm", show: "mmm", syll: ["mmmm"], e: "😋" },
  { id: "ss", rung: 1, say: "sssss", show: "sss", syll: ["sssss"], e: "🐍" },
  { id: "ff", rung: 1, say: "fffff", show: "fff", syll: ["fffff"], e: "🐱" },
  { id: "sh", rung: 1, say: "shhhh", show: "shh", syll: ["shhhh"], e: "🤫" },
  { id: "ma", rung: 2, say: "ma", show: "ma", syll: ["ma"], e: "👩" },
  { id: "ba", rung: 2, say: "ba", show: "ba", syll: ["ba"], e: "⚽" },
  { id: "pa", rung: 2, say: "pa", show: "pa", syll: ["pa"], e: "🐼" },
  { id: "da", rung: 2, say: "da", show: "da", syll: ["da"], e: "👨" },
  { id: "na", rung: 2, say: "na", show: "na", syll: ["na"], e: "🍌" },
  { id: "wa", rung: 2, say: "wa", show: "wa", syll: ["wa"], e: "💧" },
  { id: "moo", rung: 2, say: "moo", show: "moo", syll: ["moo"], e: "🐮" },
  { id: "bee", rung: 2, say: "bee", show: "bee", syll: ["bee"], e: "🐝" },
  { id: "mama", rung: 3, say: "mama", show: "mama", syll: ["ma", "ma"], e: "👩" },
  { id: "baba", rung: 3, say: "baba", show: "baba", syll: ["ba", "ba"], e: "🍼" },
  { id: "dada", rung: 3, say: "dada", show: "dada", syll: ["da", "da"], e: "👨" },
  { id: "byebye", rung: 3, say: "bye bye", show: "bye-bye", syll: ["bye", "bye"], e: "👋" },
  { id: "choochoo", rung: 3, say: "choo choo", show: "choo-choo", syll: ["choo", "choo"], e: "🚂" },
  { id: "nana", rung: 3, say: "nana", show: "nana", syll: ["na", "na"], e: "👵" },
  { id: "bubble", rung: 4, say: "bubble", show: "bubble", syll: ["bub", "ble"], e: "🫧" },
  { id: "hello", rung: 4, say: "hello", show: "hello", syll: ["hel", "lo"], e: "👋" },
  { id: "puppy", rung: 4, say: "puppy", show: "puppy", syll: ["pup", "py"], e: "🐶" },
  { id: "baby", rung: 4, say: "baby", show: "baby", syll: ["ba", "by"], e: "👶" },
  { id: "water", rung: 4, say: "water", show: "water", syll: ["wa", "ter"], e: "💧" },
  { id: "more_train", rung: 6, say: "more train", show: "more train", syll: ["more", "train"], e: "🚂" },
  { id: "go_out", rung: 6, say: "go out", show: "go out", syll: ["go", "out"], e: "🚪" },
  { id: "all_done", rung: 6, say: "all done", show: "all done", syll: ["all", "done"], e: "✅" },
];

// Sounds for the inventory chart, roughly in the order children usually learn them.
export const VOWELS = ["a", "e", "i", "o", "u"];
export const CONSONANTS = ["m", "b", "p", "w", "h", "n", "d", "t", "k", "g", "y", "f", "s", "sh", "ch", "j", "l", "v", "z", "r", "th"];
export const EARLY = new Set(["m", "b", "p", "w", "h", "n", "d", "t"]);

// Very small spelling → sound guesser, good enough to colour an inventory chart.
// Digraphs first; "y" after a consonant and "ee/oo" fold into vowels.
export function phonemesOf(word) {
  const w = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
  const out = new Set();
  for (let i = 0; i < w.length; i++) {
    const two = w.slice(i, i + 2);
    if (["sh", "ch", "th"].includes(two)) { out.add(two); i++; continue; }
    const c = w[i];
    if ("aeiou".includes(c)) out.add(c);
    else if (c === "y") out.add(i === 0 ? "y" : "i");
    else if (c === "c") out.add(w[i + 1] && "eiy".includes(w[i + 1]) ? "s" : "k");
    else if (c === "q") out.add("k");
    else if (c === "x") { out.add("k"); out.add("s"); }
    else if (CONSONANTS.includes(c)) out.add(c);
  }
  return [...out];
}
// Rough syllable split for a family word ("water" → ["wa", "ter"]).
export function syllables(word) {
  const w = String(word || "").trim().toLowerCase();
  if (!w) return [];
  if (/\s/.test(w)) return w.split(/\s+/).slice(0, 4);
  const parts = w.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy](?![aeiouy]))?/g) || [w];
  const joined = parts.join("");
  if (joined.length < w.length) parts[parts.length - 1] += w.slice(joined.length);
  return parts.length > 4 ? [parts.slice(0, -3).join(""), ...parts.slice(-3)] : parts;
}
// A target from the catalogue, or one the family added ({ id, say, approx, rung }).
export function targetOf(t) {
  const c = CATALOG.find((x) => x.id === t.id);
  const say = t.say || c?.say || t.id;
  return { e: "🗣️", ...c, ...t, say, show: t.show || c?.show || say, syll: t.syll || c?.syll || syllables(t.approx || say), rung: t.rung ?? c?.rung ?? 5 };
}

// ---------- Events ----------
export const KINDS = ["try", "heard", "word_use", "break", "stop", "rung", "retract"];
export const JUDGE = { got: 1, close: 0.5, tried: 0 };
export const rid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : "s" + Math.random().toString(36).slice(2) + Date.now().toString(36));
export function makeEvent(kind, data = {}, o = {}) {
  if (!KINDS.includes(kind)) throw new Error("Unknown sound event: " + kind);
  const t = o.t ?? Date.now();
  return { id: o.id || rid(), dev: o.dev || "local", t, tz: o.tz ?? -new Date(t).getTimezoneOffset(), by: o.by || "child", kind, data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== "")) };
}
export function validEvent(e) { return !!e && typeof e.id === "string" && e.id && e.id.length <= 64 && KINDS.includes(e.kind) && Number.isFinite(e.t) && e.data && typeof e.data === "object" && !Array.isArray(e.data); }
export const order = (a, b) => a.t - b.t || String(a.dev).localeCompare(String(b.dev)) || a.id.localeCompare(b.id);
export function merge(...lists) { const m = new Map(); for (const l of lists) for (const e of l || []) if (validEvent(e) && !m.has(e.id)) m.set(e.id, e); return [...m.values()].sort(order); }
export function live(events) { const gone = new Set(events.filter((e) => e.kind === "retract").map((e) => e.data.targetId)); return events.filter((e) => e.kind !== "retract" && !gone.has(e.id)); }
export const dayOf = (e) => Math.floor((e.t + (e.tz ?? 0) * MIN) / DAY);
export const dayNow = (now, tz = -new Date(now).getTimezoneOffset()) => Math.floor((now + tz * MIN) / DAY);

// ---------- Mastery ----------
export function targetStats(events, id, n = 10) {
  const tries = live(events).filter((e) => e.kind === "try" && e.data.target === id);
  const last = tries.slice(-n), score = last.reduce((s, e) => s + (JUDGE[e.data.judge] ?? 0), 0);
  const gotDays = new Set(tries.filter((e) => e.data.judge === "got").map(dayOf)).size;
  const last5 = tries.slice(-5).filter((e) => e.data.judge === "got").length;
  return { tries: tries.length, recent: last.length, rate: last.length ? score / last.length : null, gotDays, mastered: gotDays >= 3, reliable: last5 >= 3 };
}

// ---------- The practice engine ----------
// Keeps success near 70–85% (the challenge point). New targets: same target in a
// row with feedback every time (blocked). Reliable targets: mixed with others,
// praise faded to about every other try (the reward still comes every round).
// Below 50% over 10 tries → go easier and show the model again. Two breaks or
// one Stop today → practice is done for the day, calmly.
export function nextTry(events, targets, now = Date.now(), r = Math.random, opts = {}) {
  const L = live(events), today = dayNow(now);
  const todays = L.filter((e) => dayOf(e) === today);
  const breaks = todays.filter((e) => e.kind === "break").length, stops = todays.filter((e) => e.kind === "stop").length;
  const stopToday = breaks >= 2 || stops >= 1;
  const list = (targets || []).map(targetOf);
  const tries = L.filter((e) => e.kind === "try"), recent = tries.slice(-10);
  const rate = recent.length ? recent.reduce((s, e) => s + (JUDGE[e.data.judge] ?? 0), 0) / recent.length : null;
  const why = [];
  let suggest = null, showModel = false;
  if (recent.length >= 10 && rate < 0.5) { suggest = "easier"; showModel = true; why.push(`About ${Math.round(rate * 100)}% of the last 10 tries were close or better: an easier target and the model again.`); }
  else if (recent.length >= 10 && rate > 0.85) { suggest = "harder"; why.push(`${Math.round(rate * 100)}% of the last 10 tries went well: ready for something a bit harder.`); }
  if (!list.length) return { target: null, mode: "none", feedback: "every", showModel, suggest, stopToday, why: ["No targets yet. Add some in the Bridge."] };
  const stats = new Map(list.map((t) => [t.id, targetStats(L, t.id)]));
  const learning = list.filter((t) => !stats.get(t.id).reliable && !stats.get(t.id).mastered);
  const lastT = tries.at(-1)?.data.target;
  const cas = !!opts.cas; // apraxia: stay blocked longer
  let target, mode;
  if (learning.length) {
    target = learning.find((t) => t.id === lastT) || learning[0];
    mode = "blocked"; why.push(`Learning "${target.show}": the same target a few times in a row, praise every try.`);
  } else {
    const pool = list.length > 1 ? list.filter((t) => t.id !== lastT) : list;
    target = cas && list.find((t) => t.id === lastT) ? list.find((t) => t.id === lastT) : pool[Math.floor(r() * pool.length)];
    mode = cas ? "blocked" : "mixed"; why.push(cas ? "Apraxia setting: staying with one target at a time." : "Mixing targets they can do, so they stick.");
  }
  const sinceStart = todays.filter((e) => e.kind === "try").length;
  const feedback = mode === "blocked" || showModel ? "every" : sinceStart % 2 === 0 ? "every" : "light";
  return { target, mode, feedback, showModel: showModel || (stats.get(target.id).tries < 3), suggest, stopToday, rate, why };
}

// ---------- What the Bridge shows ----------
// Inventory: every sound heard, from tries the grown-up marked "got"/"close",
// sounds they logged hearing, and words used for meaning.
export function inventory(events, targets = []) {
  const L = live(events), map = new Map([...VOWELS, ...CONSONANTS].map((p) => [p, { n: 0, inWord: false }]));
  const bump = (ph, inWord) => { const x = map.get(ph); if (x) { x.n++; if (inWord) x.inWord = true; } };
  const say = new Map((targets || []).map(targetOf).map((t) => [t.id, t.approx || t.say]));
  for (const e of L) {
    if (e.kind === "try" && (e.data.judge === "got" || e.data.judge === "close") && e.data.target !== "voice") phonemesOf(say.get(e.data.target) || CATALOG.find((c) => c.id === e.data.target)?.say || e.data.target).forEach((p) => bump(p, false));
    if (e.kind === "heard") phonemesOf(e.data.sound).forEach((p) => bump(p, false));
    if (e.kind === "word_use") phonemesOf(e.data.approx || e.data.word).forEach((p) => bump(p, true));
  }
  return [...map].map(([ph, x]) => ({ ph, n: x.n, inWord: x.inWord, level: x.inWord ? "word" : x.n >= 3 ? "often" : x.n ? "once" : "none", vowel: VOWELS.includes(ph) }));
}
// Weekly numbers, each with how many observations it rests on.
export function weekly(events, now = Date.now()) {
  const L = live(events), today = dayNow(now), wk = L.filter((e) => dayOf(e) > today - 7);
  const tries = wk.filter((e) => e.kind === "try"), days = new Set(tries.map(dayOf)).size;
  const voiced = tries.filter((e) => e.data.voiced !== false);
  const sounds = new Set([...wk.filter((e) => e.kind === "heard").flatMap((e) => phonemesOf(e.data.sound)), ...tries.filter((e) => e.data.judge === "got" || e.data.judge === "close").flatMap((e) => phonemesOf(e.data.say || e.data.target))]);
  return {
    tries: tries.length, perDay: days ? Math.round((tries.length / days) * 10) / 10 : 0, days,
    started: wk.filter((e) => (e.kind === "heard" || e.kind === "word_use") && e.data.spontaneous !== false).length + tries.filter((e) => e.data.spontaneous).length,
    copied: voiced.filter((e) => !e.data.spontaneous).length,
    sounds: sounds.size, words: new Set(wk.filter((e) => e.kind === "word_use").map((e) => String(e.data.word).toLowerCase())).size,
    got: tries.filter((e) => e.data.judge === "got").length, close: tries.filter((e) => e.data.judge === "close").length,
  };
}
// Suggest moving up when most of this rung's targets are "got it" on 3 days;
// suggest going back when things have been hard. Never automatic.
export function rungAdvice(events, targets, rung) {
  const L = live(events), mine = (targets || []).map(targetOf).filter((t) => t.rung === rung);
  const done = mine.filter((t) => targetStats(L, t.id).mastered);
  const recent = L.filter((e) => e.kind === "try").slice(-20);
  const rate = recent.length ? recent.reduce((s, e) => s + (JUDGE[e.data.judge] ?? 0), 0) / recent.length : null;
  const declined = L.some((e) => e.kind === "rung" && e.data.action === "decline" && e.data.to === rung + 1 && Date.now() - e.t < 3 * DAY);
  if (rung > 0 && recent.length >= 20 && rate < 0.35) return { to: rung - 1, back: true, why: `Only about ${Math.round(rate * 100)}% of the last 20 tries were close or better. An easier rung keeps it fun.` };
  if (rung < RUNGS.length - 1 && mine.length >= 2 && done.length >= Math.ceil((mine.length * 2) / 3) && !declined) return { to: rung + 1, why: `${done.length} of ${mine.length} "${RUNGS[rung].name}" targets are "got it" on 3 different days.` };
  return null;
}
// Targets to suggest for a rung: sounds already heard first, then early sounds.
export function suggestTargets(events, rung, have = []) {
  const inv = new Map(inventory(events).map((x) => [x.ph, x.n]));
  const taken = new Set(have.map((t) => t.id));
  return CATALOG.filter((c) => c.rung === rung && !taken.has(c.id)).map((c) => {
    const ph = phonemesOf(c.say), known = ph.filter((p) => inv.get(p) > 0).length, early = ph.filter((p) => EARLY.has(p) || VOWELS.includes(p)).length;
    return { ...c, score: known * 2 + early - ph.length * 0.1 };
  }).sort((a, b) => b.score - a.score);
}
// Sing and Tap (from Auditory-Motor Mapping Training): two notes, high then low.
export function melody(syll) { const hi = 392, lo = 330; return (syll || []).map((s, i) => ({ s, hz: syll.length === 1 ? hi : i % 2 === 0 ? hi : lo })); }
export const COACH = [
  { title: "Model, then wait", say: ["Say it slowly, face to face, at their level.", "Then wait quietly for 3–5 seconds. Waiting is the hardest and most useful part.", "Any sound back counts. Don't ask for it again."] },
  { title: "Praise the try, not the result", say: ["\"I heard you!\" works for every try.", "Don't correct. If it wasn't quite right, just say the word once more yourself, warmly.", "Their talker stays their voice. Never hold it back until they say a word."] },
  { title: "Short and often", say: ["3–6 tries is a whole session. Twice a day beats once for 20 minutes.", "Stop while it's still fun. Two breaks or one Stop ends practice for today."] },
  { title: "When it's hard", say: ["Go back a rung. Easier is not backwards.", "Check: tired, hungry, poorly, too noisy? Try another day.", "Ask your SLP about apraxia of speech if sounds come and go or vary a lot between tries."] },
];
