import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  AccountingEventListResponse,
  AccountingEventResponse,
  ReprocessingAttemptHistoryResponse,
} from '../models/crm-integration.models';

/**
 * CrmIntegrationService — inbound event processing logs & suspense admin.
 *
 * operationId mapping (pos-accounting OpenAPI):
 *   listEvents                → GET  /v1/accounting/events
 *   getEvent                  → GET  /v1/accounting/events/{eventId}
 *   getReprocessingHistory    → GET  /v1/accounting/events/{eventId}/reprocessing-history
 *   getEventProcessingLog     → GET  /v1/accounting/events/{eventId}/processing-log
 */
@Injectable({ providedIn: 'root' })
export class CrmIntegrationService {
  constructor(private readonly api: ApiBaseService) {}

  /** operationId: listEvents */
  listEvents(params?: {
    organizationId?: string;
    status?: string;
    page?: number;
    size?: number;
  }): Observable<AccountingEventListResponse> {
    let httpParams = new HttpParams();
    if (params?.organizationId) {
      httpParams = httpParams.set('organizationId', params.organizationId);
    }
    if (params?.status) {
      httpParams = httpParams.set('status', params.status);
    }
    if (params?.page !== undefined) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params?.size !== undefined) {
      httpParams = httpParams.set('size', String(params.size));
    }
    return this.api.get<AccountingEventListResponse>('/v1/accounting/events', httpParams);
  }

  /** operationId: getEvent */
  getEvent(eventId: string): Observable<AccountingEventResponse> {
    return this.api.get<AccountingEventResponse>(`/v1/accounting/events/${eventId}`);
  }

  /** operationId: getReprocessingHistory */
  getReprocessingHistory(eventId: string): Observable<ReprocessingAttemptHistoryResponse[]> {
    return this.api.get<ReprocessingAttemptHistoryResponse[]>(
      `/v1/accounting/events/${eventId}/reprocessing-history`,
    );
  }

  /** operationId: getEventProcessingLog */
  getEventProcessingLog(eventId: string): Observable<string> {
    return this.api.get<string>(`/v1/accounting/events/${eventId}/processing-log`);
  }
}
