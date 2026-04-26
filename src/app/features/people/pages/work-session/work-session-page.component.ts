import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { WorkSessionDto, WorkSessionsAPIService } from '@durion-sdk/people';
import { ApiBaseService } from '../../../../core/services/api-base.service';

@Component({
  selector: 'app-work-session-page',
  standalone: true,
  imports: [],
  templateUrl: './work-session-page.component.html',
  styleUrl: './work-session-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkSessionPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly workSessionsService = inject(WorkSessionsAPIService);
  private readonly api = inject(ApiBaseService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentSession = signal<WorkSessionDto | null>(null);
  readonly personId = signal('');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Clock-in/out state
  readonly sessionTimestamps = signal<{ clockedInAt?: string; clockedOutAt?: string } | null>(null);
  readonly actionSuccess = signal<string | null>(null);

  // Break state
  readonly onBreak = signal(false);
  readonly breaks = signal<unknown[]>([]);
  readonly breaksLoading = signal(false);

  constructor() {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.personId.set(params['personId'] ?? '');
      });
  }

  private sessionId(): string | null {
    return this.currentSession()?.sessionId ?? null;
  }

  startSession(): void {
    const personId = this.personId();
    if (!personId) {
      this.error.set('Person ID is required to start a session.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.actionSuccess.set(null);
    this.workSessionsService.startWorkSession({ personId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.currentSession.set(session);
          this.sessionTimestamps.set({ clockedInAt: session.startedAt });
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

  stopSession(): void {
    const personId = this.personId();
    if (!personId) return;
    this.loading.set(true);
    this.actionSuccess.set(null);
    this.workSessionsService.stopWorkSession({ personId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.sessionTimestamps.set({
            clockedInAt: this.sessionTimestamps()?.clockedInAt,
            clockedOutAt: session.endedAt,
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

  startBreak(): void {
    const sid = this.sessionId();
    if (!sid) {
      this.error.set('No active session. Clock in first.');
      return;
    }
    this.workSessionsService.startWorkSessionBreak(sid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.onBreak.set(true);
          this.actionSuccess.set('Break started.');
          this.loadBreaks();
        },
        error: (err) => { this.error.set(err?.error?.message ?? 'Failed to start break.'); },
      });
  }

  stopBreak(): void {
    const sid = this.sessionId();
    if (!sid) return;
    this.workSessionsService.stopWorkSessionBreak(sid)
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
    this.api.get<unknown[]>('/v1/people/workSessions/' + sid + '/breaks')
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
}
