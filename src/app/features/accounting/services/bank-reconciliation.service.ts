import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import {
  ApiError,
  BankAccountResponse,
  BankAccountsService as BankAccountsSdk,
  BankImportPreview,
  BankImportResponse,
  BankImportRowResponse,
  BankImportDuplicateDecisionDecisionEnum,
  BankImportRowUpdateRequestDuplicateDecisionEnum,
  BankImportsService as BankImportsSdk,
  BankImportStatementHeader,
  BankReconciliationService as BankReconciliationSdk,
  BankStatementResponse,
  BankStatementsService as BankStatementsSdk,
} from '@durion-sdk/accounting';
import {
  BankAccount,
  BankAccountProfileInput,
  BankImport,
  BankImportStatus,
  BankRecFailure,
  BankStatement,
  BankStatementSource,
  BankStatementStatus,
  COLUMN_ROLES,
  ColumnMapping,
  DuplicateDecision,
  IMPORT_ROW_STATUSES,
  ImportCommitResult,
  ImportPreview,
  ImportRow,
  ImportRowCorrection,
  ImportRowPage,
  ImportRowStatus,
  ManualTransactionInput,
  SIGN_CONVENTIONS,
  SignConvention,
  StatementHeader,
  StatementSupersession,
} from '../models/bank-reconciliation.models';
import { uuidV7 } from '../utils/uuid-v7.util';

/** Enough for any tenant's bank accounts and an account's statements on one page. */
const LIST_PAGE_SIZE = 200;

/** The file and header of a statement import (§4.3). `content` is the file, base64-encoded. */
export interface BankImportUpload {
  readonly glAccountId: string;
  readonly fileName: string;
  readonly contentType: string | null;
  readonly content: string;
  readonly statement: StatementHeader;
  readonly gapAcknowledgement: string | null;
  readonly supersession: StatementSupersession | null;
}

/** The column mapping and parse options of the mapping step (§4.4). */
export interface BankImportMappingInput {
  readonly columnMapping: ColumnMapping;
  readonly signConvention: SignConvention;
  readonly dateFormat: string | null;
  readonly saveAsAccountDefault: boolean;
  /** Resent when the statement still has a gap: a mapping `PUT` without it drops the stored acknowledgement. */
  readonly gapAcknowledgement: string | null;
  readonly version: number;
}

/** A manual-entry statement (§4.3 fallback) and the phase-1 interim window (§4.1 d). */
export interface ManualStatementInput {
  readonly glAccountId: string;
  readonly statement: StatementHeader;
  readonly transactions: readonly ManualTransactionInput[];
  readonly gapAcknowledgement: string | null;
  readonly supersession: StatementSupersession | null;
  readonly startReconciliation: boolean;
}

/**
 * Manual bank reconciliation: bank accounts, statement imports and manual
 * statements (CAP-055, SPEC-manual-bank-reconciliation §4.1–§4.4, §4.9).
 *
 * Backed entirely by the generated `@durion-sdk/accounting` services
 * (ADR-0041). The backend enforces `accounting:reconciliation:view` on reads
 * and `accounting:reconciliation:adjust` on every write here; the pages gate
 * on the same codes through `ACCOUNTING_PAGE` / `ACCOUNTING_SECTION`. Every
 * write carries a fresh UUIDv7 `requestId` where the contract takes one, and
 * the current `version` where it takes one.
 */
@Injectable({ providedIn: 'root' })
export class BankReconciliationService {
  private readonly accountsSdk = inject(BankAccountsSdk);
  private readonly importsSdk = inject(BankImportsSdk);
  private readonly statementsSdk = inject(BankStatementsSdk);
  private readonly reconciliationSdk = inject(BankReconciliationSdk);

  /** Every reconcilable bank account, by account code, across every page the server reports. */
  listBankAccounts(): Observable<BankAccount[]> {
    return allPages(page => this.accountsSdk.listBankAccounts(page, LIST_PAGE_SIZE), response => response?.accounts ?? []).pipe(
      map(rows =>
        rows
          .map(toBankAccount)
          .filter(account => account.glAccountId !== '')
          .sort((a, b) => (a.accountCode ?? '').localeCompare(b.accountCode ?? '')),
      ),
    );
  }

  /** Creates or replaces the account's bank profile. A non-`USD` currency answers 422 CURRENCY_NOT_SUPPORTED. */
  setBankAccountProfile(glAccountId: string, profile: BankAccountProfileInput): Observable<void> {
    return this.accountsSdk
      .setBankAccountProfile(glAccountId, {
        currency: profile.currency,
        bankName: profile.bankName ?? undefined,
        accountMask: profile.accountMask ?? undefined,
      })
      .pipe(map(() => undefined));
  }

