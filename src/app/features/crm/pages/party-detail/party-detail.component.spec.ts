import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { PartyDetailComponent } from './party-detail.component';
import { CrmService } from '../../services/crm.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CRM_SECTION } from '../../../../core/security/route-permissions';

const PARTY_ID = '01960020-0000-7000-8000-00000000002b';

const CONTACTS_PERMISSION = CRM_SECTION.partyContacts[0];
const PREFS_PERMISSION = CRM_SECTION.communicationPreferences[0];

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
    contactsResult?: Observable<unknown>;
    prefsResult?: Observable<unknown>;
  };

  const setup = async (permissions: string[] | null = null, options: SetupOptions = {}) => {
    session.permissions = permissions;
    crmServiceStub.getParty.mockReturnValue(of({ partyId: PARTY_ID, legalName: 'Albert Rogers' }));
    crmServiceStub.getContactsWithRoles.mockReturnValue(options.contactsResult ?? of([]));
    crmServiceStub.getCommunicationPreferences.mockReturnValue(options.prefsResult ?? of(null));

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
});
