import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { LaborOverheadReport } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';
import { LocationService } from '../../../../location/services/location.service';
import { LaborOverheadReportPageComponent } from './labor-overhead-report-page.component';

function sampleReport(overrides: Partial<LaborOverheadReport> = {}): LaborOverheadReport {
  return {
    locationId: 'LOC-1',
    locationLabel: 'Wooster',
    fiscalYear: 2026,
    asOfMonth: 12,
    currency: 'USD',
    localCurrencyPerUsd: 1.0,
    averageRate: 1.0,
    lines: [
      {
        code: '1.1.1',
        label: 'Hourly wages',
        parentCode: '1.1',
        level: 3,
        costType: 'VARIABLE',
        isSubtotal: false,
        usdOnly: false,
        definition: 'Hourly plant wages.',
        monthly: [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ytd: 1000,
      },
      {
        code: 'TOTAL_LABOR',
        label: 'Total Labor',
        level: 1,
        isSubtotal: true,
        usdOnly: false,
        monthly: [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ytd: 1000,
      },
      {
        code: '2.11.4',
        label: 'Depreciation - MRT process equipment',
        parentCode: '2.11',
        level: 3,
        costType: 'FIXED',
        isSubtotal: false,
        usdOnly: true,
        monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ytd: 0,
      },
      {
        code: '2.14',
        label: 'Income from rubber dust sales',
        level: 2,
        costType: 'VARIABLE',
        isSubtotal: false,
        usdOnly: false,
        monthly: [0, -250, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ytd: -250,
      },
    ],
    ...overrides,
  };
}

describe('LaborOverheadReportPageComponent', () => {
  let fixture: ComponentFixture<LaborOverheadReportPageComponent>;
  let component: LaborOverheadReportPageComponent;

  const accountingServiceStub = {
    getLaborOverheadReport: vi.fn().mockReturnValue(of(sampleReport())),
  };
  const locationServiceStub = {
    getAllLocations: vi.fn().mockReturnValue(of([])),
    getLocationById: vi.fn().mockReturnValue(of(null)),
  };

  beforeEach(async () => {
    accountingServiceStub.getLaborOverheadReport.mockReturnValue(of(sampleReport()));
    await TestBed.configureTestingModule({
      imports: [LaborOverheadReportPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountingService, useValue: accountingServiceStub },
        { provide: LocationService, useValue: locationServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LaborOverheadReportPageComponent);
    component = fixture.componentInstance;
  });

  it('starts in idle state until a location is chosen', () => {
    fixture.detectChanges();
    expect(component.state()).toBe('idle');
    expect(fixture.nativeElement.querySelector('[data-testid="idle-state"]')).toBeTruthy();
  });

  it('renders the full ordered line list (incl. subtotals) when loaded', () => {
    fixture.detectChanges();
    component.onLocationSelected('LOC-1');
    fixture.detectChanges();

    expect(component.state()).toBe('loaded');
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="report-grid"] tbody tr');
    expect(rows.length).toBe(4);
    expect(rows[0].getAttribute('data-code')).toBe('1.1.1');
    expect(rows[1].getAttribute('data-code')).toBe('TOTAL_LABOR');
    expect(rows[1].classList.contains('subtotal-row')).toBe(true);
  });

  it('passes the as-of month through to the service and reloads', () => {
    fixture.detectChanges();
    component.onLocationSelected('LOC-1');
    component.onAsOfMonthChange('6');
    expect(accountingServiceStub.getLaborOverheadReport).toHaveBeenLastCalledWith('LOC-1', 2026, 6);
  });

  it('shows the empty state when all amounts are zero', () => {
    accountingServiceStub.getLaborOverheadReport.mockReturnValueOnce(
      of(
        sampleReport({
          lines: [
            {
              code: '1.1.1',
              label: 'Hourly wages',
              level: 3,
              isSubtotal: false,
              usdOnly: false,
              monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              ytd: 0,
            },
          ],
        }),
      ),
    );
    fixture.detectChanges();
    component.onLocationSelected('LOC-1');
    fixture.detectChanges();
    expect(component.state()).toBe('empty');
    expect(fixture.nativeElement.querySelector('[data-testid="empty-state"]')).toBeTruthy();
  });

  it('renders the forbidden state on a 403', () => {
    accountingServiceStub.getLaborOverheadReport.mockReturnValueOnce(throwError(() => ({ status: 403 })));
    fixture.detectChanges();
    component.onLocationSelected('LOC-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="forbidden-state"]')).toBeTruthy();
  });

  it('renders the error state on a 500 and retry reloads', () => {
    accountingServiceStub.getLaborOverheadReport.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    fixture.detectChanges();
    component.onLocationSelected('LOC-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="error-state"]')).toBeTruthy();

    accountingServiceStub.getLaborOverheadReport.mockReturnValueOnce(of(sampleReport()));
    component.retry();
    fixture.detectChanges();
    expect(component.state()).toBe('loaded');
  });

  it('formats negatives in accounting parentheses and groups thousands', () => {
    expect(component.formatAmount(-250)).toBe('(250)');
    expect(component.formatAmount(12345)).toBe('12,345');
    expect(component.isNegative(-1)).toBe(true);
    expect(component.isNegative(0)).toBe(false);
  });

  it('marks the USD-only line (2.11.4) and has no editable cells', () => {
    fixture.detectChanges();
    component.onLocationSelected('LOC-1');
    fixture.detectChanges();
    const grid = fixture.nativeElement.querySelector('[data-testid="report-grid"]');
    expect(grid.querySelector('[data-code="2.11.4"] .usd-badge')).toBeTruthy();
    // Strictly read-only: no inputs/textarea/checkbox in the grid.
    expect(grid.querySelectorAll('input, textarea, select').length).toBe(0);
  });
});
