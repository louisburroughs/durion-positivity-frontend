# Customer Directory Browse Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Customer Directory use the SDK-backed browse endpoint for empty or whitespace-only queries while preserving the existing search experience for non-empty queries.

**Architecture:** Keep the browse-vs-search decision in `CustomerListComponent.search(q)` using `q.trim()` as the only branch point. Add a new `CrmService.browseParties()` wrapper that calls `CRMAccountsService.browseParties(pageable: Pageable)` with an empty `Pageable` object so the backend applies default browse paging and sorting. Map the browse response into the same `{ parties }` shape already used by the component so the rendering path, empty state, and error handling remain unified.

**Tech Stack:** Angular 21 standalone components, TypeScript, RxJS, Vitest via `npx ng test`, generated `@durion-sdk/customer` SDK

---

## Preconditions

Before starting Task 1, refresh the local SDK and sync it into the frontend worktree.

Run:

```bash
(cd /home/louis-burroughs/IdeaProjects/durion-positivity-sdk-angular && npm run generate && npm run build) && \
(cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse && npm run sdk:install)
rg "browseParties" /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse/node_modules/@durion-sdk/customer/types/durion-sdk-customer.d.ts
```

Expected:

- SDK generate/build completes successfully
- `npm run sdk:install` refreshes the frontend worktree package
- `rg` prints the `browseParties(pageable: Pageable)` signature from the installed SDK types

If `rg` returns no matches, stop and fix the SDK refresh before changing frontend code.

### Task 1: Add the CRM service browse wrapper

**Files:**
- Modify: `src/app/features/crm/services/crm.service.spec.ts`
- Modify: `src/app/features/crm/services/crm.service.ts`
- Test: `src/app/features/crm/services/crm.service.spec.ts`

- [ ] **Step 1: Write the failing service tests**

Add the SDK `Pageable` type, a typed party fixture, and the new browse stub in `src/app/features/crm/services/crm.service.spec.ts`:

```ts
import type { Pageable } from '@durion-sdk/customer';
import type { BillingRules, CrmSnapshot, PartyDetail } from '../models/crm.models';

const browseParty: PartyDetail = {
  partyId: 'party-101',
  legalName: 'Acme Fleet',
  contacts: [],
  vehicles: [],
};

const crmAccountsStub = {
  browseParties: vi.fn(),
  upsertBillingRules: vi.fn(),
  searchParties: vi.fn(),
};
```

Then add the failing browse/search coverage near the existing `searchParties()` tests:

```ts
describe('browseParties()', () => {
  it('calls crmAccounts.browseParties with default pageable and maps results into parties', () => {
    crmAccountsStub.browseParties.mockReturnValueOnce(
      of({ results: [browseParty], totalCount: 1, pageNumber: 0, pageSize: 20 }),
    );

    let result: { parties: PartyDetail[] } | undefined;
    service.browseParties().subscribe(value => {
      result = value;
    });

    const expectedPageable: Pageable = {};

    expect(crmAccountsStub.browseParties).toHaveBeenCalledWith(expectedPageable);
    expect(result).toEqual({ parties: [browseParty] });
  });
});

describe('searchParties()', () => {
  it('sends trimmed name criteria for non-empty query', () => {
    crmAccountsStub.searchParties.mockReturnValueOnce(of({ results: [browseParty] }));

    service.searchParties('  acme  ').subscribe();

    expect(crmAccountsStub.searchParties).toHaveBeenCalledWith({ name: 'acme' });
  });
});
```

- [ ] **Step 2: Run the service spec to verify it fails**

Run:

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse
npx ng test --include="src/app/features/crm/services/crm.service.spec.ts" --no-watch
```

Expected: FAIL because `CrmService.browseParties()` does not yet call the SDK with the required `Pageable` argument.

- [ ] **Step 3: Write the minimal service implementation**

Update the SDK type imports in `src/app/features/crm/services/crm.service.ts` to include `Pageable`:

```ts
import type {
  CreateCommercialAccountRequest as SdkCreateCommercialAccountRequest,
  MergePartiesRequest as SdkMergePartiesRequest,
  Pageable as SdkPageable,
  SearchPartiesRequest as SdkSearchPartiesRequest,
  CreatePersonRequest as SdkCreatePersonRequest,
  CreatePartyRelationshipRequest as SdkCreatePartyRelationshipRequest,
  UpdateContactRolesRequest as SdkUpdateContactRolesRequest,
  UpsertCommunicationPreferencesRequest as SdkUpsertCommunicationPreferencesRequest,
  UpsertBillingRulesRequest,
  CreateVehicleForPartyRequest as SdkCreateVehicleForPartyRequest,
} from '@durion-sdk/customer';
```

Then replace the temporary browse wrapper with the SDK-backed version:

```ts
browseParties(): Observable<{ parties: PartyDetail[] }> {
  const sdkPageable: SdkPageable = {};

  return this.accountsApi.browseParties(sdkPageable).pipe(
    map(response => ({ parties: (response.results ?? []) as PartyDetail[] })),
  );
}
```

Keep `searchParties()` search-only so it never handles the empty-query browse case:

```ts
searchParties(query: string): Observable<{ parties: PartyDetail[] }> {
  const normalizedQuery = query.trim();
  const sdkRequest: SdkSearchPartiesRequest = { name: normalizedQuery };

  return this.accountsApi.searchParties(sdkRequest).pipe(
    map(response => ({ parties: (response.results ?? []) as PartyDetail[] })),
  );
}
```

- [ ] **Step 4: Run the service spec to verify it passes**

Run:

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse
npx ng test --include="src/app/features/crm/services/crm.service.spec.ts" --no-watch
```

