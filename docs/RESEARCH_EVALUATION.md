# Research evaluation: what M1–M3 use, and why

November 2026. This covers the models, libraries, datasets and clinical ideas behind milestones M1 to M3 (features 1–17), what we chose, what we passed over and what still needs checking.

**How to read the "Checked" column:**
- **Yes** means we ran it or read the source in this repository.
- **Not run here** means the code is written and tested with stand-ins, but the sandbox it was built in couldn't reach the model host (huggingface.co) or the CDN (cdn.jsdelivr.net). Try those once on a real device before relying on them.
- Licences marked "check" weren't confirmed from the primary source while writing this.

## 1. Models (on the device, opt-in)

| Model | Size | Licence | Used for | Decision | Checked |
|---|---|---|---|---|---|
| [Kokoro-82M v1.0 ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), q8 | about 92 MB | Apache-2.0 | Natural voice. M3 adds the Sky, Nicole, Puck and Isabella voices | **Kept.** Small enough for tablets, good quality, permissive licence | Voice list yes; audio not run here |
| Pitch shaping on Kokoro audio (Web Audio `playbackRate`) | 0 MB | our code | Child-like pitch, expressive tone | **Built** (`voice-core.js`). Kokoro is asked to speak slower by the same factor the audio is sped up, so pitch and formants rise and word timing stays put | Maths yes (unit tests); device pitch path yes (browser test) |
| [all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), q8 | about 23 MB | Apache-2.0 | Meaning search, optional | **Kept as opt-in.** A small, widely used sentence-embedding model. Always paired with a built-in idea table that needs no download | Ranking maths yes; model not run here |
| [SmolLM2-135M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct), 4-bit ONNX | about 118 MB | Apache-2.0 | Sentence helper, optional | **Kept as opt-in, behind the watchdog.** It's small enough to run on a phone, but too small to trust alone, so every line it writes is checked and the built-in rules back it up | Not run here. The plan named `onnx-community/SmolLM2-135M-Instruct-ONNX-MHA`; we used the upstream repo ID. **Confirm the ONNX files load** |
| [Whisper tiny](https://huggingface.co/onnx-community/whisper-tiny) | about 150 MB | MIT | Listening (already in the app) | Unchanged | — |
| [distilgpt2](https://huggingface.co/Xenova/distilgpt2) | about 85 MB | Apache-2.0 | Next-word ideas (already in the app) | Unchanged | — |
| [MMS-TTS](https://huggingface.co/facebook/mms-tts) | about 50 MB per language | CC BY-NC 4.0 | Voices for 1,100+ languages (already in the app) | Unchanged. **Non-commercial licence:** fine while LuminAAC is free, a blocker for any paid plan | — |
| wav2vec2 speech-emotion ONNX | about 95 MB | check model card | Feeling estimates (already in the app) | Unchanged. Check the model and dataset licences before commercial use | — |

**Passed over:**
- **Larger instruct models** (1B and up) on the device: too big for the tablets families use. The Ollama option covers families who have a computer that can run them.
- **Cloud-only voices:** they break the "works offline, nothing leaves the device" promise.

## 2. Libraries and services

| What | Licence | Use | Decision |
|---|---|---|---|
| [Transformers.js](https://github.com/huggingface/transformers.js) 3.7.5 | Apache-2.0 | Runs every model above in a Web Worker | Kept, pinned |
| [kokoro-js](https://www.npmjs.com/package/kokoro-js) 1.2.1 | Apache-2.0 | Kokoro voice | Kept, pinned |
| [Ollama](https://github.com/ollama/ollama) | MIT | Optional local sentence helper at `localhost:11434` | Supported, not bundled. Needs `OLLAMA_ORIGINS` set to allow the site |
| OpenAI-compatible chat API (family's own key) | service terms | Optional sentence helper | Supported, off by default, needs a consent tick. Only the message words are sent (`byok.js`) |
| [K-Dense BYOK](https://github.com/marcusdax/k-dense-byok) | check | Pattern for "bring your own key, local first" | **Idea borrowed, no code used.** The local-first order (device, then Ollama, then a key) and the source-fact traceability idea come from it |
| [axe-core](https://github.com/dequelabs/axe-core) 4.10.2 | MPL-2.0 | Accessibility checks while developing | Dev only, not shipped |
| [Playwright](https://playwright.dev) | Apache-2.0 | Browser tests | Dev only |
| fflate (MIT) / `CompressionStream` | MIT / built-in | ZIP for `.obz` | **Neither needed.** `obf-core.js` already writes stored ZIPs and reads them with the browser's `DecompressionStream` |

## 3. Datasets

| Dataset | Licence | Planned use | What happened |
|---|---|---|---|
| [willwade/AACConversations](https://huggingface.co/datasets/willwade/AACConversations) | check | Calibrate the sentence watchdog against real AAC messages | **Not downloaded** (host unreachable). `tests/m3.test.mjs` uses 24 pairs written for the test, in that style: 13 sentences the watchdog must keep and 11 it must reject. **Next step:** run the watchdog over the dataset and look at what it wrongly keeps or drops |

## 4. Clinical ideas, and how the app uses them

These shape how features behave. They aren't claims that the app treats anything. Each feature should be tried with the child's SLP.

| Idea | Source | Where in the app | Notes and limits |
|---|---|---|---|
| **Aided Language Stimulation / partner modeling** | Goossens', Crain and Elder (1992), *Engineering the Preschool Environment for Interactive Symbolic Communication*. Widely recommended in AAC practice | Modeling mode (M2): numbered trail, own log, never counted as the child's | The research supports modeling generally. The *trail* and *silent mode* are our design choices, not tested interventions |
| **Gestalt language processing** | Prizant (1983), *Journal of Speech and Hearing Disorders* 48(3) | Scripts tab (M2) | Recording a phrase keeps its tune ("prosody"), which matters for gestalts |
| **Natural Language Acquisition (NLA) stages 1–6** | Blanc (2012), *Natural Language Acquisition on the Autism Spectrum* | Stage on each script; stage 1 says it whole, stage 2+ splits at " / " | **The NLA evidence base is limited and debated.** We use the stages as a way to organise scripts, not as a measure. The SLP decides |
| **Motor planning / consistent location** | Core principle of LAMP and most core-word systems | Nothing on the board moves: Now row, Scripts tab last, quick phrases added at the end, panels float | Checked by tests that compare tile positions before and after |
| **Modified Fitzgerald Key colours** | Long-standing AAC colour coding | Word-kind colours, contrast-checked in every theme (M1) | Colours are always paired with words |
| **Interoception** (sensing inside the body) | A common difficulty for autistic children, often discussed in OT and SLP practice | Body map (M2) | The parts and feelings are a plain starting set, not a validated pain scale. For pain scoring, ask about a validated scale |
| **Communication functions** (requesting, protesting, commenting, social, asking) | Function categories used in tools like the Communication Matrix (Rowland, Oregon Health & Science University) | Communication report (M3) | **Our rules are not the Communication Matrix** and don't score its levels. The report says "Draft" and every reading can be corrected |
| **MLU** (mean length of utterance) | Brown (1973), *A First Language* | Report (M3) | We count **words**, not morphemes, and say so. Sentences finished by the sentence helper are left out |
| **Core vs fringe vocabulary** | Common AAC framing (core words make up most of everyday speech) | Report (M3) | "Core" is the app's own core board, not a published core list |

## 5. Audit of `masternex-prince-fl.js`

The plan asked for this module to be integrated and audited. **It isn't connected to anything:** only its own test imports it, and neither the app nor the backend uses it. The app's federated learning is `fl-core.js`, which uses secure aggregation. We didn't connect it in M3. Here is why.

| Claim in the file | What the code does | Finding |
|---|---|---|
| "Certified Rényi Differential Privacy accounting" | Reports ε(α) = α / (2σ²) for α = 4, for one release of one update | That is the standard formula for one Gaussian release, but it isn't composed across rounds, isn't turned into an (ε, δ) guarantee and has no sampling amplification. **"Certified" overstates it** |
| Zero-noise test | `compressClientUpdate(delta, 0)` gives ε = **Infinity**, and the test only checks `ε > 0` | **The test passed when there was no privacy at all.** Fixed in M4: it now expects ε = ∞ at σ = 0 and checks the exact value at the default σ = 0.3 |
| Gaussian noise | `Math.random()` with Box–Muller | For differential privacy, noise should come from a cryptographic random source (`crypto.getRandomValues`). Floating-point noise can also leak (Mironov, 2012) |
| "87.5% bandwidth reduction" | Packs two 4-bit values per byte | True against raw 32-bit floats. But the bytes travel as a JSON array of numbers, so the saving on the wire is smaller |
| Byzantine-robust trimmed mean | A per-coordinate trimmed mean on the server | Correct as a method, but **it needs to see each device's update. That defeats `fl-core.js`'s secure aggregation**, where the server only ever sees the sum. You can have one or the other in a round, not both without more machinery |

**Recommendation:** leave it unconnected. If it's ever used:
- switch to cryptographic randomness
- report composed (ε, δ) over all rounds
- choose between secure aggregation and robust aggregation per deployment

## 6. What is still open
1. **Load the two new models on a real device:** MiniLM and SmolLM2, in Chrome on a tablet. Confirm the IDs and file names, then time them.
2. **Calibrate the watchdog** against AACConversations or similar, with an SLP looking at the edge cases.
3. **Try modeling, scripts and the body map with the child's SLP.** Change the stage rules if they don't fit how the child uses scripts.
4. **Have the report's function rules reviewed** by an SLP, using real corrections from the history.
5. **The server half of feature 3** (telemetry sync to the backend) is a privacy decision for the family and hasn't been built.
