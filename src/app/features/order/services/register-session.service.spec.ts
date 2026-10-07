import { describe, expect, it } from 'vitest';
import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  ApiError,
  CashMovementApprovalRequest,
  CashMovementApprovalRequestReasonEnum,
  CashMovementApprovalResponse,
  CashMovementOptionsResponse,
  CashMovementRequest,
  CashMovementRequestReasonEnum,
  CashMovementResponse,
  CashMovementResponseMovementTypeEnum,
  CashMovementResponseReasonEnum,
  ReasonOptionDirectionEnum,
  ReasonOptionReasonEnum,
  RegisterSessionResponse,
  RegisterSessionsService,
} from '@durion-sdk/order';
import { firstValueFrom, of } from 'rxjs';
import {
  DrawerApproval,
  DrawerMovement,
  DrawerOptions,
  DrawerSession,
  REGISTER_TERMINAL_ID,
} from '../models/register-drawer.models';
import { DrawerFailure, RegisterSessionService, classifyDrawerError } from './register-session.service';

const SESSION_ID = '018f2a6e-0000-7000-8000-00000000a001';

const servedSession: RegisterSessionResponse = {
  sessionId: SESSION_ID,
  terminalId: 'DEFAULT',
  status: 'OPEN',
  openedAt: '2026-10-07T13:00:00Z',
  openedByClerkId: '018f2a6e-0000-7000-8000-00000000c001',
  openingFloat: 150,
  currencyCode: 'CAD',
};

const servedMovement: CashMovementResponse = {
  movementId: '018f2a6e-0000-7000-8000-00000000m001',
  sessionId: SESSION_ID,
  occurredAt: '2026-10-07T14:00:00Z',
  reason: CashMovementResponseReasonEnum.PettyExpense,
  movementType: CashMovementResponseMovementTypeEnum.PaidOut,
  amount: 12.5,
  currencyCode: 'CAD',
  categoryCode: 'OFFICE',
  note: 'Printer paper',
  receiptReference: 'R-100',
  clerkId: 'cashier-1',
  clerkUserId: '018f2a6e-0000-7000-8000-00000000c002',
  approvedBy: '018f2a6e-0000-7000-8000-00000000c003',
  requestId: '018f2a6e-0000-7000-8000-00000000r001',
};

