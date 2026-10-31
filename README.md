<p align="center">
  <img src="brand/logo-wordmark.svg" alt="LuminAAC" width="320" />
</p>

<h3 align="center">An AAC app for nonverbal children that learns the child's own language from the people who love them.</h3>

<p align="center">
  Vanilla HTML, CSS and JavaScript &middot; no build step &middot; installable PWA &middot; WCAG 2.2 AA &middot; local-first
</p>

---

## Mission

Many nonverbal children already communicate: a hum that means "more", a hand flap that means "I'm done", a look toward the door. The people around them learn these signals, but the knowledge lives in their heads. LuminAAC captures those moments, lets caregivers say what they meant, and turns them into words the child can use on their own talker. The child's voice gets stronger every day, and the family stays in control of every byte.

Two connected experiences:

- **My Voice** (`index.html`): the child's talker. A motor-stable core-word board with speech, quick phrases, prediction, proactive suggestions from learned signals, and help buttons.
- **The Bridge** (`bridge.html`): the caregiver portal. Catch a 15-second moment, say what it meant, and watch My Voice start offering the right words. Includes a signal library, vocabulary rules, stories, insights, sharing, safety and privacy controls.

A plain-language [Caretaker guide](docs/CARETAKER-GUIDE.md) (also in the app as `guide.html`) walks families through everything.

## Screenshots

| My Voice | The Bridge |
|---|---|
| <img src="screenshots/myvoice-desktop.png" alt="My Voice core-word board with a sentence strip" width="420" /> | <img src="screenshots/bridge-desktop.png" alt="The Bridge Today view with moment capture" width="420" /> |
| **Signal library** | **Safe zones** |
| <img src="screenshots/signals-desktop.png" alt="Signal library with confidence levels" width="420" /> | <img src="screenshots/safety-desktop.png" alt="Safe zones on a map" width="420" /> |
| **Feeling estimates** | **Shared learning** |
| <img src="screenshots/feelings-desktop.png" alt="Feeling estimates waiting for caregiver confirmation" width="420" /> | <img src="screenshots/fl-desktop.png" alt="Opt-in federated learning settings" width="420" /> |
| **Caretaker guide** | **On a phone** |
| <img src="screenshots/guide-desktop.png" alt="Caretaker guide contents page" width="420" /> | <img src="screenshots/myvoice-mobile.png" alt="My Voice on a phone" width="200" /> |

## Feature map

| Phase | Version | What it added |
|---|---|---|
| 1 | v0.3 | Magic-moment rolling buffer, annotation studio, signal library with confidence, proactive suggestions, My things, explore mode, day viewer, vocabulary rules, insights and personality map, role-scoped sharing, privacy controls, onboarding, logo set |
| 2 | v0.4 | Help and "Take me home" alerts that reach the Bridge live, social stories and first/then routines, speech practice with rewards, Large/Playful/Focus modes, dwell and switch scanning, Node backend for sync, share links and alerts |
| 3 | v0.5 | Safe zones with consent (Leaflet/OSM), device pairing by QR or code, accounts with scrypt and passkeys, roles and invites, on-device feeling estimates, opt-in federated learning with DP noise and secure aggregation, OpenMoji fallback pictures |
| 4 | v0.6 | Speech-emotion model (transformers.js, WebGPU/WASM), Kokoro natural voices, email confirmation and password reset, dropout-tolerant secure aggregation (Shamir t-of-n), installable PWAs, quiet-device alert, Capacitor scaffold, vendored face estimate |
| 5 | v0.7 | Caretaker guide (Markdown and printable web page with a quick-start one-pager), open-source repository files |

## Architecture

