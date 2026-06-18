import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { of, throwError, Subject } from 'rxjs';
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
    crmServiceStub.searchParties.mockReturnValue(of({ parties: [] }));

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
    const headers = fixture.debugElement.queryAll(By.css('.party-table thead th')).map(h => h.nativeElement.textContent.trim());
    expect(headers).toEqual(expect.arrayContaining(['Customer #', 'Phone', 'Status']));
  });

  it('renders em-dash fallbacks when customer number, phone and status are absent', () => {
    crmServiceStub.browseParties.mockReturnValue(of(partyPage([party('p2')], 1)));

    fixture.detectChanges();

    const cells = fixture.debugElement.queryAll(By.css('.party-table tbody td'));
    const empties = cells.filter(c => c.query(By.css('.party-row__empty')));
    // customer number, phone and status cells all fall back to —
    expect(empties.length).toBeGreaterThanOrEqual(3);
  });

  it('calls browse API on initial empty query to load customers', () => {
    fixture.detectChanges();

    expect(crmServiceStub.browseParties).toHaveBeenCalled();
    expect(crmServiceStub.searchParties).not.toHaveBeenCalled();
    expect(component.state()).toBe('empty');
    expect(component.error()).toBeNull();
  });

  it('calls search API with trimmed query when searching', () => {
    component.search('  acme  ');

    expect(crmServiceStub.searchParties).toHaveBeenCalledWith('acme');
    expect(crmServiceStub.browseParties).not.toHaveBeenCalled();
  });

  it('returns to browse mode when the query is cleared', () => {
    component.search('acme');
    component.search('   ');

    expect(crmServiceStub.searchParties).toHaveBeenCalledWith('acme');
    expect(crmServiceStub.browseParties).toHaveBeenCalledTimes(1);
  });

  it('surfaces error state when API search fails', () => {
    crmServiceStub.searchParties.mockReturnValueOnce(throwError(() => ({ status: 500 })));

    component.search('acme');

    expect(component.state()).toBe('error');
    expect(component.error()).toBe('Search failed.');
  });

  it('accumulates browse pages across loadMore and stops at the last page', () => {
    crmServiceStub.browseParties
      .mockReturnValueOnce(of(partyPage([party('a'), party('b')], 3)))
      .mockReturnValueOnce(of(partyPage([party('c')], 3)));

    fixture.detectChanges(); // ngOnInit -> first browse page
    expect(component.parties().length).toBe(2);
    expect(component.totalCount()).toBe(3);
    expect(component.hasMore()).toBe(true);

    component.loadMore();
    expect(component.parties().map(p => p.partyId)).toEqual(['a', 'b', 'c']);
    expect(component.hasMore()).toBe(false);

    crmServiceStub.browseParties.mockClear();
    component.loadMore(); // no more pages -> guarded
    expect(crmServiceStub.browseParties).not.toHaveBeenCalled();
  });

  it('does not load browse pages while in search mode', () => {
    fixture.detectChanges();
    component.search('acme'); // searching = true
    crmServiceStub.browseParties.mockClear();

    component.loadMore();

    expect(crmServiceStub.browseParties).not.toHaveBeenCalled();
  });

  it('discards a browse page that resolves after a newer search', () => {
    const pending = new Subject<unknown>();
    crmServiceStub.browseParties.mockReturnValueOnce(pending.asObservable());

    fixture.detectChanges(); // first browse page in flight (unresolved)

    crmServiceStub.searchParties.mockReturnValueOnce(of({ parties: [party('search-hit')] }));
    component.search('acme'); // new generation; search results applied

    // stale browse page now resolves — must be ignored, not appended
    pending.next(partyPage([party('stale')], 99));
    pending.complete();

    expect(component.parties().map(p => p.partyId)).toEqual(['search-hit']);
    expect(component.totalCount()).toBe(0);
    expect(component.state()).toBe('ready');
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
