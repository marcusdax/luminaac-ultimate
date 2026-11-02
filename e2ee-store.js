// This device's end-to-end encryption state. Kept in localStorage next to the family
// server key, never synced, never in backups or share links.
import * as E from "./e2ee-core.js";
import { api } from "./shared.js";
const KEY = "luminaac:e2ee";
export const get = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const put = (s) => localStorage.setItem(KEY, JSON.stringify(s));
export const on = () => !!get().key;
export const familyKey = () => get().key || "";
export async function device() { const s = get(); if (s.dev) return s.dev; s.dev = await E.newDeviceKeys(); put(s); return s.dev; }
export function turnOn() { const s = get(); s.key ||= E.newFamilyKey(); s.since ||= Date.now(); put(s); return s.key; }
export function forget() { const s = get(); delete s.key; delete s.pending; put(s); }
export const sealDoc = (doc) => E.sealDoc(familyKey(), doc);
export async function openDoc(wire) { if (!wire?.e2ee && !wire?.e2eeChild) return wire; if (!on()) return null; return E.openDoc(familyKey(), wire); }
export const sealText = (t) => (on() ? E.seal(familyKey(), t, "chat") : t);
export async function openText(t) { if (!E.isSealed(t)) return t; return on() ? E.open(familyKey(), t, "chat") : null; }
export const isSealed = E.isSealed;

// New device: ask for the key. Returns {id, code} where code is shown on this screen once the
// approver's public key is known; until then it shows this device's half.
export async function request(db, name) {
  const dev = await device();
  const { id } = await api(db, "POST", "/api/e2ee/requests", { pub: dev.pub, name });
  const s = get(); s.pending = { id, t: Date.now() }; put(s); return id;
}
// Poll once. Returns {done:true, code} after unwrapping, or {done:false}.
export async function check(db) {
  const s = get(); if (!s.pending) return { done: false };
  let g; try { g = (await api(db, "GET", `/api/e2ee/requests/${s.pending.id}`)).grant; } catch (e) { if (e.status === 404) { delete s.pending; put(s); } return { done: false, gone: e.status === 404 }; }
  if (!g) return { done: false };
  const k = await E.unwrapFrom(g.wrapped, s.dev, g.from, s.pending.id);
  if (!k) return { done: false, error: "The key couldn't be opened." };
  const code = await E.safetyCode(s.dev.pub, g.from);
  s.key = k; s.since = Date.now(); delete s.pending; s.lastCode = code; put(s);
  return { done: true, code };
}
// Approver side.
export const pending = (db) => api(db, "GET", "/api/e2ee/requests");
export async function codeFor(req) { return E.safetyCode((await device()).pub, req.pub); }
export async function approve(db, req) {
  const dev = await device();
  const wrapped = await E.wrapFor(familyKey(), dev, req.pub, req.id);
  await api(db, "PUT", `/api/e2ee/requests/${req.id}`, { wrapped, from: dev.pub });
}
export const decline = (db, req) => api(db, "DELETE", `/api/e2ee/requests/${req.id}`);
// A 6-digit code for one device's public key, shown on that device and next to its request,
// so the parent can check the request really came from the device in front of them.
export async function deviceCode(pub) { return E.safetyCode(pub || (await device()).pub, pub || (await device()).pub); }
