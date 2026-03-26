import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CrmService } from '../../services/crm.service';
import {
  PartyDetail,
  Contact,
  ContactRole,
  CommunicationPreferences,
} from '../../models/crm.models';

type SectionState = 'loading' | 'ready' | 'error' | 'access-denied';
type EditState    = 'view' | 'editing' | 'saving';
type ModalState   = 'closed' | 'open' | 'saving';

@Component({
  selector: 'app-party-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './party-detail.component.html',
  styleUrl: './party-detail.component.css',
})
export class PartyDetailComponent implements OnInit {
  private readonly crm    = inject(CrmService);
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb     = inject(FormBuilder);

  // ── Party ───────────────────────────────────────────────────────────────
  readonly partyState  = signal<SectionState>('loading');
  readonly party       = signal<PartyDetail | null>(null);

  // ── Contacts ─────────────────────────────────────────────────────────
  readonly contactsState    = signal<SectionState>('loading');
  readonly contacts         = signal<Contact[]>([]);
  readonly rolesModalState  = signal<ModalState>('closed');
  readonly activeContact    = signal<Contact | null>(null);
  readonly rolesError       = signal<string | null>(null);

  readonly AVAILABLE_ROLES: ContactRole[] = ['BILLING', 'APPROVER', 'DRIVER'];

  readonly rolesForm = this.fb.nonNullable.group({
    BILLING:  [false],
    APPROVER: [false],
    DRIVER:   [false],
  });

  // ── Communication Preferences ────────────────────────────────────────
  readonly prefsState  = signal<SectionState>('loading');
  readonly prefs       = signal<CommunicationPreferences | null>(null);
  readonly prefsEdit   = signal<EditState>('view');
  readonly prefsError  = signal<string | null>(null);

  readonly prefsForm = this.fb.nonNullable.group({
    emailEnabled:       [false],
    smsEnabled:         [false],
    preferredChannel:   [''],
  });

  get partyId(): string {
    return this.route.snapshot.paramMap.get('partyId') ?? '';
  }

  ngOnInit(): void {
    this.loadParty();
    this.loadContacts();
    this.loadPrefs();
  }

  // ── Load party ─────────────────────────────────────────────────────────
  loadParty(): void {
    this.partyState.set('loading');
    this.crm.getParty(this.partyId).subscribe({
      next: p => { this.party.set(p); this.partyState.set('ready'); },
      error: err => {
        this.partyState.set(err?.status === 403 ? 'access-denied' : 'error');
      },
    });
  }

  // ── Contacts ──────────────────────────────────────────────────────────
  loadContacts(): void {
    this.contactsState.set('loading');
    this.crm.getContactSummaries(this.partyId).subscribe({
      next: c => { this.contacts.set(c); this.contactsState.set('ready'); },
      error: err => {
        this.contactsState.set(err?.status === 403 ? 'access-denied' : 'error');
      },
    });
  }

  openRolesModal(contact: Contact): void {
    this.activeContact.set(contact);
    this.rolesError.set(null);
    const hasBilling  = contact.roles.includes('BILLING');
    const hasApprover = contact.roles.includes('APPROVER');
    const hasDriver   = contact.roles.includes('DRIVER');
    this.rolesForm.setValue({ BILLING: hasBilling, APPROVER: hasApprover, DRIVER: hasDriver });
    this.rolesModalState.set('open');
  }

  closeRolesModal(): void {
    this.rolesModalState.set('closed');
    this.activeContact.set(null);
    this.rolesError.set(null);
  }

  saveRoles(): void {
    const contact = this.activeContact();
    if (!contact || this.rolesModalState() === 'saving') return;

    const raw = this.rolesForm.getRawValue();
    const roles: ContactRole[] = [];
    if (raw.BILLING) roles.push('BILLING');
    if (raw.APPROVER) roles.push('APPROVER');
    if (raw.DRIVER) roles.push('DRIVER');

    this.rolesModalState.set('saving');
    this.rolesError.set(null);

    this.crm.updateContactRoles(this.partyId, contact.contactId, { roles }).subscribe({
      next: updated => {
        this.contacts.update(list =>
          list.map(c => c.contactId === updated.contactId ? updated : c),
        );
        this.closeRolesModal();
      },
      error: err => {
        this.rolesError.set(
          err?.status === 403 ? 'Not authorized to update contact roles.' :
          err?.error?.message ?? `Could not save roles (${err?.status ?? 'error'}).`,
        );
        this.rolesModalState.set('open');
      },
    });
  }

  // ── Communication Prefs ─────────────────────────────────────────────
  loadPrefs(): void {
    this.prefsState.set('loading');
    this.crm.getCommunicationPreferences(this.partyId).subscribe({
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
      preferredChannel: current?.preferredChannel ?? '',
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
      preferredChannel: raw.preferredChannel || undefined,
    }).subscribe({
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
    const labels: Record<string, string> = { BILLING: 'Billing', APPROVER: 'Approver', DRIVER: 'Driver' };
    return labels[role] ?? role;
  }

  get isRolesModalOpen()   { return this.rolesModalState() !== 'closed'; }
  get isRolesModalSaving() { return this.rolesModalState() === 'saving'; }
  get isPrefsEditing()     { return this.prefsEdit() === 'editing'; }
  get isPrefsSaving()      { return this.prefsEdit() === 'saving'; }
}
