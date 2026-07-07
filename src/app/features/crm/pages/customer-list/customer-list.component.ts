import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CrmService } from '../../services/crm.service';
import { PartyDetail, PrimaryContact } from '../../models/crm.models';

type PageState = 'loading' | 'empty' | 'ready' | 'error' | 'access-denied';
type SortField = 'name' | 'customerNumber';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.css',
})
export class CustomerListComponent implements OnInit {
  private readonly crm = inject(CrmService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  private static readonly PAGE_SIZE = 25;

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
    this.load();
  }

  prevPage(): void {
    if (this.canPrevPage()) {
      this.pageIndex.update(i => i - 1);
      this.load();
    }
  }

  nextPage(): void {
    if (this.canNextPage()) {
      this.pageIndex.update(i => i + 1);
      this.load();
    }
  }

  clearFilters(): void {
    this.filterForm.reset({ name: '', status: '', partyType: '', customerNumber: '' });
  }

  private handleError(err: { status?: number; error?: { message?: string } }): void {
    this.state.set(err?.status === 403 ? 'access-denied' : 'error');
    this.error.set(err?.error?.message ?? 'Failed to load customers.');
  }

  primaryContact(party: PartyDetail): PrimaryContact | undefined {
    return party.primaryContact?.name ? party.primaryContact : undefined;
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
