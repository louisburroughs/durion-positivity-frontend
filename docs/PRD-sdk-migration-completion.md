# PRD: Angular SDK Migration Completion

**Status:** Execution-ready for issue 320 — Wave 2 blocker closure in progress
**Date:** 2026-04-26
**Owner:** Frontend Platform
**Related Issue:** `louisburroughs/durion#320`
**Prerequisites:**

- `durion-positivity-backend` PRD-missing-backend-endpoints.md — backend contract-parity
  work for the active blocker group completed, OpenAPI specs regenerated, Angular SDK
  regenerated
- `PRD-sdk-publication-transition.md` — published/private-registry SDK adoption plan
  executed through frontend dependency adoption and build-path cleanup
  **References:** `sdk-migration-analysis.md` and `PRD-sdk-publication-transition.md` in
  this directory

---

## Objective

Complete the migration of `durion-positivity-frontend` from direct `ApiBaseService`
HTTP calls to the typed Angular SDK (`durion-positivity-sdk-angular`). Once finished,
`ApiBaseService` is scoped exclusively to gateway/MCP traffic (`chat-api.service.ts`)
and all domain services consume strongly-typed SDK observables through published SDK
packages rather than local packed artifacts.

---

## Problem Statement

Issue 320 is no longer primarily a frontend cleanup task. The remaining Wave 2 work is
blocked by contract drift between backend OpenAPI, generated Angular SDK packages, and
frontend domain services that still depend on direct `ApiBaseService` calls or cast-based
type escapes.

From the frontend perspective, migration cannot finish while any B-class blocker leaves a
service in an intermediate state where:

- the business flow still works only through direct transport calls
- the generated SDK omits parameters, endpoints, or correct schemas
- local models must stay alive to compensate for contract drift
- Wave 3 model deletion and Wave 4 transport retirement remain unsafe

The frontend PRD therefore focuses on the execution work required after each blocker is
closed at the backend and SDK layers: adopt the generated client, remove casts, align
local interfaces, and keep transport ownership inside feature services instead of pages.

---

## Solution

Execute issue 320 as a blocker-driven frontend migration program.

For each blocker group, the frontend work is complete only when:

- the regenerated SDK exposes the needed operation with the right contract
- the feature service stops importing `ApiBaseService` for that operation
- all temporary `as never` and `as unknown` casts related to that flow are removed
- pages and components consume SDK-backed services without taking on transport logic
- the domain is closer to Wave 3 model deletion and eventual `ApiBaseService` retirement

This keeps the frontend scope narrow and testable: no broad rewrites, no new local
transport abstractions, and no compatibility shims that would prolong the migration.

---

## User Stories

1. As a frontend platform engineer, I want every remaining Wave 2 blocker mapped to a
   concrete frontend follow-on task, so that migration can proceed domain by domain
   without rediscovering scope.
2. As a feature-service maintainer, I want SDK methods to expose the real request and
   response contracts, so that I can delete direct `ApiBaseService` calls instead of
   wrapping them.
3. As a frontend reviewer, I want ADR-0041 transport exceptions reduced to explicit,
   temporary cases only, so that SDK-first transport is enforceable in code review.
4. As a security developer, I want permissions, audit search, and export flows to move
   behind generated clients, so that security services stop mixing direct HTTP and SDK
   calls.
5. As a bulk-import developer, I want correction and audit-review flows to align to the
   generated client contract, so that record-correction UX no longer depends on guessed
   endpoints or local adapter behavior.
6. As an inventory developer, I want lookup, ledger, putaway, replenishment, returns,
   and shortage flows to migrate service-by-service, so that the largest direct-transport
   surface can be retired without destabilizing inventory pages.
7. As a catalog and product developer, I want list and availability contracts to be
   represented correctly in the SDK, so that parameter mismatches do not leak into page
   logic.
8. As an accounting developer, I want event, AP bill, export, and contract schema flows
   to be SDK-backed, so that accounting pages no longer rely on divergent local models.
9. As a CRM developer, I want duplicate-check and billing-rules updates to use generated
   clients, so that account-management screens stop depending on special-case direct
   calls.
10. As a QA engineer, I want each blocker closure validated at the feature-service and
    page-behavior layers, so that regressions are caught where the frontend consumes the
    contract.
11. As a frontend maintainer, I want local duplicate models deletable immediately after
    parity is reached, so that Wave 3 reduces long-term maintenance instead of deferring
    it.
12. As a platform lead, I want issue 320 to leave the frontend with a credible path from
    Wave 2 to Waves 3 and 4, so that migration does not remain permanently partially
    complete.

---

## Implementation Decisions

- This PRD covers the frontend-owned execution slice of issue 320; backend endpoint and
  OpenAPI parity work is tracked in the paired backend PRD.
- The unit of delivery is the blocker group, not the repository. A frontend blocker is
  not closed until the SDK is regenerated and adopted in the frontend service.
- Frontend transport logic remains inside feature services. Page components must not
  become fallback transport adapters for incomplete contracts.
- Prefer aligning local interfaces to generated SDK models over introducing new local
  wrapper models. That keeps Wave 3 model deletion small and mechanical.
- Do not add new direct `ApiBaseService` usage, even as a temporary convenience. If a
  blocker still requires direct transport, keep the exception scoped to the current call
  site and document it in the blocker table.
- Blocker closure order should favor domains that validate the workflow and unlock more
  direct-transport retirement: security and bulk import first, then catalog/product and
  CRM, then accounting and inventory.
- Each domain slice should ship as a small PR with its own focused build and test
  evidence.
- Wave 3 model deletion follows immediately after the corresponding Wave 2 domain slice
  is stable; do not batch model deletions across multiple domains.

---

## Testing Decisions

- Good frontend tests verify observable behavior and contract consumption, not internal
  implementation details. They should prove that the service can use the generated SDK
  without casts or transport fallbacks.
- Every blocker closure must pass a production build before merge. Type safety is a
  primary acceptance signal for this migration.
