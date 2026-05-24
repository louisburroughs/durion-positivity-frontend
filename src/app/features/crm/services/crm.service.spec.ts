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
  CRMVehiclesService,
} from '@durion-sdk/customer';
import { CrmService } from './crm.service';
import type { BillingRules, CrmSnapshot, PartyDetail } from '../models/crm.models';
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
        { provide: CRMCommunicationPreferencesService, useValue: {} },
        { provide: CRMContactsService, useValue: {} },
        { provide: CRMPartyRelationshipsService, useValue: {} },
        { provide: CRMPersonsService, useValue: {} },
        { provide: CRMSnapshotsService, useValue: snapshotsApiStub },
        { provide: CRMVehiclesService, useValue: {} },
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
    it('calls crmAccounts.browseParties with default pageable and maps results into parties', () => {
      crmAccountsStub.browseParties.mockReturnValueOnce(
        of({ results: [browseParty], totalCount: 1, pageNumber: 0, pageSize: 20 }),
      );

      let result: { parties: PartyDetail[] } | undefined;
      service.browseParties().subscribe(value => {
        result = value;
      });

      const expectedPageable: Pageable = {};

      expect(crmAccountsStub.browseParties).toHaveBeenCalledWith(expectedPageable);
      expect(result).toEqual({ parties: [browseParty] });
    });
  });

  describe('searchParties()', () => {
    it('sends trimmed name criteria for non-empty query', () => {
      crmAccountsStub.searchParties.mockReturnValueOnce(of({ results: [] }));

      service.searchParties('  acme  ').subscribe();

      expect(crmAccountsStub.searchParties).toHaveBeenCalledWith({ name: 'acme' });
    });
  });
});
