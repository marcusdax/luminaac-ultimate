# Potty Path: Expert Blueprint (v2)

### A toilet-learning and communication module for LuminAAC

> **Status:** built in v0.10 (all three increments, behind `access.potty`, off by default). Next step: the pilot in §12.2. The concept text below is unchanged. This expands the founder's v1 blueprint with reviews from five specialist panels: clinical (speech and language, autism, CBT and de-escalation), game design, software architecture, visual and interface design, and business and go-to-market. Where the panels disagreed, section 13 records the decision taken.
>
> **This is not medical advice.** All thresholds below are defaults that a clinician can change. Have an SLP, a BCBA and a paediatric GI or continence nurse review this, along with a paid advisory panel of autistic adults that includes non-speaking AAC users, before anything ships.

---

## 0. What changed from v1 (summary)

| v1 said | v2 says | Why |
|---|---|---|
| Prompt hierarchy: physical → model → gesture → verbal | Environmental/visual → model → gesture/point → hand-*under*-hand (only for motor steps, only with assent). **Never prompt the AAC tap physically.** | Moving a child's hand on their own voice device teaches them that their voice belongs to someone else. Teach the tap with aided language modelling and an expectant pause. |
| Show the full 12-step path | Show the full path as small dots, but only **Now + Next** as tiles. Use backward chaining. | Twelve choices at once is too much load. Backward chaining ends each run on success. |
| Scheduled sits at intervals | Sit times come from the **baseline**: about 10 min before typical void times, after waking, and 15–30 min after meals | Fixed 15–30 min intervals (Azrin-style) are tiring and unnecessary. |
| Token board 1:1 | Start with an **immediate tangible reward**. Add tokens only if they demonstrably work. | Tokens are abstract for many profoundly autistic children. |
| Paid subscription for parents | **Free for families forever.** Clinics and schools pay for coordination tools. | Matches the LuminAAC pillar "Free to families. Core access is a right." |
| "Accident" | **"Wet" / "missed"** in the interface | Neutral language. |
| (silent on these) | **No fluid loading, no overcorrection or "positive practice", no restraint, no camera in the bathroom** | These appear in the historic protocols (Azrin & Foxx, LeBlanc 2005) but are unsafe or punitive. |
| Two devices assumed | Ship in three steps: **one device**, then an **offline QR handoff**, then optional **backend sync** | Bathrooms have bad Wi-Fi. Without a server, two browsers cannot talk to each other. |

---

## 1. Clinical ground truth (kept from v1, sharpened)

- Learning to use the toilet is a **process that can take months or years**, not a weekend. For some people, **supported toileting or continence products are a legitimate lifelong outcome.** The app must never imply that continence is required for dignity or love.
- **Interoception is often atypical.** The goal is body awareness plus a way to communicate need.
- **The biggest risk is the bathroom becoming aversive.** The app is calm first.
- **The caregiver operates the app and the child takes part.**
- **Medical conditions come first.** Constipation is markedly more common in autistic children; treat it before training.
- **Communication is the win.** Every signal is honoured, including "false" ones. A request to leave a room is still valid communication.
- **The child can always refuse.** The iPad is the child's voice. It is never the reward, never taken away as a consequence, and never locked behind a sit.

**Product thesis:** *The game is not the therapy. It is predictable, sensory-safe scaffolding around an evidence-informed routine, and it teaches the child a way to say "I need to go".*

---

## 2. Evidence base (stated honestly)

| Source | What we take | What we leave out | Strength |
|---|---|---|---|
| Azrin & Foxx (1971), *JABA* 4:89–99; *Toilet Training in Less Than a Day* (1974) | Scheduled sits; dense reinforcement | Overcorrection, reprimands, fluid loading, staff-intensive model | Historically foundational; aversive parts widely criticised |
| Cicero & Pfadt (2002), *Res. Dev. Disabilities* 23:319–331 | Reinforcement-based scheduled sits | — | Small-n single case, positive |
| LeBlanc et al. (2005), *Focus on Autism & Other DD* 20(2) | Dry checks, dense reinforcement | Fluid loading, positive practice | Small-n single case |
| Cocchiola et al. (2012), *Behavior Analysis in Practice* | School package: underwear, sits, reinforcement | — | Single case *(verify details)* |
| Kroeger & Sorensen-Burnworth (2009), *RASD*, review | Overall view: consistently positive small-n studies, few RCTs | — | Review |
| Keen, Brannigan & Cuskelly (2007), video modelling | Animated or doll models within a package | **Never film the child** | Mixed but promising |
| Mahler, *The Interoception Curriculum* (2019) | Body-noticing games in calm moments | — | Emerging *(verify pilot citations)* |
| Sennott, Light & McNaughton (2016), meta-analysis | Aided language modelling | — | Moderate |
| Prizant (1983), echolalia | Treat echolalia and gestalts as communication | Do not market the feature as "GLP-based" | — |
| NICE CG99; ESPGHAN/NASPGHAN (Tabbers 2014); Rome IV; Bristol Stool Scale | Medical-first bowel management, red flags | — | Clinical guidelines |
| Low Arousal Approach (McDonnell); Collaborative & Proactive Solutions (Greene) | De-escalation and co-regulation | — | Practice-based, modest evidence |

---

## 3. The phased protocol the app encodes

