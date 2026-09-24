import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountingPeriodResponse,
  AccountingPeriodResponseStatusEnum,
  AccountingPeriodsService as AccountingPeriodsSdk,
  ApiError,
} from '@durion-sdk/accounting';
import { AccountingPeriod } from '../models/period-close.models';
import { PeriodCloseService, classifyPeriodActionError } from './period-close.service';

const sdkRow = (overrides: Partial<AccountingPeriodResponse> = {}): AccountingPeriodResponse => ({
  periodId: 'p-2026-07',
  periodCode: '2026-07',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  status: AccountingPeriodResponseStatusEnum.Open,
  ...overrides,
});

const apiError = (overrides: Partial<ApiError>): ApiError => ({
  code: 'UNSPECIFIED',
  message: 'refused',
  status: 422,
  correlationId: 'corr-1',
  timestamp: '2026-08-01T12:00:00Z',
  ...overrides,
});

const httpError = (status: number, body: unknown): HttpErrorResponse =>
  new HttpErrorResponse({ status, error: body });

describe('PeriodCloseService', () => {
  let service: PeriodCloseService;

  const sdkStub = {
    listAccountingPeriods: vi.fn(),
    closeAccountingPeriod: vi.fn(),
    reopenAccountingPeriod: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PeriodCloseService, { provide: AccountingPeriodsSdk, useValue: sdkStub }],
    });
    service = TestBed.inject(PeriodCloseService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listPeriods()', () => {
    it('calls the SDK list with no arguments and maps every field', () => {
      sdkStub.listAccountingPeriods.mockReturnValueOnce(
        of([
          sdkRow({
            status: AccountingPeriodResponseStatusEnum.Closed,
            closedAt: '2026-08-02T09:00:00Z',
            closedBy: 'controller.jane',
            reopenedAt: '2026-08-05T10:00:00Z',
            reopenedBy: 'controller.jane',
            reopenJustification: '  Late vendor bill  ',
          }),
        ]),
      );

      let result: AccountingPeriod[] | undefined;
      service.listPeriods().subscribe(value => (result = value));

      expect(sdkStub.listAccountingPeriods).toHaveBeenCalledWith();
      expect(result).toEqual<AccountingPeriod[]>([
        {
          periodCode: '2026-07',
          startDate: '2026-07-01',
          endDate: '2026-07-31',
          status: 'CLOSED',
          closedAt: '2026-08-02T09:00:00Z',
          closedBy: 'controller.jane',
          reopenedAt: '2026-08-05T10:00:00Z',
          reopenedBy: 'controller.jane',
          reopenJustification: 'Late vendor bill',
        },
      ]);
    });

    it('orders periods most recent first whatever order the server sends', () => {
      sdkStub.listAccountingPeriods.mockReturnValueOnce(
        of([sdkRow({ periodCode: '2025-12' }), sdkRow({ periodCode: '2026-08' }), sdkRow({ periodCode: '2026-01' })]),
      );

      let codes: string[] = [];
      service.listPeriods().subscribe(value => (codes = value.map(period => period.periodCode)));

      expect(codes).toEqual(['2026-08', '2026-01', '2025-12']);
    });

    it('drops a row without a valid period code, which no action could target', () => {
      sdkStub.listAccountingPeriods.mockReturnValueOnce(
        of([sdkRow({ periodCode: undefined }), sdkRow({ periodCode: '2026-13' }), sdkRow()]),
      );

      let codes: string[] = [];
      service.listPeriods().subscribe(value => (codes = value.map(period => period.periodCode)));

      expect(codes).toEqual(['2026-07']);
    });

    it('never passes a UUID actor through as a name', () => {
      sdkStub.listAccountingPeriods.mockReturnValueOnce(
        of([sdkRow({ closedBy: '0190b3a4-7c2e-7d1f-9a3b-5e6f7a8b9c0d', reopenedBy: ' ' })]),
      );

      let row: AccountingPeriod | undefined;
      service.listPeriods().subscribe(value => (row = value[0]));

      expect(row?.closedBy).toBeNull();
      expect(row?.reopenedBy).toBeNull();
    });

    it('reads a missing status as UNKNOWN rather than guessing OPEN', () => {
      sdkStub.listAccountingPeriods.mockReturnValueOnce(of([sdkRow({ status: undefined })]));

      let row: AccountingPeriod | undefined;
      service.listPeriods().subscribe(value => (row = value[0]));

      expect(row?.status).toBe('UNKNOWN');
    });
  });

  describe('closePeriod()', () => {
    it('passes the period code as the only argument and maps the response', () => {
      sdkStub.closeAccountingPeriod.mockReturnValueOnce(
        of(sdkRow({ status: AccountingPeriodResponseStatusEnum.Closed, closedBy: 'controller.jane' })),
      );

      let row: AccountingPeriod | undefined;
      service.closePeriod('2026-07').subscribe(value => (row = value));

      expect(sdkStub.closeAccountingPeriod).toHaveBeenCalledWith('2026-07');
      expect(row?.status).toBe('CLOSED');
      expect(row?.closedBy).toBe('controller.jane');
    });
  });

  describe('reopenPeriod()', () => {
    it('sends the justification as the request body and maps the response', () => {
      sdkStub.reopenAccountingPeriod.mockReturnValueOnce(
        of(sdkRow({ reopenJustification: 'Late vendor bill', reopenedBy: 'controller.jane' })),
      );

      let row: AccountingPeriod | undefined;
      service.reopenPeriod('2026-07', 'Late vendor bill').subscribe(value => (row = value));

      expect(sdkStub.reopenAccountingPeriod).toHaveBeenCalledWith('2026-07', { justification: 'Late vendor bill' });
      expect(row?.status).toBe('OPEN');
      expect(row?.reopenJustification).toBe('Late vendor bill');
    });
  });
});

