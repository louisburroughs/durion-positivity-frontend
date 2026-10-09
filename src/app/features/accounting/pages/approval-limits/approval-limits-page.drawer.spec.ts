import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import { ApPolicyBillsUpdate, ApPolicyRead } from '../../models/ap-approval-policy.models';
import { DrawerPolicyRead, DrawerPolicyUpdate } from '../../models/drawer-policy.models';
import { PettyExpenseCategory } from '../../models/petty-expense-categories.models';
import { ApApprovalPolicyService } from '../../services/ap-approval-policy.service';
import { DrawerPolicyService } from '../../services/drawer-policy.service';
import { PettyExpenseCategoriesService } from '../../services/petty-expense-categories.service';
import { apiError, authMock } from '../bills/bills-page.spec-helper';
import { ApprovalLimitsPageComponent, MergedHistoryRow, classifyDrawerError, mergeHistory } from './approval-limits-page.component';

const BILLS = 'accounting:ap_approval_policy:manage';
const DRAWER = 'order:session_policy:manage';
const CATEGORY_VIEW = 'accounting:mapping-key:view';
const REASON = 'Tighter count after the audit';

const billsRead = (overrides: Partial<ApPolicyRead['policy']> = {}, rows: ApPolicyRead['history']['rows'] = []): ApPolicyRead => ({
  policy: {
    clerkApprovalLimit: 2500,
    autoApprovalLimit: 500,
    currencyCode: 'USD',
    allowCreatorApproval: false,
    allowApproverPayment: false,
    defaultTerms: 'NET30',
    asOf: '2026-10-06T10:00:00Z',
    ...overrides,
  },
  history: { rows, page: 0, size: 20, total: rows.length },
});

const drawerRead = (overrides: Partial<DrawerPolicyRead['policy']> = {}, history: DrawerPolicyRead['history'] = []): DrawerPolicyRead => ({
  policy: {
    version: 3,
    currencyCode: 'USD',
    overShortTolerance: 5,
    types: [
      { type: 'PETTY_EXPENSE', allowed: true, cashierLimit: 50, alwaysNeedsManager: false, editable: true },
      { type: 'VENDOR_COD', allowed: false, cashierLimit: null, alwaysNeedsManager: false, editable: true },
      { type: 'BANK_DROP', allowed: true, cashierLimit: null, alwaysNeedsManager: false, editable: false },
      { type: 'FLOAT_CHANGE', allowed: true, cashierLimit: null, alwaysNeedsManager: true, editable: false },
    ],
    ...overrides,
  },
  history,
});

const category = (overrides: Partial<PettyExpenseCategory> = {}): PettyExpenseCategory => ({
  code: 'SHOP_SUPPLIES',
  label: 'Shop supplies',
  examples: 'Rags, gloves',
  status: 'ACTIVE',
  currentAccount: { glAccountId: 'gl-6340', accountCode: '6340', accountName: 'Shop Supplies & Consumables', effectiveFrom: '2026-01-01' },
  laterAccount: null,
  version: 1,
  history: [],
  ...overrides,
});

