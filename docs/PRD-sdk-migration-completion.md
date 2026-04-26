# PRD: Angular SDK Migration Completion

**Status:** Ready for Development  
**Date:** 2026-04-25  
**Owner:** Frontend Platform  
**Prerequisite:** `durion-positivity-backend` PRD-missing-backend-endpoints.md — all five
Category B endpoint groups implemented, OpenAPI specs regenerated, Angular SDK
regenerated.  
**Reference:** `sdk-migration-analysis.md` in this directory

---

## Objective

Complete the migration of `durion-positivity-frontend` from direct `ApiBaseService`
HTTP calls to the typed Angular SDK (`durion-positivity-sdk-angular`). Once finished,
`ApiBaseService` is scoped exclusively to gateway/MCP traffic (`chat-api.service.ts`)
and all domain services consume strongly-typed SDK observables.

---

## Current State

| Metric | Count |
|--------|-------|
| Files still importing `ApiBaseService` (domain services) | 22 |
| `as never` / `as unknown` type casts | 149 |
| Local model files (duplicating SDK types) | ~2,370 LOC across 13 files |
| Domains with zero remaining direct API calls | 5 (Order, Shop Management, Location, People, Inventory/PO) |
| Domains partially or fully blocked on direct API | 9 |

The cast count (149) is the leading indicator of migration quality. It represents places
where the frontend's local type definitions have drifted from the SDK-generated types.
Resolving casts and deleting the corresponding local models is the central work of this
PRD.

---

## Non-Goals

- Backend changes — the prerequisite PRD covers those.
- New product features.
- `chat-api.service.ts` — intentionally uses direct HTTP for MCP/gateway endpoints;
  leave it alone.
- `auth.service.ts` — see Wave 4; included but treated as a separate, careful task.
- Component-level `as` casts unrelated to SDK type mismatches (e.g. template binding
  coercions) — fix only casts that involve SDK model types.

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

| Service / File | Cast count | Primary cause |
|----------------|-----------|---------------|
| `workexec.service.ts` | 29 | `workexec.models.ts` interfaces diverged from `@durion-sdk/workorder` |
| `product-catalog.service.ts` | 35 | `product.models.ts` + `pricing.models.ts` vs `@durion-sdk/catalog` |
| `accounting.service.ts` | 19 | `accounting.models.ts` vs `@durion-sdk/accounting` |
| `crm.service.ts` | 9 | `crm.models.ts` vs `@durion-sdk/customer` |
| `bulk-import.service.ts` | 6 | `bulk-import.models.ts` vs `@durion-sdk/bulk-loader` |
| `inventory-cycle-count.service.ts` | 7 | `inventory.models.ts` vs `@durion-sdk/inventory` |
| `inventory-receiving.service.ts` | 6 | `inventory.models.ts` vs `@durion-sdk/inventory` |
| `inventory-purchase-order.service.ts` | 5 | `inventory.models.ts` vs `@durion-sdk/inventory` |
| `security.service.ts` | 2 | `security.models.ts` vs `@durion-sdk/security` |
| `product-inventory.service.ts` | 1 | product models vs `@durion-sdk/inventory` |
| `product-location.service.ts` | 3 | location models vs `@durion-sdk/location` |
| Workexec components (3 files) | 5 | same workexec contract drift |
| Other components (people, shopmgmt, location) | ~22 | scattered |

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

Services are ordered by ascending complexity. Each sub-section is a self-contained
unit of work.

---

#### 2a. Security (`security.service.ts`, `security-audit.service.ts`)

Both services still make 6 + 5 = 11 direct calls. The SDK already has all the
required methods.

**`security.service.ts` — remaining direct calls:**

| Method | SDK replacement |
|--------|----------------|
| `createRole(...)` | `RoleManagementService.createRole(requestBody)` from `@durion-sdk/security` |
| `getAllPermissions()` | `PermissionRegistryService.getAllPermissions(domain)` from `@durion-sdk/security` |
| `createUser(...)` | `UserAPIService.createUser(requestBody)` from `@durion-sdk/security` |
| `searchAudit(...)` | `AuditService.searchAudit(...)` from `@durion-sdk/security` |

**`security-audit.service.ts`** — inject `AuditService` from `@durion-sdk/security`
and replace all direct calls. This service currently uses `ApiBaseService` for all
5 of its methods.

Inject `SecurityConfiguration` (already provided in `app.config.ts`).

---

#### 2b. Bulk Import (`bulk-import.service.ts`)

