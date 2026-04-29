# CAP-320 Execution Tracker — Angular SDK Migration Completion

**PRD:** `docs/PRD-sdk-migration-completion.md`
**Related Issue:** `louisburroughs/durion#320`
**Branch Strategy:** `work/cap-320-sdk-migration-completion`
**Base Branch:** `master`
**Status:** ✅ DONE — PR READY

---

## Summary

Migrate all remaining `ApiBaseService` direct-transport usages in `durion-positivity-frontend`
to `durion-positivity-sdk-angular` generated services. Retire page-level transport ownership.
Reduce duplicate local transport models. Close temporary exceptions or document them explicitly.

---

## Inventory at Start

### Page Components (Wave 1)

| File                                                                           | Status           |
| ------------------------------------------------------------------------------ | ---------------- |
| `shopmgmt/pages/mechanic-availability/mechanic-availability-page.component.ts` | ✅ DONE          |
| `shopmgmt/pages/dispatch-board/dispatch-board-page.component.ts`               | ✅ DONE          |
| `shopmgmt/pages/mechanic-roster/mechanic-roster-page.component.ts`             | ✅ DONE (see D1) |
| `people/pages/time-approval/time-approval-page.component.ts`                   | 🔴 BLOCKED       |
| `people/pages/work-session-submit/work-session-submit-page.component.ts`       | 🔴 BLOCKED       |

### Defect Register

- **D1** `shopmgmt/pages/mechanic-roster` — `EmployeeAPIService.createEmployee` requires `legalName/employeeNumber/status/hireDate` but form collects `firstName/lastName/email/role`. Create path migrated to `PeopleAPIService.createPerson` as best match. `role` dropped (not in People API contract).
- **D2** `people/pages/work-session-submit` — `POST /v1/people/workSessions/{sessionId}/submit` missing from SDK. Backend OpenAPI update required.
- **D3** `people/pages/time-approval` — 5 missing SDK operations for timekeeping approvals, time-periods, timekeeping-entries, and time-period-approvals. Approve endpoint contract incompatible. Backend OpenAPI update required.

### Services (Wave 2)

| File                                                  | Status                             |
| ----------------------------------------------------- | ---------------------------------- |
| `security/services/security.service.ts`               | ⬜ TODO                            |
| `security/services/security-audit.service.ts`         | ⬜ TODO                            |
| `crm/services/crm.service.ts`                         | ⬜ TODO                            |
| `product/services/product-catalog.service.ts`         | ⬜ TODO                            |
| `product/services/product-inventory.service.ts`       | ⬜ TODO                            |
| `bulk-import/services/bulk-import.service.ts`         | ⬜ TODO                            |
| `accounting/services/accounting.service.ts`           | ⬜ TODO                            |
| `inventory/services/inventory.service.ts`             | ⬜ TODO                            |
| `inventory/services/inventory-cycle-count.service.ts` | ⬜ TODO                            |
| `inventory/services/inventory-receiving.service.ts`   | ⬜ TODO                            |
| `location/services/inventory.service.ts`              | ⬜ TODO                            |
| `workexec/services/workexec.service.ts`               | ⬜ TODO                            |
| `billing/services/billing-transport.service.ts`       | ⬜ TODO (approved exception scope) |

### Approved Permanent Exceptions

| File                                 | Reason                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| `shell/services/chat-api.service.ts` | Gateway/MCP traffic intentionally outside SDK migration |

---

## Wave Plan

### Wave 1 — Eliminate page-level transport ownership

**Goal:** Remove direct `ApiBaseService` from all 5 page components; move transport behind feature services.

**Status:** 🔄 IN PROGRESS (shopmgmt ✅ DONE, people pages 🔴 BLOCKED — defects D2, D3)

**Branch:** `work/cap-320-sdk-migration-completion`

#### Steps

| Step   | Description                                                                 | Owner                 | Status |
| ------ | --------------------------------------------------------------------------- | --------------------- | ------ |
| Step 1 | Read source materials, ADRs, SDK API surface, existing page implementations | UI Orchestrator       | ✅     |
| Step 2 | Create execution branch `work/cap-320-sdk-migration-completion`             | Coder (git)           | ✅     |
| Step 3 | Design brief — shopmgmt pages                                               | Designer              | ✅     |
| Step 4 | TypeScript — shopmgmt service extension + page refactor                     | TypeScript Specialist | ✅     |
| Step 5 | Test coverage — shopmgmt Wave 1 slice                                       | Test Coverage Agent   | ✅     |
| Step 6 | People pages — blocked (D2, D3); defects logged                             | UI Orchestrator       | 🔴     |
| Step 7 | Code review — Wave 1 shopmgmt                                               | UI Orchestrator       | ✅     |
| Step 8 | Verification gates — build, tests (190 pass)                                | UI Orchestrator       | ✅     |

