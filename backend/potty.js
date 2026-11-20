// Potty Path event relay. Devices post append-only toilet events; the server keeps
// them per family, deduplicates by event id (so retries and repeats are harmless),
// stamps each with a monotonic sequence number, and hands back everything after a
// cursor. Events may arrive end-to-end encrypted ({ id, dev, seq, c }); then the
// server can relay them but never read them. Toilet events are never part of the
// synced document, share links or the child view (only the plan is).
import { KINDS } from "../potty-core.js";

const MAX_EVENTS = 20000, MAX_BATCH = 500;
const str = (v, n) => typeof v === "string" && v.length > 0 && v.length <= n;

function clean(e, sealed) {
  if (!e || typeof e !== "object" || !str(e.id, 64) || !str(String(e.dev ?? ""), 64)) return null;
  if (sealed) return str(e.c, 8192) ? { id: e.id, dev: String(e.dev), seq: Number(e.seq) || 0, c: e.c } : null;
  if (!KINDS.includes(e.kind) || !Number.isFinite(e.t) || !e.data || typeof e.data !== "object" || Array.isArray(e.data)) return null;
  const data = JSON.stringify(e.data);
  if (data.length > 2000) return null;
  return { id: e.id, dev: String(e.dev), seq: Number(e.seq) || 0, t: e.t, tz: Number(e.tz) || 0, by: ["child", "caregiver", "system"].includes(e.by) ? e.by : "caregiver", ...(str(e.sessionId, 64) && { sessionId: e.sessionId }), v: 1, kind: e.kind, data: JSON.parse(data) };
}

// Returns { added, cursor } or { error }.
export function post(d, body) {
  const list = Array.isArray(body?.events) ? body.events : null;
  if (!list) return { error: "events must be an array" };
  if (list.length > MAX_BATCH) return { error: `at most ${MAX_BATCH} events per request` };
  const P = (d.potty ||= { seq: 0, events: [] });
  const have = new Set(P.events.map((e) => e.id));
  let added = 0;
  for (const raw of list) {
    const e = clean(raw, !!body.sealed || !!raw?.c);
    if (!e || have.has(e.id)) continue;
    P.seq += 1; P.events.push({ ...e, s: P.seq }); have.add(e.id); added++;
  }
  if (P.events.length > MAX_EVENTS) P.events = P.events.slice(-MAX_EVENTS);
  return { added, cursor: P.seq };
}
export function since(d, n) {
  const P = d.potty || { seq: 0, events: [] }, from = Number(n) || 0;
  return { events: P.events.filter((e) => e.s > from).slice(0, 2000), cursor: P.seq };
}
export function wipe(d) { const n = d.potty?.events?.length || 0; d.potty = { seq: d.potty?.seq || 0, events: [] }; return n; }
