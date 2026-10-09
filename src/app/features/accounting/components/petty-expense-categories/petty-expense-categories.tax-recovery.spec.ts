import { formatCurrency, formatDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import { LocaleService } from '../../../../core/services/locale.service';
import { InputTaxRecovery, RecoveryCategory, RecoveryRegime, TaxShareCommand, TaxShareResult } from '../../models/input-tax-recovery.models';
import { PettyExpenseCategory } from '../../models/petty-expense-categories.models';
import { AccountingPreferencesService } from '../../services/accounting-preferences.service';
import { PettyExpenseCategoriesService } from '../../services/petty-expense-categories.service';
import { apiError, authMock } from '../../pages/bills/bills-page.spec-helper';
import { PettyExpenseCategoriesComponent, shareCopy } from './petty-expense-categories.component';
import { classifyShareError } from './tax-share-errors';

const VIEW = 'accounting:mapping-key:view';
const EDIT = 'accounting:mapping-key:edit';
const WHY = 'Meals are half claimable';

/** Placeholder codes only: the client names no country, regime or tax type (owner direction). */
const regime = (overrides: Partial<RecoveryRegime> = {}): RecoveryRegime => ({
  countryCode: 'ZZ',
  regime: 'ZZ_FED',
  enabled: true,
  registrationNumber: '123456789RT0001',
  since: '2026-01-01',
  accountName: 'Tax Recoverable',
  accountCode: '1250',
  ...overrides,
});

const share = (overrides: Partial<RecoveryCategory> = {}): RecoveryCategory => ({
  code: 'STAFF_MEALS',
  label: 'Staff meals',
  taxRecoverable: true,
  recoverablePercent: 50,
  version: 3,
  ...overrides,
});

const recoveryRead = (overrides: Partial<InputTaxRecovery> = {}): InputTaxRecovery => ({
  asOf: '2026-10-09T12:00:00Z',
  regimes: [regime()],
  evidence: [{ countryCode: 'ZZ', currencyCode: 'CAD', rules: [{ appliesTo: ['DRAWER_RECEIPT', 'VENDOR_BILL'], rule: 'SUPPLIER_REGISTRATION', threshold: 100 }] }],
  categories: [
    share({ code: 'SHOP_SUPPLIES', label: 'Shop supplies', recoverablePercent: 100, version: 1 }),
    share(),
    share({ code: 'POSTAGE', label: 'Postage', taxRecoverable: false, recoverablePercent: null, version: 0 }),
    share({ code: 'FUEL', label: 'Fuel', recoverablePercent: 75, version: 2 }),
  ],
  history: [],
  ...overrides,
});

/** A shop without any registration: every USD tenant today (§9.5). */
const NOT_REGISTERED = recoveryRead({ regimes: [], evidence: [], categories: [] });
/** A shop registered, but whose recovery is off (e.g. another country's currency, S32d). */
const REGISTERED_OFF = recoveryRead({ regimes: [regime({ enabled: false })] });

const category = (code: string, label: string, overrides: Partial<PettyExpenseCategory> = {}): PettyExpenseCategory => ({
  code,
  label,
  examples: null,
  status: 'ACTIVE',
  currentAccount: { glAccountId: `gl-${code}`, accountCode: '6340', accountName: 'Shop Supplies & Consumables', effectiveFrom: '2026-01-01' },
  laterAccount: null,
  version: 2,
  history: [],
  ...overrides,
});

const ROWS: PettyExpenseCategory[] = [
  category('SHOP_SUPPLIES', 'Shop supplies'),
  category('STAFF_MEALS', 'Staff meals'),
  category('POSTAGE', 'Postage'),
  category('FUEL', 'Fuel'),
  category('PARKING', 'Parking'),
];

const TAX_NODES = ['tax-registrations', 'tax-share-column', 'tax-share-cell', 'tax-steps', 'tax-share-open'];

describe('PettyExpenseCategoriesComponent — tax recovery (CAP:550 S33, §4.7, §5.5)', () => {
  let fixture: ComponentFixture<PettyExpenseCategoriesComponent>;
  let service: { setTaxShare: ReturnType<typeof vi.fn<(code: string, command: TaxShareCommand) => Observable<TaxShareResult>>> };
  let auth: ReturnType<typeof authMock>;
  let tenant: ReturnType<typeof signal<string | null>>;
  let showTerms: ReturnType<typeof signal<boolean>>;
  let changed: number;
  let retried: number;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T | null => host().querySelector<T>(selector);
  const all = (selector: string): HTMLElement[] => Array.from(host().querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const type = (selector: string, value: string): void => {
    const field = q<HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const click = (selector: string): void => {
    q<HTMLElement>(selector)!.click();
    fixture.detectChanges();
  };
  const result = (overrides: Partial<TaxShareResult> = {}): TaxShareResult => ({
    code: 'STAFF_MEALS',
    taxRecoverable: true,
    recoverablePercent: 100,
    version: 4,
    replayed: false,
    ...overrides,
  });

  function render(
    held: readonly string[] | null,
    recovery: InputTaxRecovery | null = recoveryRead(),
    options: { readonly english?: boolean; readonly status?: 'OK' | 'PENDING' | 'FAILED'; readonly terms?: boolean } = {},
  ): PettyExpenseCategoriesComponent {
    tenant = signal<string | null>('tenant-a');
    showTerms = signal(options.terms ?? false);
    auth = authMock(held, { tenantId: tenant });
    TestBed.configureTestingModule({
      imports: [PettyExpenseCategoriesComponent, TranslateModule.forRoot()],
      providers: [
        { provide: PettyExpenseCategoriesService, useValue: service },
        { provide: AuthService, useValue: auth.service },
        { provide: AccountingPreferencesService, useValue: { showTerms } },
      ],
    });
    if (options.english !== false) {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en-US', enUS as TranslationObject);
      translate.use('en-US');
    }
    fixture = TestBed.createComponent(PettyExpenseCategoriesComponent);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.componentRef.setInput('categories', ROWS);
    fixture.componentRef.setInput('status', 'OK');
    fixture.componentRef.setInput('recovery', recovery);
    fixture.componentRef.setInput('recoveryStatus', options.status ?? 'OK');
    changed = 0;
    retried = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    fixture.componentInstance.recoveryRetry.subscribe(() => retried++);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  /** The page's re-read after `changed`: both reads go pending, then answer (ADR-0064). */
  async function reread(recovery: InputTaxRecovery, rows: PettyExpenseCategory[] = ROWS): Promise<void> {
    fixture.componentRef.setInput('status', 'PENDING');
    fixture.componentRef.setInput('recoveryStatus', 'PENDING');
    fixture.detectChanges();
    fixture.componentRef.setInput('categories', rows);
    fixture.componentRef.setInput('status', 'OK');
    fixture.detectChanges();
    fixture.componentRef.setInput('recovery', recovery);
    fixture.componentRef.setInput('recoveryStatus', 'OK');
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const cell = (code: string): string =>
    (host().querySelector(`[data-testid="category-row"][data-code="${code}"] [data-testid="tax-share-cell"]`)?.textContent ?? '').trim();

  function openShare(code = 'STAFF_MEALS'): void {
    q<HTMLElement>(`[data-testid="category-row"][data-code="${code}"] [data-testid="tax-share-open"]`)!.click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = { setTaxShare: vi.fn(() => of(result())) };
  });

  afterEach(() => (fixture?.nativeElement as HTMLElement | undefined)?.remove());

  describe('recovery on (AC 1, AC 3, AC 4)', () => {
    it('renders the registrations panel, the Tax claimed back column and the three steps with the served values', () => {
      render([VIEW, EDIT]);

      const panel = q('[data-testid="tax-registrations"]')!;
      expect(panel.tagName).toBe('SECTION');
      expect(panel.getAttribute('aria-labelledby')).toBe('tax-registrations-heading');
      expect(text('#tax-registrations-heading')).toBe('Your tax registrations');
      expect(text('[data-testid="tax-registration-regime"]')).toBe('ZZ_FED');
      expect(text('[data-testid="tax-registration-number"]')).toBe('Number 123456789RT0001');
      expect(text('[data-testid="tax-registration-since"]')).toBe(`Applies from ${formatDate('2026-01-01T00:00:00', 'mediumDate', 'en-US')}`);
      expect(q('[data-testid="tax-registration-account"]')).toBeNull();
      expect(text('[data-testid="tax-share-column"]')).toBe('Tax claimed back');

      const steps = all('[data-testid="tax-step"]').map(step => step.textContent!.replace(/\s+/g, ' ').trim());
      expect(steps).toEqual([
        'Enter the receipt total and pick the category.',
        `Type the supplier’s name and the receipt number. From CA$100.00, also type the supplier’s tax registration number.`,
        'Copy each tax the register asks for, as printed on the receipt. Not sure? Leave it blank: nothing is claimed back, which is always safe.',
      ]);
    });

    it('reads All of it, Half (50%), Not claimed, a served percentage, and Unknown for a code the read does not know (AC 3, §8.2)', () => {
      render([VIEW]);

      expect(cell('SHOP_SUPPLIES')).toBe('All of it');
      expect(cell('STAFF_MEALS')).toBe('Half (50%)');
      expect(cell('POSTAGE')).toBe('Not claimed');
      expect(cell('FUEL')).toBe('75%');
      expect(cell('PARKING')).toBe('Unknown');
    });

    it('formats a served percentage in the locale and never derives a share (shareCopy)', () => {
      expect(shareCopy(null)).toEqual({ key: 'ACCOUNTING.APPROVAL_LIMITS.TAX_RECOVERY.SHARE.UNKNOWN', percent: null });
      expect(shareCopy({ taxRecoverable: true, recoverablePercent: 33.33 })).toEqual({ key: 'ACCOUNTING.APPROVAL_LIMITS.TAX_RECOVERY.SHARE.PERCENT', percent: 33.33 });
      expect(shareCopy({ taxRecoverable: true, recoverablePercent: null })).toEqual({ key: 'ACCOUNTING.APPROVAL_LIMITS.TAX_RECOVERY.SHARE.UNKNOWN', percent: null });
    });

    it('lists only the regimes whose recovery is on: one off has no row, two on have two (AC 4)', () => {
      render([VIEW], recoveryRead({ regimes: [regime(), regime({ regime: 'ZZ_REG', enabled: false, registrationNumber: '1234567890TQ0001' })] }));
      expect(all('[data-testid="tax-registration"]').map(row => row.getAttribute('data-regime'))).toEqual(['ZZ_FED']);
      expect(host().textContent).not.toContain('1234567890TQ0001');

      fixture.componentRef.setInput(
        'recovery',
        recoveryRead({ regimes: [regime(), regime({ regime: 'ZZ_REG', registrationNumber: '1234567890TQ0001', since: '2026-03-01' })] }),
      );
      fixture.detectChanges();

      expect(all('[data-testid="tax-registration"]').map(row => row.getAttribute('data-regime'))).toEqual(['ZZ_FED', 'ZZ_REG']);
      expect(all('[data-testid="tax-registration-number"]')[1].textContent!.replace(/\s+/g, ' ').trim()).toBe('Number 1234567890TQ0001');
    });

    it('with accounting terms on, adds "(input tax credit)" and where claimed-back tax is recorded', () => {
      render([VIEW], recoveryRead(), { terms: true });

      expect(text('[data-testid="tax-share-column-term"]')).toBe('(input tax credit)');
      expect(text('[data-testid="tax-registration-account"]')).toBe('Tax claimed back is recorded in Tax Recoverable · 1250');
    });

    it('renders a registration number containing markup as text (ADR-0065)', () => {
      render([VIEW], recoveryRead({ regimes: [regime({ registrationNumber: '<img src=x onerror=alert(1)>' })] }));

      expect(q('[data-testid="tax-registration-number"] img')).toBeNull();
      expect(text('[data-testid="tax-registration-number"]')).toContain('<img src=x onerror=alert(1)>');
    });

    it('drops the amount from step 2 when the served rules name none', () => {
      render([VIEW], recoveryRead({ evidence: null }));

      expect(all('[data-testid="tax-step"]')[1].textContent!.replace(/\s+/g, ' ').trim()).toBe(
        'Type the supplier’s name and the receipt number, and the supplier’s tax registration number when the receipt shows it.',
      );
    });
  });

  describe('recovery off (AC 2, §9.5)', () => {
    it.each([
      ['a shop without a registration (every USD tenant today)', NOT_REGISTERED],
      ['a registered shop whose recovery is off', REGISTERED_OFF],
    ])('%s: none of the tax elements exists and no share write is possible', (_label, read) => {
      const component = render([VIEW, EDIT], read);

      for (const testid of TAX_NODES) expect(q(`[data-testid="${testid}"]`)).toBeNull();
      expect(q('[data-testid="tax-recovery-error"]')).toBeNull();
      expect(q('[data-testid="tax-recovery-unknown"]')).toBeNull();
      expect(host().querySelectorAll('thead th').length).toBe(5);

      component.openShare(ROWS[1]);
      component.submitShare();
      expect(component.shareDialog()).toBeNull();
      expect(service.setTaxShare).not.toHaveBeenCalled();
    });

    it('a failed read shows no tax element, says so, and Try again asks the page to re-read (story item 1)', () => {
      const component = render([VIEW, EDIT], recoveryRead(), { status: 'FAILED' });

      for (const testid of TAX_NODES) expect(q(`[data-testid="${testid}"]`)).toBeNull();
      expect(text('[data-testid="tax-recovery-error"] p')).toBe('Couldn’t check whether your shop claims tax back. The categories show without it.');
      expect(all('[data-testid="category-row"]').length).toBe(5);

      click('[data-testid="tax-recovery-retry"]');
      expect(retried).toBe(1);
      component.openShare(ROWS[1]);
      expect(component.shareDialog()).toBeNull();
    });

    it('a read that cannot decide (enabled: null) is never taken as on or off: no tax element, a notice with Try again', () => {
      render([VIEW, EDIT], recoveryRead({ regimes: [regime({ enabled: null })] }));

      for (const testid of TAX_NODES) expect(q(`[data-testid="${testid}"]`)).toBeNull();
      expect(text('[data-testid="tax-recovery-unknown"] p')).toBe('We can’t tell right now whether your shop claims tax back, so the tax details are hidden.');
      click('[data-testid="tax-recovery-unknown"] [data-testid="tax-recovery-retry"]');
      expect(retried).toBe(1);
    });
  });

  describe('Change share gates (AC 5, P5, ADR-0040 §6a)', () => {
    it('without accounting:mapping-key:edit no change control exists and the handlers refuse', () => {
      const component = render([VIEW]);

      expect(q('[data-testid="tax-share-open"]')).toBeNull();
      expect(q('[data-testid="tax-share-cell"]')).not.toBeNull();
      component.openShare(ROWS[1]);
      expect(component.shareDialog()).toBeNull();
    });

    it('a dialog opened with the permission refuses to save once the permission is gone', () => {
      const component = render([VIEW, EDIT]);
      openShare();
      click('[data-testid="tax-share-ALL"]');
      type('[data-testid="tax-share-reason"]', WHY);

      auth.held.set([VIEW]);
      fixture.detectChanges();
      component.submitShare();

      expect(component.shareDialog()).not.toBeNull();
      expect(service.setTaxShare).not.toHaveBeenCalled();
    });

    it('while either read is refreshing the action stays focusable, aria-disabled, says why, and refuses', () => {
      const component = render([VIEW, EDIT], recoveryRead(), { status: 'PENDING' });

      const action = q<HTMLButtonElement>('[data-testid="tax-share-open"]')!;
      expect(action.disabled).toBe(false);
      expect(action.getAttribute('aria-disabled')).toBe('true');
      expect(action.getAttribute('aria-describedby')).toBe('tax-recovery-stale-text');
      expect(text('#tax-recovery-stale-text')).toBe('Refreshing the tax details…');
      component.openShare(ROWS[1]);
      expect(component.shareDialog()).toBeNull();
    });
  });

  describe('the Change share dialog (AC 6, AC 7, §5.5, §8.2)', () => {
    it('is a labelled radio group with the served share chosen, the consequence before Save, and Save off until 10 characters', () => {
      render([VIEW, EDIT]);
      openShare();

      expect(text('#tax-share-title')).toBe('Change the tax claimed back: Staff meals');
      expect(text('[data-testid="tax-share-choices"] legend')).toBe('Tax claimed back for Staff meals');
      expect(all('[data-testid="tax-share-choices"] label').map(label => label.textContent!.trim())).toEqual(['Not claimed', 'Half (50%)', 'All of it']);
      expect(q<HTMLInputElement>('[data-testid="tax-share-HALF"]')!.checked).toBe(true);

      click('[data-testid="tax-share-ALL"]');
      const consequence = q('[data-testid="tax-share-consequence"]')!;
      const save = q<HTMLButtonElement>('[data-testid="tax-share-save"]')!;
      expect(consequence.textContent!.trim()).toBe(
        'From now on, Staff meals claims back all of the tax on its receipts. Receipts already recorded don’t change.',
      );
      expect(consequence.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      type('[data-testid="tax-share-reason"]', '123456789');
      expect(save.disabled).toBe(true);
      type('[data-testid="tax-share-reason"]', '1234567890');
      expect(save.disabled).toBe(false);
    });

    it('a double click sends exactly one PUT with the share, the version read, the reason and the requestId made at open', () => {
      const answer = new Subject<TaxShareResult>();
      service.setTaxShare.mockReturnValue(answer);
      const component = render([VIEW, EDIT]);
      openShare();
      const opened = component.currentShareRequestId();
      click('[data-testid="tax-share-ALL"]');
      type('[data-testid="tax-share-reason"]', WHY);

      click('[data-testid="tax-share-save"]');
      click('[data-testid="tax-share-save"]');
      component.submitShare();

      expect(service.setTaxShare).toHaveBeenCalledTimes(1);
      expect(service.setTaxShare).toHaveBeenCalledWith('STAFF_MEALS', {
        taxRecoverable: true,
        recoverablePercent: 100,
        version: 3,
        justification: WHY,
        requestId: opened,
      });
      expect(opened).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    });

    it('Not claimed sends no share', () => {
      render([VIEW, EDIT]);
      openShare();
      click('[data-testid="tax-share-NONE"]');
      type('[data-testid="tax-share-reason"]', WHY);
      click('[data-testid="tax-share-save"]');

      expect(service.setTaxShare.mock.calls[0][1]).toEqual(expect.objectContaining({ taxRecoverable: false, recoverablePercent: null }));
    });

    it('after a timeout the outcome is unknown: Save again carries the same requestId; an edited payload gets a new one', () => {
      service.setTaxShare.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
      service.setTaxShare.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 504 })));
      const component = render([VIEW, EDIT]);
      openShare();
      click('[data-testid="tax-share-ALL"]');
      type('[data-testid="tax-share-reason"]', WHY);

      click('[data-testid="tax-share-save"]');
      expect(text('[data-testid="tax-share-error"]')).toBe('We couldn’t confirm the change. Save again: it won’t be applied twice.');
      click('[data-testid="tax-share-save"]');
      const [first, second] = service.setTaxShare.mock.calls.map(call => call[1].requestId);
      expect(second).toBe(first);

      click('[data-testid="tax-share-NONE"]');
      click('[data-testid="tax-share-save"]');
      expect(service.setTaxShare.mock.calls[2][1].requestId).not.toBe(first);
      expect(component.shareDialog()).toBeNull();
    });

    it('a 409 OPTIMISTIC_LOCK stays in the dialog with the reason kept, re-reads, and the next save carries the re-read version', async () => {
      service.setTaxShare.mockReturnValueOnce(throwError(() => apiError(409, 'OPTIMISTIC_LOCK')));
      const component = render([VIEW, EDIT]);
      openShare();
      click('[data-testid="tax-share-ALL"]');
      type('[data-testid="tax-share-reason"]', WHY);
      click('[data-testid="tax-share-save"]');

      const error = q('[data-testid="tax-share-error"]')!;
      expect(error.getAttribute('role')).toBe('alert');
      expect(error.textContent!.trim()).toBe('Someone else changed this share. It was read again; your reason is kept. Check it and save again.');
      expect(q<HTMLTextAreaElement>('[data-testid="tax-share-reason"]')!.value).toBe(WHY);
      expect(changed).toBe(1);

      const moved = recoveryRead();
      await reread({ ...moved, categories: moved.categories.map(row => (row.code === 'STAFF_MEALS' ? { ...row, version: 7 } : row)) });
      expect(component.shareDialog()?.version).toBe(7);

      click('[data-testid="tax-share-save"]');
      expect(service.setTaxShare.mock.calls[1][1]).toEqual(expect.objectContaining({ version: 7, justification: WHY }));
      expect(service.setTaxShare.mock.calls[1][1].requestId).not.toBe(service.setTaxShare.mock.calls[0][1].requestId);
    });

    it('success closes the dialog, announces it, asks for the re-read, and returns focus to the row’s Change share once both reads land', async () => {
      const component = render([VIEW, EDIT]);
      openShare();
      click('[data-testid="tax-share-ALL"]');
      type('[data-testid="tax-share-reason"]', WHY);
      click('[data-testid="tax-share-save"]');

      expect(component.shareDialog()).toBeNull();
      expect(changed).toBe(1);
      expect(text('[data-testid="categories-announcement"]')).toBe('The tax claimed back was changed.');

      await reread(recoveryRead());
      await fixture.whenStable();
      expect(document.activeElement?.getAttribute('data-focus-key')).toBe('STAFF_MEALS|TAX_SHARE');
    });

    it('a 422 INPUT_TAX_RECOVERY_NOT_ENABLED closes the dialog, says why, re-reads, and the tax elements go with recovery off', async () => {
      service.setTaxShare.mockReturnValueOnce(throwError(() => apiError(422, 'INPUT_TAX_RECOVERY_NOT_ENABLED')));
      const component = render([VIEW, EDIT]);
      openShare();
      click('[data-testid="tax-share-ALL"]');
      type('[data-testid="tax-share-reason"]', WHY);
      click('[data-testid="tax-share-save"]');

      expect(component.shareDialog()).toBeNull();
      expect(changed).toBe(1);
      expect(text('[data-testid="tax-share-notice"]')).toBe(
        'Your shop no longer claims tax back, so the share wasn’t changed. The section was refreshed.',
      );

      await reread(REGISTERED_OFF);
      await fixture.whenStable();
      for (const testid of TAX_NODES) expect(q(`[data-testid="${testid}"]`)).toBeNull();
      expect(document.activeElement?.id).toBe('approval-limits-categories');
    });

    it('a 400 VALIDATION_ERROR naming the reason marks it and links the message; without fieldErrors nothing is marked', () => {
      service.setTaxShare.mockReturnValueOnce(throwError(() => apiError(400, 'VALIDATION_ERROR', [{ field: 'justification', message: 'x' }])));
      service.setTaxShare.mockReturnValueOnce(throwError(() => apiError(400, 'VALIDATION_ERROR')));
      render([VIEW, EDIT]);
      openShare();
      click('[data-testid="tax-share-ALL"]');
      type('[data-testid="tax-share-reason"]', WHY);
      click('[data-testid="tax-share-save"]');

      const reason = q('[data-testid="tax-share-reason"]')!;
      expect(reason.getAttribute('aria-invalid')).toBe('true');
      expect(reason.getAttribute('aria-describedby')).toBe('tax-share-reason-hint tax-share-error');
      expect(text('[data-testid="tax-share-error"]')).toBe('Check the highlighted fields.');

      click('[data-testid="tax-share-save"]');
      expect(text('[data-testid="tax-share-error"]')).toBe('This change wasn’t accepted. Check the share and the reason, then try again.');
      expect(host().querySelector('[aria-invalid="true"]')).toBeNull();
    });

    it('a 503 SERVICE_UNAVAILABLE says nothing was changed, distinct from an unknown outcome', () => {
      service.setTaxShare.mockReturnValueOnce(throwError(() => apiError(503, 'SERVICE_UNAVAILABLE')));
      render([VIEW, EDIT]);
      openShare();
      click('[data-testid="tax-share-ALL"]');
      type('[data-testid="tax-share-reason"]', WHY);
      click('[data-testid="tax-share-save"]');

      expect(text('[data-testid="tax-share-error"]')).toBe(
        'We couldn’t check your shop’s tax registrations just now, so nothing was changed. Try again in a moment.',
      );
    });

    it('a tenant or person change drops the dialog and a share write in flight (ADR-0063 §7)', () => {
      const answer = new Subject<TaxShareResult>();
      service.setTaxShare.mockReturnValue(answer);
      const component = render([VIEW, EDIT]);
      openShare();
      click('[data-testid="tax-share-ALL"]');
      type('[data-testid="tax-share-reason"]', WHY);
      click('[data-testid="tax-share-save"]');

      tenant.set('tenant-b');
      auth.claims.set({ sub: 'someone-else' } as JwtClaims);
      fixture.detectChanges();
      answer.next(result());
      fixture.detectChanges();

      expect(component.shareDialog()).toBeNull();
      expect(changed).toBe(0);
      expect(text('[data-testid="categories-announcement"]')).toBe('');
    });
  });

  describe('the served threshold through MoneyPipe (AC 8, P7)', () => {
    it('fr-CA formats 100.00 CAD in step 2', () => {
      render([VIEW], recoveryRead(), { english: false });
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('fr-CA', frCA as TranslationObject);
      translate.use('fr-CA');
      const locale = TestBed.inject(LocaleService);
      locale.currentLocale.set('fr-CA');
      fixture.detectChanges();
      const step = all('[data-testid="tax-step"]')[1].textContent!.replace(/\s+/g, ' ').trim();
      locale.currentLocale.set('en-US');

      expect(step).toBe(
        `Saisir le nom du fournisseur et le numéro du reçu. À partir de ${formatCurrency(100, 'fr-CA', '$', 'CAD').replace(/\s+/g, ' ')}, saisir aussi le numéro d’inscription aux taxes du fournisseur.`,
      );
    });

    it('no bundle carries a threshold literal: the amount is always the served one', () => {
      for (const bundle of [enUS, frCA, frFR, esUS, esMX]) {
        const steps = JSON.stringify((bundle as { ACCOUNTING: { APPROVAL_LIMITS: { TAX_RECOVERY: unknown } } }).ACCOUNTING.APPROVAL_LIMITS.TAX_RECOVERY);
        expect(steps).not.toMatch(/\$\s?\d|\d\s?\$|100/);
        expect(steps).toContain('{{amount}}');
      }
    });
  });

  describe('classifyShareError (ADR-0017)', () => {
    const permission = EDIT;
    it.each([
      [apiError(400, 'VALIDATION_ERROR', [{ field: 'recoverablePercent', message: 'x' }]), 'VALIDATION', ['recoverablePercent'], 'STAY', false],
      [apiError(400, 'VALIDATION_ERROR'), 'VALIDATION_UNNAMED', [], 'STAY', false],
      [apiError(409, 'OPTIMISTIC_LOCK'), 'CHANGED', [], 'REREAD', false],
      [apiError(409, 'IDEMPOTENCY_CONFLICT'), 'IDEMPOTENCY', [], 'STAY', true],
      [apiError(404, 'PETTY_EXPENSE_CATEGORY_NOT_FOUND'), 'NOT_FOUND', [], 'REREAD', false],
      [apiError(422, 'INPUT_TAX_RECOVERY_NOT_ENABLED'), 'NOT_ENABLED', [], 'CLOSE_AND_REREAD', false],
      [apiError(503, 'SERVICE_UNAVAILABLE'), 'UNAVAILABLE', [], 'STAY', false],
      [apiError(403, 'FORBIDDEN'), 'FORBIDDEN', [], 'STAY', false],
      [new HttpErrorResponse({ status: 403 }), 'FORBIDDEN', [], 'STAY', false],
      [new HttpErrorResponse({ status: 404 }), 'NOT_FOUND', [], 'REREAD', false],
      [new HttpErrorResponse({ status: 409 }), 'CHANGED', [], 'REREAD', false],
      [new HttpErrorResponse({ status: 503 }), 'UNKNOWN_OUTCOME', [], 'STAY', false],
      [new HttpErrorResponse({ status: 0 }), 'UNKNOWN_OUTCOME', [], 'STAY', false],
      [new Error('boom'), 'UNKNOWN_OUTCOME', [], 'STAY', false],
      [apiError(422, 'ACCOUNTING_TIME_ZONE_UNSET'), 'OTHER', [], 'STAY', false],
    ])('%#: %s → %s', (error, key, fields, followUp, rotate) => {
      const failure = classifyShareError(error, permission);
      expect(failure.key).toBe(`ACCOUNTING.APPROVAL_LIMITS.TAX_RECOVERY.SHARE.ERROR.${key}`);
      expect(failure.fields).toEqual(fields);
      expect(failure.followUp).toBe(followUp);
      expect(failure.rotate).toBe(rotate);
    });

    it('names the permission on a 403', () => {
      expect(classifyShareError(new HttpErrorResponse({ status: 403 }), permission).params).toEqual({ permission });
    });
  });
});
