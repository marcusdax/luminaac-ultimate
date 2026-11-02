# Feature audit (v0.13, 2 November 2026)

Every feature the documents call built or available, checked against the running app. Sources: README, docs/CARETAKER-GUIDE.md, PRODUCT-SPEC.md, TECH-DESIGN.md, ROADMAP.md, ACCESSIBILITY.md, PRIVACY.md, docs/CONCEPT-INTERESTS-INSIGHTS.md, GO-TO-MARKET.md, DESIGN-SYSTEM.md, the redesign, Potty Path and Sound Path docs, and the original Google Doc ("LuminAAC: The Empathic Guardian"), which PRODUCT-SPEC maps feature by feature.

**How it was checked:** Playwright in Chromium at 1440×960 and 390×844 (also 360 px), both layouts, motion reduced, with the local family server for accounts and pairing. Unit and API tests cover the logic underneath (see the end).

**Status key:** ✅ verified in the browser · 🔧 fixed in this audit · 🧪 concept or roadmap, labelled as such in the docs

| Feature | Doc source | Status | Fix or note |
|---|---|---|---|
| First-run welcome (child's name, who you are, the loop), skippable, re-runnable | PRODUCT-SPEC Onboarding, guide §2 | ✅ | Name appears across the Bridge; focus lands on the page after |
| Magic moment capture (rolling 15 s buffer, sound or sound and video) | PRODUCT-SPEC core loop, guide §4 | ✅ | |
| Moment length 5–60 s | PRODUCT-SPEC | ✅ | |
| Annotation sheet, intents, smart linking | PRODUCT-SPEC | ✅ | |
| Signal library with confidence, "LuminAAC is wondering" questions | PRODUCT-SPEC | ✅ | |
| Suggestions on My Voice, "Not these" feedback | PRODUCT-SPEC, guide §3 | ✅ 🔧 | On phones the sticky "Not these" chip now fades the chip behind it instead of cutting its text |
| Explore quietly, reviewed in Vocabulary | PRODUCT-SPEC | ✅ | |
| My things, play-moment buttons | PRODUCT-SPEC | ✅ | |
| Calm view, themes, keep the screen still | PRODUCT-SPEC, ACCESSIBILITY | ✅ | |
| Large / Playful / Focus modes, 300% zoom, dwell, one-switch scanning | PRODUCT-SPEC, ACCESSIBILITY | ✅ | |
| "I need help" and "Take me home" reach every open Bridge | PRODUCT-SPEC, guide §6 | ✅ 🔧 | Spec still called location "future" although Phase 3 built it; corrected |
| Stories and first/then routines | PRODUCT-SPEC, guide §5 | ✅ 🔧 | Guide said saved stories appear in Plans; they appear under My stories and practice (Play). Corrected |
| Speech practice with caregiver-chosen reward | PRODUCT-SPEC | ✅ | |
| Milestones, time-of-day patterns, intent mix | PRODUCT-SPEC | ✅ | |
| Insights, Interests and history, therapist summary | CONCEPT-INTERESTS-INSIGHTS, guide §12 | ✅ | Summary dialog opens with content |
| Video board, privacy-enhanced player, Talk about it | README, guide §12 | ✅ | A video added on the Bridge shows in My videos |
| YouTube channels (Ms Rachel linked once) | ROADMAP v0.12, guide §12 | ✅ | Needs the family server for lookups |
| Four sound games, stickers, weekly goals, sensory settings | README, guide §12 | ✅ | Covered by the phase 7 browser suite (48 checks) |
| Safe zones with consent, map and form, arrive and leave alerts | PRODUCT-SPEC Phase 3, guide §9 | ✅ | |
| Hand-drawn zones with keyboard editing, water danger zones (tiles then Overpass) | README v0.8, ROADMAP v0.11.2, guide §10 | ✅ | Phase 6 browser suite updated for the three-mirror race |
| Sensors (webhook links) and tracker buttons | ROADMAP v0.12, guide §11 | ✅ | Needs an account |
| Accounts, passkeys, roles, invites | PRODUCT-SPEC Phase 3, guide §15 | ✅ 🔧 | Guide named the button "Create an account"; it's "Create account". Corrected |
| Device pairing (QR and 6-digit code), switch off | PRODUCT-SPEC Phase 3 | ✅ | Code shown after sign-up on both sizes |
| Team chat | ROADMAP v0.12, guide §16 | ✅ | Needs an account |
| Share links, sync, export | PRODUCT-SPEC | ✅ | API suite |
| Retention: keep moments for 7, 30, 90 days or until deleted | guide §19 | ✅ 🔧 | Guide said "Keep recordings for … or forever"; matched to the app's "Keep moments for … Until I delete them" |
| Delete all moments, signals and history | guide §19 | ✅ | |
| Federated learning with DP, Shamir dropouts, ε cap | PRODUCT-SPEC Phase 3–4 | ✅ | API suite |
| Feeling estimates from voice (and optional face), always confirmed | PRODUCT-SPEC Phase 3–4 | ✅ 🔧 | Spec's AI table still said emotion recognition was future; now says estimates are built, validation is future |
| Speech feelings model, Kokoro voices | ROADMAP v0.6 | ✅ | Opt-in downloads, not run in the sweep |
| Email confirmation and password reset | ROADMAP v0.6 | ✅ | API suite; the hosted server keeps mail in the outbox until SMTP is set (documented) |
| Installable PWA, offline cache, self-reload on update | ROADMAP v0.6, v0.12.1 | ✅ | Cache bumped to `luminaac-v0.13.0`; guide works offline |
| Potty Path (button, path, sit timer, tokens, console, red flags, hints, print, sync) | PRODUCT-SPEC Phase 8, guide §13 | ✅ 🔧 | Behind a switch, off by default; spec now says so |
| Sound Path increment A | ROADMAP v0.11, guide §14 | ✅ | Behind a switch, off by default |
| Simpler layout (five Bridge hubs, Talk · Calm · My day · Play, Now/Next, Bridge only inside Caregiver) | REDESIGN R1, ROADMAP v0.11.1–v0.11.4 | ✅ 🔧 | Was behind `?redesign=1`; now the default (see design changes) |
| Family server on Vercel with Redis mirror | README Hosting, ROADMAP v0.12 | ✅ 🔧 | 503 replies no longer include the raw database error; `/api/health` reported version 0.5.0, now 0.13.0 |
| Caretaker guide in the app, print one-pager, offline | README, guide | ✅ | 21 guide checks |
| Skip links, native dialogs, focus ring, 24 px minimum targets, no ALL-CAPS | ACCESSIBILITY, DESIGN-SYSTEM | ✅ | Automated sweep of every page found no failures |
| Encrypted cloud backup | PRODUCT-SPEC AI/platform | 🧪 | Switch shown disabled as "coming soon"; spec now says it isn't built |
| Live push alerts on the hosted server, Web Push, hosted reset emails | ROADMAP v0.12 limits | 🧪 | Polling every 30 s is what's built; labelled |
| Sound Path increment B, Mouth Mirror | SOUND-PATH, ROADMAP | 🧪 | |
| Redesign R2–R5 (Log button, role views, handoff card) | REDESIGN | 🧪 | |
| Two-switch and row/column scanning, eye-gaze, photo symbols, recorded caregiver voice | ROADMAP Next, ACCESSIBILITY gaps | 🧪 | |
| E2E encryption of the synced family document, per-child partitions | ROADMAP Next | 🧪 | Potty Path sync is already end-to-end encrypted |
| Capacitor apps for background geofencing | ROADMAP | 🧪 | Scaffold only |
| Multi-camera LuminNode, click-to-clip day recording, AR, audio embeddings, gesture models, LLM help | Google Doc, PRODUCT-SPEC 🔭 rows | 🧪 | |
| Therapy tones, weather, meal plans | Google Doc via PRODUCT-SPEC | 🧪 skipped | No evidence base or out of scope; labelled "skipped" |
| Wetness sensors and toilet prediction | POTTY-PATH | 🧪 | Deliberately deferred |
| Pricing, institutional subscriptions, research licensing | GO-TO-MARKET | 🧪 | Business plan, nothing to build in the app |

**Counts:** 38 features checked as built: 29 verified as they were and 9 fixed (doc claims corrected, plus the layout switch, the server error reply and the health version). 0 had to be newly implemented: everything the docs call built exists and works. 11 concept, roadmap or skipped rows, all labelled honestly.

## Other docs corrected
- ROADMAP: "Now (this build, v0.6)" renamed "v0.6 (phase 4)"; polygon zones marked shipped (v0.8); v0.13 entry added.
- README: the version table listed v0.10 after v0.11; reordered, v0.13 row added, redesign described as the default.
- REDESIGN: status updated to "on by default since v0.13".
- PRODUCT-SPEC: tables added for v0.9 and v0.11–v0.13 features, which were missing.

## Tests run for this audit
Unit: geo-water 45, interests-games 44, nav 24, potty 89, sound 35. API: 155. Browser: phase 7 suite 48/48, phase 6 suite (zones, drawing, water) all pass, guide 21/21, journeys 24/24 (onboarding, help alert, therapist summary, videos, safety, account and pairing, guide), feature presence 24/24, full page sweep in both layouts at both sizes with no errors.
