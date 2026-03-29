import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  CreatePurchaseOrderRequest,
  PurchaseOrderDetail,
  PurchaseOrderFilter,
  PurchaseOrderPageResponse,
  RevisePurchaseOrderRequest,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryPurchaseOrderService {
  private readonly api = inject(ApiBaseService);

  queryPurchaseOrders(filter: PurchaseOrderFilter = {}): Observable<PurchaseOrderPageResponse> {
    let params = new HttpParams();
    if (filter.supplierId != null) { params = params.set('supplierId', filter.supplierId); }
    if (filter.dateFrom != null) { params = params.set('dateFrom', filter.dateFrom); }
    if (filter.dateTo != null) { params = params.set('dateTo', filter.dateTo); }
    if (filter.pageToken != null) { params = params.set('pageToken', filter.pageToken); }
    if (filter.statuses != null && filter.statuses.length > 0) {
      filter.statuses.forEach(s => { params = params.append('statuses', s); });
    }
    return this.api.get<PurchaseOrderPageResponse>('/inventory/v1/purchase-orders', params);
  }

  getPurchaseOrder(poId: string): Observable<PurchaseOrderDetail> {
    return this.api.get<PurchaseOrderDetail>(
      `/inventory/v1/purchase-orders/${encodeURIComponent(poId)}`,
    );
  }

  createPurchaseOrder(request: CreatePurchaseOrderRequest): Observable<PurchaseOrderDetail> {
    return this.api.post<PurchaseOrderDetail>('/inventory/v1/purchase-orders', request);
  }

  revisePurchaseOrder(poId: string, request: RevisePurchaseOrderRequest): Observable<PurchaseOrderDetail> {
    return this.api.put<PurchaseOrderDetail>(
      `/inventory/v1/purchase-orders/${encodeURIComponent(poId)}`,
      request,
    );
  }

  cancelPurchaseOrder(poId: string): Observable<void> {
    return this.api.delete<void>(
      `/inventory/v1/purchase-orders/${encodeURIComponent(poId)}`,
    );
  }
}
