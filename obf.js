// Open Board Format (.obf) and Open Board Zip (.obz) import / export.
// Spec: https://www.openboardformat.org  (format "open-board-0.1").
// Pure ES module: no DOM, no network, no dependencies.

export const OBF_FORMAT = "open-board-0.1";

// Modified Fitzgerald Key colours (light theme values from tokens.css).
export const FITZ = {
  people: { bg: "#fbf1cc", border: "#8c6500" },
  action: { bg: "#dcefe1", border: "#2f8a4c" },
  describe: { bg: "#dbe7f5", border: "#2f6fb3" },
  thing: { bg: "#fae3cf", border: "#c7651c" },
  social: { bg: "#f5dbe8", border: "#b84a80" },
  question: { bg: "#e6ddf3", border: "#6e4fae" },
  negate: { bg: "#f6d9d6", border: "#b8372f" },
  little: { bg: "#eceff0", border: "#7a858d" },
};

export const SAFE_ACTIONS = new Set([":speak", ":home", ":back", ":backspace", ":clear", ":space"]);

export const LIMITS = {
  buttons: 500,
  boards: 200,
  label: 80,
  vocalization: 200,
  name: 80,
  archiveBytes: 8 * 1024 * 1024,
  entryBytes: 4 * 1024 * 1024,
};

