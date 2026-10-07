import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ApiError,
  CashMovementApprovalRequest,
  CashMovementApprovalRequestReasonEnum,
  CashMovementApprovalResponse,
  CashMovementOptionsResponse,
  CashMovementRequest,
  CashMovementRequestReasonEnum,
  CashMovementResponse,
  RegisterSessionResponse,
  RegisterSessionsService,
} from '@durion-sdk/order';
import { Observable, map } from 'rxjs';
import {
  DrawerApproval,
  DrawerMovement,
  DrawerOptions,
  DrawerReason,
  DrawerReasonOption,
  DrawerSession,
  PettyCategory,
  isDrawerDirection,
  isDrawerReason,
} from '../models/register-drawer.models';

/** The SDK's request enums, keyed by the fixed reason (no string-to-enum casts). */
export const RECORD_REASON: Readonly<Record<DrawerReason, CashMovementRequestReasonEnum>> = {
  PETTY_EXPENSE: CashMovementRequestReasonEnum.PettyExpense,
  VENDOR_COD: CashMovementRequestReasonEnum.VendorCod,
  BANK_DROP: CashMovementRequestReasonEnum.BankDrop,
  FLOAT_INCREASE: CashMovementRequestReasonEnum.FloatIncrease,
  FLOAT_DECREASE: CashMovementRequestReasonEnum.FloatDecrease,
};

export const APPROVAL_REASON: Readonly<Record<DrawerReason, CashMovementApprovalRequestReasonEnum>> = {
  PETTY_EXPENSE: CashMovementApprovalRequestReasonEnum.PettyExpense,
  VENDOR_COD: CashMovementApprovalRequestReasonEnum.VendorCod,
  BANK_DROP: CashMovementApprovalRequestReasonEnum.BankDrop,
  FLOAT_INCREASE: CashMovementApprovalRequestReasonEnum.FloatIncrease,
  FLOAT_DECREASE: CashMovementApprovalRequestReasonEnum.FloatDecrease,
};

function toSession(response: RegisterSessionResponse): DrawerSession {
  return {
    sessionId: response.sessionId,
    terminalId: response.terminalId,
    status: response.status,
    openedAt: response.openedAt,
    openingFloat: response.openingFloat,
    currencyCode: response.currencyCode,
  };
}

function toMovement(response: CashMovementResponse): DrawerMovement {
  return {
    movementId: response.movementId,
    occurredAt: response.occurredAt,
    reason: response.reason ?? null,
    movementType: isDrawerDirection(response.movementType) ? response.movementType : undefined,
    amount: response.amount,
    currencyCode: response.currencyCode,
    categoryCode: response.categoryCode,
    vendorId: response.vendorId,
    bagNumber: response.bagNumber,
    note: response.note,
    receiptReference: response.receiptReference,
    clerkId: response.clerkId,
    approvedBy: response.approvedBy,
  };
}

/**
 * Keeps only the known reasons with a known direction: an unknown served code is never offered,
 * and a missing or unknown direction is never defaulted to OUT (§8.2, AW15, AC 2).
 */
function toOptions(response: CashMovementOptionsResponse): DrawerOptions {
  const reasons: DrawerReasonOption[] = [];
  for (const option of response.reasons ?? []) {
    if (!isDrawerReason(option.reason) || !isDrawerDirection(option.direction)) {
      continue;
    }
    reasons.push({
      reason: option.reason,
      direction: option.direction,
      allowedNow: option.allowedNow === true,
      cashierLimit: typeof option.cashierLimit === 'number' ? option.cashierLimit : null,
      alwaysNeedsManager: option.alwaysNeedsManager === true,
      requiredFields: option.requiredFields ?? [],
    });
  }
  const categories: PettyCategory[] = (response.categories ?? [])
    .filter(category => !!category.code)
    .map(category => ({
      code: category.code!,
      label: category.label?.trim() || category.code!,
      examples: category.examples?.trim() || null,
    }));
  return {
    sessionId: response.sessionId ?? null,
    currencyCode: response.currencyCode ?? null,
    reasons,
    categories,
  };
}

function toApproval(response: CashMovementApprovalResponse): DrawerApproval {
  if (!response.approvalToken) {
    throw new Error('The step-up answered without an approval token');
  }
  return { approvalToken: response.approvalToken, expiresAt: response.expiresAt ?? null };
}

/**
 * The register's drawer session, its movements, the cashier options read and S16's manager
 * step-up (CAP:550 S22), over the generated `RegisterSessionsService` (ADR-0041). Every call runs
 * under the cashier's own session through the unchanged auth interceptor: the step-up carries the
 * manager's credentials in its body only, and nothing here signs anyone in or out (AW31).
 */
@Injectable({ providedIn: 'root' })
export class RegisterSessionService {
  private readonly api = inject(RegisterSessionsService);

  /** The terminal's OPEN or CLOSING session, or null on 204 (no drawer open). */
  currentSession(terminalId: string): Observable<DrawerSession | null> {
    return this.api
      .getCurrentRegisterSession(terminalId, 'response')
      .pipe(map(response => (response.status === 204 || !response.body ? null : toSession(response.body))));
  }

  movements(sessionId: string): Observable<DrawerMovement[]> {
    return this.api.listCashMovements(sessionId).pipe(map(rows => (rows ?? []).map(toMovement)));
  }

