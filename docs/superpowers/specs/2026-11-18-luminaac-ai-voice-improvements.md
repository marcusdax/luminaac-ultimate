# Design Doc: LuminAAC AI Voice Improvements
Date: 2026-11-18  
Status: Approved (user confirmed "let's start at the top and work our way down — i want all these improvements added")

## Intent and Why
LuminAAC is a free, offline-first AAC app used by nonverbal people with ALS, autism, cerebral palsy, aphasia, and locked-in syndrome. It already has: federated learning, Kokoro TTS, speech emotion recognition, switch scanning, and a transformers.js web worker. The gap is that prediction is rule-based (not neural), speech is English-only, and the full Whisper/MMS model family is unused. This design adds those layers without breaking the existing no-build, local-first architecture.

## Goals
1. Neural next-word prediction using on-device ONNX via transformers.js
2. 1,100-language TTS via facebook/mms-tts-{lang} models
3. Full-utterance speech recognition via Whisper tiny (beyond the small vocab in asr.js)
4. Eye gaze access via WebGazer.js
5. PRINCE federated personalization tied to MASTERNEX.os
6. SLP/clinician dashboard and IEP report export
7. Twilio phone call integration
8. AI visual schedule generation (CLIP symbols)

## Non-Goals
- Replace existing rule-based prediction (augment it)
- Break offline-first (all models cached to service worker)
- Require an account (zero-config default)
- Change the existing federated learning pipeline (fl-core.js)

## Anti-Goals
- Never send audio to a server without explicit opt-in
- Never collect PII for training without family consent
- Never add a build step (vanilla ES modules only)

## Constraints
- Vanilla ES modules, no bundler
- Models must cache offline (service worker / transformers-cache)
- Must work on iPad Safari (key device for AAC users)
- Each new model must be explicitly downloaded once then work offline
- transformers.js is already on CDN: @huggingface/transformers@3.7.5

## Architecture Decisions

### Tier 1: Neural prediction + MMS TTS + Whisper ASR
**Decision:** Extend ai-worker.js to handle three new tasks: `asr`, `predict`, `tts-mms-{lang}`
- `asr`: onnx-community/whisper-tiny (150MB, q8) — WebGPU with WASM fallback
- `predict`: Xenova/distilgpt2 (85MB, q8) — WASM only (no GPU needed for small model)
- `tts-mms-{lang}`: facebook/mms-tts-{lang} (50MB per language, fp32) — WASM only
Extend ai.js with transcribe(), predictWords(), speakMms() APIs.
Create neural-features.js for UI integration: prediction bar above board, MMS voice routing.

### Tier 2: Eye gaze + switch scan enhancement
**Decision:** Add WebGazer.js for eye gaze. The existing scan-core.js handles switch scanning; wrap it with dwell selection support.

### Tier 3: Supabase backend
**Decision:** Add supabase-client.js as optional sync backend for The Bridge and vocabulary. Existing Upstash/Vercel stays default; Supabase activates via settings.

### Tier 4: PRINCE + SLP dashboard
**Decision:** The existing flserver.js and fl-core.js implement the PRINCE protocol. Add SLP dashboard view and IEP report export (PDF via browser print).

### Tier 5: CLIP symbols + stories
**Decision:** Add clip-symbols.js for zero-shot image classification to suggest relevant symbols.

## What's Left to the Builder (Implementation)
See ROADMAP.md for prior context. Implementation starts Wave 1 immediately after this doc.