**Remaining direct calls → SDK replacements:**

| Method | SDK replacement |
|--------|----------------|
| `retryJob(jobId)` | `BulkLoadJobsAPIService.retryJob(jobId)` — newly generated from Category B |
| `listAuditRecords(jobId)` | `ReviewQueueAPIService.getAuditRecords(jobId)` — already in SDK |
| `submitCorrection(jobId, req)` | `ReviewQueueAPIService.submitCorrection(jobId, req)` — newly generated from Category B |
| `getErrorReportUrl(jobId)` | `ReviewQueueAPIService.downloadErrorReport(jobId)` — returns `Observable<Blob>`; wrap to produce a download URL via `URL.createObjectURL()` in the component or a thin service helper |

Inject `BulkLoaderConfiguration` (already provided).

---

#### 2c. Inventory Domain (`inventory.service.ts`)

This service has 14 methods, all still on `ApiBaseService`. The SDK package
`@durion-sdk/inventory` already covers these operations.

**Migration map:**

| Direct path | SDK service | SDK method |
|------------|-------------|------------|
| `GET /inventory/v1/availability` | `InventoryAvailabilityService` | `getAvailability(...)` |
| `GET /inventory/v1/locations` | `InventoryLocationsService` | `listLocations(...)` |
| `GET /inventory/v1/locations/storage` | `InventoryLocationsService` | `getStorageLocations(...)` |
| `GET /inventory/v1/locations/zones` | `InventoryLocationsService` | `getZones(...)` |
| `GET /inventory/v1/ledger` | `InventoryLedgerService` | `getLedger(...)` |
| `GET /inventory/v1/ledger/{id}` | `InventoryLedgerService` | `getLedgerEntry(id)` |
| `GET /inventory/v1/putaway/tasks` | `PutawayService` | `getPutawayTasks(...)` |
| `POST /inventory/v1/putaway/tasks/{id}/complete` | `PutawayService` | `completePutawayTask(id, ...)` |
| `GET /inventory/v1/replenishment/tasks` | `ReplenishmentService` | `getReplenishmentTasks(...)` |
| `GET /inventory/v1/returnable-items` | `ReturnsService` | `getReturnableItems(...)` |
| `GET /inventory/v1/reasons` | `ReturnsService` | `getReturnReasons(...)` |
| `POST /inventory/v1/returns` | `ReturnsService` | `createReturn(...)` |
| `GET /inventory/v1/shortage-options` | `ShortageService` | `getShortageOptions(...)` |
| `POST /inventory/v1/shortage/{id}/resolve` | `ShortageService` | `resolveShortage(id, ...)` |

Verify exact method names against
`packages/sdk-inventory/src/apis/` before implementing — generated names may differ
slightly from this table. Inject `InventoryConfiguration` (already provided).

Also audit `inventory-cycle-count.service.ts` and `inventory-receiving.service.ts`:
both already import from `@durion-sdk/inventory` but still have 7 and 6 casts
respectively (resolved in Wave 1). After Wave 1 those services should be clean; verify
no `ApiBaseService` usage remains.

---

#### 2d. Product Catalog (`product-catalog.service.ts`, `product-inventory.service.ts`)

**`product-catalog.service.ts`** has 35 casts (resolved in Wave 1) and one remaining
direct call:

| Method | SDK replacement |
|--------|----------------|
| `listCostStructures(itemId?, supplierId?)` | `SupplierItemCostAPIService.listCostStructures(itemId, supplierId)` — newly generated from Category B |

All other methods in this service should already be using SDK services; confirm no
`ApiBaseService` usage remains after the Wave 1 cast cleanup.

**`product-inventory.service.ts`** has 1 cast and imports `ApiBaseService`. Audit the
remaining direct call(s) and replace with the appropriate `@durion-sdk/inventory`
service method.

---

#### 2e. Accounting (`accounting.service.ts`)

The accounting service has 19 casts (resolved in Wave 1) and the largest remaining
migration surface. After Wave 1 cast resolution and the Category B backend work, the
remaining direct calls are:

| Method | SDK replacement |
|--------|----------------|
| `requestExport(req)` | `FinancialReportingService.requestExport(req)` — newly generated |
| `getExportStatus(exportId)` | `FinancialReportingService.getExportStatus(exportId)` — newly generated |
| `getExportHistory(...)` | `FinancialReportingService.getExportHistory(...)` — newly generated |
| `getBillingTerms()` | See CRM section — billing terms live in `pos-customer`, not accounting |

