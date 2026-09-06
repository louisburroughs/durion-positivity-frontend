import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Page, TreadDesignDto, TreadDesignEnrichmentService } from '@durion-sdk/catalog';
import {
  TreadDesignEnrichment,
  TreadDesignEnrichmentImage,
  TreadDesignEnrichmentText,
  UnmatchedTreadDesignPage,
} from '../models/tread-design-enrichment.models';

/**
 * Vendor-supplied tread-design enrichment reads (#218), read-only.
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
 * never surface as an error on the rest of the page, so this service never
 * raises one for the panel to catch — absence and failure both read as "no
 * enrichment to show" to the caller.
 *
 * ── Resolve/candidates are a later phase ──────────────────────────────────
 * `listTreadDesignCandidates` and `resolveTreadDesign` depend on backend
 * #1645 and are not generated yet; this service exposes only the two reads
 * that exist today (#218 is read-only by design).
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

  listUnmatched(page = 0, size = 50): Observable<UnmatchedTreadDesignPage> {
    return this.treadDesignSdk.listUnmatchedTreadDesigns(page, size).pipe(
      map(response => this.toUnmatchedPage(response)),
    );
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
