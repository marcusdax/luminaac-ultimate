# LuminAAC redesign: layout, flow and look (v0.12 proposal)

Status: R1 built (v0.11.1, 1 November 2026) and on by default since v0.13 (2 November 2026); `?redesign=0` returns a device to the older tabs. R2–R5 are proposals.

**Try R1:** open `bridge.html?redesign=1` or `index.html?redesign=1` once on a device. The choice is remembered on that device; `?redesign=0` turns it off again. With it off, nothing looks or works differently. Code: `nav-core.js` (hub map, old-link aliases, Now/Next; tested in `tests/nav.test.mjs`), `bridge-hubs.js`, `myvoice-redesign.js`, `redesign.css`.

**R1 as built, and how it differs from the plan below:** the Log button, role views and Find are R2 and later, so the phone bar has the four hubs only. "I need the toilet" stays on Talk because telling is talking; only the "My world" book moves to Play. "My things" also stays on Talk. Prototype canvas (six screens; role switch and program list are clickable): https://claude.ai/artifact/EJMHnmfKz9azR1JppTWVHH

## Why change anything

LuminAAC grew one feature at a time. Each one was right on its own, but together they left four problems:

1. **The Bridge has 12 tabs at one level.** Today, Signals, Vocabulary, Stories, Videos and games, Potty Path, Sound Path, Insights, Team, Safety, Account and devices, Privacy. A parent with a minute between meltdowns has to scan all 12. On a phone they scroll sideways and most are hidden.
2. **Every team member sees the parent's tool.** A teacher who only wants to log "he used the window hum at recess" lands on Account, Safety and Privacy screens they can't use.
3. **The child's screen has a way out.** "Bridge" sits in My Voice's main nav, so one stray tap takes him off his board. The new games (Sound Path, Potty Path) are folded into boxes inside Talk, so the board gets longer every release.
4. **Progress is in five places.** Signals, Insights, the Sound tab, the Potty tab and Team notes each show a slice. Nobody can answer "how was this week?" from one screen.

What we keep: the tokens. The modified Fitzgerald Key, Atkinson Hyperlegible, the three themes (day, night, contrast), fixed tile positions and the lit sentence strip all hold up. This redesign changes **structure and flow**, not the visual language. That keeps a child's motor habits and colour habits intact, which matters more than anything new.

## Principles (additions to DESIGN-SYSTEM.md)

