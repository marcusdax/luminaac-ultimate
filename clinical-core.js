// Communication report for caregivers and SLPs (milestone M3). Pure functions.
//
// Every number says where it came from: which messages, which dates and which rule.
// The report is a draft. The rules guess what each message was for; a caregiver or
// SLP corrects them, and each correction is added to a history that is never
// rewritten (each entry names the entry it supersedes).

// Communicative functions, in the order the rules are tried.
export const FUNCTIONS = {
  asking: "Asking",
  protesting: "Protesting",
  social: "Social",
  requesting: "Requesting",
  commenting: "Commenting",
};
const RULES = [
  ["asking", /\?\s*$|^(what|where|who|when|why|how|which|is|are|can you|do you|does)\b/i, "a question word or a question mark"],
  ["protesting", /\b(no|not|don't|stop|all done|go away|leave me|i don't like|too loud|finished)\b/i, "a no, stop or all done word"],
  ["social", /^(hi|hello|hey|bye|goodbye|good morning|goodnight|good night|thank you|thanks|sorry|love you|i love you|my name|nice to|see you|wait, i'm still talking)\b/i, "a greeting, thanks or social phrase"],
  ["requesting", /\b(want|need|more|help|give|can i|may i|i would like|let's|please|again|turn|go to|open)\b/i, "a want, need, more, help or please word"],
];
export function classify(text) {
  const t = String(text || "").trim();
  for (const [fn, re, why] of RULES) if (re.test(t)) return { fn, why };
  return { fn: "commenting", why: "no request, question, protest or social words, so read as a comment" };
}

// Which log entries are the child's own communication. Modeling lives in its own log
// (luminaac:modeling), so it can never be counted here.
export const CHILD_KINDS = new Set(["message", "quick", "plan", "gestalt", "choice", "body", "suggestion", "sos", "mything"]);
export const msgKey = (m) => `${m.t}:${String(m.text).slice(0, 40)}`;

// Append-only corrections. Returns a NEW array; old entries are never changed.
export function revise(revisions, { key, fn, by = "caregiver", note = "", t = Date.now() }) {
  if (!FUNCTIONS[fn]) throw new Error("Unknown function: " + fn);
  const prev = [...revisions].reverse().find((r) => r.key === key) || null;
  return [...revisions, { id: `rv${t.toString(36)}${revisions.length}`, t, key, fn, by, note: String(note).slice(0, 200), supersedes: prev?.id || null }];
}
export function latest(revisions) {
  const m = new Map();
  for (const r of revisions) m.set(r.key, r);
  return m;
}

const tokens = (t) => String(t || "").toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);

// The report. log: luminaac:log entries; modeling: luminaac:modeling entries;
// core: Set of core vocabulary words (lowercase).
export function report({ log = [], modeling = [], revisions = [], core = new Set(), from = 0, to = Infinity }) {
  const inRange = (x) => x.t >= from && x.t <= to;
  const acts = log.filter((x) => inRange(x) && CHILD_KINDS.has(x.kind));
  const modeled = modeling.filter(inRange);
  const fixes = latest(revisions);
  const rows = acts.map((m) => {
    const auto = classify(m.text), fix = fixes.get(msgKey(m));
    return { t: m.t, text: m.text, kind: m.kind, helped: !!m.helped, key: msgKey(m), fn: fix ? fix.fn : auto.fn, by: fix ? `${fix.by} (corrected)` : "rule", why: fix ? `corrected by ${fix.by}${fix.note ? `: ${fix.note}` : ""}` : `rule: ${auto.why}` };
  });
  const span = (xs) => (xs.length ? { first: Math.min(...xs.map((x) => x.t)), last: Math.max(...xs.map((x) => x.t)) } : null);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

  const functions = Object.fromEntries(Object.keys(FUNCTIONS).map((fn) => {
    const r = rows.filter((x) => x.fn === fn);
    return [fn, { label: FUNCTIONS[fn], n: r.length, pct: pct(r.length, rows.length), corrected: r.filter((x) => x.by !== "rule").length, examples: r.slice(-3).map((x) => x.text) }];
  }));
  // Sentence length counts only messages the child put together. Sentences the helper
  // filled out (helped: true) are the child's choice, but not the child's grammar.
  const built = acts.filter((x) => x.kind === "message" && !x.helped);
  const toks = built.flatMap((m) => tokens(m.text));
  const coreN = toks.filter((w) => core.has(w)).length;
  return {
    draft: true,
    rows,
    sources: { acts: acts.length, modeled: modeled.length, built: built.length, ...span(acts) },
    functions,
    core: { n: coreN, fringe: toks.length - coreN, pct: pct(coreN, toks.length), source: `${toks.length} words in ${built.length} messages the child built on the board` },
    mlu: { value: built.length ? Math.round((toks.length / built.length) * 100) / 100 : null, source: `${toks.length} words ÷ ${built.length} built messages (words, not morphemes)` },
    independence: { child: acts.length, modeled: modeled.length, pct: pct(acts.length, acts.length + modeled.length), source: `${acts.length} of the child's own messages and ${modeled.length} an adult modeled` },
  };
}

// CSV with a header row. Cells are quoted, and cells that start with = + - @ get a
// leading apostrophe so a spreadsheet never runs them as a formula.
export function toCSV(rows, cols) {
  const cell = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  return [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}
