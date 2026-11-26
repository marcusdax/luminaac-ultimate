# LuminAAC website design direction: "Daylight prism"

Status: November 2026, built at [`welcome/`](welcome/) (served at `/welcome/`, and at luminaac.org). This replaces the earlier "Night to light" direction (still in git history). The app keeps its own calm direction in [DESIGN.md](DESIGN.md). The website shares the app's body typeface (Atkinson Hyperlegible Next) and its word-class colours, so opening the app still feels like home.

**The idea.** White light goes into a prism and comes out as every colour. A voice works the same way: one person, every word they need. The site is pure daylight: pearl-white light, refracted rays, glass and a rainbow fringe wherever light bends. Nothing on the page is dark except the ink.

**The message.** No one should have to pay for their voice to be heard. LuminAAC is free for nonverbal people, their families and caregivers, for the full app, forever. The founder's story is told in general terms. The site doesn't use the child's name or family photos.

## 1. The light (`welcome/prism.js`)

One full-screen WebGL fragment shader behind the page:
- pearl paper, faintly warm at the top and cool at the bottom
- three soft pastel blooms of spectrum that drift
- light rays falling from a light source, each with a rainbow fringe at its edge
- caustics (light on the floor of a pool), tinted by the spectrum
- a ring of spectrum where someone taps

Each section sets the light with `data-hue` (0 to 1 around the colour wheel) and `data-light` (where the light source sits, as x,y fractions of the screen). Values ease over time.

**Readability rule:** the shader clamps every pixel to at least 90% brightness (`clamp(col, vec3(.9), vec3(1.))`), so the dark ink always reads on it. That is why the site needs no dark backings or scrims.

It renders at roughly half resolution, caps at 30 frames a second, pauses when the tab is hidden, draws one still frame in Still mode or with reduced motion, and falls back to a CSS gradient without WebGL.

## 2. Colour (site-local `--p-*` tokens in `welcome/site.css`)

The site defines its own colours, so the app's night theme in `tokens.css` can't leak in. `<html data-theme="day">` also turns that theme off.

| Token | Value | Role |
|---|---|---|
| `--p-pearl` | `#f6f4ef` | Page base |
| `--p-ink` | `#14202b` | Text and primary buttons (15.9:1 on pearl) |
| `--p-ink-soft` | `#3c4955` | Secondary text (9.1:1) |
| `--p-label` | `#5a34b8` | Eyebrow labels, tags, "per year" (7.9:1) |
| `--p-spectrum` | rose, amber, sun, mint, sky, violet | Line art, glows, rays, the rainbow edge on glass. **Never small text** |
| `--p-spectrum-text` | the spectrum deepened (`#b8235f` to `#6a3fd0`) | Gradient fill for large display words only ("heard.", "We let the light through.", "$0"). Every stop is at least 3:1 on pearl |
| `--p-wc-*` | the board's word colours (day values) | Word tiles in the hero, the prism scene and taps |
| `--p-glass` / `--p-glass-strong` | white at 66% / 84% | Glass cards, with an 18 px backdrop blur. Without backdrop-filter they use the stronger white |

## 3. Type

- **Display:** Plus Jakarta Sans 800, letter-spacing −0.035em. Heavy and friendly at large sizes.
- **Accent:** Instrument Serif italic, for the one word a heading turns on ("heard.", "not a subscription.", the pull quote), usually filled with `--p-spectrum-text`.
- **Body:** Atkinson Hyperlegible Next 19 px / 1.6, the app's own typeface, chosen for low vision.

## 4. Components

- **Glass card** (`.glass`): translucent white, backdrop blur, a white edge, a soft shadow, and a thin rainbow along the top edge where light enters.
- **Buttons:** primary is ink with a spectrum glow on hover and focus; secondary is glass with an ink outline.
- **Eyebrow:** violet uppercase label with a short rainbow bar before it.
- **Word tiles:** the app's tiles, with a coloured base for their word class.

## 5. Sections and motion (GSAP + ScrollTrigger, Lenis smooth scroll)

1. **Hero.** The title rises out of a blur; a glass prism turns in; a beam of white light enters and fans out into six coloured rays; the words "I want to be heard" ride out along the rays. Tap anywhere in the hero and a word appears in its board colour, is spoken aloud (when sound is on) and sends a ring of spectrum through the light.
2. **Manifesto.** Pinned. Each word catches the light as you scroll; "box", "price tag" and "subscription" turn into spectrum italics.
3. **The prism (Why it's free).** Pinned scroll scene. A locked "$ / month" box fades back, a beam passes through glass and splits into rays, and the words "I want to be heard" come out. The heading turns from "Other apps keep a voice in a box." to "We let the light through."
4. **Story.** Rings of spectrum turning slowly beside a glass card with the founder's words.
5. **Spectrum of differences.** A rainbow band paints across; eight values as glass chips with their own colour; a panel explains the chosen one. It cycles on its own and stops when someone points at or focuses it. Arrow keys move between chips.
6. **See it speak.** The app's real recordings (unchanged) in a glass tablet with a spectrum glow. The chapters follow the scroll. On phones and tablets, the tablet, chapter pills and text stay on screen as one block.
7. **What's new, $0, Get it, Guides.** Glass cards that rise in with a little depth; "$0" counts down from 300 and blooms out of the light.

Still mode (the pause button, remembered on the device) and `prefers-reduced-motion` turn every animation off, show the finished state of each scene and draw the light once.

## 6. Accessibility

- Text over the light is checked against the rendered pixels, not just the tokens.
- All interactive pieces are real buttons and links with visible focus (ink outline plus a violet halo).
- Decorative art is `aria-hidden`. The prism scene's words are also in the heading and copy.
- Targets are at least 44 px.