  /** What the register may offer for the session: reasons, limits and categories (S16 PROPOSED 5). */
  options(sessionId: string): Observable<DrawerOptions> {
    return this.api.getCashMovementOptions(sessionId).pipe(map(toOptions));
  }

  /** Records one movement; a replay of the same `requestId` answers the first result (§8.2). */
  recordMovement(sessionId: string, request: CashMovementRequest): Observable<DrawerMovement> {
    return this.api.recordCashMovement(sessionId, request).pipe(map(toMovement));
  }

  /** S16's step-up (AW31): the manager's credentials, checked once, for a single-use token. */
  requestApproval(sessionId: string, request: CashMovementApprovalRequest): Observable<DrawerApproval> {
    return this.api.requestCashMovementApproval(sessionId, request).pipe(map(toApproval));
  }
}

/** Why a drawer write was refused, as the dialog acts on it. */
export type DrawerFailureKind =
  /** The record needs a manager's approval token (§4.6, AW19). */
  | 'APPROVAL_REQUIRED'
  /** The token is used, expired or bound to another movement: back to the manager step. */
  | 'APPROVAL_INVALID'
  /** The step-up refused the credentials, one code for every reason (AW31). */
  | 'APPROVAL_DENIED'
  | 'SELF_APPROVAL'
  /** The reason was switched off after the options were read (§9.4). */
  | 'TYPE_NOT_ALLOWED'
  | 'CATEGORY_UNKNOWN'
  | 'FLOAT_NOT_RECORDED'
  /** 409 REGISTER_SESSION_CONFLICT: the session is no longer OPEN. */
  | 'SESSION_NOT_OPEN'
  /** Any other 409, such as IDEMPOTENCY_CONFLICT. */
  | 'CONFLICT'
  /** 404: the session is gone; the page re-resolves it. */
  | 'SESSION_GONE'
  /** 400: the named fields. */
  | 'INVALID'
  /** Any other 403: the cashier's own permission. */
  | 'FORBIDDEN'
  /** Any other 4xx: the server judged and refused; nothing was recorded. */
  | 'REFUSED'
  /** A record whose outcome is unknown (network, timeout, 5xx): Retry resends the same requestId. */
  | 'UNKNOWN_OUTCOME'
  /** A step-up that could not be checked (network, 5xx): nothing was approved. */
  | 'APPROVAL_UNAVAILABLE';

export interface DrawerFailure {
  readonly kind: DrawerFailureKind;
  /** Request fields a 400 named, when the server listed them. */
  readonly fields: readonly string[];
}

const RECORD_CODES: Readonly<Record<string, DrawerFailureKind>> = {
  CASH_MOVEMENT_APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  CASH_MOVEMENT_APPROVAL_INVALID: 'APPROVAL_INVALID',
  CASH_MOVEMENT_SELF_APPROVAL: 'SELF_APPROVAL',
  CASH_MOVEMENT_TYPE_NOT_ALLOWED: 'TYPE_NOT_ALLOWED',
  PETTY_EXPENSE_CATEGORY_UNKNOWN: 'CATEGORY_UNKNOWN',
  FLOAT_CHANGE_NOT_RECORDED: 'FLOAT_NOT_RECORDED',
  REGISTER_SESSION_CONFLICT: 'SESSION_NOT_OPEN',
};

const APPROVAL_CODES: Readonly<Record<string, DrawerFailureKind>> = {
  CASH_MOVEMENT_APPROVAL_DENIED: 'APPROVAL_DENIED',
  CASH_MOVEMENT_SELF_APPROVAL: 'SELF_APPROVAL',
  REGISTER_SESSION_CONFLICT: 'SESSION_NOT_OPEN',
};

/**
 * Classifies a refused record (`RECORD`) or step-up (`APPROVE`) by the backend's `ApiError.code`,
 * falling back to the HTTP status for an unknown code (S22 service contracts).
 */
export function classifyDrawerError(error: unknown, operation: 'RECORD' | 'APPROVE'): DrawerFailure {
  const unanswered: DrawerFailureKind = operation === 'RECORD' ? 'UNKNOWN_OUTCOME' : 'APPROVAL_UNAVAILABLE';
  if (!(error instanceof HttpErrorResponse)) {
    return { kind: unanswered, fields: [] };
  }
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as Partial<ApiError>;
  const fields = Array.isArray(body.fieldErrors)
    ? body.fieldErrors.map(entry => entry?.field).filter((field): field is string => typeof field === 'string')
    : [];
  const byCode = (operation === 'RECORD' ? RECORD_CODES : APPROVAL_CODES)[body.code ?? ''];
  if (byCode) {
    return { kind: byCode, fields: [] };
  }
  switch (error.status) {
    case 400:
      return { kind: 'INVALID', fields };
    case 403:
      return { kind: 'FORBIDDEN', fields: [] };
    case 404:
      return { kind: 'SESSION_GONE', fields: [] };
    case 409:
      return { kind: 'CONFLICT', fields: [] };
  }
  if (error.status >= 400 && error.status < 500) {
    return { kind: 'REFUSED', fields: [] };
  }
  return { kind: unanswered, fields: [] };
}
