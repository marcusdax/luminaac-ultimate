// Fast water finder: look for the map's water colour in the OpenStreetMap
// picture tiles around each place, and turn every blue patch into a danger
// shape. Tiles come from a CDN in about a second, while the Overpass search
// (water.js) can take a minute or time out. Overpass still runs afterwards to
// add names ("Mill Pond"); if it fails, these shapes are kept.
// Map tiles © OpenStreetMap contributors. A search loads at most 25 tiles per
// place, the same as scrolling the map a little.
import { searchBox } from "./water.js";

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MAX_TILES = 25;
export const MAX_SHAPES = 300;
const WATER = [170, 211, 223]; // OSM Carto water and swimming pools, #aad3df
const TOL = 14;

export function isWater(r, g, b) {
  return Math.abs(r - WATER[0]) <= TOL && Math.abs(g - WATER[1]) <= TOL && Math.abs(b - WATER[2]) <= TOL;
}

// Web Mercator: degrees <-> global pixel at zoom z (256 px tiles).
export function toPixel(lat, lng, z) {
  const n = 256 * 2 ** z, s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
export function toLatLng(x, y, z) {
  const n = 256 * 2 ** z, k = Math.PI * (1 - (2 * y) / n);
  return [(Math.atan(Math.sinh(k)) * 180) / Math.PI, (x / n) * 360 - 180];
}

// The most detailed zoom (17 down to 13) that covers one place's search box in
// MAX_TILES tiles or fewer, and that box in global pixels.
export function tilePlan(center, radius) {
  const b = searchBox([center], radius);
  for (let z = 17; z >= 13; z--) {
    const a = toPixel(b.n, b.w, z), c = toPixel(b.s, b.e, z);
    const x0 = Math.floor(a.x / 256), x1 = Math.floor(c.x / 256), y0 = Math.floor(a.y / 256), y1 = Math.floor(c.y / 256);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILES || z === 13) return { z, x0, x1, y0, y1, px: { x0: a.x, y0: a.y, x1: c.x, y1: c.y } };
  }
}

// RGBA pixels -> a grid of cells; a cell is water when a third of its pixels are.
export function cellGrid(rgba, width, height, cell = 3) {
  const cols = Math.floor(width / cell), rows = Math.floor(height / cell), grid = new Uint8Array(cols * rows), need = Math.ceil((cell * cell) / 3);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let n = 0;
    for (let y = j * cell; y < (j + 1) * cell; y++) for (let x = i * cell; x < (i + 1) * cell; x++) {
      const p = (y * width + x) * 4;
      if (rgba[p + 3] > 200 && isWater(rgba[p], rgba[p + 1], rgba[p + 2])) n++;
    }
    grid[j * cols + i] = n >= need ? 1 : 0;
  }
  return { grid, cols, rows };
}

// Outline of one patch of cells: walk its outside edges (interior on the right,
// y pointing down) into loops and keep the longest. Holes are left out on
// purpose, as in geo.js: an island in a pond still counts as water.
function outline(cells, has) {
  const next = new Map(), add = (a, b) => (next.get(a) || next.set(a, []).get(a)).push(b);
  const k = (x, y) => `${x},${y}`;
  for (const [i, j] of cells) {
    if (!has(i, j - 1)) add(k(i, j), k(i + 1, j));
    if (!has(i + 1, j)) add(k(i + 1, j), k(i + 1, j + 1));
    if (!has(i, j + 1)) add(k(i + 1, j + 1), k(i, j + 1));
    if (!has(i - 1, j)) add(k(i, j + 1), k(i, j));
  }
  let best = [];
  while (next.size) {
    const start = next.keys().next().value, loop = [];
    for (let at = start; ;) {
      const outs = next.get(at); if (!outs) break;
      const to = outs.pop(); if (!outs.length) next.delete(at);
      loop.push(at.split(",").map(Number)); at = to;
      if (at === start) break;
    }
    if (loop.length > best.length) best = loop;
  }
  return best;
}

