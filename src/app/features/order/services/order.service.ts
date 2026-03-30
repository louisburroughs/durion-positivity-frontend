import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  AddItemRequest,
  ApplyPriceOverrideRequest,
  CancelOrderRequest,
  CancelOrderResult,
  CreateCartRequest,
  PosOrder,
  PosOrderLine,
  PriceOverride,
  UpdateItemQuantityRequest,
} from '../models/order.models';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly api = inject(ApiBaseService);

  /** operationId: createCart -> POST /v1/orders */
  createCart(request: CreateCartRequest): Observable<PosOrder> {
    return this.api.post<PosOrder>('/v1/orders', request);
  }

  /** operationId: getOrder -> GET /v1/orders/{orderId} */
  getOrder(orderId: string): Observable<PosOrder> {
    return this.api.get<PosOrder>(`/v1/orders/${orderId}`);
  }

  /** operationId: addItem -> POST /v1/orders/{orderId}/items */
  addItem(orderId: string, request: AddItemRequest): Observable<PosOrderLine> {
    return this.api.post<PosOrderLine>(`/v1/orders/${orderId}/items`, request);
  }

  /** operationId: updateItemQuantity -> PATCH /v1/orders/{orderId}/items/{lineId} */
  updateItemQuantity(
    orderId: string,
    lineId: string,
    request: UpdateItemQuantityRequest,
  ): Observable<PosOrderLine> {
    return this.api.patch<PosOrderLine>(`/v1/orders/${orderId}/items/${lineId}`, request);
  }

  /** operationId: removeItem -> DELETE /v1/orders/{orderId}/items/{lineId} */
  removeItem(orderId: string, lineId: string): Observable<void> {
    return this.api.delete<void>(`/v1/orders/${orderId}/items/${lineId}`);
  }

  /** operationId: applyPriceOverride -> POST /v1/orders/{orderId}/items/{lineId}/price-override */
  applyPriceOverride(
    orderId: string,
    lineId: string,
    request: ApplyPriceOverrideRequest,
  ): Observable<PriceOverride> {
    return this.api.post<PriceOverride>(`/v1/orders/${orderId}/items/${lineId}/price-override`, request);
  }

  /** operationId: getOverridesByOrder -> GET /v1/orders/{orderId}/price-overrides */
  getOverridesByOrder(orderId: string): Observable<PriceOverride[]> {
    return this.api.get<PriceOverride[]>(`/v1/orders/${orderId}/price-overrides`);
  }

  /** operationId: cancelOrder -> POST /v1/orders/{orderId}/cancel */
  cancelOrder(orderId: string, request: CancelOrderRequest): Observable<CancelOrderResult> {
    return this.api.post<CancelOrderResult>(`/v1/orders/${orderId}/cancel`, request);
  }
}
