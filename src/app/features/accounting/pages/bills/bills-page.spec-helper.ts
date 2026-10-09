import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { WritableSignal, signal } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import {
  BillAction,
  BillActionCode,
  BillApproveCommand,
  BillCheck,
  BillDetail,
  BillDueDateCommand,
  BillPermissions,
  BillResolveCommand,
  BillSelection,
  BillStage,
  BillSubmitCommand,
  BillVoidCommand,
  VendorDefaultClass,
  BillStageCounts,
  BillStagePage,
  BillStageRow,
} from '../../models/payables.models';

/**
 * Shared, typed fixtures for the Bills to pay page, its review panel and the
 * bill components (ADR-0032). Instants derive from one fixed clock value, so no
 * spec depends on today (ADR-0038 §7). Excluded from the app build
 * (`*.spec-helper.ts`).
 */
export const NOW = new Date(2026, 9, 6, 10, 30);
export const AS_OF = NOW.toISOString();

/** The write codes of each session the story's action matrix names (AC 12). */
export const VIEW_ONLY = ['accounting:ap:view'];
export const CLERK = ['accounting:ap:view', 'accounting:ap:approve', 'accounting:ap:reject'];
export const APPROVE_ONLY = ['accounting:ap:view', 'accounting:ap:approve'];
export const OVER_LIMIT = ['accounting:ap:view', 'accounting:ap:approve_over_limit'];
export const REJECT_ONLY = ['accounting:ap:view', 'accounting:ap:reject'];
export const CONTROLLER = [
  'accounting:ap:view',
  'accounting:ap:approve',
  'accounting:ap:approve_over_limit',
  'accounting:ap:reject',
  'accounting:ap:pay',
  'accounting:ap_approval_policy:manage',
];

export const ALL_PERMISSIONS: BillPermissions = { approve: true, reject: true, setDueDate: true, periodOverride: true };
export const NO_PERMISSIONS: BillPermissions = { approve: false, reject: false, setDueDate: false, periodOverride: false };

export const action = (code: BillActionCode, overrides: Partial<BillAction> = {}): BillAction => ({
  action: code,
  allowed: true,
  blockedReason: null,
  justificationRequired: false,
  ...overrides,
});

export const check = (code: string, outcome: BillCheck['outcome'], args: Record<string, string> = {}): BillCheck => ({
  code,
  outcome,
  args,
});

/** An EDI bill waiting on its delivery, no due date, no lines (AC 4). */
export const bill = (overrides: Partial<BillDetail> = {}): BillDetail => ({
  billId: 'bill-1',
  vendorId: 'vendor-uuid-1',
  billNumber: 'INV-4471',
  vendorName: 'Northside Parts',
  channel: 'SUPPLIER_CONNECTION',
  status: 'PENDING_RECEIPT_MATCH',
  billDate: '2026-10-01',
  dueDate: null,
  totalAmount: 1840.5,
  netAmount: 1700,
  taxAmount: 140.5,
  openAmount: 1840.5,
  currency: 'USD',
  statusExplanation: null,
  approval: {
    requiredTier: 'CLERK',
    clerkLimit: 2500,
    currencyCode: 'USD',
    submittedAt: null,
    submissionJustification: null,
    approvalJustification: null,
    approvedAutomatically: false,
    submittedAutomatically: false,
    proposedClassification: null,
    proposedDifference: null,
  },
  rejection: null,
  match: null,
  openCandidates: [],
  checks: [check('MATCHED_TO_DELIVERY', 'FAIL', { reason: 'NO_DELIVERY_RECORDED' })],
  lines: [],
  availableActions: [action('SUBMIT_FOR_APPROVAL'), action('SET_DUE_DATE')],
  taxByType: [],
  inputTaxRecovery: null,
  taxOnResaleOverride: null,
  posting: null,
  ...overrides,
});

/** A served approval block with overrides (typed, ADR-0032). */
export const approval = (overrides: Partial<NonNullable<BillDetail['approval']>> = {}): NonNullable<BillDetail['approval']> => ({
  requiredTier: 'CLERK',
  clerkLimit: 2500,
  currencyCode: 'USD',
  submittedAt: null,
  submissionJustification: null,
  approvalJustification: null,
  approvedAutomatically: false,
  submittedAutomatically: false,
  proposedClassification: null,
  proposedDifference: null,
  ...overrides,
});

/** A goods-receipt line, so the classification field stays hidden. */
export const LINE: BillDetail['lines'][number] = {
  lineNumber: 1,
  description: 'Brake pads',
  inventoryItem: true,
  receivedQuantity: 4,
  receivedUnitPrice: 20,
  billedQuantity: 4,
  billedUnitPrice: 21,
  currencyCode: 'USD',
};

/** A bill sent for approval: Approve and Reject served. */
export const awaitingBill = (overrides: Partial<BillDetail> = {}): BillDetail =>
  bill({
    status: 'AWAITING_APPROVAL',
    lines: [LINE],
    availableActions: [action('APPROVE'), action('REJECT'), action('SET_DUE_DATE')],
    ...overrides,
  });

