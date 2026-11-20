// Accounts, sessions, roles, family/child profiles, paired devices.
// Optional layer: the app keeps working in local-only mode and with a bare
// family key. Passwords use scrypt (N=16384, r=8, p=1, 64-byte key, 16-byte salt).
// Session tokens, device keys and invite codes are stored only as SHA-256 hashes.
import { scryptSync, randomBytes, timingSafeEqual, createHash, randomUUID, randomInt } from "node:crypto";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { DIR, fid } from "./store.js";

const F = join(DIR, "_accounts.json");
const h = (s) => createHash("sha256").update(String(s)).digest("hex");
let A;
function load() {
  if (A) return A;
  try { A = JSON.parse(readFileSync(F, "utf8")); } catch { A = {}; }
  return (A = { users: {}, sessions: {}, families: {}, devices: {}, pairings: {}, invites: {}, challenges: {}, tokens: {}, ...A });
}
export function save() { const tmp = F + ".tmp"; writeFileSync(tmp, JSON.stringify(A)); renameSync(tmp, F); }
export const db = () => load();
export function forget() { A = undefined; } // hosted mode: re-read after another instance changed the file

export const ROLES = ["parent", "teacher", "therapist", "family"];
export const SESSION_DAYS = 30;

export function hashPassword(pw, salt = randomBytes(16)) {
  return { salt: salt.toString("hex"), hash: scryptSync(String(pw).normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex") };
}
export function checkPassword(pw, u) {
  const { hash } = hashPassword(pw, Buffer.from(u.salt, "hex"));
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(u.hash, "hex"));
}
export const normEmail = (e) => String(e || "").trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

export function createFamily({ name, child, familyKey }) {
  const d = load();
  const id = familyKey ? fid(familyKey) : fid(randomBytes(32).toString("hex"));
  d.families[id] = d.families[id] || { id, name: String(name || "Our family").slice(0, 80), children: [], created: Date.now() };
  if (child) d.families[id].children.push({ id: randomUUID(), name: String(child).slice(0, 60), created: Date.now() });
  return d.families[id];
}
export function createUser({ email, password, name }) {
  const d = load();
  const u = { id: randomUUID(), email, name: String(name || "").slice(0, 80), ...hashPassword(password), memberships: [], passkeys: [], created: Date.now() };
  d.users[email] = u;
  return u;
}
export const userById = (id) => Object.values(load().users).find((u) => u.id === id);

export function newSession(u, family) {
  const token = randomBytes(32).toString("base64url");
  load().sessions[h(token)] = { uid: u.id, family, exp: Date.now() + SESSION_DAYS * 864e5, created: Date.now() };
  return token;
}
export function session(token) {
  const d = load(), s = d.sessions[h(token)];
  if (!s) return null;
  if (s.exp < Date.now()) { delete d.sessions[h(token)]; return null; }
  return s;
}
export function endSession(token) { delete load().sessions[h(token)]; }
export function endAllSessions(uid) { const d = load(); for (const [k, s] of Object.entries(d.sessions)) if (s.uid === uid) delete d.sessions[k]; }

// ----- Invites (parent invites teacher/therapist/family with a role) -----
export function newInvite(family, role, by) {
  const code = randomBytes(9).toString("base64url");
  load().invites[h(code)] = { family, role, by, exp: Date.now() + 7 * 864e5 };
  return code;
}
export function takeInvite(code) {
  const d = load(), k = h(code), inv = d.invites[k];
  if (!inv || inv.exp < Date.now()) return null;
  delete d.invites[k];
  return inv;
}

// ----- Device pairing: QR + short code -----
// A signed-in parent (or family-key holder) opens a pairing window. The new
// device claims it with the 6-digit code (or the QR, which carries the same
// code plus the server address). The device gets its own key; it is shown
// once, stored as a hash, scoped to that device, and can be revoked.
export const DEVICE_SCOPES = {
  myvoice: ["sync:child", "alerts:write", "location:write", "fl:write", "potty:read", "potty:write"],
  bridge: ["sync:read", "sync:write", "alerts:read", "alerts:write", "share", "devices", "fl:write", "potty:read", "potty:write"],
};
export function openPairing(family, kind, by) {
  const d = load();
  for (const [k, p] of Object.entries(d.pairings)) if (p.exp < Date.now()) delete d.pairings[k];
  let code; do code = String(randomInt(0, 1e6)).padStart(6, "0"); while (d.pairings[code]);
  d.pairings[code] = { family, kind: DEVICE_SCOPES[kind] ? kind : "myvoice", by, exp: Date.now() + 10 * 60e3, tries: 0 };
  return { code, kind: d.pairings[code].kind, expires: d.pairings[code].exp };
}
export function claimPairing(code, name) {
  const d = load(), p = d.pairings[code];
  if (!p || p.exp < Date.now()) return null;
  delete d.pairings[code]; // single use
  const id = randomUUID(), secret = randomBytes(32).toString("base64url");
  d.devices[id] = { id, family: p.family, kind: p.kind, name: String(name || "New device").slice(0, 60), keyHash: h(secret), created: Date.now(), lastSeen: Date.now(), revoked: false };
  return { deviceId: id, deviceKey: `${id}.${secret}`, kind: p.kind, family: p.family };
}
export function device(token) {
  const [id, secret] = String(token).split(".");
  const dv = load().devices[id];
  if (!dv || dv.revoked || !secret) return null;
  const a = Buffer.from(dv.keyHash, "hex"), b = Buffer.from(h(secret), "hex");
  if (!timingSafeEqual(a, b)) return null;
  dv.lastSeen = Date.now();
  return dv;
}
export const devicesOf = (family) => Object.values(load().devices).filter((x) => x.family === family).map(({ keyHash, ...rest }) => rest);

// ----- WebAuthn challenges (5 minutes, single use) -----
export function newChallenge(purpose, extra = {}) {
  const c = randomBytes(32).toString("base64url");
  load().challenges[c] = { purpose, exp: Date.now() + 5 * 60e3, ...extra };
  return c;
}
export function takeChallenge(c, purpose) {
  const d = load(), x = d.challenges[c];
  delete d.challenges[c];
  return x && x.purpose === purpose && x.exp > Date.now() ? x : null;
}

// ---- Email verification and password reset tokens ----
// Single-use, time-limited, stored only as SHA-256 hashes. Issuing a new token
// for the same purpose replaces the old one, so only the newest link works.
export const TOKEN_TTL = { verify: 24 * 3600e3, reset: 30 * 60e3 };
export function issueToken(u, purpose) {
  const d = load(); const now = Date.now();
  for (const [k, t] of Object.entries(d.tokens)) if ((t.uid === u.id && t.purpose === purpose) || t.exp < now) delete d.tokens[k];
  const token = randomBytes(32).toString("base64url");
  d.tokens[h(token)] = { uid: u.id, purpose, exp: now + TOKEN_TTL[purpose], created: now };
  return token;
}
export function takeToken(token, purpose) {
  const d = load(), k = h(token), t = d.tokens[k];
  if (!t || t.purpose !== purpose) return null;
  delete d.tokens[k]; // single use, even when expired
  return t.exp < Date.now() ? null : userById(t.uid);
}
export function setPassword(u, pw) { Object.assign(u, hashPassword(pw)); u.passwordChanged = Date.now(); }