6. **One job per screen, three choices at most per decision** (Hick's law). Hubs, not tabs.
7. **Show each person their part.** Role sets the home screen and what's hidden, not what's allowed (permissions stay in `access.js`).
8. **Pausable and resumable everywhere.** Anything started can be left mid-way and picked up later, for both the child and the grown-ups (from the AuDHD UI guide, CC BY 4.0).
9. **The child's space has no exits** except Calm and the press-and-hold Caregiver door.
10. **One place to log, one place to see progress.** Logging is a button that's always there; progress is one hub.

## My Voice (the child)

```
┌───────────────────────────────────────────────┐
│ ☀  [ sentence strip ............ ]  ⌫  ✕  Speak │  unchanged
├───────────────────────────────────────────────┤
│ Now: 🥣 breakfast  →  Next: 🚌 bus             │  NEW: Now/Next ribbon (from Plans)
├───────────────────────────────────────────────┤
│ quick phrases · next row · folders             │  unchanged
│ ┌──┬──┬──┬──┬──┬──┐                            │
│ │  │  │  │  │  │  │  word board (fixed places) │  unchanged
│ └──┴──┴──┴──┴──┴──┘                            │
├───────────────────────────────────────────────┤
│  💬 Talk   🌙 Calm   📅 My day   ⭐ Play   🔒   │  nav: 4 doors + hold-to-open
└───────────────────────────────────────────────┘
```

| Change | Why |
|---|---|
| Nav becomes **Talk · Calm · My day · Play · 🔒**. "Bridge" moves inside the Caregiver door. | Removes the accidental exit (problem 3). |
| **Now/Next ribbon** under the strip, fed by the current plan. Tap opens My day. Hidden if no plan is running. | Predictability is the strongest anti-anxiety tool we have; it shouldn't be two taps away. |
| **Play** hub: one big card each for Sound Path, Potty Path (when on), and Videos and games. Cards appear only when the grown-up has turned them on. | Talk stays a talker. The board stops growing. |
| **Calm is one tap from everywhere**, same corner, same icon, including inside games. | A break is always available and always in the same place. |
| **Sensory profile** (Caregiver → Comfort): Still screen (no motion), Quiet (no chimes), Board size (3×3 to 8×8 steps, one step at a time). Replaces scattered toggles. | One honest place for sensory needs. Grid size changes are stepped so motor plans carry over. |
| Potty "soon" card and offer still overlay any screen. | Unchanged behaviour, now documented as the one allowed interruption. |

Not changing: tile positions, colours, the strip, press-and-hold timing, any spoken output.

## The Bridge (the team)

### Four hubs instead of twelve tabs

| Hub | Holds (old tabs) | The question it answers |
|---|---|---|
| **Home** | Today, waiting moments, alerts, next routine, Potty "next sit", today's Sound practice | "What needs me right now?" |
| **Programs** | Vocabulary (board), Stories and routines, Sound Path, Potty Path, Videos and games | "What are we working on, and what's the next step?" |
| **Progress** | Signals, Insights, Sound weekly, Potty rates, words used, printable reports | "How is it going?" |
| **Circle** | Team, home–school notebook, Safety, Account and devices, Privacy | "Who's helping, and how is it set up?" |

Old links keep working: `#potty` opens Programs → Potty Path, `#signals` opens Progress → Signals, and so on. Nothing in storage changes.

### Layout

- **Phone:** bottom bar with the four hubs and a raised round **Log** button in the middle. Hubs open as a stack of cards; a program opens full screen with a back arrow.
- **Tablet and desktop:** left rail with the four hubs, then a list of cards, then the open card on the right (list–detail). Container queries decide, not the window width, so the same card works in either column.
- Every card has the same anatomy: **title, one status line, one main button.** Extra controls go behind "More".
- Hub changes use the native View Transitions API (a short cross-fade). Off under reduced motion.

### The Log button (one place to record anything)

Tap Log → a bottom sheet with up to six big choices, ordered by what this person logs most:

> Moment (catch the last 15 s) · Note · Word or sound heard · Potty · Sound try · Behaviour

Each choice is one screen with sensible defaults and a Save button. Teachers can log without seeing anything else in the app. All of these already exist as forms spread across tabs; Log just gathers them.

### Role views

The role picked in Team (parent, teacher, therapist, family) sets a **view preset**. It changes the home screen and hides hubs that person doesn't use. It doesn't change permissions; `access.js` still decides what each person may see.

| Role | Home shows | Hubs shown | Log choices first |
|---|---|---|---|
| Parent | Needs you · Next routine · Today's practice | All four | Moment, Potty, Note |
| Teacher | **School day:** plan for today, quick-log grid, notebook to home | Home, Programs (read and log), Circle → notebook | Note, Word heard, Behaviour |
| Therapist | **Goals:** targets, week numbers, what to try next | Progress first, Programs, Circle → notebook | Sound try, Word heard |
| Family | Today's highlights, notebook, the board (read only) | Home, Circle → notebook | Note, Moment |

### New pieces

1. **Home–school notebook.** A shared, dated thread per day: "At home" and "At school" columns, one line each, photos allowed. Replaces Team notes. Teachers and parents finally write in the same place. Stored in the same event log, so it syncs like everything else.
2. **Handoff card.** When a device changes hands (drop-off, pick-up), one card says: last ate, last toilet, mood now, anything to watch. Built from data already logged; nothing new to type.
3. **Weekly summary.** One printable page: words used, new sounds, telling-first rate, best moments. Printed with Paged.js so it paginates properly. This becomes the default thing to bring to an IEP or speech session.
4. **Find.** A search box on every hub ("dry check", "voice", "invite") that jumps to the right card. It's the safety net for anyone who can't remember where something lives.
5. **First-run tour.** Four steps on first open of each role view (driver.js, MIT), skippable, never shown again.

## Look

The tokens stay. These are the deltas:

| Area | Now | Proposed |
|---|---|---|
| Bridge icons | Hand-drawn SVG mixed with emoji | One set: **Tabler Icons** (MIT, 6,200 icons, 2px stroke matches ours). Emoji/OpenMoji stay on the child's side only. |
| Bridge density | Same spacing as the child's board | An 8px rhythm with a denser card list; 44px minimum targets (the child keeps 56–104px). |
| Colour roles | Sky, ember, lumen documented but used loosely | Enforced: **ember only for "needs you"**, sky only for "the app learned this", lumen only for the child's voice. A card with nothing pending has no colour at all. |
| Status | Free text | A small dot plus words: *Needs you*, *On track*, *Paused*, *Off*. Never colour alone. |
| Empty states | "Nothing here yet" | One sentence of what it's for, plus the one button that fills it. |
| Motion | Motion One in three places | Same three, plus View Transitions for hub changes. Nothing moves while idle. |
| Print | Each tab prints differently | One print stylesheet (Paged.js) with header, child's first name, date range and page numbers. |

## GitHub research (1 November 2026)

Searched with `gh` across AAC, autism, special education, visual schedules, switch access, speech therapy, design systems, motion, offline sync, icons and print. Stars and dates are from that day.

**What we found:** there are very few maintained open-source tools for visual schedules, IEP tracking, token boards or choice boards. Every hit was 0–3 stars and mostly student projects, so there's nothing worth adopting there. The strong options are general-purpose web libraries, plus a few AAC projects to learn from.

### Adopt

| Repo | Stars | Licence | Last push | Use in LuminAAC |
|---|---|---|---|---|
| [tabler/tabler-icons](https://github.com/tabler/tabler-icons) | 22.5k | MIT | 2026-10-29 | One icon family for the Bridge. Vendor only the ~60 icons we use as one SVG sprite. |
| [SortableJS/Sortable](https://github.com/SortableJS/Sortable) | 31.2k | MIT | 2026-03-24 | Drag to arrange routines, Sound targets and Log choices. Touch-friendly, no framework. Board tiles stay locked unless a grown-up edits them. |
| [pagedjs/pagedjs](https://github.com/pagedjs/pagedjs) | 1.6k | MIT | 2026-10-23 | Paginated weekly summary, IEP and SLP reports. |
| [nilbuild/driver.js](https://github.com/nilbuild/driver.js) | 27.0k | MIT | 2026-10-29 | Skippable first-run tour per role. No dependencies. |
| [vkurko/calendar](https://github.com/vkurko/calendar) | 2.3k | MIT | 2026-10-25 | Week view for routines, therapy sessions and school days in Circle. |
| [floating-ui/floating-ui](https://github.com/floating-ui/floating-ui) | 32.8k | MIT | 2026-10-27 | "More" menus and help popovers that stay on screen on small phones. Use native `popover` first; this is the fallback. |
| [oddbird/css-anchor-positioning](https://github.com/oddbird/css-anchor-positioning) | 494 | BSD-3 | 2026-11-01 | Polyfill if we go fully native with anchor positioning instead of Floating UI. Pick one of the two, not both. |

### Borrow ideas or values (no code shipped)

| Repo | Licence | What we take |
|---|---|---|
| [Greyland-Fireworks/audhd-ui-guide](https://github.com/Greyland-Fireworks/audhd-ui-guide) | CC BY 4.0 | Pause/resume rules, predictable layouts, low-demand wording. Source of principle 8. |
| [argyleink/open-props](https://github.com/argyleink/open-props) (5.6k, MIT) | MIT | Easing curves and a size scale to check our tokens against. Copy the values we want, don't add the library. |
| [radix-ui/colors](https://github.com/radix-ui/colors) (1.7k, MIT) | MIT | Its 12-step neutral scale, to check the Bridge's denser surfaces against. |
| [adobe/react-spectrum](https://github.com/adobe/react-spectrum) (16k, Apache-2.0) | Apache-2.0 | Adaptive list–detail and bottom-sheet behaviour. React, so the patterns only. |
| [emilkowalski/vaul](https://github.com/emilkowalski/vaul), [dip/cmdk](https://github.com/dip/cmdk) | MIT | Bottom-sheet drag feel for Log; command-menu behaviour for Find. React, so the patterns only. |
| [OptiKey/OptiKey](https://github.com/OptiKey/OptiKey) (4.4k) | GPL-3.0 ⚠️ | Dwell timing and gaze-target sizing for a future eye-gaze mode. Ideas only. |
| [asterics/Asterics-AAC](https://github.com/asterics/Asterics-AAC), [cboard-org/cboard](https://github.com/cboard-org/cboard) | AGPL / GPL ⚠️ | Switch scanning order and board editing flow. Ideas only. |
| [leifcr/switch_access](https://github.com/leifcr/switch_access) | other | How to add switch scanning to an existing web page. Small and old, but the right shape. |
| [vadimerenkov/Aucards](https://github.com/vadimerenkov/Aucards) | GPL-3.0 ⚠️ | Quick cards for adults who are sometimes non-speaking. A possible "older user" mode. |

### Looked at and passed over

- **Shepherd**: the licence is no longer plain MIT. driver.js does the same job under MIT.
- **Lottie and Rive players**: they invite idle animation, which goes against "calm by default".
- **htmx, Alpine, Lit, Stimulus**: a framework isn't needed for this. Plain modules and native elements cover it.
- **Shoelace**: archived and moved to Web Awesome, which is heavier than we need.
- **Lexend**: the repo is archived. Atkinson Hyperlegible Next stays.
- **Visual schedule, token board, IEP and choice board repos**: all 0–3 stars, unmaintained or student work.

## Build plan

Each step ships on its own and leaves the app working. No storage changes in any of them.

| Step | Scope | Done when |
|---|---|---|
| **R1 Shell** | Four Bridge hubs with old-hash aliases; phone bottom bar and desktop rail; My Voice nav becomes Talk/Calm/My day/Play, with Bridge behind the door; Play hub; Now/Next ribbon | Every old tab is reachable in two taps or fewer; existing tests pass; no console errors on either page |
| **R2 Log and Home** | Log sheet; role view presets; Home cards per role; handoff card | A teacher can log a note in 3 taps without seeing Safety or Account |
| **R3 Progress** | Signals, Insights, Sound and Potty in one hub; weekly summary with Paged.js | One printable page answers "how was this week?" |
| **R4 Circle** | Home–school notebook (replaces Team notes, old notes migrated in place); calendar week view | A parent and teacher can each add to today's page |
| **R5 Polish** | Tabler sprite; card anatomy everywhere; Find; first-run tours; Sortable on routines and targets | Design-system audit has no hard-coded colours or one-off spacing left in the Bridge |

**Risks**
- *Change for the child.* My Voice only gains the ribbon and the Play door; the board does not move. Ship R1 behind `luminaac:redesign-dev` first and try it with him before turning it on.
- *Grown-ups' muscle memory.* Old hash links keep working, and Find catches the rest.
- *Scope.* R1 and R2 deliver most of the value. R3–R5 can wait.
