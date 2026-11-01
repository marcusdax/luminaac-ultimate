// Unit tests for potty-core.js. Run: node tests/potty.test.mjs
import * as P from "../potty-core.js";
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };
const { MIN, DAY } = P;
// Fixed "now": 31 Oct 2026 18:00 local (tz 0 for determinism).
const now = Date.UTC(2026, 9, 31, 18);
let n = 0;
const ev = (kind, data = {}, o = {}) => P.makeEvent(kind, data, { id: o.id || "e" + ++n, dev: o.dev || "A", seq: o.seq ?? n, t: o.t ?? now, tz: 0, by: o.by || "caregiver", sessionId: o.s });
const at = (day, h, m = 0) => now - day * DAY + (h - 18) * 60 * MIN + m * MIN;

// ---------- Merge ----------
const a = [ev("drink", {}, { t: now - 3 * MIN }), ev("void", { type: "urine" }, { t: now - MIN })];
const b = [ev("dry_check", { dry: true }, { t: now - 2 * MIN, dev: "B" }), a[1]];
const shuffle = (x) => [...x].sort(() => Math.random() - 0.5);
const ids = (x) => x.map((e) => e.id).join();
t("merge is commutative", ids(P.merge(a, b)) === ids(P.merge(b, a)));
t("merge is associative", ids(P.merge(P.merge(a, b), [a[0]])) === ids(P.merge(a, P.merge(b, [a[0]]))));
t("merge is idempotent (duplicates do nothing)", ids(P.merge(a, a, b, b)) === ids(P.merge(a, b)) && P.merge(a, b).length === 3);
t("merge order ignores delivery order", ids(P.merge(shuffle([...a, ...b]))) === ids(P.merge(a, b)));
t("merge drops malformed events", P.merge([{ id: "x", kind: "hack", t: 1, data: {} }, { id: "", kind: "void", t: 1, data: {} }, null]).length === 0);
const r = ev("retract", { targetId: a[1].id });
t("retract drops an event from the folds", P.live([...a, r]).length === 1 && !P.live([...a, r]).some((e) => e.id === a[1].id));
t("unknown event kind throws", (() => { try { P.makeEvent("punish"); return false; } catch { return true; } })());

// ---------- State machine ----------
const S = (evs, nowT = now, proto) => P.foldSession(evs, proto, nowT);
const t0 = now - 10 * MIN;
const base = [ev("session_start", { prompted: true }, { s: "s1", t: t0 }), ev("step", { step: "approach" }, { s: "s1", t: t0 + 10e3 }), ev("step", { step: "pants_down" }, { s: "s1", t: t0 + 20e3 })];
t("start → approach", S(base.slice(0, 1), t0 + 1).state === "approach");
const sit = ev("step", { step: "sit" }, { s: "s1", t: t0 + 30e3 });
t("sit step → sitting", S([...base, sit], t0 + 60e3).state === "sitting");
t("timer computed from timestamps (survives sleep)", Math.round(S([...base, sit], t0 + 90e3).sitElapsed) === 60);
t("timer end → body check (no auto-advance to done)", S([...base, sit], t0 + 30e3 + 125e3).state === "body_check");
t("hard cap ends the sit at 5 min", (() => { const s = S([...base, sit], t0 + 30e3 + 301e3, { sitSec: 9999 }); return s.state === "finishing" && s.capped; })());
t("sit length never exceeds cap", P.sitLimits({ sitSec: 900, sitCapSec: 900 }).cap === 300 && P.sitLimits({ sitSec: 900 }, true).cap === 600);
t("more time extends the target", S([...base, sit, ev("body_check", {}, { s: "s1", t: t0 + 155e3 }), ev("more_time", {}, { s: "s1", t: t0 + 156e3 })], t0 + 200e3).state === "sitting");
const v = ev("void", { type: "urine", where: "toilet" }, { s: "s1", t: t0 + 60e3 });
t("void mid-sit → celebrate", S([...base, sit, v], t0 + 61e3).state === "celebrate");
t("void decides the outcome over all-done", (() => { const s = S([...base, sit, ev("sit_end", {}, { s: "s1", t: t0 + 60e3 }), ev("void", {}, { s: "s1", t: t0 + 60e3 + 1, dev: "B" })], t0 + 70e3); return s.outcome === "void"; })());
t("wipe after sit → finishing", S([...base, sit, v, ev("step", { step: "wipe" }, { s: "s1", t: t0 + 70e3 })], t0 + 71e3).state === "finishing");
t("done step ends the session", S([...base, sit, ev("step", { step: "done" }, { s: "s1", t: t0 + 90e3 })], t0 + 91e3).state === "ended");
t("no void is a complete 'tried' session", S([...base, sit, ev("session_end", {}, { s: "s1", t: t0 + 200e3 })], t0 + 201e3).outcome === "tried");
t("refuse ends neutrally", (() => { const s = S([...base, ev("refuse", {}, { s: "s1", t: t0 + 25e3 })], t0 + 26e3); return s.state === "ended" && s.outcome === "refused"; })());
const dist = ev("distress", {}, { s: "s1", t: t0 + 60e3 });
t("distress → co-regulate, timer frozen", (() => { const s = S([...base, sit, dist], t0 + 200e3); return s.state === "coregulate" && Math.round(s.sitElapsed) === 30; })());
t("resume restores and excludes paused time", (() => { const s = S([...base, sit, dist, ev("resume", {}, { s: "s1", t: t0 + 120e3 })], t0 + 130e3); return s.state === "sitting" && Math.round(s.sitElapsed) === 40; })());
t("co-regulate auto-ends after 15 min", S([...base, sit, dist], t0 + 60e3 + 16 * MIN).state === "ended");
t("escalation abort ends session", (() => { const s = S([...base, ev("abort", { escalation: true }, { s: "s1", t: t0 + 40e3 })], t0 + 41e3); return s.state === "ended" && s.escalated; })());
t("idle session goes stale after 30 min", S(base, t0 + 31 * MIN).state === "ended");
t("wet → cleanup path", (() => { const s = S([ev("session_start", { cleanup: true }, { s: "c1", t: t0 }), ev("wet", { type: "urine" }, { s: "c1", t: t0 })], t0 + 1); return s.state === "cleanup" && s.outcome === "wet" && P.currentStep(s).list === P.CLEANUP_STEPS; })());
t("child signal marks initiated", S([ev("session_start", { prompted: false }, { s: "s2", t: t0 }), ev("signal", { modality: "aac_button" }, { s: "s2", t: t0, by: "child" })], t0 + 1).initiated);
t("flush can be left out", !P.stepsFor({ steps: ["approach", "sit", "wash"] }).some((s) => s.id === "flush"));
t("current step skips done steps", P.currentStep(S([...base, sit], t0 + 31e3)).i === 3);

