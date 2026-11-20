// Federated averaging with dropout-robust secure aggregation (see fl-core.js).
// The server never sees an individual update: it adds masked fixed-point vectors
// modulo 2^32 and, with Shamir shares revealed by the survivors, removes the
// self-masks and any pairwise masks left by clients who dropped out.
//
// Round phases (each with a timeout, FL_PHASE_MS, default 2 minutes):
//   joining   → clients join with an ECDH public key (until FL_ROUND_SIZE, or the
//               timeout with at least FL_QUORUM joined)
//   sharing   → each client posts its encrypted Shamir shares for every peer
//   masking   → clients fetch their shares and post masked updates
//   unmasking → survivors reveal seed shares (survivors) and key shares (dropped)
// A round with fewer than FL_QUORUM clients at any phase is abandoned: nothing applied.
// Privacy budget: zCDP ρ per device per round; joining is refused once ε would pass FL_EPSILON_CAP.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join as pjoin } from "node:path";
import { randomUUID } from "node:crypto";
import { DIR } from "./store.js";
import { DIM, FEATURES, zeros, decodeSum, addMod, CLIP, NOISE, combine, unmask, seedHex, rhoPerRound, epsilon, DELTA } from "../fl-core.js";

const F = pjoin(DIR, "_fl.json");
const SIZE = () => Math.max(2, Number(process.env.FL_ROUND_SIZE || 3));
export const QUORUM = () => Math.min(SIZE(), Math.max(2, Number(process.env.FL_QUORUM || Math.ceil((2 * SIZE()) / 3))));
const PHASE_MS = () => Number(process.env.FL_PHASE_MS || 120000);
export const CAP = () => Number(process.env.FL_EPSILON_CAP || 50);
let S;
function load() {
  if (S) return S;
  try { S = JSON.parse(readFileSync(F, "utf8")); } catch { S = null; }
  if (!S) S = { version: 0, weights: zeros(), history: [], round: null };
  S.budget ||= {};
  return S;
}
export function forget() { S = undefined; } // hosted mode: re-read after another instance changed the file
const save = () => { const t = F + ".tmp"; writeFileSync(t, JSON.stringify(S)); renameSync(t, F); };
const ids = (o) => Object.keys(o).map(Number);
function abandon(r, reason) {
  const s = load();
  s.history.push({ round: r.id, aborted: true, reason, t: Date.now(), joined: r.keys.length });
  s.history = s.history.slice(-100); s.round = null; save();
}
// Move a round forward on time or completeness. Returns the live round or null.
function advance() {
  const s = load(), r = s.round, now = Date.now();
  if (!r) return null;
  const late = now > r.phaseEnd, next = (state) => { r.state = state; r.phaseEnd = now + PHASE_MS(); };
  if (r.state === "joining" && (r.keys.length >= r.size || late)) {
    if (r.keys.length < r.quorum) { abandon(r, "not enough clients joined"); return null; }
    next("sharing");
  }
  if (r.state === "sharing" && (ids(r.shares).length === r.keys.length || now > r.phaseEnd)) {
    r.roster = r.keys.filter((k) => r.shares[k.client]);
    if (r.roster.length < r.quorum) { abandon(r, "too many clients dropped before sharing"); return null; }
    next("masking");
  }
  if (r.state === "masking" && (ids(r.updates).length === r.roster.length || now > r.phaseEnd)) {
    r.survivors = ids(r.updates).sort((a, b) => a - b);
    r.dropped = r.roster.map((k) => k.client).filter((c) => !r.updates[c]);
    if (r.survivors.length < r.quorum) { abandon(r, "too many clients dropped before sending"); return null; }
    next("unmasking");
  }
  if (r.state === "unmasking" && now > r.phaseEnd && ids(r.reveals).length < r.t) { abandon(r, "not enough clients helped unmask"); return null; }
  save();
  return r;
}
function round() {
  const s = load();
  if (!advance()) {
    s.round = { id: randomUUID(), size: SIZE(), quorum: QUORUM(), t: QUORUM(), created: Date.now(), phaseEnd: Date.now() + PHASE_MS(), state: "joining", base: s.version, keys: [], who: {}, shares: {}, roster: null, updates: {}, survivors: [], dropped: [], reveals: {} };
    save();
  }
  return s.round;
}
const pub = (r) => ({ id: r.id, state: r.state, size: r.size, quorum: r.quorum, threshold: r.t, joined: r.keys.length, shared: ids(r.shares).length, submitted: ids(r.updates).length, base: r.base, phaseEndsIn: Math.max(0, r.phaseEnd - Date.now()) });
const get = (id) => { const r = advance(); return r && r.id === id ? r : null; };
const gone = () => ({ error: "Round ended (timed out or abandoned). Nothing from it was applied. Join a new round.", status: 410 });
const mine = (r, client, principal) => Number.isInteger(client) && r.who[client] === principal;

