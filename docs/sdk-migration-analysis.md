# SDK Migration Analysis: Direct API → Angular SDK

**Date:** 2026-04-25
**Branch analyzed:** master
**Overall status:** In-progress — approximately 60% complete

---

## Background

The frontend is being converted from making direct HTTP calls to `durion-positivity-backend` (via a shared `ApiBaseService` wrapper around `HttpClient`) to using generated Angular SDK packages from `durion-positivity-sdk-angular`.

---

## SDK Architecture

The SDK is a monorepo of 20 domain-scoped packages under `@durion-sdk/*`, generated from OpenAPI specs via `typescript-angular` (OpenAPI Generator 7.5.0). Key characteristics:

- All service classes are `@Injectable({ providedIn: 'root' })` for tree-shaking
- All methods return `Observable<T>` (RxJS-native)
- Configured per-package via a shared `Configuration` class with `basePath`
- Generated code in `src/apis/` and `src/models/` — not manually edited
- Hand-written workflow helpers in `src/workflows/`
- Shared transport in `@durion-sdk/transport` with unified error handling

**Packages imported in `package.json`:**
`@durion-sdk/accounting`, `@durion-sdk/catalog`, `@durion-sdk/customer`, `@durion-sdk/inventory`, `@durion-sdk/invoice`, `@durion-sdk/location`, `@durion-sdk/order`, `@durion-sdk/people`, `@durion-sdk/security`, `@durion-sdk/shop-manager`, `@durion-sdk/workorder`

**Configuration:** `app.config.ts` provides all 11 `XXXConfiguration` instances via factory, each reading `environment.apiBaseUrl`. This is correct and complete.

---

## Migration Status by Domain

### Fully Migrated

| Domain                          | Files                                 | Notes                                                                                      |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Order**                       | `order-cart-page.component.ts`        | Uses `SalesOrdersService`, `OrderCancellationService`, `PriceOverridesService`             |
| **Shop Management**             | `appointment.service.ts`              | Uses `AppointmentsAPIService`, `AssignmentControllerService`, `ConflictOverrideAPIService` |
| **Location**                    | `location.service.ts`                 | Uses `LocationAPIService`, `BayAPIService`, `MobileUnitAPIService`                         |
| **Inventory (Purchase Orders)** | `inventory-purchase-order.service.ts` | Uses `PurchaseOrdersService`                                                               |
| **People**                      | Various component files               | Components consume SDK services directly                                                   |

These domains have no `ApiBaseService` usage and are in good shape.

### Partially Migrated

| Domain                 | SDK% | Remaining Direct API Calls                                                                                                         |
| ---------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Workorder**          | ~80% | `retryJob` in bulk-import; 700+ LOC of local models                                                                                |
| **CRM**                | ~75% | `getBillingTerms`, `checkCommercialAccountDuplicates`, `upsertBillingRules`                                                        |
| **Accounting**         | ~75% | `getEventProcessingLog`, `listCreditMemos`, `listBills`, `requestExport`, `getExportStatus`, `getExportHistory`, `getBillingTerms` |
| **Product Catalog**    | ~70% | `listCostStructures` (`/catalog/v1/supplier-costs`)                                                                                |
| **Bulk Import**        | ~70% | `retryJob`, `listAuditRecords`, `submitCorrection`, `getErrorReportUrl`                                                            |
| **Security**           | ~60% | `createRole`, `getAllPermissions`, `createUser`, `searchAudit`                                                                     |
| **Inventory (Domain)** | ~40% | Most queries: availability, ledger, locations, putaway tasks                                                                       |

### Not Migrated

| Domain                               | Reason                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------ |
| **Auth** (`auth.service.ts`)         | Uses raw `HttpClient`; SDK has `AuthAPIApiService` but it's not wired in |
| **Chat/MCP** (`chat-api.service.ts`) | Gateway/MCP endpoints, not domain APIs — intentionally direct            |
| **Billing/Invoice**                  | No service implemented; components stub or mock                          |

