import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { PaymentApplication } from '../../models/accounting.models';
import { AccountingService } from '../../services/accounting.service';

function generateApplicationRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    // Fallback note: randomUUID() generates UUID v4, not UUID v7.
    return crypto.randomUUID();
  }
  return `fallback-${Date.now()}`;
}

type ApplyState = 'idle' | 'submitting' | 'success' | 'error' | 'forbidden';

@Component({
  selector: 'app-payment-apply-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './payment-apply-page.component.html',
  styleUrl: './payment-apply-page.component.css',
})
export class PaymentApplyPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly applicationRequestId = signal(generateApplicationRequestId());
  readonly state = signal<ApplyState>('idle');
  readonly result = signal<PaymentApplication | null>(null);

  readonly form = this.fb.group({
    paymentId: ['', [Validators.required]],
    applicationsJson: ['[]', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const paymentId = value.paymentId ?? '';
    if (!paymentId) {
      return;
    }
    const applications = JSON.parse(value.applicationsJson ?? '[]') as Array<{ invoiceId: string; amount: number }>;

    this.state.set('submitting');
    this.accountingService
      .applyPayment({
        paymentId,
        applicationRequestId: this.applicationRequestId(),
        applications,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.result.set(result);
          this.state.set('success');
        },
        error: err => {
          this.state.set((err?.status ?? 0) === 403 ? 'forbidden' : 'error');
        },
      });
  }
}
