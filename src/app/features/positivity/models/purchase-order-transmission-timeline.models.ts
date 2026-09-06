/**
 * Purchase-order vendor transmission timeline domain model (issue #215;
 * backend PR #1644, closing #1638 row 2).
 *
 * Interfaces only. Every field is a field-by-field projection of the generated
 * `PurchaseOrderTransmissionEvent` DTO from `@durion-sdk/order`; the mapping
 * lives in `purchase-order-transmission-timeline.service.ts`.
 *
 * ── Two clocks, kept apart ───────────────────────────────────────────────────
 * `observedAt` is the vendor's own statement of when something happened and is
 * what orders the timeline. `recordedAt` is this platform's clock: when the
 * observation was heard. A late-arriving observation keeps the position its
 * `observedAt` gives it; `recordedAt` is what makes that lateness visible. The
 * two are never collapsed into one displayed timestamp.
 *
 * ── One operation replaces two retired surfaces ─────────────────────────────
 * This single read stands in for both the retired shipment-event timeline and
 * the retired transmission-status history (#201). There is no second timeline
 * source and none should be added here.
 */

/** One entry on a purchase order's vendor transmission timeline. */
export interface PurchaseOrderTransmissionEvent {
  readonly transmissionEventId: string;
  /** The transmission intent in pos-supplier this observation belongs to, when known. */
  transmissionIntentId: string | null;
  /** CONFIRMED, REJECTED, STATUS_CHANGED or REVIEW_REQUIRED, verbatim from the backend. */
  eventType: string;
  /** Vendor-reported status on a status change, or the rejection reason code on a rejection. */
  status: string | null;
  vendorDocumentId: string | null;
  /** Vendor-assigned order number. An attribute, never a navigation key. */
  supplierOrderNumber: string | null;
  /** The vendor's own wording. Rendered verbatim beside a translated label. */
  vendorReason: string | null;
  /** Date-only `YYYY-MM-DD` (ADR-0038). */
  despatchDate: string | null;
  /** Date-only `YYYY-MM-DD` (ADR-0038). */
  estimatedDeliveryDate: string | null;
  /**
   * The vendor's clock: when it says this happened. Orders the timeline.
   * Null when the backend did not supply one — never coerced to `''`, which
   * `DatePipe`/`Date` would otherwise render as "Invalid Date".
   */
  readonly observedAt: string | null;
  /** This platform's clock: when the observation was heard. Null when absent. */
  readonly recordedAt: string | null;
}

/** Paged timeline result, in the server's own order — never re-sorted client-side. */
export interface PurchaseOrderTransmissionTimelinePage {
  items: PurchaseOrderTransmissionEvent[];
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
}
