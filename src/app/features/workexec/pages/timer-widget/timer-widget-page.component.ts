import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { WorkexecService } from '../../services/workexec.service';

type TimerState = 'NONE' | 'ACTIVE' | 'STARTING' | 'STOPPING' | 'ERROR';

@Component({
  selector: 'app-timer-widget-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './timer-widget-page.component.html',
  styleUrl: './timer-widget-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimerWidgetPageComponent implements OnInit {
  private readonly workexecService = inject(WorkexecService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly timerState = signal<TimerState>('NONE');
  readonly activeTimers = signal<unknown[]>([]);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly actionSuccess = signal<string | null>(null);
  readonly stoppedEntries = signal<unknown[]>([]);
  readonly workOrderId = signal('');
  private readonly startKey = signal<string | null>(null);
  private readonly stopKey = signal<string | null>(null);

  readonly hasActiveTimer = computed(() => this.activeTimers().length > 0);
  readonly canStart = computed(
    () =>
      !!this.startForm.controls.workOrderId.value.trim() &&
      !this.hasActiveTimer() &&
      this.timerState() !== 'STARTING' &&
      this.timerState() !== 'STOPPING',
  );
  readonly canStop = computed(
    () => this.hasActiveTimer() && this.timerState() !== 'STARTING' && this.timerState() !== 'STOPPING',
  );

  readonly startForm = new FormGroup({
    workOrderId: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    workOrderItemId: new FormControl<string>('', { nonNullable: true }),
    laborCode: new FormControl<string>('', { nonNullable: true }),
  });

  constructor() {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const incomingWorkOrderId = typeof params['workOrderId'] === 'string' ? params['workOrderId'] : '';
        this.workOrderId.set(incomingWorkOrderId);
        if (incomingWorkOrderId) {
          this.startForm.controls.workOrderId.setValue(incomingWorkOrderId);
        }
      });
  }

  ngOnInit(): void {
    this.loadActiveTimers();
  }

  loadActiveTimers(): void {
    this.loadError.set(null);
    this.workexecService
      .getActiveTimerEntries()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const timers = this.normalizeActive(response);
          this.activeTimers.set(timers);
          this.timerState.set(timers.length > 0 ? 'ACTIVE' : 'NONE');
        },
        error: () => {
          this.loadError.set('Failed to load active timer.');
          this.timerState.set('ERROR');
        },
      });
  }

  startTimer(): void {
    this.startForm.markAllAsTouched();
    if (this.startForm.invalid) {
      return;
    }

    const rawWorkOrderId = this.startForm.controls.workOrderId.value;
    const workOrderId = rawWorkOrderId.trim();
    if (!workOrderId) {
      this.actionError.set('Work order ID is required');
      return;
    }

    if (!this.startKey()) {
      this.startKey.set(uuidv4());
    }
    const requestKey = this.startKey();
    if (!requestKey) {
      this.actionError.set('Unable to create request key.');
      return;
    }

    this.timerState.set('STARTING');
    this.actionError.set(null);
    this.actionSuccess.set(null);

    const workOrderItemId = this.startForm.controls.workOrderItemId.value.trim();
    const laborCode = this.startForm.controls.laborCode.value.trim();

    const body: { workOrderId: string; workOrderItemId?: string; laborCode?: string } = {
      workOrderId,
      ...(workOrderItemId ? { workOrderItemId } : {}),
      ...(laborCode ? { laborCode } : {}),
    };

    this.workexecService
      .startTimer(body, requestKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const timers = this.normalizeActive(response);
          this.activeTimers.set(timers);
          this.timerState.set('ACTIVE');
          this.actionSuccess.set('Timer started.');
          this.startKey.set(null);
        },
        error: (err: unknown) => {
          this.timerState.set('ERROR');
          this.actionError.set(this.parseError(err));
        },
      });
  }

  stopTimers(): void {
    if (!this.stopKey()) {
      this.stopKey.set(uuidv4());
    }
    const requestKey = this.stopKey();
    if (!requestKey) {
      this.actionError.set('Unable to create request key.');
      return;
    }

    this.timerState.set('STOPPING');
    this.actionError.set(null);
    this.actionSuccess.set(null);

    this.workexecService
      .stopTimers(requestKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const payload = this.asRecord(response);
          const stopped = Array.isArray(payload?.['stopped']) ? (payload['stopped'] as unknown[]) : [];
          this.stoppedEntries.set(stopped);
          this.activeTimers.set([]);
          this.timerState.set('NONE');
          this.actionSuccess.set('Timer stopped.');
          this.stopKey.set(null);
        },
        error: (err: unknown) => {
          this.timerState.set('ERROR');
          this.actionError.set(this.parseError(err));
        },
      });
  }

  private normalizeActive(response: unknown): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }
    const payload = this.asRecord(response);
    if (Array.isArray(payload?.['active'])) {
      return payload['active'] as unknown[];
    }
    return [];
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private parseError(err: unknown): string {
    const envelope = this.asRecord(err);
    const error = this.asRecord(envelope?.['error']);
    if (typeof error?.['message'] === 'string') {
      return error['message'];
    }
    if (typeof error?.['code'] === 'string') {
      return error['code'];
    }
    return 'Unexpected error.';
  }
}
