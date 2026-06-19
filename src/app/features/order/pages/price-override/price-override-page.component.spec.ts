import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import {
  PriceOverrideDetail,
  SalesOrderLineResponse,
  SalesOrderResponse,
} from '@durion-sdk/order';
import { PriceOverridePageComponent } from './price-override-page.component';
import { OrderService } from '../../services/order.service';

const orderLineFixture: SalesOrderLineResponse = {
  orderLineId: 'line-1',
  itemSku: 'SKU-1',
  itemDescription: 'Brake Pad',
  quantity: 2,
  unitPrice: 89,
};

const orderFixture: SalesOrderResponse = {
  orderId: 'ord-1',
  status: 'OPEN',
  subtotal: 178,
  lines: [orderLineFixture],
};

const overridesFixture: PriceOverrideDetail[] = [
  {
    overrideId: 'ov-1',
    orderId: 'ord-1',
    orderLineId: 'line-1',
    productId: 'SKU-1',
    overridePrice: 75,
    reasonCode: 'PRICE_MATCH',
    originalPrice: 89,
    discountAmount: 14,
    discountPercentage: 15.73,
    status: 'PENDING',
    requiresApproval: true,
    affectsCommission: false,
    requestedByUserId: 'user-1',
    createdAt: '2026-05-01T00:00:00Z',
  },
];

describe('PriceOverridePageComponent', () => {
  let fixture: ComponentFixture<PriceOverridePageComponent>;
  let component: PriceOverridePageComponent;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const orderServiceMock = {
    getOverridesByOrder: vi.fn(),
    applyPriceOverride: vi.fn(),
    getOrder: vi.fn(),
  };

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(convertToParamMap({ orderId: 'ord-1', lineId: 'line-1' }));

    orderServiceMock.getOverridesByOrder.mockReset();
    orderServiceMock.applyPriceOverride.mockReset();
    orderServiceMock.getOrder.mockReset();

    await TestBed.configureTestingModule({
      imports: [PriceOverridePageComponent, TranslateModule.forRoot()],
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

    fixture = TestBed.createComponent(PriceOverridePageComponent);
    component = fixture.componentInstance;
  });

  it('loads overrides and order line on init', () => {
    orderServiceMock.getOverridesByOrder.mockReturnValue(of(overridesFixture));
    orderServiceMock.getOrder.mockReturnValue(of(orderFixture));

    fixture.detectChanges();

    expect(orderServiceMock.getOverridesByOrder).toHaveBeenCalledWith('ord-1');
    expect(orderServiceMock.getOrder).toHaveBeenCalledWith('ord-1');
    expect(component.overrides()).toEqual(overridesFixture);
    expect(component.orderLine()).toEqual(orderLineFixture);
    expect(component.state()).toBe('ready');
  });

  it('sets error state before errorKey when applyOverride fails', () => {
    orderServiceMock.getOverridesByOrder.mockReturnValue(of(overridesFixture));
    orderServiceMock.getOrder.mockReturnValue(of(orderFixture));
    orderServiceMock.applyPriceOverride.mockReturnValue(throwError(() => new Error('apply failed')));

    fixture.detectChanges();

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.applyOverride(70, 'LOYALTY_ADJUSTMENT');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ORDER.OVERRIDE.ERROR.APPLY');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state before errorKey when initial load fails', () => {
    orderServiceMock.getOverridesByOrder.mockReturnValue(throwError(() => new Error('load failed')));
    orderServiceMock.getOrder.mockReturnValue(throwError(() => new Error('load failed')));

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ORDER.OVERRIDE.ERROR.LOAD');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });
});
