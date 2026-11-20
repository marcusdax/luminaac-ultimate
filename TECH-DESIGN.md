# Technical design

## Today: static, local-first web app
- Vanilla ES modules, no build. Two pages share `shared.js`.
- **Storage:** `localStorage` keys `luminaac:settings|log|counts|pairs|custom|plans|pictoIds` (My Voice, original) and `luminaac:bridge` (Bridge document, `version: 2`). Recordings are Blobs in IndexedDB `luminaac-media` / store `clips`, keyed by moment id.
- **Cross-page sync:** both pages read the same keys; My Voice re-renders on the `storage` event when the Bridge changes.
- **Speech:** `speechSynthesis` with user-selected voice and rate.

### Rolling buffer
`MediaRecorder` cannot trim a running WebM, and concatenating segments breaks the container. So we run two recorders on the same stream, staggered by N seconds, each restarting every 2N seconds. At any moment one recorder has been running between N and 2N seconds; on tap we stop that one and keep a complete, playable file that contains at least the last N seconds. Unkept chunks are discarded on restart, so nothing older than 2N seconds exists in memory.

### Learning (prototype heuristics)
- **Signal** = `{cues[], contexts[], meaning, phrase, confirmations, rejections}`.
- **Confidence** = (confirmations + 1) / (confirmations + rejections + 2) – the mean of a Beta posterior. Suggestions need ≥ 50%.
- **Ranking** = confidence + 25 if the part of day matches + 15 if the place matches.
- **Smart linking** = keyword overlap between the annotation and existing signals; phrase guessing from "wants…/asking for…".

## Data model
```ts
Moment   { id, t, kind: "audio"|"video", dur, context, aac: string[], meaning, by: Role, signalId?, media?: blobKey }
Signal   { id, name, cues: string[], meaning, phrase, confirmations, rejections, contexts: string[], created }
Question { id, text, status: "open"|"answered"|"later", suggestPhrase? }
PersonalButton { id, label, e, kind, momentId? }
Rule     { id, page, days: number[], from: hour, to: hour }
TeamMember { id, name, role, access: "signals"|"notes"|"full", invited }
Note     { id, t, by, text }
Privacy  { retainDays, blurFaces, shareMedia, autoDetect, cloudBackup }
```

## Future architecture
```
 Devices (My Voice, Bridge, LuminNode cams)
   │  on-device: VAD, keypoints, embeddings (wav2vec2/HuBERT, ViT) – raw media never leaves by default
   ▼
 API gateway (OAuth2 + per-child consent scopes)
   ├─ moments-svc     (metadata, E2E-encrypted media in object storage)
   ├─ signals-svc     (per-child model registry, confidence, active-learning queue)
   ├─ team-svc        (invites, roles, audit log)
   ├─ insights-svc    (aggregates)
   └─ training workers (per-child fine-tune; optional federated rounds)
```
Reference repo in OneDrive (`Apps/LuminAAC/LuminAAC-Repository`) has an Express backend scaffold (`backend/server.js`, Mongo + Redis + TensorFlow + socket.io). It mounts `/api/{health,auth,users,sessions,messages,predictions,analysis,annotations,therapies,export}`, but only `src/routes/predictions.js` exists, and its services are stubs. The `luminaac/guardian` alert, geofencing, and pairing files are empty, and the `LuminAAC-Advanced` FastAPI endpoints are all `pass`.

`backend/` in this build is a working, zero-dependency Node 18+ server. It keeps the repo's `/api` prefix, its response envelope, and the predictions contract exactly. It adds the sync, sharing, and alert routes the repo planned but never wrote, in place of the sessions/export routes and the guardian `alerts.js` stub. See `backend/README.md`.

### API contract (implemented in `backend/server.js`)
Envelope: success → `{ "success": true, "data": …, "message"? }`; error → `{ "error": "…", "details"? }` (same as the repo).
Auth: `Authorization: Bearer <family key>`. The key is generated in Bridge → Privacy and never stored on the server; data files are named by its SHA-256 hash.

