# LuminAAC design direction: "Quiet sky, lit strip"

Status: v0.13 direction, November 2026. It covers backgrounds, menu bars and game scenes. The talk tiles, emoji pictures, word colours (modified Fitzgerald Key) and the sentence strip don't change. Full component rules stay in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Values live in `tokens.css` under "v0.13" and are used by name, never as raw values.

**The idea.** The logo is a lit wave on a dark band, and on the board the word being spoken lights up gold. This direction carries that one metaphor through every bar: **dark bands frame the screen, and lit means chosen**. Behind the board stays a calm, almost still sky, so the tiles are the only thing that looks touchable (figure and ground). Atmosphere lives at the edges and inside Play, Calm and games, never behind words.

## 1. Colour roles

| Token | Day | Night | Contrast | Role |
|---|---|---|---|---|
| `--sky-top` | `#e4edf1` | `#141c24` | `#000` | Top of the page background |
| `--sky-low` | `#eef1ec` | `#182019` | `#000` | Bottom of the background (a faint warm horizon) |
| `--grain` | 0.035 | 0.05 | 0 | Opacity of the static paper grain over the sky |
| `--dusk` (existing) | `#22313d` | `#0e141a` | `#000` | The band: menu bars, sentence strip, Bridge header. (`--band` is already the tile edge width, so the colour keeps its name.) |
| `--band-ink` | `#c8d3dc` | `#8f9ea9` | `#fff` | Resting icon and label on a band (8.8:1 day, 6.7:1 night) |
| `--lit` (existing `--lumen`) | `#f2b33d` | `#f2b33d` | `#ffd60a` | The chosen item, focus ring and spoken word. Never decoration |
| `--lit-ink` | `#1c2630` | `#1c2630` | `#000` | Text on lit (8.3:1) |
| `--sky-deep`, `--ember-deep` | from brand | | | Links (sky) and one warm accent (ember) in the Bridge only |

Rules:
- One action colour per screen, which is lit. Word colours belong to tiles and nowhere else, so their meaning stays clean.
- No gradients on buttons or text. The only gradient is the sky, two stops close in value (ΔL under 5), so it reads as light rather than decoration.

## 2. Backgrounds

- **Talk, plans and every board:** `--sky-top` to `--sky-low`, plus the static grain. No motion, ever.
- **Calm:** the same sky, with an optional breathing horizon (4 s in, 6 s out). It follows the existing breathing guide, so there is one rhythm, not two.
- **Play and games:** a scene backdrop from `--scene-*` (dawn, day, dusk, night, sea, rails). Ambient motion is slower than `--t-ambient` (40 s a cycle) and stops when Still mode or reduced motion is on.
- **Part of day.** The app already knows the part of day for suggestions. The sky tint may follow it (dawn, day, dusk, night) as one step per part of day, never animated across.
- **Never:** particles, parallax, video backgrounds, or busy patterns behind the board. Confetti is off; rewards use the World instead.

## 3. Menu bars

**My Voice nav, the "lantern rail".** It sits on the dark band, the same colour as the sentence strip, so strip and rail frame the board like the bezel of a device.
- Icons are 2 px stroke, round caps (Tabler style), and labels always show.
- The current item is a lit pill: `--lit` with `--lit-ink`, radius `--r-chip`. Other items use `--band-ink`.
- It takes a 96 px rail on tablets and a 72 px bottom bar on phones (`--nav-h`).
- Caregiver keeps its hold ring, drawn in `--lit`.

**Bridge hubs.**
- Bottom bar on phones (it already scrolls sideways), left rail from 761 px.
- The bar is paper, not band, so caregivers can tell their tool from the child's at a glance. The current hub gets a lit indicator: a 4 px bar under the icon on phones, a pill on the rail.
- The indicator slides in `--t-ui` with `--ease`, and jumps when motion is reduced.

**Headers.** The Bridge header stays on the band, with lit pills for Help and My Voice.

## 4. Type, space, shape

Unchanged:
- **Type:** Atkinson Hyperlegible Next, scale `--fs-xs` to `--fs-xxl`, body 1.5. Headings stay sentence case and 800 weight.
- **Space:** a 4 px scale, `--s1` to `--s7`.
- **Radius:** chip 999, tile 14, strip 18, sheet 22.

New:
- `--nav-h: 72px` (phone bar)
- `--rail-w: 96px` (tablet rail)
- `--indicator: 4px`

## 5. Motion

| Token | Value | Use |
|---|---|---|
| `--t-press` | 90 ms | Tile press |
| `--t-ui` | 180 ms | Menus, indicator, sheets |
| `--t-glow` | 420 ms | Spoken-word glow |
| `--t-ambient` | 40 s | Slowest scene drift (Play, games) |
| `--t-breath-in` / `--t-breath-out` | 4 s / 6 s | Calm horizon |

Motion only ever confirms something the child did. Nothing moves to get attention. Still mode and `prefers-reduced-motion` turn off everything except the spoken-word glow, which becomes a static outline.

## 6. Game scenes

Every game shares the band, the lit rule and its scene backdrops: `--scene-dawn`, `--scene-day`, `--scene-dusk`, `--scene-night`, `--scene-sea`, `--scene-rails`.

- Mid-value, low saturation (chroma under 0.08 in OKLCH), so OpenMoji characters and word tiles sit clearly on top. Text on `--scene-night` uses the night ink (`#e6ecef`, 11.2:1).
- One warm highlight per scene, which is lit.

See [docs/GAMES-CONCEPT.md](docs/GAMES-CONCEPT.md).

## 7. Icons and imagery

- **Navigation and tool icons:** one stroked set (Tabler, MIT), 24 px, 2 px stroke.
- **Child-facing pictures:** stay OpenMoji or ARASAAC, as now.
- **Scene art:** flat vector shapes with no outlines. Kenney CC0 kits may be used for game props.
- **No emoji in Bridge UI chrome.**
