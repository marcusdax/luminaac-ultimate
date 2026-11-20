// Potty Path core: pure logic, no DOM, no storage. My Voice, the Bridge, the
// backend and the tests all share it. See docs/POTTY-PATH.md for the why.
//
// Data is an append-only event log. Every event has a unique id, so merging two
// devices' logs is a union by id (order and duplicates don't matter). Mistakes are
// fixed with a "retract" event, never by editing. Sessions, the token ledger, the
// World, hints and red flags are all derived from the log and never stored, so two
// devices can't disagree about them and tokens can never go down.

export const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;

// ---------- Vocabulary ----------
// Routine steps, in order. The sit (with its timer and body check) sits in the middle.
export const STEPS = [
  { id: "approach", label: "Go to the toilet", say: "Toilet time.", e: "🚪", before: true },
  { id: "pants_down", label: "Pants down", say: "Pants down.", e: "⬇️", before: true },
  { id: "sit", label: "Sit", say: "Sitting.", e: "🚽" },
  { id: "wipe", label: "Wipe", say: "Wipe.", e: "🧻" },
  { id: "stand", label: "Stand up", say: "Stand up.", e: "⬆️" },
  { id: "pants_up", label: "Pants up", say: "Pants up.", e: "👖" },
  { id: "flush", label: "Flush", say: "Flush.", e: "💧", optional: true },
  { id: "wash", label: "Wash hands", say: "Wash hands.", e: "🧼" },
  { id: "dry", label: "Dry hands", say: "Dry hands.", e: "🤲" },
];
export const DONE_STEP = { id: "done", label: "All done", say: "All done.", e: "✅" };
export const CLEANUP_STEPS = [
  { id: "pants_off", label: "Wet pants off", say: "Pants off.", e: "⬇️" },
  { id: "wipe", label: "Wipe", say: "Wipe.", e: "🧻" },
  { id: "new_pants", label: "Clean pants on", say: "Clean pants.", e: "👖" },
  { id: "wash", label: "Wash hands", say: "Wash hands.", e: "🧼" },
];

// Ways a child can say "I need the toilet". Every one counts; none is "better".
export const MODALITIES = {
  aac_button: "Tapped TOILET", vocal: "Said a word or sound", echolalia: "Used a script or echo", sign: "Signed",
  symbol_card: "Gave a card", object: "Brought an object", leads_adult: "Led me there", at_door: "Stood at the door",
  holds: "Held or pulled at clothes", other: "Something else",
};
// Prompt levels, least to most. There is no physical prompt for the AAC tap;
// hand-under-hand is only for motor steps (clothes, washing) and only with assent.
export const PROMPTS = { independent: "On their own", environmental: "Visual or schedule cue", model: "I showed them", gesture: "I pointed", hand_under_hand: "Hand-under-hand" };

export const DEFAULT_PROTOCOL = {
  phase: 1, // 0 readiness · 1 baseline · 2 safe place · 3 scheduled sits · 5 interoception · 6 bowel · 7 generalise · 8 fading
  sitWindows: [], // "HH:MM" times from the baseline
  sitSec: 120, sitCapSec: 300, bowelSitSec: 300, bowelCapSec: 600,
  maxSitsPerDay: 8, minGapMin: 20,
  steps: ["approach", "pants_down", "sit", "wipe", "stand", "pants_up", "flush", "wash", "dry"],
  tokenRatio: 1, tokenForSitting: true, tokensOn: true, worldOn: true, world: "train",
  timer: "circle", companion: "train", sound: "silent", celebrate: "minimal",
  bmPauseDays: 3, refusalsPerDay: 2, retired: false, baselineMode: "light",
  // v0.11 mechanics (docs/POTTY-PATH-MECHANICS.md)
  stage: 0, tokenPhase: "A", intervalMin: 60, promptLevel: 1, stability: false,
  activities: [], activity: "none", rotate: false, transitionCard: true, rewardChoice: false, publicMode: false, doneText: "",
  updatedAt: 0, updatedBy: "",
};
export function protocolOf(p) { return { ...DEFAULT_PROTOCOL, ...(p || {}) }; }

// Sit length: never more than the clinical cap (5 min urine, 10 min bowel).
export function sitLimits(proto, bowel = false) {
  const p = protocolOf(proto);
  const cap = bowel ? Math.min(p.bowelCapSec, 600) : Math.min(p.sitCapSec, 300);
  return { sec: Math.min(bowel ? p.bowelSitSec : p.sitSec, cap), cap };
}

// ---------- Events ----------
export const KINDS = ["session_start", "step", "sit_start", "sit_end", "more_time", "body_check", "void", "wet", "dry_check", "signal",
  "refuse", "distress", "pause", "resume", "abort", "session_end", "prompt", "drink", "meal", "token_award", "token_redeem",
  "protocol_pause", "protocol_resume", "note", "retract", "body_answer",
  "stage", "offer"]; // new kinds go at the end: pack() stores the index

export function makeEvent(kind, data = {}, o = {}) {
  if (!KINDS.includes(kind)) throw new Error("Unknown potty event: " + kind);
  const t = o.t ?? Date.now();
  return { id: o.id || rid(), dev: o.dev || "local", seq: o.seq ?? 0, t, tz: o.tz ?? -new Date(t).getTimezoneOffset(), by: o.by || "caregiver", ...(o.sessionId && { sessionId: o.sessionId }), v: 1, kind, data: clean(data) };
}
const clean = (d) => Object.fromEntries(Object.entries(d || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));
export const rid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : "e" + Math.random().toString(36).slice(2) + Date.now().toString(36));

// Accept only well-formed events (anything from another device or a QR code is untrusted).
export function validEvent(e) {
  return !!e && typeof e === "object" && typeof e.id === "string" && e.id.length > 0 && e.id.length <= 64 &&
    KINDS.includes(e.kind) && Number.isFinite(e.t) && typeof e.data === "object" && e.data !== null && !Array.isArray(e.data);
}
export const order = (a, b) => a.t - b.t || String(a.dev).localeCompare(String(b.dev)) || (a.seq || 0) - (b.seq || 0) || a.id.localeCompare(b.id);

