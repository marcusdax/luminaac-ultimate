# LuminAAC product spec (feature map)

Source: Google Doc "LuminAAC: The Empathic Guardian". This maps every feature the doc describes to its status in this build.

**Status key:** ✅ built · 🟡 simulated / partial (works in the prototype with on-device heuristics or sample data) · 🔭 future (needs hardware, a backend, or ML models)

## Pillars
1. **You are your child's best translator.** Caregiver knowledge is the ground truth.
2. **The symbiotic loop.** Child expresses → sensors capture → caregiver explains → AI learns → My Voice becomes more personal.
3. **Free to families.** Core access is a right.
4. **Private by default.** Local first; sharing is a choice.

## Core loop
| Doc feature | Status | Where |
|---|---|---|
| Magic moment capture: one tap keeps the last 15 s (sound, video, AAC context) | ✅ | Bridge → Today. Two staggered MediaRecorders form a rolling buffer; AAC words spoken in the last minute are attached |
| Adjustable clip length | ✅ | Privacy → Moment length (5–60 s) |
| "What did that mean?" open-text annotation | ✅ | Annotation sheet |
| Smart suggestions while typing (link to existing button / create new) | 🟡 | Keyword match to existing signals; phrase guessing from text |
| AI learns: sound + gesture + context = meaning, per child | 🟡 | Signals store cues, contexts, meaning, phrase; confidence = Beta(confirmations, rejections) |
| Active learning: "I've seen this in three situations, does it mean something?" | 🟡 | "LuminAAC is wondering" questions (seeded) + flagged unexplained moments |
| Feedback loop: suggestion used → stronger | ✅ | Tapping a suggestion in My Voice adds a confirmation |

## My Voice (primary user)
| Doc feature | Status | Where |
|---|---|---|
| Speech output from symbols | ✅ | Original board + `speechSynthesis` |
| Context-aware grid (time of day, place, routines) | ✅ / 🟡 | Next-word ideas (original); context line and suggestion ranking by part of day + place; page rules |
| Proactive suggestions ("Go to park?", "My head hurts") | 🟡 | Suggestion chips ranked from learned signals; real-time sensing is future |
| Personality page | ✅ | "My things" |
| Play-moment output (button plays a caregiver clip) | ✅ | My things buttons linked to a recorded moment |
| Exploration & learning mode (no speech, taps logged) | ✅ | "Explore quietly"; reviewed in Bridge → Vocabulary |
| Calming, low-clutter, color schemes | ✅ | Calm view, day/night/contrast themes, "keep the screen still" |
| Multi-modal input: touch, switch, eye-gaze, vocalization | 🟡 | Touch, keyboard, dwell selection, one-switch auto-scanning; eye-gaze via dwell; vocalization input future |
| Guardian safety: emergency alert, "Go home" | ✅ / 🟡 | "I need help" and "Take me home" buttons speak, show an undo, raise an alert in every open Bridge, and push it to the backend (SSE) when sync is on. Geofencing/location is future |
| Pediatric / Clinical / Senior modes | 🟡 | Large, Playful and Focus modes + board size to 300% (Bridge → Vocabulary); full age modes in roadmap |
| AR-assisted communication (point camera at an apple) | 🔭 | Roadmap |

## The Bridge (caregiver)
| Doc feature | Status | Where |
|---|---|---|
| Day viewer timeline: moments, AAC event log, AI event markers | ✅ | Bridge → Today |
| Video thumbnails from multiple LuminNode cameras, synced audio waveform | 🔭 / 🟡 | One device camera; stylized waveforms |
| Click-to-clip from any point in a continuous day recording | 🔭 | Needs continuous recording + storage backend; prototype keeps only tapped moments (privacy) |
| Annotation studio | ✅ | Sheet with playback, smart linking |
| Vocabulary manager: add buttons with symbols/photos/videos | ✅ | Emoji symbol + linked moment recording |
| Review AI vocabulary suggestions | ✅ | Questions with "Add that button" |
| Context rules (School page weekdays 8–3) | ✅ | Page rules |
| Insight dashboard: trends, personality map, AI questions | ✅ | Bridge → Insights |
| Share discoveries with teachers / therapists / family | 🟡 | Invites, role-scoped previews, shared notes, printable guide, share file. Live share links and multi-device sync via `backend/` ✅ |
| Multi-caregiver annotation synthesis | 🟡 | Moments record who explained them; merging across devices is future |

## Phase 2 additions (from LuminAAC-Repository, luminaac, LuminAAC-Advanced and the rest of the product doc)
| Feature | Source | Status | Where |
|---|---|---|---|
| Emergency alert + "Go home" | repo `index.html`, guardian | ✅ | My Voice safety row → Bridge alert bar with "I'm on my way" |
| Intent categories (help, emotion, physical need, social, preference) | repo caregiver dashboard | ✅ | Annotation intent select; Insights intent mix |
| Prediction feedback, acceptance rate | repo `predictions.js` | ✅ | "Not these" chip; Insights suggestion stats; `/api/predictions/*` |
| Milestones (5/10/25/50/100…) | repo `index.html` | ✅ | Celebration in My Voice; list in Insights |
| Daily patterns by time of day | luminaac caretaker page | ✅ | Insights time-of-day chart |
| Social stories (LunaScript) and first/then routines | product doc | ✅ | Bridge → Stories; story player in My Voice |
| Speech practice with Dynamic Regulating Reward | product doc | ✅ / 🟡 | Practice targets, tries logged, caregiver-picked reward (stars, bubbles, quiet); automatic reward tuning future |
| Dynamic button sizing, 300% scaling, dwell, scanning | product doc | ✅ | access.js |
| Sync, share with therapist/teacher, export | repo, product doc | ✅ | backend + Bridge → Privacy |
| Therapy tones (solfeggio), weather, meal plans | repo, luminaac | ⏭️ skipped | No evidence base or out of scope for an AAC core |
| Geofencing, pairing, emotion AI, federated learning | guardian, repo, Advanced | ✅ in Phase 3 | See below. AR and a TensorFlow engine remain 🔭 |

