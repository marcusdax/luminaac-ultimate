# Third-party software and assets

These files are vendored in `vendor/` and served from the app itself. There is no build step and no CDN at runtime, except for the optional items listed at the end.

| What | Version | Licence | Copyright | Files |
|---|---|---|---|---|
| Leaflet | 1.9.4 | BSD-2-Clause | © 2010–2023 Volodymyr Agafonkin, © 2010–2011 CloudMade | `vendor/leaflet/` (licence: `vendor/leaflet/LICENSE`) |
| qrcode-generator | 1.4.4 | MIT | © 2009 Kazuhiko Arase | `vendor/qrcode.js` (licence in the file header) |
| jsQR | 1.4.0 | Apache-2.0 | © cozmo (Cosmo Wolfe) and contributors | `vendor/jsQR.js`, `vendor/jsQR.LICENSE` |
| Motion | 11.18.2 | MIT | © Framer B.V. / Matt Perry | `vendor/motion.js`, `vendor/motion.LICENSE.md` |
| OpenMoji (126 colour SVGs) | 15.1.0 | CC BY-SA 4.0 | © OpenMoji, HfG Schwäbisch Gmünd | `vendor/openmoji/*.svg`, `vendor/openmoji.LICENSE.txt` |

| Human (face detection and expression) | 3.3.6 | MIT | © Vladimir Mandic | `vendor/human/human.esm.js`, `vendor/human/models/` (BlazeFace, emotion), `vendor/human/LICENSE` |
| Sample faces for tests | from Human 3.3.6 `samples/` | MIT | © Vladimir Mandic | `tests/faces/*.jpg` (test-only, not shipped to users) |

**OpenMoji credit, shown in the app:** "Fallback pictures: OpenMoji (openmoji.org), CC BY-SA 4.0." The SVGs are unmodified and named by Unicode code point. If you modify them, the changes must stay CC BY-SA 4.0.

## Used at runtime from the network (optional)
- **OpenStreetMap tiles** (`tile.openstreetmap.org`). Map data © OpenStreetMap contributors, ODbL. Attribution is shown on the map. Production deployments should use their own tile server or a provider, per the OSMF tile usage policy.
- **ARASAAC pictograms** (`api.arasaac.org`, `static.arasaac.org`). Author Sergio Palao; owner Government of Aragón (Spain); CC BY-NC-SA 4.0. Off unless turned on. The non-commercial clause matters for paid plans.
- **transformers.js** 3.7.5 (Apache-2.0, Hugging Face), from jsDelivr, only when the speech model or a natural voice is turned on. The service worker caches it for offline use.
- **kokoro-js** 1.2.1 (Apache-2.0, hexgrad / Xenova), from jsDelivr, only for natural voices.
- **Models from the Hugging Face Hub**, downloaded once and cached by the browser:
  - `onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX` (q8, about 95 MB). This is an ONNX conversion of a wav2vec2-base fine-tune on acted-speech emotion datasets. Check its model card for the licence and for dataset licences before commercial use.
  - `onnx-community/Kokoro-82M-v1.0-ONNX` (q8, about 92 MB), Apache-2.0, plus its voice files (`af_heart`, `af_sky`, `af_nicole`, `af_bella`, `am_puck`, `am_michael`, `bf_isabella`, `bf_emma`, `bm_george`).
  - `Xenova/all-MiniLM-L6-v2` (q8, about 23 MB), Apache-2.0, used for optional on-device semantic symbol and signal embeddings (`embed` task in `ai-worker.js`).
  - `onnx-community/SmolLM2-135M-Instruct-ONNX-MHA` (q4f16, about 118 MB), Apache-2.0, used for opt-in telegraphic utterance expansion (`expand` task in `ai-worker.js` and `byok.js`, calibrated on `willwade/AACConversations`).
- **Capacitor** 7 (MIT) and `@capacitor-community/background-geolocation` (MIT). These are only in the `native/` scaffold and aren't installed or vendored.

## Written for LuminAAC (no third-party code)
- `backend/webauthn.js`: CBOR and passkey verification, following the WebAuthn Level 2 spec.
- `fl-core.js`: logistic regression, differential-privacy clipping and noise, Bonawitz-style secure aggregation (ECDH masks, self-masks, Shamir sharing over GF(2^521−1)) and zCDP accounting.
- `backend/mailer.js`: a minimal SMTP client (STARTTLS, AUTH PLAIN/LOGIN) on node:net and node:tls.
- `emotion.js`: autocorrelation pitch detection, after the public-domain technique in cwilso/PitchDetect (MIT).
