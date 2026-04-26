import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import {
  CancelOrderRequest,
  CancellationResponse,
  OrderCancellationService,
  SalesOrderLineResponse,
  SalesOrderResponse,
  SalesOrdersService,
} from '@durion-sdk/order';
import { OrderCancelPageComponent } from './order-cancel-page.component';

const orderLineFixture: SalesOrderLineResponse = {
  orderLineId: 'line-1',
  itemSku: 'SKU-1',
  itemDescription: 'Brake Pad',
  quantity: 2,
  unitPrice: 50,
};

const orderFixture: SalesOrderResponse = {
  orderId: 'ord-1',
  subtotal: 100,
  lines: [orderLineFixture],
};

const cancelResultFixture: CancellationResponse = {
  orderId: 'ord-1',
  status: 'CANCELLED',
};

describe('OrderCancelPageComponent', () => {
  let fixture: ComponentFixture<OrderCancelPageComponent>;
  let component: OrderCancelPageComponent;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const salesOrdersServiceMock = {
    getOrder: vi.fn(),
  };

  const orderCancellationServiceMock = {
    cancelOrder: vi.fn(),
  };

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(convertToParamMap({ orderId: 'ord-1' }));

    salesOrdersServiceMock.getOrder.mockReset();
    orderCancellationServiceMock.cancelOrder.mockReset();

    await TestBed.configureTestingModule({
      imports: [OrderCancelPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SalesOrdersService, useValue: salesOrdersServiceMock },
        { provide: OrderCancellationService, useValue: orderCancellationServiceMock },
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
    salesOrdersServiceMock.getOrder.mockReturnValue(of(orderFixture));

    fixture.detectChanges();

    expect(salesOrdersServiceMock.getOrder).toHaveBeenCalledWith('ord-1');
    expect(component.order()).toEqual(orderFixture);
    expect(component.state()).toBe('ready');
  });

  it('sets error state before errorKey when confirmCancel fails', () => {
    const request: CancelOrderRequest = {
      cancellationReason: 'CUSTOMER_CANCELLED',
    };

    salesOrdersServiceMock.getOrder.mockReturnValue(of(orderFixture));
    orderCancellationServiceMock.cancelOrder.mockReturnValue(throwError(() => new Error('cancel failed')));

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
      cancellationReason: 'CUSTOMER_CANCELLED',
    };

    salesOrdersServiceMock.getOrder.mockReturnValue(of(orderFixture));
    orderCancellationServiceMock.cancelOrder.mockReturnValue(of(cancelResultFixture));

    fixture.detectChanges();
    component.confirmCancel(request);

    expect(component.cancelResult()).toEqual(cancelResultFixture);
    expect(component.state()).toBe('ready');
  });

  it('sets error state before errorKey when initial load fails', () => {
    salesOrdersServiceMock.getOrder.mockReturnValue(throwError(() => new Error('load failed')));

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
