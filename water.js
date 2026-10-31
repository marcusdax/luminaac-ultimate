// Water danger zones: find mapped water near the family's places from OpenStreetMap
// (Overpass API), turn it into small simplified shapes, and cache them in the
// family document so My Voice can check them on the device, offline, without
// ever sending its position anywhere. Pure functions here are also used by tests.
// Data © OpenStreetMap contributors, ODbL.
export const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
export const MAX_FEATURES = 300;
const WATERWAYS = "river|stream|canal|drain|ditch|tidal_channel";

// One Overpass QL query for every centre. "out geom" returns coordinates inline,
// so we don't need a second request or osmtogeojson.
export function buildQuery(centers, radius = 1500) {
  const r = Math.round(Math.min(Math.max(radius, 100), 5000));
  const parts = centers.slice(0, 8).flatMap(({ lat, lng }) => {
    const a = `(around:${r},${(+lat).toFixed(5)},${(+lng).toFixed(5)})`;
    return [`nwr["natural"="water"]${a};`, `way["waterway"~"^(${WATERWAYS})$"]${a};`, `nwr["leisure"="swimming_pool"]${a};`, `nwr["landuse"="reservoir"]${a};`, `way["natural"="coastline"]${a};`, `nwr["leisure"="water_park"]${a};`];
  });
  return `[out:json][timeout:25];(${parts.join("")});out geom qt 4000;`;
}

export function label(t = {}) {
  if (t.leisure === "swimming_pool") return t.name || "Swimming pool";
  if (t.leisure === "water_park") return t.name || "Water park";
  if (t.natural === "coastline") return t.name || "Shoreline";
  if (t.waterway) return t.name || ({ river: "River", stream: "Stream", canal: "Canal", drain: "Drain", ditch: "Ditch", tidal_channel: "Tidal channel" }[t.waterway] || "Waterway");
  const kind = { pond: "Pond", lake: "Lake", reservoir: "Reservoir", river: "River", basin: "Basin", lagoon: "Lagoon", canal: "Canal", stream_pool: "Pool", fountain: "Fountain" }[t.water] || (t.landuse === "reservoir" ? "Reservoir" : "Water");
  return t.name || kind;
}
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const same = (a, b) => a && b && a.lat === b.lat && a.lon === b.lon;

// Join a relation's outer ways into closed rings by matching end points.
export function stitch(ways) {
  const left = ways.filter((w) => w?.length > 1).map((w) => w.slice()), rings = [];
  while (left.length) {
    let ring = left.shift();
    for (let grew = true; grew && !same(ring[0], ring[ring.length - 1]);) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i], end = ring[ring.length - 1];
        if (same(end, w[0])) ring = ring.concat(w.slice(1));
        else if (same(end, w[w.length - 1])) ring = ring.concat(w.slice(0, -1).reverse());
        else continue;
        left.splice(i, 1); grew = true; break;
      }
    }
    rings.push(ring);
  }
  return rings;
}

// Search box around the centres, padded, in degrees: { s, w, n, e }.
export function searchBox(centers, radius) {
  const pad = radius + 300, dLat = pad / 110540;
  return centers.reduce((b, c) => { const dLng = pad / (111320 * Math.cos((c.lat * Math.PI) / 180)); return { s: Math.min(b.s, c.lat - dLat), n: Math.max(b.n, c.lat + dLat), w: Math.min(b.w, c.lng - dLng), e: Math.max(b.e, c.lng + dLng) }; }, { s: 90, n: -90, w: 180, e: -180 });
}
// Sutherland-Hodgman: clip a polygon ring to the search box, so a lake or sea
// becomes just the nearby shore (Lake Michigan is 30,000 points otherwise).
export function clipPoly(ring, b) {
  const edges = [[(p) => p.lat >= b.s, (a, c) => ({ lat: b.s, lon: a.lon + ((c.lon - a.lon) * (b.s - a.lat)) / (c.lat - a.lat) })], [(p) => p.lat <= b.n, (a, c) => ({ lat: b.n, lon: a.lon + ((c.lon - a.lon) * (b.n - a.lat)) / (c.lat - a.lat) })], [(p) => p.lon >= b.w, (a, c) => ({ lon: b.w, lat: a.lat + ((c.lat - a.lat) * (b.w - a.lon)) / (c.lon - a.lon) })], [(p) => p.lon <= b.e, (a, c) => ({ lon: b.e, lat: a.lat + ((c.lat - a.lat) * (b.e - a.lon)) / (c.lon - a.lon) })]];
  let out = same(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring.slice();
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const cur = src[i], prev = src[(i + src.length - 1) % src.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cut(prev, cur)); out.push(cur); } else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}
// Lines (rivers, shoreline): keep only the runs of points near the search box.
export function clipLine(line, b) {
  const inB = (p) => p.lat >= b.s && p.lat <= b.n && p.lon >= b.w && p.lon <= b.e, runs = []; let run = [];
  for (let i = 0; i < line.length; i++) {
    if (inB(line[i]) || (i > 0 && inB(line[i - 1])) || (i < line.length - 1 && inB(line[i + 1]))) run.push(line[i]);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length > 1);
}
// Simplify in metres (simplify-js works on {x, y}), then back to [lat, lng].
function simplifyRing(geom, simplify, tol) {
  const ref = geom[0], kx = 111320 * Math.cos((ref.lat * Math.PI) / 180), ky = 110540;
  let pts = geom.map((g) => ({ x: (g.lon - ref.lon) * kx, y: (g.lat - ref.lat) * ky }));
  if (simplify && pts.length > 4) pts = simplify(pts, tol, true);
  return pts.map((p) => [r5(ref.lat + p.y / ky), r5(ref.lon + p.x / kx)]);
}

