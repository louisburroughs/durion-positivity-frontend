# Angular 22 / TypeScript 6.0 Upgrade — Design Spec

**Date:** 2026-08-17  
**Repos affected:** `durion-positivity-frontend`, `durion-positivity-sdk-angular`, `durion-positivity-sdk`

---

## Problem

The frontend and its two SDK sibling repos are on Angular 21 and TypeScript 5.9. Angular 22.1.2 is the
current stable release; it requires TypeScript >=6.0 <6.1. Node 24.9 and npm 11.6 are already current.

## Target Versions

| Package | Current | Target |
|---|---|---|
| Node.js | 24.9.0 | ✅ Already current |
| npm | 11.6.4 | ✅ Already current |
| `@angular/core` (and all `@angular/*`) | ^21.1.0 | ^22.1.2 |
| `@angular/cli` / `@angular/build` / `@angular/ssr` | ^21.1.5 | ^22.1.4 |
| `@angular-eslint/*` | ^21.x | ^22.1.0 |
| `typescript` (frontend + both SDKs) | 5.9.2 / >=5.9<6.0 / ^5.4 | ~6.0.3 |
| `rxjs` | ~7.8.0 | ~7.8.2 |
| `zone.js` | ^0.16.1 | ^0.16.2 |

---

## Approach

Use Angular's official migration tooling (`ng update` schematics) for the frontend upgrade. The SDK
repos are updated manually since they do not use the Angular CLI build system for their own packages.
The frontend's `install-sdk-packages.mjs` auto-detects `../durion-positivity-sdk-angular` and
rebuilds from source, so SDK changes flow into the frontend automatically on `npm install`.

---

## Phase 0 — Establish baseline

Run `npx ng test --no-watch` in the frontend and record which tests pass/fail before any changes.

---

## Phase 1 — Update `durion-positivity-sdk-angular`

**Root `package.json` devDependencies:**
- `@angular/common`: `^21.1.0` → `^22.0.0`
- `@angular/core`: `^21.1.0` → `^22.0.0`
- `typescript`: `>=5.9.0 <6.0.0` → `>=6.0.0 <6.1.0`

**Each sub-package `peerDependencies`** (18 packages under `packages/sdk-*/package.json`):
- `@angular/common`: `^21.0.0` → `^22.0.0`
- `@angular/core`: `^21.0.0` → `^22.0.0`

**Commands:**
```bash
cd ../durion-positivity-sdk-angular
npm install
npm run build
```

---

## Phase 2 — Update `durion-positivity-sdk` (base SDK)

**Root `package.json` devDependencies:**
- `typescript`: `^5.4.0` → `~6.0.3`

No Angular dependencies; update is for consistency with the frontend and SDK Angular repos.
Patch-level updates to `@openapitools`, `@types/*`, `jest`, `ts-jest` where new versions are
available.

**Commands:**
```bash
cd ../durion-positivity-sdk
npm install
npm test
```

If TypeScript 6.0 introduces compilation errors in the generated OpenAPI client code, keep
`typescript` at `^5.9.x` (latest stable 5.x) as a fallback.

---

## Phase 3 — Upgrade frontend via `ng update`

```bash
cd durion-positivity-frontend
npx ng update @angular/core@22 @angular/cli@22   # runs migration schematics
npx ng update @angular-eslint/schematics@22
npm install   # also triggers sdk:install, picking up rebuilt SDK from Phase 1
```

The `ng update` schematics automatically:
- Rewrite deprecated Angular APIs in component and service files
- Update all `@angular/*` package versions in `package.json`
- Set `typescript` to `~6.0.3` in `package.json`

After schematics, manually patch remaining deps:
- `rxjs`: `~7.8.0` → `~7.8.2`
- `zone.js`: `^0.16.1` → `^0.16.2`

---

## Phase 4 — Verify

```bash
npx ng test --no-watch      # must match or exceed baseline
npm run build               # production build must succeed
npx ng lint                 # no new lint errors
```

Fix any migration-introduced issues (e.g., new Angular 22 template strictness, deprecated API
removals that schematics flagged for manual resolution).

---

## Commit Strategy

One commit per repo, in order:
1. `durion-positivity-sdk-angular` — "chore: upgrade to Angular 22 / TypeScript 6.0"
2. `durion-positivity-sdk` — "chore: upgrade TypeScript to 6.0"
3. `durion-positivity-frontend` — "chore: upgrade to Angular 22 / TypeScript 6.0"

---

## Risks & Fallbacks

| Risk | Mitigation |
|---|---|
| `ng update` schematics miss a manual migration item | Check Angular 22 migration guide at update.angular.io |
| TypeScript 6.0 breaks base SDK compilation | Fall back to TypeScript ~5.9.3 in `durion-positivity-sdk` only |
| SDK Angular packages fail to build against Angular 22 | Review Angular 22 release notes for library authoring changes |
| Tests regress after upgrade | Fix failures before committing; do not ship a broken baseline |
