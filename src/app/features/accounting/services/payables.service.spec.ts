import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  VendorBillAPIService,
  VendorBillApprovalRequiredTierEnum,
  VendorBillResponse,
  VendorBillResponseStatusEnum,
} from '@durion-sdk/accounting';
import { PayablesService } from './payables.service';

/**
 * A complete SDK `VendorBillResponse`, typed against the generated interface
 * (ADR-0032) so a removed or misspelled field fails to compile.
 */
const vendorBillResponse = (overrides: Partial<VendorBillResponse> = {}): VendorBillResponse => ({
  vendorBillId: 'b1',
  vendorId: 'v1',
  billNumber: 'BN-1',
  totalAmount: 100,
  openAmount: 100,
  status: VendorBillResponseStatusEnum.Approved,
  createdAt: '2026-01-15T00:00:00Z',
  availableActions: [],
  checks: [],
  lines: [],
  openCandidates: [],
  reissues: [],
  ...overrides,
});

describe('PayablesService', () => {
  let service: PayablesService;

  const vendorBillSdkStub = {
    listVendorBills: vi.fn(),
    getVendorBillById: vi.fn(),
    listVendorBillMatchCandidates: vi.fn(),
    resolveVendorBillMatchException: vi.fn(),
    selectVendorBillMatchCandidate: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PayablesService,
        { provide: VendorBillAPIService, useValue: vendorBillSdkStub },
      ],
    });
    service = TestBed.inject(PayablesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listBills()', () => {
    it('calls the SDK with dueFrom, dueTo, status, page and size', () => {
      vendorBillSdkStub.listVendorBills.mockReturnValueOnce(
        of({ content: [], number: 0, size: 25, totalElements: 0, totalPages: 0 }),
      );

      service.listBills('2026-01-01', '2026-02-01', 'MATCH_EXCEPTION', 1, 10).subscribe();

      expect(vendorBillSdkStub.listVendorBills).toHaveBeenCalledWith(
        '2026-01-01',
        '2026-02-01',
        'MATCH_EXCEPTION',
        1,
        10,
      );
    });

    it('maps a page of rows into the domain shape', () => {
      vendorBillSdkStub.listVendorBills.mockReturnValueOnce(
        of({
          content: [
            { billId: 'b1', vendorId: 'v1', amount: 100, dueDate: '2026-02-01', status: 'MATCH_EXCEPTION' },
          ],
          number: 0,
          size: 25,
          totalElements: 1,
          totalPages: 1,
        }),
      );

      let result: unknown;
      service.listBills('2026-01-01', '2026-02-01').subscribe(value => (result = value));

      expect(result).toEqual({
        items: [{ billId: 'b1', vendorId: 'v1', amount: 100, dueDate: '2026-02-01', status: 'MATCH_EXCEPTION' }],
        page: 0,
        size: 25,
        totalElements: 1,
        totalPages: 1,
      });
    });
  });

  describe('getBillById()', () => {
    it('maps a full vendor bill response into the domain shape', () => {
      vendorBillSdkStub.getVendorBillById.mockReturnValueOnce(
        of(vendorBillResponse({
          vendorName: 'Acme',
          billDate: '2026-01-15',
          dueDate: '2026-02-01',
          status: VendorBillResponseStatusEnum.Approved,
        })),
      );

      let result: unknown;
      service.getBillById('b1').subscribe(value => (result = value));

      expect(vendorBillSdkStub.getVendorBillById).toHaveBeenCalledWith('b1');
      expect(result).toEqual({
        billId: 'b1',
        vendorId: 'v1',
        vendorName: 'Acme',
        billNumber: 'BN-1',
        billDate: '2026-01-15',
        dueDate: '2026-02-01',
        totalAmount: 100,
        status: 'APPROVED',
        approvalJustification: null,
        rejectionReason: null,
        journalEntryId: null,
        paymentTransactionId: null,
        originEventId: null,
        originEventType: null,
        createdAt: '2026-01-15T00:00:00Z',
        createdBy: null,
      });
    });

    it('reads the approval justification from the nested approval block (S12)', () => {
      vendorBillSdkStub.getVendorBillById.mockReturnValueOnce(
        of(vendorBillResponse({
          status: VendorBillResponseStatusEnum.Approved,
          approval: {
            approvalJustification: 'Freight agreed by phone',
            requiredTier: VendorBillApprovalRequiredTierEnum.Clerk,
          },
        })),
      );

      let result: { approvalJustification: string | null; rejectionReason: string | null } | undefined;
      service.getBillById('b1').subscribe(value => (result = value));

      expect(result?.approvalJustification).toBe('Freight agreed by phone');
      expect(result?.rejectionReason).toBeNull();
    });

    it('prefers rejection.reason over statusExplanation for the rejection reason (S12)', () => {
      vendorBillSdkStub.getVendorBillById.mockReturnValueOnce(
        of(vendorBillResponse({
          status: VendorBillResponseStatusEnum.Rejected,
          rejection: { reason: 'Not our order', rejectedAt: '2026-01-16T00:00:00Z', rejectedBy: 'clerk-1' },
          statusExplanation: 'ignored when a rejection is present',
        })),
      );

      let result: { rejectionReason: string | null } | undefined;
      service.getBillById('b1').subscribe(value => (result = value));

      expect(result?.rejectionReason).toBe('Not our order');
    });

    it('falls back to statusExplanation when there is no rejection block (S12)', () => {
      vendorBillSdkStub.getVendorBillById.mockReturnValueOnce(
        of(vendorBillResponse({
          status: VendorBillResponseStatusEnum.CurrencyHold,
          statusExplanation: 'Bill currency EUR differs from the books currency',
        })),
      );

      let result: { status: string; rejectionReason: string | null } | undefined;
      service.getBillById('b1').subscribe(value => (result = value));

      expect(result?.status).toBe('CURRENCY_HOLD');
      expect(result?.rejectionReason).toBe('Bill currency EUR differs from the books currency');
    });
  });

  describe('listMatchCandidates()', () => {
    it('calls the SDK with invoiceEventId and maps the response', () => {
      vendorBillSdkStub.listVendorBillMatchCandidates.mockReturnValueOnce(
        of([
          {
            candidateId: 'c1',
            invoiceEventId: 'ev1',
            vendorBillId: 'b1',
            matchScore: 88,
            resolved: false,
            selected: false,
          },
        ]),
      );

      let result: unknown;
      service.listMatchCandidates('ev1').subscribe(value => (result = value));

      expect(vendorBillSdkStub.listVendorBillMatchCandidates).toHaveBeenCalledWith('ev1');
      expect(result).toEqual([
        {
          candidateId: 'c1',
          invoiceEventId: 'ev1',
          vendorBillId: 'b1',
          vendorId: null,
          billNumber: null,
          billTotalAmount: null,
          matchScore: 88,
          scoreBreakdown: null,
          resolved: false,
          selected: false,
          createdAt: null,
        },
      ]);
    });
  });

  describe('resolveException()', () => {
    it('calls the SDK with the action and reason, and no operatorId (S12)', () => {
      vendorBillSdkStub.resolveVendorBillMatchException.mockReturnValueOnce(
        of(vendorBillResponse({
          status: VendorBillResponseStatusEnum.Approved,
        })),
      );

      service.resolveException('b1', { resolutionAction: 'ACCEPT', reason: 'Confirmed with vendor' }).subscribe();

      expect(vendorBillSdkStub.resolveVendorBillMatchException).toHaveBeenCalledWith('b1', {
        resolutionAction: 'ACCEPT',
        reason: 'Confirmed with vendor',
      });
    });
  });

  describe('selectMatchCandidate()', () => {
    it('calls the SDK with the candidate id only, sending no request body (S12)', () => {
      vendorBillSdkStub.selectVendorBillMatchCandidate.mockReturnValueOnce(
        of(vendorBillResponse({
          status: VendorBillResponseStatusEnum.AwaitingApproval,
        })),
      );

      let result: { status: string } | undefined;
      service.selectMatchCandidate('c1').subscribe(value => (result = value));

      expect(vendorBillSdkStub.selectVendorBillMatchCandidate).toHaveBeenCalledWith('c1');
      expect(result?.status).toBe('AWAITING_APPROVAL');
    });
  });
});
