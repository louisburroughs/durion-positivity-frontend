import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';

// RED: This import will fail at compile time because the file does not exist yet.
// Expected error: Cannot find module './role-assignment-page.component'
import { RoleAssignmentPageComponent } from './role-assignment-page.component';
import { PeopleService } from '../../services/people.service';

// ── Story #153: RBAC Role & Scope Assignment — Component ─────────────────────
//
// RED failure sources:
//   1. Module './role-assignment-page.component' does not exist → compile error
//   2. All signal properties (scopeType, locationId, selectedRoleCode,
//      effectiveStartAt, includeHistory) don't exist on the component instance
//   3. Methods submitAssignment(), revokeAssignment(), loadAssignments() are absent
//   4. Expected DOM selectors (.assignment-list, .assignment-item, .location-picker,
//      [data-testid="submit-assignment-btn"]) will not be present

const STUB_ASSIGNMENTS = [
  {
    assignmentId: 'asn-1',
    personId: 'p-1',
    roleCode: 'ROLE_ADMIN',
    scopeType: 'GLOBAL',
    effectiveStartAt: '2026-01-01T00:00:00Z',
  },
  {
    assignmentId: 'asn-2',
    personId: 'p-1',
    roleCode: 'ROLE_MANAGER',
    scopeType: 'LOCATION',
    locationId: 'loc-5',
    effectiveStartAt: '2026-02-01T00:00:00Z',
  },
];

const STUB_ROLES = [
  { code: 'ROLE_ADMIN', label: 'Admin' },
  { code: 'ROLE_MANAGER', label: 'Manager' },
  { code: 'ROLE_VIEW', label: 'View Only' },
];

const stubPeopleService = {
  getRoles: vi.fn(),
  getAssignments: vi.fn(),
  createAssignment: vi.fn(),
  revokeAssignment: vi.fn(),
};