// Union by id. Commutative, associative, idempotent.
export function merge(...lists) {
  const m = new Map();
  for (const l of lists) for (const e of l || []) if (validEvent(e) && !m.has(e.id)) m.set(e.id, e);
  return [...m.values()].sort(order);
}
// Events minus anything retracted (and minus the retract events themselves).
export function live(events) {
  const gone = new Set(events.filter((e) => e.kind === "retract").map((e) => e.data.targetId));
  return events.filter((e) => e.kind !== "retract" && !gone.has(e.id));
}

// ---------- Days ----------
// Local day of an event, using the offset it was logged with.
export const localMs = (e) => e.t + (e.tz ?? 0) * MIN;
export const dayOf = (e) => Math.floor(localMs(e) / DAY);
export const minuteOfDay = (e) => Math.floor((((localMs(e) % DAY) + DAY) % DAY) / MIN);
export const dayNow = (now, tz = -new Date(now).getTimezoneOffset()) => Math.floor((now + tz * MIN) / DAY);
export function partOfDayMin(m) { const h = m / 60; return h < 5 ? "night" : h < 11 ? "morning" : h < 17 ? "afternoon" : h < 20 ? "evening" : "night"; }

const LOGS = new Set(["void", "wet", "dry_check", "sit_start", "drink", "meal", "signal", "body_answer"]);
// A day is "covered" when it has at least 3 logs spread over at least 4 hours.
export function coveredDays(events) {
  const by = new Map();
  for (const e of events) if (LOGS.has(e.kind)) { const d = dayOf(e); (by.get(d) || by.set(d, []).get(d)).push(minuteOfDay(e)); }
  const out = new Set();
  for (const [d, ms] of by) if (ms.length >= 3 && Math.max(...ms) - Math.min(...ms) >= 240) out.add(d);
  return out;
}

// ---------- Sessions (state machine as a fold) ----------
// States: approach → sitting → (body_check) → finishing → ended, with side states
// coregulate (paused, timer frozen) and cleanup (after a wet). Every session ends.
export function foldSession(evs, proto, now = Date.now()) {
  const p = protocolOf(proto);
  const s = { id: evs[0]?.sessionId, start: evs[0]?.t ?? now, end: null, state: "approach", prompted: true, initiated: false, steps: [],
    sitStart: null, sitPaused: 0, sits: 0, outcome: null, voids: [], refused: false, distress: 0, escalated: false, capped: false, bowel: false,
    prev: null, pausedAt: null, last: evs[0]?.t ?? now, cleanup: false, bodyCheck: false, extended: 0, late: false, sitSecs: 0, sitOpen: false };
  for (const e of evs) {
    s.last = e.t;
    if (s.state === "ended") break;
    const d = e.data || {};
    switch (e.kind) {
      case "session_start": s.prompted = d.prompted !== false; s.bowel = !!d.bowel; if (d.cleanup) { s.cleanup = true; s.state = "cleanup"; } break;
      case "signal": if (d.late && !s.initiated) s.late = true; else if (!d.late) s.late = false; s.initiated = true; s.prompted = false; break;
      case "step":
        if (!s.steps.includes(d.step)) s.steps.push(d.step);
        if (d.step === "sit") startSit(s, e.t);
        else if (!s.cleanup && STEPS.find((x) => x.id === d.step && !x.before) && s.state !== "coregulate") endSit(s, e.t, "finishing");
        if (d.step === "done") end(s, e.t);
        break;
      case "sit_start": startSit(s, e.t); break;
      case "more_time": s.extended += 1; s.bodyCheck = false; if (s.state === "body_check") s.state = "sitting"; break;
      case "body_check": s.bodyCheck = true; if (s.state === "sitting") s.state = "body_check"; break;
      case "sit_end": endSit(s, e.t, "finishing"); break;
      case "void": s.voids.push({ type: d.type || "urine", t: e.t }); s.outcome = "void"; if (s.state === "sitting" || s.state === "body_check") s.state = "celebrate"; break;
      case "wet": if (s.outcome !== "void") s.outcome = "wet"; s.cleanup = true; s.state = "cleanup"; break;
      case "refuse": s.refused = true; if (!s.outcome) s.outcome = "refused"; endSit(s, e.t); end(s, e.t); break;
      case "distress": case "pause":
        if (e.kind === "distress") s.distress += 1;
        if (s.state !== "coregulate") { s.prev = s.state; s.state = "coregulate"; s.pausedAt = e.t; }
        break;
      case "resume":
        if (s.state === "coregulate") { if (s.sitStart != null && s.pausedAt != null) s.sitPaused += e.t - s.pausedAt; s.state = s.prev || "approach"; s.pausedAt = null; }
        break;
      case "abort": if (d.escalation) s.escalated = true; endSit(s, e.t); end(s, e.t); break;
      case "session_end": endSit(s, e.t); end(s, e.t); break;
    }
  }
  if (!s.outcome && s.sits) s.outcome = "tried";
  if (s.state !== "ended") {
    // Time-based transitions are computed from timestamps, so they survive screen sleep.
    if (s.state === "coregulate" && s.pausedAt != null && now - s.pausedAt > 15 * MIN) { end(s, s.pausedAt + 15 * MIN); s.autoEnded = "paused too long"; }
    else if (now - s.last > 30 * MIN) { end(s, s.last); s.autoEnded = "idle"; }
  }
  const lim = sitLimits(p, s.bowel);
  s.sitTarget = lim.sec * (1 + s.extended); s.sitCap = lim.cap;
  s.sitElapsed = s.sitStart == null ? 0 : Math.max(0, (s.state === "coregulate" && s.pausedAt != null ? s.pausedAt : now) - s.sitStart - s.sitPaused) / 1000;
  if ((s.state === "sitting" || s.state === "body_check") && s.sitElapsed >= s.sitCap) { s.capped = true; s.state = "finishing"; }
  else if (s.state === "sitting" && s.sitElapsed >= Math.min(s.sitTarget, s.sitCap)) s.state = "body_check";
  return s;
  function startSit(x, t) { x.sitStart = t; x.sitPaused = 0; x.sits += 1; x.bodyCheck = false; x.extended = 0; x.sitOpen = true; if (x.state !== "coregulate") x.state = "sitting"; }
  function closeSit(x, t) { if (!x.sitOpen) return; x.sitOpen = false; const paused = x.pausedAt != null ? t - x.pausedAt : 0; x.sitSecs = Math.max(x.sitSecs, (t - x.sitStart - x.sitPaused - paused) / 1000); }
  function endSit(x, t, next) { closeSit(x, t); if (x.state === "sitting" || x.state === "body_check" || x.state === "celebrate") x.state = next || x.state; }
  function end(x, t) { closeSit(x, t); x.state = "ended"; x.end = t; }
}