```
GET    /api/health                          → {status, version, uptime, time}          (no auth)

# Sync (whole local document, optimistic concurrency)
GET    /api/sync                            → {doc, version, updated}
PUT    /api/sync      {doc, baseVersion, force?}  → {version, updated}
                                            409 {error, details:{serverVersion, doc}} if baseVersion is stale
DELETE /api/sync                            (deletes everything for this key, incl. shares and alerts)

# Sharing (role-scoped, read-only links)
GET    /api/share                           → [{token, role, name, created, expires, revoked}]
POST   /api/share     {role: teacher|therapist|family|parent, name?, expiresInDays?} → {token, url, …}
GET    /api/share/:token                    (no auth) → scoped view; never media, privacy settings, or the key
DELETE /api/share/:token                    revoke

# Guardian alerts
GET    /api/alerts?since=ISO                → [alert]
POST   /api/alerts    {id?, kind: help|home|custom, message, at?}  → alert   (deduped by id)
POST   /api/alerts/:id/ack  {by?}           → alert
GET    /api/alerts/stream                   Server-Sent Events: `alert` and `ack` events

# Predictions (contract from LuminAAC-Repository/backend/src/routes/predictions.js)
POST   /api/predictions/generate  {visual?, audio?, context:{time, location, activity, mood, alone}}
                                  → {suggestions:[{suggestion, confidence, category, signal_id}], confidence,
                                     primary_intent, emotional_state, timestamp}
GET    /api/predictions/current
POST   /api/predictions/feedback  {prediction_index, feedback:{accepted, accuracy, helpfulness, comments}}
GET    /api/predictions/stats     → {total_predictions, accepted_predictions, rejected_predictions,
                                     acceptance_rate, average_confidence}
GET    /api/predictions/patterns
GET    /api/predictions/patterns/:id
POST   /api/predictions/patterns/:id/update  {success, feedback}
POST   /api/predictions/adaptive-learning    {enable, user_profile}
```
Predictions are rule-based, not ML. They rank the synced signals by confidence (c+1)/(c+r+2) and boost by part of day and place. This matches the "rule-based predictions" step in the product doc. Pattern feedback updates the signal's confirmations or rejections, so the next sync carries the change back to the device.

Not built yet (repo has only stubs): auth/users, sessions, messages, analysis, annotations, therapies, export, socket.io events (`request-analysis`, `subscribe-predictions`, `annotation-created`), geofencing, pairing, and federated learning. The share link and SSE stream cover the real-time cases the prototype needs.

Config: `PORT` (3001), `LUMINAAC_DATA` (./data), `ALLOWED_ORIGINS` (comma list, default `*`), 2 MB body limit.

All writes carry `actorRole`; all reads are filtered by the member's `access` scope.

### Phase 3 API (also in `backend/server.js`)
```
# Accounts (bearer = session token; family keys and device keys still work)
POST /api/auth/register  { email, password(≥10), name?, familyName?, childName?, invite?, familyKey? } → { token, user, role, family, families }
POST /api/auth/login     { email, password }            → same; 401 generic message; 429 after 5 failures / 15 min
GET  /api/auth/me | POST /api/auth/logout | POST /api/auth/logout-all
POST /api/auth/passkey/register/options (session)       → PublicKeyCredentialCreationOptions (base64url fields)
POST /api/auth/passkey/register/verify  { challenge, name, credential:{ id, response:{ clientDataJSON, attestationObject } } }
POST /api/auth/passkey/login/options                    → { challenge, rpId, allowCredentials: [] }   (discoverable credentials)
POST /api/auth/passkey/login/verify     { challenge, credential:{ id, response:{ clientDataJSON, authenticatorData, signature } } } → session
DELETE /api/auth/passkeys/:id
GET  /api/family  · PUT /api/family {name} · POST /api/family/children {name, birthYear?}
POST /api/family/invites { role } → { code } (single use, 7 days) · DELETE /api/family/members/:userId

# Devices
POST /api/devices/pair  { kind: myvoice|bridge }  (parent) → { code(6 digits), expires(10 min) }
POST /api/devices/claim { code, name }  (public, 10 tries / IP / 10 min) → { deviceId, deviceKey }   (key shown once, stored hashed)
GET  /api/devices · DELETE /api/devices/:id   (parent, or the device itself)

# Safe zones ride on alerts
POST /api/alerts { kind: help|home|custom|zone-enter|zone-leave, message?, zone?, loc?:{ lat, lng, acc } }   (loc dropped after 24 h)

# Federated learning
GET  /api/fl/model → { version, weights[17], features, clip, noise, history }
GET  /api/fl/round → { id, size, joined, submitted, state }
POST /api/fl/round/join { publicKey (P-256 raw, base64url) } → { round, client, size }
GET  /api/fl/round/:id/peers → { peers:[{client, publicKey}] } | { waiting }
POST /api/fl/round/:id/update { client, masked: uint32[17] } → { done, version? }
```
**Permissions:**

