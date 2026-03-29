import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';

import { EmployeeOffboardPageComponent } from './employee-offboard-page.component';
import { Employee, EmploymentStatus } from '../../models/employee.models';
import { PeopleService } from '../../services/people.service';

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockEmployee: Employee = {
  employeeId: 'emp-001',
  firstName: 'Jane',
  lastName: 'Doe',
  employmentStatus: EmploymentStatus.ACTIVE,
  hireDate: '2020-01-01',
};

// ── Stubs ─────────────────────────────────────────────────────────────────

const stubPeopleService = {
  getEmployee: vi.fn(),
  disableEmployee: vi.fn(),
};

// ── Setup helper ──────────────────────────────────────────────────────────

async function setup(opts: {
  getEmployeeReturn?: Observable<Employee>;
  disableEmployeeReturn?: Observable<unknown>;
} = {}): Promise<{
  fixture: ComponentFixture<EmployeeOffboardPageComponent>;
  component: EmployeeOffboardPageComponent;
}> {
  const {
    getEmployeeReturn = of(mockEmployee),
    disableEmployeeReturn = of({}),
  } = opts;

  vi.clearAllMocks();
  stubPeopleService.getEmployee.mockReturnValue(getEmployeeReturn);
  stubPeopleService.disableEmployee.mockReturnValue(disableEmployeeReturn);

  await TestBed.configureTestingModule({
    imports: [EmployeeOffboardPageComponent],
    providers: [
      provideRouter([]),
      { provide: PeopleService, useValue: stubPeopleService },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 'emp-001' } } },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(EmployeeOffboardPageComponent);
  const component = fixture.componentInstance;
  return { fixture, component };
}

// ── Test Suite ────────────────────────────────────────────────────────────

describe('EmployeeOffboardPageComponent', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // T1 ─────────────────────────────────────────────────────────────────────

  it('T1: shows loading-indicator while getEmployee is pending', async () => {
    const { fixture } = await setup({
      getEmployeeReturn: NEVER as Observable<Employee>,
    });

    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="loading-indicator"]'));
    expect(el).toBeTruthy();
  });

  // T2 ─────────────────────────────────────────────────────────────────────

  it('T2: shows employee-context after load and renders full name', async () => {
    const { fixture } = await setup();

    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="employee-context"]'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('Jane');
    expect(el.nativeElement.textContent).toContain('Doe');
  });

  // T3 ─────────────────────────────────────────────────────────────────────

  it('T3: shows error message when getEmployee fails', async () => {
    const { fixture } = await setup({
      getEmployeeReturn: throwError(() => new Error('err')) as Observable<Employee>,
    });

    fixture.detectChanges();

    const errorEl = fixture.debugElement.query(By.css('.state-panel--error'));
    expect(errorEl).toBeTruthy();
    expect(errorEl.nativeElement.textContent).toContain('Failed to load employee.');
  });

  // T4 ─────────────────────────────────────────────────────────────────────

  it('T4: shows consequences-warning when not loading and not in success state', async () => {
    const { fixture } = await setup();

    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="consequences-warning"]'));
    expect(el).toBeTruthy();
  });

  // T5 ─────────────────────────────────────────────────────────────────────

  it('T5: does not show confirm dialog initially', async () => {
    const { fixture } = await setup();

    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="offboard-confirm-dialog"]'));
    expect(el).toBeNull();
  });

  // T6 ─────────────────────────────────────────────────────────────────────

  it('T6: openConfirmDialog() renders dialog with role=alertdialog', async () => {
    const { fixture, component } = await setup();
    fixture.detectChanges();

    component.openConfirmDialog();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[role="alertdialog"]'));
    expect(el).toBeTruthy();
  });

  // T7 ─────────────────────────────────────────────────────────────────────

  it('T7: cancelConfirmDialog() hides the confirm dialog', async () => {
    const { fixture, component } = await setup();
    fixture.detectChanges();

    component.openConfirmDialog();
    fixture.detectChanges();

    component.cancelConfirmDialog();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="offboard-confirm-dialog"]'));
    expect(el).toBeNull();
  });

  // T8 ─────────────────────────────────────────────────────────────────────

  it('T8: confirmOffboard() with empty offboard date does not call disableEmployee', async () => {
    const { fixture, component } = await setup();
    fixture.detectChanges();

    // offboardDateControl defaults to '' — guard should return early
    component.confirmOffboard();

    expect(stubPeopleService.disableEmployee).not.toHaveBeenCalled();
  });

  // T9 ─────────────────────────────────────────────────────────────────────

  it('T9: confirmOffboard() calls disableEmployee with correct employeeId and offboardDate', async () => {
    const { fixture, component } = await setup();
    fixture.detectChanges();

    component.offboardDateControl.setValue('2025-12-31');
    component.openConfirmDialog();
    fixture.detectChanges();

    component.confirmOffboard();

    expect(stubPeopleService.disableEmployee).toHaveBeenCalledWith('emp-001', {
      offboardDate: '2025-12-31',
    });
  });

  // T10 ────────────────────────────────────────────────────────────────────

  it('T10: shows offboard-success-state after disableEmployee succeeds', async () => {
    const { fixture, component } = await setup({ disableEmployeeReturn: of({}) });
    fixture.detectChanges();

    component.offboardDateControl.setValue('2025-12-31');
    component.openConfirmDialog();
    fixture.detectChanges();

    component.confirmOffboard();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="offboard-success-state"]'));
    expect(el).toBeTruthy();
  });

  // T11 ────────────────────────────────────────────────────────────────────

  it('T11: shows error message after disableEmployee fails', async () => {
    const { fixture, component } = await setup({
      disableEmployeeReturn: throwError(() => new Error('x')),
    });
    fixture.detectChanges();

    component.offboardDateControl.setValue('2025-12-31');
    component.confirmOffboard();
    fixture.detectChanges();

    const errorEl = fixture.debugElement.query(By.css('.state-panel--error'));
    expect(errorEl).toBeTruthy();
    expect(errorEl.nativeElement.textContent).toContain('Failed to disable employee');
  });
});
