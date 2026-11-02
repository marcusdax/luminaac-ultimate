// Open Board Format (OBF 0.1, https://www.openboardformat.org) import and export.
// Pure functions with no DOM, so they run in the browser and in node tests.
// Export: core words and every folder become boards in one .obz (a zip), with the
// emoji drawn as small SVG pictures so other AAC apps show a picture too.
// Import: .obf (one board, JSON) or .obz (zip of boards). Buttons become words.

export const FORMAT = "open-board-0.1";
const WC = { people: ["#fbf1cc", "#c99a00"], action: ["#dcefe1", "#2f8a4c"], describe: ["#dbe7f5", "#2f6fb3"], thing: ["#fae3cf", "#c7651c"],
  social: ["#f5dbe8", "#b84a80"], question: ["#e6ddf3", "#6e4fae"], negate: ["#f6d9d6", "#b8372f"], little: ["#eceff0", "#7a858d"], folder: ["#dfe5ea", "#22313d"] };
const KINDS = Object.keys(WC).filter((k) => k !== "folder");
const hex2rgb = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
const emojiSvg = (e) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="68" font-size="64" text-anchor="middle">${e.replace(/[<&>]/g, "")}</text></svg>`)}`;

// Lay buttons out in a grid with `cols` columns.
function grid(ids, cols) {
  const rows = Math.max(1, Math.ceil(ids.length / cols)), order = [];
  for (let r = 0; r < rows; r++) order.push(Array.from({ length: cols }, (_, c) => ids[r * cols + c] ?? null));
  return { rows, columns: cols, order };
}

// boards: [{ id, name, words: [{w, e, c}], cols? }]; the first is the home board.
// Returns { manifest, files: { "boards/<id>.obf": json, ... } }.
export function toOBF(boards, { locale = "en", author = "LuminAAC" } = {}) {
  const files = {}, home = boards[0];
  for (const b of boards) {
    const images = [], buttons = [];
    const add = (word, i, extra = {}) => {
      const id = `${b.id}-${i}`, [bg, border] = WC[word.c] || WC.thing;
      const btn = { id, label: word.w, background_color: hex2rgb(bg), border_color: hex2rgb(border), ...extra };
      if (word.e) { images.push({ id: `img-${id}`, data: emojiSvg(word.e), content_type: "image/svg+xml", width: 100, height: 100 }); btn.image_id = `img-${id}`; }
      if (word.c && KINDS.includes(word.c)) btn.ext_luminaac_kind = word.c;
      buttons.push(btn);
    };
    b.words.forEach((w, i) => add(w, i));
    if (b === home) boards.slice(1).forEach((f, i) => add({ w: f.name, e: f.e, c: "folder" }, `f${i}`, { load_board: { id: f.id, path: `boards/${f.id}.obf` } }));
    const cols = b.cols || 6;
    files[`boards/${b.id}.obf`] = { format: FORMAT, id: b.id, locale, name: b.name, ext_luminaac_author: author,
      buttons, images, sounds: [], grid: grid(buttons.map((x) => x.id), cols), license: { type: "private" } };
  }
  const manifest = { format: FORMAT, root: `boards/${home.id}.obf`, paths: { boards: Object.fromEntries(boards.map((b) => [b.id, `boards/${b.id}.obf`])), images: {}, sounds: {} } };
  return { manifest, files };
}

