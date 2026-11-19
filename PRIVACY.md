# Privacy in LuminAAC

LuminAAC is used by children who can't easily tell us what they're comfortable with. So the rule is simple: **everything stays on the device unless a parent turns something on, and even then we send the least we can.**

## What stays on the device, always
- **Recordings** (audio, video, photos). These live in IndexedDB on the device that captured them and are never uploaded by any feature.
- **Feeling estimates.** These are worked out on the device from the recording. Voice features and face analysis never leave it. The optional face model downloads *to* the device, and the video is not sent anywhere.
- **The on-device suggestion model** and the moments and choices it learns from.

## What's sent, and only if you turn it on

| Feature | Off by default? | What leaves the device | Where it goes | How long it's kept |
|---|---|---|---|---|
| Sync | Yes | Your family document: signals, meanings, notes, stories, settings, zones. No media, keys or account details. | Your own LuminAAC server | Until you delete it (Privacy → delete, or `DELETE /api/sync`) |
| Share links | Yes | A read-only view scoped to the role. No media, location, privacy settings or audit log. | Whoever has the link | Until it expires (30 days by default) or you turn it off |
| Alerts ("I need help", "Take me home") | Sent when tapped, if a server is connected | The alert, the time and the device name | Your server, then your caregivers' Bridge | The last 500 alerts |
| Safe zones | Yes, needs parent consent | Only "arrived at" or "left" a zone, plus the position at that moment if you allow it. The device does the zone check itself, so it never sends a stream of positions. | Your server, then the Bridge | Exact location is deleted from alerts after 24 hours. Turning safe zones off deletes all zones and stored locations on this device. |
| Accounts | Yes | Email, name, a scrypt password hash and passkey public keys | Your server | Until the account is removed |
| Paired devices | Yes | Device name and last-seen time. The device key is stored only as a hash. | Your server | Until you switch the device off |
| Shared learning (federated) | Yes | 17 numbers per round. They are clipped, blurred with random noise and masked, so the server can only read the total across at least 3 families. No moments, words, names or recordings. | Your server's model endpoint | The server keeps only the combined model and a round count |

## Who can see what (roles)
- **Parent / admin:** everything in the family, plus pairing, invites and deletion.
- **Teacher and family:** the view your share settings allow, and alerts so they can respond. No location history, notes (family), insights or recordings.
- **Therapist:** the scoped view plus insights. No alerts or location.
- **My Voice device:** only what it needs to run: words, stories, practice, access settings and zones. It can send alerts but can't read the family's notes or alerts.

## Children's data
- **Consent.** Location needs a parent or guardian to agree, and the consent is recorded with a date. The browser also asks on the device.
- **Estimates, not facts.** Feelings are always labelled as estimates and only count when a caregiver confirms them. We never use them to diagnose.
- **No advertising, sale or third-party analytics.** There are no trackers in the app.
- **Optional third-party requests,** made only if you turn the feature on:
  - OpenStreetMap tiles (when the Safety map is open)
  - ARASAAC pictures (if turned on)
  - jsDelivr (only for the optional face model)
- **COPPA / GDPR-K / FERPA.** The design follows data minimisation, parental consent, and deletion and export on request (Privacy → Download everything / Delete). A production deployment still needs a DPA, a hosted privacy notice, and a records-of-processing entry.

## Security
- Passwords use scrypt (N=16384, r=8, p=1).
- Sessions, device keys and invite codes are random and stored only as SHA-256 hashes.
- Passkeys are verified on the server (origin, challenge, RP ID, signature, sign counter).
- Logins and pairing codes are rate-limited.
- Run the server over HTTPS.
- End-to-end encryption of the synced document is on the roadmap.

## Phase 4
- **Speech feelings model and natural voices.** These are opt-in. They're downloaded from Hugging Face and jsDelivr once; those servers see a normal download request (your IP address), never audio or text. Recordings and typed messages are processed on the device.
- **Face estimate.** The models ship with the app, so nothing is fetched. The camera check records nothing and stops when you press Stop.
- **Email.** The server stores your email to send confirmation and reset links. Link tokens are stored as hashes and work once. In dev mode, mail is written to a local outbox file on the server.
- **Quiet-device alert.** While location sharing is on, the child's device checks in every few minutes. The server keeps the last check-in time and, for up to 24 hours, the last location, so it can say where the device was last seen.
- **Shared learning.** Each device has a lifetime privacy budget (ε, default 50 with δ = 1e-5). When it's spent, the device stops sending updates. Dropout recovery means the server can unmask only the sum, never one family's update.