| Role | Can |
|---|---|
| parent / family-key / caregiver device | everything |
| teacher, family | scoped read of sync; read and acknowledge alerts |
| therapist | scoped read plus insights and predictions |
| My Voice device | read the child view; post alerts and location; take part in FL |

Share views and scoped views never include safety, location, notes (unless the scope allows them), audit or media.

**Geofencing algorithm.**
- Distance is haversine.
- A device enters when distance < r and leaves when distance > r + 25 m.
- Fixes with accuracy worse than max(r, 100 m) are ignored.
- The first fix sets the baseline silently.

**Emotion estimate.**
- Frames are 2048 samples with a 1024 hop.
- Pitch comes from autocorrelation over 75–700 Hz.
- Features: mean pitch, pitch SD in semitones, pitch slope, loudness (dB) mean and SD, onset rate, voiced ratio.
- arousal = 0.45·z(loud) + 0.3·z(pitchVar) + 0.25·z(tempo)
- valence = 0.5·z(slope) + 0.3·z(pitch) − 0.4·z⁺(loudVar)
- The z-scores use the child's baseline, an EMA of confirmed moments (n ≥ 3), or defaults until then.
- Confidence is capped at 0.75 (0.8 when voice and face agree).

**Federated learning.**
1. Each client runs SGD from the global weights.
2. The delta is clipped to L2 ≤ 1 and Gaussian noise N(0, (0.3·1)²) is added to each coordinate.
3. The result is encoded as round(x·10⁶) mod 2³².
4. For each peer, the client derives an ECDH P-256 secret, expands it with HMAC-SHA256(round:block) into a uint32 mask, and adds the mask if its id is lower than the peer's, or subtracts it if higher.
5. The server sums the masked vectors mod 2³². The masks cancel. The server decodes as int32 / 10⁶ / n and adds the result to the global weights.

Limitations:
- If a client drops out, the round is lost; a round expires after 1 hour.
- There is no ε accounting.
- The server can still see who took part.

### Security & privacy
Local by default; E2E-encrypted backup with a family-held key; faces of others blurred before sharing; COPPA, FERPA, and HIPAA-aligned handling; research licensing only with explicit, revocable, de-identified opt-in.

## Phase 4
**On-device models (`ai.js`, `ai-worker.js`).** One module worker per task. Each message carries its task, because the URL query is lost when the service worker serves the script. transformers.js 3.7.5 and kokoro-js 1.2.1 are imported from jsDelivr (pinned). Model files land in the `transformers-cache` Cache Storage, and the service worker caches the library files, so after the first load both work offline (tested with the network switched off).
- Speech emotion: `onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX`, q8. It runs on WebGPU if an adapter exists and falls back to WASM. Setting `localStorage["luminaac:ai-wasm"]="1"` forces WASM. Output covers 6 labels (sad, angry, disgust, fear, happy, neutral). `emotion.fuseSpeech(prosody, scores, 0.6)` maps them onto LuminAAC feelings, using prosody arousal to split happy into excited or happy. The result is still an unconfirmed estimate.
- Kokoro: q8 on WASM only. WebGPU needs the 325 MB fp32 weights, which is too big for phones and the cache. Voices are listed as `kokoro:<id>` in My Voice. `say()` sends them to the worker and falls back to `speechSynthesis` on any error.