- For each domain slice, run targeted Angular specs around the touched feature service
  and any page or component whose behavior changes because request or response shapes
  changed.
- Cross-repo validation is explicit: backend module tests and OpenAPI regeneration must
  succeed first, SDK regeneration and build must succeed second, and frontend build/tests
  run last.
- Existing service specs are the preferred prior art. Update mocks to target generated
  SDK services rather than `ApiBaseService` or raw `HttpParams` behavior.
- When a blocker closure intentionally preserves a temporary exception, tests must prove
  that the exception is narrow and documented rather than silently broad.

---

## Current State

| Metric                                                   | Count                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| Files still importing `ApiBaseService` (domain services) | 22                                                         |
| `as never` / `as unknown` type casts                     | 149                                                        |
| Local model files (duplicating SDK types)                | ~2,370 LOC across 13 files                                 |
| Domains with zero remaining direct API calls             | 5 (Order, Shop Management, Location, People, Inventory/PO) |
| Domains partially or fully blocked on direct API         | 9                                                          |

The cast count (149) is the leading indicator of migration quality. It represents places
where the frontend's local type definitions have drifted from the SDK-generated types.
Resolving casts and deleting the corresponding local models is the central work of this
PRD.

---

## Out of Scope

- Backend changes — the prerequisite PRD covers those.
- New product features.
- `chat-api.service.ts` — intentionally uses direct HTTP for MCP/gateway endpoints;
  leave it alone.
- `auth.service.ts` — see Wave 4; included but treated as a separate, careful task.
- Component-level `as` casts unrelated to SDK type mismatches (e.g. template binding
  coercions) — fix only casts that involve SDK model types.

---

## Additional Completion Requirement

This PRD is not complete when the code merely uses SDK service classes. Final
completion also requires the frontend to consume `@durion-sdk/*` through the published
private-package workflow defined in `PRD-sdk-publication-transition.md`.

Temporary local-pack bootstrapping (`.sdk-src`, `.sdk-tarballs`, custom SDK install
scripts, and build-time SDK checkout assumptions) is transitional only and must not be
the end-state for signoff.

---

## Further Notes

- Issue 320 is the umbrella planning issue. This document is the frontend execution PRD
  for the frontend-owned portion of that issue.
- The paired backend PRD defines the backend-owned parity work that must land before each
  frontend blocker slice can migrate.
- Success is not measured only by fewer direct calls. The real success condition is
  contract parity: generated SDK usage with no cast escapes, no parameter loss, and no
  new page-level transport ownership.
- Published SDK adoption remains a required signoff condition and is intentionally kept
  separate in `PRD-sdk-publication-transition.md`.

---

## Work Breakdown by Wave

Work is organized into four waves. Each wave is independently shippable as a PR.
Waves 1–3 can overlap across different domains; Wave 4 (auth + retirement) must follow.

---

### Wave 1 — Resolve Type Contracts (no feature changes, no model deletes)

**Goal:** Eliminate all `as never` and `as unknown` casts. Do not delete model files
yet — that comes in Wave 3 after services are fully migrated. This wave is about
understanding and closing the contract gaps.

**Why first:** Every subsequent wave becomes a TypeScript compile error hunt if casts
remain. Resolving them first means clean, compiler-verified PRs for the remaining
waves.

#### Cast inventory by service

| Service / File                                | Cast count | Primary cause                                                         |
| --------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| `workexec.service.ts`                         | 29         | `workexec.models.ts` interfaces diverged from `@durion-sdk/workorder` |
| `product-catalog.service.ts`                  | 35         | `product.models.ts` + `pricing.models.ts` vs `@durion-sdk/catalog`    |
| `accounting.service.ts`                       | 19         | `accounting.models.ts` vs `@durion-sdk/accounting`                    |
| `crm.service.ts`                              | 9          | `crm.models.ts` vs `@durion-sdk/customer`                             |
| `bulk-import.service.ts`                      | 6          | `bulk-import.models.ts` vs `@durion-sdk/bulk-loader`                  |
| `inventory-cycle-count.service.ts`            | 7          | `inventory.models.ts` vs `@durion-sdk/inventory`                      |
| `inventory-receiving.service.ts`              | 6          | `inventory.models.ts` vs `@durion-sdk/inventory`                      |
| `inventory-purchase-order.service.ts`         | 5          | `inventory.models.ts` vs `@durion-sdk/inventory`                      |
| `security.service.ts`                         | 2          | `security.models.ts` vs `@durion-sdk/security`                        |
| `product-inventory.service.ts`                | 1          | product models vs `@durion-sdk/inventory`                             |
| `product-location.service.ts`                 | 3          | location models vs `@durion-sdk/location`                             |
| Workexec components (3 files)                 | 5          | same workexec contract drift                                          |
| Other components (people, shopmgmt, location) | ~22        | scattered                                                             |

**Resolution approach for each cast:**

1. Find the SDK model that the service is receiving (import it, hover the real return
   type, check `packages/sdk-*/src/models/`).
2. Compare with the local model type used after the cast.
3. **Preferred path:** Update the local interface to match the SDK model exactly, then
   remove the cast. The local interface becomes a type alias or thin wrapper; it will be
   deleted entirely in Wave 3.
4. **If the SDK model is wrong** (missing field, wrong type): update the OpenAPI spec in
   the backend, regenerate, then return to step 1. Do not paper over a real contract
   error with a cast.
5. After removing each cast, confirm `ng build` and `ng test` pass.

**Acceptance criteria:**

- [ ] Zero `as never` casts in non-spec `.ts` files.
- [ ] Zero `as unknown` casts involving SDK model types.
- [ ] `ng build --configuration production` passes with zero type errors.

---

### Wave 2 — Complete Domain Service Migration

**Goal:** Replace all remaining `ApiBaseService` calls in domain services with SDK
calls. Wave 1 must be complete (or co-developed with it) for each domain before its
services are migrated in this wave.

