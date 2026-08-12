/**
 * Manufacturer marketing-catalog (MKCAT) enrichment domain model
 * (issue #195, CAP-324).
 *
 * Interfaces only.
 *
 * ── Enrichment augments, it never replaces ───────────────────────────────────
 * Product identity and structure stay catalog-owned. Nothing in this model
 * carries a SKU, name or category that could be substituted for the catalog's
 * own: it carries manufacturer *marketing* content only, and the UI labels it
 * as manufacturer-provided so a user can tell the two apart.
 *
 * ── Absence is a first-class outcome ─────────────────────────────────────────
 * A product with no enrichment resolves to `null`, not to an empty
 * `SupplierProductEnrichment`. The section then renders nothing at all — an
 * empty panel would claim the manufacturer published nothing, which is a
 * different fact from "we hold nothing".
 */

/**
 * One locale-tagged string from the manufacturer.
 *
 * The vendor picks which locales it publishes; there is no guarantee the user's
 * locale is among them, so every read goes through
 * `utils/enrichment-locale.util.ts` rather than indexing by locale directly.
 */
export interface SupplierLocalizedText {
  /** BCP-47 tag as published by the manufacturer, e.g. `fr-CA`. */
  locale: string;
  value: string;
}

/** A manufacturer image. `url` is vendor-hosted or platform-document-hosted. */
export interface SupplierEnrichmentImage {
  readonly imageId: string;
  url: string;
  /** Localized alternative text. Required for a11y; an image with none is not rendered. */
  altText: SupplierLocalizedText[];
  /** Vendor role hint, e.g. `TREAD`, `SIDEWALL`, `PACKSHOT`. Free-form. */
  role?: string | null;
  widthPx?: number | null;
  heightPx?: number | null;
}

/** One manufacturer attribute (tread design and similar marketing facts). */
export interface SupplierEnrichmentAttribute {
  /** Stable vendor attribute key, e.g. `TREAD_PATTERN`. Rendered verbatim if unknown. */
  code: string;
  /** Localized display label published by the manufacturer. */
  label: SupplierLocalizedText[];
  /** Localized display value. Values are vendor data — never translated by us. */
  value: SupplierLocalizedText[];
}

/** Manufacturer marketing content attached to one catalog product. */
export interface SupplierProductEnrichment {
  productId: string;
  vendorProfileId: string;
  vendorDisplayName: string;
  manufacturerName?: string | null;
  /** Localized marketing description. May be empty when the vendor sends none. */
  descriptions: SupplierLocalizedText[];
  images: SupplierEnrichmentImage[];
  /** Tread-design and other manufacturer attributes. */
  attributes: SupplierEnrichmentAttribute[];
  /** Vendor publication time for this content. */
  asOf: string | null;
  /** Instant the platform last pulled it — distinct from `asOf`. */
  readonly fetchedAt: string;
  /** Backend-delivered staleness threshold in minutes; `0` disables the check. */
  stalenessThresholdMinutes: number;
}

/** Why an inbound enrichment record matched no catalog product. */
export type SupplierEnrichmentUnmatchedReason =
  | 'NO_EAN_MATCH'
  | 'NO_GTIN_MATCH'
  | 'NO_MPN_MATCH'
  | 'AMBIGUOUS_MATCH'
  | 'MISSING_IDENTIFIERS';

/**
 * One enrichment record awaiting a catalog fix.
 *
 * Read-only in v1: there is no match-resolution control, exactly as with the
 * PRICAT worklist. Rows clear when the backend can match them.
 */
export interface SupplierUnmatchedEnrichment {
  readonly unmatchedEnrichmentId: string;
  vendorProfileId: string;
  vendorDisplayName: string;
  manufacturerName?: string | null;
  ean?: string | null;
  gtin?: string | null;
  manufacturerPartNumber?: string | null;
  /** Localized short content preview for the worklist row. */
  descriptionPreview: SupplierLocalizedText[];
  imageCount: number;
  reason: SupplierEnrichmentUnmatchedReason;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  occurrences: number;
}

/** Filter inputs for the unmatched-enrichment worklist. Dates are `YYYY-MM-DD` (ADR-0038). */
export interface SupplierUnmatchedEnrichmentFilter {
  vendorProfileId?: string;
  reason?: SupplierEnrichmentUnmatchedReason | '';
  /** Free-text match over EAN/GTIN/MPN/description. */
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Paged unmatched-enrichment response. */
export interface SupplierUnmatchedEnrichmentPage {
  items: SupplierUnmatchedEnrichment[];
  totalCount: number;
  nextPageToken?: string | null;
}
