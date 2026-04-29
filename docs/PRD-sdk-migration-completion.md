# PRD: Angular SDK Migration Completion

**Status:** Execution-ready  
**Date:** 2026-04-28  
**Owner:** Frontend Platform  
**Related Issue:** `louisburroughs/durion#320`

## Objective

Complete the migration of `durion-positivity-frontend` to the Angular-native SDK in
`durion-positivity-sdk-angular`.

At completion:

- frontend domain and workflow code uses injected `@durion-sdk/*` Angular services as the
  primary transport boundary
- direct `ApiBaseService` usage is removed from feature pages and from domain services
  except for explicitly approved exceptions
- local request and response models are reduced to UI-only view models or thin aliases
  rather than parallel transport contracts
- the frontend no longer treats SDK adoption as a speculative blocker-hunt; missing SDK
  operations are handled as concrete defects with exact evidence

This PRD replaces the older blocker-inventory version of the migration plan. The SDK has
already been rewritten to be Angular-specific and has already absorbed additional backend
API surface. The remaining work is frontend adoption, cleanup, and retirement of
transitional transport code.

## Current Context

The current repo state is materially different from the prior version of this PRD:

- `durion-positivity-sdk-angular` is now the Angular-specific SDK and is the correct
  client for this application.
- The frontend already imports SDK packages broadly across accounting, bulk import,
  catalog, CRM, inventory, invoice, location, order, people, security, shop-manager,
  and workorder flows.
- `app.config.ts` is already wiring Angular SDK `Configuration` providers for the core
  generated clients.
- The frontend installs SDK packages through `scripts/sdk/install-sdk-packages.mjs`
  using either:
  - `DURION_SDK_ANGULAR_PATH`
  - `./.sdk-src`
  - `../durion-positivity-sdk-angular`
  - packed tarballs in `./.sdk-tarballs`
- The migration is no longer centered on eliminating hundreds of unsafe type casts.
  Current inventory in non-spec TypeScript files:
  - `as never`: `0`
  - `as unknown`: `3`

The remaining migration scope is therefore not “make the SDK exist” or “wait for a large
future regeneration.” It is “finish consuming the SDK cleanly in the frontend and retire
legacy direct transport paths.”

## Problem Statement

The frontend is in a mixed state:

- many domains already use SDK services
- several services still mix SDK calls with direct `ApiBaseService` requests
- some page components still make transport calls directly, which violates the desired
  service-boundary architecture
- several local model files still duplicate request and response contracts that now exist
  in the SDK
- a few temporary exceptions remain documented only in comments or older planning docs,
  which creates ambiguity about what is truly allowed to remain

That ambiguity is the main risk now. The previous PRD embedded a large number of assumed
backend and OpenAPI blockers. That is no longer the right execution model. The frontend
team needs a precise completion plan based on the actual repository state.

## Decision Summary

1. `durion-positivity-sdk-angular` is the authoritative client SDK for this frontend.
2. Frontend migration is no longer defined as “wait for future SDK parity” by default.
   If a missing or incorrect SDK operation is discovered, it must be logged as a specific
   defect with evidence:
   - frontend call site
   - expected SDK package
   - expected endpoint
   - missing or incorrect parameters, request body, or response shape
3. Page components must not own transport logic. Any remaining direct HTTP in pages must
   move behind a feature service before this PRD is complete.
4. Local models may remain only when they are:
   - UI-only view models
   - composite models spanning multiple backend responses
   - deliberately narrowed presentation models
   They must not remain merely to mirror SDK transport contracts.
5. SDK publication and registry strategy are not completion gates for this PRD. The
   frontend’s current supported consumption model is the install flow implemented by
   `scripts/sdk/install-sdk-packages.mjs`. Publication work remains separate.

## In Scope

- Replacing remaining direct `ApiBaseService` usage in feature services with SDK-backed
  transport where the SDK already provides the required operation.
- Moving direct transport out of page components and back into feature services.
- Reducing local transport-model duplication now that the Angular SDK is the canonical
  contract source.
- Removing SDK-related compatibility shims, casts, and mapping code that no longer add
  business value.
- Updating tests so they validate SDK-backed services and page behavior rather than raw
  HTTP plumbing.
- Keeping explicit, narrow documentation for any approved temporary exceptions that still
  remain at the end of a slice.

## Out of Scope

- Rewriting `chat-api.service.ts`, which intentionally uses direct gateway/MCP HTTP.
- Replacing the existence of `ApiBaseService` itself; it remains shared infrastructure.
- Reworking `src/app/core/services/auth.service.ts` to use SDK auth clients. Auth and
  session lifecycle hardening are separate work unless explicitly scheduled as their own
  slice.
- Frontend publication or private-registry rollout work from
  `PRD-sdk-publication-transition.md`.