describe('ApprovalLimitsPageComponent — Drawer cash, categories and the merged History (CAP:550 S21)', () => {
  let fixture: ComponentFixture<ApprovalLimitsPageComponent>;
  let bills: {
    getPolicy: ReturnType<typeof vi.fn<(page?: number) => Observable<ApPolicyRead>>>;
    updatePolicy: ReturnType<typeof vi.fn<(update: ApPolicyBillsUpdate) => Observable<ApPolicyRead>>>;
  };
  let drawer: {
    getPolicy: ReturnType<typeof vi.fn<() => Observable<DrawerPolicyRead>>>;
    updatePolicy: ReturnType<typeof vi.fn<(update: DrawerPolicyUpdate) => Observable<DrawerPolicyRead>>>;
  };
  let categories: {
    list: ReturnType<typeof vi.fn<() => Observable<PettyExpenseCategory[]>>>;
    listExpenseAccounts: ReturnType<typeof vi.fn>;
    recovery: ReturnType<typeof vi.fn>;
  };
  let auth: ReturnType<typeof authMock>;
  let tenant: ReturnType<typeof signal<string | null>>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);
  const type = (selector: string, value: string): void => {
    const field = q<HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const toggle = (selector: string): void => {
    q<HTMLInputElement>(selector)!.click();
    fixture.detectChanges();
  };
  const saveButton = (): HTMLButtonElement => q<HTMLButtonElement>('[data-testid="save"]')!;

  const sentence = (selector: string): string => q(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  function render(held: readonly string[] | null, english = false): ApprovalLimitsPageComponent {
    tenant = signal<string | null>('tenant-a');
    auth = authMock(held, { tenantId: tenant });
    TestBed.configureTestingModule({
      imports: [ApprovalLimitsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ApApprovalPolicyService, useValue: bills },
        { provide: DrawerPolicyService, useValue: drawer },
        { provide: PettyExpenseCategoriesService, useValue: categories },
        { provide: AuthService, useValue: auth.service },
      ],
    });
    if (english) {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en-US', enUS as TranslationObject);
      translate.use('en-US');
    }
    fixture = TestBed.createComponent(ApprovalLimitsPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    bills = { getPolicy: vi.fn(() => of(billsRead())), updatePolicy: vi.fn(() => of(billsRead())) };
    drawer = { getPolicy: vi.fn(() => of(drawerRead())), updatePolicy: vi.fn(() => of(drawerRead({ version: 4 }))) };
    // A shop without a tax registration (S33): recovery off, so no tax element joins these sections.
    categories = {
      list: vi.fn(() => of([category()])),
      listExpenseAccounts: vi.fn(() => NEVER),
      recovery: vi.fn(() => of({ asOf: '2026-10-09T12:00:00Z', regimes: [], evidence: [], categories: [], history: [] })),
    };
  });

  describe('gates (AC 1, §8.1, P5, ADR-0040 §6a)', () => {
    it('a drawer-only manager is admitted and sees only Drawer cash and History, with matching links', () => {
      drawer.getPolicy.mockReturnValue(
        of(drawerRead({}, [{ changedAt: '2026-10-05T15:00:00Z', setting: 'PETTY_EXPENSE_LIMIT', oldValue: '40.00', newValue: '50.00', justification: 'Supplies cost more now' }])),
      );
      const page = render([DRAWER]);

      expect(page.canSeePage()).toBe(true);
      expect(q('[data-testid="page-denied"]')).toBeNull();
      expect(q('[data-testid="drawer-section"]')).not.toBeNull();
      expect(q('[data-testid="bills-section"]')).toBeNull();
      expect(q('[data-testid="categories-section"]')).toBeNull();
      expect(q('[data-testid="jump-drawer"]')).not.toBeNull();
      expect(q('[data-testid="jump-bills"]')).toBeNull();
      expect(q('[data-testid="jump-categories"]')).toBeNull();
      expect(q('[data-testid="jump-history"]')).not.toBeNull();
      expect(bills.getPolicy).not.toHaveBeenCalled();
      expect(categories.list).not.toHaveBeenCalled();
      const rows = Array.from(host().querySelectorAll('[data-testid="history-row"]'));
      expect(rows.map(row => row.getAttribute('data-source'))).toEqual(['DRAWER']);
      // The Save card saves the drawer leg for this session.
      expect(q('[data-testid="save-card"]')).not.toBeNull();
    });

    it('a bill-limits-only manager sees no Drawer cash, and the drawer is never read', () => {
      const page = render([BILLS]);

      expect(q('[data-testid="drawer-section"]')).toBeNull();
      expect(q('[data-testid="jump-drawer"]')).toBeNull();
      expect(drawer.getPolicy).not.toHaveBeenCalled();
      // The handler refuses a drawer edit without the code.
      page.setDrawerDraft({ pettyExpense: { allowed: false, limitText: '50' }, vendorCod: { allowed: false, limitText: '' }, toleranceText: '5' });
      expect(page.drawerDraft()).toBeNull();
    });

    it('a 403 on the drawer read removes the section and its link', () => {
      drawer.getPolicy.mockReturnValue(throwError(() => apiError(403, 'FORBIDDEN')));
      render([BILLS, DRAWER]);

      expect(q('[data-testid="drawer-section"]')).toBeNull();
      expect(q('[data-testid="drawer-error"]')).toBeNull();
      expect(q('[data-testid="jump-drawer"]')).toBeNull();
    });

    it('a categories reader sees the section and its link; without the code it is absent and never read', () => {
      render([BILLS, CATEGORY_VIEW]);
      expect(q('[data-testid="categories-section"]')).not.toBeNull();
      expect(q('[data-testid="jump-categories"]')).not.toBeNull();

      TestBed.resetTestingModule();
      categories.list.mockClear();
      render([BILLS]);
      expect(q('[data-testid="categories-section"]')).toBeNull();
      expect(categories.list).not.toHaveBeenCalled();
    });

    it('a token without perm_bits follows canAccess and reads every section', () => {
      render(null);

      expect(bills.getPolicy).toHaveBeenCalled();
      expect(drawer.getPolicy).toHaveBeenCalled();
      expect(categories.list).toHaveBeenCalled();
    });

    it('a session with none of the three codes is denied and nothing is read', () => {
      render(['accounting:ap:view']);

      expect(q('[data-testid="page-denied"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DENIED_ANY');
      expect(drawer.getPolicy).not.toHaveBeenCalled();
      expect(bills.getPolicy).not.toHaveBeenCalled();
    });

    it('an edit-only token passes the page gate but reads no section: the page names the codes that read one (A6)', () => {
      render(['accounting:mapping-key:edit'], true);

      const note = q('[data-testid="page-nothing-readable"]')!;
      expect(note.getAttribute('role')).toBe('alert');
      expect(sentence('[data-testid="page-nothing-readable"]')).toBe(
        'You need one of these permissions to see this page: accounting:ap_approval_policy:manage, order:session_policy:manage, accounting:mapping-key:view.',
      );
      expect(q('[data-testid="history-section"]')).toBeNull();
      expect(q('[data-testid="save-card"]')).toBeNull();
      expect(bills.getPolicy).not.toHaveBeenCalled();
      expect(drawer.getPolicy).not.toHaveBeenCalled();
      expect(categories.list).not.toHaveBeenCalled();
    });

    it('a drawer read failure shows Retry; Bills and categories still work and Save excludes the drawer', () => {
      drawer.getPolicy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
      const page = render([BILLS, DRAWER, CATEGORY_VIEW]);

      expect(q('[data-testid="drawer-error"]')).not.toBeNull();
      expect(q('[data-testid="bills-section"]')).not.toBeNull();
      expect(q('[data-testid="categories-section"]')).not.toBeNull();
      expect(page.drawerDirty()).toBe(false);

      drawer.getPolicy.mockReturnValue(of(drawerRead()));
      q<HTMLButtonElement>('[data-testid="drawer-error"] button')!.click();
      fixture.detectChanges();
      expect(q('[data-testid="drawer-section"]')).not.toBeNull();
    });
  });

  describe('switch and amount (AC 2)', () => {
    it('petty expenses switched off disables the amount with its value kept and states the off sentence', () => {
      render([DRAWER]);
      toggle('[data-testid="drawer-allowed-PETTY_EXPENSE"]');

      const amount = q<HTMLInputElement>('[data-testid="drawer-limit-PETTY_EXPENSE"]')!;
      expect(amount.disabled).toBe(true);
      expect(amount.value).toBe('50');
      expect(q('[data-testid="drawer-means-PETTY_EXPENSE"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.MEANS.PETTY_EXPENSE.OFF');
    });

    it('vendor cash on delivery switched on with no amount shows a required error and disables Save', () => {
      render([DRAWER]);
      type('[data-testid="save-reason"]', REASON);
      toggle('[data-testid="drawer-allowed-VENDOR_COD"]');

      const amount = q('[data-testid="drawer-limit-VENDOR_COD"]')!;
      expect(q('[data-testid="drawer-limit-error-VENDOR_COD"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.DRAWER.ERROR.REQUIRED');
      expect(amount.getAttribute('aria-invalid')).toBe('true');
      expect(amount.getAttribute('aria-describedby')).toContain('-error');
      expect(saveButton().disabled).toBe(true);

      type('[data-testid="drawer-limit-VENDOR_COD"]', '200');
      expect(saveButton().disabled).toBe(false);
    });
  });

  describe('reason (AC 4)', () => {
    it('a drawer change with a reason under 10 characters cannot be saved', () => {
      render([DRAWER]);
      type('[data-testid="drawer-tolerance"]', '3');
      type('[data-testid="save-reason"]', 'too short');

      expect(saveButton().disabled).toBe(true);
    });

    it('a server VALIDATION_ERROR on the justification marks the reason field and links the drawer error', () => {
      drawer.updatePolicy.mockReturnValue(throwError(() => apiError(400, 'VALIDATION_ERROR', [{ field: 'justification', message: 'too short' }])));
      render([DRAWER], true);
      type('[data-testid="drawer-tolerance"]', '3');
      type('[data-testid="save-reason"]', REASON);
      saveButton().click();
      fixture.detectChanges();

      const reason = q('[data-testid="save-reason"]')!;
      expect(reason.getAttribute('aria-invalid')).toBe('true');
      expect(reason.getAttribute('aria-describedby')).toContain('limits-drawer-save-error');
      const error = q('[data-testid="drawer-save-error"]')!;
      expect(error.id).toBe('limits-drawer-save-error');
      expect(error.getAttribute('role')).toBe('alert');
      expect(sentence('[data-testid="drawer-save-error"]')).toBe('Drawer cash limits weren’t saved: Check the highlighted fields.');
    });

    it('a VALIDATION_ERROR without fieldErrors (vendor cash on delivery switched on) says so and marks no field (B1)', () => {
      drawer.updatePolicy.mockReturnValue(throwError(() => apiError(400, 'VALIDATION_ERROR')));
      render([DRAWER], true);
      toggle('[data-testid="drawer-allowed-VENDOR_COD"]');
      type('[data-testid="drawer-limit-VENDOR_COD"]', '200');
      type('[data-testid="save-reason"]', REASON);
      saveButton().click();
      fixture.detectChanges();

      expect(sentence('[data-testid="drawer-save-error"]')).toBe(
        'Drawer cash limits weren’t saved: These values weren’t accepted. Check each amount and the reason, then try again.',
      );
      expect(host().querySelector('[aria-invalid="true"]')).toBeNull();
    });
  });

  describe('saving (AC 5, AC 6, §9.5)', () => {
    it('only drawer values changed: exactly one drawer updatePolicy with the full policy and the reason; no bill call', () => {
      const page = render([BILLS, DRAWER]);
      type('[data-testid="drawer-limit-PETTY_EXPENSE"]', '75');
      type('[data-testid="save-reason"]', REASON);
      saveButton().click();
      fixture.detectChanges();

      expect(drawer.updatePolicy).toHaveBeenCalledTimes(1);
      expect(drawer.updatePolicy.mock.calls[0][0]).toEqual({
        version: 3,
        currencyCode: 'USD',
        pettyExpense: { allowed: true, cashierLimit: 75 },
        vendorCod: { allowed: false, cashierLimit: null },
        overShortTolerance: 5,
        justification: REASON,
      });
      expect(bills.updatePolicy).not.toHaveBeenCalled();
      expect(q('[data-testid="announcement"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.SAVE.SAVED');
      expect(page.drawerPolicy()?.version).toBe(4);
      expect(page.reason()).toBe('');
    });

    it('bill saved, drawer failed: both outcomes wait for each other, then the alert names both and only the drawer is retried', () => {
      const billLeg = new Subject<ApPolicyRead>();
      const drawerLeg = new Subject<DrawerPolicyRead>();
      bills.updatePolicy.mockReturnValueOnce(billLeg);
      drawer.updatePolicy.mockReturnValueOnce(drawerLeg);
      const page = render([BILLS, DRAWER], true);
      type('[data-testid="clerk-limit"]', '3000');
      type('[data-testid="drawer-tolerance"]', '3');
      type('[data-testid="save-reason"]', REASON);
      saveButton().click();
      fixture.detectChanges();

      billLeg.next(billsRead({ clerkApprovalLimit: 3000 }));
      billLeg.complete();
      fixture.detectChanges();
      // Nothing is reported while the drawer leg is open.
      expect(q('[data-testid="drawer-save-error"]')).toBeNull();
      expect(q('[data-testid="announcement"]')?.textContent?.trim()).toBe('');
      expect(page.saving()).toBe(true);

      drawerLeg.error(apiError(422, 'CURRENCY_NOT_SUPPORTED'));
      fixture.detectChanges();

      const alert = q('[data-testid="drawer-save-error"]')!;
      expect(alert.getAttribute('role')).toBe('alert');
      expect(sentence('[data-testid="drawer-save-error"]')).toBe(
        'Bill limits were saved. Drawer cash limits weren’t saved: The limits must be in your ledger currency, USD. Your drawer changes are still here.',
      );
      expect(page.baseline()?.clerkApprovalLimit).toBe(3000);
      expect(page.billsDirty()).toBe(false);
      expect(page.drawerDirty()).toBe(true);
      expect(page.reason()).toBe(REASON);

      saveButton().click();
      fixture.detectChanges();
      expect(bills.updatePolicy).toHaveBeenCalledTimes(1);
      expect(drawer.updatePolicy).toHaveBeenCalledTimes(2);
      expect(drawer.updatePolicy.mock.calls[1][0].overShortTolerance).toBe(3);
    });

    it('bill saved, drawer outcome unknown (504): the alert says the drawer couldn\'t be confirmed, never that it wasn\'t saved (B3)', () => {
      drawer.updatePolicy.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 504 })));
      const page = render([BILLS, DRAWER], true);
      type('[data-testid="clerk-limit"]', '3000');
      type('[data-testid="drawer-tolerance"]', '3');
      type('[data-testid="save-reason"]', REASON);
      saveButton().click();
      fixture.detectChanges();

      expect(sentence('[data-testid="drawer-save-error"]')).toBe(
        'Bill limits were saved. Drawer cash limits couldn’t be confirmed: We couldn’t confirm the save. Press Save again: it won’t be applied twice. Your drawer changes are still here.',
      );
      expect(page.drawerDirty()).toBe(true);
    });

    it('drawer outcome unknown on its own (0): "couldn\'t be confirmed" (B3)', () => {
      drawer.updatePolicy.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
      render([DRAWER], true);
      type('[data-testid="drawer-tolerance"]', '3');
      type('[data-testid="save-reason"]', REASON);
      saveButton().click();
      fixture.detectChanges();

      expect(sentence('[data-testid="drawer-save-error"]')).toBe(
        'Drawer cash limits couldn’t be confirmed: We couldn’t confirm the save. Press Save again: it won’t be applied twice.',
      );
    });

    it.each([504, 0])('drawer saved, bill outcome unknown (%s): the alert says the bill limits couldn\'t be confirmed (B3)', status => {
      bills.updatePolicy.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
      const page = render([BILLS, DRAWER], true);
      type('[data-testid="clerk-limit"]', '3000');
      type('[data-testid="drawer-tolerance"]', '3');
      type('[data-testid="save-reason"]', REASON);
      saveButton().click();
      fixture.detectChanges();

      expect(sentence('[data-testid="save-error"]')).toBe(
        'Drawer cash limits were saved. Bill limits couldn’t be confirmed: We couldn’t confirm the save. Press Save again: it won’t be applied twice. Your bill changes are still here.',
      );
      expect(page.drawerDirty()).toBe(false);
      expect(page.billsDirty()).toBe(true);
    });

    it('drawer saved, bill failed: the bill alert names both and the drawer baseline is the served one', () => {
      bills.updatePolicy.mockReturnValueOnce(throwError(() => apiError(422, 'CURRENCY_NOT_SUPPORTED')));
      const page = render([BILLS, DRAWER], true);
      type('[data-testid="clerk-limit"]', '3000');
      type('[data-testid="drawer-tolerance"]', '3');
      type('[data-testid="save-reason"]', REASON);
      saveButton().click();
      fixture.detectChanges();

      expect(sentence('[data-testid="save-error"]')).toBe(
        'Drawer cash limits were saved. Bill limits weren’t saved: The limits must be in your ledger currency, USD. Your bill changes are still here.',
      );
      expect(page.drawerPolicy()?.version).toBe(4);
      expect(page.drawerDirty()).toBe(false);
      expect(page.billsDirty()).toBe(true);
    });

    it('a 409 SESSION_POLICY_CONFLICT re-reads the drawer and keeps the typed values', () => {
      drawer.updatePolicy.mockReturnValueOnce(throwError(() => apiError(409, 'SESSION_POLICY_CONFLICT')));
      const page = render([DRAWER]);
      type('[data-testid="drawer-tolerance"]', '3');
      type('[data-testid="save-reason"]', REASON);
      drawer.getPolicy.mockReturnValue(of(drawerRead({ version: 5, overShortTolerance: 4 })));
      saveButton().click();
      fixture.detectChanges();

      expect(drawer.getPolicy).toHaveBeenCalledTimes(2);
      expect(page.drawerPolicy()?.version).toBe(5);
      expect(q<HTMLInputElement>('[data-testid="drawer-tolerance"]')!.value).toBe('3');
      expect(q('[data-testid="drawer-save-error"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.SAVE.DRAWER_FAILED');
      expect(page.drawerSaveError()?.key).toBe('ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.DRAWER_CONFLICT');
    });

    it('after a 409 the draft is rebased: an untouched field takes the new served value and the next PUT sends it (A1)', () => {
      drawer.updatePolicy.mockReturnValueOnce(throwError(() => apiError(409, 'SESSION_POLICY_CONFLICT')));
      render([DRAWER]);
      type('[data-testid="drawer-limit-PETTY_EXPENSE"]', '75');
      type('[data-testid="save-reason"]', REASON);
      // Someone else lowered the tolerance meanwhile.
      drawer.getPolicy.mockReturnValue(of(drawerRead({ version: 5, overShortTolerance: 3 })));
      saveButton().click();
      fixture.detectChanges();

      expect(q<HTMLInputElement>('[data-testid="drawer-tolerance"]')!.value).toBe('3');
      expect(q<HTMLInputElement>('[data-testid="drawer-limit-PETTY_EXPENSE"]')!.value).toBe('75');
      saveButton().click();
      fixture.detectChanges();

      expect(drawer.updatePolicy.mock.calls[1][0]).toMatchObject({ version: 5, overShortTolerance: 3, pettyExpense: { allowed: true, cashierLimit: 75 } });
    });

    it('Undo changes restores both sections to their last served values', () => {
      const page = render([BILLS, DRAWER]);
      type('[data-testid="clerk-limit"]', '3000');
      toggle('[data-testid="drawer-allowed-PETTY_EXPENSE"]');
      q<HTMLButtonElement>('[data-testid="undo"]')!.click();
      fixture.detectChanges();

      expect(q<HTMLInputElement>('[data-testid="clerk-limit"]')!.value).toBe('2500');
      expect(q<HTMLInputElement>('[data-testid="drawer-allowed-PETTY_EXPENSE"]')!.checked).toBe(true);
      expect(page.anyDirty()).toBe(false);
    });

    it('a drawer re-read that lands while bills are edited never discards the bill edits', () => {
      const reread = new Subject<DrawerPolicyRead>();
      const page = render([BILLS, DRAWER]);
      type('[data-testid="clerk-limit"]', '3000');
      drawer.getPolicy.mockReturnValue(reread);
      page.loadDrawer();
      reread.next(drawerRead({ version: 6 }));
      fixture.detectChanges();

      expect(q<HTMLInputElement>('[data-testid="clerk-limit"]')!.value).toBe('3000');
      expect(page.drawerPolicy()?.version).toBe(6);
    });

    it('a tenant switch clears the drawer draft and re-reads every section (ADR-0063 §7)', () => {
      const page = render([BILLS, DRAWER, CATEGORY_VIEW]);
      type('[data-testid="drawer-tolerance"]', '3');
      tenant.set('tenant-b');
      const claims: JwtClaims = { sub: 'someone-else', exp: 0 };
      auth.claims.set(claims);
      fixture.detectChanges();

      expect(drawer.getPolicy).toHaveBeenCalledTimes(2);
      expect(categories.list).toHaveBeenCalledTimes(2);
      expect(page.drawerDirty()).toBe(false);
      expect(q<HTMLInputElement>('[data-testid="drawer-tolerance"]')!.value).toBe('5');
    });
  });

  describe('History (AC 11, §5.5, ADR-0064, ADR-0065)', () => {
    it('bill rows newest first with translated roles; the drawer notice shows; markup renders as text', () => {
      bills.getPolicy.mockReturnValue(
        of(
          billsRead({}, [
            { changedAt: '2026-10-05T15:00:00Z', changedBy: 'controller.cfo', changedByRoles: ['CONTROLLER'], setting: 'AP_CLERK_APPROVAL_LIMIT', oldValue: '1000.00', newValue: '2500.00', justification: '<b>Clerks</b> handle parts' },
            { changedAt: '2026-10-03T15:00:00Z', changedBy: 'gm.boss', changedByRoles: ['GENERAL_MANAGER'], setting: 'AP_AUTO_APPROVAL_LIMIT', oldValue: '0.00', newValue: '500.00', justification: 'Strong matches go through' },
          ]),
        ),
      );
      drawer.getPolicy.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      render([BILLS, DRAWER]);

      const notice = q('[data-testid="history-error-DRAWER"]');
      expect(notice?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.HISTORY.SOURCE_FAILED.DRAWER');
      const rows = Array.from(host().querySelectorAll('[data-testid="history-row"]'));
      expect(rows.length).toBe(2);
      // The notice sits above the other sources' rows.
      expect(notice!.compareDocumentPosition(rows[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(rows[0].querySelector('[data-testid="history-who"] li')?.textContent?.trim()).toBe('ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.CONTROLLER');
      expect(rows[1].querySelector('[data-testid="history-who"] li')?.textContent?.trim()).toBe('ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.GENERAL_MANAGER');
      expect(rows[0].querySelector('[data-testid="history-reason"]')?.textContent).toBe('<b>Clerks</b> handle parts');
      expect(rows[0].querySelector('[data-testid="history-reason"] b')).toBeNull();
      expect(host().textContent).not.toContain('controller.cfo');
    });

    it('merges bill, drawer and category changes newest first and never shows a username', () => {
      bills.getPolicy.mockReturnValue(
        of(billsRead({}, [{ changedAt: '2026-10-02T09:00:00Z', changedBy: 'controller.cfo', changedByRoles: ['CONTROLLER'], setting: 'AP_CLERK_APPROVAL_LIMIT', oldValue: null, newValue: '2500.00', justification: 'First limit set' }])),
      );
      drawer.getPolicy.mockReturnValue(
        of(drawerRead({}, [{ changedAt: '2026-10-04T09:00:00Z', setting: 'PETTY_EXPENSE_ALLOWED', oldValue: 'false', newValue: 'true', justification: 'Cashiers buy supplies' }])),
      );
      categories.list.mockReturnValue(
        of([
          category({
            history: [{ changedAt: '2026-10-03T09:00:00Z', changeType: 'DEACTIVATE', oldValue: 'ACTIVE', newValue: 'INACTIVE', justification: 'Nobody buys these' }],
          }),
        ]),
      );
      render([BILLS, DRAWER, CATEGORY_VIEW]);

      const rows = Array.from(host().querySelectorAll('[data-testid="history-row"]'));
      expect(rows.map(row => row.getAttribute('data-source'))).toEqual(['DRAWER', 'CATEGORIES', 'BILLS']);
      expect(rows[0].querySelector('[data-testid="history-change"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.PETTY_EXPENSE_ALLOWED');
      expect(rows[1].querySelector('[data-testid="history-change"]')?.textContent).toContain('ACCOUNTING.APPROVAL_LIMITS.HISTORY.CATEGORY_CHANGE.DEACTIVATE');
      // Drawer and category rows serve no role and their actor is a username: "Not available" (Q4).
      expect(rows[0].querySelector('[data-testid="history-who"]')?.textContent).toContain('COMMON.NOT_AVAILABLE');
      expect(host().textContent).not.toContain('controller.cfo');
    });

    it('two bill pages: each drawer and category row appears on exactly one page, in global newest-first order (ruling Q1)', () => {
      const bill = (changedAt: string, justification: string): ApPolicyRead['history']['rows'][number] => ({
        changedAt,
        changedBy: 'controller.cfo',
        changedByRoles: ['CONTROLLER'],
        setting: 'AP_CLERK_APPROVAL_LIMIT',
        oldValue: '1.00',
        newValue: '2.00',
        justification,
      });
      const pages: ApPolicyRead['history'][] = [
        { rows: [bill('2026-10-10T00:00:00Z', 'bill-10'), bill('2026-10-09T00:00:00Z', 'bill-09')], page: 0, size: 2, total: 4 },
        { rows: [bill('2026-10-08T00:00:00Z', 'bill-08'), bill('2026-10-07T00:00:00Z', 'bill-07')], page: 1, size: 2, total: 4 },
      ];
      bills.getPolicy.mockImplementation((page?: number) => of({ ...billsRead(), history: pages[page ?? 0] }));
      const drawerRow = (changedAt: string, justification: string): DrawerPolicyRead['history'][number] => ({
        changedAt,
        setting: 'OVER_SHORT_TOLERANCE',
        oldValue: '5.00',
        newValue: '3.00',
        justification,
      });
      drawer.getPolicy.mockReturnValue(
        of(
          drawerRead({}, [
            drawerRow('2026-10-11T00:00:00Z', 'drawer-11'),
            drawerRow('2026-10-09T00:00:00Z', 'drawer-09-tie'),
            drawerRow('2026-10-08T12:00:00Z', 'drawer-08-noon'),
            drawerRow('2026-10-01T00:00:00Z', 'drawer-01-older'),
          ]),
        ),
      );
      categories.list.mockReturnValue(
        of([category({ history: [{ changedAt: '2026-10-09T12:00:00Z', changeType: 'RELABEL', oldValue: 'a', newValue: 'b', justification: 'category-09-noon' }] })]),
      );
      const page = render([BILLS, DRAWER, CATEGORY_VIEW]);
      const reasons = (): string[] => Array.from(host().querySelectorAll('[data-testid="history-reason"]')).map(cell => cell.textContent ?? '');

      const first = reasons();
      expect(first).toEqual(['drawer-11', 'bill-10', 'category-09-noon', 'bill-09', 'drawer-09-tie']);
      page.nextHistory();
      fixture.detectChanges();
      const second = reasons();
      expect(second).toEqual(['drawer-08-noon', 'bill-08', 'bill-07', 'drawer-01-older']);

      const all = [...first, ...second];
      expect(new Set(all).size).toBe(all.length);
      expect(all.length).toBe(9);
      page.previousHistory();
      fixture.detectChanges();
      expect(reasons()).toEqual(first);
    });

    it('mergeHistory sorts newest first, keeps served order on ties and puts an unreadable instant last', () => {
      const drawerRow = (changedAt: string, justification: string): MergedHistoryRow => ({
        source: 'DRAWER',
        changedAt,
        row: { changedAt, setting: 'OVER_SHORT_TOLERANCE', oldValue: '5.00', newValue: '3.00', justification },
      });
      const merged = mergeHistory([
        drawerRow('', 'none'),
        drawerRow('2026-10-01T00:00:00Z', 'older'),
        drawerRow('2026-10-02T00:00:00Z', 'tie-a'),
        drawerRow('2026-10-02T00:00:00Z', 'tie-b'),
      ]);

      expect(merged.map(entry => (entry.source === 'TAX_RECOVERY' ? entry.row.reason : entry.row.justification))).toEqual(['tie-a', 'tie-b', 'older', 'none']);
    });
  });
});

describe('classifyDrawerError', () => {
  it.each([
    [apiError(400, 'VALIDATION_ERROR', [{ field: 'vendorCod.cashierLimit', message: 'x' }]), 'VALIDATION', ['vendorCod.cashierLimit'], false],
    [apiError(400, 'VALIDATION_ERROR'), 'VALIDATION_UNNAMED', [], false],
    [apiError(409, 'SESSION_POLICY_CONFLICT'), 'DRAWER_CONFLICT', [], true],
    [apiError(422, 'AMOUNT_PRECISION_EXCEEDS_CURRENCY'), 'PRECISION', ['pettyExpense.cashierLimit', 'vendorCod.cashierLimit', 'overShortTolerance'], false],
    [apiError(422, 'CURRENCY_NOT_SUPPORTED'), 'CURRENCY', [], false],
    [apiError(403, 'FORBIDDEN'), 'FORBIDDEN', [], false],
    [new HttpErrorResponse({ status: 0 }), 'UNKNOWN_OUTCOME', [], false],
    [apiError(422, 'SOMETHING_NEW'), 'OTHER', [], false],
  ])('classifies %#', (error, key, fields, reread) => {
    const view = classifyDrawerError(error, 'USD', DRAWER);
    expect(view.key).toBe(`ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.${key}`);
    expect(view.fields).toEqual(fields);
    expect(view.reread).toBe(reread);
  });

  it('names the drawer permission on a 403', () => {
    expect(classifyDrawerError(apiError(403, 'FORBIDDEN'), 'USD', DRAWER).params).toEqual({ permission: DRAWER });
  });
});
