# LuminAAC Ultimate

**LuminAAC Ultimate** is a local-first, clinically grounded Augmentative and Alternative Communication (AAC) and holistic neurodivergent support platform for nonverbal and minimally speaking children. It **learns the child's own language from the people who love them** while delivering the clinical rigor of Speech-Language Pathology (SLP), motor-plan invariance, expressive child-prosody neural voices, gamified articulatory coaching, acoustic co-regulation, and privacy-preserving federated intelligence.

## Two Connected Experiences

- **My Voice (`index.html`) — The Child's Communicator**:
  - **Motor-Invariant 30-Word Core Grid + Contextual Fringe**: Fixed 6-column Fitzgerald Key layout (`vocab.js`, `app.js`) whose spatial coordinates never shift across context rules (`School`, `Bedtime`), protecting motor memory and automaticity.
  - **Expressive Child-Aligned Voices (`Kokoro-82M` + Web Audio Prosody)**: 9 on-device neural voices (`af_sky`, `af_nicole`, `am_puck`, `bf_isabella`, `af_heart`, `af_bella`, `am_michael`, `bf_emma`, `bm_george`) with zero-download pitch/semitone shifting (`[-12, +12]` semitones), warmth filtering, emotion-linked prosody (`shapeProsody`), and instant `<40ms` offline fallback to `speechSynthesis`.
  - **Aided Language Stimulation (ALS) Partner Modeling**: Caregivers toggle Partner Modeling (`#modelToggle`) to model word sequences with a 5-word visual highlight trail (`is-modeled`). Modeled turns are logged as `mode: "modeling", actor: "partner"` and strictly isolated from the child's own word counts, predictions, and MLU.
  - **Gestalt Language Processing (GLP / NLA Stages 1–4)**: Supports whole-phrase gestalts (`Stage 1` verbatim speech or recorded caregiver voice clip) and `Stage 2` **Mitigate into strip** (`mitigateGestalt`) so gestalt communicators can break scripts into recombinable phrase chunks.
  - **Gamified Sound Symphony Composer & Lip-Viseme Articulatory Coach (`symphony.js`)**: Grounded in Auditory-Motor Mapping Training (AMMT) and DTTC. Features an interactive SVG mouth/lip posture coach (`bilabial`, `round-vowel`, `open-vowel`, `smile`, `alveolar`, `velar`) and 16 pentatonic phoneme instrument blocks that blend 2–4 sounds (`m + oh + r → "more"`, `w + aa + t + er → "water"`, `m + aa + m + aa → "mama"`, `h + eh + l + p → "help"`) into spoken words.
  - **Acoustic Frequency Co-Regulation Studio (`symphony.js`)**: Web Audio API therapeutic soundscapes including **Warm Pink Noise Shield** (hyperacusis masking), **Deep Brown Noise Blanket**, **432 Hz Warm Harmonic Drone**, **528 Hz Gentle Chime Pad**, and **6 Hz Theta Co-Regulation Pulse**.
  - **Interoception Pain Body Map & Sensory Quick-Bar (`slp.js`, `support.js`)**: Always-reachable 1-tap Sensory Quick-Bar (`Stop`, `No`, `Help`, `Bathroom`, `Break`) plus a 14-region Body & Pain Check-In (`head`, `eyes`, `ears`, `mouth`, `throat`, `chest`, `stomach`, `skin`, `back`, `arm`, `hand`, `leg`, `foot`, `private`) with 7 sensations and 1-tap relief requests.
  - **Full Motor & Switch Accessibility (`access.js`)**: WCAG 2.5.2 pointer cancellation, configurable acceptance delay (`acceptMs`), post-tap tremor debounce (`debounceMs`), hover/eye-gaze dwell ring, 1-Switch Linear Scan, 1-Switch Row-Column Scan, 2-Switch Step Scan, and auditory scan cues (`scanAudio`).

- **The Bridge (`bridge.html`) — Caregiver, Educator & SLP Portal**:
  - **Magic Moment Rolling Buffer & Annotation Studio**: Catch the last 15 seconds of audio/video from a staggered rolling buffer, explain what your child's vocalization or gesture meant, and turn it into a personal signal with Beta-posterior confidence scoring.
  - **Offline Semantic Search (`Xenova/all-MiniLM-L6-v2` + Deterministic Fallback)**: 384-d neural sentence embeddings in a Web Worker paired with an instant 64-d concept-cluster embedding fallback (`embedText`, `semanticSearch`) for vocabulary lookup and Moment-to-Signal linking.
  - **K-Dense Local-First BYOK Telegraphic Expansion & Watchdog (`byok.js`)**: Expands telegraphic strips (`"want go park"` → `"I want to go to the park."`) via 3-tier routing (`on-device` SmolLM2-135M / deterministic grammar → local `ollama` `http://localhost:11434` → explicit `egressAck === true` `api`), guarded by a deterministic Watchdog (`watchdogCheck`, calibrated on `willwade/AACConversations`) that preserves negations (`no`, `don't`) and protest (`stop`).
  - **Holistic Diet, Gut-Brain & Solar/Geomagnetic Storm ($K_p$ Index) Biometrics (`biometrics.js`)**: Logs meals, sensory food textures, hydration (mL), GI comfort, and NOAA Planetary $K_p$ geomagnetic storm activity (`0–9`, live NOAA SWPC feed + offline 27-day Bartels Solar Cycle 25 estimator), correlating gut-brain comfort and solar storms with sensory regulation and AAC output.
  - **Clinical Communication Matrix, `supersedes` Lineage & RFC 4180 Export (`clinical.js`)**: Tracks isolated child MLU, unique words, Core vs. Fringe ratio, Communication Matrix intents (`Requesting`, `Protesting`, `Commenting`, `Social`, `Asking`), append-only `supersedes` revision history, and formula-safe CSV/JSON exports.
  - **Open Board Format (`.obf` / `.obz`) Interoperability (`obf.js`)**: Import and export standard `.obf` JSON and `.obz` ZIP board archives.
  - **MASTERNEX PRINCE Federated Learning (`masternex-prince-fl.js`, `fl-core.js`, `backend/flserver.js`)**: Shamir $t$-of-$n$ dropout-resilient secure aggregation + 4-bit TurboQuant Hadamard quantization + Rényi Differential Privacy (`rdp_epsilon`) + Byzantine-robust trimmed-mean aggregation.

