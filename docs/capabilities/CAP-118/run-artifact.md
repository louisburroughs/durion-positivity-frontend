## Capability: CAP-118 — Identity Orchestration (People RBAC)

### Wave / Branch

- Wave: G
- Branch: `cap/people-crm-wave-g`

### Stories Delivered

- #153 — RBAC Role Assignment Admin Page

### New Files (frontend)

- `people-rbac.models.ts`
- `people.service.ts` (extended)
- `role-assignment-page.component.ts`
- `role-assignment-page.component.html`
- `role-assignment-page.component.css`
- `people.routes.ts` (extended)

### Route

- `/people/rbac/:personUuid`

### API operations

- `GET /v1/people/{personUuid}/access/roles`
- `GET /v1/people/staffing/assignments`
- `POST /v1/people/staffing/assignments`
- `DELETE /v1/people/{personUuid}/access/assignments/{roleCode}`

### Tests

- `role-assignment-page.component.spec.ts`: 25 tests
- `people.service.spec.ts`: 15 tests

### Build & Test Status

- Build status: PASS
- Test status: PASS (546/546 full suite)

### Designer Verdict

- PASS

### Code Review Verdict

- PASS (all 7 findings remediated)