- Broad backend redesign work. Backend or OpenAPI changes are only in scope when a
  verified frontend migration defect proves the current SDK contract is wrong or missing.
- Rewriting UI-only view models that are not transport duplicates.

## Current-State Inventory

### Remaining direct transport consumers

Current inventory of non-spec application files still importing or injecting
`ApiBaseService`, excluding the infrastructure service itself and the permanent
`chat-api.service.ts` exception:

#### Services

- `src/app/features/security/services/security.service.ts`
- `src/app/features/security/services/security-audit.service.ts`
- `src/app/features/crm/services/crm.service.ts`
- `src/app/features/product/services/product-catalog.service.ts`
- `src/app/features/product/services/product-inventory.service.ts`
- `src/app/features/bulk-import/services/bulk-import.service.ts`
- `src/app/features/accounting/services/accounting.service.ts`
- `src/app/features/inventory/services/inventory.service.ts`
- `src/app/features/inventory/services/inventory-cycle-count.service.ts`
- `src/app/features/inventory/services/inventory-receiving.service.ts`
- `src/app/features/location/services/inventory.service.ts`
- `src/app/features/workexec/services/workexec.service.ts`
- `src/app/features/billing/services/billing-transport.service.ts`

#### Pages

- `src/app/features/shopmgmt/pages/mechanic-availability/mechanic-availability-page.component.ts`
- `src/app/features/shopmgmt/pages/dispatch-board/dispatch-board-page.component.ts`
- `src/app/features/shopmgmt/pages/mechanic-roster/mechanic-roster-page.component.ts`
- `src/app/features/people/pages/time-approval/time-approval-page.component.ts`
- `src/app/features/people/pages/work-session-submit/work-session-submit-page.component.ts`

### Local model inventory

There are currently `17` feature model files under `src/app/features/**/models/*.ts`.
Not all are wrong. This PRD requires auditing them and keeping only models that still add
UI value.

### Type-cast inventory

- `as never`: `0`
- `as unknown`: `3`

Only one of the three current `as unknown` usages is clearly SDK-adjacent:

- `src/app/features/security/services/security.service.ts`

The migration is therefore no longer blocked on large-scale type-escape cleanup.

## Approved Exceptions

The following exceptions are allowed at the start of this PRD:

- `src/app/features/shell/services/chat-api.service.ts`
  - Reason: gateway/MCP traffic is intentionally outside the domain SDK migration.
- `src/app/features/billing/services/billing-transport.service.ts`
  - Reason: documented temporary exceptions remain where invoice transport parity is not
    yet complete.
  - These exceptions are still in scope for cleanup under this PRD and must not expand.

No page component is an approved exception.

## User Stories

1. As a frontend platform engineer, I want the completion plan to reflect the current
   Angular SDK architecture, so that execution work is based on the repo that exists now
   rather than on stale blocker assumptions.
2. As a feature-service maintainer, I want SDK-backed services to be the only transport
   boundary for domain workflows, so that pages do not own HTTP details.
3. As a reviewer, I want a short explicit list of allowed transport exceptions, so that
   direct HTTP usage is easy to approve or reject.
4. As a maintainer, I want duplicate local models removed or justified, so that the SDK
   remains the canonical transport contract source.
5. As a QA engineer, I want verification to focus on behavior and type-safe SDK
   integration, so that transport migration does not silently regress workflows.

## Target End State

At final completion:

- direct transport is limited to:
  - `src/app/core/services/api-base.service.ts`
  - `src/app/features/shell/services/chat-api.service.ts`
  - any temporary exception explicitly documented with a file, method, reason, and
    follow-up decision
- no page component injects `ApiBaseService`
- feature services own transport integration
- generated Angular SDK services are used directly through Angular DI
- SDK-shaped request and response contracts are consumed directly unless a local UI model
  adds clear presentation value
- service specs primarily mock SDK services, not raw HTTP parameter assembly

## Work Breakdown

### Wave 1 — Eliminate page-level transport ownership

**Goal:** remove direct transport from page components and move those calls into feature
services.

**Files currently in scope:**

- `shopmgmt/pages/mechanic-availability/mechanic-availability-page.component.ts`
- `shopmgmt/pages/dispatch-board/dispatch-board-page.component.ts`
- `shopmgmt/pages/mechanic-roster/mechanic-roster-page.component.ts`
- `people/pages/time-approval/time-approval-page.component.ts`
- `people/pages/work-session-submit/work-session-submit-page.component.ts`

**Rules:**

- If an appropriate feature service already exists, extend it.
- If a page has no owning service yet, create one in the domain service layer.
- Do not move transport responsibilities into shared utilities or new generic wrappers.

**Acceptance criteria:**

