/**
 * Ingested vendor invoice (AP) read client (issue #192, CAP-321).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * `@durion-sdk/supplier` covers vendor profiles, auth configs, commercial
 * accounts, endpoint bindings and exchange audit only (issue #188). It exposes
 * **no** invoice-ingestion operation, and `@durion-sdk/accounting` carries the
 * AP-bill side of the house rather than the vendor-exchange side that produced
 * these documents. This service therefore calls `ApiBaseService` directly
 * (ADR-0010 — never `HttpClient` in a feature), exactly as the PRICAT,
 * availability and order-transmission surfaces do, and the assumed contract is
 * written down here so reconciling it against the real controller is a diff
 * rather than an investigation.
 *
 * ── Assumed endpoint contract (`/supplier/v1/**`) ────────────────────────────
 * Coded against durion-positivity-backend#1227.
 *
 *   GET /supplier/v1/vendor-invoices
 *       ?vendorProfileId&search&type&flag&dateFrom&dateTo&pageToken
 *       → 200 SupplierInvoicePage
 *       → 403 caller may not read ingested vendor invoices
 *   GET /supplier/v1/vendor-invoices/exceptions
 *       ?vendorProfileId&search&type&dateFrom&dateTo&pageToken
 *       → 200 SupplierInvoicePage  — every row carries at least one flag
 *   GET /supplier/v1/vendor-invoices/{invoiceId}
 *       → 200 SupplierInvoiceDetail
 *       → 403 / 404
 *
 * Amounts arrive as decimal **strings** in every one of those payloads. That is
 * the load-bearing half of the contract: it is what lets this client render a
 * payable figure without ever having held it as a float.
 *
 * ── This service has no write path, by design ───────────────────────────────
 * #192 §6 is explicit — "no mutating calls in this story" — and §8 asks whether
 * AP wants an acknowledgment action on exceptions. Ruled: **review-only in v1**.
 * So there is no `post`, `put`, `patch` or `delete` anywhere in this file, and
 * no acknowledge/dismiss/resolve method to grow one later by accident. The
 * property matters beyond tidiness: `UNMATCHED` and `DISCREPANCY` are the only
 * signals that an amount about to be paid is not trustworthy, and a client-side
 * acknowledgment would let a row leave the worklist while the underlying
 * mismatch is still live. Flags clear when the backend resolves them.
 * `supplier-invoice.service.spec.ts` asserts the absence by scanning the
 * prototype's method names, so adding one fails the suite rather than review.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  SupplierInvoiceDetail,
  SupplierInvoiceFilter,
  SupplierInvoicePage,
} from '../models/supplier-invoice.models';

const INVOICES = '/supplier/v1/vendor-invoices';
const EXCEPTIONS = `${INVOICES}/exceptions`;

@Injectable({ providedIn: 'root' })
export class SupplierInvoiceService {
  private readonly api = inject(ApiBaseService);

  /** Ingested vendor invoices, newest first per the backend's own ordering. */
  listInvoices(
    filter: SupplierInvoiceFilter = {},
    pageToken?: string,
  ): Observable<SupplierInvoicePage> {
    return this.api.get<SupplierInvoicePage>(INVOICES, toParams(filter, pageToken));
  }

  /**
   * Invoices the backend currently flags as `UNMATCHED` or `DISCREPANCY`.
   *
   * A dedicated endpoint rather than a client-side filter over `listInvoices`:
   * the exception set is defined by backend state, is paged independently, and
   * must not silently shrink because a page boundary fell between two flagged
   * rows.
   */
  listExceptions(
    filter: SupplierInvoiceFilter = {},
    pageToken?: string,
  ): Observable<SupplierInvoicePage> {
    return this.api.get<SupplierInvoicePage>(EXCEPTIONS, toParams(filter, pageToken));
  }

  /** One invoice with its lines, versions and resolved purchase-order linkage. */
  getInvoice(invoiceId: string): Observable<SupplierInvoiceDetail> {
    return this.api.get<SupplierInvoiceDetail>(`${INVOICES}/${invoiceId}`);
  }
}

/** Filter → query params. Absent values are omitted rather than sent empty. */
function toParams(filter: SupplierInvoiceFilter, pageToken?: string): HttpParams {
  let params = new HttpParams();
  if (filter.vendorProfileId) {
    params = params.set('vendorProfileId', filter.vendorProfileId);
  }
  if (filter.search) {
    params = params.set('search', filter.search);
  }
  if (filter.type) {
    params = params.set('type', filter.type);
  }
  if (filter.flag) {
    params = params.set('flag', filter.flag);
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
  return params;
}
