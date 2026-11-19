// K-Dense Clinical Traceability, Communication Matrix Analytics, append-only
// `supersedes` revision history, and RFC 4180 CSV / JSON exports for LuminAAC (Feature 17).
// Pure ES module: no DOM, no network.

import { CORE } from "./vocab.js";

export const CLINICAL_BANNER = "Draft / Estimate — Caregiver or SLP review required";

const CORE_SET = new Set(CORE.map((c) => String(c.w).toLowerCase()));

export const MATRIX_FUNCTIONS = ["Requesting", "Protesting", "Commenting", "Social", "Asking"];

export function classifyMatrixFunction(entry = {}) {
  const rawFn = String(entry.fn || "").trim().toLowerCase();
  if (rawFn === "requesting" || rawFn === "request" || rawFn === "need" || rawFn === "help") return "Requesting";
  if (rawFn === "protesting" || rawFn === "protest" || rawFn === "negate") return "Protesting";
  if (rawFn === "commenting" || rawFn === "comment" || rawFn === "describe" || rawFn === "emotion") return "Commenting";
  if (rawFn === "social") return "Social";
  if (rawFn === "asking" || rawFn === "question") return "Asking";

  const text = String(entry.text || "").trim().toLowerCase();
  if (/^(no|stop|not|don't|dont)\b/.test(text)) return "Protesting";
  if (/^(what|where|who|when|why|how)\b|\?$/.test(text)) return "Asking";
  if (/^(hi|hello|bye|yes|please|thank you|my turn|your turn)\b/.test(text)) return "Social";
  if (/^(want|need|help|more|eat|drink|go|open)\b|\b(want|need|help|please)\b/.test(text)) return "Requesting";
  return "Commenting";
}

function tokenizeEntry(entry = {}) {
  if (Array.isArray(entry.words) && entry.words.length) {
    return entry.words.map((w) => String(w).trim()).filter(Boolean);
  }
  const t = String(entry.text || "").trim();
  return t ? t.split(/\s+/).filter(Boolean) : [];
}

export function summarizeClinical({ log = [], moments = [], signals = [] } = {}) {
  const safeLog = Array.isArray(log) ? log : [];
  const safeMoments = Array.isArray(moments) ? moments : [];
  const safeSignals = Array.isArray(signals) ? signals : [];

  const functions = {
    Requesting: 0,
    Protesting: 0,
    Commenting: 0,
    Social: 0,
    Asking: 0,
  };

  let childCount = 0;
  let modeledCount = 0;
  let totalChildWords = 0;
  let coreWordHits = 0;
  const uniqueSet = new Set();
  const facts = [];

  safeLog.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") return;
    const isModeled = entry.mode === "modeling" || entry.actor === "partner";
    const ts = Number(entry.ts ?? entry.t) || 0;
    const id = String(entry.id || `log_${idx + 1}`);
    const words = tokenizeEntry(entry);

    if (isModeled) {
      modeledCount += 1;
      facts.push({
        id,
        source: "luminaac:log (modeling)",
        ts,
        detail: `Partner modeled "${entry.text || words.join(" ")}" (${words.length} words; excluded from child MLU).`,
      });
      return;
    }

    childCount += 1;
    const fnCat = classifyMatrixFunction(entry);
    functions[fnCat] = (functions[fnCat] || 0) + 1;

    totalChildWords += words.length;
    for (const w of words) {
      const low = w.toLowerCase();
      uniqueSet.add(low);
      if (CORE_SET.has(low)) coreWordHits += 1;
    }

    facts.push({
      id,
      source: "luminaac:log (child)",
      ts,
      detail: `Child utterance "${entry.text || words.join(" ")}" (${words.length} words, function: ${fnCat}).`,
    });
  });

  safeMoments.forEach((m, idx) => {
    if (!m || typeof m !== "object") return;
    facts.push({
      id: String(m.id || `moment_${idx + 1}`),
      source: "luminaac:bridge (moments)",
      ts: Number(m.t ?? m.ts) || 0,
      detail: `Observed moment (${m.context || "unspecified context"}): ${m.meaning || "unexplained"}.`,
    });
  });

  safeSignals.forEach((s, idx) => {
    if (!s || typeof s !== "object") return;
    facts.push({
      id: String(s.id || `signal_${idx + 1}`),
      source: "luminaac:bridge (signals)",
      ts: Number(s.created ?? s.ts) || 0,
      detail: `Signal "${s.name || s.id}" -> "${s.phrase || ""}" (${s.confirmations || 0} confirmations).`,
    });
  });

  const mlu = childCount > 0 ? +(totalChildWords / childCount).toFixed(2) : 0;
  const uniqueWords = uniqueSet.size;
  const coreRatio = totalChildWords > 0 ? +(coreWordHits / totalChildWords).toFixed(4) : 0;
  const totalTurns = childCount + modeledCount;
  const independentRatio = totalTurns > 0 ? +(childCount / totalTurns).toFixed(4) : 0;

  return {
    banner: CLINICAL_BANNER,
    facts,
    metrics: {
      functions,
      coreRatio,
      fringeRatio: totalChildWords > 0 ? +(1 - coreRatio).toFixed(4) : 0,
      modeledCount,
      childCount,
      independentRatio,
      mlu,
      uniqueWords,
      totalChildWords,
    },
  };
}
export const generateInsights = summarizeClinical;
export const buildClinicalSummary = summarizeClinical;

