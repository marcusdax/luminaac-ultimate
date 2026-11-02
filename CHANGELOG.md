# Changelog

All notable changes. Versions match the service worker cache name in `sw.js`.

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
