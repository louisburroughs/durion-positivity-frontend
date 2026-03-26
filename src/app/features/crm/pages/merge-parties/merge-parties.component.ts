import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CrmService } from '../../services/crm.service';
import {
  MergePartiesRequest,
  MergePartiesResponse,
  PartyDetail,
} from '../../models/crm.models';

@Component({
  selector: 'app-merge-parties',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './merge-parties.component.html',
  styleUrl: './merge-parties.component.css',
})
export class MergePartiesComponent {
  private readonly crm = inject(CrmService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly step = signal<'search' | 'confirm' | 'success'>('search');
  readonly searchState = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly searchResults = signal<PartyDetail[]>([]);
  readonly selectedParties = signal<PartyDetail[]>([]);
  readonly survivorPartyId = signal<string | null>(null);
  readonly confirmError = signal<string | null>(null);
  readonly confirmPending = signal<boolean>(false);
  readonly mergeResult = signal<MergePartiesResponse | null>(null);
  readonly searchError = signal<string | null>(null);

  readonly searchForm = this.fb.nonNullable.group({
    name: [''],
    email: [''],
    phone: [''],
  });

  readonly confirmForm = this.fb.nonNullable.group({
    justification: ['', Validators.required],
    acknowledged: [false, Validators.requiredTrue],
  });

  readonly canContinue = computed(() => this.selectedParties().length === 2);
  readonly canMerge = computed(
    () => !!this.survivorPartyId() && this.confirmForm.valid,
  );

  search(): void {
    const query = this.buildQuery();
    this.searchError.set(null);

    if (!query) {
      this.searchState.set('idle');
      this.searchResults.set([]);
      this.searchError.set('Enter at least one search field.');
      return;
    }

    this.searchState.set('loading');
    this.crm
      .searchParties(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          const rows = response.parties ?? [];
          this.searchResults.set(rows);
          this.searchState.set(rows.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.searchResults.set([]);
          this.searchState.set('error');
        },
      });
  }

  toggleSelect(party: PartyDetail): void {
    if (party.mergedIntoPartyId) {
      return;
    }

    this.selectedParties.update(current => {
      const existing = current.find(p => p.partyId === party.partyId);
      if (existing) {
        return current.filter(p => p.partyId !== party.partyId);
      }
      if (current.length >= 2) {
        return current;
      }
      return [...current, party];
    });
  }

  isSelected(partyId: string): boolean {
    return this.selectedParties().some(p => p.partyId === partyId);
  }

  continueToConfirm(): void {
    if (!this.canContinue()) {
      return;
    }
    const selected = this.selectedParties();
    this.step.set('confirm');
    this.confirmError.set(null);
    this.survivorPartyId.set(selected[0].partyId);
  }

  backToSearch(): void {
    this.step.set('search');
    this.confirmError.set(null);
    this.confirmForm.reset({ justification: '', acknowledged: false });
  }

  setSurvivor(partyId: string): void {
    this.survivorPartyId.set(partyId);
  }

  submitMerge(): void {
    if (!this.canMerge() || this.confirmPending()) {
      return;
    }

    const selected = this.selectedParties();
    const survivor = this.survivorPartyId();
    if (!survivor) {
      return;
    }

    const losing = selected.find(p => p.partyId !== survivor);
    if (!losing) {
      this.confirmError.set('Unable to identify losing party.');
      return;
    }

    this.confirmPending.set(true);
    this.confirmError.set(null);

    const request: MergePartiesRequest = {
      survivorPartyId: survivor,
      losingPartyId: losing.partyId,
      justification: this.confirmForm.controls.justification.value,
    };

    this.crm
      .mergeParties(survivor, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.mergeResult.set(result);
          this.confirmPending.set(false);
          this.step.set('success');
        },
        error: err => {
          this.confirmError.set(err?.error?.message ?? 'Merge failed.');
          this.confirmPending.set(false);
        },
      });
  }

  viewSurvivor(): void {
    const result = this.mergeResult();
    if (!result) {
      return;
    }
    this.router.navigate(['/app/crm/party', result.survivorPartyId]);
  }

  startNewMerge(): void {
    this.step.set('search');
    this.searchState.set('idle');
    this.searchResults.set([]);
    this.selectedParties.set([]);
    this.survivorPartyId.set(null);
    this.confirmError.set(null);
    this.confirmPending.set(false);
    this.mergeResult.set(null);
    this.searchError.set(null);
    this.searchForm.reset({ name: '', email: '', phone: '' });
    this.confirmForm.reset({ justification: '', acknowledged: false });
  }

  back(): void {
    this.router.navigate(['/app/crm']);
  }

  private buildQuery(): string {
    const value = this.searchForm.getRawValue();
    return [value.name, value.email, value.phone]
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .join(' ');
  }
}
