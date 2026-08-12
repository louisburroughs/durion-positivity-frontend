/**
 * Manufacturer marketing-catalog (MKCAT) enrichment client — issue #195, CAP-324.
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * `@durion-sdk/supplier` covers issue #188 only (vendor profiles, auth configs,
 * commercial accounts, endpoint bindings, exchange audit) and exposes no
 * enrichment operation, so this service calls `ApiBaseService` (ADR-0010),
 * matching the PRICAT surface. The assumed contract is recorded here so it can
 * be reconciled against the real controller by diff.
 *
 * ── Assumed endpoint contract (`/supplier/v1/**`) ────────────────────────────
 * Coded against durion-positivity-backend#1230 (enrichment read + unmatched store).
 *
 *   GET /supplier/v1/enrichment/products/{productId}
 *     → 200 SupplierProductEnrichment
 *     → 204 no enrichment held for this product  (mapped to `null`)
 *     → 404 no enrichment held for this product  (mapped to `null`)
 *     → 403 caller may not read enrichment       (propagated)
 *     → 5xx retryable                            (propagated)
 *
 *   GET /supplier/v1/enrichment/unmatched
 *       ?vendorProfileId&reason&search&dateFrom&dateTo&pageToken
 *     → 200 SupplierUnmatchedEnrichmentPage
 *
 * ── Absence is not an error ──────────────────────────────────────────────────
 * `getProductEnrichment()` maps `204`/`404`/empty body to `null` rather than
 * erroring, because "this product has no manufacturer content" is the ordinary
 * case for most of the catalog. Making it an error path would push every
 * unenriched product through an error state and produce exactly the empty
 * section the story forbids. A `403` or `5xx` is *not* mapped away: those mean
 * we do not know, which is a different fact and stays visible to the caller.
 *
 * No locale parameter is sent. The backend returns every locale the manufacturer
 * published and the client resolves one via `utils/enrichment-locale.util.ts`;
 * asking the server to pre-select would lose the information needed to tell the
 * user that the text they are reading is a fallback language.
 *
 * v1 is read-only: there is deliberately no match-resolution or edit operation.
 */
import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  SupplierProductEnrichment,
  SupplierUnmatchedEnrichmentFilter,
  SupplierUnmatchedEnrichmentPage,
} from '../models/supplier-enrichment.models';

const ROOT = '/supplier/v1/enrichment';

@Injectable({ providedIn: 'root' })
export class SupplierEnrichmentService {
  private readonly api = inject(ApiBaseService);

  /**
   * Manufacturer content for one catalog product, or `null` when none is held.
   *
   * `null` is the signal the Product Detail section uses to render nothing at
   * all — never an empty panel.
   */
  getProductEnrichment(productId: string): Observable<SupplierProductEnrichment | null> {
    return this.api
      .get<SupplierProductEnrichment | null>(`${ROOT}/products/${productId}`)
      .pipe(
        map(body => body ?? null),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 204)) {
            return of(null);
          }
          return throwError(() => error);
        }),
      );
  }

  /** Admin worklist of enrichment that matched no catalog product. */
  listUnmatchedEnrichment(
    filter: SupplierUnmatchedEnrichmentFilter = {},
    pageToken?: string,
  ): Observable<SupplierUnmatchedEnrichmentPage> {
    let params = new HttpParams();
    if (filter.vendorProfileId) {
      params = params.set('vendorProfileId', filter.vendorProfileId);
    }
    if (filter.reason) {
      params = params.set('reason', filter.reason);
    }
    if (filter.search) {
      params = params.set('search', filter.search);
    }
    if (filter.dateFrom) {
      params = params.set('dateFrom', filter.dateFrom);
    }
    if (filter.dateTo) {
      params = params.set('dateTo', filter.dateTo);
    }
    if (pageToken) {
      params = params.set('pageToken', pageToken);
    }
    return this.api.get<SupplierUnmatchedEnrichmentPage>(`${ROOT}/unmatched`, params);
  }
}
