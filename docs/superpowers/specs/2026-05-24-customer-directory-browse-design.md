# Customer Directory browse-mode design

## Summary

Update the CRM Customer Directory so empty or whitespace-only input uses the new browse API contract, while non-empty input continues to use criteria search. The page UX stays the same: one search box, one results table, the existing client-side sort controls, and the existing empty/error/access-denied states.

## Scope

- In scope:
  - Add frontend support for browse-vs-search routing based on `query.trim()`
  - Keep rendering on a single shared UI model
  - Return to browse mode when the user clears the search box
  - Treat successful empty browse responses as a normal empty state
  - Add service and component tests for the new branching behavior
- Out of scope:
  - Adding pagination UI
  - Changing visible Customer Directory layout or sort controls
  - Shipping a temporary direct HTTP implementation that bypasses the SDK

## Prerequisite

The generated `@durion-sdk/customer` client used by this repo must expose the new browse endpoint for `GET /v1/crm/accounts/parties`. This work assumes the SDK is updated first or in the same change set. The frontend should not implement a one-off direct HTTP fallback for this issue.

## Proposed architecture

### 1. SDK-backed browse entry point

Use the generated `CRMAccountsService.browseParties(pageable: Pageable)` method for the new accounts browse endpoint. The method exposes the shared backend response shape already used by `searchParties`, including `results`, `totalCount`, `pageNumber`, and `pageSize`.

### 2. CrmService normalization

Add a new `CrmService.browseParties()` wrapper alongside the existing `searchParties(...)` method. The wrapper should call the SDK with an empty `Pageable` object (`{}`) so the backend applies its browse defaults until explicit pagination UI exists. Both methods should map their SDK responses into the same frontend return shape so `CustomerListComponent` does not need to understand backend response differences.

For this issue, the normalized shape can remain centered on the existing list rendering contract:

```ts
Observable<{ parties: PartyDetail[] }>
```

If browse metadata becomes needed later for pagination UI, it can be added in a backward-compatible extension instead of forcing UI changes now.

### 3. Component-level mode selection

Keep the browse/search decision in `CustomerListComponent.search(q)`, using `q.trim()` as the only decision point:

- empty trimmed query → browse
- non-empty trimmed query → search

This keeps the caller explicit about whether the user is browsing or filtering, which matches the issue note that one caller should decide the mode before invoking the request.

## Runtime behavior

### Initial load

`ngOnInit()` still triggers `search('')`, but that call now resolves to browse mode because the trimmed query is empty.

### User search

When the debounced input contains a non-empty trimmed string, the component continues to call the search flow and render results exactly as it does today.

### Clearing the input

When the user removes all content or leaves only whitespace, the component returns to browse mode automatically and reloads the directory from the browse endpoint.

## State and error handling

- Before each request, set the page to `loading` and clear the prior error message.
- A successful response with zero results sets `state` to `empty`.
- A successful response with one or more results sets `state` to `ready`.
- A `403` response remains `access-denied`.
- Any other request failure remains `error`, using the existing fallback message behavior.

This preserves current authorization and failure handling while fixing the incorrect empty-query contract.

## Sorting and paging expectations

- Existing client-side sort controls remain unchanged.
- No explicit pagination controls are added in this issue.
- Browse requests should use the SDK-backed browse endpoint with `Pageable = {}` so backend default paging and sorting semantics apply even though the current UI still renders a single page of results.

## Test plan

### `crm.service.spec.ts`

- Verify browse mode calls the new SDK browse method with an empty `Pageable` object, not `searchParties`
- Verify non-empty search still calls `searchParties`
- Verify both methods normalize the shared response shape into `{ parties }`

### `customer-list.component.spec.ts`

- Verify initial load uses browse mode
- Verify whitespace-only input uses browse mode
- Verify non-empty input uses search mode
- Verify clearing a previously non-empty query returns to browse mode
- Verify a successful empty browse response renders the normal empty state rather than an error state

## Risks and mitigations

- **Risk:** the installed frontend SDK package may lag behind the generated SDK repo.
  - **Mitigation:** refresh the SDK (`npm run generate && npm run build` in `durion-positivity-sdk-angular`, then `npm run sdk:install` in the frontend worktree) before implementing the browse wrapper.
- **Risk:** future pagination UI may need metadata not currently surfaced by the component contract.
  - **Mitigation:** keep response normalization in `CrmService` so metadata can be added later without reworking the component’s browse/search branching logic.

## Acceptance mapping

1. Opening Customer Directory with no query loads via browse mode.
2. Clearing the search box returns the page to browse mode.
3. Empty-query loads stop using criteria search.
4. Non-empty queries continue using criteria search.
5. Empty browse results render a normal empty state.
6. Current sort behavior remains intact, and browse uses the backend’s paged contract.
7. The frontend continues consuming the shared response shape through SDK-backed mapping.
