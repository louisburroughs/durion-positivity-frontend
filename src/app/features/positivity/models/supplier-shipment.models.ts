/**
 * Vendor shipment-event domain model (issue #193, CAP-322).
 *
 * Interfaces only.
 *
 * ── Append-only, by construction ────────────────────────────────────────────
 * A shipment event is a fact the vendor reported at a point in time. Nothing in
 * this model carries a `dismissed`, `hidden`, `acknowledged` or `deleted` flag,
 * and no write shape exists: receiving staff read what the carrier said, they do
 * not curate it. An event that turns out to be wrong is superseded by a later
 * event, never edited away.
 *
 * ── Unlinked is a data-quality fact, not an error ───────────────────────────
 * An event whose vendor order reference matches no purchase order is still a
 * real shipment heading somewhere. It is surfaced in an administrator's flagged
 * list rather than dropped, because a dropped event is an unexplained delivery
 * at the dock.
 *
 * ── Two distinct time facts ─────────────────────────────────────────────────
 *   - `occurredAt` — when the carrier/vendor says the event happened.
 *   - `receivedAt` — when the platform ingested it.
 * The timeline is ordered by `occurredAt`; both are displayed, separately
 * labelled, so a late-arriving event is not mistaken for a late shipment.
 */

/** One vendor/carrier shipment event. */
export interface SupplierShipmentEvent {
  readonly shipmentEventId: string;
  /**
   * Purchase order the event was linked to, or `null` when it could not be
   * matched. Platform UUID — the navigation key.
   */
  purchaseOrderId?: string | null;
  /**
   * Vendor/carrier event code, e.g. `SHIPPED`, `IN_TRANSIT`, `DELIVERED`.
   * Free-form vendor vocabulary: translated when recognised, rendered verbatim
   * otherwise, so a new code appears instead of vanishing.
   */
  eventCode: string;
  /** Vendor's own description of the event. Vendor data, rendered verbatim. */
  eventDescription?: string | null;
  /** Carrier code as reported by the vendor, e.g. `DHL`. Display only. */
  carrierCode?: string | null;
  /** Carrier tracking reference. An attribute, never a navigation key. */
  trackingReference?: string | null;
  /** Vendor order number the event quoted. Display/diagnostic only. */
  vendorOrderNumber?: string | null;
  /** Number of packages the vendor reported, when it reports any. */
  packageCount?: number | null;
  /** Carrier/vendor event time — the ordering key for the timeline. */
  readonly occurredAt: string;
  /** Instant the platform ingested the event — distinct from `occurredAt`. */
  readonly receivedAt: string;
}

/** Append-only shipment timeline for one purchase order. */
export interface SupplierShipmentTimeline {
  purchaseOrderId: string;
  /** Backend order is authoritative; the UI sorts by `occurredAt` for display. */
  events: SupplierShipmentEvent[];
  /** Instant the platform performed this read — never presented as data currency. */
  readonly fetchedAt: string;
}

/** A shipment event that matched no purchase order. */
export interface SupplierUnlinkedShipmentEvent extends SupplierShipmentEvent {
  vendorProfileId: string;
  vendorDisplayName: string;
  /** Backend reason token, e.g. `NO_MATCHING_ORDER`, `AMBIGUOUS_ORDER_MATCH`. */
  unlinkedReason: string;
}

/** Filter inputs for the unlinked shipment-event list. Dates are `YYYY-MM-DD`. */
export interface SupplierUnlinkedShipmentEventFilter {
  vendorProfileId?: string;
  /** Free-text match over vendor order number, tracking reference and carrier. */
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Paged unlinked shipment-event response. */
export interface SupplierUnlinkedShipmentEventPage {
  items: SupplierUnlinkedShipmentEvent[];
  totalCount: number;
  nextPageToken?: string | null;
}
