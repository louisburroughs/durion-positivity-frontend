/**
 * Vendor stock-snapshot domain model (issue #217; backend PR #1644, closing
 * #1638 row 6).
 *
 * Interfaces only. Every field is a field-by-field projection of the
 * generated `StockSnapshotSummary` shape from `@durion-sdk/supplier` (the
 * metadata read) and the backend's `StockSnapshotLineView` record (the paged
 * lines read, which the generated client returns as untyped `PagedResponse`
 * items); the mapping lives in `supplier-stock-snapshot.service.ts`.
 *
 * ── Two clocks, kept apart ───────────────────────────────────────────────────
 * `snapshotAsOf` (and `issuedOn`) are the vendor's own claims about the
 * vendor's own moment; `fetchedAt`/`completedAt` are this platform's record of
 * when it asked and finished storing the answer. Staleness of the stock
 * picture is judged against `snapshotAsOf`, never against `fetchedAt`, and the
 * two are never collapsed into one displayed timestamp.
 *
 * ── availableQuantity nullability is the contract ───────────────────────────
 * `null` means the vendor reported the article WITHOUT stating a quantity;
 * `0` means it explicitly reported none. Collapsing the two would convert
 * "the vendor said nothing" into "the vendor said none".
 */

export type StockSnapshotStatus = 'COMPLETED' | 'EMPTY' | 'REJECTED' | 'FAILED';

/** Metadata of one vendor profile's latest stock-report snapshot fetch. */
export interface StockSnapshotSummary {
  readonly snapshotId: string;
  vendorProfileId: string;
  supplierRef: string | null;
  buyerAccountNumber: string | null;
  countryCode: string | null;
  documentId: string | null;
  /** Vendor-stated issue date of the document (vendor time), when stated. */
  issuedOn: string | null;
  /** Vendor-stated instant the stock picture describes (vendor time). Staleness is judged against this. */
  snapshotAsOf: string | null;
  /** Platform time: when this platform called the vendor. */
  fetchedAt: string | null;
  /** Platform time: when storing the snapshot finished. Null after a failure. */
  completedAt: string | null;
  status: StockSnapshotStatus | null;
  protocolVersion: string | null;
  linesReported: number | null;
  linesRejected: number | null;
}

/** One article's reported availability within a stock snapshot. */
export interface StockSnapshotLine {
  readonly lineId: string;
  /** The vendor's own line id within the document, when stated. */
  vendorLineId: string | null;
  articleEan: string | null;
  /** The vendor's own article code — an alias for display, never an identifier. */
  supplierArticleCode: string | null;
  /** The buyer's own code as the vendor holds it, when stated. */
  buyersArticleId: string | null;
  description: string | null;
  /** Null means the vendor stated NO quantity; zero means it explicitly reported none. */
  availableQuantity: number | null;
}

/** Paged snapshot-lines response, addressed by the immutable `snapshotId`. */
export interface StockSnapshotLinePage {
  items: StockSnapshotLine[];
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
}
