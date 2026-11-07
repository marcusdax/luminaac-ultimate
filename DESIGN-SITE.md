# LuminAAC website design direction: "Night to light"

Status: November 2026, built at [`welcome/`](welcome/) (served at `/welcome/`). The app keeps its own calm direction in [DESIGN.md](DESIGN.md). The website doesn't have to look like the app: it is where LuminAAC is allowed to be a visual piece. They share the gold action colour, the body typeface and the word-class colours, so the site still feels like home when someone opens the app. Values live in `brand/brand-tokens.css` ("Website") and `welcome/site.css`, and are used by name.

**The idea.** The logo is a wave (a voice) under a rising sun. The site tells that story as one scroll, from night to morning. Behind every section is the **Luminous Field**: a living, visionary mandala of light. You start in a night sky full of light where a voice can't get out yet. You finish in morning light, on the promise: free for families, forever. **Lit means chosen**: the gold marks only what matters (the call to action, the spoken word, "$0").

**The message.** No one should have to pay for their voice to be heard. LuminAAC is free for nonverbal people, their families and caregivers, for the full app, forever. The founder's story is told in general terms: a single dad who refused to accept a voice in a box or behind a subscription. The site doesn't use the child's name or family photos.

## 1. The Luminous Field (`welcome/field.js`)

One full-screen WebGL fragment shader behind the page, inspired by visionary art (intricate, radiant, sacred geometry) but kept light:
- a flower-of-life mandala, with an inner layer and an outer layer turning slowly in opposite directions
- iridescent filaments radiating from a warm golden heart
- a fine "capillary" filigree that flows across the whole field
- tap ripples (sky blue)

