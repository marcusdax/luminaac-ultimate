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

- **Access methods (Bridge → Vocabulary → How My Voice responds):** dwell selection (hold a pointer over a button; a progress bar fills, adjustable time), one-switch auto-scanning (highlight moves at a set speed; Space or Enter selects, so any key-emitting switch works), board size up to 300% zoom, and Large / Playful / Focus modes. Safety buttons can be hidden.
- **Story player:** native `<dialog>`, big Back / Say it again / Next buttons, nothing advances on a timer.

## Phase 3
- **Safe zones.** The map is never the only way in. Every zone can be added with labelled latitude, longitude and size fields, and "Use where I am now". The size slider has a visible value (`<output>`). Zone circles carry permanent text labels. The map region has an `aria-label` that points to the form.
- **Consent.** Consent is a native `<dialog>` with plain-language bullets and a required checkbox. Choosing "Not now" closes it without changing anything.
- **Pairing code.** The code is shown large in tabular digits. It has an `aria-label` that spells out each digit. The countdown is updated as text, not colour. The QR code has a text alternative, and the 6-digit code can always be typed.
- **Feeling estimates.** These appear in an `aria-live` region. They always say "Estimate" with a percentage and a source, and never rely on colour. Yes, No and "Actually…" are real buttons and a select, with `aria-pressed`.
- **Motion.** Only three animations exist: an alert arriving, a confirm pop and a card fade. Each is skipped when `prefers-reduced-motion` is set or My Voice "Keep the screen still" is on.
- **Status messages.** Accounts, passkeys and federated learning report through `role="status"`. Every new target is at least 44×44 px, except `.btn.small` list actions, which are 36 px high with spacing (meets the 2.5.8 24 px minimum).
- **OpenMoji fallback.** Fallback pictures are decorative (`alt=""`). The word label is always visible text.

## Known gaps
- Eye-gaze not built (eye trackers that drive the pointer work with dwell); two-switch step scanning not built.
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

## v0.13 audit
- An automated sweep of all 12 Bridge pages and every My Voice view, in both layouts, at 1440×960 and 390×844, found no control under 24×24 px, no control without an accessible name, no ALL-CAPS text and no sideways scrolling, with motion reduced.
- The simpler layout is now the default, so the child's screen has no Bridge link: the only ways out are Calm and the press-and-hold Caregiver door.
- The older layout's Bridge header no longer wraps into three-line buttons on a phone, and the tab strip keeps the open tab in view.
