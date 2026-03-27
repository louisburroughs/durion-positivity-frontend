import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import {
  ChangeRequestItemRequest,
  ChangeRequestResponse,
  CreateChangeRequestRequest,
} from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

type PageState = 'loading' | 'ready' | 'error';

/**
 * WorkorderChangeRequestsPageComponent — Story 220 (CAP-005) + Story 217 (CAP-006)
 * Route: /app/workexec/workorders/:workorderId/change-requests
 * operationIds: createChangeRequest, approveChangeRequest, declineChangeRequest,
 *               getChangeRequestsByWorkorder, getChangeRequestById
 *
 * Story 217 adds: blockers computed list, blocker banner, resolved-count summary.
 */
@Component({
  selector: 'app-workorder-change-requests-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workorder-change-requests-page.component.html',
  styleUrl: './workorder-change-requests-page.component.css',
})
export class WorkorderChangeRequestsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(WorkexecService);
  private readonly destroyRef = inject(DestroyRef);

  readonly workorderId = signal<string>('');
  readonly pageState = signal<PageState>('loading');
  readonly changeRequests = signal<ChangeRequestResponse[]>([]);
  readonly errorMessage = signal<string | null>(null);

  /** Create form */
  readonly showCreateForm = signal(false);
  readonly crDescription = signal<string>('');
  readonly crItems = signal<ChangeRequestItemRequest[]>([]);
  readonly createState = signal<'idle' | 'loading' | 'error'>('idle');
  readonly createError = signal<string | null>(null);

  /** Resolve (approve/decline) state */
  readonly resolveId = signal<string | null>(null);
  readonly resolveNotes = signal<string>('');
  readonly resolveState = signal<'idle' | 'loading' | 'error'>('idle');
  readonly resolveError = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('workorderId') ?? '';
    this.workorderId.set(id);
    this.loadChangeRequests(id);
  }

  loadChangeRequests(id: string): void {
    this.pageState.set('loading');
    this.service
      .getChangeRequestsByWorkorder(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (crs) => {
          this.changeRequests.set(crs ?? []);
          this.pageState.set('ready');
        },
        error: () => {
          this.errorMessage.set('Failed to load change requests.');
          this.pageState.set('error');
        },
      });
  }

  openCreateForm(): void {
    this.crDescription.set('');
    this.crItems.set([]);
    this.createError.set(null);
    this.createState.set('idle');
    this.showCreateForm.set(true);
  }

  addItem(): void {
    this.crItems.update(items => [
      ...items,
      { type: 'SERVICE', serviceId: '', quantity: 1, isEmergency: false },
    ]);
  }

  removeItem(index: number): void {
    this.crItems.update(items => items.filter((_, i) => i !== index));
  }

  updateItem(index: number, partial: Partial<ChangeRequestItemRequest>): void {
    this.crItems.update(items =>
      items.map((item, i) => (i === index ? { ...item, ...partial } : item)),
    );
  }

  submitCreate(): void {
    const desc = this.crDescription().trim();
    if (!desc) { this.createError.set('Description is required.'); return; }
    this.createState.set('loading');
    this.createError.set(null);
    const request: CreateChangeRequestRequest = {
      description: desc,
      requestedItems: this.crItems(),
    };
    this.service
      .createChangeRequest(this.workorderId(), request, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cr) => {
          this.changeRequests.update(list => [cr, ...list]);
          this.createState.set('idle');
          this.showCreateForm.set(false);
        },
        error: (err) => {
          this.createState.set('error');
          this.createError.set(err?.error?.message ?? 'Failed to create change request.');
        },
      });
  }

  approve(changeId: string): void {
    this.resolveId.set(changeId);
    this.resolveState.set('loading');
    this.resolveError.set(null);
    this.service
      .approveChangeRequest(changeId, this.resolveNotes() || undefined, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.changeRequests.update(list => list.map(cr => (cr.id === changeId ? updated : cr)));
          this.resolveState.set('idle');
          this.resolveId.set(null);
        },
        error: (err) => {
          this.resolveState.set('error');
          this.resolveError.set(err?.error?.message ?? 'Failed to approve change request.');
        },
      });
  }

  decline(changeId: string): void {
    this.resolveId.set(changeId);
    this.resolveState.set('loading');
    this.resolveError.set(null);
    this.service
      .declineChangeRequest(changeId, this.resolveNotes() || undefined, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.changeRequests.update(list => list.map(cr => (cr.id === changeId ? updated : cr)));
          this.resolveState.set('idle');
          this.resolveId.set(null);
        },
        error: (err) => {
          this.resolveState.set('error');
          this.resolveError.set(err?.error?.message ?? 'Failed to decline change request.');
        },
      });
  }

  /** Story 217 — approval-gated blockers */
  readonly blockers = computed(() =>
    this.changeRequests().filter(cr => cr.status === 'AWAITING_ADVISOR_REVIEW'),
  );

  readonly resolvedCount = computed(() =>
    this.changeRequests().filter(cr => cr.status === 'APPROVED' || cr.status === 'DECLINED').length,
  );

  back(): void {
    this.router.navigate(['/app/workexec/workorders', this.workorderId()]);
  }

  crStatusClass(status?: string): string {
    return (status ?? '').toLowerCase().replace(/_/g, '-');
  }
}
