import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { TimeApprovalPageComponent } from './time-approval-page.component';
import { PeopleService } from '../../services/people.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PEOPLE_SECTION } from '../../../../core/security/route-permissions';
import enUS from '../../../../../assets/i18n/en-US.json';

/** `null` = token without a permission claim (permissions unknown), as in AuthService. */
const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(permission => session.permissions?.includes(permission) ?? false),
};

describe('TimeApprovalPageComponent', () => {
  let fixture: ComponentFixture<TimeApprovalPageComponent>;
  let component: TimeApprovalPageComponent;
  let peopleService: {
    listApprovalPeople: ReturnType<typeof vi.fn>;
    listTimePeriods: ReturnType<typeof vi.fn>;
    listTimekeepingEntries: ReturnType<typeof vi.fn>;
    getTimePeriodApproval: ReturnType<typeof vi.fn>;
    getPerson: ReturnType<typeof vi.fn>;
    approveTimePeriod: ReturnType<typeof vi.fn>;
    rejectTimePeriod: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();

    peopleService = {
      listApprovalPeople: vi.fn().mockReturnValue(of([{ personId: 'p1', displayName: 'Alice', employeeNumber: 'E001' }])),
      listTimePeriods: vi.fn().mockReturnValue(of([{ timePeriodId: 't1', status: 'SUBMISSION_CLOSED', startDate: '2024-01-01', endDate: '2024-01-31' }])),
      listTimekeepingEntries: vi.fn().mockReturnValue(of([{ timekeepingEntryId: 'e1', approvalStatus: 'PENDING_APPROVAL', sessionStartTime: '2024-01-10T08:00:00Z', sessionEndTime: '2024-01-10T17:00:00Z' }])),
      getTimePeriodApproval: vi.fn().mockReturnValue(of({ personId: 'p1', timePeriodId: 't1', overallStatus: 'PENDING_APPROVAL', totalCount: 1, pendingCount: 1, approvedCount: 0, rejectedCount: 0 })),
      approveTimePeriod: vi.fn().mockReturnValue(of({ status: 'ok' })),
      rejectTimePeriod: vi.fn().mockReturnValue(of({ status: 'ok' })),
      getPerson: vi.fn().mockReturnValue(of({ firstName: 'Bea', lastName: 'Nolan' })),
    };
    session.permissions = null;

    await TestBed.configureTestingModule({
      imports: [TimeApprovalPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: peopleService },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    TestBed.inject(TranslateService).use('en-US');

    fixture = TestBed.createComponent(TimeApprovalPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('preselects the person the employee register linked here for', async () => {
    // The register's row action is named "Time for <employee>". If this page ignores the
    // person on the URL, that link opens an empty form and the name is a false promise.
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TimeApprovalPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: peopleService },
        { provide: AuthService, useValue: authStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ personId: 'p1' }) } },
        },
      ],
    }).compileComponents();

    const linked = TestBed.createComponent(TimeApprovalPageComponent);
    linked.detectChanges();

    expect(linked.componentInstance.selectionForm.getRawValue().personId).toBe('p1');
  });

  it('T1: renders page heading with approval text', () => {
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1.textContent).toMatch(/approval/i);
  });

  it('T2: loads people list on init − person-select shows placeholder plus one option per person', () => {
    expect(peopleService.listApprovalPeople).toHaveBeenCalled();
    expect(component.people().length).toBe(1);
    const options = fixture.nativeElement.querySelectorAll('[data-testid="person-select"] option');
    expect(options.length).toBe(2); // placeholder + 1 person
  });

  it('T3: loads time periods on init − period-select shows placeholder plus one option per period', () => {
    expect(peopleService.listTimePeriods).toHaveBeenCalled();
    expect(component.periods().length).toBe(1);
    const options = fixture.nativeElement.querySelectorAll('[data-testid="period-select"] option');
    expect(options.length).toBe(2); // placeholder + 1 period
  });

  it('T4: approve-btn is not in DOM when no selection is made', () => {
    const approveBtn = fixture.nativeElement.querySelector('[data-testid="approve-btn"]');
    expect(approveBtn).toBeNull();
  });

  it('T5: setting personId + timePeriodId triggers loadDetail (get called for entries URL)', () => {
    component.selectionForm.patchValue({ personId: 'p1', timePeriodId: 't1' });
    fixture.detectChanges();
    expect(peopleService.listTimekeepingEntries).toHaveBeenCalledWith('p1', 't1');
  });

  it('T6: shows entries-table when entries are loaded', () => {
    component.selectionForm.patchValue({ personId: 'p1', timePeriodId: 't1' });
    fixture.detectChanges();
    const table = fixture.nativeElement.querySelector('[data-testid="entries-table"]');
    expect(table).toBeTruthy();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="entry-row"]');
    expect(rows.length).toBe(1);
  });

  it('T7: shows history-table when approvalHistory has items', () => {
    component.selectionForm.patchValue({ personId: 'p1', timePeriodId: 't1' });
    fixture.detectChanges();
    const table = fixture.nativeElement.querySelector('[data-testid="history-table"]');
    expect(table).toBeTruthy();
  });

  it('T8: clicking reject-btn opens reject-dialog', () => {
    component.selectionForm.patchValue({ personId: 'p1', timePeriodId: 't1' });
    fixture.detectChanges();
    const rejectBtn = fixture.nativeElement.querySelector('[data-testid="reject-btn"]');
    expect(rejectBtn).toBeTruthy();
    rejectBtn.click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="reject-dialog"]');
    expect(dialog).toBeTruthy();
  });

  it('T9: submit-reject-btn calls rejectTimePeriod and closes dialog on success', () => {
    component.selectionForm.patchValue({ personId: 'p1', timePeriodId: 't1' });
    fixture.detectChanges();
    component.openRejectDialog();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="reject-dialog"]')).toBeTruthy();
    const submitBtn = fixture.nativeElement.querySelector('[data-testid="submit-reject-btn"]');
    submitBtn.click();
    fixture.detectChanges();
    expect(peopleService.rejectTimePeriod).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="reject-dialog"]')).toBeNull();
  });

  it('T10: shows action-error when approvePeriod fails', () => {
    peopleService.approveTimePeriod.mockReturnValue(
      throwError(() => ({ error: { message: 'Approve failed' } })),
    );
    component.selectionForm.patchValue({ personId: 'p1', timePeriodId: 't1' });
    fixture.detectChanges();
    component.approvePeriod();
    fixture.detectChanges();
    const errEl = fixture.nativeElement.querySelector('[data-testid="action-error"]');
    expect(errEl).toBeTruthy();
    expect(errEl.textContent).toContain('Approve failed');
  });

  describe('decision permissions', () => {
    const APPROVE = PEOPLE_SECTION.timeApprove[0];
    const REJECT = PEOPLE_SECTION.timeReject[0];
    const btn = (id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;
    const selectWith = (permissions: string[]) => {
      // Set before the selection so the decision predicates recompute when the detail loads.
      session.permissions = permissions;
      component.selectionForm.patchValue({ personId: 'p1', timePeriodId: 't1' });
      fixture.detectChanges();
    };

    it('enables approve and allows the call for a session holding people:timekeeping:approve', () => {
      selectWith(['people:timekeeping:view', APPROVE]);

      expect(btn('approve-btn').disabled).toBe(false);
      component.approvePeriod();
      expect(peopleService.approveTimePeriod).toHaveBeenCalledExactlyOnceWith('t1', 'p1');
    });

    it('disables approve and refuses the method without people:timekeeping:approve', () => {
      selectWith(['people:timekeeping:view', REJECT]);

      expect(btn('approve-btn').disabled).toBe(true);
      component.approvePeriod();
      expect(peopleService.approveTimePeriod).not.toHaveBeenCalled();
    });

    it('enables reject and allows the call for a session holding people:timekeeping:reject', () => {
      selectWith(['people:timekeeping:view', REJECT]);

      expect(btn('reject-btn').disabled).toBe(false);
      component.openRejectDialog();
      component.rejectForm.setValue({ comments: 'Missing punch-out' });
      component.submitReject();
      expect(peopleService.rejectTimePeriod).toHaveBeenCalledExactlyOnceWith('t1', 'p1', { reason: 'Missing punch-out' });
    });

    it('disables reject and refuses both reject methods without people:timekeeping:reject', () => {
      selectWith(['people:timekeeping:view', APPROVE]);

      expect(btn('reject-btn').disabled).toBe(true);
      component.openRejectDialog();
      expect(component.showRejectDialog()).toBe(false);
      component.submitReject();
      expect(peopleService.rejectTimePeriod).not.toHaveBeenCalled();
    });
  });

  describe('employee named by ?personId=', () => {
    const openFor = async (personId: string) => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [TimeApprovalPageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: PeopleService, useValue: peopleService },
          { provide: AuthService, useValue: authStub },
          { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ personId }) } } },
        ],
      }).compileComponents();
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en-US', enUS);
      translate.use('en-US');
      const linked = TestBed.createComponent(TimeApprovalPageComponent);
      linked.detectChanges();
      await linked.whenStable();
      linked.detectChanges();
      return linked;
    };
    const select = (f: ComponentFixture<TimeApprovalPageComponent>) =>
      f.nativeElement.querySelector('[data-testid="person-select"]') as HTMLSelectElement;
    const requestedOption = (f: ComponentFixture<TimeApprovalPageComponent>) =>
      f.nativeElement.querySelector('[data-testid="requested-person-option"]') as HTMLOptionElement | null;

    it('adds and selects an employee with no time entries, named from the person record', async () => {
      // The approval-people list only holds employees with entries; p9 has none yet.
      const linked = await openFor('p9');

      expect(peopleService.getPerson).toHaveBeenCalledExactlyOnceWith('p9');
      expect(requestedOption(linked)?.value).toBe('p9');
      expect(requestedOption(linked)?.textContent?.trim())
        .toBe(enUS.PEOPLE.TIME_APPROVAL.REQUESTED_EMPLOYEE_OPTION.replace('{{name}}', 'Bea Nolan'));
      expect(select(linked).value).toBe('p9');
    });

    it('adds no extra option, and looks nobody up, when the employee is already listed', async () => {
      const linked = await openFor('p1');

      expect(requestedOption(linked)).toBeNull();
      expect(peopleService.getPerson).not.toHaveBeenCalled();
      expect(select(linked).value).toBe('p1');
    });

    it('keeps a generic label without a lookup when the session lacks person view', async () => {
      session.permissions = ['people:timekeeping:view'];
      const linked = await openFor('p9');

      expect(PEOPLE_SECTION.personLookup.some(p => session.permissions?.includes(p))).toBe(false);
      expect(peopleService.getPerson).not.toHaveBeenCalled();
      expect(requestedOption(linked)?.textContent?.trim()).toBe(enUS.PEOPLE.TIME_APPROVAL.REQUESTED_EMPLOYEE_FALLBACK);
      expect(select(linked).value).toBe('p9');
    });

    it('keeps the generic label when the person record has only blank names', async () => {
      peopleService.getPerson.mockReturnValue(of({ firstName: '  ', lastName: '' }));
      const linked = await openFor('p9');

      expect(requestedOption(linked)?.textContent?.trim()).toBe(enUS.PEOPLE.TIME_APPROVAL.REQUESTED_EMPLOYEE_FALLBACK);
    });

    it('keeps the generic label when the person lookup fails', async () => {
      peopleService.getPerson.mockReturnValue(throwError(() => ({ status: 404 })));
      const linked = await openFor('p9');

      // The lookup ran and failed; the label is the handled fallback, not an untouched default.
      expect(peopleService.getPerson).toHaveBeenCalledExactlyOnceWith('p9');
      expect(requestedOption(linked)?.textContent?.trim()).toBe(enUS.PEOPLE.TIME_APPROVAL.REQUESTED_EMPLOYEE_FALLBACK);
      expect(select(linked).value).toBe('p9');
    });
  });

  it('says no pay periods exist yet when the list is empty', async () => {
    peopleService.listTimePeriods.mockReturnValue(of([]));
    component.loadPeriods();
    TestBed.inject(TranslateService).setTranslation('en-US', enUS);
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('[data-testid="periods-empty"]') as HTMLElement;
    expect(empty.textContent).toContain(enUS.PEOPLE.TIME_APPROVAL.PERIODS_EMPTY);
    // Points at the admin page that can create the first period.
    expect(empty.querySelector('[data-testid="manage-periods-link"]')?.getAttribute('href'))
      .toBe('/app/people/timekeeping/periods');
  });

  it('omits the empty parentheses when an employee has no number', () => {
    peopleService.listApprovalPeople.mockReturnValue(of([{ personId: 'p2', displayName: 'Cy' }]));
    component.loadPeople();
    fixture.detectChanges();

    const option = fixture.nativeElement.querySelectorAll('[data-testid="person-select"] option')[1] as HTMLOptionElement;
    expect(option.textContent?.trim()).toBe('Cy');
  });
});
