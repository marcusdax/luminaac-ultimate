# Motion concept: "the sky breathes, the board stays still"

Status: built in v0.18 (3 November 2026), increments M1 to M5. **How the build differs:** the Calm sky sits inside the breathing panel rather than full screen, so the panel's text keeps its contrast. Sound Garden blooms on a long sound or enough sounds, not on the Sound Path target sound (that needs speech recognition). Movement has three settings, not a slider: Gentle (level 3), Small (level 1) and Still (level 0); level 2 comes from low-end tablets. The website is `about.html` in this repo. three.js is cached on first use rather than at install. The questions in §7 are still open. It extends [DESIGN.md](../DESIGN.md) §2, §5 and §6 and [GAMES-CONCEPT.md](GAMES-CONCEPT.md), and it doesn't change their rules: talk tiles, emoji pictures, word colours and the sentence strip keep their current look, and nothing moves behind the board.

**The idea.** In LuminAAC, motion means one thing: *something you did worked.* A tile press, a word landing in the strip, a game piece moving. Everything else is weather: slow, far away, and only where the child has gone to play or calm down. The ten sources below are mined for technique, not for their look. Award-site motion is built to grab attention, and this app's whole design is the opposite, so most of what we take is the engineering (springs, shared-element transitions, cheap shaders, scroll timelines) and almost none of the spectacle.

## 1. Where motion may live

| Zone | Who sees it | Motion budget | Examples |
|---|---|---|---|
| **0. Talk boards, plans, keyboard** | Child | Confirmations only, under 420 ms, no ambient motion | Tile press, word flies to the strip, spoken-word glow |
| **1. Bands and menus** | Child and grown-up | UI transitions, 180 ms | Lantern-rail pill, sheets, folder-to-board transition |
| **2. Calm** | Child | One slow rhythm (breath 4 s / 6 s) | Shader horizon that breathes |
| **3. Play and games** | Child | Ambient drift no faster than 40 s a cycle, plus game feedback | Shader skies, water, the 3D train |
| **4. Bridge** | Grown-ups | UI transitions and small data motion | Number tickers, "devices linked" beam, chart draw-in |
| **5. Website, guide, store pages** | Parents, clinicians, schools | Full showcase motion | Scroll-driven story, 3D hero |

Every zone obeys one gate (§4). Still mode, `prefers-reduced-motion`, the grown-up's Motion slider and low battery all lower the budget. The spoken-word glow is the only motion that survives everything, and even it becomes a static outline.

## 2. What we take from each source

| Source | Take | Leave | Where it goes | Licence note |
|---|---|---|---|---|
| **scrolltide.co** (scroll-driven, 3D sites) | CSS `animation-timeline: scroll()` / `view()` storytelling, pinned sections | Scroll-jacking, anything that fights the swipe | Zone 5: the website and `guide.html` ("a day with LuminAAC" scrolls from morning board to bedtime calm) | Check each prompt's licence before copying code |
| **scrollshaders.com** (shader backgrounds) | Slow gradient-noise and aurora shaders, the "video or still" fallback idea | Fast, high-contrast or flickering shaders | Zones 2 and 3: Calm horizon, game skies. A pre-rendered still is the fallback | Write our own shaders, or use clearly licensed ones |
| **godly.website** (craft gallery) | Inspiration only: restraint, type, how good sites pace a reveal | Copying any one site | Zone 5 reference board | Inspiration only, copy nothing |
| **60fps.design** (UI motion done right) | Interruptible springs, shared-element transitions, press feedback timing, exit faster than enter | — | Zones 0, 1 and 4: this is the most useful source for the app itself | Patterns, not code |
| **21st.dev** (community components) | Component ideas: animated tabs, number ticker, progress ring | React and Tailwind code as-is | Zone 4, re-written in vanilla CSS and Motion | Licence varies by component; check each |
| **ui.aceternity.com** (high-impact components) | "Animated beam" for linked devices, a gentle spotlight card for the website | Background beams, meteors, sparkles, 3D card tilt in the app | Zone 4 (beam), Zone 5 (hero) | Check the free-component terms; re-write, don't paste |
| **magicui.design** (landing components) | Number ticker, animated list, border beam on the one primary website CTA | Particles, confetti, marquees | Zones 4 and 5 | MIT, credit in `THIRD-PARTY.md` if code is used |
| **threejs.org** (3D engine) | One low-poly 3D game (the train, §5), lazy-loaded | 3D anywhere outside that game | Zone 3 only | MIT; vendor a pinned build so it works offline |
| **shadertoy.com** (shader experiments) | Techniques: value noise, fbm clouds, caustics, ripple equations | Copying shaders: most are CC BY-NC-SA unless stated, which doesn't fit an app that may be sold | Zones 2 and 3, written from scratch | Learn, don't copy |
| **lovable.dev** (idea to app) | Fast throwaway prototypes of the website for parents to react to | Building the app with it: LuminAAC is a no-build vanilla PWA and must stay offline-first | Zone 5 prototypes only | Not part of the codebase |

