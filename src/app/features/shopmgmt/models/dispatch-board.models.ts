export interface WorkorderSummary {
  workorderId: string;
  status: string;
  appointmentId?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface MechanicStatus {
  mechanicId: string;
  name: string;
  status?: string;
  assignedWorkorderId?: string;
}

export interface BayStatus {
  bayId: string;
  occupied: boolean;
  assignedWorkorderId?: string;
}

export interface ConflictEntry {
  code: string;
  severity: 'WARNING' | 'BLOCKING';
  message: string;
  targetType?: string;
  targetId?: string;
}

export interface DashboardResponse {
  date?: string;
  locationId?: string;
  workorders?: WorkorderSummary[];
  mechanics?: MechanicStatus[];
  bays?: BayStatus[];
  conflicts?: ConflictEntry[];
  lastRefreshed?: string;
  dataQualityWarning?: boolean;
}
