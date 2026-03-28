import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly selectedEventId$ = new Subject<string>();

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

    this.crmIntegrationService.listEvents().pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
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

    this.selectedEventId$.pipe(
      switchMap(eventId => forkJoin({
        event: this.crmIntegrationService.getEvent(eventId),
        processingLog: this.crmIntegrationService.getEventProcessingLog(eventId),
        reprocessingHistory: this.crmIntegrationService.getReprocessingHistory(eventId),
      })),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: ({ event, processingLog, reprocessingHistory }) => {
        this.selectedEvent.set(event);
        this.processingLog.set(processingLog);
        this.reprocessingHistory.set(reprocessingHistory);
      },
      error: () => {
        this.detailErrorState.set('Unable to load event details. Please try again.');
      },
    });
  }

  selectEvent(eventId: string): void {
    this.detailErrorState.set(null);
    this.processingLog.set(null);
    this.reprocessingHistory.set([]);
    this.selectedEventId$.next(eventId);
  }
}
