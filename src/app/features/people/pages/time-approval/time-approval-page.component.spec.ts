import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TimeApprovalPageComponent } from './time-approval-page.component';
import { PeopleService } from '../../services/people.service';

describe('TimeApprovalPageComponent', () => {
  let fixture: ComponentFixture<TimeApprovalPageComponent>;
  let component: TimeApprovalPageComponent;
  let peopleService: {
    listApprovalScopedPeople: ReturnType<typeof vi.fn>;
    listTimePeriods: ReturnType<typeof vi.fn>;
    listTimekeepingEntries: ReturnType<typeof vi.fn>;
    listTimePeriodApprovals: ReturnType<typeof vi.fn>;
    approveTimePeriod: ReturnType<typeof vi.fn>;
    rejectTimePeriod: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();

    peopleService = {
      listApprovalScopedPeople: vi.fn().mockReturnValue(
        of({ items: [{ personId: 'p1', displayName: 'Alice', employeeNumber: 'E001' }] }),
      ),
      listTimePeriods: vi.fn().mockReturnValue(
        of({ items: [{ id: 't1', status: 'SUBMISSION_CLOSED', periodStartAt: '2024-01-01', periodEndAt: '2024-01-31' }] }),
      ),
      listTimekeepingEntries: vi.fn().mockReturnValue(
        of({ items: [{ timeEntryId: 'e1', status: 'PENDING_APPROVAL', clockInAt: '08:00', clockOutAt: '17:00', locationId: 'loc-1' }] }),
      ),
      listTimePeriodApprovals: vi.fn().mockReturnValue(
        of({ items: [{ outcome: 'APPROVED', approvedAt: '2024-01-15' }] }),
      ),
      approveTimePeriod: vi.fn().mockReturnValue(of({ status: 'ok' })),
      rejectTimePeriod: vi.fn().mockReturnValue(of({ status: 'ok' })),
    };

    await TestBed.configureTestingModule({
      imports: [TimeApprovalPageComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: peopleService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TimeApprovalPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('T1: renders page heading with approval text', () => {
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1.textContent).toMatch(/approval/i);
  });

  it('T2: loads people list on init − person-select shows placeholder plus one option per person', () => {
    expect(peopleService.listApprovalScopedPeople).toHaveBeenCalledTimes(1);
    expect(component.people().length).toBe(1);
    const options = fixture.nativeElement.querySelectorAll('[data-testid="person-select"] option');
    expect(options.length).toBe(2); // placeholder + 1 person
  });

  it('T3: loads time periods on init − period-select shows placeholder plus one option per period', () => {
    expect(peopleService.listTimePeriods).toHaveBeenCalledTimes(1);
    expect(component.periods().length).toBe(1);
    const options = fixture.nativeElement.querySelectorAll('[data-testid="period-select"] option');
    expect(options.length).toBe(2); // placeholder + 1 period
  });

  it('T4: approve-btn is not in DOM when no selection is made', () => {
    const approveBtn = fixture.nativeElement.querySelector('[data-testid="approve-btn"]');
    expect(approveBtn).toBeNull();
  });

  it('T5: setting personId + timePeriodId triggers loadDetail (listTimekeepingEntries called)', () => {
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

  it('T10: shows action-error when approveTimePeriod fails', () => {
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
});

