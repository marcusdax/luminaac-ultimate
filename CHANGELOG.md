# Changelog

All notable changes. Versions match the service worker cache name in `sw.js`.

## 0.18.0 (3 November 2026)
Builds `docs/MOTION-CONCEPT.md`, increments M1 to M5. The board, tiles, word colours and pictures don't change.
### Added
- **One motion gate** (`motion-gate.js`, rules in `motion-core.js`). Every animation asks it first. It reads the tablet's "reduce motion" setting, Still mode, the grown-up's **Movement** setting, the battery (under 20 % and not charging: confirmations only) and the device (2 cores or 2 GB or less: no skies or 3D). `<html data-ml>` carries the level to CSS.
- **Movement** in Bridge → Word games now has three choices: **Gentle** (slow skies in Calm and games), **Small** (only show where his words go) and **Still**. It covers the board, Calm and every game.
- **Board (M1):** a tapped word travels from its tile to the sentence bar (220 ms). Folder changes use a short View Transition. The lit pill slides between nav items. Sheets rise in 180 ms, and the dark bands fade in once at start-up.
- **Calm (M2):** breathing is now 4 s in and 6 s out, as DESIGN.md says. Behind the orb, a WebGL horizon rises and settles with the breath. The grown-up picks a **Calm sky** (night, sea or dawn).
- **Game skies (M2):** every game scene gets a slow shader sky (`shader-sky.js`, `shaders/sky.js`): drifting clouds, water light, dim stars. 30 frames a second at most, half resolution, paused when hidden. The scene colour stays as the still picture.
- **Four new games (M3):** **Lantern Sky** (each word floats up as a lantern; Speak lines them up into a sentence), **Tide Pool** (a ripple opens the shells it reaches and each says its word), **Sound Garden** (any sound grows a flower; a long sound or enough sounds make it bloom; the microphone is optional) and **Aurora Feelings** (the sky takes the colour and pace of a feeling, and the feeling is logged for grown-ups).
- **Word Train (M4):** words become carriages on a 3D train (three.js r170, vendored in `vendor/three/`, loaded only by this game and cached on first use). Tap two carriages to swap them; "Go, train!" sends it once round the loop while the voice reads them. At "Small", "Still", on low-end tablets or without WebGL, it is a flat SVG train.
- **Bridge (M5):** counts tick up, the 14-day chart draws in once a visit, and a small beam runs from the tablet to the phone when a sync lands. Safety and alerts don't move.
- **Website (M5):** `about.html`, "A day with LuminAAC": a scroll-driven story (CSS scroll timelines, with a still page where they aren't supported or motion is reduced) and a slow 3D ribbon of the logo's lit wave.
- Tests: `tests/motion.test.mjs` (54). Play tests updated for 13 games.

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
