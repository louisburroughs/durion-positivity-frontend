import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { AccountingPreferencesService } from '../../services/accounting-preferences.service';
import { PayablesService } from '../../services/payables.service';
import { BillPanelRouteComponent } from './bill-panel-route/bill-panel-route.component';
import { BillsPageComponent } from './bills-page.component';
import {
  CLERK,
  CONTROLLER,
  PayablesMock,
  VIEW_ONLY,
  apiError,
  authMock,
  action,
  awaitingBill,
  bill,
  exceptionBill,
  counts,
  payablesMock,
  pending,
  stagePage,
  stageRow,
} from './bills-page.spec-helper';

const ROUTES = [
  {
    path: 'app/accounting/bills',
    component: BillsPageComponent,
    children: [
      { path: '', pathMatch: 'full' as const, component: BillPanelRouteComponent },
      { path: ':billId', component: BillPanelRouteComponent },
    ],
  },
];

describe('BillsPageComponent (§5.2, §8.1)', () => {
  let harness: RouterTestingHarness;
  let payables: PayablesMock;

  afterEach(() => localStorage.clear());

  async function open(held: readonly string[] | null, url = '/app/accounting/bills', mock: PayablesMock = payablesMock()): Promise<BillsPageComponent> {
    payables = mock;
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter(ROUTES),
        { provide: PayablesService, useValue: payables },
        { provide: AuthService, useValue: authMock(held, { tenantId: signal<string | null>(null) }).service },
        { provide: AccountingPreferencesService, useValue: { showTerms: signal(false) } },
      ],
    });
    harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(url, BillsPageComponent);
    harness.detectChanges();
    return page;
  }

  const root = (): HTMLElement => harness.routeNativeElement!;
  const q = <T extends HTMLElement>(selector: string): T | null => root().querySelector<T>(selector);
  const all = (selector: string): HTMLElement[] => Array.from(root().querySelectorAll<HTMLElement>(selector));
  const step = (stage: string): HTMLButtonElement => q<HTMLButtonElement>(`[data-testid="stage-step"][data-stage="${stage}"]`)!;

  describe('How a bill moves', () => {
    it('shows the four served counts as read-only figures, never summed (P7)', async () => {
      await open(CLERK);

      expect(all('[data-testid="stage-count"]').map(cell => cell.textContent?.trim())).toEqual(['3', '2', '4', '1']);
      expect(q('[data-testid="stage-steps"]')?.textContent).not.toContain('10');
      expect(q('[data-testid="counts-as-of"]')).not.toBeNull();
    });

    it('defaults to Check', async () => {
      await open(CLERK);

      expect(step('CHECK').getAttribute('aria-pressed')).toBe('true');
      expect(payables.listByStage).toHaveBeenCalledWith('CHECK', 0);
    });

    it('defaults to Approve when Check is empty and the session can approve', async () => {
      const mock = payablesMock();
      mock.getStageCounts.mockReturnValue(of(counts({ check: 0 })));
      await open(CONTROLLER, '/app/accounting/bills', mock);

      expect(step('APPROVE').getAttribute('aria-pressed')).toBe('true');
      expect(payables.listByStage).toHaveBeenCalledWith('APPROVE', 0);
    });

    it('stays on Check for a session that cannot approve, even when Check is empty', async () => {
      const mock = payablesMock();
      mock.getStageCounts.mockReturnValue(of(counts({ check: 0 })));
      await open(VIEW_ONLY, '/app/accounting/bills', mock);

      expect(step('CHECK').getAttribute('aria-pressed')).toBe('true');
    });

    it('choosing a step lists its bills', async () => {
      await open(CLERK);
      step('PAY').click();
      harness.detectChanges();

      expect(payables.listByStage).toHaveBeenLastCalledWith('PAY', 0);
      expect(step('PAY').getAttribute('aria-pressed')).toBe('true');
      expect(step('CHECK').getAttribute('aria-pressed')).toBe('false');
    });

    it('counts failing while the list succeeds shows only the counts’ own failure with Retry (ADR-0064)', async () => {
      const mock = payablesMock();
      mock.getStageCounts.mockReturnValue(throwError(() => apiError(500, 'INTERNAL')));
      await open(CLERK, '/app/accounting/bills', mock);

      expect(q('[data-testid="counts-error"]')).not.toBeNull();
      expect(q('[data-testid="page-error"]')).toBeNull();
      expect(all('[data-testid="bill-item"]').length).toBe(1);
      mock.getStageCounts.mockReturnValue(of(counts()));
      q<HTMLButtonElement>('[data-testid="counts-error"] button')!.click();
      harness.detectChanges();
      expect(q('[data-testid="counts-error"]')).toBeNull();
    });

    it('the list failing while the counts succeed shows the page error with Retry and keeps the counts', async () => {
      const mock = payablesMock();
      mock.listByStage.mockReturnValue(throwError(() => apiError(500, 'INTERNAL')));
      const page = await open(CLERK, '/app/accounting/bills', mock);

      expect(page.state()).toBe('error');
      expect(q('[data-testid="page-error"]')?.getAttribute('role')).toBe('alert');
      expect(all('[data-testid="stage-count"]')[0].textContent?.trim()).toBe('3');
    });
  });

  describe('bill list', () => {
    it('an EDI bill with no due date in PENDING_RECEIPT_MATCH appears under Check as "Waiting on delivery" (AC 4)', async () => {
      await open(CLERK);

      const row = q('[data-testid="bill-item"]')!;
      expect(row.textContent).toContain('Northside Parts');
      expect(row.textContent).toContain('INV-4471');
      expect(row.textContent).toContain('$1,840.50');
      expect(row.textContent).toContain('ACCOUNTING.BILLS.CHANNEL.SUPPLIER_CONNECTION');
      expect(row.querySelector('[data-testid="bill-status"]')?.textContent).toContain('ACCOUNTING.BILLS.STATUS.WAITING_DELIVERY');
    });

    it('shows an em dash for a bill without a vendor name and never an id', async () => {
      const mock = payablesMock();
      mock.listByStage.mockReturnValue(of(stagePage([stageRow({ vendorName: null })])));
      await open(CLERK, '/app/accounting/bills', mock);

      expect(q('[data-testid="bill-item"]')?.textContent).toContain('COMMON.EMPTY_VALUE');
      expect(root().textContent).not.toContain('bill-1');
    });

    it('says "No bills need your review" when Check is empty (§5.6)', async () => {
      const mock = payablesMock();
      mock.listByStage.mockReturnValue(of(stagePage([])));
      await open(CLERK, '/app/accounting/bills', mock);

      expect(q('[data-testid="list-empty"]')?.textContent).toContain('ACCOUNTING.BILLS.LIST.EMPTY_CHECK');
    });

    it('pages through the server-ordered list', async () => {
      const mock = payablesMock();
      mock.listByStage.mockReturnValue(of(stagePage([stageRow()], { totalPages: 2, totalElements: 30 })));
      await open(CLERK, '/app/accounting/bills', mock);
      q<HTMLButtonElement>('[data-testid="page-next"]')!.click();
      harness.detectChanges();

      expect(payables.listByStage).toHaveBeenLastCalledWith('CHECK', 1);
    });

    it('offers Review and pay on the Pay step to accounting:ap:pay holders only, with the pay note', async () => {
      await open(CONTROLLER);
      step('PAY').click();
      harness.detectChanges();
      expect(q('[data-testid="review-and-pay"]')?.getAttribute('href')).toBe('/app/accounting/vendor-payments/new');
      expect(q('[data-testid="pay-note"]')?.textContent).toContain('ACCOUNTING.BILLS.PAY.NOTE');

      TestBed.resetTestingModule();
      await open(CLERK);
      step('PAY').click();
      harness.detectChanges();
      expect(q('[data-testid="review-and-pay"]')).toBeNull();
    });
  });

  describe('header', () => {
    it('shows Approval limits only with accounting:ap_approval_policy:manage (P5)', async () => {
      await open(CONTROLLER);
      expect(q('[data-testid="approval-limits-link"]')?.getAttribute('href')).toBe('/app/accounting/settings/approval-limits');

      TestBed.resetTestingModule();
      await open(CLERK);
      expect(q('[data-testid="approval-limits-link"]')).toBeNull();
    });
  });

  describe('review panel (child route)', () => {
    it('picking a row opens bills/:billId and marks it pressed, without re-reading the list', async () => {
      await open(CLERK);
      const listCalls = payables.listByStage.mock.calls.length;
      q<HTMLButtonElement>('[data-testid="bill-item"]')!.click();
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(TestBed.inject(Router).url).toBe('/app/accounting/bills/bill-1');
      expect(q('[data-testid="bill-item"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(payables.getBill).toHaveBeenCalledWith('bill-1');
      expect(q('[data-testid="bill-panel"]')).not.toBeNull();
      expect(payables.listByStage.mock.calls.length).toBe(listCalls);
    });

    it('opens the bill’s panel straight from bills/:billId, as after a reload (AC 5)', async () => {
      await open(CLERK, '/app/accounting/bills/bill-1');

      expect(payables.getBill).toHaveBeenCalledWith('bill-1');
      expect(q('[data-testid="bill-panel"] h2')?.textContent).toContain('ACCOUNTING.BILLS.PANEL.HEADING');
    });

    it('asks to pick a bill on bills alone', async () => {
      await open(CLERK);

      expect(q('[data-testid="panel-empty"]')?.textContent).toContain('ACCOUNTING.BILLS.PANEL.EMPTY');
    });

    it('a decision re-reads the counts and the list from the server (AC 4)', async () => {
      const mock = payablesMock(bill());
      await open(CLERK, '/app/accounting/bills/bill-1', mock);
      const before = { counts: mock.getStageCounts.mock.calls.length, list: mock.listByStage.mock.calls.length };
      mock.getBill.mockReturnValue(of(awaitingBill()));
      mock.getStageCounts.mockReturnValue(of(counts({ check: 2, approve: 3 })));

      const note = q<HTMLTextAreaElement>('[data-testid="send-note"]')!;
      note.value = 'Shop rags and gloves';
      note.dispatchEvent(new Event('input'));
      harness.detectChanges();
      q<HTMLButtonElement>('[data-testid="send"]')!.click();
      harness.detectChanges();

      expect(mock.submitForApproval).toHaveBeenCalledWith('bill-1', { justification: 'Shop rags and gloves', posting: { classification: null, difference: null, overrideJustification: null } });
      expect(mock.getStageCounts.mock.calls.length).toBe(before.counts + 1);
      expect(mock.listByStage.mock.calls.length).toBe(before.list + 1);
      expect(all('[data-testid="stage-count"]').map(cell => cell.textContent?.trim()).slice(0, 2)).toEqual(['2', '3']);
    });

    it('Pick a match on another bill opens bills/{chosen}, announces it, re-reads counts and list, and keeps the step (Q5, AC 7)', async () => {
      const ambiguous = exceptionBill({
        billId: 'bill-1',
        openCandidates: [{ candidateId: 'cand-9', billNumber: 'REC-9', billTotal: 1200, currencyCode: 'USD', score: 74, points: null }],
        availableActions: [action('SELECT_CANDIDATE')],
      });
      const mock = payablesMock(ambiguous);
      mock.selectMatchCandidate.mockReturnValue(of({ billId: 'bill-9', billNumber: 'REC-9' }));
      await open(CLERK, '/app/accounting/bills/bill-1', mock);
      step('PAY').click();
      harness.detectChanges();
      const before = { counts: mock.getStageCounts.mock.calls.length, list: mock.listByStage.mock.calls.length };
      mock.getBill.mockReturnValue(of(awaitingBill({ billId: 'bill-9', billNumber: 'REC-9' })));

      q<HTMLButtonElement>('[data-testid="candidate-pick"]')!.click();
      await harness.fixture.whenStable();
      harness.detectChanges();
      // The announcement is set after the render that cleared it (clear-then-set).
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(TestBed.inject(Router).url).toBe('/app/accounting/bills/bill-9');
      expect(q('[data-testid="page-announcement"]')?.textContent).toContain('ACCOUNTING.BILLS.DONE.MATCHED_OTHER');
      expect(mock.getStageCounts.mock.calls.length).toBe(before.counts + 1);
      expect(mock.listByStage).toHaveBeenLastCalledWith('PAY', 0);
      expect(mock.listByStage.mock.calls.length).toBe(before.list + 1);
      expect(step('PAY').getAttribute('aria-pressed')).toBe('true');
      expect(mock.getBill).toHaveBeenLastCalledWith('bill-9');
    });

    it('clears the Q5 announcement on a tid|sub change, and re-announces an identical message (R2 item 4)', async () => {
      const tenant = signal<string | null>(null);
      payables = payablesMock();
      TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot()],
        providers: [
          provideRouter(ROUTES),
          { provide: PayablesService, useValue: payables },
          { provide: AuthService, useValue: authMock(CLERK, { tenantId: tenant }).service },
          { provide: AccountingPreferencesService, useValue: { showTerms: signal(false) } },
        ],
      });
      harness = await RouterTestingHarness.create();
      const page = await harness.navigateByUrl('/app/accounting/bills', BillsPageComponent);
      harness.detectChanges();

      page.openMatched({ billId: 'bill-9', billNumber: 'REC-9' });
      expect(page.announcement()).toBeNull();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(page.announcement()?.key).toBe('ACCOUNTING.BILLS.DONE.MATCHED_OTHER');

      page.openMatched({ billId: 'bill-9', billNumber: 'REC-9' });
      expect(page.announcement()).toBeNull();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(page.announcement()?.params).toEqual({ number: 'REC-9' });

      tenant.set('tenant-b');
      harness.detectChanges();
      expect(page.announcement()).toBeNull();
      expect(q('[data-testid="page-announcement"]')?.textContent?.trim()).toBe('');
    });

    it('a list re-read that lands after another step was chosen is ignored (ADR-0063)', async () => {
      const mock = payablesMock();
      await open(CLERK, '/app/accounting/bills', mock);
      const slow = pending<ReturnType<typeof stagePage>>();
      mock.listByStage.mockReturnValueOnce(slow);
      const page = harness.routeDebugElement!.componentInstance as BillsPageComponent;
      page.billChanged();
      step('DONE').click();
      harness.detectChanges();
      slow.next(stagePage([stageRow({ billNumber: 'STALE-1' })]));
      harness.detectChanges();

      expect(root().textContent).not.toContain('STALE-1');
    });
  });

  it('refuses everything for a session without accounting:ap:view', async () => {
    const page = await open(['accounting:analytics:view']);

    expect(q('[data-testid="page-denied"]')).not.toBeNull();
    expect(payables.getStageCounts).not.toHaveBeenCalled();
    page.selectStage('PAY');
    expect(payables.listByStage).not.toHaveBeenCalled();
  });
});