export function sessions(events, proto, now = Date.now()) {
  const by = new Map();
  for (const e of live(events)) if (e.sessionId) (by.get(e.sessionId) || by.set(e.sessionId, []).get(e.sessionId)).push(e);
  return [...by.values()].map((evs) => foldSession(evs.sort(order), proto, now)).sort((a, b) => a.start - b.start);
}
export function activeSession(events, proto, now = Date.now()) {
  const all = sessions(events, proto, now);
  return all.reverse().find((s) => s.state !== "ended") || null;
}

// Steps the child sees for this protocol (flush may be removed for a child who fears it).
export function stepsFor(proto) {
  const p = protocolOf(proto);
  return STEPS.filter((s) => p.steps.includes(s.id));
}
// Index of the step the child is on now, for the Now/Next view.
export function currentStep(s, proto) {
  const list = s?.cleanup ? CLEANUP_STEPS : stepsFor(proto);
  const i = list.findIndex((x) => !s?.steps.includes(x.id));
  return { list, i: i < 0 ? list.length : i };
}

// ---------- Tokens and the World (add-only) ----------
// Tokens a single moment earns. Telling first earns most (signal > void > sit).
// A "late" signal (telling us after a wet) is thanked warmly but earns only 1, so an
// accident followed by telling never pays better than telling first.
export function tokensFor(kind, data = {}, proto) {
  const p = protocolOf(proto);
  if (!p.tokensOn) return 0;
  if (kind === "signal") return data.late ? 1 : 3;
  if (kind === "void" && (data.where || "toilet") === "toilet") return 2;
  if (kind === "sit_done") return p.tokenForSitting ? 1 : 0;
  if (kind === "dry_check") return data.dry === false ? 0 : 1;
  return 0; // wet, refusal, distress: nothing earned, and nothing ever taken away
}
// What a signal earns right now: late if a wet was logged in the last 10 minutes,
// and signal tokens count at most once per 20 minutes (the trip is always honoured).
export function signalAward(events, proto, now = Date.now()) {
  const L = live(events);
  const late = L.some((e) => e.kind === "wet" && e.t <= now && now - e.t <= 10 * MIN);
  const recent = L.some((e) => e.kind === "token_award" && e.data.why === "signal" && now - e.t < 20 * MIN && e.t <= now);
  return { late, n: recent ? 0 : tokensFor("signal", { late }, proto) };
}
// Each signal, classified from what happened around it.
//   early: a toilet void followed within 15 min   · early_missed: a wet followed (told first, didn't make it)
//   late: a wet came first (within 10 min before)  · no_need: nothing followed within 15 min · pending
export function signalTiming(events, now = Date.now()) {
  const L = live(events), outs = L.filter((e) => e.kind === "void" || e.kind === "wet");
  const list = L.filter((e) => e.kind === "signal").map((s) => {
    const before = outs.find((e) => e.kind === "wet" && e.t <= s.t && s.t - e.t <= 10 * MIN);
    const after = outs.find((e) => e.t > s.t && e.t - s.t <= 15 * MIN);
    const timing = s.data.late || before ? "late" : after?.kind === "void" ? "early" : after ? "early_missed" : now - s.t > 15 * MIN ? "no_need" : "pending";
    return { id: s.id, t: s.t, timing, modality: s.data.modality || "other" };
  });
  return list;
}
export function signalRates(events, now = Date.now(), days = 7) {
  const list = signalTiming(events, now).filter((x) => now - x.t < days * DAY && x.timing !== "pending");
  const n = (k) => list.filter((x) => k.includes(x.timing)).length;
  const withOut = n(["early", "early_missed", "late"]);
  return { total: list.length, early: n(["early", "early_missed"]), late: n(["late"]), noNeed: n(["no_need"]),
    earlyRate: withOut ? n(["early", "early_missed"]) / withOut : null, lateRate: withOut ? n(["late"]) / withOut : null, support: withOut };
}
export function ledger(events, proto) {
  const p = protocolOf(proto), L = live(events);
  const earned = L.filter((e) => e.kind === "token_award").reduce((n, e) => n + Math.max(0, +e.data.n || 0), 0);
  const redeemed = L.filter((e) => e.kind === "token_redeem");
  const spent = redeemed.reduce((n, e) => n + Math.max(1, +e.data.ratio || 1), 0);
  const ratio = Math.max(1, Math.min(10, +p.tokenRatio || 1));
  const onBoard = Math.max(0, earned - spent);
  return { earned, boardsRedeemed: redeemed.length, onBoard, ratio, full: onBoard >= ratio };
}
// The World only grows: one piece per session (size by what happened), never removed.
// Telling first is a landmark ("big"); telling after a wet is a small lantern.
export const PIECE = { big: 4, medium: 3, small: 2, lantern: 1, tiny: 1 };
export function worldPieces(events, proto, now = Date.now()) {
  const out = [];
  for (const s of sessions(events, proto, now)) {
    if (s.state !== "ended") continue;
    out.push(s.initiated ? (s.late ? "lantern" : "big") : s.voids.length ? "medium" : s.sits ? "small" : "tiny");
  }
  return out;
}
export const WORLDS = {
  train: { label: "Train line", pieces: { big: "🚉", medium: "🚋", small: "🛤️", lantern: "🏮", tiny: "🪨" }, head: "🚂" },
  garden: { label: "Garden", pieces: { big: "🌳", medium: "🌻", small: "🌷", lantern: "🕯️", tiny: "🌱" }, head: "🏡" },
  sea: { label: "Aquarium", pieces: { big: "🐳", medium: "🐠", small: "🐟", lantern: "🐚", tiny: "🫧" }, head: "🪸" },
  city: { label: "City", pieces: { big: "🏢", medium: "🏠", small: "🌳", lantern: "🏮", tiny: "🚦" }, head: "🏙️" },
};
// Areas open only at a confirmed stage change (stage 0 = the first patch).
export const AREAS = ["Home patch", "Meadow", "Forest", "Beach", "Hills", "Mountain"];
export const PAGE = 12; // pieces per World page; full pages go into the book

