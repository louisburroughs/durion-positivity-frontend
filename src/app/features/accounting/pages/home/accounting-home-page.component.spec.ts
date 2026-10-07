import { formatDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { throwError, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import { ACCOUNTING_LANDING_CONFIG } from '../landing/accounting-landing.config';
import { ReceivablesLane } from '../../models/accounting-home.models';
import { ApplyResult, OpenInvoicesList } from '../../models/customer-payments.models';
import { AccountingHomePageComponent } from './accounting-home-page.component';
import {
  ALL_HOME_PERMISSIONS,
  HomeMocks,
  NOW,
  TODAY_ISO,
  awaitingApproval,
  bankLine,
  configureHome,
  currentPeriod,
  createHomeMocks,
  page,
  payablesLane,
  payment,
  paymentsPage,
  pending,
  receivablesLane,
  review,
  submittedRow,
} from './accounting-home-page.spec-helper';

const CLERK = ['accounting:reconciliation:view', 'accounting:reconciliation:adjust'];

/** The open invoice the home's payment fixture is suggested against (CAP:550 S6). */
const openInvoice9: OpenInvoicesList = {
  items: [
    {
      invoiceId: 'inv-9',
      invoiceNumber: 'INV-2026-01702',
      documentDate: TODAY_ISO,
      dueDate: TODAY_ISO,
      overdue: false,
      balanceDue: 4615,
      currency: 'USD',
    },
  ],
  truncated: false,
};
const APPROVER = ['accounting:reconciliation:view', 'accounting:reconciliation:approve'];

describe('AccountingHomePageComponent', () => {
  let mocks: HomeMocks;
  let fixture: ComponentFixture<AccountingHomePageComponent>;
  let component: AccountingHomePageComponent;
  let host: HTMLElement;

  function render(): void {
    configureHome(mocks, { tenantId: tenant });
    fixture = TestBed.createComponent(AccountingHomePageComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    fixture.detectChanges();
  }

  const q = (selector: string): HTMLElement | null => host.querySelector<HTMLElement>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => q(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const CLAIMS: JwtClaims = { sub: 'controller.lee', tid: 'tenant-a', exp: 4102444800 };
  const tenant = signal<string | null>('tenant-a');

  beforeEach(() => {
    localStorage.clear();
    mocks = createHomeMocks();
    mocks.claims.set(CLAIMS);
    tenant.set('tenant-a');
  });

  afterEach(() => {
    host?.remove();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('gating (AC 1, §8.1)', () => {
    it('shows only the Bank lane to a session holding only accounting:reconciliation:view', () => {
      mocks.held.set(['accounting:reconciliation:view']);
      render();

      expect(q('[data-testid="lane-bank"]')).not.toBeNull();
      expect(q('[data-testid="lane-receivables"]')).toBeNull();
      expect(q('[data-testid="lane-payables"]')).toBeNull();
      expect(mocks.home.receivables).not.toHaveBeenCalled();
      expect(mocks.home.payables).not.toHaveBeenCalled();
      expect(mocks.home.paymentsToMatch).not.toHaveBeenCalled();
      expect(q('[data-testid="period-chip"]')).toBeNull();
    });

    it('shows no lane and no to-do list to a session holding only accounting:events:view', () => {
      mocks.held.set(['accounting:events:view']);
      render();

      expect(q('.lanes')).toBeNull();
      expect(q('[data-testid="todo"]')).toBeNull();
      expect(component.state()).toBe('ready');
    });

    it('reads every region for a token without perm_bits (canAccess fallback)', () => {
      mocks.held.set(null);
      render();

      expect(mocks.home.receivables).toHaveBeenCalledTimes(1);
      expect(mocks.home.checkupsAwaitingApproval).toHaveBeenCalledTimes(1);
      expect(mocks.home.unexplainedBankLines).toHaveBeenCalledTimes(1);
    });
  });

  describe('header', () => {
    it('shows the period containing today with its served status', () => {
      render();
      expect(mocks.periods.listPeriods).toHaveBeenCalledTimes(1);
      expect(text('[data-testid="period-chip"]')).toContain('ACCOUNTING.HOME.PERIOD_CHIP.OPEN');
    });

    it('claims neither open nor closed for a period whose status is unknown (ADR-0064 §4)', () => {
      mocks.periods.listPeriods.mockReturnValue(of([{ ...currentPeriod, status: 'UNKNOWN' }]));
      render();
      expect(text('[data-testid="period-chip"]')).toContain('ACCOUNTING.HOME.PERIOD_CHIP.UNKNOWN');
    });

    it('reads a CLOSED current period as closed', () => {
      mocks.periods.listPeriods.mockReturnValue(of([{ ...currentPeriod, status: 'CLOSED' }]));
      render();
      expect(text('[data-testid="period-chip"]')).toContain('ACCOUNTING.HOME.PERIOD_CHIP.CLOSED');
    });

    it('hides the period chip when the period read failed', () => {
      mocks.periods.listPeriods.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      render();
      expect(q('[data-testid="period-chip"]')).toBeNull();
    });

    it('opens and closes the Help guide with aria-expanded and aria-controls (AC 4)', () => {
      render();
      const button = q('[data-testid="help-toggle"]')!;
      const guide = q('[data-testid="help-guide"]')!;

      expect(button.getAttribute('aria-controls')).toBe(guide.id);
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(guide.hidden).toBe(true);

      button.click();
      fixture.detectChanges();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(guide.hidden).toBe(false);

      button.click();
      fixture.detectChanges();
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(guide.hidden).toBe(true);
    });

    it('lists the eight glossary words with the accountant’s term', () => {
      render();
      const terms = qa('.glossary dt');
      expect(terms.length).toBe(8);
      expect(terms.every(term => term.querySelector('.glossary__term'))).toBe(true);
    });

    it('offers the vendor-payment answer link only with accounting:ap:view', () => {
      render();
      expect(q('[data-testid="help-guide"] a[href="/app/accounting/vendor-payments"]')).toBeNull();

      host.remove();
      TestBed.resetTestingModule();
      mocks = createHomeMocks([...ALL_HOME_PERMISSIONS, 'accounting:ap:view']);
      mocks.claims.set(CLAIMS);
        render();
      expect(q('[data-testid="help-guide"] a[href="/app/accounting/vendor-payments"]')).not.toBeNull();
    });
  });

  describe('Start here (AC 3)', () => {
    it('stays hidden after a reload once dismissed', () => {
      render();
      expect(q('[data-testid="start-here"]')).not.toBeNull();

      q('[data-testid="dismiss-start-here"]')!.click();
      fixture.detectChanges();
      expect(q('[data-testid="start-here"]')).toBeNull();

      host.remove();
      TestBed.resetTestingModule();
      render();
      expect(q('[data-testid="start-here"]')).toBeNull();
    });

    it('moves focus to the to-do heading on dismiss', () => {
      render();
      q('[data-testid="dismiss-start-here"]')!.click();
      fixture.detectChanges();
      expect(document.activeElement?.id).toBe('todo-heading');
    });

    it('falls back to the h1 on dismiss when there is no to-do list, never to <body>', () => {
      mocks.held.set(['reporting:view:financial-statements']);
      render();
      expect(q('[data-testid="todo"]')).toBeNull();

      q('[data-testid="dismiss-start-here"]')!.click();
      fixture.detectChanges();
      expect(document.activeElement?.id).toBe('home-title');
    });

    it('opens the Help guide from the banner', () => {
      render();
      const open = qa('[data-testid="start-here"] button').find(b => b.textContent?.includes('OPEN_GUIDE'))!;
      open.click();
      fixture.detectChanges();
      expect(q('[data-testid="help-guide"]')!.hidden).toBe(false);
    });
  });

  describe('money lanes', () => {
    it('renders the served receivables totals verbatim from one read (AC 6)', () => {
      render();

      expect(mocks.home.receivables).toHaveBeenCalledTimes(1);
      expect(mocks.home.receivables).toHaveBeenCalledWith(TODAY_ISO);
      expect(text('[data-testid="receivables-total"]')).toBe('$18,240.50');
      expect(text('[data-testid="receivables-overdue"]')).toContain('$7,240.25');
      expect(text('[data-testid="receivables-not-yet-due"]')).toContain('$11,000.25');
      expect(text('[data-testid="receivables-1-30"]')).toContain('ACCOUNTING.HOME.LANES.RECEIVABLES.LATE_1_30');
      expect(text('[data-testid="payments-waiting"]')).toContain('ACCOUNTING.HOME.LANES.RECEIVABLES.PAYMENTS_WAITING');
    });

    it('offers "Who owes what" on Money owed, landing on that tab of Your books (CAP:550 S5)', () => {
      render();
      const link = q('[data-testid="lane-receivables"] [data-testid="who-owes-what"]');
      expect(link?.getAttribute('href')).toBe('/app/accounting/books?tab=owed');
      expect(link?.textContent?.trim()).toBe('ACCOUNTING.HOME.ACTION.WHO_OWES_WHAT');
    });

    it('offers "Match customer payments" on Money owed with accounting:payment:apply, and not without (CAP:550 S6)', () => {
      render();
      const link = q('[data-testid="lane-receivables"] [data-testid="match-customer-payments"]');
      expect(link?.getAttribute('href')).toBe('/app/accounting/payments');
      expect(link?.textContent?.trim()).toBe('ACCOUNTING.HOME.ACTION.MATCH_CUSTOMER_PAYMENTS');

      host.remove();
      TestBed.resetTestingModule();
      mocks.held.set(ALL_HOME_PERMISSIONS.filter(code => code !== 'accounting:payment:apply'));
      render();
      expect(q('[data-testid="match-customer-payments"]')).toBeNull();
    });

    it('does not offer "Who owes what" to a session that cannot read that tab (accounting:je:view alone)', () => {
      mocks.held.set(['accounting:je:view']);
      render();
      expect(q('[data-testid="who-owes-what"]')).toBeNull();
    });

    it('renders a served total that is not the sum of its buckets as served (no client addition)', () => {
      // A total the buckets do not add up to: the lane must show the server's figure.
      mocks.home.receivables.mockReturnValue(of<ReceivablesLane>({ ...receivablesLane, totalOutstanding: 99.99 }));
      render();
      expect(text('[data-testid="receivables-total"]')).toBe('$99.99');
    });

    it('renders approved bills split Overdue · Not due yet and the unapproved total apart (AC 7)', () => {
      render();

      expect(text('[data-testid="payables-total"]')).toBe('$9,300.00');
      expect(text('[data-testid="payables-overdue"]')).toContain('$3,000.00');
      expect(text('[data-testid="payables-not-yet-due"]')).toContain('$6,300.00');
      const unapproved = text('[data-testid="payables-unapproved"]');
      expect(unapproved).toContain('ACCOUNTING.HOME.LANES.PAYABLES.UNAPPROVED');
      expect(unapproved).toContain('$1,250.00');
      // Never added to the approved figures: $10,550.00 appears nowhere.
      expect(host.textContent).not.toContain('$10,550.00');
    });

    it('renders a SUBMITTED account with its served statement, frontier and count (AC 8)', () => {
      render();

      expect(mocks.home.bankCheckup).toHaveBeenCalledWith(`${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`);
      const row = q('.bank-row[data-account="1010"]')!;
      expect(row.querySelector('.bank-row__status')?.textContent).toContain(
        'ACCOUNTING.HOME.LANES.BANK.STATUS.SUBMITTED',
      );
      expect(row.textContent).toContain('$25,400.00');
      expect(row.querySelectorAll('dd')[3].textContent?.trim()).toBe('3');
      // The served dates, formatted (a COMMON.EMPTY_VALUE placeholder would not match).
      const mediumDate = (iso: string | null): string => formatDate(`${iso}T00:00:00`, 'mediumDate', 'en-US');
      expect(row.querySelectorAll('dd')[0].textContent?.trim()).toBe(mediumDate(submittedRow.statementEndDate));
      expect(row.querySelectorAll('dd')[2].textContent?.trim()).toBe(mediumDate(submittedRow.reconciledThrough));
    });

    it('gives every legend entry text and an amount, not colour alone (AC 15)', () => {
      render();
      const entries = qa('.legend li');
      expect(entries.length).toBe(4);
      for (const entry of entries) {
        expect(entry.textContent?.replace(/\s+/g, ' ').trim()).toMatch(/^ACCOUNTING\.HOME\.LANES\.(OVERDUE|NOT_YET_DUE) \$/);
      }
    });

    it('adds the accountant’s term to lane titles with Show accounting terms on', () => {
      localStorage.setItem(
        'durion.accounting.prefs:tenant-a:controller.lee',
        JSON.stringify({ showTerms: true, startHereDismissed: false }),
      );
      render();
      expect(text('#lane-bank-heading')).toContain('ACCOUNTING.HOME.LANES.BANK.TERM');
      expect(q('.bank-row .reference:last-child')?.textContent).toContain('1010');
    });
  });

  describe('loading and failures (ADR-0063, ADR-0064)', () => {
    it('shows only the Bills lane’s error with Retry when aged payables fail (AC 13)', () => {
      mocks.home.payables.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      render();

      expect(q('[data-testid="lane-payables"] [data-testid="region-error"]')).not.toBeNull();
      expect(q('[data-testid="lane-bank"] [data-testid="region-error"]')).toBeNull();
      expect(q('[data-testid="lane-receivables"] [data-testid="region-error"]')).toBeNull();
      expect(qa('[data-testid="region-error"]').length).toBe(1);
      expect(component.state()).toBe('ready');

      mocks.home.payables.mockReturnValue(of(payablesLane));
      (q('[data-testid="lane-payables"] [data-testid="region-error"] button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(q('[data-testid="region-error"]')).toBeNull();
      expect(text('[data-testid="payables-total"]')).toBe('$9,300.00');
    });

    it('keeps prior figures on a failed re-read and flips only the status', () => {
      render();
      mocks.home.receivables.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));

      component.refresh();
      fixture.detectChanges();

      expect(text('[data-testid="receivables-total"]')).toBe('$18,240.50');
      expect(text('[data-testid="lane-receivables"] [data-testid="region-error"]')).toContain(
        'ACCOUNTING.HOME.REGION.REFRESH_FAILED',
      );
      expect(component.receivables.status()).toBe('FAILED');
    });

    it('applies only the latest read when an older one lands late (ADR-0063 §1)', () => {
      const first = pending<ReceivablesLane>();
      const second = pending<ReceivablesLane>();
      mocks.home.receivables.mockReturnValueOnce(first).mockReturnValueOnce(second);
      render();
      component.refresh();

      second.next({ ...receivablesLane, totalOutstanding: 200 });
      first.next({ ...receivablesLane, totalOutstanding: 100 });
      fixture.detectChanges();

      expect(text('[data-testid="receivables-total"]')).toBe('$200.00');
    });

    it('stays loading until every permitted region answers, then is ready', () => {
      const late = pending<ReceivablesLane>();
      mocks.home.receivables.mockReturnValue(late);
      render();
      expect(component.state()).toBe('loading');

      late.next(receivablesLane);
      expect(component.state()).toBe('ready');
    });

    it('is in error with Retry only when every permitted region failed', () => {
      mocks.held.set(['reporting:view:financial-statements']);
      mocks.home.receivables.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      mocks.home.payables.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      render();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('ACCOUNTING.HOME.ERROR.ALL_FAILED');
      expect(q('[data-testid="page-error"]')).not.toBeNull();
    });

    it('does not blame the connection when every permitted read was refused with 403 (ADR-0064 §4, §6)', () => {
      mocks.held.set(['reporting:view:financial-statements']);
      mocks.home.receivables.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      mocks.home.payables.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      render();

      expect(component.state()).toBe('ready');
      expect(component.errorKey()).toBeNull();
      expect(q('[data-testid="page-error"]')).toBeNull();
      expect(qa('[data-testid="region-denied"]').length).toBe(2);
    });

    it('does not blame the connection when the failures mix a 403 with an outage', () => {
      mocks.held.set(['reporting:view:financial-statements']);
      mocks.home.receivables.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      mocks.home.payables.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
      render();

      expect(component.state()).toBe('ready');
      expect(q('[data-testid="lane-payables"] [data-testid="region-error"]')).not.toBeNull();
    });

    it('states the missing permission on a 403 and stops re-reading that region (ADR-0064 §6)', () => {
      mocks.home.payables.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      render();

      expect(text('[data-testid="lane-payables"] [data-testid="region-denied"]')).toContain(
        'ACCOUNTING.HOME.REGION.DENIED',
      );
      component.refresh();
      expect(mocks.home.payables).toHaveBeenCalledTimes(1);
      expect(mocks.home.receivables).toHaveBeenCalledTimes(2);
    });

    it('re-reads every permitted region from Refresh', () => {
      render();
      q('[data-testid="refresh"]')!.click();
      expect(mocks.home.receivables).toHaveBeenCalledTimes(2);
      expect(mocks.home.bankCheckup).toHaveBeenCalledTimes(2);
      expect(mocks.home.checkupsAwaitingApproval).toHaveBeenCalledTimes(2);
      expect(mocks.periods.listPeriods).toHaveBeenCalledTimes(2);
    });
  });

  describe('to-do list', () => {
    it('shows bank-line items only to a clerk-like session (AC 9)', () => {
      mocks.held.set(CLERK);
      render();

      expect(qa('.todo-item[data-kind="BANK_LINE"]').length).toBe(1);
      expect(qa('.todo-item[data-kind="APPROVAL"]').length).toBe(0);
      expect(mocks.home.checkupsAwaitingApproval).not.toHaveBeenCalled();
    });

    it('shows approval items only to an approver-like session (AC 9)', () => {
      mocks.held.set(APPROVER);
      render();

      expect(qa('.todo-item[data-kind="APPROVAL"]').length).toBe(1);
      expect(qa('.todo-item[data-kind="BANK_LINE"]').length).toBe(0);
      expect(mocks.home.unexplainedBankLines).not.toHaveBeenCalled();
    });

    it('counts All (3), Customer payments (2), Bank (1) with aria-pressed filters (AC 11)', () => {
      mocks.home.paymentsToMatch.mockReturnValue(of(paymentsPage([payment(), payment({ paymentId: 'pay-2' })])));
      mocks.home.checkupsAwaitingApproval.mockReturnValue(of(page([])));
      render();

      expect(component.counts()).toEqual({ ALL: 3, PAYMENTS: 2, BANK: 1 });
      const filters = qa('.filter-button');
      expect(filters.map(button => button.dataset['filter'])).toEqual(['ALL', 'PAYMENTS', 'BANK']);
      expect(filters.map(button => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);

      filters[1].click();
      fixture.detectChanges();
      expect(filters.map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
      expect(qa('.todo-item').length).toBe(2);
      expect(qa('.todo-item').every(item => item.dataset['kind'] === 'PAYMENT')).toBe(true);
    });

    it('says "You’re all caught up" when every source answered with nothing', () => {
      mocks.home.paymentsToMatch.mockReturnValue(of(paymentsPage([])));
      mocks.home.unexplainedBankLines.mockReturnValue(of(page([])));
      mocks.home.checkupsAwaitingApproval.mockReturnValue(of(page([])));
      render();

      expect(text('[data-testid="todo-empty"]')).toBe('ACCOUNTING.HOME.TODO.EMPTY');
    });

    it('does not claim "all caught up" when a source failed', () => {
      mocks.home.paymentsToMatch.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      mocks.home.unexplainedBankLines.mockReturnValue(of(page([])));
      mocks.home.checkupsAwaitingApproval.mockReturnValue(of(page([])));
      render();

      expect(q('[data-testid="todo-empty"]')).toBeNull();
      expect(q('[data-testid="todo-source-error"]')).not.toBeNull();
    });

    it('says how many more a capped source holds and links to its page', () => {
      mocks.home.unexplainedBankLines.mockReturnValue(of(page([bankLine()], 40)));
      render();
      expect(text('[data-testid="more-bank-lines"]')).toContain('ACCOUNTING.HOME.TODO.MORE.BANK_LINES');
      expect(q('[data-testid="more-bank-lines"] a')?.getAttribute('href')).toBe('/app/accounting/bank-accounts');
    });

    it('marks the chosen item with aria-pressed and opens its panel', () => {
      render();
      const item = q('.todo-item[data-kind="BANK_LINE"]')!;
      item.click();
      fixture.detectChanges();

      expect(item.getAttribute('aria-pressed')).toBe('true');
      expect(text('#todo-panel-heading')).toBe('ACCOUNTING.HOME.TODO.BANK_LINE.PANEL_TITLE');
      // The bank's own text renders as text: no element is created from it (ADR-0065).
      expect(q('[data-testid="bank-description"]')!.textContent).toContain('<img src=x onerror=alert(1)>');
      expect(q('[data-testid="bank-description"] img')).toBeNull();
    });

    it('moves focus to the panel when an item is chosen on a small screen (AC 12)', () => {
      vi.spyOn(window, 'matchMedia').mockImplementation(
        query => ({ matches: query === '(width <= 767px)', media: query }) as MediaQueryList,
      );
      render();

      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();

      expect(document.activeElement?.id).toBe('todo-panel-heading');
    });

    it('matches a payment in place: the detail panel embeds the match component and an apply re-reads the lanes (CAP:550 S6 AC 11)', () => {
      mocks.customerPayments.openInvoices.mockReturnValue(of(openInvoice9));
      render();
      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();

      expect(q('app-todo-detail-panel app-payment-match')).not.toBeNull();
      expect(mocks.customerPayments.openInvoices).toHaveBeenCalledWith('cust-1');
      const paymentsReads = mocks.home.paymentsToMatch.mock.calls.length;
      const receivablesReads = mocks.home.receivables.mock.calls.length;

      q('[data-testid="apply"]')!.click();
      fixture.detectChanges();

      expect(mocks.customerPayments.applyPayment).toHaveBeenCalledWith(
        'pay-1',
        expect.any(String),
        [{ invoiceId: 'inv-9', amount: 4615 }],
      );
      expect(mocks.home.paymentsToMatch.mock.calls.length).toBe(paymentsReads + 1);
      expect(mocks.home.receivables.mock.calls.length).toBe(receivablesReads + 1);
      expect(text('[data-testid="approve-done"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_APPLIED');
    });

    it('keeps a payment selected through keep-as-credit and refund after the re-read drops it, so the refund is answered and retryable (S6)', () => {
      mocks.held.set([...ALL_HOME_PERMISSIONS, 'accounting:customer-credit:refund']);
      const waiting = payment({ unappliedAmount: 5000, totalAmount: 5000, leftOver: 385 });
      mocks.home.paymentsToMatch.mockReturnValueOnce(of(paymentsPage([waiting]))).mockReturnValue(of(paymentsPage([])));
      mocks.customerPayments.openInvoices.mockReturnValue(of(openInvoice9));
      mocks.customerPayments.applyPayment.mockReturnValue(
        of({
          appliedAmount: 4615,
          remainingAmount: 385,
          currency: 'USD',
          lines: [{ invoiceId: 'inv-9', appliedAmount: 4615, balanceAfter: 0 }],
          creditAmount: null,
        }),
      );
      mocks.customerPayments.creditRemainder.mockReturnValue(of({ creditId: 'credit-1', amount: 385, currency: 'USD' }));
      const refund = pending<number | null>();
      const retried = pending<number | null>();
      mocks.customerPayments.refundCredit.mockReturnValueOnce(refund).mockReturnValueOnce(retried);
      render();
      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();
      q('[data-testid="leftover-refund"]')!.click();
      fixture.detectChanges();
      q('[data-testid="apply"]')!.click();
      fixture.detectChanges();
      q('[data-testid="refund-confirm"]')!.click();
      fixture.detectChanges();

      // The credit's re-read dropped the used-up payment from the to-do, but its panel stays.
      expect(qa('.todo-item[data-kind="PAYMENT"]').length).toBe(0);
      expect(mocks.customerPayments.refundCredit).toHaveBeenCalledWith('credit-1', 385, expect.any(String));
      expect(q('app-payment-match')).not.toBeNull();

      refund.error(new HttpErrorResponse({ status: 503 }));
      fixture.detectChanges();
      expect(text('[data-testid="approve-done"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.REFUND_FAILED');
      const firstKey = mocks.customerPayments.refundCredit.mock.calls[0][2];

      // The failed refund settled the chain: nothing is in flight, so the other items are free.
      expect(component.paymentLock()).toBe(false);
      q('[data-testid="retry-refund"]')!.click();
      fixture.detectChanges();
      expect(mocks.customerPayments.refundCredit).toHaveBeenCalledTimes(2);
      expect(mocks.customerPayments.refundCredit.mock.calls[1][2]).toBe(firstKey);
      // The retry re-takes the lock: picking another item is refused until it answers (Copilot).
      expect(component.paymentLock()).toBe(true);
      const selectedBefore = component.selectedId();
      q('.todo-item[data-kind="BANK_LINE"]')!.click();
      fixture.detectChanges();
      expect(component.selectedId()).toBe(selectedBefore);

      retried.next(385);
      fixture.detectChanges();
      expect(text('[data-testid="approve-done"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_REFUNDED');
      expect(component.paymentLock()).toBe(false);
    });

    it('releases a held payment when its apply is refused (400): the re-read without it closes the panel (ADR-0063 §1)', () => {
      mocks.customerPayments.openInvoices.mockReturnValue(of(openInvoice9));
      mocks.customerPayments.applyPayment.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: { code: 'VALIDATION_ERROR', message: 'x' } })),
      );
      mocks.home.paymentsToMatch.mockReturnValueOnce(of(paymentsPage([payment()]))).mockReturnValue(of(paymentsPage([])));
      render();
      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();

      q('[data-testid="apply"]')!.click();
      fixture.detectChanges();

      expect(q('app-payment-match')).toBeNull();
      expect(component.selectedItem()).toBeNull();
      expect(component.selectedId()).toBeNull();
    });

    it('releases a held payment on Start over after an unknown apply, so a payment that apply used up closes (Copilot, ADR-0063)', () => {
      mocks.customerPayments.openInvoices.mockReturnValue(of(openInvoice9));
      mocks.customerPayments.applyPayment.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 504 })));
      render();
      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();
      q('[data-testid="apply"]')!.click();
      fixture.detectChanges();
      expect(q('[data-testid="retry-apply"]')).not.toBeNull();
      mocks.home.paymentsToMatch.mockReturnValue(of(paymentsPage([])));

      q('[data-testid="start-over"]')!.click();
      fixture.detectChanges();

      expect(q('app-payment-match')).toBeNull();
      expect(component.selectedItem()).toBeNull();
    });

    it('settles the selection when a refused apply releases an item a pending-time re-read already dropped (Copilot)', async () => {
      const answer = pending<ApplyResult>();
      mocks.customerPayments.openInvoices.mockReturnValue(of(openInvoice9));
      mocks.customerPayments.applyPayment.mockReturnValue(answer);
      render();
      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();
      q('[data-testid="apply"]')!.click();
      fixture.detectChanges();
      mocks.home.paymentsToMatch.mockReturnValue(of(paymentsPage([])));
      component.retryRegion('payments');
      fixture.detectChanges();
      expect(q('app-payment-match')).not.toBeNull();

      answer.error(new HttpErrorResponse({ status: 409, error: { code: 'CONFLICT', message: 'x' } }));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.selectedId()).toBeNull();
      expect(q('app-payment-match')).toBeNull();
      expect(document.activeElement?.id).toBe('todo-heading');
    });

    it('keeps the payment item while its write is in flight: another item waits, the late answer is announced and read back (Copilot)', () => {
      const answer = pending<ApplyResult>();
      mocks.customerPayments.openInvoices.mockReturnValue(of(openInvoice9));
      mocks.customerPayments.applyPayment.mockReturnValue(answer);
      render();
      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();
      const paymentId = component.selectedId();
      q('[data-testid="apply"]')!.click();
      fixture.detectChanges();

      const bank = q('.todo-item[data-kind="BANK_LINE"]')!;
      expect(bank.getAttribute('aria-disabled')).toBe('true');
      // The reason is visible and linked to every waiting item (ADR-0029 §8).
      expect(text('[data-testid="todo-lock-hint"]')).toBe('ACCOUNTING.HOME.TODO.LOCKED');
      expect(bank.getAttribute('aria-describedby')).toBe('todo-lock-hint');
      expect(q('.todo-item[data-kind="PAYMENT"]')!.getAttribute('aria-describedby')).toBeNull();
      bank.click();
      fixture.detectChanges();
      expect(component.selectedId()).toBe(paymentId);
      expect(q('app-payment-match')).not.toBeNull();

      const reads = mocks.home.paymentsToMatch.mock.calls.length;
      answer.next({ appliedAmount: 4615, remainingAmount: 0, currency: 'USD', lines: [], creditAmount: null });
      fixture.detectChanges();
      expect(mocks.home.paymentsToMatch.mock.calls.length).toBe(reads + 1);
      expect(text('[data-testid="approve-done"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_APPLIED');

      expect(q('.todo-item[data-kind="BANK_LINE"]')!.getAttribute('aria-disabled')).toBeNull();
      expect(q('[data-testid="todo-lock-hint"]')).toBeNull();
      q('.todo-item[data-kind="BANK_LINE"]')!.click();
      fixture.detectChanges();
      expect(component.selectedId()).toContain('BANK_LINE:');
    });

    it('releases the lock when a refused payments read takes the panel away mid-write: other items are selectable again', () => {
      const answer = pending<ApplyResult>();
      mocks.customerPayments.openInvoices.mockReturnValue(of(openInvoice9));
      mocks.customerPayments.applyPayment.mockReturnValue(answer);
      render();
      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();
      q('[data-testid="apply"]')!.click();
      fixture.detectChanges();
      expect(component.paymentLock()).toBe(true);

      mocks.home.paymentsToMatch.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      component.retryRegion('payments');
      fixture.detectChanges();

      expect(q('app-payment-match')).toBeNull();
      expect(component.paymentLock()).toBe(false);
      expect(component.paymentWriteInFlight()).toBe(false);
      expect(qa('.todo-item[aria-disabled="true"]')).toEqual([]);
      expect(q('[data-testid="todo-lock-hint"]')).toBeNull();
      q('.todo-item[data-kind="BANK_LINE"]')!.click();
      fixture.detectChanges();
      expect(component.selectedId()).toContain('BANK_LINE:');
    });

    it('re-takes the lock for a retry in the chain: switching is refused while Try again runs (S6)', () => {
      const waiting = payment({ unappliedAmount: 5000, totalAmount: 5000, leftOver: 385 });
      mocks.home.paymentsToMatch.mockReturnValue(of(paymentsPage([waiting])));
      mocks.customerPayments.openInvoices.mockReturnValue(of(openInvoice9));
      mocks.customerPayments.applyPayment.mockReturnValue(
        of({
          appliedAmount: 4615,
          remainingAmount: 385,
          currency: 'USD',
          lines: [{ invoiceId: 'inv-9', appliedAmount: 4615, balanceAfter: 0 }],
          creditAmount: null,
        }),
      );
      const retried = pending<{ creditId: string; amount: number; currency: string | null }>();
      mocks.customerPayments.creditRemainder
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })))
        .mockReturnValueOnce(retried);
      render();
      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();
      const paymentId = component.selectedId();
      q('[data-testid="apply"]')!.click();
      fixture.detectChanges();
      // The credit's outcome is unknown: nothing is in flight, so the lock is off.
      expect(component.paymentLock()).toBe(false);

      q('[data-testid="retry-credit"]')!.click();
      fixture.detectChanges();
      expect(component.paymentLock()).toBe(true);
      q('.todo-item[data-kind="BANK_LINE"]')!.click();
      fixture.detectChanges();
      expect(component.selectedId()).toBe(paymentId);

      retried.next({ creditId: 'credit-1', amount: 385, currency: 'USD' });
      fixture.detectChanges();
      expect(text('[data-testid="approve-done"]')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.ANNOUNCE_KEPT');
      expect(component.paymentLock()).toBe(false);
    });

    it('drops a held payment panel once the payments read is refused (ADR-0064 §6)', () => {
      mocks.customerPayments.openInvoices.mockReturnValue(of(openInvoice9));
      render();
      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();
      q('[data-testid="apply"]')!.click();
      fixture.detectChanges();
      expect(q('app-payment-match')).not.toBeNull();

      mocks.home.paymentsToMatch.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      component.retryRegion('payments');
      fixture.detectChanges();

      expect(q('app-payment-match')).toBeNull();
      expect(component.selectedItem()).toBeNull();
    });

    it('keeps focus on the item on a wide screen', () => {
      vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: false, media: query }) as MediaQueryList);
      render();
      const item = q('.todo-item[data-kind="PAYMENT"]')!;
      item.focus();
      item.click();
      fixture.detectChanges();

      expect(document.activeElement).toBe(item);
    });

    it('makes list rows and primary actions at least 44px tall (AC 12, §5.7)', () => {
      render();
      q('.todo-item[data-kind="APPROVAL"]')!.click();
      fixture.detectChanges();

      for (const element of [...qa('.todo-item'), ...qa('.filter-button'), q('[data-testid="approve-month"]')!]) {
        expect(element.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      }
    });

    it('clears the panel and focuses the list heading when a refresh removes the chosen item', () => {
      render();
      q('.todo-item[data-kind="BANK_LINE"]')!.click();
      fixture.detectChanges();

      mocks.home.unexplainedBankLines.mockReturnValue(of(page([])));
      component.refresh();
      fixture.detectChanges();

      expect(component.selectedId()).toBeNull();
      expect(q('[data-testid="todo-panel"]')).toBeNull();
      expect(document.activeElement?.id).toBe('todo-heading');
    });
  });

  describe('Approve month (AC 10, P5, ADR-0040 §6a)', () => {
    const chooseApproval = (): void => {
      q('.todo-item[data-kind="APPROVAL"]')!.click();
      fixture.detectChanges();
    };
    const approveButton = (): HTMLButtonElement => q('[data-testid="approve-month"]') as HTMLButtonElement;

    it('keeps Approve month visible but aria-disabled with the reason for the preparer, and makes no call', () => {
      mocks.workspace.getReview.mockReturnValue(of(review(false, ['SELF_APPROVAL'])));
      render();
      chooseApproval();

      expect(mocks.workspace.getReview).toHaveBeenCalledWith('rec-9');
      expect(approveButton()).not.toBeNull();
      expect(approveButton().getAttribute('aria-disabled')).toBe('true');
      expect(text('[data-testid="approve-reasons"]')).toContain(
        'ACCOUNTING.RECONCILIATION_WORKSPACE.READINESS.REASON.SELF_APPROVAL',
      );

      approveButton().click();
      component.approveMonth();
      expect(mocks.workspace.approve).not.toHaveBeenCalled();
    });

    it('approves once with the review’s version for another approver, then re-reads', () => {
      render();
      chooseApproval();

      expect(approveButton().getAttribute('aria-disabled')).toBeNull();
      expect(text('#approve-consequence')).toBe('ACCOUNTING.HOME.TODO.APPROVAL.CONSEQUENCE');
      mocks.home.checkupsAwaitingApproval.mockReturnValue(of(page([])));
      approveButton().click();
      fixture.detectChanges();

      expect(mocks.workspace.approve).toHaveBeenCalledTimes(1);
      expect(mocks.workspace.approve).toHaveBeenCalledWith('rec-9', 7);
      expect(mocks.home.checkupsAwaitingApproval).toHaveBeenCalledTimes(2);
      expect(mocks.home.bankCheckup).toHaveBeenCalledTimes(2);
      // The approved item left the list: panel cleared, focus on the list heading.
      expect(q('[data-testid="todo-panel"]')).toBeNull();
      expect(document.activeElement?.id).toBe('todo-heading');
      // The panel and its live region are gone, so success is announced at page level.
      const done = q('[data-testid="approve-done"]')!;
      expect(done.getAttribute('role')).toBe('status');
      expect(done.closest('[data-testid="todo-panel"]')).toBeNull();
      expect(done.textContent?.trim()).toBe('ACCOUNTING.HOME.TODO.APPROVAL.DONE');
      expect(component.approvedAccount()).toEqual({ account: 'Operating Checking' });
    });

    it.each([
      ['RECONCILIATION_SELF_APPROVAL', 422],
      ['OPTIMISTIC_LOCK', 409],
      [null, 403],
    ] as const)(
      'drops a %s / %s outcome that lands after the person chose another item (ADR-0063 §1)',
      (code, status) => {
        const inFlight = pending<'FINALIZED' | null>();
        mocks.workspace.approve.mockReturnValue(inFlight);
        mocks.home.checkupsAwaitingApproval.mockReturnValue(
          of(page([awaitingApproval(), awaitingApproval({ reconciliationId: 'rec-10', accountName: 'Payroll' })])),
        );
        render();
        chooseApproval();
        approveButton().click();
        expect(mocks.workspace.approve).toHaveBeenCalledWith('rec-9', 7);

        // Choose the second approval item while A's write is in flight.
        qa('.todo-item[data-kind="APPROVAL"]')[1].click();
        fixture.detectChanges();
        const itemB = qa('.todo-item[data-kind="APPROVAL"]')[1];
        itemB.focus();

        inFlight.error(new HttpErrorResponse({ status, error: code ? { code } : {} }));
        fixture.detectChanges();

        expect(component.selectedId()).toBe('APPROVAL:rec-10');
        expect(component.approveMessage()).toBeNull();
        expect(text('[data-testid="approve-outcome"]')).toBe('');
        expect(document.activeElement).toBe(itemB);
      },
    );

    it('still shows the outcome when the same item stays selected (the other half of the split)', () => {
      const inFlight = pending<'FINALIZED' | null>();
      mocks.workspace.approve.mockReturnValue(inFlight);
      render();
      chooseApproval();
      approveButton().click();

      inFlight.error(new HttpErrorResponse({ status: 422, error: { code: 'RECONCILIATION_SELF_APPROVAL' } }));
      fixture.detectChanges();

      expect(text('[data-testid="approve-outcome"]')).toBe('ACCOUNTING.HOME.TODO.APPROVAL.ERROR.SELF_APPROVAL');
    });

    it('hides Approve month and refuses the handler once the approve permission is gone', () => {
      render();
      chooseApproval();
      // A token refresh drops accounting:reconciliation:approve.
      mocks.held.set(CLERK);
      fixture.detectChanges();

      expect(approveButton()).toBeNull();
      component.approveMonth();
      expect(mocks.workspace.approve).not.toHaveBeenCalled();
    });

    it('shows Approve month under the unknown-perm_bits fallback, as canAccess does', () => {
      mocks.held.set(null);
      render();
      chooseApproval();

      expect(approveButton()).not.toBeNull();
      approveButton().click();
      expect(mocks.workspace.approve).toHaveBeenCalledTimes(1);
    });

    it('does not approve while the review is still loading', () => {
      mocks.workspace.getReview.mockReturnValue(pending());
      render();
      chooseApproval();

      expect(approveButton().getAttribute('aria-disabled')).toBe('true');
      component.approveMonth();
      expect(mocks.workspace.approve).not.toHaveBeenCalled();
    });

    it('re-reads the list and the review on OPTIMISTIC_LOCK and returns focus to the panel heading', () => {
      mocks.workspace.approve.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'OPTIMISTIC_LOCK' } })),
      );
      render();
      chooseApproval();
      approveButton().click();
      fixture.detectChanges();

      expect(mocks.workspace.getReview).toHaveBeenCalledTimes(2);
      expect(mocks.home.checkupsAwaitingApproval).toHaveBeenCalledTimes(2);
      expect(text('[data-testid="approve-outcome"]')).toBe('ACCOUNTING.HOME.TODO.APPROVAL.ERROR.OPTIMISTIC_LOCK');
      expect(document.activeElement?.id).toBe('todo-panel-heading');
    });

    it('shows the self-approval refusal in place without a re-read', () => {
      mocks.workspace.approve.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'RECONCILIATION_SELF_APPROVAL' } })),
      );
      render();
      chooseApproval();
      approveButton().click();
      fixture.detectChanges();

      expect(text('[data-testid="approve-outcome"]')).toBe('ACCOUNTING.HOME.TODO.APPROVAL.ERROR.SELF_APPROVAL');
      expect(mocks.home.checkupsAwaitingApproval).toHaveBeenCalledTimes(1);
    });

    it('words an unexplained-items refusal without the stale pre-write counts', () => {
      mocks.workspace.approve.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 422, error: { code: 'RECONCILIATION_HAS_UNEXPLAINED_ITEMS' } }),
        ),
      );
      render();
      chooseApproval();
      approveButton().click();
      fixture.detectChanges();

      expect(component.approveMessage()).toEqual({
        key: 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.HAS_UNEXPLAINED_ITEMS',
        params: {},
      });
      expect(mocks.workspace.getReview).toHaveBeenCalledTimes(2);
    });

    it('clears the "approved" status when another item is chosen or the home refreshes', () => {
      render();
      chooseApproval();
      approveButton().click();
      fixture.detectChanges();
      expect(component.approvedAccount()).not.toBeNull();

      q('.todo-item[data-kind="PAYMENT"]')!.click();
      expect(component.approvedAccount()).toBeNull();

      component.approvedAccount.set({ account: 'Operating Checking' });
      component.refresh();
      expect(component.approvedAccount()).toBeNull();
    });

    it('names accounting:reconciliation:approve on a write 403', () => {
      mocks.workspace.approve.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      render();
      chooseApproval();
      approveButton().click();
      fixture.detectChanges();

      expect(component.approveMessage()).toEqual({
        key: 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.FORBIDDEN',
        params: { permission: 'accounting:reconciliation:approve' },
      });
    });

    it('renders an opaque submitter as Not available, never the id', () => {
      mocks.home.checkupsAwaitingApproval.mockReturnValue(of(page([awaitingApproval({ submittedBy: null })])));
      render();
      chooseApproval();
      expect(text('[data-testid="submitted-by"]')).toBe('COMMON.NOT_AVAILABLE');
    });
  });

  describe('More accounting tools (AC 14, Spec discrepancy 2)', () => {
    it('is a closed disclosure listing only the events cards for an events-only session', () => {
      mocks.held.set(['accounting:events:view']);
      render();

      const details = q('[data-testid="more-tools"]') as HTMLDetailsElement;
      expect(details.tagName).toBe('DETAILS');
      expect(details.open).toBe(false);

      const eventsCards = ACCOUNTING_LANDING_CONFIG.sections
        .flatMap(section => section.cards)
        .filter(card => card.permissions?.[0] === 'accounting:events:view')
        .map(card => card.titleKey);
      const rendered = Array.from(details.querySelectorAll('.landing-card__title')).map(el => el.textContent?.trim());
      expect(rendered).toEqual(eventsCards);
      expect(details.querySelectorAll('h3.landing-section__title').length).toBe(1);
    });
  });

  describe('identity change while mounted (ADR-0063 §7)', () => {
    const switchTo = (sub: string, tenantId: string): void => {
      mocks.claims.set({ sub, tid: tenantId, exp: 4102444800 });
      tenant.set(tenantId);
      fixture.detectChanges();
    };

    it('tears down the embedded match panel and ignores its late apply answer (CAP:550 S6)', () => {
      const answer = pending<ApplyResult>();
      mocks.customerPayments.applyPayment.mockReturnValue(answer);
      mocks.customerPayments.openInvoices.mockReturnValue(of(openInvoice9));
      render();
      q('.todo-item[data-kind="PAYMENT"]')!.click();
      fixture.detectChanges();
      q('[data-testid="apply"]')!.click();
      fixture.detectChanges();

      switchTo('clerk.other', 'tenant-b');
      expect(q('app-payment-match')).toBeNull();
      answer.next({ appliedAmount: 4615, remainingAmount: 0, currency: 'USD', lines: [], creditAmount: null });
      fixture.detectChanges();

      expect(component.paymentMessage()).toBeNull();
      expect(component.selectedId()).toBeNull();
      expect(text('[data-testid="approve-done"]')).toBe('');
    });

    it('drops the old identity’s in-flight reads, clears the home and loads for the new identity', () => {
      const oldRead = pending<ReceivablesLane>();
      mocks.home.receivables.mockReturnValueOnce(oldRead);
      render();
      q('.todo-item[data-kind="BANK_LINE"]')!.click();
      fixture.detectChanges();
      expect(component.selectedId()).not.toBeNull();

      mocks.home.receivables.mockReturnValue(of<ReceivablesLane>({ ...receivablesLane, totalOutstanding: 42 }));
      mocks.home.unexplainedBankLines.mockReturnValue(of(page([])));
      switchTo('clerk.other', 'tenant-b');

      // The old identity's answer lands after the switch: it never renders.
      oldRead.next({ ...receivablesLane, totalOutstanding: 999 });
      fixture.detectChanges();

      expect(mocks.home.receivables).toHaveBeenCalledTimes(2);
      expect(text('[data-testid="receivables-total"]')).toBe('$42.00');
      expect(host.textContent).not.toContain('$999.00');
      expect(component.selectedId()).toBeNull();
      expect(q('[data-testid="todo-panel"]')).toBeNull();
      expect(component.state()).toBe('ready');
    });

    it('drops an Approve month outcome sent under the old identity', () => {
      const inFlight = pending<'FINALIZED' | null>();
      mocks.workspace.approve.mockReturnValue(inFlight);
      render();
      q('.todo-item[data-kind="APPROVAL"]')!.click();
      fixture.detectChanges();
      (q('[data-testid="approve-month"]') as HTMLButtonElement).click();
      const approvalsReads = mocks.home.checkupsAwaitingApproval.mock.calls.length;

      switchTo('controller.lee', 'tenant-b');
      inFlight.next('FINALIZED');
      fixture.detectChanges();

      expect(component.approving()).toBe(false);
      expect(component.approvedAccount()).toBeNull();
      // Only the identity-change load re-read the approvals, not the stale success.
      expect(mocks.home.checkupsAwaitingApproval).toHaveBeenCalledTimes(approvalsReads + 1);
    });

    it('reads the new identity’s preferences (Start here dismissed per person)', () => {
      render();
      q('[data-testid="dismiss-start-here"]')!.click();
      fixture.detectChanges();
      expect(q('[data-testid="start-here"]')).toBeNull();

      switchTo('someone.else', 'tenant-a');
      expect(q('[data-testid="start-here"]')).not.toBeNull();
    });

    it('does nothing when a token refresh keeps the same tid and sub', () => {
      render();
      mocks.claims.set({ ...CLAIMS, exp: 4102444900 });
      fixture.detectChanges();
      expect(mocks.home.receivables).toHaveBeenCalledTimes(1);
    });
  });

  it('uses the injected clock for today (ADR-0038)', () => {
    render();
    expect(component.today()).toEqual(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()));
    expect(component.bank.data()).toEqual([submittedRow]);
  });
});
