// Native background location for the Capacitor build (does nothing on the web).
// Uses @capacitor-community/background-geolocation, which keeps receiving positions
// while the app is in the background (Android: a foreground service with a visible
// notification; iOS: "Always" permission and the location background mode).
// The same zone logic as the web (geo.js step()) decides arrive/leave, and the same
// heartbeat feeds the server's dead-man check. Location never goes anywhere except
// the family's own LuminAAC server, and only after a parent has turned on safe zones.
import { step } from "./geo.js";
import { load, raiseAlert, api } from "./shared.js";

const Cap = window.Capacitor;
if (Cap?.isNativePlatform?.()) start();

async function start() {
  const { registerPlugin } = Cap;
  const BG = registerPlugin("BackgroundGeolocation");
  const state = {}; let watcherId = null, lastBeat = 0;
  async function sync() {
    const s = load().safety;
    const want = s?.consent && s.watch !== false && s.zones?.length;
    if (want && !watcherId) {
      watcherId = await BG.addWatcher({
        backgroundTitle: "LuminAAC safe zones are on",
        backgroundMessage: "Your family gets a note when you arrive or leave a safe place.",
        requestPermissions: true, stale: false, distanceFilter: 25,
      }, (loc, err) => {
        if (err) { if (err.code === "NOT_AUTHORIZED") console.warn("Location permission is off"); return; }
        const pos = { lat: loc.latitude, lng: loc.longitude, acc: Math.round(loc.accuracy) };
        for (const ev of step(load().safety?.zones || [], state, pos)) {
          raiseAlert(ev.kind, `${ev.kind === "zone-enter" ? "Arrived at" : "Left"} ${ev.zone.name}`, { zone: ev.zone.name, ...(load().safety.sendLocation && { loc: pos }) });
        }
        if (Date.now() - lastBeat > 4 * 60e3) { lastBeat = Date.now(); beat(pos); }
      });
    } else if (!want && watcherId) { await BG.removeWatcher({ id: watcherId }); watcherId = null; beat(null, false); }
  }
  async function beat(pos, sharing = true) {
    const d = load(); if (!d.device || !d.sync?.key) return;
    try { await api(d, "POST", "/api/devices/heartbeat", { sharing: sharing && !!d.safety?.sendLocation, ...(pos && { loc: pos }) }); } catch { /* offline: the server's dead-man check will notice */ }
  }
  window.addEventListener("storage", sync);
  setInterval(sync, 30000);
  sync();
}
