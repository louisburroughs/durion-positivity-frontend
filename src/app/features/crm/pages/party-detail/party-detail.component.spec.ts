import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PartyDetailComponent } from './party-detail.component';
import { CrmService } from '../../services/crm.service';
import { PartyDetail, PersonDetail } from '../../models/crm.models';
import { AuthService } from '../../../../core/services/auth.service';
import { CRM_SECTION } from '../../../../core/security/route-permissions';

const PARTY_ID = '01960020-0000-7000-8000-00000000002b';

const CONTACTS_PERMISSION = CRM_SECTION.partyContacts[0];
const PREFS_PERMISSION = CRM_SECTION.communicationPreferences[0];
const PERSON_PERMISSION = CRM_SECTION.person[0];
const PERSON_ID = '01960020-0000-7000-8000-0000000000aa';

/**
 * `permissions: null` models a token with no `perm_bits` claim — permissions
 * unknown, which is not the same as a token that grants none.
 */
const session: { permissions: string[] | null } = { permissions: null };

const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasPermission: (permission: string) => session.permissions?.includes(permission) ?? false,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(permission => session.permissions?.includes(permission) ?? false),
};

const crmServiceStub = {
  getParty: vi.fn(),
  getContactsWithRoles: vi.fn(),
  getCommunicationPreferences: vi.fn(),
  getPerson: vi.fn(),
  fetchByParty: vi.fn(),
};

const routerStub = {
  // Nav state captured at construction; overridden per test.
  getCurrentNavigation: vi.fn().mockReturnValue(null),
  navigate: vi.fn(),
};

