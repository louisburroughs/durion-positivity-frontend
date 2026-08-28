import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
import { OrderService } from './order.service';

describe('OrderService', () => {
  let service: OrderService;

  const salesOrdersApiStub = {
    getOrder: vi.fn(),
    createCart: vi.fn(),
    addCartItem: vi.fn(),
    removeCartItem: vi.fn(),
  };
  const orderCancellationApiStub = {
    cancelOrder: vi.fn(),
  };
  const priceOverridesApiStub = {
    searchPriceOverrides: vi.fn(),
    applyPriceOverride: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        OrderService,
        { provide: SalesOrdersService, useValue: salesOrdersApiStub },
        { provide: OrderCancellationService, useValue: orderCancellationApiStub },
        { provide: PriceOverridesService, useValue: priceOverridesApiStub },
      ],
    });

    service = TestBed.inject(OrderService);
  });

  it('getOrder() delegates to SalesOrdersService.getOrder', () => {
    const response: SalesOrderResponse = { orderId: 'ord-1', status: 'OPEN' };
    salesOrdersApiStub.getOrder.mockReturnValue(of(response));

    service.getOrder('ord-1').subscribe(result => expect(result).toEqual(response));

    expect(salesOrdersApiStub.getOrder).toHaveBeenCalledWith('ord-1');
  });

  it('createCart() delegates to SalesOrdersService.createCart', () => {
    const request: CreateCartRequest = { clerkId: 'user-1', terminalId: 'TERM-1' };
    const response: SalesOrderResponse = { orderId: 'ord-1', status: 'OPEN' };
    salesOrdersApiStub.createCart.mockReturnValue(of(response));

    service.createCart(request).subscribe(result => expect(result).toEqual(response));

    expect(salesOrdersApiStub.createCart).toHaveBeenCalledWith(request);
  });

  it('addItem() delegates to SalesOrdersService.addItem', () => {
    const request: AddItemRequest = { itemSku: 'SKU-1', quantity: 2 };
    const response: SalesOrderLineResponse = { orderLineId: 'line-1', itemSku: 'SKU-1', quantity: 2 };
    salesOrdersApiStub.addCartItem.mockReturnValue(of(response));

    service.addItem('ord-1', request).subscribe(result => expect(result).toEqual(response));

    expect(salesOrdersApiStub.addCartItem).toHaveBeenCalledWith('ord-1', request);
  });

  it('removeItem() delegates to SalesOrdersService.removeItem', () => {
    const response: SalesOrderLineResponse = { orderLineId: 'line-1', itemSku: 'SKU-1', quantity: 2 };
    salesOrdersApiStub.removeCartItem.mockReturnValue(of(response));

    service.removeItem('ord-1', 'line-1').subscribe(result => expect(result).toEqual(response));

    expect(salesOrdersApiStub.removeCartItem).toHaveBeenCalledWith('ord-1', 'line-1');
  });

  it('cancelOrder() delegates to OrderCancellationService.cancelOrder', () => {
    const request: CancelOrderRequest = { cancellationReason: 'CUSTOMER_CANCELLED' };
    const response: CancellationResponse = { orderId: 'ord-1', status: 'CANCELLED' };
    orderCancellationApiStub.cancelOrder.mockReturnValue(of(response));

    service.cancelOrder('ord-1', request).subscribe(result => expect(result).toEqual(response));

    expect(orderCancellationApiStub.cancelOrder).toHaveBeenCalledWith('ord-1', request);
  });

  it('getOverridesByOrder() delegates to PriceOverridesService.getOverridesByOrder', () => {
    const response: PriceOverrideDetail[] = [{ overrideId: 'ov-1', orderId: 'ord-1', orderLineId: 'line-1', productId: 'SKU-1', originalPrice: 100, overridePrice: 90, reasonCode: 'PRICE_MATCH', discountAmount: 10, discountPercentage: 10, status: 'PENDING', requiresApproval: true, affectsCommission: false, requestedByUserId: 'user-1', createdAt: '2026-05-01T00:00:00Z' }];
    priceOverridesApiStub.searchPriceOverrides.mockReturnValue(of(response));

    service.getOverridesByOrder('ord-1').subscribe(result => expect(result).toEqual(response));

    expect(priceOverridesApiStub.searchPriceOverrides).toHaveBeenCalledWith('ord-1');
  });

  it('applyPriceOverride() delegates to PriceOverridesService.applyPriceOverride', () => {
    const request: ApplyPriceOverrideRequest = {
      orderId: 'ord-1',
      orderLineId: 'line-1',
      productId: 'SKU-1',
      originalPrice: 100,
      overridePrice: 90,
      reasonCode: 'PRICE_MATCH',
    };
    const response: PriceOverrideResult = {
      overrideId: 'ov-1',
      orderId: 'ord-1',
      orderLineId: 'line-1',
      productId: 'SKU-1',
      originalPrice: 100,
      overridePrice: 90,
      discountAmount: 10,
      discountPercentage: 10,
      reasonCode: 'PRICE_MATCH',
      status: 'PENDING',
      requiresApproval: true,
      affectsCommission: false,
      requestedByUserId: 'user-1',
      createdAt: '2026-05-01T00:00:00Z',
    };
    priceOverridesApiStub.applyPriceOverride.mockReturnValue(of(response));

    service.applyPriceOverride(request).subscribe(result => expect(result).toEqual(response));

    expect(priceOverridesApiStub.applyPriceOverride).toHaveBeenCalledWith(request);
  });
});
