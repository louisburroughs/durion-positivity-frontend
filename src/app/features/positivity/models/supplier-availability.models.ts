/**
 * Live supplier availability domain model (issue #190, CAP-319).
 *
 * Interfaces only.
 *
 * ── Why every numeric field is nullable ──────────────────────────────────────
 * A vendor result carries numbers **only** when its `status` is `OK`
 * (DECISION-POSITIVITY-006). For every other status the backend sends `null`,
 * and the UI must render the status instead. Typing the quantities as
 * `number | null` makes "we do not know" unrepresentable as `0`, so a template
 * cannot accidentally coalesce an unknown quantity into a number that reads as
 * a real vendor promise.
 *
 * ── Two distinct time facts (never conflated) ────────────────────────────────
 *   - `asOf`        — the vendor's own observation time for the quantities.
 *   - `fetchedAt`   — the instant the platform performed the lookup.
 * Staleness is computed against `asOf` only; see `supplier-freshness.util`.
 *
 * Delivery dates are vendor-local **date-only** values (`YYYY-MM-DD`, ADR-0038)
 * and must never be fed to `DatePipe` raw.
 */

/**
 * Per-vendor component status.
 *
 * `NOT_LISTED` is informational — the vendor simply does not carry the product;
 * it is not a failure and is never rendered as an error.
 * `CAPABILITY_NOT_CONFIGURED` means no stock-report binding exists for that
 * vendor; it renders as "not enabled" rather than being hidden, so a
 * misconfiguration stays diagnosable from the screen it affects.
 */
export type SupplierAvailabilityStatus =
  | 'OK'
  | 'SUPPLIER_UNAVAILABLE'
  | 'NOT_LISTED'
  | 'CAPABILITY_NOT_CONFIGURED';

/** Vendor-quoted delivery expectation. Every member is optional per vendor capability. */
export interface SupplierDeliveryEstimate {
  /** Vendor-local date-only value, `YYYY-MM-DD` (ADR-0038). */
  earliestDeliveryDate?: string | null;
  leadTimeDays?: number | null;
  /** Instant after which the estimate no longer applies (order cut-off). */
  cutoffAt?: string | null;
}

/** One vendor's answer for one product at one delivery location. */
export interface SupplierAvailabilityVendorResult {
  vendorProfileId: string;
  /** Human label for the vendor row. Rows are labelled per vendor, never aggregated. */
  vendorDisplayName: string;
  /** Vendor warehouse / branch the quantities came from, when the vendor reports one. */
  warehouseName?: string | null;
  status: SupplierAvailabilityStatus;
  /** Null unless `status === 'OK'`. Never coalesce to `0`. */
  availableQuantity: number | null;
  /** Null unless `status === 'OK'`. */
  unitOfMeasure: string | null;
  deliveryEstimate?: SupplierDeliveryEstimate | null;
  /** Vendor observation time for these quantities. Null when the vendor sends none. */
  asOf: string | null;
  /** Stable backend failure code when `status === 'SUPPLIER_UNAVAILABLE'`. */
  errorCode?: string | null;
}

/** Availability roll-up for one product at one delivery location. */
export interface SupplierAvailability {
  productId?: string | null;
  sku?: string | null;
  deliveryLocationId: string;
  /** Instant the platform performed this lookup — never presented as data currency. */
  readonly fetchedAt: string;
  /** Backend-delivered staleness threshold in minutes; `0` disables the check. */
  stalenessThresholdMinutes: number;
  /** One entry per configured vendor. No client-side ranking or aggregation. */
  vendors: SupplierAvailabilityVendorResult[];
}

/** An active pos-location offered as a delivery context. */
export interface SupplierDeliveryLocation {
  locationId: string;
  name: string;
}
