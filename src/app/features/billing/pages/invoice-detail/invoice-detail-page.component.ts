import { CurrencyPipe, DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../../environments/environment';
import {
  InvoiceDetail,
  InvoiceArtifact,
  IssueInvoiceRequest,
} from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { AuthService } from '../../../../core/services/auth.service';

type PageState = 'loading' | 'ready' | 'error';
type IssueState = 'idle' | 'elevating' | 'issuing' | 'success' | 'error';

/**
 * Roles whose holders carry the invoice:finalize:override authority and may therefore
 * issue an elevation-required invoice directly, without a manager approval code.
 * Backend re-enforces the authority; this is a UX gate only (AuthService exposes roles,
 * not authorities).
 *
 * The backend grant of `invoice:finalize:override` to these roles is operational data
 * (see pos-invoice README "Manager-approval elevation — operational setup"); keep this
 * list in sync if that grant changes. Drift only degrades UX (an extra modal) or yields
 * a handled 403.
 */
const FINALIZE_OVERRIDE_ROLES = [
  'ROLE_SHOP_MANAGER',
  'ROLE_LOCATION_MANAGER',
  'ROLE_ADMIN',
] as const;

/**
 * InvoiceDetailPageComponent — CAP-007 Stories 209–212.
 *
 * Story 209: Issue Invoice (with optional elevation)
 * Story 210: Adjustments display
 * Story 211: Traceability breakdown
 * Story 212: Invoice totals summary
 *
 * Route: /app/billing/invoices/:invoiceId
 */
@Component({
  selector: 'app-invoice-detail-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, SlicePipe, FormsModule, TranslatePipe],
  templateUrl: './invoice-detail-page.component.html',
  styleUrl: './invoice-detail-page.component.css',
})
export class InvoiceDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly billingService = inject(BillingTransportService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly invoiceId = signal<string>('');
  readonly pageState = signal<PageState>('loading');
  readonly invoice = signal<InvoiceDetail | null>(null);
  readonly artifacts = signal<InvoiceArtifact[]>([]);
  readonly errorMessage = signal<string | null>(null);

  /** Issue flow */
  readonly issueState = signal<IssueState>('idle');
  readonly issueError = signal<string | null>(null);
  readonly issueSuccess = signal(false);
  /** Elevation modal */
  readonly showElevationModal = signal(false);
  readonly managerEmployeeNumber = signal('');
  readonly elevationToken = signal<string | null>(null);
  readonly elevationError = signal<string | null>(null);

  readonly requiresElevation = computed(
    () => this.invoice()?.issuancePolicy?.requiresElevation ?? false,
  );

  readonly canIssue = computed(() => {
    const inv = this.invoice();
    if (!inv) return false;
    const status = inv.status?.toUpperCase();
    return (status === 'DRAFT' || status === 'FINALIZED') &&
      this.issueState() === 'idle' &&
      !this.issueSuccess() &&
      (inv.issuancePolicy?.issuableNow !== false);
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('invoiceId') ?? '';
    this.invoiceId.set(id);
    this.loadInvoice(id);
  }

  private loadInvoice(id: string): void {
    this.pageState.set('loading');
    this.billingService
      .loadInvoiceDetail(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (inv) => {
          this.invoice.set(inv);
          this.pageState.set('ready');
          this.loadArtifacts(id);
        },
        error: (err) => {
          this.errorMessage.set(
            err?.status === 404
              ? 'BILLING.INVOICE_DETAIL.ERROR.NOT_FOUND'
              : 'BILLING.INVOICE_DETAIL.ERROR.LOAD',
          );
          this.pageState.set('error');
        },
      });
  }

  private loadArtifacts(id: string): void {
    this.billingService
      .loadInvoiceArtifacts(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (arts) => this.artifacts.set(arts ?? []),
        error: () => this.artifacts.set([]),
      });
  }

  /** True when the current user holds a role that carries the finalize-override authority. */
  readonly canSelfApprove = computed(() =>
    this.authService.hasAnyRole(FINALIZE_OVERRIDE_ROLES),
  );

  /** Issue flow entry point. */
  initiateIssue(): void {
    if (!this.canIssue()) return;
    if (!this.requiresElevation() || this.elevationToken()) {
      this.performIssue();
      return;
    }
    // Managers/admins hold the override authority and issue directly — no approval code.
    if (this.canSelfApprove()) {
      this.performIssue();
      return;
    }
    this.elevationError.set(null);
    this.managerEmployeeNumber.set('');
    this.showElevationModal.set(true);
  }

  elevate(): void {
    const employeeNumber = this.managerEmployeeNumber().trim();
    if (!employeeNumber) {
      this.elevationError.set('BILLING.INVOICE_DETAIL.ELEVATION.ERROR.EMPLOYEE_REQUIRED');
      return;
    }
    this.issueState.set('elevating');
    this.elevationError.set(null);
    this.billingService
      .elevate(employeeNumber, this.invoiceId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.elevationToken.set(res.elevationToken);
          this.managerEmployeeNumber.set('');
          this.showElevationModal.set(false);
          this.issueState.set('idle');
          this.performIssue();
        },
        error: (err) => {
          this.issueState.set('idle');
          this.elevationError.set(
            err?.status === 401
              ? 'BILLING.INVOICE_DETAIL.ELEVATION.ERROR.NOT_AUTHORIZED'
              : 'BILLING.INVOICE_DETAIL.ELEVATION.ERROR.GENERIC',
          );
        },
      });
  }

  dismissElevationModal(): void {
    this.showElevationModal.set(false);
    this.managerEmployeeNumber.set('');
    this.issueState.set('idle');
  }

  private performIssue(): void {
    this.issueState.set('issuing');
    this.issueError.set(null);
    const body: IssueInvoiceRequest = {};
    const token = this.elevationToken();
    if (token) body.elevationToken = token;
    this.billingService
      .issueInvoice(this.invoiceId(), body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.issueState.set('success');
          this.issueSuccess.set(true);
          this.invoice.update(inv => inv ? { ...inv, status: 'ISSUED' } : inv);
          this.loadArtifacts(this.invoiceId());
        },
        error: (err) => {
          this.issueState.set('error');
          this.issueError.set(
            err?.status === 409
              ? 'BILLING.INVOICE_DETAIL.ERROR.ALREADY_ISSUED'
              : err?.error?.message ?? 'BILLING.INVOICE_DETAIL.ERROR.ISSUE',
          );
        },
      });
  }

  downloadArtifact(artifactRefId: string, filename: string): void {
    const invoiceId = this.invoiceId();
    this.billingService
      .createArtifactDownloadToken(invoiceId, artifactRefId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const url = res.downloadUrl ?? `${environment.apiBaseUrl}/invoice/v1/invoices/${invoiceId}/artifacts/${artifactRefId}/download?token=${res.downloadToken}`;
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.click();
        },
        error: () => { },
      });
  }

  goBack(): void {
    const workorderId = this.invoice()?.workOrderId;
    if (workorderId) {
      this.router.navigate(['/app/workexec/workorders', workorderId]);
    } else {
      this.router.navigate(['/app/billing']);
    }
  }

  statusClass(status?: string): string {
    return (status ?? '').toLowerCase().replace(/_/g, '-');
  }
}
