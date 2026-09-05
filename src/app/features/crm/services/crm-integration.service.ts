import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  AccountingEventResponse as SdkAccountingEventResponse,
  AccountingEventsService,
  EventProcessingLogEntry,
} from '@durion-sdk/accounting';
import {
  AccountingEventListResponse,
  AccountingEventListItem,
  AccountingEventResponse,
  AccountingEventStatus,
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
        items: (p.content ?? []).map(e => this.toListItem(e)),
        totalCount: p.totalElements ?? 0,
      } satisfies AccountingEventListResponse)),
    );
  }

  getEvent(eventId: string): Observable<AccountingEventResponse> {
    return this.eventsApi.getAccountingEvent(eventId).pipe(map(event => this.toEvent(event)));
  }

  getReprocessingHistory(eventId: string): Observable<ReprocessingAttemptHistoryResponse[]> {
    return this.eventsApi.getEventReprocessingHistory(eventId) as Observable<ReprocessingAttemptHistoryResponse[]>;
  }

  getEventProcessingLog(eventId: string): Observable<EventProcessingLogEntry[]> {
    return this.eventsApi.getEventProcessingLog(eventId);
  }

  private toListItem(event: SdkAccountingEventResponse): AccountingEventListItem {
    return {
      eventId: event.eventId,
      eventReference: event.eventReference ?? undefined,
      eventType: event.eventType,
      processingStatus: event.status as AccountingEventStatus,
      receivedAt: event.receivedAt,
      organizationId: event.organizationId,
    };
  }

  private toEvent(event: SdkAccountingEventResponse): AccountingEventResponse {
    return {
      ...this.toListItem(event),
      payload: event.payload && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown>
        : undefined,
    };
  }
}
