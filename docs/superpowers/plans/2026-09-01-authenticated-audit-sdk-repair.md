---
title: Authenticated Audit and SDK Repair Plan
date: 2026-09-01
status: ready
issue: https://github.com/louisburroughs/durion-positivity-frontend/issues/201
---

## Authenticated Audit and SDK Repair Plan

> **For agentic workers:** Use `superpowers:test-driven-development` for each
> implementation task and `superpowers:verification-before-completion` before
> reporting success. Keep generated files under
> `../durion-positivity-sdk-angular/packages/**` read-only.

**Goal:** Remove the actionable errors in the authenticated frontend audit,
stop the audit from manufacturing invalid entity URLs, and align supplier UI
calls with the generated SDK and implemented backend contract.

**Issue:**
[#201](https://github.com/louisburroughs/durion-positivity-frontend/issues/201)

**Architecture:** Keep generated transport calls inside feature services and
map SDK DTOs into local UI models there, as required by ADR-0010. Treat absence
of a generated operation as a contract gap: remove the unreachable UI surface
instead of retaining a guessed URL or returning fake data. Preserve the
existing signal-based page states and the ADR-0031 error-state ordering.

**Tech stack:** Angular 22, TypeScript 6, RxJS 7, generated
`@durion-sdk/*` clients, Vitest, and Playwright.

## Confirmed Root Causes

| Audit symptom                            | Root cause                                                 | Ownership                     |
| ---------------------------------------- | ---------------------------------------------------------- | ----------------------------- |
| Pick-list page throws on `tasks.length`  | A header-only SDK response is cast to a richer local model | Frontend service adapter      |
| `/accounting/events/events` request      | Query text is embedded in a relative `redirectTo` string   | Frontend route                |
| Security identity-compliance 404         | Audit seed points at a route moved to People               | Audit seed                    |
| Valid detail pages receive unrelated IDs | Named IDs are harvested globally across API services       | Audit harvester               |
| `/supplier/v1/**` 404 responses          | Frontend services encode speculative contracts             | Frontend and backend contract |
| Current-user primary-location 404        | Persona has no primary location assignment                 | Expected data absence         |

The accounting, location, people, and workorder generated SDK paths match the
implemented controllers. Do not alter those generated paths.

## Supplier Contract Matrix

Use this matrix before touching any positivity service. A frontend task may
only call an operation in the third column.

| Current surface                     | Current guessed read                                       | Generated operation or decision                                                                        |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Purchase-order transmission         | `/supplier/v1/purchase-orders/{id}/transmission`           | Use `SupplierOrderTransmissionService.listSupplierTransmissionsForPurchaseOrder(id)`                   |
| Transmission history                | `/supplier/v1/purchase-orders/{id}/transmission/history`   | No operation; remove history request and history-only UI                                               |
| Manual-review queue                 | `/supplier/v1/order-transmissions/manual-review`           | No list operation; remove route and navigation until the backend publishes one                         |
| Fleet vehicle                       | `/supplier/v1/fleet/vehicle-lookup`                        | Use `SupplierFleetAuthorizationService.lookupFleetVehicle(supplierRef, vehicleIdent)`                  |
| Fleet authorization                 | `/supplier/v1/fleet/workorders/{id}/authorization`         | Use `getFleetWorkorderAuthorization(supplierRef, workorderId)`; do not call without `supplierRef`      |
| Vendor invoice list/detail          | `/supplier/v1/vendor-invoices/**`                          | No read operation; remove routes and navigation                                                        |
| Shipment timeline/unlinked          | `/supplier/v1/**/shipment-events`                          | No operation; remove embedded panel, route, and navigation                                             |
| Product enrichment/global unmatched | `/supplier/v1/enrichment/**`                               | Existing marketing operation is supplier-scoped and not equivalent; remove current surfaces            |
| Availability by product/SKU         | `/supplier/v1/availability`                                | Migrate only after mapping the request to `SupplierStockInquiryService`; otherwise remove the panel    |
| PRICAT runs/freshness               | `/supplier/v1/vendor-profiles/**/pricat/**`                | Use `SupplierPriceCatalogService` only where its import and unmatched-line operations satisfy the page |
| Latest stock snapshot               | `/supplier/v1/vendor-profiles/{id}/stock-snapshots/latest` | No read operation; remove route and navigation                                                         |

If product availability or PRICAT needs fields absent from the generated DTO,
stop that task, record the missing request/response fields on #201, and apply
the removal branch in this plan. Do not reinterpret a similar endpoint.

## Task 1: Record the Reproducible Baseline

**Files:**

- Read: `artifacts/audit/admin/error-pages.md`
- Read: `artifacts/audit/admin/report.json`

- [ ] **Step 1: Run the focused unit baseline**

```bash
cd /home/louis-burroughs/IdeaProjects/durion-positivity-frontend
npx ng test --include="src/app/features/inventory/pages/fulfillment/pick-list/**/*.spec.ts" --no-watch
```

Expected before Task 2: existing tests pass even though the browser crashes.
This establishes that the current fixture masks the SDK response split.

- [ ] **Step 2: Preserve the audit counts in the implementation PR notes**

Record `157` visited pages and `22` error pages from the authenticated audit.
Do not commit credentials, storage state, cookies, or access tokens.

## Task 2: Compose the Workorder Pick List from Both SDK Reads

**Files:**

- Modify: `src/app/features/workexec/services/workexec.service.spec.ts`
- Modify: `src/app/features/workexec/services/workexec.service.ts`
- Modify: `src/app/features/inventory/pages/fulfillment/pick-list/pick-list-page.component.spec.ts`
- Verify: `src/app/features/workexec/models/workexec.models.ts`

- [ ] **Step 1: Replace the masking service fixture with split SDK fixtures**

Change the `getWorkorderPickList` service test so the header request returns:

```typescript
const header = {
  workorderId: 'wo-001',
  pickListId: 'pl-001',
  status: 'READY_TO_PICK',
  createdAt: '2026-09-01T12:00:00Z',
  dueAt: '2026-09-02T12:00:00Z',
  priority: 1,
  updatedAt: '2026-09-01T12:00:00Z',
};

const tasks = [
  {
    locationId: 'bin-001',
    pickListId: 'pl-001',
    pickTaskId: 'task-001',
    pickedQty: 0,
    remainingQty: 5,
    requiredQty: 5,
    skuId: 'SKU-001',
    sortOrder: 1,
    status: 'PENDING',
    version: 0,
  },
];
```

Assert that one subscription causes both SDK URLs to be requested and emits:

```typescript
{
  workorderId: 'wo-001',
  pickListId: 'pl-001',
  status: 'READY_TO_PICK',
  createdAt: '2026-09-01T12:00:00Z',
  tasks: [{
    pickTaskId: 'task-001',
    productSku: 'SKU-001',
    requestedQty: 5,
    pickedQty: 0,
    uom: 'EA',
    storageLocationId: 'bin-001',
    status: 'PENDING',
    sortOrder: 1,
  }],
}
```

- [ ] **Step 2: Run the service spec and observe the failure**

```bash
npx ng test --include="src/app/features/workexec/services/workexec.service.spec.ts" --no-watch
```

Expected: the second request is missing and the emitted object has no mapped
`tasks` array.

- [ ] **Step 3: Replace the unsafe assertion with explicit composition**

Import `forkJoin` and `map`, then implement the adapter as follows:

```typescript
getWorkorderPickList(workorderId: string): Observable<PickListView> {
  return forkJoin({
    header: this.workorderPickFacade.getWorkorderPickList(workorderId),
    tasks: this.workorderPickFacade.getPickTasks(workorderId),
  }).pipe(
    map(({ header, tasks }) => ({
      workorderId: header.workorderId,
      pickListId: header.pickListId,
      status: header.status,
      createdAt: header.createdAt,
      tasks: tasks.map(task => ({
        pickTaskId: task.pickTaskId,
        productSku: task.skuId,
        requestedQty: task.requiredQty,
        pickedQty: task.pickedQty,
        uom: 'EA',
        storageLocationId: task.locationId,
        status: task.status,
        sortOrder: task.sortOrder,
      })),
    })),
  );
}
```

`EA` is the current local-model default because the generated task has no UOM.
If the UI must display another UOM, that requires a backend contract addition;
do not derive it from SKU text.

- [ ] **Step 4: Make the component test use the public adapter contract**

Keep `PickListPageComponent` mocked at `WorkexecService`, but add a regression
assertion that `tasks` is always an array and that an empty task response moves
the page to `empty`. Remove any comment suggesting the header endpoint itself
contains tasks.

- [ ] **Step 5: Run both focused specs**

```bash
npx ng test --include="src/app/features/workexec/services/workexec.service.spec.ts" --no-watch
npx ng test --include="src/app/features/inventory/pages/fulfillment/pick-list/pick-list-page.component.spec.ts" --no-watch
```

Expected: both pass, and no `as unknown as Observable<PickListView>` remains.

## Task 3: Redirect Failed Accounting Events with a UrlTree

**Files:**

- Create: `src/app/features/accounting/accounting.routes.spec.ts`
- Modify: `src/app/features/accounting/accounting.routes.ts`

- [ ] **Step 1: Add a router integration test**

Configure a minimal router with `ACCOUNTING_ROUTES`, navigate to
`/events/failed`, and assert:

```typescript
expect(router.url).toBe('/events?processingStatus=FAILED%2CQUARANTINED');
```

Also assert that navigation never resolves to `/events/events`.

- [ ] **Step 2: Run the new spec and observe the failure**

```bash
npx ng test --include="src/app/features/accounting/accounting.routes.spec.ts" --no-watch
```

Expected: the current relative redirect produces the duplicated `events`
segment or treats the query text as route text.

- [ ] **Step 3: Use a functional redirect that returns a UrlTree**

Define and export a redirect function beside the route table:

```typescript
export const redirectFailedEvents: RedirectFunction = () =>
  inject(Router).createUrlTree(['/app/accounting/events'], {
    queryParams: { processingStatus: 'FAILED,QUARANTINED' },
  });
```

Set `redirectTo: redirectFailedEvents`. In the isolated test, mount the feature
at `/app/accounting` so the assertion uses the production URL. Do not put `?`
inside a static `redirectTo` value.

- [ ] **Step 4: Re-run the route spec**

```bash
npx ng test --include="src/app/features/accounting/accounting.routes.spec.ts" --no-watch
```

Expected: navigation ends at the event list with one encoded query parameter.

## Task 4: Correct Static Audit Seeds

**Files:**

- Create: `e2e/audit/lib/route-seeds.spec.ts`
- Modify: `e2e/audit/lib/route-seeds.ts`

- [ ] **Step 1: Add a seed regression test**

Assert that `APP_SEEDS` contains
`/app/people/identity-compliance`, does not contain
`/app/security/identity-compliance`, and has no duplicates.

- [ ] **Step 2: Run the focused Vitest file and observe the failure**

```bash
npx vitest run e2e/audit/lib/route-seeds.spec.ts
```

Expected: the People route is missing and the stale Security route is present.

- [ ] **Step 3: Replace the stale seed**

Move the identity-compliance seed into the People section and use the path
declared in `src/app/features/people/people.routes.ts`:

```typescript
'/app/people/identity-compliance',
```

- [ ] **Step 4: Re-run the focused test**

```bash
npx vitest run e2e/audit/lib/route-seeds.spec.ts
```

Expected: pass.

## Task 5: Preserve API-Service Provenance While Harvesting IDs

**Files:**

- Create: `e2e/audit/lib/id-harvest.spec.ts`
- Modify: `e2e/audit/lib/id-harvest.ts`
- Modify: `e2e/audit/lib/route-seeds.ts`
- Verify: `e2e/audit/crawl-audit.spec.ts`

- [ ] **Step 1: Extract a testable response collector**

Add an exported function that accepts parsed JSON, response URL, the field
allowlist, and the existing harvest map. `attachIdHarvester` should delegate to
it after parsing the response body. Keep browser event handling unchanged.

- [ ] **Step 2: Add failing provenance tests**

Feed the collector these two responses:

```typescript
collectResponseIds(
  { invoiceId: '11111111-1111-4111-8111-111111111111' },
  'https://durionpos.org/api/accounting/v1/events',
  fields,
  harvest,
);
collectResponseIds(
  { invoiceId: '22222222-2222-4222-8222-222222222222' },
  'https://durionpos.org/api/invoice/v1/invoices',
  fields,
  harvest,
);
```

Assert that the values are stored separately as `invoiceId@accounting` and
`invoiceId@invoice`, and that neither value is stored under bare `invoiceId`.
Add equivalent assertions for `locationId`, `productId`, and `workorderId`.

- [ ] **Step 3: Run the new test and observe the failure**

```bash
npx vitest run e2e/audit/lib/id-harvest.spec.ts
```

Expected: named IDs collide under their unscoped field names.

- [ ] **Step 4: Scope every harvested ID to its gateway service**

Replace last-resource scoping with the first path segment after `/api/`:

```typescript
function apiService(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  return apiIndex >= 0 ? (segments[apiIndex + 1] ?? '') : '';
}
```

Store every allowed ID field as `${field}@${apiService(url)}`. Bare `id` uses
the same rule. Skip the response when no service segment can be derived.

- [ ] **Step 5: Make route templates opt into valid service sources**

Update every `PARAM_TEMPLATES` field candidate. Examples:

```typescript
{
  eventId: ['eventId@accounting', 'accountingEventId@accounting'];
}
{
  invoiceId: ['invoiceId@invoice', 'invoiceId@accounting'];
}
{
  locationId: ['locationId@location', 'id@location'];
}
{
  productId: ['productId@catalog', 'id@catalog'];
}
{
  workorderId: ['workorderId@workorder', 'workOrderId@workorder'];
}
```

Use the owning service for each route family:

- Accounting: `@accounting`
- Billing invoice views: `@invoice`
- CRM: `@customer`
- Inventory: `@inventory`
- Location: `@location`
- People: `@people`
- Product: `@catalog`
- Shop management: `@shop-manager`
- Work execution: `@workorder`

For cross-service routes, list only explicitly valid candidates. Do not add a
bare fallback to make coverage numbers larger.

- [ ] **Step 6: Test template filling as well as collection**

Assert that an accounting invoice ID cannot fill a billing invoice template,
an inventory location ID cannot fill a Location edit template, and a
workorder-service ID does fill workorder and fulfillment templates.

- [ ] **Step 7: Run the audit-library tests**

```bash
npx vitest run e2e/audit/lib/id-harvest.spec.ts e2e/audit/lib/route-seeds.spec.ts
```

Expected: all provenance and template tests pass.

## Task 6: Migrate Supported Supplier Transmission Reads

**Files:**

- Modify: `src/app/features/positivity/services/supplier-order-transmission.service.spec.ts`
- Modify: `src/app/features/positivity/services/supplier-order-transmission.service.ts`
- Modify: `src/app/features/positivity/components/supplier-transmission-panel/supplier-transmission-panel.component.spec.ts`
- Modify: `src/app/features/positivity/components/supplier-transmission-panel/supplier-transmission-panel.component.ts`
- Modify: `src/app/features/positivity/components/supplier-transmission-panel/supplier-transmission-panel.component.html`
- Modify: `src/app/features/positivity/models/supplier-order-transmission.models.ts`
- Modify: `src/assets/i18n/en-US.json`
- Modify: `src/assets/i18n/es-US.json`
- Modify: `src/assets/i18n/fr-CA.json`
- Modify: `src/assets/i18n/qps-ploc.json`

- [ ] **Step 1: Rewrite the service test around the generated client**

Provide a stub for the generated
`SupplierOrderTransmissionService`. Assert that the adapter calls
`listSupplierTransmissionsForPurchaseOrder(purchaseOrderId)` exactly once and
maps the returned `OrderTransmissionStatus[]` into the panel view model.

The mapped model must preserve `transmissionIntentId`, `state`,
`supplierOrderNumber`, `latestScheduledDeliveryDate`, `vendorReason`,
`vendorErrorCode`, `lastStatusAt`, and `dispatchAttempts`.

- [ ] **Step 2: Run the service spec and observe the failure**

```bash
npx ng test --include="src/app/features/positivity/services/supplier-order-transmission.service.spec.ts" --no-watch
```

Expected: the generated client is not called and the old test observes a
request to `/supplier/v1/purchase-orders/**`.

- [ ] **Step 3: Replace `ApiBaseService` with the generated service**

Inject the generated service under an alias to avoid colliding with the local
class name:

```typescript
import { SupplierOrderTransmissionService as SupplierOrderTransmissionApi } from '@durion-sdk/supplier';
```

Expose a single read returning all transmissions for the purchase order. Map
SDK DTOs explicitly; do not use `as unknown as`.

- [ ] **Step 4: Remove the unsupported history request from the panel**

Replace the panel's `forkJoin` of transmission plus history with the one
generated list call. Render each transmission's current status and last status
time. Remove history-only controls and translation keys only after proving
they have no remaining references.

- [ ] **Step 5: Remove unsupported manual-review methods and route**

Delete `listManualReview`, `getManualReviewItem`, and `resolveManualReview`
from the local service. Remove the `orders/manual-review` route and its
navigation entry. Delete the manual-review page files only after `rg` confirms
there are no other imports.

- [ ] **Step 6: Run focused tests and i18n validation**

```bash
npx ng test --include="src/app/features/positivity/services/supplier-order-transmission.service.spec.ts" --no-watch
npx ng test --include="src/app/features/positivity/components/supplier-transmission-panel/supplier-transmission-panel.component.spec.ts" --no-watch
npm run i18n:check
```

Expected: no transmission request contains `/supplier/v1/`.

## Task 7: Require Supplier Reference for Fleet SDK Reads

**Files:**

- Modify: `src/app/features/positivity/services/supplier-fleet.service.spec.ts`
- Modify: `src/app/features/positivity/services/supplier-fleet.service.ts`
- Modify: `src/app/features/positivity/components/supplier-fleet-lookup-panel/supplier-fleet-lookup-panel.component.spec.ts`
- Modify: `src/app/features/positivity/components/supplier-fleet-lookup-panel/supplier-fleet-lookup-panel.component.ts`
- Modify: `src/app/features/positivity/components/supplier-fleet-authorization-panel/supplier-fleet-authorization-panel.component.spec.ts`
- Modify: `src/app/features/positivity/components/supplier-fleet-authorization-panel/supplier-fleet-authorization-panel.component.ts`
- Modify: `src/app/features/workexec/pages/estimate-detail/estimate-detail-page.component.html`
- Modify: `src/app/features/workexec/pages/workorder-detail/workorder-detail-page.component.html`

- [ ] **Step 1: Add generated-client service tests**

Stub `SupplierFleetAuthorizationService` from `@durion-sdk/supplier`. Assert:

```typescript
service.lookupVehicle('supplier-a', 'VIN-1');
expect(api.lookupFleetVehicle).toHaveBeenCalledWith('supplier-a', 'VIN-1');

service.getWorkorderAuthorization('supplier-a', 'wo-1');
expect(api.getFleetWorkorderAuthorization).toHaveBeenCalledWith('supplier-a', 'wo-1');
```

- [ ] **Step 2: Run the service spec and observe the failure**

```bash
npx ng test --include="src/app/features/positivity/services/supplier-fleet.service.spec.ts" --no-watch
```

Expected: the current service calls guessed query and path forms.

- [ ] **Step 3: Implement explicit SDK mappings**

Require `supplierRef` as the first argument to both methods. Map `FleetVehicle`
and `FleetAuthorizationResponse` to local UI models field by field.

- [ ] **Step 4: Prevent calls when the owning page has no supplier reference**

Add a required-or-empty `supplierRef` input to each panel. Tests must prove
that an empty supplier reference results in no SDK invocation. The current
estimate and workorder detail DTOs do not supply a verified `supplierRef`, so
remove the two embedded panel elements from those pages for this change.

Do not pass `vendorProfileId` where the SDK requires `supplierRef`; they are
different identifiers.

- [ ] **Step 5: Run all fleet and parent-page specs**

```bash
npx ng test --include="src/app/features/positivity/components/supplier-fleet-*/**/*.spec.ts" --no-watch
npx ng test --include="src/app/features/workexec/pages/estimate-detail/**/*.spec.ts" --no-watch
npx ng test --include="src/app/features/workexec/pages/workorder-detail/**/*.spec.ts" --no-watch
```

Expected: pass with no `/supplier/v1/fleet` request path.

## Task 8: Retire Supplier Surfaces Without Backend Read Contracts

**Files:**

- Modify: `src/app/features/accounting/accounting.routes.ts`
- Modify: `src/app/features/accounting/pages/landing/accounting-landing.config.ts`
- Modify: `src/app/features/positivity/positivity.routes.ts`
- Modify: `src/app/features/inventory/pages/purchase-orders/po-detail/po-detail.component.ts`
- Modify: `src/app/features/inventory/pages/purchase-orders/po-detail/po-detail.component.html`
- Modify: `src/app/features/product/pages/catalog/product-detail/product-detail.component.ts`
- Modify: `src/app/features/product/pages/catalog/product-detail/product-detail.component.html`
- Delete: unsupported supplier page, panel, service, model, and spec files after reference checks
- Regenerate: `src/app/features/sitemap/site-map.routes.generated.ts`

- [ ] **Step 1: Add a contract guard test**

Create
`src/app/features/positivity/services/supplier-contract-coverage.spec.ts`.
Read the positivity service source files and fail when an executable URL
contains `/supplier/v1/`. Exclude comments only after all speculative contract
comments have been removed with the dead services.

- [ ] **Step 2: Run it and observe the failures**

```bash
npx vitest run src/app/features/positivity/services/supplier-contract-coverage.spec.ts
```

Expected: availability, enrichment, fleet, invoice, transmission, PRICAT,
shipment, and stock-snapshot service files are reported initially.

- [ ] **Step 3: Remove routes and navigation for absent read contracts**

Remove these route surfaces:

- Accounting vendor invoice list, exceptions, and detail
- Positivity unmatched enrichment
- Positivity manual-review queue
- Positivity unlinked shipments
- Positivity stock snapshots

Remove their landing/navigation entries in the same edit so no internal link
points to a deleted route.

- [ ] **Step 4: Remove unsupported embedded panels**

Remove the shipment panel from purchase-order detail. Remove product
enrichment and availability panels unless their generated SDK mapping was
completed and proven in focused tests. Update parent specs to assert the
unsupported selector is absent.

- [ ] **Step 5: Delete unreachable implementation files**

Run one reference search per class, then delete the service, model, page,
panel, template, stylesheet, and spec files whose only owners were removed.
The minimum deleted services are:

```text
supplier-enrichment.service.ts
supplier-invoice.service.ts
supplier-shipment.service.ts
supplier-stock-snapshot.service.ts
```

Delete `supplier-availability.service.ts` and `supplier-pricat.service.ts` too
when their request/response needs cannot be represented by the generated
operations. Do not leave dead guessed endpoints in source.

- [ ] **Step 6: Regenerate route-derived artifacts**

```bash
npm run sitemap:routes:generate
npm run sitemap:routes:check
```

Expected: generated sitemap routes no longer include removed supplier pages.

- [ ] **Step 7: Re-run the contract guard and domain tests**

```bash
npx vitest run src/app/features/positivity/services/supplier-contract-coverage.spec.ts
npx ng test --include="src/app/features/positivity/**/*.spec.ts" --no-watch
npx ng test --include="src/app/features/accounting/**/*.spec.ts" --no-watch
npx ng test --include="src/app/features/inventory/pages/purchase-orders/**/*.spec.ts" --no-watch
npx ng test --include="src/app/features/product/pages/catalog/**/*.spec.ts" --no-watch
```

Expected: no executable `/supplier/v1/` URL remains and all retained supplier
calls go through generated clients.

## Task 9: Treat Missing Primary Location as an Expected Empty State

**Files:**

- Modify: `src/app/features/shopmgmt/services/dispatch-board.service.spec.ts`
- Modify: `src/app/features/shopmgmt/services/dispatch-board.service.ts`
- Modify: `src/app/features/shopmgmt/pages/dispatch-board/dispatch-board-page.component.spec.ts`
- Modify: `src/app/features/shopmgmt/pages/mechanic-availability/mechanic-availability-page.component.spec.ts`

- [ ] **Step 1: Add a service test for SDK 404**

Make `PeopleAvailabilityAPIService.getMyPrimaryLocation()` return an
`HttpErrorResponse` with status `404`. Assert that `getPrimaryLocation()` emits
an empty `PrimaryLocationResponse` rather than failing. Assert a `500` still
propagates.

- [ ] **Step 2: Run the service spec and observe the failure**

```bash
npx ng test --include="src/app/features/shopmgmt/services/dispatch-board.service.spec.ts" --no-watch
```

Expected: the 404 currently reaches the subscriber's error callback.

- [ ] **Step 3: Normalize only 404 in the service**

Use `catchError` with an `HttpErrorResponse` status check. Return
`of({ locationId: undefined })` for 404 and `throwError(() => error)` for every
other status. Do not suppress authentication, authorization, or server errors.

- [ ] **Step 4: Assert page behavior for the empty response**

The dispatch board should show its existing location-required state without
loading dashboard data. Mechanic availability should show its existing
location-required state without calling the availability endpoint. Keep any
error key and page-state ordering consistent with ADR-0031.

- [ ] **Step 5: Run the shop-management specs**

```bash
npx ng test --include="src/app/features/shopmgmt/services/dispatch-board.service.spec.ts" --no-watch
npx ng test --include="src/app/features/shopmgmt/pages/dispatch-board/**/*.spec.ts" --no-watch
npx ng test --include="src/app/features/shopmgmt/pages/mechanic-availability/**/*.spec.ts" --no-watch
```

Expected: a missing persona assignment is a usable empty state, while non-404
errors remain visible.

## Task 10: Full Verification and Authenticated Audit

**Files:**

- Update by command: `artifacts/audit/admin/error-pages.md`
- Update by command: `artifacts/audit/admin/report.json`

- [ ] **Step 1: Run all frontend unit tests**

```bash
npx ng test --no-watch
```

Expected: all previously passing tests remain green. Baseline was `2,426`
passing tests in `235` files with one skipped file; totals may increase because
this plan adds regression tests.

- [ ] **Step 2: Run static quality checks**

```bash
npx ng lint
npm run lint:css
npm run i18n:check
npm run sitemap:routes:check
npm run build
```

Expected: all commands exit zero. Do not edit generated SDK output to make the
frontend build pass.

- [ ] **Step 3: Run the authenticated audit with credentials supplied only through the environment**

```bash
npm run audit:site
```

Use the repository's documented persona environment variables in the terminal
session. Never write credentials into this plan, Playwright configuration,
audit artifacts, or shell history.

- [ ] **Step 4: Review every remaining error page**

Expected outcomes:

- No pick-list runtime exception
- No `/app/accounting/events/events` navigation
- No `/app/security/identity-compliance` visit
- No detail route populated from an ID harvested from another API service
- No frontend request to an executable `/supplier/v1/**` path
- Missing primary location is not reported as a broken page

Any remaining 404 must name a concrete backend operation and valid entity ID.
Classify it as backend data/contract work instead of weakening the crawler.

- [ ] **Step 5: Verify the final diff is scoped**

```bash
git status --short
git diff --check
git diff -- src e2e scripts package.json
```

Expected: only #201 implementation files, generated sitemap output, and
intentional audit artifacts changed. No SDK generated source, credentials, or
unrelated formatting changes are present.

## Done Criteria

- The pick-list adapter composes header and tasks without unsafe assertions.
- Failed-event navigation preserves `processingStatus` as a query parameter.
- Audit seeds match the active route table.
- Harvested IDs are scoped to their gateway service.
- Retained supplier reads use generated `@durion-sdk/supplier` clients.
- UI surfaces without backend read contracts are absent rather than simulated.
- A missing primary location is handled as expected data absence.
- Unit, lint, i18n, sitemap, build, and authenticated audit checks pass.
- The final audit report contains no frontend-owned errors described in #201.