// One board (JSON object) to words. Folder links are skipped (their boards come in separately).
export function wordsFromBoard(board) {
  if (!board || !Array.isArray(board.buttons)) throw new Error("This file isn't an Open Board Format board.");
  const imgs = Object.fromEntries((board.images || []).map((im) => [im.id, im]));
  const out = [], seen = new Set();
  for (const b of board.buttons) {
    if (b.load_board || b.hidden) continue;
    const w = String(b.vocalization || b.label || "").trim().slice(0, 40);
    if (!w || seen.has(w.toLowerCase())) continue; seen.add(w.toLowerCase());
    const c = KINDS.includes(b.ext_luminaac_kind) ? b.ext_luminaac_kind : guessKind(b.background_color);
    out.push({ w, e: emojiOf(imgs[b.image_id]) || "", c });
  }
  return out;
}
// Our own SVG emoji pictures round-trip; other pictures fall back to no emoji.
function emojiOf(im) {
  if (!im?.data?.startsWith("data:image/svg+xml,")) return "";
  const m = decodeURIComponent(im.data.slice(19)).match(/<text[^>]*>([^<]{1,8})<\/text>/);
  return m ? m[1] : "";
}
// Map a Fitzgerald-style colour to the nearest kind of word.
export function guessKind(color) {
  const m = String(color || "").match(/(\d+)\D+(\d+)\D+(\d+)/); if (!m) return "thing";
  const [r, g, b] = m.slice(1, 4).map(Number); let best = "thing", d = Infinity;
  for (const k of KINDS) for (const h of WC[k]) {
    const x = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), dd = (x[0] - r) ** 2 + (x[1] - g) ** 2 + (x[2] - b) ** 2;
    if (dd < d) { d = dd; best = k; }
  }
  return best;
}

// ---------- Zip (stored entries out; stored or deflate entries in) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const enc = new TextEncoder(), dec = new TextDecoder();

// files: { name: object|string|Uint8Array } -> Uint8Array zip
export function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const [name, v] of Object.entries(files)) {
    const data = v instanceof Uint8Array ? v : enc.encode(typeof v === "string" ? v : JSON.stringify(v));
    const nm = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const csize = central.reduce((s, p) => s + p.length, 0), e = new DataView(new ArrayBuffer(22)), n = Object.keys(files).length;
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, n, true); e.setUint16(10, n, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// u8 zip -> { name: Uint8Array }. inflate(u8) -> Promise<Uint8Array> handles deflate entries.
export async function unzip(u8, inflate) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eo = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eo = i; break; }
  if (eo < 0) throw new Error("This isn't a zip file.");
  const n = v.getUint16(eo + 10, true); let p = v.getUint32(eo + 16, true); const out = {};
  if (n > 2000) throw new Error("Too many files in this board set.");
  for (let i = 0; i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("This zip file is damaged.");
    const method = v.getUint16(p + 10, true), csz = v.getUint32(p + 20, true), usz = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (usz > 20e6) throw new Error("A file in this board set is too big.");
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), raw = u8.subarray(start, start + csz);
    if (method === 0) out[name] = raw;
    else if (method === 8) { if (!inflate) throw new Error("Can't unpack this zip here."); out[name] = await inflate(raw); }
  }
  return out;
}

// Read an .obz: returns [{ id, name, words }] with the root board first.
export async function readOBZ(u8, inflate) {
  const files = await unzip(u8, inflate), json = (n) => JSON.parse(dec.decode(files[n]));
  const manifest = files["manifest.json"] ? json("manifest.json") : null;
  const names = Object.keys(files).filter((n) => n.endsWith(".obf"));
  if (!names.length) throw new Error("No boards found in this file.");
  const root = manifest?.root && files[manifest.root] ? manifest.root : names[0];
  return [root, ...names.filter((n) => n !== root)].map((n) => { const b = json(n); return { id: String(b.id || n), name: String(b.name || n.replace(/.*\//, "").replace(/\.obf$/, "")), words: wordsFromBoard(b) }; });
}
export const buildOBZ = (boards, opts) => { const { manifest, files } = toOBF(boards, opts); return zip({ "manifest.json": manifest, ...files }); };

// Merge imported words into custom words for a folder; skips words already there.
export function mergeWords(custom, existing, words, folder) {
  const have = new Set([...existing, ...custom.map((x) => x.w)].map((w) => w.toLowerCase())), add = [];
  for (const w of words) if (!have.has(w.w.toLowerCase())) { have.add(w.w.toLowerCase()); add.push({ w: w.w, e: w.e || "⭐", c: w.c, f: folder }); }
  return add;
}
