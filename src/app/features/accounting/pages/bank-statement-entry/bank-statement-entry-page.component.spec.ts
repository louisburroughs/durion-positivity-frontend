import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { BankAccount, BankStatement } from '../../models/bank-reconciliation.models';
import { BankReconciliationService } from '../../services/bank-reconciliation.service';
import { BankStatementEntryPageComponent, nextDay } from './bank-statement-entry-page.component';

const ACCOUNT: BankAccount = {
  glAccountId: 'gl-1010',
  accountCode: '1010',
  accountName: 'Operating Checking',
  bankName: 'First Bank',
  accountMask: '4821',
  currency: 'USD',
  reconciliationBaselineDate: '2026-05-01',
  coverageFrontier: '2026-08-31',
  reconciledFrontier: '2026-08-31',
  unexplainedBankTransactionCount: 0,
  openOutstandingItemCount: 0,
  profileExists: true,
};

const created = (overrides: Partial<BankStatement> = {}): BankStatement => ({
  statementId: 'st-10',
  glAccountId: 'gl-1010',
  statementRef: null,
  startDate: '2026-09-01',
  endDate: '2026-09-15',
  openingBalance: 1000,
  closingBalance: 950,
  currency: 'USD',
  status: 'COMMITTED',
  sourceKind: 'MANUAL_ENTRY',
  gapAcknowledgement: null,
  reconciliations: [{ reconciliationId: 'rec-10', status: 'IN_PROGRESS' }],
  ...overrides,
});

const authStub = {
  granted: ['accounting:reconciliation:adjust'] as readonly string[],
  permissionsKnown: () => true,
  hasAnyPermission(required: readonly string[]): boolean {
    return required.some(code => this.granted.includes(code));
  },
};

const serviceStub = {
  listBankAccounts: vi.fn(),
  listStatements: vi.fn(),
  getStatement: vi.fn(),
  createManualStatement: vi.fn(),
};

