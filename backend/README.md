# LuminAAC backend

This is a small Node 18+ API with no dependencies. It handles family sync, role-scoped share links, guardian alerts, and the `/api/predictions` contract from `LuminAAC-Repository/backend/src/routes/predictions.js`.

```bash
node server.js     # http://localhost:3001
node test.mjs      # 113 tests, in-process, temporary data dir
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
