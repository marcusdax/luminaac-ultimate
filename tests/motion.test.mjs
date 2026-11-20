// Unit tests for motion-core.js (docs/MOTION-CONCEPT.md). Run: node tests/motion.test.mjs
import * as M from "../motion-core.js";
import { playSettings } from "../play-core.js";
import { FRAG, MODES } from "../shaders/sky.js";
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// The gate
t("default is ambient (3)", M.motionLevel() === 3);
t("reduce motion turns everything off", M.motionLevel({ reduced: true }) === 0);
t("Still mode turns everything off", M.motionLevel({ still: true, setting: "gentle" }) === 0);
t("Movement: Still = 0, Small = 1, Gentle = 3", M.motionLevel({ setting: "still" }) === 0 && M.motionLevel({ setting: "small" }) === 1 && M.motionLevel({ setting: "gentle" }) === 3);
t("unknown setting falls back to gentle", M.motionLevel({ setting: "wild" }) === 3);
t("low battery, not charging → confirmations only", M.motionLevel({ battery: 0.15, charging: false }) === 1);
t("low battery while charging is fine", M.motionLevel({ battery: 0.15, charging: true }) === 3);
t("low-end tablet: no skies or 3D (2)", M.motionLevel({ cores: 2 }) === 2 && M.motionLevel({ memory: 1 }) === 2);
t("caps never raise a level", M.motionLevel({ setting: "small", cores: 2 }) === 1 && M.motionLevel({ setting: "still", battery: 0.9 }) === 0);
t("reduce motion beats everything", M.motionLevel({ reduced: true, setting: "gentle", battery: 1 }) === 0);
t("every level 0..3 is reachable and in range", [0, 1, 2, 3].every((l) => [{ reduced: true }, { setting: "small" }, { cores: 1 }, {}].some((o) => M.motionLevel(o) === l)));
t("playSettings keeps small, drops nonsense", playSettings({ play: { motion: "small" } }).motion === "small" && playSettings({ play: { motion: "zoom" } }).motion === "gentle");
t("old Calm visuals switch still means Still", playSettings({ calm: true, play: { motion: "gentle" } }).motion === "still");
t("Calm sky defaults to night", playSettings({}).calmSky === "night");

// Timing
t("breath: starts low, peaks at 4 s, back low at 10 s", near(M.breathPhase(0), 0) && near(M.breathPhase(4000), 1) && near(M.breathPhase(10000), 0));
t("breath: halfway in is 0.5, out is slower than in", near(M.breathPhase(2000), 0.5) && M.breathPhase(5000) > 1 - M.breathPhase(1000));
t("breath: in for 4 s, out for 6 s", M.breathing(3999) === "in" && M.breathing(4001) === "out" && M.breathing(9999) === "out" && M.breathing(10001) === "in");
t("breath: never outside 0..1", Array.from({ length: 200 }, (_, i) => M.breathPhase(i * 97)).every((v) => v >= 0 && v <= 1));
t("flight: offset between centres, scale from heights", (() => { const f = M.flight({ left: 0, top: 100, width: 100, height: 100 }, { left: 200, top: 0, width: 50, height: 25 }); return f.dx === -175 && f.dy === 137.5 && f.s === 4; })());
t("ticker: ends on the target, never more than n steps", (() => { const s = M.tickerSteps(0, 1000, 20); return s.length === 20 && s.at(-1) === 1000; })());
t("ticker: small changes step by one, down works too", M.tickerSteps(3, 5).join() === "4,5" && M.tickerSteps(5, 2).join() === "4,3,2");
t("ticker: same value is one step", M.tickerSteps(7, 7).join() === "7");

// Skies
t("skies: every scene has colours in 0..1", Object.keys(M.SKIES).every((s) => { const p = M.skyParams(s); return [...p.a, ...p.b, ...p.c].every((v) => v >= 0 && v <= 1); }));
t("skies: slowest cycle is at least 40 s", Object.keys(M.SKIES).every((s) => M.skyParams(s).speed <= 1 / 40));
t("skies: below level 3 the sky stands still", M.skyParams("sea", 2).speed === 0);
t("skies: unknown scene falls back to day", M.skyParams("moon").mode === M.skyParams("day").mode);
t("shader: one mode per sky, all handled", Object.values(MODES).every((m) => m === 0 || FRAG.includes(`u_mode == ${m}`) || m === 4));

