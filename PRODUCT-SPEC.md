# LuminAAC Ultimate — Product Specification & Clinical Feature Map

LuminAAC Ultimate ("The Empathic Guardian") is a local-first, clinically grounded Augmentative and Alternative Communication (AAC) and holistic neurodivergent co-regulation platform. Every feature below is **100% built, tested, and verified** in this repository (`387+` automated unit, backend, and Playwright E2E tests).

**Status key:** ✅ Built & Verified in Production Code · 🔭 Optional External Hardware Extension (LuminNode Multi-Camera / AR Glasses)

---

## Core Architectural Pillars

1. **You Are Your Child's Best Translator.** Caregiver and Speech-Language Pathologist (SLP) knowledge is the ground truth. Every AI estimate, semantic suggestion, and biometric correlation is explicitly labeled (`"Draft / Estimate — Caregiver or SLP review required"`) and only enters longitudinal learning when confirmed.
2. **The Symbiotic Loop.** Child expresses → rolling buffer captures → caregiver explains → on-device semantic & federated models learn → *My Voice* adapts while keeping core motor coordinates 100% invariant.
3. **Motor-Plan Invariance & Clinical SLP Rigor.** Built on Fitzgerald Key color-coding, a fixed 30-word Core grid, Aided Language Stimulation (ALS) Partner Modeling, Gestalt Language Processing (GLP / NLA Stages 1–4), Interoception Body Mapping, Auditory-Motor Mapping Training (AMMT) Sound Symphony, and Open Board Format (`.obf` / `.obz`) interoperability.
4. **Holistic Neuro-Environmental & Gut-Brain Support.** Recognizes that a nonverbal child's communication is shaped by their sensory environment, acoustic comfort, gastrointestinal health, hydration, sleep, and geomagnetic/barometric fluctuations.
5. **Private by Default, Zero-Build, Offline-First.** 100% vanilla ES modules + zero-dependency Node 18+ backend. Works offline as an installable PWA with zero unconsented network egress.

---

## 1. My Voice — The Child's Communicator (`index.html`)

