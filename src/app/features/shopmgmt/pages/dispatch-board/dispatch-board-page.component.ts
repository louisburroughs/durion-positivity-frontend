import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, interval, switchMap, catchError } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { DispatchBoardService } from '../../services/dispatch-board.service';
import {
  DashboardResponse,
  WorkorderSummary,
} from '../../models/dispatch-board.models';

@Component({
  selector: 'app-dispatch-board-page',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './dispatch-board-page.component.html',
  styleUrl: './dispatch-board-page.component.css',
})
export class DispatchBoardPageComponent implements OnInit {
  private readonly dispatchBoardService = inject(DispatchBoardService);
  private readonly destroyRef = inject(DestroyRef);
  private pollingStarted = false;

  readonly todayIso = signal(new Date().toISOString().slice(0, 10));
  readonly selectedDate = signal(this.todayIso());
  readonly selectedLocationId = signal('');
  readonly workorders = signal<WorkorderSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isStale = signal(false);
  readonly dataQualityWarning = signal(false);
  readonly lastRefreshed = signal<Date | null>(null);
  readonly hasCachedData = computed(
    () => this.workorders().length > 0 || this.lastRefreshed() !== null,
  );

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);

    this.dispatchBoardService
      .getDashboard(this.selectedLocationId(), this.selectedDate())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.applySuccess(response);
          if (!this.pollingStarted) {
            this.startPolling();
          }
        },
        error: err => {
          this.applyError(err);
          this.loading.set(false);
        },
      });
  }

  private startPolling(): void {
    this.pollingStarted = true;

    interval(30_000)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(() =>
          this.dispatchBoardService.getDashboard(
            this.selectedLocationId(),
            this.selectedDate(),
          ).pipe(
            catchError(err => {
              this.applyError(err);
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe({
        next: response => {
          this.applySuccess(response);
        },
      });
  }

  private applySuccess(response: DashboardResponse): void {
    this.workorders.set(response.workorders ?? []);
    this.lastRefreshed.set(new Date());
    this.dataQualityWarning.set(Boolean(response.dataQualityWarning));
    this.error.set(null);
    this.isStale.set(false);
    this.loading.set(false);
  }

  private applyError(err: unknown): void {
    if (this.hasCachedData()) {
      this.isStale.set(true);
      this.loading.set(false);
      return;
    }

    this.error.set(this.toErrorMessage(err));
    this.workorders.set([]);
    this.loading.set(false);
  }

  private toErrorMessage(err: unknown): string {
    if (typeof err === 'object' && err !== null) {
      const record = err as Record<string, unknown>;
      const errPayload = record['error'];

      if (typeof errPayload === 'object' && errPayload !== null) {
        const payloadRecord = errPayload as Record<string, unknown>;
        if (typeof payloadRecord['message'] === 'string') {
          return payloadRecord['message'];
        }
      }

      if (typeof record['message'] === 'string') {
        return record['message'];
      }
    }

    return 'SHOPMGMT.DISPATCH_BOARD.ERROR_LOAD';
  }
}
