// Potty Path storage and sync (browser only). Toilet data is health data:
//  • It lives under its own key, "luminaac:potty", never inside the Bridge document,
//    so document sync and share links can't carry it and "Delete" removes one key.
//  • Writes are read → union by id → write, inside a Web Lock when the browser has
//    one, so My Voice and the Bridge open on the same device never lose each other's events.
//  • Photos (of objects only, never the child) go to their own IndexedDB.
//  • Sending events to the server is a separate opt-in, off by default, and can be
//    end-to-end encrypted with a key the server never sees.
import { makeEvent, merge, validEvent, pack, unpack, DAY } from "./potty-core.js";

export const KEY = "luminaac:potty";
const DEV = "luminaac:devid";
const chan = "BroadcastChannel" in self ? new BroadcastChannel("luminaac-potty") : null;

export function blank() {
  return { version: 1, profile: { screening: [], sensory: {}, reinforcers: [], knownSignals: [], consentBy: "", consentAt: 0, onboarded: false }, events: [], seq: 0, retainDays: 90, sync: { on: false, e2e: false, k: "", cursor: 0, last: 0, outbox: [] } };
}
export function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && v.version === 1) { const b = blank(); return { ...b, ...v, profile: { ...b.profile, ...v.profile }, sync: { ...b.sync, ...v.sync } }; } } catch {}
  return blank();
}
function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.warn("Potty Path: storage full", e); } }
export function deviceId() {
  let id = localStorage.getItem(DEV);
  if (!id) { id = (crypto.randomUUID?.() || "d" + Math.random().toString(36).slice(2)).slice(0, 36); localStorage.setItem(DEV, id); }
  return id;
}
const locked = (fn) => (navigator.locks?.request ? navigator.locks.request(KEY, fn) : Promise.resolve().then(fn));

// Read-modify-write under the lock; fn may change profile/sync and return events to add.
export function update(fn) {
  return locked(() => {
    const s = read();
    const add = fn(s) || [];
    if (add.length) s.events = merge(s.events, add);
    prune(s); write(s);
    chan?.postMessage({ t: Date.now() });
    return s;
  });
}
// Synchronous variant for the child surface, where a tap must feel instant. It
// still merges with whatever is stored at this moment, so nothing is lost.
export function updateNow(fn) {
  const s = read(); const add = fn(s) || [];
  if (add.length) s.events = merge(s.events, add);
  prune(s); write(s); chan?.postMessage({ t: Date.now() });
  return s;
}
function prune(s) {
  const cut = Date.now() - Math.max(28, s.retainDays || 90) * DAY; // hints need about 4 weeks
  if (s.events.length && s.events[0].t < cut) s.events = s.events.filter((e) => e.t >= cut || e.kind === "protocol_pause" || e.kind === "protocol_resume");
}

// Create and store one event. Returns the event.
export function record(kind, data = {}, o = {}) {
  let e;
  updateNow((s) => {
    s.seq = (s.seq || 0) + 1;
    e = makeEvent(kind, data, { dev: deviceId(), seq: s.seq, by: o.by || "caregiver", sessionId: o.sessionId, t: o.t });
    if (s.sync.on) s.sync.outbox = [...s.sync.outbox, e.id].slice(-5000);
    return [e];
  });
  scheduleFlush();
  return e;
}
export function onChange(cb) {
  addEventListener("storage", (e) => { if (e.key === KEY) cb(); });
  chan?.addEventListener("message", cb);
}

// ---------- Photos (objects only) ----------
function idb() {
  return new Promise((res, rej) => {
    if (!("indexedDB" in self)) return rej(new Error("no idb"));
    const r = indexedDB.open("luminaac-potty", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function putPhoto(id, blob) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction("photos", "readwrite"); tx.objectStore("photos").put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
export async function getPhoto(id) { const db = await idb(); return new Promise((res) => { const r = db.transaction("photos").objectStore("photos").get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); }
export async function delPhoto(id) { const db = await idb(); return new Promise((res) => { const tx = db.transaction("photos", "readwrite"); tx.objectStore("photos").delete(id); tx.oncomplete = res; }); }
// Square-crop and shrink a picked image so it fits a tile and stays small.
export async function squarePhoto(file, size = 480) {
  const img = await createImageBitmap(file);
  const s = Math.min(img.width, img.height), c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
}

// ---------- Export and delete ----------
export function exportData() { const s = read(); return { kind: "luminaac-potty", exported: new Date().toISOString(), profile: { ...s.profile, reinforcers: s.profile.reinforcers.map(({ photoKey, ...r }) => r) }, events: s.events }; }
export function importData(obj) {
  if (obj?.kind !== "luminaac-potty" || !Array.isArray(obj.events)) throw new Error("Not a Potty Path file");
  return update(() => obj.events.filter(validEvent));
}
export async function deleteAll(db) {
  const s = read();
  if (s.sync.on && db?.sync?.url && db?.sync?.key) await serverCall(db, "DELETE", "/api/potty/events").catch(() => {});
  localStorage.removeItem(KEY);
  await new Promise((res) => { try { const r = indexedDB.deleteDatabase("luminaac-potty"); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } });
  chan?.postMessage({ t: Date.now() });
}

// ---------- End-to-end encryption (AES-GCM-256) ----------
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
export function newKey() { return b64(crypto.getRandomValues(new Uint8Array(32))); }
const aes = (k) => crypto.subtle.importKey("raw", unb64(k), "AES-GCM", false, ["encrypt", "decrypt"]);
export async function seal(k, e) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(e.id) }, await aes(k), new TextEncoder().encode(JSON.stringify(e))));
  return { id: e.id, dev: e.dev, seq: e.seq, c: b64(new Uint8Array([...iv, ...ct])) };
}
export async function open(k, x) {
  try {
    const raw = unb64(x.c), key = await aes(k);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: new TextEncoder().encode(x.id) }, key, raw.slice(12));
    const e = JSON.parse(new TextDecoder().decode(pt));
    return validEvent(e) && e.id === x.id ? e : null;
  } catch { return null; }
}

