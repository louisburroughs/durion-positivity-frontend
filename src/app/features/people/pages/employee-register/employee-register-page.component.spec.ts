import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';

import enUS from '../../../../../assets/i18n/en-US.json';
import { EmployeeRegisterPageComponent } from './employee-register-page.component';
import { EmployeeRegisterService } from '../../services/employee-register.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  EmployeeRegisterPage,
  EmployeeRegisterRow,
} from '../../models/employee-register.models';

/**
 * Pinned literals, not read from PEOPLE_SECTION: deriving the expected codes from the
 * constant under test would pass under any namespace, including the neighbouring
 * pos-people `people:person:view` that does not govern these reads.
 */
const PII_PERMISSION = 'people:employee_pii:view';
const ROLE_PERMISSION = 'people-contact:role:view';
const DEACTIVATE_PERMISSION = 'people:employee:deactivate';
const TIME_PERMISSION = 'people:timekeeping:view';
const VIEW_PERMISSION = 'people:employee:view';

const ALL_PERMISSIONS = [
  PII_PERMISSION,
  ROLE_PERMISSION,
  DEACTIVATE_PERMISSION,
  TIME_PERMISSION,
  VIEW_PERMISSION,
];

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

const STUB_ROWS: readonly EmployeeRegisterRow[] = [
  row(),
  row({ employeeId: 'emp-2', personId: 'per-2', firstName: 'Curtis', lastName: 'Benton', status: 'DISABLED', active: false }),
  row({ employeeId: 'emp-3', personId: 'per-3', firstName: 'Monica', lastName: 'Byrd', status: 'TERMINATED', active: false }),
  row({ employeeId: 'emp-4', personId: 'per-4', firstName: 'Marcus', lastName: 'Bennett', status: 'ON_LEAVE', active: false }),
];

function page(rows: readonly EmployeeRegisterRow[] = STUB_ROWS): EmployeeRegisterPage {
  return { rows, page: 0, size: 200, totalElements: rows.length, totalPages: 1 };
}

/** `permissions: null` models a legacy token with no `perm_bits` claim. */
const session: { permissions: string[] | null } = { permissions: null };

const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasPermission: (permission: string) => session.permissions?.includes(permission) ?? false,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(permission => session.permissions?.includes(permission) ?? false),
};

const stubService = {
  searchEmployees: vi.fn(),
  disableEmployee: vi.fn(),
};

