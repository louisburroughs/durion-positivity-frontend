import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import { InputTaxRecovery, RecoveryChange, TaxShareResult } from '../../models/input-tax-recovery.models';
import { PettyExpenseCategory } from '../../models/petty-expense-categories.models';
import { ApApprovalPolicyService } from '../../services/ap-approval-policy.service';
import { DrawerPolicyService } from '../../services/drawer-policy.service';
import { PettyExpenseCategoriesService } from '../../services/petty-expense-categories.service';
import { authMock } from '../bills/bills-page.spec-helper';
import { ApprovalLimitsPageComponent } from './approval-limits-page.component';

const VIEW = 'accounting:mapping-key:view';
const EDIT = 'accounting:mapping-key:edit';

const category = (code: string, label: string, overrides: Partial<PettyExpenseCategory> = {}): PettyExpenseCategory => ({
  code,
  label,
  examples: null,
  status: 'ACTIVE',
  currentAccount: { glAccountId: `gl-${code}`, accountCode: '6340', accountName: 'Shop Supplies & Consumables', effectiveFrom: '2026-01-01' },
  laterAccount: null,
  version: 1,
  history: [],
  ...overrides,
});

const change = (overrides: Partial<RecoveryChange> = {}): RecoveryChange => ({
  code: 'STAFF_MEALS',
  effectiveFrom: '2026-10-05T10:00:00Z',
  actorRole: 'CONTROLLER',
  oldTaxRecoverable: true,
  oldRecoverablePercent: 100,
  newTaxRecoverable: true,
  newRecoverablePercent: 50,
  reason: 'Meals are half claimable',
  ...overrides,
});

/** Placeholder codes only (owner direction): one regime on, its threshold served. */
const recoveryOn = (overrides: Partial<InputTaxRecovery> = {}): InputTaxRecovery => ({
  asOf: '2026-10-09T12:00:00Z',
  regimes: [
    {
      countryCode: 'ZZ',
      regime: 'ZZ_FED',
      enabled: true,
      registrationNumber: '123456789RT0001',
      since: '2026-01-01',
      accountName: 'Tax Recoverable',
      accountCode: '1250',
    },
  ],
  evidence: [{ countryCode: 'ZZ', currencyCode: 'CAD', rules: [{ appliesTo: ['DRAWER_RECEIPT'], rule: 'SUPPLIER_REGISTRATION', threshold: 100 }] }],
  categories: [{ code: 'STAFF_MEALS', label: 'Staff meals', taxRecoverable: true, recoverablePercent: 50, version: 3 }],
  history: [],
  ...overrides,
});

const recoveryOff = (): InputTaxRecovery => ({ asOf: '2026-10-09T12:00:00Z', regimes: [], evidence: [], categories: [], history: [] });

