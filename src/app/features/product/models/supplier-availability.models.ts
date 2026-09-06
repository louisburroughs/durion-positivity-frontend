/**
 * Domain shapes for the live supplier stock-availability check (#212).
 *
 * Mirrors `@durion-sdk/supplier`'s `SupplierStockAvailability` response, kept
 * separate from the generated SDK types per this repo's convention (domain
 * models never carry generated-type optionality into the template layer).
 *
 * `availableQuantity` is always the item/piece count (A2.5 semantics) — there
 * is no unit-of-measure or warehouse-name field anywhere in this shape,
 * because the supplier wire data carries neither (#1637/#1638).
 */

/** What the vendor said about one inquired article. */
export type SupplierAvailabilityLineStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'NOT_LISTED'
  | 'NOT_ANSWERED';

export interface SupplierAvailabilityLine {
  readonly status: SupplierAvailabilityLineStatus | null;
  /** Item/piece count the vendor can supply; null = unstated, zero = vendor has none. */
  readonly availableQuantity: number | null;
  readonly currency: string | null;
  readonly earliestDeliveryDate: string | null;
  readonly quotedUnitPrice: number | null;
}

/**
 * Whether a vendor answered at all. `OK` and `NOT_LISTED` are answers;
 * `SUPPLIER_UNAVAILABLE` covers both a vendor failure and one that had not
 * answered by the fan-out deadline; the remaining two are deployment states.
 */
export type SupplierAvailabilityVendorStatus =
  | 'OK'
  | 'SUPPLIER_UNAVAILABLE'
  | 'NOT_LISTED'
  | 'CAPABILITY_NOT_CONFIGURED'
  | 'CONFIGURATION_ERROR';

export interface SupplierAvailabilityVendor {
  readonly vendorProfileId: string;
  readonly vendorDisplayName: string;
  readonly status: SupplierAvailabilityVendorStatus | null;
  /** When this platform obtained the answer; null when the vendor gave none. */
  readonly fetchedAt: string | null;
  /** The vendor-stated observation instant; a different fact from fetchedAt. */
  readonly asOf: string | null;
  /** Whether asOf is older than the echoed stalenessThreshold. Never recomputed client-side. */
  readonly stale: boolean | null;
  readonly lines: readonly SupplierAvailabilityLine[];
}

export interface SupplierAvailability {
  readonly productId: string;
  readonly deliveryLocationId: string;
  readonly requestedQuantity: number | null;
  /** Backend-owned staleness threshold, echoed as an ISO-8601 duration. */
  readonly stalenessThreshold: string | null;
  /** One entry per enabled stock-inquiry vendor; empty when none is configured. */
  readonly vendors: readonly SupplierAvailabilityVendor[];
}

/** Exactly one of productId/sku must be set; deliveryLocationId is always required. */
export interface SupplierAvailabilityQuery {
  readonly productId?: string;
  readonly sku?: string;
  readonly deliveryLocationId: string;
  readonly quantity?: number;
}
