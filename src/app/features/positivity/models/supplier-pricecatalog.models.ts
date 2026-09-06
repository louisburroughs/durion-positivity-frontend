/**
 * Vendor PRICAT (price-catalog) freshness, import-history and quarantine
 * domain model (issue #213; backend PR #1644, closing #1637/#1638 row 1).
 *
 * Interfaces only. Every field is a field-by-field projection of the
 * generated `PriceCatalogFreshnessView` / `PriceCatalogImportSummary` /
 * `UnmatchedPriceCatalogLineView` shapes from `@durion-sdk/supplier`; the
 * mapping lives in `supplier-price-catalog.service.ts`.
 *
 * ── Two time facts, kept apart everywhere ───────────────────────────────────
 * `latestEffectiveDate` (what the vendor itself stated on a completed import)
 * and `lastFetchedAt` (when this platform last retrieved it, over every run
 * including failed and empty ones) answer different questions and are never
 * collapsed into one displayed value.
 */

/** One PRICE_CATALOG binding's schedule and scheduler-lease state. */
export interface PriceCatalogBindingFreshness {
  readonly bindingId: string;
  enabled: boolean;
  /** Null when the feed only runs on demand. */
  scheduleCron: string | null;
  /** Null for full-snapshot protocols and for a binding a scheduled run never claimed. */
  checkpointAt: string | null;
  /** Null when a scheduled run never ran. */
  lastRunOutcome: string | null;
  /** Null when a scheduled run never ran. */
  lastRunStartedAt: string | null;
}

/** Freshness of one vendor profile's price catalog. */
export interface PriceCatalogFreshness {
  vendorProfileId: string;
  /** Vendor document metadata — the newest catalog date the vendor itself stated. Null when no import ever completed. */
  latestEffectiveDate: string | null;
  /** Platform retrieval time, over every run including failed and empty ones. Null when never fetched. */
  lastFetchedAt: string | null;
  /** When staging last committed. Null when no run ever completed. */
  lastCompletedAt: string | null;
  /** Open quarantine lines still awaiting a catalog fix. */
  unresolvedUnmatchedCount: number;
  /** Backend-configured staleness threshold, ISO-8601 duration. Rendered as echoed, never as a client constant. */
  stalenessThreshold: string | null;
  stale: boolean;
  bindings: PriceCatalogBindingFreshness[];
}

export type PriceCatalogImportStatus = 'IN_PROGRESS' | 'COMPLETED' | 'EMPTY' | 'FAILED';

/** Bookkeeping summary of one vendor PRICAT import run. */
export interface PriceCatalogImport {
  readonly importManifestId: string;
  vendorProfileId: string;
  supplierRef: string | null;
  /** Null on runs recorded before binding ids were persisted, and on quarantine re-application manifests. */
  bindingId: string | null;
  status: PriceCatalogImportStatus | null;
  /** When the vendor was called. */
  fetchedAt: string | null;
  /** Null while in progress or after a failed fetch. */
  completedAt: string | null;
  sourceDocumentId: string | null;
  /** Vendor catalog document date, date-only `YYYY-MM-DD` (ADR-0038), when stated. */
  sourceDocumentDate: string | null;
  countryCode: string | null;
  currency: string | null;
  linesFetched: number | null;
  linesMatched: number | null;
  linesUnmatched: number | null;
  linesDuplicate: number | null;
  chunkCount: number | null;
  /** Stable machine-readable failure category; null unless the run failed. */
  errorCode: string | null;
  failureDetail: string | null;
  /** Null for full-snapshot protocols — every current PRICAT protocol. */
  windowFrom: string | null;
  windowTo: string | null;
}

/** Filter inputs for the imports list. All optional. */
export interface PriceCatalogImportFilter {
  bindingId?: string;
  status?: PriceCatalogImportStatus;
  /** Inclusive lower bound on `fetchedAt`, ISO-8601 instant. */
  dateFrom?: string;
  /** Exclusive upper bound on `fetchedAt`, ISO-8601 instant. */
  dateTo?: string;
}

/** Paged imports-list response. */
export interface PriceCatalogImportPage {
  items: PriceCatalogImport[];
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
}

export type UnmatchedLineReason =
  | 'NO_IDENTIFIER'
  | 'NO_CATALOG_MATCH'
  | 'AMBIGUOUS_CATALOG_MATCH'
  | 'CATALOG_UNAVAILABLE'
  | 'DUPLICATE_LINE'
  | 'MALFORMED_LINE';

/** One quarantined PRICAT line awaiting a catalog fix. */
export interface UnmatchedPriceCatalogLine {
  readonly unmatchedLineId: string;
  importManifestId: string;
  vendorProfileId: string;
  /** 1-based line position in the vendor document, when stated. */
  positionNumber: number | null;
  articleEan: string | null;
  /** Vendor's own article code — an alias for display, never an identifier. */
  supplierArticleCode: string | null;
  xReferenceCode: string | null;
  reason: UnmatchedLineReason | null;
  reasonDetail: string | null;
  /** Display data only; an unmatched line has no product, so nothing prices against it. */
  netPrice: number | null;
  grossPrice: number | null;
  /** Date-only `YYYY-MM-DD` (ADR-0038), when stated. */
  effectiveFrom: string | null;
  currency: string | null;
  fetchedAt: string;
  /** Null while quarantined. */
  resolvedAt: string | null;
}

/** Filter inputs for the unmatched-lines worklist. All optional. */
export interface UnmatchedLineFilter {
  reason?: UnmatchedLineReason;
  /** Case-insensitive contains-match over EAN, vendor article code and cross-reference code. */
  search?: string;
  /** Inclusive lower bound on `fetchedAt`, ISO-8601 instant. */
  dateFrom?: string;
  /** Exclusive upper bound on `fetchedAt`, ISO-8601 instant. */
  dateTo?: string;
  /** true lists resolved (closed) lines instead of the open worklist. */
  resolved?: boolean;
}

/** Paged unmatched-lines response. */
export interface UnmatchedLinePage {
  items: UnmatchedPriceCatalogLine[];
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
}
