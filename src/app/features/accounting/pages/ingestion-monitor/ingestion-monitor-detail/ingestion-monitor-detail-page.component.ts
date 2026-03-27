import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin, interval, switchMap, take } from 'rxjs';
import { AuthService } from '../../../../../core/services/auth.service';
import {
  AccountingEventDetail,
  ReprocessingAttemptHistory,
} from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

type DetailState = 'loading' | 'ready' | 'error' | 'forbidden' | 'not-found';
type RetryState = 'idle' | 'submitting' | 'polling' | 'success' | 'error';

@Component({
  selector: 'app-ingestion-monitor-detail-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './ingestion-monitor-detail-page.component.html',
  styleUrl: './ingestion-monitor-detail-page.component.css',
})
export class IngestionMonitorDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly accountingService = inject(AccountingService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState = signal<DetailState>('loading');
  readonly retryState = signal<RetryState>('idle');
  readonly event = signal<AccountingEventDetail | null>(null);
  readonly history = signal<ReprocessingAttemptHistory[]>([]);
  readonly retryJobId = signal<string | null>(null);

  readonly retryJustification = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(10)],
  });

  readonly eventId = computed(
    () =>
      this.route.snapshot.paramMap.get('eventId') ??
      this.route.snapshot.queryParamMap.get('eventId') ??
      '',
  );

  ngOnInit(): void {
    this.load();
  }

  canRetry(): boolean {
    return this.hasPermission('accounting:events:retry');
  }

  canViewPayload(): boolean {
    return this.hasPermission('accounting:events:view-payload');
  }

  submitRetry(): void {
    if (this.retryJustification.invalid || !this.canRetry() || !this.eventId()) {
      return;
    }

    this.retryState.set('submitting');
    this.accountingService
      .retryEvent(this.eventId(), { justification: this.retryJustification.value.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: resp => {
          this.retryJobId.set(resp.jobId);
          this.retryState.set('polling');
          this.pollRetryOutcome();
        },
        error: () => this.retryState.set('error'),
      });
  }

  private pollRetryOutcome(): void {
    interval(1000)
      .pipe(
        take(3),
        switchMap(() => this.accountingService.getEvent(this.eventId())),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: current => {
          this.event.set(current);
          if (
            current.processingStatus === 'PROCESSED' ||
            current.processingStatus === 'FAILED' ||
            current.processingStatus === 'REJECTED' ||
            current.processingStatus === 'QUARANTINED'
          ) {
            this.retryState.set('success');
          }
        },
        error: () => this.retryState.set('error'),
        complete: () => {
          if (this.retryState() === 'polling') {
            this.retryState.set('error');
          }
        },
      });
  }

  private load(): void {
    const eventId = this.eventId();
    if (!eventId) {
      this.pageState.set('not-found');
      return;
    }

    this.pageState.set('loading');
    forkJoin({
      event: this.accountingService.getEvent(eventId),
      history: this.accountingService.getReprocessingHistory(eventId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ event, history }) => {
          this.event.set(event);
          this.history.set(history);
          this.pageState.set('ready');
        },
        error: err => {
          const status = err?.status ?? 0;
          if (status === 403) {
            this.pageState.set('forbidden');
            return;
          }
          if (status === 404) {
            this.pageState.set('not-found');
            return;
          }
          this.pageState.set('error');
        },
      });
  }

  private hasPermission(permission: string): boolean {
    const claims = this.authService.currentUserClaims();
    const authorities = claims?.authorities ?? [];
    return authorities.includes(permission);
  }
}
