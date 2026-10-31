// Geofencing helpers. Runs only on the device, only after a parent turns it on.
// We compare each position with the caregiver's circles locally and send just
// the event ("left School") plus, if allowed, the position at that moment.
export function distance(a, b) { // metres, haversine
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// Zones come in three shapes:
//   circle  { lat, lng, r }                         (phase 3, typed or tapped)
//   poly    { shape: "poly", pts: [[lat, lng], ...] } (drawn by hand, stylus or point by point)
//   water   { water: true, features, buffer }        (danger buffer around nearby water)
// and two types: "safe" (arrive/leave notes) and "danger" (urgent alert on entry).
// zoneDistance() gives metres from the edge: negative inside, positive outside.
const RAD = Math.PI / 180, EARTH = 6371000;
function projector(ref) { // local equirectangular projection, accurate to well under 1% within a few km
  const kx = EARTH * RAD * Math.cos(ref.lat * RAD), ky = EARTH * RAD;
  return ([lat, lng]) => [(lng - ref.lng) * kx, (lat - ref.lat) * ky];
}
export function pointInRing(x, y, ring) { // even-odd rule, ring as projected [x, y]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// Metres from pos to a shape. kind "poly": 0 inside (holes are ignored on purpose:
// an island in a pond still counts as water). "line": a river centre line. "point": a mapped pool node.
export function distToShape(pos, kind, rings) {
  const P = projector(pos), x = 0, y = 0; let best = Infinity;
  for (const ring of rings) {
    const pr = ring.map(P);
    if (kind === "point" || pr.length === 1) { best = Math.min(best, Math.hypot(pr[0][0], pr[0][1])); continue; }
    if (kind === "poly" && pr.length > 2 && pointInRing(x, y, pr)) return 0;
    for (let i = 1; i < pr.length; i++) best = Math.min(best, segDist(x, y, pr[i - 1], pr[i]));
    if (kind === "poly" && pr.length > 2) best = Math.min(best, segDist(x, y, pr[pr.length - 1], pr[0]));
  }
  return best;
}
export function nearestWater(pos, features) {
  let best = { d: Infinity, f: null };
  for (const f of features || []) {
    if (f.ignored) continue;
    const d = distToShape(pos, f.kind, f.rings);
    if (d < best.d) best = { d, f };
  }
  return best;
}
export function zoneDistance(pos, z) {
  if (z.water) return nearestWater(pos, z.features).d - (z.buffer || 0);
  if (z.shape === "poly") { const d = distToShape(pos, "poly", [z.pts]); return d === 0 ? -1 : d - (z.buffer || 0); }
  return distance(pos, z) - z.r;
}
// Every zone the device should watch: the family's own zones plus, when turned on,
// one combined "water" danger zone (so a lake with three mapped parts gives one alert).
export function allZones(s) {
  if (!s) return [];
  const zones = [...(s.zones || [])];
  const w = s.water;
  if (w?.on && w.features?.some((f) => !f.ignored)) zones.push({ id: "water", name: "water", type: "danger", water: true, features: w.features, buffer: w.buffer ?? 30 });
  return zones;
}
// Hysteresis: you must be clearly inside (d < 0) to enter and clearly outside
// (d > margin) to leave, and fixes worse than the zone size are ignored (safe zones),
// so GPS jitter at the edge doesn't spam the family with alerts.
// Danger zones are stricter: a first fix inside one alerts at once, and a poor
// fix (worse than 150 m) is still used as long as its error circle could reach the danger.
export function step(zones, state, pos, margin = 25) {
  const events = [];
  for (const z of zones) {
    const danger = z.type === "danger";
    const size = z.r || 100;
    if (!danger && pos.acc && pos.acc > Math.max(size, 100)) continue;
    let d = zoneDistance(pos, z), was = state[z.id];
    if (danger && pos.acc > 150) { if (d - pos.acc > 0) continue; }
    const inside = d < 0 ? true : d > margin ? false : was;
    if (inside === undefined) continue;
    if (was === undefined && !(danger && inside)) { state[z.id] = inside; continue; } // first fix sets the baseline silently
    if (inside !== was) {
      state[z.id] = inside;
      const name = z.water ? (nearestWater(pos, z.features).f?.name || "water") : z.name;
      events.push({ kind: danger ? (inside ? "danger-enter" : "danger-leave") : (inside ? "zone-enter" : "zone-leave"), zone: { ...z, name, features: undefined }, water: !!z.water, d: Math.round(d) });
    }
  }
  return events;
}
// Words for an event, shared by My Voice, the native app and tests.
export function eventText(ev) {
  if (ev.kind === "danger-enter") return ev.water ? `Near water: ${ev.zone.name}` : `Entered danger area: ${ev.zone.name}`;
  if (ev.kind === "danger-leave") return ev.water ? `Moved away from water: ${ev.zone.name}` : `Left danger area: ${ev.zone.name}`;
  return `${ev.kind === "zone-enter" ? "Arrived at" : "Left"} ${ev.zone.name}`;
}
export function currentPosition(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }), () => resolve(null), { enableHighAccuracy: true, timeout, maximumAge: 30000 });
  });
}
export function watch(getZones, onEvent, onFix) {
  if (!navigator.geolocation) return null;
  const state = {};
  const id = navigator.geolocation.watchPosition((p) => {
    const pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) };
    onFix?.(pos);
    for (const ev of step(getZones(), state, pos)) onEvent(ev, pos);
  }, (err) => onFix?.(null, err), { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
  return { stop: () => navigator.geolocation.clearWatch(id), state };
}
export const mapLink = (l) => `https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=17/${l.lat}/${l.lng}`;
