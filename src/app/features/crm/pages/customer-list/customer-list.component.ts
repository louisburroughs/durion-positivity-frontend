import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CrmService } from '../../services/crm.service';
import { PartyDetail } from '../../models/crm.models';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error' | 'access-denied';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.css',
})
export class CustomerListComponent implements OnInit {
  private readonly crm    = inject(CrmService);
  private readonly router = inject(Router);
  private readonly fb     = inject(FormBuilder);

  readonly state   = signal<PageState>('idle');
  readonly parties = signal<PartyDetail[]>([]);
  readonly error   = signal<string | null>(null);

  readonly searchForm = this.fb.nonNullable.group({ query: [''] });

  ngOnInit(): void {
    this.searchForm.controls.query.valueChanges.pipe(
      debounceTime(350),
      distinctUntilChanged(),
    ).subscribe(q => this.search(q));
  }

  search(q: string): void {
    if (!q.trim()) {
      this.parties.set([]);
      this.state.set('idle');
      return;
    }
    this.state.set('loading');
    this.crm.searchParties(q).subscribe({
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

  openParty(partyId: string): void {
    this.router.navigate(['/app/crm/party', partyId]);
  }

  createCommercial(): void {
    this.router.navigate(['/app/crm/create-commercial-account']);
  }

  createIndividual(): void {
    this.router.navigate(['/app/crm/create-individual-person']);
  }
}
