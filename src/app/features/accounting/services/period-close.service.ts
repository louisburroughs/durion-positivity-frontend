import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  AccountingPeriodResponse,
  AccountingPeriodResponseStatusEnum,
  AccountingPeriodsService as AccountingPeriodsSdk,
  ApiError,
  BankReconciliationPolicyResponse,
  CloseReadinessAccount,
  CloseReadinessCheck,
  CloseReadinessResponse,
} from '@durion-sdk/accounting';
import {
  AccountingPeriod,
  AccountingPeriodStatus,
  BankReconciliationClosePolicy,
  BankReconciliationPolicy,
  CloseReadiness,
  PeriodActionFailure,
  ReadinessAccount,
  ReadinessCheck,
  ReadinessSeverity,
  displayActor,
  isPeriodCode,
} from '../models/period-close.models';

/**
 * Accounting period close: list, close and reopen (CAP-054 / backend story B1).
 *
 * Backed entirely by the generated `@durion-sdk/accounting`
 * `AccountingPeriodsService` (ADR-0041). The backend enforces
 * `accounting:period:view` on the list, `accounting:period:close` on close and
 * `accounting:period:reopen` on reopen; the page gates on the same codes
 * through `ACCOUNTING_PAGE` / `ACCOUNTING_SECTION`.
 *
 * The hard-lock date endpoints on the same SDK service are deliberately not
 * wrapped here: moving the hard lock is irreversible and is not part of the
 * monthly close. Nor is the policy `PUT`: the page only reads the policy
 * (SPEC-manual-bank-reconciliation §5.9).
 */
@Injectable({ providedIn: 'root' })
export class PeriodCloseService {
  private readonly periodsSdk = inject(AccountingPeriodsSdk);

  /** Every provisioned period, most recent first. Rows without a valid code are dropped. */
  listPeriods(): Observable<AccountingPeriod[]> {
    return this.periodsSdk.listAccountingPeriods().pipe(
      map(rows =>
        (rows ?? [])
          .filter(row => isPeriodCode(row.periodCode))
          .map(row => toAccountingPeriod(row))
          .sort((a, b) => b.periodCode.localeCompare(a.periodCode)),
      ),
    );
  }

  /**
   * Closes an OPEN period. A started month with no row is provisioned, then
   * closed. `exceptionJustification` closes it despite BLOCKING bank
   * reconciliation checks under `REQUIRED_WITH_EXCEPTION`; the server requires
   * `accounting:period:override` for it (§5.2).
   */
  closePeriod(periodCode: string, exceptionJustification?: string): Observable<AccountingPeriod> {
    const body = exceptionJustification === undefined
      ? undefined
      : { bankReconciliationException: { justification: exceptionJustification } };
    return this.periodsSdk.closeAccountingPeriod(periodCode, body).pipe(map(row => toAccountingPeriod(row)));
  }

  /** Bank reconciliation close readiness of a period, provisioned or not (§5.3). */
  getCloseReadiness(periodCode: string): Observable<CloseReadiness> {
    return this.periodsSdk
      .getAccountingPeriodCloseReadiness(periodCode)
      .pipe(map(response => toCloseReadiness(periodCode, response)));
  }

  /** The tenant's effective bank reconciliation policy; the page reads it, never edits it. */
  getBankReconciliationPolicy(): Observable<BankReconciliationPolicy> {
    return this.periodsSdk.getBankReconciliationPolicy().pipe(map(response => toPolicy(response)));
  }

  /** Reopens a CLOSED period; the justification is recorded in the audit trail. */
  reopenPeriod(periodCode: string, justification: string): Observable<AccountingPeriod> {
    return this.periodsSdk
      .reopenAccountingPeriod(periodCode, { justification })
      .pipe(map(row => toAccountingPeriod(row)));
  }
}

/**
 * Classifies a refused close or reopen by the backend's `ApiError.code`,
 * falling back to the HTTP status. A 422 PERIOD_HAS_DRAFT_ENTRIES carries one
 * `fieldErrors` entry per blocking draft journal entry, each with
 * `field: "draftJournalEntryIds"`; only those entries are counted. A 422
 * PERIOD_BANK_RECONCILIATION_INCOMPLETE has the same shape, one
 * `unreconciledGlAccountIds` entry per blocked account.
 */
