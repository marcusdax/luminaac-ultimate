# App store checklist (not started)

LuminAAC has **not** been submitted to any store. This is the list of what a person has to
do, in order, with their own developer accounts. The code side (native shell, permissions,
CI builds) is in `native/` and `.github/workflows/native.yml`.

## Accounts (needs you)

- [ ] **Apple Developer Program** (US$99 a year) in the name of the person or organisation that will own the app. An organisation needs a D-U-N-S number.
- [ ] **Google Play Console** (one-time US$25). New personal accounts must run a closed test with at least 12 testers for 14 days before production.
- [ ] Decide the owner of the bundle id `org.luminaac.app` (change it in `native/capacitor.config.json` before the first upload; it can't change later).

## Both stores

- [ ] Privacy policy at a public URL (start from `PRIVACY.md`), and a support URL or email.
- [ ] Children: LuminAAC is used by children but set up by parents. Apple: choose the Kids category only if you accept its rules (no third-party analytics or ads, parental gate before links out); otherwise list it under Medical or Education with "made for parents". Google: complete the Target audience and content form; if children are in the audience, the Families policy applies.
- [ ] Data safety (Google) and App Privacy "nutrition label" (Apple): location (optional, sent only to the family's own server), audio (processed on device, not collected), photos (on device), contact info (account email, only if they sign up). No tracking, no ads, no selling.
- [ ] Screenshots: phone and tablet, from `screenshots/` re-taken on real devices.
- [ ] Accessibility: test with VoiceOver and TalkBack, switch access, large text.
- [ ] Medical claims: describe it as a communication and family tool. Don't claim it diagnoses or treats anything.

## Android

- [ ] Upload key and Play App Signing. Build a signed **AAB** (`./gradlew bundleRelease`) with the key kept out of the repo.
- [ ] Background location declaration in Play Console, with a short video showing the in-app disclosure and the "Allow all the time" prompt.
- [ ] Foreground service type `location` declaration (Android 14+), explaining the visible notification.
- [ ] Target SDK 36 (already set by Capacitor 8).

## iOS

- [ ] Signing certificate and provisioning profile in Xcode (automatic signing is fine).
- [ ] Purpose strings match what the app does (added by `native/native-config.mjs`).
- [ ] Background Modes: Location updates. Explain the "Always" use in the review notes, with a demo family account and a test safe place.
- [ ] Push: add the Push Notifications capability if you want native push (the web push in the Bridge works in Safari 16.4+ for Home Screen apps without this).
- [ ] TestFlight with a few families before review.

## Before each release

- [ ] All tests green in CI, the Android debug build green.
- [ ] Bump `native/package.json` version and the native build numbers.
- [ ] Release notes in plain language.
