import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import {
  CancelOrderRequest,
  CancellationResponse,
  SalesOrderLineResponse,
  SalesOrderResponse,
} from '@durion-sdk/order';
import { OrderCancelPageComponent } from './order-cancel-page.component';
import { OrderService } from '../../services/order.service';

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
      cancellationReason: 'CUSTOMER_CANCELLED',
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
      cancellationReason: 'CUSTOMER_CANCELLED',
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
