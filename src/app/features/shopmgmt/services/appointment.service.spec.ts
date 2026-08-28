/**
 * AppointmentService unit tests — CAP-249
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppointmentService } from './appointment.service';
import {
  AppointmentsAPIService,
  AppointmentAssignmentsService,
  ConflictOverrideAPIService,
  ScheduleAPIService,
  ShopAuditService,
} from '@durion-sdk/shop-manager';

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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AppointmentService [CAP-249]', () => {
  let service: AppointmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    appointmentsStub.getAppointmentById.mockReturnValue(of(STUB_APPOINTMENT));
    appointmentsStub.createAppointment.mockReturnValue(of(STUB_APPOINTMENT));
    appointmentsStub.rescheduleAppointment.mockReturnValue(of(STUB_APPOINTMENT));
    assignmentStub.listAssignments.mockReturnValue(of([]));
    assignmentStub.createAssignment.mockReturnValue(of({}));
    conflictOverrideStub.executeConflictOverride.mockReturnValue(of({}));
    scheduleStub.viewSchedule.mockReturnValue(of({}));
    shopAuditStub.searchShopAudit.mockReturnValue(of([]));

    TestBed.configureTestingModule({
      providers: [
        AppointmentService,
        { provide: AppointmentsAPIService, useValue: appointmentsStub },
        { provide: AppointmentAssignmentsService, useValue: assignmentStub },
        { provide: ConflictOverrideAPIService, useValue: conflictOverrideStub },
        { provide: ScheduleAPIService, useValue: scheduleStub },
        { provide: ShopAuditService, useValue: shopAuditStub },
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

    it('returns an Observable that emits the SDK response', () => {
      let emitted: unknown;
      service.getAppointment('appt-1').subscribe((v) => { emitted = v; });

      expect(emitted).toEqual(STUB_APPOINTMENT);
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

  // ── searchAudit ───────────────────────────────────────────────────────────

  describe('searchAudit', () => {
    it('calls shopAuditSdk.searchShopAudit with the appointmentId query parameter', () => {
      shopAuditStub.searchShopAudit.mockReturnValue(of([]));
      service.searchAudit('appt-1').subscribe();

      expect(shopAuditStub.searchShopAudit).toHaveBeenCalledWith(undefined, 'appt-1');
    });

    it('forwards the appointmentId to the SDK filter', () => {
      shopAuditStub.searchShopAudit.mockReturnValue(of([]));
      service.searchAudit('appt-1').subscribe();

      expect(shopAuditStub.searchShopAudit).toHaveBeenCalledWith(undefined, 'appt-1');
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
    it('calls conflictOverrideSdk.executeOverride with appointmentId and body', () => {
      const body = { overrideReason: 'Manager approved' };
      service.executeOverride('appt-1', body).subscribe();

      expect(conflictOverrideStub.executeConflictOverride).toHaveBeenCalledWith('appt-1', {
        appointmentId: 'appt-1',
        overrideReason: 'Manager approved',
      });
    });

    it('forwards the override body to the SDK', () => {
      const body = { overrideReason: 'Emergency' };
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
