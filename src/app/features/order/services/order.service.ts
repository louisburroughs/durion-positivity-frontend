import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AddItemRequest,
  ApplyPriceOverrideRequest,
  CancelOrderRequest,
  CancellationResponse,
  CreateCartRequest,
  OrderCancellationService,
  PriceOverrideDetail,
  PriceOverrideResult,
  PriceOverridesService,
  SalesOrderLineResponse,
  SalesOrderResponse,
  SalesOrdersService,
} from '@durion-sdk/order';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly salesOrdersApi = inject(SalesOrdersService);
  private readonly orderCancellationApi = inject(OrderCancellationService);
  private readonly priceOverridesApi = inject(PriceOverridesService);

  getOrder(orderId: string): Observable<SalesOrderResponse> {
    return this.salesOrdersApi.getOrder(orderId);
  }

  createCart(request: CreateCartRequest): Observable<SalesOrderResponse> {
    return this.salesOrdersApi.createCart(request);
  }

  addItem(orderId: string, request: AddItemRequest): Observable<SalesOrderLineResponse> {
    return this.salesOrdersApi.addCartItem(orderId, request);
  }

  removeItem(orderId: string, lineId: string): Observable<SalesOrderLineResponse> {
    return this.salesOrdersApi.removeCartItem(orderId, lineId);
  }

  cancelOrder(orderId: string, request: CancelOrderRequest): Observable<CancellationResponse> {
    return this.orderCancellationApi.cancelOrder(orderId, request);
  }

  getOverridesByOrder(orderId: string): Observable<PriceOverrideDetail[]> {
    return this.priceOverridesApi.searchPriceOverrides(orderId);
  }

  applyPriceOverride(request: ApplyPriceOverrideRequest): Observable<PriceOverrideResult> {
    return this.priceOverridesApi.applyPriceOverride(request);
  }
}
