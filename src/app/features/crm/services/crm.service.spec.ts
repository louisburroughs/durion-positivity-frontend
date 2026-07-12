import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  CRMAccountsService,
  CRMCommunicationPreferencesService,
  CRMContactsService,
  CRMPartyRelationshipsService,
  CRMPersonsService,
  CRMSnapshotsService,
} from '@durion-sdk/customer';
import { VehicleRegistryAPIService } from '@durion-sdk/vehicle-inventory';
import { CrmService, PartyPage } from './crm.service';
import type { BillingRules, CommunicationPreferences, CrmSnapshot, PartyDetail } from '../models/crm.models';
import type { Pageable } from '@durion-sdk/customer';

describe('CrmService', () => {
  let service: CrmService;

  const apiBaseServiceStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  const snapshotsApiStub = {
    fetchByParty: vi.fn(),
    fetchByVehicle: vi.fn(),
    getBillingRules: vi.fn(),
  };

  const crmAccountsStub = {
    browseParties: vi.fn(),
    upsertBillingRules: vi.fn(),
    searchParties: vi.fn(),
    listBillingTerms: vi.fn(),
    checkPartyDuplicates: vi.fn(),
  };

  const commPrefsStub = {
    getCommunicationPreferences: vi.fn(),
    upsertCommunicationPreferences: vi.fn(),
  };

  const relationshipsStub = {
    createRelationship: vi.fn(),
  };

  const browseParty: PartyDetail = {
    partyId: 'party-101',
    legalName: 'Acme Fleet',
    contacts: [],
    vehicles: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CrmService,
        { provide: ApiBaseService, useValue: apiBaseServiceStub },
        { provide: CRMAccountsService, useValue: crmAccountsStub },
        { provide: CRMCommunicationPreferencesService, useValue: commPrefsStub },
        { provide: CRMContactsService, useValue: {} },
        { provide: CRMPartyRelationshipsService, useValue: relationshipsStub },
        { provide: CRMPersonsService, useValue: {} },
        { provide: CRMSnapshotsService, useValue: snapshotsApiStub },
        { provide: VehicleRegistryAPIService, useValue: {} },
      ],
    });

    service = TestBed.inject(CrmService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchByParty()', () => {
    it('calls snapshotsApi.fetchByParty with the given partyId', () => {
      const partySnapshot: CrmSnapshot = {
        partyId: 'party-123',
        partyName: 'Acme Fleet',
        partyType: 'COMMERCIAL',
        snapshotId: 'snap-123',
        version: '1',
        timestamp: '2026-03-30T12:00:00Z',
        source: 'CRM',
      };
      snapshotsApiStub.fetchByParty.mockReturnValueOnce(of(partySnapshot));

      let result: CrmSnapshot | undefined;
      service.fetchByParty('party-123').subscribe(value => {
        result = value;
      });

      expect(snapshotsApiStub.fetchByParty).toHaveBeenCalledWith('party-123');
      expect(result).toEqual(partySnapshot);
    });
  });

  describe('fetchByVehicle()', () => {
    it('calls snapshotsApi.fetchByVehicle with the given vehicleId', () => {
      const vehicleSnapshot: CrmSnapshot = {
        partyId: 'party-veh-1',
        partyName: 'Vehicle Party',
        partyType: 'FLEET',
        snapshotId: 'snap-veh-1',
        version: '2',
        timestamp: '2026-03-30T12:05:00Z',
        source: 'CRM',
      };
      snapshotsApiStub.fetchByVehicle.mockReturnValueOnce(of(vehicleSnapshot));

      let result: CrmSnapshot | undefined;
      service.fetchByVehicle('vehicle-42').subscribe(value => {
        result = value;
      });

      expect(snapshotsApiStub.fetchByVehicle).toHaveBeenCalledWith('vehicle-42');
      expect(result).toEqual(vehicleSnapshot);
    });
  });

  describe('getBillingRules()', () => {
    it('calls snapshotsApi.getBillingRules with the given partyId', () => {
      const rules: BillingRules = {
        requirePo: true,
        paymentTerms: 'NET_30',
        creditLimit: 10000,
        notes: 'Commercial account',
      };
      snapshotsApiStub.getBillingRules.mockReturnValueOnce(of(rules));

      let result: BillingRules | undefined;
      service.getBillingRules('party-321').subscribe(value => {
        result = value;
      });

      expect(snapshotsApiStub.getBillingRules).toHaveBeenCalledWith('party-321');
      expect(result).toEqual(rules);
    });
  });

  describe('upsertBillingRules()', () => {
    it('calls accountsApi.upsertBillingRules omitting readonly fields', () => {
      const requestRules: Partial<BillingRules> = {
        requirePo: false,
        paymentTerms: 'COD',
        creditLimit: 2500,
        notes: 'PO not required for this account',
        createdAt: '2026-03-30T10:00:00Z',
        updatedAt: '2026-03-30T11:00:00Z',
      };
      const responseRules: BillingRules = {
        requirePo: false,
        paymentTerms: 'COD',
        creditLimit: 2500,
        notes: 'PO not required for this account',
        createdAt: '2026-03-30T10:00:00Z',
        updatedAt: '2026-03-30T11:00:00Z',
      };
      crmAccountsStub.upsertBillingRules.mockReturnValueOnce(of(responseRules));

      let result: BillingRules | undefined;
      service.upsertBillingRules('party-321', requestRules).subscribe(value => {
        result = value;
      });

      expect(crmAccountsStub.upsertBillingRules).toHaveBeenCalledOnce();
      const [partyId, payload] = crmAccountsStub.upsertBillingRules.mock.calls[0];
      expect(partyId).toBe('party-321');
      expect(payload).toEqual({
        requirePo: false,
        paymentTerms: 'COD',
        creditLimit: 2500,
        notes: 'PO not required for this account',
      });
      expect(result).toEqual(responseRules);
    });
  });

  describe('browseParties()', () => {
    it('requests the first page and maps results plus paging metadata', () => {
      crmAccountsStub.browseParties.mockReturnValueOnce(
        of({ results: [browseParty], totalCount: 1, pageNumber: 0, pageSize: 20 }),
      );

      let result: PartyPage | undefined;
      service.browseParties().subscribe(value => {
        result = value;
      });

      const expectedPageable: Pageable = { page: 0, size: 25 };

      expect(crmAccountsStub.browseParties).toHaveBeenCalledWith(
        expectedPageable, undefined, undefined, undefined, undefined, undefined, undefined,
      );
      expect(result).toEqual({
        parties: [browseParty],
        totalCount: 1,
        pageNumber: 0,
        pageSize: 20,
      });
    });
  });

  describe('listBillingTerms() mapping', () => {
    it('maps SDK {code,label} terms to local {id,name}', () => {
      crmAccountsStub.listBillingTerms.mockReturnValueOnce(
        of([{ code: 'NET30', label: 'Net 30', netDays: 30 }, { code: 'COD', label: 'Cash on Delivery', netDays: 0 }]),
      );

      let result: { id: string; name: string }[] | undefined;
      service.listBillingTerms().subscribe(r => (result = r));

      expect(result).toEqual([{ id: 'NET30', name: 'Net 30' }, { id: 'COD', name: 'Cash on Delivery' }]);
    });
  });

  describe('checkCommercialAccountDuplicates() mapping', () => {
    it('maps SDK potentialDuplicates -> local duplicates with matchReasons', () => {
      crmAccountsStub.checkPartyDuplicates.mockReturnValueOnce(
        of({ duplicatesFound: true, potentialDuplicates: [{ partyId: 'p1', legalName: 'Acme', score: 0.9, matchType: 'LEGAL_NAME' }] }),
      );

      let result: { duplicates: { partyId: string; legalName: string; matchReasons?: string[] }[] } | undefined;
      service.checkCommercialAccountDuplicates('Acme').subscribe(r => (result = r));

      expect(result).toEqual({ duplicates: [{ partyId: 'p1', legalName: 'Acme', matchReasons: ['LEGAL_NAME'] }] });
    });
  });

  describe('getCommunicationPreferences() mapping', () => {
    it('maps SDK OPT_IN/OPT_OUT enums to local booleans', () => {
      commPrefsStub.getCommunicationPreferences.mockReturnValueOnce(
        of({ partyId: 'p1', emailPreference: 'OPT_IN', smsPreference: 'OPT_OUT', phonePreference: 'OPT_IN' }),
      );

      let result: CommunicationPreferences | undefined;
      service.getCommunicationPreferences('p1').subscribe(r => (result = r));

      expect(result).toEqual({ emailEnabled: true, smsEnabled: false });
    });
  });

  describe('upsertCommunicationPreferences() mapping', () => {
    it('sends OPT_IN/OPT_OUT enums and returns the saved preferences (response does not echo values)', () => {
      commPrefsStub.upsertCommunicationPreferences.mockReturnValueOnce(
        of({ partyId: 'p1', operationType: 'UPDATE', status: 'OK' }),
      );
      const prefs: CommunicationPreferences = { emailEnabled: true, smsEnabled: false };

      let result: CommunicationPreferences | undefined;
      service.upsertCommunicationPreferences('p1', prefs).subscribe(r => (result = r));

      const [partyId, payload] = commPrefsStub.upsertCommunicationPreferences.mock.calls[0];
      expect(partyId).toBe('p1');
      expect(payload).toEqual({ emailPreference: 'OPT_IN', smsPreference: 'OPT_OUT' });
      expect(result).toEqual(prefs);
    });
  });

  describe('createRelationship() mapping', () => {
    it('sends roles as a Set and maps the SDK response roles Set back to an array', () => {
      relationshipsStub.createRelationship.mockReturnValueOnce(
        of({
          relationshipId: 'rel-1',
          partyId: 'p1',
          personId: 'per-1',
          roles: new Set(['BILLING', 'PRIMARY_CONTACT']),
          effectiveStartDate: '2026-01-01',
          createdAt: '2026-01-02T00:00:00Z',
          previousPrimaryDemoted: true,
        }),
      );

      let result: { roles?: string[]; relationshipId?: string } | undefined;
      service
        .createRelationship('p1', {
          personId: 'per-1',
          roles: ['BILLING', 'PRIMARY_CONTACT'],
          effectiveStartDate: '2026-01-01',
        })
        .subscribe(r => (result = r));

      const [partyId, payload] = relationshipsStub.createRelationship.mock.calls[0];
      expect(partyId).toBe('p1');
      expect(payload.roles).toBeInstanceOf(Set);
      expect(Array.from(payload.roles)).toEqual(['BILLING', 'PRIMARY_CONTACT']);
      expect(Array.isArray(result?.roles)).toBe(true);
      expect(result?.roles).toEqual(['BILLING', 'PRIMARY_CONTACT']);
      expect(result?.relationshipId).toBe('rel-1');
    });
  });

  describe('searchParties()', () => {
    it('browses the unified directory by trimmed name so individuals are found too (issue #59)', () => {
      crmAccountsStub.browseParties.mockReturnValueOnce(
        of({ results: [browseParty], totalCount: 1, pageNumber: 0, pageSize: 25 }),
      );

      let result: { parties: unknown[] } | undefined;
      service.searchParties('  Albert  ').subscribe(value => {
        result = value;
      });

      const expectedPageable: Pageable = { page: 0, size: 25 };
      expect(crmAccountsStub.browseParties).toHaveBeenCalledWith(
        expectedPageable, 'Albert', undefined, undefined, undefined, undefined, undefined,
      );
      expect(crmAccountsStub.searchParties).not.toHaveBeenCalled();
      expect(result).toEqual({ parties: [browseParty] });
    });

    it('omits the name filter for an empty query', () => {
      crmAccountsStub.browseParties.mockReturnValueOnce(
        of({ results: [], totalCount: 0, pageNumber: 0, pageSize: 25 }),
      );

      service.searchParties('   ').subscribe();

      const expectedPageable: Pageable = { page: 0, size: 25 };
      expect(crmAccountsStub.browseParties).toHaveBeenCalledWith(
        expectedPageable, undefined, undefined, undefined, undefined, undefined, undefined,
      );
    });
  });
});
