import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { PartyContactsComponent } from './party-contacts.component';
import { CrmService } from '../../services/crm.service';
import { PartyDetail, Relationship } from '../../models/crm.models';

// ── Fixtures (ADR-0032: typed, no `any`) ────────────────────────────────────

const partyFixture: PartyDetail = {
  partyId: 'party-001',
  legalName: 'Acme Fleet Services',
};

const relationshipFixture: Relationship = {
  relationshipId: 'rel-001',
  personId: 'person-001',
  personName: 'Jamie Rivera',
  role: 'BILLING',
  effectiveFrom: '2025-01-01',
  status: 'ACTIVE',
};

// ── Stubs ────────────────────────────────────────────────────────────────────

const stubCrmService = {
  getParty: vi.fn(),
  getContactsWithRoles: vi.fn(),
  deactivateRelationship: vi.fn(),
  searchPersons: vi.fn(),
  createRelationship: vi.fn(),
  designatePrimaryBillingContact: vi.fn(),
};

const PARTY_ROUTE = {
  snapshot: {
    paramMap: { get: (k: string) => (k === 'partyId' ? 'party-001' : null) },
  },
};

async function setup(): Promise<ComponentFixture<PartyContactsComponent>> {
  await TestBed.configureTestingModule({
    imports: [PartyContactsComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: CrmService, useValue: stubCrmService },
      { provide: ActivatedRoute, useValue: PARTY_ROUTE },
    ],
  }).compileComponents();

  TestBed.inject(TranslateService).use('en-US');

  return TestBed.createComponent(PartyContactsComponent);
}

describe('PartyContactsComponent [#344]', () => {
  beforeEach(() => {
    stubCrmService.getParty.mockReturnValue(of(partyFixture));
    stubCrmService.getContactsWithRoles.mockReturnValue(of([relationshipFixture]));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // ── #344: deactivate() used to stamp effectiveThru with
  // `new Date().toISOString().slice(0, 10)` — the UTC date, which for evening
  // local hours in any UTC-N zone is tomorrow (ADR-0038 §1). Frozen so the
  // expectation cannot straddle local midnight; under a UTC CI clock this
  // alone can't tell local getters from toISOString() — the enforcing test
  // lives in core/utils/local-date.spec.ts.

  it('stamps effectiveThru with the local calendar date, not the UTC date, on deactivate', async () => {
    stubCrmService.deactivateRelationship.mockReturnValue(of(undefined));

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5, 23, 30, 0)); // 23:30 local, 5 Sep 2026
    try {
      const fixture = await setup();
      fixture.detectChanges();

      fixture.componentInstance.deactivate(relationshipFixture);

      const updated = fixture.componentInstance
        .relationships()
        .find(r => r.relationshipId === relationshipFixture.relationshipId);
      expect(updated?.effectiveThru).toBe('2026-09-05');
      expect(updated?.status).toBe('INACTIVE');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the pending row and toasts success after deactivate resolves', async () => {
    stubCrmService.deactivateRelationship.mockReturnValue(of(undefined));

    const fixture = await setup();
    fixture.detectChanges();

    fixture.componentInstance.deactivate(relationshipFixture);

    expect(fixture.componentInstance.pendingRowId()).toBeNull();
    expect(fixture.componentInstance.toast()?.type).toBe('success');
  });

  // ADR-0029 §8.1: converting the hand-rolled `.modal-backdrop` div to a
  // native `dialog[appModalDialog]` (2db523b) dropped its backdrop-click
  // dismissal, since a native dialog does not close on backdrop click by
  // itself. `[closeOnBackdrop]="true"` on ModalDialogDirective restores it.
  describe('add-contact modal backdrop dismissal (ADR-0029 §8.1)', () => {
    it('closes the modal on a click that lands on the dialog element itself (backdrop)', async () => {
      const fixture = await setup();
      fixture.detectChanges();

      fixture.componentInstance.openModal();
      fixture.detectChanges();

      const dialog = fixture.nativeElement.querySelector('dialog.modal') as HTMLDialogElement;
      expect(dialog).toBeTruthy();

      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();

      expect(fixture.componentInstance.modalState()).toBe('closed');
    });

    it('does not close the modal on a click inside the panel content', async () => {
      const fixture = await setup();
      fixture.detectChanges();

      fixture.componentInstance.openModal();
      fixture.detectChanges();

      const heading = fixture.nativeElement.querySelector('#modal-heading') as HTMLElement;
      expect(heading).toBeTruthy();

      heading.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();

      expect(fixture.componentInstance.modalState()).toBe('open');
    });
  });
});
