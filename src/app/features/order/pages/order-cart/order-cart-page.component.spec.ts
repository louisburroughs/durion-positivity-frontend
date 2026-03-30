import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import {
  PosOrder,
  PosOrderLine,
} from '../../models/order.models';
import { OrderService } from '../../services/order.service';
import { OrderCartPageComponent } from './order-cart-page.component';

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

describe('OrderCartPageComponent', () => {
  let fixture: ComponentFixture<OrderCartPageComponent>;
  let component: OrderCartPageComponent;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const orderServiceMock = {
    createCart: vi.fn(),
    getOrder: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
  };

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(convertToParamMap({ orderId: 'ord-1' }));

    orderServiceMock.createCart.mockReset();
    orderServiceMock.getOrder.mockReset();
    orderServiceMock.addItem.mockReset();
    orderServiceMock.removeItem.mockReset();

    await TestBed.configureTestingModule({
      imports: [OrderCartPageComponent, TranslateModule.forRoot()],
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

    fixture = TestBed.createComponent(OrderCartPageComponent);
    component = fixture.componentInstance;
  });

  it('loads order when orderId route param is present', () => {
    orderServiceMock.getOrder.mockReturnValue(of(orderFixture));

    fixture.detectChanges();

    expect(orderServiceMock.getOrder).toHaveBeenCalledWith('ord-1');
    expect(component.order()).toEqual(orderFixture);
    expect(component.state()).toBe('ready');
  });

  it('sets error state before errorKey when addItem fails', () => {
    orderServiceMock.getOrder.mockReturnValue(of(orderFixture));
    orderServiceMock.addItem.mockReturnValue(throwError(() => new Error('add failed')));

    fixture.detectChanges();

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.addItem('SKU-2', 1);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ORDER.CART.ERROR.ADD_ITEM');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('shows error state when createCart fails', () => {
    orderServiceMock.getOrder.mockReturnValue(of(orderFixture));
    orderServiceMock.createCart.mockReturnValue(throwError(() => new Error('fail')));

    fixture.detectChanges();

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.createNewCart({ currency: 'USD' });

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ORDER.CART.ERROR.CREATE');

    const errorStateCallIdx = stateSetSpy.mock.calls.findIndex(call => call[0] === 'error');
    const errorKeyCallIdx = errorKeySetSpy.mock.calls.findIndex(
      call => call[0] === 'ORDER.CART.ERROR.CREATE',
    );

    expect(stateSetSpy.mock.invocationCallOrder[errorStateCallIdx]).toBeLessThan(
      errorKeySetSpy.mock.invocationCallOrder[errorKeyCallIdx],
    );
  });

  it('shows error state when removeItem fails', () => {
    orderServiceMock.getOrder.mockReturnValue(of(orderFixture));
    orderServiceMock.removeItem.mockReturnValue(throwError(() => new Error('fail')));

    fixture.detectChanges();

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.removeItem('line-1');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ORDER.CART.ERROR.REMOVE_ITEM');

    const errorStateCallIdx = stateSetSpy.mock.calls.findIndex(call => call[0] === 'error');
    const errorKeyCallIdx = errorKeySetSpy.mock.calls.findIndex(
      call => call[0] === 'ORDER.CART.ERROR.REMOVE_ITEM',
    );

    expect(stateSetSpy.mock.invocationCallOrder[errorStateCallIdx]).toBeLessThan(
      errorKeySetSpy.mock.invocationCallOrder[errorKeyCallIdx],
    );
  });

  it('sets error state before errorKey when initial load fails', () => {
    orderServiceMock.getOrder.mockReturnValue(throwError(() => new Error('load failed')));

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ORDER.CART.ERROR.LOAD');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });
});