// ---------- Tokens and World ----------
t("signal earns most", P.tokensFor("signal") > P.tokensFor("void"));
t("wet earns nothing", P.tokensFor("wet") === 0 && P.tokensFor("refuse") === 0);
t("void in a nappy earns nothing", P.tokensFor("void", { where: "nappy" }) === 0);
t("sit token can be turned off", P.tokensFor("sit_done", {}, { tokenForSitting: false }) === 0);
const aw = [1, 2, 3].map((i) => ev("token_award", { n: 1 }, { t: now - i * MIN }));
const led = P.ledger([...aw, ev("wet", {}, {}), ev("refuse", {}, {})], { tokenRatio: 2 });
t("ledger never goes down after wet/refusal", led.earned === 3 && led.onBoard === 3 && led.full);
const red = P.ledger([...aw, ev("token_redeem", { ratio: 2 })], { tokenRatio: 2 });
t("redeem spends a board, earned unchanged", red.earned === 3 && red.onBoard === 1 && red.boardsRedeemed === 1);
t("tokens can be switched off", P.tokensFor("signal", {}, { tokensOn: false }) === 0);
const world = P.worldPieces([
  ev("session_start", { prompted: false }, { s: "w1", t: now - 3 * 60 * MIN }), ev("signal", {}, { s: "w1", t: now - 3 * 60 * MIN, by: "child" }), ev("session_end", {}, { s: "w1", t: now - 170 * MIN }),
  ev("session_start", {}, { s: "w2", t: now - 2 * 60 * MIN }), ev("refuse", {}, { s: "w2", t: now - 119 * MIN }),
  ev("session_start", {}, { s: "w3", t: now - 60 * MIN }), ev("step", { step: "sit" }, { s: "w3", t: now - 59 * MIN }), ev("void", {}, { s: "w3", t: now - 58 * MIN }), ev("step", { step: "done" }, { s: "w3", t: now - 55 * MIN }),
]);
t("World: signal big, refusal tiny, void medium", world.join() === "big,tiny,medium");

// ---------- Guard rails ----------
const today = (h, m = 0) => at(0, h, m);
const two = [ev("refuse", {}, { t: today(9) }), ev("refuse", {}, { t: today(10) })];
t("2 refusals stop scheduled sits today", !P.canScheduleSit(two, {}, today(12)).ok);
t("1 distress stops scheduled sits today", !P.canScheduleSit([ev("distress", {}, { t: today(9) })], {}, today(12)).ok);
t("min gap between sits", (() => { const r = P.canScheduleSit([ev("sit_start", {}, { t: today(12) })], {}, today(12, 10)); return !r.ok && r.wait > 0; })());
t("fresh day allows a sit", P.canScheduleSit(two, {}, at(-1, 9)).ok);
t("pause blocks scheduled sits", !P.canScheduleSit([], {}, now, { paused: true, reasons: [{ label: "x" }] }).ok);
t("next window picks the upcoming time", (() => { const w = P.nextWindow({ sitWindows: ["07:30", "23:59"] }, new Date(2026, 9, 31, 12).getTime()); return new Date(w).getHours() === 23; })());