export function classifyPeriodActionError(error: unknown): PeriodActionFailure {
  if (!(error instanceof HttpErrorResponse)) {
    return { kind: 'OTHER' };
  }
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as Partial<ApiError>;
  switch (body.code) {
    case 'PERIOD_HAS_DRAFT_ENTRIES': {
      const drafts = Array.isArray(body.fieldErrors)
        ? body.fieldErrors.filter(entry => entry?.field === 'draftJournalEntryIds').length
        : 0;
      return { kind: 'DRAFT_ENTRIES', draftCount: drafts > 0 ? drafts : null };
    }
    case 'PERIOD_ALREADY_CLOSED':
      return { kind: 'ALREADY_CLOSED' };
    case 'PERIOD_ALREADY_OPEN':
      return { kind: 'ALREADY_OPEN' };
    case 'PERIOD_NOT_FOUND':
      return { kind: 'NOT_FOUND' };
    case 'PERIOD_BANK_RECONCILIATION_INCOMPLETE': {
      const accounts = Array.isArray(body.fieldErrors)
        ? body.fieldErrors.filter(entry => entry?.field === 'unreconciledGlAccountIds').length
        : 0;
      return { kind: 'BANK_RECONCILIATION_INCOMPLETE', accountCount: accounts > 0 ? accounts : null };
    }
    case 'PERIOD_CLOSE_EXCEPTION_NOT_PERMITTED':
      return { kind: 'EXCEPTION_NOT_PERMITTED' };
    case 'JUSTIFICATION_REQUIRED':
      return { kind: 'JUSTIFICATION_REQUIRED' };
  }
  switch (error.status) {
    case 400:
      return { kind: 'INVALID' };
    case 403:
      return { kind: 'FORBIDDEN' };
    case 404:
      return { kind: 'NOT_FOUND' };
    default:
      return { kind: 'OTHER' };
  }
}

function toStatus(status: AccountingPeriodResponseStatusEnum | undefined): AccountingPeriodStatus {
  switch (status) {
    case AccountingPeriodResponseStatusEnum.Open:
      return 'OPEN';
    case AccountingPeriodResponseStatusEnum.Closed:
      return 'CLOSED';
    default:
      return 'UNKNOWN';
  }
}

function toAccountingPeriod(row: AccountingPeriodResponse): AccountingPeriod {
  return {
    periodCode: row.periodCode ?? '',
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    status: toStatus(row.status),
    closedAt: row.closedAt ?? null,
    closedBy: displayActor(row.closedBy),
    reopenedAt: row.reopenedAt ?? null,
    reopenedBy: displayActor(row.reopenedBy),
    reopenJustification: row.reopenJustification?.trim() || null,
  };
}

function toPolicyValue(policy: string | undefined): BankReconciliationClosePolicy | null {
  return policy === 'ADVISORY' || policy === 'REQUIRED_WITH_EXCEPTION' || policy === 'REQUIRED' ? policy : null;
}

/** An unknown severity is kept visible as INFO rather than dropped. */
function toSeverity(severity: string | undefined): ReadinessSeverity {
  return severity === 'BLOCKING' || severity === 'WARNING' ? severity : 'INFO';
}

function toCheck(check: CloseReadinessCheck): ReadinessCheck {
  const references = check.references;
  return {
    code: String(check.code ?? ''),
    severity: toSeverity(check.severity),
    references: typeof references === 'object' && references !== null ? (references as Record<string, unknown>) : {},
  };
}

function toAccount(account: CloseReadinessAccount): ReadinessAccount {
  return {
    glAccountId: account.glAccountId ?? '',
    accountCode: account.accountCode?.trim() || null,
    accountName: account.accountName?.trim() || null,
    baselineDate: account.baselineDate ?? null,
    coverageFrontier: account.coverageFrontier ?? null,
    reconciledFrontier: account.reconciledFrontier ?? null,
    checks: (account.checks ?? []).map(toCheck),
  };
}

/** Keyed by the code the read asked for, so a response that leaves `periodCode` unset still lands (ADR-0063 §1). */
function toCloseReadiness(requestedCode: string, response: CloseReadinessResponse): CloseReadiness {
  return {
    periodCode: isPeriodCode(response.periodCode) ? response.periodCode : requestedCode,
    policy: toPolicyValue(response.policy),
    ready: response.ready === true,
    blockingCount: response.blockingCount ?? 0,
    warningCount: response.warningCount ?? 0,
    checks: (response.checks ?? []).map(toCheck),
    accounts: (response.accounts ?? []).map(toAccount),
  };
}

function toPolicy(response: BankReconciliationPolicyResponse): BankReconciliationPolicy {
  return {
    closePolicy: toPolicyValue(response.closePolicy),
    currency: response.currency?.trim() || null,
  };
}
