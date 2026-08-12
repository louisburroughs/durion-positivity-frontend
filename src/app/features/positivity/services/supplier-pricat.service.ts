/**
 * PRICAT sync-run and unmatched-lines client.
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * No `@durion-sdk/supplier` package exists; per the SDK-less domain convention
 * this service calls `ApiBaseService` (ADR-0010 — never `HttpClient` in a
 * feature).
 *
 * ── Assumed endpoint contract (`/supplier/v1/**`) ────────────────────────────
 * Coded against durion-positivity-backend#1224 (PRICAT run/history/unmatched
 * APIs), ADR-0053. Reconcile this block against the controller when the backend
 * lands.
 *
 *   GET  /supplier/v1/vendor-profiles/{profileId}/pricat/runs?bindingId&size
 *        → PricatRun[]  (newest first)
 *   POST /supplier/v1/vendor-profiles/{profileId}/pricat/runs
 *        body { bindingId }  → 202 PricatRunTriggerResponse
 *        403 when the caller may view runs but not trigger them
 *   GET  /supplier/v1/vendor-profiles/{profileId}/pricat/freshness
 *        → PricatFreshness (vendor effective date + last fetch + unmatched count)
 *   GET  /supplier/v1/vendor-profiles/{profileId}/pricat/unmatched-lines
 *        ?reason&search&dateFrom&dateTo&pageToken&size → PricatUnmatchedPage
 *
 * There is deliberately **no** dismissal/resolve endpoint: unmatched lines are a
 * worklist owned by the backend and clear only when a catalog fix makes them
 * matchable (ADR-0053 §5). A failed or empty run leaves previously ingested
 * prices authoritative; nothing here clears data.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  PricatFreshness,
  PricatRun,
  PricatRunTriggerResponse,
  PricatUnmatchedFilter,
  PricatUnmatchedPage,
} from '../models/supplier-pricat.models';

const ROOT = '/supplier/v1/vendor-profiles';

@Injectable({ providedIn: 'root' })
export class SupplierPricatService {
  private readonly api = inject(ApiBaseService);

  listRuns(vendorProfileId: string, bindingId?: string): Observable<PricatRun[]> {
    let params = new HttpParams();
    if (bindingId) {
      params = params.set('bindingId', bindingId);
    }
    return this.api.get<PricatRun[]>(`${ROOT}/${vendorProfileId}/pricat/runs`, params);
  }

  /** On-demand run. Backend answers `202`; the caller polls `listRuns()`. */
  triggerRun(vendorProfileId: string, bindingId: string): Observable<PricatRunTriggerResponse> {
    return this.api.post<PricatRunTriggerResponse>(
      `${ROOT}/${vendorProfileId}/pricat/runs`,
      { bindingId },
    );
  }

  getFreshness(vendorProfileId: string): Observable<PricatFreshness> {
    return this.api.get<PricatFreshness>(`${ROOT}/${vendorProfileId}/pricat/freshness`);
  }

  listUnmatchedLines(
    vendorProfileId: string,
    filter: PricatUnmatchedFilter = {},
    pageToken?: string,
  ): Observable<PricatUnmatchedPage> {
    let params = new HttpParams();
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
    return this.api.get<PricatUnmatchedPage>(
      `${ROOT}/${vendorProfileId}/pricat/unmatched-lines`,
      params,
    );
  }
}
