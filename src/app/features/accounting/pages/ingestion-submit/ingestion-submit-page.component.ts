import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import {
  AccountingEventSubmitRequest,
  IngestionSubmitOutcome,
} from '../../models/accounting.models';
import { AccountingService } from '../../services/accounting.service';

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value?.trim()) {
      return { required: true };
    }
    try {
      JSON.parse(value);
      return null;
    } catch {
      return { invalidJson: true };
    }
  };
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error' | 'forbidden';

@Component({
  selector: 'app-ingestion-submit-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './ingestion-submit-page.component.html',
  styleUrl: './ingestion-submit-page.component.css',
})
export class IngestionSubmitPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly accountingService = inject(AccountingService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<SubmitState>('idle');
  readonly outcome = signal<IngestionSubmitOutcome | null>(null);

  readonly form = this.fb.group({
    eventId: ['', [Validators.required, Validators.pattern(UUID_V7_REGEX)]],
    eventType: ['', [Validators.required]],
    organizationId: ['', [Validators.required]],
    sourceSystem: [''],
    payload: ['', [jsonValidator()]],
  });

  ngOnInit(): void {
    if (!this.hasPermission('accounting:events:submit')) {
      this.state.set('forbidden');
    }
  }

  submit(): void {
    if (this.state() === 'forbidden' || this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const eventId = value.eventId ?? '';
    const eventType = value.eventType ?? '';
    const organizationId = value.organizationId ?? '';
    const payloadValue = value.payload ?? '';

    if (!eventId || !eventType || !organizationId || !payloadValue) {
      return;
    }

    const request: AccountingEventSubmitRequest = {
      eventId,
      eventType,
      organizationId,
      sourceSystem: value.sourceSystem || undefined,
      payload: JSON.parse(payloadValue),
    };

    this.state.set('submitting');
    this.accountingService
      .submitEvent(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: outcome => {
          this.outcome.set(outcome);
          this.state.set('success');
        },
        error: err => {
          if ((err?.status ?? 0) === 403) {
            this.state.set('forbidden');
            return;
          }
          this.state.set('error');
        },
      });
  }

  private hasPermission(permission: string): boolean {
    const claims = this.authService.currentUserClaims();
    const authorities = claims?.authorities ?? [];
    return authorities.includes(permission);
  }
}
