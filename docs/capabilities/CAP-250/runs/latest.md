# CAP-250 Run Artifact — Billing Payments (Wave I-c)

## Stories
- #265: Auth + Capture
- #266: Void/Refund
- #267: Receipt

## Status: DONE

## Implementation Summary
- `billing.models.ts`: 12 new interfaces (PaymentMethod, PaymentStatus, PaymentTransactionRef, PaymentActionResult, ReceiptRef + request types)
- `billing.service.ts`: 7 new methods — initiatePayment, capturePayment, voidPayment, refundPayment, generateReceipt, getReceipt, reprintReceipt
- `billing.routes.ts`: 3 new routes (invoices/:invoiceId/payment-capture, /void-refund, /receipts/:receiptId)
- 3 new page components: payment-capture, payment-void-refund, receipt
- 5 spec files, 25 tests

## ADR Compliance
- ADR-0029, 0030, 0031, 0032, 0033, 0034, 0035 all satisfied
- STATUS.* enum translated via ('STATUS.' + ...) | translate
- invocationCallOrder verified on refund error path

## Verification
- Tests: 25 passed
- Code Review: PASS
- Designer: PASS
