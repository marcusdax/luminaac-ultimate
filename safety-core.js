// Safety Links core (docs/SOUND-PATH.md §5): pure rules shared by the family
// server, the Bridge and the tests. No DOM, no storage, no network.
//
// - What a sensor or wearable sent (`hookEvent`), and how loud it should be.
// - Context rules: "door opened and nobody said we're going out together".
//   Simple, explainable rules like Potty Path's guard rails, never AI.
// - Bluetooth "is he near?" from signal strength (Android/Chrome only).
// - Research mode: a caregiver-only "calm check?" nudge from a wristband's
//   heart rate. Off unless a parent gives a separate consent for that sensor.
// - The "if found" page: only the fields a caregiver chose, never a location.

const MIN = 60e3;

// Structured events a hub or wearable can send as { "event": "door_open" }.
// Plain { "message": "..." } still works for anything else.
export const HOOK_EVENTS = {
  door_open: { says: "door opened", urgent: true, rule: "exit" },
  gate_open: { says: "gate opened", urgent: true, rule: "exit" },
  window_open: { says: "window opened", urgent: false, rule: "exit" },
  pool_motion: { says: "movement at the pool", urgent: true, always: true },
  wearable_sos: { says: "SOS pressed on the tracker", urgent: true, always: true },
  wearable_left_zone: { says: "tracker left a safe area", urgent: true },
  seizure_alert: { says: "seizure alert from the wristband", urgent: true, always: true },
  location: { says: "location update", urgent: false },
  arousal: { says: "heart rate reading", urgent: false, research: true },
};
const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const num = (v) => (v === "" || v == null ? NaN : Number(v));

// Normalise a webhook body. Accepts IFTTT (value1), Home Assistant (state), our own
// { event, message, lat, lng, acc, hr }, or a ?message= query. Unknown events are
// treated as a plain message, so a typo still reaches the family.
export function hookEvent(body = {}, sensor = {}) {
  const ev = HOOK_EVENTS[body.event] ? body.event : null, def = ev ? HOOK_EVENTS[ev] : null;
  const said = clip(body.message ?? body.value1 ?? body.state, 140);
  const lat = num(body.lat), lng = num(body.lng);
  const loc = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat: +lat.toFixed(5), lng: +lng.toFixed(5), acc: Math.min(Math.round(num(body.acc) || 0), 100000) } : null;
  const hr = num(body.hr ?? body.heart_rate);
  return {
    event: ev, said, loc,
    hr: Number.isFinite(hr) && hr > 20 && hr < 250 ? Math.round(hr) : null,
    urgent: def ? (def.always || (def.urgent && sensor.urgent !== false)) : !!sensor.urgent,
    rule: def?.rule || (["door", "gate", "window"].includes(sensor.kind) && !ev ? "exit" : null),
    research: !!def?.research,
    message: `${sensor.name || "Sensor"}: ${said || def?.says || ({ door: "door opened", gate: "gate opened", window: "window opened", pool: "pool alarm", motion: "movement seen", bed: "out of bed", wearable: "tracker alert" })[sensor.kind] || "triggered"}`,
  };
}