/** A bill that doesn't match its delivery: the three resolutions served. */
export const exceptionBill = (overrides: Partial<BillDetail> = {}): BillDetail =>
  bill({
    billId: 'bill-2',
    billNumber: 'INV-5520',
    channel: 'GOODS_RECEIPT',
    status: 'MATCH_EXCEPTION',
    statusExplanation: 'Line 2 billed 12, received 10',
    lines: [LINE],
    availableActions: [
      action('ACCEPT_EXCEPTION'),
      action('CORRECT_EXCEPTION'),
      action('VOID_EXCEPTION'),
      action('SUBMIT_FOR_APPROVAL'),
    ],
    ...overrides,
  });

export const stageRow = (overrides: Partial<BillStageRow> = {}): BillStageRow => ({
  billId: 'bill-1',
  billNumber: 'INV-4471',
  vendorName: 'Northside Parts',
  totalAmount: 1840.5,
  openAmount: 1840.5,
  currencyCode: 'USD',
  billDate: '2026-10-01',
  dueDate: null,
  status: 'PENDING_RECEIPT_MATCH',
  channel: 'SUPPLIER_CONNECTION',
  requiredTier: 'CLERK',
  submittedAt: null,
  vendorApHold: false,
  ...overrides,
});

export const stagePage = (items: BillStageRow[] = [stageRow()], overrides: Partial<BillStagePage> = {}): BillStagePage => ({
  items,
  page: 0,
  size: 25,
  totalElements: items.length,
  totalPages: 1,
  ...overrides,
});

export const counts = (overrides: Partial<BillStageCounts> = {}): BillStageCounts => ({
  check: 3,
  approve: 2,
  pay: 4,
  done: 1,
  asOf: AS_OF,
  ...overrides,
});

/** An `ApiError` refusal as the HTTP layer delivers it. */
export function apiError(
  status: number,
  code: string,
  fieldErrors: { field: string; message: string }[] = [],
  headers: Record<string, string> = {},
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { code, message: code, status, correlationId: 'c-1', timestamp: AS_OF, fieldErrors },
    headers: new HttpHeaders(headers),
  });
}

export interface PayablesMock {
  getStageCounts: ReturnType<typeof vi.fn<() => Observable<BillStageCounts>>>;
  listByStage: ReturnType<typeof vi.fn<(stage: BillStage, page?: number, size?: number) => Observable<BillStagePage>>>;
  getBill: ReturnType<typeof vi.fn<(billId: string) => Observable<BillDetail>>>;
  submitForApproval: ReturnType<typeof vi.fn<(billId: string, command: BillSubmitCommand) => Observable<void>>>;
  approve: ReturnType<typeof vi.fn<(billId: string, command: BillApproveCommand) => Observable<void>>>;
  reject: ReturnType<typeof vi.fn<(billId: string, reason: string) => Observable<void>>>;
  voidBill: ReturnType<typeof vi.fn<(billId: string, command: BillVoidCommand) => Observable<void>>>;
  getVendorDefaultClass: ReturnType<typeof vi.fn<(vendorId: string) => Observable<VendorDefaultClass>>>;
  resolveException: ReturnType<typeof vi.fn<(billId: string, command: BillResolveCommand) => Observable<void>>>;
  selectMatchCandidate: ReturnType<typeof vi.fn<(candidateId: string) => Observable<BillSelection>>>;
  setDueDate: ReturnType<typeof vi.fn<(billId: string, command: BillDueDateCommand) => Observable<void>>>;
}

export function payablesMock(detail: BillDetail = bill()): PayablesMock {
  return {
    getStageCounts: vi.fn(() => of(counts())),
    listByStage: vi.fn(() => of(stagePage())),
    getBill: vi.fn(() => of(detail)),
    submitForApproval: vi.fn(() => of(undefined)),
    approve: vi.fn(() => of(undefined)),
    reject: vi.fn(() => of(undefined)),
    voidBill: vi.fn(() => of(undefined)),
    getVendorDefaultClass: vi.fn(() => of<VendorDefaultClass>(null)),
    resolveException: vi.fn(() => of(undefined)),
    selectMatchCandidate: vi.fn(() => of<BillSelection>({ billId: detail.billId, billNumber: detail.billNumber })),
    setDueDate: vi.fn(() => of(undefined)),
  };
}

export interface AuthMock {
  readonly held: WritableSignal<readonly string[] | null>;
  readonly claims: WritableSignal<JwtClaims | null>;
  readonly service: Partial<AuthService>;
}

/**
 * `held = null` is a token without `perm_bits` (the `canAccess` fallback).
 * `extras` carries the tenant signal: tenant ids stay in spec files (arch rule TEN-02).
 */
export function authMock(held: readonly string[] | null, extras: Partial<AuthService> = {}): AuthMock {
  const heldSignal = signal<readonly string[] | null>(held);
  const claims = signal<JwtClaims | null>(null);
  return {
    held: heldSignal,
    claims,
    service: {
      ...extras,
      currentUserClaims: claims,
      permissionsKnown: (() => heldSignal() !== null) as AuthService['permissionsKnown'],
      hasAnyRole: () => false,
      hasPermission: (code: string) => !!heldSignal()?.includes(code),
      hasAnyPermission: (codes: readonly string[]) => {
        const current = heldSignal();
        return !!current && codes.some(code => current.includes(code));
      },
    },
  };
}

/** A read the test resolves by hand (ADR-0063 §8: ordering tests drive a Subject, never `of`). */
export function pending<T>(): Subject<T> {
  return new Subject<T>();
}
