import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  Page,
  TreadDesignCandidateDto,
  TreadDesignDto,
  TreadDesignEnrichmentService,
  TreadDesignResolveRequest as SdkTreadDesignResolveRequest,
} from '@durion-sdk/catalog';
import {
  TreadDesignCandidate,
  TreadDesignEnrichment,
  TreadDesignEnrichmentImage,
  TreadDesignEnrichmentText,
  TreadDesignMatchState,
  TreadDesignResolveRequest,
  UnmatchedTreadDesignPage,
} from '../models/tread-design-enrichment.models';

/**
 * Vendor-supplied tread-design enrichment reads, and (phase 2, #218 / backend
 * #1645 / ADR-0060) the review/resolve mutation.
 *
 * ── Transport ────────────────────────────────────────────────────────────
 * Backed entirely by the generated `@durion-sdk/catalog`
 * `TreadDesignEnrichmentService` (ADR-0010) — no hand-written path anywhere
 * in this file.
 *
 * ── "No match" is not an error ────────────────────────────────────────────
 * `getEnrichmentForProduct` maps a 404 (no enrichment for this product — an
 * ordinary outcome per the SDK doc, not a failure) to `null`, and does the
 * same for any other transport failure: the product-detail isolation rule
 * (DECISION-POSITIVITY-004, #218) is that an enrichment fetch failure must
 * never surface as an error on the rest of Product Detail, so this service
 * never raises one for the panel to catch — absence and failure both read as
 * "no enrichment to show" to the caller.
 *
 * ── Resolve errors are NOT swallowed ──────────────────────────────────────
 * Unlike the read above, `resolve()` lets a failing Observable through
 * unchanged: a reviewer's ATTACH/REJECT/DEFER submission failing (400/404/409)
 * is exactly the outcome the review page's inline error handling needs to see,
 * not something to paper over.
 */
@Injectable({ providedIn: 'root' })
export class ProductTreadDesignService {
  private readonly treadDesignSdk = inject(TreadDesignEnrichmentService);

  /** Null means "no enrichment for this product" — absence, not an error. */
  getEnrichmentForProduct(productId: string): Observable<TreadDesignEnrichment | null> {
    return this.treadDesignSdk.getTreadDesignForProduct(productId).pipe(
      map(dto => this.toEnrichment(dto)),
      catchError(() => of(null)),
    );
  }

  /**
   * The enrichment review worklist.
   *
   * @param matchState defaults (server-side, when omitted) to the states
   *   actually awaiting a decision (`UNMATCHED`, `REVIEW`) — pass the
   *   operator's current filter selection through unchanged.
   * @param vendorProfileId narrows to one vendor profile; omit for all.
   */
  listUnmatched(
    matchState?: readonly TreadDesignMatchState[],
    vendorProfileId?: string,
    page = 0,
    size = 50,
  ): Observable<UnmatchedTreadDesignPage> {
    return this.treadDesignSdk
      .listUnmatchedTreadDesigns(
        matchState && matchState.length > 0 ? [...matchState] : undefined,
        vendorProfileId || undefined,
        page,
        size,
      )
      .pipe(map(response => this.toUnmatchedPage(response)));
  }

  /**
   * Every candidate scored against one design — not the worklist row's
   * truncated top-20, the complete set (ADR-0060 §7).
   */
  listCandidates(treadDesignId: string): Observable<readonly TreadDesignCandidate[]> {
    return this.treadDesignSdk
      .listTreadDesignCandidates(treadDesignId)
      .pipe(map(candidates => (candidates ?? []).map(candidate => this.toCandidate(candidate))));
  }

  /**
   * Record a reviewer's decision. Errors propagate — see the class doc.
   */
  resolve(treadDesignId: string, request: TreadDesignResolveRequest): Observable<TreadDesignEnrichment> {
    const body: SdkTreadDesignResolveRequest = {
      // The generated type is a real TS enum whose members are these same
      // string literals; our domain `TreadDesignResolveAction` deliberately
      // stays a plain string union (kept separate from the generated SDK
      // type per this repo's convention), so the assignment needs this cast.
      action: request.action as SdkTreadDesignResolveRequest['action'],
      productIds: request.productIds && request.productIds.length > 0 ? [...request.productIds] : undefined,
      note: request.note,
      deferUntil: request.deferUntil,
    };
    return this.treadDesignSdk
      .resolveTreadDesign(treadDesignId, body)
      .pipe(map(dto => this.toEnrichment(dto)));
  }

  // ── Mapping (SDK view ⇄ domain model) ────────────────────────────────────

  private toEnrichment(dto: TreadDesignDto): TreadDesignEnrichment {
    return {
      id: dto.id ?? '',
      brand: dto.brand ?? null,
      treadDesign: dto.treadDesign ?? null,
      treadDesign2: dto.treadDesign2 ?? null,
      productName: dto.productName ?? null,
      vehicleType: dto.vehicleType ?? null,
      seasonality: dto.seasonality ?? null,
      supplierRef: dto.supplierRef ?? null,
      vendorProfileId: dto.vendorProfileId ?? null,
      vendorVariantId: dto.vendorVariantId ?? null,
      updatedAt: dto.updatedAt ?? null,
      hasUnresolvedImages: dto.hasUnresolvedImages ?? false,
      images: (dto.images ?? []).map(image => this.toImage(image)),
      texts: (dto.texts ?? []).map(text => this.toText(text)),
      matchState: (dto.matchState as TreadDesignMatchState | undefined) ?? null,
      matchStateAt: dto.matchStateAt ?? null,
      candidates: (dto.candidates ?? []).map(candidate => this.toCandidate(candidate)),
    };
  }

  private toImage(image: {
    imageId?: number;
    imageType?: string;
    unresolved?: boolean;
  }): TreadDesignEnrichmentImage {
    return {
      imageId: image.imageId ?? null,
      imageType: image.imageType ?? null,
      unresolved: image.unresolved ?? false,
    };
  }

  private toText(text: {
    languageCode?: string;
    name?: string;
    description?: string;
    footNotes?: string;
  }): TreadDesignEnrichmentText {
    return {
      languageCode: text.languageCode ?? null,
      name: text.name ?? null,
      description: text.description ?? null,
      footNotes: text.footNotes ?? null,
    };
  }

  private toCandidate(candidate: TreadDesignCandidateDto): TreadDesignCandidate {
    return {
      productId: candidate.productId ?? null,
      score: candidate.score ?? null,
      tier: (candidate.tier as TreadDesignCandidate['tier']) ?? null,
    };
  }

  private toUnmatchedPage(response: Page): UnmatchedTreadDesignPage {
    const content = (response.content ?? []) as TreadDesignDto[];
    return {
      items: content.map(dto => this.toEnrichment(dto)),
      page: response.number ?? 0,
      size: response.size ?? content.length,
      totalElements: response.totalElements ?? content.length,
      totalPages: response.totalPages ?? 1,
    };
  }
}
