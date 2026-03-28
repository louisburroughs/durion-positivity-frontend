export interface AppointmentDetail {
  appointmentId: string;
  status: string;
  facilityId: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  facilityTimeZoneId?: string;
  rescheduleCount?: number;
}

export interface AssignmentDetail {
  assignmentId: string;
  assignmentType?: string;
  bayId?: string;
  bayIdentifier?: string;
  bayName?: string;
  mobileUnitId?: string;
  mechanic?: { mechanicId: string; displayName?: string } | null;
  notes?: string;
  version?: number;
}

export interface Conflict {
  type: 'HARD' | 'SOFT';
  code: string;
  message: string;
  overridable?: boolean;
}

export interface TimeSlot {
  scheduledStartDateTime: string;
  scheduledEndDateTime: string;
  reason?: string;
}

export interface ConflictPayload {
  conflicts: Conflict[];
  suggestedAlternatives?: TimeSlot[];
}

export interface RescheduleRequest {
  scheduledStartDateTime: string;
  scheduledEndDateTime?: string;
  reason: string;
  notes?: string;
  overrideReason?: string;
  approvalReason?: string;
  overrideSoftConflicts?: boolean;
  clientRequestId?: string;
}

export interface CreateAppointmentPayload {
  sourceType: 'ESTIMATE' | 'WORKORDER';
  sourceId: string;
  facilityId: string;
  scheduledStartDateTime: string;
  scheduledEndDateTime?: string;
  clientRequestId: string;
  overrideSoftConflicts?: boolean;
  overrideReason?: string;
}
