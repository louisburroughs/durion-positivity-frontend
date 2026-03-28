## Capability: CAP-094 — CRM & Workorder Integration

### Wave / Branch

- Wave: G
- Branch: `cap/people-crm-wave-g`

### Stories Delivered

- #157 — Workexec CRM Ref Fields
  - Extended `WorkorderDetailResponse` with `crmPartyId`, `crmVehicleId`, `crmContactIds`
  - Added `.crm-ref-block` on `estimate-detail` and `workorder-detail`
- #156 — CRM Integration Events Page
  - New `CrmIntegrationService`
  - New `IntegrationEventsPageComponent`
  - Route: `/crm/integration/events`

### API operations

- `GET /v1/accounting/events`
- `GET /v1/accounting/events/{eventId}`
- `GET /v1/accounting/events/{eventId}/processing-log`
- `GET /v1/accounting/events/{eventId}/reprocessing-history`

### Tests

- `integration-events-page.component.spec.ts`: 12 tests
- `crm-integration.service.spec.ts`: 6 tests
- Workexec tests: 9 (workorder-detail), 5 (estimate-detail)

### Build & Test Status

- Build status: PASS
- Test status: PASS (546/546 full suite)

### Designer Verdict

- PASS

### Code Review Verdict

- PASS (all 7 findings remediated)
