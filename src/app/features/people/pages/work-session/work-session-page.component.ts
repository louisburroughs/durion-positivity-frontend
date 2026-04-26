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
import { WorkSessionDto } from '@durion-sdk/people';
import { WorkSessionService } from '../../services/work-session.service';

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
  private readonly workSessionService = inject(WorkSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentSession = signal<WorkSessionState | null>(null);
  readonly personId = signal('');

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
  }

  private sessionId(): string | null {
    const session = this.currentSession();
    if (!session) {
      return null;
    }
    return session.sessionId ?? session.id ?? null;
  }

  startSession(): void {
    const personId = this.personId();

    if (!personId) {
      this.error.set('PEOPLE.WORK_SESSION.ERROR.REQUIRED_IDS');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.actionSuccess.set(null);

    this.workSessionService
      .startSession(personId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          const mappedSession = this.toSessionStateFromSdk(session);
          this.currentSession.set(mappedSession);
          this.sessionTimestamps.set({
            clockedInAt: mappedSession.startedAt,
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
    if (!personId) {
      this.error.set('PEOPLE.WORK_SESSION.ERROR.REQUIRED_IDS');
      return;
    }

    this.loading.set(true);
    this.actionSuccess.set(null);

    this.workSessionService
      .stopSession(personId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          const mappedSession = this.toSessionStateFromSdk(session);
          this.sessionTimestamps.set({
            clockedInAt: this.sessionTimestamps()?.clockedInAt,
            clockedOutAt: mappedSession.endedAt,
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

    const selectedBreakType = this.breakForm.controls.breakType.value;

    this.workSessionService
      .startBreak(sid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (startedBreak) => {
          this.onBreak.set(true);
          this.breaks.update(current => [
            ...current,
            {
              breakType: selectedBreakType,
              startedAt: startedBreak.startedAt,
              endedAt: startedBreak.endedAt,
              autoEnded: false,
            },
          ]);
          this.actionSuccess.set('PEOPLE.WORK_SESSION.ACTION_SUCCEEDED');
          this.breakForm.reset({ breakType: 'MEAL', notes: '' });
        },
        error: (err) => { this.error.set(err?.error?.message ?? 'PEOPLE.WORK_SESSION.ERROR.START_BREAK'); },
      });
  }

  stopBreak(): void {
    const sid = this.sessionId();
    if (!sid) {
      return;
    }

    this.workSessionService
      .stopBreak(sid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stoppedBreak) => {
          this.onBreak.set(false);
          this.breaks.update(current => {
            const updated = [...current];
            let openBreakIndex = -1;
            for (let idx = updated.length - 1; idx >= 0; idx -= 1) {
              if (!updated[idx].endedAt) {
                openBreakIndex = idx;
                break;
              }
            }
            if (openBreakIndex === -1) {
              updated.push({
                breakType: 'OTHER',
                startedAt: stoppedBreak.startedAt,
                endedAt: stoppedBreak.endedAt,
                autoEnded: false,
              });
              return updated;
            }

            updated[openBreakIndex] = {
              ...updated[openBreakIndex],
              endedAt: stoppedBreak.endedAt,
            };
            return updated;
          });
          this.actionSuccess.set('PEOPLE.WORK_SESSION.ACTION_SUCCEEDED');
        },
        error: (err) => { this.error.set(err?.error?.message ?? 'PEOPLE.WORK_SESSION.ERROR.STOP_BREAK'); },
      });
  }

  loadBreaks(): void {
    this.breaksLoading.set(false);
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

}
