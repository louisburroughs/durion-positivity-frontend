import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { VendorInvoicesListPageComponent } from './vendor-invoices-list-page.component';
import { PayablesService } from '../../../services/payables.service';

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

  it('openBill() navigates to the detail route', async () => {
    mockService.listBills.mockReturnValueOnce(
      of({ items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }),
    );
    await setup();

    component.openBill({ billId: 'b1', vendorId: 'v1', amount: 100, dueDate: null, status: 'APPROVED' });

    expect(router.navigate).toHaveBeenCalledWith(['/app/accounting/payables/vendor-invoices', 'b1']);
  });
});
