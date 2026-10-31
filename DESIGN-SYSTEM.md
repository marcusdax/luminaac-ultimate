# LuminAAC design system

One system for the talker, the calm space, visual plans and the caregiver area.
Tokens live in `tokens.css`; components in `app.css`; vocabulary in `vocab.js`.
Open `index.html` through any static server (`python -m http.server` in this folder).

## Audit of what was in the folder (Oct 2026)

**Summary:** 4 overlapping versions reviewed · 3 competing visual systems · 0 shared tokens · score 34/100

| Version | Palette | Type | Status |
|---|---|---|---|
| `luminaac/original`, `Deepseekmodded` | Gold `#F4A261`, teal `#2A9D8F`, charcoal `#264653` (a stock Coolors palette) | Suisse International + Tiempos (paid licences, never loaded, so it fell back to system sans) | Tailwind utility classes, hex values repeated inline |
| `LuminAAC-Repository` | Navy `#1E3A8A`, indigo `#6366F1`, mint `#34D399` | Nunito Sans | Generic SaaS card kit, separate CSS copy per page |
| `ENHANCED LUMINAAC` | Blue `#64B5F6`, orange `#FF9800` on `#0F1419` | none set | Logo/brand demo only |
| Root (`index.html`, `src/`, `public/`) | WebStorm starter | JetBrains fonts | Not LuminAAC |

| Category | Defined | Problems found |
|---|---|---|
| Colors | 3 unrelated palettes | Word types were not colour-coded at all; tile colours were decorative |
| Typography | 3 stacks | 2 of 3 never loaded; no scale |
| Spacing | 8px scale on paper only | Arbitrary Tailwind values in code |
| Components | Grid, tile, dashboard cards | No shared tile; mobile `AACButton.js` / `AACGrid.js` are empty files |

**Content gaps:** `lunascript/*.json`, `mobile/components/*`, `docs/*.md`, `backend/main.py`, `backend/gemini.py` and 86 other files are 0 bytes.

**Interaction risk:** the old spec says tiles "rearrange based on context". In AAC that breaks motor planning, so people can't build automatic reach habits. This system keeps every core word in a fixed place and puts context-driven ideas in a separate "Next" row.

### Priority actions (done in this folder)
1. One token file with day, night and high-contrast themes that share names.
2. Colour that means something: the modified Fitzgerald Key, so a learner's colour habits carry over from other boards.
3. A real, free, legibility-first typeface that loads.
4. Fill the empty content: core vocabulary, folders, plans, calm tools.

## Principles

1. **Same place, every time.** Core tiles never move. Prediction lives in its own row.
2. **Colour is grammar.** A tile's colour tells you its word type; nothing else uses those colours.
3. **Calm by default.** Cool, low-glare surfaces, no idle animation, one lit element.
4. **The person's voice comes first.** Caregiver tools sit behind press-and-hold and never edit the board while it's in use.
5. **Private by default.** Everything is stored on the device. Export is the user's choice.

## Tokens

### Surfaces (day / night / contrast)
| Token | Day | Night | Use |
|---|---|---|---|
| `--fog` | `#E9EEEC` | `#151C22` | App background |
| `--paper` | `#F7F9F8` | `#1E2830` | Tiles, panels |
| `--ink` | `#1C2630` | `#E6ECEF` | Text (13.9:1 on paper, day) |
| `--ink-soft` | `#4B5864` | `#A9B6BF` | Secondary text (7:1) |
| `--dusk` | `#22313D` | `#0E141A` | Sentence strip, breathing room |
| `--lumen` | `#F2B33D` | same | Lit word, focus ring, Speak button |

### Word classes (modified Fitzgerald Key)
| Class | Band | Tint (day) | Examples |
|---|---|---|---|
| people | `#C99A00` yellow | `#FBF1CC` | I, you, mom |
| action | `#2F8A4C` green | `#DCEFE1` | want, go, help |
| describe | `#2F6FB3` blue | `#DBE7F5` | more, big, happy |
| thing | `#C7651C` orange | `#FAE3CF` | water, home, tablet |
| social | `#B84A80` pink | `#F5DBE8` | please, yes, hi |
| question | `#6E4FAE` purple | `#E6DDF3` | what, where |
| negate | `#B8372F` red | `#F6D9D6` | stop, not, no |
| little | `#7A858D` grey | `#ECEFF0` | that, here |

The band (6px, 10px in high contrast) carries the class; the tint is a quiet fill. Labels are always ink, so contrast never depends on the class colour. Screen readers hear the class name ("want, Actions").

### Type
Atkinson Hyperlegible Next (Braille Institute, free on Google Fonts), one family throughout. Its letterforms are drawn to stay distinct (I/l/1, O/0) for low vision.

| Token | Size | Use |
|---|---|---|
| `--fs-xxl` | 44 | Scale numbers |
| `--fs-xl` | 32 | Sentence strip, page titles |
| `--fs-lg` | 24 | Section titles, plan "now" |
| `--fs-md` | 20 | Calm buttons, step titles |
| tile label | 18 bold | Tiles |
| `--fs-sm` | 16 | Body |
| `--fs-xs` | 14 | Meta, form labels |

### Space, radius, touch
- Space: 4, 8, 12, 16, 24, 32, 48.
- Radius follows hierarchy: chip 999, tile 14, strip 18, sheet 22. Folder tabs have one square corner so they read as folders.
- Tiles are at least 104px tall (92px on phones); other targets at least 56px.

