// Switch scanning logic with no DOM, so it can be unit tested.
// Methods: "linear" (one item at a time) and "rowcol" (highlight a row, select it,
// then items in that row). Switches: 1 = automatic stepping, the switch selects;
// 2 = switch 2 moves the highlight, switch 1 selects (step scanning, no timer).

export const DEFAULTS = { method: "rowcol", switches: 1, scanMs: 1500, firstHold: 500, loops: 3, auditory: false, debounce: 250 };

export function settings(a = {}) {
  const s = { ...DEFAULTS, ...(a.scanCfg || {}) };
  s.scanMs = Math.min(6000, Math.max(600, +a.scanMs || +s.scanMs || 1500));
  s.firstHold = Math.min(3000, Math.max(0, +s.firstHold || 0));
  s.loops = Math.min(10, Math.max(1, +s.loops || 3));
  s.debounce = Math.min(2000, Math.max(0, +s.debounce || 0));
  s.method = s.method === "linear" ? "linear" : "rowcol";
  s.switches = +s.switches === 2 ? 2 : 1;
  s.auditory = !!s.auditory;
  return s;
}

// Group items into visual rows: rects are {top, left}; tolerance in px.
export function rowsOf(rects, tol = 12) {
  const order = rects.map((r, i) => ({ ...r, i })).sort((a, b) => a.top - b.top || a.left - b.left);
  const rows = [];
  for (const r of order) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.top - r.top) <= tol) last.items.push(r);
    else rows.push({ top: r.top, items: [r] });
  }
  return rows.map((row) => row.items.sort((a, b) => a.left - b.left).map((r) => r.i));
}

export class Scanner {
  constructor(rows, s = DEFAULTS) {
    this.s = s; this.rows = rows.filter((r) => r.length);
    this.flat = this.rows.flat();
    this.level = s.method === "rowcol" ? "row" : "item";
    this.row = -1; this.pos = -1; this.laps = 0; this.paused = false;
  }
  // The items currently highlighted (a whole row, or one item).
  current() {
    if (this.paused || (this.pos < 0 && this.row < 0)) return [];
    if (this.level === "row") return this.rows[this.row] || [];
    const list = this.s.method === "rowcol" ? this.rows[this.row] : this.flat;
    return list?.[this.pos] === undefined ? [] : [list[this.pos]];
  }
  next() {
    if (this.paused || !this.flat.length) return this.current();
    if (this.level === "row") {
      this.row++;
      if (this.row >= this.rows.length) { this.row = 0; this.laps++; }
    } else {
      const list = this.s.method === "rowcol" ? this.rows[this.row] : this.flat;
      this.pos++;
      if (this.pos >= list.length) {
        this.pos = 0; this.laps++;
        // In a row, one empty lap goes back to row scanning so a missed row is not a trap.
        if (this.s.method === "rowcol") { this.level = "row"; this.pos = -1; this.laps = 0; return this.current(); }
      }
    }
    if (this.laps >= this.s.loops) { this.paused = true; return []; }
    return this.current();
  }
  // Switch 1. Returns {type:"row"} when a row opened, {type:"activate", index}, or {type:"resume"}.
  select() {
    if (this.paused) { this.reset(); return { type: "resume" }; }
    if (this.level === "row" && this.row >= 0) {
      if (this.rows[this.row].length === 1) { const index = this.rows[this.row][0]; this.reset(); return { type: "activate", index }; }
      this.level = "item"; this.pos = -1; this.laps = 0; return { type: "row" };
    }
    const [index] = this.current();
    if (index === undefined) return { type: "none" };
    this.reset();
    return { type: "activate", index };
  }
  reset() { this.level = this.s.method === "rowcol" ? "row" : "item"; this.row = -1; this.pos = -1; this.laps = 0; this.paused = false; }
}