---

#### 2a. Security (`security.service.ts`, `security-audit.service.ts`)

**`security.service.ts` — status:**

| Method                | Status     | Notes                                  |
| --------------------- | ---------- | -------------------------------------- |
| `createRole()`        | ✅ Done    | → `RoleManagementService.createRole()` |
| `createUser()`        | ✅ Done    | → `UserAPIService.createUser()`        |
| `getAllPermissions()` | 🔴 Blocked | See B-1 below                          |
| `searchAudit()`       | 🔴 Blocked | See B-2 below                          |

**`security-audit.service.ts` — status:**

| Method                   | Status     | Notes         |
| ------------------------ | ---------- | ------------- |
| `searchAuditEvents()`    | 🔴 Blocked | See B-3 below |
| `requestAuditExport()`   | 🔴 Blocked | See B-4 below |
| `getAuditExportStatus()` | 🔴 Blocked | See B-4 below |

**B-1 — `getAllPermissions()`: SDK requires mandatory `domain` parameter**

- **Current call:** `GET /v1/permissions?page=0&size=100`
- **SDK method:** `PermissionRegistryService.getAllPermissions(domain: string)` — `domain` is required; SDK sends it as a query param, no `page`/`size` support.
- **Required:** Decide whether the frontend should adopt the domain-scoped API. If yes: (a) update `getAllPermissions(page, size)` signature to `getAllPermissions(domain: string)`, (b) update all call sites to pass a domain string (the role-assignment page is the primary consumer), (c) confirm the backend `/v1/permissions` endpoint no longer requires pagination. If the backend still needs pagination, update the OpenAPI spec to expose `page` and `size` as optional params alongside `domain` and regenerate `@durion-sdk/security`.

**B-2 — `searchAudit()`: endpoint not covered by security SDK**

- **Current call:** `GET /v1/shop/audit?appointmentId={id}` — shop audit trail, not the security audit log.
- **SDK method:** `AuditService` in `@durion-sdk/security` covers `/v1/audit/events` (security principal audit). These are different domains.
- **Required:** Identify which SDK package owns `/v1/shop/audit`. If it belongs to `@durion-sdk/shop-manager`, expose the endpoint in the shop-manager OpenAPI spec and inject `ShopAuditService` (or equivalent) in `security.service.ts`. If the endpoint has no SDK owner, raise a backend OpenAPI coverage ticket.

**B-3 — `searchAuditEvents()`: SDK exposes only 5 of 13+ filter parameters**

- **Current call:** `GET /v1/audit/events` with params: `fromDate`, `toDate`, `actorId`, `workorderId`, `movementId`, `productId`, `sku`, `eventType`, `aggregateId`, `correlationId`, `reasonCode`, `pageToken`, `locationIds`.
- **SDK method:** `AuditService.searchEvents(entityId?, entityType?, eventType?, from?, to?)` — only 5 params exposed.
- **Required:** Update the `GET /v1/audit/events` operation in the backend security OpenAPI spec to declare all supported query parameters. Regenerate `@durion-sdk/security`. No frontend code changes needed beyond swapping the `api.get()` call for `auditSdk.searchAuditEvents(filter)` once the SDK method signature matches.

**B-4 — `requestAuditExport()` / `getAuditExportStatus()`: endpoints absent from SDK**

- **Current calls:**
  - `POST /v1/audit/exports` — submit an export job.
  - `GET /v1/audit/exports/{jobId}` — poll export status.
- **SDK method:** Neither endpoint is generated in `@durion-sdk/security`.
- **Required:** Add both operations to the backend security OpenAPI spec and regenerate `@durion-sdk/security`. Frontend migration is then a straightforward `api.post/get` → SDK service swap.

---

#### 2b. Bulk Import (`bulk-import.service.ts`)

**Status:**

| Method               | Status     | Notes                                                                                                    |
| -------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `retryJob()`         | ✅ Done    | → `BulkLoadJobsAPIService.retryJob()`                                                                    |
| `listAuditRecords()` | ✅ Done    | → `ReviewQueueAPIService.getAuditRecords()` (server-side filters not forwarded — SDK accepts jobId only) |
| `submitCorrection()` | 🔴 Blocked | See B-5 below                                                                                            |

**B-5 — `submitCorrection()`: single-record PUT vs bulk POST SDK mismatch**

- **Current call:** `PUT /bulk-loader/v1/bulk-jobs/{jobId}/audit/{recordId}/correction` with body `{ correctedValues: Record<string, unknown> }` — operates on one audit record.
- **SDK method:** `ReviewQueueAPIService.submitCorrections(jobId, BulkCorrectionRequest)` calls `POST /bulk-loader/v1/bulk-jobs/{jobId}/corrections` with body `{ corrections: Array<{ auditRecordId: string; correctedData: { [key]: string } }> }` — bulk endpoint, no per-record URL segment.
- **Required (option A — preferred):** Drop the single-record PUT. Update `BulkImportService.submitCorrection(jobId, recordId, request)` to wrap its arguments into the bulk format `{ corrections: [{ auditRecordId: recordId, correctedData: request.correctedValues }] }` and call `reviewQueueService.submitCorrections()`. The return type changes from `BulkLoadRecordAudit` to a `BulkCorrectionResponse` summary; update the calling component accordingly.
- **Required (option B):** If the single-record PUT endpoint must be preserved for the UX flow, add it to the bulk-loader OpenAPI spec as a distinct operation and regenerate `@durion-sdk/bulk-loader`. This is the heavier backend path.

---

#### 2c. Inventory Domain (`inventory.service.ts`)

**Status:** All 14 methods remain on `ApiBaseService`. The SDK package `@durion-sdk/inventory` covers putaway execution, replenishment, returns, and shortage resolution but is missing the ledger, location-listing, returnable-items, reason-code, and shortage-options endpoints entirely.

