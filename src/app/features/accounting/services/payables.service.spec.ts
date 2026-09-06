import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { VendorBillAPIService } from '@durion-sdk/accounting';
import { PayablesService } from './payables.service';
import { AuthService } from '../../../core/services/auth.service';

describe('PayablesService', () => {
  let service: PayablesService;

  const vendorBillSdkStub = {
    listVendorBills: vi.fn(),
    getVendorBillById: vi.fn(),
    listVendorBillMatchCandidates: vi.fn(),
    resolveVendorBillMatchException: vi.fn(),
    selectVendorBillMatchCandidate: vi.fn(),
  };

  const authServiceStub = {
    currentUserClaims: vi.fn().mockReturnValue({ sub: 'operator-1', exp: 0 }),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PayablesService,
        { provide: VendorBillAPIService, useValue: vendorBillSdkStub },
        { provide: AuthService, useValue: authServiceStub },
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
        of({
          vendorBillId: 'b1',
          vendorId: 'v1',
          vendorName: 'Acme',
          billNumber: 'BN-1',
          billDate: '2026-01-15',
          dueDate: '2026-02-01',
          totalAmount: 100,
          status: 'APPROVED',
          createdAt: '2026-01-15T00:00:00Z',
        }),
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
    it('resolves the authenticated operator id and calls the SDK', () => {
      vendorBillSdkStub.resolveVendorBillMatchException.mockReturnValueOnce(
        of({
          vendorBillId: 'b1',
          vendorId: 'v1',
          billNumber: 'BN-1',
          totalAmount: 100,
          status: 'APPROVED',
          createdAt: '2026-01-15T00:00:00Z',
        }),
      );

      service.resolveException('b1', { resolutionAction: 'ACCEPT', reason: 'Confirmed with vendor' }).subscribe();

      expect(vendorBillSdkStub.resolveVendorBillMatchException).toHaveBeenCalledWith('b1', {
        resolutionAction: 'ACCEPT',
        reason: 'Confirmed with vendor',
        operatorId: 'operator-1',
      });
    });

    it('errors through the Observable, rather than sending a blank operatorId or throwing synchronously', () => {
      authServiceStub.currentUserClaims.mockReturnValueOnce(null);

      // Building the Observable must not throw synchronously (ADR-0031) —
      // a missing operator claim can only surface once subscribed, so a
      // caller's `subscribe({ error })` handler always runs.
      let observable!: ReturnType<typeof service.resolveException>;
      expect(() => {
        observable = service.resolveException('b1', { resolutionAction: 'VOID', reason: 'Duplicate' });
      }).not.toThrow();

      let caught: unknown;
      observable.subscribe({ error: err => (caught = err) });

      expect(caught).toBeInstanceOf(Error);
      expect(vendorBillSdkStub.resolveVendorBillMatchException).not.toHaveBeenCalled();
    });
  });

  describe('selectMatchCandidate()', () => {
    it('resolves the authenticated operator id and calls the SDK', () => {
      vendorBillSdkStub.selectVendorBillMatchCandidate.mockReturnValueOnce(
        of({
          vendorBillId: 'b1',
          vendorId: 'v1',
          billNumber: 'BN-1',
          totalAmount: 100,
          status: 'APPROVED',
          createdAt: '2026-01-15T00:00:00Z',
        }),
      );

      service.selectMatchCandidate('c1').subscribe();

      expect(vendorBillSdkStub.selectVendorBillMatchCandidate).toHaveBeenCalledWith('c1', {
        operatorId: 'operator-1',
      });
    });
  });
});
