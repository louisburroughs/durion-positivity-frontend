import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BankAccountResponse,
  BankAccountsService as BankAccountsSdk,
  BankImportResponse,
  BankImportResponseStatusEnum,
  BankImportRowResponse,
  BankImportRowResponseRowStatusEnum,
  BankImportsService as BankImportsSdk,
  BankReconciliationService as BankReconciliationSdk,
  BankStatementResponse,
  BankStatementResponseStatusEnum,
  BankStatementsService as BankStatementsSdk,
} from '@durion-sdk/accounting';
import { BankAccount, BankImport, BankStatement, ImportRowPage } from '../models/bank-reconciliation.models';
import { BankReconciliationService, toBankRecFailure } from './bank-reconciliation.service';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const sdkAccount = (overrides: Partial<BankAccountResponse> = {}): BankAccountResponse => ({
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

const sdkImport = (overrides: Partial<BankImportResponse> = {}): BankImportResponse => ({
  importId: 'imp-1',
  glAccountId: 'gl-1010',
  glAccountCode: '1010',
  glAccountName: 'Operating Checking',
  status: BankImportResponseStatusEnum.Uploaded,
  mappingRequired: true,
  columns: ['Posted Date', 'Payee', 'Debit', 'Credit'],
  columnMapping: { date: 'Posted Date', description: 'Payee', debit: 'Debit', credit: 'Credit', unknownRole: 'X' },
  signConvention: 'DEBIT_CREDIT_COLUMNS',
  currency: 'USD',
  statement: { startDate: '2026-09-01', endDate: '2026-09-30', openingBalance: 1000, closingBalance: 1200 },
  acceptedCount: 0,
  rejectedCount: 0,
  skippedCount: 0,
  possibleDuplicateCount: 0,
  outOfWindowCount: 0,
  rowCount: 4,
  createdAt: '2026-09-29T10:00:00Z',
  createdBy: 'preparer',
  fileSha256: 'abc',
  filePurged: false,
  formatCode: 'CSV',
  replayed: false,
  requestId: 'req-1',
  version: 3,
  ...overrides,
});

const sdkStatement = (overrides: Partial<BankStatementResponse> = {}): BankStatementResponse => ({
  statementId: 'st-8',
  glAccountId: 'gl-1010',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  openingBalance: 900,
  closingBalance: 1000,
  currency: 'USD',
  status: BankStatementResponseStatusEnum.Committed,
  reconciliations: [{ reconciliationId: 'rec-8', status: 'FINALIZED' }, { status: 'IN_PROGRESS' }],
  ...overrides,
});

describe('BankReconciliationService', () => {
  let service: BankReconciliationService;

  const accountsSdk = { listBankAccounts: vi.fn(), setBankAccountProfile: vi.fn() };
  const importsSdk = {
    createBankImport: vi.fn(),
    getBankImport: vi.fn(),
    setBankImportMapping: vi.fn(),
    listBankImportRows: vi.fn(),
    updateBankImportRow: vi.fn(),
    commitBankImport: vi.fn(),
    discardBankImport: vi.fn(),
  };
  const statementsSdk = { listBankStatements: vi.fn(), getBankStatement: vi.fn(), createBankStatement: vi.fn() };
  const reconciliationSdk = { createReconciliation: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BankReconciliationService,
        { provide: BankAccountsSdk, useValue: accountsSdk },
        { provide: BankImportsSdk, useValue: importsSdk },
        { provide: BankStatementsSdk, useValue: statementsSdk },
        { provide: BankReconciliationSdk, useValue: reconciliationSdk },
      ],
    });
    service = TestBed.inject(BankReconciliationService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('listBankAccounts()', () => {
    it('maps every served field and orders by account code, dropping rows without an id', () => {
      accountsSdk.listBankAccounts.mockReturnValueOnce(
        of({
          accounts: [
            sdkAccount({ glAccountId: 'gl-1020', accountCode: '1020', reconciliationBaselineDate: undefined }),
            sdkAccount(),
            sdkAccount({ glAccountId: undefined }),
          ],
          pageNumber: 0,
          pageSize: 200,
          totalElements: 3,
          totalPages: 1,
        }),
      );

      let accounts: BankAccount[] = [];
      service.listBankAccounts().subscribe(value => (accounts = value));

      expect(accounts.map(a => a.accountCode)).toEqual(['1010', '1020']);
      expect(accounts[0]).toEqual({
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
      });
      expect(accounts[1].reconciliationBaselineDate).toBeNull();
    });
  });

  it('reads every page the server reports, not only the first', () => {
    const page = (n: number, codes: string[]) =>
      of({
        accounts: codes.map(code => sdkAccount({ glAccountId: `gl-${code}`, accountCode: code })),
        pageNumber: n,
        pageSize: 200,
        totalElements: 3,
        totalPages: 2,
      });
    accountsSdk.listBankAccounts.mockImplementation((n: number) => (n === 0 ? page(0, ['1030', '1010']) : page(1, ['1020'])));

    let accounts: BankAccount[] = [];
    service.listBankAccounts().subscribe(value => (accounts = value));

    expect(accountsSdk.listBankAccounts.mock.calls).toEqual([
      [0, 200],
      [1, 200],
    ]);
    expect(accounts.map(a => a.accountCode)).toEqual(['1010', '1020', '1030']);
  });

  it('sends the profile with its currency and leaves blank fields out', () => {
    accountsSdk.setBankAccountProfile.mockReturnValueOnce(of({}));

    service.setBankAccountProfile('gl-1010', { bankName: 'First Bank', accountMask: null, currency: 'USD' }).subscribe();

    expect(accountsSdk.setBankAccountProfile).toHaveBeenCalledWith('gl-1010', {
      currency: 'USD',
      bankName: 'First Bank',
      accountMask: undefined,
    });
  });

  it('lists statements most recent first with their reconciliation links', () => {
    statementsSdk.listBankStatements.mockReturnValueOnce(
      of({
        statements: [sdkStatement({ statementId: 'st-7', endDate: '2026-07-31' }), sdkStatement()],
        pageNumber: 0,
        pageSize: 200,
        totalElements: 2,
        totalPages: 1,
      }),
    );

    let statements: BankStatement[] = [];
    service.listStatements('gl-1010').subscribe(value => (statements = value));

    expect(statementsSdk.listBankStatements).toHaveBeenCalledWith('gl-1010', undefined, undefined, 0, 200);
    expect(statements.map(s => s.statementId)).toEqual(['st-8', 'st-7']);
    expect(statements[0].reconciliations).toEqual([{ reconciliationId: 'rec-8', status: 'FINALIZED' }]);
    expect(statements[0].status).toBe('COMMITTED');
  });

  describe('createImport()', () => {
    it('posts the CSV with a UUIDv7 requestId, the header, the acknowledgement and the supersession', () => {
      importsSdk.createBankImport.mockReturnValueOnce(of(sdkImport()));

      let created: BankImport | undefined;
      service
        .createImport({
          glAccountId: 'gl-1010',
          fileName: 'sept.csv',
          contentType: 'text/csv',
          content: 'ZGF0ZQ==',
          statement: { startDate: '2026-09-01', endDate: '2026-09-30', openingBalance: 1000, closingBalance: 1200, statementRef: null },
          gapAcknowledgement: 'First statement for this account',
          supersession: { supersedesStatementId: 'st-8', supersessionJustification: 'Bank reissued the statement' },
        })
        .subscribe(value => (created = value));

      const body = importsSdk.createBankImport.mock.calls[0][0];
      expect(body.requestId).toMatch(UUID_V7);
      expect(body).toMatchObject({
        glAccountId: 'gl-1010',
        formatCode: 'CSV',
        fileName: 'sept.csv',
        contentType: 'text/csv',
        content: 'ZGF0ZQ==',
        statement: { startDate: '2026-09-01', endDate: '2026-09-30', openingBalance: 1000, closingBalance: 1200, statementRef: undefined },
        gapAcknowledgement: 'First statement for this account',
        supersedesStatementId: 'st-8',
        supersessionJustification: 'Bank reissued the statement',
      });
      expect(created?.columnMapping).toEqual({ date: 'Posted Date', description: 'Payee', debit: 'Debit', credit: 'Credit' });
      expect(created?.mappingRequired).toBe(true);
      expect(created?.version).toBe(3);
    });

    it('sends neither an acknowledgement nor supersession fields when there are none', () => {
      importsSdk.createBankImport.mockReturnValueOnce(of(sdkImport()));

      service
        .createImport({
          glAccountId: 'gl-1010',
          fileName: 'sept.csv',
          contentType: null,
          content: 'eA==',
          statement: { startDate: '2026-09-01', endDate: '2026-09-30', openingBalance: 1000, closingBalance: 1200, statementRef: 'S-9' },
          gapAcknowledgement: null,
          supersession: null,
        })
        .subscribe();

      const body = importsSdk.createBankImport.mock.calls[0][0];
      expect(body.gapAcknowledgement).toBeUndefined();
      expect('supersedesStatementId' in body).toBe(false);
      expect('supersessionJustification' in body).toBe(false);
    });
  });

  it('resends the stored acknowledgement and the version with a new mapping', () => {
    importsSdk.setBankImportMapping.mockReturnValueOnce(of(sdkImport({ status: BankImportResponseStatusEnum.Validated })));

    service
      .setMapping('imp-1', {
        columnMapping: { date: 'Posted Date', amount: 'Amount' },
        signConvention: 'SIGNED_AMOUNT_INVERTED',
        dateFormat: null,
        saveAsAccountDefault: true,
        gapAcknowledgement: 'First statement for this account',
        version: 3,
      })
      .subscribe();

    expect(importsSdk.setBankImportMapping).toHaveBeenCalledWith('imp-1', {
      columnMapping: { date: 'Posted Date', amount: 'Amount' },
      signConvention: 'SIGNED_AMOUNT_INVERTED',
      dateFormat: undefined,
      saveAsAccountDefault: true,
      gapAcknowledgement: 'First statement for this account',
      version: 3,
    });
  });

  it('reads a rows page by status and keeps raw values beside corrected ones', () => {
    const row: BankImportRowResponse = {
      rowId: 'row-3',
      importId: 'imp-1',
      rowNumber: 3,
      rowStatus: BankImportRowResponseRowStatusEnum.Corrected,
      rawValues: { 'Posted Date': '31/13/2026' },
      correctedValues: { date: '2026-09-30' },
      date: '2026-09-30',
    };
    importsSdk.listBankImportRows.mockReturnValueOnce(
      of({ rows: [row], columns: ['Posted Date'], pageNumber: 0, pageSize: 50, totalElements: 1, totalPages: 1 }),
    );

    let page: ImportRowPage | undefined;
    service.listRows('imp-1', 'REJECTED', 0, 50).subscribe(value => (page = value));

    expect(importsSdk.listBankImportRows).toHaveBeenCalledWith('imp-1', 'REJECTED', 0, 50);
    expect(page?.rows[0].rawValues).toEqual({ 'Posted Date': '31/13/2026' });
    expect(page?.rows[0].correctedValues).toEqual({ date: '2026-09-30' });
    expect(page?.rows[0].rowStatus).toBe('CORRECTED');
  });

  it('sends a row correction, a skip and a duplicate decision with the version', () => {
    importsSdk.updateBankImportRow.mockReturnValue(of({ rowId: 'row-3', importId: 'imp-1', rowNumber: 3, rawValues: {} }));

    service.correctRow('imp-1', 'row-3', { date: '2026-09-30', signedAmount: -12.5 }, 4).subscribe();
    service.skipRow('imp-1', 'row-4', 'Bank fee reversed same day', 5).subscribe();
    service.decideDuplicate('imp-1', 'row-5', 'DISTINCT', 6).subscribe();

    expect(importsSdk.updateBankImportRow.mock.calls).toEqual([
      ['imp-1', 'row-3', { correctedValues: { date: '2026-09-30', signedAmount: -12.5 }, version: 4 }],
      ['imp-1', 'row-4', { skip: true, reason: 'Bank fee reversed same day', version: 5 }],
      ['imp-1', 'row-5', { duplicateDecision: 'DISTINCT', version: 6 }],
    ]);
  });

  it('commits with the bulk duplicate decisions and returns every segment statement', () => {
    importsSdk.commitBankImport.mockReturnValueOnce(
      of({
        importId: 'imp-1',
        statementId: 'st-9b',
        statementIds: ['st-9a', 'st-9b'],
        reconciliationId: 'rec-9',
        bankTransactionCount: 240,
        possibleDuplicateCount: 0,
        version: 5,
      }),
    );

    let result: { statementIds: readonly string[]; reconciliationId: string | null } | undefined;
    service
      .commitImport('imp-1', true, [{ rowNumber: 12, decision: 'DUPLICATE' }], 4)
      .subscribe(value => (result = value));

    expect(importsSdk.commitBankImport).toHaveBeenCalledWith('imp-1', {
      startReconciliation: true,
      duplicateDecisions: [{ rowNumber: 12, decision: 'DUPLICATE' }],
      version: 4,
    });
    expect(result?.statementIds).toEqual(['st-9a', 'st-9b']);
    expect(result?.reconciliationId).toBe('rec-9');
  });

  it('sends no duplicateDecisions when none were chosen', () => {
    importsSdk.commitBankImport.mockReturnValueOnce(
      of({ importId: 'imp-1', statementId: 'st-9', statementIds: ['st-9'], bankTransactionCount: 1, possibleDuplicateCount: 0, version: 5 }),
    );

    service.commitImport('imp-1', false, [], 4).subscribe();

    expect(importsSdk.commitBankImport).toHaveBeenCalledWith('imp-1', {
      startReconciliation: false,
      duplicateDecisions: undefined,
      version: 4,
    });
  });

  it('commits a manual statement with its transactions and a UUIDv7 requestId', () => {
    statementsSdk.createBankStatement.mockReturnValueOnce(of(sdkStatement({ statementId: 'st-10' })));

    service
      .createManualStatement({
        glAccountId: 'gl-1010',
        statement: { startDate: '2026-09-01', endDate: '2026-09-15', openingBalance: 1000, closingBalance: 950, statementRef: null },
        transactions: [{ date: '2026-09-03', signedAmount: -50, description: 'Check 1043', reference: null, checkNumber: '1043' }],
        gapAcknowledgement: null,
        supersession: null,
        startReconciliation: true,
      })
      .subscribe();

    const body = statementsSdk.createBankStatement.mock.calls[0][0];
    expect(body.requestId).toMatch(UUID_V7);
    expect(body).toMatchObject({
      glAccountId: 'gl-1010',
      startReconciliation: true,
      transactions: [{ date: '2026-09-03', signedAmount: -50, description: 'Check 1043', reference: undefined, checkNumber: '1043' }],
    });
  });

  it('starts a reconciliation of a committed statement', () => {
    reconciliationSdk.createReconciliation.mockReturnValueOnce(of({ reconciliationId: 'rec-11' }));

    let id: string | undefined;
    service.startReconciliation('gl-1010', 'st-8').subscribe(value => (id = value));

    const body = reconciliationSdk.createReconciliation.mock.calls[0][0];
    expect(body).toMatchObject({ glAccountId: 'gl-1010', statementId: 'st-8' });
    expect(body.requestId).toMatch(UUID_V7);
    expect(id).toBe('rec-11');
  });
});

describe('toBankRecFailure()', () => {
  it('reads the ApiError code, status, message and field errors', () => {
    const failure = toBankRecFailure(
      new HttpErrorResponse({
        status: 422,
        error: {
          code: 'IMPORT_NOT_COMMITTABLE',
          message: 'refused',
          fieldErrors: [
            { field: 'rows[12]', message: 'REJECTED' },
            { field: 'activityTotal', message: 'opening + activity = 9985.00, closing = 10000.00' },
          ],
        },
      }),
    );

    expect(failure).toEqual({
      code: 'IMPORT_NOT_COMMITTABLE',
      status: 422,
      message: 'refused',
      fieldErrors: [
        { field: 'rows[12]', message: 'REJECTED' },
        { field: 'activityTotal', message: 'opening + activity = 9985.00, closing = 10000.00' },
      ],
    });
  });

  it('reads a body without an ApiError, and a non-HTTP error, by status alone', () => {
    expect(toBankRecFailure(new HttpErrorResponse({ status: 503, error: 'down' }))).toEqual({
      code: null,
      status: 503,
      message: null,
      fieldErrors: [],
    });
    expect(toBankRecFailure(new Error('boom')).status).toBe(0);
  });
});
