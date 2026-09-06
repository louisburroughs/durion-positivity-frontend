/**
 * Domain shapes for the vendor-supplied tread-design enrichment (#218).
 *
 * Mirrors `@durion-sdk/catalog`'s `TreadDesignDto`, kept separate from the
 * generated SDK type per this repo's convention. Enrichment is vendor-supplied
 * marketing content matched to a catalog product by fuzzy matching — it is
 * never a source for any structural or identity field, and must render
 * distinguishable from catalog-owned product data (DECISION-POSITIVITY-004,
 * carried over from #195/#196).
 */

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
