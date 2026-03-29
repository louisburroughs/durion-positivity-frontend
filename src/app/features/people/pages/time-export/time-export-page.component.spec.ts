import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TimeExportPageComponent } from './time-export-page.component';
import { AccountingService } from '../../../accounting/services/accounting.service';
import { LocationService } from '../../../location/services/location.service';

describe('TimeExportPageComponent', () => {
  let fixture: ComponentFixture<TimeExportPageComponent>;
  let component: TimeExportPageComponent;
  let accountingService: {
    requestExport: ReturnType<typeof vi.fn>;
    getExportStatus: ReturnType<typeof vi.fn>;
    getExportHistory: ReturnType<typeof vi.fn>;
    downloadExport: ReturnType<typeof vi.fn>;
  };
  let locationService: {
    getAllLocations: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();

    accountingService = {
      requestExport: vi.fn().mockReturnValue(of({ exportId: 'exp-1', status: 'QUEUED' })),
      getExportStatus: vi.fn().mockReturnValue(of({ status: 'READY' })),
      getExportHistory: vi.fn().mockReturnValue(of([])),
      downloadExport: vi.fn(),
    };
    locationService = {
      getAllLocations: vi.fn().mockReturnValue(of([{ locationId: 'loc-1', name: 'Main Shop' }])),
    };

    await TestBed.configureTestingModule({
      imports: [TimeExportPageComponent],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingService },
        { provide: LocationService, useValue: locationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TimeExportPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('T1: renders page header with export text', () => {
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1.textContent).toMatch(/export/i);
  });

  it('T2: loads locations on init via LocationService.getAllLocations', () => {
    expect(locationService.getAllLocations).toHaveBeenCalledTimes(1);
    expect(component.locations().length).toBe(1);
  });

  it('T3: loads export history on init via AccountingService.getExportHistory', () => {
    expect(accountingService.getExportHistory).toHaveBeenCalledTimes(1);
  });

  it('T4: request-export-btn is present and calls requestExport when form filled', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="request-export-btn"]');
    expect(btn).toBeTruthy();
    component.form.controls.startDate.setValue('2024-01-01');
    component.form.controls.endDate.setValue('2024-01-31');
    component.form.controls.locationIds.setValue(['loc-1']);
    component.requestExport();
    expect(accountingService.requestExport).toHaveBeenCalledTimes(1);
  });

  it('T5: shows export-error when requestExport fails', () => {
    accountingService.requestExport.mockReturnValue(
      throwError(() => ({ error: { message: 'Server error' } })),
    );
    component.form.controls.startDate.setValue('2024-01-01');
    component.form.controls.endDate.setValue('2024-01-31');
    component.form.controls.locationIds.setValue(['loc-1']);
    component.requestExport();
    fixture.detectChanges();
    const errEl = fixture.nativeElement.querySelector('[data-testid="export-error"]');
    expect(errEl).toBeTruthy();
    expect(errEl.textContent).toContain('Server error');
  });

  it('T6: shows status-panel when exportId is set after requestExport', () => {
    component.form.controls.startDate.setValue('2024-01-01');
    component.form.controls.endDate.setValue('2024-01-31');
    component.form.controls.locationIds.setValue(['loc-1']);
    component.requestExport();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('[data-testid="status-panel"]');
    expect(panel).toBeTruthy();
  });

  it('T7: refresh-status-btn is present when canRefresh is true', () => {
    component.exportId.set('exp-1');
    component.exportState.set('QUEUED' as Parameters<typeof component.exportState.set>[0]);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="refresh-status-btn"]');
    expect(btn).toBeTruthy();
    expect(component.canRefresh).toBe(true);
  });

  it('T8: shows history-table rows when historyItems has data', () => {
    component.historyItems.set([{ exportId: 'h1', status: 'READY', startDate: '2024-01-01', endDate: '2024-01-31', format: 'CSV', recordsExportedCount: 10, requestedAt: '2024-01-01T00:00:00Z' }]);
    component.historyLoading.set(false);
    fixture.detectChanges();
    const table = fixture.nativeElement.querySelector('[data-testid="history-table"]');
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="history-row"]');
    expect(table).toBeTruthy();
    expect(rows.length).toBe(1);
  });

  it('T9: shows history-empty when historyItems is empty', () => {
    component.historyItems.set([]);
    component.historyLoading.set(false);
    component.historyError.set(null);
    fixture.detectChanges();
    const empty = fixture.nativeElement.querySelector('[data-testid="history-empty"]');
    expect(empty).toBeTruthy();
  });
});