| Capability | Status | Implementation & Clinical Grounding |
|---|---|---|
| **Motor-Invariant 30-Word Core Grid + Contextual Fringe Folders** | ✅ | `vocab.js`, `app.js` — Fixed 6-column Fitzgerald Key layout (`little`, `action`, `describe`, `place`, `thing`, `people`, `social`, `neg`). Spatial coordinates never shift across context rules (`School`, `Bedtime`, etc.), preserving motor automaticity. |
| **Kokoro-82M Expressive Voices + Child Prosody Shaping** | ✅ | `ai.js`, `ai-worker.js`, `speech.js` — 9 natural ONNX voices (`af_sky`, `af_nicole`, `am_puck`, `bf_isabella`, `af_heart`, `af_bella`, `am_michael`, `bf_emma`, `bm_george`) with Web Audio pitch/semitone shifting (`[-12, +12]` semitones), warmth filtering, emotion-linked prosody (`shapeProsody`), and instant `<40ms` offline fallback to `speechSynthesis`. |
| **Aided Language Stimulation (ALS) Partner Modeling Mode** | ✅ | `slp.js`, `support.js`, `app.js`, `speech.js` — Caregivers toggle Partner Modeling (`#modelToggle`) to model word combinations with a 5-step highlight trail (`is-modeled`). Modeled turns are logged (`mode: "modeling", actor: "partner"`) and **strictly excluded** from the child's word counts, bigram predictions, and MLU. |
| **Gestalt Language Processing (GLP / NLA Stages 1–4)** | ✅ | `slp.js`, `support.js` — Supports whole-script gestalts (`Stage 1` verbatim speech or recorded caregiver voice clip `audioClipId`) and `Stage 2` **Mitigate into strip** (`mitigateGestalt`), splitting scripts into recombinable phrase chunks in the sentence bar. |
| **Gamified "Sound Symphony Composer" & Lip-Viseme Articulatory Coach** | ✅ | `symphony.js`, `support.js` — Grounded in Auditory-Motor Mapping Training (AMMT; Wan et al., 2011; Chenausky et al., 2016) and DTTC (Strand et al., 2014). Interactive SVG mouth/lip posture coach (`bilabial`, `round-vowel`, `open-vowel`, `smile`, `alveolar`, `velar`) paired with 16 pentatonic phoneme instrument blocks that blend 2–4 sounds (`m + oh + r → "more"`, `w + aa + t + er → "water"`, `m + aa + m + aa → "mama"`, `h + eh + l + p → "help"`) into spoken words. |
| **Acoustic Frequency Co-Regulation Studio** | ✅ | `symphony.js`, `support.js` — Pure Web Audio API zero-dependency therapeutic soundscapes: **Warm Pink Noise Shield** (`-3 dB/oct` hyperacusis masking), **Deep Brown Noise Blanket** (`-6 dB/oct` grounding), **432 Hz Warm Harmonic Drone**, **528 Hz Gentle Chime Pad**, and **6 Hz Theta Co-Regulation Pulse** (`200 Hz / 206 Hz` binaural beat). |
| **Interoception Pain Body Map & Sensory Quick-Bar** | ✅ | `slp.js`, `support.js` — Persistent 1-tap Sensory Quick-Bar (`Stop`, `No`, `Help`, `Bathroom`, `Break`) plus a 14-region Body & Pain Check-In (`head`, `eyes`, `ears`, `mouth`, `throat`, `chest`, `stomach`, `skin`, `back`, `arm`, `hand`, `leg`, `foot`, `private`) with 7 sensations (`hurts`, `sharp`, `itchy`, `hot`, `cold`, `tight`, `sick`) and immediate relief phrases. |
| **First-Then Visual Schedules, Choice Boards & Social Stories** | ✅ | `slp.js`, `support.js`, `myvoice.js` — Unified First-Then step schedules (`mergeSchedules`), 2–8 item Choice Boards (`choiceSentence`), and LunaScript Social Stories. |
| **Vocabulary Search & Real-Time Morphology Inflection Bar** | ✅ | `slp.js`, `support.js` — Instant prefix/stem/semantic search (`#vsearch`) and automatic morphological inflection chips (`#morphBar`: `-s`, `-ing`, `-ed`, `-er`, `-est`, irregulars) for the last tapped word. |
| **Multi-Modal Motor & Switch Accessibility** | ✅ | `access.js` — WCAG 2.5.2 pointer cancellation (triggers on `pointerup`), configurable acceptance delay (`acceptMs`), post-tap tremor bounce lockout (`debounceMs`), hover/eye-gaze dwell ring, 1-Switch Linear Scan, 1-Switch Row-Column Scan (`rowcol`), 2-Switch Step Scan (`step2`), and auditory scan preview cues (`scanAudio`). |
| **WCAG 2.1 AA/AAA Visual Themes & Low-Arousal Sensory Mode** | ✅ | `tokens.css`, `app.css`, `myvoice.css`, `bridge.css`, `phase4.css` — Day, Night, High-Contrast (`>= 7:1` AAA), and Low-Arousal mode (`body.low-arousal` zero-animation, muted sensory palette). |
| **Guardian Emergency Alerts & Safe-Zone Geofencing** | ✅ | `myvoice-p3.js`, `geo.js`, `shared.js` — 1-tap `"I need help"` and `"Take me home"` alerts with live SSE broadcast to The Bridge, optional parent-consented Haversine geofencing with 25m hysteresis, and deadman heartbeat monitoring. |

---

## 2. The Bridge — Caregiver, School & SLP Portal (`bridge.html`)

