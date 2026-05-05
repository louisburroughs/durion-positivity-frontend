import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { RoleAssignmentPageComponent } from './role-assignment-page.component';
import { RoleDto, UserRoleDto } from '@durion-sdk/people';
import { PeopleService } from '../../services/people.service';

const translations = {
  PEOPLE: {
    ROLE_ASSIGNMENT: {
      ARIA: { LAYOUT: 'Role assignment layout' },
      ASSIGNED_ROLES: 'Assigned roles',
      INCLUDE_HISTORY: 'Include history',
      SCOPE_GLOBAL: 'Global',
      SCOPE_LOCATION: 'Location',
      STATUS: 'Status',
      REVOKE: 'Revoke',
      CONFIRM_REVOKE: 'Confirm revoke',
      LOADING: 'Loading assignments...',
      TITLE: 'Assign role',
      DETAILS: 'Assignment details',
      ROLE: 'Role',
      SELECT_ROLE: 'Select a role',
      SCOPE_TYPE: 'Scope type',
      LOCATION_ID: 'Location ID',
      EFFECTIVE_START: 'Effective start',
      EFFECTIVE_END: 'Effective end',
      SUBMIT: 'Assign role',
      ERROR: {
        LOAD_ASSIGNMENTS: 'Could not load assignments.',
        LOAD_ROLES: 'Could not load roles.',
        ASSIGN: 'Could not assign role.',
        REVOKE: 'Could not revoke role.',
      },
    },
  },
  COMMON: {
    CANCEL: 'Cancel',
  },
  STATUS: {
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
  },
};

const STUB_ASSIGNMENTS: UserRoleDto[] = [
  {
    userId: 'p-1',
    roleCode: 'ROLE_ADMIN',
    startDate: '2026-01-01',
    active: true,
  },
  {
    userId: 'p-1',
    roleCode: 'ROLE_MANAGER',
    locationId: 'loc-5',
    startDate: '2026-02-01',
    active: true,
  },
];

const STUB_ROLES: RoleDto[] = [
  { code: 'ROLE_ADMIN', name: 'Admin' },
  { code: 'ROLE_MANAGER', name: 'Manager' },
  { code: 'ROLE_VIEW', name: 'View Only' },
];

const stubPeopleService = {
  getAvailableRoles: vi.fn(),
  getRoleAssignments: vi.fn(),
  createRoleAssignment: vi.fn(),
  revokeRoleAssignment: vi.fn(),
};

