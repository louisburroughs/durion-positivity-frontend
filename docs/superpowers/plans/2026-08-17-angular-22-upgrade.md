# Angular 22 / TypeScript 6.0 Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `durion-positivity-sdk`, `durion-positivity-sdk-angular`, and `durion-positivity-frontend` from Angular 21 / TypeScript 5.9 to Angular 22 / TypeScript 6.0.

**Architecture:** The SDK Angular repo (`../durion-positivity-sdk-angular`) is auto-detected by the frontend's `scripts/sdk/install-sdk-packages.mjs`, which builds and installs it on `npm install`. Update the two SDK repos first, then use `ng update` schematics to upgrade the frontend, then run `npm install` to pull in the freshly-rebuilt SDK packages.

**Tech Stack:** Angular 22, TypeScript 6.0.3, `ng update` migration schematics, `jest-preset-angular` 17, npm workspaces.

---

## Version Targets

| Package | From | To |
|---|---|---|
| `@angular/*` (all packages) | ^21.1.x | ^22.1.x |
| `@angular-eslint/*` | ^21.x | ^22.1.0 |
| `typescript` (all repos) | 5.9.x / >=5.9<6.0 / ^5.4 | ~6.0.3 |
| `jest-preset-angular` | ^16.1.4 | ^17.0.0 |
| `rxjs` | ~7.8.0 | ~7.8.2 |
| `zone.js` | ^0.16.1 | ^0.16.2 |

---

## Files Changed

### `durion-positivity-sdk-angular/`
- Modify: `package.json` (devDependencies: angular, typescript, jest-preset-angular)
- Modify: `packages/sdk-transport/package.json` (peerDeps: `@angular/common`, `@angular/core`)
- Modify: `packages/sdk-accounting/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-bulk-loader/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-catalog/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-customer/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-documents/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-event-receiver/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-image/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-inquiry/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-internal/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-inventory/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-invoice/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-location/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-marketing/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-order/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-people/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-people-contact/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-price/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-security/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-shop-manager/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-supplier/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-vehicle-fitment/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-vehicle-inventory/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-warranty/package.json` (peerDeps: `@angular/core`)
- Modify: `packages/sdk-workorder/package.json` (peerDeps: `@angular/core`)

### `durion-positivity-sdk/`
- Modify: `package.json` (devDependencies: typescript)

### `durion-positivity-frontend/`
- Modified by `ng update` schematics (any file; schematics decide)
- Modify: `package.json` (rxjs, zone.js after schematics)

---

## Task 1: Establish Baseline

**Files:** none modified

- [ ] **Step 1: Run the existing test suite**

```bash
cd ~/IdeaProjects/durion-positivity-frontend
npx ng test --no-watch 2>&1 | tail -20
```

Expected: note total pass/fail counts. Record them — this is your baseline. The upgrade must not regress passing tests.

- [ ] **Step 2: Confirm the production build passes**

```bash
npm run build 2>&1 | tail -10
```

Expected: build succeeds with no errors (warnings are OK).

---

## Task 2: Update `durion-positivity-sdk-angular` Root Package

**Files:**
- Modify: `~/IdeaProjects/durion-positivity-sdk-angular/package.json`

- [ ] **Step 1: Update root devDependencies**

Edit `~/IdeaProjects/durion-positivity-sdk-angular/package.json`. Change:

```json
"devDependencies": {
  "@angular/common": "^22.0.0",
  "@angular/core": "^22.0.0",
  "@openapitools/openapi-generator-cli": "^2.30.0",
  "@types/jest": "^30.0.0",
  "@types/node": "^22.0.0",
  "@typescript-eslint/eslint-plugin": "^7.0.0",
  "@typescript-eslint/parser": "^7.0.0",
  "eslint": "^8.57.0",
  "jest": "^30.3.0",
  "jest-preset-angular": "^17.0.0",
  "rxjs": "^7.8.0",
  "ts-jest": "^29.4.9",
  "typescript": ">=6.0.0 <6.1.0"
}
```

---

## Task 3: Update Sub-Package peerDependencies in `durion-positivity-sdk-angular`

**Files:** All 25 `packages/sdk-*/package.json` files

The pattern is the same for every package. Do them in one pass.

- [ ] **Step 1: Update `packages/sdk-transport/package.json`**

This package has both `@angular/common` and `@angular/core`:

```json
"peerDependencies": {
  "@angular/common": "^22.0.0",
  "@angular/core": "^22.0.0",
  "rxjs": "^7.4.0"
}
```

- [ ] **Step 2: Update all remaining 24 sub-packages**

Each of the following packages has `peerDependencies` with `"@angular/core": "^21.0.0"`. Change to `"^22.0.0"` in each:

