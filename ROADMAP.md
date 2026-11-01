# Roadmap

## v0.11: Sound Path and Potty Path mechanics (phase 9)
Sound Path increment A from `docs/SOUND-PATH.md` (ladder, practice engine, Sing and Tap, Word Train, Sound World, Say it with me, judge bar, inventory, SLP sheet) and Potty Path M1–M7 from `docs/POTTY-PATH-MECHANICS.md`, both behind feature flags that are off by default. Next: Sound Path increment B (family video models, Mouth Mirror with on-device face landmarks), then Safety Links (tracker cards, "if found" page, webhook alerts for door and pool sensors).

## v0.10: Potty Path (phase 8)
A toilet-learning and communication module built from the expert-reviewed blueprint in `docs/POTTY-PATH.md`, with all three increments shipped behind `access.potty` (off by default). It covers the one-device core, then assessment and hints, then two devices (QR and end-to-end encrypted server sync). Next: a 5-family pilot with a paid autistic-adult advisory panel and an SLP/BCBA safety review before the guide promotes it. Sensors and prediction stay deferred.

## Now (this build, v0.6, phase 4)
Phase 4 adds:
- an opt-in speech-emotion model (transformers.js, WebGPU with WASM fallback) fused with prosody, still confirmed by a caregiver
- Kokoro natural voices with preview, falling back to device voices
- email confirmation and password reset (single-use hashed tokens, rate limits, built-in SMTP client)
- secure aggregation that survives dropouts (Shamir t-of-n), quorum, phase timeouts and a per-device ε cap
- installable PWAs with an offline cache, a server "quiet device" alert, and a Capacitor scaffold for background geofencing
- the face estimate vendored and tested on sample faces

## Phase 3 (v0.5)
Phase 3 adds:
- safe zones (geofencing) with consent, and location on "Take me home"
- device pairing by QR code or 6-digit code, with revoke
- accounts with scrypt passwords, passkeys, sessions, roles, family and child profiles, and invites
- on-device feeling estimates from voice, with optional face, confirmed by a caregiver
- opt-in federated learning with clipping, DP noise and secure-aggregation masks, plus a FedAvg server
- OpenMoji fallback pictures (no more ARASAAC 404s)
- restrained motion

## Phase 2 (v0.4)
Everything from v0.3, plus: help and "take me home" alerts that reach the Bridge live, social stories and first/then routines, speech practice with caregiver-chosen rewards, "Not these" feedback and suggestion acceptance stats, milestones, Large/Playful/Focus modes with board zoom, dwell selection and switch scanning, and a working Node backend for sync, share links, alerts and the repo's predictions API.

v0.3 base: Magic-moment rolling buffer, annotation studio, signal library with confidence, proactive suggestions, My things with play-moment, explore mode, day viewer, vocabulary rules, insights + personality map, role-scoped sharing preview, privacy controls, onboarding, logo set.

## Next (v0.4–0.6)
- Photo symbols (camera → button), recorded caregiver voice for buttons
- Two-switch step scanning and row/column scanning (auto-scan with one switch is done)
- Pediatric, clinical, and senior modes
- End-to-end encryption of the synced document (sync itself is done)
- Live invites for teachers/therapists, shared notes in real time
- Push notifications for alerts (Web Push), 
- Account deletion endpoint, per-child data partitions (child profiles exist; the synced document is still per family)
- Validate the speech-emotion model with caregivers (it's trained on adult acted speech) and fine-tune on confirmed moments
- Build and ship the Capacitor apps (store review, real-device geofence testing); Web Push for alerts
- Mulberry symbol pack for older users; polygon zones (Turf)

## Later (v1)
- On-device audio embeddings (wav2vec2 / HuBERT, WebGPU) for unsupervised clustering of vocalizations
- Pose/gesture keypoints (MediaPipe) and a small per-child classifier trained from annotations
- Real-time proactive suggestions from live sensing; anomaly-triggered auto-capture
- LLM help for turning annotations into phrases and button suggestions
- Continuous day recording with click-to-clip (opt-in, short retention)

## Vision
- LuminNode multi-camera kits, depth sensing, IoT context
- AR "point at it" phrases
- Validated emotion and frustration recognition (clinical study)
- Research data program built on the federated pipeline
