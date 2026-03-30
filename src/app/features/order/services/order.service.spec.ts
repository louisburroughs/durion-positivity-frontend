import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
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
import { OrderService } from './order.service';

const BASE = environment.apiBaseUrl;

describe('OrderService CAP-246', () => {
  let service: OrderService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [OrderService, ApiBaseService],
    });

    service = TestBed.inject(OrderService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('createCart posts to /v1/orders', () => {
    const request: CreateCartRequest = {
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      workorderId: 'wo-1',
      estimateId: 'est-1',
      currency: 'USD',
    };

    const fixture: PosOrder = {
      orderId: 'ord-1',
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      workorderId: 'wo-1',
      estimateId: 'est-1',
      status: 'DRAFT',
      lines: [],
      subtotal: 0,
      taxAmount: 0,
      total: 0,
      currency: 'USD',
      createdAt: '2026-03-30T12:00:00Z',
      updatedAt: '2026-03-30T12:00:00Z',
    };
    let result: PosOrder | undefined;

    service.createCart(request).subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/orders`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('getOrder gets /v1/orders/{orderId}', () => {
    const fixture: PosOrder = {
      orderId: 'ord-1',
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      workorderId: 'wo-1',
      estimateId: 'est-1',
      status: 'OPEN',
      lines: [
        {
          lineId: 'line-1',
          skuCode: 'SKU-1',
          description: 'Brake Pad',
          quantity: 2,
          unitPrice: 50,
          lineTotal: 100,
          currency: 'USD',
          status: 'ACTIVE',
          addedAt: '2026-03-30T12:01:00Z',
          updatedAt: '2026-03-30T12:01:00Z',
        },
      ],
      subtotal: 100,
      taxAmount: 8,
      total: 108,
      currency: 'USD',
      createdAt: '2026-03-30T12:00:00Z',
      updatedAt: '2026-03-30T12:01:00Z',
    };
    let result: PosOrder | undefined;

    service.getOrder('ord-1').subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/orders/ord-1`);
    expect(req.request.method).toBe('GET');
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('addItem posts to /v1/orders/{orderId}/items', () => {
    const request: AddItemRequest = {
      skuCode: 'SKU-2',
      description: 'Alignment',
      quantity: 1,
      unitPrice: 89,
    };

    const fixture: PosOrderLine = {
      lineId: 'line-2',
      skuCode: 'SKU-2',
      description: 'Alignment',
      quantity: 1,
      unitPrice: 89,
      lineTotal: 89,
      currency: 'USD',
      status: 'ACTIVE',
      addedAt: '2026-03-30T12:02:00Z',
      updatedAt: '2026-03-30T12:02:00Z',
    };
    let result: PosOrderLine | undefined;

    service.addItem('ord-1', request).subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/orders/ord-1/items`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('updateItemQuantity patches /v1/orders/{orderId}/items/{lineId}', () => {
    const request: UpdateItemQuantityRequest = { quantity: 3 };
    const fixture: PosOrderLine = {
      lineId: 'line-1',
      skuCode: 'SKU-1',
      description: 'Brake Pad',
      quantity: 3,
      unitPrice: 50,
      lineTotal: 150,
      currency: 'USD',
      status: 'ACTIVE',
      addedAt: '2026-03-30T12:01:00Z',
      updatedAt: '2026-03-30T12:03:00Z',
    };
    let result: PosOrderLine | undefined;

    service.updateItemQuantity('ord-1', 'line-1', request).subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/orders/ord-1/items/line-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(request);
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('removeItem deletes /v1/orders/{orderId}/items/{lineId}', () => {
    let completed = false;

    service.removeItem('ord-1', 'line-1').subscribe({
      next: value => {
        expect(value).toBeNull();
      },
      complete: () => {
        completed = true;
      },
    });

    const req = http.expectOne(`${BASE}/v1/orders/ord-1/items/line-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    expect(completed).toBe(true);
  });

  it('applyPriceOverride posts to /v1/orders/{orderId}/items/{lineId}/price-override', () => {
    const request: ApplyPriceOverrideRequest = {
      overridePrice: 75,
      reasonCode: 'MATCH_COMPETITOR',
      authorityCode: 'ORDER.PRICE_OVERRIDE',
      approvalToken: 'mgr-token-1',
    };

    const fixture: PriceOverride = {
      overrideId: 'ovr-1',
      orderId: 'ord-1',
      lineId: 'line-1',
      originalPrice: 89,
      overridePrice: 75,
      reasonCode: 'MATCH_COMPETITOR',
      authorityCode: 'ORDER.PRICE_OVERRIDE',
      approvalToken: 'mgr-token-1',
      appliedBy: 'manager-1',
      appliedAt: '2026-03-30T12:04:00Z',
    };
    let result: PriceOverride | undefined;

    service.applyPriceOverride('ord-1', 'line-1', request).subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/orders/ord-1/items/line-1/price-override`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('getOverridesByOrder gets /v1/orders/{orderId}/price-overrides', () => {
    const fixture: PriceOverride[] = [
      {
        overrideId: 'ovr-1',
        orderId: 'ord-1',
        lineId: 'line-1',
        originalPrice: 89,
        overridePrice: 75,
        reasonCode: 'MATCH_COMPETITOR',
        authorityCode: 'ORDER.PRICE_OVERRIDE',
        approvalToken: 'mgr-token-1',
        appliedBy: 'manager-1',
        appliedAt: '2026-03-30T12:04:00Z',
      },
    ];
    let result: PriceOverride[] | undefined;

    service.getOverridesByOrder('ord-1').subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/orders/ord-1/price-overrides`);
    expect(req.request.method).toBe('GET');
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('cancelOrder posts to /v1/orders/{orderId}/cancel', () => {
    const request: CancelOrderRequest = {
      reason: 'CUSTOMER_CANCELLED',
      authorityCode: 'ORDER.CANCEL',
      forceCancel: true,
    };

    const fixture: CancelOrderResult = {
      orderId: 'ord-1',
      status: 'CANCELLED',
      cancelledAt: '2026-03-30T12:05:00Z',
      paymentReversalRequired: true,
      paymentReversalRef: 'rev-1',
    };
    let result: CancelOrderResult | undefined;

    service.cancelOrder('ord-1', request).subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/orders/ord-1/cancel`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });
});
