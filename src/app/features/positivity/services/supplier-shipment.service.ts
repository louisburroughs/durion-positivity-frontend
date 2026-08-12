/**
 * Vendor shipment-event client (issue #193, CAP-322).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * `@durion-sdk/supplier` covers issue #188 only (profiles, auth configs,
 * accounts, bindings, exchange audit) and exposes no shipment operation; there
 * is no supplier-side shipment data in `@durion-sdk/order` or
 * `@durion-sdk/inventory` either. This service therefore calls `ApiBaseService`
 * (ADR-0010 — never `HttpClient` in a feature), as the PRICAT and availability
 * surfaces do, with the assumed contract recorded here.
 *
 * ── Assumed endpoint contract (`/supplier/v1/**`) ────────────────────────────
 * Coded against durion-positivity-backend#1228.
 *
 *   GET /supplier/v1/purchase-orders/{purchaseOrderId}/shipment-events
 *       → 200 SupplierShipmentTimeline
 *       → 403 caller may not read supplier shipment data
 *   GET /supplier/v1/shipment-events/unlinked
 *       ?vendorProfileId&search&dateFrom&dateTo&pageToken
 *       → 200 SupplierUnlinkedShipmentEventPage
 *       → 403 caller may not read the flagged list
 *       → 5xx retryable
 *
 * ── Reads only ──────────────────────────────────────────────────────────────
 * No link, unlink, dismiss or acknowledge operation exists, and none should be
 * added without a story that says who is accountable for the result. Shipment
 * events are an append-only record of what the carrier reported; letting an
 * operator dismiss one hides an inbound delivery from the dock that is expecting
 * it. Linking an event to an order is a backend matching decision, not a
 * frontend gesture. `supplier-shipment.service.spec.ts` asserts the absence.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  SupplierShipmentTimeline,
  SupplierUnlinkedShipmentEventFilter,
  SupplierUnlinkedShipmentEventPage,
} from '../models/supplier-shipment.models';

const PURCHASE_ORDERS = '/supplier/v1/purchase-orders';
const UNLINKED = '/supplier/v1/shipment-events/unlinked';

@Injectable({ providedIn: 'root' })
export class SupplierShipmentService {
  private readonly api = inject(ApiBaseService);

  /** Append-only shipment events linked to one purchase order. */
  getShipmentTimeline(purchaseOrderId: string): Observable<SupplierShipmentTimeline> {
    return this.api.get<SupplierShipmentTimeline>(
      `${PURCHASE_ORDERS}/${purchaseOrderId}/shipment-events`,
    );
  }

  /** Shipment events that matched no purchase order — an administrator worklist. */
  listUnlinkedEvents(
    filter: SupplierUnlinkedShipmentEventFilter = {},
    pageToken?: string,
  ): Observable<SupplierUnlinkedShipmentEventPage> {
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
    return this.api.get<SupplierUnlinkedShipmentEventPage>(UNLINKED, params);
  }
}
