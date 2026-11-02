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

## New in v0.14
- **Push alerts**: the server stores your browser's push address and sends only short alert texts. With encryption on, chat alerts say only "New message".
- **Email summaries**: off by default. A weekly summary goes to the addresses you add, through the email provider the server is set up with. Families with encryption on get no summary, because the server can't read their data.
- **Photos and recorded voices**: kept on the device. They're added to sync only as part of your family's data, and are encrypted when encryption is on.
- **End-to-end encryption**: optional. Data is locked with AES-GCM on your devices before it's sent. The server stores only scrambled data and short-lived device requests, which are deleted after hand-over or after 24 hours. There's no recovery key.
- **Listening ("Say the word")**: "On this device" keeps audio on the phone. "Browser listening" sends audio to Google or Apple's speech service, and the settings say so. Only the heard word is saved, never audio.
- **Agreement check**: labels stay in your family data. The download has scrambled ids and rater letters, with no names, notes, places or times.
- **Native app**: location in the background is used only for the geofences you draw. Microphone and camera are used only on the screens that ask for them.

## Sound Path practice data (v0.11)
- No sound is ever recorded or stored. If you allow the microphone in Videos and games, it is only measured for loudness and pitch on the device, during a game.
- The practice log (that a try happened, the game, and a grown-up's "got it / close / tried") lives under its own key (`luminaac:sound`) on the device that played. It is kept for a year, never synced, and never in share links or backups. **Delete practice data** removes it.
- Targets and the ladder rung live in the Bridge document like other settings.

## Potty Path toilet data (v0.10)
- Toilet logs are health data, so they're kept apart from everything else: their own storage key (`luminaac:potty`) and their own photo database, on the device where they were logged. Logs are kept for 90 days by default (28 to 365, your choice).
- A parent or guardian must agree before anything is logged. The medical check and the sensory answers never leave the device. Only the plan (sit times, steps, look and sound) and whether it is paused travel with the rest of the Bridge, and never the reason for a pause.
- Toilet data is never in share links, Bridge backups, team views, the therapist summary or federated learning.
- Sending the log to your own LuminAAC server is a separate switch, off by default. With **Lock it** on (recommended), each entry is encrypted on the device with AES-GCM using a key the server never sees. The server can relay and de-duplicate entries but can't read them. Moving between devices can also be done with QR codes and no network at all.
- Photos are of objects only (your toilet, tap, a reward). The app says not to photograph your child, and recording, the camera and the face check stay off during a toilet try.
- Delete removes the log, the photos and any server copy in one step. Export gives you a separate file.

## Phase 4
- **Speech feelings model and natural voices.** These are opt-in. They're downloaded from Hugging Face and jsDelivr once; those servers see a normal download request (your IP address), never audio or text. Recordings and typed messages are processed on the device.
- **Face estimate.** The models ship with the app, so nothing is fetched. The camera check records nothing and stops when you press Stop.
- **Email.** The server stores your email to send confirmation and reset links. Link tokens are stored as hashes and work once. In dev mode, mail is written to a local outbox file on the server.
- **Quiet-device alert.** While location sharing is on, the child's device checks in every few minutes. The server keeps the last check-in time and, for up to 24 hours, the last location, so it can say where the device was last seen.
- **Shared learning.** Each device has a lifetime privacy budget (ε, default 50 with δ = 1e-5). When it's spent, the device stops sending updates. Dropout recovery means the server can unmask only the sum, never one family's update.

## Videos and sound games (v0.9)
- Only videos a caregiver adds can play. They play through YouTube's privacy-enhanced player (youtube-nocookie.com) with no autoplay, suggested videos or comments. When a video plays, YouTube receives the request and may store data in the browser under its own policy. Thumbnails load from YouTube only if turned on.
- Watch time, replays, "Talk about it" taps and game turns are kept on the device where they happened. They aren't synced to the server or shared with YouTube. Export and delete cover them.
- The microphone is off unless a caregiver turns it on for games. Sound is measured in memory for loudness and pitch, then dropped. It is never recorded, stored or sent.
- Insights and the therapist summary describe what happened. They don't diagnose or assess.