| Phase | What happens | Moves on when |
|---|---|---|
| **0. Readiness and medical** | Screening covers stool frequency and Bristol type, withholding signs, pain, urine pattern and constipating medicines. It also runs the sensory onboarding (§5). Readiness is judged on **function, not age**: dry for 60–90 min, can sit with support for about 1 min, medically cleared, no major upheaval, and the caregiver has capacity. | No red flags (§4) |
| **1. Baseline (3–7 days)** | Log wet/dry, poos (with Bristol type) and natural cues (goes still, hides, holds crotch). Choose **Light** mode (checks at natural transitions) or **Full** mode (every 30 min). Gaps are fine; the app shows how confident its estimate is. No demands on the child. The adult models the TOILET symbol at every change. | Enough data for sit windows |
| **2. Bathroom as a safe place (1–3+ weeks)** | Visits with no sitting required, a bathroom-only box of favourite things, then sitting clothed, then sitting in a nappy. | 3 days in a row of entering calmly |
| **3. Scheduled sits** | Sit times come from the baseline. Sits last 2–3 min, with a **hard cap of 5 min**. Light reward for sitting, big reward for voiding. Underwear during training hours; a sensory option is a pull-up with thin underwear inside. | Caregiver judgement, with the app's suggestion |
| **4. Communication shaping** *(runs alongside from phase 1)* | See below. | Never "finishes" |
| **5. Interoception** *(calm moments only, never during urgency)* | Body-noticing games: drink → full → empty. A "What does your body say?" board with *need to go / don't need / not sure*. Track whether the child **anticipates** (signals before voiding). | — |
| **6. Bowel track** *(separate, often months behind)* | Constipation treated medically first. Sits of 5–10 min after meals (**cap 10 min**), feet flat and knees above hips. A child who will only poo in a nappy moves through graded steps, each only while calm: nappy in the bathroom → nappy on the toilet → nappy with a cut-out → none. Target Bristol 3–4. Withholding pauses all urine pressure. | — |
| **7. Generalisation** | Photo preview cards of new bathrooms (no people in the photos), portable seat reducer and step, headphones, a sticky note over auto-flush sensors, a one-page school and respite handoff sheet, the same symbol in every setting, and at least 3 adults who respond to signals. | — |
| **8. Fading** | Fade the token board first. Then fade scheduled sits toward signal-only, starting with the most reliable windows. Logging drops to "exceptions only". **Never fade the communication supports**: the TOILET symbol and button stay forever. | Graduation (§6.6) |

### Communication shaping in detail

**Accept all of these as "I need the toilet":**
- AAC tap
- sign
- symbol card
- object of reference
- leading the adult to the door
- standing at the door
- holding the crotch
- any echolalic script, including the child saying "Do you need to go potty?" or a line from a favourite show

**Response within 3 s:** "You told me. Toilet." Then go straight away.
- **Never require a "better" form before going.**
- To expand the signal, model one step up ("need toilet") rather than demanding it.
- Before a scheduled sit, wait 3–5 s at the door with the symbol visible before modelling the tap (time delay).
- Caregivers can tag a new signal. It feeds LuminAAC's existing signal learning as intent `need`.

---

## 4. Hard safety rules the software enforces

All of these are **clinician-adjustable defaults**.

**Pause the protocol and show "talk to your child's doctor"** (with a printable summary):
- No poo in 3 days, or fewer than 3 a week.
- Bristol 1–2 on two or more occasions in a week.
- Pain or straining.
- Withholding posture: up on toes, crossed legs, hiding.
- Overflow soiling.
- Blood in stool or urine.
- Signs of urinary infection: pain, fever, foul or cloudy urine, sudden frequency, new wetting after a dry period.
- Sudden regression after 2 or more stable weeks. Prompt a medical check; do not interpret it.
- Continuous dribbling with no dry intervals.

**Urgent, same day:**
- No urine for 8 or more waking hours.
- Excessive thirst and urination, or weight loss.
- Vomiting with a swollen belly.
- Fever with back or flank pain.

**Session limits:**
- Sit cap: 5 min for urine, 10 min for bowel. The timer ends the sit.
- At most 8–10 scheduled sits a day, at least 20 min apart.

**Never:**
- restraint;
- holding the child on the seat;
- blocking the door.

The door can stay open. Standing up ends the sit with no penalty.

**Refusal:**
- Respect it, log it, and offer once more later.
- **2 refusals or 1 distress event means no more scheduled sits today.**
- 3 distress days in 7 means the app proposes stepping back a phase.

**Distress precursors** (caregiver-configurable, for example covering ears, increasing rocking, rising pitch, bolting):
- The app switches to **Co-regulate** mode: the timer stops, demands drop and the coaching script changes.
- **Escalation ends the session.** There is never a "finish the routine first".

