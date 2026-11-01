# Potty Path v0.2 mechanics: review and reconciled spec

> **Status:** review of the "Game Mechanics & Flow (v0.2 deep spec)", 1 Nov 2026. Nothing here is built yet.
> **Read with:** `docs/POTTY-PATH.md` (the v0.10 blueprint, which is built), `potty-core.js`, and the wireframes canvas (7 artboards: Sit Mode, soon card and offer, signal responses, World, token phases, Bridge console, state machine): https://claude.ai/artifact/1eD5pazLSeNF8rvJEQWDWm. The link is private to the owner until shared.
> **Verdict:** the spec's spine is right and most of it is already true in v0.10: three loops, add-only World, signal as the star, Break/Help/Stop everywhere, human-confirmed progress, and fading by design. **Six mechanics need correcting before build.** Two of them would quietly teach the wrong thing (§2.1, §2.2), and one runs backwards (§2.3). The state machine also has holes (§4).

---

## 1. What v0.10 already does (so we don't build it twice)

| v0.2 spec item | v0.10 today | Gap |
|---|---|---|
| Session reducer and state machine (§9) | `foldSession()` folds an append-only event log through approach → sitting → body_check → finishing → ended, plus coregulate and cleanup | Add `offered`, `refused`, `transition` (see §4) |
| Sit Mode: timer, companion, Break/Help/Stop only (§5.1) | Built: circle / jar / dots / walk timers, 5 companions, silent/voice/soft sound | Calm activities (§5.3) are new |
| The timer is an anchor, never a pressure (§5.2) | Built, plus a **body check** at target ("All done / More time") and **hard caps** of 5 min (wee) and 10 min (poo) | The spec's 180 s maximum fits inside our caps. Keep the caps. |
| Signal from any modality, marked by a human (§6) | Built: `MODALITIES`, "Asked ★" with modality on the console, and the child's own TOILET button | Add early/late timing (§2.2) |
| Add-only tokens, no reset on accident (§7) | Built: `ledger()` only ever adds; redeeming spends from the board, never from the lifetime count | Phases B–D are new (§2.1) |
| World grows and is never removed (§4) | Built: `worldPieces()`, train/garden motifs, World book | Element types and areas per stage are new |
| Medical pause overrides everything (§8.1 rule 2) | Built: `pauseState()` covers no BM for 3 covered days, Bristol 1–2, screening, and a doctor resume | None |
| Refusal accepted, never punished (§11) | Built: 2 refusals or 1 distress event stops planned sits for the day | v0.10 is **stricter** than the spec. Keep v0.10. |
| Stages (§2) | `PHASES` 0–8 is a caregiver-set label with no exit criteria | Exit criteria and the recommend → confirm flow are new |
| Adaptive engine (§8) | `canScheduleSit()` guard rails plus explainable hints; no `nextSession()` | New, but must stay inside the guard rails |
| Data model (§14) | Events, not records. Sessions are *derived* | Keep events. `PottySession` becomes the fold's output type, never stored |

---

## 2. Must-fix before build

### 2.1 Phase C "variable tokens" is a slot machine

The spec randomises token amounts (sit 1–3, void 2–5, signal 4–7) for "intermittent reinforcement". That clashes with its own axioms ("predictability is fun", "the World is not a slot machine"). Unpredictable outcomes are a known stressor for many autistic children.

Schedule thinning is well supported, but what gets thinned is *how often* a reward comes, in a predictable way. Randomising the amount is not the same thing.

**Fix:** Phase C becomes **predictable thinning**. The board grows from 3 → 5 → 8 tokens per reward, and every step is confirmed by the caregiver. Choice adds the variety: the child picks from 2–3 photos, which supports agency without randomness. "Surprise" stays a caregiver option for children who enjoy it, and is off by default.

### 2.2 Big rewards after an accident teach accidents

The spec celebrates late signals (after the void or accident) "identically" with the highest-value reinforcer. A child can quickly learn that wetting, then signalling, earns the best prize.

**Fix:** split the response by timing.

| Timing | Screen | Caregiver | Tokens |
|---|---|---|---|
| Signal **before** void (early) | Biggest celebration, landmark in the World | Highest-value reinforcer | Most |
| Signal, no need to go | Warm celebration | Praise and a trip to the toilet | Normal |
| Signal **after** void or accident (late) | Calm "thank you for telling me" plus a small World piece (a "lantern") | Warm words, calm clean-up | 1 |
| Accident, no signal | Neutral "let's clean up" | Calm, no comment | 0, and never minus |