- `packages/sdk-accounting/package.json`
- `packages/sdk-bulk-loader/package.json`
- `packages/sdk-catalog/package.json`
- `packages/sdk-customer/package.json`
- `packages/sdk-documents/package.json`
- `packages/sdk-event-receiver/package.json`
- `packages/sdk-image/package.json`
- `packages/sdk-inquiry/package.json`
- `packages/sdk-internal/package.json`
- `packages/sdk-inventory/package.json`
- `packages/sdk-invoice/package.json`
- `packages/sdk-location/package.json`
- `packages/sdk-marketing/package.json`
- `packages/sdk-order/package.json`
- `packages/sdk-people/package.json`
- `packages/sdk-people-contact/package.json`
- `packages/sdk-price/package.json`
- `packages/sdk-security/package.json`
- `packages/sdk-shop-manager/package.json`
- `packages/sdk-supplier/package.json`
- `packages/sdk-vehicle-fitment/package.json`
- `packages/sdk-vehicle-inventory/package.json`
- `packages/sdk-warranty/package.json`
- `packages/sdk-workorder/package.json`

Each file's peerDependencies block after the change (example shown for accounting; all others are identical in structure):

```json
"peerDependencies": {
  "@angular/core": "^22.0.0",
  "@durion-sdk/transport": "*",
  "rxjs": "^7.4.0"
}
```

---

## Task 4: Install, Build, and Commit `durion-positivity-sdk-angular`

**Files:** `node_modules/` (not committed), `package-lock.json`

- [ ] **Step 1: Install dependencies**

```bash
cd ~/IdeaProjects/durion-positivity-sdk-angular
npm install
```

Expected: installs Angular 22 and TypeScript 6.0.3. No peer dependency conflicts.

- [ ] **Step 2: Build all packages**

```bash
npm run build
```

Expected: all 25 packages compile successfully under TypeScript 6.0.3. If any TypeScript errors appear, fix them before proceeding.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json packages/sdk-*/package.json
git commit -m "chore: upgrade to Angular 22 / TypeScript 6.0

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Update `durion-positivity-sdk` (Base SDK)

**Files:**
- Modify: `~/IdeaProjects/durion-positivity-sdk/package.json`

- [ ] **Step 1: Update TypeScript version**

Edit `~/IdeaProjects/durion-positivity-sdk/package.json`. Change the `devDependencies` `typescript` entry:

```json
"devDependencies": {
  "@openapitools/openapi-generator-cli": "^2.31.1",
  "@types/jest": "^29.5.0",
  "@types/node": "^22.0.0",
  "@typescript-eslint/eslint-plugin": "^7.0.0",
  "@typescript-eslint/parser": "^7.0.0",
  "eslint": "^8.57.0",
  "jest": "^29.7.0",
  "ts-jest": "^29.2.0",
  "typescript": "~6.0.3"
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd ~/IdeaProjects/durion-positivity-sdk
npm install
```

Expected: TypeScript 6.0.3 installs. No errors.

- [ ] **Step 3: Verify tests still pass**

```bash
npm test 2>&1 | tail -20
```

Expected: same pass/fail as before. If TypeScript 6.0 causes type errors in generated API client code, fall back: set `typescript` to `~5.9.3` instead and re-run `npm install`. If falling back, note it in the commit message.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade TypeScript to 6.0

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Run `ng update` to Upgrade the Frontend

**Files:** Modified by schematics (anything under `src/`, `package.json`, `tsconfig.json`, `angular.json`)

- [ ] **Step 1: Run Angular core + CLI update schematics**

```bash
cd ~/IdeaProjects/durion-positivity-frontend
npx ng update @angular/core@22 @angular/cli@22 --force
```

Expected: schematics run, files are rewritten. TypeScript is bumped to `~6.0.3`. A summary lists any manual migration items. Review the summary and address any flagged items before continuing.

- [ ] **Step 2: Run Angular ESLint update schematics**

```bash
npx ng update @angular-eslint/schematics@22
```

Expected: `@angular-eslint/*` packages are bumped to `^22.1.0`. Any deprecated rule names are migrated automatically.

- [ ] **Step 3: Patch rxjs and zone.js**

```bash
npm install rxjs@~7.8.2 zone.js@^0.16.2
```

Expected: `package.json` reflects the new versions; no peer-dep errors.

- [ ] **Step 4: Reinstall to pull in rebuilt SDK packages**

```bash
npm install
```

Expected: `install-sdk-packages.mjs` detects `../durion-positivity-sdk-angular`, fingerprints the rebuilt dist, and installs the updated SDK packages. Log lines begin with `[sdk-install]`.

---

## Task 7: Verify and Commit the Frontend

**Files:** none new (committing schematics output + package changes from Task 6)

- [ ] **Step 1: Run the test suite**

```bash
npx ng test --no-watch 2>&1 | tail -30
```

Expected: same or better pass count vs. Task 1 baseline. If tests fail, read the full error output and fix before committing. Do not commit a red suite.

- [ ] **Step 2: Run the production build**

```bash
npm run build 2>&1 | tail -10
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Run the linter**

```bash
npx ng lint 2>&1 | tail -20
```

Expected: no errors. Warnings are acceptable. If new errors appear from changed Angular/ESLint rules, fix them now.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: upgrade to Angular 22 / TypeScript 6.0

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