**Never in the app:**
- fluid loading;
- restricting food, drink or meals;
- overcorrection or "positive practice";
- making the child clean up as a consequence;
- any camera or microphone use while Potty Path is open (LuminAAC's moment capture, emotion estimate and face check are switched off).

---

## 5. Sensory accommodations (onboarding grid)

The Bridge shows a **"What bothers your child?" picture grid**, with Yes / No / Not sure for each item. Each *Yes* adds its fix to a setup checklist and adjusts the routine. For example, a *Yes* to flush noise makes Flush a step the adult does after the child leaves. The grid is re-asked every 4 weeks, and after any distress in the bathroom.

| Trigger | Fix |
|---|---|
| Flush noise | Flush after the child leaves; sticky note over the sensor; Flush is optional |
| Hand dryer | Paper or own towel |
| Cold seat / seat too big | Padded seat / seat reducer |
| Feet dangling | Step stool, feet flat (this also matters for bowels) |
| Fluorescent hum or flicker | Lamp, dimmer, daylight |
| Echo | Towels, bath mat, headphones |
| Smells | Unscented soap and products |
| Splash-back | Paper in the bowl |
| Water temperature | Pre-set the tap |
| Clothing | Elastic waist |
| Feeling of open space below, wipe texture | Seat reducer; try different wipes |
| Who is present, door open or closed | Child's preference |

---

## 6. The child experience (game layer)

### 6.1 Loops

- **Step loop (5–60 s):** the companion points at the step → the child does it, or the caregiver ticks it → the card slides into the "done" lane with **the same soft feedback every time** → the next card lights up.
- **Session loop:** Door greeting (Approach) → Pants down → Sit (Sit mode and timer) → **Body check** → Void or no void → Wipe → Stand → Pants up → Flush (optional) → Wash → Dry → **Done**. Every session reaches Done, however it went.
- **Day loop:** schedule nudges go **to the Bridge only**. The child's tablet never nags. Any "I need to go" signal starts a session.
- **Meta loop (weeks):** the World only grows (§6.4), the caregiver thins the ratio, and the app fades out gracefully.

| Target aesthetic (MDA) | Mechanic |
|---|---|
| Predictability | Fixed order, fixed positions, identical cue per step, same timer art within a session |
| Mastery | Done lane fills left to right; the caregiver can mark a step "did it myself" (star outline) |
| Companionship | Companion sits too and breathes slowly: 4 s in, 6 s out |
| Sensory comfort | Sit mode: low saturation, no music, at most one visual change every 2 s, silence allowed |

### 6.2 The companion

- **Rules:**
  - calm and slow;
  - never sad, disappointed, surprised, alarmed or impatient;
  - eyes are dots with no eyebrows, so it physically cannot frown;
  - it never asks the child for anything: it only shows.
- **Six expressions:** content, curious, waiting, proud-soft, sleepy, wave.
- **Modelling:** acts out the current step once (in under 3 s), then waits. In Sit mode it sits on its own little potty and breathes.
- **Reactions:**

| Event | Companion | Screen |
|---|---|---|
| "I need to go" | **Biggest reaction**: stands, waves toward the door, warm glow. "You told me! Let's go." | Session starts |
| Void | Slow nod, soft glow, same every time | One celebration cue |
| No void | Content nod, "All done trying." | Continues exactly as after a void. Trying is a complete session. |
| Wet / missed | Curious → content, "Let's get clean." | Optional clean-up path. Nothing is lost. |
| Refuse / leave | Waves "See you later" | Path closes. Still counts as a visit. |

- **Skins** (caregiver-chosen and free; **never unlocked or earned**): train, dinosaur, abstract blob (can be eyeless), cat, fan, number, elevator, plain shapes. A skin changes only the art. Timing and behaviour stay the same.
- **Off mode:** a first-class setting, and the default for children who find faces aversive. The step cards do their own modelling and the layout reflows with no gap.

### 6.3 Sit timers

There are no numbers and no ticking. Motion is linear and redraws at 1 fps. The default is 2 min, adjustable from 30 s up to the hard cap.

1. **Filling circle (default):** a ring fills clockwise; at the end a solid tick fades in.
2. **Water jar:** fills from the bottom with a flat surface. This is the slowest change per second, so it suits children who stare at motion.
3. **Dot path:** 5 big dots fill one at a time. This suits children who track discrete changes.
4. **Companion walk:** the companion (or a dot) walks to a little house.

**At the end of the timer:**
- A **Body check** (8 s): the screen dims, the companion puts a hand on its tummy, and an optional voice asks "Anything coming?"
- Then two cards appear: **All done** (open hand) and **More time**.
- **Nothing advances on its own.** The caregiver or the child chooses. The only exception is the hard cap, which always ends the sit.

**If the child voids mid-timer:** the caregiver taps Pee or Poo and the celebration plays immediately, so the reward is never late.

**Reduced motion / "Keep the screen still":** the timer shows still steps (at most one change every 30 s) and the companion is static.

### 6.4 A reward system that cannot punish

**Order of rewards:**
1. **Immediate tangible reward from the human** (kept in a bathroom-only box), delivered within 1–3 s. Praise starts *during* the void.
2. Tokens, only if they work for this child.
3. The World.

**Celebration on screen is minimal by default.** There is no confetti and no sound mid-void.

| Event | Tokens | World growth |
|---|---|---|
| Child-started "I need to go" (any modality) | **2** | Big piece (a new carriage) |
| Void in toilet | 1 | Medium piece |
| Completed sit, no void | 1 at the 1:1 phase, 0 later | Small piece |
| Visit, partial session or refusal | 0 | Tiny piece (one pebble) |
| Wet / missed | 0 (**nothing lost**) | Tiny piece if the clean-up path is done |

- **Tokens only go up.** They never expire and are never removed (no response cost).
- When the board is full, the screen shows *the caregiver's photo* of the real reward, and the Bridge buzzes: "Board full: give bubbles now." The tablet never plays a video or game as the reward.
- **The World that only grows:** a train line, garden, city or aquarium, shown **only on the Done screen** for 3–5 s. The next empty spot is shown as a faint outline, with no randomness, so the child can know what comes next. It never shrinks, wilts or resets. Full worlds go into a book the child can browse anywhere. The World can be switched off.
- **Thinning the ratio:** 1:1 → 2:1 → 3:1 → 5:1, controlled by the caregiver. The Bridge suggests the next step only after 5 successful days in a row and **never thins on its own**. "Easier board" is one neutral tap.

### 6.5 Predictability with safe variation

- **Always identical:**
  - step order;
  - card positions;
  - cues;
  - companion behaviour;
  - the Done screen;
  - where Stop and Help are;
  - the World appearing only at Done.
- **The caregiver may vary:**
  - timer length and skin, between sessions;
  - companion skin;
  - step photos;
  - whether Flush is included;
  - reward photos;
  - voice wording.
- **Introducing change:** change **at most one thing per week**. Announce a change at the door with a ✦ "new" mark, and practise changes first in a non-bathroom routine. A "Different bathroom" path keeps the same cards with a new location photo. The Bridge gently reminds the caregiver once a month to rotate one element if nothing has changed.

### 6.6 Fading out and graduation

The app fades out in this order:
1. Tokens only for "I need to go".
2. Token board hidden.
3. Timer only.
4. A printed strip on the wall.
5. **Graduation:** the World book gets a final page and Potty Path moves to "Retired". It can be restored in one tap with nothing lost. The TOILET button stays on My Voice permanently.

### 6.7 Accessibility of play

- **Switch scanning:** only **3 stops**: Now, Next, "I need help". Scanning slows down in Sit mode.
- **Dwell / eye gaze:** targets of at least 160 px. Stop needs twice the dwell time so it isn't hit by accident.
- **No reading required.** Text is off by default for the child. Audio, visual and haptic channels each carry the same information, so any one can be switched off.
- **Sound-sensitive profile:** no cues, voice at 50%. A picture of a silent flush replaces any flush sound.
- **"Stop / All done / Help / Break" are always live, including in Sit mode.**

---

## 7. The caregiver experience (The Bridge, "Potty" tab)

1. **Onboarding:**
   - consent;
   - medical screening (§4);
   - baseline mode;
   - sensory grid (§5);
   - reward inventory with photos (**photos of objects only, never of the child**);
   - the child's known signals.
2. **Protocol settings:**
   - sit windows (from the baseline);
   - sit length;
   - which steps are included;
   - token ratio;
   - "token for sitting" on or off;
   - poo pause threshold.
3. **Live console:** a one-handed layout with the buttons in the bottom 45% of the screen (the thumb zone). There are no confirmation dialogs; a 5-second **Undo** replaces them.

```
+---------------------------+
| Sam · Sitting · 1:40 left |   status (read-only)
| Today: 3 tries · 2 dry    |
| [timeline strip........] |
|                           |
| [ Pee      ] [ Poo      ] |
| [ Asked ★  ] [ Dry check] |   ★ = child signalled (pick how)
| [ Wet/missed][ Not now  ] |
| [ Break    ] [ Step ✓   ] |
| [Undo · 5s]   [All done >]|
+---------------------------+
```

4. **Coaching cards in the moment.** Low language, calm and slow. Model on the AAC while you speak.

| Moment | Script |
|---|---|
| Going in | "Toilet time." *(tap TOILET)* pause. "Bring [toy]." Walk alongside, don't pull. No → "Okay. Later." |
| During the sit | Quiet. Sit side by side. "Sitting." Offer the bathroom toy. At the cap: "All done." *(tap ALL DONE)* "Up." |
| After a void | Softly, during the void: "Pee in toilet!" Reward within seconds. Then "All done." |
| Wet / missed | "Wet. Change." No "uh oh", no disappointment. Model TOILET once. Move on. |
| Refusal | "No toilet. Okay." *(tap NO, honouring it)* "Later." |
| Early distress | Fewer words. "I'm here." Lower your body, give space. Stop the timer. Offer the exit and the comfort item. |
| Escalation | Only "You're safe." Clear the space. Don't touch unless there is danger. Wait. After calm: "Done. Rest." No toilet attempt for the rest of the day. Reconnect later through a favourite activity. |

5. **Timeline and hints** (§9.5). Each hint says how much data supports it.
6. **Troubleshooting library:**
   - withholding;
   - constipation;
   - regression during illness or change;
   - ritual rigidity;
   - fear of the flush;
   - generalising to school.
7. **School handoff sheet:** one page covering the child's signals, rewards, schedule and what *not* to do.
8. **Printable schedule** (§8.5).

---

## 8. Visual and interface design

### 8.1 Two modes as tokens (they extend `tokens.css`)

**Approach** is warm cream, with lumen for the current step. **Sit** is cool, low-chroma slate. Ink is the only text colour. Contrast ratios were checked with the WCAG relative-luminance formula.

```css
:root {                          /* Approach (day) */
  --pp-bg: #fbf4e8;              /* ink 14.0:1 */
  --pp-tile: #fffaf2;
  --pp-now: #fde9bf;             /* current step, ink 12.8:1 */
  --pp-now-ring: #8a5a00;        /* 5.4:1 */
  --pp-path: #8f7e66;            /* 3.6:1 (non-text) */
  --pp-done: #2f6b47;            /* 5.8:1 */
  --pp-token-on: #8a6a00;  --pp-token-off: #7a858d;
  --pp-retry-bg: #e6ebee;        /* neutral "try again" */
  /* Sit (day) */
  --pp-sit-bg: #dde4e6;  --pp-sit-tile: #eef2f3;  --pp-sit-ink: #26323b;  /* 10.2:1 */
  --pp-sit-fill: #4f6c7c;  --pp-sit-track: #c8d2d6;  --pp-sit-focus: #8a5a00;
  /* Motion and size */
  --pp-t-step: 600ms;  --pp-t-celebrate: 1200ms;  --pp-ease-soft: cubic-bezier(.4,0,.2,1);
  --pp-target-child: 160px;  --pp-target-log: 64px;
}
:root[data-theme="night"] {      /* bathroom at night: no white */
  --pp-bg: #1d1914;  --pp-now: #3a2c12;  --pp-token-on: #e8c13a;
  --pp-sit-bg: #0d1216;  --pp-sit-ink: #b9c4cb;  --pp-sit-fill: #6b8ca0;
  --pp-sit-track: #222c33;  --pp-sit-focus: #c99a3a;
}
:root[data-theme="contrast"] {
  --pp-sit-fill: #ffd60a;  --pp-sit-track: #5c5c5c;
  --pp-path: #fff;  --pp-now: #000;  --pp-now-ring: #ffd60a;
}
```

Rules:
- Red and pink (`--alert`, `--wc-negate`) are **never** used in Potty Path, including for wet / missed.
- Focus is a double ring: a 2 px ink inner ring and a 4 px lumen outer ring, because lumen alone is too faint on cream.
- Night mode switches on automatically after a caregiver-set hour.

### 8.2 Icons for the 12 steps

Use a **dedicated SVG set** rather than emoji. Emoji look different on each device, and ARASAAC's licence is non-commercial.
- **Style:** 2.5 px rounded strokes on a 48-unit grid, drawn in `currentColor`, with the verb (action) colour band.
- **Dignity rules:**
  - no anatomy and no body fluids;
  - no strained faces;
  - the figure is gender-neutral, with the same trousers for everyone;
  - neutral skin by default, with 5 optional tones;
  - figures are shown from the waist up or from the side;
  - a squat-toilet variant is available.

| Step | Metaphor |
|---|---|
| Approach | Figure walking toward an open door with a toilet outline |
| Pants down / Pants up | Hands at the waistband, chevron pointing down / up |
| Sit | Seated, side view, feet on a step stool |
| Timer | The same ring as the timer screen |
| Void | Seated figure, three soft drops into the bowl (water, not body) |
| Wipe | Hand with a folded paper square beside the hip |
| Stand | Figure rising, chevron pointing up |
| Flush (optional) | Hand on the lever, with a dashed "optional" outline |
| Wash / Dry | Hands under the tap / in a towel |
| Done | A tick in the end-of-path circle |

**Own photos:** these are allowed only for *this bathroom's objects* (the toilet, the tap, the child's towel). They are cropped square and kept on the device only.

