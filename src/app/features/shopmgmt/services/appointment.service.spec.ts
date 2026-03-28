/**
 * AppointmentService unit tests — CAP-249
 *
 * RED: These tests will fail to compile until
 * src/app/features/shopmgmt/services/appointment.service.ts is created.
 *
 * API paths covered:
 *   getAppointment          → GET  /v1/appointments/{id}
 *   listAssignments         → GET  /v1/appointments/{id}/assignments
 *   createAssignment        → POST /v1/appointments/{id}/assignments
 *   rescheduleAppointment   → PUT  /v1/appointments/{id}/reschedule
 *   searchAudit             → GET  /v1/shop/audit  (appointmentId query param)
 *   createAppointment       → POST /v1/appointments  (Idempotency-Key header)
 *   executeOverride         → POST /v1/appointments/{id}/conflict-override
 *   viewSchedule            → GET  /v1/schedules/view  (locationId + date query params)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { AppointmentService } from './appointment.service';
import { ApiBaseService } from '../../../core/services/api-base.service';

// ---------------------------------------------------------------------------
// Inline stubs — mirror models that will live in ../models/appointment.models
// ---------------------------------------------------------------------------

const STUB_APPOINTMENT = {
  appointmentId: 'appt-1',
  status: 'SCHEDULED',
  facilityId: 'fac-1',
};

const STUB_ASSIGNMENT = {
  assignmentId: 'asn-1',
  assignmentType: 'BAY',
  bayId: 'bay-1',
};

const STUB_RESCHEDULE_REQUEST = {
  scheduledStartDateTime: '2026-04-01T09:00:00Z',
  scheduledEndDateTime: '2026-04-01T10:00:00Z',
  reason: 'CUSTOMER_REQUEST',
};

const STUB_CREATE_PAYLOAD = {
  sourceType: 'ESTIMATE' as const,
  sourceId: 'est-100',
  facilityId: 'fac-1',
  scheduledStartDateTime: '2026-04-01T09:00:00Z',
  clientRequestId: 'uuid-abc-123',
};

// ---------------------------------------------------------------------------
// Shared ApiBaseService mock
// ---------------------------------------------------------------------------

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AppointmentService [CAP-249]', () => {
  let service: AppointmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockReturnValue(of(STUB_APPOINTMENT));
    apiMock.post.mockReturnValue(of({}));
    apiMock.put.mockReturnValue(of({}));

    TestBed.configureTestingModule({
      providers: [
        AppointmentService,
        { provide: ApiBaseService, useValue: apiMock },
      ],
    });

    service = TestBed.inject(AppointmentService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── getAppointment ────────────────────────────────────────────────────────

  describe('getAppointment', () => {
    it('calls GET /v1/appointments/{id} with the interpolated id', () => {
      service.getAppointment('appt-1').subscribe();

      expect(apiMock.get).toHaveBeenCalledOnce();
      expect(apiMock.get.mock.calls[0][0]).toBe('/v1/appointments/appt-1');
    });

    it('returns an Observable that emits the API response', () => {
      let emitted: unknown;
      service.getAppointment('appt-1').subscribe((v) => { emitted = v; });

      expect(emitted).toEqual(STUB_APPOINTMENT);
    });
  });

  // ── listAssignments ───────────────────────────────────────────────────────

  describe('listAssignments', () => {
    it('calls GET /v1/appointments/{id}/assignments with the interpolated id', () => {
      apiMock.get.mockReturnValue(of([STUB_ASSIGNMENT]));
      service.listAssignments('appt-1').subscribe();

      expect(apiMock.get).toHaveBeenCalledOnce();
      expect(apiMock.get.mock.calls[0][0]).toBe('/v1/appointments/appt-1/assignments');
    });

    it('returns an Observable wrapping the API response', () => {
      apiMock.get.mockReturnValue(of([STUB_ASSIGNMENT]));
      let emitted: unknown;
      service.listAssignments('appt-1').subscribe((v) => { emitted = v; });

      expect(emitted).toEqual([STUB_ASSIGNMENT]);
    });
  });

  // ── createAssignment ──────────────────────────────────────────────────────

  describe('createAssignment', () => {
    it('calls POST /v1/appointments/{id}/assignments with the correct path', () => {
      const body = { assignmentType: 'BAY', bayId: 'bay-2' };
      service.createAssignment('appt-1', body).subscribe();

      expect(apiMock.post).toHaveBeenCalledOnce();
      expect(apiMock.post.mock.calls[0][0]).toBe('/v1/appointments/appt-1/assignments');
    });

    it('passes the request body as the second argument to post()', () => {
      const body = { assignmentType: 'MOBILE_UNIT', mobileUnitId: 'mu-5' };
      service.createAssignment('appt-1', body).subscribe();

      const [, calledBody] = apiMock.post.mock.calls[0];
      expect(calledBody).toEqual(body);
    });
  });

  // ── rescheduleAppointment ─────────────────────────────────────────────────

  describe('rescheduleAppointment', () => {
    it('calls PUT /v1/appointments/{id}/reschedule with the interpolated id', () => {
      service.rescheduleAppointment('appt-1', STUB_RESCHEDULE_REQUEST).subscribe();

      expect(apiMock.put).toHaveBeenCalledOnce();
      expect(apiMock.put.mock.calls[0][0]).toBe('/v1/appointments/appt-1/reschedule');
    });

    it('passes the reschedule body as the second argument to put()', () => {
      service.rescheduleAppointment('appt-1', STUB_RESCHEDULE_REQUEST).subscribe();

      const [, calledBody] = apiMock.put.mock.calls[0];
      expect(calledBody).toEqual(STUB_RESCHEDULE_REQUEST);
    });
  });

  // ── searchAudit ───────────────────────────────────────────────────────────

  describe('searchAudit', () => {
    it('calls GET /v1/shop/audit', () => {
      apiMock.get.mockReturnValue(of([]));
      service.searchAudit('appt-1').subscribe();

      expect(apiMock.get).toHaveBeenCalledOnce();
      expect(apiMock.get.mock.calls[0][0]).toBe('/v1/shop/audit');
    });

    it('passes appointmentId as a query param in an HttpParams object', () => {
      apiMock.get.mockReturnValue(of([]));
      service.searchAudit('appt-1').subscribe();

      const params: HttpParams = apiMock.get.mock.calls[0][1];
      expect(params).toBeInstanceOf(HttpParams);
      expect(params.get('appointmentId')).toBe('appt-1');
    });
  });

  // ── createAppointment ─────────────────────────────────────────────────────

  describe('createAppointment', () => {
    it('calls POST /v1/appointments', () => {
      service.createAppointment(STUB_CREATE_PAYLOAD, 'idem-key-abc').subscribe();

      expect(apiMock.post).toHaveBeenCalledOnce();
      expect(apiMock.post.mock.calls[0][0]).toBe('/v1/appointments');
    });

    it('passes the request body as the second argument', () => {
      service.createAppointment(STUB_CREATE_PAYLOAD, 'idem-key-abc').subscribe();

      const [, calledBody] = apiMock.post.mock.calls[0];
      expect(calledBody).toEqual(STUB_CREATE_PAYLOAD);
    });

    it('forwards the idempotencyKey as Idempotency-Key header', () => {
      service.createAppointment(STUB_CREATE_PAYLOAD, 'idem-key-abc').subscribe();

      const [, , options] = apiMock.post.mock.calls[0];
      expect(options?.headers?.['Idempotency-Key']).toBe('idem-key-abc');
    });
  });

  // ── executeOverride ───────────────────────────────────────────────────────

  describe('executeOverride', () => {
    it('calls POST /v1/appointments/{id}/conflict-override', () => {
      const body = { overrideReason: 'Manager approved' };
      service.executeOverride('appt-1', body).subscribe();

      expect(apiMock.post).toHaveBeenCalledOnce();
      expect(apiMock.post.mock.calls[0][0]).toBe('/v1/appointments/appt-1/conflict-override');
    });

    it('passes the override body as the second argument', () => {
      const body = { overrideReason: 'Emergency' };
      service.executeOverride('appt-1', body).subscribe();

      const [, calledBody] = apiMock.post.mock.calls[0];
      expect(calledBody).toEqual(body);
    });
  });

  // ── viewSchedule ──────────────────────────────────────────────────────────

  describe('viewSchedule', () => {
    it('calls GET /v1/schedules/view', () => {
      apiMock.get.mockReturnValue(of({}));
      service.viewSchedule('loc-1', '2026-04-01').subscribe();

      expect(apiMock.get).toHaveBeenCalledOnce();
      expect(apiMock.get.mock.calls[0][0]).toBe('/v1/schedules/view');
    });

    it('passes locationId and date as HttpParams query params', () => {
      apiMock.get.mockReturnValue(of({}));
      service.viewSchedule('loc-1', '2026-04-01').subscribe();

      const params: HttpParams = apiMock.get.mock.calls[0][1];
      expect(params).toBeInstanceOf(HttpParams);
      expect(params.get('locationId')).toBe('loc-1');
      expect(params.get('date')).toBe('2026-04-01');
    });
  });
});
