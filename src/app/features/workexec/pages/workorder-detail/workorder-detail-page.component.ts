import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import {
  ChangeRequestResponse,
  CompleteWorkorderRequest,
  CompleteWorkorderResponse,
  CompletionFailedCheck,
  ReopenWorkorderRequest,
  WorkorderDetailResponse,
  WorkorderItemResponse,
  WorkorderStartResponse,
  WorkorderTransition,
} from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

type PageState = 'loading' | 'ready' | 'error';
type WorkorderTab = 'items' | 'labor' | 'parts' | 'change-requests' | 'audit';
type ModalState = 'idle' | 'confirming' | 'loading' | 'success' | 'error';

/**
 * WorkorderDetailPageComponent — CAP-004 (Story 230), CAP-005 (Stories 229, 226, 224, 219),
 * CAP-006 (Stories 218 completion checklist, 215 complete, 214 reopen),
 * CAP-007 (Story 213 — "Create Invoice" CTA).
 *
 * Route: /app/workexec/workorders/:workorderId
 */
@Component({
  selector: 'app-workorder-detail-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './workorder-detail-page.component.html',
  styleUrl: './workorder-detail-page.component.css',
})
export class WorkorderDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(WorkexecService);
  private readonly destroyRef = inject(DestroyRef);

  readonly workorderId = signal<string>('');
  readonly pageState = signal<PageState>('loading');
  readonly workorder = signal<WorkorderDetailResponse | null>(null);
  readonly transitions = signal<WorkorderTransition[]>([]);
  readonly activeTab = signal<WorkorderTab>('items');
  readonly errorMessage = signal<string | null>(null);

  // ── Start Work modal ──────────────────────────────────────────────────────

  readonly showStartWorkModal = signal(false);
  readonly startWorkLoading = signal(false);
  readonly startWorkError = signal<string | null>(null);
  readonly startWorkResult = signal<WorkorderStartResponse | null>(null);

  // ── Complete Work Order (Story 215) ───────────────────────────────────────

  readonly showCompleteModal = signal(false);
  readonly completeModalState = signal<ModalState>('idle');
  readonly completionNotes = signal('');
  readonly completeError = signal<string | null>(null);
  readonly failedChecks = signal<CompletionFailedCheck[]>([]);

  // ── Reopen Work Order (Story 214) ────────────────────────────────────────

  readonly showReopenModal = signal(false);
  readonly reopenModalState = signal<ModalState>('idle');
  readonly reopenReason = signal('');
  readonly reopenError = signal<string | null>(null);

  // ── Completion checklist / blockers (Story 218) ──────────────────────────

  readonly changeRequests = signal<ChangeRequestResponse[]>([]);
  readonly checklistLoading = signal(false);

  // ── Generate Invoice (Story 213 — CAP-007 entry) ─────────────────────────

  readonly invoiceLoading = signal(false);
  readonly invoiceError = signal<string | null>(null);

  // ── Audit trail expand/collapse ───────────────────────────────────────────

  readonly auditExpanded = signal(false);

  // ── Computed guards ───────────────────────────────────────────────────────

  readonly canStartWork = computed(() => {
    const wo = this.workorder();
    return wo?.status === 'ASSIGNED' || wo?.status === 'PENDING_ASSIGNMENT';
  });

  readonly isInProgress = computed(() => this.workorder()?.status === 'IN_PROGRESS');

  readonly isCompleted = computed(() => this.workorder()?.status === 'COMPLETED');

  readonly canComplete = computed(() => {
    const wo = this.workorder();
    return wo?.status === 'IN_PROGRESS' || wo?.status === 'PENDING_REVIEW';
  });

  readonly canReopen = computed(() => this.workorder()?.status === 'COMPLETED');

  readonly canCreateInvoice = computed(() =>
    this.workorder()?.status === 'COMPLETED' || this.workorder()?.status === 'INVOICED',
  );

  readonly pendingCrCount = computed(
    () => this.changeRequests().filter(cr => cr.status === 'AWAITING_ADVISOR_REVIEW').length,
  );

  readonly items = computed((): WorkorderItemResponse[] => this.workorder()?.items ?? []);

  readonly technicianName = computed(() =>
    this.workorder()?.primaryTechnicianName ??
    this.workorder()?.technician?.technicianName ??
    null,
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('workorderId') ?? '';
    this.workorderId.set(id);
    this.loadWorkorder(id);
  }

  loadWorkorder(id: string): void {
    this.pageState.set('loading');
    this.errorMessage.set(null);
    this.service
      .getWorkorderDetail(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.workorder.set(detail);
          this.pageState.set('ready');
          if (this.activeTab() === 'audit') {
            this.loadTransitions(id);
          }
          this.loadChangeRequests(id);
        },
        error: (err) => {
          const status = err?.status ?? 0;
          this.errorMessage.set(
            status === 404
              ? 'Work order not found.'
              : status === 403
                ? 'You do not have permission to view this work order.'
                : 'Failed to load work order. Please try again.',
          );
          this.pageState.set('error');
        },
      });
  }

  private loadChangeRequests(id: string): void {
    this.checklistLoading.set(true);
    this.service
      .getChangeRequestsByWorkorder(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (crs) => {
          this.changeRequests.set(crs);
          this.checklistLoading.set(false);
        },
        error: () => this.checklistLoading.set(false),
      });
  }

  selectTab(tab: WorkorderTab): void {
    this.activeTab.set(tab);
    if (tab === 'audit' && this.transitions().length === 0) {
      this.loadTransitions(this.workorderId());
    }
  }

  private loadTransitions(id: string): void {
    this.service
      .getTransitionHistory(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => this.transitions.set(t),
        error: () => { /* non-blocking */ },
      });
  }

  // ── Start Work ────────────────────────────────────────────────────────────

  openStartWorkModal(): void {
    this.startWorkError.set(null);
    this.showStartWorkModal.set(true);
  }

  confirmStartWork(): void {
    const id = this.workorderId();
    this.startWorkLoading.set(true);
    this.startWorkError.set(null);
    this.service
      .startWork(id, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.startWorkResult.set(result);
          this.startWorkLoading.set(false);
          this.showStartWorkModal.set(false);
          this.loadWorkorder(id);
        },
        error: (err) => {
          this.startWorkLoading.set(false);
          const status = err?.status ?? 0;
          this.startWorkError.set(
            status === 409
              ? 'Work has already been started for this work order.'
              : 'Failed to start work. Please try again.',
          );
        },
      });
  }

  cancelStartWork(): void {
    this.showStartWorkModal.set(false);
    this.startWorkError.set(null);
  }

  // ── Complete Work Order (Story 215) ───────────────────────────────────────

  openCompleteModal(): void {
    this.completeModalState.set('confirming');
    this.completeError.set(null);
    this.failedChecks.set([]);
    this.completionNotes.set('');
    this.showCompleteModal.set(true);
  }

  confirmComplete(): void {
    const id = this.workorderId();
    this.completeModalState.set('loading');
    this.completeError.set(null);
    const body: CompleteWorkorderRequest = {
      completionNotes: this.completionNotes() || undefined,
    };
    this.service
      .completeWorkorder(id, body, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res: CompleteWorkorderResponse) => {
          if (res.failedChecks && res.failedChecks.length > 0) {
            this.failedChecks.set(res.failedChecks);
            this.completeModalState.set('error');
            this.completeError.set('Completion blocked. Please resolve all issues below.');
          } else {
            this.completeModalState.set('success');
            const handle = setTimeout(() => {
              this.showCompleteModal.set(false);
              this.completeModalState.set('idle');
              this.loadWorkorder(id);
            }, 1200);
            this.destroyRef.onDestroy(() => clearTimeout(handle));
          }
        },
        error: (err) => {
          this.completeModalState.set('error');
          const apiError = err?.error;
          if (apiError?.failedChecks?.length) {
            this.failedChecks.set(apiError.failedChecks);
            this.completeError.set('Completion blocked. Please resolve all issues below.');
          } else {
            const status = err?.status ?? 0;
            this.completeError.set(
              status === 409
                ? 'Work order cannot be completed in its current state.'
                : status === 422
                  ? apiError?.message ?? 'Completion requirements not met.'
                  : 'Failed to complete work order. Please try again.',
            );
          }
        },
      });
  }

  cancelComplete(): void {
    this.showCompleteModal.set(false);
    this.completeModalState.set('idle');
    this.failedChecks.set([]);
    this.completeError.set(null);
  }

  // ── Reopen Work Order (Story 214) ────────────────────────────────────────

  openReopenModal(): void {
    this.reopenModalState.set('confirming');
    this.reopenError.set(null);
    this.reopenReason.set('');
    this.showReopenModal.set(true);
  }

  confirmReopen(): void {
    const reason = this.reopenReason().trim();
    if (!reason) {
      this.reopenError.set('Reopen reason is required.');
      return;
    }
    const id = this.workorderId();
    this.reopenModalState.set('loading');
    this.reopenError.set(null);
    const body: ReopenWorkorderRequest = { reopenReason: reason };
    this.service
      .reopenWorkorder(id, body, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.reopenModalState.set('success');
          const handle = setTimeout(() => {
            this.showReopenModal.set(false);
            this.reopenModalState.set('idle');
            this.loadWorkorder(id);
          }, 1200);
          this.destroyRef.onDestroy(() => clearTimeout(handle));
        },
        error: (err) => {
          this.reopenModalState.set('error');
          const status = err?.status ?? 0;
          this.reopenError.set(
            status === 409
              ? 'Work order cannot be reopened in its current state.'
              : 'Failed to reopen work order. Please try again.',
          );
        },
      });
  }

  cancelReopen(): void {
    this.showReopenModal.set(false);
    this.reopenModalState.set('idle');
    this.reopenError.set(null);
  }

  // ── Generate Invoice / Create Invoice Draft (Story 213 — CAP-007) ────────

  generateInvoice(): void {
    const id = this.workorderId();
    this.invoiceLoading.set(true);
    this.invoiceError.set(null);
    this.service
      .generateInvoice(id, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.invoiceLoading.set(false);
          this.router.navigate(['/app/billing/invoices', res.invoiceId]);
        },
        error: (err) => {
          this.invoiceLoading.set(false);
          const status = err?.status ?? 0;
          const existingId = err?.error?.invoiceId;
          if (status === 409 && existingId) {
            this.router.navigate(['/app/billing/invoices', existingId]);
          } else {
            this.invoiceError.set(
              status === 409
                ? 'An invoice draft already exists for this work order.'
                : 'Failed to create invoice. Please try again.',
            );
          }
        },
      });
  }

  // ── Navigation helpers ────────────────────────────────────────────────────

  navigateToAssign(): void {
    this.router.navigate(['/app/workexec/workorders', this.workorderId(), 'assign']);
  }

  navigateToLabor(): void {
    this.router.navigate(['/app/workexec/workorders', this.workorderId(), 'labor']);
  }

  navigateToParts(): void {
    this.router.navigate(['/app/workexec/workorders', this.workorderId(), 'parts']);
  }

  navigateToChangeRequests(): void {
    this.router.navigate(['/app/workexec/workorders', this.workorderId(), 'change-requests']);
  }

  navigateToFinalize(): void {
    this.router.navigate(['/app/workexec/workorders', this.workorderId(), 'finalize']);
  }

  refresh(): void {
    this.loadWorkorder(this.workorderId());
  }
}
