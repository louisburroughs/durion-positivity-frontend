import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { PeopleService } from '../../services/people.service';

type SubmitState = 'NOT_SUBMITTED' | 'SUBMITTING' | 'SUBMITTED' | 'FAILED';

@Component({
  selector: 'app-work-session-submit-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './work-session-submit-page.component.html',
  styleUrl: './work-session-submit-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkSessionSubmitPageComponent {
  private readonly peopleService = inject(PeopleService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly sessionId = signal('');
  readonly submitState = signal<SubmitState>('NOT_SUBMITTED');
  readonly correlationId = signal<string | null>(null);
  readonly errorCode = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly lastIdempotencyKey = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);

  readonly canSubmit = computed(() => this.submitState() !== 'SUBMITTING' && this.submitState() !== 'SUBMITTED');
  readonly isSubmitting = computed(() => this.submitState() === 'SUBMITTING');

  readonly submitForm = new FormGroup({
    billableMinutes: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    breakMinutes: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    submittedAt: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  constructor() {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.sessionId.set(params['sessionId'] ?? '');
      });

    const _d = new Date();
    const _pad = (n: number): string => String(n).padStart(2, '0');
    const _localStr = `${_d.getFullYear()}-${_pad(_d.getMonth() + 1)}-${_pad(_d.getDate())}T${_pad(_d.getHours())}:${_pad(_d.getMinutes())}`;
    this.submitForm.controls.submittedAt.setValue(_localStr);
  }

  submitJobTime(): void {
    this.submitForm.markAllAsTouched();
    if (this.submitForm.invalid) {
      return;
    }

    if (!this.sessionId()) {
      this.submitError.set('No session ID in route params');
      return;
    }

    if (this.submitState() === 'NOT_SUBMITTED' || this.submitState() === 'FAILED') {
      if (!this.lastIdempotencyKey()) {
        this.lastIdempotencyKey.set(uuidv4());
      }
    }

    this.submitState.set('SUBMITTING');
    this.submitError.set(null);
    this.errorCode.set(null);
    this.errorMessage.set(null);
    this.correlationId.set(null);

    const values = this.submitForm.getRawValue();
    const body = {
      billableMinutes: values.billableMinutes,
      breakMinutes: values.breakMinutes,
      submittedAt: values.submittedAt,
    };

    this.peopleService
      .submitWorkSession(this.sessionId(), body, this.lastIdempotencyKey() ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const payload = response as Record<string, unknown> | null;
          this.submitState.set('SUBMITTED');
          this.correlationId.set(typeof payload?.['correlationId'] === 'string' ? payload['correlationId'] : null);
        },
        error: (err: unknown) => {
          const envelope = this.toEnvelope(err);
          this.submitState.set('FAILED');
          this.errorCode.set(envelope.code);
          this.errorMessage.set(envelope.message);
          this.correlationId.set(envelope.correlationId);
          this.submitError.set(this.toUserError(envelope.code, envelope.message));
        },
      });
  }

  retrySubmit(): void {
    this.submitJobTime();
  }

  private toEnvelope(err: unknown): { code: string | null; message: string | null; correlationId: string | null } {
    const root = (err as { error?: Record<string, unknown> } | null)?.error;
    const code = typeof root?.['code'] === 'string' ? root['code'] : null;
    const message = typeof root?.['message'] === 'string' ? root['message'] : null;
    const correlationId = typeof root?.['correlationId'] === 'string' ? root['correlationId'] : null;
    return { code, message, correlationId };
  }

  private toUserError(code: string | null, message: string | null): string {
    if (message) {
      return message;
    }
    if (code === 'INVALID_STATE') {
      return 'Session cannot be submitted in its current state.';
    }
    if (code === 'VALIDATION_ERROR') {
      return 'Please correct the form values and try again.';
    }
    return 'Failed to submit work session.';
  }
}
