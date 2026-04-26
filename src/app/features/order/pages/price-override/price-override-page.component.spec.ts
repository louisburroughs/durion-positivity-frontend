import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import {
  PriceOverrideDetail,
  PriceOverridesService,
  SalesOrderLineResponse,
  SalesOrderResponse,
  SalesOrdersService,
} from '@durion-sdk/order';
import { PriceOverridePageComponent } from './price-override-page.component';

const orderLineFixture: SalesOrderLineResponse = {
  orderLineId: 'line-1',
  itemSku: 'SKU-1',
  itemDescription: 'Brake Pad',
  quantity: 2,
  unitPrice: 89,
};

const orderFixture: SalesOrderResponse = {
  orderId: 'ord-1',
  subtotal: 178,
  lines: [orderLineFixture],
};

const overridesFixture: PriceOverrideDetail[] = [
  {
    overrideId: 'ov-1',
    orderId: 'ord-1',
    orderLineId: 'line-1',
    overridePrice: 75,
    reasonCode: 'PRICE_MATCH',
    originalPrice: 89,
  },
];

describe('PriceOverridePageComponent', () => {
  let fixture: ComponentFixture<PriceOverridePageComponent>;
  let component: PriceOverridePageComponent;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const priceOverridesServiceMock = {
    getOverridesByOrder: vi.fn(),
    applyPriceOverride: vi.fn(),
  };

  const salesOrdersServiceMock = {
    getOrder: vi.fn(),
  };

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(convertToParamMap({ orderId: 'ord-1', lineId: 'line-1' }));

    priceOverridesServiceMock.getOverridesByOrder.mockReset();
    priceOverridesServiceMock.applyPriceOverride.mockReset();
    salesOrdersServiceMock.getOrder.mockReset();

    await TestBed.configureTestingModule({
      imports: [PriceOverridePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PriceOverridesService, useValue: priceOverridesServiceMock },
        { provide: SalesOrdersService, useValue: salesOrdersServiceMock },
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
    priceOverridesServiceMock.getOverridesByOrder.mockReturnValue(of(overridesFixture));
    salesOrdersServiceMock.getOrder.mockReturnValue(of(orderFixture));

    fixture.detectChanges();

    expect(priceOverridesServiceMock.getOverridesByOrder).toHaveBeenCalledWith('ord-1');
    expect(salesOrdersServiceMock.getOrder).toHaveBeenCalledWith('ord-1');
    expect(component.overrides()).toEqual(overridesFixture);
    expect(component.orderLine()).toEqual(orderLineFixture);
    expect(component.state()).toBe('ready');
  });

  it('sets error state before errorKey when applyOverride fails', () => {
    priceOverridesServiceMock.getOverridesByOrder.mockReturnValue(of(overridesFixture));
    salesOrdersServiceMock.getOrder.mockReturnValue(of(orderFixture));
    priceOverridesServiceMock.applyPriceOverride.mockReturnValue(throwError(() => new Error('apply failed')));

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
    priceOverridesServiceMock.getOverridesByOrder.mockReturnValue(throwError(() => new Error('load failed')));
    salesOrdersServiceMock.getOrder.mockReturnValue(throwError(() => new Error('load failed')));

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
