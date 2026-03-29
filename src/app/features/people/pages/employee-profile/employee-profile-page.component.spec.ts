import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';

import { EmployeeProfilePageComponent } from './employee-profile-page.component';
import { PeopleService } from '../../services/people.service';

// ── Stubs ─────────────────────────────────────────────────────────────────

const STUB_EMPLOYEE = {
  employeeId: 'emp-1',
  firstName: 'Jane',
  lastName: 'Smith',
  employmentStatus: 'ACTIVE',
  hireDate: '2024-03-01',
  createdAt: '2024-03-01T08:00:00Z',
  updatedAt: '2025-01-15T12:30:00Z',
};

const stubPeopleService = {
  getEmployee: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function setupNew(): Promise<{ fixture: ComponentFixture<EmployeeProfilePageComponent>; component: EmployeeProfilePageComponent }> {
  vi.clearAllMocks();

  await TestBed.configureTestingModule({
    imports: [EmployeeProfilePageComponent],
    providers: [
      provideRouter([]),
      { provide: PeopleService, useValue: stubPeopleService },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => null } }, params: of({}) },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(EmployeeProfilePageComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component };
}

async function setupEdit(employeeId = 'emp-1'): Promise<{ fixture: ComponentFixture<EmployeeProfilePageComponent>; component: EmployeeProfilePageComponent }> {
  vi.clearAllMocks();
  stubPeopleService.getEmployee.mockReturnValue(of(STUB_EMPLOYEE));

  await TestBed.configureTestingModule({
    imports: [EmployeeProfilePageComponent],
    providers: [
      provideRouter([]),
      { provide: PeopleService, useValue: stubPeopleService },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: (k: string) => (k === 'id' ? employeeId : null) } }, params: of({ id: employeeId }) },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(EmployeeProfilePageComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component };
}

// ── Test Suite ────────────────────────────────────────────────────────────

describe('EmployeeProfilePageComponent [Story #152]', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // ── T1: New route renders empty form ─────────────────────────────────────

  it('renders an empty form when on the new-employee route', async () => {
    const { fixture } = await setupNew();

    // Form should be present
    const form = fixture.debugElement.query(By.css('form'));
    expect(form).toBeTruthy();

    // No pre-filled first-name value
    const firstNameInput = fixture.debugElement.query(By.css('[data-testid="first-name-input"]'));
    expect(firstNameInput).toBeTruthy();
    expect(firstNameInput.nativeElement.value).toBe('');
  });

  // ── T2: Edit route loads employee data ───────────────────────────────────

  it('calls getEmployee with the route id on the edit route', async () => {
    await setupEdit('emp-1');
    expect(stubPeopleService.getEmployee).toHaveBeenCalledWith('emp-1');
  });

  it('populates form fields with the loaded employee data', async () => {
    const { fixture } = await setupEdit('emp-1');

    const firstNameInput = fixture.debugElement.query(By.css('[data-testid="first-name-input"]'));
    expect(firstNameInput.nativeElement.value).toBe(STUB_EMPLOYEE.firstName);

    const lastNameInput = fixture.debugElement.query(By.css('[data-testid="last-name-input"]'));
    expect(lastNameInput.nativeElement.value).toBe(STUB_EMPLOYEE.lastName);
  });

  // ── T3: Loading state ────────────────────────────────────────────────────

  it('shows a loading indicator while fetching employee data', async () => {
    vi.clearAllMocks();
    // Use a never-completing observable to freeze in loading state
    stubPeopleService.getEmployee.mockReturnValue(new (await import('rxjs')).Subject());

    await TestBed.configureTestingModule({
      imports: [EmployeeProfilePageComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: stubPeopleService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: (k: string) => (k === 'id' ? 'emp-pending' : null) } }, params: of({ id: 'emp-pending' }) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(EmployeeProfilePageComponent);
    fixture.detectChanges();

    const loader = fixture.debugElement.query(By.css('[data-testid="loading-indicator"]'));
    expect(loader).toBeTruthy();
  });

  // ── T4: Create on save (new mode) ────────────────────────────────────────

  it('calls createEmployee (not updateEmployee) when saving in new mode', async () => {
    stubPeopleService.createEmployee.mockReturnValue(of({ ...STUB_EMPLOYEE, employeeId: 'emp-new' }));
    const { fixture, component } = await setupNew();

    // Fill required fields so the form is valid
    component.form.patchValue({ firstName: 'Jane', lastName: 'Doe', hireDate: '2024-01-01', employmentStatus: 'ACTIVE' as any });
    fixture.detectChanges();

    // Trigger save
    (component as any).save?.();
    fixture.detectChanges();

    expect(stubPeopleService.createEmployee).toHaveBeenCalled();
    expect(stubPeopleService.updateEmployee).not.toHaveBeenCalled();
  });

  // ── T5: Update on save (edit mode) ───────────────────────────────────────

  it('calls updateEmployee (not createEmployee) when saving in edit mode', async () => {
    stubPeopleService.updateEmployee.mockReturnValue(of(STUB_EMPLOYEE));
    const { fixture, component } = await setupEdit('emp-1');

    (component as any).save?.();
    fixture.detectChanges();

    expect(stubPeopleService.updateEmployee).toHaveBeenCalledWith('emp-1', expect.any(Object));
    expect(stubPeopleService.createEmployee).not.toHaveBeenCalled();
  });

  // ── T6: 409 conflict error ───────────────────────────────────────────────

  it('displays a conflict error message when createEmployee returns 409', async () => {
    stubPeopleService.createEmployee.mockReturnValue(
      throwError(() => Object.assign(new Error('Conflict'), { status: 409 }))
    );
    const { fixture, component } = await setupNew();

    // Fill required fields so the form is valid
    component.form.patchValue({ firstName: 'Jane', lastName: 'Doe', hireDate: '2024-01-01', employmentStatus: 'ACTIVE' as any });
    fixture.detectChanges();

    (component as any).save?.();
    fixture.detectChanges();

    const errorMsg = fixture.debugElement.query(By.css('[data-testid="conflict-error"]'));
    expect(errorMsg).toBeTruthy();
  });

  // ── T7: 400 validation error ─────────────────────────────────────────────

  it('displays field-level validation errors when createEmployee returns 400', async () => {
    stubPeopleService.createEmployee.mockReturnValue(
      throwError(() =>
        Object.assign(new Error('Bad Request'), {
          status: 400,
          error: { errors: [{ field: 'firstName', message: 'First name is required' }] },
        })
      )
    );
    const { fixture, component } = await setupNew();

    // Fill required fields so the form is valid
    component.form.patchValue({ firstName: 'Jane', lastName: 'Doe', hireDate: '2024-01-01', employmentStatus: 'ACTIVE' as any });
    fixture.detectChanges();

    (component as any).save?.();
    fixture.detectChanges();

    const fieldError = fixture.debugElement.query(By.css('[data-testid="field-error-first-name"]'));
    expect(fieldError).toBeTruthy();
    expect(fieldError.nativeElement.textContent).toContain('First name is required');
  });

  // ── T8: Audit metadata display ───────────────────────────────────────────

  it('renders createdAt and updatedAt audit fields after load in edit mode', async () => {
    const { fixture } = await setupEdit('emp-1');

    const createdAt = fixture.debugElement.query(By.css('[data-testid="audit-created-at"]'));
    const updatedAt = fixture.debugElement.query(By.css('[data-testid="audit-updated-at"]'));

    expect(createdAt).toBeTruthy();
    expect(updatedAt).toBeTruthy();
  });

  // ── T9: Required-field validation before submit ──────────────────────────

  it('shows required validation feedback for firstName when form is submitted empty', async () => {
    const { fixture, component } = await setupNew();

    // Attempt save with no data
    (component as any).save?.();
    fixture.detectChanges();

    const firstNameError = fixture.debugElement.query(By.css('[data-testid="validation-first-name"]'));
    expect(firstNameError).toBeTruthy();

    const lastNameError = fixture.debugElement.query(By.css('[data-testid="validation-last-name"]'));
    expect(lastNameError).toBeTruthy();

    const statusError = fixture.debugElement.query(By.css('[data-testid="validation-employment-status"]'));
    expect(statusError).toBeTruthy();

    const hireDateError = fixture.debugElement.query(By.css('[data-testid="validation-hire-date"]'));
    expect(hireDateError).toBeTruthy();
  });

  // ── T10: Save button disabled while loading ──────────────────────────────

  it('disables the save button while a network request is in flight', async () => {
    vi.clearAllMocks();
    const { Subject } = await import('rxjs');
    stubPeopleService.createEmployee.mockReturnValue(new Subject());

    await TestBed.configureTestingModule({
      imports: [EmployeeProfilePageComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: stubPeopleService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => null } }, params: of({}) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(EmployeeProfilePageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Fill required fields so form is valid before saving
    component.form.patchValue({ firstName: 'Jane', lastName: 'Doe', hireDate: '2024-01-01', employmentStatus: 'ACTIVE' as any });
    fixture.detectChanges();

    // Trigger save to put component into saving state
    (component as any).save?.();
    fixture.detectChanges();

    const saveBtn = fixture.debugElement.query(By.css('[data-testid="save-button"]'));
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.nativeElement.disabled).toBe(true);
  });
});