| Method                    | Status     | Notes    |
| ------------------------- | ---------- | -------- |
| `queryAvailability()`     | 🔴 Blocked | See B-6  |
| `getLocations()`          | 🔴 Blocked | See B-7  |
| `getStorageLocations()`   | 🔴 Blocked | See B-7  |
| `getLocationZones()`      | 🔴 Blocked | See B-7  |
| `queryLedger()`           | 🔴 Blocked | See B-8  |
| `getLedgerEntry()`        | 🔴 Blocked | See B-8  |
| `getPutawayTasks()`       | 🔴 Blocked | See B-9  |
| `completePutawayTask()`   | 🔴 Blocked | See B-9  |
| `getReplenishmentTasks()` | 🔴 Blocked | See B-10 |
| `getReturnableItems()`    | 🔴 Blocked | See B-11 |
| `getReasonCodes()`        | 🔴 Blocked | See B-11 |
| `submitReturnToStock()`   | 🔴 Blocked | See B-11 |
| `getShortageOptions()`    | 🔴 Blocked | See B-12 |
| `resolveShortage()`       | 🔴 Blocked | See B-12 |

**B-6 — `queryAvailability()`: SDK method has different signature**

- **Current call:** `GET /inventory/v1/availability?sku={sku}&locationId={locationId}&storageLocationId={storageLocationId}` → returns `AvailabilityView[]`.
- **SDK method:** `InventoryAvailabilityService.queryInventoryAvailability(productId)` → returns `Array<LocationAvailabilityDto>` (no locationId/storageLocationId filter).
- **Required:** Update the `GET /inventory/v1/availability` OpenAPI operation to expose `locationId` and `storageLocationId` as optional query parameters. Regenerate `@durion-sdk/inventory`. Then migrate, adapting `LocationAvailabilityDto` to the local `AvailabilityView` interface (or align the local interface to the SDK type in Wave 3).

**B-7 — `getLocations()`, `getStorageLocations()`, `getLocationZones()`: endpoints absent from SDK**

- **Current calls:**
  - `GET /inventory/v1/locations` → `LocationRef[]`
  - `GET /inventory/v1/locations/{locationId}/storage-locations` → `StorageLocation[]`
  - `GET /inventory/v1/locations/{locationId}/zones` → `LocationZone[]`
- **SDK state:** `InventoryLocationsService` only exposes `/v1/inventory/locations/{locationId}/inventory-inquiry` (single-location inventory summary). The list, storage-location, and zone endpoints are not generated.
- **Required:** Add all three operations to the inventory OpenAPI spec and regenerate `@durion-sdk/inventory`. These are read-only lookups; no request body changes needed.

**B-8 — `queryLedger()`, `getLedgerEntry()`: `InventoryLedgerService` does not exist**

- **Current calls:**
  - `GET /inventory/v1/ledger?{filters}` — paged ledger with rich filter set.
  - `GET /inventory/v1/ledger/{id}` — single ledger entry.
- **SDK state:** No `InventoryLedgerService` exists at all in `@durion-sdk/inventory`.
- **Required:** Add both ledger operations to the inventory OpenAPI spec, including all query parameters supported by `GET /inventory/v1/ledger` (productSku, locationId, storageLocationId, dateFrom, dateTo, sourceTransactionId, workorderId, workorderLineId, pageSize, pageToken, movementTypes). Regenerate `@durion-sdk/inventory`.

**B-9 — `getPutawayTasks()`, `completePutawayTask()`: method/type mismatch**

- **`getPutawayTasks(locationId?)`:** SDK `PutawayService.getAvailableTasks()` takes no parameters — the `locationId` filter is lost. **Required:** Update the `GET /inventory/v1/putaway/tasks` OpenAPI operation to declare `locationId` as an optional query parameter. Regenerate.
- **`completePutawayTask(taskId, body: PutawayCompleteRequest)`:** SDK `PutawayExecutionService.executePutaway(taskId, PutawayExecutionRequest)` uses a different request type (`PutawayExecutionRequest` has `targetStorageLocationId` and `overrideReasonCode`; local `PutawayCompleteRequest` has different fields). **Required:** Align the local `PutawayCompleteRequest` interface to `PutawayExecutionRequest`, update any component usage, then swap the call to `putawayExecutionService.executePutaway()`.

**B-10 — `getReplenishmentTasks()`: locationId filter missing from SDK**

- **Current call:** `GET /inventory/v1/replenishment/tasks?locationId={locationId}`.
- **SDK method:** `ReplenishmentService.getReplenishmentTasks()` — no parameters.
- **Required:** Add `locationId` as an optional query parameter to the `GET /inventory/v1/replenishment/tasks` OpenAPI operation. Regenerate `@durion-sdk/inventory`.

**B-11 — `getReturnableItems()`, `getReasonCodes()`, `submitReturnToStock()`: type and endpoint gaps**

- **`getReturnableItems(workorderId)`:** `GET /inventory/v1/workorders/{workorderId}/returnable-items` — no SDK method. **Required:** Add this operation to the inventory OpenAPI spec under a `ReturnsService` or `WorkorderInventoryService` and regenerate.
- **`getReasonCodes(type)`:** `GET /inventory/v1/reasons?type={type}` — no SDK method. **Required:** Add this operation to the inventory OpenAPI spec and regenerate.
- **`submitReturnToStock(request: ReturnToStockRequest)`:** SDK `ReturnsService.returnItemsToStock(ReturnItemsRequest)` covers the same endpoint (`POST /inventory/v1/movements/return-to-stock` or equivalent) but with a different request type. **Required:** Align the local `ReturnToStockRequest` interface to `ReturnItemsRequest` (or vice-versa via OpenAPI spec correction), then migrate the call.

**B-12 — `getShortageOptions()`, `resolveShortage()`: type and endpoint gaps**