The late signal is still celebrated, and the noticing still shows on the Bridge ("3 late signals: awareness is coming"). The top prize stays tied to **telling first**.

### 2.3 The schedule rule runs backwards

§6.3 and §8.1 rule 4 say that early signals *shorten* the interval and late signals *extend* it. It should be the other way round. If he reliably tells you in time, you need **fewer** scheduled sits. If his signals come late, sits need to come **earlier** to catch the void.

**Fix:**
- `earlySignalRate ≥ 0.7` → extend the interval by 10 min and drop one prompt level.
- `lateSignalRate ≥ 0.5` → shorten the interval by 10 min, within the bounds.
- Add a property test: "more early signals never produce more scheduled sits".

### 2.4 Physical prompting must never be automatic

Rule 5 escalates to "Level 4 = physical assist" when success < 0.4. v0.10 already forbids physical prompts on the AAC tap, and the axioms say "agency over compliance".

**Fix:**
- The engine may *suggest* moving up one level, up to Level 3 (gesture).
- Hand-under-hand help with clothing is only recorded when the caregiver picks it. It is never recommended by the engine and never used for the communication act.
- If success is low, the engine's first moves are **easier stage**, **later sits** and **check medical and sensory**, not more prompting.

### 2.5 Forced activity rotation fights sameness

"Never repeat the same activity more than 3 sessions in a row" will distress children who regulate through sameness, and it contradicts the predictability axiom.

**Fix:** the child's favourite stays available. The engine *offers* a second option beside it, and the caregiver can turn rotation on. The concern about rigid rituals is handled by fading the app overall (§13), not by taking a comfort away mid-sit.

### 2.6 Thresholds disagree with each other

Rule 3 advances a stage at success ≥ 0.8, but the Stage 2 exit criterion in the stage table is ≥ 50%. "Auto after 5 sessions of distress" is also the only automatic transition in a system that promises none.

**Fix:**
- The per-stage table (§3 below) is the **only** source of exit criteria.
- Step-back is *recommended* after distress; it is never automatic.
- "Consecutive" becomes "**5 of the last 7**", so one bad day doesn't wipe out a week.

---

## 3. Reconciled numbers (single source of truth)

| Stage | Name (v0.2) | Maps to v0.10 PHASE | Sit target | Exit (recommend only) | Token phase |
|---|---|---|---|---|---|
| 0 | Familiar | 0–2 | none (clothed, 10 s) | Comfortable entries in 5 of the last 7 visits, over ≥ 3 days | A |
| 1 | Sit tolerance | 3 | 60 s | Sits of ≥ 10 s in 5 of the last 7, over ≥ 3 days | A |
| 2 | Scheduled sits | 3 | 90 s | Toilet-void rate ≥ 50% over 10 sessions, caregiver logging ≥ 80% of planned sits | A → B |
| 3 | Communication | 5 | 120 s | ≥ 3 signals in a week, and ≥ 50% of signals before the void | B |
| 4 | Independence | 6–7 | 120 s | ≥ 70% of trips he starts himself, over 2 weeks | B → C (thinning) |
| 5 | Fade | 8 | 120 s | The family's own written "done" (open question 9) | D |

Rules that hold at every stage:
- Hard caps: 5 min (wee), 10 min (poo).
- At most 8 sits a day, at least 20 min apart, with the interval kept between 45 and 120 min.
- 2 refusals or 1 distress event ends planned sits for the day.
- A medical flag pauses everything.
- If the SLP marks CAS or anxiety, the exit criteria must be met in 2 separate weeks.

Tokens (Phase A–B):

| Event | Tokens |
|---|---|
| Sit | 1 |
| Dry check | 1 |
| Void in toilet | 2 |
| Early signal | 3 |
| Signal, no need to go | 1 |
| Late signal | 1 |

This is v0.10 with void and signal raised by 1, keeping the spec's order: signal > void > sit. To stop the child tapping repeatedly just for tokens, signal tokens count once per 20 minutes. **The trip is always honoured, every time.**

---

## 4. Reconciled session state machine

The spec's machine has no Break state (Break is "always on screen" but has nowhere to go), and no body check. ROUTINE goes to SIT on "child_leaves". ENTERING has no exit, and there is no place for an accident mid-session or for a **transition warning**. Here is the version that matches `foldSession()`, with the spec's additions:

```
IDLE
 ├─ schedule_tick ───────────────► TRANSITION   (2-min "soon: toilet" card on the current activity; skipped for child signals)
 ├─ caregiver_start ─────────────► OFFERED
 └─ signal (parallel, any state) ► CELEBRATE_SIGNAL ─► OFFERED (if idle) | resumes current state

TRANSITION ─ timer / tap ────────► OFFERED
OFFERED  ─ accept / led ─────────► APPROACH
         ─ refuse ───────────────► REFUSED ─► IDLE   (counts toward 2/day; "thank you for telling me")
         ─ 30 s no response ─────► IDLE              (logged "missed_offer", no count)
APPROACH ─ steps before sit ─────► SITTING
         ─ 2 min not entering ───► IDLE              (fills the spec's ENTERING gap)
SITTING  ─ target reached ───────► BODY_CHECK
         ─ void ─────────────────► CELEBRATE
         ─ stands / leaves ──────► FINISHING (partial: celebrated calmly)
         ─ cap reached ──────────► FINISHING (always)
BODY_CHECK ─ "More time" ────────► SITTING (more time, still inside the cap)
           ─ "All done" ─────────► FINISHING
ANY ─ Break ─────────────────────► BREAK (timer frozen) ─ resume ─► previous state
                                         └ 15 min ─► ENDED (calm)
ANY ─ Stop / distress ───────────► CALM_CLOSE ─► ENDED   (no retry today)
ANY ─ wet / poo in pants ────────► CLEANUP ─► ENDED      (neutral, child helps if tolerated)
CELEBRATE ─ reward given / 30 s ─► FINISHING
FINISHING ─ wipe, pants, (flush), wash, dry ─► ENDED ─► IDLE
```

Invariants to test (add to `tests/potty.test.mjs`):
- No state leads to a "fail" or "try again".
- Every state reaches IDLE within its timeout.
- A signal from any state is recorded and celebrated.
- BREAK freezes the sit clock.
- The cap ends any sit.
- CALM_CLOSE blocks further planned sits that day.
- Replaying the same events always gives the same result.

---

## 5. Gaps the spec misses

1. **Transition warning.** Leaving a preferred activity is often the hardest part. Show a 2-minute visual "soon" card (Now/Next) on whatever he's doing, never as a surprise interruption. This applies to scheduled sits only, never to his own signals.
2. **Body check.** "Do you need more time?" at the target. This is already built and is the start of interoception practice. The spec has no equivalent.
3. **Bowel track.** Poo training usually lags wee by months. It needs its own longer sit, a foot stool, after-meal timing, and its own World motif. It is built in v0.10, and the spec ignores it.
4. **Standing to wee** (later, if relevant). This would be a stage 4 option with its own steps. Seated first is fine and common.
5. **Clothing and readiness.** Use easy waistbands, and move from pull-ups to underwear as a separate caregiver decision with its own celebration. Don't fold it into a stage.
6. **Caregiver latency nudge.** The spec nudges a slow caregiver. Make it a weekly "here's what helped" note, never a per-event scold, to match the burnout row.
7. **No fluid loading.** Rewards must never be drinks offered to make a void happen. This is an existing v0.10 rule.

---

## 6. What to build next (delta on v0.10)

| Increment | Contents |
|---|---|
| M1 Stage engine | Stage table (§3); `stageProgress()` fold with "5 of 7" windows; `stage.recommend` / `confirm` / `step_back` events; Bridge card ("Ready for Stage 2? here's why"); printable certificate |
| M2 Signal timing | Early / late / no-need classification from event order; the response split in §2.2; signal tokens limited to one per 20 min; Bridge "awareness" trend |
| M3 Transition and offer | TRANSITION and OFFERED states; the 2-minute "soon" card on My Voice; missed-offer logging |
| M4 Calm activities | Breathing Garden, Quiet Pond, story page, photo book, Sound Potty (once Sound Path exists); never counted toward success |
| M5 Token phases | Boards of 3 → 5 → 8 with caregiver confirmation; choice of 2–3 photo rewards; "reward given" latency on the console (already partly built) |
| M6 `nextSession()` | A pure planner *inside* `canScheduleSit()`, with property tests: safety goes one way only, no auto-advance, bounds hold, replay matches, medical pause holds, prompt level never above 3 automatically, early signals never add sits |
| M7 Fade | Stage 5: companion only at celebrations, World becomes the reward, a printable World book as a keepsake, tapering check-ins, and an SLP taper sheet |

School sync and public mode are mostly covered by v0.10's QR handoff, encrypted sync and printable cards. M7 adds a "public mode" toggle (silent, no data).