Each section sets the field with `data-*` attributes: `data-sky` (0 night, 1 morning), `data-center` and `data-center-m` (where the heart sits on desktop and on phones), `data-zoom` (0.6 times on portrait screens), `data-glow` (line intensity: 1 in the hero, 0.45 to 0.55 behind reading text) and `data-warm` (a warmer dusk behind the founder's story). Values ease over time, so the mood shifts the same way at any frame rate.

The field scales its resolution down on slow devices, pauses when the tab is hidden, renders one still frame in Still mode or with reduced motion, and falls back to a CSS gradient without WebGL.

## 2. Colour roles

| Token | Value | Role |
|---|---|---|
| `--site-abyss` | `#080c11` | Deepest night, the page base |
| `--site-day` | `#f6f2ea` | Morning paper behind the closing sections |
| `--site-ink-night` | `#eef2f4` | Text on night (16.4:1). Night text also gets a soft dark halo (`--night-text-shadow`) so it reads over the field |
| `--site-ink-night-soft` | `#a9b6bf` | Secondary text on night (8.9:1) |
| `--ink` / `--ink-soft` | `#1c2630` / `#4b5864` | Text on morning (13.7:1 and 6.5:1) |
| `--lit` | `#f2b33d` | **Primary.** Buttons, focus ring, the spoken word, "heard.", "$0" |
| `--sky` / `--sky-deep` | `#64b5f6` / `#1f64a8` | **Accent.** The voice: links, ripples, the second button |
| `--ember-deep` | `#a35200` | Eyebrows and the "$" on morning sections |
| `--rose`, `--teal` | `#f2a7c3`, `#7fd6cf` | Iridescent line art only (mandala, constellation). Never text or UI |
| `--wc-*` | Fitzgerald Key | Word tiles: lanterns, the freed words, board demos |

Rules:
- One gold thing per screen.
- Rainbow colour lives only in the light lines of the field and the mandalas. Text, buttons and cards stay in the core palette.
- No gradient text, no gradient buttons, no glass panels.

## 3. Typography

- **Display: Fraunces** (SOFT 100, opsz 144, weights 300 to 400). Used for headlines, the manifesto, the founder's words and "$0".
- **Body and UI: Atkinson Hyperlegible Next** (400, 600 and 800), the same as the app.
- Scale: `--fs-hero` clamp(3.25–7rem), `--fs-d1` clamp(2.5–4.5rem), `--fs-d2` clamp(1.75–2.75rem), `--fs-lead` 22 px, `--fs-body` 18 px, `--fs-ui` 16 px, `--fs-meta` 14 px. Measure 38rem.

## 4. Sections

| # | Section | Sky | What moves |
|---|---|---|---|
| 1 | **Hero:** "No one should have to pay to be heard." | night, full glow | Title lines rise out of a blur. Tap anywhere: a word tile floats up as a lantern, the field ripples, and the word is spoken (sound toggle in the header) |
| 2 | **Manifesto** | night | The words light up one by one as you scroll. "box", "price tag" and "subscription" light in gold. Ends on "A voice is a right, not a subscription." |
| 3 | **The box** | night | Pinned and scrubbed: a grey 3D box with a padlock and "$ / month". The lock falls, the lid swings open and the front drops. "I want to be heard" rises out as word tiles, and the headline changes to "We opened the box." |
| 4 | **Our story** | warm dusk | An SVG flower-of-life mandala draws itself on scroll, then turns slowly with a beating heart |
| 5 | **What makes it different** | night, low glow | A constellation of 8 differences around the logo. It cycles on its own until touched; arrow keys move between them |
| 6 | **See it speak** | morning | A sticky tablet frame plays **real recordings** of the app (Talk, Calm, My day, Play, the Bridge). The chapter changes as you scroll or tap. On phones the chapters become pills under the tablet |
| 7 | **$0** | morning | Counts down from 300 to 0. The "per…" line steps through month → year → the full app → every family → forever |
| 8 | **Get LuminAAC** | morning | Open in the browser (`/`), Add to home screen (a real Install button where the browser supports it, plus steps for iPad/iPhone and Android), App Store and Google Play marked "Coming soon" (honest: not submitted yet, see docs/STORE-CHECKLIST.md) |
| 9 | **Guides** (`#resources`) | morning | Three PDF cards (brochure, user guide, clinician brief) with cover thumbnails, served from `welcome/docs/`. Cards rise in on scroll and lift on hover |

## 5. Components

- **Buttons:** primary `--lit` pill (56 px), ghost `--sky` outline, ink button on cards. 3 px gold focus ring everywhere.
- **Header:** transparent over the hero; turns into a band after 80 px (dark at night, paper in the morning). Sound and Still toggles are 44 px icon buttons with `aria-pressed`.
- **Lanterns and freed words** reuse the app's tile look: a tint fill and a class-colour band.
- **Device frame:** dark bezel, 34 px radius, with the recording at the app's 1180×820 aspect ratio.

## 6. Motion and access

- Libraries are vendored in `welcome/vendor/`: GSAP 3.13 with ScrollTrigger and SplitText (GreenSock standard no-charge licence), and Lenis 1.3.4 smooth scroll (MIT).
- **Still mode** (header button, remembered) and `prefers-reduced-motion`: the field renders one frame, there is no smooth scroll and no pinning, every section shows its final state, the walkthrough shows a play button instead of autoplaying, and lanterns fade in place.
- Videos are muted, `playsinline`, play only while on screen, and have a WebM fallback.
- Nothing flashes. Ripples fade over 6 s.

## 7. Imagery

- **Walkthroughs:** recorded from the real app with `tools/record-walkthroughs.js` (Playwright, with a visible gold "finger"), then encoded to H.264 MP4 plus VP9 WebM with posters, about 4 MB in total. Re-record them whenever the app's look changes.
- **No stock and no family photos.** All art is generated in code: the field shader and the SVG mandala and constellation.
- **Icons:** stroked, 24 px, 2 px or 1.8 px lines. No emoji in the site interface; emoji appear only inside app recordings.
- **R&D decks and Drive:** the VIVELLA poster's radial "compass" geometry informed the constellation. Its branding is not used.
