import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { VendorInvoiceDetailPageComponent } from './vendor-invoice-detail-page.component';
import { PayablesService } from '../../../services/payables.service';

describe('VendorInvoiceDetailPageComponent', () => {
  const mockService = {
    getBillById: vi.fn(),
    resolveException: vi.fn(),
  };

  const billFixture = {
    billId: 'b1',
    vendorId: 'v1',
    vendorName: 'Acme',
    billNumber: 'BN-1',
    billDate: '2026-01-01',
    dueDate: '2026-02-01',
    totalAmount: 100,
    status: 'MATCH_EXCEPTION',
    approvalJustification: null,
    rejectionReason: null,
    journalEntryId: null,
    paymentTransactionId: null,
    originEventId: null,
    originEventType: null,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: null,
  };

  async function setup(billId: string | null = 'b1') {
    await TestBed.configureTestingModule({
      imports: [VendorInvoiceDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PayablesService, useValue: mockService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(billId ? { billId } : {}) } },
        },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(VendorInvoiceDetailPageComponent);
    return { fixture, component: fixture.componentInstance, router };
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets state to error when the billId route param is missing', async () => {
    const { component } = await setup(null);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ACCOUNTING.PAYABLES.DETAIL.ERROR.MISSING_BILL_ID');
    expect(mockService.getBillById).not.toHaveBeenCalled();
  });

  it('loads the bill by id on construction', async () => {
    mockService.getBillById.mockReturnValueOnce(of(billFixture));

    const { component } = await setup('b1');

    expect(mockService.getBillById).toHaveBeenCalledWith('b1');
    expect(component.state()).toBe('ready');
    expect(component.bill()).toEqual(billFixture);
  });

  it('sets state to error before errorKey on load failure (ADR-0031)', async () => {
    mockService.getBillById.mockReturnValueOnce(throwError(() => new Error('boom')));

    const { component } = await setup('b1');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ACCOUNTING.PAYABLES.DETAIL.ERROR.LOAD');
  });

  it('renders a bare due-date on the correct calendar day regardless of host timezone (ADR-0038)', async () => {
    mockService.getBillById.mockReturnValueOnce(of({ ...billFixture, dueDate: '2026-08-20' }));

    const { component } = await setup('b1');

    const prepared = component.dateOnlyFor(component.bill()!.dueDate);
    expect(prepared).toBe('2026-08-20T00:00:00');
    expect(new Date(prepared!).getDate()).toBe(20);
  });

  describe('resolveException()', () => {
    it('does not submit without a reason', async () => {
      mockService.getBillById.mockReturnValueOnce(of(billFixture));
      const { component } = await setup('b1');

      component.resolveException('ACCEPT', '  ');

      expect(mockService.resolveException).not.toHaveBeenCalled();
      expect(component.resolveErrorKey()).toBe(
        'ACCOUNTING.PAYABLES.EXCEPTIONS.RESOLVE.ERROR.REASON_REQUIRED',
      );
    });

    it('calls the service and refreshes the bill on success', async () => {
      mockService.getBillById.mockReturnValueOnce(of(billFixture));
      const { component } = await setup('b1');
      const resolved = { ...billFixture, status: 'APPROVED' };
      mockService.resolveException.mockReturnValueOnce(of(resolved));

      component.resolveException('ACCEPT', 'Confirmed with vendor');

      expect(mockService.resolveException).toHaveBeenCalledWith('b1', {
        resolutionAction: 'ACCEPT',
        reason: 'Confirmed with vendor',
      });
      expect(component.bill()).toEqual(resolved);
    });

    it('sets resolveErrorKey on failure', async () => {
      mockService.getBillById.mockReturnValueOnce(of(billFixture));
      const { component } = await setup('b1');
      mockService.resolveException.mockReturnValueOnce(throwError(() => new Error('fail')));

      component.resolveException('VOID', 'Duplicate');

      expect(component.resolveErrorKey()).toBe('ACCOUNTING.PAYABLES.EXCEPTIONS.RESOLVE.ERROR.SUBMIT');
    });

    it('clears resolving and sets resolveErrorKey when the service errors on a missing operator claim (ADR-0031), without throwing synchronously', async () => {
      mockService.getBillById.mockReturnValueOnce(of(billFixture));
      const { component } = await setup('b1');
      mockService.resolveException.mockReturnValueOnce(throwError(() => new Error('no operator')));

      expect(() => component.resolveException('VOID', 'Duplicate')).not.toThrow();

      expect(component.resolving()).toBe(false);
      expect(component.resolveErrorKey()).toBe('ACCOUNTING.PAYABLES.EXCEPTIONS.RESOLVE.ERROR.SUBMIT');
    });
  });

  it('goBack() navigates to the vendor-invoices list', async () => {
    mockService.getBillById.mockReturnValueOnce(of(billFixture));
    const { component, router } = await setup('b1');

    component.goBack();

    expect(router.navigate).toHaveBeenCalledWith(['/app/accounting/payables/vendor-invoices']);
  });
});