// ---------- Scheduling guard rails ----------
export function todayCounts(events, proto, now = Date.now()) {
  const L = live(events), today = dayNow(now);
  const t = L.filter((e) => dayOf(e) === today);
  const ss = sessions(events, proto, now).filter((s) => dayNow(s.start) === today);
  return {
    sits: t.filter((e) => e.kind === "sit_start" || (e.kind === "step" && e.data.step === "sit")).length,
    scheduledSits: ss.filter((s) => s.prompted && s.sits).length,
    voids: t.filter((e) => e.kind === "void").length, wets: t.filter((e) => e.kind === "wet").length,
    signals: t.filter((e) => e.kind === "signal").length,
    refusals: t.filter((e) => e.kind === "refuse").length, distress: t.filter((e) => e.kind === "distress").length,
    escalations: ss.filter((s) => s.escalated).length, sessions: ss.length,
    lastSitAt: Math.max(0, ...L.filter((e) => e.kind === "sit_start" || (e.kind === "step" && e.data.step === "sit")).map((e) => e.t)),
  };
}
// May the caregiver be nudged toward a *scheduled* sit now? (A child's own signal is always honoured.)
export function canScheduleSit(events, proto, now = Date.now(), pause = null) {
  const p = protocolOf(proto), c = todayCounts(events, p, now);
  if (p.retired) return { ok: false, reason: "Potty Path is retired. The TOILET button still works." };
  if (pause?.paused) return { ok: false, reason: "Paused: " + pause.reasons[0]?.label };
  if (c.escalations) return { ok: false, reason: "No more toilet tries today after a hard moment. Rest." };
  if (c.distress >= 1) return { ok: false, reason: "No more scheduled sits today after distress." };
  if (c.refusals >= p.refusalsPerDay) return { ok: false, reason: `${c.refusals} "not now"s today. That's an answer; try again tomorrow.` };
  if (c.scheduledSits >= p.maxSitsPerDay) return { ok: false, reason: `That's ${c.scheduledSits} sits today, the most for one day.` };
  if (c.lastSitAt && now - c.lastSitAt < p.minGapMin * MIN) return { ok: false, reason: `Last sit was under ${p.minGapMin} minutes ago.`, wait: c.lastSitAt + p.minGapMin * MIN - now };
  return { ok: true };
}
// The next sit window today, as a time (ms), or null.
export function nextWindow(proto, now = Date.now()) {
  const p = protocolOf(proto), d = new Date(now);
  const times = (p.sitWindows || []).map((hm) => { const [h, m] = String(hm).split(":").map(Number); const x = new Date(d); x.setHours(h || 0, m || 0, 0, 0); return x.getTime(); }).filter(Number.isFinite).sort((a, b) => a - b);
  return times.find((x) => x > now - 10 * MIN) ?? null;
}

// ---------- Medical red flags ----------
// Screening answers the parent gives at setup. Any "yes" pauses the plan until a
// doctor has been asked. Thresholds are defaults a clinician can change.
export const SCREENING = [
  { code: "pain", label: "Pain or straining when pooing or peeing", urgent: false },
  { code: "blood", label: "Blood in poo or pee", urgent: false },
  { code: "withholding", label: "Holding poo in (up on toes, crossed legs, hiding)", urgent: false },
  { code: "overflow", label: "Small smears in pants without full poos", urgent: false },
  { code: "hard_stool", label: "Hard, lumpy poos (Bristol type 1 or 2)", urgent: false },
  { code: "uti", label: "Pain, fever, cloudy or smelly pee, or suddenly peeing much more often", urgent: false },
  { code: "dribble", label: "Pee dribbles all the time, never dry", urgent: false },
  { code: "regression", label: "Lost toileting skills they used to have", urgent: false },
  { code: "thirst", label: "Very thirsty and peeing a lot, or losing weight", urgent: true },
  { code: "no_urine", label: "No pee for 8 or more waking hours", urgent: true },
  { code: "vomit_belly", label: "Vomiting with a swollen belly", urgent: true },
  { code: "fever_back", label: "Fever with back or side pain", urgent: true },
];
const BM = (e) => (e.kind === "void" || e.kind === "wet") && (e.data.type === "bm" || e.data.type === "both");

export function ruleFlags(events, proto, now = Date.now()) {
  const p = protocolOf(proto), L = live(events), out = [];
  const bms = L.filter(BM);
  const cov = coveredDays(L), today = dayNow(now);
  // No poo for N covered days (uncovered days are a logging gap, not a flag).
  const lastBm = bms.length ? dayOf(bms[bms.length - 1]) : null;
  const since = lastBm == null ? null : today - lastBm;
  const firstLog = L.length ? dayOf(L[0]) : today;
  const span = lastBm == null ? today - firstLog : since;
  let coveredSince = 0; for (let d = today - span + 1; d <= today; d++) if (cov.has(d)) coveredSince++;
  if (span >= p.bmPauseDays) {
    if (coveredSince >= p.bmPauseDays) out.push({ code: "no_bm", label: `No poo logged for ${span} days`, source: "rule", urgent: false });
    else out.push({ code: "bm_gap", label: `No poo logged for ${span} days. Logging gaps?`, source: "rule", info: true });
  }
  // Hard poos: Bristol 1–2 twice in a week, or in 2 of the last 5.
  const hard = bms.filter((e) => +e.data.stool >= 1 && +e.data.stool <= 2);
  const lastFive = bms.slice(-5).filter((e) => +e.data.stool >= 1 && +e.data.stool <= 2).length;
  if (hard.filter((e) => now - e.t < 7 * DAY).length >= 2 || lastFive >= 2) out.push({ code: "hard_stool", label: "Hard poos (type 1–2) more than once this week", source: "rule", urgent: false });
  // Regression after a stable period.
  const reg = regression(L, now);
  if (reg) out.push({ code: "regression", label: reg.text, source: "rule", urgent: false });
  return out;
}
// Combine screening and rules into one pause state. A caregiver "resume" after a
// doctor's check snoozes that code for 7 days; urgent codes never snooze.
export function pauseState(events, profile, proto, now = Date.now()) {
  const L = live(events);
  const snoozed = new Map();
  for (const e of L) if (e.kind === "protocol_resume" && e.data.code) snoozed.set(e.data.code, e.t);
  const screen = (profile?.screening || []).filter((x) => x.present).map((x) => ({ ...SCREENING.find((s) => s.code === x.code), at: x.at, source: "screening" })).filter((x) => x.code);
  const flags = [...screen, ...ruleFlags(L, proto, now)].filter((f) => !f.info);
  const active = flags.filter((f) => f.urgent || !(snoozed.has(f.code) && now - snoozed.get(f.code) < 7 * DAY && (!f.at || snoozed.get(f.code) > f.at)));
  const manual = [...L].reverse().find((e) => e.kind === "protocol_pause" || e.kind === "protocol_resume");
  const manualPause = manual?.kind === "protocol_pause" && manual.data.manual ? [{ code: "manual", label: manual.data.reason || "Paused by a caregiver", source: "caregiver" }] : [];
  const reasons = [...active, ...manualPause];
  return { paused: reasons.length > 0, urgent: reasons.some((r) => r.urgent), reasons, info: ruleFlags(L, proto, now).filter((f) => f.info) };
}