Expected: PASS with the browse wrapper calling `browseParties({})` and the search path remaining trimmed and search-only.

- [ ] **Step 5: Commit the service-layer change**

Run:

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse
git add src/app/features/crm/services/crm.service.ts src/app/features/crm/services/crm.service.spec.ts
git commit -m "feat(crm): add browse parties service wrapper" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Route Customer Directory between browse and search modes

**Files:**
- Modify: `src/app/features/crm/pages/customer-list/customer-list.component.spec.ts`
- Modify: `src/app/features/crm/pages/customer-list/customer-list.component.ts`
- Test: `src/app/features/crm/pages/customer-list/customer-list.component.spec.ts`

- [ ] **Step 1: Write the failing component tests**

Update the service stub in `src/app/features/crm/pages/customer-list/customer-list.component.spec.ts`:

```ts
const crmServiceStub = {
  browseParties: vi.fn(),
  searchParties: vi.fn(),
};
```

Set the default browse response in `beforeEach`:

```ts
crmServiceStub.browseParties.mockReturnValue(of({ parties: [] }));
crmServiceStub.searchParties.mockReturnValue(of({ parties: [] }));
```

Replace the initial-load assertion and add the cleared-input regression test:

```ts
it('calls browse API on initial empty query to load customers', () => {
  fixture.detectChanges();

  expect(crmServiceStub.browseParties).toHaveBeenCalled();
  expect(crmServiceStub.searchParties).not.toHaveBeenCalled();
  expect(component.state()).toBe('empty');
  expect(component.error()).toBeNull();
});

it('calls search API with trimmed query when searching', () => {
  component.search('  acme  ');

  expect(crmServiceStub.searchParties).toHaveBeenCalledWith('acme');
  expect(crmServiceStub.browseParties).not.toHaveBeenCalled();
});

it('returns to browse mode when the query is cleared', () => {
  component.search('acme');
  component.search('   ');

  expect(crmServiceStub.searchParties).toHaveBeenCalledWith('acme');
  expect(crmServiceStub.browseParties).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the component spec to verify it fails**

Run:

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse
npx ng test --include="src/app/features/crm/pages/customer-list/customer-list.component.spec.ts" --no-watch
```

Expected: FAIL because the component still sends empty input through `searchParties(...)`.

- [ ] **Step 3: Write the minimal component implementation**

Change `search(q)` in `src/app/features/crm/pages/customer-list/customer-list.component.ts` so the request source is chosen before subscribing:

```ts
search(q: string): void {
  const query = q.trim();
  const request$ = query ? this.crm.searchParties(query) : this.crm.browseParties();

  this.state.set('loading');
  this.error.set(null);

  request$.subscribe({
    next: res => {
      this.parties.set(res.parties ?? []);
      this.state.set(res.parties?.length ? 'ready' : 'empty');
    },
    error: err => {
      this.state.set(err?.status === 403 ? 'access-denied' : 'error');
      this.error.set(err?.error?.message ?? 'Search failed.');
    },
  });
}
```

- [ ] **Step 4: Run the component spec to verify it passes**

Run:

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse
npx ng test --include="src/app/features/crm/pages/customer-list/customer-list.component.spec.ts" --no-watch
```

Expected: PASS with initial load using browse, non-empty input using search, and cleared input returning to browse mode.

- [ ] **Step 5: Commit the component change**

Run:

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse
git add src/app/features/crm/pages/customer-list/customer-list.component.ts src/app/features/crm/pages/customer-list/customer-list.component.spec.ts
git commit -m "feat(crm): browse customer directory on empty query" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Run focused CRM verification

**Files:**
- Test: `src/app/features/crm/services/crm.service.spec.ts`
- Test: `src/app/features/crm/pages/customer-list/customer-list.component.spec.ts`

- [ ] **Step 1: Run both touched CRM specs together**

Run:

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse
npx ng test --include="src/app/features/crm/services/crm.service.spec.ts" --include="src/app/features/crm/pages/customer-list/customer-list.component.spec.ts" --no-watch
```

Expected: PASS for both specs in one run.

- [ ] **Step 2: Run the broader CRM spec slice**

Run:

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse
npx ng test --include="src/app/features/crm/**/*.spec.ts" --no-watch
```

Expected: PASS for the CRM feature suite with no regressions in nearby pages or services.

- [ ] **Step 3: Run a production build**

Run:

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse
npm run build
```

Expected: PASS and produce the application build in `dist/`.

- [ ] **Step 4: Review the diff before handoff**

Run:

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend/.worktrees/issue-25-customer-directory-browse
git --no-pager diff --stat master...HEAD
git --no-pager status --short
```

Expected: the branch diff should show the CRM service/component changes, the SDK tarball/manifest refresh needed for reproducibility, and the docs updates in this branch, while `git status --short` remains clean.
