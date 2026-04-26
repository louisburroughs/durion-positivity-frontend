import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AccountingEventsService } from '@durion-sdk/accounting';
import {
  AccountingEventListResponse,
  AccountingEventResponse,
  ReprocessingAttemptHistoryResponse,
} from '../models/crm-integration.models';

@Injectable({ providedIn: 'root' })
export class CrmIntegrationService {
  private readonly eventsApi = inject(AccountingEventsService);

  listEvents(params?: {
    organizationId?: string;
    status?: string;
    page?: number;
    size?: number;
  }): Observable<AccountingEventListResponse> {
    return this.eventsApi.listEvents(
      params?.organizationId ?? '',
      params?.page,
      params?.size,
      params?.status,
    ) as Observable<AccountingEventListResponse>;
  }

  getEvent(eventId: string): Observable<AccountingEventResponse> {
    return this.eventsApi.getEvent(eventId) as Observable<AccountingEventResponse>;
  }

  getReprocessingHistory(eventId: string): Observable<ReprocessingAttemptHistoryResponse[]> {
    return this.eventsApi.getReprocessingHistory(eventId) as Observable<ReprocessingAttemptHistoryResponse[]>;
  }

  getEventProcessingLog(eventId: string): Observable<string> {
    return this.eventsApi.getEventProcessingLog(eventId) as Observable<string>;
  }
}
