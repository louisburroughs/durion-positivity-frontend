/**
 * PRICAT sync-run and unmatched-line domain model (ADR-0053).
 *
 * Interfaces only.
 *
 * Two distinct time facts must never be conflated in the UI (ADR-0053 §2):
 *   - `latestEffectiveDate` — the vendor-declared effective date of the price
 *     data (a vendor-local **date-only** value, `YYYY-MM-DD`, ADR-0038).
 *   - `lastFetchedAt` — the platform instant we last pulled from the vendor.
 * Fetch time is never presented as data currency.
 *
 * A failed or empty run never clears data: previously ingested prices remain
 * authoritative, and the UI states that explicitly.
 */

/** Outcome of one PRICAT run. `EMPTY` = the vendor returned no lines (non-destructive). */
export type PricatRunOutcome =
  | 'RUNNING'
  | 'SUCCESS'
  | 'PARTIAL'
  | 'EMPTY'
  | 'FAILED';

/** Why a received catalog line could not be matched to a catalog product (ADR-0053 §5). */
export type PricatUnmatchedReason =
  | 'NO_EAN_MATCH'
  | 'NO_UPC_MATCH'
  | 'NO_MPN_MATCH'
  | 'AMBIGUOUS_MATCH'
  | 'MISSING_IDENTIFIERS';

/** One PRICAT sync run against a vendor binding. */
export interface PricatRun {
  readonly runId: string;
  vendorProfileId: string;
  bindingId: string;
  readonly startedAt: string;
  readonly finishedAt?: string | null;
  /** Checkpoint window covered by this run (ISO instants). */
  windowFrom?: string | null;
  windowTo?: string | null;
  outcome: PricatRunOutcome;
  linesFetched: number;
  linesStored: number;
  linesUnmatched: number;
  linesDuplicate: number;
  /** Opaque backend checkpoint token carried to the next run. */
  checkpointState?: string | null;
  checkpointAt?: string | null;
  sourceDocumentId?: string | null;
  /** Stable failure code when `outcome === 'FAILED'`. */
  errorCode?: string | null;
}

/** `202 Accepted` response to an on-demand run request. */
export interface PricatRunTriggerResponse {
  runId: string;
  accepted: boolean;
  /** Backend-suggested poll delay in milliseconds. */
  pollAfterMs?: number;
}

/**
 * Freshness roll-up for a profile's supplier price data.
 * `latestEffectiveDate` is date-only; `lastFetchedAt` is an instant.
 */
export interface PricatFreshness {
  vendorProfileId: string;
  /** Vendor effective date of the newest applicable entry, `YYYY-MM-DD` (ADR-0038). */
  latestEffectiveDate: string | null;
  /** Instant of the last successful fetch. */
  lastFetchedAt: string | null;
  /** Backend-delivered staleness threshold, in minutes. */
  stalenessThresholdMinutes: number;
  /** Count backing the unmatched-lines tab badge. */
  unmatchedLineCount: number;
}

/**
 * A quarantined catalog line awaiting a catalog fix (ADR-0053 §5).
 * Rows persist until the backend reports them matched — there is no client-side
 * dismissal.
 */
export interface PricatUnmatchedLine {
  readonly unmatchedLineId: string;
  vendorProfileId: string;
  ean?: string | null;
  gtin?: string | null;
  manufacturerPartNumber?: string | null;
  description?: string | null;
  reason: PricatUnmatchedReason;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  occurrences: number;
  sourceDocumentId?: string | null;
}

/** Filter inputs for the unmatched-lines worklist. Dates are `YYYY-MM-DD` (ADR-0038). */
export interface PricatUnmatchedFilter {
  reason?: PricatUnmatchedReason | '';
  /** Free-text match over EAN/GTIN/MPN/description. */
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Paged unmatched-lines response. */
export interface PricatUnmatchedPage {
  items: PricatUnmatchedLine[];
  totalCount: number;
  nextPageToken?: string | null;
}