describe('PartyDetailComponent', () => {
  let fixture: ComponentFixture<PartyDetailComponent>;

  type SetupOptions = {
    partyResult?: Observable<PartyDetail>;
    contactsResult?: Observable<unknown>;
    prefsResult?: Observable<unknown>;
    personResult?: Observable<PersonDetail>;
  };

  const setup = async (permissions: string[] | null = null, options: SetupOptions = {}) => {
    session.permissions = permissions;
    crmServiceStub.getParty.mockReturnValue(options.partyResult ?? of({ partyId: PARTY_ID, legalName: 'Albert Rogers' }));
    crmServiceStub.getContactsWithRoles.mockReturnValue(options.contactsResult ?? of([]));
    crmServiceStub.getCommunicationPreferences.mockReturnValue(options.prefsResult ?? of(null));
    crmServiceStub.getPerson.mockReturnValue(options.personResult ?? of(null));

    await TestBed.configureTestingModule({
      imports: [PartyDetailComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CrmService, useValue: crmServiceStub },
        { provide: AuthService, useValue: authStub },
        { provide: Router, useValue: routerStub },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ partyId: PARTY_ID }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PartyDetailComponent);
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    routerStub.getCurrentNavigation.mockReturnValue(null);
    session.permissions = null;
    TestBed.resetTestingModule();
  });

  it('shows the customer number carried via router state without fetching the snapshot', async () => {
    routerStub.getCurrentNavigation.mockReturnValue({ extras: { state: { customerNumber: 'CUST-PP-043' } } });
    await setup();

    expect(crmServiceStub.fetchByParty).not.toHaveBeenCalled();
    const cell = fixture.debugElement.query(By.css('[data-testid="customer-number"]'));
    expect(cell.nativeElement.textContent.trim()).toBe('CUST-PP-043');
  });

  it('falls back to the snapshot account number on direct navigation', async () => {
    crmServiceStub.fetchByParty.mockReturnValue(of({ account: { accountNumber: 'CUST-PP-099' } }));
    await setup();

    expect(crmServiceStub.fetchByParty).toHaveBeenCalledWith(PARTY_ID);
    const cell = fixture.debugElement.query(By.css('[data-testid="customer-number"]'));
    expect(cell.nativeElement.textContent.trim()).toBe('CUST-PP-099');
  });

  it('never renders the raw partyId UUID, and hides the row when no number resolves', async () => {
    crmServiceStub.fetchByParty.mockReturnValue(throwError(() => new Error('no snapshot')));
    await setup();

    expect(fixture.debugElement.query(By.css('[data-testid="customer-number"]'))).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(PARTY_ID);
  });

  // ── Permission-gated sections (issue #255) ───────────────────────────────
  // The page gate is only `crm:party:view`, so a permitted visitor can lack the
  // narrower authority these two panels read. Firing anyway yields a 403 that
  // the site audit counts as a failed API request and the browser logs to the
  // console, so the request must not be sent at all.

  it('requests both sections when the session holds their permissions', async () => {
    await setup([CONTACTS_PERMISSION, PREFS_PERMISSION]);

    expect(crmServiceStub.getContactsWithRoles).toHaveBeenCalledWith(PARTY_ID);
    expect(crmServiceStub.getCommunicationPreferences).toHaveBeenCalledWith(PARTY_ID);
  });

  it('skips the contacts request when the session lacks its permission', async () => {
    await setup([PREFS_PERMISSION]);

    expect(crmServiceStub.getContactsWithRoles).not.toHaveBeenCalled();
    expect(fixture.componentInstance.contactsState()).toBe('access-denied');
    // The other section is unaffected.
    expect(crmServiceStub.getCommunicationPreferences).toHaveBeenCalledWith(PARTY_ID);
  });

  it('skips the preferences request when the session lacks its permission', async () => {
    await setup([CONTACTS_PERMISSION]);

    expect(crmServiceStub.getCommunicationPreferences).not.toHaveBeenCalled();
    expect(fixture.componentInstance.prefsState()).toBe('access-denied');
    expect(crmServiceStub.getContactsWithRoles).toHaveBeenCalledWith(PARTY_ID);
  });

  it('skips both requests for a persona holding neither permission', async () => {
    await setup([]);

    expect(crmServiceStub.getContactsWithRoles).not.toHaveBeenCalled();
    expect(crmServiceStub.getCommunicationPreferences).not.toHaveBeenCalled();
    expect(fixture.componentInstance.contactsState()).toBe('access-denied');
    expect(fixture.componentInstance.prefsState()).toBe('access-denied');
  });

  it('shows each denied section as a handled state, not an error', async () => {
    await setup([]);

    expect(fixture.debugElement.query(By.css('[data-testid="contacts-error"]'))).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('CRM.PARTY_DETAIL.CONTACTS_FORBIDDEN');
    expect(fixture.nativeElement.textContent).toContain('CRM.PARTY_DETAIL.PREFS_FORBIDDEN');
  });

  it('still requests both sections when the token carries no permission claim', async () => {
    // Permissions unknown must stay open, matching `canAccess()`.
    await setup(null);

    expect(crmServiceStub.getContactsWithRoles).toHaveBeenCalledWith(PARTY_ID);
    expect(crmServiceStub.getCommunicationPreferences).toHaveBeenCalledWith(PARTY_ID);
  });

  it('still handles a 403 reactively when the permission check passed', async () => {
    // Backstop for a section permission we mapped wrongly: the page must degrade
    // to the denied state rather than an error.
    await setup([CONTACTS_PERMISSION, PREFS_PERMISSION], {
      contactsResult: throwError(() => ({ status: 403 })),
      prefsResult: throwError(() => ({ status: 403 })),
    });

    expect(fixture.componentInstance.contactsState()).toBe('access-denied');
    expect(fixture.componentInstance.prefsState()).toBe('access-denied');
  });

  describe('by party type', () => {
    const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;
    const commercial: PartyDetail = { partyId: PARTY_ID, partyType: 'COMMERCIAL', legalName: 'Acme Fleet', dba: 'Acme', taxId: '12-3456789' };
    const person: PartyDetail = { partyId: PARTY_ID, partyType: 'PERSON', legalName: 'Albert Rogers', dba: 'stale', taxId: 'stale' };

    it('shows the commercial account layout: badge, DBA, tax id, billing rules and contacts', async () => {
      await setup(null, { partyResult: of(commercial) });

      expect(q('[data-testid="party-type"]')?.dataset['type']).toBe('COMMERCIAL');
      expect(q('.party-dba')).not.toBeNull();
      expect(q('.party-meta')?.textContent).toContain('12-3456789');
      expect(q('.party-header-actions')).not.toBeNull();
      expect(q('[data-testid="contacts-section"]')).not.toBeNull();
      expect(crmServiceStub.getContactsWithRoles).toHaveBeenCalledWith(PARTY_ID);
    });

    it('drops the commercial-only panels for an individual and never requests contacts', async () => {
      await setup(null, { partyResult: of(person) });

      expect(q('[data-testid="party-type"]')?.dataset['type']).toBe('PERSON');
      expect(q('#party-heading')?.textContent).toContain('Albert Rogers');
      expect(q('.party-dba')).toBeNull();
      expect(q('.party-meta')?.textContent).not.toContain('stale');
      expect(q('.party-header-actions')).toBeNull();
      expect(q('[data-testid="contacts-section"]')).toBeNull();
      expect(crmServiceStub.getContactsWithRoles).not.toHaveBeenCalled();
      // Communication preferences apply to both party types.
      expect(crmServiceStub.getCommunicationPreferences).toHaveBeenCalledWith(PARTY_ID);
    });

    it('keeps the commercial layout when the party type is absent', async () => {
      await setup(null);

      expect(q('[data-testid="party-type"]')?.dataset['type']).toBe('COMMERCIAL');
      expect(crmServiceStub.getContactsWithRoles).toHaveBeenCalledWith(PARTY_ID);
    });

    it('holds the contacts request until the party read resolves as commercial', async () => {
      const party$ = new Subject<PartyDetail>();
      await setup(null, { partyResult: party$ });

      // Party read still in flight: the type is unknown, so contacts must not go out yet.
      expect(crmServiceStub.getContactsWithRoles).not.toHaveBeenCalled();
      expect(q('[data-testid="contacts-section"]')).toBeNull();

      party$.next(commercial);
      fixture.detectChanges();

      expect(crmServiceStub.getContactsWithRoles).toHaveBeenCalledTimes(1);
      expect(q('[data-testid="contacts-section"]')).not.toBeNull();
    });

    it('skips contacts when the party read fails', async () => {
      await setup(null, { partyResult: throwError(() => ({ status: 500 })) });

      expect(crmServiceStub.getContactsWithRoles).not.toHaveBeenCalled();
      expect(q('[data-testid="contacts-section"]')).toBeNull();
    });
  });

  describe('personal details panel', () => {
    const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;
    const individual: PartyDetail = { partyId: PARTY_ID, partyType: 'PERSON', personId: PERSON_ID, legalName: 'Pat Person' };
    const pat: PersonDetail = {
      personId: PERSON_ID,
      firstName: 'Pat',
      lastName: 'Person',
      preferredContactMethod: 'SMS',
      contactPoints: [
        { contactPointId: 'cp-1', contactType: 'EMAIL', value: 'pat@example.com', primary: true },
        { contactPointId: 'cp-2', contactType: 'PHONE_MOBILE', value: '+1-555-0100' },
      ],
    };

    it('loads the person by personId once the party resolves, and renders names and contact points', async () => {
      const party$ = new Subject<PartyDetail>();
      await setup(null, { partyResult: party$, personResult: of(pat) });

      // Party read in flight: the personId is not known yet.
      expect(crmServiceStub.getPerson).not.toHaveBeenCalled();

      party$.next(individual);
      fixture.detectChanges();

      expect(crmServiceStub.getPerson).toHaveBeenCalledExactlyOnceWith(PERSON_ID);
      expect(q('[data-testid="person-first-name"]')?.textContent?.trim()).toBe('Pat');
      expect(q('[data-testid="person-last-name"]')?.textContent?.trim()).toBe('Person');
      expect(q('[data-testid="person-preferred-contact"]')?.textContent?.trim())
        .toBe('CRM.PARTY_DETAIL.PERSON.METHOD.SMS');
      const points = Array.from(q('[data-testid="person-contact-points"]')?.querySelectorAll('li') ?? []);
      expect(points.map(li => li.querySelector('.contact-point__value')?.textContent?.trim()))
        .toEqual(['pat@example.com', '+1-555-0100']);
      expect(points[0].querySelector('.role-badge')).not.toBeNull();
      expect(points[1].querySelector('.role-badge')).toBeNull();
    });

    it('never requests a person for a commercial account', async () => {
      await setup(null, { partyResult: of({ partyId: PARTY_ID, partyType: 'COMMERCIAL', legalName: 'Acme Fleet' }) });

      expect(crmServiceStub.getPerson).not.toHaveBeenCalled();
      expect(q('[data-testid="person-section"]')).toBeNull();
    });

    it('shows an unavailable hint without a request when the party carries no personId', async () => {
      await setup(null, { partyResult: of({ ...individual, personId: undefined }) });

      expect(crmServiceStub.getPerson).not.toHaveBeenCalled();
      expect(q('[data-testid="person-section"]')?.textContent).toContain('CRM.PARTY_DETAIL.PERSON.UNAVAILABLE');
    });

    it('skips the request and shows the denied state without crm:person:read', async () => {
      await setup([CONTACTS_PERMISSION, PREFS_PERMISSION], { partyResult: of(individual) });

      expect(crmServiceStub.getPerson).not.toHaveBeenCalled();
      expect(fixture.componentInstance.personState()).toBe('access-denied');
    });

    it('requests the person when the session holds crm:person:read', async () => {
      await setup([PERSON_PERMISSION], { partyResult: of(individual), personResult: of(pat) });

      expect(crmServiceStub.getPerson).toHaveBeenCalledWith(PERSON_ID);
    });

    it('offers a retry when the person read fails', async () => {
      await setup(null, { partyResult: of(individual), personResult: throwError(() => ({ status: 500 })) });

      expect(fixture.componentInstance.personState()).toBe('error');
      crmServiceStub.getPerson.mockReturnValue(of(pat));
      (q('[data-testid="person-section"] .inline-error button') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(crmServiceStub.getPerson).toHaveBeenCalledTimes(2);
      expect(q('[data-testid="person-first-name"]')?.textContent?.trim()).toBe('Pat');
    });

    it('falls back to the raw value for an unrecognized contact type or method', async () => {
      await setup(null, { partyResult: of(individual), personResult: of({
        ...pat,
        preferredContactMethod: 'PIGEON' as PersonDetail['preferredContactMethod'],
        contactPoints: [{ contactPointId: 'cp-9', contactType: 'TELEX' as 'EMAIL', value: 'x' }],
      }) });

      expect(q('[data-testid="person-preferred-contact"]')?.textContent?.trim()).toBe('PIGEON');
      expect(q('.contact-point__type')?.textContent?.trim()).toBe('TELEX');
    });
  });
});
