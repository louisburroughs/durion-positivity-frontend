import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import {
  BankAccount,
  BankImport,
  BankStatement,
  ImportRow,
  ImportRowPage,
} from '../../models/bank-reconciliation.models';
import { BankReconciliationService } from '../../services/bank-reconciliation.service';
import { BankImportPageComponent } from './bank-import-page.component';

const ACCOUNT: BankAccount = {
  glAccountId: 'gl-1010',
  accountCode: '1010',
  accountName: 'Operating Checking',
  bankName: 'First Bank',
  accountMask: '4821',
  currency: 'USD',
  reconciliationBaselineDate: null,
  coverageFrontier: null,
  reconciledFrontier: null,
  unexplainedBankTransactionCount: 0,
  openOutstandingItemCount: 0,
  profileExists: true,
};

const imp = (overrides: Partial<BankImport> = {}): BankImport => ({
  importId: 'imp-1',
  glAccountId: 'gl-1010',
  accountCode: '1010',
  accountName: 'Operating Checking',
  status: 'UPLOADED',
  mappingRequired: true,
  columns: ['Posted Date', 'Payee', 'Debit', 'Credit'],
  columnMapping: {},
  signConvention: null,
  dateFormat: null,
  currency: 'USD',
  fileName: 'sept.csv',
  statement: { startDate: '2026-09-01', endDate: '2026-09-30', openingBalance: 1000, closingBalance: 1200, statementRef: null },
  gapAcknowledgement: 'First statement for this account',
  rowCount: 240,
  acceptedCount: 237,
  rejectedCount: 3,
  skippedCount: 0,
  possibleDuplicateCount: 0,
  outOfWindowCount: 0,
  preview: null,
  statementId: null,
  reconciliationId: null,
  discardReason: null,
  version: 3,
  ...overrides,
});

const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  rowId: 'row-12',
  rowNumber: 12,
  rowStatus: 'REJECTED',
  rawValues: { 'Posted Date': '31/13/2026', Payee: 'ACME', Debit: '12.50', Credit: '' },
  correctedValues: null,
  date: null,
  description: 'ACME',
  signedAmount: -12.5,
  reference: null,
  checkNumber: null,
  rejectionCode: 'DATE_UNPARSEABLE',
  skipReason: null,
  duplicateDecision: null,
  duplicateOfRowNumber: null,
  ...overrides,
});

const page = (rows: ImportRow[]): ImportRowPage => ({ rows, columns: [], pageNumber: 0, totalPages: 1, totalElements: rows.length });

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

const authStub = {
  known: true,
  granted: ['accounting:reconciliation:adjust'] as readonly string[],
  permissionsKnown(): boolean {
    return this.known;
  },
  hasAnyPermission(required: readonly string[]): boolean {
    return required.some(code => this.granted.includes(code));
  },
};

const serviceStub = {
  listBankAccounts: vi.fn(),
  listStatements: vi.fn(),
  getStatement: vi.fn(),
  createImport: vi.fn(),
  getImport: vi.fn(),
  setMapping: vi.fn(),
  listRows: vi.fn(),
  correctRow: vi.fn(),
  skipRow: vi.fn(),
  decideDuplicate: vi.fn(),
  commitImport: vi.fn(),
  discardImport: vi.fn(),
};

const httpError = (status: number, body: unknown = null): HttpErrorResponse => new HttpErrorResponse({ status, error: body });