**Email.** See `backend/README.md`. Tokens are 32 random bytes in base64url; the server stores SHA-256 only. Links use `#verify=` / `#reset=` fragments, so tokens never reach server logs. The page removes them from the URL with `history.replaceState` before doing anything else.

**Secure aggregation with dropouts (`fl-core.js`, `backend/flserver.js`).** This follows Bonawitz et al. 2017.
1. **Join.** Each client sends an ECDH P-256 public key.
2. **Share.** Each client Shamir-splits its ECDH private scalar *d* and a random self-mask seed *b* (t-of-n over GF(2^521−1), with t = quorum). Every share is encrypted to its peer with AES-GCM under SHA-256("luminaac-share" ‖ ECDH secret). The server only relays the ciphertexts.
3. **Mask.** Each client sends x + Σ±PRG(pairwise) + PRG(b) mod 2^32.
4. **Unmask.** For every survivor, the other survivors reveal their *b* share. For every dropped client, they reveal its *d* share. A client never reveals both for the same peer. The server rebuilds the dropped clients' pairwise masks and the survivors' self-masks, and recovers Σx over the survivors.
Rounds below quorum are abandoned, and every phase has a timeout (`FL_PHASE_MS`). Privacy accounting uses zCDP: ρ = 1/(2σ²n) per round and ε = ρ + 2√(ρ ln(1/δ)), with δ = 1e-5. It's tracked per device or account and capped (`FL_EPSILON_CAP`). Tests cover 0, 1 and 2 dropouts at different phases, with exact expected sums.

**Background.** Browsers stop geolocation once the page is closed or hidden, and there's no web geofencing API. So:
- (a) My Voice sends a heartbeat while it shares location, and the server raises a "silent" alert when the heartbeat stops (`checkDeadman`).
- (b) A Capacitor app in `native/` reuses `geo.js`, using background location on Android and iOS. `native/README.md` explains OS region geofencing (iOS limit of 20, Android limit of 100).

**PWA.** `sw.js` precaches the app shell. Pages are network-first. Shell assets and jsDelivr and Google Fonts are cache-first, and `/api` is never cached. Install buttons appear only when the browser fires `beforeinstallprompt`.

