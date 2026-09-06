/**
 * Domain shapes for the vendor-supplied tread-design enrichment (#218).
 *
 * Mirrors `@durion-sdk/catalog`'s `TreadDesignDto`, kept separate from the
 * generated SDK type per this repo's convention. Enrichment is vendor-supplied
 * marketing content matched to a catalog product by fuzzy matching — it is
 * never a source for any structural or identity field, and must render
 * distinguishable from catalog-owned product data (DECISION-POSITIVITY-004,
 * carried over from #195/#196).
 *
 * Phase 2 (#218, backend #1645/ADR-0060) adds the review/resolve surface:
 * `matchState`/`matchStateAt`/`candidates` on the design itself, and the
 * `TreadDesignResolveRequest` a reviewer submits via `resolveTreadDesign`.
 */

/** Where a design stands in the enrichment review cycle (ADR-0060 §7/§8). */
export type TreadDesignMatchState = 'UNMATCHED' | 'REVIEW' | 'MATCHED' | 'REJECTED' | 'DEFERRED';

/** What a candidate's score means under the configured thresholds (ADR-0060 §2). */
export type TreadDesignCandidateTier = 'AUTO' | 'REVIEW' | 'NONE';

/** A product the matcher scored against a design, with its confidence tier. */
export interface TreadDesignCandidate {
  readonly productId: string | null;
  readonly score: number | null;
  readonly tier: TreadDesignCandidateTier | null;
}

/** The three actions `resolveTreadDesign` accepts (ADR-0060 §7). */
export type TreadDesignResolveAction = 'ATTACH' | 'REJECT' | 'DEFER';

/**
 * A reviewer's decision about a design awaiting review.
 *
 * `productIds` is required for `ATTACH` and rejected by the backend for the
 * other two actions; `deferUntil` (an ISO instant) applies to `DEFER` only;
 * `note` is always optional. Shaped by the caller, not the form control
 * values directly, so a blank note/date collapses to `undefined` before it
 * ever reaches the service.
 */
export interface TreadDesignResolveRequest {
  readonly action: TreadDesignResolveAction;
  readonly productIds?: readonly string[];
  readonly note?: string;
  readonly deferUntil?: string;
}

export interface TreadDesignEnrichmentText {
  readonly languageCode: string | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly footNotes: string | null;
}

export interface TreadDesignEnrichmentImage {
  readonly imageId: number | null;
  readonly imageType: string | null;
  /** Still missing and awaiting a future republication. */
  readonly unresolved: boolean;
}

export interface TreadDesignEnrichment {
  readonly id: string;
  readonly brand: string | null;
  readonly treadDesign: string | null;
  readonly treadDesign2: string | null;
  readonly productName: string | null;
  readonly vehicleType: string | null;
  readonly seasonality: string | null;
  readonly supplierRef: string | null;
  readonly vendorProfileId: string | null;
  readonly vendorVariantId: string | null;
  readonly updatedAt: string | null;
  /** Whether any artwork on this design is still missing and awaiting retry. */
  readonly hasUnresolvedImages: boolean;
  readonly images: readonly TreadDesignEnrichmentImage[];
  readonly texts: readonly TreadDesignEnrichmentText[];
  /** Where this design stands in the review cycle. Null on older/partial reads. */
  readonly matchState: TreadDesignMatchState | null;
  /** When `matchState` last actually changed (re-scoring the same state does not bump it). */
  readonly matchStateAt: string | null;
  /**
   * Products scored against this design, best first. Up to 20 on the
   * worklist read (`listUnmatchedTreadDesigns`); empty on the product-scoped
   * read (`getTreadDesignForProduct`), which is about one resolved match, not
   * a pending decision. The review page loads the complete list separately
   * via `listTreadDesignCandidates` rather than relying on this truncated set.
   */
  readonly candidates: readonly TreadDesignCandidate[];
}

/** One row of the unmatched-enrichment review worklist — read-only in this phase. */
export type UnmatchedTreadDesign = TreadDesignEnrichment;

export interface UnmatchedTreadDesignPage {
  readonly items: readonly UnmatchedTreadDesign[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}
