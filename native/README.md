# LuminAAC native app (Capacitor)

This folder wraps the same web app (My Voice and the Bridge) in a native shell so that
**safe zones can keep working in the background**. The web version can't do that:
browsers stop location when the page is closed, hidden or the screen locks, and there is
no web geofencing API. Installing the PWA doesn't change that.

What the native build adds:

- Background location through [`@capacitor-community/background-geolocation`](https://github.com/capacitor-community/background-geolocation) (MIT).
  On Android it runs a foreground service with a visible notification; on iOS it needs
  "Always" location permission and the `location` background mode.
- `src/native-geofence.js`: runs the **same** zone logic as the web (`geo.js` `step()`,
  25 m hysteresis), sends the same "arrived" / "left" alerts, and sends the heartbeat
  that powers the server's quiet-device (dead-man) alert.
- Permission text for Android and iOS (`android/`, `ios/`).

Nothing about privacy changes: zones only work after a parent turns them on in the
Bridge, the device decides arrive/leave itself, and location goes only to the family's
own LuminAAC server, where exact positions on alerts are deleted after 24 hours.

## Build it

Capacitor 8: needs Node 22+, JDK 21 and Android Studio 2025.2.1+ (Android, minSdk 24,
target SDK 36) and/or Xcode 26+ (iOS 15+). Uses `@capacitor-community/background-geolocation`
1.3.1 or later (Capacitor 8 support; the background crash was fixed in Capacitor 8.5.3).

```bash
cd native
npm install
npm run add:android       # once: copies the web app, adds the Android project, adds permissions
npm run add:ios           # once, on a Mac
npm run sync              # after every web change
```

`native-config.mjs` adds the permissions and purpose strings for you (idempotent, runs
after every sync). The reference copies are in `config/`:

1. **Android:** location (fine, coarse, background), the location foreground service,
   notifications and microphone. Ask for "Allow all the time" from a screen that explains
   why; Google Play needs a prominent disclosure and a background-location declaration.
2. **iOS:** the location, microphone and camera purpose strings and the `location`
   background mode. App Review needs the purpose strings to match what the app does.
3. `npx cap open android` or `npx cap open ios`, then run it on a real phone.

CI (`.github/workflows/native.yml`) builds an unsigned Android debug APK on every push
that touches the app, and an iOS simulator build when run by hand. Nothing is signed or
published. The store steps are in `docs/STORE-CHECKLIST.md`.

Point the app at your backend with HTTPS in production (`allowMixedContent` is off).

## True OS geofencing (optional, lower battery)

Continuous background location is the simplest option that works on both platforms.
For lower battery use, swap it for OS region monitoring with a small custom plugin:

- **iOS:** `CLLocationManager.startMonitoring(for: CLCircularRegion)` — max 20 regions
  per app, minimum useful radius about 100 m, wakes the app on enter/exit even if it was
  terminated.
- **Android:** `GeofencingClient.addGeofences` with `GEOFENCE_TRANSITION_ENTER | EXIT`
  — max 100 geofences per app, delivered to a `BroadcastReceiver`; needs background
  location permission.

On each transition the plugin should call the same `/api/alerts` endpoint with the
device key (stored in the Keychain / EncryptedSharedPreferences), and keep sending
`/api/devices/heartbeat` at least every few minutes while sharing (WorkManager on
Android, significant-change location updates on iOS) so the dead-man check stays quiet.

## What still can't be promised

- Phones may delay or batch location to save battery (Doze, Low Power Mode).
- A phone that's off, out of battery or offline sends nothing. That's exactly what the
  server's quiet-device alert is for: it tells the family when check-ins stop.
