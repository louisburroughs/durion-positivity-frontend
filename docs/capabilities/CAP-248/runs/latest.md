# CAP-248 Run Artifact — Workexec Billing Visibility (Wave I-c)

## Stories
- #259: Estimates for Customer/Vehicle
- #260: WIP Status
- #261: Invoice Finalization

## Status: DONE

## Implementation Summary
- `workexec.models.ts`: 9 new interfaces (EstimateListItem, WipStatus, WorkorderWipView, WorkorderInvoiceView, InvoiceLineItem, FinalizeInvoiceRequest, FinalizeInvoiceResponse + filter types)
- `workexec.service.ts`: 6 new methods — listEstimatesForCustomer, listEstimatesForVehicle, listActiveWorkorders, getWorkorderWipStatus, getWorkorderInvoiceView, requestInvoiceFinalization
- `workexec.routes.ts`: 3 new routes (estimate-list, wip-status, :workorderId/invoice-finalization)
- 3 new page components: estimate-list, wip-status, invoice-finalization
- 21 total spec files, 117 tests

## ADR Compliance
- ADR-0029, 0030, 0031, 0032, 0033, 0034, 0035 all satisfied
- Enum values: ('WORKEXEC.INVOICE_STATUS.' + ...) | translate, ('WORKEXEC.ITEM_TYPE.' + ...) | translate

## Verification
- Tests: 117 passed
- Code Review: PASS
- Designer: PASS
