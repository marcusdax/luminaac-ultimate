// Unit tests for nav-core.js (redesign R1). Run: node tests/nav.test.mjs
import * as N from "../nav-core.js";
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };

const ALL = ["today", "signals", "vocab", "routines", "play", "potty", "sound", "insights", "team", "safety", "account", "privacy"];
const placed = N.HUBS.flatMap((h) => h.tabs);
t("every old tab is in exactly one hub", ALL.every((x) => placed.filter((y) => y === x).length === 1) && placed.length === ALL.length);
t("four hubs", N.HUBS.length === 4);
t("hubOf: potty lives in Programs", N.hubOf("potty").id === "programs");
t("hubOf: unknown tab falls back to Home", N.hubOf("nope").id === "home");

t("hash: hub name opens its first tab", N.resolveHash("#circle") === "team");
t("hash: old tab links still work", N.resolveHash("#sound") === "sound");
t("hash: junk gives nothing", N.resolveHash("#x") === null && N.resolveHash("") === null);

t("hub remembers the last tab used", N.tabForHub("programs", { programs: "sound" }) === "sound");
t("hub skips a remembered tab that is now hidden", N.tabForHub("programs", { programs: "potty" }, (x) => x !== "potty") === "vocab");
t("hub skips hidden tabs when nothing is remembered", N.tabForHub("programs", {}, (x) => x !== "vocab") === "routines");

t("flag: ?redesign=1 turns it on", N.readFlag("?redesign=1", null));
t("flag: ?redesign=0 wins over stored", !N.readFlag("?a=b&redesign=0", "1"));
t("flag: stored value used without a query", N.readFlag("", "1") && !N.readFlag("", null));

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
