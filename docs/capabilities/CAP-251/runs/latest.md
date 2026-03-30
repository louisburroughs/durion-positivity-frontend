# CAP-251 Run Artifact — Accounting Event Log (Wave I-c)

## Stories
- Invoice Payment Status + Event Processing Log

## Status: DONE

## Implementation Summary
- `accounting.models.ts`: InvoicePaymentStatus, EventProcessingLogEntry, invoiceId filter on listing
- `accounting.service.ts`: 3 new methods — listEvents, getEventProcessingLog, getInvoiceStatus
- New page: invoice-payment-status (11 tests)
- i18n: ACCOUNTING.INVOICE_PAYMENT_STATUS.*, ACCOUNTING.EVENT_TYPE.*, COMMON.EMPTY_VALUE: "—"

## ADR Compliance
- ADR-0029, 0030, 0031, 0032, 0033, 0034, 0035 all satisfied

## Verification
- Code Review: PASS
- Designer: PASS