The pattern: React/Tailwind libraries give *ideas*, which get re-written as small vanilla modules using the Motion library already vendored (`vendor/motion.js`, MIT) and the Web Animations API. Nothing new ships to the child's iPad unless it earns its weight.

## 3. Concepts by zone

### Zone 0: the board (confirmation only)
- **Word lands.** When a tile is pressed, a ghost of its picture and word travels from the tile to its place in the sentence strip (FLIP, 180 ms, `--ease`). The child sees *where their word went*, which supports sentence building. Reduced motion: no flight, the word simply appears with the glow.
- **Speak sweep.** On Speak, the lit glow moves word by word in time with the voice (already partly there), so reading follows sound. No bounce, no scale.
- **Folder opens.** A folder tile expands into its board with a View Transition (`document.startViewTransition`, 180 ms) and shrinks back on Back. That gives spatial memory: "food lives *inside* that tile".

### Zone 1: bands and menus
- **Lantern-rail pill** slides on a critically damped spring (no overshoot), so it can be interrupted mid-tap without jerking.
- **Sheets** rise in 180 ms and leave in 120 ms (exit faster than enter).
- **The band "breathes in"** once when the app opens: the dark bands fade to full in 420 ms, then never move again.

### Zone 2: Calm
- **Shader horizon.** One full-screen WebGL fragment shader: two close sky colours, a soft horizon line that rises over 4 s and settles over 6 s, in step with the breathing guide. The shader runs at 30 fps at most, at half resolution, and stops when the tab is hidden.
- **Fallback.** No WebGL or low battery: the existing CSS breathing horizon. Still mode: a single still frame.
- **Choice of sky.** The grown-up picks dawn, sea or night. The child never sees a "loading".

### Zone 3: Play and games
- **Living skies.** Each `--scene-*` gets a shader variant: dawn clouds drifting over 60 s, a sea with slow caustics, night with three dim stars that never twinkle faster than 8 s. Mid-value, low chroma, exactly as DESIGN.md §6.
- **Game feedback** uses Motion springs: a piece that drops settles, a correct match gently glows, a "not quite" piece slides home without a shake or a red flash.

### Zone 4: Bridge
- **Number tickers** for words this week, magic moments, potty streaks (Magic UI idea, vanilla).
- **Linked-devices beam:** a soft line pulses once from the child's tablet icon to the caregiver phone when a sync lands (Aceternity "animated beam" idea). It shows the link is alive without a spinner.
- **Charts draw in** once on first view, never on every refresh.
- **Safety stays still.** No motion on alerts except a single lit outline. Urgent things must never look playful.

### Zone 5: website and guide
- A scroll-driven "day with LuminAAC" story (scrolltide-style, CSS scroll timelines with a static fallback): morning board, a word landing, a tablet linking to a phone, an evening calm sky.
- A quiet 3D hero, made with three.js: the logo's lit wave as a ribbon over a dusk band. It loads only on the website, never in the PWA.

## 4. Engineering rules