describe('BankStatementEntryPageComponent', () => {
  let fixture: ComponentFixture<BankStatementEntryPageComponent>;
  let component: BankStatementEntryPageComponent;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = (interim = false, account: BankAccount = ACCOUNT): void => {
    serviceStub.listBankAccounts.mockReturnValue(of([account]));
    serviceStub.listStatements.mockReturnValue(of([]));
    const params = convertToParamMap({ glAccountId: 'gl-1010' });
    TestBed.configureTestingModule({
      imports: [BankStatementEntryPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BankReconciliationService, useValue: serviceStub },
        { provide: AuthService, useValue: authStub },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(params),
            snapshot: { paramMap: params, queryParamMap: convertToParamMap(interim ? { interim: 'true' } : {}) },
          },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BankStatementEntryPageComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  const query = (testId: string): HTMLElement | null => el.querySelector(`[data-testid="${testId}"]`);
  const click = (target: HTMLElement | null): void => {
    target?.click();
    fixture.detectChanges();
  };
  const fill = (): void => {
    component.form.patchValue({ startDate: '2026-09-01', endDate: '2026-09-15', openingBalance: '1000', closingBalance: '950' });
    component.transactions.at(0).patchValue({ date: '2026-09-03', amount: '-50', description: 'Check 1043', checkNumber: '1043' });
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    authStub.granted = ['accounting:reconciliation:adjust'];
    TestBed.resetTestingModule();
  });

  it('commits the keyed statement and opens the reconciliation it started', () => {
    setup();
    serviceStub.createManualStatement.mockReturnValue(of(created()));
    fill();

    click(query('entry-submit'));

    expect(serviceStub.createManualStatement).toHaveBeenCalledWith({
      glAccountId: 'gl-1010',
      statement: { startDate: '2026-09-01', endDate: '2026-09-15', openingBalance: 1000, closingBalance: 950, statementRef: null },
      transactions: [{ date: '2026-09-03', signedAmount: -50, description: 'Check 1043', reference: null, checkNumber: '1043' }],
      gapAcknowledgement: null,
      supersession: null,
      startReconciliation: true,
    });
    expect(navigate).toHaveBeenCalledWith(['/app', 'accounting', 'reconciliations', 'rec-10']);
  });

  it('refuses an interim window for an account with no reconciled date', () => {
    setup(true, { ...ACCOUNT, reconciledFrontier: null });
    fill();

    expect(query('interim-unavailable')).not.toBeNull();
    expect((query('entry-submit') as HTMLButtonElement).disabled).toBe(true);
    component.submit();
    expect(serviceStub.createManualStatement).not.toHaveBeenCalled();
  });

  it('starts an interim window the day after the reconciled frontier (§4.1 d)', () => {
    setup(true);

    expect(component.interim()).toBe(true);
    expect(component.form.controls.startDate.value).toBe('2026-09-01');
    expect(component.form.controls.startDate.disabled).toBe(true);
    expect((query('entry-start') as HTMLInputElement).disabled).toBe(true);
    expect(query('entry-start')?.getAttribute('aria-describedby')).toBe('entry-start-hint');
  });

  it('highlights the rows named by 422 STATEMENT_TRANSACTION_OUT_OF_WINDOW', () => {
    setup();
    fill();
    component.addTransaction();
    component.transactions.at(1).patchValue({ date: '2026-09-20', amount: '10', description: 'Deposit' });
    serviceStub.createManualStatement.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { code: 'STATEMENT_TRANSACTION_OUT_OF_WINDOW', fieldErrors: [{ field: 'transactions[1]', message: '2026-09-20' }] },
          }),
      ),
    );

    click(query('entry-submit'));

    expect(query('entry-failure')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.ERROR.TRANSACTION_OUT_OF_WINDOW');
    expect(el.querySelector('[data-index="1"]')?.classList.contains('row--flagged')).toBe(true);
    expect(el.querySelector('[data-index="0"]')?.classList.contains('row--flagged')).toBe(false);
  });

  it('opens the gap acknowledgement on 422 STATEMENT_NOT_CONTIGUOUS and sends it once long enough', () => {
    setup();
    fill();
    serviceStub.createManualStatement.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'STATEMENT_NOT_CONTIGUOUS' } })),
    );
    click(query('entry-submit'));
    expect(query('gap-prompt')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.GAP.NOT_CONTIGUOUS');
    expect((query('entry-submit') as HTMLButtonElement).disabled).toBe(true);

    serviceStub.createManualStatement.mockReturnValueOnce(of(created({ reconciliations: [] })));
    component.form.controls.gapAcknowledgement.setValue('Bank changed on Sept 1');
    fixture.detectChanges();
    click(query('entry-submit'));

    expect(serviceStub.createManualStatement.mock.calls[1][0].gapAcknowledgement).toBe('Bank changed on Sept 1');
    expect(navigate).toHaveBeenCalledWith(['/app', 'accounting', 'bank-accounts']);
  });

  it('refuses a transaction without a readable amount before asking the server', () => {
    setup();
    fill();
    component.transactions.at(0).patchValue({ amount: 'fifty' });

    component.submit();
    fixture.detectChanges();

    expect(serviceStub.createManualStatement).not.toHaveBeenCalled();
    expect(query('form-error')?.textContent?.trim()).toBe('ACCOUNTING.BANK_STATEMENT_ENTRY.ERROR.TRANSACTIONS');
  });

  it('refuses in the handler without the adjust permission', () => {
    authStub.granted = [];
    setup();
    fill();

    component.submit();

    expect(serviceStub.createManualStatement).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-08-31', '2026-09-01'],
    ['2026-12-31', '2027-01-01'],
    ['2028-02-28', '2028-02-29'],
    [null, ''],
  ])('nextDay(%s) is %s', (input, expected) => {
    expect(nextDay(input)).toBe(expected);
  });
});