---

## Quality Issues

### Critical: Type Safety

There are 50+ instances of `as never` and `as unknown` casts scattered through migrated services:

```typescript
// crm.service.ts
return this.accountsApi.createCommercialAccount(
  request as never,
) as Observable<CreateCommercialAccountResponse>;

// product-catalog.service.ts
return this.productsSdk.searchProducts(query) as unknown as Observable<ProductSummary[]>;
```

These indicate that the SDK-generated types do not match the shapes the frontend expects. The casts suppress compiler errors rather than resolving the contract mismatch. This is high-risk: if the SDK regenerates, type errors will resurface everywhere simultaneously.

**Recommendation:** Audit every `as never` / `as unknown` cast. Either update the local model to match the SDK model, or update the SDK spec to match the intended contract. Remove all casts once resolved.

### High: Duplicate Type Definitions (~2,500 LOC)

Local model files duplicate SDK-generated models:

| File                                     | ~LOC | Domain                                 |
| ---------------------------------------- | ---- | -------------------------------------- |
| `workexec/models/workexec.models.ts`     | 699  | Mirrors `@durion-sdk/workorder` models |
| `inventory/models/inventory.models.ts`   | 429  | Mirrors `@durion-sdk/inventory` models |
| `accounting/models/accounting.models.ts` | 348  | Mixed; some types redundant            |
| `crm/models/crm.models.ts`               | 245  | Mirrors `@durion-sdk/customer` models  |
| `billing/models/billing.models.ts`       | 225  | Not yet matched to SDK                 |

These create a dual-maintenance burden. Any backend contract change must be reflected both in the regenerated SDK and in these local files. The local definitions are already drifting from the SDK types, which is why the casts exist.

**Recommendation:** After resolving the type cast issues above, delete local model definitions that are covered by the SDK and import directly from `@durion-sdk/*`. This should be done domain-by-domain alongside completing the migration of that domain's service.

### Medium: Mixed Patterns in Same Service

Several services make some calls via SDK services and others via `ApiBaseService` in the same class. This is the most error-prone state because it obscures which backend version or contract applies to each call:

- `accounting.service.ts` — SDK for event queries, direct for export/billing-terms
- `crm.service.ts` — SDK for party/relationship ops, direct for billing-terms/duplicates
- `inventory.service.ts` — SDK for purchase orders only; availability/ledger still direct

**Recommendation:** When completing a domain's migration, finish all calls in that service before moving on. A partially-migrated service is worse than a not-yet-migrated one because the inconsistency is invisible to callers.

### Medium: Inconsistent Error Handling

- SDK services return typed errors via `DurionSdkError` (from `@durion-sdk/transport`)
- `ApiBaseService` has its own generic error path

Components and services that call both patterns must handle two error shapes. Once `ApiBaseService` is fully retired this resolves itself.

### Low: Manual `HttpParams` Construction

13+ services still manually construct `HttpParams` for query parameters. This is error-prone (encoding bugs, typos in parameter names) and is eliminated automatically when using SDK-generated methods that accept typed parameter objects.

---

## Root Cause of Remaining Direct API Calls

The remaining direct API calls fall into two distinct categories with different remediation paths.

### Category A: SDK exists, frontend just isn't using it

These endpoints have both a backend implementation and a generated SDK service. The frontend is calling them via `ApiBaseService` out of oversight. They can be migrated immediately with no backend or SDK changes:

| Call                            | SDK Service                                    | Method                                                                  |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `createRole`                    | `sdk-security` `roleManagement.service.ts`     | `createRole()`                                                          |
| `getAllPermissions`             | `sdk-security` `permissionRegistry.service.ts` | `getAllPermissions()`                                                   |
| `createUser`                    | `sdk-security` `userAPI.service.ts`            | `createUser()`                                                          |
| Bulk import `listAuditRecords`  | `sdk-bulk-loader` `reviewQueueAPI.service.ts`  | `getAuditRecords()`                                                     |
| Bulk import `getErrorReportUrl` | `sdk-bulk-loader` `reviewQueueAPI.service.ts`  | `downloadErrorReport()` (returns `Blob`, not URL — thin wrapper needed) |