| Capability | Status | Implementation & Clinical Grounding |
|---|---|---|
| **Magic Moment Rolling Buffer & Annotation Studio** | ✅ | `myvoice.js`, `bridge.js` — Two staggered `MediaRecorder` instances maintain a continuous 5–60s rolling audio/video buffer without keeping unkept recordings in memory. Caregivers annotate meaning, intent, and phrase in seconds. |
| **Offline Semantic Search & Moment-to-Signal Linking (`all-MiniLM-L6-v2`)** | ✅ | `ai.js`, `ai-worker.js`, `bridge.js` — 384-d `Xenova/all-MiniLM-L6-v2` embeddings in a Web Worker paired with an instant deterministic 64-d concept-cluster fallback (`embedText`, `semanticSearchSync`) for semantic symbol discovery and `smart()` signal matching. |
| **K-Dense Local-First BYOK Telegraphic Expansion & Watchdog Guardrail** | ✅ | `byok.js`, `ai-worker.js` — Expands telegraphic AAC strips (`"want go park"` → `"I want to go to the park."`) via 3-tier routing (`on-device` SmolLM2-135M / deterministic grammar → local `ollama` `127.0.0.1:11434` → explicit `egressAck === true` `api`). Guarded by `watchdogCheck` (calibrated on `willwade/AACConversations`) to enforce negation/protest invariance and block PII/unsafe output. |
| **Holistic Diet, Gut-Brain & Solar/Geomagnetic Storm ($K_p$ Index) Biometrics** | ✅ | `biometrics.js`, `support.js` — Tracks meals, sensory food textures (`crunchy`, `smooth`, `chewy`, `warm-liquid`, `cold-crisp`), hydration (mL), GI comfort (`comfortable`, `mild-gas`, `constipated`, `reflux`, `stomach-ache`), and NOAA Planetary $K_p$ geomagnetic storm index (`0–9`, live SWPC feed + offline 27-day Bartels Solar Cycle 25 estimator). Computes fact-separated correlations (`correlateBiometrics`) between solar storms, GI discomfort, pain logs, and sensory dysregulation. |
| **Clinical Communication Matrix, `supersedes` Lineage & RFC 4180 Exports** | ✅ | `clinical.js`, `bridge-plus.js` — Computes isolated child MLU, unique word count, Core vs. Fringe ratio, and Communication Matrix breakdown (`Requesting`, `Protesting`, `Commenting`, `Social`, `Asking`). Preserves append-only `supersedes` revision history and exports formula-safe RFC 4180 CSV and JSON. |
| **Open Board Format (`.obf` / `.obz`) Import & Export** | ✅ | `obf.js`, `support.js` — Full import and export of `.obf` JSON and `.obz` ZIP packages compatible with CoughDrop, Cboard, Snap, and Grid, complete with CRC32 validation and path-traversal security guards. |
| **On-Device Emotion Fusion (Acoustic Prosody + `wav2vec2` + `Human` Face)** | ✅ | `emotion.js`, `ai-worker.js`, `vendor/human/` — Fuses personalized pitch/loudness/tempo z-scores with opt-in `wav2vec2` speech emotion recognition and vendored `Human` facial expression analysis. Always requires caregiver confirmation. |
| **MASTERNEX PRINCE 4-Bit TurboQuant Federated Learning** | ✅ | `masternex-prince-fl.js`, `fl-core.js`, `backend/flserver.js` — Combines Bonawitz Shamir $t$-of-$n$ dropout-resilient secure aggregation and zCDP privacy accounting with 4-bit randomized Hadamard rotation (`TurboQuant`), Rényi Differential Privacy (`rdp_epsilon`), and Byzantine-robust coordinate-wise trimmed-mean aggregation. |
| **Zero-Dependency Node 18+ Backend (Accounts, Passkeys, Pairing, Sync, SSE)** | ✅ | `backend/server.js`, `backend/store.js`, `backend/mail.js` — Scrypt auth, WebAuthn ES256/RS256 passkeys, QR + 6-digit device pairing, role-scoped share links (`parent`, `teacher`, `therapist`, `family`), optimistic-concurrency sync, and child telemetry push (`POST /api/sync/telemetry`). |