### 8.3 Companion art

- **Shape:** soft rounded forms, about 1.2 heads tall.
- **Size and position:** at most 18% of the screen height, anchored bottom-left, never covering a step.
- **Motion:**
  - *Idle:* breathing scale 1 → 1.02 (off in Sit mode).
  - *Model:* one 600 ms move into a held pose.
  - *Celebrate:* a single 1200 ms rise-and-settle with at most 4% overshoot.
  - *Neutral:* a 300 ms crossfade.
- **Reduced motion:** static art with cuts or 150 ms fades.

### 8.4 Layouts

```
Child, landscape tablet (mounted)
+------------------------------------------------------------+
| (o)(o)(o)(o)(*)( )( )( )( )( )( )( )   path dots (display)  |
|   +-------------+          +-------------------+           |
|   |   NOW       |  ----->  |   NEXT (dimmed)   |           |
|   |  [ SIT ]    |          |   [ timer ]       |           |
|   |   240px     |          |   160px           |           |
|   +-------------+          +-------------------+           |
| [companion]          [Help] [Stop]        [o o o] tokens    |
+------------------------------------------------------------+
```

In portrait, the path runs as dots down the left edge, Now sits above Next in the centre, and the companion and tokens go at the bottom. Help and Stop are in the **same place on every screen**.

