import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { toIsoDate, VendorInvoicesListPageComponent } from './vendor-invoices-list-page.component';
import { PayablesService } from '../../../services/payables.service';
import { addCalendarDays } from '../../../utils/date-window.util';

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

describe('VendorInvoicesListPageComponent', () => {
  let fixture: ComponentFixture<VendorInvoicesListPageComponent>;
  let component: VendorInvoicesListPageComponent;
  let router: Router;

  const mockService = {
    listBills: vi.fn(),
  };

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [VendorInvoicesListPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: PayablesService, useValue: mockService }],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(VendorInvoicesListPageComponent);
    component = fixture.componentInstance;
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads page 0 on construction with the default due-date window', async () => {
    mockService.listBills.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );

    await setup();

    expect(mockService.listBills).toHaveBeenCalledWith(
      component.dueFrom(),
      component.dueTo(),
      undefined,
      0,
      25,
    );
  });

  it('defaults dueFrom/dueTo to a -30/+60 calendar-day window computed with the shared date-window helper', async () => {
    mockService.listBills.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );

    await setup();

    const today = new Date();
    expect(component.dueFrom()).toBe(toIsoDate(addCalendarDays(today, -30)));
    expect(component.dueTo()).toBe(toIsoDate(addCalendarDays(today, 60)));
  });

  it('transitions to empty when no bills are in the window', async () => {
    mockService.listBills.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );

    await setup();

    expect(component.state()).toBe('empty');
  });

  it('transitions to ready with items', async () => {
    mockService.listBills.mockReturnValueOnce(
      of({
        items: [{ billId: 'b1', vendorId: 'v1', amount: 100, dueDate: '2026-02-01', status: 'APPROVED' }],
        page: 0,
        size: 25,
        totalElements: 1,
        totalPages: 1,
      }),
    );

    await setup();

    expect(component.state()).toBe('ready');
    expect(component.items()).toHaveLength(1);
  });

  it('sets state to error before errorKey on failure (ADR-0031)', async () => {
    mockService.listBills.mockReturnValueOnce(throwError(() => new Error('boom')));

    await setup();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ACCOUNTING.PAYABLES.LIST.ERROR.LOAD');
  });

  it('applyFilters() reloads at page 0 with the current status filter', async () => {
    mockService.listBills.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );
    await setup();
    component.statusFilter.set('MATCH_EXCEPTION');
    mockService.listBills.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );

    component.applyFilters();

    expect(mockService.listBills).toHaveBeenLastCalledWith(
      component.dueFrom(),
      component.dueTo(),
      'MATCH_EXCEPTION',
      0,
      25,
    );
  });

  it('renders a bare due-date on the correct calendar day regardless of host timezone (ADR-0038)', async () => {
    mockService.listBills.mockReturnValueOnce(
      of({
        items: [{ billId: 'b1', vendorId: 'v1', amount: 100, dueDate: '2026-08-20', status: 'APPROVED' }],
        page: 0,
        size: 25,
        totalElements: 1,
        totalPages: 1,
      }),
    );

    await setup();

    const prepared = component.dateOnlyFor(component.items()[0].dueDate);
    expect(prepared).toBe('2026-08-20T00:00:00');
    expect(new Date(prepared!).getDate()).toBe(20);
  });

  it('openBill() navigates to the detail route', async () => {
    mockService.listBills.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );
    await setup();

    component.openBill({ billId: 'b1', vendorId: 'v1', amount: 100, dueDate: null, status: 'APPROVED' });

    expect(router.navigate).toHaveBeenCalledWith(['/app/accounting/payables/vendor-invoices', 'b1']);
  });
});
