import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuditService, AuditExportsService } from '@durion-sdk/security';
import type { AuditExportRequest, PageAuditLogEventDto } from '@durion-sdk/security';
import {
  AuditEventDetail,
  AuditEventFilter,
  AuditEventPageResponse,
  AuditExportJob,
} from '../models/security-audit.models';

@Injectable({ providedIn: 'root' })
export class SecurityAuditService {
  private readonly auditSdk = inject(AuditService);
  private readonly auditExportsSdk = inject(AuditExportsService);

  searchAuditEvents(filter: Partial<AuditEventFilter>): Observable<AuditEventPageResponse> {
    const result$: Observable<PageAuditLogEventDto> = this.auditSdk.searchAuditEvents(
      filter.fromDate ?? undefined,
      filter.toDate ?? undefined,
      filter.actorId ?? undefined,
      filter.workorderId ?? undefined,
      filter.movementId ?? undefined,
      filter.productId ?? undefined,
      filter.sku ?? undefined,
      filter.eventType ?? undefined,
      filter.aggregateId ?? undefined,
      filter.correlationId ?? undefined,
      filter.reasonCode ?? undefined,
      filter.pageToken ?? undefined,
      filter.locationIds ?? undefined,
    );
    return result$ as Observable<AuditEventPageResponse>;
  }

  getAuditEvent(eventId: string): Observable<AuditEventDetail> {
    return this.auditSdk.getEvent(eventId) as Observable<AuditEventDetail>;
  }

  requestAuditExport(filter: Partial<AuditEventFilter> | Record<string, unknown>): Observable<AuditExportJob> {
    return this.auditExportsSdk.requestAuditExport(filter as AuditExportRequest) as Observable<AuditExportJob>;
  }

  getAuditExportStatus(jobId: string): Observable<AuditExportJob> {
    return this.auditExportsSdk.getAuditExportJob(jobId) as Observable<AuditExportJob>;
  }
}
