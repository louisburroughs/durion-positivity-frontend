# Suggested commands

## Setup and local development
- `mise install` — install the pinned Node toolchain.
- `npm install` — install dependencies and run postinstall SDK sync if available.
- `npm start` — run the Angular dev server on http://localhost:4200.
- `npm run watch` — development build in watch mode.

## Build and runtime
- `npm run build` — production build into `dist/`.
- `npm run serve:ssr:durion-positivity-frontend` — run the SSR production server locally on port 4000.

## Tests and checks
- `npm test` — Angular/Vitest test runner in watch mode.
- `npx ng test --no-watch` — single-pass CI-style unit tests.
- `npx ng test --include="src/app/features/<domain>/**/*.spec.ts" --no-watch` — run one feature/domain test slice.
- `npx ng lint` — lint before committing.
- `npm run i18n:check` — run missing-key and pseudo-locale checks.
- `npm run a11y:smoke` — accessibility smoke suite.
- `npm run a11y:smoke:strict` — stricter accessibility smoke suite.

## Useful Linux utilities
- `git status`, `git diff --no-pager`
- `ls`, `find`, `rg`, `grep`, `sed`, `awk`
