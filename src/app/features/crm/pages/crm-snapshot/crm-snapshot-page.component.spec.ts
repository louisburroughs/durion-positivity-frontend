import { TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { CrmSnapshotPageComponent } from './crm-snapshot.component';
import { CrmService } from '../../services/crm.service';
import type { BillingRules, CrmSnapshot } from '../../models/crm.models';

describe('CrmSnapshotPageComponent', () => {
  const crmServiceStub = {
    fetchByParty: vi.fn(),
    fetchByVehicle: vi.fn(),
    getBillingRules: vi.fn(),
  };

  const activatedRouteStub = {
    snapshot: {
      paramMap: convertToParamMap({ partyId: 'party-123' }),
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CrmSnapshotPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CrmService, useValue: crmServiceStub },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads party snapshot + billing rules via forkJoin and sets ready state', () => {
    const partySnapshot: CrmSnapshot = {
      partyId: 'party-123',
      partyName: 'Acme Fleet Services',
      partyType: 'COMMERCIAL',
      vehicles: [],
      contacts: [],
    };
    const rules: BillingRules = {
      requirePo: true,
      paymentTerms: 'NET_30',
      creditLimit: 15000,
      notes: 'Commercial account',
    };

    crmServiceStub.fetchByParty.mockReturnValueOnce(of(partySnapshot));
    crmServiceStub.getBillingRules.mockReturnValueOnce(of(rules));

    const fixture = TestBed.createComponent(CrmSnapshotPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(crmServiceStub.fetchByParty).toHaveBeenCalledWith('party-123');
    expect(crmServiceStub.getBillingRules).toHaveBeenCalledWith('party-123');
    expect(component.state()).toBe('ready');
    expect(component.snapshot()?.partyId).toBe('party-123');
    expect(component.billingRules()).toEqual(rules);
  });

  it('sets error state before errorKey when route load fails', () => {
    crmServiceStub.fetchByParty.mockReturnValueOnce(
      throwError(() => ({ status: 500, error: { message: 'boom' } })),
    );
    crmServiceStub.getBillingRules.mockReturnValueOnce(of({
      requirePo: false,
      paymentTerms: 'NET_15',
    } satisfies BillingRules));

    const fixture = TestBed.createComponent(CrmSnapshotPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('CRM.SNAPSHOT.ERROR.LOAD');
  });

  it('sets state before errorKey (invocationCallOrder) when route load fails', () => {
    crmServiceStub.fetchByParty.mockReturnValueOnce(
      throwError(() => ({ status: 500, error: { message: 'boom' } })),
    );
    crmServiceStub.getBillingRules.mockReturnValueOnce(of({
      requirePo: false,
      paymentTerms: 'NET_15',
    } satisfies BillingRules));

    const fixture = TestBed.createComponent(CrmSnapshotPageComponent);
    const component = fixture.componentInstance;
    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('CRM.SNAPSHOT.ERROR.LOAD');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });
});