- **`getShortageOptions(workorderId, allocationLineId)`:** `GET /inventory/v1/workorders/{workorderId}/allocations/{allocationLineId}/shortage-options` — no SDK method. **Required:** Add this operation to the inventory OpenAPI spec and regenerate.
- **`resolveShortage(request: ShortageResolutionRequest)`:** SDK `ShortageResolutionService.resolveShortage(ShortageResolutionRequest)` exists but uses a different request shape (SDK type has `workorderId` and `allocationId` fields; local type has `workorderId` and `allocationLineId`). **Required:** Confirm the backend field name (`allocationId` vs `allocationLineId`) and align either the OpenAPI spec or the local interface.

---

#### 2d. Product Catalog (`product-catalog.service.ts`, `product-inventory.service.ts`)

**`product-catalog.service.ts` — status:**

| Method                 | Status     | Notes                                        |
| ---------------------- | ---------- | -------------------------------------------- |
| All other methods      | ✅ Done    | Already using `@durion-sdk/catalog` services |
| `listCostStructures()` | 🔴 Blocked | See B-13 below                               |

**`product-inventory.service.ts` — status:**

| Method                         | Status     | Notes                                                                    |
| ------------------------------ | ---------- | ------------------------------------------------------------------------ |
| `queryInventoryAvailability()` | ✅ Done    | Already uses `InventoryAvailabilityService.queryInventoryAvailability()` |
| `queryAvailabilityBySku()`     | 🔴 Blocked | See B-14 below                                                           |
| `queryLeadTime()`              | 🔴 Blocked | See B-14 below                                                           |
| `getLocationInventory()`       | 🔴 Blocked | See B-15 below                                                           |

**B-13 — `listCostStructures()`: list endpoint absent from SDK**

- **Current call:** `GET /catalog/v1/supplier-costs?itemId={itemId}` → `CostStructure[]`.
- **SDK state:** `SupplierItemCostAPIService` has `createCostStructure`, `getCostStructure`, `updateCostStructure`, `deleteCostStructure` — no list/search operation.
- **Required:** Add `GET /catalog/v1/supplier-costs` as a list operation to the catalog OpenAPI spec, with `itemId` and `supplierId` as optional query parameters. Regenerate `@durion-sdk/catalog`.

**B-14 — `queryAvailabilityBySku()` / `queryLeadTime()`: parameter contract mismatch**

- **Current calls:** Both methods take `(sku: string, sourceType: FeedSourceType)` and call `/inventory/v1/availability/by-sku` and `/inventory/v1/lead-time` respectively.
- **SDK methods:** `InventoryAvailabilityService.queryAvailabilityBySku(productSku, locationId, storageLocationId?)` and `.queryLeadTime(productId, locationId)` — both take `locationId`, not `sourceType`. These appear to be different endpoints or the backend parameter was renamed.
- **Required:** Confirm whether `sourceType` and `locationId` are separate query parameters on the same endpoint, or separate endpoints. If the `by-sku` endpoint takes `sourceType`, update the OpenAPI spec to expose it and regenerate. If `locationId` is correct, update the frontend method signatures and call sites to pass `locationId` instead of `sourceType`.

**B-15 — `getLocationInventory()`: return type mismatch**

- **Current call:** `GET /inventory/v1/locations/{locationId}/inventory?sku={sku}` → `LocationInventory` (local model with `onHand`, `reserved`, `atp` fields).
- **SDK method:** `InventoryLocationsService.getLocationInventory(locationId)` → `LocationInventoryInquiryResponse` (SDK model with `onHandQuantity`, `availableToPromiseQuantity`). No `sku` query param.
- **Required:** Align the local `LocationInventory` interface to `LocationInventoryInquiryResponse` (field renames). If `sku` is a legitimate query parameter, add it to the OpenAPI spec. Regenerate `@durion-sdk/inventory`.

---

#### 2e. Accounting (`accounting.service.ts`)

**Status:**

| Method                       | Status     | Notes                                                            |
| ---------------------------- | ---------- | ---------------------------------------------------------------- |
| `listCreditMemos()`          | ✅ Done    | → `CreditMemosService.listCreditMemos()`                         |
| `getEvent()`                 | ✅ Done    | Already uses `AccountingEventsService.getEvent()`                |
| `submitEvent()`              | ✅ Done    | Already uses `AccountingEventsService.submitEvent()`             |
| `retryEvent()`               | ✅ Done    | Already uses `AccountingEventsService.retryEventProcessing()`    |
| `reprocessSuspendedEvent()`  | ✅ Done    | Already uses `AccountingEventsService.reprocessSuspendedEvent()` |
| `getReprocessingHistory()`   | ✅ Done    | Already uses `AccountingEventsService.getReprocessingHistory()`  |
| `getInvoiceStatus()`         | ✅ Done    | Already uses `InvoicePaymentsService.getInvoiceStatus()`         |
| `listPostingRuleSets()`      | ✅ Done    | Already uses `PostingRulesService.listPostingRuleSets()`         |
| `getPostingRuleSet()`        | ✅ Done    | Already uses `PostingRulesService.getPostingRuleSet()`           |
| `createPostingRuleSet()`     | ✅ Done    | Already uses `PostingRulesService.createPostingRuleSet()`        |
| `updatePostingRuleSet()`     | ✅ Done    | Already uses `PostingRulesService.updatePostingRuleSet()`        |
| `publishPostingRuleSet()`    | ✅ Done    | Already uses `PostingRulesService.publishPostingRuleSet()`       |
| `archivePostingRuleSet()`    | ✅ Done    | Already uses `PostingRulesService.archivePostingRuleSet()`       |
| `applyPayment()`             | ✅ Done    | Already uses `PaymentApplicationsService.applyPayment()`         |
| `getCreditMemo()`            | ✅ Done    | Already uses `CreditMemosService.getCreditMemo()`                |
| `createCreditMemo()`         | ✅ Done    | Already uses `CreditMemosService.createCreditMemo()`             |
| `listBillsByVendor()`        | ✅ Done    | Already uses `APPaymentsService.listBills()`                     |
| `executePayment()`           | ✅ Done    | Already uses `APPaymentsService.executePayment()`                |
| `getPayment()`               | ✅ Done    | Already uses `APPaymentsService.getPayment()`                    |
| `getPaymentByRef()`          | ✅ Done    | Already uses `APPaymentsService.getPaymentByRef()`               |
| `listEvents()`               | 🔴 Blocked | See B-16 below                                                   |
| `getEventProcessingLog()`    | 🔴 Blocked | See B-17 below                                                   |
| `listBills()`                | 🔴 Blocked | See B-18 below                                                   |
| `requestExport()`            | 🔴 Blocked | See B-19 below                                                   |
| `getExportStatus()`          | 🔴 Blocked | See B-19 below                                                   |
| `getExportHistory()`         | 🔴 Blocked | See B-19 below                                                   |
| `getEventEnvelopeContract()` | 🔴 Blocked | See B-20 below                                                   |

