/**
 * Vendor order-transmission, status-history and manual-review client
 * (issue #191, CAP-320).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * `@durion-sdk/supplier` covers vendor profiles, auth configs, commercial
 * accounts, endpoint bindings and exchange audit only (issue #188). It exposes
 * **no** order-transmission, status-history or manual-review operation, and
 * neither `@durion-sdk/order` nor `@durion-sdk/inventory` carries supplier-side
 * transmission data. This service therefore calls `ApiBaseService` directly
 * (ADR-0010 — never `HttpClient` in a feature), exactly as the PRICAT and
 * availability surfaces do, and the assumed contract is written down here so
 * reconciling it against the real controller is a diff rather than an
 * investigation.
 *
 * ── Assumed endpoint contract (`/supplier/v1/**`) ────────────────────────────
 * Coded against durion-positivity-backend#1226.
 *
 *   GET  /supplier/v1/purchase-orders/{purchaseOrderId}/transmission
 *        → 200 SupplierOrderTransmission
 *        → 403 caller may not read supplier transmission state
 *        → 404 order was never transmitted electronically
 *   GET  /supplier/v1/purchase-orders/{purchaseOrderId}/transmission/history
 *        → 200 SupplierOrderStatusHistory  (append-only; backend order)
 *   GET  /supplier/v1/order-transmissions/manual-review
 *        ?vendorProfileId&search&dateFrom&dateTo&pageToken
 *        → 200 SupplierManualReviewPage
 *   GET  /supplier/v1/order-transmissions/manual-review/{purchaseOrderId}
 *        → 200 SupplierManualReviewItem   (single-row refresh)
 *   POST /supplier/v1/order-transmissions/manual-review/{purchaseOrderId}/resolution
 *        body { action } → 200 SupplierManualReviewItem
 *        → 400 unknown/withdrawn action
 *        → 403 caller may read the queue but not resolve
 *        → 409 a vendor update raced the resolution; the caller re-reads the row
 *        → 5xx retryable
 *
 * The resolution POST is idempotent in intent: replaying the same action for the
 * same row is defined to converge on the same resolved state rather than
 * stacking side effects, which is what lets the UI recover from a `409` by
 * simply re-reading the row.
 *
 * ── The operation this service must never grow ──────────────────────────────
 * There is no re-send / retry / re-transmit method here, and adding one is a
 * safety regression rather than a feature. Re-transmitting an order the vendor
 * may already hold creates a duplicate physical order. Reconciliation is
 * status-first and backend-owned: this client reads state and posts the
 * backend's own resolution tokens back. `supplier-order-transmission.service.spec.ts`
 * asserts the absence.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  SupplierManualReviewFilter,
  SupplierManualReviewItem,
  SupplierManualReviewPage,
  SupplierOrderStatusHistory,
  SupplierOrderTransmission,
} from '../models/supplier-order-transmission.models';

const PURCHASE_ORDERS = '/supplier/v1/purchase-orders';
const MANUAL_REVIEW = '/supplier/v1/order-transmissions/manual-review';

@Injectable({ providedIn: 'root' })
export class SupplierOrderTransmissionService {
  private readonly api = inject(ApiBaseService);

  /** Current vendor transmission state and per-line confirmations for one order. */
  getTransmission(purchaseOrderId: string): Observable<SupplierOrderTransmission> {
    return this.api.get<SupplierOrderTransmission>(
      `${PURCHASE_ORDERS}/${purchaseOrderId}/transmission`,
    );
  }

  /** Append-only vendor status history for one order. */
  getStatusHistory(purchaseOrderId: string): Observable<SupplierOrderStatusHistory> {
    return this.api.get<SupplierOrderStatusHistory>(
      `${PURCHASE_ORDERS}/${purchaseOrderId}/transmission/history`,
    );
  }

  /** Ambiguous transmissions awaiting human reconciliation. */
  listManualReview(
    filter: SupplierManualReviewFilter = {},
    pageToken?: string,
  ): Observable<SupplierManualReviewPage> {
    let params = new HttpParams();
    if (filter.vendorProfileId) {
      params = params.set('vendorProfileId', filter.vendorProfileId);
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
    return this.api.get<SupplierManualReviewPage>(MANUAL_REVIEW, params);
  }

  /**
   * Re-read one queue row.
   *
   * Used after a `409`: the vendor moved while the operator was deciding, so the
   * row is refreshed in place instead of leaving a dead error over stale facts.
   */
  getManualReviewItem(purchaseOrderId: string): Observable<SupplierManualReviewItem> {
    return this.api.get<SupplierManualReviewItem>(`${MANUAL_REVIEW}/${purchaseOrderId}`);
  }

  /**
   * Apply one backend-delivered resolution action to one ambiguous row.
   *
   * `action` is echoed back exactly as the backend delivered it — the UI never
   * invents an action token, so it can never ask for an operation the backend
   * did not offer.
   */
  resolveManualReview(
    purchaseOrderId: string,
    action: string,
  ): Observable<SupplierManualReviewItem> {
    return this.api.post<SupplierManualReviewItem>(
      `${MANUAL_REVIEW}/${purchaseOrderId}/resolution`,
      { action },
    );
  }
}
