# LuminAAC website design direction: "Night to light"

Status: November 2026. This covers the public website (`about.html` today, and the landing pages that follow). The app keeps its own direction in [DESIGN.md](DESIGN.md) ("Quiet sky, lit strip"). The two share one brand, one action colour and one typeface for body text. Values live in `brand/brand-tokens.css` under "Website" and are used by name, never as raw values.

**The idea.** The logo is a wave (a voice) under a rising sun. The site tells that story as one scroll, from night to dawn. You start in a dark sky where a voice can't get out. You finish in morning light, on the promise: free for families, forever. Light is earned as you scroll. **Lit means chosen, on the site as in the app**: the gold appears only where something matters (the call to action, the spoken word, "$0").

How the site differs from the app: the app is calm because a child is using it to talk. The website is where LuminAAC is allowed to be cinematic. It still respects reduced motion and never puts motion behind words someone has to read.

## 1. Colour roles

| Token | Value | Role |
|---|---|---|
| `--site-abyss` | `#080c11` | Top of the hero, the deepest night |
| `--night-sky` (brand) | `#0f1419` | Page background for night sections |
| `--dusk` (app) | `#22313d` | Sticky nav band, cards on night |
| `--site-dawn` | `#2b2622` | Warm transition band between night and day |
| `--site-day` | `#f6f2ea` | Background of the closing "free forever" section (warm paper, not white) |
| `--site-ink-night` | `#eef2f4` | Text on night (16.4:1 on `--night-sky`) |
| `--site-ink-night-soft` | `#a9b6bf` | Secondary text on night (8.9:1) |
| `--ink` / `--ink-soft` (app) | `#1c2630` / `#4b5864` | Text on day (13.7:1 and 6.5:1 on `--site-day`) |
| `--lit` (app, `--lumen`) | `#f2b33d` | **Primary.** Buttons, focus ring, the spoken word, the "$0". Never decoration. Text on it is `--lit-ink` (8.2:1) |
| `--sky` (brand) | `#64b5f6` | **Accent.** The voice: the wave, sound lines, links on night (8.4:1). Links on day use `--sky-deep` (5.5:1) |
| `--ember` (brand) | `#ff9800` | Logo sun rays only. Not used in UI |
| `--wc-*` (app) | Fitzgerald Key | Only inside board demos, never as section colours |
| `--ok` / `--alert` (app) | | Form success and error |

Rules:
- One gold thing per screen. If two items are lit, one of them is wrong.
- The only gradients are skies: background washes between two neighbouring tokens (night to dusk, dawn to day). No gradient text, no gradient buttons, no purple-to-blue.
- Glow is light, not colour: `--glow-lit` and `--glow-sky` are soft halos behind a lit item. Nothing else glows.

## 2. Typography

Two families:
- **Display: Fraunces** (variable, free on Google Fonts, SOFT axis at 100, opsz on). A warm, hand-touched serif for headlines and the founder's words, so the site reads like a promise from a person rather than a product sheet. Weights 400 and 600. Headlines are sentence case.
- **Body and UI: Atkinson Hyperlegible Next**, the same as the app, at 400, 600 and 800. Buttons, nav, labels, board tiles and all body text use it.

| Token | Size / line height | Use |
|---|---|---|
| `--fs-hero` | clamp(3.25rem, 8.5vw, 7rem) / 1.0 | The one hero line |
| `--fs-d1` | clamp(2.5rem, 5.5vw, 4.5rem) / 1.05 | Section headlines, "$0" |
| `--fs-d2` | clamp(1.75rem, 3.2vw, 2.75rem) / 1.15 | Sub-headlines, story pull quotes |
| `--fs-lead` | 1.375rem (22) / 1.45 | Intro paragraph under a headline |
| `--fs-body` | 1.125rem (18) / 1.6 | Body text |
| `--fs-ui` | 1rem (16) / 1.4 | Buttons, nav, labels |
| `--fs-meta` | 0.875rem (14) / 1.4 | Captions, footnotes |

Text width is `--measure: 38rem` (about 68 characters at 18 px). Fraunces is never set smaller than `--fs-d2`.

## 3. Space and layout

- The 4 px scale from the app (`--s1` to `--s7`), plus `--s8: 64px`, `--s9: 96px`.
- Section padding: `--sec: clamp(96px, 16vh, 200px)` top and bottom. Each section owns most of a screen, so one idea is on screen at a time.
- Content width `--wrap: 72rem`, gutter `--gutter: clamp(16px, 4vw, 48px)`.
- Alternate the layout. Hero is full-bleed, story is off-centre (text left, image bleeding right), features run as a horizontal strip, the pledge is centred. Only the hero and the pledge are centred.