// ---------- Pattern hints (explainable, gated) ----------
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return NaN; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
export const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;
const URINE = (e) => (e.kind === "void" || e.kind === "wet") && (e.data.type || "urine") !== "bm";

export function voidTimes(events, now = Date.now()) {
  const L = live(events), cov = coveredDays(L), today = dayNow(now);
  const days = [...cov].filter((d) => d > today - 14 && d <= today);
  const vs = L.filter((e) => URINE(e) && days.includes(dayOf(e)));
  const need = { days: 7, voids: 10 };
  if (days.length < need.days || vs.length < need.voids) return { ready: false, needs: `${Math.max(0, need.days - days.length)} more fully logged days and ${Math.max(0, need.voids - vs.length)} more pees`, support: { days: days.length, voids: vs.length } };
  const peaks = [];
  const used = new Set();
  const mins = vs.map((e) => ({ m: minuteOfDay(e), d: dayOf(e), id: e.id }));
  for (let k = 0; k < 4; k++) {
    let best = null;
    for (let c = 0; c < 1440; c += 15) {
      const win = mins.filter((x) => !used.has(x.id) && Math.abs(x.m - c) <= 15);
      const dset = new Set(win.map((x) => x.d));
      if (win.length >= 3 && dset.size >= Math.ceil(0.4 * days.length) && (!best || dset.size > best.days || (dset.size === best.days && win.length > best.win.length))) best = { c, win, days: dset.size };
    }
    if (!best) break;
    best.win.forEach((x) => used.add(x.id));
    const med = median(best.win.map((x) => x.m));
    peaks.push({ minute: med, time: hhmm(med), days: best.days, of: days.length, sitAt: hhmm(med - 10), why: `Pee logged near ${hhmm(med)} on ${best.days} of ${days.length} fully logged days` });
  }
  return { ready: true, peaks: peaks.sort((a, b) => a.minute - b.minute), support: { days: days.length, voids: vs.length } };
}

export function drinkToVoid(events) {
  const L = live(events), drinks = L.filter((e) => e.kind === "drink"), pees = L.filter(URINE), pairs = [];
  for (const d of drinks) { const v = pees.find((e) => e.t > d.t && e.t - d.t <= 180 * MIN); if (v) pairs.push({ lag: (v.t - d.t) / MIN, day: dayOf(d) }); }
  const days = new Set(pairs.map((p) => p.day)).size;
  if (pairs.length < 8 || days < 4) return { ready: false, needs: `${Math.max(0, 8 - pairs.length)} more drink-then-pee pairs over ${Math.max(0, 4 - days)} more days`, support: { pairs: pairs.length, days } };
  const lags = pairs.map((p) => p.lag), med = median(lags), iqr = quant(lags, 0.75) - quant(lags, 0.25);
  if (iqr > 30) return { ready: false, needs: "The time from drink to pee varies too much to suggest a sit time yet", support: { pairs: pairs.length, days, iqr: Math.round(iqr) } };
  return { ready: true, minutes: Math.round(med), sitAfter: Math.max(5, Math.round(med - 5)), iqr: Math.round(iqr), support: { pairs: pairs.length, days }, why: `${pairs.length} drinks over ${days} days were followed by a pee after about ${Math.round(med)} minutes` };
}

export function successByPartOfDay(events, proto, now = Date.now()) {
  const b = {};
  for (const s of sessions(events, proto, now)) {
    if (!s.sits) continue;
    const pod = partOfDayMin(minuteOfDay({ t: s.start, tz: -new Date(s.start).getTimezoneOffset() }));
    const x = (b[pod] ||= { n: 0, ok: 0 }); x.n++; if (s.voids.length) x.ok++;
  }
  const rows = Object.entries(b).map(([pod, x]) => ({ pod, n: x.n, ok: x.ok, rate: Math.round(((x.ok + 1) / (x.n + 2)) * 100), ready: x.n >= 5 }));
  const ready = rows.filter((r) => r.ready);
  const flag = ready.length >= 2 && Math.max(...ready.map((r) => r.rate)) - Math.min(...ready.map((r) => r.rate)) >= 25;
  return { rows, flag, best: flag ? ready.sort((a, c) => c.rate - a.rate)[0].pod : null };
}

export function regression(events, now = Date.now()) {
  const L = live(events), today = dayNow(now);
  const win = (from, to) => L.filter((e) => URINE(e) && dayOf(e) > today - from && dayOf(e) <= today - to);
  const recent = win(7, 0), before = win(21, 7);
  if (before.length < 15) return null;
  const ratio = (a) => a.filter((e) => e.kind === "void").length / Math.max(1, a.length);
  const r1 = ratio(recent), r0 = ratio(before), wets = recent.filter((e) => e.kind === "wet").length;
  if (recent.length && r0 - r1 >= 0.2 && wets >= 3) return { from: Math.round(r0 * 100), to: Math.round(r1 * 100), wets, text: `Fewer pees in the toilet this week (${Math.round(r1 * 100)}%, was ${Math.round(r0 * 100)}%). Illness, pain or a change in routine? Worth a check with your doctor.` };
  return null;
}

