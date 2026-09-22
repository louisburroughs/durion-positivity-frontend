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

  it('promotes the confirm to a real modal, not just a rendered dialog element', () => {
    // A real showModal() is what makes this modal: the focus trap and the implicit
    // aria-modal come from the top layer, and an aria-modal attribute on a div implements
    // none of it (ADR-0029 §8.1). axe cannot check that, so it is asserted here.
    //
    // jsdom does not implement showModal AT ALL (calling it throws, and `:modal` silently
    // returns false), so the directive feature-detects and skips it there. Where the
    // platform is real — CI runs this suite in browser mode against Chromium — the native
    // state is asserted directly, exactly as the chat and RAG modal specs do. The stubbed
    // branch exists only so the local jsdom run still proves the directive makes the call.
    const nativeModal = typeof HTMLDialogElement.prototype.showModal === 'function';

    if (nativeModal) {
      fixture.componentInstance.openConfirm(ROWS[0]);
      fixture.detectChanges();

      const dialog = (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>(
        'dialog.confirm-dialog',
      )!;
      expect(dialog.matches(':modal')).toBe(true);
      expect(dialog.open).toBe(true);
      // ADR-0029 §9: focus moves into the dialog, so the keyboard user is not left behind it.
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(dialog.getAttribute('aria-labelledby')).toBe('confirm-title');
      expect(dialog.getAttribute('aria-describedby')).toBe('confirm-body');
      return;
    }

    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    (HTMLDialogElement.prototype as { showModal?: unknown }).showModal = showModal;
    try {
      fixture.componentInstance.openConfirm(ROWS[0]);
      fixture.detectChanges();

      const dialog = (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>(
        'dialog.confirm-dialog',
      )!;
      expect(showModal).toHaveBeenCalledTimes(1);
      expect(showModal.mock.instances[0]).toBe(dialog);
      expect(dialog.getAttribute('aria-labelledby')).toBe('confirm-title');
      expect(dialog.getAttribute('aria-describedby')).toBe('confirm-body');
    } finally {
      delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
    }
  });

  it('has no WCAG A/AA violations with the confirm dialog open', async () => {
    fixture.componentInstance.openConfirm(ROWS[0]);
    fixture.detectChanges();
    expect(await violations(fixture.nativeElement)).toEqual([]);
  });

  it('has no WCAG A/AA violations in the error state', async () => {
    fixture.componentInstance.state.set('error');
    fixture.componentInstance.errorKey.set('PEOPLE.EMPLOYEE_REGISTER.ERROR.LOAD');
    fixture.detectChanges();
    expect(await violations(fixture.nativeElement)).toEqual([]);
  });

  it('names the toggle by its action while still containing the visible label', () => {
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.status-switch');
    const name = toggle.getAttribute('aria-label') ?? '';
    // ADR-0029 §8: "toggle names describe the action, not the state" — so the name leads
    // with the action and identifies the row.
    expect(name).toContain('Deactivate');
    expect(name).toContain('Albright');
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    // …and WCAG 2.5.3 Label in Name: the visible text inside the control is the status, so
    // the accessible name has to contain it or speech activation cannot target this switch.
    const visible = (toggle.querySelector('.status-switch__text')?.textContent ?? '').trim();
    expect(visible).toBe(enUS.PEOPLE.EMPLOYEE_REGISTER.STATUS.ACTIVE);
    expect(name).toContain(visible);
  });

  it('gives every row action its own identity without breaking Label in Name', () => {
    const actions = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        '.register-row:first-of-type .register-action',
      ),
    );
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      const visible = (action.textContent ?? '').trim();
      const name = action.getAttribute('aria-label') ?? '';
      // Identical "Profile" links in a screen reader's link list are indistinguishable
      // without the row they belong to (ADR-0029 §8).
      expect(name).toContain('Albright, Renee');
      // The visible label still has to appear in the name (WCAG 2.5.3).
      expect(name).toContain(visible);
    }
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