```mermaid
flowchart LR
  subgraph Child device
    MV[My Voice<br/>index.html] --> SH[(shared.js<br/>localStorage + IndexedDB)]
    MV --> GEO[geo.js<br/>safe zones]
    MV --> SW1[Service worker<br/>offline cache]
  end
  subgraph Caregiver device
    BR[The Bridge<br/>bridge.html] --> SH2[(shared.js<br/>localStorage + IndexedDB)]
    BR --> AI[ai.js + ai-worker.js<br/>speech emotion, Kokoro]
    BR --> EMO[emotion.js<br/>prosody + face]
    BR --> FL[fl-core.js<br/>local training, DP, masks]
  end
  subgraph Optional backend - Node 18, zero dependencies
    API[server.js] --> ACC[accounts.js<br/>webauthn.js]
    API --> FLS[flserver.js<br/>FedAvg, Shamir unmasking]
    API --> MAIL[mailer.js<br/>SMTP]
    API --> ST[(store.js<br/>backend/data)]
  end
  MV <-- sync, alerts, pairing --> API
  BR <-- sync, alerts, share links --> API
  FL -- masked weight deltas --> FLS
  AI -. models, first use only .-> HF[(Hugging Face Hub)]
```

Everything works without the backend. The backend adds sync between devices, live alerts, share links, accounts and federated learning.

## Quick start

### Front end (static)

```bash
git clone https://github.com/marcusdax/luminaac-ultimate.git
cd luminaac-ultimate
python3 -m http.server 8080
# open http://localhost:8080 (My Voice) and http://localhost:8080/bridge.html (the Bridge)
```

The microphone, camera and service worker need `localhost` or HTTPS.

### Backend (optional)

```bash
cd backend
node server.js      # Node 18+, no npm install; listens on :3001
```

Then in the Bridge go to Privacy, then "Sync, alerts and share links", enter `http://localhost:3001`, make a family key and connect. Mail settings and environment variables are in [`backend/README.md`](backend/README.md).

### Tests

```bash
cd backend
node test.mjs       # 113 API tests: accounts, passkeys, pairing, mail, reset, alerts, federated learning with dropouts
```

## Project structure
| File | What it is |
|---|---|
| `index.html`, `app.js`, `app.css`, `vocab.js` | My Voice (original board, kept intact) |
| `myvoice.js`, `myvoice.css` | Suggestions, My things, Explore quietly, play-moment buttons |
| `bridge.html`, `bridge.js`, `bridge.css` | The Bridge caregiver portal |
| `access.js` | Access modes, board size, dwell and switch scanning for My Voice |
| `bridge-plus.js` | Bridge phase 2: alert bar, Stories tab, access settings, extra insights, sync and share links |
| `backend/` | Zero-dependency Node API (sync, share, alerts, predictions, accounts, passkeys, devices, federated learning) |
| `bridge-p3.js`, `phase3.css` | Bridge phase 3: Safety and Account tabs, feeling estimates, shared learning |
| `myvoice-p3.js` | My Voice phase 3: safe-zone watching, pairing by QR or code, child-scoped pull |
| `geo.js`, `emotion.js`, `fl-core.js` | Geofence maths, on-device prosody and face estimates, federated learning core (shared with the backend) |
| `motion-lite.js` | Restrained motion wrapper around Motion that respects reduced motion |
| `vendor/` | Leaflet, qrcode-generator, jsQR, Motion and OpenMoji (see `THIRD-PARTY.md`) |
| `ai.js`, `ai-worker.js` | Phase 4: transformers.js speech-emotion model and Kokoro voices in a Web Worker (lazy, cached, WebGPU or WASM) |
| `bridge-p4.js`, `myvoice-p4.js`, `phase4.css` | Phase 4 UI: speech model download, live face check, voice preview, install buttons |
| `sw.js`, `pwa.js`, `manifest.webmanifest`, `bridge.webmanifest`, `icons/` | Installable app and offline cache |
| `native/` | Capacitor scaffold for background geofencing (see `native/README.md`) |
| `tests/faces/` | Sample faces from Human (MIT) used by the face tests |
| `shared.js` | Shared data layer (localStorage + IndexedDB), confidence scoring, context ranking |
| `tokens.css`, `brand/brand-tokens.css` | Design tokens and brand palette |
| `brand/*.svg`, `favicon.svg` | Logo set |
| `screenshots/` | Headless Chromium captures (desktop 1440×960, mobile 390×844) |
| Docs | `PRIVACY.md`, `RESEARCH-OSS.md`, `THIRD-PARTY.md`, `PRODUCT-SPEC.md`, `TECH-DESIGN.md`, `DESIGN-SYSTEM.md`, `ACCESSIBILITY.md`, `GO-TO-MARKET.md`, `ROADMAP.md` |

