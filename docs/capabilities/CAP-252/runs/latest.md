# CAP-252 Run Artifact — CRM Snapshot + Billing Rules (Wave I-c)

## Stories
- Customer/Vehicle CRM Snapshot view
- Billing Rules upsert

## Status: DONE

## Implementation Summary
- `crm.models.ts`: CrmSnapshot, BillingRules interfaces
- `crm.service.ts`: fetchByParty, fetchByVehicle (both → Observable<CrmSnapshot>), getBillingRules, upsertBillingRules
- `crm.routes.ts`: crm-snapshot/:partyId, billing-rules
- 2 new page components: crm-snapshot, billing-rules
- 5 spec files, 28 tests

## ADR Compliance
- ADR-0029, 0030, 0031, 0032, 0033, 0034, 0035 all satisfied
- partyType mapped via partyTypeLabelKey = computed() with CRM.SNAPSHOT.PARTY_TYPE.* keys
- BillingRules user-editable fields not readonly; @serverGenerated on createdAt/updatedAt

## Verification
- Tests: 28 passed
- Code Review: PASS
- Designer: PASS
