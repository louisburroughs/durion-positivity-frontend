import { CommonModule } from '@angular/common';
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
  WorkorderDetailResponse,
  WorkorderItemResponse,
  WorkorderStartResponse,
  WorkorderTransition,
} from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

type PageState = 'loading' | 'ready' | 'error';
type WorkorderTab = 'items' | 'labor' | 'parts' | 'change-requests' | 'audit';

/**
 * WorkorderDetailPageComponent — Story 230 (hub scaffold),
 * Stories 229 (items), 226 (audit trail), 224 (status CTAs), 219 (role visibility).
 *
 * Route: /app/workexec/workorders/:workorderId
 *
 * Design Authority directives applied:
 *   - Blueprint-blue gradient header (135deg #0f3560 → #2b4c78) with white text
 *   - Electric Teal CTAs (--brand-accent, btn btn--accent) for "Start Work" only
 *   - Tab indicator: 2px secondary bottom-border, no box
 *   - No dividers in item lists — tonal alternation via surface/surface-container-low
 *   - Glassmorphism confirmation modal for Start Work (rgba + backdrop-filter blur)
 *   - Status chip classes: status-chip status-chip--{status|lowercase}
 */
@Component({
  selector: 'app-workorder-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
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

  /** Start Work confirmation modal */
  readonly showStartWorkModal = signal(false);
  readonly startWorkLoading = signal(false);
  readonly startWorkError = signal<string | null>(null);
  readonly startWorkResult = signal<WorkorderStartResponse | null>(null);

  /** Audit trail expand/collapse */
  readonly auditExpanded = signal(false);

  readonly canStartWork = computed(() => {
    const wo = this.workorder();
    return wo?.status === 'ASSIGNED' || wo?.status === 'PENDING_ASSIGNMENT';
  });

  readonly isInProgress = computed(() => this.workorder()?.status === 'IN_PROGRESS');

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
        error: () => {
          /* non-blocking: audit trail load failure is silent */
        },
      });
  }

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

  refresh(): void {
    this.loadWorkorder(this.workorderId());
  }
}
