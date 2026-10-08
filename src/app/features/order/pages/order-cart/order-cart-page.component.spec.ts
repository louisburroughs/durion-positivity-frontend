import { formatCurrency, getCurrencySymbol } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { SalesOrderLineResponse, SalesOrderResponse } from '@durion-sdk/order';
import { AuthService } from '../../../../core/services/auth.service';
import { LocaleService } from '../../../../core/services/locale.service';
import { OrderCartPageComponent } from './order-cart-page.component';
import { OrderService } from '../../services/order.service';
import { REGISTER_TERMINAL_ID } from '../../models/register-drawer.models';
import { CUSTOMER_LOOKUP_SOURCE } from '../../../../shared/customer-lookup/customer-lookup.tokens';

const orderLineFixture: SalesOrderLineResponse = {
  orderLineId: 'line-1',
  itemSku: 'SKU-1',
  itemDescription: 'Brake Pad',
  quantity: 2,
  unitPrice: 50,
};

const orderFixture: SalesOrderResponse = {
  orderId: 'ord-1',
  status: 'DRAFT',
  subtotal: 100,
  lines: [orderLineFixture],
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

  const authServiceMock = {
    currentUserClaims: vi.fn().mockReturnValue({ sub: 'test-clerk' }),
    // A legacy token without perm_bits: every gate falls back open (ADR-0040 §6a.3).
    permissionsKnown: () => false,
    hasAnyPermission: () => false,
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
        { provide: AuthService, useValue: authServiceMock },
        { provide: CUSTOMER_LOOKUP_SOURCE, useValue: { search: () => of([]), getById: () => of(null) } },
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

  it('starts a cart without asking for a customer id (P8)', () => {
    paramMap$.next(convertToParamMap({}));
    orderServiceMock.createCart.mockReturnValue(of(orderFixture));
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#order-cart-customer-id')).toBeNull();
    expect(root.querySelector('#order-cart-vehicle-id')).not.toBeNull();

    component.createNewCart('veh-1');
    expect(orderServiceMock.createCart).toHaveBeenCalledWith({
      clerkId: 'test-clerk',
      terminalId: REGISTER_TERMINAL_ID, // the drawer page resolves the same session (CAP:550 S22)
      vehicleId: 'veh-1',
    });
    expect(REGISTER_TERMINAL_ID).toBe('DEFAULT');
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

  it('shows error state when createNewCart fails', () => {
    orderServiceMock.getOrder.mockReturnValue(of(orderFixture));
    orderServiceMock.createCart.mockReturnValue(throwError(() => new Error('fail')));

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

  describe('line total column (#410) and locale (#408)', () => {
    const usd = (value: number, locale = 'en-US'): string =>
      formatCurrency(value, locale, getCurrencySymbol('USD', 'wide', locale), 'USD', '1.2-2');

    // A discounted line: the server's lineSubtotal (90) is not quantity × unitPrice (100).
    const discountedLine: SalesOrderLineResponse = { ...orderLineFixture, lineSubtotal: 90 };

    const lineTotals = (): string[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="order-cart-line-total"]'))
        .map((el) => el.textContent?.trim() ?? '');

    const load = (lines: SalesOrderLineResponse[]): void => {
      orderServiceMock.getOrder.mockReturnValue(of({ ...orderFixture, subtotal: 90, lines }));
      fixture.detectChanges();
    };

    afterEach(() => TestBed.inject(LocaleService).currentLocale.set('en-US'));

    it("renders the server's lineSubtotal, not quantity × unitPrice", () => {
      load([discountedLine]);
      expect(lineTotals()).toEqual([usd(90)]);
    });

    it('renders the not-available placeholder when the line has no lineSubtotal', () => {
      load([{ ...orderLineFixture, lineSubtotal: undefined }]);
      expect(lineTotals()).toEqual(['COMMON.NOT_AVAILABLE']);
    });

    for (const locale of ['fr-FR', 'es-MX', 'fr-CA'] as const) {
      it(`formats amounts in the user locale ${locale} and back to en-US`, () => {
        load([discountedLine]);
        const service = TestBed.inject(LocaleService);
        service.currentLocale.set(locale);
        fixture.detectChanges();
        expect(lineTotals()).toEqual([usd(90, locale)]);

        service.currentLocale.set('en-US');
        fixture.detectChanges();
        expect(lineTotals()).toEqual([usd(90)]);
      });
    }
  });
});
