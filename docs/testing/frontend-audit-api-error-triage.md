# Frontend Audit — API Error Triage

Triage of the `failed-api-request` / `console-error` findings from the
durionpos.org site audit (see `frontend-audit-test-plan.md`,
`artifacts/audit/error-pages.md`).

Ground truth for endpoint paths is the **`@durion-sdk/*`** packages (the
generated gateway client) plus the per-module `AccountingConfiguration`-style
basePaths wired in `src/app/app.config.ts`. Where the SDK does not model an
endpoint, the contract lives in the corresponding `durion-positivity-backend`
module.

## Gateway path pattern (verified)

Every SDK module is configured with `basePath = ${apiBaseUrl}/{module}`
(`app.config.ts`), and every SDK operation path is `/v1/{domain}/...`. So the
canonical full path is:

```
/api/{domain}/v1/{domain}/{resource}
```

Confirmed against the live API with the audit token:
- `GET /api/people/v1/people` → **200** (token valid, pattern resolves).
- `GET /api/accounting/v1/accounting/posting-rules` → **500** (route exists; server errors).

A local service that calls `ApiBaseService` (which only prepends `/api`) must
therefore include the full `/{module}/v1/{domain}` prefix itself. Dropping the
leading `/{module}` segment yields `/api/v1/{domain}/...`, which 404s.

## Findings

| Page | Called URL | Status | Verdict | Action |
|---|---|---|---|---|
| `/app/accounting/events/contract` | `/api/v1/accounting/events/contract` | 404 | **Frontend bug — FIXED.** SDK defines `/v1/accounting/events/contract`; local `AccountingService.BASE` dropped the `/accounting` module prefix. | Fixed: `BASE` → `/accounting/v1/accounting` (also fixes the latent `export/download` URL that shared it). |
| `/app/accounting/posting-rules` | `/api/accounting/v1/accounting/posting-rules` | 500 | **Backend defect.** Path is SDK-correct (built by `@durion-sdk/accounting`); 500 = handler throws. | Backend: fix the 500. |
| `/app/shopmgmt/dispatch-board` | `/api/people/v1/people/me/primary-location` | 404 | **Backend / expected.** Path matches SDK `/v1/people/me/primary-location`. 404 most likely means the audit user has no primary location assigned; the page already falls back to "select a location". | Backend: confirm semantics; no frontend change. |
| `/app/shopmgmt/mechanics/availability` | `.../me/primary-location`, `/api/people/v1/people/availability?...` | 404 | Same primary-location case; `/v1/people/availability` is SDK-defined, so 404 = backend-missing or empty. | Backend. |
| `/app/inventory/counts/plans` | `/api/inventory/v1/cycle-count-plans` | 404 | **Frontend path mismatch (not yet applied).** SDK op is `/v1/inventory/cycleCountPlans` (camelCase) under module `/inventory` → `/api/inventory/v1/inventory/cycleCountPlans`. The local `inventory-cycle-count.service.ts` uses a different kebab-case, single-prefix scheme across many methods with a full spec suite. | Needs a coordinated rewrite to the SDK paths + spec update; verify one call at runtime before mass-applying. |
| `/app/location/location-sync` | `/api/v1/inventory/sync-logs`, `/api/v1/inventory/locations` | 404 | Mixed. `/v1/inventory/locations` **is** SDK-defined → correct full path is `/api/inventory/v1/inventory/locations` (local `location/services/inventory.service.ts` `BASE='/v1/inventory'` drops the module prefix). `sync-logs` is **not** in the inventory SDK → backend-module-defined. | `location/services/inventory.service.ts` has 28 contract tests on the deviant scheme; correct the module prefix + tests as a coordinated change. Confirm `sync-logs` path with the backend module. |
| `/app/inventory/putaway/tasks` | `/api/inventory/v1/putaway/tasks` | 404 | SDK defines `/v1/inventory/putaway/tasks`; correct full path is `/api/inventory/v1/inventory/putaway/tasks`. Same missing-module-prefix pattern as the local inventory services. | Same coordinated fix; verify at runtime. |
| `/app/inventory/replenishment/tasks` | `/api/inventory/v1/replenishment/tasks` | 404 | SDK defines `/v1/inventory/replenishment/tasks`; correct full path `/api/inventory/v1/inventory/replenishment/tasks`. | Same coordinated fix. |

## Applied in this branch

- **`events/contract`** — `AccountingService.BASE` corrected to
  `/accounting/v1/accounting` (SDK-canonical). Accounting service + event-contract
  page specs pass.

## Not applied (need runtime confirmation before touching)

The inventory-side 404s (`cycle-count-plans`, `putaway`, `replenishment`,
location-sync `locations`) all point to the same root cause: the local
inventory services (`features/inventory/services/*`, `features/location/services/inventory.service.ts`)
were written to a **different path scheme** than the SDK
(kebab-case, single `/v1/inventory` prefix vs SDK camelCase, `/inventory/v1/inventory`).
Correcting them is mechanical but:

1. touches many methods across two services,
2. requires rewriting ~40 contract-test assertions, and
3. the local response models may differ from the SDK DTOs (as seen for
   `EventEnvelopeContract`), so a blind switch to SDK services risks shape
   mismatches.

Recommend confirming one corrected inventory path at runtime (or against the
backend module's OpenAPI) before applying the batch, so the contract-test
rewrite is done once against a verified target.

## Suggested next steps

1. Backend: fix the `posting-rules` 500 and confirm the `primary-location`
   semantics.
2. Confirm the inventory module's actual gateway paths, then apply the
   coordinated frontend path + contract-test correction.
3. Re-run `npm run audit:site` to confirm the cluster clears.
