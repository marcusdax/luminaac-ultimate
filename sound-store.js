// Sound Path storage (browser only). Practice events live under their own key on
// this device: no audio is ever recorded or stored, only "a try happened" and the
// grown-up's judgement. The plan (targets, rung) lives in the Bridge document
// (db.sound) so it reaches My Voice like every other setting.
import { makeEvent, merge, validEvent, DAY } from "./sound-core.js";

export const KEY = "luminaac:sound";
const chan = "BroadcastChannel" in self ? new BroadcastChannel("luminaac-sound") : null;
const blank = () => ({ version: 1, events: [] });
export function read() { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v?.version === 1 && Array.isArray(v.events)) return v; } catch {} return blank(); }
function write(s) {
  const cut = Date.now() - 365 * DAY;
  s.events = s.events.filter((e) => e.t >= cut).slice(-20000);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.warn("Sound Path: storage full", e); }
  chan?.postMessage({ t: Date.now() });
}
function deviceId() {
  let id = localStorage.getItem("luminaac:devid");
  if (!id) { id = (crypto.randomUUID?.() || "d" + Math.random().toString(36).slice(2)).slice(0, 36); localStorage.setItem("luminaac:devid", id); }
  return id;
}
export function record(kind, data = {}, o = {}) {
  const e = makeEvent(kind, data, { dev: deviceId(), by: o.by, t: o.t });
  const s = read(); s.events = merge(s.events, [e]); write(s);
  return e;
}
export function onChange(cb) { addEventListener("storage", (e) => { if (e.key === KEY) cb(); }); chan?.addEventListener("message", cb); }
export const events = () => read().events;
export function exportData() { return { kind: "luminaac-sound", exported: new Date().toISOString(), events: read().events }; }
export function importData(obj) {
  if (obj?.kind !== "luminaac-sound" || !Array.isArray(obj.events)) throw new Error("Not a Sound Path file");
  const s = read(); s.events = merge(s.events, obj.events.filter(validEvent)); write(s);
}
export function deleteAll() { localStorage.removeItem(KEY); chan?.postMessage({ t: Date.now() }); }
