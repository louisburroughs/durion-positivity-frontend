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
import { TranslatePipe } from '@ngx-translate/core';
import { WorkSessionDto, WorkSessionsAPIService } from '@durion-sdk/people';
import { ApiBaseService } from '../../../../core/services/api-base.service';

type BreakType = 'MEAL' | 'REST' | 'OTHER';

interface WorkSessionState {
  sessionId?: string;
  id?: string;
  startedAt?: string;
  endedAt?: string;
  clockedInAt?: string;
  clockedOutAt?: string;
}

interface WorkSessionBreak {
  breakType?: string;
  startedAt?: string;
  endedAt?: string;
  autoEnded?: boolean;
}

@Component({
  selector: 'app-work-session-page',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './work-session-page.component.html',
  styleUrl: './work-session-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkSessionPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly workSessionsService = inject(WorkSessionsAPIService);
  private readonly api = inject(ApiBaseService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentSession = signal<WorkSessionState | null>(null);
  readonly personId = signal('');
  readonly workorderId = signal('');
  readonly locationId = signal('');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Clock-in/out state
  readonly sessionTimestamps = signal<{ clockedInAt?: string; clockedOutAt?: string } | null>(null);
  readonly actionSuccess = signal<string | null>(null);

  // Break state
  readonly onBreak = signal(false);
  readonly breaks = signal<WorkSessionBreak[]>([]);
  readonly breaksLoading = signal(false);

  readonly breakForm = new FormGroup({
    breakType: new FormControl<BreakType>('MEAL', { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true }),
  });

  readonly breakTypes: BreakType[] = ['MEAL', 'REST', 'OTHER'];

  constructor() {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.personId.set(params['personId'] ?? '');
      });

    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.workorderId.set(params['workorderId'] ?? '');
        this.locationId.set(params['locationId'] ?? '');
      });
  }

  private sessionId(): string | null {
    const session = this.currentSession();
    if (!session) {
      return null;
    }
    return session.sessionId ?? session.id ?? null;
  }

  private idempotencyKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `idem-${Date.now()}`;
  }

  startSession(): void {
    const personId = this.personId();

    if (personId) {
      this.loading.set(true);
      this.error.set(null);
      this.actionSuccess.set(null);

      this.workSessionsService
        .startWorkSession({ personId })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (session) => {
            const mappedSession = this.toSessionStateFromSdk(session);
            this.currentSession.set(mappedSession);
            this.sessionTimestamps.set({
              clockedInAt: mappedSession.startedAt ?? mappedSession.clockedInAt,
            });
            this.actionSuccess.set('PEOPLE.WORK_SESSION.ACTION_SUCCEEDED');
            this.loading.set(false);
            this.loadBreaks();
          },
          error: (err) => {
            this.error.set(err?.error?.message ?? 'PEOPLE.WORK_SESSION.ERROR.START');
            this.loading.set(false);
          },
        });
      return;
    }

    const workorderId = this.workorderId();
    const locationId = this.locationId();
    if (!workorderId || !locationId) {
      this.error.set('PEOPLE.WORK_SESSION.ERROR.REQUIRED_IDS');
      return;
    }

    const idempotencyKey = this.idempotencyKey();
    this.loading.set(true);
    this.error.set(null);
    this.actionSuccess.set(null);

    this.api
      .post<Record<string, unknown>>(
        '/v1/people/workSessions/start',
        { workorderId, locationId },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          const mappedSession = this.toSessionStateFromApi(session);
          this.currentSession.set(mappedSession);
          this.sessionTimestamps.set({
            clockedInAt: mappedSession.clockedInAt ?? mappedSession.startedAt,
          });
          this.actionSuccess.set('PEOPLE.WORK_SESSION.ACTION_SUCCEEDED');
          this.loading.set(false);
          this.loadBreaks();
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'PEOPLE.WORK_SESSION.ERROR.START');
          this.loading.set(false);
        },
      });
  }

  stopSession(): void {
    const personId = this.personId();
    if (personId) {
      this.loading.set(true);
      this.actionSuccess.set(null);

      this.workSessionsService
        .stopWorkSession({ personId })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (session) => {
            const mappedSession = this.toSessionStateFromSdk(session);
            this.sessionTimestamps.set({
              clockedInAt: this.sessionTimestamps()?.clockedInAt,
              clockedOutAt: mappedSession.endedAt ?? mappedSession.clockedOutAt,
            });
            this.currentSession.set(null);
            this.onBreak.set(false);
            this.actionSuccess.set('PEOPLE.WORK_SESSION.ACTION_SUCCEEDED');
            this.loading.set(false);
          },
          error: (err) => {
            this.error.set(err?.error?.message ?? 'PEOPLE.WORK_SESSION.ERROR.STOP');
            this.loading.set(false);
          },
        });
      return;
    }

    const sessionId = this.sessionId();
    if (!sessionId) {
      return;
    }

    const idempotencyKey = this.idempotencyKey();
    this.loading.set(true);
    this.actionSuccess.set(null);

    this.api
      .post<Record<string, unknown>>(
        '/v1/people/workSessions/stop',
        { sessionId },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          const mappedSession = this.toSessionStateFromApi(session);
          this.sessionTimestamps.set({
            clockedInAt: this.sessionTimestamps()?.clockedInAt,
            clockedOutAt: mappedSession.clockedOutAt ?? mappedSession.endedAt,
          });
          this.currentSession.set(null);
          this.onBreak.set(false);
          this.actionSuccess.set('PEOPLE.WORK_SESSION.ACTION_SUCCEEDED');
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'PEOPLE.WORK_SESSION.ERROR.STOP');
          this.loading.set(false);
        },
      });
  }

  startBreak(): void {
    this.breakForm.markAllAsTouched();
    if (this.breakForm.invalid) {
      return;
    }

    const sid = this.sessionId();
    if (!sid) {
      this.error.set('PEOPLE.WORK_SESSION.ERROR.START_BREAK');
      return;
    }

    this.workSessionsService
      .startWorkSessionBreak(sid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.onBreak.set(true);
          this.actionSuccess.set('PEOPLE.WORK_SESSION.ACTION_SUCCEEDED');
          this.breakForm.reset({ breakType: 'MEAL', notes: '' });
          this.loadBreaks();
        },
        error: (err) => { this.error.set(err?.error?.message ?? 'PEOPLE.WORK_SESSION.ERROR.START_BREAK'); },
      });
  }

  stopBreak(): void {
    const sid = this.sessionId();
    if (!sid) {
      return;
    }

    this.workSessionsService
      .stopWorkSessionBreak(sid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.onBreak.set(false);
          this.actionSuccess.set('PEOPLE.WORK_SESSION.ACTION_SUCCEEDED');
          this.loadBreaks();
        },
        error: (err) => { this.error.set(err?.error?.message ?? 'PEOPLE.WORK_SESSION.ERROR.STOP_BREAK'); },
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
          if (!Array.isArray(items)) {
            this.breaks.set([]);
            this.breaksLoading.set(false);
            return;
          }

          const mappedBreaks = items
            .map(item => this.toWorkSessionBreak(item))
            .filter((item): item is WorkSessionBreak => item !== null);

          this.breaks.set(mappedBreaks);
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

  private toSessionStateFromSdk(session: WorkSessionDto): WorkSessionState {
    return {
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }

  private toSessionStateFromApi(session: Record<string, unknown>): WorkSessionState {
    return {
      sessionId: this.readStringField(session, 'sessionId'),
      id: this.readStringField(session, 'id'),
      startedAt: this.readStringField(session, 'startedAt'),
      endedAt: this.readStringField(session, 'endedAt'),
      clockedInAt: this.readStringField(session, 'clockedInAt'),
      clockedOutAt: this.readStringField(session, 'clockedOutAt'),
    };
  }

  private toWorkSessionBreak(item: unknown): WorkSessionBreak | null {
    if (!this.isObjectRecord(item)) {
      return null;
    }

    return {
      breakType: this.readStringField(item, 'breakType'),
      startedAt: this.readStringField(item, 'startedAt'),
      endedAt: this.readStringField(item, 'endedAt'),
      autoEnded: this.readBooleanField(item, 'autoEnded'),
    };
  }

  private readStringField(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }

  private readBooleanField(record: Record<string, unknown>, key: string): boolean | undefined {
    const value = record[key];
    return typeof value === 'boolean' ? value : undefined;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
