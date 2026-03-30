import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { CrmService } from './crm.service';
import type { BillingRules, CrmSnapshot } from '../models/crm.models';

describe('CrmService', () => {
  let service: CrmService;

  const apiBaseServiceStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CrmService,
        { provide: ApiBaseService, useValue: apiBaseServiceStub },
      ],
    });

    service = TestBed.inject(CrmService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchByParty()', () => {
    it('calls GET /v1/crm/snapshot/party/{partyId}', () => {
      const partySnapshot: CrmSnapshot = {
        partyId: 'party-123',
        partyName: 'Acme Fleet',
        partyType: 'COMMERCIAL',
        snapshotId: 'snap-123',
        version: '1',
        timestamp: '2026-03-30T12:00:00Z',
        source: 'CRM',
      };
      apiBaseServiceStub.get.mockReturnValueOnce(of(partySnapshot));

      let result: CrmSnapshot | undefined;
      service.fetchByParty('party-123').subscribe(value => {
        result = value;
      });

      expect(apiBaseServiceStub.get).toHaveBeenCalledOnce();
      const [path] = apiBaseServiceStub.get.mock.calls[0];
      expect(path).toBe('/v1/crm/snapshot/party/party-123');
      expect(result).toEqual(partySnapshot);
    });
  });

  describe('fetchByVehicle()', () => {
    it('calls GET /v1/crm/snapshot/vehicle/{vehicleId}', () => {
      const vehicleSnapshot: CrmSnapshot = {
        partyId: 'party-veh-1',
        partyName: 'Vehicle Party',
        partyType: 'FLEET',
        snapshotId: 'snap-veh-1',
        version: '2',
        timestamp: '2026-03-30T12:05:00Z',
        source: 'CRM',
      };
      apiBaseServiceStub.get.mockReturnValueOnce(of(vehicleSnapshot));

      let result: CrmSnapshot | undefined;
      service.fetchByVehicle('vehicle-42').subscribe(value => {
        result = value;
      });

      expect(apiBaseServiceStub.get).toHaveBeenCalledOnce();
      const [path] = apiBaseServiceStub.get.mock.calls[0];
      expect(path).toBe('/v1/crm/snapshot/vehicle/vehicle-42');
      expect(result).toEqual(vehicleSnapshot);
    });
  });

  describe('getBillingRules()', () => {
    it('calls GET /v1/crm/parties/{partyId}/billing-rules', () => {
      const rules: BillingRules = {
        requirePo: true,
        paymentTerms: 'NET_30',
        creditLimit: 10000,
        notes: 'Commercial account',
      };
      apiBaseServiceStub.get.mockReturnValueOnce(of(rules));

      let result: BillingRules | undefined;
      service.getBillingRules('party-321').subscribe(value => {
        result = value;
      });

      expect(apiBaseServiceStub.get).toHaveBeenCalledOnce();
      const [path] = apiBaseServiceStub.get.mock.calls[0];
      expect(path).toBe('/v1/crm/parties/party-321/billing-rules');
      expect(result).toEqual(rules);
    });
  });

  describe('upsertBillingRules()', () => {
    it('calls PUT /v1/crm/parties/{partyId}/billing-rules and omits readonly fields', () => {
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
      apiBaseServiceStub.put.mockReturnValueOnce(of(responseRules));

      let result: BillingRules | undefined;
      service.upsertBillingRules('party-321', requestRules).subscribe(value => {
        result = value;
      });

      expect(apiBaseServiceStub.put).toHaveBeenCalledOnce();
      const [path, payload] = apiBaseServiceStub.put.mock.calls[0];
      expect(path).toBe('/v1/crm/parties/party-321/billing-rules');
      expect(payload).toEqual({
        requirePo: false,
        paymentTerms: 'COD',
        creditLimit: 2500,
        notes: 'PO not required for this account',
      });
      expect(result).toEqual(responseRules);
    });
  });
});
