# LuminAAC backend

This is a small Node 18+ API with no dependencies. It handles family sync, role-scoped share links, guardian alerts, and the `/api/predictions` contract from `LuminAAC-Repository/backend/src/routes/predictions.js`.

```bash
node server.js     # http://localhost:3001
node test.mjs      # 155 tests, in-process, temporary data dir
```

| Env | Default | Meaning |
|---|---|---|
| `PORT` | 3001 | Listen port |
| `LUMINAAC_DATA` | `./data` | JSON file store, one file per family (named by key hash) |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins |
| `RP_ID` | Origin hostname | WebAuthn relying-party ID (set to your domain in production) |
| `RP_ORIGINS` | the request Origin, if its host equals `RP_ID` | Comma-separated origins allowed for passkeys |
| `FL_ROUND_SIZE` | 3 | Clients per federated round (minimum 2) |
| `FL_QUORUM` | ceil(2n/3) | Survivors needed to finish a round; also the Shamir threshold t |
| `FL_PHASE_MS` | 120000 | Timeout for each round phase (joining, sharing, masking, unmasking) |
| `FL_EPSILON_CAP` | 50 | Lifetime ε per device or account (δ = 1e-5, zCDP accounting) |
| `MAIL_MODE` | `outbox` (or `smtp` if `SMTP_HOST` is set) | `smtp`, `outbox` (writes `<data>/_outbox.json`) or `console` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | –, 587, –, –, 0 | SMTP server. `SMTP_SECURE=1` means implicit TLS (port 465) |
| `SMTP_REQUIRE_TLS` | 1 | Refuse to send if the server doesn't offer STARTTLS |
| `MAIL_FROM` | `LuminAAC <no-reply@localhost>` | From address |
| `APP_URL` | request Origin | Base URL used in email links |
| `DEADMAN_MINUTES` | 30 | Default quiet-device window (devices may choose 5–1440) |
| `DEADMAN_CHECK_MS` | 60000 | How often the quiet-device check runs |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | – | Upstash Redis REST settings (also read as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`). When set, `api/index.js` mirrors the data files to Redis (hosted mode) |
| `YOUTUBE_API_KEY` | – | Optional YouTube Data API v3 key: resolves @handles and lists a channel's newest videos with titles |

## v0.5: hosted mode, chat, sensors, YouTube

- **Hosted on Vercel.** `../api/index.js` imports this server, runs requests one at a time per instance, and wraps each one in `mirror.pull()` / `mirror.push()` so the JSON files in `/tmp` match Redis (`lum:files` and `lum:rev` hashes). On Vercel, `/api/alerts/stream` answers 410, and clients poll `/api/updates` instead.
- `GET /api/updates?since=t` returns `{ now, version, alerts, chat }`, filtered by role, in one call.
- `GET /api/chat?since=t` and `POST /api/chat {text}` are for parent, teacher, therapist and family roles, never child devices; the last 500 messages are kept. `DELETE /api/chat/:id` works for parents, or for the author.
- `GET|POST /api/sensors` and `DELETE /api/sensors/:id` are for parents. POST returns a one-time `path` of `/api/hooks/<secret>`; only the secret's SHA-256 is stored.
- `GET|POST /api/hooks/<secret>` is public: the secret is the credential. It raises a `sensor` alert (urgent for doors, gates, pools and wearables unless set otherwise), takes an optional `message`, `value1` (IFTTT) or `?message=`, and allows 30 calls per 10 minutes per sensor.
- `GET /api/youtube?channel=<link|UC id|@handle>` is public and read-only, and reaches only youtube.com and googleapis.com. It returns `{ id, title, playlist, videos }`, where `playlist` is the uploads list (`UU…`) and always playable. Without `YOUTUBE_API_KEY`, titles come from the public feed when YouTube serves it, and @handles are refused with instructions. Results are cached for 30 minutes.
- `childView` now includes linked `videos.channels`.

**How it relates to the repo.** The repo's Express server needs Mongo, Redis, TensorFlow, and socket.io, and most of its routes were never written. This server keeps the parts that were real: the `/api` prefix, the `{success, data, message}` and `{error, details}` envelopes, and every predictions route with the same request and response fields. It also adds `/api/sync`, `/api/share`, and `/api/alerts` (with an SSE stream). You can swap the file store for Mongo later by changing `store.js` only.

**Security notes.** The family key is a bearer secret, and the server keeps only its SHA-256 hash. Share tokens are random and expire. Share views never include media, privacy settings, or the key. Run the server behind HTTPS in any real deployment. Phase 3 adds:
- **Accounts.** scrypt passwords (N=16384, r=8, p=1). Session tokens are stored as SHA-256 hashes and expire after 30 days. Logins are limited to 5 failures per 15 minutes per email.
- **Passkeys.** Verified with node:crypto in `webauthn.js`.
- **Pairing.** Codes are single-use, last 10 minutes and are limited to 10 tries per IP. Device keys are stored as hashes and can be revoked.
- **Roles and permissions.** These live in `PERMS` in `server.js`.
- **Federated learning.** FedAvg over masked sums in `flserver.js`.

End-to-end encryption is still on the roadmap.

New files:
- `accounts.js`: users, sessions, families, invites, devices.
- `webauthn.js`
- `flserver.js`
- The shared `../fl-core.js`.

The full contract is in `../TECH-DESIGN.md`.

## Phase 4
**Email confirmation and password reset.** Tokens are 32 random bytes. Only their SHA-256 hash is stored. They're single-use; verify links last 24 hours and reset links 30 minutes. A new token replaces older ones for the same purpose. Mail is limited to 3 per email and 10 per IP per hour, and redemption to 20 tries per 15 minutes per IP. The reset request always gives the same answer, so it can't be used to find accounts. A reset ends every session. If you'd rather use nodemailer or a provider API, replace `mailer.send()`; nothing else changes.

| Route | Auth | What it does |
|---|---|---|
| `POST /api/auth/verify` `{token}` | none | Confirms the email |
| `POST /api/auth/verify/send` | session | Sends a new confirmation link |
| `POST /api/auth/reset/request` `{email}` | none | Sends a reset link (generic reply) |
| `POST /api/auth/reset` `{token, password}` | none | Sets the password, signs out everywhere |
| `POST /api/devices/heartbeat` `{sharing, silentAfterMin, loc}` | device key with `location:write` | Check-in for the quiet-device alert |
| `GET /api/fl/budget` | any | ε used, cap, ε of the next round |
| `POST /api/fl/round/join`, `GET …/peers`, `POST …/shares`, `GET …/inbox?client=`, `POST …/update`, `GET …/unmask`, `POST …/reveal` | any FL principal | Secure-aggregation round (see `TECH-DESIGN.md`) |

**Quiet-device (dead-man) alert.** While a My Voice device shares location, it posts a heartbeat. If the device then goes silent for longer than its window, the server raises one "silent" alert with the last location (if under 24 hours old). When the device checks in again, it raises a "back" alert. This works with the app closed, because it's the server that notices.

**Federated rounds.** Phases run joining → sharing → masking → unmasking, each with a timeout. A round that falls below quorum is abandoned and nothing is applied. Only one reveal can finish a round. The unmasked sum is range-checked before FedAvg. Joining is refused (403) once a principal's ε would exceed the cap.

## Potty Path (v0.10)
Toilet events are kept apart from the synced document, in `d.potty = { seq, events }` (`potty.js`). They are de-duplicated by id and capped at 20,000. They never appear in share views or the child view; only the plan (`doc.potty.protocol`, `paused`) is in `childView`.

| Route | Auth | What it does |
|---|---|---|
| `POST /api/potty/events` `{events, sealed?}` | `potty:write` (parent, Bridge and My Voice devices) | Adds up to 500 events; idempotent by id; broadcasts SSE `event: potty` |
| `GET /api/potty/events?since=n` | `potty:read` | Events after server sequence n, plus the new cursor |
| `DELETE /api/potty/events` | `sync:write` (parent) | Deletes the family's toilet log |

Sealed (end-to-end encrypted) events are stored as `{id, dev, seq, c}` only. Alerts accept `kind: "potty"`.

## v0.17: Safety Links
- `/api/hooks/<secret>` also takes `{ "event": ... }`: `door_open`, `gate_open`, `window_open`, `pool_motion`, `wearable_sos`, `wearable_left_zone`, `seizure_alert`, `location` (`lat`, `lng`, `acc`; stored on the sensor, no alert) and `arousal` (`hr`, optional `moving`). Rules live in `../safety-core.js`.
- Door, gate and window alerts follow the exit rule: urgent unless `outUntil` is in the future, with a note on whether the child's device moved between its last two heartbeats (`prevLoc`, `lastLoc`).
- `GET|POST /api/safety/out` (`{ minutes }`, 0 = back home) for anyone in the circle who reads alerts, not paired child devices.
- `GET|POST|DELETE /api/found` (parents) manages the "if found" page; `GET /api/found/:token` is public and returns only `foundView` fields (never a location). Tokens sit in the share index.
- Research mode: `POST /api/sensors` with `kind: "wearable", research: true, consent: true` (and optional `rest`). Heart-rate readings are kept for 1 hour, never listed, and raise a non-urgent `calm-check` alert marked `caregiverOnly`. Without consent, `arousal` events are ignored.
