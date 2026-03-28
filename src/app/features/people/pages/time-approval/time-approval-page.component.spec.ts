import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TimeApprovalPageComponent } from './time-approval-page.component';
import { PeopleService } from '../../services/people.service';

const stubPeopleService = {
  getAllPeople: vi.fn(),
  listPendingTimeEntries: vi.fn(),
  approveTimeEntries: vi.fn(),
  rejectTimeEntries: vi.fn(),
  createAdjustment: vi.fn(),
};

describe('TimeApprovalPageComponent [CAP-139]', () => {
  let fixture: ComponentFixture<TimeApprovalPageComponent>;
  let component: TimeApprovalPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubPeopleService.listPendingTimeEntries.mockReturnValue(of([{ timeEntryId: 'te-1', status: 'PENDING', employeeId: 'emp-1', hours: 8 }]));
    stubPeopleService.approveTimeEntries.mockReturnValue(of({ status: 'ok' }));
    stubPeopleService.rejectTimeEntries.mockReturnValue(of({ status: 'ok' }));
    stubPeopleService.createAdjustment.mockReturnValue(of({ status: 'ok' }));

    await TestBed.configureTestingModule({
      imports: [TimeApprovalPageComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: stubPeopleService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TimeApprovalPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('renders without crashing', async () => {
    await setup();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('calls listPendingTimeEntries on init', async () => {
    await setup();
    expect(stubPeopleService.listPendingTimeEntries).toHaveBeenCalledTimes(1);
  });

  it('renders .entry-list', async () => {
    await setup();
    const list = fixture.debugElement.query(By.css('.entry-list'));
    expect(list).toBeTruthy();
  });

  it('calls approveTimeEntries with correct payload', async () => {
    await setup();
    component.selectedEntries.set(['a', 'b']);
    component.approveSelected();

    expect(stubPeopleService.approveTimeEntries).toHaveBeenCalledWith({ timeEntryIds: ['a', 'b'] });
  });

  it('shows .reject-modal-overlay on reject', async () => {
    await setup();
    const rejectButton = fixture.debugElement.query(By.css('.reject-btn'));
    rejectButton.nativeElement.click();
    fixture.detectChanges();

    const modal = fixture.debugElement.query(By.css('.reject-modal-overlay'));
    expect(modal).toBeTruthy();
  });

  it('calls rejectTimeEntries with selectedEntries and reason', async () => {
    await setup();
    component.selectedEntries.set(['x']);
    component.rejectReason.set('Bad clock in');
    component.submitReject();

    expect(stubPeopleService.rejectTimeEntries).toHaveBeenCalledWith({
      timeEntryIds: ['x'],
      reason: 'Bad clock in',
    });
  });

  it('shows .success-banner after approve', async () => {
    await setup();
    component.selectedEntries.set(['ok']);
    component.approveSelected();
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.success-banner'));
    expect(banner).toBeTruthy();
  });

  // T11 — createAdjustment error path
  it('createAdjustment() sets approveError on failure', async () => {
    await setup();
    stubPeopleService.createAdjustment.mockReturnValue(throwError(() => new Error('fail')));
    component.createAdjustment('te-1', { hours: 8 });
    expect(component.approveError()).toBe('Failed to create adjustment.');
  });
});