Note: `getEventProcessingLog` is already in the SDK (`AccountingEventsService
.getEventProcessingLog(eventId)`). If it is still calling direct API after Wave 1
cast cleanup, migrate it here.

---

#### 2f. CRM (`crm.service.ts`, `crm-integration.service.ts`)

**`crm.service.ts`** remaining direct calls after Wave 1:

| Method | SDK replacement |
|--------|----------------|
| `getBillingTerms()` | `CRMAccountsService.getBillingTerms()` — newly generated from Category B (`sdk-customer`) |
| `checkCommercialAccountDuplicates(req)` | Verify whether a SDK method exists post-regeneration; if not, this endpoint may also be missing from the backend and needs its own Category B ticket |
| `upsertBillingRules(partyId, req)` | Verify against `sdk-customer` post-regeneration |

`crm-integration.service.ts` already uses `AccountingEventsService` — confirm it is
clean after Wave 1.

---

**Wave 2 acceptance criteria (per domain):**

- [ ] No `ApiBaseService` import in the service file.
- [ ] All methods return `Observable<SdkType>` with no intermediate casts.
- [ ] `ng build` passes after each domain migration.
- [ ] Existing component tests pass (or are updated to mock the SDK service rather than
  `ApiBaseService`).

---

### Wave 3 — Delete Local Model Files

**Goal:** Delete local type definition files that duplicate SDK models, replacing
import sites with `@durion-sdk/*` imports.

Do this domain-by-domain, immediately after the corresponding service in Wave 2 is
merged. Do not batch all deletes into a single PR — the diff will be unreviable and
merge conflicts will multiply.

#### Deletion candidates

| File | LOC | Delete when |
|------|-----|-------------|
| `workexec/models/workexec.models.ts` | 699 | After `workexec.service.ts` cast cleanup complete |
| `inventory/models/inventory.models.ts` | 429 | After Wave 2c (`inventory.service.ts`) merged |
| `accounting/models/accounting.models.ts` | 348 | After Wave 2e (`accounting.service.ts`) merged |
| `crm/models/crm.models.ts` | 245 | After Wave 2f (`crm.service.ts`) merged |
| `billing/models/billing.models.ts` | 225 | After billing service is implemented (out of scope of this PRD — keep for now) |
| `bulk-import/models/bulk-import.models.ts` | 115 | After Wave 2b (`bulk-import.service.ts`) merged |
| `product/models/product.models.ts` | 53 | After Wave 2d (`product-catalog.service.ts`) merged |
| `security/models/security.models.ts` | 46 | After Wave 2a (`security.service.ts`) merged |
| `security/models/security-audit.models.ts` | 38 | After Wave 2a (`security-audit.service.ts`) merged |
| `crm/models/crm-integration.models.ts` | 36 | After Wave 2f |
| `product/models/cost.models.ts` | 39 | After Wave 2d |
| `product/models/pricing.models.ts` | 72 | After Wave 2d |
| `core/models/auth.models.ts` | 25 | After Wave 4 (auth migration) |

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
```

---

## Definition of Done

- [ ] Zero `ApiBaseService` imports in non-gateway, non-spec `.ts` files.
- [ ] Zero `as never` / `as unknown` casts involving SDK model types.
- [ ] Local model files deleted for all domains where the SDK provides equivalent
  types (billing excluded pending billing service implementation).
- [ ] `auth.service.ts` does not use `HttpClient` directly.
- [ ] `ng build --configuration production` passes with zero warnings related to type
  safety.
- [ ] All unit tests pass.

---

## Wave Summary

| Wave | Work | Merge order |
|------|------|-------------|
| **1** | Resolve all 149 type casts — update local interfaces to match SDK models, remove casts | First; unblocks all other waves |
| **2a** | Security service + audit service | After Wave 1 (security) |
| **2b** | Bulk import service | After Wave 1 (bulk-import) |
| **2c** | Inventory domain service | After Wave 1 (inventory) |
| **2d** | Product catalog + product inventory services | After Wave 1 (product) |
| **2e** | Accounting service | After Wave 1 (accounting) + Category B backend deployed |
| **2f** | CRM service | After Wave 1 (CRM) + Category B backend deployed |
| **3** | Delete local model files domain-by-domain | After corresponding Wave 2 PR |
| **4a** | Auth service migration | After Waves 1–3 stable |
| **4b** | ApiBaseService retirement | After Wave 4a |
