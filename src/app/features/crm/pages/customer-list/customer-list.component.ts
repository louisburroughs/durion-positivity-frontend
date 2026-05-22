import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CrmService } from '../../services/crm.service';
import { Contact, PartyDetail } from '../../models/crm.models';

type PageState = 'loading' | 'empty' | 'ready' | 'error' | 'access-denied';
type SortField = 'name' | 'vehicles';
type SortDir   = 'asc' | 'desc';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.css',
})
export class CustomerListComponent implements OnInit {
  private readonly crm       = inject(CrmService);
  private readonly router    = inject(Router);
  private readonly fb        = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly state   = signal<PageState>('loading');
  readonly parties = signal<PartyDetail[]>([]);
  readonly error   = signal<string | null>(null);

  readonly sortField = signal<SortField>('name');
  readonly sortDir   = signal<SortDir>('asc');

  readonly sortedParties = computed(() => {
    const field = this.sortField();
    const dir   = this.sortDir();
    return [...this.parties()].sort((a, b) => {
      const cmp = field === 'name'
        ? a.legalName.localeCompare(b.legalName)
        : (a.vehicles?.length ?? 0) - (b.vehicles?.length ?? 0);
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  readonly searchForm = this.fb.nonNullable.group({ query: [''] });

  ngOnInit(): void {
    this.searchForm.controls.query.valueChanges.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(q => this.search(q));
    this.search('');
  }

  search(q: string): void {
    const query = q.trim();
    this.state.set('loading');
    this.error.set(null);
    this.crm.searchParties(query).subscribe({
      next: res => {
        this.parties.set(res.parties ?? []);
        this.state.set(res.parties?.length ? 'ready' : 'empty');
      },
      error: err => {
        this.state.set(err?.status === 403 ? 'access-denied' : 'error');
        this.error.set(err?.error?.message ?? 'Search failed.');
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
  }

  primaryContact(party: PartyDetail): Contact | undefined {
    return party.contacts?.find(c => c.roles.includes('PRIMARY')) ?? party.contacts?.[0];
  }

  openParty(partyId: string): void {
    this.router.navigate(['/app/crm/party', partyId]);
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