// Gentle suggestions for the caregiver. The app never changes the plan by itself.
export function suggestions(events, proto, now = Date.now()) {
  const p = protocolOf(proto), L = live(events), out = [], today = dayNow(now);
  const ss = sessions(L, p, now).filter((s) => s.state === "ended");
  const dayStat = (d) => { const x = ss.filter((s) => dayNow(s.start) === d); return { n: x.length, distress: x.some((s) => s.distress || s.escalated), calm: x.length > 0 && x.every((s) => !s.distress && !s.escalated && !s.refused), success: x.some((s) => s.voids.length || s.initiated) }; };
  const distressDays = [0, 1, 2, 3, 4, 5, 6].filter((k) => dayStat(today - k).distress).length;
  if (distressDays >= 3) out.push({ code: "step_back", text: `Hard moments on ${distressDays} of the last 7 days. Consider going back a phase, or checking the sensory list.` });
  if (p.phase === 2 && [0, 1, 2].every((k) => dayStat(today - k).calm)) out.push({ code: "phase_up", text: "Calm in the bathroom 3 days running. Ready to try short sits (phase 3)?" });
  let run = 0; for (let k = 0; k < 14 && dayStat(today - k).success && !dayStat(today - k).distress; k++) run++;
  if (p.tokensOn && run >= 5 && p.tokenRatio < 5) out.push({ code: "thin", text: `${run} good days in a row. Try a bigger board (${p.tokenRatio} → ${p.tokenRatio < 2 ? 2 : p.tokenRatio < 3 ? 3 : 5} tokens)? Easier board is one tap if not.` });
  const c = todayCounts(L, p, now);
  if (c.sessions === 0 && p.phase >= 3 && !p.retired && new Date(now).getHours() >= 12 && (p.sitWindows || []).length) out.push({ code: "none_today", text: "No tries yet today. That's okay; a short visit counts." });
  return out;
}

// ---------- Stages (the macro loop, weeks to months) ----------
// Stages describe the journey, never the child's worth. The app only ever
// recommends a change; a grown-up confirms it. Stepping back is normal.
export const STAGES = [
  { id: 0, name: "Familiar", goal: "The bathroom is a safe place: come in, sit with clothes on for a moment.", sitSec: 30, phase: 2, exit: "Calm visits in 5 of the last 7 tries, over at least 3 days" },
  { id: 1, name: "Sitting", goal: "Sit with pants down for a short, calm time.", sitSec: 60, phase: 3, exit: "Sat 10 seconds or more in 5 of the last 7 tries, over at least 3 days" },
  { id: 2, name: "Scheduled sits", goal: "Short sits at the right times, with dry checks in between.", sitSec: 90, phase: 3, exit: "A pee or poo in the toilet in half of the last 10 sits, with most planned sits logged" },
  { id: 3, name: "Telling", goal: "Telling you they need to go, in any way they can.", sitSec: 120, phase: 5, exit: "Told you at least 3 times in a week, half of them before going" },
  { id: 4, name: "Doing it more on their own", goal: "Starting most trips themselves; reminders fade.", sitSec: 120, phase: 7, exit: "Started 70% of trips themselves over 2 weeks" },
  { id: 5, name: "Fading out", goal: "Less app, more everyday praise. The World becomes the reward.", sitSec: 120, phase: 8, exit: "Your family's own 'done', written down" },
];
const ended = (events, p, now) => sessions(events.filter((e) => e.t <= now), p, now).filter((s) => s.state === "ended");
const calmS = (s) => !s.distress && !s.escalated && !s.refused;
const daysOf = (list) => new Set(list.map((s) => dayNow(s.start))).size;
function stageCheck(stage, events, p, now) {
  const all = ended(events, p, now);
  if (stage === 0 || stage === 1) {
    const last = all.slice(-7), ok = last.filter((s) => calmS(s) && (stage === 0 || s.sitSecs >= 10));
    return { met: ok.length >= 5 && daysOf(ok) >= 3, why: `${stage === 0 ? "Calm visits" : "Calm sits of 10 seconds or more"} in ${ok.length} of the last ${last.length} tries, over ${daysOf(ok)} day${daysOf(ok) === 1 ? "" : "s"}`, support: last.length };
  }
  if (stage === 2) {
    const sits = all.filter((s) => s.sits).slice(-10), hit = sits.filter((s) => s.voids.length).length;
    const wk = all.filter((s) => s.start > now - 7 * DAY), wins = (p.sitWindows || []).length;
    const adherence = wins ? Math.min(1, wk.filter((s) => s.prompted && s.sits).length / (wins * 7)) : daysOf(wk) / 7;
    return { met: sits.length >= 10 && hit / sits.length >= 0.5 && adherence >= 0.8, why: `In the toilet in ${hit} of the last ${sits.length} sits; ${Math.round(adherence * 100)}% of planned sits logged this week`, support: sits.length };
  }
  if (stage === 3) {
    const r = signalRates(events.filter((e) => e.t <= now), now, 7);
    return { met: r.total >= 3 && (r.earlyRate ?? 0) >= 0.5, why: `Told you ${r.total} time${r.total === 1 ? "" : "s"} this week${r.support ? `, ${r.early} of ${r.support} before going` : ""}`, support: r.total };
  }
  if (stage === 4) {
    const two = all.filter((s) => s.start > now - 14 * DAY), own = two.filter((s) => s.initiated).length;
    return { met: two.length >= 10 && own / two.length >= 0.7, why: `Started ${own} of ${two.length} trips in the last 2 weeks themselves`, support: two.length };
  }
  return { met: false, why: "Stage 5 ends when your family says so.", support: 0 };
}
// Recommendation only. With p.stability (CAS or anxiety, set by the SLP or family)
// the exit must be met in two separate weeks. "Not yet" quiets the card for 3 days.
export function stageProgress(events, proto, now = Date.now(), pause = null) {
  const p = protocolOf(proto), L = live(events), st = Math.max(0, Math.min(5, +p.stage || 0));
  const chk = stageCheck(st, L, p, now);
  const met = chk.met && (!p.stability || stageCheck(st, L, p, now - 7 * DAY).met);
  const declined = L.some((e) => e.kind === "stage" && e.data.action === "decline" && e.data.to === st + 1 && now - e.t < 3 * DAY);
  const last5 = ended(L, p, now).slice(-5);
  const hard = last5.filter((s) => s.distress || s.escalated).length, nos = last5.filter((s) => s.refused).length;
  const stepBack = st > 0 && (hard >= 2 || nos >= 3) ? { to: st - 1, why: hard >= 2 ? `Hard moments in ${hard} of the last 5 tries. They're telling us something; more support helps.` : `${nos} "not now"s in the last 5 tries.` } : null;
  return { stage: st, info: STAGES[st], advance: !pause?.paused && !stepBack && !declined && met && st < 5 ? { to: st + 1, why: chk.why + (p.stability ? " (two weeks running)" : "") } : null,
    stepBack, why: chk.why, support: chk.support, met };
}

