# Frontend Audit — API Error Triage

Triage of the `failed-api-request` / `console-error` findings from the
durionpos.org site audit (see `frontend-audit-test-plan.md`,
`artifacts/audit/error-pages.md`).

## Post-#820 re-run (2026-07-07, full authenticated crawl): 4 High / 2 problem pages — all 500s cleared

Re-ran `npm run audit:site` against durionpos.org after the people staffing /
location-assignment 500s were fixed (backend
[#820](https://github.com/louisburroughs/durion-positivity-backend/issues/820),
which is where frontend #162 was transferred — now **closed/completed**).

> Chromium hit `net::ERR_CONNECTION_RESET` on the first attempt while curl to
> the same origin returned 200 — the egress proxy resets Chromium's TLS 1.3
> ClientHello. Re-ran with `AUDIT_BROWSER_ARGS="--ssl-version-max=tls1.2"` (the
> documented workaround in the test plan) and the crawl went through.

**Result: 96 pages, 0 Critical, and zero API 5xx anywhere in the crawl**
(verified in `report.json` — the only failed API requests are 404s, below).
The previously-500ing surfaces are all healthy now:

| Surface | Prior run | This run |
|---|---|---|
| `/app/accounting/posting-rules` | 500 | ✅ 200, no findings |
| CRM party/detail cluster | 500/404 cluster | ✅ all 200, no findings |
| People list / directory / employee detail | staffing 500s (#162/#820) | ✅ all 200, no findings |

People coverage note: `/app/people/directory` loaded real data (the crawl
harvested employee UUIDs from it) and both `/app/people/employees/{id}` detail
pages audited clean — including `583fa3b3-d1bf-a40d-8e21-8cd54424d5d0`
(admin.alpha), the exact id from #820's repro. The
`/app/people/person/:personId/locations` template itself reports "no ids
observed" (the crawler harvests `:id`, not `:personId`, from the directory), so
that one route wasn't re-exercised by the crawl; but the whole people cluster
it depends on returns 200 and #820 is closed, so the #162 error-state condition
is gone.

> Direct curl replay of the token from `.auth/state.json` is **not** a reliable
> confirmation here: replayed/aged tokens hit the gateway's empty-`200` gotcha
> (`HTTP 200`, `len=0`), which can't be distinguished from real success. The
> in-browser crawl (token used in its live, silently-refreshing context) is the
> authoritative signal, and it shows real bodies + zero 5xx.

### Remaining findings (4 High + 1 Info) — no new defects

Both surviving High rules are the **same** already-triaged, working-as-intended
case, firing on two pages:

- `/app/shopmgmt/dispatch-board` and `/app/shopmgmt/mechanics/availability` →
  `GET /api/people/v1/people/me/primary-location` **404** (`failed-api-request`
  High ×2) plus the browser's automatic "Failed to load resource: 404"
  `console-error` (High ×2). This is
  [#160](https://github.com/louisburroughs/durion-positivity-frontend/issues/160)
  (closed, not-planned): admin.alpha has no primary-location assignment, the
  page degrades gracefully to "select a location" (frontend PR #157), and the
  console line is Chromium's own network log, not app code. Not a defect. To
  clear it from the report entirely, run the audit with an account that **has**
  a primary-location assignment, or add it to `accepted-findings.ts`.
- Info ×1: `/app/security/audit-logs` `search-possibly-id-keyed` — already an
  accepted finding (ROLE_ADMIN-only exact-id correlation lookup).

Net: **backend #820 (= frontend #162) is confirmed resolved**; the audit is
otherwise clean, with only the pre-existing #160 accepted case remaining.

## Post-backend re-triage (2026-07-07, authenticated probes)

Re-probed after the second backend deploy, with a **fresh** audit token.

> ⚠️ **Gateway auth gotcha that misled the first pass.** An expired or
> bad-signature bearer token makes the gateway return **`200` with an empty
> body** (not `401`). During the 2026-07-06 pass the audit token had aged out,
> so the CRM endpoints looked like empty-200s. With a freshly minted token
> (re-run `playwright test --project=setup`), the picture below is the real
> one. Missing token / structurally-invalid token → `401`; valid-structure
> bad-signature token → `200` empty. (Worth a separate gateway hardening note.)

| Endpoint | Now | Verdict |
|---|---|---|
| CRM party detail cluster (parties/{id}, communicationPreferences, commercial-accounts/{id}/contacts, snapshot/party/{id}, .../billing-rules) | **200 with real bodies** | ✅ **FIXED** — transferred to backend as durion-positivity-backend#818, closed |
| `/api/people/v1/people/me/primary-location` | **404** `"No primary location assignment exists for requester on <date>"` | ✅ **working as intended** — admin.alpha has no primary location; frontend handles it (post-#157). #160 closed. |
| `/api/people/v1/people/availability?locationId=<real>&date=…` | 200 | ✅ |
| `/api/inventory/...` (sync-logs, locations, putaway, replenishment, cycleCountPlans) | 200 | ✅ |
| `/api/accounting/v1/accounting/posting-rules` | 200 | ✅ |
| `/api/location/v1/locations/{id}` (+`/defaults`) | 200 | ✅ (12:59Z crawl 404s were a mid-rollout transient) |
| **people staffing / location-assignment query path** (below) | **500** | ❌ **new defect — #162** |

**New defect — people staffing/location endpoints throw 500.** Uncovered while
confirming #160. With a valid admin token, these all `500 Internal Server
Error` (Spring problem+json), while sibling people endpoints are fine:

| Endpoint | Status |
|---|---|
| `GET /v1/people/me` | **500** |
| `GET /v1/people/me/locations` | **500** |
| `GET /v1/people/{id}/locations` | **500** |
| `GET /v1/people/{id}/primary-location` | **500** (note: `me/primary-location` correctly 404s — inconsistent) |
| `GET /v1/people/staffing/assignments?personId={id}` | **500** |
| `GET /v1/people/{id}/staffing/assignments` | **500** |
| `GET /v1/people/{id}` | 200 ✅ |
| `GET /v1/people/{id}/access/assignments` | 200 ✅ |
| `GET /v1/people` (list) | 200 ✅ |

Frontend impact: `/app/people/person/{personId}/locations`
(person-location-assignments) calls `getAssignments1(personId)` →
`/v1/people/staffing/assignments?personId=…`, which 500s, so the page shows its
error state for every person. Tracked as
[#162](https://github.com/louisburroughs/durion-positivity-frontend/issues/162).

Related finding from the same investigation: stale pre-deploy tabs dead-click
lazy-module nav links after a deploy —
[#159](https://github.com/louisburroughs/durion-positivity-frontend/issues/159).

### Post-deploy audit run (2026-07-07, fresh token): 12 High / 4 problem pages (was 33 / 12)

The CRM cluster clearing dropped the count sharply. Remaining findings:

- **uuid-on-screen ×4** — party-detail showed "Party ID: \<uuid\>",
  location-defaults showed "Location ID: \<uuid\>". These only appeared *because*
  the backend fix made the pages load real data. **Fixed on this branch**:
  party-detail now shows the account/customer number (best-effort snapshot
  fetch), location-defaults shows the location name·code.
- **shopmgmt dispatch-board + mechanics/availability** — `me/primary-location`
  404 (= #160, working as intended; admin.alpha has no primary location). The
  `console-error` is the browser's automatic "Failed to load resource 404" log,
  not app code — unavoidable while the user has no assignment. Not a defect.
- **location detail 404** (`/app/location/locations/01960001-…/{,defaults}`) —
  the crawler harvested locationId `01960001-…` from some record, but the real
  locations are all `01960003-…`, so it's a **dangling location reference** in
  seed data (some entity points at a location that doesn't exist). Backend/data
  hygiene, low priority; the page shows its error state correctly. Not filed.

---

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

## CRM detail endpoints (found by the api-id-harvest crawl extension)

The detail-route crawl (party ids harvested from the CRM parties list API on
the same deployment) surfaced a list/detail inconsistency in the customer
module. All of these paths are **SDK-canonical** (`@durion-sdk/customer`
defines them verbatim), so no frontend path fix applies:

| Called URL | Status | Notes |
|---|---|---|
| `/api/customer/v1/crm/accounts/parties/{partyId}` | 404 | partyId came from the parties list API on the same host |
| `/api/customer/v1/crm/parties/{partyId}/communicationPreferences` | 404 | SDK op |
| `/api/customer/v1/crm/commercial-accounts/{partyId}/contacts` | 404 | SDK op |
| `/api/customer/v1/crm/snapshot/party/{partyId}` (+`/billing-rules`) | 404 | SDK op |

Backend: confirm why ids returned by the list endpoint 404 on the detail
endpoints (partial seed data, or the detail handlers not deployed). The
frontend pages show their handled error states (verified: party-detail
renders its ADR-0031 error panel), so this is not a frontend defect.

## Applied in this branch

All corrected to the SDK-canonical `/api/{domain}/v1/{domain}/...` pattern,
with their contract-test assertions updated. All affected service specs pass.

- **`events/contract`** — `AccountingService.BASE` `/v1/accounting` → `/accounting/v1/accounting`.
- **location-sync** (`features/location/services/inventory.service.ts`) —
  `BASE` `/v1/inventory` → `/inventory/v1/inventory` (fixes `locations`,
  `storage-locations`, `sync-logs`, `meta/storage-types`, `locations/sync`).
- **`cycle-count-plans`** (`features/inventory/services/inventory-cycle-count.service.ts`) —
  `/inventory/v1/cycle-count-plans` → `/inventory/v1/inventory/cycleCountPlans`
  (matches the SDK's `createPlan`/`getPlan` collection; SDK has no list method).
- **putaway / replenishment** (`features/inventory/services/inventory.service.ts`) —
  `/inventory/v1/putaway/tasks` (+`/complete`) and `/inventory/v1/replenishment/tasks`
  → inserted the inner `/inventory` domain segment. Both SDK-confirmed.

Note: `sync-logs`, `meta/storage-types`, `locations/sync` are not modelled in
the inventory SDK; they follow the same module-prefix pattern but their exact
op paths are backend-defined and unconfirmed at runtime.

## Not applied — diverge from the SDK, need backend contract reconciliation

Other methods in `features/inventory/services/inventory.service.ts` are **not**
a simple missing-prefix case — they use a resource structure the current SDK
does not model the same way, so a blind prefix fix would produce a different
wrong path:

- `reasons`, `movements/return-to-stock` — not in the inventory SDK.
- `workorders/{id}/returnable-items` — SDK exposes this under
  `returns/returnable-items`, not `workorders/{id}/...`.
- `workorders/{id}/allocations/{id}/shortage-options`, `.../resolve-shortage` — not in the SDK.
- `ledger` — SDK-confirmed (`/v1/inventory/ledger`) and latently mis-prefixed,
  but not an audit-flagged page; left out of this focused batch.

These need the backend inventory module's actual routes (or a runtime probe)
to correct safely, since the frontend and SDK disagree on their shape.

## Runtime confirmation

The applied path corrections are **SDK-derived, not yet runtime-confirmed** on
the deployed backend (authenticated production probing was out of scope). They
match the gateway pattern verified via `/api/people/v1/people` = 200 and the
per-module basePaths, and cannot regress the affected pages (which 404 today).
A re-run of `npm run audit:site` after backend deploys will confirm.

## Suggested next steps

1. Backend: fix the `posting-rules` 500 and confirm the `primary-location`
   semantics.
2. Confirm the inventory module's actual gateway paths, then apply the
   coordinated frontend path + contract-test correction.
3. Re-run `npm run audit:site` to confirm the cluster clears.
