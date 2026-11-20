# Interests, history and sound play: concept

How LuminAAC can use a child's favourite videos and their own communication history to make the board feel like *theirs*, give caregivers useful insight, and teach sounds through gentle play. Written October 2026 for v0.9.

**Status key:** ✅ **Built** in v0.9 · 🧪 **Concept** (designed, not built) · 🚫 **Won't do**

## Principles
- **The child's interests are a doorway, not a data source.** We notice what lights them up so the people around them can join in.
- **Patterns, never diagnosis.** Nothing in LuminAAC infers autism level, mental health, IQ or "progress scores". Every insight is phrased as something that happened.
- **On the device first.** Watch history, talk taps and game turns stay on the device where they happened. The server only carries what a caregiver set up (the video list and game settings).
- **Nobody fails.** Games celebrate tries. Silence is fine.
- **Caregivers stay in charge.** Only videos a caregiver adds are shown. No search, no recommendations, no comments, no autoplay.

## 1. YouTube for understanding interests

| Idea | Status | Notes |
|---|---|---|
| Caregiver-curated board: paste a link, name it, pick an emoji, tag topics, add words | ✅ | Bridge › Videos and games. Accepts watch, youtu.be, shorts, embed, live, music and nocookie links and `t=1m5s`. |
| Child-side **My videos** with privacy-enhanced embed | ✅ | IFrame API with host `youtube-nocookie.com`; `controls=0`, `rel=0`, `fs=0`, `disablekb=1`, `iv_load_policy=3`, `autoplay=0`, captions on. Our own big Play/Pause/Watch again buttons. |
| Hide YouTube's end screen | ✅ | On `ENDED`, the player is covered, so "watch next" tiles never show. |
| Engagement signals | ✅ | Per session: watched seconds, duration, replays, finished, skipped early (stopped before 20 s or 25 %). Score = opens + 2·replays + 2·completion·opens + 1.5·talk taps − skips. |
| Words used during and after | ✅ (after) / 🧪 (during) | "Talk about it" board logs taps by video. Concept: a slim word strip *during* playback, so the child can comment ("again", "funny", "scared") without stopping. |
| Topic → vocabulary and fringe sets | ✅ (suggestions) / 🧪 (auto-pages) | 10 topics with starter words. Insights shows **Words to try next**: topic words the child hasn't said yet. Concept: one tap to add them as a fringe page on My Voice, with OpenMoji pictures. |
| "Talk about this video" boards | ✅ | Video words + topic words + "I like it", "again", "all done". |
| Caregiver chapters (start times, "the funny bit") | 🧪 | Store start/end per clip so the board can say "show the train crossing". |
| Watching together prompts | 🧪 | Prompt cards for the adult: "Pause at 0:42 and wait. Model *go*." |
| Video search for the child, YouTube Kids login, recommendations | 🚫 | Out of scope by design. |

## 2. History that shapes the experience

| Idea | Status | Notes |
|---|---|---|
| Interest map (Loves / Likes / Sometimes) | ✅ | From video engagement and topics. |
| Word growth (messages and first-time words per week, 8 weeks) | ✅ | SVG chart with a data table for screen readers. |
| Milestones (10, 25, 50, 100… different words; first game streaks) | ✅ | Feeds the digest and report. |
| Mood–interest links | ✅ | Confirmed feelings within 30 minutes of a video, shown as "a pattern to notice, not a cause". |
| Adaptive boards: favourite-topic words float up | 🧪 | Re-rank fringe words by interest score, capped so core words never move (motor planning matters). |
| Time-of-day context | ✅ (stats) / 🧪 (board) | `byPartOfDay` exists. Concept: suggest calm videos in the evening, music in the morning, if the child's own history shows it. |
| New-word celebration on the child side | 🧪 | A quiet sparkle the first time a word is used; caregivers can turn it off. |
| Regression or overload hints | 🚫 | We won't infer these; caregivers can read the history themselves. |

## 3. Caregiver insights

| Idea | Status | Notes |
|---|---|---|
| Weekly digest | ✅ | Plain sentences: messages vs last week, new words, favourite video, game turns, streak, a kind note for quiet weeks. |
| Interest map, top words, video favourites table | ✅ | Insights › Interests and history. |
| Game progress and caregiver goals | ✅ | Weekly goals per game, progress bars, streak and sticker counts. |
| Therapist summary | ✅ | One page, printable or save as PDF, with a blank notes area and the line "a record of what happened, not an assessment or diagnosis". |
| Triggers | 🧪 | "Upset moments often happen near *loud* videos" is only shown if the caregiver opts in and confirms the feelings. Never automatic labels. |
| Push or email digest | 🧪 | Uses the existing web-push plan; opt-in only. |
| Opt-in summary sync to other caregivers | 🧪 | Today, history stays on the child's device. Concept: send weekly *aggregates* (counts, top topics), never raw logs or watch times, end-to-end encrypted. |

## 4. Gamified speech and sound teaching

| Game | Status | What it teaches |
|---|---|---|
| Copy my sound | ✅ | Imitation and voice onset. Loudness bar and pitch dot (autocorrelation, 80–1000 Hz, on the device). Without the mic: "I did it". |
| Who says that? | ✅ | Sound–picture association (animals, vehicles, everyday sounds). Wrong picks are named, never buzzed. |
| First sounds | ✅ | Phoneme awareness for m, b, p, d, n, t, s, f, using the caregiver's practice sounds when set. |
| My turn, your turn | ✅ | Turn-taking with drum beats; tap or voice. Waiting is fine. |
| Stickers, stars or ticks, streaks, praise | ✅ | Every try earns one; streak counts days played. |
| Sensory settings | ✅ | Mic on/off, volume, quiet sounds, calm visuals (also follows reduced motion), 2–4 choices. |
| Vowel and pitch "draw" game (slide a rocket with your voice) | 🧪 | Uses the same pitch tracker. |
| Word-level recognition (did they say "ball"?) | 🧪 | Possible with Vosk-browser or Moonshine/whisper on device; accuracy for minimally verbal and atypical speech is poor, so it must reward attempts, not correctness. |
| Interest-themed rounds (train sounds for a train lover) | 🧪 | Pick game items from the top topics. |

## 5. Privacy and safety

- **No child Google account.** The child never signs in; embeds are anonymous.
- **youtube-nocookie.com** host. YouTube may still set storage once a video plays; the privacy policy says so plainly.
- **Allowlist only.** Only caregiver-added IDs are playable; the player can't navigate elsewhere (no related videos, keyboard shortcuts, full screen or annotations; end screen covered).
- **No autoplay, recommendations or comments.**
- **On-device processing.** The microphone is off by default; audio is analysed in memory for loudness and pitch and never recorded, stored or sent. Tracks stop when a game closes.
- **Data minimisation.** The server's child view carries the video list and game settings only. Watch history, talk taps and game turns are never synced. Export and delete in Privacy cover them.
- **COPPA and GDPR-K.** Parental consent is captured at setup; the parent controls collection, can review and delete. Embedded YouTube content is "made for kids" by its uploader; we treat the child as under 13 and never pass identifiers to YouTube.
- **No diagnosis inference.** Copy, reports and code avoid clinical labels.
- **YouTube Terms.** We use the official IFrame player, keep YouTube branding and ads, don't download or cache video, and don't overlay the video while it plays. Covering the player after it ends is allowed as it isn't playing.

## 6. Open-source building blocks
See [RESEARCH-OSS.md](../RESEARCH-OSS.md#round-3-interests-history-and-sound-play) for links, licences and fit. v0.9 adds no new third-party code: pitch, charts and games are written for LuminAAC.