describe('RegisterSessionService', () => {
  let service: RegisterSessionService;
  const api = {
    getCurrentRegisterSession: vi.fn(),
    listCashMovements: vi.fn(),
    getCashMovementOptions: vi.fn(),
    recordCashMovement: vi.fn(),
    requestCashMovementApproval: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [RegisterSessionService, { provide: RegisterSessionsService, useValue: api }],
    });
    service = TestBed.inject(RegisterSessionService);
  });

  describe('currentSession()', () => {
    it('asks for the full response for the terminal and maps a 200 to the session', async () => {
      api.getCurrentRegisterSession.mockReturnValue(of(new HttpResponse({ status: 200, body: servedSession })));

      const session = await firstValueFrom(service.currentSession(REGISTER_TERMINAL_ID));

      expect(api.getCurrentRegisterSession).toHaveBeenCalledWith('DEFAULT', 'response');
      const expected: DrawerSession = {
        sessionId: SESSION_ID,
        terminalId: 'DEFAULT',
        status: 'OPEN',
        openedAt: '2026-10-07T13:00:00Z',
        openingFloat: 150,
        currencyCode: 'CAD',
      };
      expect(session).toEqual(expected);
    });

    it('maps a 204 (no drawer open on the terminal) to null', async () => {
      api.getCurrentRegisterSession.mockReturnValue(
        of(new HttpResponse<RegisterSessionResponse>({ status: 204, body: null, headers: new HttpHeaders() })),
      );

      expect(await firstValueFrom(service.currentSession('T-2'))).toBeNull();
      expect(api.getCurrentRegisterSession).toHaveBeenCalledWith('T-2', 'response');
    });

    it('fails on a 200 without a body rather than reading it as no drawer (ADR-0064 §1)', async () => {
      api.getCurrentRegisterSession.mockReturnValue(
        of(new HttpResponse<RegisterSessionResponse>({ status: 200, body: null })),
      );
      await expect(firstValueFrom(service.currentSession('T-2'))).rejects.toThrow();
      api.getCurrentRegisterSession.mockReturnValue(
        of(new HttpResponse<RegisterSessionResponse>({ status: 200, body: { ...servedSession, sessionId: undefined } })),
      );
      await expect(firstValueFrom(service.currentSession('T-2'))).rejects.toThrow();
    });
  });

  describe('movements()', () => {
    it('lists the session movements and keeps the ids out of nothing but the model', async () => {
      api.listCashMovements.mockReturnValue(of([servedMovement, { ...servedMovement, movementId: 'm2', reason: undefined }]));

      const rows = await firstValueFrom(service.movements(SESSION_ID));

      expect(api.listCashMovements).toHaveBeenCalledWith(SESSION_ID);
      const first: DrawerMovement = {
        movementId: servedMovement.movementId,
        occurredAt: '2026-10-07T14:00:00Z',
        reason: 'PETTY_EXPENSE',
        movementType: 'PAID_OUT',
        amount: 12.5,
        currencyCode: 'CAD',
        categoryCode: 'OFFICE',
        vendorId: undefined,
        bagNumber: undefined,
        note: 'Printer paper',
        receiptReference: 'R-100',
        clerkId: 'cashier-1',
        approvedBy: servedMovement.approvedBy,
      };
      expect(rows[0]).toEqual(first);
      expect(rows[1].reason).toBeNull();
    });

    it('keeps an unknown or missing direction unknown rather than guessing one', async () => {
      api.listCashMovements.mockReturnValue(
        of([
          { ...servedMovement, movementType: undefined },
          { ...servedMovement, movementType: 'SIDEWAYS' as unknown as CashMovementResponseMovementTypeEnum },
        ]),
      );
      const rows = await firstValueFrom(service.movements(SESSION_ID));
      expect(rows.map(row => row.movementType)).toEqual([undefined, undefined]);
    });

    it('maps an empty list to no movements', async () => {
      api.listCashMovements.mockReturnValue(of([]));
      expect(await firstValueFrom(service.movements(SESSION_ID))).toEqual([]);
    });

    it('fails on a missing list rather than reading it as empty (ADR-0064 §1)', async () => {
      api.listCashMovements.mockReturnValue(of(null));
      await expect(firstValueFrom(service.movements(SESSION_ID))).rejects.toThrow();
    });
  });

  describe('options()', () => {
    it('reads the cashier options and keeps only the known reasons', async () => {
      const served: CashMovementOptionsResponse = {
        sessionId: SESSION_ID,
        currencyCode: 'CAD',
        reasons: [
          {
            reason: ReasonOptionReasonEnum.PettyExpense,
            direction: ReasonOptionDirectionEnum.PaidOut,
            allowedNow: true,
            cashierLimit: 50,
            runningTotal: 12.5,
            alwaysNeedsManager: false,
            requiredFields: ['categoryCode', 'receiptReference', 'note'],
          },
          {
            reason: ReasonOptionReasonEnum.FloatIncrease,
            direction: ReasonOptionDirectionEnum.PaidIn,
            allowedNow: true,
            alwaysNeedsManager: true,
            requiredFields: [],
          },
          // A code this build does not know is never offered (§8.2).
          { reason: 'CUSTOMER_REFUND' as unknown as ReasonOptionReasonEnum, allowedNow: true },
          // A known reason without a known direction is dropped, never defaulted to OUT (AC 2).
          { reason: ReasonOptionReasonEnum.BankDrop, allowedNow: true, requiredFields: ['bagNumber'] },
          {
            reason: ReasonOptionReasonEnum.FloatDecrease,
            direction: 'SIDEWAYS' as unknown as ReasonOptionDirectionEnum,
            allowedNow: true,
          },
        ],
        categories: [
          { code: 'OFFICE', label: 'Office supplies', examples: 'Pens, paper' },
          { code: 'CLEANING', label: ' ', examples: '' },
          { label: 'No code' },
        ],
      };
      api.getCashMovementOptions.mockReturnValue(of(served));

      const options = await firstValueFrom(service.options(SESSION_ID));

      expect(api.getCashMovementOptions).toHaveBeenCalledWith(SESSION_ID);
      const expected: DrawerOptions = {
        sessionId: SESSION_ID,
        currencyCode: 'CAD',
        reasons: [
          {
            reason: 'PETTY_EXPENSE',
            direction: 'PAID_OUT',
            allowedNow: true,
            cashierLimit: 50,
            alwaysNeedsManager: false,
            requiredFields: ['categoryCode', 'receiptReference', 'note'],
          },
          {
            reason: 'FLOAT_INCREASE',
            direction: 'PAID_IN',
            allowedNow: true,
            cashierLimit: null,
            alwaysNeedsManager: true,
            requiredFields: [],
          },
        ],
        categories: [
          { code: 'OFFICE', label: 'Office supplies', examples: 'Pens, paper' },
          { code: 'CLEANING', label: 'CLEANING', examples: null },
        ],
      };
      expect(options).toEqual(expected);
    });
  });

  describe('recordMovement()', () => {
    it('posts the movement for the session and maps the recorded row', async () => {
      api.recordCashMovement.mockReturnValue(of(servedMovement));
      const request: CashMovementRequest = {
        requestId: '018f2a6e-0000-7000-8000-00000000r001',
        reason: CashMovementRequestReasonEnum.PettyExpense,
        amount: 12.5,
        currencyCode: 'CAD',
        categoryCode: 'OFFICE',
        note: 'Printer paper',
        receiptReference: 'R-100',
      };

      const recorded = await firstValueFrom(service.recordMovement(SESSION_ID, request));

      expect(api.recordCashMovement).toHaveBeenCalledWith(SESSION_ID, request);
      expect(recorded.movementId).toBe(servedMovement.movementId);
      expect(recorded.reason).toBe('PETTY_EXPENSE');
    });
  });

  describe('requestApproval()', () => {
    const request: CashMovementApprovalRequest = {
      managerUsername: 'manager',
      managerPassword: 'secret',
      reason: CashMovementApprovalRequestReasonEnum.PettyExpense,
      amount: 80,
      currencyCode: 'CAD',
      categoryCode: 'OFFICE',
    };

    it("sends the step-up for the session with no extra options (the cashier's own session, AW31)", async () => {
      const served: CashMovementApprovalResponse = {
        approvalToken: 'token-1',
        expiresAt: '2026-10-07T14:05:00Z',
        amount: 80,
        currencyCode: 'CAD',
      };
      api.requestCashMovementApproval.mockReturnValue(of(served));

      const approval = await firstValueFrom(service.requestApproval(SESSION_ID, request));

      expect(api.requestCashMovementApproval).toHaveBeenCalledWith(SESSION_ID, request);
      expect(api.requestCashMovementApproval.mock.calls[0]).toHaveLength(2);
      const expected: DrawerApproval = { approvalToken: 'token-1', expiresAt: '2026-10-07T14:05:00Z' };
      expect(approval).toEqual(expected);
    });

    it('fails when the step-up answers without a token', async () => {
      api.requestCashMovementApproval.mockReturnValue(of({ expiresAt: '2026-10-07T14:05:00Z' }));
      await expect(firstValueFrom(service.requestApproval(SESSION_ID, request))).rejects.toThrow();
    });
  });
});

