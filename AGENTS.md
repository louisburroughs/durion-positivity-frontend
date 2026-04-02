# AGENTS.md — Durion Positivity Frontend

This file is the project-level agent/copilot guide for `durion-positivity-frontend`.
For cross-repo guidance, see `durion/AGENTS.md`. For ADRs, see `durion/docs/adr/`.

---

## Quick Reference

| Command | Purpose |
|-------------|---------|
| `npm install` | Install dependencies |
| `npm start` | Dev server → <http://localhost:4200> |
| `npm run build` | Production build → `dist/` |
| `npm test` | Full Vitest test suite (watch mode) |
| `npx ng test --no-watch` | CI test run (single pass) |
| `npx ng test --include="src/app/features/<domain>/**/*.spec.ts" --no-watch` | Run single domain suite |

## Architecture

- **Angular 21**, standalone components, no NgModules
- **Angular Signals** for reactive state (`signal`, `computed`, `effect`)
- **`ApiBaseService`** — only ever use this for HTTP; never inject `HttpClient` directly in features
- **`takeUntilDestroyed(this.destroyRef)`** — for subscriptions outside `effect()` bodies
- **`onCleanup(() => sub.unsubscribe())`** — for subscriptions inside `effect()` bodies (see ADR-0033)
- **`TranslatePipe`** (`| translate`) — for all user-facing strings (see ADR-0030)

## Mandatory ADRs for Frontend Work

Always read applicable ADRs before coding. Frontend-specific ADRs:

| ADR | Title | Applies To |
|-----|-------|-----------|
| [ADR-0010](../durion/docs/adr/0010-frontend-domain-responsibilities-guide.adr.md) | Frontend Domain Responsibilities | All frontend work |
| [ADR-0029](../durion/docs/adr/0029-frontend-accessibility-baseline-policy.adr.md) | Frontend Accessibility Baseline | All UI components |
| [ADR-0030](../durion/docs/adr/0030-frontend-internationalization-localization-policy.adr.md) | Frontend i18n/l10n Policy | All UI strings |
| [ADR-0031](../durion/docs/adr/0031-frontend-mutation-error-state-convention.adr.md) | Mutation Error State Convention | Any component with mutations |
| [ADR-0032](../durion/docs/adr/0032-frontend-test-fixture-interface-conformity.adr.md) | Test Fixture Interface Conformity | All spec files |
| [ADR-0033](../durion/docs/adr/0033-angular-effect-observable-cancellation-policy.adr.md) | Effect Observable Cancellation | Components using `effect()` |
| [ADR-0034](../durion/docs/adr/0034-frontend-server-generated-field-omission-policy.adr.md) | Server-Generated Field Omission | Domain models + API payloads |
| [ADR-0035](../durion/docs/adr/0035-frontend-service-method-minimum-test-coverage.adr.md) | Service Method Minimum Test Coverage | All `*service.ts` files |
| [ADR-0037](../durion/docs/adr/0037-frontend-spa-navigation-policy.adr.md) | SPA Navigation Policy | All components with in-app links |
| [ADR-0038](../durion/docs/adr/0038-frontend-date-only-string-handling-policy.adr.md) | Date-Only String Handling | Any component displaying/validating dates |

---

## PR Checklist

Before submitting or approving a frontend PR, verify **all** items below:

### Error Handling (ADR-0031)

- [ ] Every `subscribe({ error })` block that sets `errorKey` calls `this.state.set('error')` **first**
- [ ] Every error-path test asserts **both** `state() === 'error'` and the correct `errorKey()` value

### Test Fixture Conformity (ADR-0032)

- [ ] All test fixture constants are explicitly typed as the exact domain interface (no `any`, no untyped object literals)
- [ ] Mock return values match the mocked method's return type
- [ ] Every public service method introduced in this PR has ≥1 test in `*.service.spec.ts`

### Effect Subscription Cleanup (ADR-0033)

- [ ] Every `effect()` body that calls `.subscribe()` registers `onCleanup(() => sub.unsubscribe())`
- [ ] `takeUntilDestroyed` is **not** used inside `effect()` bodies as a substitute for `onCleanup`

### Server-Generated Fields (ADR-0034)

- [ ] Server-generated fields (`requestedAt`, `approvedAt`, `createdAt`, `updatedAt`, etc.) are `readonly?` in model interfaces
- [ ] Create/update request payloads do **not** include server-generated fields (not even as empty strings)
- [ ] Angular templates do **not** use `new Date()` or other `new` expressions in event bindings

### Accessibility (ADR-0029)

- [ ] All interactive form inputs have an associated `<label>` (visible or `sr-only`)
- [ ] Aria labels and roles are present on custom interactive elements
- [ ] Keyboard flow is functional for all new/modified workflows
- [ ] Error messages are announced via `role="alert"` or `aria-live`

### Internationalization (ADR-0030)

- [ ] All user-facing strings use `| translate` pipe — no hard-coded copy in templates or components
- [ ] New translation keys are added to all 4 locale files: `en-US.json`, `es-US.json`, `fr-CA.json`, `qps-ploc.json`

### SPA Navigation (ADR-0037)

