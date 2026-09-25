/**
 * AppointmentService unit tests — CAP-249
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AppointmentService } from './appointment.service';
import {
  AppointmentsAPIService,
  AppointmentAssignmentsService,
  ConflictOverrideAPIService,
  ScheduleAPIService,
  ShopAuditService,
} from '@durion-sdk/shop-manager';
import { LocationAPIService } from '@durion-sdk/location';

// ---------------------------------------------------------------------------
// Inline stubs
// ---------------------------------------------------------------------------

// The real wire shape (`AppointmentResponse`): `locationId`/`startAt`/`endAt`, not the
// `facilityId`/`scheduledStart`/`scheduledEnd` the pages read (CAP-249 verify finding).
const RAW_APPOINTMENT_RESPONSE = {
  appointmentId: 'appt-1',
  status: 'SCHEDULED',
  locationId: 'fac-1',
  startAt: '2026-04-01T09:00:00Z',
  endAt: '2026-04-01T10:00:00Z',
  conflicts: [],
};

// What AppointmentService.getAppointment/rescheduleAppointment/cancelAppointment/createAppointment
// map the raw response into.
const MAPPED_APPOINTMENT = {
  appointmentId: 'appt-1',
  status: 'SCHEDULED',
  facilityId: 'fac-1',
  scheduledStart: '2026-04-01T09:00:00Z',
  scheduledEnd: '2026-04-01T10:00:00Z',
  conflicts: [],
};

const STUB_LOCATION = { id: 'fac-1', name: 'Downtown Shop' };

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
// SDK stubs
// ---------------------------------------------------------------------------

const appointmentsStub = {
  getAppointmentById: vi.fn(),
  rescheduleAppointment: vi.fn(),
  createAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
};
const assignmentStub = { listAssignments: vi.fn(), createAssignment: vi.fn() };
const conflictOverrideStub = { executeConflictOverride: vi.fn() };
const scheduleStub = { viewSchedule: vi.fn() };
const shopAuditStub = { searchShopAudit: vi.fn() };
const locationApiStub = { getLocationById: vi.fn() };

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AppointmentService [CAP-249]', () => {
  let service: AppointmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    appointmentsStub.getAppointmentById.mockReturnValue(of(RAW_APPOINTMENT_RESPONSE));
    appointmentsStub.createAppointment.mockReturnValue(of(RAW_APPOINTMENT_RESPONSE));
    appointmentsStub.rescheduleAppointment.mockReturnValue(of(RAW_APPOINTMENT_RESPONSE));
    appointmentsStub.cancelAppointment.mockReturnValue(of(RAW_APPOINTMENT_RESPONSE));
    assignmentStub.listAssignments.mockReturnValue(of([]));
    assignmentStub.createAssignment.mockReturnValue(of({}));
    conflictOverrideStub.executeConflictOverride.mockReturnValue(of({}));
    scheduleStub.viewSchedule.mockReturnValue(of({}));
    shopAuditStub.searchShopAudit.mockReturnValue(of([]));
    locationApiStub.getLocationById.mockReturnValue(of(STUB_LOCATION));

    TestBed.configureTestingModule({
      providers: [
        AppointmentService,
        { provide: AppointmentsAPIService, useValue: appointmentsStub },
        { provide: AppointmentAssignmentsService, useValue: assignmentStub },
        { provide: ConflictOverrideAPIService, useValue: conflictOverrideStub },
        { provide: ScheduleAPIService, useValue: scheduleStub },
        { provide: ShopAuditService, useValue: shopAuditStub },
        { provide: LocationAPIService, useValue: locationApiStub },
      ],
    });

    service = TestBed.inject(AppointmentService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── getAppointment ────────────────────────────────────────────────────────

  describe('getAppointment', () => {
    it('calls appointmentsSdk.getAppointment with the id', () => {
      service.getAppointment('appt-1').subscribe();

      expect(appointmentsStub.getAppointmentById).toHaveBeenCalledWith('appt-1');
    });

    it('maps the raw SDK response (locationId/startAt/endAt) onto AppointmentDetail', () => {
      let emitted: unknown;
      service.getAppointment('appt-1').subscribe((v) => { emitted = v; });

      expect(emitted).toEqual(MAPPED_APPOINTMENT);
    });
  });

  // ── getFacilityName ───────────────────────────────────────────────────────

  describe('getFacilityName', () => {
    it('calls locationSdk.getLocationById with the id and resolves its name', () => {
      let emitted: unknown;
      service.getFacilityName('fac-1').subscribe((v) => { emitted = v; });

      expect(locationApiStub.getLocationById).toHaveBeenCalledWith('fac-1');
      expect(emitted).toBe('Downtown Shop');
    });

    it('degrades to undefined, never throwing, when the location read fails', () => {
      locationApiStub.getLocationById.mockReturnValue(throwError(() => new Error('down')));
      let emitted: unknown = 'not-yet-set';
      service.getFacilityName('fac-1').subscribe((v) => { emitted = v; });

      expect(emitted).toBeUndefined();
    });
  });

  // ── listAssignments ───────────────────────────────────────────────────────

  describe('listAssignments', () => {
    it('calls assignmentSdk.listAssignments with the appointmentId', () => {
      assignmentStub.listAssignments.mockReturnValue(of([STUB_ASSIGNMENT]));
      service.listAssignments('appt-1').subscribe();

      expect(assignmentStub.listAssignments).toHaveBeenCalledWith('appt-1');
    });

    it('returns an Observable wrapping the SDK response', () => {
      assignmentStub.listAssignments.mockReturnValue(of([STUB_ASSIGNMENT]));
      let emitted: unknown;
      service.listAssignments('appt-1').subscribe((v) => { emitted = v; });

      expect(emitted).toEqual([STUB_ASSIGNMENT]);
    });
  });

  // ── createAssignment ──────────────────────────────────────────────────────

  describe('createAssignment', () => {
    it('maps mechanic and bay identifiers into the SDK assignment request', () => {
      const body = {
        assignmentType: 'LEAD',
        bayId: 'bay-2',
        mechanic: { mechanicId: 'mech-7' },
      };
      service.createAssignment('appt-1', body).subscribe();

      expect(assignmentStub.createAssignment).toHaveBeenCalledWith('appt-1', {
        appointmentId: 'appt-1',
        resourceId: 'bay-2',
        resourceType: 'BAY',
        mechanics: [{ mechanicPersonId: 'mech-7', role: 'LEAD' }],
      });
    });

    it('maps assist assignments to mobile-unit resources and mechanic role enums', () => {
      const body = {
        assignmentType: 'ASSIST',
        mobileUnitId: 'mu-5',
        mechanic: { mechanicId: 'mech-9' },
      };
      service.createAssignment('appt-1', body).subscribe();

      expect(assignmentStub.createAssignment).toHaveBeenCalledWith('appt-1', {
        appointmentId: 'appt-1',
        resourceId: 'mu-5',
        resourceType: 'MOBILE_UNIT',
        mechanics: [{ mechanicPersonId: 'mech-9', role: 'ASSIST' }],
      });
    });
  });

  // ── rescheduleAppointment ─────────────────────────────────────────────────

  describe('rescheduleAppointment', () => {
    it('calls appointmentsSdk.rescheduleAppointment with appointmentId and body', () => {
      service.rescheduleAppointment('appt-1', STUB_RESCHEDULE_REQUEST).subscribe();

      expect(appointmentsStub.rescheduleAppointment).toHaveBeenCalledWith('appt-1', {
        newStartAt: '2026-04-01T09:00:00Z',
        newEndAt: '2026-04-01T10:00:00Z',
        reason: 'CUSTOMER_REQUEST',
        rescheduleReasonNotes: undefined,
      });
    });

    it('forwards the reschedule body', () => {
      service.rescheduleAppointment('appt-1', STUB_RESCHEDULE_REQUEST).subscribe();

      expect(appointmentsStub.rescheduleAppointment).toHaveBeenCalledWith(
        'appt-1',
        expect.objectContaining({ reason: 'CUSTOMER_REQUEST' }),
      );
    });
  });

  // ── cancelAppointment ─────────────────────────────────────────────────────

  describe('cancelAppointment', () => {
    it('calls appointmentsSdk.cancelAppointment with appointmentId and the mapped reason', () => {
      service.cancelAppointment('appt-1', { cancellationReason: 'WEATHER', notes: 'Storm' }).subscribe();

      expect(appointmentsStub.cancelAppointment).toHaveBeenCalledWith('appt-1', {
        cancellationReason: 'WEATHER',
        notes: 'Storm',
      });
    });

    it('maps the raw SDK response onto AppointmentDetail', () => {
      let emitted: unknown;
      service.cancelAppointment('appt-1', { cancellationReason: 'OTHER' }).subscribe((v) => { emitted = v; });

      expect(emitted).toEqual(MAPPED_APPOINTMENT);
    });
  });

  // ── searchAudit ───────────────────────────────────────────────────────────

  describe('searchAudit', () => {
    const RAW_AUDIT_ENTRY = {
      id: 'audit-1',
      eventType: 'SCHEDULE_UPDATED',
      actorUserId: 'user-9',
      recordedAt: '2026-04-01T08:00:00Z',
      changeSummaryText: 'Rescheduled',
      appointmentId: 'appt-1',
      retentionYears: 7,
    };

    it('calls shopAuditSdk.searchShopAudit with the appointmentId query parameter', () => {
      shopAuditStub.searchShopAudit.mockReturnValue(of([]));
      service.searchAudit('appt-1').subscribe();

      expect(shopAuditStub.searchShopAudit).toHaveBeenCalledWith(undefined, 'appt-1');
    });

    it('returns the real ShopAuditEntryResponse shape unchanged (ADR-0032)', () => {
      shopAuditStub.searchShopAudit.mockReturnValue(of([RAW_AUDIT_ENTRY]));
      let emitted: unknown;
      service.searchAudit('appt-1').subscribe((v) => { emitted = v; });

      expect(emitted).toEqual([RAW_AUDIT_ENTRY]);
    });
  });

  // ── createAppointment ─────────────────────────────────────────────────────

  describe('createAppointment', () => {
    it('maps customer and vehicle identifiers into the SDK appointment request', () => {
      service.createAppointment(
        {
          ...STUB_CREATE_PAYLOAD,
          crmCustomerId: 'cust-1',
          crmVehicleId: 'veh-9',
        },
        'idem-key-abc',
      ).subscribe();

      expect(appointmentsStub.createAppointment).toHaveBeenCalledWith({
        crmCustomerId: 'cust-1',
        crmVehicleId: 'veh-9',
        locationId: 'fac-1',
        startAt: '2026-04-01T09:00:00Z',
        endAt: '2026-04-01T09:00:00Z',
        serviceRequestIds: [],
        sourceType: 'ESTIMATE',
        sourceId: 'est-100',
      }, 'idem-key-abc');
    });

    it('maps source identifiers into the SDK request', () => {
      service.createAppointment(STUB_CREATE_PAYLOAD, 'idem-key-abc').subscribe();

      expect(appointmentsStub.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'ESTIMATE', sourceId: 'est-100' }),
        'idem-key-abc',
      );
    });

    it('forwards the idempotencyKey as second argument to the SDK', () => {
      service.createAppointment(STUB_CREATE_PAYLOAD, 'idem-key-abc').subscribe();

      expect(appointmentsStub.createAppointment).toHaveBeenCalledWith(expect.any(Object), 'idem-key-abc');
    });
  });

  // ── executeOverride ───────────────────────────────────────────────────────

  describe('executeOverride', () => {
    it('names the accepted conflicts in the body and the appointment only in the path (CAP-326 D18.3)', () => {
      const body = { conflictIds: ['conf-1', 'conf-2'], overrideReason: 'Manager approved' };
      service.executeOverride('appt-1', body).subscribe();

      expect(conflictOverrideStub.executeConflictOverride).toHaveBeenCalledWith('appt-1', {
        conflictIds: ['conf-1', 'conf-2'],
        overrideReason: 'Manager approved',
      });
    });

    it('forwards the override body to the SDK', () => {
      const body = { conflictIds: ['conf-1'], overrideReason: 'Emergency' };
      service.executeOverride('appt-1', body).subscribe();

      expect(conflictOverrideStub.executeConflictOverride).toHaveBeenCalledWith(
        'appt-1',
        expect.objectContaining({ overrideReason: 'Emergency' }),
      );
    });
  });

  // ── viewSchedule ──────────────────────────────────────────────────────────

  describe('viewSchedule', () => {
    it('calls scheduleSdk.viewSchedule with locationId and date', () => {
      scheduleStub.viewSchedule.mockReturnValue(of({}));
      service.viewSchedule('loc-1', '2026-04-01').subscribe();

      expect(scheduleStub.viewSchedule).toHaveBeenCalledWith('loc-1', '2026-04-01', undefined, undefined);
    });

    it('forwards locationId and date to the SDK', () => {
      scheduleStub.viewSchedule.mockReturnValue(of({}));
      service.viewSchedule('loc-1', '2026-04-01').subscribe();

      expect(scheduleStub.viewSchedule).toHaveBeenCalledWith('loc-1', '2026-04-01', undefined, undefined);
    });
  });
});