---

## Run It (Zero Build)

No build step or bundler is required. Open `index.html` or serve locally for full Web Worker, Service Worker, and microphone/camera support:

```bash
cd luminaac-ultimate
python3 -m http.server 8080
# open http://localhost:8080 (My Voice) and http://localhost:8080/bridge.html (The Bridge)
```

## Optional Zero-Dependency Backend & Full Verification Suite

```bash
cd luminaac-ultimate
node backend/server.js        # Node 18+, zero npm runtime dependencies; listens on :3001
node backend/test.mjs         # 113 backend API tests
node --test tests/unit/*.test.mjs tests/masternex-prince-fl.test.mjs  # 56 unit tests
node --test tests/e2e/*.test.mjs                                      # 218 Playwright E2E tests
```

---

## Repository File Map

| File | Purpose |
|---|---|
| `index.html`, `app.js`, `app.css`, `vocab.js` | **My Voice** core communicator, 30-word motor-invariant Core grid, Fitzgerald Key folders, sentence strip |
| `myvoice.js`, `myvoice.css`, `myvoice-p3.js`, `myvoice-p4.js` | Proactive signal suggestions, *My things* personality page, *Explore quietly*, safe-zone watching, QR/code device pairing, Kokoro voice preview |
| `bridge.html`, `bridge.js`, `bridge.css`, `bridge-plus.js`, `bridge-p3.js`, `bridge-p4.js` | **The Bridge** caregiver & SLP portal: rolling-buffer Moment capture, Signal library, Stories, Insights, Safety geofences, Accounts, AI model manager, Clinical exports |
| `speech.js`, `shared.js` | Unified speech pipeline (`speakUtterance`, `stopSpeech`, child prosody shaping, modeling isolation), cross-tab storage sync, unified backup & wipe |
| `access.js` | WCAG 2.5.2 pointer cancellation, acceptance delay, tremor debounce, hover dwell ring, 1-switch linear/row-column scanning, 2-switch step scanning |
| `slp.js`, `obf.js`, `support.js`, `support.css` | ALS Partner Modeling, GLP/NLA Gestalts & Stage 2 mitigation, Interoception Body Map, Choice Boards, First-Then Schedules, Vocab Search/Morphology, Open Board Format (`.obf`/`.obz`) |
| `symphony.js` | Gamified Sound Symphony Composer, SVG Lip-Viseme Articulatory Coach, pentatonic AMMT note synthesizer, and Acoustic Co-Regulation Studio (Pink/Brown noise, 432 Hz, 528 Hz, 6 Hz Theta) |
| `biometrics.js` | Holistic Diet/Hydration/Gut-Brain logger, NOAA Planetary $K_p$ Solar/Geomagnetic Storm monitor (live + offline Bartels Cycle 25 model), and fact-separated correlation engine |
| `ai.js`, `ai-worker.js` | Web Worker inference for `Kokoro-82M-v1.0-ONNX`, `Xenova/all-MiniLM-L6-v2` embeddings, `SmolLM2-135M-Instruct-ONNX-MHA` expansion, and `wav2vec2` speech emotion |
| `byok.js`, `clinical.js`, `masternex-prince-fl.js` | K-Dense local-first BYOK expansion & Watchdog guardrail, clinical Communication Matrix & `supersedes` lineage, and PRINCE 4-bit TurboQuant federated learning |
| `geo.js`, `emotion.js`, `fl-core.js`, `motion-lite.js` | Haversine geofencing, acoustic prosody + `Human` face emotion fusion, Bonawitz Shamir $t$-of-$n$ secure aggregation, reduced-motion wrapper |
| `backend/` | Zero-dependency Node 18+ server (`server.js`, `store.js`, `flserver.js`, `mail.js`, `webauthn.js`, `test.mjs`) |
| `vendor/` | Permissively licensed vendored dependencies (`Leaflet` BSD-2, `qrcode-generator` MIT, `jsQR` Apache-2.0, `Motion` MIT, `Human` MIT, `OpenMoji` CC BY-SA 4.0) |
| `docs/RESEARCH_EVALUATION.md` | Peer-reviewed scientific literature review (Nature, Cell, PLoS One, Scientific Reports, JSLHR, Microbiome) and HuggingFace/K-Dense/GitHub evaluation |

## Data, Privacy & Credits

Everything stays on the device by default (`localStorage` `luminaac:*` and IndexedDB `luminaac-media`). See `PRIVACY.md`, `RESEARCH-OSS.md`, `THIRD-PARTY.md`, `ACCESSIBILITY.md`, and `docs/RESEARCH_EVALUATION.md`.
Pictograms (online opt-in only): Sergio Palao, ARASAAC (`arasaac.org`, CC BY-NC-SA). Bundled offline symbols: OpenMoji (`openmoji.org`, CC BY-SA 4.0). Maps: Leaflet (BSD-2) and © OpenStreetMap contributors. Font: Atkinson Hyperlegible Next (Braille Institute).