describe('RoleAssignmentPageComponent [Story #153]', () => {
  let fixture: ComponentFixture<RoleAssignmentPageComponent>;
  let component: RoleAssignmentPageComponent;

  const setup = async (personUuid = 'person-uuid-1') => {
    vi.clearAllMocks();
    stubPeopleService.getRoleAssignments.mockReturnValue(of(STUB_ASSIGNMENTS));
    stubPeopleService.getAvailableRoles.mockReturnValue(of(STUB_ROLES));
    stubPeopleService.createRoleAssignment.mockReturnValue(of({ assignmentId: 'asn-new' }));
    stubPeopleService.revokeRoleAssignment.mockReturnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [RoleAssignmentPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: stubPeopleService },
        { provide: ActivatedRoute, useValue: { params: of({ personUuid }) } },
      ],
    }).compileComponents();

    const translateService = TestBed.inject(TranslateService);
    translateService.setTranslation('en-US', translations);
    translateService.use('en-US');

    fixture = TestBed.createComponent(RoleAssignmentPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // ── T1: Basic render ─────────────────────────────────────────────────────

  it('renders without crashing', async () => {
    await setup();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('renders translated headings, labels, and primary action text', async () => {
    await setup();

    const headingEls = fixture.nativeElement.querySelectorAll('h2');
    const roleLabel = fixture.nativeElement.querySelector('label[for="role-select"]');
    const scopeLabel = fixture.nativeElement.querySelector('label[for="scope-type"]');
    const submitButton = fixture.nativeElement.querySelector('[data-testid="submit-assignment-btn"]');

    expect(headingEls[0]?.textContent).toContain('Assigned roles');
    expect(headingEls[1]?.textContent).toContain('Assign role');
    expect(roleLabel?.textContent).toContain('Role');
    expect(scopeLabel?.textContent).toContain('Scope type');
    expect(submitButton?.textContent).toContain('Assign role');
  });

  // ── T2: Initialization ────────────────────────────────────────────────────

  it('calls getAssignments on init with personUuid from route and includeHistory=false', async () => {
    await setup('person-uuid-1');
    expect(stubPeopleService.getRoleAssignments).toHaveBeenCalledWith('person-uuid-1', false);
  });

  it('calls getRoles on init with personUuid from route', async () => {
    await setup('person-uuid-1');
    expect(stubPeopleService.getAvailableRoles).toHaveBeenCalledWith('person-uuid-1');
  });

  const c = (cmp: RoleAssignmentPageComponent) => cmp;

  // ── T3: Assignment list rendering ─────────────────────────────────────────

  it('renders .assignment-list', async () => {
    await setup();
    const list = fixture.debugElement.query(By.css('.assignment-list'));
    expect(list).toBeTruthy();
  });

  it('renders one .assignment-item per stub assignment', async () => {
    await setup();
    const rows = fixture.debugElement.queryAll(By.css('.assignment-item'));
    expect(rows.length).toBe(STUB_ASSIGNMENTS.length);
  });

  // ── T4: Location picker visibility ───────────────────────────────────────

  it('hides .location-picker when scopeType is GLOBAL', async () => {
    await setup();
    c(component).scopeType.set('GLOBAL');
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.css('.location-picker'));
    expect(picker).toBeNull();
  });

  it('shows .location-picker when scopeType is LOCATION', async () => {
    await setup();
    c(component).scopeType.set('LOCATION');
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.css('.location-picker'));
    expect(picker).toBeTruthy();
  });

  // ── T5: Submit disabled when required fields are missing ──────────────────

  it('submit button is disabled when effectiveStartAt is empty', async () => {
    await setup();
    c(component).effectiveStartAt.set('');
    c(component).selectedRoleCode.set('ROLE_ADMIN');
    c(component).scopeType.set('GLOBAL');
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('[data-testid="submit-assignment-btn"]'));
    expect(btn.nativeElement.disabled).toBe(true);
  });

  it('submit button is disabled when selectedRoleCode is empty', async () => {
    await setup();
    c(component).effectiveStartAt.set('2026-01-01T00:00:00Z');
    c(component).selectedRoleCode.set('');
    c(component).scopeType.set('GLOBAL');
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('[data-testid="submit-assignment-btn"]'));
    expect(btn.nativeElement.disabled).toBe(true);
  });

  it('submit button is disabled when scopeType=LOCATION and locationId is empty', async () => {
    await setup();
    c(component).effectiveStartAt.set('2026-01-01T00:00:00Z');
    c(component).selectedRoleCode.set('ROLE_ADMIN');
    c(component).scopeType.set('LOCATION');
    c(component).locationId.set('');
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('[data-testid="submit-assignment-btn"]'));
    expect(btn.nativeElement.disabled).toBe(true);
  });

  it('submit button is enabled when all required GLOBAL fields are present', async () => {
    await setup();
    c(component).effectiveStartAt.set('2026-06-01T00:00:00Z');
    c(component).selectedRoleCode.set('ROLE_ADMIN');
    c(component).scopeType.set('GLOBAL');
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('[data-testid="submit-assignment-btn"]'));
    expect(btn.nativeElement.disabled).toBe(false);
  });

  it('submit button is enabled when all required LOCATION fields are present', async () => {
    await setup();
    c(component).effectiveStartAt.set('2026-06-01T00:00:00Z');
    c(component).selectedRoleCode.set('ROLE_ADMIN');
    c(component).scopeType.set('LOCATION');
    c(component).locationId.set('loc-10');
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('[data-testid="submit-assignment-btn"]'));
    expect(btn.nativeElement.disabled).toBe(false);
  });

  // ── T6: createAssignment called on submit ─────────────────────────────────

  it('calls service.createAssignment with GLOBAL payload on submit (no locationId)', async () => {
    await setup('person-uuid-1');
    c(component).selectedRoleCode.set('ROLE_ADMIN');
    c(component).scopeType.set('GLOBAL');
    c(component).locationId.set('loc-ignored');
    c(component).effectiveStartAt.set('2026-06-01T00:00:00Z');

    c(component).submitAssignment();

    const [uuid, payload] = stubPeopleService.createRoleAssignment.mock.calls[0];
    expect(uuid).toBe('person-uuid-1');
    expect(payload).toEqual({
      roleCode: 'ROLE_ADMIN',
      startDate: '2026-06-01T00:00:00Z',
    });
    expect(payload).not.toHaveProperty('locationId');
  });

  it('calls service.createAssignment with LOCATION payload including locationId', async () => {
    await setup('person-uuid-1');
    c(component).selectedRoleCode.set('ROLE_MANAGER');
    c(component).scopeType.set('LOCATION');
    c(component).locationId.set('loc-77');
    c(component).effectiveStartAt.set('2026-06-01T00:00:00Z');

    c(component).submitAssignment();

    expect(stubPeopleService.createRoleAssignment).toHaveBeenCalledWith(
      'person-uuid-1',
      expect.objectContaining({
        roleCode: 'ROLE_MANAGER',
        locationId: 'loc-77',
        startDate: '2026-06-01T00:00:00Z',
      }),
    );
  });

  it('includes effectiveEndAt in payload when it is set', async () => {
    await setup('person-uuid-1');
    c(component).selectedRoleCode.set('ROLE_VIEW');
    c(component).scopeType.set('GLOBAL');
    c(component).effectiveStartAt.set('2026-01-01T00:00:00Z');
    c(component).effectiveEndAt.set('2026-12-31T23:59:59Z');

    c(component).submitAssignment();

    const [, payload] = stubPeopleService.createRoleAssignment.mock.calls[0];
    expect(payload.endDate).toBe('2026-12-31T23:59:59Z');
  });

  it('omits effectiveEndAt from payload when it is empty', async () => {
    await setup('person-uuid-1');
    c(component).selectedRoleCode.set('ROLE_VIEW');
    c(component).scopeType.set('GLOBAL');
    c(component).effectiveStartAt.set('2026-01-01T00:00:00Z');
    c(component).effectiveEndAt.set('');

    c(component).submitAssignment();

    const [, payload] = stubPeopleService.createRoleAssignment.mock.calls[0];
    expect(payload).not.toHaveProperty('effectiveEndAt');
    expect(payload).not.toHaveProperty('endDate');
  });

  // ── T7: revokeAssignment called on revoke ─────────────────────────────────

  it('calls service.revokeAssignment with personUuid and roleCode from the assignment', async () => {
    await setup('person-uuid-1');
    c(component).revokeAssignment(STUB_ASSIGNMENTS[0]);
    expect(stubPeopleService.revokeRoleAssignment).toHaveBeenCalledWith('person-uuid-1', 'ROLE_ADMIN');
  });

  it('re-fetches assignments after successful revoke', async () => {
    await setup('person-uuid-1');
    const callsBefore = stubPeopleService.getRoleAssignments.mock.calls.length;

    c(component).revokeAssignment(STUB_ASSIGNMENTS[0]);

    expect(stubPeopleService.getRoleAssignments.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('renders duplicate roleCode rows across scopes and targets revoke confirmation by stable row key', async () => {
    const duplicateAssignments: UserRoleDto[] = [
      {
        userId: 'p-1',
        roleCode: 'ROLE_MANAGER',
        startDate: '2026-03-01',
        active: true,
      },
      {
        userId: 'p-1',
        roleCode: 'ROLE_MANAGER',
        locationId: 'loc-5',
        startDate: '2026-03-01',
        active: true,
      },
    ];

    await setup('person-uuid-1');
    stubPeopleService.getRoleAssignments.mockReturnValue(of(duplicateAssignments));
    c(component).loadAssignments();
    fixture.detectChanges();

    const rowsBefore = Array.from(fixture.nativeElement.querySelectorAll('.assignment-item')) as HTMLElement[];
    expect(rowsBefore).toHaveLength(2);
    expect(rowsBefore[0].textContent).toContain('Global');
    expect(rowsBefore[1].textContent).toContain('loc-5');

    const revokeButtons = fixture.nativeElement.querySelectorAll('.assignment-item .btn--danger-outline');
    revokeButtons[1].click();
    fixture.detectChanges();

    const rowsAfter = Array.from(fixture.nativeElement.querySelectorAll('.assignment-item')) as HTMLElement[];
    expect(rowsAfter[0].textContent).toContain('Revoke');
    expect(rowsAfter[0].textContent).not.toContain('Confirm revoke');
    expect(rowsAfter[1].textContent).toContain('Confirm revoke');
    expect(rowsAfter[1].textContent).toContain('Cancel');
    expect(component.confirmingAssignmentId()).toBe(component.getAssignmentKey(duplicateAssignments[1]));
  });

  // ── T8: include-history toggle ────────────────────────────────────────────

  it('re-fetches assignments with includeHistory=true when loadAssignments() called with flag set', async () => {
    await setup('person-uuid-1');
    stubPeopleService.getRoleAssignments.mockReturnValue(of([]));
    c(component).includeHistory.set(true);
    c(component).loadAssignments();
    expect(stubPeopleService.getRoleAssignments).toHaveBeenCalledWith('person-uuid-1', true);
  });

  it('re-fetches assignments with includeHistory=false when flag is cleared', async () => {
    await setup('person-uuid-1');
    stubPeopleService.getRoleAssignments.mockReturnValue(of([]));
    c(component).includeHistory.set(false);
    c(component).loadAssignments();
    expect(stubPeopleService.getRoleAssignments).toHaveBeenCalledWith('person-uuid-1', false);
  });

  // ── T9: Error paths and confirmingAssignmentId ────────────────────────────

  it('startRevoke() sets confirmingAssignmentId to the stable assignment key', async () => {
    await setup();
    c(component).startRevoke(STUB_ASSIGNMENTS[1]);
    expect(c(component).confirmingAssignmentId()).toBe(c(component).getAssignmentKey(STUB_ASSIGNMENTS[1]));
  });

  it('revokeAssignment() resets confirmingAssignmentId to null on success', async () => {
    await setup();
    c(component).confirmingAssignmentId.set(c(component).getAssignmentKey(STUB_ASSIGNMENTS[0]));
    c(component).revokeAssignment(STUB_ASSIGNMENTS[0]);
    expect(c(component).confirmingAssignmentId()).toBeNull();
  });

  it('renders translated loading and error states', async () => {
    await setup();

    c(component).loading.set(true);
    c(component).errorMessage.set('PEOPLE.ROLE_ASSIGNMENT.ERROR.LOAD_ASSIGNMENTS');
    fixture.detectChanges();

    const errorEl = fixture.nativeElement.querySelector('.alert--error');
    const loadingEl = fixture.nativeElement.querySelector('.loading-state');

    expect(errorEl?.textContent).toContain('Could not load assignments.');
    expect(loadingEl?.textContent).toContain('Loading assignments...');
  });

  it('loadRoles() failure sets errorMessage to a non-null string', async () => {
    await setup();
    stubPeopleService.getAvailableRoles.mockReturnValue(throwError(() => new Error('server error')));
    c(component).errorMessage.set(null);
    c(component).loadRoles();
    expect(c(component).errorMessage()).not.toBeNull();
    expect(typeof c(component).errorMessage()).toBe('string');
  });

  it('submitAssignment() failure sets errorMessage to a non-null string', async () => {
    await setup();
    stubPeopleService.createRoleAssignment.mockReturnValue(throwError(() => new Error('network error')));
    c(component).selectedRoleCode.set('ROLE_ADMIN');
    c(component).scopeType.set('GLOBAL');
    c(component).effectiveStartAt.set('2026-06-01T00:00:00Z');
    c(component).errorMessage.set(null);
    c(component).submitAssignment();
    expect(c(component).errorMessage()).not.toBeNull();
  });

  it('revokeAssignment() failure sets errorMessage to a non-null string', async () => {
    await setup();
    stubPeopleService.revokeRoleAssignment.mockReturnValue(throwError(() => new Error('revoke failed')));
    c(component).errorMessage.set(null);
    c(component).revokeAssignment(STUB_ASSIGNMENTS[0]);
    expect(c(component).errorMessage()).not.toBeNull();
  });
});
