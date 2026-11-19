# LuminAAC Ultimate — Product Roadmap & Milestone History

## Shipped & Verified in Production (`v0.8.0` — 387/387 Automated Tests Passing)

### Milestone 5 & Round 2 R&D (`v0.8.0` — Current Release)
- ✅ **Gamified Sound Symphony Composer & Lip-Viseme Articulatory Coach (`symphony.js`, `support.js`)**: Grounded in Auditory-Motor Mapping Training (AMMT; Wan et al., 2011; Chenausky et al., 2016) and DTTC (Strand et al., 2014). Interactive SVG mouth/lip posture coach (`bilabial`, `round-vowel`, `open-vowel`, `smile`, `alveolar`, `velar`, `rest`) + 16 pentatonic phoneme instrument blocks that blend 2–4 sounds (`m + oh + r → "more"`, `w + aa + t + er → "water"`, `m + aa + m + aa → "mama"`, `h + eh + l + p → "help"`) into spoken words.
- ✅ **Acoustic Frequency Co-Regulation Studio (`symphony.js`)**: Pure Web Audio API synthesis for **Warm Pink Noise Shield** (`-3 dB/oct` hyperacusis masking), **Deep Brown Noise Blanket** (`-6 dB/oct`), **432 Hz Warm Harmonic Drone**, **528 Hz Gentle Chime Pad**, and **6 Hz Theta Co-Regulation Pulse**.
- ✅ **Holistic Diet/Gut-Brain & Solar/Geomagnetic Storm ($K_p$ Index) Biometrics (`biometrics.js`)**: Logs meals, sensory food textures, hydration (mL), GI comfort, and NOAA Planetary $K_p$ geomagnetic activity (`0–9`, live NOAA SWPC feed + deterministic offline 27-day Bartels Solar Cycle 25 estimator) with fact-separated correlation insights (`correlateBiometrics`).

### Milestones 1–4 (`v0.7.0`)
- ✅ **M1 — Unified Speech Pipeline, Telemetry Sync & Motor/Switch Access**:
  - Unified `speakUtterance` pipeline (`speech.js`) with strict `child` / `modeling` / `preview` / `explore` isolation.
  - Child telemetry push (`POST /api/sync/telemetry`), overnight rule wraparound (`activeRules`), and unified backup/restore (`exportUnifiedBackup`, `importUnifiedBackup`).
  - WCAG 2.5.2 pointer cancellation, acceptance delay (`acceptMs`), post-tap tremor debounce (`debounceMs`), hover dwell ring, 1-Switch Linear Scan, 1-Switch Row-Column Scan (`rowcol`), and 2-Switch Step Scan (`step2`).
  - WCAG 2.1 AA/AAA contrast across Day, Night, High-Contrast, and Low-Arousal (`body.low-arousal`) themes.
- ✅ **M2 — SLP & Autism Care Modalities + Open Board Format (`.obf` / `.obz`)**:
  - Aided Language Stimulation (ALS) Partner Modeling Mode (`slp.js`, `support.js`) with 5-word visual trail.
  - Gestalt Language Processing (GLP / NLA Stages 1–4) with caregiver voice recording and Stage 2 **Mitigate into strip** (`mitigateGestalt`).
  - Interoception 14-region Pain Body Map, 7 sensations, relief suggestions, and persistent 5-button Sensory Quick-Bar (`Stop`, `No`, `Help`, `Bathroom`, `Break`).
  - Choice Boards (2–8 options), Unified First-Then Schedules (`mergeSchedules`), Vocabulary Search (`#vsearch`), and Morphology Inflection Bar (`#morphBar`).
  - Full Open Board Format `.obf` / `.obz` import and export (`obf.js`) with CRC32 and path-traversal security.
- ✅ **M3 & M4 — HuggingFace On-Device AI, Child Prosody, K-Dense BYOK & Clinical Traceability**:
  - Expanded `Kokoro-82M-v1.0-ONNX` presets (`af_sky`, `af_nicole`, `am_puck`, `bf_isabella`, etc.) + Web Audio child prosody shaping (`shapeProsody`, `[-12, +12]` semitones).
  - Offline semantic embeddings (`Xenova/all-MiniLM-L6-v2` + deterministic 64-d concept-cluster fallback) for symbol search and Bridge `smart()` linking.
  - K-Dense local-first BYOK telegraphic expansion (`byok.js`, `SmolLM2-135M-Instruct-ONNX-MHA` / Ollama / gated API) with deterministic Watchdog (`watchdogCheck`) calibrated on `willwade/AACConversations`.
  - Clinical Communication Matrix (`clinical.js`), isolated child MLU, append-only `supersedes` lineage, RFC 4180 CSV/JSON export, and MASTERNEX PRINCE 4-bit TurboQuant federated learning (`masternex-prince-fl.js`).

### Phases 1–4 Foundation (`v0.3–v0.6`)
- ✅ Magic-moment rolling buffer, Signal library with Beta confidence, Safe-zone geofencing (`geo.js`), Scrypt + WebAuthn passkeys, QR/6-digit device pairing, `wav2vec2` + `Human` emotion fusion, Shamir $t$-of-$n$ dropout-resilient secure aggregation, and installable offline PWA (`sw.js`).

---

## Future Horizon (`v1.0+` External Hardware & Clinical Trials)
- 🔭 **Multi-Center SLP Clinical Efficacy Trial**: Longitudinal cohort study measuring time-to-understood, child MLU growth, and AMMT Sound Symphony vocalization gains across 100+ families.
- 🔭 **LuminNode Ambient Room Kit & Wearable Biometrics**: Optional local BLE heart-rate variability (HRV) and electrodermal activity (EDA) integration to pair real-time vagal tone with geomagnetic $K_p$ and acoustic co-regulation presets.
- 🔭 **AR Point-and-Speak Companion**: Camera-assisted object recognition that dynamically stages fringe symbols into a temporary context bar without moving the 30-word Core grid.
