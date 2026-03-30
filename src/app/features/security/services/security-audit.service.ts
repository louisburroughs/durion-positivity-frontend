import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  AuditEventDetail,
  AuditEventFilter,
  AuditEventPageResponse,
  AuditExportJob,
} from '../models/security-audit.models';

@Injectable({ providedIn: 'root' })
export class SecurityAuditService {
  private readonly api = inject(ApiBaseService);

  searchAuditEvents(filter: Partial<AuditEventFilter>): Observable<AuditEventPageResponse> {
    let params = new HttpParams();
    if (filter.fromDate != null) { params = params.set('fromDate', filter.fromDate); }
    if (filter.toDate != null) { params = params.set('toDate', filter.toDate); }
    if (filter.actorId != null) { params = params.set('actorId', filter.actorId); }
    if (filter.workorderId != null) { params = params.set('workorderId', filter.workorderId); }
    if (filter.movementId != null) { params = params.set('movementId', filter.movementId); }
    if (filter.productId != null) { params = params.set('productId', filter.productId); }
    if (filter.sku != null) { params = params.set('sku', filter.sku); }
    if (filter.eventType != null) { params = params.set('eventType', filter.eventType); }
    if (filter.aggregateId != null) { params = params.set('aggregateId', filter.aggregateId); }
    if (filter.correlationId != null) { params = params.set('correlationId', filter.correlationId); }
    if (filter.reasonCode != null) { params = params.set('reasonCode', filter.reasonCode); }
    if (filter.pageToken != null) { params = params.set('pageToken', filter.pageToken); }
    if (filter.locationIds != null && filter.locationIds.length > 0) {
      filter.locationIds.forEach(id => { params = params.append('locationIds', id); });
    }
    return this.api.get<AuditEventPageResponse>('/v1/audit/events', params);
  }

  getAuditEvent(eventId: string): Observable<AuditEventDetail> {
    return this.api.get<AuditEventDetail>(`/v1/audit/events/${encodeURIComponent(eventId)}`);
  }

  requestAuditExport(filter: Partial<AuditEventFilter> | Record<string, unknown>): Observable<AuditExportJob> {
    return this.api.post<AuditExportJob>('/v1/audit/exports', filter);
  }

  getAuditExportStatus(jobId: string): Observable<AuditExportJob> {
    return this.api.get<AuditExportJob>(`/v1/audit/exports/${encodeURIComponent(jobId)}`);
  }
}
