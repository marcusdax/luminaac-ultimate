# Games concept: play that talks

Status: concept for review, November 2026. Nothing here is built yet.

The structure borrows from [Claude Code Game Studios](https://github.com/marcusdax/Claude-Code-Game-Studios):

- game pillars;
- one design page per game, using its GDD sections (player fantasy, core rules, game feel, edge cases, tuning knobs, acceptance criteria);
- an art bible (see [DESIGN.md](../DESIGN.md));
- an accessibility review.

Its engines (Godot, Unity, Unreal) are not used. LuminAAC stays a plain web app.

The lenses applied:

- a speech-language pathologist and autism specialist;
- a game designer working with autistic players;
- a graphic artist;
- an engineer.

## Pillars (every game must pass all six)

1. **The board is the controller.** Games are played by tapping real word tiles, in the same places and the same colours as on Talk. Every turn is a real message: playing *is* aided language practice, not a break from it. This is our edge. No AAC app does it and no game does it.
2. **Every try is right.** Nothing fails, nothing times out and nothing is taken away. Effort earns the reward, and accuracy only changes what happens next.
3. **Predictable first, then a small surprise.** Each game has one fixed loop that never changes. Novelty comes from what the child chooses (which animal, which track), never from rule changes.
4. **The child can always leave.** "All done" sits in the same corner in every game, works on one tap and is never questioned. A break is a choice, not a failure.
5. **The sensory dial belongs to the grown-up.** Motion, sound, colour intensity and session length each have a slider. Still mode and reduced motion are respected everywhere.
6. **Rewards only grow.** Progress goes into one shared **World** (extending Potty Path's World): add-only, no streaks to lose, no limited-time anything, no purchases, no ads.

## Shared game kit (build once)

| Piece | What it does | Built with |
|---|---|---|
| `game-kit.js` | Scene host, the "All done" corner, sensory settings, session cap, logging to Insights | Plain JS, pure core with tests |
| **Board bridge** | Shows the child's real tiles (same grid position, colour and picture) as game buttons, and speaks them like Talk | Existing board code |
| **Scene** | Backdrop from `--scene-*`, flat vector props, slow ambient drift (40 s, off in Still) | SVG and CSS. Optional [paper-design/shaders](https://github.com/paper-design/shaders) (Apache-2.0, no dependencies) for one gentle sky |
| **Characters** | A small animated cast (train, dino, blob, cat), the same companions as Potty Path | [dotLottie web](https://github.com/LottieFiles/dotlottie-web) (MIT) or [Rive](https://github.com/rive-app/rive-wasm) (MIT), loaded only when a game opens |
| **Motion** | Tweens for props and the lit indicator | [Motion](https://github.com/motiondivision/motion) (MIT, already vendored) |
| **Sound** | Short, soft, never stacked. Off is a first-class setting | [howler.js](https://github.com/goldfire/howler.js) (MIT); [Tone.js](https://github.com/Tonejs/Tone.js) (MIT) only for the music game |
| **Physics** | Only where things fall or roll | [matter-js](https://github.com/liabru/matter-js) (MIT), lazy |
| **Movement** | Opt-in camera, pose only, on the device | [MediaPipe](https://github.com/google-ai-edge/mediapipe) (Apache-2.0), lazy |
| **World** | The add-only reward world across all games | Extends `potty-core.js` World |

Library decisions:

- **Not used:** GSAP (its licence is not open source), Vanta (pulls in three.js), tsParticles and confetti (overstimulating), Phaser and PixiJS (too heavy for tap games; reconsider only for a big scrolling game).
- **Game art:** flat and outline-free. [Kenney](https://kenney.nl) CC0 props are allowed, and OpenMoji stays the picture set.

## The games

### 1. Word Garden: "plant a word"
- **Fantasy:** my words make things grow.
- **Loop:** tap a word tile and a matching plant sprouts in the garden. Two words together ("more water", "big flower") make it bloom.
- **Why:** core-word modelling. Two-word combinations are the next language step after single words, and the garden shows that combining words does more.
- **Tuning knobs:**
    - how many tiles are on screen (4 to 12);
    - core words only, or the full board;
    - whether two-word combos are on.
- **Accept when:**
    - every tap speaks;
    - the garden never loses a plant;
    - it works with switch scanning.

### 2. Conductor: "where does my train go?"
- **Fantasy:** I'm in charge of the train.
- **Loop:** the train waits at a junction. "Go", "stop", "fast", "slow", "more" and "again" control it, and place tiles (park, home, school) pick the line. Nothing happens until the child asks.
- **Why:** requesting and directing, his strongest functional language uses. "Again" and "more" become the most-practised words on purpose.
- **Links:** Word Train (Sound Path) and the Potty Path train World share the same train.
- **Knobs:** speed range, which places, honk on or off.

### 3. Feelings Weather (in Calm): "what's my sky?"
- **Fantasy:** the sky can feel like me.
- **Loop:** the child picks a weather that matches a feeling (sunny, cloudy, rainy, stormy, windy). The sky changes slowly. A breathing cloud then shrinks the storm, at 4 s in and 6 s out.
- **Why:** emotion labelling for alexithymia, linked to co-regulation. Feelings words land on the board, and the grown-up gets a gentle note ("He chose stormy at 3:10").
- **Rules:**
    - The child is never asked to pick a "better" feeling.
    - The storm only goes when the child chooses to breathe.

### 4. Pattern Lab: "sort it"
- **Fantasy:** I'm the one who sees the pattern.
- **Loop:** items arrive one at a time. Sort them by colour, shape or kind into boxes. Levels unlock new kinds: animals, food, vehicles.
- **Why:** builds on systemising strengths, and teaches word classes through the Fitzgerald colours. Action words are green, describing words are blue, and so on.
- **Knobs:**
    - number of boxes (2 to 4);
    - item speed (still, or slow conveyor);
    - whether item names are spoken.

### 5. My Turn, Your Turn Table (two players, one device)
- **Fantasy:** we play together.
- **Loop:** the screen splits for the grown-up and the child, and a lit token passes across. Either player can be a sibling, therapist or teacher. Mini-rounds include stacking blocks, drum patterns and building a picture together.
- **Why:** turn-taking, joint attention and "my turn" / "your turn" / "wait" in context. Its numbers feed Sound Path's turn-taking count.

### 6. Story Stage: "make it happen"
- **Fantasy:** I make the show.
- **Loop:** choose a character, an action word and a place: "dino jump park". The scene plays the sentence as a 3 to 5 s animation and speaks it. The child can save it and play it again.
- **Why:** subject, verb and object sentence building, with instant meaning. Saved scenes can become Stories in My day.
- **Tech:** dotLottie or Rive characters with named actions, so adding an action means adding one animation.

### 7. Sound Pond 2: "my voice makes ripples"
- **Fantasy:** my voice changes the water.
- **Loop:** an extension of Sound World. Loudness makes ripples and pitch moves a fish up and down. A long "aaah" swims the fish across the pond.
- **Why:** voice exploration with no right answer. It counts toward the Sound Path ladder (rung 0 to 1). The microphone is measured on the device and never recorded, as now.

### 8. Copy the Robot (opt-in camera)
- **Fantasy:** the robot copies me, or I copy it.
- **Loop:** a friendly robot does a pose, such as arms up or touching the head, and the child copies it, or the child leads and the robot copies. Pose is checked on the device.
- **Why:** imitation and body awareness. Movement breaks between talk tasks.
- **Rules:**
    - The camera is off by default and needs a parent's consent.
    - No images are saved.
    - There is a no-camera version with tap-to-pose.

## Season and World (add-only)

All games add to one World. Every try adds a small piece: a tree, a carriage, a lantern. Telling or asking adds a landmark.

- The World is browsable from Play.
- It prints as a keepsake book, like the Potty Path World book.
- There are no daily streaks, no countdowns and no events that end.
- New themes (sea, space, farm) arrive as new places to grow, never as limited-time drops.

## Build order (each step is useful on its own)

1. **Game kit and Board bridge, then Word Garden.** This proves pillar 1 and gives the most language value.
2. **Conductor.** It reuses the train art, and he loves it.
3. **Feelings Weather.** It belongs in Calm, which makes it high value for regulation.
4. **Story Stage.** It needs a small animated cast.
5. **Pattern Lab, My Turn Table and Sound Pond 2.**
6. **Copy the Robot.** It is last because it needs the camera, consent and the heavier MediaPipe.

Each game ships behind a feature flag, as Sound Path and Potty Path did, with:

- tests for its pure core;
- a check at 360 px and on an iPad;
- an accessibility pass: switch scanning, dwell, Still mode and contrast theme.

## Open questions for the family

- **Interests:** which of his interests should the first scenes use? Trains are confirmed. What else: animals, water, a show?
- **Sound:** does he like game sounds at all, or should sound start off?
- **Who plays:** is a two-player game useful at home, or mostly with his therapist?
