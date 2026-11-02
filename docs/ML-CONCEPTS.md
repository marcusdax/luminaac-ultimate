# On-device listening and watching: concepts, not features (yet)

None of this ships turned on. Each idea would sit behind a flag in The Bridge, run only on the device, and never upload audio or video.

## 1. Sound tags (YAMNet, Apache-2.0)
- **What**: label short sounds such as voice, laughter, crying or a door, and add them as cues to a moment.
- **How**: a TF.js YAMNet model (about 4 MB) runs on 1-second windows only while Sound Path or a moment recorder is open.
- **Flag**: `soundTags`, off by default.
- **Risk**: false "crying" tags could worry families, so tags are shown only as suggestions.

## 2. The child's own signs (MediaPipe hands, Apache-2.0)
- **What**: a caregiver records 5–10 examples of a gesture the child uses, and the app learns to spot it.
- **How**: the MediaPipe Hand Landmarker gives 21 points per hand, and a k-nearest-neighbour classifier (tfjs-models knn-classifier) learns from the examples.
- **Flag**: `signs`, off by default. The camera is used only while the screen is open, and only the examples' landmark numbers are kept, never images.

## 3. Few-shot classifier for moments
- **What**: use the agreed labels from the agreement check ([VALIDATION-STUDY.md](VALIDATION-STUDY.md)) to personalise guesses.
- **Gate**: only after caregiver kappa reaches at least 0.6 for the family, because otherwise the labels are too noisy to learn from.

## Why not now
- Each model adds megabytes and battery cost.
- There's no validation data yet, and the agreement study comes first.
- Camera and microphone use needs clear consent screens in the native app.
