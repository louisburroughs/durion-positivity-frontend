import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map, of, switchMap } from 'rxjs';
import { WORKEXEC_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkorderInvoiceView } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { MoneyPipe } from '../../../../shared/money.pipe';

const ITEM_TYPE_KEYS: Readonly<Record<string, string>> = {
  PART: 'WORKEXEC.ITEM_TYPE.PART',
  LABOR: 'WORKEXEC.ITEM_TYPE.LABOR',
  FEE: 'WORKEXEC.ITEM_TYPE.FEE',
};

/** pos-invoice statuses (`InvoiceDetailsResponse.status`). */
const INVOICE_STATUS_KEYS: Readonly<Record<string, string>> = {
  DRAFT: 'WORKEXEC.INVOICE_STATUS.DRAFT',
  FINALIZED: 'WORKEXEC.INVOICE_STATUS.FINALIZED',
  POSTED: 'WORKEXEC.INVOICE_STATUS.POSTED',
  ERROR: 'WORKEXEC.INVOICE_STATUS.ERROR',
  CANCELLED: 'WORKEXEC.INVOICE_STATUS.CANCELLED',
};

/**
 * Invoice finalization for a workorder (issue #350). The workorder's invoice is read
 * from pos-invoice (`getInvoiceByWorkorder`, durion-positivity-backend#2232) and
 * finalized there (`finalizeInvoice`). A workorder with no generated invoice answers
 * 404 and says so. Finalizing enforces `invoice:finalize`: the control and the handler
 * both gate on it (ADR-0040 §6a).
 */
@Component({
  selector: 'app-invoice-finalization-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe, MoneyPipe],
  templateUrl: './invoice-finalization-page.component.html',
  styleUrl: './invoice-finalization-page.component.css',
})
export class InvoiceFinalizationPageComponent {
  private readonly workexec = inject(WorkexecService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly invoiceView = signal<WorkorderInvoiceView | null>(null);
  readonly isSubmitting = signal(false);
  readonly workorderId = signal<string | null>(null);

  /** `finalizeInvoice` enforces `invoice:finalize`; unknown permissions fall back as `canAccess()` does. */
  readonly canFinalize = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(WORKEXEC_SECTION.invoiceFinalize),
  );

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
          error: (error: unknown) => {
            // ADR-0031: state first, then the key.
            this.state.set('error');
            this.errorKey.set(
              error instanceof HttpErrorResponse && error.status === 404
                ? 'WORKEXEC.INVOICE_FINALIZATION.ERROR.NO_INVOICE'
                : error instanceof HttpErrorResponse && error.status === 403
                  ? 'WORKEXEC.INVOICE_FINALIZATION.ERROR.FORBIDDEN'
                  : 'WORKEXEC.INVOICE_FINALIZATION.ERROR.LOAD',
            );
          },
        });

      onCleanup(() => sub.unsubscribe());
    }, { allowSignalWrites: true });
  }

  /** `PART`, `LABOR` and `FEE` have copy of their own; any other served type renders under a generic label. */
  itemTypeKey(type: string): string {
    return ITEM_TYPE_KEYS[type] ?? 'WORKEXEC.ITEM_TYPE.OTHER';
  }

  statusKey(status: string): string {
    return INVOICE_STATUS_KEYS[status] ?? 'WORKEXEC.INVOICE_STATUS.OTHER';
  }

  requestFinalization(reason?: string): void {
    const workorderId = this.workorderId();
    const invoiceId = this.invoiceView()?.invoiceId;
    if (!workorderId || !invoiceId || this.isSubmitting() || !this.canFinalize()) {
      return;
    }

    this.isSubmitting.set(true);

    this.workexec
      .finalizeInvoice(invoiceId, reason ? { reason } : undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.router.navigate(['/app/workexec/workorders', workorderId]);
        },
        error: (error: unknown) => {
          this.isSubmitting.set(false);
          this.state.set('error');
          this.errorKey.set(submitErrorKey(error));
        },
      });
  }
}

/** The message for a refused finalization, by the server's code and then its status. Literal keys for the i18n check. */
function submitErrorKey(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'WORKEXEC.INVOICE_FINALIZATION.ERROR.SUBMIT';
  const code = typeof error.error === 'object' && error.error !== null ? (error.error as { code?: unknown }).code : null;
  if (code === 'MANAGER_APPROVAL_REQUIRED' || code === 'MANAGER_APPROVAL_INVALID') {
    return 'WORKEXEC.INVOICE_FINALIZATION.ERROR.MANAGER_APPROVAL';
  }
  switch (error.status) {
    case 403:
      return 'WORKEXEC.INVOICE_FINALIZATION.ERROR.FORBIDDEN_FINALIZE';
    case 409:
      return 'WORKEXEC.INVOICE_FINALIZATION.ERROR.NOT_FINALIZABLE';
    default:
      return 'WORKEXEC.INVOICE_FINALIZATION.ERROR.SUBMIT';
  }
}
