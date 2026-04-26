import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { SalesOrderLineResponse, SalesOrderResponse, SalesOrdersService } from '@durion-sdk/order';
import { AuthService } from '../../../../core/services/auth.service';
import { OrderCartPageComponent } from './order-cart-page.component';

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

describe('OrderCartPageComponent', () => {
  let fixture: ComponentFixture<OrderCartPageComponent>;
  let component: OrderCartPageComponent;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const salesOrdersServiceMock = {
    createCart: vi.fn(),
    getOrder: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
  };

  const authServiceMock = {
    currentUserClaims: vi.fn().mockReturnValue({ sub: 'test-clerk' }),
  };

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(convertToParamMap({ orderId: 'ord-1' }));

    salesOrdersServiceMock.createCart.mockReset();
    salesOrdersServiceMock.getOrder.mockReset();
    salesOrdersServiceMock.addItem.mockReset();
    salesOrdersServiceMock.removeItem.mockReset();

    await TestBed.configureTestingModule({
      imports: [OrderCartPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SalesOrdersService, useValue: salesOrdersServiceMock },
        { provide: AuthService, useValue: authServiceMock },
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
    salesOrdersServiceMock.getOrder.mockReturnValue(of(orderFixture));

    fixture.detectChanges();

    expect(salesOrdersServiceMock.getOrder).toHaveBeenCalledWith('ord-1');
    expect(component.order()).toEqual(orderFixture);
    expect(component.state()).toBe('ready');
  });

  it('sets error state before errorKey when addItem fails', () => {
    salesOrdersServiceMock.getOrder.mockReturnValue(of(orderFixture));
    salesOrdersServiceMock.addItem.mockReturnValue(throwError(() => new Error('add failed')));

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

  it('shows error state when createNewCart fails', () => {
    salesOrdersServiceMock.getOrder.mockReturnValue(of(orderFixture));
    salesOrdersServiceMock.createCart.mockReturnValue(throwError(() => new Error('fail')));

    fixture.detectChanges();

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.createNewCart();

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
    salesOrdersServiceMock.getOrder.mockReturnValue(of(orderFixture));
    salesOrdersServiceMock.removeItem.mockReturnValue(throwError(() => new Error('fail')));

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
    salesOrdersServiceMock.getOrder.mockReturnValue(throwError(() => new Error('load failed')));

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