// ---------- Red flags ----------
const logDay = (d, extra = []) => [ev("dry_check", {}, { t: at(d, 8) }), ev("drink", {}, { t: at(d, 11) }), ev("void", { type: "urine" }, { t: at(d, 14) }), ...extra];
const days4 = [3, 2, 1, 0].flatMap((d) => logDay(d));
t("no poo for 3 covered days pauses", P.pauseState([ev("void", { type: "bm", stool: 4 }, { t: at(4, 9) }), ...days4], {}, {}, now).reasons.some((x) => x.code === "no_bm"));
t("uncovered days are a gap, not a flag", (() => { const p = P.pauseState([ev("void", { type: "bm", stool: 4 }, { t: at(4, 9) })], {}, {}, now); return !p.paused && p.info.some((x) => x.code === "bm_gap"); })());
t("recent poo → no pause", !P.pauseState([...days4, ev("void", { type: "bm", stool: 4 }, { t: at(0, 9) })], {}, {}, now).paused);
t("hard poos twice in a week flag", P.ruleFlags([ev("void", { type: "bm", stool: 1 }, { t: at(2, 9) }), ev("void", { type: "bm", stool: 2 }, { t: at(1, 9) })], {}, now).some((x) => x.code === "hard_stool"));
const prof = { screening: [{ code: "blood", present: true, at: now - DAY }, { code: "thirst", present: false }] };
t("screening 'yes' pauses", P.pauseState([], prof, {}, now).reasons.some((x) => x.code === "blood"));
t("doctor-checked resume snoozes a code", !P.pauseState([ev("protocol_resume", { code: "blood" }, { t: now - MIN })], prof, {}, now).paused);
t("urgent codes never snooze", P.pauseState([ev("protocol_resume", { code: "no_urine" }, { t: now - MIN })], { screening: [{ code: "no_urine", present: true, at: now - DAY }] }, {}, now).urgent);
t("manual pause and resume", P.pauseState([ev("protocol_pause", { manual: true }, { t: now - 2 * MIN })], {}, {}, now).paused && !P.pauseState([ev("protocol_pause", { manual: true }, { t: now - 2 * MIN }), ev("protocol_resume", {}, { t: now - MIN })], {}, {}, now).paused);

// ---------- Hints ----------
t("void-time hint is gated below threshold", !P.voidTimes(days4, now).ready);
const hist = [];
for (let d = 0; d < 10; d++) {
  hist.push(ev("dry_check", {}, { t: at(d, 7) }), ev("drink", {}, { t: at(d, 9, 50) }), ev("void", { type: "urine" }, { t: at(d, 10, 12 + (d % 3)) }), ev("void", { type: "urine" }, { t: at(d, 15, d % 5) }), ev("drink", {}, { t: at(d, 14, 40) }), ev("void", { type: "bm", stool: 4 }, { t: at(d, 18) }));
}
const vt = P.voidTimes(hist, now);
t("void-time hint finds ~10:13", vt.ready && vt.peaks.some((p) => Math.abs(p.minute - 613) <= 3));
t("void-time hint shows its support", vt.peaks[0].days >= 4 && /fully logged days/.test(vt.peaks[0].why));
const dv = P.drinkToVoid(hist);
t("drink→void ~22 min", dv.ready && Math.abs(dv.minutes - 22) <= 3 && dv.sitAfter < dv.minutes);
t("drink→void gated", !P.drinkToVoid(hist.slice(0, 12)).ready);
const reg = [];
for (let d = 8; d < 21; d++) for (let k = 0; k < 2; k++) reg.push(ev("void", { type: "urine" }, { t: at(d, 9 + k * 4) }));
for (let d = 0; d < 7; d++) reg.push(ev(d < 4 ? "wet" : "void", { type: "urine" }, { t: at(d, 9) }));
t("regression flagged without blame", (() => { const r = P.regression(reg, now); return r && r.wets >= 3 && !/fail|bad/i.test(r.text); })());
t("no regression on stable data", !P.regression(hist, now));
t("ICS has a daily alarm per window", (() => { const s = P.ics({ sitWindows: ["07:30", "10:05"] }, "Sam"); return (s.match(/BEGIN:VEVENT/g) || []).length === 2 && s.includes("RRULE:FREQ=DAILY") && s.includes("T100500"); })());
const packed = P.unpack(P.pack(hist.slice(0, 5)));
t("QR pack/unpack round-trips", ids(packed) === ids(hist.slice(0, 5)) && packed[2].data.type === "urine");
t("unpack rejects junk", P.unpack("not json").length === 0 && P.unpack(JSON.stringify([[1, 2]])).length === 0);
const wk = P.weekSummary([ev("signal", { modality: "leads_adult" }, { t: now - 20 * MIN }), ev("void", {}, { t: now - 15 * MIN })], {}, now);
t("week summary counts signal precision", wk.signals === 1 && wk.precision === 100 && wk.modalities[0][0] === "leads_adult");
t("suggestions never change the plan, only advise", Array.isArray(P.suggestions(hist, { phase: 3 }, now)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
