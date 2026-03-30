import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map, of, switchMap } from 'rxjs';
import { WorkorderInvoiceView } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

@Component({
  selector: 'app-invoice-finalization-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './invoice-finalization-page.component.html',
  styleUrl: './invoice-finalization-page.component.css',
})
export class InvoiceFinalizationPageComponent {
  private readonly workexec = inject(WorkexecService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly invoiceView = signal<WorkorderInvoiceView | null>(null);
  readonly isSubmitting = signal(false);
  readonly workorderId = signal<string | null>(null);

  constructor() {
    effect(onCleanup => {
      const sub = this.route.paramMap
        .pipe(
          map(paramMap => paramMap.get('workorderId')),
          switchMap(workorderId => {
            this.workorderId.set(workorderId);

            if (!workorderId) {
              this.invoiceView.set(null);
              this.state.set('empty');
              return of<WorkorderInvoiceView | null>(null);
            }

            this.state.set('loading');
            this.errorKey.set(null);
            return this.workexec.getWorkorderInvoiceView(workorderId);
          }),
        )
        .subscribe({
          next: invoiceView => {
            if (!invoiceView) {
              return;
            }

            this.invoiceView.set(invoiceView);
            this.state.set('ready');
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('WORKEXEC.INVOICE_FINALIZATION.ERROR.LOAD');
          },
        });

      onCleanup(() => sub.unsubscribe());
    });
  }

  requestFinalization(reason?: string): void {
    const workorderId = this.workorderId();
    if (!workorderId || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);

    this.workexec
      .requestInvoiceFinalization(workorderId, reason ? { reason } : undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.router.navigate(['/app/workexec/workorders', workorderId]);
        },
        error: () => {
          this.isSubmitting.set(false);
          this.state.set('error');
          this.errorKey.set('WORKEXEC.INVOICE_FINALIZATION.ERROR.SUBMIT');
        },
      });
  }
}
