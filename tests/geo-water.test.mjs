// Unit tests for drawn zones and water danger zones (pure functions, no browser, no network).
// Run: node tests/geo-water.test.mjs
import { createRequire } from "node:module";
import { step, zoneDistance, allZones, distToShape, nearestWater, eventText, pointInRing } from "../geo.js";
import { buildQuery, toFeatures, stitch, clipPoly, clipLine, searchBox, label, fetchWater } from "../water.js";
const simplify = createRequire(import.meta.url)("../vendor/simplify.js");
let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? "ok  " : "FAIL"} ${name}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- shapes ----
const sq = { id: "sq", name: "Garden", shape: "poly", pts: [[41.88, -87.63], [41.88, -87.628], [41.882, -87.628], [41.882, -87.63]] };
t("point in ring (even-odd)", pointInRing(0.5, 0.5, [[0, 0], [1, 0], [1, 1], [0, 1]]) && !pointInRing(2, 0.5, [[0, 0], [1, 0], [1, 1], [0, 1]]));
t("inside a drawn shape is negative", zoneDistance({ lat: 41.881, lng: -87.629 }, sq) < 0);
const out = zoneDistance({ lat: 41.883, lng: -87.629 }, sq);
t("distance outside a drawn shape is about 111 m", near(out, 111, 3));
t("circle zones still work", near(zoneDistance({ lat: 41.88, lng: -87.63 }, { lat: 41.88, lng: -87.63, r: 150 }), -150, 0.01));
t("line distance (river centre line)", near(distToShape({ lat: 41.8805, lng: -87.629 }, "line", [[[41.88, -87.63], [41.88, -87.628]]]), 55.6, 1.5));
t("point distance (pool node)", near(distToShape({ lat: 41.8801, lng: -87.63 }, "point", [[[41.88, -87.63]]]), 11.1, 0.5));
const bow = { id: "bow", shape: "poly", pts: [[0, 0], [0.001, 0.001], [0, 0.001], [0.001, 0]] }; // self-crossing freehand loop
t("self-crossing freehand shape doesn't throw", Number.isFinite(zoneDistance({ lat: 0.0005, lng: 0.0002 }, bow)));

// ---- step(): safe vs danger ----
const st = {};
t("safe zone: first fix sets baseline silently", step([sq], st, { lat: 41.881, lng: -87.629, acc: 10 }).length === 0);
const lv = step([sq], st, { lat: 41.8835, lng: -87.629, acc: 10 });
t("safe zone: leaving gives zone-leave", lv.length === 1 && lv[0].kind === "zone-leave");
const dz = { ...sq, id: "dz", type: "danger", name: "Creek" }, st2 = {};
const first = step([dz], st2, { lat: 41.881, lng: -87.629, acc: 10 });
t("danger zone: first fix inside alerts at once", first.length === 1 && first[0].kind === "danger-enter");
t("danger zone: no repeat while still inside", step([dz], st2, { lat: 41.8811, lng: -87.6291, acc: 10 }).length === 0);
t("danger zone: hysteresis at the edge", step([dz], st2, { lat: 41.8821, lng: -87.629, acc: 10 }).length === 0);
t("danger zone: clear exit gives danger-leave", step([dz], st2, { lat: 41.8835, lng: -87.629, acc: 10 })[0]?.kind === "danger-leave");
t("danger zone: a vague fix far away is skipped", step([dz], {}, { lat: 41.9, lng: -87.629, acc: 400 }).length === 0);
t("danger zone: a vague fix centred inside still counts", step([dz], {}, { lat: 41.881, lng: -87.629, acc: 300 })[0]?.kind === "danger-enter");

// ---- water as one combined danger zone ----
const water = { on: true, buffer: 30, features: [
  { id: "w1", name: "North Pond", kind: "poly", rings: [[[41.9, -87.64], [41.9, -87.638], [41.901, -87.638], [41.901, -87.64]]] },
  { id: "w2", name: "Creek", kind: "line", rings: [[[41.91, -87.65], [41.91, -87.64]]] },
  { id: "w3", name: "Swimming pool", kind: "point", rings: [[[41.92, -87.63]]], ignored: true },
] };
const zs = allZones({ zones: [sq], water });
t("allZones adds one water zone", zs.length === 2 && zs[1].water && zs[1].type === "danger" && zs[1].buffer === 30);
t("allZones skips water when off", allZones({ zones: [sq], water: { ...water, on: false } }).length === 1);
t("nearest water skips ignored places", nearestWater({ lat: 41.92, lng: -87.63 }, water.features).f.id !== "w3");
const ws = {};
step(zs, ws, { lat: 41.895, lng: -87.639, acc: 10 });
const wv = step(zs, ws, { lat: 41.9012, lng: -87.639, acc: 10 }); // ~22 m from the pond, inside the 30 m buffer
t("entering the water buffer gives an urgent water event", wv.length === 1 && wv[0].kind === "danger-enter" && wv[0].water && wv[0].zone.name === "North Pond");
t("event text for water", eventText(wv[0]) === "Near water: North Pond");
t("bigger buffer alerts earlier", zoneDistance({ lat: 41.9015, lng: -87.639 }, { ...zs[1], buffer: 80 }) < 0 && zoneDistance({ lat: 41.9015, lng: -87.639 }, zs[1]) > 0);

