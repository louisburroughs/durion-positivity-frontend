import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { TimeExportPageComponent } from './time-export-page.component';
import { TIME_EXPORT_SOURCE } from '../../../../shared/time-export/time-export-source.tokens';
import { LOCATION_LOOKUP_SOURCE } from '../../../../shared/location-picker/location-lookup-source.tokens';

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
    getAll: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();

    accountingService = {
      requestExport: vi.fn().mockReturnValue(of({ exportId: 'exp-1', status: 'QUEUED' })),
      getExportStatus: vi.fn().mockReturnValue(of({ status: 'READY' })),
      getExportHistory: vi.fn().mockReturnValue(of([])),
      downloadExport: vi.fn().mockReturnValue(of(undefined)),
    };
    locationService = {
      getAll: vi.fn().mockReturnValue(of([{ locationId: 'loc-1', name: 'Main Shop' }])),
    };

    await TestBed.configureTestingModule({
      imports: [TimeExportPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: TIME_EXPORT_SOURCE, useValue: accountingService },
        { provide: LOCATION_LOOKUP_SOURCE, useValue: locationService },
      ],
    }).compileComponents();

    TestBed.inject(TranslateService).use('en-US');

    fixture = TestBed.createComponent(TimeExportPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('T1: renders page header with export text', () => {
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1.textContent).toMatch(/export/i);
  });

  it('T2: loads locations on init via LOCATION_LOOKUP_SOURCE.getAll', () => {
    expect(locationService.getAll).toHaveBeenCalledTimes(1);
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

  it('T10: downloadExport subscribes to the source and requires no error panel on success', () => {
    component.exportId.set('exp-1');
    component.downloadExport();
    fixture.detectChanges();

    expect(accountingService.downloadExport).toHaveBeenCalledWith('exp-1');
    expect(fixture.nativeElement.querySelector('[data-testid="export-error"]')).toBeNull();
  });

  it('T11: shows export-error when downloadExport rejects (lazy-chunk load failure)', () => {
    accountingService.downloadExport.mockReturnValue(throwError(() => new Error('chunk load failed')));
    component.exportId.set('exp-1');

    component.downloadExport();
    fixture.detectChanges();

    const errEl = fixture.nativeElement.querySelector('[data-testid="export-error"]');
    expect(errEl).toBeTruthy();
    expect(component.exportError()).toBeTruthy();
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
