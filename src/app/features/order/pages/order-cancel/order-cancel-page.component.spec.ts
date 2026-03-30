import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import {
  CancelOrderRequest,
  CancelOrderResult,
  PosOrder,
  PosOrderLine,
} from '../../models/order.models';
import { OrderService } from '../../services/order.service';
import { OrderCancelPageComponent } from './order-cancel-page.component';

const orderLineFixture: PosOrderLine = {
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
};

const orderFixture: PosOrder = {
  orderId: 'ord-1',
  customerId: 'cust-1',
  vehicleId: 'veh-1',
  workorderId: 'wo-1',
  estimateId: 'est-1',
  status: 'OPEN',
  lines: [orderLineFixture],
  subtotal: 100,
  taxAmount: 8,
  total: 108,
  currency: 'USD',
  createdAt: '2026-03-30T12:00:00Z',
  updatedAt: '2026-03-30T12:01:00Z',
};

const cancelResultFixture: CancelOrderResult = {
  orderId: 'ord-1',
  status: 'CANCELLED',
  cancelledAt: '2026-03-30T12:10:00Z',
  paymentReversalRequired: true,
  paymentReversalRef: 'rev-1',
};

describe('OrderCancelPageComponent', () => {
  let fixture: ComponentFixture<OrderCancelPageComponent>;
  let component: OrderCancelPageComponent;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const orderServiceMock = {
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
  };

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(convertToParamMap({ orderId: 'ord-1' }));

    orderServiceMock.getOrder.mockReset();
    orderServiceMock.cancelOrder.mockReset();

    await TestBed.configureTestingModule({
      imports: [OrderCancelPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: OrderService, useValue: orderServiceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderCancelPageComponent);
    component = fixture.componentInstance;
  });

  it('loads order on init', () => {
    orderServiceMock.getOrder.mockReturnValue(of(orderFixture));

    fixture.detectChanges();

    expect(orderServiceMock.getOrder).toHaveBeenCalledWith('ord-1');
    expect(component.order()).toEqual(orderFixture);
    expect(component.state()).toBe('ready');
  });

  it('sets error state before errorKey when confirmCancel fails', () => {
    const request: CancelOrderRequest = {
      reason: 'CUSTOMER_CANCELLED',
      authorityCode: 'ORDER.CANCEL',
      forceCancel: true,
    };

    orderServiceMock.getOrder.mockReturnValue(of(orderFixture));
    orderServiceMock.cancelOrder.mockReturnValue(throwError(() => new Error('cancel failed')));

    fixture.detectChanges();

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.confirmCancel(request);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ORDER.CANCEL.ERROR.SUBMIT');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('stores cancel result when confirmCancel succeeds', () => {
    const request: CancelOrderRequest = {
      reason: 'CUSTOMER_CANCELLED',
      authorityCode: 'ORDER.CANCEL',
    };

    orderServiceMock.getOrder.mockReturnValue(of(orderFixture));
    orderServiceMock.cancelOrder.mockReturnValue(of(cancelResultFixture));

    fixture.detectChanges();
    component.confirmCancel(request);

    expect(component.cancelResult()).toEqual(cancelResultFixture);
    expect(component.state()).toBe('ready');
  });

  it('sets error state before errorKey when initial load fails', () => {
    orderServiceMock.getOrder.mockReturnValue(throwError(() => new Error('load failed')));

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ORDER.CANCEL.ERROR.LOAD');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });
});
