/**
 * Vendor order-transmission domain model (issue #191, CAP-320).
 *
 * Interfaces only.
 *
 * ── The absent operation is part of the contract ─────────────────────────────
 * There is no re-send, retry or re-transmit shape anywhere in this file, and
 * that is deliberate rather than unfinished. Re-transmitting an order that the
 * vendor may already hold produces a duplicate *physical* order — tyres on a
 * truck, an invoice, a return. Reconciliation is therefore status-first and
 * backend-owned: the platform records what the vendor said and offers only the
 * resolution actions the backend itself is willing to accept.
 *
 * ── Resolution actions are data, not a client-side enum ─────────────────────
 * `SupplierManualReviewItem.resolutionActions` is whatever the backend chooses
 * to deliver for that row and that caller. An administrator with no resolution
 * permission receives an empty list, and the UI then renders no action at all.
 * Modelling the actions as a closed client-side union would let the UI offer a
 * button the backend would reject — or, worse, keep offering one after the
 * backend withdrew it.
 *
 * ── Vendor references are attributes, never keys ────────────────────────────
 * `vendorOrderNumber` and `vendorDocumentId` are vendor-assigned strings shown
 * as data. Every internal identifier on these types (`purchaseOrderId`,
 * `poLineId`, `vendorProfileId`) is a platform UUID, and navigation uses those.
 *
 * ── Two distinct time facts ─────────────────────────────────────────────────
 *   - `asOf`      — the vendor's own effective time for the transmission state.
 *   - `fetchedAt` — the instant the platform last pulled it.
 * Staleness is computed against `asOf` only; see `supplier-freshness.util`.
 *
 * Vendor-quoted ship dates are date-only `YYYY-MM-DD` values (ADR-0038) and are
 * never handed to `DatePipe` raw.
 */

/**
 * Vendor transmission state for one purchase order.
 *
 * `MANUAL_REVIEW` is the ambiguous outcome: the platform cannot tell whether the
 * vendor holds the order. It exists so an ambiguous transmission becomes a
 * visible queue item instead of a silent duplicate order.
 */
export type SupplierTransmissionState =
  | 'QUEUED'
  | 'SENT'
  | 'CONFIRMED'
  | 'PARTIALLY_CONFIRMED'
  | 'REJECTED'
  | 'MANUAL_REVIEW';

/** Per-line vendor outcome as delivered. Never normalised or re-labelled here. */
export type SupplierLineConfirmationOutcome =
  | 'ACCEPTED'
  | 'REJECTED'
  | 'BACKORDERED'
  | 'PENDING';

/** One vendor answer for one purchase-order line. */
export interface SupplierOrderLineConfirmation {
  /** Platform line UUID — the navigation/correlation key. */
  poLineId: string;
  /** Vendor line reference, when the vendor echoes one. Display only. */
  vendorLineReference?: string | null;
  sku?: string | null;
  productName?: string | null;
  orderedQuantity: number;
  /**
   * Quantity the vendor confirmed.
   *
   * `null` when the vendor has not answered for this line yet. Never coalesced
   * to `0`: "no answer" and "confirmed none" are different facts, and only one
   * of them means the parts are not coming.
   */
  confirmedQuantity: number | null;
  outcome: SupplierLineConfirmationOutcome;
  /**
   * The vendor's own reason text. Rendered verbatim as vendor data beside a
   * translated label — never translated, never re-worded (ADR-0030).
   */
  vendorReason?: string | null;
  /** Vendor-quoted ship date, date-only `YYYY-MM-DD` (ADR-0038). */
  expectedShipDate?: string | null;
}

/**
 * One append-only entry in the vendor status history.
 *
 * Sourced from `supplier.orderstatus.changed.v1`. The list is never mutated,
 * dismissed or reordered client-side: it is the audit trail of what the vendor
 * said and when, and an operator editing it would destroy the only record that
 * explains a disputed delivery.
 */
export interface SupplierOrderStatusEvent {
  readonly statusEventId: string;
  /** Vendor event time. */
  readonly occurredAt: string;
  /** Platform state the event moved the transmission to, when it maps to one. */
  state?: SupplierTransmissionState | null;
  /** Raw vendor status token. Vendor data, rendered verbatim. */
  vendorStatus?: string | null;
  /** Free-text vendor note. Vendor data, rendered verbatim. */
  note?: string | null;
}

/**
 * A resolution action the backend is willing to accept for one ambiguous row.
 *
 * `action` is an opaque backend token (`CONFIRM_MATCHED`, `MARK_REJECTED`, …)
 * echoed back on the resolution POST. The UI translates the tokens it knows and
 * falls back to the token itself for one it does not, so a new backend action
 * appears rather than disappearing.
 */
export interface SupplierManualReviewAction {
  action: string;
  /** Backend-supplied explanatory text. Server data — secondary detail only. */
  description?: string | null;
}

/** Vendor transmission state for one purchase order, with per-line detail. */
export interface SupplierOrderTransmission {
  purchaseOrderId: string;
  vendorProfileId: string;
  vendorDisplayName: string;
  state: SupplierTransmissionState;
  /** Vendor-assigned order number. An attribute, never a navigation key. */
  vendorOrderNumber?: string | null;
  /** Vendor/platform document reference for the transmitted order document. */
  vendorDocumentId?: string | null;
  /** Per-line vendor answers. Empty until the vendor confirms anything. */
  lines: SupplierOrderLineConfirmation[];
  /** Backend reason this transmission needs human reconciliation. */
  manualReviewReason?: string | null;
  /**
   * Resolution actions the backend offers *this caller* for this row.
   *
   * Empty for a caller without the permission, and empty for any state other
   * than `MANUAL_REVIEW`. There is no re-send action in this list, ever.
   */
  resolutionActions: SupplierManualReviewAction[];
  /** Vendor effective time for `state`. Null when the vendor sends none. */
  asOf: string | null;
  /** Instant the platform last pulled this — never presented as data currency. */
  readonly fetchedAt: string;
  /** Backend-delivered staleness threshold in minutes; `0` disables the check. */
  stalenessThresholdMinutes: number;
}

/** One ambiguous transmission awaiting human reconciliation. */
export interface SupplierManualReviewItem {
  purchaseOrderId: string;
  /** Human purchase-order number for the operator. Display only. */
  poNumber?: string | null;
  vendorProfileId: string;
  vendorDisplayName: string;
  vendorOrderNumber?: string | null;
  state: SupplierTransmissionState;
  /** Backend reason token for the ambiguity, e.g. `NO_VENDOR_ACK`. */
  reason: string;
  readonly detectedAt: string;
  resolutionActions: SupplierManualReviewAction[];
  /** True once the backend considers the row reconciled. */
  resolved: boolean;
}

/** Filter inputs for the manual-review queue. Dates are `YYYY-MM-DD` (ADR-0038). */
export interface SupplierManualReviewFilter {
  vendorProfileId?: string;
  /** Free-text match over PO number and vendor order number. */
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Paged manual-review queue response. */
export interface SupplierManualReviewPage {
  items: SupplierManualReviewItem[];
  totalCount: number;
  nextPageToken?: string | null;
}

/** Append-only status history for one purchase-order transmission. */
export interface SupplierOrderStatusHistory {
  purchaseOrderId: string;
  /** Backend order is authoritative; the UI sorts oldest-first for display only. */
  events: SupplierOrderStatusEvent[];
  readonly fetchedAt: string;
}