### 8.5 Printable wall schedule

- A4 and US Letter, 12 mm margins.
- **Strip** layout: 2 × 6 steps, cut out and laminated.
- **Grid** layout: 3 × 4 cells of 55 mm, each with a Velcro "done" pocket.
- Black on white, Atkinson Hyperlegible Bold 14 pt, numbered cells, and the Flush cell drawn dashed.
- A tagged PDF with alt text.

### 8.6 Sound

- **One cue per event, and always the same cue:**
  - *step done* = soft 2-note marimba (≤ 400 ms);
  - *celebrate* = the same notes plus a third;
  - *try again* = **no sound**.
- **Limits:** volume at most 60% of the system volume, ≤ −18 LUFS, fade-in of at least 20 ms.
- **Sit mode is silent**, apart from optional steady pink noise.
- **Silent profile is the default for the first week.**
- **Never a flush sound effect** or a rushing-water sound.

### 8.7 Accessibility checklist (WCAG 2.2 AA)

- Text has at least 4.5:1 contrast and non-text at least 3:1, in all three themes (1.4.3 / 1.4.11).
- State is shown by shape, not colour alone (1.4.1).
- Nothing advances automatically. The timer can be paused, extended or hidden (2.2.1 / 2.2.2).
- No flashing. `prefers-reduced-motion` and "Keep the screen still" are respected (2.3.x).
- `prefers-contrast: more` switches to the contrast theme.
- Focus is never hidden by the companion (2.4.11).
- Target sizes: child 160 px, log buttons 64 px, Undo 48 px (2.5.8). No drag gestures (2.5.7).
- Help is in a consistent place (3.2.6). Every log entry has Undo.
- **Caregiver screen-reader labels:**
  - log buttons read like "Log dry, Sam, 10:42";
  - the timer uses `role="timer"` with `aria-live="off"` plus a polite announcement at the end;
  - Undo is announced through `role="status"`.
- **Child-side labels:** step tiles read like "Wash hands, next", and the companion is `aria-hidden`.

---

## 9. Technical architecture (fitted to the current codebase)

### 9.1 Files

| New file | Role |
|---|---|
| `potty-core.js` | Pure logic with no DOM: event merge, session fold, token ledger, hints, red-flag rules. Tests import this file. |
| `potty-store.js` | `luminaac:potty` key, the `luminaac-potty` IndexedDB (photos), device id, outbox, BroadcastChannel, Web Locks |
| `potty.js`, `potty.css` | Child surface inside My Voice |
| `bridge-potty.js` | Bridge Potty tab |
| `backend/potty.js` | Optional sync routes, in the style of `flserver.js` |
| `tests/potty.test.mjs` | Node tests in the existing `t(name, cond)` style |

**Small hooks into existing files:**
- `shared.js`: add `access.potty: false`. Add `link: "potty"` to the existing "Bathroom" routine step. Reuse `INTENTS.need` and the existing toilet symbol; do not add a second vocabulary.
- `index.html` / `bridge.html`: script tags and a `#tab-potty` section.
- Bridge Export and Delete fire `bridge:export` / `bridge:delete` events, which `bridge-potty.js` handles.
- `backend/server.js`:
  - `childView` gets `potty: { protocol, paused }`;
  - `scopedView` share links **never** include potty data;
  - add a new `potty` alert kind.
- `sw.js`: bump VERSION and precache the new files. If they are not cached, the first visit to the bathroom with no Wi-Fi fails.

### 9.2 Domain model