### Category B: Backend endpoint does not exist yet

These are calling endpoints that are not implemented in `durion-positivity-backend`. The SDK has no generated service for them because there is no backend spec to generate from. These cannot be migrated to the SDK until the backend work is done:

| Frontend Call                                                         | Backend Status                                                                                             | Evidence                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `requestExport`, `getExportStatus`, `getExportHistory` (accounting)   | DTOs only — `ReportExportRequest.java` and `ExportFormat.java` exist but no controller                     | No `@RequestMapping` for export in any accounting controller |
| `getBillingTerms` (CRM, `GET /v1/crm/billing-terms`)                  | Field on party entity only — no dedicated endpoint                                                         | No billing terms route in any customer controller            |
| `listCostStructures` (catalog, `GET /catalog/v1/supplier-costs`)      | `SupplierItemCostController` only has `POST`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` — no collection GET | Controller source confirmed                                  |
| `retryJob` (bulk loader, `POST /bulk-loader/v1/bulk-jobs/{id}/retry`) | `BulkLoadJobController` has cancel/create/get/list — no retry                                              | No retry mapping or method found                             |
| `submitCorrection` (bulk loader)                                      | `ReviewQueueController` only exposes `downloadErrorReport` and `getAuditRecords`                           | No correction endpoint in backend or SDK                     |

**These are unimplemented backend features, not SDK generation gaps.** The frontend calls for these will return 404 at runtime. They need backend implementation before the SDK can be updated and before the frontend can migrate them.

---

## Auth Service

`auth.service.ts` uses raw `HttpClient` to call `/security-service/v1/auth/login`, `/auth/refresh`, and `/auth/logout` with manual JWT handling. The SDK has `AuthAPIApiService` available. This should be migrated last (or as a standalone task) because auth is highest-risk, but it is the single biggest remaining island of direct HTTP usage in the core.

---

## Recommended Completion Order

1. **Resolve all `as never` / `as unknown` casts** — unblocks everything else; do this before touching models
2. **Security service** — SDK already has `createRole`, `createUser`, `getAllPermissions`; zero backend work needed; just swap the direct calls
3. **Bulk import** — `getAuditRecords` and `downloadErrorReport` are in the SDK; swap those; accept that `retryJob` and `submitCorrection` block on backend work
4. **Inventory domain service** — SDK has full coverage; delete reimplemented availability/ledger queries
5. **Accounting service** — `getEventProcessingLog` is in SDK (line 109 of `accountingEvents.service.ts`); swap it; accept that export endpoints block on backend work
6. **CRM service** — accept that `getBillingTerms` blocks on backend; migrate everything else
7. **Product catalog** — accept that `listCostStructures` blocks on backend (no collection GET exists); migrate everything else
8. **Delete local model files** — as each domain above is completed
9. **Auth service migration** — migrate to `AuthAPIApiService`, verify JWT flows
10. **Track backend blockers separately** — accounting exports, CRM billing terms, catalog cost-structure list, bulk-loader retry/correction need backend issues opened
11. **Retire `ApiBaseService`** — delete once no non-MCP service imports it

---

## Definition of Done (Migration Complete)

- [ ] Zero imports from `ApiBaseService` in domain services (chat-api excepted)
- [ ] Zero `as never` / `as unknown` casts in SDK-consuming code
- [ ] Local model files deleted for all domains covered by SDK packages
- [ ] Unified error handling using `DurionSdkError` across all domain services
- [ ] `ApiBaseService` either deleted or scoped exclusively to gateway/MCP calls
