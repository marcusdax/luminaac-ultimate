# Technical Design & Systems Architecture — LuminAAC Ultimate

## 1. Zero-Build, Local-First Web Architecture
- **Pure ES Modules (`index.html`, `bridge.html`)**: Zero bundler, zero transpilation, and zero runtime npm dependencies. Both experiences share `shared.js`, `speech.js`, `slp.js`, `obf.js`, `symphony.js`, `biometrics.js`, `byok.js`, `clinical.js`, and `masternex-prince-fl.js`.
- **Storage & Cross-Tab Synchronization**:
  - `localStorage` keys `luminaac:settings|log|counts|pairs|custom|plans|pictoIds` (board telemetry) and `luminaac:bridge` (`version: 2` unified state).
  - Media blobs (`moments` audio/video clips and caregiver-recorded `gestalts` voice clips) live in IndexedDB `luminaac-media` (`clips` object store).
  - `persist(db)` dispatches `CustomEvent("luminaac:bridge-updated")` for same-tab components and triggers `window.onstorage` across tabs.
- **Unified Speech Pipeline (`speech.js`)**:
  - Single entry point `speakUtterance(text, opts)` supporting four strict execution modes:
    - `"child"` (default): Speaks aloud and logs to `luminaac:log`, `luminaac:counts`, and `luminaac:pairs` with `mode: "child", actor: "child"`.
    - `"modeling"`: Speaks aloud when `modelingAudio !== false`, logs to `luminaac:log` with `mode: "modeling", actor: "partner"`, and **never** increments child word counts, bigram pairs, or MLU.
    - `"preview"`: Speaks aloud for voice/scan previews without logging (`skipLog: true`).
    - `"explore"`: Silent exploration mode; logs to `db.exploration` without audio output.
  - **Child Voice Prosody Shaping (`shapeProsody`, `applyChildProsody`)**: Applies Web Audio detune (`[-12, +12]` semitones), high-shelf clarity boost, and emotion-linked prosody contours to `Kokoro-82M` PCM audio buffers, with `<40ms` fallback to browser `speechSynthesis` when offline.

---

## 2. SLP, Articulatory & Neuro-Environmental Subsystems

### A. Motor-Plan Invariance & Multi-Modal Switch Access (`vocab.js`, `access.js`)
- **Fixed 30-Word Core Grid**: `CORE` coordinates remain spatially locked across all context rules (`activeRules` supports daytime and overnight wraparound e.g. `21:00 -> 07:00`).
- **WCAG 2.5.2 Pointer Cancellation & Tremor Filtering**: Activation occurs on `pointerup` inside element bounds after `acceptMs` hold duration, followed by `debounceMs` post-tap lockout.
- **3 Switch Scanning Topologies**: 1-Switch Linear Scan (`linear`), 1-Switch Row-Column Scan (`rowcol` with automatic row-loop reset), and 2-Switch Step Scan (`step2`), plus optional spoken scan cues (`scanAudio`).

### B. Gamified Sound Symphony & Lip-Viseme Coach (`symphony.js`)
- **Viseme Articulatory Postures (`VISEME_POSTURES`, `renderVisemeSvg`)**: Renders real-time accessible SVG mouth/lip postures (`bilabial`, `round-vowel`, `open-vowel`, `smile`, `alveolar`, `velar`, `rest`) with oral-motor cues grounded in DTTC and AMMT.
- **Pentatonic Phoneme Synthesizer (`SOUND_BLOCKS`, `composeSymphonyWord`, `playSymphonySequence`)**: Maps 16 core phonemes to a consonant pentatonic scale (`261.63 Hz` to `523.25 Hz`) using dual-oscillator (`triangle` + sub-octave `sine`) Web Audio envelopes, blending 2–4 phoneme blocks (`m + oh + r → "more"`, `w + aa + t + er → "water"`, etc.) into spoken words.
- **Acoustic Co-Regulation Studio (`SOUNDSCAPE_PRESETS`, `startSoundscape`, `stopSoundscape`)**: Generates real-time Paul Kellet `-3 dB/oct` Pink Noise (hyperacusis shield), `-6 dB/oct` Brown Noise, `432 Hz` / `528 Hz` harmonic drones, and `6 Hz` Theta binaural pulses with a safe `0.12` master gain ceiling.

