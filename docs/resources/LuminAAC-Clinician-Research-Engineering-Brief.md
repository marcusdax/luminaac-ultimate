# LuminAAC Ultimate — Clinician, Research & Systems Engineering Brief

*Scientific Rationale, Peer-Reviewed Evidence Base, On-Device AI & Privacy Architecture (v0.8)*

## 1. Executive Summary & Verification Baseline

LuminAAC Ultimate is a zero-build, local-first ES-module Progressive Web Application (PWA) and zero-dependency Node 18+ backend engineered for nonverbal and minimally speaking autistic individuals. Version 0.8 is verified by 387 passing automated tests across three suites: 113 backend API/cryptography tests (backend/test.mjs), 56 unit tests (tests/unit/*.test.mjs + tests/masternex-prince-fl.test.mjs), and 218 Playwright Chromium end-to-end tests (tests/e2e/*.test.mjs).

## 2. Peer-Reviewed Scientific & Clinical Evidence Base

| Clinical / Scientific Domain | Primary Peer-Reviewed Citations (PMID / DOI) | LuminAAC Module & Implementation |
| --- | --- | --- |
| Auditory-Motor Mapping Training (AMMT) & Melodic Speech Scaffolding | Wan et al. (2011) PLoS One, PMID: 21980480 (10.1371/journal.pone.0025505); Chenausky et al. (2016) PLoS One, PMID: 27829034; Yan et al. (2021) JSLHR, PMID: 34705567 | symphony.js, support.js — Gamified Sound Symphony Composer pairing 16 pentatonic phoneme blocks (261.63–523.25 Hz) with word blending ('more', 'water', 'mama', 'help'). |
| Articulatory Motor Planning, Childhood Apraxia & Visual Biofeedback | Strand et al. (2014) J Commun Disord, PMID: 25092638; Giggins et al. (2013) J Neuroeng Rehabil, PMID: 23777436 | symphony.js — Animated SVG Lip-Viseme Articulatory Coach (bilabial, round-vowel, open-vowel, smile, alveolar, velar, rest) with oral-motor cues. |
| Auditory Cortex Pitch Processing, Hyperacusis & Polyvagal Co-Regulation | Belin, Zatorre et al. (2000) Nature, PMID: 10659849 (10.1038/35002078); Zatorre et al. (2002) Trends Cogn Sci, PMID: 11849614; Porges (2007) Biol Psychol, PMID: 17049418 | symphony.js, speech.js — Kokoro-82M child prosody shaping + Web Audio Pink Noise (-3 dB/oct), Brown Noise (-6 dB/oct), 432/528 Hz harmonic pads, and 6 Hz Theta pulse. |
| Gut-Brain-Microbiome Axis in Autism Spectrum Disorder | Hsiao et al. (2013) Cell, PMID: 24315484 (10.1016/j.cell.2013.11.024); Kang et al. (2017) Microbiome, PMID: 28122648; Sharon et al. (2019) Cell, PMID: 31150625 | biometrics.js, slp.js — Meal, sensory texture, hydration (mL), and GI comfort logging correlated within a 12h window against Interoception Pain Body Map and protest logs. |
| Solar / Geomagnetic Activity (Kp Index), HRV & Melatonin | Alabdulgader, McCraty et al. (2018) Scientific Reports (Nature Portfolio), PMID: 29422633 (10.1038/s41598-018-20932-x); Burch et al. (1999) Neurosci Lett, PMID: 10465710 | biometrics.js — Live NOAA SWPC planetary Kp index monitor + deterministic 27.2753-day Bartels Solar Cycle 25 offline model and storm vs. quiet dysregulation correlation. |

## 3. Speech-Language Pathology (SLP) & Motor Access Architecture

- **Motor-Planning Spatial Invariance (vocab.js, app.js):** The 30-word Fitzgerald-Key Core vocabulary grid remains at fixed row/column coordinates across all context rules, folder transitions, and AI suggestions so learners build automatic motor plans.
- **Aided Language Stimulation (ALS) Partner Modeling Isolation (slp.js, speech.js, clinical.js):** When a caregiver or SLP activates Partner Modeling (#modelToggle), tapped tiles display a 5-step visual highlight trail (is-modeled) and log with mode: 'modeling', actor: 'partner'. These entries are strictly excluded from child word counts (luminaac:counts), bigram pairs (luminaac:pairs), and child Mean Length of Utterance (MLU).
- **Gestalt Language Processing (GLP / NLA Stages 1–4) (slp.js, support.js):** Supports whole-utterance intonation scripts (Stage 1 verbatim speech or caregiver voice clip audioClipId) and Stage 2 mitigation (mitigateGestalt), which decomposes scripts into editable phrase chunks inside the sentence strip.
- **Interoception Pain Body Map & Sensory Quick-Bar (slp.js, support.js):** Provides an always-visible 5-button Sensory Quick-Bar (Stop, No, Help, Bathroom, Break) and a 14-region scannable Body Map with 7 sensation descriptors and immediate relief requests.
- **Open Board Format (.obf / .obz) Interoperability (obf.js):** Full import and export of .obf JSON and .obz ZIP archives (manifest.json, load_board links, vocalization vs. label, Fitzgerald color mapping, CRC32 verification, and path-traversal protection).
- **WCAG 2.1 AA/AAA Switch & Motor Accessibility (access.js):** Implements WCAG 2.5.2 pointerup activation, configurable hold acceptance delay (acceptMs), post-tap tremor bounce lockout (debounceMs), hover/gaze dwell ring, 1-Switch Linear Scan, 1-Switch Row-Column Scan (with row-loop escape), and 2-Switch Step Scan.

## 4. On-Device HuggingFace Models, K-Dense BYOK & Clinical Traceability

| Subsystem | Model / Algorithm | Execution & Guardrail Contract |
| --- | --- | --- |
| Expressive Child TTS (ai.js, speech.js) | onnx-community/Kokoro-82M-v1.0-ONNX (Apache-2.0, q8 WASM) + Web Audio Biquad/Detune prosody | 9 voices (af_sky, af_nicole, am_puck, bf_isabella, etc.), [-12, +12] semitone shift, emotion-linked rate/pitch shaping, and <40ms offline fallback to speechSynthesis. |
| Semantic Symbol & Signal Search (ai.js, bridge.js) | Xenova/all-MiniLM-L6-v2 (Apache-2.0, 384-d) + 64-d deterministic concept-cluster fallback | Powers offline semantic lookup ('thirsty' -> drink/water) and Bridge smart() Moment-to-Signal ranking with zero UI blocking. |
| Telegraphic Utterance Expansion (byok.js, ai-worker.js) | onnx-community/SmolLM2-135M-Instruct-ONNX-MHA (Apache-2.0) / Local Ollama / Gated API | 3-tier local-first routing (0 network egress by default; API requires egressAck === true). Guarded by watchdogCheck calibrated on willwade/AACConversations (<=120 chars, negation/protest invariance, PII/profanity block). |
| Multimodal Emotion Fusion (emotion.js, vendor/human) | Acoustic prosody z-scores + wav2vec2 SER (q8 ONNX) + Human face model (MIT) | Personalized against the child's confirmed baseline (n >= 3). Capped confidence, always labeled as an unconfirmed estimate until caregiver review. |
| Clinical Communication Matrix & Lineage (clinical.js) | Isolated child MLU, Core/Fringe ratio, Communication Matrix, supersedes chain, RFC 4180 CSV | Every summary carries CLINICAL_BANNER ('Draft / Estimate — Caregiver or SLP review required'), cites source record IDs, preserves append-only supersedes history, and neutralizes spreadsheet formula injection. |

## 5. Cryptographic Privacy & MASTERNEX PRINCE Federated Learning

- **Bonawitz Shamir t-of-n Dropout-Resilient Secure Aggregation (fl-core.js, backend/flserver.js):** Clients mask 17-feature weight deltas using pairwise ECDH P-256 PRG masks and Shamir secret shares over GF(2^521 - 1), tracked under zero-Concentrated Differential Privacy (zCDP -> (epsilon, delta)-DP).
- **MASTERNEX PRINCE 4-Bit TurboQuant & Trimmed Mean (masternex-prince-fl.js):** Adds seed-synchronized randomized Hadamard rotation, 4-bit stochastic quantization (8x bandwidth compression), Rényi Differential Privacy accounting (rdp_epsilon), and coordinate-wise Byzantine-robust trimmed-mean aggregation.