export function budget(principal) {
  const b = load().budget[principal] || { rho: 0, rounds: 0 };
  return { rounds: b.rounds, rho: +b.rho.toFixed(4), epsilon: +epsilon(b.rho).toFixed(3), delta: DELTA, cap: CAP(), nextRoundEpsilon: +epsilon(b.rho + rhoPerRound(QUORUM())).toFixed(3) };
}
export function model() { const s = load(); return { version: s.version, weights: s.weights, dim: DIM, features: FEATURES, clip: CLIP, noise: NOISE, quorum: QUORUM(), roundSize: SIZE(), epsilonCap: CAP(), history: s.history.slice(-20) }; }
export const current = () => pub(round());
export function join(publicKey, principal) {
  if (typeof publicKey !== "string" || publicKey.length < 40 || publicKey.length > 200) return { error: "publicKey (base64url P-256 raw) is required" };
  const b = budget(principal);
  if (b.nextRoundEpsilon > b.cap) return { error: `This device has used its privacy budget (ε ${b.epsilon} of ${b.cap}). It can keep learning on its own, but won't send more updates.`, status: 403, budget: b };
  let r = round();
  if (r.state !== "joining") return { error: "A round is in progress, try again shortly", status: 409 };
  if (Object.values(r.who).includes(principal)) return { error: "Already in this round", status: 409 };
  const client = r.keys.length;
  r.keys.push({ client, publicKey }); r.who[client] = principal; save();
  advance();
  return { round: r.id, client, size: r.size, quorum: r.quorum, base: r.base };
}
export function peers(id) {
  const r = get(id); if (!r) return gone();
  if (r.state === "joining") return { waiting: Math.max(1, r.size - r.keys.length), phaseEndsIn: r.phaseEnd - Date.now() };
  return { peers: r.keys, threshold: r.t, state: r.state };
}
export function postShares(id, client, shares, principal) {
  const r = get(id); if (!r) return gone();
  if (r.state !== "sharing") return { error: `Round is ${r.state}`, status: 409 };
  if (!mine(r, client, principal)) return { error: "Unknown client", status: 403 };
  if (r.shares[client]) return { error: "Already shared", status: 409 };
  if (!shares || typeof shares !== "object" || !r.keys.every((k) => typeof shares[k.client] === "string" && shares[k.client].length < 2000)) return { error: "One encrypted share per peer is required" };
  r.shares[client] = Object.fromEntries(r.keys.map((k) => [k.client, shares[k.client]])); save(); advance();
  return { ok: true };
}
export function inbox(id, client, principal) {
  const r = get(id); if (!r) return gone();
  if (!mine(r, client, principal)) return { error: "Unknown client", status: 403 };
  if (r.state === "joining" || r.state === "sharing") return { waiting: true, phaseEndsIn: r.phaseEnd - Date.now() };
  if (!r.roster.some((k) => k.client === client)) return { error: "You dropped out of this round", status: 410 };
  return { roster: r.roster, threshold: r.t, shares: Object.fromEntries(r.roster.map((k) => [k.client, r.shares[k.client][client]])) };
}
export function submit(id, client, masked, principal) {
  const r = get(id); if (!r) return gone();
  if (r.state !== "masking") return { error: r.state === "unmasking" ? "Too late: this round has closed for updates" : `Round is ${r.state}`, status: 409 };
  if (!mine(r, client, principal) || !r.roster.some((k) => k.client === client)) return { error: "Unknown client", status: 403 };
  if (!Array.isArray(masked) || masked.length !== DIM || !masked.every((x) => Number.isInteger(x) && x >= 0 && x < 2 ** 32)) return { error: `masked must be ${DIM} uint32 values` };
  if (r.updates[client]) return { error: "Already submitted", status: 409 };
  r.updates[client] = masked; save(); advance();
  return { accepted: true, state: r.state };
}
export function unmaskRequest(id) {
  const s = load(); const done = s.history.find((h) => h.round === id);
  if (done) return done.aborted ? gone() : { done: true, version: done.version };
  const r = get(id); if (!r) return gone();
  if (r.state !== "unmasking") return { waiting: true, state: r.state, phaseEndsIn: r.phaseEnd - Date.now() };
  return { survivors: r.survivors, dropped: r.dropped };
}
export async function reveal(id, client, out, principal) {
  const s = load(), r = get(id); if (!r) return gone();
  if (r.state !== "unmasking") return { error: `Round is ${r.state}`, status: 409 };
  if (!mine(r, client, principal) || !r.survivors.includes(client)) return { error: "Only clients who sent an update can help unmask", status: 403 };
  const okShare = (v) => v && Number.isInteger(v.x) && typeof v.y === "string" && /^[0-9a-f]{1,140}$/.test(v.y);
  if (!out || !r.survivors.every((c) => okShare(out.seeds?.[c])) || !r.dropped.every((c) => okShare(out.keys?.[c]))) return { error: "Shares for every survivor's seed and every dropped client's key are required" };
  if (Object.keys(out.keys || {}).some((c) => r.survivors.includes(+c))) return { error: "Never send key shares of a survivor" };
  r.reveals[client] = { seeds: out.seeds, keys: out.keys }; save();
  if (ids(r.reveals).length < r.t || r.finishing) return { done: false, waiting: Math.max(0, r.t - ids(r.reveals).length) };
  r.finishing = true; // one finisher only; others poll /unmask for the result
  // Reconstruct, strip masks, average, step.
  const R = Object.values(r.reveals).slice(0, r.t);
  const seeds = Object.fromEntries(r.survivors.map((c) => [c, seedHex(combine(R.map((x) => x.seeds[c])))]));
  const dKeys = Object.fromEntries(r.dropped.map((c) => [c, seedHex(combine(R.map((x) => x.keys[c])))]));
  let sum = r.survivors.reduce((a, c) => addMod(a, r.updates[c]), new Array(DIM).fill(0));
  try { sum = await unmask(sum, { roster: r.roster, survivors: r.survivors, dropped: r.dropped, seeds, dKeys, round: r.id }); }
  catch (e) { abandon(r, "unmasking failed: " + e.message); return { error: "Unmasking failed; the round was abandoned", status: 500 }; }
  const avg = decodeSum(sum, r.survivors.length);
  if (avg.some((x) => !Number.isFinite(x) || Math.abs(x) > 10)) { abandon(r, "unmasked sum out of range (bad shares?)"); return { error: "Unmasking produced an invalid sum; the round was abandoned", status: 500 }; }
  s.weights = s.weights.map((w, i) => +(w + avg[i]).toFixed(6));
  s.version += 1;
  const rho = rhoPerRound(r.survivors.length);
  for (const c of r.survivors) { const p = r.who[c]; const b = (s.budget[p] ||= { rho: 0, rounds: 0 }); b.rho += rho; b.rounds += 1; }
  s.history.push({ round: r.id, version: s.version, clients: r.survivors.length, dropped: r.dropped.length, t: Date.now(), norm: +Math.hypot(...avg).toFixed(4), epsilonPerRound: +epsilon(rho).toFixed(3) });
  s.history = s.history.slice(-100); s.round = null; save();
  return { done: true, version: s.version, dropped: r.dropped.length };
}
export function reset() { S = { version: 0, weights: zeros(), history: [], round: null, budget: {} }; save(); }
