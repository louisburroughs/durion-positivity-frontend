# AGENTS.md — Durion Positivity Frontend

## Quick Start

```bash
npm install
npm start
npm run build
npm test
```

## Critical Rules

- Use Angular Signals and `ApiBaseService` as the default frontend patterns.
- Follow the ADRs in `../durion/docs/adr/` before changing UI behavior or contracts.
- Keep translations in the locale files; no hard-coded user-facing strings.
- Prefer `routerLink` for in-app navigation and `takeUntilDestroyed`/`onCleanup` for reactive cleanup.
- Keep page state explicit and typed (`idle`, `loading`, `ready`, `error`).

## Where to Look

- Shared workspace docs: `../durion/AGENTS.md`
- Shared agent config: `.durion-shared/`
- Domain and architecture knowledge: `../durion/knowledge-catalog/`
- Frontend ADRs: `../durion/docs/adr/`