## 4. Shape and depth

- Radius: `--r-chip: 999px` (buttons, pills), `--r-tile: 14px` (board tiles, from the app), `--r-card: 22px` (panels, from `--r-sheet`), `--r-media: 28px` (photos and video).
- Depth on night comes from light, not shadow: `--glow-lit: 0 0 48px rgba(242,179,61,.35)` and `--glow-sky: 0 0 40px rgba(100,181,246,.28)`.
- On day sections, use the app's `--lift` and nothing else.
- No glass, no blur panels, no borders on night cards (use `--dusk` fill instead).

## 5. Components

- **Primary button:** `--lit` pill, `--lit-ink` text at 800 weight, min-height 56 px, `--glow-lit` on hover, 3 px `--lit` focus ring at 3 px offset, 40% opacity when disabled. Only one per screen. The label is a verb: "Open My Voice", "Start free".
- **Secondary button:** transparent, 2 px `--sky` border and `--sky` text on night, or `--sky-deep` on day.
- **Quiet link:** underlined, 3 px offset. `--sky` on night, `--sky-deep` on day.
- **Nav:** transparent over the hero, turns into the `--dusk` band after 80 px of scroll. Logo on the left; on the right Guide, Bridge, Our story, and the one lit "Open My Voice" pill.
- **Board demo:** the real tile component (`--r-tile`, 6 px class band, tint fill) at 1.25× size, with a `--dusk` sentence strip. Features are shown by doing them on this board, not by describing them on cards.
- **Feature strip:** five "lit tiles" (Talk, Bridge, Calm, Play, Private). The active one is lit and opens a short demo with one sentence. No grid of three identical cards.
- **The box vs. the sky:** one comparison block. On the left, a closed grey box with a padlock and a monthly price ticking up. On the right, the open sky with the wave. Plain words, no competitor names.
- **Pledge:** "$0" in Fraunces at `--fs-d1` in `--lit`, then one line: "Free for nonverbal people, families and caregivers. The full app. Forever."
- **Story:** a full-bleed photo or film with a pull quote in Fraunces. Video always has captions and a poster frame, and never autoplays with sound.
- **Footer:** `--night-sky` background with links, the free-forever line, privacy and accessibility statements.

## 6. Motion

| Token | Value | Use |
|---|---|---|
| `--t-ui` (app) | 180 ms | Hover, nav band, button glow |
| `--t-reveal` | 700 ms | Text and tiles entering on scroll (rise 16 px and fade) |
| `--t-scene` | 1200 ms | Colour changes between sky sections |
| `--ease-out` | cubic-bezier(.16, 1, .3, 1) | Reveals and scenes |
| `--t-ambient` (app) | 40 s | Slowest sky drift in the hero |

- **Hero:** a WebGL night sky (reuse `shader-sky.js` and `shaders/sky.js`) with the logo wave drawn as light. Each tap or click lights a star and speaks a word. That is the product's promise, shown in one gesture.
- **The scroll is the story:** the background moves night → dusk → dawn → day across the page, driven by CSS scroll timelines where supported.
- **Allowed on the site only:** slow light motes in the hero, parallax of no more than 40 px on photos, and the founder film.
- **Reduced motion or Still:** each section shows its final frame, and the hero becomes the static logo sky. Nothing flashes more than 3 times a second.

## 7. Imagery and icons

- **Icons:** Tabler (MIT), 2 px stroke, 24 px, the same as the app. No emoji in site UI. OpenMoji appears only on board tiles.
- **Photography:** real photos from the founder's family, never stock. Warm grade, every shot colour-matched to one reference frame. Subjects can be cut out (rembg) and set against the sky.
- **Film:** a 60 to 90 second founder story, cut on the beat of its score (PySceneDetect, Auto-Editor, librosa for beat marks, FFmpeg for export). Titles are HTML (HyperFrames) set in Fraunces.
- **3D:** at most one object, the sun as a glowing lantern (three.js, already used in `train3d.js`). It must load after the first paint and have a still fallback.
- **The art direction from the R&D decks** (neural light, nodes on near-black): kept as texture only. Connection lines and node glows appear in the Bridge section, drawn in `--sky`. There is no cyber or neon look.
