import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CrmService } from '../../services/crm.service';
import {
  PartyDetail,
  ContactRole,
  CommunicationPreferences,
  Relationship,
} from '../../models/crm.models';

type SectionState = 'loading' | 'ready' | 'error' | 'access-denied';
type EditState    = 'view' | 'editing' | 'saving';

@Component({
  selector: 'app-party-detail',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './party-detail.component.html',
  styleUrl: './party-detail.component.css',
})
export class PartyDetailComponent implements OnInit {
  private readonly crm    = inject(CrmService);
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb     = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  // ── Party ───────────────────────────────────────────────────────────────
  readonly partyState  = signal<SectionState>('loading');
  readonly party       = signal<PartyDetail | null>(null);
  // Human-readable account number so we never publish the raw partyId UUID on
  // screen (UI rule). The party detail endpoint omits it; the snapshot's
  // account block carries it, so we fetch it best-effort.
  readonly customerNumber = signal('');

  // ── Contacts ─────────────────────────────────────────────────────────
  readonly contactsState = signal<SectionState>('loading');
  readonly contacts      = signal<Relationship[]>([]);

  // ── Communication Preferences ────────────────────────────────────────
  readonly prefsState  = signal<SectionState>('loading');
  readonly prefs       = signal<CommunicationPreferences | null>(null);
  readonly prefsEdit   = signal<EditState>('view');
  readonly prefsError  = signal<string | null>(null);

  readonly prefsForm = this.fb.nonNullable.group({
    emailEnabled:       [false],
    smsEnabled:         [false],
  });

  get partyId(): string {
    return this.route.snapshot.paramMap.get('partyId') ?? '';
  }

  ngOnInit(): void {
    this.loadParty();
    this.loadContacts();
    this.loadPrefs();
    this.loadCustomerNumber();
  }

  // Best-effort human-readable account number for the header (UI rule: no raw
  // UUID on screen). Silent on failure — the h1 name still identifies the party.
  private loadCustomerNumber(): void {
    this.crm.fetchByParty(this.partyId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: snapshot => {
        const account = (snapshot?.account ?? {}) as Record<string, unknown>;
        const number = account['accountNumber'] ?? account['customerNumber'];
        this.customerNumber.set(typeof number === 'string' ? number : '');
      },
      error: () => this.customerNumber.set(''),
    });
  }

  // ── Load party ─────────────────────────────────────────────────────────
  loadParty(): void {
    this.partyState.set('loading');
    this.crm.getParty(this.partyId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => { this.party.set(p); this.partyState.set('ready'); },
      error: err => {
        this.partyState.set(err?.status === 403 ? 'access-denied' : 'error');
      },
    });
  }

  // ── Contacts ──────────────────────────────────────────────────────────
  loadContacts(): void {
    this.contactsState.set('loading');
    this.crm.getContactsWithRoles(this.partyId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: c => { this.contacts.set(c); this.contactsState.set('ready'); },
      error: err => {
        this.contactsState.set(err?.status === 403 ? 'access-denied' : 'error');
      },
    });
  }


  // ── Communication Prefs ─────────────────────────────────────────────
  loadPrefs(): void {
    this.prefsState.set('loading');
    this.crm.getCommunicationPreferences(this.partyId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: p => { this.prefs.set(p); this.prefsState.set('ready'); },
      error: err => {
        if (err?.status === 404) {
          this.prefs.set(null);
          this.prefsState.set('ready');
        } else {
          this.prefsState.set(err?.status === 403 ? 'access-denied' : 'error');
        }
      },
    });
  }

  startEditPrefs(): void {
    const current = this.prefs();
    this.prefsForm.setValue({
      emailEnabled:     current?.emailEnabled ?? false,
      smsEnabled:       current?.smsEnabled ?? false,
    });
    this.prefsError.set(null);
    this.prefsEdit.set('editing');
  }

  cancelEditPrefs(): void {
    this.prefsEdit.set('view');
    this.prefsError.set(null);
  }

  savePrefs(): void {
    if (this.prefsEdit() === 'saving') return;
    this.prefsEdit.set('saving');
    this.prefsError.set(null);

    const raw = this.prefsForm.getRawValue();
    this.crm.upsertCommunicationPreferences(this.partyId, {
      emailEnabled:     raw.emailEnabled,
      smsEnabled:       raw.smsEnabled,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        this.prefs.set(updated);
        this.prefsEdit.set('view');
      },
      error: err => {
        this.prefsError.set(
          err?.status === 403 ? 'Not authorized to update preferences.' :
          err?.error?.message ?? `Could not save preferences (${err?.status ?? 'error'}).`,
        );
        this.prefsEdit.set('editing');
      },
    });
  }

  back(): void { this.router.navigate(['/app/crm']); }

  navigateToContacts(): void {
    this.router.navigate(['/app/crm/party', this.partyId, 'contacts']);
  }

  navigateToBillingRules(): void {
    this.router.navigate(['/app/crm/party', this.partyId, 'billing-rules']);
  }

  roleLabel(role: ContactRole): string {
    const labels: Record<string, string> = {
      PRIMARY: 'Primary',
      PRIMARY_CONTACT: 'Primary Contact',
      BILLING: 'Billing',
      APPROVER: 'Approver',
      DRIVER: 'Driver',
      TECHNICAL: 'Technical',
    };
    return labels[role] ?? role;
  }

  get isPrefsEditing() { return this.prefsEdit() === 'editing'; }
  get isPrefsSaving()  { return this.prefsEdit() === 'saving'; }
}