```ts
type Actor = "child" | "caregiver" | "system";
type Prompt = "independent" | "environmental" | "model" | "gesture" | "hand_under_hand"; // no "physical" on AAC
type Modality = "aac_button"|"vocal"|"echolalia"|"sign"|"symbol_card"|"object"|"leads_adult"|"at_door"|"holds"|"other";

interface PottyEvent {               // immutable, append-only; merge key = id
  id: string; dev: string; seq: number; t: number; tz: number; by: Actor; sessionId?: string; v: 1;
  kind: "session_start"|"step"|"sit_start"|"sit_end"|"body_check"|"void"|"wet"|"dry_check"|"signal"
      | "refuse"|"distress"|"pause"|"resume"|"abort"|"prompt"|"drink"|"meal"|"token_award"
      | "token_redeem"|"protocol_pause"|"protocol_resume"|"note"|"retract";
  data: { type?: "urine"|"bm"|"both"; where?: "toilet"|"wet"|"nappy"; stool?: 1|2|3|4|5|6|7;
          dry?: boolean; modality?: Modality; prompt?: Prompt; step?: string; targetId?: string; reason?: string };
}
interface Protocol {                 // caregiver-written, last-writer-wins on updatedAt
  phase: 0|1|2|3|4|5|6|7|8; sitWindows: string[]; sitSec: number; sitCapSec: 300; bowelCapSec: 600;
  maxSitsPerDay: number; minGapMin: 20; steps: string[]; tokenRatio: number; tokenForSitting: boolean;
  bmPauseDays: 3; updatedAt: number; updatedBy: string;
}
interface PottyProfile {             // on-device only, never synced
  baselineMode: "light"|"full"; sensory: Record<string, "yes"|"no"|"unsure">;
  reinforcers: { id: string; label: string; photoKey?: string; rank: number }[];
  screening: { code: string; present: boolean; at: number }[]; knownSignals: string[];
  consentBy: string; consentAt: number;
}
// Derived, never stored: Session (fold over events), TokenLedger { earned, boardsRedeemed, onBoard }
```

- **Corrections** are `retract{targetId}` events, so the log never needs editing.
- **Token count** = count of `token_award` events. Because the ledger is derived, devices can never disagree about it, and it can never go down.
- **Storage:**
  - a separate `luminaac:potty` key holds `{version, profile, events[], cursor, outbox[]}`. Writes are read, union by id, then write, inside `navigator.locks`.
  - Bridge `save()` rewrites the whole document, so health events must not live inside it.

### 9.3 Session state machine

| From | Event → To | Who |
|---|---|---|
| IDLE | `signal` → APPROACH (child-initiated) | child or caregiver |
| IDLE | `session_start` → APPROACH (prompted) | caregiver (the scheduler only *suggests*) |
| APPROACH(i) | `step` → next; last → SITTING | child or caregiver |
| SITTING | `void` → CELEBRATE (+token) | caregiver is authoritative |
| SITTING | timer end → BODY_CHECK → choice (All done / More time); **hard cap → FINISH** | system / child |
| APPROACH, SITTING | `refuse` → FINISH (neutral); 2 refusals today → no more scheduled sits today | child or caregiver |
| any active | `distress` / `pause` → CO_REGULATE (timer frozen, calm screen, scripts) | child ("break") or caregiver |
| CO_REGULATE | `resume` → previous state; escalation or `abort` → ENDED, no more sits today | caregiver |
| IDLE | `wet` → CLEANUP (neutral) → IDLE | caregiver |
| CELEBRATE / FINISH | wrap-up steps → DONE screen (World) → ENDED | — |

**Rules:**
- Timers are computed from timestamps, not ticks, so they survive screen sleep.
- If events conflict, **the void decides** the outcome.
- `protocol_pause` turns off the scheduler and the sit timer, but **never the TOILET button**.

### 9.4 Devices and sync, shipped in steps

1. **One device:**
   - The child view runs on the tablet. Caregiver logging sits behind the existing press-and-hold gate, and the Bridge tab works on the same device.
   - Pages already stay in step through the `storage` event, with BroadcastChannel for low latency.
2. **Offline QR handoff:** the tablet shows a QR code of new events (compressed, about 40 per code) using the vendored `qrcode.js` / `jsQR.js`. The phone scans it and merges. No network is needed.
3. **Optional backend:**
   - `POST /api/potty/events` is idempotent by id; `GET ?since=seq` returns new events.
   - Server-sent event `potty` on the existing stream.
   - The `potty` alert reuses the alert bar, so "wants the toilet" can reach the phone in under 3 s.
   - Opt-in **end-to-end encryption**: an AES-GCM data key travels in the pairing QR code, and the server stores only ciphertext.

**Merging:** the event set is grow-only (a CRDT), and retracts make it two-phase. Merging is union by id, so sync order does not matter and duplicates do nothing.

### 9.5 Pattern hints (explainable, gated, no machine learning)

A day counts as **covered** if it has at least 3 logs spread over at least 4 hours. Every hint shows its support (for example "6 of 9 days") and a "why" line. Below the threshold, the app says what data it still needs.

| Hint | Method | Shown when |
|---|---|---|
| Usual void time (~10:15) | 15-minute bins with a ±15-minute window over 14 covered days; median of the peak | ≥ 7 covered days, ≥ 10 voids |
| Drink → void (~20 min) | Median and IQR from drink to first void (within 180 min); suggests a sit at median − 5 | ≥ 8 pairs over ≥ 4 days, IQR ≤ 30 |
| Success by part of day | (s+1)/(n+2), reusing `confidence()` | n ≥ 5 per bucket |
| Regression | Continence ratio for the last 7 days vs the previous 14; a drop of ≥ 20 points with ≥ 3 wets prompts the caregiver to consider context and offers to step back | baseline ≥ 15 voids |
| Constipation | Days since the last poo ≥ `bmPauseDays` (on covered days only), or Bristol 1–2 in 2 of the last 5 → auto `protocol_pause` and a doctor prompt | Uncovered days say "no poo logged — logging gaps?" |