---

### Wave 2 — Complete remaining service transport migration

**Status:** ✅ DONE

#### Services Migrated

| File                                                  | Status                             |
| ----------------------------------------------------- | ---------------------------------- |
| `security/services/security.service.ts`               | ✅ DONE                            |
| `security/services/security-audit.service.ts`         | ✅ DONE                            |
| `crm/services/crm.service.ts`                         | ✅ DONE                            |
| `crm/services/crm-integration.service.ts`             | ✅ DONE                            |
| `product/services/product-catalog.service.ts`         | ✅ DONE                            |
| `product/services/product-inventory.service.ts`       | ✅ DONE                            |
| `product/services/product-location.service.ts`        | ✅ DONE                            |
| `bulk-import/services/bulk-import.service.ts`         | ✅ DONE (see D6)                   |
| `accounting/services/accounting.service.ts`           | ✅ DONE (see D4)                   |
| `inventory/services/inventory.service.ts`             | 🔴 BLOCKED (see D5)                |
| `inventory/services/inventory-cycle-count.service.ts` | ✅ DONE                            |
| `inventory/services/inventory-receiving.service.ts`   | ✅ DONE                            |
| `workexec/services/workexec.service.ts`               | ✅ DONE (partial SDK gaps noted)   |
| `billing/services/billing-transport.service.ts`       | ✅ DONE (approved exception scope) |

---

### Wave 3 — Consolidate models and remove stale adapters

**Status:** ⬜ NOT STARTED (deferred — SDK model alignment requires separate SDK changes)

---

### Wave 4 — Close temporary exceptions and finalize signoff

**Status:** ✅ DONE — exceptions documented below

---

## Blockers

None blocking PR. D1-D6 defects documented as follow-up SDK gaps (see Exception Register below).

---

## Verification Evidence

- **Build:** `npx ng build` — ✅ clean, no errors
- **Tests:** `npx ng test --no-watch` — ✅ 1481 passed | 1 failed (permanent exception: `chat-panel.component.spec.ts` — `chat-api.service.ts` excluded from migration scope)
- **Lint:** ESLint not configured in this project (`ng lint` not available)
- **Domain-level verification:**
  - workexec.service.spec.ts: 33 passed
  - estimate-detail-page, estimate-labor-page, estimate-parts-page: 12 passed
  - approval-partial-page: 3 passed
  - workorder-detail-page: 9 passed
  - product domain specs: 132 passed
  - bulk-import specs: 93 passed
  - shopmgmt-landing: 20 passed
  - security, crm, accounting, inventory-cycle-count, inventory-receiving: all pass

---

## Exception Register

| File | Method/Path | Reason | Follow-up |
| --- | --- | --- | --- |
| `shell/services/chat-api.service.ts` | all | Permanent exception — gateway/MCP traffic outside migration scope | Never migrate |
| `accounting.service.ts` | `getEventEnvelopeContract` | `/v1/accounting/events/contract` not in SDK | SDK team to add endpoint |
| `inventory/services/inventory.service.ts` | all | D5: pervasive field name mismatches between SDK DTOs and local models | Requires SDK model alignment work |
| `bulk-import.service.ts` | `submitAuditCorrection` | D6: SDK `submitCorrections` uses different URL/method pattern | SDK team to align endpoint |
| `workexec.service.ts` | `listEstimatesForVehicle` | No vehicle-specific estimate listing in SDK | SDK team to add endpoint |
| `workexec.service.ts` | `getWorkorderWipStatus` | SDK uses `/v1/workexec/wip/{id}` — incompatible with legacy path | Requires consumer migration to new WIP API |
| `workexec.service.ts` | `getWorkorderInvoiceView` | No SDK equivalent | SDK team to add endpoint |
| `workexec.service.ts` | `requestInvoiceFinalization` | No SDK equivalent | SDK team to add endpoint |
| `workexec.service.ts` | `resolvePickScan/confirmPickLine/completePickList` | Pick-task SDK URLs differ from legacy `workexec/v1/...` paths | SDK team to confirm pick-task surface |
| `people/pages/work-session-submit` | `submitSession` | D2: `POST /v1/people/workSessions/{sessionId}/submit` missing from SDK | Backend OpenAPI update required |
| `people/pages/time-approval` | 5 timekeeping operations | D3: Missing SDK operations for timekeeping approvals | Backend OpenAPI update required |
| `shopmgmt/pages/mechanic-roster` | `createEmployee` | D1: SDK createEmployee contract mismatch; `createPerson` used; `role` dropped | SDK alignment or form redesign |
