// Run: node tests/symbols.test.mjs
import * as S from "../symbols.js";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}`); };
t("key: case and spaces don't matter", S.keyOf("  Uncle  John ") === "uncle john");
t("crop: centred square of a landscape photo", JSON.stringify(S.cropRect(400, 300)) === JSON.stringify({ x: 50, y: 0, side: 300 }));
t("crop: zoom 2 halves the side", S.cropRect(400, 300, 2).side === 150);
t("crop: centre at the edge stays inside", S.cropRect(400, 300, 2, 0, 0).x === 0 && S.cropRect(400, 300, 2, 1, 1).x === 250);
t("crop: portrait photo", S.cropRect(300, 600, 1, 0.5, 0.25).y === 0 && S.cropRect(300, 600, 1, 0.5, 0.75).y === 300);
t("index: empty without storage", Object.keys(S.index().photos).length === 0 && !S.hasVoice("x"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
