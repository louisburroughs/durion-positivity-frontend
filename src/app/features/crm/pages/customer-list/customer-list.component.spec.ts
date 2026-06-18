import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CustomerListComponent } from './customer-list.component';
import { CrmService } from '../../services/crm.service';

const crmServiceStub = {
  browseParties: vi.fn(),
  searchParties: vi.fn(),
};

const party = (id: string) => ({ partyId: id, legalName: id });
const partyPage = (parties: ReturnType<typeof party>[], totalCount: number) => ({
  parties,
  totalCount,
  pageNumber: 0,
  pageSize: 25,
});

describe('CustomerListComponent', () => {
  let fixture: ComponentFixture<CustomerListComponent>;
  let component: CustomerListComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    crmServiceStub.browseParties.mockReturnValue(of(partyPage([], 0)));

    await TestBed.configureTestingModule({
      imports: [CustomerListComponent],
      providers: [
        provideRouter([]),
        { provide: CrmService, useValue: crmServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('loads the first page via the browse API on init with default sort', () => {
    fixture.detectChanges();

    expect(crmServiceStub.browseParties).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, sortField: 'name', sortOrder: 'asc' }),
    );
    expect(component.state()).toBe('empty');
  });

  it('renders customer number, phone and status columns from the browse rows', () => {
    crmServiceStub.browseParties.mockReturnValue(of(partyPage([{
      partyId: 'p1',
      legalName: 'Acme Corp',
      customerNumber: 'CUST-000123',
      status: 'ACTIVE',
      primaryContact: { name: 'Jane Doe', email: 'jane@acme.com', phone: '+1-555-0142' },
    } as ReturnType<typeof party>], 1)));

    fixture.detectChanges();

    const text = fixture.debugElement.query(By.css('.party-table tbody')).nativeElement.textContent;
    expect(text).toContain('CUST-000123');
    expect(text).toContain('+1-555-0142');
    expect(text).toContain('ACTIVE');
    const headers = fixture.debugElement.queryAll(By.css('.party-table thead th'))
      .map(h => h.nativeElement.textContent.replace(/[↑↓↕]/g, '').trim());
    expect(headers).toEqual(expect.arrayContaining(['Customer #', 'Phone', 'Status']));
  });

  it('renders em-dash fallbacks when customer number, phone and status are absent', () => {
    crmServiceStub.browseParties.mockReturnValue(of(partyPage([party('p2')], 1)));

    fixture.detectChanges();

    const cells = fixture.debugElement.queryAll(By.css('.party-table tbody td'));
    const empties = cells.filter(c => c.query(By.css('.party-row__empty')));
    expect(empties.length).toBeGreaterThanOrEqual(3);
  });

  it('debounces filter changes and requests a filtered first page', async () => {
    fixture.detectChanges();
    crmServiceStub.browseParties.mockClear();

    component.filterForm.patchValue({ name: 'acme', status: 'ACTIVE', partyType: 'ORGANIZATION', customerNumber: 'CUST-1' });
    await new Promise(r => setTimeout(r, 400));

    expect(crmServiceStub.browseParties).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 0, name: 'acme', status: 'ACTIVE', partyType: 'ORGANIZATION', customerNumber: 'CUST-1',
      }),
    );
  });

  it('toggles sort field/direction and re-queries server-side', () => {
    fixture.detectChanges();
    crmServiceStub.browseParties.mockClear();

    component.sort('customerNumber');
    expect(component.sortField()).toBe('customerNumber');
    expect(component.sortDir()).toBe('asc');
    expect(crmServiceStub.browseParties).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortField: 'customerNumber', sortOrder: 'asc', page: 0 }),
    );

    component.sort('customerNumber');
    expect(component.sortDir()).toBe('desc');
    expect(crmServiceStub.browseParties).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortField: 'customerNumber', sortOrder: 'desc' }),
    );
  });

  it('pages forward/back and requests the right page; bounds are guarded', () => {
    crmServiceStub.browseParties.mockReturnValue(of(partyPage([party('a')], 60))); // 60/25 -> 3 pages
    fixture.detectChanges();
    expect(component.totalPages()).toBe(3);
    expect(component.canPrevPage()).toBe(false);
    expect(component.canNextPage()).toBe(true);

    component.nextPage();
    expect(component.pageIndex()).toBe(1);
    expect(crmServiceStub.browseParties).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));

    crmServiceStub.browseParties.mockClear();
    component.prevPage();
    expect(component.pageIndex()).toBe(0);
    component.prevPage(); // already first page -> no-op
    expect(crmServiceStub.browseParties).toHaveBeenCalledTimes(1);
  });

  it('resets to page 0 when filters change after paging', async () => {
    crmServiceStub.browseParties.mockReturnValue(of(partyPage([party('a')], 60)));
    fixture.detectChanges();
    component.nextPage();
    expect(component.pageIndex()).toBe(1);

    component.filterForm.patchValue({ name: 'x' });
    await new Promise(r => setTimeout(r, 400));
    expect(component.pageIndex()).toBe(0);
  });

  it('surfaces error state when the browse API fails', () => {
    crmServiceStub.browseParties.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    fixture.detectChanges();
    expect(component.state()).toBe('error');
  });

  it('surfaces access-denied on 403', () => {
    crmServiceStub.browseParties.mockReturnValueOnce(throwError(() => ({ status: 403 })));
    fixture.detectChanges();
    expect(component.state()).toBe('access-denied');
  });

  it('clearFilters resets the filter form', () => {
    fixture.detectChanges();
    component.filterForm.patchValue({ name: 'acme', status: 'ACTIVE' });
    component.clearFilters();
    expect(component.filterForm.getRawValue()).toEqual({ name: '', status: '', partyType: '', customerNumber: '' });
  });

  it('returns the primary contact supplied on the party summary', () => {
    const pc = { name: 'Jane Doe', email: 'jane@acme.com', phone: '555-1234' };
    const contact = component.primaryContact({ partyId: 'p1', legalName: 'Acme', primaryContact: pc });
    expect(contact).toEqual(pc);
  });

  it('returns undefined when the party has no primary contact', () => {
    expect(component.primaryContact({ partyId: 'p1', legalName: 'Acme' })).toBeUndefined();
    expect(
      component.primaryContact({ partyId: 'p2', legalName: 'Beta', primaryContact: { email: 'x@y.com' } }),
    ).toBeUndefined();
  });
});
