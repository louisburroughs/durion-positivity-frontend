/**
 * Supplier exchange-audit read client.
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * No `@durion-sdk/supplier` package exists; per the SDK-less domain convention
 * this service calls `ApiBaseService` (ADR-0010 — never `HttpClient` in a
 * feature).
 *
 * ── Assumed endpoint contract (`/supplier/v1/**`) ────────────────────────────
 * Coded against durion-positivity-backend#1223 (audit read API), ADR-0050 §7.
 * Reconcile this block against the controller when the backend lands.
 *
 *   GET /supplier/v1/exchanges
 *       ?vendorProfileId&capability&outcome&dateFrom&dateTo&pageToken&size
 *       → ExchangeAuditPage
 *   GET /supplier/v1/exchanges/{exchangeId}          → ExchangeAuditRecord
 *   GET /supplier/v1/exchanges/{exchangeId}/payload  → ExchangePayloadView
 *
 * The payload endpoint is governed by a tighter permission than profile
 * administration and answers `403` when the caller lacks it. That `403` is the
 * authoritative permission signal — the UI renders a `payload-restricted` pane
 * rather than parsing JWT permission bits client-side.
 *
 * `dateFrom`/`dateTo` are date-only `YYYY-MM-DD` strings (ADR-0038) and are sent
 * verbatim; no client-side timezone conversion is applied.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  ExchangeAuditFilter,
  ExchangeAuditPage,
  ExchangeAuditRecord,
  ExchangePayloadView,
} from '../models/supplier-exchange.models';

const ROOT = '/supplier/v1/exchanges';

@Injectable({ providedIn: 'root' })
export class SupplierExchangeAuditService {
  private readonly api = inject(ApiBaseService);

  listExchanges(
    filter: ExchangeAuditFilter = {},
    pageToken?: string,
  ): Observable<ExchangeAuditPage> {
    let params = new HttpParams();
    if (filter.vendorProfileId) {
      params = params.set('vendorProfileId', filter.vendorProfileId);
    }
    if (filter.capability) {
      params = params.set('capability', filter.capability);
    }
    if (filter.outcome) {
      params = params.set('outcome', filter.outcome);
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
    return this.api.get<ExchangeAuditPage>(ROOT, params);
  }

  getExchange(exchangeId: string): Observable<ExchangeAuditRecord> {
    return this.api.get<ExchangeAuditRecord>(`${ROOT}/${exchangeId}`);
  }

  /** Raw request/response capture. Answers `403` without the audit-payload permission. */
  getExchangePayload(exchangeId: string): Observable<ExchangePayloadView> {
    return this.api.get<ExchangePayloadView>(`${ROOT}/${exchangeId}/payload`);
  }
}
