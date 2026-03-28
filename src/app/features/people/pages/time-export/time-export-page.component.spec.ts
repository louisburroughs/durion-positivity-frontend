import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TimeExportPageComponent } from './time-export-page.component';
import { PeopleService } from '../../services/people.service';

const stubPeopleService = {
  getApprovedTimeForExport: vi.fn(),
  getAttendanceDiscrepancyReport: vi.fn(),
};

describe('TimeExportPageComponent [CAP-140]', () => {
  let fixture: ComponentFixture<TimeExportPageComponent>;
  let component: TimeExportPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubPeopleService.getApprovedTimeForExport.mockReturnValue(of([{ id: 'exp-1' }]));
    stubPeopleService.getAttendanceDiscrepancyReport.mockReturnValue(of([{ id: 'disc-1' }]));

    await TestBed.configureTestingModule({
      imports: [TimeExportPageComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: stubPeopleService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TimeExportPageComponent);
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

  it('calls getApprovedTimeForExport on init', async () => {
    await setup();
    expect(stubPeopleService.getApprovedTimeForExport).toHaveBeenCalledTimes(1);
  });

  it('renders .export-table', async () => {
    await setup();
    const table = fixture.debugElement.query(By.css('.export-table'));
    expect(table).toBeTruthy();
  });

  it('calls getAttendanceDiscrepancyReport', async () => {
    await setup();
    component.loadDiscrepancies();
    expect(stubPeopleService.getAttendanceDiscrepancyReport).toHaveBeenCalledTimes(1);
  });

  it('shows .empty-state when no data', async () => {
    await setup();
    component.exportData.set([]);
    component.loading.set(false);
    fixture.detectChanges();

    const empty = fixture.debugElement.query(By.css('.empty-state'));
    expect(empty).toBeTruthy();
  });
});