### Motion
- `--t-press` 90ms: tile press scale (answers a touch).
- `--t-glow` 420ms: words light up one by one as they're spoken. This is the only decorative motion.
- Breathing orb: 4s in, 4s out, only when the person chooses Calm.
- `prefers-reduced-motion` and the "Keep the screen still" setting turn all of it off.

## Components

### Sentence strip
The lit bar at the top. Tap it or **Speak** to say the message; each word glows amber as it's spoken. Backspace removes the last word, ✕ clears.
- States: empty (hint text), filled, speaking (one word `.lit`, earlier words `.done`).
- A11y: `aria-live="polite"`; the button label reads the full message.

### Tile
| Property | Values | Default |
|---|---|---|
| `data-c` | people, action, describe, thing, social, question, negate, little | little |
| `data-p` | ARASAAC pictogram id (pins the right sense, e.g. "stop" hand, not bus stop) | none |
| picture | ARASAAC image, else emoji | emoji until the image loads |

States: default, pressed (scale .96), focus (amber ring). Do: keep the label under the picture by default (setting can flip it). Don't: use class colours for anything that isn't a word.

### Quick phrase
Pill outside the grid; one tap speaks right away without touching the strip ("I need a break", "Wait, I'm still talking").

### Next row
Up to five ideas. Learned on the device from word pairs the person has actually spoken; falls back to class-based starters. Never reorders the grid.

### Folder tab
Switches the grid between Core words and fringe sets (Feelings, Body & needs, Food & drink, People, Places, Things, Chat).

### Feelings scale (Calm)
Five steps from Calm to Too much. Choosing 3+ opens the breathing room, "I need" requests and a short guide for the helper. Choosing 4+ drains colour from the board (low-arousal mode).

### Plan
Now/Then cards plus numbered steps (numbers are used because these are sequences). Each step has phrases to say in that moment. Ships with grocery store, restaurant and doctor visit.

### Caregiver area
Press and hold the lock for 2 seconds (keyboard: hold Enter). Contains week stats, most-used words (bars use each word's class colour), Moments log (sign → meaning → context), add-a-word, settings, data export and erase.

## Content rules
- Write as the speaker: "I need a break", not "User requests break".
- Buttons say what happens: "Save moment" → toast "Moment saved".
- Errors say what to do: "Add a word first".

## Credits
Pictograms: Sergio Palao, ARASAAC (arasaac.org), CC BY-NC-SA, Government of Aragón. Non-commercial licence: a paid product needs its own symbol licence or set.

---

## Ultimate edition additions (Oct 2026)

### Brand palette (from `ENHANCED LUMINAAC NEW LOGOBRANDCOLORS.js`)
Defined in `brand/brand-tokens.css`. The original brand colors are bright, so each has a "deep" partner for text on light surfaces.

| Token | Value | Use |
|---|---|---|
| `--sky` | #64b5f6 | Brand primary. Logo wave, bars on dark, night-theme chips |
| `--sky-deep` | #1f64a8 | Sky as text/borders on light (≥ 4.5:1) |
| `--sky-tint` | #e3f0fc | Suggestion chips, learned-signal nodes |
| `--ember` | #ff9800 | Brand accent. Moment markers, active tab bar |
| `--ember-deep` | #a35200 | Ember as text on light (≥ 4.5:1) |
| `--ember-tint` | #fff0db | Moments waiting for an explanation, top suggestion |
| `--night-sky` | #0f1419 | Dark marketing surfaces |
| `--mist`, `--grow` | #90a4ae, #4caf50 | Decorative only |

`--lumen` (#f2b33d) stays the single "lit" color: the Speak button, Keep-that-moment button, focus ring, and the child at the center of the personality map.

### Roles of color
- **Sky = what LuminAAC learned.** Suggestions, signals, charts.
- **Ember = what you caught.** Moments, things waiting on a caregiver.
- **Lumen = the child's voice.** Speaking, capturing, the child themself.

### Logo set (`brand/`)
- `logo-mark.svg` – app icon / favicon (dusk tile, sky wave = a child's signal, lumen sun with ember rays = being understood)
- `logo-mark-mono.svg` – single-color, inherits `currentColor`
- `logo-wordmark.svg`, `logo-wordmark-dark.svg` – horizontal lockups for light and dark

Clear space: half the mark's height on all sides. Minimum size: 24px mark, 120px wordmark.

### New components
- **Suggestion chip** (`.mv-chip`) – 56px min height; top suggestion glows gently (disabled under reduced motion / "keep the screen still").
- **Capture card** – the one dark, warm panel in the Bridge; the 64px Keep-that-moment button breathes only while listening.
- **Timeline** – ember dots (moments, clickable), sky ticks (spoken words), violet flags (patterns noticed). Key always shown; every item has a text label.
- **Signal card** – colored top band, confidence ring (conic gradient) with the number printed inside, so it never relies on color alone.
- **Personality map** – radial SVG, child in lumen at center; text alternative in `aria-label`.
- **Sheets** – native `<dialog>` for annotation and onboarding (focus trapping and Esc for free).

### Copy
Sentence case. Talk to the parent like a friend who gets it: "What did that mean?", "Keep that moment", "Not sure yet". No arrows on buttons, no all-caps labels.
