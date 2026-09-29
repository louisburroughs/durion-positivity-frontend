import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import { AuthService } from '../../../../core/services/auth.service';
import { BankAccount, BankStatement } from '../../models/bank-reconciliation.models';
import { BankReconciliationService } from '../../services/bank-reconciliation.service';
import { BankAccountsPageComponent } from './bank-accounts-page.component';

const account = (overrides: Partial<BankAccount> = {}): BankAccount => ({
  glAccountId: 'gl-1010',
  accountCode: '1010',
  accountName: 'Operating Checking',
  bankName: 'First Bank',
  accountMask: '4821',
  currency: 'USD',
  reconciliationBaselineDate: '2026-05-01',
  coverageFrontier: '2026-08-31',
  reconciledFrontier: '2026-07-31',
  unexplainedBankTransactionCount: 3,
  openOutstandingItemCount: 2,
  profileExists: true,
  ...overrides,
});

const statement = (overrides: Partial<BankStatement> = {}): BankStatement => ({
  statementId: 'st-8',
  glAccountId: 'gl-1010',
  statementRef: 'AUG',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  openingBalance: 900,
  closingBalance: 1000,
  currency: 'USD',
  status: 'COMMITTED',
  sourceKind: 'FILE_IMPORT',
  gapAcknowledgement: null,
  reconciliations: [],
  ...overrides,
});

const ADJUST = 'accounting:reconciliation:adjust';

const authStub = {
  known: true,
  granted: [ADJUST] as readonly string[],
  permissionsKnown(): boolean {
    return this.known;
  },
  hasAnyPermission(required: readonly string[]): boolean {
    return required.some(code => this.granted.includes(code));
  },
};

const serviceStub = {
  listBankAccounts: vi.fn(),
  setBankAccountProfile: vi.fn(),
  listStatements: vi.fn(),
  startReconciliation: vi.fn(),
};

const httpError = (status: number, body: unknown = null): HttpErrorResponse => new HttpErrorResponse({ status, error: body });

type Bundle = Record<string, unknown>;
const lookup = (bundle: Bundle, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);