// Overpass JSON -> [{ id, name, kind: "poly" | "line" | "point", rings }]
export function toFeatures(json, { simplify, tolerance = 3, centers = [], radius = 0 } = {}) {
  const out = [], seen = new Set(), box = centers.length && radius ? searchBox(centers, radius) : null;
  const polys = (gs) => gs.map((g) => (box ? clipPoly(g, box) : g)).filter((g) => g.length > 2).map((g) => simplifyRing(g, simplify, tolerance));
  for (const e of json?.elements || []) {
    const t = e.tags || {}, id = `${e.type[0]}${e.id}`;
    if (seen.has(id)) continue; seen.add(id);
    let kind, rings;
    if (e.type === "node") {
      if (t.leisure !== "swimming_pool" && t.leisure !== "water_park") continue; // a lake tagged on a single node has no shape
      kind = "point"; rings = [[[r5(e.lat), r5(e.lon)]]];
    } else if (e.type === "way" && e.geometry?.length > 1) {
      const closed = same(e.geometry[0], e.geometry[e.geometry.length - 1]);
      kind = t.waterway || t.natural === "coastline" || !closed ? "line" : "poly";
      rings = kind === "line" ? (box ? clipLine(e.geometry, box) : [e.geometry]).map((g) => simplifyRing(g, simplify, tolerance)) : polys([e.geometry]);
    } else if (e.type === "relation" && e.members) {
      const outers = e.members.filter((m) => m.type === "way" && m.role !== "inner" && m.geometry).map((m) => m.geometry);
      const st = stitch(outers); if (!st.length) continue;
      kind = "poly"; rings = polys(st);
    } else continue;
    if (!rings.length) continue;
    out.push({ id, name: label(t), kind, rings });
  }
  // Keep the closest ones if a big city returns too many.
  if (out.length > MAX_FEATURES && centers.length) {
    const d = (f) => Math.min(...centers.map((c) => Math.hypot(f.rings[0][0][0] - c.lat, f.rings[0][0][1] - c.lng)));
    out.sort((a, b) => d(a) - d(b)); out.length = MAX_FEATURES;
  }
  return out;
}

export async function fetchWater(centers, radius, { simplify, fetchImpl = fetch, endpoints = ENDPOINTS, signal, headers = {}, timeoutMs = 40000 } = {}) {
  if (!centers.length) throw new Error("Add a safe zone or use your location first.");
  const q = buildQuery(centers, radius);
  let last;
  for (const url of endpoints) {
    try {
      const r = await fetchImpl(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
      if (r.status === 429 || r.status === 504) { last = new Error("The map service is busy. Try again in a minute."); continue; }
      if (!r.ok) { last = new Error(`The map service said ${r.status}.`); continue; }
      const json = await r.json();
      return toFeatures(json, { simplify, centers, radius });
    } catch (e) { if (e.name === "AbortError") throw e; if (e.name === "TimeoutError") { last = new Error("The map service is slow right now. Try again in a minute."); continue; } last = /fetch|network/i.test(e.message) ? new Error("Can't reach the map service (offline?). Saved water still works.") : e; }
  }
  throw last || new Error("Couldn't load water.");
}
