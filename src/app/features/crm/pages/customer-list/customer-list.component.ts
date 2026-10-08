import {
  Component, inject, signal, computed, OnInit, DestroyRef, ElementRef, Injector, afterNextRender, viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CrmService } from '../../services/crm.service';
import { PartyDetail, PrimaryContact } from '../../models/crm.models';

type PageState = 'loading' | 'empty' | 'ready' | 'error' | 'access-denied';
type SortField = 'name' | 'customerNumber';
type SortDir = 'asc' | 'desc';

/** Statuses with a CRM.CUSTOMER_LIST.STATUS label; any other value is shown as sent. */
const KNOWN_STATUSES: ReadonlySet<string> = new Set(['ACTIVE', 'PENDING', 'SUSPENDED', 'INACTIVE']);

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.css',
})
export class CustomerListComponent implements OnInit {
  private readonly translate = inject(TranslateService);
  private readonly crm = inject(CrmService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  private static readonly PAGE_SIZE = 25;

  private readonly resultsRegion = viewChild<ElementRef<HTMLElement>>('resultsRegion');

  /** Placeholder rows shown while a page loads. */
  readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8];

  readonly state = signal<PageState>('loading');
  readonly parties = signal<PartyDetail[]>([]);
  readonly error = signal<string | null>(null);

  readonly totalCount = signal(0);
  readonly pageIndex = signal(0);
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / CustomerListComponent.PAGE_SIZE)));
  readonly canPrevPage = computed(() => this.pageIndex() > 0);
  readonly canNextPage = computed(() => this.pageIndex() + 1 < this.totalPages());

  readonly sortField = signal<SortField>('name');
  readonly sortDir = signal<SortDir>('asc');

  /** Generation token; discards a slow request that resolves after a newer one. */
  private loadSeq = 0;

  readonly filterForm = this.fb.nonNullable.group({
    name: [''],
    status: [''],
    partyType: [''],
    customerNumber: [''],
  });

  ngOnInit(): void {
    this.filterForm.valueChanges
      .pipe(
        debounceTime(350),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.pageIndex.set(0);
        this.load();
      });
    this.load();
  }

  private load(): void {
    const seq = ++this.loadSeq;
    this.state.set('loading');
    this.error.set(null);

    const f = this.filterForm.getRawValue();
    this.crm
      .browseParties({
        page: this.pageIndex(),
        size: CustomerListComponent.PAGE_SIZE,
        name: f.name.trim() || undefined,
        status: f.status || undefined,
        partyType: f.partyType || undefined,
        customerNumber: f.customerNumber.trim() || undefined,
        sortField: this.sortField(),
        sortOrder: this.sortDir(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          if (seq !== this.loadSeq) return;
          this.parties.set(res.parties);
          this.totalCount.set(res.totalCount);
          this.state.set(res.parties.length ? 'ready' : 'empty');
        },
        error: err => {
          if (seq !== this.loadSeq) return;
          this.handleError(err);
        },
      });
  }

  sort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('asc');
    }
    this.pageIndex.set(0);
    this.reload();
  }

  prevPage(): void {
    if (this.canPrevPage()) {
      this.pageIndex.update(i => i - 1);
      this.reload();
    }
  }

  nextPage(): void {
    if (this.canNextPage()) {
      this.pageIndex.update(i => i + 1);
      this.reload();
    }
  }

  /** Re-reads the page that failed. */
  retry(): void {
    this.reload();
  }

  /**
   * Loads from a control inside the results region. The read swaps that region's
   * content for the loading panel, taking the focused sort, pager or Retry button
   * with it, so focus moves to the region once that render lands (ADR-0029 §8.7).
   */
  private reload(): void {
    const region = this.resultsRegion()?.nativeElement;
    const active = this.document.activeElement;
    const focusInResults = !!region && !!active && region.contains(active);
    this.load();
    if (focusInResults) {
      afterNextRender(() => this.focusResultsIfLost(), { injector: this.injector });
    }
  }

  private focusResultsIfLost(): void {
    const active = this.document.activeElement;
    if (!active || active === this.document.body) {
      this.resultsRegion()?.nativeElement.focus();
    }
  }

  clearFilters(): void {
    this.filterForm.reset({ name: '', status: '', partyType: '', customerNumber: '' });
  }

  private handleError(err: { status?: number; error?: { message?: string } }): void {
    this.state.set(err?.status === 403 ? 'access-denied' : 'error');
    this.error.set(err?.error?.message ?? this.translate.instant('CRM.CUSTOMER_LIST.ERROR.LOAD'));
  }

  isKnownStatus(status: string): boolean {
    return KNOWN_STATUSES.has(status);
  }

  primaryContact(party: PartyDetail): PrimaryContact | undefined {
    return party.primaryContact?.name ? party.primaryContact : undefined;
  }

  /** Whole-row click for mouse users; the name link owns keyboard and new-tab navigation. */
  onRowClick(event: MouseEvent, partyId: string, customerNumber?: string): void {
    if ((event.target as Element | null)?.closest('a')) {
      return;
    }
    this.openParty(partyId, customerNumber);
  }

  openParty(partyId: string, customerNumber?: string): void {
    // Carry the human-readable customer number so the detail page can show it
    // without re-fetching (the party detail endpoint omits it). Falls back to a
    // snapshot fetch on direct navigation / refresh where no state is passed.
    this.router.navigate(['/app/crm/party', partyId], { state: { customerNumber } });
  }

  createCommercial(): void {
    this.router.navigate(['/app/crm/create-commercial-account']);
  }

  createIndividual(): void {
    this.router.navigate(['/app/crm/create-individual-person']);
  }

  navigateToMerge(): void {
    this.router.navigate(['/app/crm/merge-parties']);
  }
}
