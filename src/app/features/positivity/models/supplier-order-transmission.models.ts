/**
 * Vendor order-transmission domain model (issue #191, CAP-320; contract
 * aligned in #201).
 *
 * Interfaces only. Every field here is a field-by-field projection of the
 * generated `OrderTransmissionStatus` DTO from `@durion-sdk/supplier`; the
 * mapping lives in `supplier-order-transmission.service.ts`. Nothing in this
 * file is derived, guessed or computed client-side.
 *
 * ── The absent operation is part of the contract ─────────────────────────────
 * There is no re-send, retry or re-transmit shape anywhere in this file, and
 * that is deliberate rather than unfinished. Re-transmitting an order that the
 * vendor may already hold produces a duplicate *physical* order. Reconciliation
 * is status-first and backend-owned.
 *
 * ── Vendor references are attributes, never keys ────────────────────────────
 * `supplierOrderNumber` and `documentId` are vendor-assigned strings shown as
 * data. Navigation uses the platform's own `purchaseOrderId`.
 *
 * Vendor-quoted delivery dates are date-only `YYYY-MM-DD` values (ADR-0038)
 * and are never handed to `DatePipe` raw.
 */

/**
 * Transmission state for one purchase-order transmission intent, exactly the
 * token set the backend publishes.
 *
 * `MANUAL_REVIEW` is the ambiguous outcome: the platform cannot tell whether
 * the vendor holds the order. It is surfaced, never resolved, from this panel.
 */
export type SupplierTransmissionState =
  | 'PENDING'
  | 'DISPATCHING'
  | 'SENT_AWAITING_RESULT'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'MANUAL_REVIEW'
  | 'FAILED'
  | 'CANCELLED';

/** One transmission of a purchase order to its vendor, as the backend reports it. */
export interface SupplierOrderTransmission {
  /** Platform transmission-intent UUID. The `@for` tracking key. */
  transmissionIntentId: string;
  purchaseOrderId: string | null;
  /** Human purchase-order number. Display only. */
  purchaseOrderNumber: string | null;
  /** Vendor profile alias the order went to. */
  supplierRef: string | null;
  /** Null when the backend sends a token this model does not know. */
  state: SupplierTransmissionState | null;
  /** Vendor-assigned order number. An attribute, never a navigation key. */
  supplierOrderNumber: string | null;
  /** Vendor/platform document reference for the transmitted document. */
  documentId: string | null;
  /** Date-only `YYYY-MM-DD` (ADR-0038). */
  latestScheduledDeliveryDate: string | null;
  /** Vendor's own words. Rendered verbatim beside a translated label. */
  vendorReason: string | null;
  /** Vendor's own error token. Rendered verbatim. */
  vendorErrorCode: string | null;
  /** Backend failure summary for a failed dispatch. */
  failureDetail: string | null;
  readonly lastStatusAt: string | null;
  readonly lastTransitionAt: string | null;
  dispatchAttempts: number | null;
  /** Backend resolution token once an operator has reconciled the row. */
  resolutionAction: string | null;
  readonly resolvedAt: string | null;
  resolvedBy: string | null;
}