### 9.6 Reminders on iOS

- **What a PWA can't do on iOS:** it gets no background timers and cannot schedule local notifications.
- **Workarounds:**
  - The tablet stays in the foreground with Screen Wake Lock (Guided Access recommended) and shows a "next sit" view.
  - The caregiver phone gets an **`.ics` calendar export** of sit times, which needs no server.
  - Optional Web Push through the backend, with a content-free payload ("Time for a sit").
- The child's device **never** pushes to the child.

### 9.7 Privacy and security

- **Local only by default.** The event log syncs only through its own opt-in, "Sync toilet log", which stays off even when document sync is on.
- **Never sent to a server:**
  - the screening and sensory profile;
  - the reason for a pause;
  - photos.
- Share links (`scopedView`) **exclude potty data for every role**. A later option is a clinician summary with aggregate counts only.
- Audit lines contain no content ("Updated toilet log").
- **Retention:** default 90 days, kept separately from other data. Export creates a separate JSON file, and Delete wipes the key, the IndexedDB and any server events.
- **Hard bans:**
  - no camera or microphone while Potty Path is open;
  - no federated learning on toilet data;
  - no analytics or third parties.

### 9.8 Feature flag

- `access.potty` (default `false`) lives in the synced document, so it reaches the tablet through `childView`.
- The modules always load, do nothing while the flag is off, and switch on or off live.
- Developer override: `localStorage["luminaac:potty-dev"] = "1"`.

### 9.9 Tests

**`tests/potty.test.mjs`:**
- merge is commutative, associative and idempotent;
- retract drops events from the folds;
- every row of the state machine is checked against a fake clock;
- the token ledger never goes down;
- hints stay null below their thresholds;
- constipation causes a pause, but uncovered days don't;
- the void decides the outcome;
- the hard cap ends the sit;
- 2 refusals stop scheduled sits.

**`backend/test.mjs`:**
- posting the same batch twice gives the same `seq`;
- the child device can write but not read;
- share views contain no potty data;
- delete purges events.

---

## 10. Delivery plan (three increments)

| # | Scope | Acceptance |
|---|---|---|
| **1. One-device core** (flag off by default) | `potty-core`, store, child path / approach / sit / done, TOILET button, caregiver logging behind the hold gate, Bridge timeline and protocol, safety caps, printable schedule | A full session works in airplane mode. The Bridge updates within 1 s. The timer is correct after the screen locks. Export and Delete cover everything. The service worker precaches the new files. |
| **2. Assessment and hints** | Onboarding, screening and red flags, sensory grid, reward photos, hints, regression and constipation pause, `.ics` export, coaching cards | No hint appears below its threshold. A pause disables sits but not TOILET. Red flags block until acknowledged. |
| **3. Two devices** | QR handoff, backend routes, outbox, SSE, `potty` alert, end-to-end encryption, optional push | Two devices that edit offline for an hour end up with identical event sets after reconnecting. A tap reaches the phone in under 3 s. The server holds only ciphertext. |

**Deferred:** wetness sensors and predictive ML. Both would move the product toward being regulated medical software (§11.3).

---

## 11. Business and go-to-market

### 11.1 Positioning and model

> For families of nonverbal autistic children working on toileting, **Potty Path helps your child tell you when they need to go**, in their own way, and gives every adult around them one shared, private routine. Other potty apps are reward charts. Potty Path treats toileting as **communication first**.

**Recommended: free for families forever, with clinics and schools paying for coordination.** This needs no new pricing structure; it fits the tiers already in GO-TO-MARKET.md.

| Free forever (Family) | Paid add-on (Clinic $29/clinician/mo · School per-student) |
|---|---|
| The whole child experience, TOILET button, signal learning, timers, routine, local log, hints | Clinician dashboard: signal rate across a caseload, goals |
| One printable routine and a shareable signal guide (this is the growth loop) | Multi-site sync with roles (home, school, clinic) |
| Coaching and the troubleshooting library | IEP / treatment-plan exports, progress reports |
| | Branded print packs, classroom kits, translations; accredited staff training |

Medicaid waiver and insurance routes **wait for outcome evidence**.

### 11.2 Jobs to be done

- **Parent:** "Help me learn which signal means *bathroom*, so we stop missing it and I stop guessing every 30 minutes." Emotional job: to feel competent, not judged.
- **School para:** "Give me this child's signal and routine in 30 seconds, so I respond the same way home does."
- **BCBA / SLP / OT:** "Let me target *requesting*, not schedule compliance. Show me data across settings without re-entry, and keep the family in charge."
- **The child:** "My body signals are believed. I can say *need to go*, *not now* or *too loud*, and adults listen. Nobody sees my wet days."

### 11.3 Regulatory posture (not legal advice; get counsel)

- **FDA:** stay a *communication and routine support tool*. Make no claims to diagnose or treat enuresis, encopresis, constipation or autism, and give no clinician-facing recommendations from patient data. Predictions stay as caregiver-confirmed suggestions. The 2026 General Wellness / CDS guidance needs reading from the primary text.
- **COPPA:** the amended rule's compliance date was 22 Apr 2026. Local-only mode collects nothing. Sync or clinic sharing needs verifiable parental consent plus a written retention policy and security programme.
- **FTC Health Breach Notification Rule:** likely applies to a consumer health app with sync.
- **HIPAA:** the family app is generally not covered. A **clinic deployment makes LuminAAC a business associate**: it needs a BAA, risk analysis, audit logs and encryption. PRIVACY.md lists end-to-end encryption as "roadmap", which is a gap for the clinic tier.
- **FERPA:** in schools, the data is an education record. Use a "school official" contract and a DPA, allow no secondary use, and delete at end of contract.
- **GDPR Art. 9:** if used in the UK or EU, this is health data and needs explicit consent.