// ---------- Server sync (opt-in) ----------
async function serverCall(db, method, path, body) {
  const r = await fetch(db.sync.url.replace(/\/+$/, "") + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${db.sync.key}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j.data;
}
let flushing = null, timer = 0, getDoc = null;
// The page tells the store where the server settings live (the shared Bridge document).
export function useServer(fn) {
  getDoc = fn;
  addEventListener("online", () => flush());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) flush(); });
  setInterval(() => flush(), 60e3);
}
function scheduleFlush() { clearTimeout(timer); timer = setTimeout(() => flush(), 800); }
export function flush() {
  const db = getDoc?.(), s = read();
  if (!s.sync.on || !db?.sync?.url || !db?.sync?.key || !navigator.onLine) return Promise.resolve({ skipped: true });
  return (flushing ||= (async () => {
    try {
      const st = read(), want = new Set(st.sync.outbox);
      const out = st.events.filter((e) => want.has(e.id));
      let sent = 0;
      for (let i = 0; i < out.length; i += 200) {
        const batch = out.slice(i, i + 200);
        const payload = st.sync.e2e && st.sync.k ? await Promise.all(batch.map((e) => seal(st.sync.k, e))) : batch;
        await serverCall(db, "POST", "/api/potty/events", { events: payload, sealed: !!(st.sync.e2e && st.sync.k) });
        sent += batch.length;
      }
      const got = await serverCall(db, "GET", `/api/potty/events?since=${st.sync.cursor || 0}`).catch((e) => { if (e.status === 403) return null; throw e; });
      let incoming = [];
      if (got) {
        for (const x of got.events || []) {
          if (x.c) { if (st.sync.k) { const e = await open(st.sync.k, x); if (e) incoming.push(e); } }
          else if (validEvent(x)) incoming.push(x);
        }
      }
      await update((s2) => {
        const done = new Set(out.map((e) => e.id));
        s2.sync.outbox = s2.sync.outbox.filter((id) => !done.has(id));
        if (got) s2.sync.cursor = Math.max(s2.sync.cursor || 0, got.cursor || 0);
        s2.sync.last = Date.now(); s2.sync.error = "";
        return incoming;
      });
      return { sent, received: incoming.length };
    } catch (e) {
      await update((s2) => { s2.sync.error = e.message; });
      return { error: e.message };
    } finally { flushing = null; }
  })());
}
// Turning sync on queues everything already on this device.
export function setSync(on, e2e, key) {
  return update((s) => {
    s.sync.on = !!on; s.sync.e2e = !!e2e;
    if (key !== undefined) s.sync.k = key;
    if (on) s.sync.outbox = s.events.map((e) => e.id); else s.sync.outbox = [];
  }).then(() => flush());
}

// ---------- QR handoff (no network) ----------
// Each code carries up to ~30 events: "LP1|<part>/<total>|<z or j>|<data>".
async function deflate(str) {
  if (!("CompressionStream" in self)) return null;
  const cs = new Blob([str]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return b64(new Uint8Array(await new Response(cs).arrayBuffer()));
}
async function inflate(s) {
  const ds = new Blob([unb64(s)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(ds).text();
}
export async function qrParts(events, per = 30) {
  const parts = [], total = Math.max(1, Math.ceil(events.length / per));
  for (let i = 0; i < total; i++) {
    const j = pack(events.slice(i * per, (i + 1) * per));
    const z = await deflate(j).catch(() => null);
    parts.push(z && z.length < j.length ? `LP1|${i + 1}/${total}|z|${z}` : `LP1|${i + 1}/${total}|j|${j}`);
  }
  return parts;
}
export async function readQrPart(text) {
  const m = /^LP1\|(\d+)\/(\d+)\|([zj])\|([\s\S]+)$/.exec(text || "");
  if (!m) return null;
  const json = m[3] === "z" ? await inflate(m[4]).catch(() => "") : m[4];
  return { part: +m[1], total: +m[2], events: unpack(json) };
}