  /** The account's statements, most recent first. */
  listStatements(glAccountId: string): Observable<BankStatement[]> {
    return allPages(
      page => this.statementsSdk.listBankStatements(glAccountId, undefined, undefined, page, LIST_PAGE_SIZE),
      response => response?.statements ?? [],
    ).pipe(
      map(rows =>
        rows
          .map(toBankStatement)
          .filter(statement => statement.statementId !== '')
          .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? '')),
      ),
    );
  }

  /** One statement with the reconciliations that cover it (the supersede warning reads these). */
  getStatement(statementId: string): Observable<BankStatement> {
    return this.statementsSdk.getBankStatement(statementId).pipe(map(toBankStatement));
  }

  /** Commits a manual-entry statement; answers the new statement. */
  createManualStatement(input: ManualStatementInput): Observable<BankStatement> {
    return this.statementsSdk
      .createBankStatement({
        glAccountId: input.glAccountId,
        requestId: uuidV7(),
        statement: toHeaderRequest(input.statement),
        transactions: input.transactions.map(transaction => ({
          date: transaction.date,
          signedAmount: transaction.signedAmount,
          description: transaction.description,
          reference: transaction.reference ?? undefined,
          checkNumber: transaction.checkNumber ?? undefined,
        })),
        gapAcknowledgement: input.gapAcknowledgement ?? undefined,
        startReconciliation: input.startReconciliation,
        ...supersessionBody(input.supersession),
      })
      .pipe(map(toBankStatement));
  }

  /** Uploads a CSV statement; the import lands `UPLOADED` (mapping needed) or `VALIDATED` (§4.3). */
  createImport(upload: BankImportUpload): Observable<BankImport> {
    return this.importsSdk
      .createBankImport({
        glAccountId: upload.glAccountId,
        requestId: uuidV7(),
        formatCode: 'CSV',
        fileName: upload.fileName,
        contentType: upload.contentType ?? undefined,
        content: upload.content,
        statement: toHeaderRequest(upload.statement),
        gapAcknowledgement: upload.gapAcknowledgement ?? undefined,
        ...supersessionBody(upload.supersession),
      })
      .pipe(map(toBankImport));
  }

  getImport(importId: string): Observable<BankImport> {
    return this.importsSdk.getBankImport(importId).pipe(map(toBankImport));
  }

  /** Re-parses the file with a new mapping and sign convention (§4.4). */
  setMapping(importId: string, input: BankImportMappingInput): Observable<BankImport> {
    return this.importsSdk
      .setBankImportMapping(importId, {
        columnMapping: input.columnMapping,
        signConvention: input.signConvention,
        dateFormat: input.dateFormat ?? undefined,
        saveAsAccountDefault: input.saveAsAccountDefault,
        gapAcknowledgement: input.gapAcknowledgement ?? undefined,
        version: input.version,
      })
      .pipe(map(toBankImport));
  }

  /** One page of the import's rows in `rowNumber` order, optionally of one status. */
  listRows(importId: string, status: ImportRowStatus | null, page: number, size: number): Observable<ImportRowPage> {
    return this.importsSdk.listBankImportRows(importId, status ?? undefined, page, size).pipe(
      map(response => ({
        rows: (response?.rows ?? []).map(toImportRow),
        columns: response?.columns ?? [],
        pageNumber: response?.pageNumber ?? page,
        totalPages: response?.totalPages ?? 0,
        totalElements: response?.totalElements ?? 0,
      })),
    );
  }

  /** Corrects a row's parsed values; its `rawValues` are kept (§4.4). */
  correctRow(importId: string, rowId: string, correction: ImportRowCorrection, version: number): Observable<ImportRow> {
    return this.importsSdk
      .updateBankImportRow(importId, rowId, { correctedValues: { ...correction }, version })
      .pipe(map(toImportRow));
  }

  skipRow(importId: string, rowId: string, reason: string, version: number): Observable<ImportRow> {
    return this.importsSdk.updateBankImportRow(importId, rowId, { skip: true, reason, version }).pipe(map(toImportRow));
  }

  decideDuplicate(importId: string, rowId: string, decision: DuplicateDecision, version: number): Observable<ImportRow> {
    return this.importsSdk
      .updateBankImportRow(importId, rowId, {
        duplicateDecision:
          decision === 'DUPLICATE'
            ? BankImportRowUpdateRequestDuplicateDecisionEnum.Duplicate
            : BankImportRowUpdateRequestDuplicateDecisionEnum.Distinct,
        version,
      })
      .pipe(map(toImportRow));
  }

  /**
   * Commits the import (§4.4). `duplicateDecisions` decides possible
   * duplicates in bulk; any left out are committed as `POSSIBLE_DUPLICATE`
   * bank transactions for later review.
   */
  commitImport(
    importId: string,
    startReconciliation: boolean,
    duplicateDecisions: readonly { rowNumber: number; decision: DuplicateDecision }[],
    version: number,
  ): Observable<ImportCommitResult> {
    return this.importsSdk
      .commitBankImport(importId, {
        startReconciliation,
        duplicateDecisions: duplicateDecisions.length
          ? duplicateDecisions.map(entry => ({
              rowNumber: entry.rowNumber,
              decision:
                entry.decision === 'DUPLICATE'
                  ? BankImportDuplicateDecisionDecisionEnum.Duplicate
                  : BankImportDuplicateDecisionDecisionEnum.Distinct,
            }))
          : undefined,
        version,
      })
      .pipe(
        map(response => ({
          statementId: response.statementId,
          statementIds: response.statementIds ?? [response.statementId],
          reconciliationId: response.reconciliationId ?? null,
          bankTransactionCount: response.bankTransactionCount ?? 0,
          possibleDuplicateCount: response.possibleDuplicateCount ?? 0,
        })),
      );
  }

  discardImport(importId: string, reason: string, version: number): Observable<BankImport> {
    return this.importsSdk.discardBankImport(importId, { reason, version }).pipe(map(toBankImport));
  }

  /** Starts a reconciliation of a COMMITTED statement (§4.1 a); answers the new reconciliation's id. */
  startReconciliation(glAccountId: string, statementId: string): Observable<string> {
    return this.reconciliationSdk
      .createReconciliation({ glAccountId, statementId, requestId: uuidV7() })
      .pipe(map(response => response.reconciliationId ?? ''));
  }
}