**Claims language:**
- ✅ "Helps your child tell you when they need the bathroom."
- ✅ "One routine for home and school."
- ✅ "Supports functional-communication goals; does not replace clinical judgment."
- ❌ "Potty trained in 3 days."
- ❌ "Clinically proven."
- ❌ "Reduces accidents by X%."
- ❌ "Treats incontinence."
- ❌ "Normal toileting."

### 11.4 Competitors

| Product | Overlap | Status |
|---|---|---|
| Potty Training Social Story (Touch Autism) | Social story and visuals | Verified (App Store) |
| First Then Visual Schedule (Good Karma) | Photo schedules | Verified; may be unmaintained |
| Choiceworks; Goally | Routines and rewards | Partly verified |
| Proloquo2Go, TD Snap, LAMP WFL | Bathroom vocabulary | Well known; not re-verified here |
| Free printables (Milestones Autism Resources) | Visual steps | Verified |

**The defensible difference:** none of these verified products **learns the child's own pre-toilet signals** with caregiver confirmation and then turns that signal into a word on the child's talker. That loop already exists in LuminAAC. It is also local-first and free for families.

---

## 12. Metrics, validation and launch

### 12.1 Metrics

**North star:** **child-initiated toilet communication rate**, measured per day and per toileting opportunity.

**Supporting metrics:**
- signal → void within 10 min (precision);
- distress and refusal rate (a well-being guardrail);
- dryness, as a health signal only.

Not tracked: "days to trained".

| HEART | Metric | Where it lives |
|---|---|---|
| Happiness | Weekly 2-question check-in (caregiver confidence 1–5; "Was today calmer?"); child "too loud / not now" taps | On the device |
| Engagement | Routines run per day; share of trips with a logged signal | On the device |
| Adoption | Share of families who finish setup within 7 days | Opt-in aggregate counts only |
| Retention | Still logging at weeks 4 and 8; a second caregiver active | Opt-in aggregate counts |
| Task success | Child-initiated requests per opportunity; adult response time; signals confirmed by someone other than the parent | On the device; shared only with the family's chosen clinician or school |

**Caregiver burnout guardrails** (the team watches these trends; users are never shamed):
- logging time over 2 min a day;
- more scheduled sits than the cap allows;
- "too hard" or paused days rising;
- confidence falling;
- child refusals rising.

When these move, the response is to *simplify*, never to push harder.

**Never shared, even with sync on:**
- wet details;
- anything visual from the bathroom;
- free-text notes, unless shared item by item.

### 12.2 Validation before build

- **About 20 interviews:**
  - 8 parents across ages 3–5, 6–10 and 11+, with and without AAC;
  - 4 school paras or teachers;
  - 2 BCBAs, 2 SLPs and 2 OTs;
  - 3–4 autistic adults, including some who were minimally speaking as children.
- **Pilot:** 5 families over 8 weeks. Weeks 1–2 are a paper baseline, and weeks 3–8 use Potty Path, with a school or clinic partner where possible. A paid autistic-adult panel reviews scripts, visuals, rewards and copy before the pilot and again at week 4. An SLP and a BCBA review safety. An ethics or IRB review is needed if results will be published or used in marketing.
- **Kill or change criteria:**

| Finding | What changes |
|---|---|
| Signal rate does not rise over baseline in at least 3 of 5 families | Fold the routine into Stories instead of building a module |
| Burnout guardrails get worse | Simplify, or ship printable-only |
| The advisory panel flags shaming that design can't fix | Rethink before building |
| Clinicians demand EHR export | Change the B2B plan, not the free core |
| Families won't log at all | Keep only the button and the routine |

### 12.3 Launch

- **Channels:**
  - founding families and parent AAC groups;
  - **autistic-led organisations** (ASAN, AAC user communities), approached as a request for review, not for an endorsement;
  - ASHA, AOTA and BCBA networks;
  - school special-education coordinators, reached through the printable signal guide.
- **Message order:**
  1. "Your child can tell you when they need to go, in their own way."
  2. "One routine for home and school, private by default."
  3. "Free for families."
  4. For clinicians: "Track communication, not compliance."
- **Never say:**
  - any timeline;
  - "accident-free";
  - streak language;
  - cure, "normal" or "age-appropriate";
  - "clinically proven" before the data exists;
  - before-and-after accident counts;
  - anything implying the child is lazy or defiant.
- **Never show** bathroom images of real children.

---

## 13. Decisions taken where the panels disagreed

| Topic | Options | Decision |
|---|---|---|
| End of the sit timer | Auto-continue to Done after 10 s (game) vs. nothing auto-advances (visual, ACCESSIBILITY.md) | Nothing auto-advances, **except the clinical hard cap**, which always ends the sit |
| Celebration size | World growth and chime (game) vs. minimal or off by default (clinical) | Minimal by default. The World appears only on Done and can be turned off. The human reward comes first. |
| Prompt levels in the data model | Up to `full_physical` (architecture) vs. no physical prompting on AAC (clinical) | Enum capped at `hand_under_hand`, valid only on motor steps |
| Poo red flag | No poo in 7 days (architecture) vs. 3 days (clinical) | **3 days**, adjustable by a clinician |
| Refusal retries | Back off 10 min with up to 2 retries (architecture) | 2 refusals end scheduled sits for the day (clinical) |
| Business model | Parent subscription (v1) | Free for families; clinics and schools pay |
| Wording | "Accident" | "Wet / missed" |

---

## 14. Open questions for the founder

1. Which of your son's signals do you already recognise for "toilet"? They seed `knownSignals` and the first "Asked" options.
2. Is the iPad going to be **mounted in the bathroom**, or carried in? This decides the default layout and Guided Access advice.
3. Who will review the clinical content (SLP, BCBA, continence nurse), and which autistic-led group should we approach for review?
4. Are you OK starting with **Increment 1 (one device, flag off)** so it can be tried at home before anything syncs?
5. Should Potty Path appear in the public caretaker guide only after the pilot?