// Water cells -> shapes. corner(x, y) turns a cell corner into [lat, lng].
// Each patch becomes one "poly" feature; patches are sorted closest first.
export function patches({ grid, cols, rows }, corner, { simplify, tol = 1, centre = null } = {}) {
  const seen = new Uint8Array(grid.length), out = [];
  const has = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && grid[j * cols + i] === 1;
  for (let s = 0; s < grid.length; s++) {
    if (!grid[s] || seen[s]) continue;
    const cells = [], stack = [s]; seen[s] = 1;
    while (stack.length) {
      const c = stack.pop(), i = c % cols, j = (c - i) / cols; cells.push([i, j]);
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        const q = b * cols + a;
        if (has(a, b) && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    let ring = outline(cells, has); // a water neighbour is always in the same patch
    if (simplify && ring.length > 4) ring = simplify(ring.map(([x, y]) => ({ x, y })), tol, true).map((p) => [p.x, p.y]);
    const [ci, cj] = cells[0];
    out.push({ cells: cells.length, key: `${ci}_${cj}`, ring: ring.map(([x, y]) => corner(x, y)) });
  }
  if (centre) {
    const d = (p) => Math.min(...p.ring.map(([la, ln]) => Math.hypot(la - centre.lat, ln - centre.lng)));
    out.sort((a, b) => d(a) - d(b));
  }
  return out;
}
export function nameFor(cells, cellM) {
  const m2 = cells * cellM * cellM;
  return m2 < 400 ? "Pool or small water" : m2 < 20000 ? "Pond or stream" : "Lake, river or sea";
}

// Browser only: fetch the tiles, paint them on one canvas, read the blue.
export async function scanWaterTiles(centers, radius, { simplify, fetchImpl = fetch, tileUrl = TILE_URL, timeoutMs = 15000 } = {}) {
  if (!centers.length) throw new Error("Add a safe zone or use your location first.");
  const out = [], ids = new Set();
  for (const c of centers.slice(0, 4)) {
    const p = tilePlan(c, radius), cell = 3;
    const w = (p.x1 - p.x0 + 1) * 256, h = (p.y1 - p.y0 + 1) * 256;
    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const g = canvas.getContext("2d", { willReadFrequently: true });
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
    const jobs = [];
    for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) {
      const url = tileUrl.replace("{z}", p.z).replace("{x}", x).replace("{y}", y);
      jobs.push(fetchImpl(url, { signal: ctl.signal }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then(createImageBitmap).then((bmp) => g.drawImage(bmp, (x - p.x0) * 256, (y - p.y0) * 256)));
    }
    const done = await Promise.allSettled(jobs); clearTimeout(timer);
    if (!done.some((d) => d.status === "fulfilled")) throw new Error("Can't load the map pictures (offline?). Saved water still works.");
    // Only read inside the search box, so the edges of the outer tiles don't count.
    const ox = Math.max(0, Math.floor(p.px.x0 - p.x0 * 256)), oy = Math.max(0, Math.floor(p.px.y0 - p.y0 * 256));
    const bw = Math.min(w - ox, Math.ceil(p.px.x1 - p.px.x0)), bh = Math.min(h - oy, Math.ceil(p.px.y1 - p.px.y0));
    const grid = cellGrid(g.getImageData(ox, oy, bw, bh).data, bw, bh, cell);
    const gx = p.x0 * 256 + ox, gy = p.y0 * 256 + oy;
    const corner = (i, j) => toLatLng(gx + i * cell, gy + j * cell, p.z).map((v) => Math.round(v * 1e5) / 1e5);
    const cellM = (cell * 40075016.686 * Math.cos((c.lat * Math.PI) / 180)) / (256 * 2 ** p.z);
    for (const q of patches(grid, corner, { simplify, tol: 1, centre: c })) {
      const id = `m${p.z}_${q.ring[0].join("_")}`;
      if (q.ring.length < 3 || ids.has(id)) continue;
      ids.add(id); out.push({ id, name: nameFor(q.cells, cellM), kind: "poly", rings: [q.ring], src: "map" });
    }
  }
  return out.slice(0, MAX_SHAPES);
}