// Lantern Sky
t("lanterns: add keeps order and ids", (() => { let s = { lanterns: [] }; s = M.lanternAdd(s, "I", 0); s = M.lanternAdd(s, "want", 1); return M.lanternSentence(s.lanterns) === "I want" && s.lanterns[1].id === 1; })());
t("lanterns: past six the oldest drifts away", (() => { let s = { lanterns: [] }, r; for (let i = 0; i < 7; i++) { r = M.lanternAdd(s, `w${i}`, i); s = { lanterns: r.lanterns }; } return s.lanterns.length === 6 && r.gone.w === "w0" && s.lanterns[0].w === "w1"; })());
t("lanterns: every lantern is inside the sky", Array.from({ length: 30 }, (_, i) => M.lanternAdd({ lanterns: [] }, "x", i).lanterns[0]).every((l) => l.x > 0.05 && l.x < 0.95 && l.y > 0.1 && l.y < 0.6));
t("constellation: left to right in tap order", (() => { const c = M.constellation([{ w: "a", id: 0 }, { w: "b", id: 1 }, { w: "c", id: 2 }]); return c[0].x < c[1].x && c[1].x < c[2].x && c.map((l) => l.w).join("") === "abc"; })());
t("constellation: one lantern sits in the middle", M.constellation([{ w: "a" }])[0].x === 0.5);

t("lanterns: six live lanterns never share a place", (() => { let s = { lanterns: [] }; for (let i = 0; i < 9; i++) s = { lanterns: M.lanternAdd(s, "w", i).lanterns }; return new Set(s.lanterns.map((l) => l.x + "," + l.y)).size === 6; })());

// Tide Pool
t("ripple: nearest shell first, later ones later", (() => { const h = M.rippleHits(M.SHELLS, 0.2, 0.35, { reach: 0.6, speed: 0.25 }); return h[0].w === "crab" && h[0].ms === 0 && h.every((x, i) => !i || x.ms >= h[i - 1].ms); })());
t("ripple: shells out of reach stay shut", M.rippleHits(M.SHELLS, 0.2, 0.35, { reach: 0.1 }).length === 1);
t("ripple: open shells aren't hit again", M.rippleHits(M.SHELLS, 0.2, 0.35, { reach: 0.1, open: [0] }).length === 0);
t("ripple: a tap in empty water can open nothing", M.rippleHits(M.SHELLS, 0.5, 0.05, { reach: 0.1 }).length === 0);
t("still: the nearest closed shell opens at once", (() => { const h = M.stillHit(M.SHELLS, 0.5, 0.05, [2]); return h.length === 1 && h[0].ms === 0 && h[0].i !== 2; })());
t("ripple speed follows the motion level", M.rippleFor(3).speed < M.rippleFor(1).speed);

// Sound Garden
t("garden: quiet doesn't grow", M.gardenGrow({ h: 0.2, held: 0, bloomed: false }, 0.1).h === 0.2);
t("garden: a sound grows it a little, never a jump", (() => { const r = M.gardenGrow({ h: 0, held: 0, bloomed: false }, 1); return r.h > 0 && r.h < 0.05 && r.event === "start"; })());
t("garden: a long sound (1.2 s) blooms", (() => { let s = { h: 0, held: 0, bloomed: false }; for (let i = 0; i < 12; i++) s = M.gardenGrow(s, 0.5); return s.bloomed && s.event === "bloom"; })());
t("garden: short sounds add up to a bloom too", (() => { let s = { h: 0, held: 0, bloomed: false }, n = 0; while (!s.bloomed && n < 400) { s = M.gardenGrow(s, 0.5); s = M.gardenGrow(s, 0); s = M.gardenGrow(s, 0); s = M.gardenGrow(s, 0); n++; } return s.bloomed; })());
t("garden: taps bloom it in a handful", (() => { let s = { h: 0, held: 0, bloomed: false }, n = 0; while (!s.bloomed) { s = M.gardenTap(s); n++; } return n >= 3 && n <= 6; })());
t("garden: a bloomed flower stays bloomed", M.gardenGrow({ h: 1, held: 0, bloomed: true }, 0).bloomed);

// Aurora Feelings
t("aurora: every feeling has a colour and says it", M.FEELINGS.every((f) => { const a = M.auroraFor(f.id); return a.color.length === 3 && a.say === `I feel ${f.id}.`; }));
t("aurora: even excited is one wave in 6 s or slower", M.FEELINGS.every((f) => M.auroraFor(f.id).speed <= 1 / 6));
t("aurora: no movement below level 3", M.auroraFor("excited", 2).speed === 0);
t("aurora: unknown feeling is calm", M.auroraFor("zzz").id === "calm");

// Word Train
t("train: couple up to six", (() => { let c = []; for (const w of M.TRAIN_WORDS) c = M.trainCouple(c, w); return c.length === M.TRAIN_MAX && c[0] === "I"; })());
t("train: swap changes word order", M.trainSwap(["I", "want", "juice"], 1, 2).join(" ") === "I juice want");
t("train: bad swaps change nothing", M.trainSwap(["a", "b"], 0, 5).join() === "a,b" && M.trainSwap(["a", "b"], 1, 1).join() === "a,b");
t("train: take one off removes the last", M.trainUncouple(["a", "b"]).join() === "a" && M.trainUncouple([]).length === 0);
t("train: carriages follow behind the engine, wrapping round", near(M.carT(1, 0.27), 0.21) && near(M.carT(5, 0.1), 0.8));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
