// Geofencing helpers. Runs only on the device, only after a parent turns it on.
// We compare each position with the caregiver's circles locally and send just
// the event ("left School") plus, if allowed, the position at that moment.
export function distance(a, b) { // metres, haversine
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// Hysteresis: you must be clearly inside (d < r) to enter and clearly outside
// (d > r + margin) to leave, and fixes worse than the zone size are ignored,
// so GPS jitter at the edge doesn't spam the family with alerts.
export function step(zones, state, pos, margin = 25) {
  const events = [];
  for (const z of zones) {
    if (pos.acc && pos.acc > Math.max(z.r, 100)) continue;
    const d = distance(pos, z), was = state[z.id];
    const inside = d < z.r ? true : d > z.r + margin ? false : was;
    if (inside === undefined) continue;
    if (was === undefined) { state[z.id] = inside; continue; } // first fix sets the baseline silently
    if (inside !== was) { state[z.id] = inside; events.push({ kind: inside ? "zone-enter" : "zone-leave", zone: z, d: Math.round(d) }); }
  }
  return events;
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