## Phase 8: Potty Path (v0.10)
See `docs/POTTY-PATH.md` for the clinical and product reasoning.
- **Event log, not state.** `potty-core.js` is pure (no DOM) and shared by My Voice, the Bridge, the backend and the tests. Every action is an immutable `PottyEvent { id, dev, seq, t, tz, by, sessionId?, kind, data }`. Merging is a union by id (commutative, associative, idempotent); corrections are `retract` events. Sessions, the token ledger (add-only, so it can never go down), the World, hints and red flags are folds over the log and are never stored.
- **Session state machine.** `foldSession()` covers approach → sitting → body_check → finishing → ended, plus coregulate (timer frozen) and cleanup. Timers come from timestamps, so they survive screen sleep. Hard caps are 5 min (urine) and 10 min (bowel). A void decides the outcome over a simultaneous "all done". Co-regulation ends the session after 15 min, and an idle session ends after 30 min.
- **Guard rails.** `canScheduleSit()` blocks planned sits in these cases: after 2 refusals or 1 distress event in a day, after an escalation, at the daily maximum, inside the minimum gap, while paused or retired. A child's own ask is never gated.
- **Red flags.** `pauseState()` combines the screening answers with rule flags: no BM for N *covered* days, Bristol 1–2 twice in a week, or regression. A covered day has at least 3 logs spread over at least 4 h; uncovered days are reported as a logging gap. Doctor-checked flags can be snoozed for 7 days, and urgent ones never.
- **Hints.** Void-time peaks (15-min bins ±15 min, ≥7 covered days and ≥10 voids, ≥40% of days), drink→void median and IQR (≥8 pairs over ≥4 days, IQR ≤30), success by part of day ((s+1)/(n+2), n≥5), regression (7 days vs the previous 14, a drop of ≥20 points with ≥3 wets). Every hint carries its support counts.
- **Storage (`potty-store.js`).** `luminaac:potty = { version: 1, profile, events, seq, retainDays, sync: { on, e2e, k, cursor, outbox } }`. Writes are read → merge → write, inside `navigator.locks` when available, with a BroadcastChannel nudge for same-browser pages. Photos live in IndexedDB `luminaac-potty/photos`. The plan lives in the Bridge document as `db.potty = { protocol, paused }` and reaches paired tablets through `childView`.
- **Two devices.** (1) The same device: storage events. (2) QR handoff: `LP1|part/total|z|base64(deflate-raw(pack(events)))`, 30 events per code, scanned with jsQR. (3) Server: `POST /api/potty/events` (idempotent by id, server `seq`), `GET /api/potty/events?since=`, `DELETE /api/potty/events`, and SSE `event: potty`. With `e2e`, entries are `{ id, dev, seq, c }`, where c = base64url(iv ‖ AES-GCM-256(event, aad = id)). The key is shared between devices by QR (`LPK|key`) or by pasting it.
- **Reminders.** iOS PWAs have no background timers or local notifications, so the Bridge exports an `.ics` file with a daily alarm per sit window. The bathroom tablet stays in the foreground (Guided Access).
- **Feature flag.** `access.potty` (default false) sits in the synced document. `localStorage["luminaac:potty-dev"]="1"` overrides it for development.
- **Tests.** `node tests/potty.test.mjs` (63 checks) covers merge laws, every state transition, the add-only ledger, guard rails, red flags, hint gates, ICS and QR packing. `backend/test.mjs` adds 13 checks for the relay, scopes, sealed storage, share-link exclusion and delete.

## Phase 9: Sound Path and Potty Path mechanics (v0.11)
- **Sound Path (`sound-core.js`, pure).** An append-only event log (`try`, `heard`, `word_use`, `break`, `stop`, `rung`, `retract`) in `luminaac:sound`, merged by id. Mastery = "got" on 3 distinct local days. `nextTry(events, targets, now, rng, {cas})` keeps practice near the challenge point: blocked practice with feedback every try while a target is learning, mixed practice with praise on alternate tries once reliable (at least 3 "got" in the last 5), "easier + show the model" below 50% over 10 tries, "harder" above 85%, done for the day after 2 breaks or 1 stop. The apraxia setting keeps practice blocked. `inventory()`, `weekly()`, `rungAdvice()` and `suggestTargets()` feed the Bridge; all advice is recommend-then-confirm. No audio is stored; the microphone gives loudness and pitch frames only (`games.js`).
- **Potty Path mechanics (`potty-core.js`).** New event kinds `stage` and `offer`, appended to `KINDS` so QR packing stays compatible. `tokensFor`: early signal 3, toilet void 2, sit or dry check 1, late signal 1; `signalAward()` marks a signal late if a wet came in the last 10 minutes and caps signal tokens at once per 20 minutes. `signalTiming()` classifies each signal (early, early_missed, late, no_need, pending). `stageProgress()` checks each stage's exit criteria over "5 of the last 7" windows (two weeks running with `stability`), recommends a step back after 2 hard or 3 refused tries in the last 5, and honours a 3-day "Not yet". `nextSession()` is a pure planner: interval bounded to 45–120 minutes, sit length 30–180 seconds, +15 minutes after hard tries, ±10 for the dry-check rate, +10 for mostly early signals and −10 for mostly late ones, a prompt level that can only fall by itself (1–3), and a full stop under a medical pause. The fold now measures `sitSecs` and marks `late` sessions (World piece "lantern").
- **Tests.** `node tests/sound.test.mjs` (35 checks) and `node tests/potty.test.mjs` (89 checks, including planner properties: safety is monotonic, no auto-advance, bounds, replay, medical pause, prompt floor and ceiling).
