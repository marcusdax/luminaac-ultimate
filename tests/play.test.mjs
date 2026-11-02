// Unit tests for play-core.js (the eight word games). Run: node tests/play.test.mjs
import * as P from "../play-core.js";
import { CORE } from "../vocab.js";
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };

t("eight games, each with a scene and World pieces", P.GAMES.length === 8 && P.GAMES.every((g) => g.scene && P.PIECES[g.id]));
const s = P.playSettings({ play: { minutes: 7, tiles: 40, off: ["robot"] }, calm: true, quiet: true });
t("settings: bad values fall back, calm and quiet switches still win", s.minutes === 10 && s.tiles === 12 && s.motion === "still" && s.sound === "off");
t("settings: a game turned off is hidden", P.shown(s).length === 7 && !P.shown(s).some((g) => g.id === "robot"));
t("session cap: 0 means no cap; never negative", P.minutesLeft(0, 0, 9e9) === Infinity && P.minutesLeft(0, 5, 10 * 60e3) === 0);

let w = { pieces: [] };
for (let i = 0; i < 5; i++) w = P.addPiece(w, "garden", "try", i);
w = P.addPiece(w, "garden", "landmark", 9);
t("World only grows: every try adds, landmark uses the big piece", w.pieces.length === 6 && w.pieces.at(-1).e === "🌳");

const L = P.layoutTiles(["go", "stop", "more", "park"], CORE);
const col = (x) => L.find((y) => y.w === x).col;
t("board bridge: core words keep their Talk column", col("go") === 3 && col("stop") === 4 && col("more") === 6);
t("board bridge: extra words fill free places, no two tiles share a cell", new Set(L.map((x) => `${x.row}:${x.col}`)).size === L.length);

let g = P.gardenStep(undefined, "flower", 0);
t("garden: first word sprouts", g.event === "sprout" && g.state.plants[0].stage === 1);
g = P.gardenStep(g.state, "flower", 20000);
t("garden: same word grows", g.event === "grow" && g.state.plants[0].stage === 2);
g = P.gardenStep(g.state, "water", 22000);
t("garden: two words within 8 s make it bloom and say both", g.event === "bloom" && g.say === "flower water!" && g.state.plants.find((p) => p.w === "water").stage === 3);
t("garden: combos can be switched off", P.gardenStep(g.state, "tree", 23000, false).event === "sprout");
t("garden: nothing ever shrinks", (() => { let st = g.state; for (let i = 0; i < 10; i++) st = P.gardenStep(st, "flower", 40000 + i * 9000).state; return st.plants.every((p) => p.stage >= 1); })());

let c = P.conductorStep(undefined, "park");
t("conductor: choosing a place doesn't move the train by itself", !c.state.moving && c.anim === null && c.state.dest === "park");
c = P.conductorStep(c.state, "go");
t("conductor: go with a place makes a trip", c.anim === "trip" && c.state.lastTrip === "park");
c = P.conductorStep(c.state, "stop");
t("conductor: stop always stops", !c.state.moving && c.anim === "stop");
c = P.conductorStep(c.state, "again");
t("conductor: again repeats the last trip", c.anim === "trip" && c.state.dest === "park" && /Again/.test(c.say));
t("conductor: more speeds up, capped", P.conductorStep({ moving: true, speed: 3 }, "more").state.speed === 3);

t("weather: storms take 3 breaths, rain 2, sun none", P.stormSteps("stormy") === 3 && P.stormSteps("rainy") === 2 && P.stormSteps("sunny") === 0 && P.afterBreath(0) === 0);
t("story: builds a plain sentence", P.sentence({ who: "dino", act: "jump", where: "park" }) === "The dino jumps in the park." && P.sentence({ who: "cat", act: "sleep", where: "home" }) === "The cat sleeps at home.");

let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const r = P.sortRound("kind", 3, rnd);
t("pattern lab: the item belongs to one of the boxes shown", r.boxes.length === 3 && r.boxes.some((b) => b.box === r.answer) && P.SORT_SETS.kind.find((x) => x.box === r.answer).items.includes(r.item));
t("pattern lab: a wrong box is never 'wrong', it points to the right one", (() => { const other = r.boxes.find((b) => b.box !== r.answer).box; const x = P.sortTry(r, other); return !x.ok && x.hint === r.answer && !/wrong|no/i.test(x.say); })());

let tt = { who: "child", n: 0, round: "blocks" };
for (let i = 0; i < 6; i++) tt = P.nextTurn(tt);
t("turns: alternate, and the round changes every 6 turns", tt.who === "child" && tt.round === "drum");

let p = { held: 0, x: 0 }, arrived = false;
for (let i = 0; i < 60; i++) { p = P.pondFrame(p, 0.6, 300); arrived ||= p.arrived; }
t("pond: a long sound swims the fish across once", arrived && p.x === 1);
t("pond: higher pitch, higher fish; quiet makes no ripple", P.pondFrame({ held: 0, x: 0 }, 0.6, 500).y > P.pondFrame({ held: 0, x: 0 }, 0.6, 150).y && !P.pondFrame(undefined, 0.1, 0).ripple);

const base = () => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5 }));
const pose = (wl, wr) => { const lm = base(); lm[0] = { x: 0.5, y: 0.3 }; lm[11] = { x: 0.6, y: 0.45 }; lm[12] = { x: 0.4, y: 0.45 }; lm[15] = wl; lm[16] = wr; return lm; };
t("robot: arms up", P.classifyPose(pose({ x: 0.65, y: 0.1 }, { x: 0.35, y: 0.1 })) === "arms-up");
t("robot: one arm up", P.classifyPose(pose({ x: 0.65, y: 0.1 }, { x: 0.35, y: 0.7 })) === "one-up");
t("robot: arms out wide", P.classifyPose(pose({ x: 0.95, y: 0.46 }, { x: 0.05, y: 0.44 })) === "arms-out");
t("robot: hands on head", P.classifyPose(pose({ x: 0.55, y: 0.25 }, { x: 0.45, y: 0.25 })) === "hands-head");
t("robot: arms down is no pose", P.classifyPose(pose({ x: 0.62, y: 0.8 }, { x: 0.38, y: 0.8 })) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