// ---- Overpass -> features ----
const q = buildQuery([{ lat: 41.9, lng: -87.6 }, { lat: 41.95, lng: -87.7 }], 99999);
t("query covers water, waterways, pools, reservoirs, coastline", ['"natural"="water"', "waterway", "swimming_pool", "reservoir", "coastline"].every((k) => q.includes(k)) && q.includes("out geom"));
t("query clamps radius to 5 km", q.includes("around:5000,") && !q.includes("99999"));
t("labels", label({ leisure: "swimming_pool" }) === "Swimming pool" && label({ natural: "water", water: "pond" }) === "Pond" && label({ waterway: "stream", name: "Bluff Creek" }) === "Bluff Creek");
const g = (lat, lon) => ({ lat, lon });
t("stitch joins split outer ways (reversed too)", stitch([[g(0, 0), g(0, 1)], [g(1, 1), g(0, 1)], [g(1, 1), g(1, 0), g(0, 0)]])[0].length === 5);
const box = { s: 0, n: 1, w: 0, e: 1 };
const clipped = clipPoly([g(-1, -1), g(-1, 2), g(2, 2), g(2, -1), g(-1, -1)], box);
t("clip a huge lake to the search box", clipped.length === 4 && clipped.every((p) => p.lat >= 0 && p.lat <= 1 && p.lon >= 0 && p.lon <= 1));
t("clip a long river to nearby runs", clipLine([g(5, 5), g(4, 4), g(0.5, 0.5), g(0.6, 0.6), g(4, 4), g(9, 9)], box).length === 1);
t("search box pads the radius", (() => { const b = searchBox([{ lat: 0, lng: 0 }], 1000); return near(b.n * 110540, 1300, 1) && b.s < 0 && b.w < 0; })());
const ring = Array.from({ length: 200 }, (_, i) => g(41.9 + 0.001 * Math.sin((i / 199) * 2 * Math.PI), -87.6 + 0.001 * Math.cos((i / 199) * 2 * Math.PI)));
const json = { elements: [
  { type: "way", id: 1, tags: { natural: "water", water: "pond", name: "Round Pond" }, geometry: ring },
  { type: "way", id: 2, tags: { waterway: "stream" }, geometry: [g(41.9, -87.61), g(41.901, -87.611), g(41.902, -87.612)] },
  { type: "node", id: 3, lat: 41.9005, lon: -87.6005, tags: { leisure: "swimming_pool" } },
  { type: "node", id: 4, lat: 41.9, lon: -87.6, tags: { natural: "water" } },
  { type: "relation", id: 5, tags: { natural: "water", name: "Two-part Lake" }, members: [
    { type: "way", role: "outer", geometry: [g(41.91, -87.6), g(41.91, -87.59)] }, { type: "way", role: "outer", geometry: [g(41.91, -87.59), g(41.92, -87.59), g(41.91, -87.6)] },
    { type: "way", role: "inner", geometry: [g(41.912, -87.595), g(41.913, -87.595), g(41.912, -87.596), g(41.912, -87.595)] } ] },
  { type: "way", id: 1, tags: { natural: "water" }, geometry: ring },
] };
const fs = toFeatures(json, { simplify, centers: [{ lat: 41.9, lng: -87.6 }], radius: 3000 });
t("converts ways, pool nodes and relations; skips shapeless nodes and duplicates", fs.length === 4 && fs.map((f) => f.kind).join() === "poly,line,point,poly");
t("simplifies a 200-point pond to a handful of corners", fs[0].rings[0].length < 60 && fs[0].rings[0].length >= 8);
t("relation outer ways stitched, inner hole ignored (island counts as water)", fs[3].rings.length === 1 && fs[3].name === "Two-part Lake");

// ---- network handling (mock fetch) ----
const res = (status, body) => ({ status, ok: status < 300, json: async () => body });
let calls = 0;
const got = await fetchWater([{ lat: 41.9, lng: -87.6 }], 1000, { simplify, endpoints: ["a", "b"], fetchImpl: async (u) => (calls++, u === "a" ? res(429, {}) : res(200, json)) });
t("busy server (429) falls back to the next endpoint", calls === 2 && got.length === 4);
let err = ""; try { await fetchWater([{ lat: 41.9, lng: -87.6 }], 1000, { endpoints: ["a"], fetchImpl: async () => { throw new TypeError("fetch failed"); } }); } catch (e) { err = e.message; }
t("offline gives a plain message", /offline/.test(err));
err = ""; try { await fetchWater([], 1000); } catch (e) { err = e.message; }
t("no centres asks for a zone first", /safe zone/.test(err));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