describe('ApprovalLimitsPageComponent — input-tax recovery (CAP:550 S33)', () => {
  let fixture: ComponentFixture<ApprovalLimitsPageComponent>;
  let categories: {
    list: ReturnType<typeof vi.fn<() => Observable<PettyExpenseCategory[]>>>;
    listExpenseAccounts: ReturnType<typeof vi.fn>;
    recovery: ReturnType<typeof vi.fn<() => Observable<InputTaxRecovery>>>;
    setTaxShare: ReturnType<typeof vi.fn<() => Observable<TaxShareResult>>>;
  };

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);
  const sentence = (element: Element | null): string => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  function render(held: readonly string[] | null): ApprovalLimitsPageComponent {
    TestBed.configureTestingModule({
      imports: [ApprovalLimitsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ApApprovalPolicyService, useValue: { getPolicy: vi.fn(() => NEVER), updatePolicy: vi.fn() } },
        { provide: DrawerPolicyService, useValue: { getPolicy: vi.fn(() => NEVER), updatePolicy: vi.fn() } },
        { provide: PettyExpenseCategoriesService, useValue: categories },
        { provide: AuthService, useValue: authMock(held, { tenantId: signal<string | null>('tenant-a') }).service },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    fixture = TestBed.createComponent(ApprovalLimitsPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    categories = {
      list: vi.fn(() => of([category('STAFF_MEALS', 'Staff meals')])),
      listExpenseAccounts: vi.fn(() => NEVER),
      recovery: vi.fn(() => of(recoveryOn())),
      setTaxShare: vi.fn(),
    };
  });

  it('reads the recovery once beside the category read, and renders the tax elements when on (story item 1, AC 1)', () => {
    render([VIEW, EDIT]);

    expect(categories.list).toHaveBeenCalledTimes(1);
    expect(categories.recovery).toHaveBeenCalledTimes(1);
    expect(q('[data-testid="tax-registrations"]')).not.toBeNull();
    expect(sentence(q('[data-testid="tax-share-cell"]'))).toBe('Half (50%)');
  });

  it('never reads recovery without accounting:mapping-key:view', () => {
    render(['order:session_policy:manage', EDIT]);

    expect(categories.recovery).not.toHaveBeenCalled();
    expect(q('[data-testid="categories-section"]')).toBeNull();
  });

  it('a recovery read that fails keeps the categories, shows no tax element and Try again re-reads it (ADR-0064)', () => {
    categories.recovery.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    const page = render([VIEW, EDIT]);

    expect(page.recovery.status()).toBe('FAILED');
    expect(q('[data-testid="category-row"]')).not.toBeNull();
    expect(q('[data-testid="tax-share-column"]')).toBeNull();
    expect(sentence(q('[data-testid="tax-recovery-error"] p'))).toBe('Couldn’t check whether your shop claims tax back. The categories show without it.');
    expect(sentence(q('[data-testid="history-error-TAX_RECOVERY"] p'))).toBe('Tax claimed back changes couldn’t be loaded.');

    q<HTMLButtonElement>('[data-testid="tax-recovery-retry"]')!.click();
    fixture.detectChanges();
    expect(categories.recovery).toHaveBeenCalledTimes(2);
    expect(q('[data-testid="tax-share-column"]')).not.toBeNull();
  });

  it('a 403 on the recovery read removes its elements and History source; the categories stay', () => {
    categories.recovery.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));
    render([VIEW, EDIT]);

    expect(q('[data-testid="category-row"]')).not.toBeNull();
    expect(q('[data-testid="tax-recovery-error"]')).toBeNull();
    expect(q('[data-testid="history-error-TAX_RECOVERY"]')).toBeNull();
  });

  it('a recovery read that lands after a newer one is ignored (ADR-0063, AC 10)', () => {
    const older = new Subject<InputTaxRecovery>();
    const newer = new Subject<InputTaxRecovery>();
    categories.recovery.mockReturnValueOnce(older).mockReturnValueOnce(newer);
    const page = render([VIEW, EDIT]);

    page.loadRecovery();
    newer.next(recoveryOff());
    newer.complete();
    fixture.detectChanges();
    older.next(recoveryOn());
    older.complete();
    fixture.detectChanges();

    expect(page.recovery.data()).toEqual(recoveryOff());
    expect(q('[data-testid="tax-share-column"]')).toBeNull();
  });

  it('a share change re-reads both the categories and the recovery, and History gains the change (AC 7)', () => {
    categories.setTaxShare.mockReturnValue(of({ code: 'STAFF_MEALS', taxRecoverable: true, recoverablePercent: 100, version: 4, replayed: false }));
    render([VIEW, EDIT]);
    categories.recovery.mockReturnValueOnce(
      of(
        recoveryOn({
          categories: [{ code: 'STAFF_MEALS', label: 'Staff meals', taxRecoverable: true, recoverablePercent: 100, version: 4 }],
          history: [change({ effectiveFrom: '2026-10-09T12:00:00Z', oldRecoverablePercent: 50, newRecoverablePercent: 100, reason: 'All of it is claimable' })],
        }),
      ),
    );

    q<HTMLButtonElement>('[data-testid="tax-share-open"]')!.click();
    fixture.detectChanges();
    q<HTMLInputElement>('[data-testid="tax-share-ALL"]')!.click();
    const reason = q<HTMLTextAreaElement>('[data-testid="tax-share-reason"]')!;
    reason.value = 'All of it is claimable';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    q<HTMLButtonElement>('[data-testid="tax-share-save"]')!.click();
    fixture.detectChanges();

    expect(categories.list).toHaveBeenCalledTimes(2);
    expect(categories.recovery).toHaveBeenCalledTimes(2);
    expect(sentence(q('[data-testid="tax-share-cell"]'))).toBe('All of it');
    const row = q('[data-testid="history-row"][data-source="TAX_RECOVERY"]')!;
    expect(sentence(row.querySelector('[data-testid="history-who"]'))).toBe('Controller');
    expect(sentence(row.querySelector('[data-testid="history-change"]'))).toBe('Tax claimed back: Staff meals Half (50%) → All of it');
    expect(sentence(row.querySelector('[data-testid="history-reason"]'))).toBe('All of it is claimable');
  });

  it('merges recovery changes with the category changes by date, names the category, never the username or the code', () => {
    categories.list.mockReturnValue(
      of([
        category('STAFF_MEALS', 'Staff meals', {
          history: [{ changedAt: '2026-10-07T09:00:00Z', changeType: 'RELABEL', oldValue: 'Meals', newValue: 'Staff meals', justification: 'Clearer name' }],
        }),
      ]),
    );
    categories.recovery.mockReturnValue(
      of(
        recoveryOn({
          history: [
            change({ effectiveFrom: '2026-10-08T09:00:00Z', oldTaxRecoverable: null, oldRecoverablePercent: null, newRecoverablePercent: 50, actorRole: null }),
            change({ code: 'GONE', effectiveFrom: '2026-10-06T09:00:00Z', newTaxRecoverable: false, newRecoverablePercent: null, reason: 'Retired' }),
          ],
        }),
      ),
    );
    render([VIEW, EDIT]);

    const rows = Array.from(host().querySelectorAll('[data-testid="history-row"]'));
    expect(rows.map(row => row.getAttribute('data-source'))).toEqual(['TAX_RECOVERY', 'CATEGORIES', 'TAX_RECOVERY']);
    expect(sentence(rows[0].querySelector('[data-testid="history-change"]'))).toBe('Tax claimed back: Staff meals — → Half (50%)');
    expect(sentence(rows[0].querySelector('[data-testid="history-who"]'))).toBe('Not available');
    expect(sentence(rows[2].querySelector('[data-testid="history-change"]'))).toBe('Tax claimed back: Unknown All of it → Not claimed');
    expect(host().textContent).not.toContain('GONE');
  });
});
