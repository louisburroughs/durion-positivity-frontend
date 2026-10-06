import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  AddItemRequest,
  ApiError,
  ApplyPriceOverrideRequest,
  CancelOrderRequest,
  CheckoutRequest,
  CancellationResponse,
  CreateCartRequest,
  OrderCancellationService,
  PriceOverrideDetail,
  PriceOverrideResult,
  PriceOverridesService,
  SalesOrderLineResponse,
  SalesOrderResponse,
  SalesOrdersService,
  SetCartCustomerRequest,
} from '@durion-sdk/order';
import { CartAction, CartActionFailure, classifyCartActionError, OrderService } from './order.service';

describe('OrderService', () => {
  let service: OrderService;

  const salesOrdersApiStub = {
    getOrder: vi.fn(),
    createCart: vi.fn(),
    addCartItem: vi.fn(),
    removeCartItem: vi.fn(),
    setCartCustomer: vi.fn(),
    checkoutOrder: vi.fn(),
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

  describe('cart customer and checkout (CAP:550 S10)', () => {
    const walkInCart: SalesOrderResponse = {
      orderId: 'ord-1',
      orderNumber: 'SO-1001',
      status: 'DRAFT',
      grandTotal: 84.37,
      walkIn: true,
      customerDisplayName: 'Walk-in',
    };

    it('setCartCustomer() sends a registered customer to SalesOrdersService.setCartCustomer', () => {
      const request: SetCartCustomerRequest = { customerId: 'party-1' };
      salesOrdersApiStub.setCartCustomer.mockReturnValue(of({ ...walkInCart, walkIn: false }));

      let emitted: SalesOrderResponse | undefined;
      service.setCartCustomer('ord-1', request).subscribe(result => (emitted = result));

      expect(salesOrdersApiStub.setCartCustomer).toHaveBeenCalledWith('ord-1', { customerId: 'party-1' });
      expect(emitted?.walkIn).toBe(false);
    });

    it('setCartCustomer() sends the explicit walk-in choice unchanged', () => {
      const request: SetCartCustomerRequest = { walkIn: true };
      salesOrdersApiStub.setCartCustomer.mockReturnValue(of(walkInCart));

      let emitted: SalesOrderResponse | undefined;
      service.setCartCustomer('ord-1', request).subscribe(result => (emitted = result));

      expect(salesOrdersApiStub.setCartCustomer).toHaveBeenCalledWith('ord-1', { walkIn: true });
      expect(emitted).toEqual(walkInCart);
    });

    it('checkout() passes the order id, the Idempotency-Key and the body positionally to checkoutOrder', () => {
      const request: CheckoutRequest = { tenderType: 'DEFAULT', tenderedAmount: 84.37 };
      const checkedOut: SalesOrderResponse = {
        ...walkInCart,
        status: 'PENDING_PAYMENT',
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-2001',
      };
      salesOrdersApiStub.checkoutOrder.mockReturnValue(of(checkedOut));

      let emitted: SalesOrderResponse | undefined;
      service.checkout('ord-1', 'key-1', request).subscribe(result => (emitted = result));

      expect(salesOrdersApiStub.checkoutOrder).toHaveBeenCalledWith('ord-1', 'key-1', {
        tenderType: 'DEFAULT',
        tenderedAmount: 84.37,
      });
      expect(emitted).toEqual(checkedOut);
    });
  });
});

describe('classifyCartActionError (CAP:550 S10)', () => {
  const refusal = (status: number, code: string, fieldErrors?: ApiError['fieldErrors']): HttpErrorResponse => {
    const body: ApiError = { code, message: 'refused', status, correlationId: 'corr-1', timestamp: '2026-10-06T12:00:00Z', fieldErrors };
    return new HttpErrorResponse({ status, error: body });
  };
  const classify = (error: unknown, action: CartAction = 'CHECKOUT'): CartActionFailure =>
    classifyCartActionError(error, action, 'order:order:checkout');

  const cases: ReadonlyArray<[string, HttpErrorResponse, string]> = [
    ['ORDER_CUSTOMER_REQUIRED', refusal(422, 'ORDER_CUSTOMER_REQUIRED'), 'ORDER.CART.ERROR.CUSTOMER_REQUIRED'],
    ['walk-in ON_ACCOUNT', refusal(422, 'ORDER_WALK_IN_NOT_ALLOWED', [{ field: 'walkIn', message: 'ON_ACCOUNT' }]),
      'ORDER.CART.ERROR.WALK_IN_NOT_ALLOWED_ON_ACCOUNT'],
    ['walk-in DEPOSIT', refusal(422, 'ORDER_WALK_IN_NOT_ALLOWED', [{ field: 'walkIn', message: 'DEPOSIT' }]),
      'ORDER.CART.ERROR.WALK_IN_NOT_ALLOWED_DEPOSIT'],
    ['walk-in WORKORDER_LINK', refusal(422, 'ORDER_WALK_IN_NOT_ALLOWED', [{ field: 'walkIn', message: 'WORKORDER_LINK' }]),
      'ORDER.CART.ERROR.WALK_IN_NOT_ALLOWED_WORKORDER_LINK'],
    ['walk-in unknown reason', refusal(422, 'ORDER_WALK_IN_NOT_ALLOWED', [{ field: 'walkIn', message: 'OTHER' }]),
      'ORDER.CART.ERROR.WALK_IN_NOT_ALLOWED'],
    ['ORDER_WALK_IN_UNAVAILABLE', refusal(422, 'ORDER_WALK_IN_UNAVAILABLE'), 'ORDER.CART.ERROR.WALK_IN_UNAVAILABLE'],
    ['ORDER_INVALID_CUSTOMER', refusal(422, 'ORDER_INVALID_CUSTOMER'), 'ORDER.CART.ERROR.INVALID_CUSTOMER'],
    ['ORDER_NOT_EDITABLE', refusal(409, 'ORDER_NOT_EDITABLE'), 'ORDER.CART.ERROR.NOT_EDITABLE'],
    ['ORDER_UNPROCESSABLE', refusal(422, 'ORDER_UNPROCESSABLE'), 'ORDER.CART.ERROR.UNPROCESSABLE'],
    ['ORDER_FORBIDDEN', refusal(403, 'ORDER_FORBIDDEN'), 'ORDER.CART.ERROR.FORBIDDEN'],
    ['bare 403', new HttpErrorResponse({ status: 403 }), 'ORDER.CART.ERROR.FORBIDDEN'],
    ['unknown code', refusal(422, 'SOMETHING_NEW'), 'ORDER.CART.ERROR.CHECKOUT'],
  ];

  for (const [name, error, key] of cases) {
    it(`maps ${name} to ${key}`, () => {
      expect(classify(error).key).toBe(key);
    });
  }

  it('reads the grand total named in fieldErrors[tenderedAmount]', () => {
    const failure = classify(refusal(422, 'ORDER_WALK_IN_NOT_PAID_IN_FULL', [
      { field: 'tenderedAmount', message: 'must cover the grand total 86.02' },
    ]));
    expect(failure).toEqual({
      key: 'ORDER.CART.ERROR.WALK_IN_NOT_PAID_IN_FULL',
      params: { total: 86.02 },
      reread: false,
      answered: true,
    });
  });

  it('never invents a total when fieldErrors[tenderedAmount] names none', () => {
    expect(classify(refusal(422, 'ORDER_WALK_IN_NOT_PAID_IN_FULL')).key)
      .toBe('ORDER.CART.ERROR.WALK_IN_NOT_PAID_IN_FULL_NO_TOTAL');
  });

  it('names the refused permission on a 403', () => {
    expect(classifyCartActionError(new HttpErrorResponse({ status: 403 }), 'SET_CUSTOMER', 'order:order:edit').params)
      .toEqual({ permission: 'order:order:edit' });
  });

  it('asks for a re-read only on ORDER_NOT_EDITABLE', () => {
    expect(classify(refusal(409, 'ORDER_NOT_EDITABLE')).reread).toBe(true);
    expect(classify(refusal(422, 'ORDER_UNPROCESSABLE')).reread).toBe(false);
  });

  it('falls back to the action-specific generic key', () => {
    expect(classify(new Error('boom'), 'SET_CUSTOMER').key).toBe('ORDER.CART.ERROR.SET_CUSTOMER');
    expect(classify(new HttpErrorResponse({ status: 500 }), 'CHECKOUT').key).toBe('ORDER.CART.ERROR.CHECKOUT');
  });

  it('treats a 4xx as answered (new key next time) and a network failure or 5xx as not', () => {
    expect(classify(refusal(422, 'ORDER_UNPROCESSABLE')).answered).toBe(true);
    expect(classify(new HttpErrorResponse({ status: 0 })).answered).toBe(false);
    expect(classify(new HttpErrorResponse({ status: 503 })).answered).toBe(false);
  });
});
