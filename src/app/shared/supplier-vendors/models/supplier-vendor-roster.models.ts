/**
 * The tenant's pos-supplier vendors as a picker needs them.
 *
 * Shared because two features pick a vendor from the same roster: positivity's
 * supplier-profile form (#484) and inventory's purchase-order form (CAP:550,
 * #514). Features do not import one another (ADR-0010 §3), so the roster lives
 * here and each feature keeps its own picker and copy.
 *
 * Interfaces only — no logic, no Angular imports.
 */

/** One vendor of the roster. */
export interface SupplierVendorOption {
  readonly vendorId: string;
  vendorNumber: string;
  displayName: string;
  /** False for an INACTIVE vendor — offered only as a record's own current vendor. */
  active: boolean;
}

/**
 * The tenant's ACTIVE vendors.
 *
 * The list endpoint is paged; the roster is read page by page up to a bound.
 * `truncated` is true when the tenant has more active vendors than that bound,
 * so a picker can say so instead of implying the list is complete.
 */
export interface SupplierVendorRoster {
  vendors: SupplierVendorOption[];
  truncated: boolean;
}
