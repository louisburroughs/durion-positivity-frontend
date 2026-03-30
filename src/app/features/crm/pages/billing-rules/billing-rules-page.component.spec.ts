import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { BillingRulesPageComponent } from './billing-rules.component';
import { CrmService } from '../../services/crm.service';
import type { BillingRules } from '../../models/crm.models';

describe('BillingRulesPageComponent', () => {
  const crmServiceStub = {
    getBillingRules: vi.fn(),
    upsertBillingRules: vi.fn(),
  };

  const activatedRouteStub = {
    snapshot: {
      paramMap: convertToParamMap({ partyId: 'party-777' }),
    },
  };

  const routerStub = {
    navigate: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BillingRulesPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CrmService, useValue: crmServiceStub },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
        { provide: Router, useValue: routerStub },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads billing rules for the current party on init', () => {
    const rules: BillingRules = {
      requirePo: true,
      paymentTerms: 'NET_30',
      creditLimit: 20000,
      notes: 'Requires PO',
      createdAt: '2026-03-30T00:00:00Z',
      updatedAt: '2026-03-30T01:00:00Z',
    };
    crmServiceStub.getBillingRules.mockReturnValueOnce(of(rules));

    const fixture = TestBed.createComponent(BillingRulesPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(crmServiceStub.getBillingRules).toHaveBeenCalledWith('party-777');
    expect(component.state()).toBe('ready');
    expect(component.billingRules()).toEqual(rules);
  });

  it('saveBillingRules() sets error state and save error key when mutation fails', () => {
    const initialRules: BillingRules = {
      requirePo: false,
      paymentTerms: 'NET_15',
      notes: 'Initial',
    };
    crmServiceStub.getBillingRules.mockReturnValueOnce(of(initialRules));
    crmServiceStub.upsertBillingRules.mockReturnValueOnce(
      throwError(() => ({ status: 500 })),
    );

    const fixture = TestBed.createComponent(BillingRulesPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.saveBillingRules({ requirePo: true, paymentTerms: 'NET_45' });

    expect(crmServiceStub.upsertBillingRules).toHaveBeenCalledWith('party-777', {
      requirePo: true,
      paymentTerms: 'NET_45',
    });
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('CRM.BILLING_RULES.ERROR.SAVE');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state and load error key when getBillingRules fails', () => {
    crmServiceStub.getBillingRules.mockReturnValueOnce(throwError(() => ({ status: 500 })));

    const fixture = TestBed.createComponent(BillingRulesPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('CRM.BILLING_RULES.ERROR.LOAD');
  });
});