**B-16 — `listEvents()`: SDK requires mandatory `organizationId`; other filters missing**

- **Current call:** `GET /v1/accounting/events?page=0&size=20&{optional filters}` — all filters are optional including `organizationId`.
- **SDK method:** `AccountingEventsService.listEvents(organizationId: string, page?, size?, status?)` — `organizationId` is a required first argument; only `status` is supported as a filter beyond pagination.
- **Required:** (a) Update the `GET /v1/accounting/events` OpenAPI operation to make `organizationId` optional (if the backend supports calling without it), and (b) expose the remaining supported query parameters — `eventType`, `idempotencyOutcome`, `receivedAtFrom`, `receivedAtTo`, `eventId`, `ingestionId`, `domainKeyId`, `invoiceId` — in the spec. Regenerate `@durion-sdk/accounting`. The frontend method can then be migrated once the SDK method accepts all current filters.

**B-17 — `getEventProcessingLog()`: SDK returns `string`, frontend expects `EventProcessingLogEntry[]`**

- **Current call:** `GET /v1/accounting/events/{eventId}/processing-log` — frontend treats the response as `EventProcessingLogEntry[]`.
- **SDK method:** `AccountingEventsService.getEventProcessingLog(eventId)` → `Observable<string>` — generated with a `text/plain` or `application/json` string response type.
- **Required:** If the backend actually returns a JSON array, correct the OpenAPI spec response schema for this operation from `string` to `array<EventProcessingLogEntry>` (define the `EventProcessingLogEntry` schema if not already present). Regenerate `@durion-sdk/accounting`, then migrate.

**B-18 — `listBills()`: SDK `listBills(vendorId)` requires a vendor; frontend wants a paged list of all bills**

- **Current call:** `GET /v1/accounting/ap/bills?page={page}&size={size}` — returns all AP bills paged with no vendor filter.
- **SDK method:** `APPaymentsService.listBills(vendorId: string)` — `vendorId` is required, returns `VendorBillSummaryResponse[]` (unpaged).
- **Required:** Add a separate paged `GET /v1/accounting/ap/bills` operation (no required `vendorId`) to the accounting OpenAPI spec. Alternatively, if the current `listBills(page, size)` call site always has a vendor in context, update the frontend method signature to accept `vendorId` and route through the existing SDK method. Confirm with product which behaviour is correct.

**B-19 — `requestExport()` / `getExportStatus()` / `getExportHistory()`: timekeeping export path ≠ financial reports SDK path**

- **Current calls:** All three call `/v1/accounting/export/…` — a timekeeping/payroll export endpoint.
- **SDK methods:** `FinancialReportingService.requestExport()`, `.getExportStatus()`, `.getExportHistory()` call `/v1/accounting/reports/export/…` — a financial statement export endpoint.
- **These are different backend domains.** The timekeeping export endpoints are absent from the accounting OpenAPI spec entirely.
- **Required:** Add the three timekeeping export operations to the accounting OpenAPI spec:
  - `POST /v1/accounting/export/request` with body `{ startDate, endDate, locationIds, format }` and `Idempotency-Key` header support.
  - `GET /v1/accounting/export/status?exportId={exportId}`.
  - `GET /v1/accounting/export/history?pageIndex={pageIndex}&pageSize={pageSize}`.
    Regenerate `@durion-sdk/accounting`. The `FinancialReportingService` migrations (financial reports) are unrelated and remain unblocked.

**B-20 — `getEventEnvelopeContract()`: endpoint absent from SDK**

- **Current call:** `GET /v1/accounting/events/contract` — returns the canonical accounting event envelope schema.
- **SDK state:** No method for this endpoint exists in `AccountingEventsService`.
- **Required:** Add `GET /v1/accounting/events/contract` to the accounting OpenAPI spec (response schema: `EventEnvelopeContract`). Regenerate `@durion-sdk/accounting`.

---

#### 2f. CRM (`crm.service.ts`, `crm-integration.service.ts`)

**`crm.service.ts` — status:**

| Method                                         | Status     | Notes                                                           |
| ---------------------------------------------- | ---------- | --------------------------------------------------------------- |
| `listBillingTerms()` (was `getBillingTerms`)   | ✅ Done    | Renamed to match SDK; → `CRMAccountsService.listBillingTerms()` |
| All other party/contact/person/vehicle methods | ✅ Done    | Already using `@durion-sdk/customer` services                   |
| `checkCommercialAccountDuplicates()`           | 🔴 Blocked | See B-21 below                                                  |
| `upsertBillingRules()`                         | 🔴 Blocked | See B-22 below                                                  |

`crm-integration.service.ts` — already uses `AccountingEventsService`; no `ApiBaseService` remaining.

**B-21 — `checkCommercialAccountDuplicates()`: duplicate-check endpoint absent from SDK**

