// Unit tests for safety-core.js (Safety Links). Run: node tests/safety.test.mjs
import * as S from "../safety-core.js";
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };
const MIN = 60e3, now = 1_800_000_000_000;

const door = { name: "Back door", kind: "door", urgent: true };
t("door_open: urgent, exit rule, clear message", (() => { const e = S.hookEvent({ event: "door_open" }, door); return e.urgent && e.rule === "exit" && e.message === "Back door: door opened"; })());
t("plain message still works (IFTTT value1)", S.hookEvent({ value1: "opened" }, door).message === "Back door: opened");
t("a plain door alert still uses the exit rule", S.hookEvent({}, door).rule === "exit");
t("seizure and SOS are urgent even on a quiet sensor", S.hookEvent({ event: "seizure_alert" }, { urgent: false }).urgent && S.hookEvent({ event: "wearable_sos" }, { urgent: false }).urgent);
t("unknown event is a message, not dropped", S.hookEvent({ event: "zzz", message: "hi" }, door).message === "Back door: hi");
t("location: kept only when valid", S.hookEvent({ event: "location", lat: 51.5, lng: -0.12 }).loc.lat === 51.5 && S.hookEvent({ lat: 200, lng: 0 }).loc === null);
t("heart rate: only believable values", S.hookEvent({ event: "arousal", hr: 300 }).hr === null && S.hookEvent({ event: "arousal", hr: "96" }).hr === 96);
t("control characters stripped from messages", !/\n/.test(S.hookEvent({ message: "a\nb" }, door).message));

t("exit rule: going out together keeps it calm", !S.exitRule({ out: now + 10 * MIN }, now).urgent);
t("exit rule: tablet still at home → may have left without it", /left without it/.test(S.exitRule({ tablet: { last: { t: now - MIN, lat: 51, lng: 0 }, prev: { t: now - 5 * MIN, lat: 51, lng: 0 } } }, now).why));
t("exit rule: tablet moving says so", /moving/.test(S.exitRule({ tablet: { last: { t: now - MIN, lat: 51.01, lng: 0 }, prev: { t: now - 5 * MIN, lat: 51, lng: 0 } } }, now).why));
t("exit rule: expired going-out is urgent again", S.exitRule({ out: now - 1 }, now).urgent);
t("metres: about 1.1 km for 0.01° of latitude", Math.abs(S.metres({ lat: 51, lng: 0 }, { lat: 51.01, lng: 0 }) - 1112) < 5);

const rs = (v, ago = 1000) => ({ t: now - ago, rssi: v });
t("bluetooth: strong signal is near", S.bleState([rs(-60), rs(-62), rs(-95)], now).state === "near");
t("bluetooth: one bad reading doesn't flip it", S.bleState([rs(-60), rs(-61), rs(-99)], now).state === "near");
t("bluetooth: weak is far, middling is nearby", S.bleState([rs(-92)], now).state === "far" && S.bleState([rs(-80)], now).state === "nearby");
t("bluetooth: nothing for 30 s is lost signal", S.bleState([rs(-60, 40e3)], now).state === "lost" && S.bleState([], now).state === "lost");

const hr = (v, minsAgo, moving) => ({ t: now - minsAgo * MIN, hr: v, ...(moving && { moving: true }) });
const calmish = [hr(80, 30), hr(82, 25), hr(79, 20), hr(81, 15), hr(80, 10)];
t("calm check: too few readings, no nudge", !S.calmCheck([hr(130, 1)], {}, now).nudge);
t("calm check: high and still for 3 minutes → nudge", S.calmCheck([...calmish, hr(115, 3), hr(118, 2), hr(120, 1), hr(119, 0)], {}, now).nudge);
t("calm check: high while moving (playing) → no nudge", !S.calmCheck([...calmish, hr(115, 3, 1), hr(118, 2, 1), hr(120, 1, 1), hr(119, 0, 1)], {}, now).nudge);
t("calm check: at most one nudge per 30 minutes", !S.calmCheck([...calmish, hr(115, 3), hr(118, 2), hr(120, 1), hr(119, 0)], { lastNudge: now - 10 * MIN }, now).nudge);
t("calm check: a set resting rate is used", S.calmCheck([...calmish, hr(100, 3), hr(100, 2), hr(100, 1), hr(100, 0)], { rest: 70 }, now).nudge);

const fv = S.foundView({ name: "Sam", phone: "+44 (0)7700 900123", approach: "Speak softly", address: "1 High St", lat: 51, photo: "javascript:alert(1)" });
t("if found: chosen fields only, no address or location", fv.name === "Sam" && fv.approach && !("address" in fv) && !("lat" in fv));
t("if found: a default 'I use a tablet' line", /tablet/.test(fv.speaks));
t("if found: unsafe photo dropped, phone cleaned", !fv.photo && /^\+44/.test(fv.phone));
t("if found: too-short phone dropped", !("phone" in S.foundView({ phone: "12" })));

const tr = [{ id: "a", battery: new Date(now + 3 * 864e5).toISOString().slice(0, 10) }, { id: "b", battery: new Date(now - 864e5).toISOString().slice(0, 10) }, { id: "c" }];
t("battery: due soon and overdue listed, others not", (() => { const d = S.batteryDue(tr, now); return d.length === 2 && d.find((x) => x.id === "b").overdue && !d.find((x) => x.id === "a").overdue; })());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
