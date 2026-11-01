# Open-source research for LuminAAC

Researched 31 Oct 2026 with the GitHub API. Stars and last-push dates come from `gh api` on that day.

**How we picked.** LuminAAC ships as plain HTML, CSS and JS with no build step. So we favoured:
- permissive licences (MIT, Apache-2.0, BSD)
- a single file we can vendor
- active maintenance

⚠️ marks copyleft licences (GPL/AGPL/MPL/CC BY-SA). We study those projects but don't copy their code.

## Top 10 to adopt now

| # | Project | Stars | Last push | Licence | How it helps LuminAAC | Status |
|---|---|---|---|---|---|---|
| 1 | [Leaflet/Leaflet](https://github.com/Leaflet/Leaflet) | 45.8k | 2026-10-31 | BSD-2 | Safe-zone map: tap to place a circle, see zones. 40 KB gzipped, no build. | **Adopted** (`vendor/leaflet`, 1.9.4) |
| 2 | [hfg-gmuend/openmoji](https://github.com/hfg-gmuend/openmoji) | 4.6k | 2026-08 | CC BY-SA 4.0 (graphics) ⚠️ share-alike for the pictures only | One drawn style for every tile. Fixes the ARASAAC 404s and works offline. | **Adopted** (126 SVGs in `vendor/openmoji`, credited) |
| 3 | [kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 2.4k | 2026-02 | MIT | Pairing QR as crisp inline SVG, one file. | **Adopted** (`vendor/qrcode.js`, 1.4.4) |
| 4 | [cozmo/jsQR](https://github.com/cozmo/jsQR) | 4.0k | 2026-05 | Apache-2.0 | Scan the pairing QR in My Voice, even where `BarcodeDetector` isn't available. Loaded only when the camera is used. | **Adopted** (`vendor/jsQR.js`, 1.4.0) |
| 5 | [motiondivision/motion](https://github.com/motiondivision/motion) | 34.7k | 2026-10-31 | MIT | Restrained motion in three places only: an alert arriving, a confirm "pop", a card fade. Skipped when reduced motion is on. | **Adopted** (`vendor/motion.js`, 11.18.2, used via `motion-lite.js`) |
| 6 | [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | 16.4k | 2026-10-30 | Apache-2.0 | On-device speech-emotion and Whisper models, plus Kokoro TTS in the browser. The next step for emotion AI and "My Voice" voices. | Recommended next (CDN ES module, opt-in download) |
| 7 | [vladmandic/human](https://github.com/vladmandic/human) | 3.4k | 2025-12 | MIT | Face-expression estimate on video moments, fully in the browser. | **Adopted, optional**: loaded from jsDelivr only if the caregiver turns it on; falls back to voice only |
| 8 | [MasterKale/SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) | 2.4k | active | MIT | Reference for passkey edge cases. We wrote a zero-dependency verifier (`backend/webauthn.js`) to its spec. Switch to this if attestation formats beyond "none" are needed. | Studied; swap-in path documented |
| 9 | [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | 7.7k | 2026-10-29 | MPL-2.0 ⚠️ (file-level copyleft; fine as an unmodified dev tool) | Automated WCAG checks in the Playwright suite. | Recommended (dev-only, not shipped) |
| 10 | [flwrlabs/flower](https://github.com/flwrlabs/flower) | 7.2k | active | Apache-2.0 | Production federated-learning server: secure aggregation with dropout recovery, plus strategies. Our FedAvg endpoint matches its protocol shape, so we can migrate later. | Recommended for scale |

Honourable mentions:
- **a11y-dialog** (MIT, 2.5k, pushed today). We use native `<dialog>`, which now covers this.
- **anime.js** (MIT, 74k). An alternative to Motion.
- **Turf** (MIT, 10.5k). Use it for polygon zones later.
- **PeerJS** (MIT, 13.5k). Use it for direct device-to-device sync with no server.

## Everything we looked at, by area

### AAC apps (learn from them, don't copy)
| Project | Stars | Last push | Licence | What we take from it |
|---|---|---|---|---|
| [cboard-org/cboard](https://github.com/cboard-org/cboard) | 766 | 2026-10-30 | **GPL-3.0** ⚠️ | Board/OBF data model, Global Symbols integration, scanning UX. Ideas only. |
| [asterics/AsTeRICS-Grid](https://github.com/asterics/AsTeRICS-Grid) | 129 | 2026-10-27 | **AGPL-3.0** ⚠️ | Offline-first sync (PouchDB) and input methods (scanning, head tracking). Ideas only, because AGPL network clauses would bind our server. |
| [RonanOD/OpenAAC](https://github.com/RonanOD/OpenAAC) | 34 | 2024-11 | Apache-2.0 | Small Flutter AAC app. Stale, so low value. |
| [open-aac/openaac.org](https://github.com/open-aac/openaac.org) | 8 | 2026-10 | MIT | The Open Board Format (OBF) spec site. Target for import/export. |
| CoughDrop / Otto | — | — | (historically AGPL-3.0 ⚠️) | The main repo is no longer public under CoughDrop/coughdrop. Only [CoughDrop/extra-tts](https://github.com/CoughDrop/extra-tts) (MIT, 2025-09) and an old fork (AGPL, 2016) remain. |

### Symbols
| Project | Stars | Last push | Licence | Notes |
|---|---|---|---|---|
| ARASAAC ([juanda99/arasaac-frontend](https://github.com/juanda99/arasaac-frontend), [agfaya/arasaac-api](https://github.com/agfaya/arasaac-api)) | 16 / 5 | 2026-10 / 2026-03 | MIT code. Pictograms are **CC BY-NC-SA** ⚠️ (non-commercial) | Already used online. The NC licence matters for a paid tier, so OpenMoji is the safe default. |
| [mulberrysymbols/mulberry-symbols](https://github.com/mulberrysymbols/mulberry-symbols) | 62 | 2026-10-27 | CC BY-SA 2.0 UK ⚠️ | 3,400 adult-friendly AAC symbols. Good next pack for older users. |
| [hfg-gmuend/openmoji](https://github.com/hfg-gmuend/openmoji) | 4,575 | 2026-08 | CC BY-SA 4.0 ⚠️ | **Adopted** as the fallback. |
| [jdecked/twemoji](https://github.com/jdecked/twemoji) | 1,903 | 2026-06 | MIT code, CC BY 4.0 graphics | No share-alike, so the cleanest licence if CC BY-SA is a concern. A drop-in swap in `setMoji()`. |
| Global Symbols (globalsymbols.com) | — | — | per-set | Has an API, but no public GitHub repo for the service. Cboard shows how to integrate it. |

### Text to speech
| Project | Stars | Last push | Licence | Notes |
|---|---|---|---|---|
| [rhasspy/piper](https://github.com/rhasspy/piper) | 11.3k | archived | MIT | Archived. Development moved to **[OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)** (6.1k, **GPL-3.0** ⚠️). Use the voices through a WASM build such as piper-tts-web, not the GPL code. |
| [coqui-ai/TTS](https://github.com/coqui-ai/TTS) | 46.2k | 2024-08 | MPL-2.0 ⚠️ | Stale since the company closed. XTTS model licence is non-commercial ⚠️. |
| [hexgrad/kokoro](https://github.com/hexgrad/kokoro) | 9.8k | 2025-08 | Apache-2.0 | Best small open voice model. Runs in the browser via kokoro-js on transformers.js. |
| [met4citizen/HeadTTS](https://github.com/met4citizen/HeadTTS) | 183 | 2026-10-24 | MIT | Kokoro in the browser with word timestamps and visemes. Useful for word highlighting in stories. |
| [rhulha/StreamingKokoroJS](https://github.com/rhulha/StreamingKokoroJS) | 374 | 2025-06 | Apache-2.0 | Streaming Kokoro in a web worker. |

### Accessible UI
| Project | Stars | Licence | Notes |
|---|---|---|---|
| [radix-ui/primitives](https://github.com/radix-ui/primitives) | 19.5k | MIT | React only. Reference for focus management. |
| [adobe/react-spectrum](https://github.com/adobe/react-spectrum) (React Aria) | 16.0k | Apache-2.0 | React only. Best-in-class keyboard and screen-reader patterns to copy by hand. |
| [KittyGiraudel/a11y-dialog](https://github.com/KittyGiraudel/a11y-dialog) | 2.5k | MIT | Vanilla. Not needed with native `<dialog>`. |
| [alphagov/accessible-autocomplete](https://github.com/alphagov/accessible-autocomplete) | 961 | MIT | Vanilla. Candidate for word search in Vocabulary. |
| [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | 7.7k | MPL-2.0 ⚠️ | Testing. |

### Motion
| Project | Stars | Last push | Licence | Notes |
|---|---|---|---|---|
| [motiondivision/motion](https://github.com/motiondivision/motion) | 34.7k | 2026-10-31 | MIT | **Adopted**. |
| [juliangarnier/anime](https://github.com/juliangarnier/anime) | 74.1k | 2026-08 | MIT | Alternative. |
| [airbnb/lottie-web](https://github.com/airbnb/lottie-web) | 32.3k | 2025-09 | MIT | For a designed celebration animation later. Heavy (250 KB). |
| [LottieFiles/dotlottie-web](https://github.com/LottieFiles/dotlottie-web) | 932 | active | MIT | Lighter Lottie player (WASM). |
| [rive-app/rive-wasm](https://github.com/rive-app/rive-wasm) | 1.0k | active | MIT | Interactive mascot for "Lumi". Needs Rive-authored files. |

### On-device ML and emotion
| Project | Stars | Last push | Licence | Notes |
|---|---|---|---|---|
| [tensorflow/tfjs](https://github.com/tensorflow/tfjs) | 19.2k | 2026-06 | Apache-2.0 | General ML. Overkill for our 17-weight model. |
| [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe) | 37.5k | active | Apache-2.0 | Face landmarker with blendshapes. Another face-expression route (WASM from CDN). |
| [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) (onnxruntime-web) | 22.2k | active | MIT | Runs exported speech-emotion models (for example wav2vec2-SER). |
| [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | 16.4k | 2026-10-30 | Apache-2.0 | See the top 10. |
| [vladmandic/human](https://github.com/vladmandic/human) | 3.4k | 2025-12 | MIT | **Adopted (optional)**. |
| [vladmandic/face-api](https://github.com/vladmandic/face-api) | 1.1k | archived | MIT | Superseded by Human. |
| [justadudewhohacks/face-api.js](https://github.com/justadudewhohacks/face-api.js) | 18.0k | 2024-01 | MIT | Stale. |
| [meyda/meyda](https://github.com/meyda/meyda) | 1.7k | 2024-07 | MIT | Audio features (MFCC, spectral). Good if prosody needs more than our hand-written features. |
| [cwilso/PitchDetect](https://github.com/cwilso/PitchDetect) | 1.4k | old | MIT | The autocorrelation approach our `emotion.js` follows. |
| [peterkhayes/pitchfinder](https://github.com/peterkhayes/pitchfinder) | 504 | old | none listed ⚠️ | Has no licence, so we can't use it. |
| [audeering/opensmile](https://github.com/audeering/opensmile) | 855 | active | Custom, non-commercial ⚠️ | The research standard for prosody (eGeMAPS), but not usable commercially. |

### Geofencing
| Project | Stars | Licence | Notes |
|---|---|---|---|
| [Leaflet/Leaflet](https://github.com/Leaflet/Leaflet) | 45.8k | BSD-2 | **Adopted**. OSM tiles follow the OSMF tile policy. Self-host tiles for production. |
| [manuelbieh/geolib](https://github.com/manuelbieh/geolib) | 4.3k | MIT | We need only haversine, so we wrote 10 lines (`geo.js`). |
| [Turfjs/turf](https://github.com/Turfjs/turf) | 10.5k | MIT | Point-in-polygon for drawn zones later. |
| Geofence demo repos | <150 | mostly unlicensed | Google-Maps-bound. Nothing reusable. |

### Pairing, QR and WebRTC
| Project | Stars | Licence | Notes |
|---|---|---|---|
| [kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 2.4k | MIT | **Adopted**. |
| [soldair/node-qrcode](https://github.com/soldair/node-qrcode) | 8.2k | MIT | Needs a bundle. Not needed. |
| [cozmo/jsQR](https://github.com/cozmo/jsQR) | 4.0k | Apache-2.0 | **Adopted**. |
| [mebjas/html5-qrcode](https://github.com/mebjas/html5-qrcode) | 6.2k | Apache-2.0 | Full scanner UI. Heavier than we need. |
| [nimiq/qr-scanner](https://github.com/nimiq/qr-scanner) | 2.9k | MIT | Faster worker-based scanner. Alternative to jsQR. |
| [peers/peerjs](https://github.com/peers/peerjs) | 13.5k | MIT | Serverless device-to-device sync after pairing (future). |
| [feross/simple-peer](https://github.com/feross/simple-peer) | 7.8k | MIT | Same, with a lower-level API. |

### Accounts and passkeys
| Project | Stars | Licence | Notes |
|---|---|---|---|
| [better-auth/better-auth](https://github.com/better-auth/better-auth) | 30.5k | MIT | Best full framework if the backend moves to a framework and database. |
| [lucia-auth/lucia](https://github.com/lucia-auth/lucia) | 10.5k | MIT | Now a learning resource, not a library. Our session design follows it: random token, SHA-256 at rest, sliding expiry. |
| [MasterKale/SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) | 2.4k | MIT | See the top 10. |
| [passwordless-id/webauthn](https://github.com/passwordless-id/webauthn) | 616 | MIT | Small, zero-dependency alternative. |
| [github/webauthn-json](https://github.com/github/webauthn-json) | 786 | MIT, archived | Superseded by `PublicKeyCredential.parseCreationOptionsFromJSON`. |

### Federated learning
| Project | Stars | Licence | Notes |
|---|---|---|---|
| [flwrlabs/flower](https://github.com/flwrlabs/flower) | 7.2k | Apache-2.0 | See the top 10. SecAgg+ handles dropouts. |
| [google-parfait/tensorflow-federated](https://github.com/google-parfait/tensorflow-federated) | 2.5k | Apache-2.0 | Research simulation. Python only. |
| [FedML-AI/FedML](https://github.com/FedML-AI/FedML) | 4.1k | Apache-2.0 | Last push 2025-10, slowing. Platform-oriented. |
| [OpenMined/PySyft](https://github.com/OpenMined/PySyft) | 10.0k | Apache-2.0 | Remote data science. Not a fit for on-device AAC. |

## Water danger zones and freehand drawing (phase 6, October 2026)

We searched GitHub (via `gh api`) and the web for code that can find bodies of water and for Leaflet freehand drawing. Stars and last push are from October 31, 2026.

### Finding water
| Project | Stars | Licence | Fit |
|---|---|---|---|
| [drolbr/Overpass-API](https://github.com/drolbr/Overpass-API) | 938 | AGPL-3.0 | The server behind overpass-api.de. We only call the public service; we don't ship its code. |
| [tyrasd/osmtogeojson](https://github.com/tyrasd/osmtogeojson) | 751 | MIT | Solid OSM to GeoJSON, active (2026-04). About 60 KB with deps, so we wrote a small converter for `out geom` instead. |
| [tibetty/osm2geojson-lite](https://github.com/tibetty/osm2geojson-lite) | 28 | MIT | Lighter alternative. Small community. |
| [tyrasd/overpass-turbo](https://github.com/tyrasd/overpass-turbo) | 1.3k | none asserted | Great for testing queries by hand. Don't copy code. |
| [osmdata.openstreetmap.de water polygons](https://osmdata.openstreetmap.de/data/water-polygons.html) | – | ODbL | Coastline and sea polygons; too big for a phone. Useful later for a server-side tile. |
| [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) | 2.3k | Public domain | Lakes and rivers at country scale only. Too coarse for a garden pond. |
| [Turfjs/turf](https://github.com/Turfjs/turf) | 10.5k | MIT | Buffers, point-in-polygon, distance. Active. We only need three functions, so we wrote them (`geo.js`). |
| [mfogel/polygon-clipping](https://github.com/mfogel/polygon-clipping), [w8r/martinez](https://github.com/w8r/martinez) | 642 / 777 | MIT | Full boolean ops. We only clip to a box (Sutherland–Hodgman, 30 lines). |
| [mourner/flatbush](https://github.com/mourner/flatbush), [mapbox/cheap-ruler](https://github.com/mapbox/cheap-ruler) | 1.6k / 433 | ISC | Good options if zone counts grow past a few hundred. |

### Freehand drawing on Leaflet
| Project | Stars | Licence | Fit |
|---|---|---|---|
| [geoman-io/leaflet-geoman](https://github.com/geoman-io/leaflet-geoman) | 2.4k | MIT | Best maintained (push 2026-10-22). Draw, edit, drag. No freehand or pressure; about 200 KB. First pick if we ever need full editing. |
| [Leaflet/Leaflet.draw](https://github.com/Leaflet/Leaflet.draw) | 2.1k | MIT | Classic, but little activity since 2024. |
| [Wildhoney/Leaflet.FreeDraw](https://github.com/Wildhoney/Leaflet.FreeDraw) | 576 | MIT | True freehand polygons. Pulls in D3 and ClipperLib; mouse/touch, no pen pressure. |
| [Wildhoney/L.Pather](https://github.com/Wildhoney/L.Pather) | 69 | MIT | Freehand lines. Old. |
| [bozdoz/leaflet-freehandshapes](https://github.com/bozdoz/leaflet-freehandshapes) | 17 | none asserted, archived | Avoid. |
| [steveruizok/perfect-freehand](https://github.com/steveruizok/perfect-freehand) | 5.8k | MIT | Beautiful pressure strokes for ink; shapes are outlines, not zones. Idea borrowed for pressure-weighted width. |
| [mourner/simplify-js](https://github.com/mourner/simplify-js) | 2.4k | BSD-2-Clause | **Vendored** (`vendor/simplify.js`). Ramer–Douglas–Peucker; turns a stroke into a few dozen corners. |

**Decision:** call Overpass directly, convert and clip in `water.js`, and draw with pointer events in `bridge-p6.js` (pen pressure, palm rejection, keyboard alternative). Only simplify-js is vendored. Everything stays build-free.

## Licence flags (don't vendor these)
- **GPL-3.0:** Cboard, piper1-gpl.
- **AGPL-3.0:** AsTeRICS Grid, old CoughDrop.
- **Non-commercial:** ARASAAC pictograms (CC BY-NC-SA), openSMILE, Coqui XTTS weights.
- **No licence:** pitchfinder.
- **Share-alike:** OpenMoji and Mulberry graphics (CC BY-SA). Fine for pictures we ship with credit. Changes to the SVGs must stay CC BY-SA.

## Round 2: roadmap gaps (October 31, 2026, evening)

Searched with `gh api` against the "Next" and "Later" roadmap items that round 1 didn't cover. Stars, last push and licence are from that day. Where GitHub couldn't classify a licence, we read the licence file itself.

### Top picks

| # | Project | Stars | Last push | Licence | Roadmap item it unlocks | How to use it |
|---|---|---|---|---|---|---|
| 1 | [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe) (Face Landmarker) | 37.5k | active | Apache-2.0 | **Head pointer**: hands-free access for children who can't tap | Nose-tip landmark drives a cursor; `access.js` dwell already does the selecting. WASM from CDN, opt-in, camera stays on the device. |
| 2 | [chrisguttandin/extendable-media-recorder](https://github.com/chrisguttandin/extendable-media-recorder) | 355 | 2026-09 | MIT | **Recorded caregiver voice for buttons** that plays back the same on iPad Safari and Android | Records WAV everywhere, so it avoids Safari's MediaRecorder codec gaps. Save the clips in the existing `luminaac-media` IndexedDB store. |
| 3 | [fengyuanchen/cropperjs](https://github.com/fengyuanchen/cropperjs) | 13.9k | 2026-10 | MIT | **Photo symbols** (camera → button) | Square crop with a large touch target, then save a 300px WebP next to the button. |
| 4 | [yjs/yjs](https://github.com/yjs/yjs) | 23.0k | 2026-10 | MIT (licence file; GitHub shows NOASSERTION) | **Conflict-free sync** when two caregivers edit the vocabulary offline | Model the synced family document as a Y.Doc. The server stores opaque updates, which fits with item 5. [automerge/automerge](https://github.com/automerge/automerge) (MIT, 6.7k) is the alternative. |
| 5 | [paulmillr/noble-ciphers](https://github.com/paulmillr/noble-ciphers) | 432 | 2026-09 | MIT, audited | **End-to-end encryption of the synced document** | XChaCha20-Poly1305 with a family key the server never sees. One small file, no build. [jedisct1/libsodium.js](https://github.com/jedisct1/libsodium.js) (ISC) is heavier but complete. |
| 6 | [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | 15.6k | 2026-10 | Apache-2.0 | **Offline natural voices** (Piper/VITS voices) without the GPL piper1 code | WASM TTS build, run in `ai-worker.js` next to Kokoro. It also does voice activity detection, which can trim recorded moments. |
| 7 | [moonshine-ai/moonshine](https://github.com/moonshine-ai/moonshine) | 11.3k | 2026-10 | MIT (code **and** models, per licence file) | **Partner speech to text**: show what the adult said as symbols or words (aided language modelling) | Small, fast on-device speech recognition. Use it via ONNX in the worker. Whisper through transformers.js is the fallback. |
| 8 | [jakearchibald/idb](https://github.com/jakearchibald/idb) | 7.4k | 2026-10 | ISC | Simpler, safer storage code in `shared.js` | A 1 KB promise wrapper over IndexedDB. Move to [dexie/Dexie.js](https://github.com/dexie/Dexie.js) (Apache-2.0, 14.7k) only if queries grow. |
| 9 | [web-push-libs/web-push](https://github.com/web-push-libs/web-push) | 3.6k | 2026-10 | MPL-2.0 ⚠️ (file-level; fine used unmodified on the server) | **Web Push alerts** for "help" and safe-zone events when the Bridge is closed | Server only. To keep the backend zero-dependency, copy the VAPID/aes128gcm approach by hand instead. iOS 16.4+ supports push only for installed (home-screen) web apps. |
| 10 | [ngxson/wllama](https://github.com/ngxson/wllama) | 1.4k | 2026-10 | MIT | **"LLM help" (v1)**: turn a caregiver's note into short button phrases | llama.cpp in WASM with a tiny model (0.5–1B, about 400 MB). Caregiver side only, opt-in. [mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) (Apache-2.0, 19.3k) is faster on WebGPU but too heavy for an older iPad. |

### Also useful
| Project | Stars | Licence | Notes |
|---|---|---|---|
| [Turfjs/turf](https://github.com/Turfjs/turf) | 10.5k | MIT | Still the pick for polygon zones if the hand-written `geo.js` maths grows. |
| [i18next/i18next](https://github.com/i18next/i18next) | 8.7k | MIT | When we add Spanish or other board languages. |
| [GoogleChrome/workbox](https://github.com/GoogleChrome/workbox) | 13.0k | MIT | Not needed yet; the hand-written `sw.js` is small and clear. Revisit if caching rules multiply. |
| [dequelabs/axe-core-npm](https://github.com/dequelabs/axe-core-npm) (`@axe-core/playwright`) | 730 | MPL-2.0 ⚠️ dev-only | Still recommended for automated WCAG checks in tests. |
| [shayc/open-board-format](https://github.com/shayc/open-board-format) | 0 | MIT | New OBF/OBZ parser and validator (Oct 2026). Too young to vendor; read it alongside the spec when we build board import/export. |
| [Cooperation-org/chipperly](https://github.com/Cooperation-org/chipperly) | 0 | MIT | New visual-supports app (schedule, timer, first-then). Ideas for a visual timer in Plans. |
| [LE-VAI/access-input](https://github.com/LE-VAI/access-input) | 0 | MIT | New input layer (adaptive dwell, switch scanning). Read for adaptive dwell timing ideas only. |

### Looked at and passed over
- **[brownhci/WebGazer](https://github.com/brownhci/WebGazer)** (3.9k): **GPL-3.0** ⚠️ (licence file). Webcam gaze is also too jittery for AAC targets. Use the MediaPipe head pointer (top pick 1) instead.
- **[imgly/background-removal-js](https://github.com/imgly/background-removal-js)** (7.4k): **AGPL-3.0** ⚠️. For photo-symbol cut-outs, use MediaPipe Image Segmenter (Apache-2.0) instead.
- **[xenova/whisper-web](https://github.com/xenova/whisper-web)** (3.3k) and **[Mintplex-Labs/piper-tts-web](https://github.com/Mintplex-Labs/piper-tts-web)**: no licence ⚠️. Use transformers.js and sherpa-onnx directly.
- **Word prediction:** nothing usable on GitHub. The repos are toys, Presage is GPL-2.0 and stale, and there's no maintained KenLM WASM build. Keep the learned bigram model in `shared.js`, and add a tiny on-device language model later if needed.
- **[peteragility/open-aac-board](https://github.com/peteragility/open-aac-board)**: **GPL-3.0** ⚠️. Ideas only (multilingual boards, personal recordings).

## Round 3: interests, history and sound play

Checked October 31, 2026 with the GitHub API (stars, licence, last push). Fit: **Use** = good candidate, **Idea** = borrow the approach, **Avoid** = licence or maintenance problem.

### Pitch, loudness and audio features
| Repo | Stars | Licence | Fit |
|---|---|---|---|
| [ianprime0509/pitchy](https://github.com/ianprime0509/pitchy) | 139 | 0BSD | **Use** if our autocorrelation isn't enough: McLeod pitch method, tiny, active (Oct 2026). |
| [cwilso/PitchDetect](https://github.com/cwilso/PitchDetect) | 1.4k | MIT | **Idea.** The approach our `games.js` pitch follows. |
| [meyda/meyda](https://github.com/meyda/meyda) | 1.7k | MIT | **Use** for richer features (MFCC, spectral flatness) to tell voice from claps or noise. Last push 2024. |
| [peterkhayes/pitchfinder](https://github.com/peterkhayes/pitchfinder) | 504 | none | **Avoid**: no licence. |
| [ml5js/ml5-next-gen](https://github.com/ml5js/ml5-next-gen) | 188 | ml5 licence (non-OSI, ethical-use) | **Avoid** for shipping; the custom licence adds terms. |

### Speech recognition on the device
| Repo | Stars | Licence | Fit |
|---|---|---|---|
| [ccoreilly/vosk-browser](https://github.com/ccoreilly/vosk-browser) / [alphacep/vosk-api](https://github.com/alphacep/vosk-api) | 531 / 15.2k | Apache-2.0 | **Use** for a small-vocabulary "did they try *ball*" game (grammar-limited, WASM, ~40 MB model). |
| [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | 16.4k | Apache-2.0 | **Use.** Already used; Whisper/Moonshine for later word games. |
| [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) | 54.8k | MIT | **Idea** for native builds. |
| [tensorflow/tfjs-models](https://github.com/tensorflow/tfjs-models) speech-commands, [teachablemachine-community](https://github.com/googlecreativelab/teachablemachine-community) | 14.8k / 1.7k | Apache-2.0 | **Use** for caregiver-trained sound classes ("our dog's name", the child's own word approximations). |
| [cmusphinx/pocketsphinx](https://github.com/cmusphinx/pocketsphinx) | 4.4k | BSD-style | **Idea**; the JS port [syl22-00/pocketsphinx.js](https://github.com/syl22-00/pocketsphinx.js) has no licence and is stale (**Avoid**). |
| [coqui-ai/STT](https://github.com/coqui-ai/STT), [mozilla/DeepSpeech](https://github.com/mozilla/DeepSpeech) | 2.6k / archived | MPL-2.0 | **Avoid**: unmaintained. |
| [speechbrain/speechbrain](https://github.com/speechbrain/speechbrain) | 11.9k | Apache-2.0 | **Idea** for server-side research only. |

### Audio and rewards
| Repo | Stars | Licence | Fit |
|---|---|---|---|
| [Tonejs/Tone.js](https://github.com/Tonejs/Tone.js) | 14.9k | MIT | **Idea** for music games; plain WebAudio is enough today. |
| [goldfire/howler.js](https://github.com/goldfire/howler.js) | 25.4k | MIT | **Use** if we add recorded sound effects (iOS unlock handling). |
| [catdad/canvas-confetti](https://github.com/catdad/canvas-confetti), [loonywizard/js-confetti](https://github.com/loonywizard/js-confetti) | 12.8k / 1.3k | ISC / MIT | **Use** for an optional celebration; must respect calm visuals. |

### Charts for Insights
| Repo | Stars | Licence | Fit |
|---|---|---|---|
| [leeoniya/uPlot](https://github.com/leeoniya/uPlot) | 10.6k | MIT | **Use** if charts grow (tiny, fast). |
| [chartjs/Chart.js](https://github.com/chartjs/Chart.js), [frappe/charts](https://github.com/frappe/charts) | 67.8k / 15.1k | MIT | **Idea**; heavier than our hand-made SVG and weaker on screen-reader tables. |

### YouTube embedding
| Repo | Stars | Licence | Fit |
|---|---|---|---|
| [paulirish/lite-youtube-embed](https://github.com/paulirish/lite-youtube-embed) | 6.4k | Apache-2.0 | **Idea**: loads nothing from YouTube until tapped. Our tiles already do this. |
| [justinribeiro/lite-youtube](https://github.com/justinribeiro/lite-youtube) | 1.4k | MIT | **Use** candidate as a web component with nocookie support. |
| [gajus/youtube-player](https://github.com/gajus/youtube-player) | 387 | unclear (NOASSERTION) | **Avoid**: licence unclear, last push 2023. |
| [sampotts/plyr](https://github.com/sampotts/plyr), [cookpete/react-player](https://github.com/cookpete/react-player) | 30k / 10.3k | MIT | **Avoid** for now: overlays on YouTube need ToS care, and React isn't used. |
| [LonelyCpp/react-native-youtube-iframe](https://github.com/LonelyCpp/react-native-youtube-iframe) | 704 | MIT | **Idea** if the native app moves to React Native. |
| [youtube/api-samples](https://github.com/youtube/api-samples) | archived | none | Reference only. |

### AAC, autism and caregiver tools
| Repo | Stars | Licence | Fit |
|---|---|---|---|
| [cboard-org/cboard](https://github.com/cboard-org/cboard) | 766 | GPL-3.0 | **Idea** (board formats, OBF). Don't copy code into MIT. |
| [asterics/Asterics-AAC](https://github.com/asterics/Asterics-AAC), [willwade/AACProcessors](https://github.com/willwade/AACProcessors) | 129 / – | AGPL-3.0 | **Idea**; AGPL. AACProcessors is useful as a separate tool for importing other AAC formats. |
| [mulberrysymbols/mulberry-symbols](https://github.com/mulberrysymbols/mulberry-symbols) | 62 | CC BY-SA | **Use** for topic fringe pictures (commercial-friendly). |
| [Chuea81/freevoice-aac](https://github.com/Chuea81/freevoice-aac) | 14 | MIT | **Idea**: small, recent. |
| [quangshuynh/carebridge](https://github.com/quangshuynh/carebridge), [Chimbay/SocialCueWebapp](https://github.com/Chimbay/SocialCueWebapp), [zdvman/therapoetry](https://github.com/zdvman/therapoetry) | tiny | Apache-2.0 / MIT / MIT | **Idea** only. |
| Visual schedule, social story and articulation-game repos | tiny | mostly unlicensed | **Avoid**; ours are already richer. |

**Takeaway:** nothing needed to be vendored for v0.9. Next candidates: Vosk-browser or transformers.js Moonshine for word-level games, Meyda for voice-vs-noise, Mulberry for topic pictures and lite-youtube for lighter tiles.
