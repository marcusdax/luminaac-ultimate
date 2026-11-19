# Accessibility (target: WCAG 2.2 AA)

## What's in place
- **Contrast:** all text tokens ≥ 4.5:1; bright brand colors (sky #64b5f6, ember #ff9800) are used decoratively only, with "deep" variants for text. A high-contrast theme exists in My Voice.
- **Targets:** AAC tiles ≥ 104px, controls ≥ 48–56px (WCAG 2.5.8 asks for 24px).
- **Keyboard:** every action is a native button, link, or form control. Visible 4px lumen focus ring. Skip links on both pages. Dialogs use native `<dialog>` (focus contained, Esc closes). Space bar captures a moment while listening.
- **Screen readers:** landmarks, labelled sections, `aria-current` on navigation, live regions for the message strip and toasts. Timeline items have full text labels; charts have text alternatives (hidden table / aria-label). Confidence shows the number, not only a ring.
- **Motion:** suggestion glow and capture "breathing" stop under `prefers-reduced-motion` and the in-app "keep the screen still" setting.
- **Cognitive load:** sentence-case plain language, one primary action per area, nothing timed, no autoplaying media.
- **Language:** Atkinson Hyperlegible Next font for low vision; Fitzgerald Key word colors are always paired with labels.
- **Responsive:** tested at 390px and 1440px; reflows without horizontal scrolling (timeline scrolls in its own region).

- **Access methods (Bridge → Vocabulary → How My Voice responds):** dwell selection (hold a pointer over a button; a progress bar fills, adjustable time), WCAG 2.5.2 pointer cancellation (`pointerup` inside target bounds), acceptance hold delay (`acceptMs`), post-tap tremor debounce (`debounceMs`), one-switch linear and row-column auto-scanning (`scanMode: "linear" | "row-column"`), two-switch step scanning (`scanMode: "step2"` / `"two-switch"` with Tab to step and Space/Enter to activate), non-interrupting auditory scan preview (`scanAudio`), configurable scan loop limit (`scanLoops`), CSS custom-property board scaling (`--board-scale` up to 300% without layout-breaking CSS `zoom`), and Day, Night, High-Contrast (`contrast`, >= 7:1 AAA), and Low-Arousal (`low-arousal`, W3C COGA calm muted) themes. Safety buttons can be hidden.
- **Story player:** native `<dialog>`, big Back / Say it again / Next buttons, nothing advances on a timer.

## Known gaps
- Native hardware eye-gaze SDK integration not built (eye trackers that drive the system pointer work with dwell and pointer cancellation).
- Recorded moments have no captions; caregivers' annotation text acts as a description.
- ARASAAC pictograms load when online; words with no ARASAAC match now use local OpenMoji pictures, but a few emoji still depend on platform fonts in non-tile places.
- Leaflet's map itself is only partly keyboard-operable (pan/zoom yes, placing a zone no) — the form is the accessible path.
- The QR scanner needs a camera; typing the code is the alternative.
- Full manual audit with NVDA/VoiceOver still to do.

## Phase 4
- Download progress uses native `<progress>` with labels. Status text sits in `role="status"` regions, so screen readers hear the percentage and the result.
- The reset-password dialog is a native `<dialog>`: focus moves into it and Escape closes it. The help text is linked with `aria-describedby`.
- The camera preview has a label, and the face result is announced. No-camera and permission-denied cases explain what to do next in plain language.
- Natural voices sit beside device voices, and failures fall back to speech without leaving the user silent.
- Tested at 1440×960 and 390×844.
