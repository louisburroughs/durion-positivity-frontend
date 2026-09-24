import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  AccountingPeriodResponse,
  AccountingPeriodResponseStatusEnum,
  AccountingPeriodsService as AccountingPeriodsSdk,
  ApiError,
} from '@durion-sdk/accounting';
import {
  AccountingPeriod,
  AccountingPeriodStatus,
  PeriodActionFailure,
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
 * monthly close.
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

  /** Closes an OPEN period. A started month with no row is provisioned, then closed. */
  closePeriod(periodCode: string): Observable<AccountingPeriod> {
    return this.periodsSdk.closeAccountingPeriod(periodCode).pipe(map(row => toAccountingPeriod(row)));
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
 * `field: "draftJournalEntryIds"`; only those entries are counted.
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
