import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
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
import { CreditMemo } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

function creditAmountWithinBalanceValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const amount = Number(control.get('creditAmount')?.value ?? 0);
    const outstanding = Number(control.get('outstandingBalance')?.value ?? 0);

    if (Number.isFinite(amount) && Number.isFinite(outstanding) && amount > outstanding) {
      return { exceedsOutstandingBalance: true };
    }
    return null;
  };
}

type CreditMemoCreateState = 'idle' | 'submitting' | 'success' | 'error' | 'forbidden';

@Component({
  selector: 'app-credit-memo-create-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './credit-memo-create-page.component.html',
  styleUrl: './credit-memo-create-page.component.css',
})
export class CreditMemoCreatePageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<CreditMemoCreateState>('idle');
  readonly result = signal<CreditMemo | null>(null);

  readonly form = this.fb.group(
    {
      originalInvoiceId: ['', [Validators.required]],
      customerId: ['', [Validators.required]],
      creditAmount: [0, [Validators.required, Validators.min(0.01)]],
      outstandingBalance: [0, [Validators.required, Validators.min(0)]],
      reasonCode: ['', [Validators.required]],
      justificationNote: ['', [Validators.required, Validators.minLength(10)]],
    },
    {
      validators: [creditAmountWithinBalanceValidator()],
    },
  );

  submit(): void {
    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const originalInvoiceId = value.originalInvoiceId ?? '';
    const customerId = value.customerId ?? '';
    const reasonCode = value.reasonCode ?? '';
    const justificationNote = value.justificationNote ?? '';
    if (!originalInvoiceId || !customerId || !reasonCode || !justificationNote) {
      return;
    }

    this.state.set('submitting');
    this.accountingService
      .createCreditMemo({
        originalInvoiceId,
        customerId,
        creditAmount: Number(value.creditAmount),
        reasonCode,
        justificationNote,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: memo => {
          this.result.set(memo);
          this.state.set('success');
        },
        error: err => {
          this.state.set((err?.status ?? 0) === 403 ? 'forbidden' : 'error');
        },
      });
  }
}
