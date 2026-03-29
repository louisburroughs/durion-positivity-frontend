import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';

import { PersonLocationAssignmentsPageComponent } from './person-location-assignments-page.component';
import { PeopleService } from '../../services/people.service';
import { LocationService } from '../../../location/services/location.service';

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockAssignments = [
  {
    assignmentId: 'a-001',
    personId: 'person-001',
    locationId: 'loc-001',
    primary: true,
    effectiveStartAt: '2024-01-01',
    effectiveEndAt: null,
  },
  {
    assignmentId: 'a-002',
    personId: 'person-001',
    locationId: 'loc-002',
    primary: false,
    effectiveStartAt: '2024-02-01',
    effectiveEndAt: '2024-06-01',
  },
];

const mockLocations = [
  { locationId: 'loc-001', name: 'Downtown Store', type: 'STORE' },
  { locationId: 'loc-002', name: 'Warehouse', type: 'WAREHOUSE' },
];

// ── Stubs ─────────────────────────────────────────────────────────────────

const stubPeopleService = {
  getPersonLocationAssignments: vi.fn(),
  createPersonLocationAssignment: vi.fn(),
  endPersonLocationAssignment: vi.fn(),
};

const stubLocationService = {
  getAllLocations: vi.fn(),
};

const PERSON_ROUTE = {
  snapshot: {
    paramMap: { get: (k: string) => (k === 'personId' ? 'person-001' : null) },
  },
};

// ── Setup Helper ──────────────────────────────────────────────────────────

async function setup(): Promise<ComponentFixture<PersonLocationAssignmentsPageComponent>> {
  await TestBed.configureTestingModule({
    imports: [PersonLocationAssignmentsPageComponent],
    providers: [
      provideRouter([]),
      { provide: PeopleService, useValue: stubPeopleService },
      { provide: LocationService, useValue: stubLocationService },
      { provide: ActivatedRoute, useValue: PERSON_ROUTE },
    ],
  }).compileComponents();

  return TestBed.createComponent(PersonLocationAssignmentsPageComponent);
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('PersonLocationAssignmentsPageComponent [CAP-119 #150]', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // T1 ─────────────────────────────────────────────────────────────────────

  it('T1: shows loading-indicator while getPersonLocationAssignments is pending', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(NEVER);
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="loading-indicator"]'));
    expect(el).not.toBeNull();
  });

  // T2 ─────────────────────────────────────────────────────────────────────

  it('T2: renders two assignment-item rows after successful load', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(of(mockAssignments));
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('[data-testid="assignment-item"]'));
    expect(rows.length).toBe(2);
  });

  // T3 ─────────────────────────────────────────────────────────────────────

  it('T3: shows empty-state when no assignments are returned', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(of([]));
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="empty-state"]'));
    expect(el).not.toBeNull();
  });

  // T4 ─────────────────────────────────────────────────────────────────────

  it('T4: shows error-state when getPersonLocationAssignments fails', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(
      throwError(() => new Error('network error')),
    );
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="error-state"]'));
    expect(el).not.toBeNull();
  });

  // T5 ─────────────────────────────────────────────────────────────────────

  it('T5: openCreateDialog makes the create-dialog visible', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(of(mockAssignments));
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    fixture.componentInstance.openCreateDialog();
    fixture.detectChanges();

    const dialog = fixture.debugElement.query(By.css('[data-testid="create-dialog"]'));
    expect(dialog).not.toBeNull();
  });

  // T6 ─────────────────────────────────────────────────────────────────────

  it('T6: submitCreate does not call createPersonLocationAssignment when form is invalid', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(of(mockAssignments));
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    fixture.componentInstance.openCreateDialog(); // resets form to all-empty
    fixture.componentInstance.submitCreate();     // form invalid → early return

    expect(stubPeopleService.createPersonLocationAssignment).not.toHaveBeenCalled();
  });

  // T7 ─────────────────────────────────────────────────────────────────────

  it('T7: submitCreate calls createPersonLocationAssignment with correct personId and body', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(of(mockAssignments));
    stubPeopleService.createPersonLocationAssignment.mockReturnValue(of({}));
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.openCreateDialog();
    comp.createForm.patchValue({ locationId: 'loc-001', effectiveStartAt: '2024-01-01' });
    comp.submitCreate();

    expect(stubPeopleService.createPersonLocationAssignment).toHaveBeenCalledWith(
      'person-001',
      expect.objectContaining({ locationId: 'loc-001' }),
    );
  });

  // T8 ─────────────────────────────────────────────────────────────────────

  it('T8: shows conflict-error when createPersonLocationAssignment returns 409', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(of(mockAssignments));
    stubPeopleService.createPersonLocationAssignment.mockReturnValue(
      throwError(() => ({ status: 409, error: { message: 'Overlap' } })),
    );
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.openCreateDialog();
    comp.createForm.patchValue({ locationId: 'loc-001', effectiveStartAt: '2024-01-01' });
    comp.submitCreate();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="conflict-error"]'));
    expect(el).not.toBeNull();
  });

  // T9 ─────────────────────────────────────────────────────────────────────

  it('T9: openEndDialog makes the end-confirm-dialog visible', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(of(mockAssignments));
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    fixture.componentInstance.openEndDialog('a-001');
    fixture.detectChanges();

    const dialog = fixture.debugElement.query(By.css('[data-testid="end-confirm-dialog"]'));
    expect(dialog).not.toBeNull();
  });

  // T10 ────────────────────────────────────────────────────────────────────

  it('T10: confirmEnd calls endPersonLocationAssignment with the selected assignment id', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(of(mockAssignments));
    stubPeopleService.endPersonLocationAssignment.mockReturnValue(of({}));
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.openEndDialog('a-001');
    comp.confirmEnd();

    expect(stubPeopleService.endPersonLocationAssignment).toHaveBeenCalledWith('a-001');
  });

  // T11 ────────────────────────────────────────────────────────────────────

  it('T11: closeEndDialog removes the end-confirm-dialog from the DOM', async () => {
    stubPeopleService.getPersonLocationAssignments.mockReturnValue(of(mockAssignments));
    stubLocationService.getAllLocations.mockReturnValue(of(mockLocations));

    const fixture = await setup();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.openEndDialog('a-001');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[data-testid="end-confirm-dialog"]'))).not.toBeNull();

    comp.closeEndDialog();
    fixture.detectChanges();

    const dialog = fixture.debugElement.query(By.css('[data-testid="end-confirm-dialog"]'));
    expect(dialog).toBeNull();
  });
});
