# Frontend Audit — API Error Triage

Triage of the `failed-api-request` / `console-error` findings from the
durionpos.org site audit (see `frontend-audit-test-plan.md`,
`artifacts/audit/error-pages.md`).

**Bottom line:** every one of these is a **backend / SDK** issue — a missing
endpoint, a server-side 500, or a URL built inside `@durion-sdk/*`. The
frontend pages already handle the failures with ADR-0031 error states
(verified below), so there is **no frontend code change** for this cluster.
The `console-error` entries are the browser auto-logging the failed 4xx/5xx
network responses, not errors emitted by application code.

## Calibration (how the classification was verified)

Using the audit account's access token against the live API:

- `GET /api/people/v1/people` → **200** — confirms the token is valid and the
  dominant `/{domain}/v1/...` gateway convention resolves.

So a `404` on an endpoint that uses the correct convention means the
**endpoint is not implemented**, and a `500` means the route exists but the
**server handler errors**.

## Findings

| Page | Called URL | Status | Classification | Recommendation |
|---|---|---|---|---|
| `/app/accounting/posting-rules` | `/api/accounting/v1/accounting/posting-rules` | **500** | Backend defect. URL is built by `@durion-sdk/accounting` (`PostingRulesService`); a 500 means the route matched and the handler threw. | Backend: fix the 500. Confirm whether the doubled `accounting` segment is the intended gateway path — if not, fix in the SDK repo, not here. |
| `/app/accounting/events/contract` | `/api/v1/accounting/events/contract` | 404 | Backend-missing, or wrong prefix (uses deviant `/v1/accounting`). | Needs backend OpenAPI to confirm the path; do not guess (see "Prefix inconsistency"). |
| `/app/inventory/counts/plans` | `/api/inventory/v1/cycle-count-plans` | 404 | Backend-missing. Uses the **correct** `/inventory/v1/` convention yet 404s. | Backend: implement the endpoint. |
| `/app/inventory/putaway/tasks` | `/api/inventory/v1/putaway/tasks` | 404 | Backend-missing (correct convention). | Backend: implement. |
| `/app/inventory/replenishment/tasks` | `/api/inventory/v1/replenishment/tasks` | 404 | Backend-missing (correct convention). | Backend: implement. |
| `/app/location/location-sync` | `/api/v1/inventory/sync-logs`, `/api/v1/inventory/locations` | 404 | Backend-missing, or wrong prefix (deviant `/v1/inventory`). | Needs OpenAPI to confirm (see below). |
| `/app/shopmgmt/dispatch-board` | `/api/people/v1/people/me/primary-location` | 404 | Backend-missing sub-resource. Base `/api/people/v1/people` returns 200; the `me/primary-location` sub-path 404s. | Backend: implement the sub-resource. |
| `/app/shopmgmt/mechanics/availability` | `.../people/me/primary-location`, `/api/people/v1/people/availability?...` | 404 | Same primary-location gap + availability endpoint missing. | Backend: implement. |

## Prefix inconsistency (needs the backend contract to resolve)

Two conventions coexist in the frontend services:

- Dominant: `/{domain}/v1/...` (e.g. `/inventory/v1` ×28, `/people/v1` ×11) — **verified working** for people.
- Deviant: `/v1/{domain}/...` (e.g. `/v1/inventory` ×10 in `location/services/inventory.service.ts`, `/v1/accounting` ×1).

`location/services/inventory.service.ts` (`BASE = '/v1/inventory'`) is the
strongest wrong-prefix suspect, but it ships **28 contract tests** pinning
those exact paths, so flipping the prefix blind would break the contract and
possibly working calls. **Do not change these without the backend OpenAPI
spec or an authenticated production probe** confirming which prefix the
gateway accepts.

## ADR-0031 compliance (frontend already handles these)

Each affected page renders a user-facing error state on failure — no silent
breakage:

- `dispatch-board` — `getPrimaryLocation()` error → `ERROR_LOCATION_REQUIRED` handled state.
- `location-sync` — `role="alert"` banners per failed call (inventory-locations, sync-logs, trigger).
- `mechanic-availability` — `error()` banner.
- `cycle-count-plan-list` — two-signal state machine with an error card.

## Suggested next steps

1. Backend team: implement the missing endpoints and fix the posting-rules 500.
2. Publish/point to the gateway OpenAPI so the `/v1/inventory` vs `/inventory/v1`
   prefix question can be settled and any genuine frontend wrong-prefix bug fixed
   with a matching contract-test update.
3. Re-run `npm run audit:site` after the backend work to confirm the cluster clears.