/**
 * Reads page 0, then every further page the response's `totalPages` names, in
 * parallel, and concatenates the rows in page order.
 */
function allPages<R extends { totalPages?: number }, T>(
  readPage: (page: number) => Observable<R>,
  rows: (response: R) => readonly T[],
): Observable<T[]> {
  return readPage(0).pipe(
    switchMap(first => {
      const pages = Math.max(1, first?.totalPages ?? 1);
      if (pages === 1) return of([rows(first)]);
      const rest = Array.from({ length: pages - 1 }, (_, i) => readPage(i + 1).pipe(map(rows)));
      return forkJoin(rest).pipe(map(later => [rows(first), ...later]));
    }),
    map(chunks => chunks.flatMap(chunk => [...chunk])),
  );
}

/** The refused request as the `ApiError` envelope stated it; a non-HTTP error reads as status 0. */
export function toBankRecFailure(error: unknown): BankRecFailure {
  if (!(error instanceof HttpErrorResponse)) {
    return { code: null, status: 0, message: null, fieldErrors: [] };
  }
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as Partial<ApiError>;
  return {
    code: typeof body.code === 'string' ? body.code : null,
    status: error.status,
    message: typeof body.message === 'string' ? body.message : null,
    fieldErrors: Array.isArray(body.fieldErrors)
      ? body.fieldErrors
          .filter(entry => typeof entry?.field === 'string')
          .map(entry => ({ field: entry.field, message: String(entry.message ?? '') }))
      : [],
  };
}

function supersessionBody(
  supersession: StatementSupersession | null,
): { supersedesStatementId?: string; supersessionJustification?: string } {
  return supersession
    ? {
        supersedesStatementId: supersession.supersedesStatementId,
        supersessionJustification: supersession.supersessionJustification,
      }
    : {};
}

function toHeaderRequest(header: StatementHeader): BankImportStatementHeader {
  return {
    startDate: header.startDate,
    endDate: header.endDate,
    openingBalance: header.openingBalance,
    closingBalance: header.closingBalance,
    statementRef: header.statementRef ?? undefined,
  };
}

const text = (value: string | null | undefined): string | null => value?.trim() || null;
const count = (value: number | null | undefined): number | null => (typeof value === 'number' ? value : null);

function toBankAccount(row: BankAccountResponse): BankAccount {
  return {
    glAccountId: row.glAccountId ?? '',
    accountCode: text(row.accountCode),
    accountName: text(row.accountName),
    bankName: text(row.bankName),
    accountMask: text(row.accountMask),
    currency: text(row.currency),
    reconciliationBaselineDate: row.reconciliationBaselineDate ?? null,
    coverageFrontier: row.coverageFrontier ?? null,
    reconciledFrontier: row.reconciledFrontier ?? null,
    unexplainedBankTransactionCount: count(row.unexplainedBankTransactionCount),
    openOutstandingItemCount: count(row.openOutstandingItemCount),
    profileExists: row.profileExists === true,
  };
}