describe('classifyPeriodActionError()', () => {
  it('counts one blocking draft per draftJournalEntryIds field error, as the backend emits them', () => {
    const failure = classifyPeriodActionError(
      httpError(
        422,
        apiError({
          code: 'PERIOD_HAS_DRAFT_ENTRIES',
          fieldErrors: [
            { field: 'draftJournalEntryIds', message: '0190b3a4-0000-7000-8000-000000000001' },
            { field: 'draftJournalEntryIds', message: '0190b3a4-0000-7000-8000-000000000002' },
            { field: 'somethingElse', message: 'ignored' },
          ],
        }),
      ),
    );

    expect(failure).toEqual({ kind: 'DRAFT_ENTRIES', draftCount: 2 });
  });

  it('reports drafts without a count when the body lists none', () => {
    const failure = classifyPeriodActionError(httpError(422, apiError({ code: 'PERIOD_HAS_DRAFT_ENTRIES' })));

    expect(failure).toEqual({ kind: 'DRAFT_ENTRIES', draftCount: null });
  });

  it.each([
    ['PERIOD_ALREADY_CLOSED', 409, 'ALREADY_CLOSED'],
    ['PERIOD_ALREADY_OPEN', 409, 'ALREADY_OPEN'],
    ['PERIOD_NOT_FOUND', 404, 'NOT_FOUND'],
  ])('maps %s to %s', (code, status, kind) => {
    expect(classifyPeriodActionError(httpError(status, apiError({ code, status })))).toEqual({ kind });
  });

  it.each([
    [400, 'INVALID'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [500, 'OTHER'],
    [0, 'OTHER'],
  ])('falls back to the HTTP status %s when the body carries no known code', (status, kind) => {
    expect(classifyPeriodActionError(httpError(status, null))).toEqual({ kind });
  });

  it('reads a non-HTTP error as OTHER', () => {
    expect(classifyPeriodActionError(new Error('boom'))).toEqual({ kind: 'OTHER' });
  });
});