export function cleanText(v, max) {
  return String(v ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
const safeId = (v, fallback) => cleanText(v, 60).replace(/[^\w.-]/g, "_").replace(/^\.+/, "_") || fallback;

function isUnsafePath(p) {
  const s = String(p || "").replace(/\\/g, "/");
  return s.startsWith("/") || s.split("/").some((seg) => seg === "..");
}

function parseColor(s) {
  const m = /^\s*#?([0-9a-f]{3}|[0-9a-f]{6})\s*$/i.exec(String(s || ""));
  if (m) {
    let h = m[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const r = /^\s*rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(String(s || ""));
  return r ? [r[1], r[2], r[3]].map((x) => Math.min(255, Number(x))) : null;
}

export function classFromColor(bg, border) {
  const useBorder = !!parseColor(border);
  const rgb = useBorder ? parseColor(border) : parseColor(bg);
  if (!rgb) return "thing";
  let best = "thing", bd = Infinity;
  for (const [c, v] of Object.entries(FITZ)) {
    const t = parseColor(useBorder ? v.border : v.bg);
    const d = (t[0] - rgb[0]) ** 2 + (t[1] - rgb[1]) ** 2 + (t[2] - rgb[2]) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// ---------- OBF export ----------
// Accepts either { id, name, words: [{w, c, e, say?, loadBoard?, action?}], cols? }
// or an OBF-like { id, name, buttons: [...], grid: {...} }.
export function boardToObf(board, { locale = "en" } = {}) {
  if (!board || typeof board !== "object") throw new Error("Invalid board");
  const rawItems = Array.isArray(board.words)
    ? board.words
    : Array.isArray(board.buttons)
      ? board.buttons.map((b) => ({
          id: b.id,
          w: b.label ?? b.w,
          say: b.vocalization ?? b.say,
          c: b.ext_luminaac_pos ?? b.pos ?? b.c ?? classFromColor(b.background_color, b.border_color),
          e: b.ext_luminaac_emoji ?? b.e,
          loadBoard: b.load_board?.id || b.loadBoard,
          loadBoardPath: b.load_board?.path,
          action: b.action,
        }))
      : [];
  const words = rawItems.slice(0, LIMITS.buttons);
  const cols = Math.max(1, Math.min(12, Number(board.cols || board.grid?.columns) || 6));
  const rows = Math.max(1, Math.ceil(words.length / cols));
  const buttons = [];
  const order = [];
  for (let r = 0; r < rows; r++) order.push(new Array(cols).fill(null));
  words.forEach((w, i) => {
    const label = cleanText(w.w ?? w.label, LIMITS.label);
    if (!label) return;
    const id = w.id ? safeId(w.id, "b" + (i + 1)) : "b" + (i + 1);
    const pos = FITZ[w.c] ? w.c : "thing";
    const fz = FITZ[pos];
    const b = { id, label, background_color: fz.bg, border_color: fz.border };
    const say = cleanText(w.say ?? w.vocalization, LIMITS.vocalization);
    if (say && say !== label) b.vocalization = say;
    if (w.c) b.ext_luminaac_pos = pos;
    if (w.e) b.ext_luminaac_emoji = String(w.e).slice(0, 32);
    if (w.loadBoard) {
      const targetId = safeId(w.loadBoard, "board");
      b.load_board = { id: targetId, path: w.loadBoardPath || `boards/${targetId}.obf` };
    }
    if (w.action && SAFE_ACTIONS.has(w.action)) b.action = w.action;
    buttons.push(b);
    order[Math.floor(i / cols)][i % cols] = id;
  });
  return {
    format: OBF_FORMAT,
    id: safeId(board.id, "board"),
    locale,
    name: cleanText(board.name, LIMITS.name) || "Board",
    grid: board.grid && Array.isArray(board.grid.order)
      ? { rows: board.grid.rows || rows, columns: board.grid.columns || cols, order: board.grid.order }
      : { rows, columns: cols, order },
    buttons,
    images: [],
    sounds: [],
  };
}

// ---------- OBF import ----------
export function obfToBoard(input) {
  let obf = input;
  if (typeof input === "string") {
    try { obf = JSON.parse(input); } catch { throw new Error("Not a valid .obf file (JSON could not be read)"); }
  }
  if (!obf || typeof obf !== "object" || Array.isArray(obf)) throw new Error("Not a valid .obf file");
  if (String(obf.format || "") !== OBF_FORMAT) throw new Error("Not an Open Board Format (open-board-0.1) file");
  if (!Array.isArray(obf.buttons)) throw new Error(".obf file has no buttons");

  const warnings = [];
  if (obf.buttons.length > LIMITS.buttons) warnings.push(`Only the first ${LIMITS.buttons} buttons were read`);
  const byId = new Map();
  const buttons = [];
  for (const b of obf.buttons.slice(0, LIMITS.buttons)) {
    if (!b || typeof b !== "object") continue;
    const label = cleanText(b.label ?? b.vocalization, LIMITS.label);
    if (!label) continue;
    const say = cleanText(b.vocalization, LIMITS.vocalization);
    const pos = FITZ[b.ext_luminaac_pos] ? b.ext_luminaac_pos : classFromColor(b.background_color, b.border_color);
    const word = {
      w: label,
      say: say && say !== label ? say : "",
      c: pos,
      e: cleanText(b.ext_luminaac_emoji, 32),
    };
    const lb = b.load_board;
    if (lb && typeof lb === "object" && (lb.id || lb.path)) {
      word.loadBoard = safeId(lb.id || String(lb.path).replace(/^.*\//, "").replace(/\.obf$/i, ""), "board");
    }
    if (typeof b.action === "string" && SAFE_ACTIONS.has(b.action)) word.action = b.action;
    else if (b.action) warnings.push(`Skipped unsupported action on "${label}"`);
    if (b.image_id || b.sound_id) word.mediaSkipped = true;
    byId.set(String(b.id), word);

    buttons.push({
      id: String(b.id || `b${buttons.length + 1}`),
      label,
      vocalization: say || label,
      pos,
      ext_luminaac_pos: pos,
      c: pos,
      e: word.e || "💬",
      background_color: b.background_color || FITZ[pos].bg,
      border_color: b.border_color || FITZ[pos].border,
      ...(word.action ? { action: word.action } : {}),
      ...(word.loadBoard ? { load_board: { id: word.loadBoard, path: lb?.path || `boards/${word.loadBoard}.obf` }, loadBoard: word.loadBoard } : {}),
      brokenError: false,
    });
  }
  if (obf.images?.some?.((im) => im?.url)) warnings.push("Remote pictures were not downloaded; local symbols are used instead");

  const words = [];
  const used = new Set();
  const order = obf.grid?.order;
  if (Array.isArray(order)) {
    for (const row of order) {
      if (!Array.isArray(row)) continue;
      for (const id of row) {
        if (id == null) continue;
        const w = byId.get(String(id));
        if (w && !used.has(String(id))) { used.add(String(id)); words.push(w); }
      }
    }
  }
  for (const [id, w] of byId) if (!used.has(id)) words.push(w);

  const cols = Math.max(1, Math.min(12, Number(obf.grid?.columns) || 6));
  const id = safeId(obf.id, "board");
  const name = cleanText(obf.name, LIMITS.name) || "Imported board";
  return {
    format: OBF_FORMAT,
    id,
    name,
    cols,
    grid: obf.grid || { rows: Math.max(1, Math.ceil(words.length / cols)), columns: cols, order: [] },
    buttons,
    words,
    warnings,
  };
}

// ---------- ZIP (stored) writer / reader ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");

export function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => [n & 255, (n >>> 8) & 255];
  const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new Uint8Array([
      0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
    ]);
    parts.push(local, name, data);
    central.push({ name, crc, size: data.length, offset });
    offset += local.length + name.length + data.length;
  }
  const cdStart = offset;
  for (const c of central) {
    const h = new Uint8Array([
      0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset),
    ]);
    parts.push(h, c.name);
    offset += h.length + c.name.length;
  }
  const end = new Uint8Array([
    0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
    ...u32(offset - cdStart), ...u32(cdStart), ...u16(0),
  ]);
  parts.push(end);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") throw new Error("This browser cannot open compressed .obz files");
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > LIMITS.entryBytes) { try { await reader.cancel(); } catch {} throw new Error("A file inside the .obz is too large"); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export async function zipRead(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length > LIMITS.archiveBytes) throw new Error("This .obz file is too large");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid .obz (zip) file");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count > LIMITS.boards + 10) throw new Error("This .obz has too many files");
  const entries = new Map();
  let declared = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error("Damaged .obz file");
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    if (isUnsafePath(name)) throw new Error("Unsafe path traversal inside .obz archive");
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    declared += usize;
    if (usize > LIMITS.entryBytes || declared > LIMITS.archiveBytes) throw new Error("This .obz expands to too much data");
    if (lho + 30 > bytes.length || dv.getUint32(lho, true) !== 0x04034b50) throw new Error("Damaged .obz file");
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    if (start + csize > bytes.length) throw new Error("Damaged .obz file");
    entries.set(name, { method, crc, csize, usize, start });
  }
  async function read(name) {
    if (isUnsafePath(name)) throw new Error("Unsafe path traversal in .obz lookup");
    const e = entries.get(name);
    if (!e) return null;
    const raw = bytes.subarray(e.start, e.start + e.csize);
    let data;
    if (e.method === 0) data = raw;
    else if (e.method === 8) data = await inflateRaw(raw);
    else throw new Error("Unsupported compression inside .obz");
    if (data.length !== e.usize || crc32(data) !== e.crc) throw new Error("A file inside the .obz is damaged");
    return data;
  }
  return { names: [...entries.keys()], read };
}

// ---------- OBZ ----------
export function buildObz(boards, opts = {}) {
  const inputList = Array.isArray(boards) ? boards : Object.values(boards || {});
  const list = inputList.slice(0, LIMITS.boards);
  if (!list.length) throw new Error("Nothing to export");
  const files = [];
  const paths = {};
  for (const b of list) {
    const obf = boardToObf(b);
    const path = `boards/${obf.id}.obf`;
    paths[obf.id] = path;
    files.push({ name: path, data: JSON.stringify(obf, null, 2) });
  }
  const preferredRoot = opts?.rootId ? safeId(opts.rootId, "") : "";
  const rootId = preferredRoot && paths[preferredRoot] ? preferredRoot : safeId(list[0].id, "board");
  const manifest = { format: OBF_FORMAT, root: paths[rootId], paths: { boards: paths, images: {}, sounds: {} } };
  return zipStore([{ name: "manifest.json", data: JSON.stringify(manifest, null, 2) }, ...files]);
}

export async function parseObz(bytes) {
  const zip = await zipRead(bytes);
  const mbytes = await zip.read("manifest.json");
  if (!mbytes) throw new Error("Missing manifest.json in .obz archive");
  let manifest = null;
  try { manifest = JSON.parse(dec.decode(mbytes)); } catch { throw new Error("The .obz manifest could not be read"); }
  if (manifest?.root && isUnsafePath(manifest.root)) throw new Error("Unsafe root path in .obz manifest");
  const manifestBoardPaths = manifest?.paths?.boards ? Object.values(manifest.paths.boards).map(String) : [];
  for (const mp of manifestBoardPaths) {
    if (isUnsafePath(mp)) throw new Error("Unsafe board path in .obz manifest");
  }
  const names = manifestBoardPaths.length ? manifestBoardPaths : zip.names.filter((n) => /\.obf$/i.test(n));
  const boards = [];
  const byId = {};
  const warnings = [];
  for (const n of names.slice(0, LIMITS.boards)) {
    const data = await zip.read(n);
    if (!data) { warnings.push(`Missing board file ${cleanText(n, 60)}`); continue; }
    try {
      const b = obfToBoard(dec.decode(data));
      warnings.push(...b.warnings);
      boards.push(b);
      byId[b.id] = b;
    } catch (err) { warnings.push(`Skipped ${cleanText(n, 60)}: ${err.message}`); }
  }
  if (!boards.length) throw new Error("No readable boards were found in this .obz");
  let rootBoard = boards[0];
  if (manifest?.root) {
    const root = String(manifest.root);
    const rootEntry = Object.entries(manifest?.paths?.boards || {}).find(([, p]) => p === root);
    const hit = (rootEntry && byId[rootEntry[0]]) || boards.find((b) => root.endsWith(`/${b.id}.obf`) || root === `${b.id}.obf`);
    if (hit) rootBoard = hit;
  }
  return {
    boards,
    byId,
    rootId: rootBoard.id,
    root: rootBoard.id,
    rootBoard,
    warnings: [...new Set(warnings)],
  };
}

export async function parseBoardFile(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u.length > LIMITS.archiveBytes) throw new Error("This file is too large");
  if (u[0] === 0x50 && u[1] === 0x4b) return parseObz(u);
  const b = obfToBoard(dec.decode(u));
  return { boards: [b], byId: { [b.id]: b }, rootId: b.id, root: b.id, rootBoard: b, warnings: b.warnings };
}

// Standard aliases used across importers/tests
export const parseOBF = obfToBoard;
export const importOBF = obfToBoard;
export const parseBoard = obfToBoard;
export const exportOBF = boardToObf;
export const toOBF = boardToObf;
export const parseOBZ = parseObz;
export const importOBZ = parseObz;
export const exportOBZ = buildObz;
export const toOBZ = buildObz;
