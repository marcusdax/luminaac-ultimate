# Contributing to LuminAAC

Thank you for helping children be heard. Contributions of every kind are welcome: code, testing with real assistive technology, symbol sets, translations, and feedback from AAC users, families, speech-language pathologists and teachers.

## Ground rules

- Be kind. Everyone here follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Never put real children's data, recordings, photos or names in an issue, pull request or test fixture.
- Report security or privacy problems privately to the maintainer rather than in a public issue.

## Getting set up

There's no build step.

```bash
python3 -m http.server 8080          # front end on http://localhost:8080
cd backend && node server.js         # optional backend on :3001 (Node 18+)
cd backend && node test.mjs          # backend tests
```

## How we work

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Fork, then branch from `main` (`fix/…`, `feat/…`, `docs/…`).
3. Keep pull requests small and focused, and describe what you tested.
4. Run `node backend/test.mjs` and check both apps in a browser, including keyboard-only and a screen reader where you can.

## Code style

- Vanilla HTML, CSS and JavaScript ES modules. Please don't add a framework or a build step.
- The backend has zero npm dependencies. Keep it that way unless we've agreed otherwise in an issue.
- Use the design tokens in `tokens.css`; don't hard-code colours.
- Vendor third-party code in `vendor/` with its licence, and add it to `THIRD-PARTY.md`. Check that the licence is compatible (see the licence conflicts section there).

## Accessibility and writing

Every change must meet WCAG 2.2 AA:

- visible focus, 44 px minimum targets, labels for screen readers, and 4.5:1 text contrast
- respect `prefers-reduced-motion`
- never move a learned button on the My Voice board

Write in plain, warm language and sentence case. Don't use all-caps labels.

## Privacy by default

New data collection must be opt-in, stay on the device unless the caregiver turns on sync, be covered by export and delete-all, and be described in `PRIVACY.md`. Anything a model infers about a child is an estimate until a caregiver confirms it.

## Licence

By contributing, you agree that your contribution is licensed under the MIT License in [LICENSE](LICENSE).
