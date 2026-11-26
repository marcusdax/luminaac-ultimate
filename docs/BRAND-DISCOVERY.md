# LuminAAC brand discovery report

November 2026. This report records where the LuminAAC brand lived before it was written down, what conflicted, and what was decided. The result is [.claude/brand-voice-guidelines.md](../.claude/brand-voice-guidelines.md).

## Sources reviewed

| Source | What it gave us |
|---|---|
| Website (`welcome/`, luminaac.org) | The current voice: "No one should have to pay to be heard.", "A voice is a right, not a subscription.", the founder's story |
| App copy (My Voice, the Bridge, `guide.html`) | Plain, calm instructional voice; honesty about limits |
| README, PRODUCT-SPEC, GO-TO-MARKET, DESIGN, DESIGN-SITE, DESIGN-SYSTEM | Positioning, tiers, visual systems |
| Family, School & Clinic user guide and Clinician brief (v0.18) | Strong "safety, honesty and limits" language; demo names labelled as invented |
| Brochure for families, schools and clinics (v0.8) | Early pillars; dated numbers and jargon |
| Product specification and clinical feature map | Clinical framing |
| The Empathic Guardian whitepaper (text and print versions) | Long-range vision; "you are your child's best translator"; many unbuilt features |
| "AAC Expert" role profile (Drive) | Neurodiversity-affirming principles (double empathy, gestalt language processing, echolalia as communication) |
| Drive page "Technology That Sees What You See" | The second tagline; an older palette and paid fonts |

No formal brand book existed before this.

## What was consistent

- The core belief that a voice is a right, not something to pay for.
- "You are your child's best translator": LuminAAC learns from the people who already understand.
- Plain, warm, honest writing in the app and guides.
- Privacy as a default, not a setting.

## Conflicts and decisions

| # | Conflict | Decision |
|---|---|---|
| 1 | GO-TO-MARKET had a $6/month "Family plus" tier, while the site promises no paid family tier | **No paid tier for families, ever.** Backup, sync and the full care circle are free. GO-TO-MARKET updated |
| 2 | Three competing taglines | **Lead:** "No one should have to pay to be heard." **Second:** "Finally, technology that sees what you see." "Their voice. Not someone else's." supports |
| 3 | The founder's story: how much to tell | **Tell more, still with no names.** The website story was expanded; rules are in the guidelines §8 |
| 4 | The Empathic Guardian: public or investor-only | **Both.** Full whitepaper for investors and partners, labelled as vision; a plain-language public version at [VISION.md](VISION.md). Docs, walkthroughs and screenshots to be kept current with the app |
| 5 | "Nonverbal children" vs "nonverbal people" | **"Nonverbal people."** README, About page and GO-TO-MARKET updated |
| 6 | The brochure (v0.8) has dated numbers and jargon | **Kept as is**, as a historical document. New material follows the guidelines |
| 7 | Whitepaper promises cameras and sensors | **Sensing is an optional feature**, off until a caregiver turns it on, and always described that way |

## Other findings to act on

- The whitepaper uses "a voice to the voiceless" and contains an illustrative family quote with an invented name. Neither should be used publicly as is.
- The whitepaper mentions licensing data to research institutions. Public copy should describe research only as opt-in, de-identified and ethics-reviewed.
- Old links to `luminaac-web.vercel.app` were replaced with luminaac.app in the README and guides. The backend's default `ALLOWED_ORIGINS` (in `api/index.js`) still names the old host and should be checked against the deployed environment variable.
- The retired gold/teal/coral palette in the Drive page should not be reused.

## Privacy note

Nothing in this report or the guidelines names the founder's son or uses family images. One uploaded screenshot showed a postal address and was not used.
