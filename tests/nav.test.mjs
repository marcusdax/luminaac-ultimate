// Unit tests for nav-core.js (redesign R1). Run: node tests/nav.test.mjs
import * as N from "../nav-core.js";
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };

const ALL = ["today", "signals", "vocab", "routines", "play", "potty", "sound", "insights", "team", "safety", "account", "privacy"];
const placed = N.HUBS.flatMap((h) => h.tabs);
t("every old tab is in exactly one hub", ALL.every((x) => placed.filter((y) => y === x).length === 1) && placed.length === ALL.length);
t("five hubs, Safety one tap away", N.HUBS.length === 5 && N.hubOf("safety").id === "safety" && N.resolveHash("#safety") === "safety");
t("hubOf: potty lives in Programs", N.hubOf("potty").id === "programs");
t("hubOf: unknown tab falls back to Home", N.hubOf("nope").id === "home");

t("hash: hub name opens its first tab", N.resolveHash("#circle") === "team" && N.resolveHash("#programs") === "vocab");
t("hash: old tab links still work", N.resolveHash("#sound") === "sound");
t("hash: junk gives nothing", N.resolveHash("#x") === null && N.resolveHash("") === null);

t("hub remembers the last tab used", N.tabForHub("programs", { programs: "sound" }) === "sound");
t("hub skips a remembered tab that is now hidden", N.tabForHub("programs", { programs: "potty" }, (x) => x !== "potty") === "vocab");
t("hub skips hidden tabs when nothing is remembered", N.tabForHub("programs", {}, (x) => x !== "vocab") === "routines");

t("flag: ?redesign=1 turns it on", N.readFlag("?redesign=1", null));
t("flag: ?redesign=0 wins over stored", !N.readFlag("?a=b&redesign=0", "1"));
t("flag: on by default, a stored 0 keeps the classic tabs", N.readFlag("", null) && N.readFlag("", "1") && !N.readFlag("", "0"));
t("flag: ?redesign=1 wins over a stored 0", N.readFlag("?redesign=1", "0"));

const P = [
  { id: "a", steps: [{ t: "A1" }, { t: "A2" }, { t: "A3" }] },
  { id: "b", steps: [{ t: "B1" }, { t: "B2" }] },
];
t("now/next: hidden when no plan is under way", N.nowNext(P, {}) === null);
t("now/next: hidden when a plan is finished", N.nowNext(P, { b: [0, 1] }) === null);
t("now/next: first unfinished step and the one after", (() => { const x = N.nowNext(P, { a: [0] }); return x.plan.id === "a" && x.now.t === "A2" && x.next.t === "A3"; })());
t("now/next: last step has no next", N.nowNext(P, { a: [0, 1] }).next === null);
t("now/next: the plan opened last wins", N.nowNext(P, { a: [0], b: [0] }, "b").plan.id === "b");
t("now/next: steps done out of order", N.nowNext(P, { a: [1] }).now.t === "A1");

const now = 1_000_000_000;
t("back to care: fresh stamp with #care opens Caregiver", N.backToCare("#care", String(now - 1000), now));
t("back to care: no stamp stays on Talk", !N.backToCare("#care", null, now));
t("back to care: old stamp stays on Talk", !N.backToCare("#care", String(now - 10 * 60e3), now));
t("back to care: stamp without #care stays on Talk", !N.backToCare("", String(now), now));

// R2
t("roles: teacher hides Safety and Progress", N.hubsFor("teacher").join() === "home,programs,circle");
t("roles: everything shows all five hubs", N.hubsFor("family", true).length === 5);
t("roles: unknown role falls back to parent", N.viewFor("x").label === "Parent");
t("log: role defaults order the sheet", N.logChoices("teacher")[0] === "note");
t("log: most used moves up", N.logChoices("teacher", { potty: 5 })[0] === "potty");
t("log: never more than six", N.logChoices("parent").length === 6);
t("log: unavailable choices drop out", !N.logChoices("parent", {}, (k) => k !== "potty").includes("potty"));
const H = N.handoff({ notes: [{ kind: "meal", t: now - 3600e3, text: "Toast" }, { kind: "behaviour", t: now - 60e3, text: "Upset at the bell" }], potty: [{ kind: "void", t: now - 7200e3, data: {} }, { kind: "wet", t: now - 9000e3, data: {} }], mood: "calm", alerts: [{ t: now - 1, ack: null, message: "Needs help" }], moments: [{ t: now - 5, meaning: "Park" }] }, now);
t("handoff: last ate", H.ate.text === "Toast");
t("handoff: last toilet is the newest", H.toilet.text === "Used the toilet");
t("handoff: things to watch", H.watch.length === 2 && H.watch[0] === "Needs help");
t("handoff: old things drop off", N.handoff({ notes: [{ kind: "meal", t: now - 20 * 3600e3, text: "x" }] }, now).ate === null);
t("handoff: said recently", H.said[0] === "Park" && H.mood === "calm");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