describe('BankImportPageComponent', () => {
  let fixture: ComponentFixture<BankImportPageComponent>;
  let component: BankImportPageComponent;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;
  let params$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const setup = (params: Record<string, string>): void => {
    params$ = new BehaviorSubject(convertToParamMap(params));
    TestBed.configureTestingModule({
      imports: [BankImportPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BankReconciliationService, useValue: serviceStub },
        { provide: AuthService, useValue: authStub },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params$.asObservable(), snapshot: { paramMap: convertToParamMap(params) } },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BankImportPageComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  const query = (testId: string): HTMLElement | null => el.querySelector(`[data-testid="${testId}"]`);
  const all = (testId: string): HTMLElement[] => Array.from(el.querySelectorAll(`[data-testid="${testId}"]`));
  const click = (target: HTMLElement | null): void => {
    target?.click();
    fixture.detectChanges();
  };
  const fillHeader = (): void => {
    component.uploadForm.patchValue({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      openingBalance: '1000.00',
      closingBalance: '1200.00',
    });
    component.file.set(new File(['Date,Amount\n2026-09-02,200.00\n'], 'sept.csv', { type: 'text/csv' }));
    fixture.detectChanges();
  };
  /** The upload reads the file asynchronously (base64) before it posts. */
  const settle = async (): Promise<void> => {
    await vi.waitFor(() => expect(component.busy()).toBe(false));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    serviceStub.listBankAccounts.mockReturnValue(of([ACCOUNT]));
    serviceStub.listStatements.mockReturnValue(of([statement()]));
    serviceStub.getStatement.mockReturnValue(of(statement()));
    serviceStub.listRows.mockReturnValue(of(page([row()])));
  });

  afterEach(() => {
    vi.clearAllMocks();
    authStub.granted = ['accounting:reconciliation:adjust'];
    TestBed.resetTestingModule();
  });

  describe('upload (§4.2, §4.3)', () => {
    it('uploads the file with its header and moves to the import', async () => {
      setup({ glAccountId: 'gl-1010' });
      serviceStub.createImport.mockReturnValue(of(imp()));
      expect((query('upload-submit') as HTMLButtonElement).disabled).toBe(true);

      fillHeader();
      click(query('upload-submit'));
      await settle();

      expect(serviceStub.createImport).toHaveBeenCalledWith({
        glAccountId: 'gl-1010',
        fileName: 'sept.csv',
        contentType: 'text/csv',
        content: btoa('Date,Amount\n2026-09-02,200.00\n'),
        statement: { startDate: '2026-09-01', endDate: '2026-09-30', openingBalance: 1000, closingBalance: 1200, statementRef: null },
        gapAcknowledgement: null,
        supersession: null,
      });
      expect(navigate).toHaveBeenCalledWith(['/app', 'accounting', 'bank-imports', 'imp-1'], { replaceUrl: true });
    });

    it("prompts for the acknowledgement on the account's first statement, with the baseline copy (AC4)", async () => {
      setup({ glAccountId: 'gl-1010' });
      serviceStub.createImport.mockReturnValueOnce(
        throwError(() => httpError(422, { code: 'STATEMENT_NOT_CONTIGUOUS', fieldErrors: [] })),
      );
      expect(query('gap-prompt')).toBeNull();

      fillHeader();
      click(query('upload-submit'));
      await settle();

      expect(query('gap-prompt')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.GAP.FIRST_STATEMENT');
      expect(query('import-failure')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.ERROR.STATEMENT_NOT_CONTIGUOUS');
      const submit = query('upload-submit') as HTMLButtonElement;
      component.uploadForm.controls.gapAcknowledgement.setValue('too short');
      fixture.detectChanges();
      expect(submit.disabled).toBe(true);

      serviceStub.createImport.mockReturnValueOnce(of(imp()));
      component.uploadForm.controls.gapAcknowledgement.setValue('First statement for this account');
      fixture.detectChanges();
      click(submit);
      await settle();

      expect(serviceStub.createImport.mock.calls[1][0].gapAcknowledgement).toBe('First statement for this account');
    });

    it('shows the expected opening balance for a statement that does not continue the previous one', async () => {
      serviceStub.listBankAccounts.mockReturnValue(of([{ ...ACCOUNT, coverageFrontier: '2026-08-31' }]));
      setup({ glAccountId: 'gl-1010' });
      serviceStub.createImport.mockReturnValueOnce(
        throwError(() =>
          httpError(422, {
            code: 'STATEMENT_NOT_CONTIGUOUS',
            fieldErrors: [{ field: 'openingBalance', message: 'expected 12345.67' }],
          }),
        ),
      );

      fillHeader();
      click(query('upload-submit'));
      await settle();

      expect(query('gap-prompt')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.GAP.NOT_CONTIGUOUS');
      expect(query('gap-expected')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.GAP.EXPECTED');
      expect(query('import-failure-detail')?.textContent).toBe('expected 12345.67');
    });

    it('removes the acknowledgement on 422 STATEMENT_GAP_ACKNOWLEDGEMENT_NOT_APPLICABLE', async () => {
      setup({ glAccountId: 'gl-1010' });
      serviceStub.createImport
        .mockReturnValueOnce(throwError(() => httpError(422, { code: 'STATEMENT_NOT_CONTIGUOUS' })))
        .mockReturnValueOnce(throwError(() => httpError(422, { code: 'STATEMENT_GAP_ACKNOWLEDGEMENT_NOT_APPLICABLE' })));

      fillHeader();
      click(query('upload-submit'));
      await settle();
      component.uploadForm.controls.gapAcknowledgement.setValue('First statement for this account');
      fixture.detectChanges();
      click(query('upload-submit'));
      await settle();

      expect(query('gap-prompt')).toBeNull();
      expect(component.uploadForm.controls.gapAcknowledgement.value).toBe('');
      expect(query('import-failure')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.ERROR.GAP_ACKNOWLEDGEMENT_NOT_APPLICABLE');
    });

    it('refuses a header whose balances are not numbers, before asking the server', () => {
      setup({ glAccountId: 'gl-1010' });
      fillHeader();
      component.uploadForm.controls.openingBalance.setValue('about a thousand');

      component.upload();
      fixture.detectChanges();

      expect(serviceStub.createImport).not.toHaveBeenCalled();
      expect(query('upload-error')?.textContent?.trim()).toBe('ACCOUNTING.BANK_IMPORT.UPLOAD.ERROR.HEADER');
    });
  });

  describe('replace a committed statement (§4.9 path 3, AC12)', () => {
    const enableSupersede = (): void => {
      click(query('supersede-toggle'));
    };

    it('lists only COMMITTED statements and warns when a FINALIZED reconciliation will be invalidated', () => {
      serviceStub.listStatements.mockReturnValue(of([statement(), statement({ statementId: 'st-7', status: 'SUPERSEDED' })]));
      serviceStub.getStatement.mockReturnValue(of(statement({ reconciliations: [{ reconciliationId: 'rec-8', status: 'FINALIZED' }] })));
      setup({ glAccountId: 'gl-1010' });

      enableSupersede();
      const select = query('supersede-statement') as HTMLSelectElement;
      expect(Array.from(select.options).map(o => o.value)).toEqual(['', 'st-8']);
      select.value = 'st-8';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(serviceStub.getStatement).toHaveBeenCalledWith('st-8');
      expect(query('supersede-invalidates')).not.toBeNull();
    });

    it('keeps upload disabled until the justification reaches 10 characters, then sends both fields', async () => {
      setup({ glAccountId: 'gl-1010' });
      serviceStub.createImport.mockReturnValue(of(imp()));
      fillHeader();
      enableSupersede();
      const select = query('supersede-statement') as HTMLSelectElement;
      select.value = 'st-8';
      select.dispatchEvent(new Event('change'));
      const justification = query('supersede-justification') as HTMLTextAreaElement;
      justification.value = 'too short';
      justification.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect((query('upload-submit') as HTMLButtonElement).disabled).toBe(true);

      justification.value = 'Bank reissued the statement';
      justification.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect((query('upload-submit') as HTMLButtonElement).disabled).toBe(false);
      click(query('upload-submit'));
      await settle();

      expect(serviceStub.createImport.mock.calls[0][0].supersession).toEqual({
        supersedesStatementId: 'st-8',
        supersessionJustification: 'Bank reissued the statement',
      });
    });

    it.each([
      [422, 'STATEMENT_SUPERSESSION_NOT_ELIGIBLE', 'ACCOUNTING.BANK_IMPORT.ERROR.SUPERSESSION_NOT_ELIGIBLE', 2],
      [409, 'RECONCILIATION_WINDOW_ALREADY_RECONCILED', 'ACCOUNTING.BANK_IMPORT.ERROR.WINDOW_ALREADY_RECONCILED', 1],
    ])('classifies %s %s, re-reading the statements only when the choice is stale', async (status, code, key, reads) => {
      setup({ glAccountId: 'gl-1010' });
      serviceStub.createImport.mockReturnValue(throwError(() => httpError(status, { code })));
      fillHeader();
      enableSupersede();
      const select = query('supersede-statement') as HTMLSelectElement;
      select.value = 'st-8';
      select.dispatchEvent(new Event('change'));
      const justification = query('supersede-justification') as HTMLTextAreaElement;
      justification.value = 'Bank reissued the statement';
      justification.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      click(query('upload-submit'));
      await settle();

      expect(query('import-failure')?.textContent).toContain(key);
      expect(serviceStub.listStatements).toHaveBeenCalledTimes(reads);
    });
  });

  describe('mapping (§4.3, §4.4)', () => {
    it('lands on the mapping step with the raw columns when mapping is required, and re-parses to VALIDATED (AC1)', () => {
      serviceStub.getImport.mockReturnValue(of(imp()));
      setup({ importId: 'imp-1' });

      expect(component.step()).toBe('mapping');
      expect(query('mapping-required')).not.toBeNull();
      expect(query('raw-columns')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.MAPPING.COLUMNS');
      expect(Array.from((query('map-date') as HTMLSelectElement).options).map(o => o.value)).toEqual([
        '',
        'Posted Date',
        'Payee',
        'Debit',
        'Credit',
      ]);

      serviceStub.setMapping.mockReturnValue(of(imp({ status: 'VALIDATED', mappingRequired: false })));
      component.mappingForm.patchValue({
        date: 'Posted Date',
        description: 'Payee',
        debit: 'Debit',
        credit: 'Credit',
        signConvention: 'DEBIT_CREDIT_COLUMNS',
      });
      click(query('mapping-submit'));

      expect(serviceStub.setMapping).toHaveBeenCalledWith('imp-1', {
        columnMapping: { date: 'Posted Date', description: 'Payee', debit: 'Debit', credit: 'Credit' },
        signConvention: 'DEBIT_CREDIT_COLUMNS',
        dateFormat: null,
        saveAsAccountDefault: false,
        gapAcknowledgement: 'First statement for this account',
        version: 3,
      });
      expect(component.step()).toBe('rows');
    });

    it('shows the served signs and running total without adding anything up (AC2)', () => {
      // Deliberately inconsistent figures: the page must print the served ones, not recompute them.
      serviceStub.getImport.mockReturnValue(
        of(
          imp({
            signConvention: 'DEBIT_CREDIT_COLUMNS',
            preview: {
              ties: false,
              firstRows: [
                { rowNumber: 1, date: '2026-09-02', description: 'Deposit', signedAmount: 200, runningBalance: 1200, rowStatus: 'PARSED' },
                { rowNumber: 2, date: '2026-09-03', description: 'Fee', signedAmount: -15, runningBalance: 7777, rowStatus: 'PARSED' },
              ],
              segments: [
                {
                  startDate: '2026-09-01',
                  endDate: '2026-09-30',
                  openingBalance: 1000,
                  activityTotal: 185,
                  expectedClosing: 1185,
                  closingBalance: 1200,
                  difference: -15,
                  ties: false,
                  transactionCount: 2,
                },
              ],
            },
          }),
        ),
      );
      setup({ importId: 'imp-1' });

      expect(all('preview-amount').map(cell => cell.textContent?.trim())).toEqual(['$200.00', '-$15.00']);
      expect(all('preview-running').map(cell => cell.textContent?.trim())).toEqual(['$1,200.00', '$7,777.00']);
      expect(query('segment-expected')?.textContent?.trim()).toBe('$1,185.00');
      expect(query('segment-difference')?.textContent?.trim()).toBe('-$15.00');
      expect(query('segment-off')).not.toBeNull();
    });

    it('keeps writes disabled against the stale version until the re-read lands', () => {
      serviceStub.getImport.mockReturnValueOnce(of(imp()));
      setup({ importId: 'imp-1' });
      const reread = new Subject<BankImport>();
      serviceStub.getImport.mockReturnValue(reread);
      serviceStub.setMapping.mockReturnValue(throwError(() => httpError(409, { code: 'OPTIMISTIC_LOCK' })));

      click(query('mapping-submit'));
      expect(component.busy()).toBe(true);
      expect((query('mapping-submit') as HTMLButtonElement).disabled).toBe(true);

      reread.next(imp({ version: 4 }));
      fixture.detectChanges();
      expect(component.busy()).toBe(false);
    });

    it('keeps the wizard on screen when a background re-read fails', () => {
      serviceStub.getImport.mockReturnValueOnce(of(imp()));
      setup({ importId: 'imp-1' });
      serviceStub.getImport.mockReturnValue(throwError(() => httpError(500)));
      serviceStub.setMapping.mockReturnValue(throwError(() => httpError(409, { code: 'OPTIMISTIC_LOCK' })));

      click(query('mapping-submit'));

      expect(component.state()).toBe('ready');
      expect(query('step-mapping')).not.toBeNull();
      expect(query('import-failure')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.ERROR.REFRESH');
    });

    it('re-reads the import on 409 OPTIMISTIC_LOCK', () => {
      serviceStub.getImport.mockReturnValue(of(imp()));
      setup({ importId: 'imp-1' });
      serviceStub.setMapping.mockReturnValue(throwError(() => httpError(409, { code: 'OPTIMISTIC_LOCK' })));

      click(query('mapping-submit'));

      expect(query('import-failure')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.ERROR.OPTIMISTIC_LOCK');
      expect(serviceStub.getImport).toHaveBeenCalledTimes(2);
    });
  });

  describe('rows and commit (§4.4)', () => {
    it('keeps raw values beside a correction and enables commit once no row is rejected (AC3)', () => {
      serviceStub.getImport.mockReturnValueOnce(of(imp({ status: 'VALIDATED', mappingRequired: false })));
      setup({ importId: 'imp-1' });

      expect(query('raw-values')?.textContent).toContain('31/13/2026');
      expect(query('rejection')?.textContent).toContain('ACCOUNTING.BANK_IMPORT.REJECTION.DATE_UNPARSEABLE');
      const commit = query('commit') as HTMLButtonElement;
      expect(commit.disabled).toBe(true);

      click(query('correct-row'));
      expect((query('row-dialog') as HTMLDialogElement).matches(':modal')).toBe(true);
      expect(query('dialog-raw-values')?.textContent).toContain('31/13/2026');
      serviceStub.correctRow.mockReturnValue(of(row({ rowStatus: 'CORRECTED' })));
      serviceStub.getImport.mockReturnValue(of(imp({ status: 'VALIDATED', mappingRequired: false, rejectedCount: 0, version: 4 })));
      serviceStub.listRows.mockReturnValue(
        of(page([row({ rowStatus: 'CORRECTED', correctedValues: { date: '2026-09-30' }, date: '2026-09-30', rejectionCode: null })])),
      );
      component.correctForm.patchValue({ date: '2026-09-30' });
      click(query('confirm-correct'));

      expect(serviceStub.correctRow).toHaveBeenCalledWith(
        'imp-1',
        'row-12',
        { date: '2026-09-30', signedAmount: -12.5, description: 'ACME' },
        3,
      );
      expect(query('raw-values')?.textContent).toContain('31/13/2026');
      expect(query('corrected-values')).not.toBeNull();
      expect((query('commit') as HTMLButtonElement).disabled).toBe(false);
    });

    it('skips a row with a reason', () => {
      serviceStub.getImport.mockReturnValue(of(imp({ status: 'VALIDATED' })));
      setup({ importId: 'imp-1' });
      serviceStub.skipRow.mockReturnValue(of(row({ rowStatus: 'SKIPPED' })));

      click(query('skip-row'));
      expect((query('confirm-reason') as HTMLButtonElement).disabled).toBe(true);
      component.reasonControl.setValue('Reversed the same day');
      fixture.detectChanges();
      click(query('confirm-reason'));

      expect(serviceStub.skipRow).toHaveBeenCalledWith('imp-1', 'row-12', 'Reversed the same day', 3);
    });

    it('decides a possible duplicate per row', () => {
      serviceStub.getImport.mockReturnValue(of(imp({ status: 'VALIDATED', rejectedCount: 0 })));
      serviceStub.listRows.mockReturnValue(of(page([row({ rowStatus: 'POSSIBLE_DUPLICATE', rejectionCode: null, duplicateOfRowNumber: 4 })])));
      setup({ importId: 'imp-1' });
      serviceStub.decideDuplicate.mockReturnValue(of(row()));

      click(query('decide-distinct'));

      expect(serviceStub.decideDuplicate).toHaveBeenCalledWith('imp-1', 'row-12', 'DISTINCT', 3);
    });

    it('commits and opens the reconciliation it started', () => {
      serviceStub.getImport.mockReturnValue(of(imp({ status: 'VALIDATED', rejectedCount: 0 })));
      setup({ importId: 'imp-1' });
      serviceStub.commitImport.mockReturnValue(
        of({ statementId: 'st-9', statementIds: ['st-9'], reconciliationId: 'rec-9', bankTransactionCount: 240, possibleDuplicateCount: 0 }),
      );

      click(query('commit'));

      expect(serviceStub.commitImport).toHaveBeenCalledWith('imp-1', true, [], 3);
      expect(navigate).toHaveBeenCalledWith(['/app', 'accounting', 'reconciliations', 'rec-9']);
    });

    it('sends a bulk decision for every undecided possible duplicate', () => {
      serviceStub.getImport.mockReturnValue(of(imp({ status: 'VALIDATED', rejectedCount: 0, possibleDuplicateCount: 2 })));
      setup({ importId: 'imp-1' });
      serviceStub.listRows.mockReturnValue(
        of(page([row({ rowNumber: 20, rowStatus: 'POSSIBLE_DUPLICATE' }), row({ rowNumber: 21, duplicateDecision: 'DUPLICATE' })])),
      );
      serviceStub.commitImport.mockReturnValue(
        of({ statementId: 'st-9', statementIds: ['st-9'], reconciliationId: null, bankTransactionCount: 240, possibleDuplicateCount: 0 }),
      );

      component.commitForm.patchValue({ duplicates: 'DISTINCT', startReconciliation: false });
      click(query('commit'));

      expect(serviceStub.listRows).toHaveBeenLastCalledWith('imp-1', 'POSSIBLE_DUPLICATE', 0, 2);
      expect(serviceStub.commitImport).toHaveBeenCalledWith('imp-1', false, [{ rowNumber: 20, decision: 'DISTINCT' }], 3);
      expect(navigate).toHaveBeenCalledWith(['/app', 'accounting', 'bank-accounts']);
    });

    it('highlights the rows and shows the activity-total message verbatim on IMPORT_NOT_COMMITTABLE', () => {
      serviceStub.getImport.mockReturnValue(of(imp({ status: 'VALIDATED', rejectedCount: 0 })));
      setup({ importId: 'imp-1' });
      serviceStub.commitImport.mockReturnValue(
        throwError(() =>
          httpError(422, {
            code: 'IMPORT_NOT_COMMITTABLE',
            fieldErrors: [
              { field: 'rows[12]', message: 'OUT_OF_WINDOW' },
              { field: 'activityTotal', message: 'opening + activity = 9985.00, closing = 10000.00' },
            ],
          }),
        ),
      );

      click(query('commit'));

      expect(query('import-failure-detail')?.textContent).toBe('opening + activity = 9985.00, closing = 10000.00');
      expect(component.flaggedRows().has(12)).toBe(true);
      expect(el.querySelector('[data-row="12"]')?.classList.contains('row--flagged')).toBe(true);
    });

    it('moves focus to the rows heading after a row write lands', async () => {
      serviceStub.getImport.mockReturnValue(of(imp({ status: 'VALIDATED' })));
      setup({ importId: 'imp-1' });
      serviceStub.skipRow.mockReturnValue(of(row({ rowStatus: 'SKIPPED' })));

      click(query('skip-row'));
      component.reasonControl.setValue('Reversed the same day');
      fixture.detectChanges();
      click(query('confirm-reason'));
      await fixture.whenStable();

      expect(document.activeElement?.id).toBe('rows-heading');
    });

    it('moves focus to the read-only outcome after a discard', async () => {
      serviceStub.getImport.mockReturnValue(of(imp({ status: 'VALIDATED' })));
      setup({ importId: 'imp-1' });
      serviceStub.discardImport.mockReturnValue(of(imp({ status: 'DISCARDED', discardReason: 'Wrong account' })));

      click(query('discard'));
      component.reasonControl.setValue('Wrong account');
      fixture.detectChanges();
      click(query('confirm-reason'));
      await fixture.whenStable();

      expect(document.activeElement?.id).toBe('done-heading');
    });

    it('starts over when the route key changes', () => {
      serviceStub.getImport.mockReturnValueOnce(of(imp({ status: 'VALIDATED' })));
      setup({ importId: 'imp-1' });
      serviceStub.getImport.mockReturnValue(of(imp({ importId: 'imp-2', status: 'UPLOADED' })));

      params$.next(convertToParamMap({ importId: 'imp-2' }));
      fixture.detectChanges();

      expect(component.bankImport()?.importId).toBe('imp-2');
      expect(component.step()).toBe('mapping');
    });

    it('discards with a reason and shows the import read-only', () => {
      serviceStub.getImport.mockReturnValue(of(imp({ status: 'VALIDATED' })));
      setup({ importId: 'imp-1' });
      serviceStub.discardImport.mockReturnValue(of(imp({ status: 'DISCARDED', discardReason: 'Wrong account' })));

      click(query('discard'));
      component.reasonControl.setValue('Wrong account');
      fixture.detectChanges();
      click(query('confirm-reason'));

      expect(serviceStub.discardImport).toHaveBeenCalledWith('imp-1', 'Wrong account', 3);
      expect(component.step()).toBe('done');
      expect(query('discarded')).not.toBeNull();
      expect(query('commit')).toBeNull();
    });
  });

  it('refuses every write in its handler without the adjust permission', () => {
    authStub.granted = [];
    serviceStub.getImport.mockReturnValue(of(imp({ status: 'VALIDATED', rejectedCount: 0 })));
    setup({ importId: 'imp-1' });

    component.commit();
    component.saveMapping();
    component.openDiscard();
    component.decideDuplicate(row(), 'DISTINCT');

    expect(serviceStub.commitImport).not.toHaveBeenCalled();
    expect(serviceStub.setMapping).not.toHaveBeenCalled();
    expect(serviceStub.decideDuplicate).not.toHaveBeenCalled();
    expect(component.rowDialog()).toBeNull();
    expect((query('commit') as HTMLButtonElement).disabled).toBe(true);
  });
});
