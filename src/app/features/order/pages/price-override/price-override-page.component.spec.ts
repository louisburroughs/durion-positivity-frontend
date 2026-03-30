import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import {
  ApplyPriceOverrideRequest,
  PriceOverride,
} from '../../models/order.models';
import { OrderService } from '../../services/order.service';
import { PriceOverridePageComponent } from './price-override-page.component';

const overridesFixture: PriceOverride[] = [
  {
    overrideId: 'ovr-1',
    orderId: 'ord-1',
    lineId: 'line-1',
    originalPrice: 89,
    overridePrice: 75,
    reasonCode: 'MATCH_COMPETITOR',
    authorityCode: 'ORDER.PRICE_OVERRIDE',
    approvalToken: 'mgr-token-1',
    appliedBy: 'manager-1',
    appliedAt: '2026-03-30T12:04:00Z',
  },
];

describe('PriceOverridePageComponent', () => {
  let fixture: ComponentFixture<PriceOverridePageComponent>;
  let component: PriceOverridePageComponent;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const orderServiceMock = {
    getOverridesByOrder: vi.fn(),
    applyPriceOverride: vi.fn(),
  };

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(convertToParamMap({ orderId: 'ord-1', lineId: 'line-1' }));

    orderServiceMock.getOverridesByOrder.mockReset();
    orderServiceMock.applyPriceOverride.mockReset();

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

  it('loads overrides on init', () => {
    orderServiceMock.getOverridesByOrder.mockReturnValue(of(overridesFixture));

    fixture.detectChanges();

    expect(orderServiceMock.getOverridesByOrder).toHaveBeenCalledWith('ord-1');
    expect(component.overrides()).toEqual(overridesFixture);
    expect(component.state()).toBe('ready');
  });

  it('sets error state before errorKey when applyOverride fails', () => {
    const request: ApplyPriceOverrideRequest = {
      overridePrice: 70,
      reasonCode: 'LOYALTY_ADJUSTMENT',
      authorityCode: 'ORDER.PRICE_OVERRIDE',
      approvalToken: 'mgr-token-2',
    };

    orderServiceMock.getOverridesByOrder.mockReturnValue(of(overridesFixture));
    orderServiceMock.applyPriceOverride.mockReturnValue(throwError(() => new Error('apply failed')));

    fixture.detectChanges();

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.applyOverride(request);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ORDER.OVERRIDE.ERROR.APPLY');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state before errorKey when initial load fails', () => {
    orderServiceMock.getOverridesByOrder.mockReturnValue(throwError(() => new Error('load failed')));

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