// "Door opened" → how worried should we be? `out` is the time until which a grown-up
// said "we're going out together"; `tablet` is the child's device's last two
// location check-ins ({ t, lat, lng } each), if it shares location.
export function exitRule({ out = 0, tablet = null, quietFrom = null } = {}, now = Date.now()) {
  if (out > now) return { urgent: false, why: `A grown-up said you're out together (until ${new Date(out).toTimeString().slice(0, 5)}).` };
  const why = ["Nobody marked \"going out together\"."];
  if (tablet?.last && now - tablet.last.t < 20 * MIN) {
    const moved = tablet.prev ? metres(tablet.prev, tablet.last) : 0;
    why.push(moved < 50 ? "Their tablet hasn't moved, so they may have left without it." : "Their tablet is moving.");
  } else if (tablet) why.push("Their tablet hasn't checked in recently.");
  if (quietFrom != null) why.push("It's night time.");
  return { urgent: true, why: why.join(" ") };
}
export function metres(a, b) {
  const R = 6371e3, r = (d) => (d * Math.PI) / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- Bluetooth "is he near?" ----------
// RSSI samples ({ t, rssi }) from a paired tag. Median of the last 15 seconds, so
// one bad reading doesn't flip the state. Bluetooth is a backup sensor only.
export function bleState(samples = [], now = Date.now(), { near = -70, far = -88, lostAfter = 30e3 } = {}) {
  const recent = samples.filter((s) => now - s.t <= 15e3 && Number.isFinite(s.rssi)).map((s) => s.rssi).sort((a, b) => a - b);
  const last = samples.reduce((m, s) => Math.max(m, s.t), 0);
  if (!last || now - last > lostAfter) return { state: "lost", rssi: null };
  if (!recent.length) return { state: "far", rssi: null };
  const mid = recent[Math.floor(recent.length / 2)];
  return { state: mid >= near ? "near" : mid >= far ? "nearby" : "far", rssi: mid };
}

// ---------- Research mode: "calm check?" ----------
// Wristband studies predicted agitation 1–3 minutes ahead (AUROC about 0.8) with
// research-grade sensors. Prediction is not proof that a nudge helps, so this is
// a quiet suggestion to the grown-up, never shown to the child, never a label.
// Rule: heart rate above the person's own resting level by `rise` for `hold` minutes
// while the band says they're not moving much. At most one nudge per 30 minutes.
export function calmCheck(samples = [], { rest = null, rise = 25, hold = 3, lastNudge = 0 } = {}, now = Date.now()) {
  const s = samples.filter((x) => Number.isFinite(x.hr) && now - x.t <= 60 * MIN).sort((a, b) => a.t - b.t);
  if (s.length < 5) return { nudge: false, why: "Not enough readings yet." };
  const base = rest ?? median(s.map((x) => x.hr).slice(0, Math.max(5, Math.floor(s.length / 2))));
  const win = s.filter((x) => now - x.t <= hold * MIN);
  if (win.length < 3 || win[0].t > now - hold * MIN + MIN) return { nudge: false, base, why: "Watching." };
  const high = win.every((x) => x.hr >= base + rise && !(x.moving));
  if (!high) return { nudge: false, base, why: "Within their usual range, or moving about." };
  if (now - lastNudge < 30 * MIN) return { nudge: false, base, why: "Already suggested a calm check recently." };
  return { nudge: true, base, why: `Heart rate has been ${rise}+ above their usual (${Math.round(base)}) for ${hold} minutes while still. A calm check might help. This is a research feature and can be wrong.` };
}
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

// ---------- "If found" page ----------
// Only what the caregiver chose. Never an address, a location or history.
export const FOUND_FIELDS = ["name", "speaks", "approach", "calms", "medical", "phone", "phone2"];
export function foundView(f = {}) {
  const out = { name: clip(f.name, 40) || "This child", speaks: clip(f.speaks, 160) || "I don't speak. I use a tablet to talk." };
  for (const k of ["approach", "calms", "medical"]) if (clip(f[k], 300)) out[k] = clip(f[k], 300);
  for (const k of ["phone", "phone2"]) { const p = clip(f[k], 24).replace(/[^\d+()\- ]/g, ""); if (p.replace(/\D/g, "").length >= 6) out[k] = p; }
  if (f.photo && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f.photo) && f.photo.length < 200e3) out.photo = f.photo;
  return out;
}

// Trackers whose battery reminder is due within `days`.
export function batteryDue(trackers = [], now = Date.now(), days = 7) {
  return trackers.filter((x) => x.battery && Date.parse(x.battery) - now < days * 24 * 60 * MIN).map((x) => ({ ...x, overdue: Date.parse(x.battery) < now }));
}
