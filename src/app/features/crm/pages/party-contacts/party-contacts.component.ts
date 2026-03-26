import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { CrmService } from '../../services/crm.service';
import { PartyDetail, Relationship, RelationshipRole } from '../../models/crm.models';

@Component({
  selector: 'app-party-contacts',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './party-contacts.component.html',
  styleUrl: './party-contacts.component.css',
})
export class PartyContactsComponent implements OnInit {
  private readonly crm = inject(CrmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly party = signal<PartyDetail | null>(null);
  readonly relationships = signal<Relationship[]>([]);
  readonly filterStatus = signal<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');
  readonly filterRole = signal<RelationshipRole | 'ALL'>('ALL');
  readonly filterSearch = signal<string>('');
  readonly pageIndex = signal<number>(0);
  readonly modalState = signal<'closed' | 'open' | 'saving'>('closed');
  readonly modalError = signal<string | null>(null);
  readonly pendingRowId = signal<string | null>(null);
  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly pageSize = 25;

  readonly addContactForm = this.fb.nonNullable.group({
    personId: [
      '',
      [
        Validators.required,
        Validators.pattern(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        ),
      ],
    ],
    role: ['BILLING' as RelationshipRole, Validators.required],
    effectiveFrom: ['', Validators.required],
    primaryBillingContact: [false],
  });

  readonly filteredRelationships = computed(() => {
    const status = this.filterStatus();
    const role = this.filterRole();
    const search = this.filterSearch().trim().toLowerCase();

    const filteredByStatus = this.relationships().filter(r => {
      if (status === 'ALL') {
        return true;
      }
      return r.status === status;
    });

    const filteredByRole = filteredByStatus.filter(r => {
      if (role === 'ALL') {
        return true;
      }
      return r.role === role;
    });

    if (!search) {
      return filteredByRole;
    }

    return filteredByRole.filter(r => r.personName.toLowerCase().includes(search));
  });

  readonly paginatedRelationships = computed(() => {
    const start = this.pageIndex() * this.pageSize;
    const end = (this.pageIndex() + 1) * this.pageSize;
    return this.filteredRelationships().slice(start, end);
  });

  readonly totalCount = computed(() => this.filteredRelationships().length);

  get partyId(): string {
    return this.route.snapshot.paramMap.get('partyId') ?? '';
  }

  ngOnInit(): void {
    this.loadParty();
    this.loadRelationships();
  }

  loadParty(): void {
    this.crm
      .getParty(this.partyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: party => this.party.set(party),
        error: err => {
          if (err?.status !== 403) {
            this.party.set(null);
          }
        },
      });
  }

  loadRelationships(): void {
    this.pageState.set('loading');
    this.crm
      .getContactsWithRoles(this.partyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rows => {
          this.relationships.set(rows);
          this.pageState.set('ready');
        },
        error: () => this.pageState.set('error'),
      });
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.filterSearch.set(input?.value ?? '');
    this.pageIndex.set(0);
  }

  onFilterChange(): void {
    this.pageIndex.set(0);
  }

  prevPage(): void {
    if (this.pageIndex() > 0) {
      this.pageIndex.update(v => v - 1);
    }
  }

  nextPage(): void {
    const hasMore = (this.pageIndex() + 1) * this.pageSize < this.totalCount();
    if (hasMore) {
      this.pageIndex.update(v => v + 1);
    }
  }

  openModal(): void {
    this.addContactForm.reset({
      personId: '',
      role: 'BILLING',
      effectiveFrom: '',
      primaryBillingContact: false,
    });
    this.modalError.set(null);
    this.modalState.set('open');
  }

  closeModal(): void {
    this.modalState.set('closed');
    this.modalError.set(null);
  }

  saveContact(): void {
    if (this.addContactForm.invalid || this.modalState() === 'saving') {
      return;
    }

    const value = this.addContactForm.getRawValue();
    this.modalState.set('saving');
    this.modalError.set(null);

    this.crm
      .createRelationship(this.partyId, {
        personId: value.personId,
        roles: [value.role],
        effectiveStartDate: value.effectiveFrom,
        primaryBillingContact: value.primaryBillingContact,
      })
      .pipe(
        switchMap(() => this.crm.getContactsWithRoles(this.partyId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: rows => {
          this.relationships.set(rows);
          this.closeModal();
          this.showToast('success', 'Contact relationship added.');
        },
        error: err => {
          this.modalError.set(
            err?.error?.message ?? 'Unable to save contact relationship.',
          );
          this.modalState.set('open');
        },
      });
  }

  setPrimaryBilling(relationship: Relationship): void {
    this.pendingRowId.set(relationship.relationshipId);
    this.crm
      .designatePrimaryBillingContact(this.partyId, relationship.relationshipId)
      .pipe(
        switchMap(() => this.crm.getContactsWithRoles(this.partyId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: rows => {
          this.relationships.set(rows);
          this.pendingRowId.set(null);
          this.showToast('success', 'Primary billing contact updated.');
        },
        error: () => {
          this.pendingRowId.set(null);
          this.showToast('error', 'Could not set primary billing contact.');
        },
      });
  }

  deactivate(relationship: Relationship): void {
    this.pendingRowId.set(relationship.relationshipId);
    this.crm
      .deactivateRelationship(this.partyId, relationship.relationshipId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const today = new Date().toISOString().slice(0, 10);
          this.relationships.update(rows =>
            rows.map(r =>
              r.relationshipId === relationship.relationshipId
                ? { ...r, status: 'INACTIVE', effectiveThru: today }
                : r,
            ),
          );
          this.pendingRowId.set(null);
          this.showToast('success', 'Relationship deactivated.');
        },
        error: () => {
          this.pendingRowId.set(null);
          this.showToast('error', 'Could not deactivate relationship.');
        },
      });
  }

  showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => {
      if (this.toast()?.message === message) {
        this.toast.set(null);
      }
    }, 3500);
  }

  backToParty(): void {
    this.router.navigate(['/app/crm/party', this.partyId]);
  }
}
