import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { HttpHeaders } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { Subject, of, throwError } from 'rxjs';
import { CrmSnapshotComponent } from './crm-snapshot.component';
import { CrmService } from '../../services/crm.service';
import { CrmSnapshot, PartyDetail } from '../../models/crm.models';

const crmServiceStub = {
  fetchByParty: vi.fn(),
  fetchByVehicle: vi.fn(),
  getBillingRules: vi.fn(),
  searchParties: vi.fn(),
};

const PARTY_ID = '01960020-0000-7000-8000-00000000002b';
const VEHICLE_ID = '01960020-0000-7000-8000-0000000000aa';

function snapshot(overrides: Partial<CrmSnapshot> = {}): CrmSnapshot {
  return { partyId: PARTY_ID, partyName: 'Acme Tire Co', partyType: 'COMMERCIAL', ...overrides };
}

describe('CrmSnapshotComponent', () => {
  let fixture: ComponentFixture<CrmSnapshotComponent>;
  let component: CrmSnapshotComponent;

  const setup = async (routeParty: string | null = null) => {
    await TestBed.configureTestingModule({
      imports: [CrmSnapshotComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CrmService, useValue: crmServiceStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(routeParty ? { partyId: routeParty } : {}) } },
        },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(CrmSnapshotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  describe('route-driven load (constructor effect)', () => {
    it('does nothing when the route carries no partyId', async () => {
      await setup(null);
      expect(crmServiceStub.fetchByParty).not.toHaveBeenCalled();
      expect(component.state()).toBe('idle');
    });

    it('loads the snapshot and billing rules for a route partyId, reaching ready', async () => {
      crmServiceStub.fetchByParty.mockReturnValue(of(snapshot()));
      crmServiceStub.getBillingRules.mockReturnValue(of({ requirePo: true, paymentTerms: 'NET_30' }));
      await setup(PARTY_ID);

      expect(crmServiceStub.fetchByParty).toHaveBeenCalledWith(PARTY_ID);
      expect(component.state()).toBe('ready');
      expect(component.snapshot()?.billingRules).toEqual({ requirePo: true, paymentTerms: 'NET_30' });
    });

    it('reaches empty when the loaded snapshot carries no partyId', async () => {
      crmServiceStub.fetchByParty.mockReturnValue(of(snapshot({ partyId: '' })));
      crmServiceStub.getBillingRules.mockReturnValue(of(null));
      await setup(PARTY_ID);

      expect(component.state()).toBe('empty');
    });

    it('maps a route load failure to error with the mapped error type', async () => {
      crmServiceStub.fetchByParty.mockReturnValue(throwError(() => ({ status: 403, headers: new HttpHeaders() })));
      crmServiceStub.getBillingRules.mockReturnValue(of(null));
      await setup(PARTY_ID);

      expect(component.state()).toBe('error');
      expect(component.viewState()).toBe('error');
      expect(component.errorKey()).toBe('CRM.SNAPSHOT.ERROR.LOAD');
      expect(component.errorType()).toBe('forbidden');
      expect(component.snapshot()).toBeNull();
    });
  });

  describe('loadSnapshot()', () => {
    it('requires at least a party or vehicle identifier', async () => {
      await setup(null);
      component.loadSnapshot();

      expect(component.state()).toBe('error');
      expect(component.errorType()).toBe('validation');
      expect(component.errorMessage()).toBe('Enter a Party ID or Vehicle ID');
      expect(crmServiceStub.fetchByParty).not.toHaveBeenCalled();
    });

    it('does not load when the form fails pattern validation', async () => {
      await setup(null);
      component.snapshotForm.controls.partyId.setValue('not-a-uuid');
      component.loadSnapshot();

      expect(crmServiceStub.fetchByParty).not.toHaveBeenCalled();
    });

    it('loads by partyId via forkJoin with billing rules and reaches ready', async () => {
      await setup(null);
      component.snapshotForm.controls.partyId.setValue(PARTY_ID);
      crmServiceStub.fetchByParty.mockReturnValue(of(snapshot()));
      crmServiceStub.getBillingRules.mockReturnValue(of({ requirePo: false, paymentTerms: 'NET_15' }));

      component.loadSnapshot();

      expect(component.state()).toBe('ready');
      expect(crmServiceStub.getBillingRules).toHaveBeenCalledWith(PARTY_ID);
    });

    it('loads by vehicleId, skipping billing rules when the vehicle snapshot has no party', async () => {
      await setup(null);
      component.snapshotForm.controls.vehicleId.setValue(VEHICLE_ID);
      crmServiceStub.fetchByVehicle.mockReturnValue(of(snapshot({ partyId: '' })));

      component.loadSnapshot();

      expect(crmServiceStub.getBillingRules).not.toHaveBeenCalled();
      expect(component.state()).toBe('ready');
    });

    it('loads billing rules too when the vehicle snapshot resolves to a party', async () => {
      await setup(null);
      component.snapshotForm.controls.vehicleId.setValue(VEHICLE_ID);
      crmServiceStub.fetchByVehicle.mockReturnValue(of(snapshot()));
      crmServiceStub.getBillingRules.mockReturnValue(of({ requirePo: true, paymentTerms: 'NET_30' }));

      component.loadSnapshot();

      expect(crmServiceStub.getBillingRules).toHaveBeenCalledWith(PARTY_ID);
      expect(component.state()).toBe('ready');
    });

    it('drives loading state off a Subject rather than a synchronous of()', async () => {
      await setup(null);
      component.snapshotForm.controls.partyId.setValue(PARTY_ID);
      const subject = new Subject<CrmSnapshot>();
      crmServiceStub.fetchByParty.mockReturnValue(subject.asObservable());
      crmServiceStub.getBillingRules.mockReturnValue(of(null));

      component.loadSnapshot();
      expect(component.state()).toBe('loading');
      expect(component.canLoad()).toBe(false);

      subject.next(snapshot());
      subject.complete();
      expect(component.state()).toBe('ready');
    });

    it.each([
      [403, 'forbidden'],
      [404, 'not-found'],
      [400, 'validation'],
      [500, 'generic'],
    ] as const)('maps a %d response to errorType %s and captures the correlation id', async (status, errorType) => {
      await setup(null);
      component.snapshotForm.controls.partyId.setValue(PARTY_ID);
      const headers = new HttpHeaders({ 'x-correlation-id': 'corr-123' });
      crmServiceStub.fetchByParty.mockReturnValue(throwError(() => ({ status, headers })));
      crmServiceStub.getBillingRules.mockReturnValue(of(null));

      component.loadSnapshot();

      expect(component.errorType()).toBe(errorType);
      expect(component.correlationId()).toBe('corr-123');
      expect(component.state()).toBe('error');
    });
  });

  describe('refresh()', () => {
    it('reloads by the route partyId when present', async () => {
      crmServiceStub.fetchByParty.mockReturnValue(of(snapshot()));
      crmServiceStub.getBillingRules.mockReturnValue(of(null));
      await setup(PARTY_ID);
      expect(crmServiceStub.fetchByParty).toHaveBeenCalledTimes(1);

      component.refresh();

      expect(crmServiceStub.fetchByParty).toHaveBeenCalledTimes(2);
    });

    it('falls back to loadSnapshot() when there is no route partyId', async () => {
      await setup(null);
      component.snapshotForm.controls.partyId.setValue(PARTY_ID);
      crmServiceStub.fetchByParty.mockReturnValue(of(snapshot()));
      crmServiceStub.getBillingRules.mockReturnValue(of(null));

      component.refresh();

      expect(crmServiceStub.fetchByParty).toHaveBeenCalledWith(PARTY_ID);
      expect(component.state()).toBe('ready');
    });
  });

  describe('clear()', () => {
    it('resets the form, snapshot, and error state back to idle', async () => {
      await setup(null);
      component.snapshotForm.controls.partyId.setValue(PARTY_ID);
      crmServiceStub.fetchByParty.mockReturnValue(of(snapshot()));
      crmServiceStub.getBillingRules.mockReturnValue(of(null));
      component.loadSnapshot();
      expect(component.state()).toBe('ready');

      component.clear();

      expect(component.state()).toBe('idle');
      expect(component.snapshot()).toBeNull();
      expect(component.snapshotForm.controls.partyId.value).toBe('');
      expect(component.errorType()).toBeNull();
    });
  });

  describe('party typeahead', () => {
    it('does not search for a query under two characters', async () => {
      vi.useFakeTimers();
      await setup(null);
      component.onPartyInput('a');
      await vi.advanceTimersByTimeAsync(300);

      expect(crmServiceStub.searchParties).not.toHaveBeenCalled();
      expect(component.partySuggestions()).toEqual([]);
      vi.useRealTimers();
    });

    it('debounces and searches, populating suggestions', async () => {
      vi.useFakeTimers();
      await setup(null);
      const found: PartyDetail = { partyId: PARTY_ID, legalName: 'Acme Tire Co', customerNumber: 'CUST-1' };
      crmServiceStub.searchParties.mockReturnValue(of({ parties: [found] }));

      component.onPartyInput('acme');
      await vi.advanceTimersByTimeAsync(300);

      expect(crmServiceStub.searchParties).toHaveBeenCalledWith('acme');
      expect(component.partySuggestions()).toEqual([found]);
      expect(component.searchingParty()).toBe(false);
      vi.useRealTimers();
    });

    it('swallows a search failure as an empty suggestion list', async () => {
      vi.useFakeTimers();
      await setup(null);
      crmServiceStub.searchParties.mockReturnValue(throwError(() => new Error('down')));

      component.onPartyInput('acme');
      await vi.advanceTimersByTimeAsync(300);

      expect(component.partySuggestions()).toEqual([]);
      vi.useRealTimers();
    });

    it('partyLabel() prefers legal name, falling back to dba then partyId, with a customer number suffix', () => {
      expect(component.partyLabel({ partyId: 'p1', legalName: 'Acme', customerNumber: 'C-1' } as PartyDetail)).toBe('Acme (#C-1)');
      expect(component.partyLabel({ partyId: 'p1', legalName: '', dba: 'Acme Trading' } as PartyDetail)).toBe('Acme Trading');
      expect(component.partyLabel({ partyId: 'p1', legalName: '' } as PartyDetail)).toBe('p1');
    });

    it('selectParty() sets the form value, the query text, and hides suggestions', async () => {
      await setup(null);
      const party: PartyDetail = { partyId: PARTY_ID, legalName: 'Acme Tire Co', customerNumber: 'CUST-1' };
      component.showPartySuggestions.set(true);

      component.selectParty(party);

      expect(component.snapshotForm.controls.partyId.value).toBe(PARTY_ID);
      expect(component.partyQuery()).toBe('Acme Tire Co (#CUST-1)');
      expect(component.showPartySuggestions()).toBe(false);
    });

    it('onPartyFocus() reopens suggestions only when some exist', async () => {
      await setup(null);
      component.onPartyFocus();
      expect(component.showPartySuggestions()).toBe(false);

      component.partySuggestions.set([{ partyId: PARTY_ID, legalName: 'Acme' } as PartyDetail]);
      component.onPartyFocus();
      expect(component.showPartySuggestions()).toBe(true);
    });

    it('onPartyBlur() hides suggestions after a short delay', async () => {
      vi.useFakeTimers();
      await setup(null);
      component.showPartySuggestions.set(true);

      component.onPartyBlur();
      expect(component.showPartySuggestions()).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      expect(component.showPartySuggestions()).toBe(false);
      vi.useRealTimers();
    });
  });
});
