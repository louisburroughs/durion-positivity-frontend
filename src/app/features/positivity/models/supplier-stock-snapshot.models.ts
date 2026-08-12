/**
 * Vendor stock-snapshot domain model (issue #193, CAP-322).
 *
 * Interfaces only.
 *
 * ── Not reported is not zero ────────────────────────────────────────────────
 * `SupplierStockSnapshotLine.quantity` is `number | null`. `null` means the
 * vendor did not report the product in this snapshot; `0` means the vendor
 * explicitly said it holds none. Typing them apart makes the confusion
 * unrepresentable: a template cannot coalesce an unreported product into a `0`
 * that a planner would read as a vendor statement of fact. A product absent
 * from `lines` entirely is likewise *not reported*, and the view says so rather
 * than rendering an empty result that reads as "nothing in stock".
 *
 * ── Supplier stock is never owned stock ─────────────────────────────────────
 * Everything here is vendor-reported and informational. It is a different fact
 * from the platform's own on-hand inventory, is labelled as such, and must not
 * share a column or a total with owned quantities anywhere the two appear
 * together. There is deliberately no `onHandQuantity` field on these types and
 * no aggregate that could sum across the two sources.
 *
 * ── Two distinct time facts ─────────────────────────────────────────────────
 *   - `asOf`      — the vendor's own snapshot time. Staleness is computed
 *                   against this, never against the fetch time.
 *   - `fetchedAt` — when the platform pulled the snapshot.
 *
 * Snapshot `asOf` may be a date-only `YYYY-MM-DD` value (ADR-0038).
 */

/** One product row in a vendor stock snapshot. */
export interface SupplierStockSnapshotLine {
  /** Catalog product UUID when the snapshot line matched one. */
  productId?: string | null;
  /** Vendor/catalog SKU as reported. */
  sku: string;
  productName?: string | null;
  ean?: string | null;
  /**
   * Vendor-reported quantity.
   *
   * `null` = not reported by the vendor. `0` = the vendor reported none.
   * Never coalesce one into the other.
   */
  quantity: number | null;
  /** Null whenever `quantity` is null — there is no unit for a non-answer. */
  unitOfMeasure: string | null;
  /** Vendor warehouse/branch the line came from, when the vendor reports one. */
  warehouseName?: string | null;
}

/**
 * Scope a snapshot was taken at.
 *
 * `type` is a free-form backend vocabulary (`COUNTRY`, `AGENCY`, `WAREHOUSE`);
 * recognised values get translated copy, others render verbatim.
 */
export interface SupplierStockSnapshotScope {
  type: string;
  /** Scope code as delivered, e.g. an ISO country code or an agency id. */
  code: string;
  /** Backend display label for the scope, when it supplies one. */
  label?: string | null;
}

/** The latest vendor stock snapshot for one vendor at one scope. */
export interface SupplierStockSnapshot {
  readonly snapshotId: string;
  vendorProfileId: string;
  vendorDisplayName: string;
  scope: SupplierStockSnapshotScope;
  /** Vendor snapshot time — the staleness basis. Null when the vendor sends none. */
  asOf: string | null;
  /** Instant the platform pulled it — never presented as data currency. */
  readonly fetchedAt: string;
  /** Backend-delivered staleness threshold in minutes; `0` disables the check. */
  stalenessThresholdMinutes: number;
  /** Product rows present in this snapshot. Absence from this list = not reported. */
  lines: SupplierStockSnapshotLine[];
  /** Total rows in the snapshot before any filter/paging was applied. */
  totalLineCount: number;
}

/** Filter inputs for the snapshot view. */
export interface SupplierStockSnapshotFilter {
  /** Restrict to one snapshot scope code (country/agency). */
  scopeCode?: string;
  /** Free-text match over SKU, EAN and product name. */
  search?: string;
}
