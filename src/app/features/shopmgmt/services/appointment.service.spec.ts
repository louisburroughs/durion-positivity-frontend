/**
 * AppointmentService unit tests — CAP-249
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppointmentService } from './appointment.service';
import {
  AppointmentsAPIService,
  AssignmentControllerService,
  ConflictOverrideAPIService,
  ScheduleAPIService,
  ShopAPIService,
  ShopAuditControllerService,
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
  getAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  createAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
};
const assignmentStub = { listAssignments: vi.fn(), createAssignment: vi.fn() };
const conflictOverrideStub = { executeOverride: vi.fn() };
const scheduleStub = { viewSchedule: vi.fn() };
const shopStub = { getShopServiceDetails: vi.fn() };
const shopAuditStub = { searchAudit: vi.fn() };

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AppointmentService [CAP-249]', () => {
  let service: AppointmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    appointmentsStub.getAppointment.mockReturnValue(of(STUB_APPOINTMENT));
    appointmentsStub.createAppointment.mockReturnValue(of(STUB_APPOINTMENT));
    appointmentsStub.rescheduleAppointment.mockReturnValue(of(STUB_APPOINTMENT));
    assignmentStub.listAssignments.mockReturnValue(of([]));
    assignmentStub.createAssignment.mockReturnValue(of({}));
    conflictOverrideStub.executeOverride.mockReturnValue(of({}));
    scheduleStub.viewSchedule.mockReturnValue(of({}));
    shopAuditStub.searchAudit.mockReturnValue(of([]));

    TestBed.configureTestingModule({
      providers: [
        AppointmentService,
        { provide: AppointmentsAPIService, useValue: appointmentsStub },
        { provide: AssignmentControllerService, useValue: assignmentStub },
        { provide: ConflictOverrideAPIService, useValue: conflictOverrideStub },
        { provide: ScheduleAPIService, useValue: scheduleStub },
        { provide: ShopAPIService, useValue: shopStub },
        { provide: ShopAuditControllerService, useValue: shopAuditStub },
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

      expect(appointmentsStub.getAppointment).toHaveBeenCalledWith('appt-1');
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
    it('calls assignmentSdk.createAssignment with appointmentId and body', () => {
      const body = { assignmentType: 'BAY', bayId: 'bay-2' };
      service.createAssignment('appt-1', body).subscribe();

      expect(assignmentStub.createAssignment).toHaveBeenCalledWith('appt-1', body);
    });

    it('forwards the request body to createAssignment', () => {
      const body = { assignmentType: 'MOBILE_UNIT', mobileUnitId: 'mu-5' };
      service.createAssignment('appt-1', body).subscribe();

      expect(assignmentStub.createAssignment).toHaveBeenCalledWith('appt-1', body);
    });
  });

  // ── rescheduleAppointment ─────────────────────────────────────────────────

  describe('rescheduleAppointment', () => {
    it('calls appointmentsSdk.rescheduleAppointment with appointmentId and body', () => {
      service.rescheduleAppointment('appt-1', STUB_RESCHEDULE_REQUEST).subscribe();

      expect(appointmentsStub.rescheduleAppointment).toHaveBeenCalledWith('appt-1', STUB_RESCHEDULE_REQUEST);
    });

    it('forwards the reschedule body', () => {
      service.rescheduleAppointment('appt-1', STUB_RESCHEDULE_REQUEST).subscribe();

      expect(appointmentsStub.rescheduleAppointment).toHaveBeenCalledWith('appt-1', STUB_RESCHEDULE_REQUEST);
    });
  });

  // ── searchAudit ───────────────────────────────────────────────────────────

  describe('searchAudit', () => {
    it('calls shopAuditSdk.searchAudit with appointmentId in filter object', () => {
      shopAuditStub.searchAudit.mockReturnValue(of([]));
      service.searchAudit('appt-1').subscribe();

      expect(shopAuditStub.searchAudit).toHaveBeenCalledWith({ appointmentId: 'appt-1' });
    });

    it('forwards the appointmentId to the SDK filter', () => {
      shopAuditStub.searchAudit.mockReturnValue(of([]));
      service.searchAudit('appt-1').subscribe();

      expect(shopAuditStub.searchAudit).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 'appt-1' }));
    });
  });

  // ── createAppointment ─────────────────────────────────────────────────────

  describe('createAppointment', () => {
    it('calls appointmentsSdk.createAppointment with body and idempotencyKey', () => {
      service.createAppointment(STUB_CREATE_PAYLOAD, 'idem-key-abc').subscribe();

      expect(appointmentsStub.createAppointment).toHaveBeenCalledWith(STUB_CREATE_PAYLOAD, 'idem-key-abc');
    });

    it('forwards the request body to the SDK', () => {
      service.createAppointment(STUB_CREATE_PAYLOAD, 'idem-key-abc').subscribe();

      expect(appointmentsStub.createAppointment).toHaveBeenCalledWith(STUB_CREATE_PAYLOAD, expect.anything());
    });

    it('forwards the idempotencyKey as second argument to the SDK', () => {
      service.createAppointment(STUB_CREATE_PAYLOAD, 'idem-key-abc').subscribe();

      expect(appointmentsStub.createAppointment).toHaveBeenCalledWith(expect.anything(), 'idem-key-abc');
    });
  });

  // ── executeOverride ───────────────────────────────────────────────────────

  describe('executeOverride', () => {
    it('calls conflictOverrideSdk.executeOverride with appointmentId and body', () => {
      const body = { overrideReason: 'Manager approved' };
      service.executeOverride('appt-1', body).subscribe();

      expect(conflictOverrideStub.executeOverride).toHaveBeenCalledWith('appt-1', body);
    });

    it('forwards the override body to the SDK', () => {
      const body = { overrideReason: 'Emergency' };
      service.executeOverride('appt-1', body).subscribe();

      expect(conflictOverrideStub.executeOverride).toHaveBeenCalledWith('appt-1', body);
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

      expect(scheduleStub.viewSchedule).toHaveBeenCalledWith('loc-1', '2026-04-01', expect.anything(), expect.anything());
    });
  });
});