describe('classifyDrawerError', () => {
  function refusal(status: number, code?: string, fields: string[] = []): HttpErrorResponse {
    const body: Partial<ApiError> = code
      ? { code, message: 'refused', status, fieldErrors: fields.map(field => ({ field, message: 'bad' })) }
      : {};
    return new HttpErrorResponse({ status, error: body });
  }

  const recordCases: readonly (readonly [HttpErrorResponse, DrawerFailure['kind']])[] = [
    [refusal(403, 'CASH_MOVEMENT_APPROVAL_REQUIRED'), 'APPROVAL_REQUIRED'],
    [refusal(403, 'CASH_MOVEMENT_APPROVAL_INVALID'), 'APPROVAL_INVALID'],
    [refusal(403, 'CASH_MOVEMENT_SELF_APPROVAL'), 'SELF_APPROVAL'],
    [refusal(422, 'CASH_MOVEMENT_TYPE_NOT_ALLOWED'), 'TYPE_NOT_ALLOWED'],
    [refusal(422, 'PETTY_EXPENSE_CATEGORY_UNKNOWN'), 'CATEGORY_UNKNOWN'],
    [refusal(422, 'FLOAT_CHANGE_NOT_RECORDED'), 'FLOAT_NOT_RECORDED'],
    [refusal(409, 'REGISTER_SESSION_CONFLICT'), 'SESSION_NOT_OPEN'],
    [refusal(409, 'IDEMPOTENCY_CONFLICT'), 'CONFLICT'],
    [refusal(404, 'REGISTER_SESSION_NOT_FOUND'), 'SESSION_GONE'],
    [refusal(403, 'ORDER_FORBIDDEN'), 'FORBIDDEN'],
    [refusal(403, 'LOCATION_SCOPE_DENIED'), 'SCOPE_DENIED'],
    // An unexplained 403 is never claimed to be a missing permission (ADR-0064 §4).
    [refusal(403, 'SOMETHING_NEW'), 'REFUSED'],
    [refusal(403), 'REFUSED'],
    [refusal(422, 'CURRENCY_NOT_SUPPORTED'), 'REFUSED'],
    [refusal(500), 'UNKNOWN_OUTCOME'],
    [refusal(0), 'UNKNOWN_OUTCOME'],
    [refusal(504), 'UNKNOWN_OUTCOME'],
  ];

  it.each(recordCases)('classifies a record refusal %# by code, then by status', (error, kind) => {
    expect(classifyDrawerError(error, 'RECORD').kind).toBe(kind);
  });

  it('keeps the fields a 400 names', () => {
    const failure = classifyDrawerError(refusal(400, 'REGISTER_SESSION_INVALID_ARGUMENT', ['bagNumber']), 'RECORD');
    expect(failure).toEqual({ kind: 'INVALID', fields: ['bagNumber'] });
  });

  it('reads a step-up refusal by its own codes', () => {
    expect(classifyDrawerError(refusal(403, 'CASH_MOVEMENT_APPROVAL_DENIED'), 'APPROVE').kind).toBe('APPROVAL_DENIED');
    expect(classifyDrawerError(refusal(403, 'CASH_MOVEMENT_SELF_APPROVAL'), 'APPROVE').kind).toBe('SELF_APPROVAL');
    expect(classifyDrawerError(refusal(409, 'REGISTER_SESSION_CONFLICT'), 'APPROVE').kind).toBe('SESSION_NOT_OPEN');
    expect(classifyDrawerError(refusal(403, 'LOCATION_SCOPE_DENIED'), 'APPROVE').kind).toBe('SCOPE_DENIED');
    expect(classifyDrawerError(refusal(403, 'ORDER_FORBIDDEN'), 'APPROVE').kind).toBe('FORBIDDEN');
    // An unknown 403 on the step-up is a refusal, not a claimed missing permission.
    expect(classifyDrawerError(refusal(403, 'CASH_MOVEMENT_CALLER_UNIDENTIFIED'), 'APPROVE').kind).toBe('REFUSED');
  });

  it('treats an unanswered step-up as unavailable, never as a refusal', () => {
    expect(classifyDrawerError(refusal(503, 'CASH_MOVEMENT_APPROVAL_UNAVAILABLE'), 'APPROVE').kind).toBe(
      'APPROVAL_UNAVAILABLE',
    );
    expect(classifyDrawerError(new Error('boom'), 'APPROVE').kind).toBe('APPROVAL_UNAVAILABLE');
    expect(classifyDrawerError(new Error('boom'), 'RECORD').kind).toBe('UNKNOWN_OUTCOME');
  });
});
