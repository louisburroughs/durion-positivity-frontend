import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { of, Subject, throwError } from 'rxjs';
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
      imports: [CustomerListComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: CrmService, useValue: crmServiceStub },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

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

    const text = fixture.debugElement.query(By.css('.data-table tbody')).nativeElement.textContent;
    expect(text).toContain('CUST-000123');
    expect(text).toContain('+1-555-0142');
    expect(text).toContain(enUS.CRM.CUSTOMER_LIST.STATUS.ACTIVE);
    const headers = fixture.debugElement.queryAll(By.css('.data-table thead th'))
      .map(h => h.nativeElement.textContent.replace(/[↑↓↕]/g, '').trim());
    expect(headers).toEqual(expect.arrayContaining(['Customer #', 'Phone', 'Status']));
  });

  it('links each row name to its party detail page, carrying the customer number', () => {
    crmServiceStub.browseParties.mockReturnValue(of(partyPage([{
      partyId: 'p1', legalName: 'Acme Corp', customerNumber: 'CUST-000123',
    } as ReturnType<typeof party>], 1)));
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const rowNavigate = vi.spyOn(router, 'navigate');

    fixture.detectChanges();
    const link = fixture.debugElement.query(By.css('.data-table tbody a.row-name'));

    expect(link.nativeElement.getAttribute('href')).toBe('/app/crm/party/p1');
    expect(link.nativeElement.textContent.trim()).toBe('Acme Corp');
    // Label in Name (WCAG 2.5.3): the accessible name is the visible text, not an override.
    expect(link.nativeElement.hasAttribute('aria-label')).toBe(false);

    link.nativeElement.click();
    // The row click must not navigate a second time on top of the link: the link
    // goes through navigateByUrl, the row handler through navigate.
    expect(rowNavigate).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][1]).toEqual(expect.objectContaining({ state: { customerNumber: 'CUST-000123' } }));
  });

  it('renders status as a badge coloured by status, and an unlisted status as sent', () => {
    const rows = ['ACTIVE', 'PENDING', 'SUSPENDED', 'INACTIVE', 'ARCHIVED']
      .map((status, i) => ({ ...party(`p${i}`), status }));
    crmServiceStub.browseParties.mockReturnValue(of(partyPage(rows, rows.length)));

    fixture.detectChanges();

    const badges = fixture.debugElement.queryAll(By.css('.data-table tbody .badge'))
      .map(b => ({ text: b.nativeElement.textContent.trim(), cls: b.nativeElement.className }));
    expect(badges).toEqual([
      { text: enUS.CRM.CUSTOMER_LIST.STATUS.ACTIVE, cls: expect.stringContaining('badge--success') },
      { text: enUS.CRM.CUSTOMER_LIST.STATUS.PENDING, cls: expect.stringContaining('badge--warning') },
      { text: enUS.CRM.CUSTOMER_LIST.STATUS.SUSPENDED, cls: expect.stringContaining('badge--error') },
      { text: enUS.CRM.CUSTOMER_LIST.STATUS.INACTIVE, cls: expect.stringContaining('badge--neutral') },
      { text: 'ARCHIVED', cls: expect.stringContaining('badge--neutral') },
    ]);
  });

  it('labels every filter with visible text', () => {
    fixture.detectChanges();

    const labels = enUS.CRM.CUSTOMER_LIST;
    for (const [id, text] of [
      ['filter-name', labels.FILTER_NAME_LABEL],
      ['filter-customer-number', labels.FILTER_CUSTOMER_NUMBER_LABEL],
      ['filter-status', labels.FILTER_STATUS_LABEL],
      ['filter-party-type', labels.FILTER_PARTY_TYPE_LABEL],
    ]) {
      const label = fixture.debugElement.query(By.css(`label[for="${id}"]`)).nativeElement as HTMLElement;
      expect(label.classList.contains('sr-only')).toBe(false);
      expect(label.textContent?.trim()).toBe(text);
    }
  });

  it('renders a captioned table, underlined row links and a header that stays in view', () => {
    const many = Array.from({ length: 40 }, (_, i) => party(`p${i}`));
    crmServiceStub.browseParties.mockReturnValue(of(partyPage(many, many.length)));

    fixture.detectChanges();

    // The table is named by a caption, not an aria-label (DataTable contract).
    const table = fixture.debugElement.query(By.css('table.data-table')).nativeElement as HTMLTableElement;
    expect(table.caption?.textContent?.trim()).toBe(enUS.CRM.CUSTOMER_LIST.TABLE_ARIA);
    expect(table.hasAttribute('aria-label')).toBe(false);

    // shared/styles/data-table.css: the link keeps its underline because colour alone
    // (--link-color against body text) is under 3:1 (WCAG 1.4.1).
    const link = fixture.debugElement.query(By.css('.data-table tbody a.row-name')).nativeElement as HTMLElement;
    expect(getComputedStyle(link).textDecorationLine).toBe('underline');

    // .table-wrap--scroll is bounded, so a long list scrolls inside it rather than
    // growing with the page; once it scrolls, the header keeps its place at the top.
    const wrap = fixture.debugElement.query(By.css('.table-wrap--scroll')).nativeElement as HTMLElement;
    expect(wrap.scrollHeight).toBeGreaterThan(wrap.clientHeight);
    const header = wrap.querySelector('thead th') as HTMLElement;
    const headerOffset = () => Math.round(header.getBoundingClientRect().top - wrap.getBoundingClientRect().top);
    const before = headerOffset();
    wrap.scrollTop = 300;
    expect(wrap.scrollTop).toBeGreaterThan(0);
    expect(headerOffset()).toBe(before);
  });

  it('still opens the party when the row is clicked outside the link', () => {
    crmServiceStub.browseParties.mockReturnValue(of(partyPage([party('p1')], 1)));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture.detectChanges();
    fixture.debugElement.query(By.css('.party-row .party-row__vehicles')).nativeElement.click();

    expect(navigate).toHaveBeenCalledWith(['/app/crm/party', 'p1'], { state: { customerNumber: undefined } });
  });

  it('renders em-dash fallbacks when customer number, phone and status are absent', () => {
    crmServiceStub.browseParties.mockReturnValue(of(partyPage([party('p2')], 1)));

    fixture.detectChanges();

    const cells = fixture.debugElement.queryAll(By.css('.data-table tbody td'));
    const empties = cells.filter(c => c.query(By.css('.party-row__empty')));
    expect(empties.length).toBeGreaterThanOrEqual(3);
  });

  it('debounces filter changes and requests a filtered first page', async () => {
    fixture.detectChanges();
    crmServiceStub.browseParties.mockClear();

    component.filterForm.patchValue({ name: 'acme', status: 'ACTIVE', partyType: 'COMMERCIAL', customerNumber: 'CUST-1' });
    await new Promise(r => setTimeout(r, 400));

    expect(crmServiceStub.browseParties).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 0, name: 'acme', status: 'ACTIVE', partyType: 'COMMERCIAL', customerNumber: 'CUST-1',
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

  it('retries the page that failed, not the first page', () => {
    const firstPage = Array.from({ length: 25 }, (_, i) => party(`p${i}`));
    crmServiceStub.browseParties.mockReturnValue(of(partyPage(firstPage, 50)));
    fixture.detectChanges();

    crmServiceStub.browseParties.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    component.nextPage();
    fixture.detectChanges();
    expect(component.state()).toBe('error');

    fixture.debugElement.query(By.css('[data-testid="retry"]')).nativeElement.click();

    expect(crmServiceStub.browseParties).toHaveBeenCalledTimes(3);
    expect(crmServiceStub.browseParties).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    expect(component.state()).toBe('ready');
  });

  it('moves focus to the results region when Retry is removed by the read it starts', async () => {
    crmServiceStub.browseParties.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    fixture.detectChanges();
    const retry = fixture.debugElement.query(By.css('[data-testid="retry"]')).nativeElement as HTMLButtonElement;
    retry.focus();
    expect(document.activeElement).toBe(retry);

    crmServiceStub.browseParties.mockReturnValueOnce(new Subject());
    retry.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.debugElement.query(By.css('[data-testid="retry"]'))).toBeNull();
    const results = fixture.debugElement.query(By.css('#search-results')).nativeElement as HTMLElement;
    expect(document.activeElement).toBe(results);
    // Focus lands while the region holds only skeleton rows, so the region itself carries the name.
    expect(results.tagName).toBe('SECTION');
    expect(results.getAttribute('aria-label')).toBe(enUS.CRM.CUSTOMER_LIST.RESULTS_ARIA);
  });

  describe('when a sort or pager button is removed by the read it starts', () => {
    const results = () => fixture.debugElement.query(By.css('#search-results')).nativeElement as HTMLElement;

    beforeEach(() => {
      const firstPage = Array.from({ length: 25 }, (_, i) => party(`p${i}`));
      crmServiceStub.browseParties.mockReturnValue(of(partyPage(firstPage, 50)));
      fixture.detectChanges();
      crmServiceStub.browseParties.mockReturnValue(new Subject());
    });

    it('moves focus from a sort button to the results region', async () => {
      const sortBtn = fixture.debugElement.query(By.css('.sort-btn')).nativeElement as HTMLButtonElement;
      sortBtn.focus();

      sortBtn.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.debugElement.query(By.css('.sort-btn'))).toBeNull();
      expect(document.activeElement).toBe(results());
    });

    it('moves focus from the Next button to the results region', async () => {
      const next = fixture.debugElement.query(By.css('[data-testid="page-next"]')).nativeElement as HTMLButtonElement;
      next.focus();

      next.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.debugElement.query(By.css('[data-testid="page-next"]'))).toBeNull();
      expect(document.activeElement).toBe(results());
    });
  });

  it('leaves focus in the filters when a filter change reloads the results', async () => {
    fixture.detectChanges();
    const name = fixture.debugElement.query(By.css('#filter-name')).nativeElement as HTMLInputElement;
    name.focus();

    component.filterForm.patchValue({ name: 'acme' });
    await new Promise(r => setTimeout(r, 400));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(name);
  });

  it('announces loading and empty results through a status region that stays mounted', () => {
    const pending = new Subject<ReturnType<typeof partyPage>>();
    crmServiceStub.browseParties.mockReturnValueOnce(pending);
    fixture.detectChanges();

    const status = () => fixture.debugElement.query(By.css('[data-testid="results-status"]')).nativeElement as HTMLElement;
    const region = status();
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    // Outside the aria-busy results region, which some screen readers keep silent.
    expect(region.closest('#search-results')).toBeNull();
    expect(region.textContent?.trim()).toBe(enUS.CRM.CUSTOMER_LIST.LOADING);

    pending.next(partyPage([], 0));
    fixture.detectChanges();

    expect(status()).toBe(region);
    expect(region.textContent?.trim()).toBe(enUS.CRM.CUSTOMER_LIST.EMPTY);
  });

  it('surfaces access-denied on 403', () => {
    crmServiceStub.browseParties.mockReturnValueOnce(throwError(() => ({ status: 403 })));
    fixture.detectChanges();
    expect(component.state()).toBe('access-denied');

    // An alert with the permission message and no Retry: re-reading cannot grant access.
    const alert = fixture.debugElement.query(By.css('.error-banner[role="alert"]')).nativeElement as HTMLElement;
    expect(alert.textContent).toContain(enUS.CRM.CUSTOMER_LIST.FORBIDDEN);
    expect(fixture.debugElement.query(By.css('[data-testid="retry"]'))).toBeNull();
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