- **Current call:** `GET /v1/crm/accounts/parties/search?legalName={legalName}&duplicateCheck=true` → `DuplicateCheckResponse`.
- **SDK state:** `CRMAccountsService.searchParties(SearchPartiesRequest)` covers party search but the `duplicateCheck=true` variant produces a different response type (`DuplicateCheckResponse`) and is not generated as a separate operation.
- **Required:** Add `GET /v1/crm/accounts/parties/duplicate-check?legalName={legalName}` (or a dedicated `checkDuplicates` operation on the existing search endpoint) to the customer OpenAPI spec with `DuplicateCheckResponse` as the response schema. Regenerate `@durion-sdk/customer`.

**B-22 — `upsertBillingRules()`: PUT endpoint absent from SDK**

- **Current call:** `PUT /v1/crm/accounts/parties/{partyId}/billing-rules` with the billing rules payload.
- **SDK state:** `CRMSnapshotsService.getBillingRules(partyId)` covers the GET; the PUT is not generated.
- **Required:** Add `PUT /v1/crm/accounts/parties/{partyId}/billing-rules` to the customer OpenAPI spec with the billing rules request/response schemas. Regenerate `@durion-sdk/customer`.

---

**Wave 2 acceptance criteria (per domain):**

- [ ] No `ApiBaseService` import in the service file.
- [ ] All methods return `Observable<SdkType>` with no intermediate casts.
- [ ] `ng build` passes after each domain migration.
- [ ] Existing component tests pass (or are updated to mock the SDK service rather than
      `ApiBaseService`).

**Wave 2 summary — migrated vs blocked (2026-04-26):**

| Sub-wave | Service                        | Migrated                                       | Remaining blockers |
| -------- | ------------------------------ | ---------------------------------------------- | ------------------ |
| 2a       | `security.service.ts`          | `createRole`, `createUser`                     | B-1, B-2           |
| 2a       | `security-audit.service.ts`    | —                                              | B-3, B-4           |
| 2b       | `bulk-import.service.ts`       | `retryJob`, `listAuditRecords`                 | B-5                |
| 2c       | `inventory.service.ts`         | —                                              | B-6 through B-12   |
| 2d       | `product-catalog.service.ts`   | all except `listCostStructures`                | B-13               |
| 2d       | `product-inventory.service.ts` | `queryInventoryAvailability`                   | B-14, B-15         |
| 2e       | `accounting.service.ts`        | `listCreditMemos` + 17 methods already on SDK  | B-16 through B-20  |
| 2f       | `crm.service.ts`               | `listBillingTerms` + all party/contact methods | B-21, B-22         |

---

### Wave 3 — Delete Local Model Files

**Goal:** Delete local type definition files that duplicate SDK models, replacing
import sites with `@durion-sdk/*` imports.

Do this domain-by-domain, immediately after the corresponding service in Wave 2 is
merged. Do not batch all deletes into a single PR — the diff will be unreviable and
merge conflicts will multiply.

#### Deletion candidates

| File                                       | LOC | Delete when                                                                    |
| ------------------------------------------ | --- | ------------------------------------------------------------------------------ |
| `workexec/models/workexec.models.ts`       | 699 | After `workexec.service.ts` cast cleanup complete                              |
| `inventory/models/inventory.models.ts`     | 429 | After Wave 2c (`inventory.service.ts`) merged                                  |
| `accounting/models/accounting.models.ts`   | 348 | After Wave 2e (`accounting.service.ts`) merged                                 |
| `crm/models/crm.models.ts`                 | 245 | After Wave 2f (`crm.service.ts`) merged                                        |
| `billing/models/billing.models.ts`         | 225 | After billing service is implemented (out of scope of this PRD — keep for now) |
| `bulk-import/models/bulk-import.models.ts` | 115 | After Wave 2b (`bulk-import.service.ts`) merged                                |
| `product/models/product.models.ts`         | 53  | After Wave 2d (`product-catalog.service.ts`) merged                            |
| `security/models/security.models.ts`       | 46  | After Wave 2a (`security.service.ts`) merged                                   |
| `security/models/security-audit.models.ts` | 38  | After Wave 2a (`security-audit.service.ts`) merged                             |
| `crm/models/crm-integration.models.ts`     | 36  | After Wave 2f                                                                  |
| `product/models/cost.models.ts`            | 39  | After Wave 2d                                                                  |
| `product/models/pricing.models.ts`         | 72  | After Wave 2d                                                                  |
| `core/models/auth.models.ts`               | 25  | After Wave 4 (auth migration)                                                  |

Files to **keep** (not SDK-duplicates):

- `shopmgmt/models/appointment.models.ts` — review: may duplicate `@durion-sdk/shop-manager`; audit separately
- `shopmgmt/models/dispatch-board.models.ts` — same
- `product/models/availability.models.ts` — check if covered by `@durion-sdk/inventory`
- `product/models/location.models.ts` — check if covered by `@durion-sdk/location`
- `shell/models/nav-item.model.ts` — frontend-only UI model; keep

#### Deletion procedure (per file)

1. Find all import sites: `grep -rn "from '.*models/<file>'" src/`.
2. For each import site, replace the local type with the equivalent `@durion-sdk/*`
   import. IDE "find usages" is safer than manual grep.
3. Delete the model file.
4. Compile: `ng build`. Fix any missed import sites.
5. Run tests: `ng test`. Update mocks that used local types.

**Wave 3 acceptance criteria:**

- [ ] Each deleted model file has zero remaining import sites.
- [ ] `ng build` passes after each deletion.
- [ ] Total local model LOC (excluding `billing.models.ts` and nav model) reduced to
      zero.

---

### Wave 4 — Auth Service Migration and ApiBaseService Retirement

#### 4a. Auth service (`auth.service.ts`)

`auth.service.ts` uses raw `HttpClient` with manual JWT parsing and localStorage
management. The SDK has `AuthAPIService` and `JWTAPIService` in `@durion-sdk/security`.

**Migration approach:**

1. Inject `AuthAPIService` and `JWTAPIService` from `@durion-sdk/security`. Do not
   remove the `signal`-based token state (`_accessToken`, `_refreshToken`, `_roles`) —
   the interceptor and route guards depend on these signals and they are frontend-only
   concerns that the SDK does not replace.