## Phase 3 additions
| Feature | What's built | Status | Where |
|---|---|---|---|
| Geofencing / safe zones | Parent consent dialog. Leaflet + OSM map, with a lat/lng and size form when offline or as the accessible path. `watchPosition` on My Voice with hysteresis. Arrive and leave alerts through the live stream. "Take me home" carries location. Location stripped after 24 h. Turn off deletes zones. | ✅ | Bridge → Safety; `geo.js`; `myvoice-p3.js`; `/api/alerts` kinds `zone-enter`/`zone-leave` with `loc` |
| Device pairing | QR code (qrcode-generator) plus a 6-digit single-use code valid for 10 min. jsQR scanner on My Voice. Hashed per-device keys. Device list with "Switch off". Sync scoped by device kind (a My Voice device reads only the child view and cannot write). | ✅ | Bridge → Account and devices; My Voice → This device; `/api/devices/*` |
| Accounts | Email + scrypt password. Passkeys (WebAuthn, ES256/RS256, "none" attestation). 30-day sessions. Roles parent/admin, teacher, therapist and family, mapped to share scopes. Family and child profiles. Invite codes. Local-only mode needs no account, and an existing family key is adopted on sign-up. | ✅ | `/api/auth/*`, `/api/family/*` |
| Emotion AI (on-device) | Voice prosody (pitch, pitch movement, loudness, tempo) mapped to arousal/valence against the child's own baseline. Optional face expression via Human (CDN) with a voice-only fallback. Always shown as an estimate with confidence, confirmed by a caregiver. Confirmed feelings feed suggestion ranking and Insights. | ✅ (heuristic, unvalidated) | Annotation sheet; Insights → Feelings; `emotion.js` |
| Federated learning | 17-feature logistic model trained on the device. Delta clipped to L2 ≤ 1, Gaussian noise σ = 0.3·C, fixed-point pairwise ECDH masks. FedAvg on masked sums. Global model download. 3-client simulation in tests (accuracy 0.45 → 0.96). | ✅ (no dropout recovery, no ε accounting) | Bridge → Privacy; `fl-core.js`; `/api/fl/*` |
| OSS adoption | Leaflet, qrcode-generator, jsQR, Motion and OpenMoji vendored with licences | ✅ | `vendor/`, `THIRD-PARTY.md`, `RESEARCH-OSS.md` |

## Phase 4 additions
- A speech feelings model (opt-in, on the device, works offline) fused with prosody. Caregivers still confirm every estimate.
- Natural Kokoro voices for My Voice, with preview and progress.
- Email confirmation and password reset.
- Shared learning that survives families dropping out, with a privacy budget.
- Installable apps that work offline; a quiet-device alert; a native app scaffold for true background zones.
- The face estimate is vendored and tested.

## Phase 8: Potty Path (v0.10)
| Feature | Status | Where |
|---|---|---|
| "I need the toilet" button: always speaks, always works (even when paused), alerts every Bridge | ✅ | My Voice Talk page; board words *toilet/bathroom/potty* also count as asking |
| Now/Next step path, companion (train, dino, blob, cat, none), Approach and Sit modes | ✅ | Potty Path screen |
| Silent sit timer (circle, jar, dots, walk), body check, All done / More time, hard caps | ✅ | Sit mode |
| Break, Help and Stop always on screen; refusals respected | ✅ | Potty Path screen |
| Add-only tokens, reward photo, a World that only grows, World book | ✅ | Done screen, "My train" |
| Caregiver console, coaching scripts, prompt levels without physical AAC prompts | ✅ | Bridge → Potty Path; grown-up hold bar on the tablet |
| Medical screening, sensory grid, known signals, reward inventory, step photos | ✅ | Bridge → Potty Path → Getting ready |
| Red-flag pause, doctor summary, regression and constipation rules | ✅ | Bridge → Potty Path |
| Explainable hints (pee times, drink→pee, time of day, suggestions) | ✅ | What the log shows |
| Wall schedule, school handoff, calendar reminders | ✅ | Print and reminders |
| QR handoff, opt-in server sync with end-to-end encryption | ✅ | Two devices |
| Wetness sensors, predictive ML | 🔭 | Deferred: would move toward regulated medical software |

## AI / platform (from technical sections)
| Doc feature | Status |
|---|---|
| Wav2Vec 2.0 / HuBERT audio representation, ViT + 3D CNN gestures, contrastive clustering | 🔭 (see TECH-DESIGN) |
| LuminatingCore supervised fine-tuning, LLM annotation understanding | 🔭 |
| Gemini predictive assistance / Gemini Audio Switch | 🔭 |
| Luminall pattern recognition stack, neuromorphic core, LiDAR, IoT context | 🔭 |
| Local processing, encrypted backup, on-device training, federated learning | 🟡 local-only today; backup toggle shown as coming soon |
| Emotional state recognition, frustration detection | 🔭 |

## Onboarding
Conversational, three short steps (child's name → who you are → the loop explained). Re-runnable from Privacy. ✅

## Business model
Free for families; institutional therapy subscriptions; opt-in, consented, de-identified research licensing. See GO-TO-MARKET.md.