function toBankStatement(row: BankStatementResponse): BankStatement {
  const status = row.status as string | undefined;
  const source = row.sourceKind as string | undefined;
  return {
    statementId: row.statementId ?? '',
    glAccountId: row.glAccountId ?? null,
    statementRef: text(row.statementRef),
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    openingBalance: count(row.openingBalance),
    closingBalance: count(row.closingBalance),
    currency: text(row.currency),
    status: status === 'COMMITTED' || status === 'SUPERSEDED' ? (status as BankStatementStatus) : null,
    sourceKind:
      source === 'FILE_IMPORT' || source === 'MANUAL_ENTRY' || source === 'BANK_FEED'
        ? (source as BankStatementSource)
        : null,
    gapAcknowledgement: text(row.gapAcknowledgement),
    reconciliations: (row.reconciliations ?? [])
      .filter(link => !!link.reconciliationId)
      .map(link => ({ reconciliationId: link.reconciliationId as string, status: link.status ?? null })),
  };
}

function toColumnMapping(value: object | undefined): ColumnMapping {
  const mapping: Record<string, string> = {};
  if (value && typeof value === 'object') {
    for (const role of COLUMN_ROLES) {
      const column = (value as Record<string, unknown>)[role];
      if (typeof column === 'string' && column) mapping[role] = column;
    }
  }
  return mapping;
}

function toRowStatus(status: string | undefined): ImportRowStatus | null {
  return IMPORT_ROW_STATUSES.includes(status as ImportRowStatus) ? (status as ImportRowStatus) : null;
}

function toPreview(preview: BankImportPreview | undefined): ImportPreview | null {
  if (!preview) return null;
  return {
    ties: preview.ties === true,
    firstRows: (preview.firstRows ?? []).map(row => ({
      rowNumber: row.rowNumber,
      date: row.date ?? null,
      description: text(row.description),
      signedAmount: count(row.signedAmount),
      runningBalance: count(row.runningBalance),
      rowStatus: toRowStatus(row.rowStatus),
    })),
    segments: (preview.segments ?? []).map(segment => ({
      startDate: segment.startDate ?? null,
      endDate: segment.endDate ?? null,
      openingBalance: count(segment.openingBalance),
      activityTotal: count(segment.activityTotal),
      expectedClosing: count(segment.expectedClosing),
      closingBalance: count(segment.closingBalance),
      difference: count(segment.difference),
      ties: segment.ties === true,
      transactionCount: count(segment.transactionCount),
    })),
  };
}

function toBankImport(row: BankImportResponse): BankImport {
  const status = row.status as string;
  const sign = row.signConvention as SignConvention | undefined;
  return {
    importId: row.importId,
    glAccountId: row.glAccountId,
    accountCode: text(row.glAccountCode),
    accountName: text(row.glAccountName),
    status: (['UPLOADED', 'VALIDATED', 'COMMITTED', 'DISCARDED'].includes(status) ? status : 'UPLOADED') as BankImportStatus,
    mappingRequired: row.mappingRequired === true,
    columns: row.columns ?? [],
    columnMapping: toColumnMapping(row.columnMapping),
    signConvention: sign && SIGN_CONVENTIONS.includes(sign) ? sign : null,
    dateFormat: text(row.dateFormat),
    currency: text(row.currency),
    fileName: text(row.fileName),
    statement: row.statement
      ? {
          startDate: row.statement.startDate,
          endDate: row.statement.endDate,
          openingBalance: row.statement.openingBalance,
          closingBalance: row.statement.closingBalance,
          statementRef: text(row.statement.statementRef),
        }
      : null,
    gapAcknowledgement: text(row.gapAcknowledgement),
    rowCount: row.rowCount ?? 0,
    acceptedCount: row.acceptedCount ?? 0,
    rejectedCount: row.rejectedCount ?? 0,
    skippedCount: row.skippedCount ?? 0,
    possibleDuplicateCount: row.possibleDuplicateCount ?? 0,
    outOfWindowCount: row.outOfWindowCount ?? 0,
    preview: toPreview(row.preview),
    statementId: row.statementId ?? null,
    reconciliationId: row.reconciliationId ?? null,
    discardReason: text(row.discardReason),
    version: row.version ?? 0,
  };
}

function toImportRow(row: BankImportRowResponse): ImportRow {
  const corrected = row.correctedValues;
  return {
    rowId: row.rowId,
    rowNumber: row.rowNumber,
    rowStatus: toRowStatus(row.rowStatus),
    rawValues: (row.rawValues ?? {}) as Record<string, unknown>,
    correctedValues: corrected && typeof corrected === 'object' ? (corrected as Record<string, unknown>) : null,
    date: row.date ?? null,
    description: text(row.description),
    signedAmount: count(row.signedAmount),
    reference: text(row.reference),
    checkNumber: text(row.checkNumber),
    rejectionCode: text(row.rejectionCode),
    skipReason: text(row.skipReason),
    duplicateDecision: (row.duplicateDecision as DuplicateDecision | undefined) ?? null,
    duplicateOfRowNumber: count(row.duplicateOfRowNumber),
  };
}
