import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AccountingPreferencesService } from '../../services/accounting-preferences.service';
import { BalanceSheetSummary, ExportJob, IncomeSummary } from '../../models/books.models';
import { BOOKS_CLOCK, BooksPageComponent, EXPORT_POLL_FIRST_MS, EXPORT_POLL_MAX_ATTEMPTS } from './books-page.component';
import { toIsoDate } from '../../utils/date-window.util';
import {
  ALL_BOOKS_PERMISSIONS,
  BooksMocks,
  MONTH_START_ISO,
  NOW,
  PREVIOUS_END_ISO,
  PREVIOUS_START_ISO,
  TODAY_ISO,
  balanceSheet,
  configureBooks,
  createBooksMocks,
  customerRow,
  drillAccount,
  entriesPage,
  incomeSummary,
  journalEntry,
  ledgerSection,
  pending,
  previousPeriod,
  receivablesReport,
} from './books-page.spec-helper';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('BooksPageComponent', () => {
  let mocks: BooksMocks;
  let fixture: ComponentFixture<BooksPageComponent>;
  let component: BooksPageComponent;
  let host: HTMLElement;

  const CLAIMS: JwtClaims = { sub: 'controller.lee', tid: 'tenant-a', exp: 4102444800 };
  const tenant = signal<string | null>('tenant-a');

  function render(): void {
    configureBooks(mocks, { tenantId: tenant });
    fixture = TestBed.createComponent(BooksPageComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    fixture.detectChanges();
  }

  const q = (selector: string): HTMLElement | null => host.querySelector<HTMLElement>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => q(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const click = (selector: string): void => {
    q(selector)!.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    localStorage.clear();
    mocks = createBooksMocks();
    mocks.claims.set(CLAIMS);
    tenant.set('tenant-a');
  });

  afterEach(() => {
    vi.useRealTimers();
    host?.remove();
    localStorage.clear();
  });

  describe('Summary (AC 1, 2)', () => {
    it('lists the served lines under their sections with the served totals verbatim, reading once (AC 1, P7)', () => {
      render();

      expect(mocks.books.balanceSheet).toHaveBeenCalledTimes(1);
      expect(mocks.books.balanceSheet).toHaveBeenCalledWith(TODAY_ISO);
      expect(mocks.books.incomeStatement).toHaveBeenCalledWith(MONTH_START_ISO, TODAY_ISO);
      const own = qa('[data-testid="section-own"] [data-testid="summary-line"]').map(el => el.dataset['code']);
      const owe = qa('[data-testid="section-owe"] [data-testid="summary-line"]').map(el => el.dataset['code']);
      const yours = qa('[data-testid="section-yours"] [data-testid="summary-line"]').map(el => el.dataset['code']);
      expect(own).toEqual(['BS_IN_THE_BANK', 'BS_WAITING_TO_BE_DEPOSITED', 'BS_CUSTOMERS_OWE_YOU']);
      expect(owe).toEqual(['BS_BILLS_FROM_VENDORS']);
      expect(yours).toEqual(['BS_PROFIT_NOT_YET_CLOSED']);
      expect(text('[data-testid="total-own"]')).toContain('$44,841.00');
      expect(text('[data-testid="total-owe"]')).toContain('$9,300.00');
      expect(text('[data-testid="total-yours"]')).toContain('$35,541.00');
      expect(text('[data-testid="net-income"]')).toBe('$5,000.00');
      expect(text('[data-testid="total-revenue"]')).toBe('$12,000.00');
    });

    it('renders the served totals even when they are not the sum of the lines: the component adds nothing (P7)', () => {
      mocks.books.balanceSheet.mockReturnValue(of(balanceSheet({ totalAssets: 1.23 })));
      render();

      expect(text('[data-testid="total-own"]')).toContain('$1.23');
    });

    it('puts a code nobody documented under Other, with its code shown only with terms on — never dropped', () => {
      mocks.books.balanceSheet.mockReturnValue(
        of(balanceSheet({ lines: [{ code: 'BS_IN_THE_BANK', amount: 10 }, { code: 'REVENUE', amount: 99 }] })),
      );
      render();

      const other = qa('[data-testid="section-other"] [data-testid="summary-line"]');
      expect(other.map(el => el.dataset['code'])).toEqual(['REVENUE']);
      expect(other[0].textContent).toContain('ACCOUNTING.BOOKS.SUMMARY.LINE.UNLISTED');
      expect(other[0].textContent).not.toContain('REVENUE');

      TestBed.inject(AccountingPreferencesService).setShowTerms(true);
      fixture.detectChanges();
      expect(other[0].textContent).toContain('REVENUE');
    });

    it('reads "Your summary isn\'t set up yet", not zero amounts, for an empty lineItems (AC 2)', () => {
      mocks.books.balanceSheet.mockReturnValue(of(balanceSheet({ lines: [], totalAssets: 0 })));
      render();

      expect(q('[data-testid="summary-not-set-up"]')?.textContent).toContain('ACCOUNTING.BOOKS.SUMMARY.NOT_SET_UP');
      expect(q('[data-testid="total-own"]')).toBeNull();
      expect(host.textContent).not.toContain('$0.00');
    });

    it('says the books do not balance only for an explicit balanced: false', () => {
      mocks.books.balanceSheet.mockReturnValue(of(balanceSheet({ balanced: false })));
      render();
      expect(q('[data-testid="summary-unbalanced"]')?.getAttribute('role')).toBe('alert');
    });

    it('keeps the balance sheet when the income statement fails (a failed read never blanks another)', () => {
      mocks.books.incomeStatement.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      render();

      expect(qa('[data-testid="section-own"] [data-testid="summary-line"]').length).toBeGreaterThan(0);
      expect(q('[data-testid="income-error"]')).not.toBeNull();
      expect(component.state()).toBe('ready');
    });

    it('keeps the income statement when the balance sheet fails with 500 (ADR-0064 §1)', () => {
      mocks.books.balanceSheet.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      render();

      expect(q('[data-testid="summary-error"]')).not.toBeNull();
      expect(text('[data-testid="net-income"]')).toBe('$5,000.00');
      expect(qa('[data-testid="section-income"] [data-testid="summary-line"]').length).toBe(2);
      expect(component.state()).toBe('ready');
    });

    it('shows the income statement while the balance sheet is still pending', () => {
      mocks.books.balanceSheet.mockReturnValue(pending<BalanceSheetSummary>());
      render();

      expect(q('[data-testid="balance-state"] [role="status"]')).not.toBeNull();
      expect(text('[data-testid="net-income"]')).toBe('$5,000.00');
    });

    it('renders an em dash, never $0.00, for a total the response omitted (ADR-0064 §4)', () => {
      mocks.books.balanceSheet.mockReturnValue(of(balanceSheet({ totalAssets: null })));
      mocks.books.incomeStatement.mockReturnValue(of(incomeSummary({ netIncome: null })));
      render();

      expect(text('[data-testid="total-own"] strong')).toBe('COMMON.EMPTY_VALUE');
      expect(text('[data-testid="net-income"]')).toBe('COMMON.EMPTY_VALUE');
      expect(host.textContent).not.toContain('$0.00');
    });

    it('names the permission, not a connection problem, when the summary read is refused (ADR-0064 §6)', () => {
      mocks.books.balanceSheet.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      mocks.books.incomeStatement.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      render();

      expect(q('[data-testid="region-denied"]')).not.toBeNull();
      expect(q('[data-testid="page-error"]')).toBeNull();
    });

    it('shows the page error with Retry only when every read of the tab failed for a connection reason', () => {
      mocks.books.balanceSheet.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      mocks.books.incomeStatement.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      render();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('ACCOUNTING.BOOKS.ERROR.LOAD');
      mocks.books.balanceSheet.mockReturnValue(of(balanceSheet()));
      mocks.books.incomeStatement.mockReturnValue(of(incomeSummary()));
      click('[data-testid="page-error"] button');
      expect(component.state()).toBe('ready');
      expect(qa('[data-testid="summary-line"]').length).toBeGreaterThan(0);
    });
  });

  describe('Drill-down (AC 3, 4)', () => {
    it('opens the accounts from drilldownToAccounts and, with one account, its entries from generateGeneralLedger (AC 3)', () => {
      render();
      click('[data-code="BS_BILLS_FROM_VENDORS"]');

      expect(mocks.books.drilldown).toHaveBeenCalledWith('BS_BILLS_FROM_VENDORS', MONTH_START_ISO, TODAY_ISO);
      expect(mocks.books.accountLedger).toHaveBeenCalledWith(MONTH_START_ISO, TODAY_ISO, 'acc-2000');
      expect(text('[data-testid="ledger-row"] [data-testid="entry-link"]')).toBe('JE-202610-7');
      expect(text('[data-testid="cell-balance"]')).toBe('$9,300.00');
    });

    it('lists several accounts and opens the one chosen; reversed and correcting entries both appear (AC 3)', () => {
      mocks.books.drilldown.mockReturnValue(
        of([drillAccount(), drillAccount({ accountId: 'acc-2010', accountCode: '2010', accountName: 'Accrued bills' })]),
      );
      mocks.books.accountLedger.mockReturnValue(
        of({
          accountId: 'acc-2010',
          section: ledgerSection({
            accountId: 'acc-2010',
            lines: [
              { ...ledgerSection().lines[0], journalEntryId: 'je-131', entryNumber: 'JE-202610-131' },
              {
                ...ledgerSection().lines[0],
                journalEntryId: 'je-140',
                entryNumber: 'JE-202610-140',
                direction: 'DECREASE',
                debitAmount: 500,
                creditAmount: null,
                description: 'REVERSAL of 0f8fad5b-d9cb-469f-a165-70867728950e - Reason: recorded twice',
              },
            ],
          }),
        }),
      );
      render();
      click('[data-code="BS_BILLS_FROM_VENDORS"]');
      expect(mocks.books.accountLedger).not.toHaveBeenCalled();

      click('[data-testid="drill-account"]:nth-of-type(1)');
      qa('[data-testid="drill-account"]')[1].click();
      fixture.detectChanges();

      const numbers = qa('[data-testid="entry-link"]').map(el => el.textContent?.trim());
      expect(numbers).toEqual(['JE-202610-140', 'JE-202610-131']);
      expect(text('[data-testid="ledger-row"] [data-testid="what-happened"]')).toBe(
        'ACCOUNTING.BOOKS.CORRECTION_DESCRIPTION',
      );
      expect(host.textContent).not.toMatch(UUID);
    });

    it('shows a CREDIT-normal increase under Went up with the served normal-side balance, and "(credit)" with terms on (AC 4)', () => {
      render();
      click('[data-code="BS_BILLS_FROM_VENDORS"]');

      expect(text('[data-testid="heading-up"]')).toBe('ACCOUNTING.BOOKS.LEDGER.WENT_UP');
      expect(text('[data-testid="cell-up"]')).toBe('$500.00');
      expect(text('[data-testid="cell-down"]')).toBe('');
      expect(text('[data-testid="cell-balance"]')).toBe('$9,300.00');

      TestBed.inject(AccountingPreferencesService).setShowTerms(true);
      fixture.detectChanges();
      expect(text('[data-testid="heading-up"]')).toBe(
        'ACCOUNTING.BOOKS.LEDGER.WENT_UP (ACCOUNTING.BOOKS.LEDGER.TERM_CREDIT)',
      );
      expect(text('[data-testid="heading-down"]')).toBe(
        'ACCOUNTING.BOOKS.LEDGER.WENT_DOWN (ACCOUNTING.BOOKS.LEDGER.TERM_DEBIT)',
      );
    });

    it('reads Debit and Credit with the served signed balance when no direction is served (AC 4)', () => {
      mocks.books.accountLedger.mockReturnValue(
        of({
          accountId: 'acc-2000',
          section: ledgerSection({
            normalSide: null,
            lines: [{ ...ledgerSection().lines[0], direction: null, normalRunningBalance: null }],
          }),
        }),
      );
      render();
      click('[data-code="BS_BILLS_FROM_VENDORS"]');

      expect(text('[data-testid="heading-up"]')).toBe('ACCOUNTING.BOOKS.LEDGER.DEBIT');
      expect(text('[data-testid="heading-down"]')).toBe('ACCOUNTING.BOOKS.LEDGER.CREDIT');
      expect(text('[data-testid="cell-down"]')).toBe('$500.00');
      expect(text('[data-testid="cell-balance"]')).toBe('-$9,300.00');
    });

    it('stops showing an account\'s entries once a re-read is refused with 403 (ADR-0064 §6)', () => {
      mocks.books.drilldown.mockReturnValue(
        of([drillAccount(), drillAccount({ accountId: 'acc-2010', accountCode: '2010', accountName: 'Accrued bills' })]),
      );
      render();
      click('[data-code="BS_BILLS_FROM_VENDORS"]');
      click('[data-testid="drill-account"]');
      expect(text('[data-testid="ledger-row"] [data-testid="entry-link"]')).toBe('JE-202610-7');

      mocks.books.accountLedger.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      click('[data-testid="drill-account"]');

      expect(qa('[data-testid="ledger-row"]')).toEqual([]);
      expect(host.textContent).not.toContain('JE-202610-7');
      expect(text('[data-testid="ledger-denied"]')).toBe('ACCOUNTING.BOOKS.REGION.DENIED');
    });

    it('moves focus to the drill-down heading when a line is chosen, and back to the summary when it closes', async () => {
      render();
      click('[data-code="BS_BILLS_FROM_VENDORS"]');
      await fixture.whenStable();
      expect(document.activeElement?.id).toBe('drill-heading');

      click('[data-testid="drill-close"]');
      await fixture.whenStable();
      expect(document.activeElement?.id).toBe('summary-heading');
    });
  });

  describe('Who owes what (AC 5, 6)', () => {
    it('shows served names and references, makes no customer-service call, and sorts by served total (AC 5)', () => {
      mocks.queryParams.next({ tab: 'owed' });
      mocks.books.agedReceivables.mockReturnValue(
        of(
          receivablesReport([
            customerRow(),
            customerRow({ customerId: 'cust-2', customerName: 'Bayside Taxi', customerReference: 'C-2001', totalOutstanding: 5000 }),
          ]),
        ),
      );
      render();

      expect(mocks.books.agedReceivables).toHaveBeenCalledWith(TODAY_ISO);
      const names = qa('[data-testid="customer-name"]').map(el => el.textContent?.trim());
      expect(names).toEqual(['Bayside Taxi', 'Harbor Fleet Services']);
      expect(text('[data-testid="customer-row"]')).toContain('C-2001');
      expect(q('[data-testid="customers-table"] caption')).not.toBeNull();
      expect(qa('[data-testid="customers-table"] thead th').every(th => th.getAttribute('scope') === 'col')).toBe(true);
    });

    it('reads "Name not available" for a null name and never shows the customer id (AC 5, P8)', () => {
      mocks.queryParams.next({ tab: 'owed' });
      mocks.books.agedReceivables.mockReturnValue(
        of(
          receivablesReport([
            customerRow({ customerId: '0f8fad5b-d9cb-469f-a165-70867728950e', customerName: null, customerReference: null }),
          ]),
        ),
      );
      render();

      expect(text('[data-testid="customer-name"]')).toBe('ACCOUNTING.BOOKS.NAME_NOT_AVAILABLE');
      expect(host.textContent).not.toMatch(UUID);
      const labelled = qa('[aria-label]').map(el => el.getAttribute('aria-label') ?? '');
      expect(labelled.some(label => UUID.test(label))).toBe(false);
    });

    it("states that a past month's amounts are today's balances aged as at its end (AC 6)", () => {
      mocks.queryParams.next({ tab: 'owed' });
      render();
      expect(q('[data-testid="owed-past-note"]')).toBeNull();

      component.selectPeriod(previousPeriod.periodCode);
      fixture.detectChanges();

      expect(mocks.books.agedReceivables).toHaveBeenLastCalledWith(PREVIOUS_END_ISO);
      expect(q('[data-testid="owed-past-note"]')?.textContent).toContain('ACCOUNTING.BOOKS.OWED.PAST_NOTE');
    });
  });

  describe('All entries (AC 7)', () => {
    beforeEach(() => mocks.queryParams.next({ tab: 'entries' }));

    it('calls listJournalEntries with the exact entry number typed (AC 7)', async () => {
      render();
      await fixture.whenStable();
      expect(mocks.books.listJournalEntries).toHaveBeenCalledWith(0, undefined);

      const input = q('[data-testid="entry-search"]') as HTMLInputElement;
      input.value = ' JE-202610-131 ';
      input.dispatchEvent(new Event('input'));
      click('[data-testid="entry-search-submit"]');
      await fixture.whenStable();

      expect(component.entryNumber()).toBe('JE-202610-131');
      expect(mocks.books.listJournalEntries).toHaveBeenLastCalledWith(0, 'JE-202610-131');
    });

    it('labels a correcting entry Correction with "Correction of an earlier entry", never its stored description (AC 7)', () => {
      mocks.books.listJournalEntries.mockReturnValue(
        of(
          entriesPage([
            journalEntry({
              journalEntryId: 'je-140',
              entryNumber: 'JE-202610-140',
              reversalJournalEntryId: 'je-131',
              description: 'REVERSAL of 0f8fad5b-d9cb-469f-a165-70867728950e - Reason: recorded twice',
            }),
            journalEntry({ status: 'REVERSED', reversedByJournalEntryId: 'je-140' }),
            journalEntry({ journalEntryId: 'je-9', entryNumber: null, status: 'DRAFT' }),
            journalEntry({ journalEntryId: 'je-8', entryNumber: 'JE-202610-8', status: 'UNKNOWN' }),
          ]),
        ),
      );
      render();

      const statuses = qa('[data-testid="entry-status"]').map(el => el.textContent?.trim());
      expect(statuses).toEqual([
        'ACCOUNTING.BOOKS.STATUS.CORRECTION',
        'ACCOUNTING.BOOKS.STATUS.REVERSED',
        'ACCOUNTING.BOOKS.STATUS.NOT_RECORDED',
        'ACCOUNTING.BOOKS.STATUS.UNKNOWN',
      ]);
      expect(text('[data-testid="entry-row"] [data-testid="what-happened"]')).toBe(
        'ACCOUNTING.BOOKS.CORRECTION_DESCRIPTION',
      );
      expect(host.textContent).not.toMatch(UUID);
    });

    it('pages with the served totals and keeps focus on the list heading, not <body>', async () => {
      mocks.books.listJournalEntries.mockReturnValue(of(entriesPage([journalEntry()], 3)));
      render();
      expect(q('[data-testid="page-previous"]')?.getAttribute('aria-disabled')).toBe('true');

      click('[data-testid="page-next"]');
      await fixture.whenStable();
      expect(mocks.books.listJournalEntries).toHaveBeenLastCalledWith(1, undefined);
      expect(document.activeElement?.id).toBe('entries-heading');
    });

    it('returns focus to the search box when Show all entries removes itself', async () => {
      render();
      component.searchText.set('JE-202610-131');
      component.search();
      fixture.detectChanges();

      click('[data-testid="entry-search-clear"]');
      await fixture.whenStable();
      expect(document.activeElement?.id).toBe('entry-search');
      expect(mocks.books.listJournalEntries).toHaveBeenLastCalledWith(0, undefined);
    });

    it('switches to the chosen account’s ledger lines for the period with the account filter', () => {
      render();
      expect(mocks.books.listGlAccounts).toHaveBeenCalledTimes(1);

      const select = q('[data-testid="account-filter"]') as HTMLSelectElement;
      select.value = 'acc-2000';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(mocks.books.accountLedger).toHaveBeenCalledWith(MONTH_START_ISO, TODAY_ISO, 'acc-2000');
      expect(q('app-ledger-table')).not.toBeNull();
    });

    it('stops showing the filtered account\'s lines once a re-read is refused with 403 (ADR-0064 §6)', () => {
      render();
      const select = q('[data-testid="account-filter"]') as HTMLSelectElement;
      select.value = 'acc-2000';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(qa('[data-testid="ledger-row"]').length).toBe(1);

      mocks.books.accountLedger.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      component.retryRegion('accountLedger');
      fixture.detectChanges();

      expect(qa('[data-testid="ledger-row"]')).toEqual([]);
      expect(host.textContent).not.toContain('JE-202610-7');
      expect(text('[data-testid="account-ledger-denied"]')).toBe('ACCOUNTING.BOOKS.REGION.DENIED');
    });

    it('empties the account filter once the chart of accounts is refused on a re-read', () => {
      render();
      expect(qa('[data-testid="account-filter"] option').length).toBe(3);

      mocks.books.listGlAccounts.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      component.retryRegion('glAccounts');
      fixture.detectChanges();

      expect(qa('[data-testid="account-filter"] option').length).toBe(1);
    });

    it('offers the account filter only with both accounting:coa:view and reporting:view:financial-statements', () => {
      mocks.held.set(['accounting:je:view', 'accounting:coa:view']);
      render();
      expect(q('[data-testid="account-filter"]')).toBeNull();
      expect(mocks.books.listGlAccounts).not.toHaveBeenCalled();
    });
  });

  describe('Access (AC 10)', () => {
    it('offers only All entries with accounting:je:view alone', () => {
      mocks.held.set(['accounting:je:view']);
      render();

      expect(qa('.books__tab').map(el => el.dataset['testid'])).toEqual(['tab-entries']);
      expect(mocks.books.balanceSheet).not.toHaveBeenCalled();
      expect(mocks.books.listJournalEntries).toHaveBeenCalled();
      expect(q('[data-testid="export-open"]')).toBeNull();
    });

    it('shows the empty-access state with accounting:coa:view alone, and reads nothing', () => {
      mocks.held.set(['accounting:coa:view']);
      render();

      expect(q('[data-testid="empty-access"]')).not.toBeNull();
      expect(qa('.books__tab')).toEqual([]);
      expect(mocks.books.balanceSheet).not.toHaveBeenCalled();
      expect(mocks.books.listJournalEntries).not.toHaveBeenCalled();
      expect(mocks.books.listGlAccounts).not.toHaveBeenCalled();
    });

    it('marks the active tab with aria-pressed and lands on the tab named in ?tab=', () => {
      mocks.queryParams.next({ tab: 'owed' });
      render();

      expect(q('[data-testid="tab-owed"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(q('[data-testid="tab-summary"]')?.getAttribute('aria-pressed')).toBe('false');
      expect(mocks.books.balanceSheet).not.toHaveBeenCalled();

      click('[data-testid="tab-summary"]');
      expect(q('[data-testid="tab-summary"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(mocks.books.balanceSheet).toHaveBeenCalledTimes(1);
    });

    it('falls back to the first permitted tab when ?tab= names one the session cannot read', () => {
      mocks.held.set(['accounting:je:view']);
      mocks.queryParams.next({ tab: 'summary' });
      render();
      expect(component.activeTab()).toBe('entries');
    });

    it('follows canAccess on a token without perm_bits: every tab is offered', () => {
      mocks.held.set(null);
      render();
      expect(qa('.books__tab').length).toBe(3);
    });
  });

  describe('Period select and races (AC 11)', () => {
    it('names each served month open or closed, and only the current month unlabelled without accounting:period:view', () => {
      render();
      const options = qa('[data-testid="period-select"] option').map(el => el.textContent?.trim() ?? '');
      expect(options).toHaveLength(2);
      expect(options[0]).toContain('ACCOUNTING.BOOKS.PERIOD.OPEN');
      expect(options[1]).toContain('ACCOUNTING.BOOKS.PERIOD.CLOSED');

      host.remove();
      TestBed.resetTestingModule();
      mocks = createBooksMocks(ALL_BOOKS_PERMISSIONS.filter(code => code !== 'accounting:period:view'));
      render();
      expect(mocks.periods.listPeriods).not.toHaveBeenCalled();
      const plain = qa('[data-testid="period-select"] option').map(el => el.textContent?.trim() ?? '');
      expect(plain).toEqual(['ACCOUNTING.BOOKS.PERIOD.PLAIN']);
    });

    it('never paints a late response for the old period after the period changes (AC 11, Subject-driven)', () => {
      const october = pending<BalanceSheetSummary>();
      const september = pending<BalanceSheetSummary>();
      mocks.books.balanceSheet.mockImplementation((asOf: string) => (asOf === TODAY_ISO ? october : september));
      mocks.books.incomeStatement.mockImplementation(() => pending<IncomeSummary>());
      render();

      component.selectPeriod(previousPeriod.periodCode);
      fixture.detectChanges();
      expect(mocks.books.balanceSheet).toHaveBeenLastCalledWith(PREVIOUS_END_ISO);
      expect(mocks.books.incomeStatement).toHaveBeenLastCalledWith(PREVIOUS_START_ISO, PREVIOUS_END_ISO);

      october.next(balanceSheet({ lines: [{ code: 'BS_IN_THE_BANK', amount: 111 }], totalAssets: 111 }));
      fixture.detectChanges();
      expect(qa('[data-testid="summary-line"]')).toEqual([]);
      expect(host.textContent).not.toContain('$111.00');

      september.next(balanceSheet({ asOfDate: PREVIOUS_END_ISO, lines: [{ code: 'BS_IN_THE_BANK', amount: 222 }] }));
      fixture.detectChanges();
      expect(text('[data-testid="summary-amount"]')).toBe('$222.00');
    });

    it("never shows the old period's figures under the new period while its read is pending (ADR-0063 §1)", () => {
      const september = pending<BalanceSheetSummary>();
      render();
      expect(qa('[data-testid="summary-line"]').length).toBeGreaterThan(0);

      mocks.books.balanceSheet.mockReturnValue(september);
      component.selectPeriod(previousPeriod.periodCode);
      fixture.detectChanges();

      // The income statement answered for September and may show; October's balance sheet must not.
      expect(qa('[data-testid="section-own"], [data-testid="section-owe"], [data-testid="section-yours"]')).toEqual([]);
      expect(host.textContent).not.toContain('$25,400.50');
    });

    it('rolls "today" over at local midnight without any interaction and re-reads as at the new day (ADR-0038 §6)', () => {
      vi.useFakeTimers();
      let now = new Date(NOW.getTime());
      configureBooks(mocks, { tenantId: tenant });
      TestBed.overrideProvider(BOOKS_CLOCK, { useValue: () => new Date(now.getTime()) });
      fixture = TestBed.createComponent(BooksPageComponent);
      component = fixture.componentInstance;
      host = fixture.nativeElement as HTMLElement;
      document.body.appendChild(host);
      fixture.detectChanges();
      expect(mocks.books.balanceSheet).toHaveBeenLastCalledWith(TODAY_ISO);

      const tomorrow = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1, 0, 0, 2);
      now = tomorrow;
      vi.advanceTimersByTime(tomorrow.getTime() - NOW.getTime());
      fixture.detectChanges();

      expect(component.range().asAt).toBe(toIsoDate(tomorrow));
      expect(mocks.books.balanceSheet).toHaveBeenLastCalledWith(toIsoDate(tomorrow));
    });

    it('clears everything and re-reads on a tid|sub change (ADR-0063 §7)', () => {
      const first = pending<BalanceSheetSummary>();
      mocks.books.balanceSheet.mockReturnValueOnce(first);
      render();
      component.selectPeriod(previousPeriod.periodCode);
      fixture.detectChanges();

      tenant.set('tenant-b');
      fixture.detectChanges();

      expect(component.selectedPeriodCode()).toBe(TODAY_ISO.slice(0, 7));
      expect(mocks.books.balanceSheet).toHaveBeenLastCalledWith(TODAY_ISO);
      first.next(balanceSheet({ lines: [{ code: 'BS_IN_THE_BANK', amount: 333 }] }));
      fixture.detectChanges();
      expect(host.textContent).not.toContain('$333.00');
    });
  });

  describe('Export for your accountant (AC 12)', () => {
    it('is hidden without accounting:report:export, and its handler refuses', () => {
      mocks.held.set(ALL_BOOKS_PERMISSIONS.filter(code => code !== 'accounting:report:export'));
      render();

      expect(q('[data-testid="export-open"]')).toBeNull();
      component.openExport();
      component.startExport();
      expect(component.exportOpen()).toBe(false);
      expect(mocks.books.requestExport).not.toHaveBeenCalled();
    });

    it('offers PDF and CSV only', () => {
      render();
      click('[data-testid="export-open"]');

      const formats = qa('[data-testid="export-format"]').map(el => (el as HTMLInputElement).value);
      expect(formats).toEqual(['PDF', 'CSV']);
      expect(q('dialog[data-testid="export-dialog"]')?.matches(':modal')).toBe(true);
    });

    it('requests the export for the period, polls with a growing interval until COMPLETED and downloads once', () => {
      vi.useFakeTimers();
      const statuses: ExportJob['status'][] = ['IN_PROGRESS', 'IN_PROGRESS', 'COMPLETED'];
      mocks.books.exportStatus.mockImplementation(() => of<ExportJob>({ exportId: 'exp-1', status: statuses.shift()! }));
      render();
      click('[data-testid="export-open"]');
      (qa('[data-testid="export-format"]')[1] as HTMLInputElement).click();
      click('[data-testid="export-start"]');

      expect(mocks.books.requestExport).toHaveBeenCalledWith('BALANCE_SHEET', 'CSV', MONTH_START_ISO, TODAY_ISO);
      vi.advanceTimersByTime(EXPORT_POLL_FIRST_MS);
      expect(mocks.books.exportStatus).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(EXPORT_POLL_FIRST_MS);
      expect(mocks.books.exportStatus).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(EXPORT_POLL_FIRST_MS);
      expect(mocks.books.exportStatus).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(EXPORT_POLL_FIRST_MS * 4);
      expect(mocks.books.exportStatus).toHaveBeenCalledTimes(3);
      vi.advanceTimersByTime(60_000);
      expect(mocks.books.exportStatus).toHaveBeenCalledTimes(3);

      expect(mocks.books.downloadExport).toHaveBeenCalledTimes(1);
      expect(mocks.books.downloadExport).toHaveBeenCalledWith(
        'exp-1',
        `books-balance-sheet-${MONTH_START_ISO}-${TODAY_ISO}.csv`,
      );
      fixture.detectChanges();
      expect(text('[data-testid="announcement"]')).toBe('ACCOUNTING.BOOKS.EXPORT.DONE');
    });

    it('stops polling when the dialog closes', () => {
      vi.useFakeTimers();
      mocks.books.exportStatus.mockReturnValue(of<ExportJob>({ exportId: 'exp-1', status: 'IN_PROGRESS' }));
      render();
      click('[data-testid="export-open"]');
      click('[data-testid="export-start"]');
      click('[data-testid="export-close"]');

      vi.advanceTimersByTime(60_000);
      expect(mocks.books.exportStatus).not.toHaveBeenCalled();
      expect(mocks.books.downloadExport).not.toHaveBeenCalled();
    });

    it('gives up after about two minutes of an unrecognised status and reads as failed', () => {
      vi.useFakeTimers();
      mocks.books.exportStatus.mockReturnValue(of<ExportJob>({ exportId: 'exp-1', status: 'UNKNOWN' }));
      render();
      click('[data-testid="export-open"]');
      click('[data-testid="export-start"]');

      vi.advanceTimersByTime(110_000);
      fixture.detectChanges();
      expect(component.exportPhase()).toBe('waiting');
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(mocks.books.exportStatus).toHaveBeenCalledTimes(EXPORT_POLL_MAX_ATTEMPTS);
      expect(text('[data-testid="export-failed"]')).toBe('ACCOUNTING.BOOKS.EXPORT.FAILED');
      vi.advanceTimersByTime(600_000);
      expect(mocks.books.exportStatus).toHaveBeenCalledTimes(EXPORT_POLL_MAX_ATTEMPTS);
      expect(mocks.books.downloadExport).not.toHaveBeenCalled();
    });

    it('announces a finished export once: in the page status region, not again inside the dialog', () => {
      render();
      click('[data-testid="export-open"]');
      mocks.books.requestExport.mockReturnValue(of<ExportJob>({ exportId: 'exp-1', status: 'COMPLETED' }));
      click('[data-testid="export-start"]');

      expect(text('[data-testid="announcement"]')).toBe('ACCOUNTING.BOOKS.EXPORT.DONE');
      expect(q('[data-testid="export-done"]')).not.toBeNull();
      expect(q('[data-testid="export-done"]')?.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    });

    it('shows a translated failure, never the server text, when the export fails', () => {
      mocks.books.requestExport.mockReturnValue(of<ExportJob>({ exportId: 'exp-1', status: 'FAILED' }));
      render();
      click('[data-testid="export-open"]');
      click('[data-testid="export-start"]');

      expect(text('[data-testid="export-failed"]')).toBe('ACCOUNTING.BOOKS.EXPORT.FAILED');
      expect(mocks.books.downloadExport).not.toHaveBeenCalled();
    });
  });
});
