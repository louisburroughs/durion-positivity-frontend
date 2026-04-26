import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  PurchaseOrdersService,
  ListPurchaseOrdersRequest,
  Pageable,
  PurchaseOrderResponse,
  PagePurchaseOrderResponse,
  CreatePurchaseOrderRequest as SdkCreatePurchaseOrderRequest,
  RevisePurchaseOrderRequest as SdkRevisePurchaseOrderRequest,
} from '@durion-sdk/inventory';
import {
  CreatePurchaseOrderRequest,
  PurchaseOrderDetail,
  PurchaseOrderFilter,
  PurchaseOrderPageResponse,
  RevisePurchaseOrderRequest,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryPurchaseOrderService {
  private readonly poSdk = inject(PurchaseOrdersService);

  queryPurchaseOrders(filter: PurchaseOrderFilter = {}): Observable<PurchaseOrderPageResponse> {
    const sdkFilter: ListPurchaseOrdersRequest = this.toListPurchaseOrdersRequest(filter);
    const sdkPageable: Pageable = {};
    return this.poSdk.listPurchaseOrders(sdkFilter, sdkPageable).pipe(
      map((dto: PagePurchaseOrderResponse) => this.toPurchaseOrderPageResponse(dto)),
    );
  }

  getPurchaseOrder(poId: string): Observable<PurchaseOrderDetail> {
    return this.poSdk.getPurchaseOrder(poId).pipe(
      map((dto: PurchaseOrderResponse) => this.toPurchaseOrderDetail(dto)),
    );
  }

  createPurchaseOrder(request: CreatePurchaseOrderRequest): Observable<PurchaseOrderDetail> {
    const sdkRequest: SdkCreatePurchaseOrderRequest = this.toSdkCreatePurchaseOrderRequest(request);
    return this.poSdk.createPurchaseOrder(sdkRequest).pipe(
      map((dto: PurchaseOrderResponse) => this.toPurchaseOrderDetail(dto)),
    );
  }

  revisePurchaseOrder(poId: string, request: RevisePurchaseOrderRequest): Observable<PurchaseOrderDetail> {
    const sdkRequest: SdkRevisePurchaseOrderRequest = this.toSdkRevisePurchaseOrderRequest(request);
    return this.poSdk.revisePurchaseOrder(poId, sdkRequest).pipe(
      map((dto: PurchaseOrderResponse) => this.toPurchaseOrderDetail(dto)),
    );
  }

  cancelPurchaseOrder(poId: string): Observable<void> {
    return this.poSdk.cancelPurchaseOrder(poId).pipe(
      map(() => undefined),
    );
  }

  private toListPurchaseOrdersRequest(filter: PurchaseOrderFilter): ListPurchaseOrdersRequest {
    return {
      vendorId: filter.supplierId,
    };
  }

  private toSdkCreatePurchaseOrderRequest(request: CreatePurchaseOrderRequest): SdkCreatePurchaseOrderRequest {
    return {
      vendorId: request.supplierId,
      poDate: request.scheduledDeliveryDate,
      currency: 'USD',
      expectedDeliveryDate: request.scheduledDeliveryDate,
      comment: request.notes,
      lines: (request.lines ?? []).map((line, index) => ({
        lineNumber: index + 1,
        description: line.productSku,
        quantity: line.orderedQty,
        unitCostMinor: Math.round(line.unitPrice * 100),
      })),
    };
  }

  private toSdkRevisePurchaseOrderRequest(request: RevisePurchaseOrderRequest): SdkRevisePurchaseOrderRequest {
    return {
      poDate: request.scheduledDeliveryDate ?? '',
      expectedDeliveryDate: request.scheduledDeliveryDate,
      comment: request.notes,
      revisionReason: '',
      lines: (request.lines ?? []).map((line, index) => ({
        lineNumber: index + 1,
        description: line.productSku,
        quantity: line.orderedQty,
        unitCostMinor: Math.round(line.unitPrice * 100),
      })),
    };
  }

  private toPurchaseOrderPageResponse(dto: PagePurchaseOrderResponse): PurchaseOrderPageResponse {
    return {
      items: (dto.content ?? []).map((item) => this.toPurchaseOrderDetail(item)),
      nextPageToken: null,
    };
  }

  private toPurchaseOrderDetail(dto: PurchaseOrderResponse): PurchaseOrderDetail {
    return {
      poId: dto.purchaseOrderId ?? '',
      poNumber: dto.poNumber ?? '',
      status: dto.status ?? '',
      supplierId: dto.vendorId ?? '',
      lineCount: dto.lines?.length ?? 0,
      openBalance: (dto.openBalanceMinor ?? 0) / 100,
      scheduledDeliveryDate: dto.expectedDeliveryDate ?? '',
      notes: dto.comment,
      lines: (dto.lines ?? []).map((line) => ({
        poLineId: line.lineId ?? '',
        productSku: line.skuId ?? '',
        orderedQty: line.quantityDecimal ?? 0,
        receivedQty: 0,
        unitPrice: (line.unitCostMinor ?? 0) / 100,
        lineTotal: (line.lineTotalMinor ?? 0) / 100,
        status: '',
      })),
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    };
  }
}