describe('EmployeeRegisterPageComponent', () => {
  let fixture: ComponentFixture<EmployeeRegisterPageComponent>;
  let component: EmployeeRegisterPageComponent;

  const setup = async (
    options: { permissions?: string[] | null; search?: Observable<EmployeeRegisterPage> } = {},
  ) => {
    vi.clearAllMocks();
    // `?? ALL_PERMISSIONS` would convert an explicit `permissions: null` into the full list,
    // so the legacy-token test below would never reach the unknown-perm_bits branch and would
    // still pass if that fallback were deleted. Key presence is the test.
    session.permissions = 'permissions' in options ? (options.permissions ?? null) : ALL_PERMISSIONS;
    stubService.searchEmployees.mockReturnValue(options.search ?? of(page()));
    stubService.disableEmployee.mockReturnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [EmployeeRegisterPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: EmployeeRegisterService, useValue: stubService },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    // ADR-0035 §8: copy claims assert against the shipped bundle, never pasted strings.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(EmployeeRegisterPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    fixture?.destroy();
    session.permissions = null;
  });

  const text = () => fixture.nativeElement.textContent as string;

  it('renders a row per employee once the read settles', async () => {
    await setup();
    expect(component.state()).toBe('ready');
    expect(fixture.debugElement.queryAll(By.css('.register-row')).length).toBe(4);
    expect(text()).toContain('Albright, Renee');
    expect(text()).toContain('Charlotte Main');
    expect(text()).toContain('Service Manager');
  });

  it('shows the empty state and keeps a way back when nothing matches', async () => {
    await setup({ search: of(page([])) });
    expect(component.state()).toBe('empty');
    expect(text()).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.EMPTY);
  });

  // ── Lifecycle (DECISION-PEOPLE-001) ─────────────────────────────────────────────────

  it('offers the switch only for ACTIVE, and a read-only badge for every other status', async () => {
    await setup();
    const switches = fixture.debugElement.queryAll(By.css('.status-switch'));
    expect(switches.length).toBe(1);
    expect(switches[0].attributes['aria-checked']).toBe('true');

    // DISABLED has no enable endpoint (backend #2156); TERMINATED is irreversible;
    // ON_LEAVE carries dates the switch cannot collect.
    expect(component.canSwitch(STUB_ROWS[1])).toBe(false);
    expect(component.canSwitch(STUB_ROWS[2])).toBe(false);
    expect(component.canSwitch(STUB_ROWS[3])).toBe(false);
    expect(fixture.debugElement.queryAll(By.css('.status-badge')).length).toBe(3);
  });

  it('prefers the backend capability flags over the status rules when they are present', async () => {
    await setup();
    // A DISABLED row the backend says may be enabled still offers no DISABLE action…
    expect(component.canSwitch(row({ status: 'DISABLED', allowedActions: ['ENABLE'] }))).toBe(false);
    // …and an ACTIVE row the backend refuses is not switchable despite the permission.
    expect(component.canSwitch(row({ status: 'ACTIVE', allowedActions: ['UPDATE'] }))).toBe(false);
    expect(component.canSwitch(row({ status: 'ACTIVE', allowedActions: ['DISABLE'] }))).toBe(true);
  });

  // ── Write-control gating (ADR-0040 §6a) ─────────────────────────────────────────────

  it('hides the switch AND refuses the method without people:employee:deactivate', async () => {
    await setup({ permissions: ALL_PERMISSIONS.filter(p => p !== DEACTIVATE_PERMISSION) });
    expect(fixture.debugElement.queryAll(By.css('.status-switch')).length).toBe(0);

    // The method re-checks at call time, not only at the control.
    component.openConfirm(STUB_ROWS[0]);
    expect(component.confirmRow()).toBeNull();
    component.confirmDeactivate();
    expect(stubService.disableEmployee).not.toHaveBeenCalled();
  });

  it('allows the control when the token carries no perm_bits claim', async () => {
    await setup({ permissions: null });
    // ADR-0040 §6a.3: permissions unknown, so the control is offered and the backend refuses.
    // Asserting the session really is unknown — the previous setup silently replaced an
    // explicit null with the full permission list, which made this test vacuous.
    expect(session.permissions).toBeNull();
    expect(component.canDeactivate()).toBe(true);
    expect(component.canViewPii()).toBe(true);
    expect(fixture.debugElement.queryAll(By.css('.status-switch')).length).toBeGreaterThan(0);
  });

  it('masks PII and unlinks the name without people:employee_pii:view', async () => {
    await setup({ permissions: [VIEW_PERMISSION, ROLE_PERMISSION] });
    expect(component.canViewPii()).toBe(false);
    expect(text()).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.RESTRICTED);
    expect(text()).not.toContain('renee.albright@durion.internal');
    // The column stays; only its content is masked, so the grid keeps its shape.
    expect(fixture.debugElement.queryAll(By.css('.register-name-link')).length).toBe(0);
    expect(text()).toContain('Albright, Renee');
  });

  it('masks the roles column without people-contact:role:view', async () => {
    await setup({ permissions: [VIEW_PERMISSION, PII_PERMISSION] });
    expect(component.canViewRoles()).toBe(false);
    expect(text()).not.toContain('SERVICE_MANAGER');
  });

  it('renders a row action only for the permission its destination route declares', async () => {
    await setup({ permissions: [VIEW_PERMISSION] });
    const actions = fixture.debugElement
      .queryAll(By.css('.register-action'))
      .map(a => (a.nativeElement.textContent as string).trim());
    // employee:view carries the locations page and nothing else here.
    expect(actions).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.ACTION.LOCATIONS);
    expect(actions).not.toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.ACTION.PROFILE);
    expect(actions).not.toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.ACTION.TIME);
    expect(actions).not.toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.ACTION.ROLES);
  });

  // ── Confirmed deactivate (DECISION-PEOPLE-024) ──────────────────────────────────────

  it('never writes on the switch alone — it opens a confirm first', async () => {
    await setup();
    fixture.debugElement.query(By.css('.status-switch')).nativeElement.click();
    fixture.detectChanges();
    expect(stubService.disableEmployee).not.toHaveBeenCalled();
    expect(component.confirmRow()?.employeeId).toBe('emp-1');
    expect(fixture.debugElement.query(By.css('dialog.confirm-dialog'))).toBeTruthy();
  });

  it('sends the employee id and the assignment end date on confirm, then re-reads', async () => {
    await setup();
    component.openConfirm(STUB_ROWS[0]);
    component.assignmentEndDate.set('2026-09-22');
    component.confirmDeactivate();

    expect(stubService.disableEmployee).toHaveBeenCalledWith('emp-1', '2026-09-22');
    // The disable runs a saga (DECISION-PEOPLE-002); the server settles the status, not us.
    expect(stubService.searchEmployees).toHaveBeenCalledTimes(2);
    expect(component.confirmRow()).toBeNull();
  });

  it('routes a failed deactivate through state then errorKey (ADR-0031 §1)', async () => {
    await setup();
    stubService.disableEmployee.mockReturnValue(throwError(() => new Error('boom')));

    component.openConfirm(STUB_ROWS[0]);
    component.confirmDeactivate();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PEOPLE.EMPLOYEE_REGISTER.ERROR.DEACTIVATE');
    expect(component.isPending(STUB_ROWS[0])).toBe(false);
  });

  it('names the concurrency conflict distinctly on a 409 (DECISION-PEOPLE-017)', async () => {
    await setup();
    stubService.disableEmployee.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );

    component.openConfirm(STUB_ROWS[0]);
    component.confirmDeactivate();

    expect(component.errorKey()).toBe('PEOPLE.EMPLOYEE_REGISTER.ERROR.CONFLICT');
  });

  // ── Read outcomes ───────────────────────────────────────────────────────────────────

  it('routes a 403 to the forbidden state, not the error state', async () => {
    await setup({ search: throwError(() => new HttpErrorResponse({ status: 403 })) });
    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBeNull();
    expect(text()).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.FORBIDDEN.TITLE);
  });

  it('routes any other read failure through state then errorKey', async () => {
    await setup({ search: throwError(() => new Error('down')) });
    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PEOPLE.EMPLOYEE_REGISTER.ERROR.LOAD');
  });

  it('ignores a superseded read so a slow first response cannot overwrite a newer one', async () => {
    const first = new Subject<EmployeeRegisterPage>();
    const second = new Subject<EmployeeRegisterPage>();
    await setup({ search: first });

    stubService.searchEmployees.mockReturnValue(second);
    component.reload();

    const late = [row({ employeeId: 'stale', lastName: 'Stale' })];
    first.next(page(late));
    expect(component.allRows().some(r => r.employeeId === 'stale')).toBe(false);

    second.next(page());
    expect(component.allRows().length).toBe(4);
  });

  // ── Filtering and ordering ──────────────────────────────────────────────────────────

  it('filters by status and reports truncation honestly', async () => {
    await setup();
    component.setStatusFilter('DISABLED');
    expect(component.filtered().length).toBe(1);
    expect(component.filtered()[0].employeeId).toBe('emp-2');
    expect(component.truncated()).toBe(false);

    stubService.searchEmployees.mockReturnValue(
      of({ ...page(), totalElements: 900 }),
    );
    component.reload();
    expect(component.truncated()).toBe(true);
  });

  it('sorts by last name in both directions', async () => {
    await setup();
    expect(component.filtered().map(r => r.lastName)).toEqual([
      'Albright',
      'Bennett',
      'Benton',
      'Byrd',
    ]);
    component.toggleSort();
    expect(component.filtered()[0].lastName).toBe('Byrd');
    expect(component.ariaSort()).toBe('descending');
  });

  // ── Pending contract (backend #2155) ────────────────────────────────────────────────

  it('says a not-yet-served column is unavailable rather than showing it as empty', async () => {
    await setup({
      search: of(
        page([
          {
            employeeId: 'emp-9',
            personId: 'per-9',
            employeeNumber: 'EMP-1',
            firstName: 'Thin',
            lastName: 'Payload',
            status: 'ACTIVE',
            active: true,
          },
        ]),
      ),
    });
    expect(text()).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.NOT_AVAILABLE);
    expect(text()).not.toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.LOCATION.UNASSIGNED);
  });

  // ── Regressions from the Copilot review on #304 ─────────────────────────────────────

  it('never lets allowedActions bypass the deactivate permission', async () => {
    await setup({ permissions: ALL_PERMISSIONS.filter(p => p !== DEACTIVATE_PERMISSION) });
    // The server may say the action is available; the permission gate is independent and
    // still refuses (ADR-0040 §6a). `allowedActions` is a rendering hint, never authority.
    const permitted = row({ status: 'ACTIVE', allowedActions: ['DISABLE'] });
    expect(component.canSwitch(permitted)).toBe(false);

    component.openConfirm(permitted);
    expect(component.confirmRow()).toBeNull();
    component.confirmDeactivate();
    expect(stubService.disableEmployee).not.toHaveBeenCalled();
  });

  it('settles both rows when two deactivations are confirmed concurrently', async () => {
    await setup();
    const first = new Subject<unknown>();
    const second = new Subject<unknown>();
    stubService.disableEmployee.mockReturnValueOnce(first).mockReturnValueOnce(second);

    component.openConfirm(STUB_ROWS[0]);
    component.confirmDeactivate();
    const other = row({ employeeId: 'emp-5', firstName: 'Terrence', lastName: 'Blake' });
    component.openConfirm(other);
    component.confirmDeactivate();

    expect(component.isPending(STUB_ROWS[0])).toBe(true);
    expect(component.isPending(other)).toBe(true);

    // The second confirm must not cancel the first: a shared subscription slot would leave
    // row one pending forever, its handlers never run (ADR-0063).
    second.next({});
    second.complete();
    expect(component.isPending(other)).toBe(false);
    expect(component.isPending(STUB_ROWS[0])).toBe(true);

    first.next({});
    first.complete();
    expect(component.isPending(STUB_ROWS[0])).toBe(false);
  });

  it('shows the empty state when the status filter matches nothing, and returns to ready', async () => {
    await setup({ search: of(page([row({ status: 'ACTIVE' })])) });
    expect(component.viewState()).toBe('ready');

    component.setStatusFilter('TERMINATED');
    fixture.detectChanges();
    // The read succeeded, but the client-side filter (backend #2158) matched nothing, so the
    // page must offer the empty panel and its clear-filters action rather than a blank table.
    expect(component.viewState()).toBe('empty');
    expect(text()).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.EMPTY);

    component.setStatusFilter('ACTIVE');
    fixture.detectChanges();
    expect(component.viewState()).toBe('ready');
  });

  it('does not offer the directory fallback to a viewer who cannot open the directory', async () => {
    await setup({
      permissions: [VIEW_PERMISSION],
      search: throwError(() => new HttpErrorResponse({ status: 403 })),
    });
    expect(component.viewState()).toBe('forbidden');
    expect(component.canViewDirectory()).toBe(false);
    // A rendered link must never lead to another refusal — the directory declares
    // people-contact:person:view, which this viewer lacks.
    expect(fixture.debugElement.queryAll(By.css('a[href="/app/people/directory"]')).length).toBe(0);
    expect(text()).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.FORBIDDEN.BODY_NO_DIRECTORY);
  });

  it('offers the directory fallback when the viewer holds its permission', async () => {
    await setup({
      permissions: [VIEW_PERMISSION, 'people-contact:person:view'],
      search: throwError(() => new HttpErrorResponse({ status: 403 })),
    });
    expect(component.canViewDirectory()).toBe(true);
    expect(fixture.debugElement.queryAll(By.css('a[href="/app/people/directory"]')).length).toBe(1);
  });

  it('refuses to build a mailto target from an untrustworthy address (ADR-0065)', async () => {
    await setup();
    expect(component.mailtoHref('renee.albright@durion.internal')).toBe(
      'mailto:renee.albright@durion.internal',
    );
    expect(component.mailtoHref(null)).toBeNull();
    expect(component.mailtoHref('')).toBeNull();
    // Header injection, a smuggled second recipient, and control-character tricks.
    expect(component.mailtoHref('a@b.com?bcc=attacker@evil.example')).toBeNull();
    expect(component.mailtoHref('a@b.com,attacker@evil.example')).toBeNull();
    expect(component.mailtoHref('java\tscript:alert(1)')).toBeNull();
    expect(component.mailtoHref('not-an-email')).toBeNull();
  });

  it('renders an unsafe address as plain text instead of a link', async () => {
    await setup({
      search: of(page([row({ email: 'a@b.com?bcc=attacker@evil.example' })])),
    });
    expect(fixture.debugElement.queryAll(By.css('.register-email-link')).length).toBe(0);
    expect(fixture.debugElement.queryAll(By.css('.register-email-plain')).length).toBe(1);
  });

  it('offers a real way back after a 409 rather than claiming a refresh that never happened', async () => {
    await setup();
    stubService.disableEmployee.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );

    component.openConfirm(STUB_ROWS[0]);
    component.confirmDeactivate();
    fixture.detectChanges();

    expect(component.errorKey()).toBe('PEOPLE.EMPLOYEE_REGISTER.ERROR.CONFLICT');
    // The page does not re-read by itself here — the error panel replaces the table, so an
    // automatic reload would flash the explanation away before it could be read. The copy
    // must therefore not claim a refresh, and must point at the control that performs one.
    const copy = enUS.PEOPLE.EMPLOYEE_REGISTER.ERROR.CONFLICT;
    expect(copy).not.toMatch(/refreshed/i);
    expect(copy).toContain(enUS.COMMON.RETRY);

    const before = stubService.searchEmployees.mock.calls.length;
    fixture.debugElement
      .query(By.css('.register-state--error .register-state__btn'))
      .nativeElement.click();
    expect(stubService.searchEmployees.mock.calls.length).toBe(before + 1);
  });

  // ── Focus and pagination (round three) ──────────────────────────────────────────────

  it('hands focus back to the opener when the confirm is cancelled', async () => {
    await setup();
    const toggle = fixture.debugElement.query(By.css('.status-switch')).nativeElement as HTMLElement;
    toggle.focus();
    toggle.click();
    fixture.detectChanges();

    component.cancelConfirm();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));

    // Closing removes the focused dialog; without a restore, focus falls to <body> and the
    // keyboard user is stranded behind the page (ADR-0029 §8.7).
    expect(document.activeElement).toBe(toggle);
  });

  it('falls back to a stable control when the opener no longer exists after confirming', async () => {
    await setup();
    const toggle = fixture.debugElement.query(By.css('.status-switch')).nativeElement as HTMLElement;
    toggle.focus();
    component.openConfirm(STUB_ROWS[0]);
    fixture.detectChanges();

    // Confirming replaces the row's switch with the pending label, so the opener is gone.
    stubService.disableEmployee.mockReturnValue(new Subject<unknown>());
    component.confirmDeactivate();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));

    expect(toggle.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('register-search-input'));
  });

  it('clamps the page index when a re-read returns fewer rows', async () => {
    const many = Array.from({ length: 26 }, (_, i) =>
      row({ employeeId: `emp-${i}`, personId: `per-${i}`, lastName: `Name${`${i}`.padStart(2, '0')}` }),
    );
    await setup({ search: of(page(many)) });
    component.nextPage();
    expect(component.pageIndex()).toBe(1);
    expect(component.paged().length).toBe(1);

    // The 26th row disappears — totalPages drops to 1 while pageIndex still points at page 2,
    // which would slice an empty window out of an otherwise ready page.
    stubService.searchEmployees.mockReturnValue(of(page(many.slice(0, 25))));
    component.reload();
    fixture.detectChanges();

    expect(component.pageIndex()).toBe(0);
    expect(component.paged().length).toBe(25);
    expect(component.viewState()).toBe('ready');
  });

  // ── i18n (ADR-0030) ─────────────────────────────────────────────────────────────────

  it('resolves every key the template uses in the shipped bundle', () => {
    const block = enUS.PEOPLE.EMPLOYEE_REGISTER;
    for (const status of ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'DISABLED'] as const) {
      expect(block.STATUS[status]).toBeTruthy();
    }
    for (const filter of ['ALL', 'ACTIVE', 'DISABLED', 'TERMINATED'] as const) {
      expect(block.FILTER[filter]).toBeTruthy();
    }
    expect(block.SCOPE.GLOBAL).toBeTruthy();
    expect(block.SCOPE.LOCATION).toBeTruthy();
    expect(block.SWITCH.DEACTIVATE).toContain('{{name}}');
    expect(block.CONFIRM.TITLE).toContain('{{name}}');
    expect(block.LOCATION.MORE).toContain('{{count}}');
    expect(block.TRUNCATED).toContain('{{loaded}}');
  });
});