1. **One gate.** A new `motion-gate.js` exports `motionLevel()`: `0` still, `1` confirmations only, `2` UI, `3` ambient. It reads Still mode, `prefers-reduced-motion`, the grown-up's Motion slider, `navigator.getBattery()` (if under 20 % and not charging, drop to 1) and a device tier (`navigator.hardwareConcurrency`, `deviceMemory`). Every animated module asks the gate first, and listens for changes.
2. **One shader runner.** A new `shader-sky.js` (target under 4 KB) runs a single fragment shader on one canvas: 30 fps cap, device-pixel-ratio cap of 1, pause when hidden (`visibilitychange`, IntersectionObserver), and a CSS-gradient poster underneath so nothing flashes if WebGL fails or the context is lost.
3. **Owned shaders.** All shaders live in `shaders/` as small strings we wrote, with the source technique credited in a comment.
4. **3D is opt-in by game.** three.js is vendored (pinned version, MIT) and loaded only by the 3D game's module, with a 2D SVG fallback for older iPads.
5. **Compositor-only properties.** Animate `transform` and `opacity` only. No layout-triggering properties, no `filter: blur()` on moving elements.
6. **Budgets.** Board interactions under 100 ms to first feedback. Calm and game skies under 4 ms of GPU time per frame on a 2019 iPad. Bundle growth for the child app under 15 KB gzipped, three.js excluded (lazy and game-only).
7. **No attention motion.** Nothing loops on a screen with words. Nothing animates to say "look at me", including badges, CTAs in the app and empty states.
8. **Tests.** `motion-gate` gets unit tests for every combination of inputs. Each animated module gets a test that it does nothing at level 0.

## 5. New game concepts

Each one follows GAMES-CONCEPT.md: words first, no failure states, the grown-up holds the sensory dial, and every game works without motion.

### Lantern Sky (language, Zone 3, shader + Motion)
- **Play:** each word the child taps rises as a paper lantern into a slow dusk sky (shader). When they press Speak, the lanterns line up into a short sentence constellation and the voice reads it.
- **Why:** sentence building with a visible, calm reward. Each word is an object they made.
- **Still mode:** lanterns appear in place in a row, no rising.

### Tide Pool (Calm and cause-and-effect, Zone 2/3, shader)
- **Play:** a shallow pool with slow caustic light. A touch makes a single soft ripple; when the ripple reaches a shell, the shell opens and says its word ("crab", "blue", "more").
- **Why:** regulation through slow, predictable cause and effect, plus requesting ("more").
- **Sensory:** ripple speed and count follow the Motion slider; at level 1 the shell simply opens.

### Word Train 3D (sentence building, Zone 3, three.js)
- **Play:** a low-poly train on the `--scene-rails` set. Each word tile becomes a carriage that couples with a soft click; Speak sends the train along a short loop while the voice reads the carriages in order. The camera never moves on its own.
- **Why:** trains are a common deep interest, and word order is physical: you can see *I · want · juice* coupled in a line and swap two carriages.
- **Fallback:** a 2D side-view train in SVG with the same carriages.

### Sound Garden (Sound Path, Zone 3, Motion + Web Audio)
- **Play:** any voice the microphone hears (loudness only, nothing recorded) makes a seed grow a little; the target sound from Sound Path makes it bloom. Growth eases in over 600 ms so it never jumps.
- **Why:** pairs vocal play with a gentle visual response; fits Sound Path increment A's "any sound counts" stage.
- **Privacy:** loudness is measured on the device and thrown away.

### Aurora Feelings (emotion labelling, Zone 2, shader)
- **Play:** the child picks a feeling word; the sky shifts slowly to its colour and pace (calm = slow blue, excited = faster warm, but never above the Calm budget). The grown-up sees the choice in the Bridge, as the existing feelings flow does.
- **Why:** links a body feeling to a visual rhythm and a word, which supports co-regulation.

## 6. Increments

| Increment | Contents | Ships to the child app |
|---|---|---|
| **M1: the gate and the board** | `motion-gate.js` with tests, the Motion slider in Sensory settings, word-lands FLIP, folder View Transition, spring lantern-rail pill, sheet timings | ~3 KB |
| **M2: shader skies** | `shader-sky.js`, the Calm horizon shader, three scene skies for Play, posters and fallbacks | ~4 KB + shaders |
| **M3: games** | Lantern Sky, Tide Pool, Sound Garden, Aurora Feelings | per game, lazy |
| **M4: 3D** | Vendored three.js and Word Train 3D with its SVG fallback | lazy, game-only |
| **M5: Bridge and website** | Tickers, linked-devices beam, chart draw-in; the scroll-story website and 3D hero | Bridge only / website only |

## 7. Questions for review

- **With the SLP or OT:** is the "word lands" flight helpful or distracting for a child who is still learning where the strip is? Should it be on by default, or off until the grown-up turns it on?
- **Device floor:** which is the oldest iPad families actually use? It sets the shader and three.js budgets.
- **Website:** is there a separate marketing site, or should the scroll story live in `guide.html` for now?
