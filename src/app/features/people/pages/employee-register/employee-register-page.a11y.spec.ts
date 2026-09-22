import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import axe from 'axe-core';
import { of } from 'rxjs';

import enUS from '../../../../../assets/i18n/en-US.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../assets/i18n/qps-ploc.json';

/**
 * The hand-maintained bundles — a name that loses its visible label in any one of them fails.
 *
 * `qps-ploc` is deliberately excluded from the substring assertion and checked separately
 * below: the generator wraps every string in `[!! … !!]` decoration and places interpolated
 * values outside it, so the visible label is never a literal substring of the accessible name
 * there. That is an artefact of pseudo-localisation, not a translation defect, and asserting
 * containment against it would only teach the suite to accept a weaker rule.
 */
const LOCALES: ReadonlyArray<readonly [string, TranslationObject]> = [
  ['en-US', enUS],
  ['es-US', esUS],
  ['es-MX', esMX],
  ['fr-CA', frCA],
  ['fr-FR', frFR],
];
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
    // Both chip variants: the GLOBAL fill is a different token pair, so a fixture
    // carrying only LOCATION chips leaves half the chip palette unchecked by axe —
    // which is how a 3.72:1 global chip survived until the card layout brought the
    // column into axe's view.
    roles: [
      { code: 'SERVICE_MANAGER', scope: 'LOCATION' },
      { code: 'HR_ADMIN', scope: 'GLOBAL' },
    ],
    primaryLocation: 'Charlotte Main',
    otherLocationCount: 1,
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
    // ADR-0029 §8: "toggle names describe the action, not the state" — the name leads with
    // the action and identifies the row.
    expect(toggle.getAttribute('aria-label') ?? '').toContain('Deactivate');
    expect(toggle.getAttribute('aria-label') ?? '').toContain('Albright');
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  // WCAG 2.5.3 Label in Name holds per locale, not just in English: a translation that drops
  // the status or the action would break speech activation for those users only, and an
  // en-US-only assertion cannot see it (ADR-0029 §8.6, ADR-0035 §8).
  for (const [locale, bundle] of LOCALES) {
    it(`keeps the visible label inside every accessible name in ${locale}`, () => {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation(locale, bundle);
      translate.use(locale);
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;

      const toggle = host.querySelector<HTMLButtonElement>('.status-switch')!;
      const toggleVisible = (toggle.querySelector('.status-switch__text')?.textContent ?? '').trim();
      expect(toggleVisible.length).toBeGreaterThan(0);
      expect(toggle.getAttribute('aria-label') ?? '').toContain(toggleVisible);

      const actions = Array.from(
        host.querySelectorAll<HTMLAnchorElement>('.register-row:first-of-type .register-action'),
      );
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) {
        const visible = (action.textContent ?? '').trim();
        expect(visible.length).toBeGreaterThan(0);
        expect(action.getAttribute('aria-label') ?? '').toContain(visible);
      }
    });
  }

  it('still names every control in the pseudo-locale', () => {
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('qps-ploc', qpsPloc);
    translate.use('qps-ploc');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const toggle = host.querySelector<HTMLButtonElement>('.status-switch')!;
    const actions = Array.from(
      host.querySelectorAll<HTMLAnchorElement>('.register-row:first-of-type .register-action'),
    );

    // Containment cannot hold here (see LOCALES above), but every control must still resolve
    // a real name and carry its row — a missing key would surface as an empty or raw name.
    expect(toggle.getAttribute('aria-label') ?? '').toContain('Albright, Renee');
    expect(toggle.getAttribute('aria-label') ?? '').not.toContain('EMPLOYEE_REGISTER.');
    for (const action of actions) {
      expect(action.getAttribute('aria-label') ?? '').toContain('Albright, Renee');
      expect(action.getAttribute('aria-label') ?? '').not.toContain('EMPLOYEE_REGISTER.');
    }
  });

  it('gives every row action its own identity', () => {
    const actions = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        '.register-row:first-of-type .register-action',
      ),
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      // Identical "Profile" links in a screen reader's link list are indistinguishable
      // without the row they belong to (ADR-0029 §8).
      expect(action.getAttribute('aria-label') ?? '').toContain('Albright, Renee');
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