2. Replace the three `HttpClient` calls:
   - `login(req)` → `AuthAPIService.login(loginRequest)`, then write the token signals
     from the response.
   - `refresh()` → `JWTAPIService.refreshToken(refreshTokenRequest)`, then write the
     token signals.
   - `logout()` → `AuthAPIService.logout()` (fire-and-forget; clear signals regardless
     of result).
3. Remove the `HttpClient` injection and the direct `environment.apiBaseUrl` usage.
4. Delete `core/models/auth.models.ts` if all types it contains are covered by SDK
   models; otherwise retain only the frontend-only types (`JwtClaims` signal shape).

**Why last:** Auth is the highest-risk service. A regression here locks every user out.
Ensure Wave 1–3 are fully merged and stable before touching auth.

#### 4b. Retire ApiBaseService

Once Wave 2 is complete and `auth.service.ts` is migrated:

1. Verify only `chat-api.service.ts` still imports `ApiBaseService`:

   ```bash

   grep -rn "ApiBaseService" src/ --include="*.ts" | grep -v "chat-api\|api-base.service\|spec"

   ```

2. If zero results: mark `ApiBaseService` as `@deprecated` with a comment pointing to
   `chat-api.service.ts` as its sole remaining consumer.
3. Optional (later): if chat/MCP integration ever moves to its own SDK package, delete
   `ApiBaseService` entirely.

**Wave 4 acceptance criteria:**

- [ ] `auth.service.ts` has no `HttpClient` injection.
- [ ] Login, refresh, and logout flows work end-to-end (manual test required).
- [ ] `grep -rn "ApiBaseService" src/ --include="*.ts" | grep -v "chat-api\|api-base"` returns
      zero results.
- [ ] `ng build --configuration production` passes.

---

## Build Plan

Execute each blocker slice in this order. Do not start frontend migration for a blocker
until the upstream contract work for that blocker has passed.

### Backend Contract Gate

- Implement or correct the backend operation for the active blocker group.
- Run the affected backend module test slice.
- Regenerate the affected `pos-*/openapi.yaml` file.

### SDK Regeneration Gate

- Regenerate the affected Angular SDK package from the updated OpenAPI spec.
- Build the Angular SDK workspace and confirm the new service method exists with the
  expected types.

### Frontend Migration Gate

- Replace the direct `ApiBaseService` call in the feature service.
- Remove related casts and align local interfaces to the generated models.
- Update focused specs and page behavior as needed.

### Frontend Verification Gate

- Run a production build.
- Run targeted Angular tests for the touched feature domain.
- Rerun the grep-based migration checks relevant to the current wave.

Recommended commands by repository:

```bash
# durion-positivity-backend
./mvnw -pl <module> -am test --no-transfer-progress
scripts/generate-openapi.sh <module>

# durion-positivity-sdk-angular
scripts/generate-openapi.sh --module <sdk-module>
npm run build

# durion-positivity-frontend
npm run build
npx ng test --include="src/app/features/<domain>/**/*.spec.ts" --no-watch
```

For multi-module blocker groups, keep the same sequence but run it module-by-module so
contract drift is isolated and reviewable.

---

## Verification Gates

Run these at the end of each wave before opening a PR.

```bash
# Type check
ng build --configuration production

# Unit tests
ng test --watch=false --browsers=ChromeHeadless

# Confirm no domain services still import ApiBaseService (after Wave 4)
grep -rn "ApiBaseService" src/ --include="*.ts" | grep -v "chat-api\|api-base.service\|spec"

# Confirm no type cast violations remain
grep -rn "as never\|as unknown" src/ --include="*.ts" | grep -v "spec\|test-proxy"

# Confirm local model files are gone (after Wave 3)
find src/ -name "*.models.ts" | grep -v "nav-item\|auth\|billing\|shopmgmt\|availability\|location"

# Confirm published-SDK adoption cleanup is complete before final signoff
rg -n "\\.sdk-src|\\.sdk-tarballs|DURION_SDK_" .
```

---

## Definition of Done

- [ ] Zero `ApiBaseService` imports in non-gateway, non-spec `.ts` files.
- [ ] Zero `as never` / `as unknown` casts involving SDK model types.
- [ ] Local model files deleted for all domains where the SDK provides equivalent
      types (billing excluded pending billing service implementation).
- [ ] `auth.service.ts` does not use `HttpClient` directly.
- [ ] Frontend consumes published/private-registry `@durion-sdk/*` packages per
      `PRD-sdk-publication-transition.md`.
- [ ] Standard frontend build paths do not require SDK checkout, local packing, or
      tarball injection.
- [ ] `ng build --configuration production` passes with zero warnings related to type
      safety.
- [ ] All unit tests pass.

---

## Wave Summary

| Wave   | Work                                                                                                | Merge order                                             |
| ------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **1**  | Resolve all 149 type casts — update local interfaces to match SDK models, remove casts              | First; unblocks all other waves                         |
| **2a** | Security service + audit service                                                                    | After Wave 1 (security)                                 |
| **2b** | Bulk import service                                                                                 | After Wave 1 (bulk-import)                              |
| **2c** | Inventory domain service                                                                            | After Wave 1 (inventory)                                |
| **2d** | Product catalog + product inventory services                                                        | After Wave 1 (product)                                  |
| **2e** | Accounting service                                                                                  | After Wave 1 (accounting) + Category B backend deployed |
| **2f** | CRM service                                                                                         | After Wave 1 (CRM) + Category B backend deployed        |
| **3**  | Delete local model files domain-by-domain                                                           | After corresponding Wave 2 PR                           |
| **4a** | Auth service migration                                                                              | After Waves 1–3 stable                                  |
| **4b** | ApiBaseService retirement                                                                           | After Wave 4a                                           |
| **5**  | Published-SDK adoption and local-pack build-path retirement per `PRD-sdk-publication-transition.md` | Required before final migration signoff                 |
