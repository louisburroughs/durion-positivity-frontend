import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import axe from 'axe-core';
import { of } from 'rxjs';

import enUS from '../../../../../assets/i18n/en-US.json';
import { EmployeeRegisterPageComponent } from './employee-register-page.component';
import { EmployeeRegisterService } from '../../services/employee-register.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  EmployeeRegisterPage,
  EmployeeRegisterRow,
} from '../../models/employee-register.models';

/**
 * Genuine axe coverage of the RENDERED register.
 *
 * `scripts/a11y/smoke-routes.mjs` cannot provide this: it builds its JSDOM with
 * `runScripts: 'outside-only'`, so the Angular bundle never executes and axe only ever
 * sees the un-hydrated index shell. These specs render real DOM through TestBed, so they
 * exercise the table, the status switch and the confirm dialog.
 */

function row(overrides: Partial<EmployeeRegisterRow> = {}): EmployeeRegisterRow {
  return {
    employeeId: 'emp-1',
    personId: 'per-1',
    employeeNumber: 'EMP-10428',
    firstName: 'Renee',
    lastName: 'Albright',
    status: 'ACTIVE',
    active: true,
    username: 'renee.albright',
    email: 'renee.albright@durion.internal',
    phone: '(704) 555-0142',
    roles: [{ code: 'SERVICE_MANAGER', scope: 'LOCATION' }],
    primaryLocation: 'Charlotte Main',
    additionalLocationCount: 1,
    jobRole: 'Service Manager',
    ...overrides,
  };
}

const ROWS: readonly EmployeeRegisterRow[] = [
  row(),
  row({ employeeId: 'emp-2', personId: 'per-2', firstName: 'Curtis', lastName: 'Benton', status: 'DISABLED', active: false }),
  row({ employeeId: 'emp-3', personId: 'per-3', firstName: 'Monica', lastName: 'Byrd', status: 'TERMINATED', active: false }),
];

const PAGE: EmployeeRegisterPage = {
  rows: ROWS,
  page: 0,
  size: 200,
  totalElements: 3,
  totalPages: 1,
};

const authStub = {
  permissionsKnown: () => true,
  hasPermission: () => true,
  hasAnyPermission: () => true,
};

const stubService = {
  searchEmployees: vi.fn(),
  disableEmployee: vi.fn(),
};

async function violations(root: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations;
}

describe('Employee register a11y (rendered DOM)', () => {
  let fixture: ComponentFixture<EmployeeRegisterPageComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();
    stubService.searchEmployees.mockReturnValue(of(PAGE));
    stubService.disableEmployee.mockReturnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [EmployeeRegisterPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: EmployeeRegisterService, useValue: stubService },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(EmployeeRegisterPageComponent);
    fixture.detectChanges();
  });

  it('has no WCAG A/AA violations in the populated table', async () => {
    expect(await violations(fixture.nativeElement)).toEqual([]);
  });

  it('has no WCAG A/AA violations with the confirm dialog open', async () => {
    fixture.componentInstance.openConfirm(ROWS[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog.confirm-dialog')).toBeTruthy();
    expect(await violations(fixture.nativeElement)).toEqual([]);
  });

  it('has no WCAG A/AA violations in the error state', async () => {
    fixture.componentInstance.state.set('error');
    fixture.componentInstance.errorKey.set('PEOPLE.EMPLOYEE_REGISTER.ERROR.LOAD');
    fixture.detectChanges();
    expect(await violations(fixture.nativeElement)).toEqual([]);
  });

  it('names the toggle by the action it performs, not the state it is in', () => {
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.status-switch');
    const name = toggle.getAttribute('aria-label') ?? '';
    // ADR-0029 §8: "toggle names describe the action, not the state".
    expect(name).toContain('Deactivate');
    expect(name).toContain('Albright');
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('exposes every interactive control to the keyboard as a native element', () => {
    const root = fixture.nativeElement as HTMLElement;
    const interactive = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.employee-register a, .employee-register button, .employee-register input',
      ),
    );
    expect(interactive.length).toBeGreaterThan(0);
    // No control may be a div/span carrying a click handler — Tab would skip it.
    for (const el of interactive) {
      expect(['A', 'BUTTON', 'INPUT']).toContain(el.tagName);
      expect(el.getAttribute('tabindex')).not.toBe('-1');
    }
  });

  it('gives the sortable column header a programmatic sort state', () => {
    const header: HTMLElement = fixture.nativeElement.querySelector('th[aria-sort]');
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    fixture.componentInstance.toggleSort();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('th[aria-sort]') as HTMLElement).getAttribute('aria-sort'),
    ).toBe('descending');
  });
});
