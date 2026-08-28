/**
 * Supplier exchange-audit read client.
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * Backed by `SupplierExchangeAuditService` from `@durion-sdk/supplier`
 * (ADR-0010: a feature never injects `HttpClient`).
 *
 *   GET /v1/supplier/admin/audit/exchanges                         listExchanges
 *   GET /v1/supplier/admin/audit/exchanges/{id}                    getExchange
 *   GET /v1/supplier/admin/audit/exchanges/{id}/payload            readPayload
 *   GET /v1/supplier/admin/audit/exchanges/by-correlation/{cid}    traceCorrelation
 *
 * ── The window is required, and half-open ────────────────────────────────────
 * `listExchanges(vendorProfileId, from, to, ...)` takes all three of those as
 * **required** arguments: `from` inclusive, `to` **exclusive**, both ISO-8601
 * instants. The filter UI is date-only per ADR-0038, so the conversion lives
 * here, at the boundary, and nowhere else:
 *
 *   from = local start of the selected first day
 *   to   = local start of the day **after** the selected last day
 *
 * That makes the operator's "1st to 7th" mean the whole of the 7th, and makes
 * adjacent windows tile without listing a boundary attempt twice.
 *
 * Date-only strings are split on `-` and rebuilt with `new Date(y, m-1, d)`
 * (ADR-0038) — `new Date('YYYY-MM-DD')` parses as UTC midnight and would shift
 * the window by the local offset.
 *
 * ── No outcome parameter exists ──────────────────────────────────────────────
 * The contract offers `capability` as the only content filter. Outcome
 * filtering is therefore done client-side over the loaded page, and the UI says
 * so rather than implying it narrowed the whole result set.
 *
 * ── Payload reads are themselves audited ─────────────────────────────────────
 * `readPayload` writes an access record naming the caller in the same
 * transaction and withholds the content if that record cannot be written. It
 * answers `403` without the tighter audit-payload permission, which the UI
 * renders as `payload-restricted` rather than as an error.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ExchangeAuditPayloadView,
  ExchangeAuditSummary,
  PagedResponseExchangeAuditSummary,
  SupplierExchangeAuditService as SupplierExchangeAuditSdkService,
} from '@durion-sdk/supplier';
import {
  ExchangeAuditFilter,
  ExchangeAuditPage,
  ExchangeAuditRecord,
  ExchangeCaptureLevel,
  ExchangePayloadView,
} from '../models/supplier-exchange.models';

/** Default page size for the audit list. The contract caps `size` at 200. */
export const EXCHANGE_AUDIT_PAGE_SIZE = 25;

/**
 * Local start-of-day instant for a `YYYY-MM-DD` value (ADR-0038).
 *
 * Built from local-time parts on purpose: `new Date('2026-08-12')` is UTC
 * midnight, which is the previous day for every negative-offset deployment.
 */
export function startOfLocalDayIso(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, month - 1, day).toISOString();
}

/**
 * Local start-of-day instant for the day **after** a `YYYY-MM-DD` value.
 *
 * This is the exclusive end of a window whose last *included* day is
 * `dateOnly`. `new Date(y, m-1, d+1)` rolls month and year over correctly.
 */
export function startOfNextLocalDayIso(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, month - 1, day + 1).toISOString();
}

@Injectable({ providedIn: 'root' })
export class SupplierExchangeAuditService {
  private readonly auditSdk = inject(SupplierExchangeAuditSdkService);

  /**
   * One page of exchanges for a vendor within a date window.
   *
   * @param page zero-based page index
   */
  listExchanges(
    filter: ExchangeAuditFilter,
    page = 0,
    size = EXCHANGE_AUDIT_PAGE_SIZE,
  ): Observable<ExchangeAuditPage> {
    return this.auditSdk
      .listSupplierExchanges(
        filter.vendorProfileId,
        startOfLocalDayIso(filter.dateFrom),
        startOfNextLocalDayIso(filter.dateTo),
        filter.capability || undefined,
        page,
        size,
      )
      .pipe(map(response => this.toPage(response)));
  }

  getExchange(exchangeAuditId: string): Observable<ExchangeAuditRecord> {
    return this.auditSdk
      .getSupplierExchange(exchangeAuditId)
      .pipe(map(summary => this.toRecord(summary)));
  }

  /**
   * Stored request/response content.
   *
   * Answers `403` without the audit-payload permission, and reading it is
   * itself recorded against the caller.
   */
  getExchangePayload(exchangeAuditId: string): Observable<ExchangePayloadView> {
    return this.auditSdk
      .readSupplierExchangePayload(exchangeAuditId)
      .pipe(map(view => this.toPayloadView(view)));
  }

  /**
   * Every attempt sharing a correlation id, oldest first — the order in which a
   * retry sequence actually happened. Retries are separate rows, so this is the
   * only way to see one logical call as a whole.
   */
  traceCorrelation(
    correlationId: string,
    page = 0,
    size = EXCHANGE_AUDIT_PAGE_SIZE,
  ): Observable<ExchangeAuditPage> {
    return this.auditSdk
      .traceSupplierCorrelation(correlationId, page, size)
      .pipe(map(response => this.toPage(response)));
  }

  // ── Mapping (SDK view ⇄ domain model) ──────────────────────────────────────

  private toPage(response: PagedResponseExchangeAuditSummary): ExchangeAuditPage {
    return {
      items: (response.items ?? []).map(item => this.toRecord(item)),
      page: response.page ?? 0,
      size: response.size ?? EXCHANGE_AUDIT_PAGE_SIZE,
      totalCount: response.totalElements ?? 0,
      totalPages: response.totalPages ?? 0,
    };
  }

  /**
   * `httpStatus` and `durationMs` are normalised to `null` rather than `0`:
   * a connect failure, a pre-header timeout and a breaker-suppressed attempt all
   * legitimately have no status, and `0` would read as a real value.
   */
  private toRecord(summary: ExchangeAuditSummary): ExchangeAuditRecord {
    return {
      exchangeAuditId: summary.exchangeAuditId ?? '',
      vendorProfileId: summary.vendorProfileId ?? '',
      supplierRef: summary.supplierRef ?? '',
      bindingId: summary.bindingId ?? null,
      capability: summary.capability ?? '',
      protocolFamily: summary.protocolFamily ?? '',
      protocolVersion: summary.protocolVersion ?? '',
      httpMethod: summary.httpMethod ?? null,
      endpointUri: summary.endpointUri ?? null,
      attempt: summary.attempt ?? 1,
      correlationId: summary.correlationId ?? '',
      outcome: summary.outcome ?? '',
      httpStatus: summary.httpStatus ?? null,
      startedAt: summary.startedAt ?? '',
      durationMs: summary.durationMs ?? null,
      failureDetail: summary.failureDetail ?? null,
      captureLevel: (summary.captureLevel ?? 'METADATA_ONLY') as ExchangeCaptureLevel,
      requestPayloadPresent: summary.requestPayloadPresent ?? false,
      responsePayloadPresent: summary.responsePayloadPresent ?? false,
      payloadsPurgedAt: summary.payloadsPurgedAt ?? null,
      createdBy: summary.createdBy ?? null,
    };
  }

  private toPayloadView(view: ExchangeAuditPayloadView): ExchangePayloadView {
    return {
      exchangeAuditId: view.exchangeAuditId ?? '',
      captureLevel: (view.captureLevel ?? 'METADATA_ONLY') as ExchangeCaptureLevel,
      redacted: view.redacted ?? false,
      requestPayload: view.requestPayload ?? null,
      responsePayload: view.responsePayload ?? null,
    };
  }
}
