# Sound Path and Safety Links: research-checked blueprint

> **Status:** Increment A shipped in v0.11. Increments B, C and D shipped in v0.17 (3 Nov 2026), all off by default: Sound Path sits behind `access.sound`, Mouth Mirror needs camera consent, Sound and treat is turned on with the SLP, research mode needs a separate consent for each wristband, and Safety Links need a family account. **How the build differs from the plan:** the MediaPipe model loads from a CDN when Mouth Mirror first starts (about 4 MB), as Copy the Robot does, instead of being bundled with the app. Cued-articulation hand-sign pictures aren't included (they are licensed). Context rules cover doors, gates and windows only. Research mode uses a simple heart-rate rule, not a trained model, and still needs the SLP and ethics review in §6. Written 1 Nov 2026 from a literature and technology search, to expand the "Neuro-Adaptive Speech Training" and "trackers and wearables" ideas.
> **Who it's for:** one nonverbal or minimally verbal autistic child, the family, and the child's SLP.
> **Builds on:** v0.4 speech practice, v0.9 sound games (`games.js`: loudness and pitch meter, `judgeTry`, first sounds), v0.3 magic moments, v0.5 and v0.8 safe zones and water danger zones (`geo.js`), and the v0.10 Potty Path event-log pattern.

---

## 0. What the research actually says (read this first)

The concept text we started from is ambitious. Some of it is well supported, some is not, and some would cause harm if it were built as written. We checked each claim against peer-reviewed work and current platform documentation. Each grade means:
- **Strong:** several controlled studies or reviews agree.
- **Moderate:** a few controlled studies, or consistent smaller ones.
- **Weak:** pilots, case series or expert opinion.
- **Against:** the evidence points the other way.