// ---------- Append-only `supersedes` revision history ----------
export function appendRevision(store = [], rev = {}) {
  const list = Array.isArray(store) ? store.slice() : [];
  if (!rev || typeof rev !== "object") return list;
  const entry = {
    ...rev,
    id: String(rev.id || `rev_${list.length + 1}`),
    ts: Number(rev.ts ?? rev.t) || Date.now(),
  };
  list.push(entry);
  return list;
}
export const addRevision = appendRevision;

export function getRevisionLineage(store = [], targetId) {
  if (!Array.isArray(store) || !targetId) return [];
  const tId = String(targetId);
  const direct = store.filter((r) => r && (r.targetId === tId || r.id === tId));
  if (!direct.length) return [];

  const inLineageIds = new Set(direct.map((r) => r.id));
  let added = true;
  while (added) {
    added = false;
    for (const r of store) {
      if (r && r.supersedes && inLineageIds.has(r.supersedes) && !inLineageIds.has(r.id)) {
        inLineageIds.add(r.id);
        direct.push(r);
        added = true;
      }
    }
  }

  // Topological / chronological sort along `supersedes` links
  const bySupersedes = new Map();
  const allIds = new Set(direct.map((r) => r.id));
  let roots = [];
  for (const r of direct) {
    if (!r.supersedes || !allIds.has(r.supersedes)) roots.push(r);
    else bySupersedes.set(r.supersedes, r);
  }
  roots.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const ordered = [];
  const visited = new Set();
  for (const root of roots) {
    let cur = root;
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      ordered.push(cur);
      cur = bySupersedes.get(cur.id);
    }
  }
  for (const r of direct) {
    if (!visited.has(r.id)) ordered.push(r);
  }
  return ordered;
}
export const resolveHistory = getRevisionLineage;

// ---------- RFC 4180 CSV & JSON Exports (with formula-injection neutralization) ----------
export function escapeCsvCell(val) {
  let s = String(val ?? "");
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportClinicalCSV(input = {}) {
  const summary = summarizeClinical(input);
  const rows = [
    ["section", "key", "value", "actor", "mode", "function", "text"],
    ["meta", "banner", summary.banner, "", "", "", ""],
    ["metric", "childCount", summary.metrics.childCount, "", "", "", ""],
    ["metric", "modeledCount", summary.metrics.modeledCount, "", "", "", ""],
    ["metric", "mlu", summary.metrics.mlu, "", "", "", ""],
    ["metric", "uniqueWords", summary.metrics.uniqueWords, "", "", "", ""],
    ["metric", "coreRatio", summary.metrics.coreRatio, "", "", "", ""],
  ];

  for (const fn of MATRIX_FUNCTIONS) {
    rows.push(["function", fn, summary.metrics.functions[fn] || 0, "", "", fn, ""]);
  }

  for (const entry of Array.isArray(input.log) ? input.log : []) {
    if (!entry || typeof entry !== "object") continue;
    const isMod = entry.mode === "modeling" || entry.actor === "partner";
    const fn = isMod ? "Modeling" : classifyMatrixFunction(entry);
    rows.push([
      "utterance",
      String(entry.id || entry.ts || entry.t || ""),
      String(tokenizeEntry(entry).length),
      isMod ? "partner" : "child",
      isMod ? "modeling" : "child",
      fn,
      String(entry.text || ""),
    ]);
  }

  return rows.map((r) => r.map(escapeCsvCell).join(",")).join("\n");
}
export const toCSV = exportClinicalCSV;

export function exportClinicalJSON(input = {}) {
  return JSON.stringify(summarizeClinical(input), null, 2);
}
export const toJSON = exportClinicalJSON;
