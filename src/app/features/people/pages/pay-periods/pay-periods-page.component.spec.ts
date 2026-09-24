import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CreateTimePeriodRequestStatusEnum,
  TimePeriodDtoStatusEnum,
  TransitionTimePeriodRequestStatusEnum,
  type TimePeriodDto,
} from '@durion-sdk/people';

import { AuthService } from '../../../../core/services/auth.service';
import { LocaleService } from '../../../../core/services/locale.service';
import { PEOPLE_SECTION } from '../../../../core/security/route-permissions';
import { PeopleService } from '../../services/people.service';
import { PayPeriodsPageComponent } from './pay-periods-page.component';
import enUS from '../../../../../assets/i18n/en-US.json';

const TENANT = '01900000-0000-7000-8000-000000000001';
const CREATE = PEOPLE_SECTION.payPeriodCreate[0];
const TRANSITION = PEOPLE_SECTION.payPeriodTransition[0];

const period = (overrides: Partial<TimePeriodDto> = {}): TimePeriodDto => ({
  timePeriodId: 'tp-1',
  tenantId: TENANT,
  status: TimePeriodDtoStatusEnum.Open,
  startDate: '2026-09-01',
  endDate: '2026-09-14',
  ...overrides,
});

const OPEN = period({ timePeriodId: 'tp-open', startDate: '2026-09-15', endDate: '2026-09-28' });
const SUBMITTED = period({ timePeriodId: 'tp-sub', status: TimePeriodDtoStatusEnum.SubmissionClosed });
const CLOSED = period({
  timePeriodId: 'tp-closed', status: TimePeriodDtoStatusEnum.PayrollClosed, startDate: '2026-08-18', endDate: '2026-08-31',
});

/** `null` = token with no permission claim (permissions unknown), as in AuthService. */
const session: { permissions: string[] | null } = { permissions: null };
const tenantSignal = signal<string | null>(TENANT);
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(p => session.permissions?.includes(p) ?? false),
  tenantId: tenantSignal,
};

const peopleStub = {
  listTimePeriods: vi.fn(),
  createTimePeriod: vi.fn(),
  transitionTimePeriod: vi.fn(),
};