- [ ] Zero page components inject `ApiBaseService`.
- [ ] Page behavior remains unchanged from the user’s perspective.
- [ ] Tests cover the page through the owning service boundary.

### Wave 2 — Complete remaining service transport migration

**Goal:** finish migration of mixed transport services to SDK-backed transport wherever
the current Angular SDK already supports the operation.

**Primary services in scope:**

- `security.service.ts`
- `security-audit.service.ts`
- `crm.service.ts`
- `product-catalog.service.ts`
- `product-inventory.service.ts`
- `bulk-import.service.ts`
- `accounting.service.ts`
- `inventory.service.ts`
- `inventory-cycle-count.service.ts`
- `inventory-receiving.service.ts`
- `location/services/inventory.service.ts`
- `workexec.service.ts`
- `billing-transport.service.ts`

**Execution rule:**

- Assume the rewritten Angular SDK is the starting point.
- For each remaining direct call:
  - use the SDK operation if it already exists
  - if the SDK operation is missing or wrong, record a specific defect instead of
    preserving a vague “blocked by parity” note

**Required defect evidence when SDK is actually insufficient:**

- owning frontend file and method
- current endpoint and HTTP verb
- expected SDK package and service
- exact request and response mismatch
- whether the fix belongs in backend OpenAPI, SDK generation, or both

**Acceptance criteria:**

- [ ] All non-exception service methods in scope stop calling `ApiBaseService`.
- [ ] Remaining exceptions are documented method-by-method, not only file-by-file.
- [ ] No new direct `ApiBaseService` usage is introduced elsewhere.

### Wave 3 — Consolidate models and remove stale adapters

**Goal:** reduce duplicate transport models and remove compatibility code that only exists
because the frontend previously outpaced the SDK.

**Rules:**

- Keep local models only when they are UI-specific or intentionally composed.
- Prefer:
  - direct SDK model usage
  - type aliases to SDK models
  - narrow presentation adapters
- Avoid parallel “same shape, different file” contracts.

**Acceptance criteria:**

- [ ] Every remaining local model file has a stated reason to exist.
- [ ] Duplicate transport contracts are removed or replaced with SDK aliases.
- [ ] Remaining SDK-related casts are removed.

### Wave 4 — Close temporary exceptions and finalize signoff

**Goal:** turn the remaining exception list into either resolved migrations or explicitly
tracked follow-up decisions.

This wave is where the team decides whether temporary exceptions in
`billing-transport.service.ts` remain acceptable for this PRD or must move to a separate,
named follow-up. They must not remain as undocumented “known gaps.”

**Acceptance criteria:**

- [ ] Final direct-transport exception list is explicit and minimal.
- [ ] Every temporary exception has either been removed or assigned to a separate tracked
      follow-up with exact rationale.
- [ ] Final migration inventory is updated in this document or the linked execution
      tracker.

## Testing and Verification

Minimum verification for each slice:

- `npm run build`
- `npx ng test --include="src/app/features/<domain>/**/*.spec.ts" --no-watch`

Required before final signoff:

- `npm run build`
- `npx ng test --no-watch`
- `npx ng lint`

Testing expectations:

- service specs should mock SDK service classes for migrated flows
- page specs should validate behavior through the service layer, not through direct HTTP
  calls embedded in the component
- if a local model is replaced with an SDK model or alias, tests should prove behavior
  still matches the UI contract

## Delivery Rules

- Deliver in small domain-focused PRs.
- Keep migration changes close to the owning feature domain.
- Do not introduce new general-purpose adapter layers to hide SDK adoption.
- Do not preserve old direct HTTP methods “just in case.”
- If a missing SDK operation is discovered, log a specific defect and continue with other
  slices that are not blocked.

## Completion Criteria

This PRD is complete only when all of the following are true:

- [ ] No page component in `src/app/features/**` injects `ApiBaseService`.
- [ ] All remaining direct transport in domain services is either removed or explicitly
      documented as an approved temporary exception.
- [ ] The frontend primarily consumes `durion-positivity-sdk-angular` generated services
      for domain transport.
- [ ] Duplicate transport-model drift has been reduced through SDK model adoption or
      explicit justification.
- [ ] `npm run build`, `npx ng test --no-watch`, and `npx ng lint` pass.

## Notes

- This PRD intentionally stops treating publication workflow as a migration completion
  gate. The current supported frontend consumption path is the SDK install flow already
  implemented in this repo.
- This PRD intentionally stops embedding large speculative blocker tables. Those were
  useful when the Angular SDK and backend API surface were still unsettled. They are now
  more likely to preserve confusion than to improve execution.
- If new backend APIs are added after this document, they should be handled as ordinary
  incremental SDK adoption work, not as a reason to reopen the entire migration strategy.