### C. Holistic Diet/Gut-Brain & Solar Storm ($K_p$) Biometrics (`biometrics.js`)
- Logs dietary entries (`logDietEntry`: meal, sensory texture, hydration mL, GI comfort score) and geomagnetic observations (`logSolarObservation`: NOAA Planetary $K_p$ index `0–9`, barometric pressure, sensory state).
- `fetchLiveSolarKp()` queries NOAA SWPC (`noaa-planetary-k-index.json`) with a 2.5s abort timeout and falls back deterministically to `estimateSolarKp()` (27.2753-day Bartels Solar Cycle 25 synodic model).
- `correlateBiometrics()` computes fact-separated co-occurrence rates between geomagnetic storms ($K_p \ge 5$), GI distress, pain logs, and sensory dysregulation, always labeled `"Draft / Estimate — Caregiver or SLP review required"`.

---

## 3. On-Device AI, K-Dense BYOK & Clinical Traceability

- **Web Worker Inference (`ai.js`, `ai-worker.js`)**:
  - `onnx-community/Kokoro-82M-v1.0-ONNX` (`tts` task, 9 presets).
  - `Xenova/all-MiniLM-L6-v2` (`embed` task, 384-d cosine similarity) + deterministic 64-d concept-cluster fallback (`embedText`, `semanticSearchSync`).
  - `onnx-community/SmolLM2-135M-Instruct-ONNX-MHA` (`expand` task).
  - `onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX` (`ser` task) fused with personalized prosody (`emotion.js`) and vendored `Human` face estimation (`vendor/human/`).
- **K-Dense BYOK & Watchdog (`byok.js`)**:
  - 3-tier routing (`on-device` default → local `ollama` `127.0.0.1:11434` → `api` requiring `egressAck === true`).
  - `watchdogCheck()` enforces `<= 120` chars, blocks PII/URLs/unsafe strings, and enforces negation (`no`/`not`/`don't`) and protest (`stop`) preservation.
- **Clinical Communication Matrix & Lineage (`clinical.js`)**:
  - `summarizeClinical()` separates `facts` (with `recordId`, `source`, `timestamp`) from `interpretation` under `CLINICAL_BANNER`.
  - Tracks isolated child MLU, unique words, Core vs. Fringe ratio, Communication Matrix categories, append-only `supersedes` revision chains, and formula-safe RFC 4180 CSV/JSON exports.

---

## 4. Zero-Dependency Backend & MASTERNEX PRINCE Federated Learning (`backend/`)

- **Endpoints (`backend/server.js`, 113 API tests in `backend/test.mjs`)**:
  - Health (`GET /api/health`), Optimistic-Concurrency Sync (`GET/PUT/DELETE /api/sync`), Child Telemetry (`POST /api/sync/telemetry`), Role-Scoped Shares (`GET/POST/DELETE /api/share`), Live SSE Alerts & Safe Zones (`GET/POST /api/alerts`, `/api/alerts/stream`), Predictions (`/api/predictions/*`), Scrypt + WebAuthn Passkey Auth (`/api/auth/*`, `/api/family/*`), Device Pairing (`/api/devices/*`), and Federated Learning (`/api/fl/*`).
- **MASTERNEX PRINCE + Bonawitz Secure Aggregation (`fl-core.js`, `masternex-prince-fl.js`, `backend/flserver.js`)**:
  - Supports Shamir $t$-of-$n$ dropout-resilient unmasking over $\text{GF}(2^{521}-1)$ with zCDP privacy accounting AND PRINCE 4-bit TurboQuant randomized Hadamard compression (`compressGradientTurboQuant4Bit`), Rényi DP (`rdp_epsilon`), and Byzantine-robust coordinate-wise trimmed-mean aggregation (`aggregateTrimmedMean`).
