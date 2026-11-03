# Changelog

All notable changes. Versions match the service worker cache name in `sw.js`.

## 0.17.0 (3 November 2026)
Builds the rest of `docs/SOUND-PATH.md`: increments B, C and D.
### Added
- **Watch my mouth** (Sound Path): a 3-second close-up of a familiar face saying each target, recorded in the Bridge and kept on the device (IndexedDB). It plays slowly, then at normal speed, then gives a "your turn". Clips can be moved between devices as a file.
- **Mouth Mirror** (Sound Path, camera off by default): a friendly face copies the child's jaw and lips live, and the child copies open (ah), round (oo) and closed (mm). It uses MediaPipe Face Landmarker blendshapes on the device and records nothing. It covers jaw and lips only, never the tongue, and won't open during Potty Path. "I did it" works without the camera.
- **Sound and treat** (Sound Path, the SLP turns it on): the target sound plays while the child's favourite thing shows, with no demand to copy it. Pairings are their own events (`pair`), so they never change the practice engine's success rate. Daily cap of 5, 10 or 15.
- **Safety Links** (Safety hub):
  - Tracker cards now take a photo, what the tracker is attached to, and a battery-check date, with a reminder at the top of Safety. Each tracker shows an honest note about its limits (AirTag anti-stalking alerts, Find Hub links that expire after 7 days).
  - **"If found" QR page** (`found.html`): a public page with the details the caregiver chose (first name, how they talk, how to approach, what calms them, a call button). It never includes an address or location. Printable sticker sheet. Can be switched off at any time.
  - **Wandering plan sheet**: one printable page with photo, appearance, communication, triggers, favourite places, nearby water from the water layer, safe-zone names and trackers.
  - **Sensor events**: `door_open`, `gate_open`, `window_open`, `pool_motion`, `wearable_sos`, `wearable_left_zone`, `seizure_alert`, `location` and `arousal`.
  - **Door rule**: a door or gate opening is urgent unless someone pressed "Going out together". The alert also says whether the child's tablet has moved.
  - **Bluetooth "is he near?"** (Chrome and Edge on Android or a computer): shows near, nearby, far or lost signal from a paired tag. On iPhone and iPad it says plainly that Bluetooth isn't available.
- **Research mode** (increment D): a wristband sensor can send heart rate only after a parent ticks a separate consent. A caregiver-only "calm check?" appears when heart rate stays well above the child's usual level for 3 minutes while they are still, at most once every 30 minutes. It is never shown on the child's device, and readings are kept for 1 hour.
- **Export labelled sounds** (increment D): magic moments with a recording and a meaning, exported as one file for a future personal sound model. It needs a parent to type their name to agree.
- Server: `/api/found`, `/api/found/:token` (public), `/api/safety/out`, structured webhook events and the research consent (`backend/server.js`). Shared rules in `safety-core.js`.
- Tests: `tests/safety.test.mjs` (27), 9 new Sound Path tests (35 in all), 13 new server tests.

## 0.16.0 (2 November 2026)
### Added
- **Eight word games** in Play (and Feelings Weather in Calm), played with the child's own word tiles in their Talk columns. Every tap speaks. The games are Word Garden, Conductor, Feelings Weather, Story Stage, Pattern Lab, My Turn Your Turn, Sound Pond and Copy the Robot.
  - Built as one frame, with "All done" always in the top-right corner.
  - Nothing fails, and an add-only play world grows with every try.
  - Files: `play-core.js` (rules), `play.js`, `play.css`.
- **Word games settings** in the Bridge (Videos and games): which games show, movement (gentle or still), game sounds, rest time, word buttons and blooms. Camera use for Copy the Robot needs a parent's consent. Files: `bridge-play.js`.
- **DESIGN.md "quiet sky, lit strip" look:** a still sky behind words, a dark lantern rail with the open section lit, and a lit indicator in the Bridge hub bar. Its tokens are in `tokens.css`.
- Tests: `tests/play.test.mjs` (29).

## 0.15.0 (2 November 2026)
### Added
- Open Board Format import and export in the My Voice Caregiver area: save core words and every folder as one .obz file, or add words from a .obf or .obz made by another AAC app (`obf-core.js`). Pictures and word colours travel with the file; nothing is uploaded.
- Tests: `tests/obf.test.mjs` (17) and `tests/browser/obf.py` (6).

## 0.14.2 (2 November 2026)
### Fixed
- **Page locks up after a game.** Every My Voice pop-up (sound games, videos, stories, Sound Path, Potty Path) lived inside the Talk view. Since v0.13 the games are opened from Play, where Talk is hidden, so the pop-up opened invisibly and made the rest of the page ignore taps: it still scrolled, but nothing worked. `dialog-guard.js` now moves a pop-up to the top level of the page before it opens, ignores a second open of the same pop-up, and closes any pop-up that can't be seen.
- The microphone is released when a game or Sound Path closes, even if the browser grants permission after the game was stopped. Turn timers and scoring stop when a game closes.
- Tests: `tests/dialog-guard.test.mjs` (11) and `tests/browser/talk-games.py`, which plays every game, story and Sound Path game three times and checks the bottom bar still works.

## 0.14.1
- Screenshots, README and service worker version.

## 0.14.0
- Push alerts and weekly email summaries, photo symbols and recorded voices, one- and two-switch scanning, optional end-to-end encryption, "Say the word" speech check, and the labelling agreement check. See ROADMAP.md for earlier versions.