// ---------- Token phases (fade the structure, never the rewards) ----------
export const TOKEN_PHASES = {
  A: { label: "One try, one reward", ratio: 1, from: 0 },
  B: { label: "A board of 3", ratio: 3, from: 2 },
  C: { label: "A bigger board (5, then 8), with a choice of reward", ratio: 5, from: 3 },
  D: { label: "Everyday rewards: praise, songs, the World", ratio: 8, from: 5 },
};
// The next phase to offer, or null. Never automatic; the grown-up confirms.
export function tokenPhaseAdvice(proto) {
  const p = protocolOf(proto), order = ["A", "B", "C", "D"], i = order.indexOf(p.tokenPhase);
  if (p.tokenPhase === "C" && p.tokenRatio < 8 && p.stage >= 4) return { phase: "C", ratio: 8, text: "Ready for a board of 8?" };
  const nx = order[i + 1];
  return nx && p.stage >= TOKEN_PHASES[nx].from ? { phase: nx, ratio: TOKEN_PHASES[nx].ratio, text: `Ready for "${TOKEN_PHASES[nx].label}"?` } : null;
}

// ---------- Calm activities during the sit (never scored) ----------
export const ACTIVITIES = { none: "Nothing (just the timer)", garden: "Breathing garden", pond: "Quiet pond", story: "Story page", photos: "Photo book", sound: "Sound pond (uses the microphone)" };
export function activitiesOffered(proto) {
  const p = protocolOf(proto), fav = ACTIVITIES[p.activity] ? p.activity : "none";
  const others = (p.activities || []).filter((a) => a !== fav && ACTIVITIES[a] && a !== "none");
  return [fav, ...(p.rotate && others.length ? [others[0]] : [])];
}

// ---------- The session planner (pure, replayable) ----------
// Plans the next session inside the guard rails. Same history in → same plan out.
// It never escalates to physical help, never advances a stage, and stops for a medical pause.
export function nextSession(events, proto, now = Date.now(), pause = null) {
  const p = protocolOf(proto), L = live(events).filter((e) => e.t <= now), reasons = [];
  const stage = stageProgress(L, p, now, pause);
  if (pause?.paused) return { paused: true, continue: false, reasons: ["Paused: " + (pause.reasons?.[0]?.label || "medical check")], reason: "Paused until the doctor check. Nothing adapts while paused.", stage };
  let interval = Math.min(120, Math.max(45, +p.intervalMin || 60)), prompt = Math.min(3, Math.max(1, +p.promptLevel || 1));
  let celebration = p.celebrate === "minimal" ? "calm" : "standard";
  const done = ended(L, p, now), last5 = done.slice(-5);
  const hard = last5.filter((s) => s.distress || s.escalated).length, nos = last5.filter((s) => s.refused).length;
  const safety = hard >= 2 || nos >= 3;
  if (safety) { interval += 15; celebration = "calm"; reasons.push(hard >= 2 ? `Hard moments in ${hard} of the last 5 tries: sits spaced out more.` : `${nos} "not now"s lately: sits spaced out more.`); }
  const dry = L.filter((e) => e.kind === "dry_check" && now - e.t < 7 * DAY);
  if (dry.length >= 5) {
    const rate = dry.filter((e) => e.data.dry !== false).length / dry.length;
    if (rate >= 0.9) { interval += 10; reasons.push(`Dry at ${Math.round(rate * 100)}% of checks: a little longer between sits.`); }
    else if (rate <= 0.5) { interval -= 10; reasons.push(`Dry at only ${Math.round(rate * 100)}% of checks: sits a little sooner.`); }
  }
  const r = signalRates(L, now, 7);
  if (r.support >= 3) {
    if (r.earlyRate >= 0.7) { interval += 10; prompt -= 1; reasons.push(`Told you first ${r.early} of ${r.support} times: trusting the telling, fewer planned sits.`); }
    else if (r.lateRate >= 0.5) { interval -= 10; reasons.push(`${r.late} of ${r.support} tellings came after a wet: sits a little sooner to catch it.`); }
  }
  const sat = done.filter((s) => s.sits).slice(-6);
  if (sat.length >= 6 && !safety) {
    const rate = sat.filter((s) => s.voids.length).length / sat.length;
    if (rate > 0.8) { prompt -= 1; reasons.push("Going well: one less reminder."); }
    else if (rate < 0.4 && prompt < 3) reasons.push("Few pees in the toilet lately. First try an easier stage, different sit times, or the sensory list. More prompting is your call.");
  }
  interval = Math.min(120, Math.max(45, interval)); prompt = Math.min(3, Math.max(1, prompt));
  const sitSec = Math.min(180, Math.max(30, Math.min(STAGES[stage.stage]?.sitSec ?? p.sitSec, sitLimits(p).cap)));
  const lastSit = Math.max(0, ...L.filter((e) => e.kind === "sit_start" || (e.kind === "step" && e.data.step === "sit")).map((e) => e.t));
  return { paused: false, continue: true, intervalMin: interval, sitSec, promptLevel: prompt, tokenPhase: p.tokenPhase, activities: activitiesOffered(p), celebration,
    stepBack: !!stage.stepBack, stage, nextAt: lastSit ? Math.max(now, lastSit + interval * MIN) : null, reasons, reason: reasons.join(" ") || "No change: things look steady." };
}

