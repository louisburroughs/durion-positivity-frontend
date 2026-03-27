import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import {
  ConsumePartsRequest,
  IssuePartsRequest,
  PartUsageResponse,
  ReturnPartsRequest,
  SubstituteLinkResponse,
  SubstitutePartRequest,
  WorkorderDetailResponse,
  WorkorderItemResponse,
} from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

type PageState = 'loading' | 'ready' | 'error';
type PartAction = 'issue' | 'consume' | 'return';

/**
 * WorkorderPartsPageComponent — Story 222 (issue/consume/return) + Story 221 (substitutions)
 * Route: /app/workexec/workorders/:workorderId/parts
 * operationIds: issueParts, consumeParts, returnParts, returnUnusedQuantity, correctPartQuantity,
 *               getUsageHistory, substitutePart, suggestSubstitutes
 *
 * Story 221 substitution flow implemented as an inline slide-out panel — no separate route.
 */
@Component({
  selector: 'app-workorder-parts-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workorder-parts-page.component.html',
  styleUrl: './workorder-parts-page.component.css',
})
export class WorkorderPartsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(WorkexecService);
  private readonly destroyRef = inject(DestroyRef);

  readonly workorderId = signal<string>('');
  readonly pageState = signal<PageState>('loading');
  readonly workorder = signal<WorkorderDetailResponse | null>(null);
  readonly usageHistory = signal<PartUsageResponse[]>([]);
  readonly errorMessage = signal<string | null>(null);

  /** Part action form */
  readonly activeAction = signal<PartAction | null>(null);
  readonly actionPartId = signal<string>('');
  readonly actionQuantity = signal<number>(1);
  readonly actionNotes = signal<string>('');
  readonly actionState = signal<'idle' | 'loading' | 'error'>('idle');
  readonly actionError = signal<string | null>(null);

  /** Story 221: substitution panel */
  readonly showSubstPanel = signal(false);
  readonly substSourcePartId = signal<string>('');
  readonly substSuggestions = signal<SubstituteLinkResponse[]>([]);
  readonly substLoadState = signal<'idle' | 'loading' | 'error'>('idle');
  readonly substSelectedId = signal<string>('');
  readonly substReason = signal<string>('');
  readonly substSaveState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  readonly substError = signal<string | null>(null);

  readonly partItems = computed((): WorkorderItemResponse[] =>
    this.workorder()?.items?.filter(i => i.itemType === 'PART') ?? [],
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('workorderId') ?? '';
    this.workorderId.set(id);
    this.loadData(id);
  }

  private loadData(id: string): void {
    this.pageState.set('loading');
    this.service
      .getWorkorderDetail(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.workorder.set(detail);
          this.loadUsageHistory(id);
        },
        error: () => {
          this.errorMessage.set('Failed to load work order.');
          this.pageState.set('error');
        },
      });
  }

  private loadUsageHistory(id: string): void {
    this.service
      .getUsageHistory(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (h) => {
          this.usageHistory.set(h ?? []);
          this.pageState.set('ready');
        },
        error: () => this.pageState.set('ready'),
      });
  }

  openAction(action: PartAction, partId?: string): void {
    this.activeAction.set(action);
    this.actionPartId.set(partId ?? '');
    this.actionQuantity.set(1);
    this.actionNotes.set('');
    this.actionError.set(null);
    this.actionState.set('idle');
  }

  closeAction(): void {
    this.activeAction.set(null);
  }

  submitAction(): void {
    const id = this.workorderId();
    const partId = this.actionPartId().trim();
    const qty = this.actionQuantity();
    if (!partId) { this.actionError.set('Part ID is required.'); return; }
    if (qty <= 0) { this.actionError.set('Quantity must be greater than 0.'); return; }

    this.actionState.set('loading');
    this.actionError.set(null);

    let call$;
    switch (this.activeAction()) {
      case 'issue': {
        const req: IssuePartsRequest = { partId, quantity: qty, notes: this.actionNotes() || undefined };
        call$ = this.service.issueParts(id, req, uuidv4());
        break;
      }
      case 'consume': {
        const req: ConsumePartsRequest = { partId, quantity: qty };
        call$ = this.service.consumeParts(id, req, uuidv4());
        break;
      }
      case 'return': {
        const req: ReturnPartsRequest = { partId, quantity: qty, reason: this.actionNotes() || undefined };
        call$ = this.service.returnParts(id, req, uuidv4());
        break;
      }
      default:
        return;
    }

    call$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.usageHistory.update(h => [result, ...h]);
        this.actionState.set('idle');
        this.activeAction.set(null);
      },
      error: (err) => {
        this.actionState.set('error');
        this.actionError.set(err?.error?.message ?? 'Action failed. Please try again.');
      },
    });
  }

  // ── Story 221: Substitution panel ─────────────────────────────────────────

  openSubstPanel(partId: string): void {
    this.substSourcePartId.set(partId);
    this.substSuggestions.set([]);
    this.substSelectedId.set('');
    this.substReason.set('');
    this.substError.set(null);
    this.substSaveState.set('idle');
    this.showSubstPanel.set(true);
    this.loadSuggestions(partId);
  }

  closeSubstPanel(): void {
    this.showSubstPanel.set(false);
  }

  private loadSuggestions(partId: string): void {
    this.substLoadState.set('loading');
    this.service
      .suggestSubstitutes(this.workorderId(), partId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (suggestions) => {
          this.substSuggestions.set(suggestions ?? []);
          this.substLoadState.set('idle');
        },
        error: () => {
          this.substLoadState.set('error');
        },
      });
  }

  confirmSubstitution(): void {
    const substituteId = this.substSelectedId().trim();
    if (!substituteId) { this.substError.set('Select a substitute part.'); return; }
    const reason = this.substReason().trim();
    if (!reason) { this.substError.set('Reason is required.'); return; }
    const request: SubstitutePartRequest = {
      originalPartId: this.substSourcePartId(),
      substitutePartId: substituteId,
      reason,
    };
    this.substSaveState.set('loading');
    this.substError.set(null);
    this.service
      .substitutePart(this.workorderId(), request, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.substSaveState.set('success');
          this.showSubstPanel.set(false);
          this.loadData(this.workorderId());
        },
        error: (err) => {
          this.substSaveState.set('error');
          this.substError.set(err?.error?.message ?? 'Substitution failed.');
        },
      });
  }

  back(): void {
    this.router.navigate(['/app/workexec/workorders', this.workorderId()]);
  }
}
