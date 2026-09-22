import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DebugElement } from '@angular/core';
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
    otherLocationCount: 1,
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

  it('lets the backend capability flags narrow the gates but never widen them', async () => {
    await setup();
    // A DISABLED row the backend says may be enabled still offers no DISABLE action…
    expect(component.canSwitch(row({ status: 'DISABLED', allowedActions: ['ENABLE'] }))).toBe(false);
    // …an ACTIVE row the backend refuses is not switchable despite the permission…
    expect(component.canSwitch(row({ status: 'ACTIVE', allowedActions: ['UPDATE'] }))).toBe(false);
    expect(component.canSwitch(row({ status: 'ACTIVE', allowedActions: ['DISABLE'] }))).toBe(true);
    // …and a stale or malformed DISABLE on a row the lifecycle forbids does not resurrect
    // the switch, which would send the disable a second time.
    expect(component.canSwitch(row({ status: 'DISABLED', allowedActions: ['DISABLE'] }))).toBe(false);
    expect(component.canSwitch(row({ status: 'TERMINATED', allowedActions: ['DISABLE'] }))).toBe(false);
    expect(component.canSwitch(row({ status: 'ON_LEAVE', allowedActions: ['DISABLE'] }))).toBe(false);
  });

  it('withholds a row\'s PII when the projection omits VIEW_PII for it', async () => {
    const withheld = row({ employeeId: 'emp-9', personId: 'per-9', allowedActions: ['UPDATE'] });
    await setup({ search: of(page([withheld])) });

    // The permission is held page-wide, but this row's capability list does not grant it.
    expect(component.canViewPii()).toBe(true);
    expect(component.canViewPiiFor(withheld)).toBe(false);
    expect(text()).not.toContain('renee.albright@durion.internal');
    expect(text()).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.RESTRICTED);
    expect(fixture.debugElement.queryAll(By.css('.register-name-link')).length).toBe(0);

    // A row that does grant it still renders normally.
    expect(component.canViewPiiFor(row({ allowedActions: ['VIEW_PII'] }))).toBe(true);
    // …and no capability list at all falls back to the permission alone.
    expect(component.canViewPiiFor(row())).toBe(true);
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

  it('reports a failed deactivate on the row that attempted it, not on the page', async () => {
    await setup();
    stubService.disableEmployee.mockReturnValue(throwError(() => new Error('boom')));

    component.openConfirm(STUB_ROWS[0]);
    component.confirmDeactivate();
    fixture.detectChanges();

    // ADR-0063: the write outcome belongs to its writer. The page's state/errorKey is the READ
    // outcome and must be left alone, or the table disappears and the other rows go with it.
    expect(component.writeErrorFor(STUB_ROWS[0])).toBe('PEOPLE.EMPLOYEE_REGISTER.ERROR.DEACTIVATE');
    expect(component.viewState()).toBe('ready');
    expect(component.errorKey()).toBeNull();
    expect(component.isPending(STUB_ROWS[0])).toBe(false);
    expect(text()).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.ERROR.DEACTIVATE);
  });

  it('names the concurrency conflict distinctly on a 409, and re-reads (DECISION-PEOPLE-017)', async () => {
    await setup();
    stubService.disableEmployee.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );
    const readsBefore = stubService.searchEmployees.mock.calls.length;

    component.openConfirm(STUB_ROWS[0]);
    component.confirmDeactivate();
    fixture.detectChanges();

    expect(component.writeErrorFor(STUB_ROWS[0])).toBe('PEOPLE.EMPLOYEE_REGISTER.ERROR.CONFLICT');
    // The row moved under us, so the page re-reads to show what the server holds — and the
    // refusal survives it, because it lives on the row rather than in the page panel the
    // read settles. That is what makes the automatic reload safe here.
    expect(stubService.searchEmployees.mock.calls.length).toBe(readsBefore + 1);
    expect(component.viewState()).toBe('ready');
    expect(text()).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.ERROR.CONFLICT.split('.')[0]);
  });

  it("never lets one row's success erase another row's refusal", async () => {
    await setup();
    const failing = new Subject<unknown>();
    const succeeding = new Subject<unknown>();
    stubService.disableEmployee.mockReturnValueOnce(failing).mockReturnValueOnce(succeeding);

    component.openConfirm(STUB_ROWS[0]);
    component.confirmDeactivate();
    component.openConfirm(row({ employeeId: 'emp-5', personId: 'per-5', lastName: 'Cole' }));
    component.confirmDeactivate();

    failing.error(new HttpErrorResponse({ status: 409 }));
    expect(component.writeErrorFor(STUB_ROWS[0])).toBe('PEOPLE.EMPLOYEE_REGISTER.ERROR.CONFLICT');

    // emp-5 settling re-reads the page. With a page-level errorKey that read cleared emp-1's
    // refusal and left its switch looking ordinary — the failure vanished with no retry path.
    succeeding.next({});
    succeeding.complete();
    fixture.detectChanges();

    expect(component.writeErrorFor(STUB_ROWS[0])).toBe('PEOPLE.EMPLOYEE_REGISTER.ERROR.CONFLICT');
    expect(component.writeErrorFor(row({ employeeId: 'emp-5' }))).toBeNull();
  });

  it('clears row refusals when the user asks for the page again', async () => {
    await setup();
    stubService.disableEmployee.mockReturnValue(throwError(() => new Error('boom')));
    component.openConfirm(STUB_ROWS[0]);
    component.confirmDeactivate();
    expect(component.writeErrorFor(STUB_ROWS[0])).not.toBeNull();

    component.reload();
    expect(component.writeErrorFor(STUB_ROWS[0])).toBeNull();
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

  it('never lets a slow first response overwrite a newer one', async () => {
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

  /*
   * What the test above does and does not prove, since the distinction was got wrong once.
   *
   * `load()` unsubscribes the previous read before starting the next, so the late emission is
   * never delivered at all: this passes with the `seq` guard deleted. It is real coverage of
   * the guarantee — a superseded response cannot land — but it is NOT coverage of the guard.
   *
   * No source-based test can be: RxJS closes the subscriber on unsubscribe, so a stale `next`
   * cannot reach the handler through any observable the service could return. The guard stays
   * as defence for a source that outlives its subscription (a shared/replayed stream, a
   * non-cancellable promise adapter) — a refactor away, not reachable today. It is not claimed
   * as tested anywhere.
   */

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
    // Percent-encoding decodes back into CRLF + a header in the mail client, so the encoded
    // forms have to be refused too — rejecting the plain separators alone is not enough.
    expect(component.mailtoHref('a@b.com%0d%0abcc=attacker%40evil.example')).toBeNull();
    expect(component.mailtoHref('a@b.com%3Fbcc=attacker@evil.example')).toBeNull();
    expect(component.mailtoHref('a%40b.com')).toBeNull();
    expect(component.mailtoHref('not-an-email')).toBeNull();
  });

  it('renders an unsafe address as plain text instead of a link', async () => {
    await setup({
      search: of(page([row({ email: 'a@b.com?bcc=attacker@evil.example' })])),
    });
    expect(fixture.debugElement.queryAll(By.css('.register-email-link')).length).toBe(0);
    expect(fixture.debugElement.queryAll(By.css('.register-email-plain')).length).toBe(1);
  });

  it('describes the 409 outcome the page actually produces', async () => {
    // The copy claimed a refresh that never happened for two rounds, then pointed at a Retry
    // button; the page now really does re-read, so it must say that and must not send the
    // user to a control that is no longer part of this path.
    const copy = enUS.PEOPLE.EMPLOYEE_REGISTER.ERROR.CONFLICT;
    expect(copy).toMatch(/reloaded/i);
    expect(copy).not.toContain(enUS.COMMON.RETRY);
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

  it('never carries stale counts over a loading, error or forbidden panel', async () => {
    // A truncated first read leaves allRows/totalElements cached…
    await setup({ search: of({ ...page(), totalElements: 900 }) });
    expect(component.showTruncationNotice()).toBe(true);
    const notice = enUS.PEOPLE.EMPLOYEE_REGISTER.TRUNCATED.split('{{')[0].trim();
    expect(text()).toContain(notice);

    // …and a later failure must not describe them above the panel explaining the failure.
    stubService.searchEmployees.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    component.reload();
    fixture.detectChanges();

    expect(component.viewState()).toBe('forbidden');
    expect(component.truncated()).toBe(true); // the cache is still there…
    expect(component.showTruncationNotice()).toBe(false); // …but it is not announced
    expect(text()).not.toContain(notice);
  });

  it('says "Primary" when the projection served a zero location count', async () => {
    const served = row({
      employeeId: 'emp-a',
      primaryLocation: 'Charlotte Main',
      otherLocationCount: null,
    });
    await setup({ search: of(page([served])) });
    expect(text()).toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.LOCATION.PRIMARY);
  });

  it('never claims "Primary" for a location count the projection did not send', async () => {
    // "Primary" asserts there are no other locations. An absent count is not a zero, so the
    // cell shows the location it was given and claims nothing further (ADR-0064).
    const absent = row({
      employeeId: 'emp-b',
      primaryLocation: 'Charlotte Main',
      otherLocationCount: undefined,
    });
    await setup({ search: of(page([absent])) });
    expect(text()).toContain('Charlotte Main');
    expect(text()).not.toContain(enUS.PEOPLE.EMPLOYEE_REGISTER.LOCATION.PRIMARY);
  });

  // ── Row identity (round seven) ──────────────────────────────────────────────────────

  it('never lets a nameless row produce a blank control name', async () => {
    const nameless = row({
      employeeId: 'emp-7',
      personId: 'per-7',
      firstName: null,
      lastName: null,
      employeeNumber: 'EMP-99001',
    });
    await setup({ search: of(page([nameless])) });

    // An empty displayName is interpolated into every one of the row's accessible names,
    // giving "Profile for " and "Deactivate  (Active)" — indistinguishable in a links list.
    expect(component.displayName(nameless)).toBe('EMP-99001');
    const action = fixture.debugElement.query(By.css('.register-action'));
    expect(action.nativeElement.getAttribute('aria-label')).toContain('EMP-99001');
  });

  it('falls back to localized copy when a row has neither a name nor a number', async () => {
    const anonymous = row({
      employeeId: 'emp-8',
      personId: 'per-8',
      firstName: null,
      lastName: null,
      employeeNumber: null,
    });
    await setup({ search: of(page([anonymous])) });

    expect(component.displayName(anonymous)).toBe(enUS.PEOPLE.EMPLOYEE_REGISTER.UNNAMED);
    const action = fixture.debugElement.query(By.css('.register-action'));
    expect(action.nativeElement.getAttribute('aria-label')).toContain(
      enUS.PEOPLE.EMPLOYEE_REGISTER.UNNAMED,
    );
  });

  // ── Mobile card layout (round six) ──────────────────────────────────────────────────

  it('carries its column name on every data cell so the mobile cards stay labelled', async () => {
    await setup();
    const headers = fixture.debugElement
      .queryAll(By.css('.register-th'))
      .map((h: DebugElement) => (h.nativeElement.textContent ?? '').replace(/[\u2191\u2193]/g, '').trim());
    const cells = fixture.debugElement
      .queryAll(By.css('.register-row:first-of-type .register-td'))
      .map((c: DebugElement) => c.nativeElement as HTMLElement);

    expect(cells.length).toBe(headers.length);

    // Below 720px `thead` is display:none and each cell's `data-label` is the only
    // thing naming the field, so a cell that loses it becomes an unlabelled value on
    // a phone. Asserted against the header text, which comes from the shipped bundle.
    for (let i = 1; i < cells.length - 1; i++) {
      expect(cells[i].getAttribute('data-label')).toBe(headers[i]);
      expect(cells[i].getAttribute('data-label')).not.toContain('EMPLOYEE_REGISTER.');
    }

    // The name titles the card and the actions close it — labelling those would read
    // as "Name: Albright, Renee" above the card's own heading.
    expect(cells[0].getAttribute('data-label')).toBeNull();
    expect(cells[cells.length - 1].getAttribute('data-label')).toBeNull();
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
