import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DiscrepancyReportPageComponent } from './discrepancy-report-page.component';
import { PeopleService } from '../../services/people.service';

describe('DiscrepancyReportPageComponent', () => {
  let fixture: ComponentFixture<DiscrepancyReportPageComponent>;
  let component: DiscrepancyReportPageComponent;
  let peopleService: {
    getAttendanceDiscrepancyReport: ReturnType<typeof vi.fn>;
  };
  let routerMock: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    TestBed.resetTestingModule();

    peopleService = {
      getAttendanceDiscrepancyReport: vi.fn().mockReturnValue(
        of([{ technicianName: 'Alice', locationId: 'loc-1', reportDate: '2024-01-01', totalAttendanceHours: 8, totalJobHours: 7, discrepancyHours: 1, isFlagged: true }]),
      ),
    };
    routerMock = { navigate: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [DiscrepancyReportPageComponent],
      providers: [
        { provide: PeopleService, useValue: peopleService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DiscrepancyReportPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('T1: renders page heading with discrepancy text', () => {
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1.textContent).toMatch(/discrepancy/i);
  });

  it('T2: shows start-date-input and end-date-input in filter form', () => {
    const startInput = fixture.nativeElement.querySelector('[data-testid="start-date-input"]');
    const endInput = fixture.nativeElement.querySelector('[data-testid="end-date-input"]');
    expect(startInput).toBeTruthy();
    expect(endInput).toBeTruthy();
  });

  it('T3: run-report-btn is present', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="run-report-btn"]');
    expect(btn).toBeTruthy();
  });

  it('T4: run-report-btn calls getAttendanceDiscrepancyReport when form is valid', () => {
    component.filterForm.patchValue({ startDate: '2024-01-01', endDate: '2024-01-31', timezone: 'UTC' });
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="run-report-btn"]');
    btn.click();
    fixture.detectChanges();
    expect(peopleService.getAttendanceDiscrepancyReport).toHaveBeenCalledTimes(1);
  });

  it('T5: shows results-table with result-rows when rows() has data', () => {
    component.rows.set([{
      technicianName: 'Alice', locationId: 'loc-1', reportDate: '2024-01-01',
      totalAttendanceHours: 8, totalJobHours: 7, discrepancyHours: 1, isFlagged: false,
    }]);
    fixture.detectChanges();
    const table = fixture.nativeElement.querySelector('[data-testid="results-table"]');
    expect(table).toBeTruthy();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="result-row"]');
    expect(rows.length).toBe(1);
  });

  it('T6: shows empty-state when rows() is empty after report runs', () => {
    peopleService.getAttendanceDiscrepancyReport.mockReturnValue(of([]));
    component.filterForm.patchValue({ startDate: '2024-01-01', endDate: '2024-01-31', timezone: 'UTC' });
    component.runReport();
    fixture.detectChanges();
    const empty = fixture.nativeElement.querySelector('[data-testid="empty-state"]');
    expect(empty).toBeTruthy();
  });

  it('T7: shows error-state and preserves prior rows when getAttendanceDiscrepancyReport fails', () => {
    component.priorRows.set([{ technicianName: 'Prior', isFlagged: false }]);
    component.rows.set([{ technicianName: 'Prior', isFlagged: false }]);
    peopleService.getAttendanceDiscrepancyReport.mockReturnValue(
      throwError(() => ({ error: { message: 'Report failed' } })),
    );
    component.filterForm.patchValue({ startDate: '2024-01-01', endDate: '2024-01-31', timezone: 'UTC' });
    component.runReport();
    fixture.detectChanges();
    const errEl = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(errEl).toBeTruthy();
    expect(component.rows().length).toBe(1); // prior rows preserved
  });

  it('T8: clicking column header calls sortBy − sortField changes from default', () => {
    component.rows.set([{
      technicianName: 'Alice', locationId: 'loc-1', reportDate: '2024-01-01',
      totalAttendanceHours: 8, totalJobHours: 7, discrepancyHours: 1, isFlagged: false,
    }]);
    fixture.detectChanges();
    // Default sortField is 'reportDate'; first th button is 'technicianName'
    const firstHeaderBtn = fixture.nativeElement.querySelector('[data-testid="results-table"] th button');
    expect(firstHeaderBtn.textContent).toContain('Technician');
    firstHeaderBtn.click();
    fixture.detectChanges();
    expect(component.sortField()).toBe('technicianName');
  });

  it('T9: toggleFlaggedOnly filters rows to only flagged items', () => {
    const allRows = [
      { technicianName: 'Alice', isFlagged: true },
      { technicianName: 'Bob', isFlagged: false },
    ];
    component.priorRows.set(allRows);
    component.rows.set(allRows);
    component.toggleFlaggedOnly();
    fixture.detectChanges();
    expect(component.rows().length).toBe(1);
    expect((component.rows()[0] as { technicianName: string }).technicianName).toBe('Alice');
  });
});