// ---------- Exports ----------
// Calendar file with one daily alarm per sit window (works on iPhone with no server).
export function ics(proto, child = "") {
  const p = protocolOf(proto);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const ymd = stamp.slice(0, 8);
  const ev = (p.sitWindows || []).map((hm, i) => {
    const [h, m] = String(hm).split(":"); const t = `${String(h).padStart(2, "0")}${String(m || "0").padStart(2, "0")}00`;
    return ["BEGIN:VEVENT", `UID:luminaac-potty-${i}-${hm.replace(":", "")}@luminaac`, `DTSTAMP:${stamp}`, `DTSTART:${ymd}T${t}`, "DURATION:PT10M", "RRULE:FREQ=DAILY",
      `SUMMARY:Toilet try${child ? " – " + esc1(child) : ""}`, "DESCRIPTION:Calm and short. A visit counts. Skip it if today is hard.", "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Toilet try", "TRIGGER:PT0M", "END:VALARM", "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LuminAAC//Potty Path//EN", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR", ""].join("\r\n");
}
const esc1 = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, " ").slice(0, 40);

// Compact form for QR handoff: short keys, no repeated field names.
export function pack(events) {
  return JSON.stringify(events.map((e) => [e.id, e.dev, e.seq, e.t, e.tz, e.by === "child" ? 1 : e.by === "system" ? 2 : 0, e.sessionId || 0, KINDS.indexOf(e.kind), e.data]));
}
export function unpack(s) {
  let a; try { a = JSON.parse(s); } catch { return []; }
  if (!Array.isArray(a)) return [];
  return a.map((r) => Array.isArray(r) && { id: String(r[0]), dev: String(r[1]), seq: +r[2] || 0, t: +r[3], tz: +r[4] || 0, by: ["caregiver", "child", "system"][r[5]] || "caregiver", ...(r[6] && { sessionId: String(r[6]) }), v: 1, kind: KINDS[r[7]], data: r[8] && typeof r[8] === "object" ? r[8] : {} }).filter(validEvent);
}

// Weekly summary for a caregiver (counts only; never a score).
export function weekSummary(events, proto, now = Date.now()) {
  const L = live(events), today = dayNow(now), wk = L.filter((e) => dayOf(e) > today - 7);
  const ss = sessions(L, proto, now).filter((s) => dayNow(s.start) > today - 7);
  const signals = wk.filter((e) => e.kind === "signal");
  const pees = wk.filter((e) => e.kind === "void");
  const precise = signals.filter((s) => pees.some((v) => v.t >= s.t && v.t - s.t <= 10 * MIN)).length;
  return {
    signals: signals.length, childStarted: ss.filter((s) => s.initiated).length, sessions: ss.length,
    toiletVoids: pees.length, wets: wk.filter((e) => e.kind === "wet").length, refusals: wk.filter((e) => e.kind === "refuse").length,
    distress: wk.filter((e) => e.kind === "distress").length, precision: signals.length ? Math.round((precise / signals.length) * 100) : null,
    modalities: Object.entries(signals.reduce((m, e) => ((m[e.data.modality || "other"] = (m[e.data.modality || "other"] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]),
  };
}

// ---------- Content shared by the Bridge, print-outs and the guide ----------
export const PHASES = [
  ["0", "Getting ready: medical check and sensory setup"], ["1", "Baseline: notice and log, no demands"], ["2", "Bathroom as a safe place: visits, no sitting needed"],
  ["3", "Short sits at the right times"], ["5", "Body noticing (calm moments only)"], ["6", "Poo track (often months behind, and that's okay)"],
  ["7", "Other bathrooms: school, family, out"], ["8", "Fading: fewer sits, more asking"],
];
// "What bothers your child?" Each yes adds its fix to the setup list.
export const SENSORY = [
  { code: "flush", label: "Flush noise", fix: "Flush after they leave. Sticky note over an auto-flush sensor. Flush is left out of the steps." },
  { code: "dryer", label: "Hand dryer", fix: "Use paper or their own towel." },
  { code: "seat", label: "Cold or too-big seat", fix: "Padded seat or a seat reducer." },
  { code: "feet", label: "Feet dangling", fix: "A step stool so feet are flat, knees above hips (this helps poos too)." },
  { code: "light", label: "Bright or flickering light", fix: "A lamp, a dimmer or daylight." },
  { code: "echo", label: "Echo", fix: "Towels and a bath mat soften it. Headphones help too." },
  { code: "smell", label: "Smells", fix: "Unscented soap and products." },
  { code: "splash", label: "Splash-back", fix: "A few sheets of paper in the bowl first." },
  { code: "water", label: "Water temperature", fix: "Set the tap before they wash." },
  { code: "clothes", label: "Tricky clothes", fix: "Elastic waists while learning." },
  { code: "space", label: "Open space below / wipe texture", fix: "Seat reducer; try different wipes." },
  { code: "people", label: "Who is there, door open or shut", fix: "Follow their preference." },
];
// Low-language scripts (say less, slowly; model on the talker as you speak).
export const SCRIPTS = {
  going: { title: "Going in", say: ['"Toilet time." (tap TOILET) Pause.', '"Bring [toy]." Walk alongside; don\'t pull.', 'If not: "Okay. Later." That counts as a no, and that\'s fine.'] },
  sitting: { title: "During the sit", say: ['Quiet. Sit beside them, not face to face.', '"Sitting." Offer the bathroom toy.', 'At the end: "All done." (tap ALL DONE) "Up."'] },
  void: { title: "After a pee or poo", say: ['Softly, during it: "Pee in toilet!"', 'Give the reward within a few seconds.', 'Then calm: "All done."'] },
  wet: { title: "Wet or missed", say: ['"Wet. Change." Neutral and brief.', 'No "uh oh", no disappointment, no clean-up as a consequence.', 'Model TOILET once. Move on.'] },
  refuse: { title: "Not now", say: ['"No toilet. Okay." (tap NO: you are honouring it)', '"Later." Log it and leave.', 'Two "not now"s means no more planned sits today.'] },
  distress: { title: "Early distress", say: ['Fewer words. "I\'m here."', 'Lower your body, give space. Stop the timer.', 'Offer the way out and the comfort item. No new asks.'] },
  escalation: { title: "A hard moment", say: ['Only "You\'re safe." Clear the space.', 'Don\'t touch unless there is danger. Wait.', 'After calm: "Done. Rest." No toilet tries for the rest of the day.'] },
};
export const NEVER = ["Make them drink extra to practise", "Hold them on the seat or block the door", "Repeat toilet walks or make them clean up after a wet (\"positive practice\")", "Take tokens or the talker away", "Lock the talker or favourite things behind a sit", "Film or photograph your child in the bathroom", "Use a ticking timer, streaks or \"big boy/girl\" talk", "Treat any way of asking as \"fake\""];
