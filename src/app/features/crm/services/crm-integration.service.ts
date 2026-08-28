import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AccountingEventsService, EventProcessingLogEntry } from '@durion-sdk/accounting';
import {
  AccountingEventListResponse,
  AccountingEventListItem,
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
    return this.eventsApi.listAccountingEvents(
      params?.organizationId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      params?.status,
      params?.page ?? 0,
      params?.size ?? 20,
    ).pipe(
      map(p => ({
        items: (p.content ?? []).map(e => ({
          eventId: (e as unknown as AccountingEventListItem).eventId ?? '',
          eventType: (e as unknown as AccountingEventListItem).eventType ?? '',
          processingStatus: (e as unknown as AccountingEventListItem).processingStatus ?? 'PENDING',
          receivedAt: (e as unknown as AccountingEventListItem).receivedAt ?? '',
          organizationId: (e as unknown as AccountingEventListItem).organizationId,
        } satisfies AccountingEventListItem)),
        totalCount: p.totalElements ?? 0,
      } satisfies AccountingEventListResponse)),
    );
  }

  getEvent(eventId: string): Observable<AccountingEventResponse> {
    return this.eventsApi.getAccountingEvent(eventId) as unknown as Observable<AccountingEventResponse>;
  }

  getReprocessingHistory(eventId: string): Observable<ReprocessingAttemptHistoryResponse[]> {
    return this.eventsApi.getEventReprocessingHistory(eventId) as Observable<ReprocessingAttemptHistoryResponse[]>;
  }

  getEventProcessingLog(eventId: string): Observable<EventProcessingLogEntry[]> {
    return this.eventsApi.getEventProcessingLog(eventId);
  }
}