Documentation: [Caretaker guide](docs/CARETAKER-GUIDE.md), [Product spec](PRODUCT-SPEC.md), [Tech design](TECH-DESIGN.md), [Design system](DESIGN-SYSTEM.md), [Accessibility](ACCESSIBILITY.md), [Privacy](PRIVACY.md), [Open-source research](RESEARCH-OSS.md), [Go to market](GO-TO-MARKET.md), [Roadmap](ROADMAP.md).

## Privacy

- **Local first.** Settings and learned signals live in `localStorage` (`luminaac:*`); recordings live in IndexedDB (`luminaac-media`). Nothing leaves the device unless a caregiver turns on sync.
- **Caregivers decide.** Every feeling estimate and every learned signal needs a caregiver's confirmation before it counts.
- **Opt-in everything.** Safe zones need explicit consent, the speech model and face estimate are off by default, and federated learning sends only clipped, noised and masked weight deltas with a per-device privacy budget.
- **Retention and control.** 7, 30 or 90 days or forever, with export, restore and delete-all under Bridge, then Privacy.

Full details in [PRIVACY.md](PRIVACY.md).

## Accessibility

- Targets WCAG 2.2 AA: contrast-checked tokens, visible focus rings, 44 px minimum targets, full keyboard support and screen-reader labels.
- Motor-stable board: buttons never move once learned.
- Large, Playful and Focus modes, board zoom, dwell selection and switch scanning.
- Respects reduced motion. Font: Atkinson Hyperlegible Next.

See [ACCESSIBILITY.md](ACCESSIBILITY.md).

## Tech and third-party credits

Vanilla JavaScript ES modules, Web Audio, IndexedDB, Service Workers, WebAuthn and Web Crypto; a zero-dependency Node 18 backend.

- [Leaflet](https://leafletjs.com) (BSD-2-Clause) and map data &copy; OpenStreetMap contributors (ODbL)
- [OpenMoji](https://openmoji.org) fallback pictures (CC BY-SA 4.0)
- [ARASAAC](https://arasaac.org) pictograms by Sergio Palao, Government of Aragón (CC BY-NC-SA 4.0, optional, loaded from the network)
- [Human](https://github.com/vladmandic/human) by Vladimir Mandic (MIT)
- [Motion](https://motion.dev) (MIT), [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0)
- [transformers.js](https://github.com/huggingface/transformers.js) and [kokoro-js](https://github.com/hexgrad/kokoro) (Apache-2.0), loaded only when turned on
- Atkinson Hyperlegible Next by the Braille Institute (SIL OFL)

Versions, files and licence notes are in [THIRD-PARTY.md](THIRD-PARTY.md).

## Roadmap

Next up: photo symbols and recorded caregiver voices, two-switch and row/column scanning, end-to-end encryption of synced data, Web Push alerts, shipping the Capacitor apps for background geofencing, and validating the speech-emotion model with real caregivers. Longer term: on-device audio embeddings, gesture keypoints and a small per-child classifier. See [ROADMAP.md](ROADMAP.md).

## Contributing

Contributions are welcome, especially from AAC users, families, speech-language pathologists and accessibility experts. Read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Licence

LuminAAC's own code is released under the [MIT License](LICENSE). Some bundled or optional assets have different licences: OpenMoji pictures are CC BY-SA 4.0 (share-alike), and ARASAAC pictograms are CC BY-NC-SA 4.0 (non-commercial). See [THIRD-PARTY.md](THIRD-PARTY.md#licence-conflicts-to-know-about) before using LuminAAC commercially.
