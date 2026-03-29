import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { PeopleService } from '../../services/people.service';

type BreakType = 'MEAL' | 'REST' | 'OTHER';

@Component({
  selector: 'app-work-session-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './work-session-page.component.html',
  styleUrl: './work-session-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkSessionPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly peopleService = inject(PeopleService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentSession = signal<Record<string, unknown> | null>(null);
  readonly workorderId = signal('');
  readonly locationId = signal('');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Clock-in/out state
  readonly sessionTimestamps = signal<{ clockedInAt?: string; clockedOutAt?: string } | null>(null);
  readonly actionSuccess = signal<string | null>(null);

  // Break state
  readonly onBreak = signal(false);
  readonly breaks = signal<unknown[]>([]);
  readonly breaksLoading = signal(false);

  // Break form
  readonly breakForm = new FormGroup({
    breakType: new FormControl<BreakType>('MEAL', { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true }),
  });

  readonly breakTypes: BreakType[] = ['MEAL', 'REST', 'OTHER'];

  constructor() {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.workorderId.set(params['workorderId'] ?? '');
        this.locationId.set(params['locationId'] ?? '');
      });
  }

  private sessionId(): string | null {
    const s = this.currentSession();
    if (!s) return null;
    return (s['sessionId'] as string) ?? (s['id'] as string) ?? null;
  }

  startSession(): void {
    const workorderId = this.workorderId();
    const locationId = this.locationId();
    if (!workorderId || !locationId) {
      this.error.set('work order ID and Location ID are required to start a session.');
      return;
    }
    const idempotencyKey = uuidv4();
    this.loading.set(true);
    this.error.set(null);
    this.actionSuccess.set(null);
    this.peopleService.startWorkSession({ workorderId, locationId }, idempotencyKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.currentSession.set(session as Record<string, unknown>);
          const s = session as Record<string, unknown>;
          this.sessionTimestamps.set({
            clockedInAt: s['clockedInAt'] as string ?? s['startedAt'] as string,
          });
          this.actionSuccess.set('Clocked in successfully.');
          this.loading.set(false);
          this.loadBreaks();
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'Failed to clock in.');
          this.loading.set(false);
        },
      });
  }

  stopSession(_sessionId?: string): void {
    const sid = this.sessionId();
    if (!sid) return;
    const idempotencyKey = uuidv4();
    this.loading.set(true);
    this.actionSuccess.set(null);
    this.peopleService.stopWorkSession({ sessionId: sid }, idempotencyKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          const s = session as Record<string, unknown>;
          this.sessionTimestamps.set({
            clockedInAt: (this.sessionTimestamps()?.clockedInAt),
            clockedOutAt: s['clockedOutAt'] as string ?? s['endedAt'] as string,
          });
          this.currentSession.set(null);
          this.onBreak.set(false);
          this.actionSuccess.set('Clocked out successfully.');
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'Failed to clock out.');
          this.loading.set(false);
        },
      });
  }

  startBreak(_sessionId?: string): void {
    this.breakForm.markAllAsTouched();
    if (this.breakForm.invalid) return;
    const sid = this.sessionId();
    if (!sid) {
      this.error.set('No active session. Clock in first.');
      return;
    }
    const { breakType, notes } = this.breakForm.getRawValue();
    const body: Record<string, unknown> = { breakType };
    if (notes.trim()) body['notes'] = notes.trim();
    const idempotencyKey = uuidv4();
    this.peopleService.startBreak(sid, body, idempotencyKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.onBreak.set(true);
          this.actionSuccess.set('Break started.');
          this.breakForm.reset({ breakType: 'MEAL', notes: '' });
          this.loadBreaks();
        },
        error: (err) => { this.error.set(err?.error?.message ?? 'Failed to start break.'); },
      });
  }

  stopBreak(_sessionId?: string): void {
    const sid = this.sessionId();
    if (!sid) return;
    const idempotencyKey = uuidv4();
    this.peopleService.stopBreak(sid, {}, idempotencyKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.onBreak.set(false);
          this.actionSuccess.set('Break ended.');
          this.loadBreaks();
        },
        error: (err) => { this.error.set(err?.error?.message ?? 'Failed to end break.'); },
      });
  }

  loadBreaks(): void {
    const sid = this.sessionId();
    if (!sid) return;
    this.breaksLoading.set(true);
    this.peopleService.getWorkSessionBreaks(sid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.breaks.set(Array.isArray(items) ? items : []);
          this.breaksLoading.set(false);
        },
        error: () => { this.breaksLoading.set(false); },
      });
  }

  get isClocked(): boolean {
    return this.currentSession() != null;
  }

  getSessionId(): string {
    return this.sessionId() ?? '';
  }

  get notesRequired(): boolean {
    return this.breakForm.controls.breakType.value === 'OTHER';
  }
}