describe('PayPeriodsPageComponent', () => {
  let fixture: ComponentFixture<PayPeriodsPageComponent>;
  let component: PayPeriodsPageComponent;
  const q = <T extends Element = HTMLElement>(sel: string) => fixture.nativeElement.querySelector(sel) as T | null;
  const qa = (sel: string) => Array.from(fixture.nativeElement.querySelectorAll(sel)) as HTMLElement[];
  const row = (id: string) => q(`[data-period-id="${id}"]`);
  const button = (id: string, target: string) =>
    row(id)?.querySelector(`button[data-target="${target}"]`) as HTMLButtonElement | null;

  const setup = async (
    opts: { periods?: Observable<TimePeriodDto[]>; permissions?: string[] | null; tenantId?: string | null } = {},
  ) => {
    session.permissions = opts.permissions === undefined ? null : opts.permissions;
    tenantSignal.set(opts.tenantId === undefined ? TENANT : opts.tenantId);
    peopleStub.listTimePeriods.mockReturnValue(opts.periods ?? of([SUBMITTED, OPEN, CLOSED]));

    await TestBed.configureTestingModule({
      imports: [PayPeriodsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: peopleStub },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(PayPeriodsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  describe('list', () => {
    it('lists periods newest first with translated statuses', async () => {
      await setup();

      expect(qa('[data-testid="period-row"]').map(r => r.dataset['periodId'])).toEqual(['tp-open', 'tp-sub', 'tp-closed']);
      expect(row('tp-sub')?.querySelector('.status-badge')?.textContent?.trim())
        .toBe(enUS.PEOPLE.PAY_PERIODS.STATUS.SUBMISSION_CLOSED);
    });

    it('says none exist yet when the list is empty', async () => {
      await setup({ periods: of([]) });

      expect(q('[data-testid="periods-empty"]')?.textContent?.trim()).toBe(enUS.PEOPLE.PAY_PERIODS.EMPTY);
    });

    it('shows a load error with a retry that re-reads', async () => {
      await setup({ periods: throwError(() => ({ status: 500 })) });

      expect(component.state()).toBe('error');
      expect(q('[data-testid="periods-error"]')?.textContent).toContain(enUS.PEOPLE.PAY_PERIODS.ERROR.LOAD);
      peopleStub.listTimePeriods.mockReturnValue(of([OPEN]));
      (q('[data-testid="periods-error"] button') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(peopleStub.listTimePeriods).toHaveBeenCalledTimes(2);
      expect(qa('[data-testid="period-row"]')).toHaveLength(1);
    });

    it('names a 403 as missing permission, not a failure', async () => {
      await setup({ periods: throwError(() => ({ status: 403 })) });

      expect(q('[data-testid="periods-error"]')?.textContent).toContain(enUS.PEOPLE.PAY_PERIODS.ERROR.FORBIDDEN);
    });
  });

  describe('create', () => {
    it('suggests the fourteen days after the newest period', async () => {
      await setup();

      expect(component.createForm.getRawValue()).toEqual(expect.objectContaining({
        startDate: '2026-09-29',
        endDate: '2026-10-12',
      }));
    });

    it('creates for the session tenant, confirms, and re-reads the list', async () => {
      await setup();
      peopleStub.createTimePeriod.mockReturnValue(of(period({ timePeriodId: 'tp-new' })));
      component.createForm.setValue({
        startDate: '2026-10-01', endDate: '2026-10-14', status: CreateTimePeriodRequestStatusEnum.Open,
      });

      (q('[data-testid="create-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(peopleStub.createTimePeriod).toHaveBeenCalledExactlyOnceWith({
        tenantId: TENANT, startDate: '2026-10-01', endDate: '2026-10-14', status: 'OPEN',
      });
      expect(q('[data-testid="create-success"]')?.textContent?.trim()).toBe(enUS.PEOPLE.PAY_PERIODS.CREATE_SUCCESS);
      expect(peopleStub.listTimePeriods).toHaveBeenCalledTimes(2);
    });

    it.each([
      [409, enUS.PEOPLE.PAY_PERIODS.ERROR.OVERLAP],
      [400, enUS.PEOPLE.PAY_PERIODS.ERROR.INVALID_RANGE],
      [500, enUS.PEOPLE.PAY_PERIODS.ERROR.CREATE],
    ])('explains a %i from create', async (status, message) => {
      await setup();
      peopleStub.createTimePeriod.mockReturnValue(throwError(() => ({ status })));

      component.create();
      fixture.detectChanges();

      expect(q('[data-testid="create-error"]')?.textContent?.trim()).toBe(message);
    });

    it('refuses an end date before the start date without calling the server', async () => {
      await setup();
      component.createForm.patchValue({ startDate: '2026-10-14', endDate: '2026-10-01' });

      component.create();
      fixture.detectChanges();

      expect(peopleStub.createTimePeriod).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain(enUS.PEOPLE.PAY_PERIODS.ERROR.END_BEFORE_START);
    });

    it('blocks create when the session carries no tenant', async () => {
      await setup({ tenantId: null });

      expect(q('[data-testid="no-tenant"]')?.textContent?.trim()).toBe(enUS.PEOPLE.PAY_PERIODS.ERROR.NO_TENANT);
      expect((q('[data-testid="create-submit"]') as HTMLButtonElement).disabled).toBe(true);
      component.create();
      expect(peopleStub.createTimePeriod).not.toHaveBeenCalled();
    });

    it('shows the form and allows create for a session holding people:timePeriod:create', async () => {
      await setup({ permissions: [CREATE] });
      peopleStub.createTimePeriod.mockReturnValue(of(period()));

      expect(q('[data-testid="create-section"]')).not.toBeNull();
      component.create();
      expect(peopleStub.createTimePeriod).toHaveBeenCalledTimes(1);
    });

    it('hides the form and refuses the method without people:timePeriod:create', async () => {
      await setup({ permissions: [TRANSITION] });

      expect(component.canCreate()).toBe(false);
      expect(q('[data-testid="create-section"]')).toBeNull();
      component.create();
      expect(peopleStub.createTimePeriod).not.toHaveBeenCalled();
    });
  });

  describe('transitions', () => {
    it('offers only the moves the backend allows for each status', async () => {
      await setup();
      const targets = (id: string) =>
        Array.from(row(id)?.querySelectorAll('button[data-target]') ?? []).map(b => (b as HTMLElement).dataset['target']);

      expect(targets('tp-open')).toEqual(['SUBMISSION_CLOSED', 'PAYROLL_CLOSED']);
      expect(targets('tp-sub')).toEqual(['PAYROLL_CLOSED', 'OPEN']);
      expect(targets('tp-closed')).toEqual([]);
      expect(row('tp-closed')?.textContent).toContain(enUS.PEOPLE.PAY_PERIODS.FINAL);
    });

    it('closes submissions straight away and shows the status the server returned', async () => {
      await setup();
      peopleStub.transitionTimePeriod.mockReturnValue(of({ ...OPEN, status: TimePeriodDtoStatusEnum.SubmissionClosed }));

      button('tp-open', 'SUBMISSION_CLOSED')!.click();
      fixture.detectChanges();

      expect(peopleStub.transitionTimePeriod).toHaveBeenCalledExactlyOnceWith('tp-open', 'SUBMISSION_CLOSED');
      expect(row('tp-open')?.querySelector('.status-badge')?.textContent?.trim())
        .toBe(enUS.PEOPLE.PAY_PERIODS.STATUS.SUBMISSION_CLOSED);
    });

    it('asks before closing payroll, and only a confirm sends it', async () => {
      await setup();
      peopleStub.transitionTimePeriod.mockReturnValue(of({ ...SUBMITTED, status: TimePeriodDtoStatusEnum.PayrollClosed }));

      button('tp-sub', 'PAYROLL_CLOSED')!.click();
      fixture.detectChanges();
      expect(peopleStub.transitionTimePeriod).not.toHaveBeenCalled();
      expect(q('[data-testid="confirm-dialog"]')?.textContent).toContain(enUS.PEOPLE.PAY_PERIODS.CONFIRM.TITLE);

      (q('[data-testid="confirm-yes"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(peopleStub.transitionTimePeriod).toHaveBeenCalledExactlyOnceWith('tp-sub', 'PAYROLL_CLOSED');
      expect(q('[data-testid="confirm-dialog"]')).toBeNull();
    });

    it('sends nothing when the payroll close is cancelled', async () => {
      await setup();

      component.requestTransition(SUBMITTED, TransitionTimePeriodRequestStatusEnum.PayrollClosed);
      component.cancelTransition();
      fixture.detectChanges();

      expect(peopleStub.transitionTimePeriod).not.toHaveBeenCalled();
      expect(q('[data-testid="confirm-dialog"]')).toBeNull();
    });

    it('locks every transition control while one is in flight', async () => {
      await setup();
      const pending = new Subject<TimePeriodDto>();
      peopleStub.transitionTimePeriod.mockReturnValue(pending);

      button('tp-open', 'SUBMISSION_CLOSED')!.click();
      fixture.detectChanges();
      expect(button('tp-sub', 'OPEN')!.disabled).toBe(true);
      component.requestTransition(SUBMITTED, TransitionTimePeriodRequestStatusEnum.Open);
      expect(peopleStub.transitionTimePeriod).toHaveBeenCalledTimes(1);

      pending.next({ ...OPEN, status: TimePeriodDtoStatusEnum.SubmissionClosed });
      fixture.detectChanges();
      expect(button('tp-sub', 'OPEN')!.disabled).toBe(false);
    });

    it('refuses a move the lifecycle does not allow', async () => {
      await setup();

      component.requestTransition(CLOSED, TransitionTimePeriodRequestStatusEnum.Open);

      expect(peopleStub.transitionTimePeriod).not.toHaveBeenCalled();
    });

    it('explains a 409 and re-reads the list', async () => {
      await setup();
      peopleStub.transitionTimePeriod.mockReturnValue(throwError(() => ({ status: 409 })));

      button('tp-open', 'SUBMISSION_CLOSED')!.click();
      fixture.detectChanges();

      expect(q('[data-testid="transition-error"]')?.textContent?.trim())
        .toBe(enUS.PEOPLE.PAY_PERIODS.ERROR.TRANSITION_NOT_ALLOWED);
      expect(peopleStub.listTimePeriods).toHaveBeenCalledTimes(2);
    });

    it('shows transition controls for a session holding people:timePeriod:transition', async () => {
      await setup({ permissions: [TRANSITION] });

      expect(button('tp-open', 'SUBMISSION_CLOSED')).not.toBeNull();
    });

    it('hides transition controls and refuses the method without people:timePeriod:transition', async () => {
      await setup({ permissions: [CREATE] });

      expect(component.canTransition()).toBe(false);
      expect(qa('button[data-target]')).toHaveLength(0);
      component.requestTransition(OPEN, TransitionTimePeriodRequestStatusEnum.SubmissionClosed);
      expect(peopleStub.transitionTimePeriod).not.toHaveBeenCalled();
    });
  });

  describe('dates', () => {
    it('shows date-only values in the chosen locale without shifting the day', async () => {
      await setup({ periods: of([OPEN]) });
      const cells = () => Array.from(row('tp-open')!.querySelectorAll('time')).map(t => t.textContent?.trim());

      // Parsed as a local date: UTC parsing would show Sep 14 west of Greenwich.
      expect(cells()).toEqual(['Sep 15, 2026', 'Sep 28, 2026']);
      expect(row('tp-open')!.querySelector('time')?.getAttribute('datetime')).toBe('2026-09-15');

      TestBed.inject(LocaleService).currentLocale.set('fr-FR');
      fixture.detectChanges();
      expect(cells()).toEqual(['15 sept. 2026', '28 sept. 2026']);
    });
  });

  describe('focus handoff', () => {
    const active = () => document.activeElement as HTMLElement | null;

    it('returns focus to the opener when the payroll close is cancelled', async () => {
      await setup();
      const opener = button('tp-sub', 'PAYROLL_CLOSED')!;
      opener.focus();
      opener.click();
      fixture.detectChanges();

      component.cancelTransition();
      fixture.detectChanges();
      TestBed.tick();

      expect(active()).toBe(button('tp-sub', 'PAYROLL_CLOSED'));
    });

    it('moves focus to the period row after a confirmed payroll close removes its buttons', async () => {
      await setup();
      peopleStub.transitionTimePeriod.mockReturnValue(of({ ...SUBMITTED, status: TimePeriodDtoStatusEnum.PayrollClosed }));
      button('tp-sub', 'PAYROLL_CLOSED')!.click();
      fixture.detectChanges();

      (q('[data-testid="confirm-yes"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      TestBed.tick();

      expect(button('tp-sub', 'PAYROLL_CLOSED')).toBeNull();
      expect(active()).toBe(row('tp-sub')!.querySelector('th'));
    });

    it('moves focus to the period row after an immediate transition', async () => {
      await setup();
      peopleStub.transitionTimePeriod.mockReturnValue(of({ ...OPEN, status: TimePeriodDtoStatusEnum.SubmissionClosed }));

      button('tp-open', 'SUBMISSION_CLOSED')!.click();
      fixture.detectChanges();
      TestBed.tick();

      expect(active()).toBe(row('tp-open')!.querySelector('th'));
    });
  });
});
