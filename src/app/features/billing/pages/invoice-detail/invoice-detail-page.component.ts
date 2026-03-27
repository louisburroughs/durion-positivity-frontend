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
import {
  InvoiceDetail,
  InvoiceArtifact,
  IssueInvoiceRequest,
} from '../../models/billing.models';
import { BillingService } from '../../services/billing.service';

type PageState = 'loading' | 'ready' | 'error';
type IssueState = 'idle' | 'elevating' | 'issuing' | 'success' | 'error';

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
  imports: [CurrencyPipe, DatePipe, SlicePipe, FormsModule],
  templateUrl: './invoice-detail-page.component.html',
  styleUrl: './invoice-detail-page.component.css',
})
export class InvoiceDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(BillingService);
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
  readonly elevationPassword = signal('');
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
      !this.issueSuccess();
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('invoiceId') ?? '';
    this.invoiceId.set(id);
    this.loadInvoice(id);
  }

  private loadInvoice(id: string): void {
    this.pageState.set('loading');
    this.service
      .getInvoiceDetail(id)
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
              ? 'Invoice not found.'
              : 'Failed to load invoice. Please try again.',
          );
          this.pageState.set('error');
        },
      });
  }

  private loadArtifacts(id: string): void {
    this.service
      .getInvoiceArtifacts(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (arts) => this.artifacts.set(arts ?? []),
        error: () => this.artifacts.set([]),
      });
  }

  /** Issue flow entry point. */
  initiateIssue(): void {
    if (!this.canIssue()) return;
    if (this.requiresElevation() && !this.elevationToken()) {
      this.elevationError.set(null);
      this.elevationPassword.set('');
      this.showElevationModal.set(true);
    } else {
      this.performIssue();
    }
  }

  elevate(): void {
    const pw = this.elevationPassword().trim();
    if (!pw) {
      this.elevationError.set('Password is required.');
      return;
    }
    this.issueState.set('elevating');
    this.elevationError.set(null);
    this.service
      .elevate({ password: pw })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.elevationToken.set(res.elevationToken);
          this.showElevationModal.set(false);
          this.issueState.set('idle');
          this.performIssue();
        },
        error: (err) => {
          this.issueState.set('idle');
          this.elevationError.set(
            err?.status === 401
              ? 'Incorrect password. Please try again.'
              : 'Elevation failed. Please contact your manager.',
          );
        },
      });
  }

  dismissElevationModal(): void {
    this.showElevationModal.set(false);
    this.issueState.set('idle');
  }

  private performIssue(): void {
    this.issueState.set('issuing');
    this.issueError.set(null);
    const body: IssueInvoiceRequest = {};
    const token = this.elevationToken();
    if (token) body.elevationToken = token;
    this.service
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
              ? 'Invoice has already been issued.'
              : err?.error?.message ?? 'Failed to issue invoice. Please try again.',
          );
        },
      });
  }

  downloadArtifact(artifactRefId: string, filename: string): void {
    this.service
      .getArtifactDownloadToken(artifactRefId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const url = res.downloadUrl ?? `/billing/artifacts/${artifactRefId}/download?token=${res.downloadToken}`;
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.click();
        },
        error: () => {},
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
