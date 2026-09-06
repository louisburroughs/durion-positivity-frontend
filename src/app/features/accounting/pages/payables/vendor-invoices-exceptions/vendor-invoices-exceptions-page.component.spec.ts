import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { toIsoDate, VendorInvoicesExceptionsPageComponent } from './vendor-invoices-exceptions-page.component';
import { PayablesService } from '../../../services/payables.service';

describe('toIsoDate', () => {
  /**
   * ADR-0038 rejects `toISOString().slice(0, 10)`: it reads the UTC date, which
   * disagrees with the local calendar date for the evening hours in any UTC-N
   * zone. A Date-like whose local getters and `toISOString()` deliberately
   * disagree makes the distinction observable regardless of the machine's TZ.
   */
  it('reads the local calendar date, not the UTC date, for 23:30 local in a UTC-7 zone', () => {
    const lateEveningLocal = {
      getFullYear: () => 2026,
      getMonth: () => 8, // September (0-indexed)
      getDate: () => 5,
      toISOString: () => '2026-09-06T06:30:00.000Z', // 23:30 local Sep 5 == 06:30 UTC Sep 6
    } as unknown as Date;

    expect(toIsoDate(lateEveningLocal)).toBe('2026-09-05');
  });

  it('zero-pads month and day', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });
});

describe('VendorInvoicesExceptionsPageComponent', () => {
  let fixture: ComponentFixture<VendorInvoicesExceptionsPageComponent>;
  let component: VendorInvoicesExceptionsPageComponent;

  const mockService = {
    listBills: vi.fn(),
    resolveException: vi.fn(),
    listMatchCandidates: vi.fn(),
    selectMatchCandidate: vi.fn(),
  };

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [VendorInvoicesExceptionsPageComponent, TranslateModule.forRoot()],
      providers: [{ provide: PayablesService, useValue: mockService }],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorInvoicesExceptionsPageComponent);
    component = fixture.componentInstance;
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads page 0 filtered to MATCH_EXCEPTION on construction', async () => {
    mockService.listBills.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );

    await setup();

    expect(mockService.listBills).toHaveBeenCalledWith(
      component.dueFrom(),
      component.dueTo(),
      'MATCH_EXCEPTION',
      0,
      25,
    );
  });

  it('transitions to empty when there are no exceptions', async () => {
    mockService.listBills.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );

    await setup();

    expect(component.state()).toBe('empty');
  });

  it('sets state to error before errorKey on load failure (ADR-0031)', async () => {
    mockService.listBills.mockReturnValueOnce(throwError(() => new Error('boom')));

    await setup();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ACCOUNTING.PAYABLES.EXCEPTIONS.ERROR.LOAD');
  });

  describe('resolveException()', () => {
    beforeEach(async () => {
      mockService.listBills.mockReturnValueOnce(
        of({
          items: [{ billId: 'b1', vendorId: 'v1', amount: 50, dueDate: null, status: 'MATCH_EXCEPTION' }],
          page: 0,
          size: 25,
          totalElements: 1,
          totalPages: 1,
        }),
      );
      await setup();
    });

    it('does not submit without a reason', () => {
      component.resolveException('b1', 'ACCEPT', '   ');

      expect(mockService.resolveException).not.toHaveBeenCalled();
      expect(component.resolveErrorKey()).toBe(
        'ACCOUNTING.PAYABLES.EXCEPTIONS.RESOLVE.ERROR.REASON_REQUIRED',
      );
    });

    it('calls the service and removes the row on success', () => {
      mockService.resolveException.mockReturnValueOnce(
        of({ billId: 'b1', status: 'APPROVED' }),
      );

      component.resolveException('b1', 'ACCEPT', 'Confirmed');

      expect(mockService.resolveException).toHaveBeenCalledWith('b1', {
        resolutionAction: 'ACCEPT',
        reason: 'Confirmed',
      });
      expect(component.items()).toEqual([]);
      expect(component.state()).toBe('empty');
    });

    it('sets resolveErrorKey on failure without touching the item list', () => {
      mockService.resolveException.mockReturnValueOnce(throwError(() => new Error('fail')));

      component.resolveException('b1', 'VOID', 'Duplicate');

      expect(component.resolveErrorKey()).toBe('ACCOUNTING.PAYABLES.EXCEPTIONS.RESOLVE.ERROR.SUBMIT');
      expect(component.items()).toHaveLength(1);
    });
  });

  describe('lookupCandidates()', () => {
    beforeEach(async () => {
      mockService.listBills.mockReturnValueOnce(
        of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
      );
      await setup();
    });

    it('does nothing for a blank invoiceEventId', () => {
      component.lookupCandidates('   ');

      expect(mockService.listMatchCandidates).not.toHaveBeenCalled();
    });

    it('transitions to empty when there are no candidates', () => {
      mockService.listMatchCandidates.mockReturnValueOnce(of([]));

      component.lookupCandidates('ev-1');

      expect(mockService.listMatchCandidates).toHaveBeenCalledWith('ev-1');
      expect(component.candidatesState()).toBe('empty');
    });

    it('sets candidatesState to error before candidatesErrorKey on failure (ADR-0031)', () => {
      mockService.listMatchCandidates.mockReturnValueOnce(throwError(() => new Error('boom')));

      component.lookupCandidates('ev-1');

      expect(component.candidatesState()).toBe('error');
      expect(component.candidatesErrorKey()).toBe(
        'ACCOUNTING.PAYABLES.EXCEPTIONS.CANDIDATES.ERROR.LOAD',
      );
    });

    it('populates candidates on success', () => {
      const candidate = {
        candidateId: 'c1',
        invoiceEventId: 'ev-1',
        vendorBillId: 'b1',
        vendorId: null,
        billNumber: null,
        billTotalAmount: null,
        matchScore: 90,
        scoreBreakdown: null,
        resolved: false,
        selected: false,
        createdAt: null,
      };
      mockService.listMatchCandidates.mockReturnValueOnce(of([candidate]));

      component.lookupCandidates('ev-1');

      expect(component.candidatesState()).toBe('ready');
      expect(component.candidates()).toEqual([candidate]);
    });
  });

  describe('selectCandidate()', () => {
    const candidate = {
      candidateId: 'c1',
      invoiceEventId: 'ev-1',
      vendorBillId: 'b1',
      vendorId: null,
      billNumber: null,
      billTotalAmount: null,
      matchScore: 90,
      scoreBreakdown: null,
      resolved: false,
      selected: false,
      createdAt: null,
    };

    beforeEach(async () => {
      mockService.listBills.mockReturnValueOnce(
        of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
      );
      await setup();
      mockService.listMatchCandidates.mockReturnValueOnce(of([candidate]));
      component.lookupCandidates('ev-1');
    });

    it('marks the candidate resolved and selected on success', () => {
      mockService.selectMatchCandidate.mockReturnValueOnce(of({ billId: 'b1', status: 'APPROVED' }));

      component.selectCandidate('c1');

      expect(mockService.selectMatchCandidate).toHaveBeenCalledWith('c1');
      expect(component.candidates()[0].resolved).toBe(true);
      expect(component.candidates()[0].selected).toBe(true);
    });

    it('sets selectErrorKey on failure without mutating the candidate', () => {
      mockService.selectMatchCandidate.mockReturnValueOnce(throwError(() => new Error('fail')));

      component.selectCandidate('c1');

      expect(component.selectErrorKey()).toBe('ACCOUNTING.PAYABLES.EXCEPTIONS.CANDIDATES.ERROR.SELECT');
      expect(component.candidates()[0].resolved).toBe(false);
    });
  });
});
