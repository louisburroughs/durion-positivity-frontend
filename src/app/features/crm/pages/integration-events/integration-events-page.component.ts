import { Component, OnInit, signal } from '@angular/core';
import {
  AccountingEventListItem,
  AccountingEventResponse,
  ReprocessingAttemptHistoryResponse,
} from '../../models/crm-integration.models';
import { CrmIntegrationService } from '../../services/crm-integration.service';
@Component({
  selector: 'app-integration-events-page',
  standalone: true,
  imports: [],
  templateUrl: './integration-events-page.component.html',
  styleUrl: './integration-events-page.component.css',
})
export class IntegrationEventsPageComponent implements OnInit {
  events = signal<AccountingEventListItem[]>([]);
  selectedEvent = signal<AccountingEventResponse | null>(null);
  processingLog = signal<string | null>(null);
  reprocessingHistory = signal<ReprocessingAttemptHistoryResponse[]>([]);
  loading = signal(false);
  errorState = signal<'none' | '403' | 'error'>('none');
  detailErrorState = signal<string | null>(null);

  constructor(private readonly crmIntegrationService: CrmIntegrationService) { }

  ngOnInit(): void {
    this.loading.set(true);
    this.errorState.set('none');

    this.crmIntegrationService.listEvents().subscribe({
      next: response => {
        this.events.set(response.items);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        if (err?.status === 403) {
          this.errorState.set('403');
        } else {
          this.errorState.set('error');
        }
      },
    });
  }

  selectEvent(eventId: string): void {
    this.detailErrorState.set(null);
    this.processingLog.set(null);
    this.reprocessingHistory.set([]);
    this.crmIntegrationService.getEvent(eventId).subscribe({
      next: event => this.selectedEvent.set(event),
      error: () => {
        this.detailErrorState.set('Unable to load event details. Please try again.');
      },
    });
    this.crmIntegrationService.getEventProcessingLog(eventId).subscribe({
      next: log => this.processingLog.set(log),
      error: () => {
        this.detailErrorState.set('Unable to load event processing log. Please try again.');
      },
    });
    this.crmIntegrationService.getReprocessingHistory(eventId).subscribe({
      next: history => this.reprocessingHistory.set(history),
      error: () => {
        this.detailErrorState.set('Unable to load event reprocessing history. Please try again.');
      },
    });
  }
}
