# Third-party software and assets

These files are vendored in `vendor/` and served from the app itself. There is no build step and no CDN at runtime, except for the optional items listed at the end.

| What | Version | Licence | Copyright | Files |
|---|---|---|---|---|
| Leaflet | 1.9.4 | BSD-2-Clause | © 2010–2023 Volodymyr Agafonkin, © 2010–2011 CloudMade | `vendor/leaflet/` (licence: `vendor/leaflet/LICENSE`) |
| qrcode-generator | 1.4.4 | MIT | © 2009 Kazuhiko Arase | `vendor/qrcode.js` (licence in the file header) |
| jsQR | 1.4.0 | Apache-2.0 | © cozmo (Cosmo Wolfe) and contributors | `vendor/jsQR.js`, `vendor/jsQR.LICENSE` |
| Motion | 11.18.2 | MIT | © Framer B.V. / Matt Perry | `vendor/motion.js`, `vendor/motion.LICENSE.md` |
| three.js | r170 (0.170.0) | MIT | © 2010-2024 three.js authors | `vendor/three/three.module.min.js`, `vendor/three/LICENSE`. Loaded only by Word Train and `about.html` |
| OpenMoji (126 colour SVGs) | 15.1.0 | CC BY-SA 4.0 | © OpenMoji, HfG Schwäbisch Gmünd | `vendor/openmoji/*.svg`, `vendor/openmoji.LICENSE.txt` |
| Human (face detection and expression) | 3.3.6 | MIT | © Vladimir Mandic | `vendor/human/human.esm.js`, `vendor/human/models/` (BlazeFace, emotion), `vendor/human/LICENSE` |
| simplify-js | 1.2.4 | BSD-2-Clause | © 2017 Vladimir Agafonkin | `vendor/simplify.js`, `vendor/simplify.LICENSE` |
| GSAP (core, ScrollTrigger, SplitText) | 3.13.0 | GreenSock Standard No Charge licence | © GreenSock / Webflow | `welcome/vendor/gsap.min.js`, `ScrollTrigger.min.js`, `SplitText.min.js`, `welcome/vendor/GSAP-LICENSE.md`. Website only |
| Lenis | 1.3.4 | MIT | © darkroom.engineering | `welcome/vendor/lenis.min.js`, `welcome/vendor/lenis.LICENSE`. Website only |
| Sample faces for tests | from Human 3.3.6 `samples/` | MIT | © Vladimir Mandic | `tests/faces/*.jpg` (test-only, not shipped to users) |

**OpenMoji credit, shown in the app:** "Fallback pictures: OpenMoji (openmoji.org), CC BY-SA 4.0." The SVGs are unmodified and named by Unicode code point. If you modify them, the changes must stay CC BY-SA 4.0.

## Used at runtime from the network (optional)
- **OpenStreetMap tiles** (`tile.openstreetmap.org`). Map data © OpenStreetMap contributors, ODbL. Attribution is shown on the map. Production deployments should use their own tile server or a provider, per the OSMF tile usage policy.
- **Overpass API** (`overpass-api.de`, with `overpass.private.coffee` and `overpass.kumi.systems` as fallbacks). Only when a caregiver taps "Find water". Results are OpenStreetMap data © OpenStreetMap contributors, ODbL; the credit is shown in the Water card. Keep requests rare: public servers rate-limit (HTTP 429).
- **ARASAAC pictograms** (`api.arasaac.org`, `static.arasaac.org`). Author Sergio Palao; owner Government of Aragón (Spain); CC BY-NC-SA 4.0. Off unless turned on. The non-commercial clause matters for paid plans.
- **transformers.js** 3.7.5 (Apache-2.0, Hugging Face), from jsDelivr, only when the speech model or a natural voice is turned on. The service worker caches it for offline use.
- **kokoro-js** 1.2.1 (Apache-2.0, hexgrad / Xenova), from jsDelivr, only for natural voices.
- **Models from the Hugging Face Hub**, downloaded once and cached by the browser:
  - `onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX` (q8, about 95 MB). This is an ONNX conversion of a wav2vec2-base fine-tune on acted-speech emotion datasets. Check its model card for the licence and for dataset licences before commercial use.
  - `onnx-community/Kokoro-82M-v1.0-ONNX` (q8, about 92 MB), Apache-2.0, plus its voice files.
- **YouTube IFrame Player API** (`www.youtube.com/iframe_api`) with the privacy-enhanced host `www.youtube-nocookie.com`, only when a child opens a video a caregiver added. Governed by the YouTube API Services Terms and Developer Policies, not an open-source licence. We keep YouTube's player and branding, don't download, cache or alter videos, and don't hide ads. Thumbnails (`i.ytimg.com`) load only if a caregiver turns them on. The service worker never caches YouTube.
- **Capacitor** 7 (MIT) and `@capacitor-community/background-geolocation` (MIT). These are only in the `native/` scaffold and aren't installed or vendored.

## Added in v0.14
| Component | Licence | How it's used |
|---|---|---|
| [vosk-browser](https://github.com/ccoreilly/vosk-browser) 0.0.8 | Apache-2.0 | Loaded from jsDelivr only when a family chooses on-device listening. The speech model is hosted by the family, under its own licence. |
| [Capacitor](https://github.com/ionic-team/capacitor) 8 and @capacitor/local-notifications | MIT | Native shell in `native/` only, not in the web app. |
| [@capacitor-community/background-geolocation](https://github.com/capacitor-community/background-geolocation) 1.3 | MIT | Background geofences in the native shell. |
| WebCrypto, Push API, MediaRecorder, Web Speech API | browser built-ins | Encryption, alerts, voice recording, browser listening. |

## Written for LuminAAC (no third-party code)
- `backend/webauthn.js`: CBOR and passkey verification, following the WebAuthn Level 2 spec.
- `fl-core.js`: logistic regression, differential-privacy clipping and noise, Bonawitz-style secure aggregation (ECDH masks, self-masks, Shamir sharing over GF(2^521−1)) and zCDP accounting.
- `backend/mailer.js`: a minimal SMTP client (STARTTLS, AUTH PLAIN/LOGIN) on node:net and node:tls.
- `water.js`: Overpass query, `out geom` to shapes, box clipping. `geo.js`: distance to polygons and lines, point-in-polygon.
- `bridge-p6.js`: pointer-event freehand drawing with pressure and palm rejection.
- `interests.js`, `games.js`: YouTube link parsing, engagement scoring, word growth, digest and report, sound games, loudness and autocorrelation pitch (after cwilso/PitchDetect, MIT; no code copied). Charts are hand-made SVG.
- `emotion.js`: autocorrelation pitch detection, after the public-domain technique in cwilso/PitchDetect (MIT).

## Licence conflicts to know about

LuminAAC's own code is MIT. Two picture sets don't fit that licence, so take care before you redistribute or sell the app:

- **OpenMoji (CC BY-SA 4.0) in `vendor/openmoji/`.** These are vendored in the repository. Share-alike applies to the pictures themselves, not to the MIT code around them. You must keep the attribution, and any modified pictures must stay CC BY-SA 4.0. They aren't MIT-licensed even though they ship in an MIT repository.
- **ARASAAC (CC BY-NC-SA 4.0).** These aren't vendored; they load from ARASAAC's servers only when turned on. The non-commercial clause means a paid plan or commercial deployment can't use ARASAAC pictograms without permission from the Government of Aragón. Before charging, turn ARASAAC off and use OpenMoji or another commercially licensed set (for example Mulberry, CC BY-SA), or get a licence.
- **Speech-emotion model.** Check the model card and its training-dataset licences before commercial use (see above).