describe('RoleAssignmentPageComponent [Story #153]', () => {
  let fixture: ComponentFixture<RoleAssignmentPageComponent>;
  let component: RoleAssignmentPageComponent;

  const setup = async (personUuid = 'person-uuid-1') => {
    vi.clearAllMocks();
    stubPeopleService.getAssignments.mockReturnValue(of(STUB_ASSIGNMENTS));
    stubPeopleService.getRoles.mockReturnValue(of(STUB_ROLES));
    stubPeopleService.createAssignment.mockReturnValue(of({ assignmentId: 'asn-new' }));
    stubPeopleService.revokeAssignment.mockReturnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [RoleAssignmentPageComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: stubPeopleService },
        { provide: ActivatedRoute, useValue: { params: of({ personUuid }) } },
      ],
    }).compileComponents();

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

  // ── T2: Initialization ────────────────────────────────────────────────────

  it('calls getAssignments on init with personUuid from route and includeHistory=false', async () => {
    await setup('person-uuid-1');
    expect(stubPeopleService.getAssignments).toHaveBeenCalledWith('person-uuid-1', false);
  });

  it('calls getRoles on init with personUuid from route', async () => {
    await setup('person-uuid-1');
    expect(stubPeopleService.getRoles).toHaveBeenCalledWith('person-uuid-1');
  });

  // helper: strongly-typed cast suppressed so tests fail at runtime, not compile time
  const c = (cmp: RoleAssignmentPageComponent) => cmp as any;

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

    const [payload] = stubPeopleService.createAssignment.mock.calls[0];
    expect(payload).toEqual({
      personId: 'person-uuid-1',
      roleCode: 'ROLE_ADMIN',
      scopeType: 'GLOBAL',
      effectiveStartAt: '2026-06-01T00:00:00Z',
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

    expect(stubPeopleService.createAssignment).toHaveBeenCalledWith(
      {
        personId: 'person-uuid-1',
        roleCode: 'ROLE_MANAGER',
        scopeType: 'LOCATION',
        locationId: 'loc-77',
        effectiveStartAt: '2026-06-01T00:00:00Z',
      },
    );
  });

  it('includes effectiveEndAt in payload when it is set', async () => {
    await setup('person-uuid-1');
    c(component).selectedRoleCode.set('ROLE_VIEW');
    c(component).scopeType.set('GLOBAL');
    c(component).effectiveStartAt.set('2026-01-01T00:00:00Z');
    c(component).effectiveEndAt.set('2026-12-31T23:59:59Z');

    c(component).submitAssignment();

    const [payload] = stubPeopleService.createAssignment.mock.calls[0];
    expect(payload.effectiveEndAt).toBe('2026-12-31T23:59:59Z');
  });

  it('omits effectiveEndAt from payload when it is empty', async () => {
    await setup('person-uuid-1');
    c(component).selectedRoleCode.set('ROLE_VIEW');
    c(component).scopeType.set('GLOBAL');
    c(component).effectiveStartAt.set('2026-01-01T00:00:00Z');
    c(component).effectiveEndAt.set('');

    c(component).submitAssignment();

    const [payload] = stubPeopleService.createAssignment.mock.calls[0];
    expect(payload).not.toHaveProperty('effectiveEndAt');
  });

  // ── T7: revokeAssignment called on revoke ─────────────────────────────────

  it('calls service.revokeAssignment with personUuid and roleCode', async () => {
    await setup('person-uuid-1');
    c(component).revokeAssignment('ROLE_ADMIN');
    expect(stubPeopleService.revokeAssignment).toHaveBeenCalledWith('person-uuid-1', 'ROLE_ADMIN');
  });

  it('re-fetches assignments after successful revoke', async () => {
    await setup('person-uuid-1');
    const callsBefore = stubPeopleService.getAssignments.mock.calls.length;

    c(component).revokeAssignment('ROLE_ADMIN');

    expect(stubPeopleService.getAssignments.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  // ── T8: include-history toggle ────────────────────────────────────────────

  it('re-fetches assignments with includeHistory=true when loadAssignments() called with flag set', async () => {
    await setup('person-uuid-1');
    stubPeopleService.getAssignments.mockReturnValue(of([]));
    c(component).includeHistory.set(true);
    c(component).loadAssignments();
    expect(stubPeopleService.getAssignments).toHaveBeenCalledWith('person-uuid-1', true);
  });

  it('re-fetches assignments with includeHistory=false when flag is cleared', async () => {
    await setup('person-uuid-1');
    stubPeopleService.getAssignments.mockReturnValue(of([]));
    c(component).includeHistory.set(false);
    c(component).loadAssignments();
    expect(stubPeopleService.getAssignments).toHaveBeenCalledWith('person-uuid-1', false);
  });

  // ── T9: Error paths and confirmingAssignmentId ────────────────────────────

  it('startRevoke() sets confirmingAssignmentId to the given assignmentId', async () => {
    await setup();
    c(component).startRevoke('asn-99');
    expect(c(component).confirmingAssignmentId()).toBe('asn-99');
  });

  it('revokeAssignment() resets confirmingAssignmentId to null on success', async () => {
    await setup();
    c(component).confirmingAssignmentId.set('asn-1');
    c(component).revokeAssignment('ROLE_ADMIN', 'asn-1');
    expect(c(component).confirmingAssignmentId()).toBeNull();
  });

  it('loadRoles() failure sets errorMessage to a non-null string', async () => {
    await setup();
    stubPeopleService.getRoles.mockReturnValue(throwError(() => new Error('server error')));
    c(component).errorMessage.set(null);
    c(component).loadRoles();
    expect(c(component).errorMessage()).not.toBeNull();
    expect(typeof c(component).errorMessage()).toBe('string');
  });

  it('submitAssignment() failure sets errorMessage to a non-null string', async () => {
    await setup();
    stubPeopleService.createAssignment.mockReturnValue(throwError(() => new Error('network error')));
    c(component).selectedRoleCode.set('ROLE_ADMIN');
    c(component).scopeType.set('GLOBAL');
    c(component).effectiveStartAt.set('2026-06-01T00:00:00Z');
    c(component).errorMessage.set(null);
    c(component).submitAssignment();
    expect(c(component).errorMessage()).not.toBeNull();
  });

  it('revokeAssignment() failure sets errorMessage to a non-null string', async () => {
    await setup();
    stubPeopleService.revokeAssignment.mockReturnValue(throwError(() => new Error('revoke failed')));
    c(component).errorMessage.set(null);
    c(component).revokeAssignment('ROLE_ADMIN', 'asn-1');
    expect(c(component).errorMessage()).not.toBeNull();
  });
});