| Claim in the concept | What we found | Grade | What we do instead |
|---|---|---|---|
| Train "mouth and tongue muscles" to build speech | Non-speech oral-motor exercises (blowing, tongue push-ups, lip exercises) have no good evidence of improving speech. A Cochrane review found only 3 small, flawed studies ([Lee & Gibbon 2015](https://www.cochrane.org/evidence/CD009383_non-speech-oral-motor-treatment-children-developmental-speech-sound-disorders)), and ASHA's review called the evidence equivocal ([McCauley et al. 2009](https://pubs.asha.org/doi/10.1044/1058-0360(2009/09-0006))). | **Against** | Practice **speech movements as speech**: real sounds, syllables and words, never isolated muscle drills. |
| AAC might stop him from talking | AAC does not block speech, and most studies see small gains in speech ([Schlosser & Wendt 2008](https://pubs.asha.org/doi/abs/10.1044/1058-0360(2008/021))). Meta-analyses show small-to-moderate effects on speech ([Ganz et al. 2014](https://oaktrust.library.tamu.edu/bitstream/1969.1/152272/1/AAC%20Meta_revisions_2014.06.pdf)). A 2024 review of speech-generating devices found more vocalizations ([Yuan et al. 2024](https://doi.org/10.1177/215416472405900302)). | **Moderate** | Sound Path lives **inside** the AAC app. The board stays his main voice, and every tap is also a spoken model he can copy. |
| Sing-and-tap helps minimally verbal children | Auditory-Motor Mapping Training (sing two-syllable words while tapping drums) gave more gains in syllables and consonants than plain repetition ([Chenausky et al. 2016](https://doaj.org/article/c9ff7605deb1445294614fb82c1667f8)), with d ≈ 0.82 at 4 weeks in a later study ([2022](https://omicsdi.org/dataset/biostudies-literature/S-EPMC10264969)). | **Moderate** (small samples, matched more than randomized) | A **Sing and Tap** game: two drums on screen, the word is sung on two notes, and he taps along. |
| Video modelling and cued articulation, delivered by a parent through an app | The BabbleBooster app pilot (n=19, 16 weeks) was feasible and liked by families ([Saul & Norbury 2020](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7687695/)). It is not yet an efficacy trial. | **Weak to moderate** | **Watch my mouth**: short close-up clips of a *familiar* face (Mum, Dad, sibling) saying the target, recorded on the Bridge. |
| Games with automatic speech scoring help children practise | Apraxia World: children improved at home and stayed engaged for 2 months. Automatic feedback gave about 57% gain, against about 62% when caregivers gave the feedback ([Hair et al. 2021](https://psi.engr.tamu.edu/wp-content/uploads/2021/03/hair2021taccess.pdf)). Speech recognition for children is still unreliable; in one study it agreed with human judges only about 47–51% of the time ([2018](https://www.tandfonline.com/doi/full/10.1080/17549507.2018.1513562)). Repeated "not recognised" moments hurt self-esteem ([Saeedi 2022 review](https://onlinelibrary.wiley.com/doi/10.1155/2022/4814945)). | **Moderate** for games, **Weak** for automatic scoring in this population | **The grown-up is the judge.** The machine only *listens for any voice* (already built) and offers hints. It never marks a try wrong. |
| Motor-learning rules (how much practice, what kind of feedback) | Childhood apraxia work (DTTC, Maas et al.) suggests three things. Blocked practice with frequent feedback helps a sound *start*. Varied practice with less frequent feedback helps it *stick*. The best amount of feedback is still unknown ([Maas 2012](https://experts.arizona.edu/en/publications/feedback-frequency-in-treatment-for-childhood-apraxia-of-speech/), [DTTC dose trial protocol](https://bmcpediatr.biomedcentral.com/counter/pdf/10.1186/s12887-023-04066-2.pdf)). | **Moderate** (small, mixed) | The **practice engine** (§3) starts blocked with frequent praise, then varies and fades feedback once a target is reliable. |
| Visual "see your sound" feedback | Visual-acoustic biofeedback (the staRt app) helps some children, but results are mixed and the work is mostly on /r/ in older children ([Peterson et al. 2022](https://pubs.asha.org/doi/10.1044/2021_LSHSS-21-00084)). | **Weak to moderate** | Use it as a **toy**, not a test: a sound-reactive picture for long vowels and hums (pitch and loudness already work). |
| Stimulus-stimulus pairing (pair a sound with something he loves) | Mixed results in the older literature. A 2024 randomized feasibility study (n=16) of response-contingent pairing ([Springer 2024](https://link.springer.com/article/10.1007/s10882-023-09913-9)) is promising but small. | **Weak** | Optional **"Sound and treat"** mode that the SLP turns on. |
| Naturalistic, play-based teaching beats drills for minimally verbal children | Large SMART trials (Kasari 2014; AIM-ASD, n=194, 2025) found that **most children reached single words and about a third reached phrases**. Blended naturalistic approaches (JASP-EMT) with an AAC device did well ([AIM-ASD 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12587618/)). | **Strong** for the approach. It also sets **realistic expectations**. | Short practice inside his **interests** (trains, the World), plus "say it with me" moments during the day. Not long drill sessions. |
| Detect smiles to trigger rewards | Autistic facial expressions differ from the people these models were trained on, and automatic tools are less accurate on them ([Molecular Autism 2021](https://molecularautism.BiomedCentral.com/counter/pdf/10.1186/s13229-021-00430-0.pdf)). A smile is not proof of comfort for many autistic people, and "no smile, no reward" would punish a neutral face. | **Against** as a trigger | Rewards follow **attempts**. Regulation is read from what he *does* (breaks, skips, leaving), and the grown-up confirms it. The camera stays optional. |
| Watch mouth shape on camera | MediaPipe Face Landmarker runs in the browser and gives `jawOpen`, `mouthPucker`, `mouthFunnel`, `mouthClose`, `mouthSmile_*`. `tongueOut` is not reliably output ([issue #4403](https://github.com/google/mediapipe/issues/4403)). | Feasible for **jaw and lips only** | An optional **Mouth Mirror** for open/round/closed shapes (ah / oo / mm). Nothing about the tongue. Video stays on the device. |
| A wav2vec2/HuBERT model that understands his sounds | Phoneme recognizers for children are improving ([Kids-WFST 2025](https://www.emergentmind.com/topics/kidspeak)). They are trained on typical or mildly disordered speech, are hundreds of MB, and map unusual sounds onto the nearest standard phoneme ([2024](https://arxiv.org/pdf/2403.08187)). | **Not ready** for this child | Defer. Keep the existing magic-moment library of *his own* sounds, labelled by family, as the long-term training set. |
| "New neural pathways" | Repetition plus meaningful feedback drives motor learning, and that is a fair way to describe it. Brain-change claims for an app are not something we can measure or promise. | Marketing language | Say "practice that builds new sounds". Measure sounds and words, not brains. |

**The honest promise:** short, fun, child-led practice inside his AAC. It aims at more voice, more different sounds, and some word approximations, while his device stays his reliable voice. Most minimally verbal children in good programs gain single words. Phrases are a stretch goal, not a guarantee.

---

## 1. Sound Path: the ladder

Each rung is a set of targets. He moves up when the grown-up has marked a target "got it" on 3 different days. He can always drop back to an easier rung and nothing is lost.

| Rung | Targets (from his own inventory first) | Example games |
|---|---|---|
| 0. Voice on | Any voice: hum, "ah", laugh | Sound-reactive World, Echo (built) |
| 1. Long sounds | Vowels /a/ /i/ /u/, continuants /m/ /s/ /f/ /sh/ | Mouth Mirror (ah/oo/mm), "fill the jar" with a long sound |
| 2. Early consonant + vowel | /m b p d n t w h/ + vowel ("ma", "ba", "do") | Watch my mouth, Sing and Tap |
| 3. Same syllable twice | "mama", "baba", "bye-bye", "choo-choo" | Sing and Tap (2 drums), train whistle |
| 4. Two different syllables | "bubble", "hello", "puppy" | Sing and Tap, Word Train (each carriage a syllable) |
| 5. Words he uses | His top board words, simplified ("wa" for water) | Say it with me |
| 6. Word plus word | "more train", "go out" | Board + voice combos |

**Targets come from him.** The Bridge shows a **sound inventory**: the sounds the family has heard him make, ticked off on a picture chart. Targets are chosen in this order: sounds he can already make that are close to a word he wants, then early-developing sounds, then words from his top AAC taps. The SLP can override any choice.

**Approximations count.** Each word has a family-set "good enough" form ("wa" = water). The aim is communication, not perfect articulation.

---

## 2. Games (all short: 3 to 6 tries, then the World grows)

1. **Say it with me** (everywhere, no game screen). When he taps a board word that is a current target, the voice says it, then waits about 3 seconds with a soft "your turn" pulse. If he makes any voice in that window, it counts as a try. There is never a prompt to repeat and never a block before the board answers him: the board always speaks first.
2. **Sing and Tap** (from AMMT). Two drums, two notes, the word sung slowly. He taps each drum as each syllable is sung. Then it's his turn: he taps, and the app plays the notes while he tries. The tempo slows when he's unsure.
3. **Watch my mouth**. 2-second close-up clips of a family member, recorded and kept on the Bridge (never uploaded unless sync is on), played slowly and then at normal speed. Optional cued-articulation hand signs are shown as small pictures.
4. **Mouth Mirror** (camera optional, off by default). A friendly character copies his jaw opening and lip rounding live. The targets are open (ah), round (oo) and closed (mm). It runs on the device using MediaPipe blendshapes, nothing is recorded, and it stays off during Potty Path tries.
5. **Sound World** (built on the v0.9 meter). His voice makes the World move: a long sound pushes the train, higher pitch lifts the balloon, a hum fills the jar. It is pure cause and effect, with no right or wrong.
6. **Word Train**. Each syllable is a carriage. Saying, or trying, each part couples it on. The whole word drives off and joins his World.
7. **Sound and treat** (the SLP turns it on). The target sound is played while his favourite thing shows, to build value for that sound before he is asked to say it.

Every game shares these rules, taken from Potty Path:
- Break, Help and Stop are always on screen.
- No losing, no score that goes down, no timer that punishes.
- Rewards are the family's own (photo, sound, animation, from the existing reward settings) at the chosen sensory level.
- Silent mode works in every game.

---

## 3. The practice engine (how it adapts)

A pure function, `nextTry(history, target)`, in `sound-core.js`. It is tested the same way as `potty-core.js`.

- **Challenge point:** keep his success rate at about 70–85%. Above that, move up (blocked → mixed practice, or the next rung). Below 50% over the last 10 tries, go one rung easier and add the model clip again.
- **Acquire, then retain:** while he is learning a new target, use the same target in a row (blocked) with feedback on every try. Once it is reliable, mix it with older targets (random) and fade the "that was great!" feedback to about every other try. The reward still arrives every round.
- **Spaced, short sessions:** at most about 5 minutes. Twice a day beats once for 20 minutes. "Say it with me" adds natural practice through the day.
- **Stop on stress, not on failure:** two breaks or one Stop in a session ends practice for that day (same rule as Potty Path). He gets a calm closing reward, never "try again".
- **Who judges:** the grown-up holds the judge bar (✓ got it / ~ close / · tried). With no grown-up there, any voice counts as "tried" and is never marked wrong. Automatic pitch and length checks only *suggest* "close" to the grown-up.

---

## 4. What the Bridge shows

- **Sound inventory chart:** consonants and vowels heard, colour-coded (heard once / heard often / used in words), growing over time.
- **Weekly numbers:** voice tries per day, how many different sounds he made, word approximations used, and voice tries he started himself vs. ones he copied. Each number shows how many observations it is based on, the same way Potty Path hints do.
- **The SLP sheet:** a printable page with targets, success by rung, practice minutes and examples. It adds to the existing therapist summary.
- **Coaching scripts:** how to model (say it, wait, don't demand), how to praise any try, and what to do on hard days.

KPIs from the concept, made measurable:

| Concept KPI | Measured as |
|---|---|
| Phonetic accuracy improvement | % of targets marked "got it" on 3 days, by rung |
| Vocalization confidence score | Voice tries per day he started himself + number of distinct sounds per week (not a made-up composite) |
| Successful word formation rate | Word approximations the family heard used *for meaning*, logged with one tap |
| Therapist-reported progress | Free-text notes from the SLP, plus the targets they set |

---

## 5. Safety Links: trackers, wearables and the home

### 5.1 What is and isn't possible (checked Nov 2026)

| Wish | Reality | Plan |
|---|---|---|
| Read AirTag location inside LuminAAC | Apple has **no public API** for reading Find My locations. Only certified accessories can join the network. "Share Item Location" (iOS 18.2+) makes a temporary share link meant for airlines ([MacRumors](https://www.macrumors.com/guide/find-my-network-accessory-program)). Apple designs AirTag for *items*, and other people's iPhones show anti-stalking alerts when one travels with them. | **Tracker cards:** the Bridge stores a link and a photo for each tag ("backpack AirTag: open in Find My", or a pasted share link). One tap opens the right app. No fake integration. |
| Read Google Find Hub tags | No public developer API found. Users can share devices with up to 10 people, and share links expire after 7 days ([9to5Google](https://9to5google.com/2025/05/13/googles-find-my-device-network-is-now-find-hub/)). | Same tracker cards. |
| Read Tile tags | No public location API (Tile is owned by Life360). | Same tracker cards. |
| Bluetooth from the web app | Chrome and Edge on Android and desktop have Web Bluetooth. **Safari on iPhone and iPad does not**, and WebKit is still opposed to it ([W3C list, 2024](https://lists.w3.org/Archives/Public/public-web-bluetooth/2024Sep/0002.html)). | Bluetooth features only on Android/Chrome or in the Capacitor native app. Never required. |
| Tracking made for people (AngelSense, Jiobit, Apple Watch with Family Setup, kids' Galaxy Watch, Project Lifesaver radio bracelets) | These are the right tools for a child who wanders. Most offer the vendor's own app; a few offer webhooks or IFTTT. | A **location webhook**: any device or hub that can send a web request can post into LuminAAC's alert stream. |
| Smart home (door, gate and pool sensors) | Home Assistant, SmartThings and IFTTT can all call a webhook when a sensor fires. Door and pool alarms are top recommendations from wandering-prevention groups. Drowning is the leading cause of death in autistic children who wander (Guan & Li 2017, *AJPH*; NAA reports most wandering deaths involve water). | **Home sensors → Bridge alerts**, with the same urgent styling as water danger zones. |
| Stress or meltdown warning from a wristband | Research wristbands (heart rate, skin conductance, motion) predicted aggression 1–3 minutes ahead in inpatients: AUROC 0.84 person-specific ([Goodwin 2019](https://zendy.io/title/10.1002/aur.2151)) and 0.80 in 70 youths ([Imbiriba 2023, JAMA Netw Open](https://www.pubmed.gov/38127348/)). These are prediction studies, not proof that warnings help, and they used research-grade devices. | **Research mode only, later:** a caregiver-only "calm check?" nudge, never shown to the child, never a label. Requires a separate consent. |
| Seizure alerts | Autism and epilepsy often occur together. FDA-cleared seizure wristbands have their own alert apps. | Treat as a **vendor alert source** through the webhook, never our own detection. |

### 5.2 What we build

1. **Tracker cards** (Bridge → Safety): photo, what it's attached to, a link that opens Find My, Find Hub, Tile or a vendor app, and a battery reminder date. They print on the "if he's missing" sheet.
2. **"If found" ID page:** a QR or NFC sticker for a shoe, wristband or backpack. It opens a minimal share page with his first name, "I don't speak, I use a tablet", how to approach him, and a button to call the parent. No address and no location history. It is built on existing share links, revocable, and the caregiver chooses every field.
3. **Webhook alert input** (`POST /api/safety/hook/:id`, one signed secret per source): accepts `door_open`, `gate_open`, `pool_motion`, `wearable_sos`, `wearable_left_zone`, `seizure_alert` and `location`. Alerts go into the existing SSE alert stream and the Bridge buzz. There are ready-to-paste recipes for Home Assistant and IFTTT. It is rate-limited and logged in the audit trail.
4. **Context rules:** "door opened **and** his tablet hasn't moved **and** no grown-up marked 'going out together' → urgent". These are simple, explainable rules, like Potty Path guard rails, not AI.
5. **Bluetooth "is he near?" (Android/Chrome or the native app only):** pair a cheap BLE tag or band. The Bridge phone shows near / far / lost signal. It is a backup sensor only, never the main safety plan.
6. **Wandering plan sheet:** a printable page with a recent photo, communication card, sensory triggers, favourite places, nearby water from the v0.8 water layer, and tracker list. This is what police and searchers ask for first.

### 5.3 Safety principles

- The phone's own location and safe zones stay the backbone. Every other source *adds* to them.
- Every data source has its own consent switch and its own delete button.
- Location history is kept for 7 days by default and never appears on share pages.
- Nothing pretends to work when it doesn't. If iOS can't do Bluetooth, the card says so.
- Tracking him is for safety, not surveillance. As he grows, he is told about the tracking in a way he can understand, and his own preferences count.

---

## 6. Build order

| Increment | Contents | Depends on |
|---|---|---|
| **A. Sound Path core** | `sound-core.js` (ladder, practice engine, inventory folds, event log like Potty Path); Say it with me; Sound World; Sing and Tap; grown-up judge bar; Bridge inventory and targets; tests | Existing games.js meter and rewards |
| **B. Models and mirror** | Watch my mouth (family clips in IndexedDB); Word Train; Mouth Mirror with MediaPipe (vendored, about 4 MB, lazy-loaded, off by default); SLP sheet | A |
| **C. Safety Links** | Tracker cards; "if found" page; webhook input with Home Assistant/IFTTT recipes; context rules; wandering plan sheet | Existing alerts, share links, geo.js |
| **D. Bluetooth and research** | Web Bluetooth near/far (Android); research-mode wristband stress nudge behind a separate consent; magic-moment audio export for a future personal sound model | C, and an SLP and ethics review |

Everything ships behind `access.sound` and `access.safetyLinks`, off by default, the same as Potty Path.

---

## 7. Open questions for the family and the SLP

1. Which sounds and word attempts do you already hear? This seeds the inventory.
2. Does he have a childhood apraxia of speech (CAS) diagnosis or query? That changes the practice engine's settings (more blocked practice and slower pace).
3. Does he tolerate the front camera? If not, Mouth Mirror stays off for good.
4. What tracker or wearable, if any, does he already have, and does it offer webhooks or IFTTT?
5. Is there a home hub (Home Assistant, SmartThings, Alexa) and are there door or gate sensors?

---

## References (checked links)

- Lee & Gibbon (2015). Non-speech oral motor treatment for children with developmental speech sound disorders. *Cochrane* CD009383.
- McCauley, Strand, Lof, Schooling & Frymark (2009). Evidence-based systematic review: effects of nonspeech oral motor exercises on speech. *AJSLP* 18(4).
- Schlosser & Wendt (2008). Effects of AAC intervention on speech production in children with autism. *AJSLP* 17.
- Ganz et al. (2014). Interaction of participant characteristics and type of AAC with individuals with ASD: a meta-analysis.
- Yuan, Dunn, Kennedy, Hsiao & Poppen (2024). Impact of SGD interventions on vocalizations of individuals with autism. doi:10.1177/215416472405900302.
- Chenausky, Norton, Tager-Flusberg & Schlaug (2016). Auditory-motor mapping training. *PLoS ONE*; and the 2022 follow-up in *Ann NY Acad Sci*.
- Saul & Norbury (2020). Feasibility of an app-based parent-mediated speech production intervention for minimally verbal autistic children. *Pilot and Feasibility Studies* 6.
- Hair et al. (2021). A longitudinal evaluation of tablet-based child speech therapy with Apraxia World. *ACM TACCESS*.
- Saeedi et al. (2022). Application of digital games for speech therapy in children: systematic review. *J Healthcare Eng*.
- Maas et al. (2008). Principles of motor learning in treatment of motor speech disorders. *AJSLP* 17; Maas et al. (2012) Feedback frequency in treatment for CAS.
- Guadagnoli & Lee (2004). Challenge point: a framework for conceptualizing the effects of various practice conditions in motor learning. *J Motor Behavior* 36.
- Peterson et al. (2022). App-based visual-acoustic biofeedback: single-case randomization study. *LSHSS*.
- Kasari et al. (2014). Communication interventions for minimally verbal children with autism: a SMART. *JAACAP*; AIM-ASD primary aim results (2025), PMC12587618.
- Tager-Flusberg & Kasari (2013). Minimally verbal school-aged children with ASD: the neglected end of the spectrum. *Autism Research* 6.
- Goodwin et al. (2019). Predicting aggression to others in youth with autism using a wearable biosensor. *Autism Research* 12; Imbiriba et al. (2023). *JAMA Network Open*, PMID 38127348.
- Guan & Li (2017). Injury mortality in individuals with autism. *American Journal of Public Health* 107(5).
- MediaPipe Face Landmarker model card (blendshapes V2) and issue #4403 (tongueOut).
- W3C public-web-bluetooth list (Sept 2024) on WebKit's position.