- [ ] Every in-app navigation link uses `routerLink` (NOT bare `href`)
- [ ] `RouterLink` is present in the component's `imports` array when `routerLink` is used in the template
- [ ] Retry/reload/action controls are `<button type="button">`, not `<a>` elements
- [ ] Bare `href` is only used for external URLs (`http://`, `https://`, `mailto:`, `tel:`, file downloads)

### Date-Only String Handling (ADR-0038)

- [ ] No `new Date(YYYY-MM-DD)` for local-date semantics — use `new Date(y, m-1, d)` after splitting on `-`
- [ ] Angular `DatePipe` is NOT applied directly to raw `YYYY-MM-DD` strings — append `T00:00:00` or pre-convert in component
- [ ] "Today" boundary tests construct today's date using local-time getters (`getFullYear()`/`getMonth()+1`/`getDate()`), NOT `toISOString().slice(0,10)`

---

## Coding Patterns

### Component Page State Machine

All feature page components use a two-signal state pattern:

```typescript
readonly state = signal<'idle' | 'loading' | 'empty' | 'ready' | 'error'>('idle');
readonly errorKey = signal<string | null>(null);
```

**Rule:** `state.set('error')` must precede `errorKey.set(...)` in every error handler.

### Reactive Data Loading in `effect()`

```typescript
constructor() {
  effect((onCleanup) => {
    const id = this.selectedId();   // signal read → reactive dependency
    if (!id) return;

    this.state.set('loading');
    this.errorKey.set(null);

    const sub: Subscription = forkJoin({
      a: this.service.getA(id),
      b: this.service.getB(id),
    }).subscribe({
      next: result => { this.a.set(result.a); this.b.set(result.b); this.state.set('ready'); },
      error: () => { this.state.set('error'); this.errorKey.set('DOMAIN.ERROR.LOAD'); },
    });

    onCleanup(() => sub.unsubscribe());  // cancel inflight on re-run
  }, { allowSignalWrites: true });
}
```

### Mutation Observable (outside `effect()`)

```typescript
doMutation(payload: Partial<SomeModel>): void {
  this.service
    .update(payload)
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: result => { this.data.set(result); },
      error: () => {
        this.state.set('error');                      // always first
        this.errorKey.set('DOMAIN.ERROR.UPDATE');     // always second
      },
    });
}
```

### Typed Test Fixtures

```typescript
// spec file — always use explicit interface type
const sampleModel: MyModel = {
  id: 'test-id',
  fieldOne: 'value',
  // ... all required fields
};

mockService.getModel.mockReturnValue(of(sampleModel));
```

### Service HTTP Methods

```typescript
// Correct — GET with no server-generated fields in body
getAllItems(): Observable<Item[]> {
  return this.api.get<Item[]>('/domain/v1/items');
}

// Correct — POST omitting server-generated fields
createItem(item: Partial<Item>): Observable<Item> {
  const { id, createdAt, updatedAt, ...payload } = item as Item;
  return this.api.post<Item>('/domain/v1/items', payload);
}
```

---

## File Structure Conventions

```text
src/app/features/<domain>/
  <domain>.routes.ts          # lazy-loaded route definitions
  models/                     # TypeScript interfaces only — no logic
  services/                   # ApiBaseService wrappers
    <name>.service.ts
    <name>.service.spec.ts    # co-located spec file (required)
  pages/                      # routed page components
    <page>/
      <page>.component.ts
      <page>.component.html
      <page>.component.css
      <page>.component.spec.ts
  components/                 # shared within-domain sub-components (optional)
```

---

## Common Mistakes to Avoid

| Mistake | Correct Pattern | ADR |
|---------|----------------|-----|
| `error: () => this.errorKey.set(...)` without `state.set('error')` | Always set state first | ADR-0031 |
| `const fixture = { field: value }` (untyped) | `const fixture: MyModel = { ... }` | ADR-0032 |
| `effect(() => { sub = service.load().subscribe(...) })` without cleanup | `onCleanup(() => sub.unsubscribe())` | ADR-0033 |
| `requestedAt: ''` in POST body | Omit server-generated fields | ADR-0034 |
| New service method with no spec | Add ≥1 test asserting verb + URL | ADR-0035 |
| `<input>` without `<label>` | Add `sr-only` label with `for=`/`id=` | ADR-0029 |
| Hard-coded UI string in template | `{{ 'KEY' \| translate }}` | ADR-0030 |
| `new Date()` in template binding | Compute in component method | ADR-0034 |
| `import { HttpClient }` in feature service | `inject(ApiBaseService)` | ADR-0010 |
| `<a href="/app/...">` for in-app navigation | `<a routerLink="/app/...">` + `RouterLink` in imports | ADR-0037 |
| `<a href="...">Retry</a>` for action/retry | `<button type="button" (click)="reload()">Retry</button>` | ADR-0037 |
| `new Date(YYYY-MM-DD)` for local-date validation | `const [y,m,d]=s.split('-').map(Number); new Date(y,m-1,d)` | ADR-0038 |
| `{{ item.date \| date: 'mediumDate' }}` on YYYY-MM-DD string | `{{ (item.date + 'T00:00:00') \| date: 'mediumDate' }}` | ADR-0038 |
| `toISOString().slice(0,10)` for today in tests | `getFullYear()/getMonth()+1/getDate()` local getters | ADR-0038 |
