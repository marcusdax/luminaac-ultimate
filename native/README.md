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

Needs Node 20+, Android Studio (Android) and/or Xcode 15+ (iOS).

```bash
cd native
npm install
npm run copy-web          # copies the web app into native/www
npx cap add android       # once
npx cap add ios           # once (macOS)
```

Then:

1. **Android:** merge `android/AndroidManifest.permissions.xml` into
   `android/app/src/main/AndroidManifest.xml`. Ask for "Allow all the time" location
   from a screen that explains why (Google Play requires a prominent disclosure and a
   background-location declaration in Play Console).
2. **iOS:** add the keys in `ios/Info.plist.additions.xml` to `ios/App/App/Info.plist`,
   and turn on Background Modes → Location updates in Xcode. App Review needs the
   purpose strings to match what the app does.
3. `npm run sync`, then `npx cap open android` or `npx cap open ios` and run it.

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