describe('BankAccountsPageComponent', () => {
  let fixture: ComponentFixture<BankAccountsPageComponent>;
  let component: BankAccountsPageComponent;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = (accounts: readonly BankAccount[] = [account()]): void => {
    serviceStub.listBankAccounts.mockReturnValue(of(accounts));
    TestBed.configureTestingModule({
      imports: [BankAccountsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BankReconciliationService, useValue: serviceStub },
        { provide: AuthService, useValue: authStub },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BankAccountsPageComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  const query = (testId: string): HTMLElement | null => el.querySelector(`[data-testid="${testId}"]`);
  const click = (target: HTMLElement | null): void => {
    target?.click();
    fixture.detectChanges();
  };
  const choose = (testId: string): void => {
    const radio = query(testId) as HTMLInputElement;
    radio.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    serviceStub.listStatements.mockReturnValue(of([statement()]));
  });

  afterEach(() => {
    vi.clearAllMocks();
    authStub.known = true;
    authStub.granted = [ADJUST];
    TestBed.resetTestingModule();
  });

  describe('loading', () => {
    it('lists each account by code and name with its baseline, frontiers and counts, never a raw id', () => {
      setup();

      const row = el.querySelector('[data-account="gl-1010"]') as HTMLElement;
      expect(row.textContent).toContain('1010');
      expect(row.textContent).toContain('Operating Checking');
      expect(row.textContent).not.toContain('gl-1010');
      expect(row.textContent).toContain('First Bank');
      expect(row.querySelector('[data-testid="baseline"]')?.textContent).toContain('May 1, 2026');
      expect(row.textContent).toContain('Aug 31, 2026');
      expect(row.textContent).toContain('Jul 31, 2026');
    });

    it('shows not-available for an account before its first statement', () => {
      setup([account({ reconciliationBaselineDate: null, bankName: null, accountMask: null })]);

      expect(query('baseline')?.textContent?.trim()).toBe('COMMON.NOT_AVAILABLE');
      expect(query('no-profile')).not.toBeNull();
    });

    it('names a 403 as missing permission and anything else as a load failure, state before key', () => {
      serviceStub.listBankAccounts.mockReturnValue(throwError(() => httpError(403)));
      TestBed.configureTestingModule({
        imports: [BankAccountsPageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BankReconciliationService, useValue: serviceStub },
          { provide: AuthService, useValue: authStub },
        ],
      });
      fixture = TestBed.createComponent(BankAccountsPageComponent);
      component = fixture.componentInstance;
      const order: string[] = [];
      const setState = component.state.set.bind(component.state);
      const setKey = component.errorKey.set.bind(component.errorKey);
      component.state.set = (value) => {
        order.push(`state:${value}`);
        setState(value);
      };
      component.errorKey.set = (value) => {
        order.push(`key:${value}`);
        setKey(value);
      };
      component.load();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('ACCOUNTING.BANK_ACCOUNTS.ERROR.FORBIDDEN');
      expect(order.slice(-2)).toEqual(['state:error', 'key:ACCOUNTING.BANK_ACCOUNTS.ERROR.FORBIDDEN']);
    });

    it('drops a superseded read (ADR-0063)', () => {
      setup();
      const first = new Subject<BankAccount[]>();
      const second = new Subject<BankAccount[]>();
      serviceStub.listBankAccounts.mockReturnValueOnce(first).mockReturnValueOnce(second);

      component.load();
      component.load();
      second.next([account({ glAccountId: 'gl-1020', accountCode: '1020' })]);
      first.next([account()]);

      expect(component.accounts().map(a => a.accountCode)).toEqual(['1020']);
    });
  });

  describe('profile', () => {
    it('saves the profile, announces it and re-reads the list', () => {
      setup();
      serviceStub.setBankAccountProfile.mockReturnValue(of(undefined));

      click(query('edit-profile'));
      expect((query('profile-dialog') as HTMLDialogElement).matches(':modal')).toBe(true);
      component.profileForm.controls.bankName.setValue('  Second Bank ');
      component.profileForm.controls.accountMask.setValue('');
      click(query('save-profile'));

      expect(serviceStub.setBankAccountProfile).toHaveBeenCalledWith('gl-1010', {
        bankName: 'Second Bank',
        accountMask: null,
        currency: 'USD',
      });
      expect(query('profile-dialog')).toBeNull();
      expect(component.outcome()?.key).toBe('ACCOUNTING.BANK_ACCOUNTS.OUTCOME.PROFILE_SAVED');
      expect(serviceStub.listBankAccounts).toHaveBeenCalledTimes(2);
    });

    it('classifies 422 CURRENCY_NOT_SUPPORTED in the dialog', () => {
      setup();
      serviceStub.setBankAccountProfile.mockReturnValue(throwError(() => httpError(422, { code: 'CURRENCY_NOT_SUPPORTED' })));

      click(query('edit-profile'));
      click(query('save-profile'));

      expect(query('dialog-error')?.textContent?.trim()).toBe('ACCOUNTING.BANK_ACCOUNTS.ERROR.CURRENCY_NOT_SUPPORTED');
      expect(query('profile-dialog')).not.toBeNull();
    });

    it('offers only USD as the profile currency (D18)', () => {
      setup();
      click(query('edit-profile'));

      const options = Array.from((query('profile-currency') as HTMLSelectElement).options).map(o => o.value);
      expect(options).toEqual(['USD']);
    });
  });

  describe('start reconciliation (§4.1)', () => {
    it('lists only committed statements that nothing reconciles or holds', () => {
      serviceStub.listStatements.mockReturnValue(
        of([
          statement(),
          statement({ statementId: 'st-7', reconciliations: [{ reconciliationId: 'r7', status: 'FINALIZED' }] }),
          statement({ statementId: 'st-6', reconciliations: [{ reconciliationId: 'r6', status: 'SUBMITTED' }] }),
          statement({ statementId: 'st-5', reconciliations: [{ reconciliationId: 'r5', status: 'CANCELLED' }] }),
          statement({ statementId: 'st-4', status: 'SUPERSEDED' }),
        ]),
      );
      setup();

      click(query('start-reconciliation'));

      expect(serviceStub.listStatements).toHaveBeenCalledWith('gl-1010');
      expect(component.eligibleStatements().map(s => s.statementId)).toEqual(['st-8', 'st-5']);
      expect(el.querySelectorAll('[data-testid="statement-choice"]')).toHaveLength(2);
    });

    it('starts a reconciliation of the chosen statement and opens the workspace', () => {
      setup();
      serviceStub.startReconciliation.mockReturnValue(of('rec-11'));

      click(query('start-reconciliation'));
      choose('statement-choice');
      click(query('confirm-start'));

      expect(serviceStub.startReconciliation).toHaveBeenCalledWith('gl-1010', 'st-8');
      expect(navigate).toHaveBeenCalledWith(['/app', 'accounting', 'reconciliations', 'rec-11']);
    });

    it('asks for a statement before starting from one', () => {
      setup();

      click(query('start-reconciliation'));
      click(query('confirm-start'));

      expect(serviceStub.startReconciliation).not.toHaveBeenCalled();
      expect(query('dialog-error')?.textContent?.trim()).toBe('ACCOUNTING.BANK_ACCOUNTS.START.ERROR.CHOOSE_STATEMENT');
    });

    it('classifies 409 RECONCILIATION_WINDOW_ALREADY_RECONCILED and re-reads the statements', () => {
      setup();
      serviceStub.startReconciliation.mockReturnValue(
        throwError(() => httpError(409, { code: 'RECONCILIATION_WINDOW_ALREADY_RECONCILED' })),
      );

      click(query('start-reconciliation'));
      choose('statement-choice');
      click(query('confirm-start'));

      expect(query('dialog-error')?.textContent?.trim()).toBe('ACCOUNTING.BANK_ACCOUNTS.ERROR.WINDOW_ALREADY_RECONCILED');
      expect(serviceStub.listStatements).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['option-import', ['/app', 'accounting', 'bank-accounts', 'gl-1010', 'import'], undefined],
      ['option-manual', ['/app', 'accounting', 'bank-accounts', 'gl-1010', 'statements', 'new'], undefined],
      ['option-interim', ['/app', 'accounting', 'bank-accounts', 'gl-1010', 'statements', 'new'], { queryParams: { interim: 'true' } }],
    ])('%s opens its page', (option, commands, extras) => {
      setup();

      click(query('start-reconciliation'));
      choose(option);
      click(query('confirm-start'));

      if (extras) {
        expect(navigate).toHaveBeenCalledWith(commands, extras);
      } else {
        expect(navigate).toHaveBeenCalledWith(commands);
      }
    });

    it('falls back to importing when no statement is eligible', () => {
      serviceStub.listStatements.mockReturnValue(of([]));
      setup();

      click(query('start-reconciliation'));

      expect(component.startOption.value).toBe('IMPORT');
      expect((query('option-statement') as HTMLInputElement).disabled).toBe(true);
    });

    it('returns focus to the row button when the dialog is cancelled', async () => {
      setup();
      const opener = query('start-reconciliation') as HTMLButtonElement;
      opener.focus();

      click(opener);
      click(query('cancel-dialog'));
      await fixture.whenStable();

      expect(document.activeElement).toBe(opener);
    });
  });

  describe('write permission (ADR-0040 §6a)', () => {
    it('disables the writes for a view-only session, in the controls and the handlers', () => {
      authStub.granted = [];
      setup();

      expect(query('view-only-note')).not.toBeNull();
      expect((query('edit-profile') as HTMLButtonElement).disabled).toBe(true);
      expect((query('start-reconciliation') as HTMLButtonElement).disabled).toBe(true);
      component.openStart('gl-1010');
      component.openProfile('gl-1010');
      expect(component.dialog()).toBeNull();
    });

    it('follows the canAccess() fallback when the token carries no permissions', () => {
      authStub.known = false;
      authStub.granted = [];
      setup();

      expect((query('start-reconciliation') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('copy, against the shipped bundles', () => {
    const SHIPPED: readonly (readonly [string, Bundle])[] = [
      ['en-US', enUS],
      ['es-US', esUS],
      ['es-MX', esMX],
      ['fr-CA', frCA],
      ['fr-FR', frFR],
    ];

    for (const [locale, bundle] of SHIPPED) {
      it(`${locale}: each row action's accessible name starts with its visible label (Label in Name)`, () => {
        setup();
        const translate = TestBed.inject(TranslateService);
        translate.setTranslation(locale, bundle as TranslationObject);
        translate.use(locale);
        fixture.detectChanges();

        for (const [testId, key] of [
          ['edit-profile', 'ACCOUNTING.BANK_ACCOUNTS.ACTION.EDIT_PROFILE'],
          ['start-reconciliation', 'ACCOUNTING.BANK_ACCOUNTS.ACTION.START'],
        ] as const) {
          const visible = lookup(bundle, key) as string;
          const name = (query(testId)?.textContent ?? '').replace(/\s+/g, ' ').trim();
          expect(name.startsWith(visible)).toBe(true);
          expect(name.length).toBeGreaterThan(visible.length);
        }
      });
    }
  });
});
