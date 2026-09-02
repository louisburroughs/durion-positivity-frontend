import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShopDashboardPageComponent } from './shop-dashboard-page.component';
import { ShopDashboardService } from '../../services/shop-dashboard.service';
import { RepairLocationOption, ShopDashboardView } from '../../models/shop-dashboard.models';

const LOCATIONS: RepairLocationOption[] = [
  { locationId: 'loc-1', name: 'Northgate', bayCount: 3, mobileUnitCount: 1 },
];

const EMPTY_VIEW: ShopDashboardView = {
  locationId: 'loc-1',
  date: '2026-09-02',
  units: [],
  openWorkorders: [],
  openWorkordersTruncated: false,
  dataQualityWarning: false,
};

const LOADED_VIEW: ShopDashboardView = {
  ...EMPTY_VIEW,
  generatedAt: '2026-09-02T10:42:11Z',
  units: [
    {
      unitId: 'bay-1',
      unitType: 'BAY',
      unitName: 'Bay 1',
      workorder: {
        workorderId: 'wo-1',
        workorderNumber: 'WO-10428',
        status: 'WORK_IN_PROGRESS',
        vehicle: { vehicleId: 'v1', vin: '1FTFW1E85MFA88823', year: 2021, make: 'Ford', model: 'F-150' },
      },
    },
    { unitId: 'unit-1', unitType: 'MOBILE_UNIT', unitName: 'Van 4' },
  ],
  openWorkorders: [
    { workorderId: 'wo-1', workorderNumber: 'WO-10428', status: 'WORK_IN_PROGRESS', unitId: 'bay-1', unitName: 'Bay 1' },
  ],
};

describe('ShopDashboardPageComponent', () => {
  let fixture: ComponentFixture<ShopDashboardPageComponent>;
  let component: ShopDashboardPageComponent;
  let queryParams: BehaviorSubject<Record<string, string>>;

  const serviceStub = {
    listRepairLocations: vi.fn(),
    getDashboard: vi.fn(),
  };

  async function setup(params: Record<string, string> = {}): Promise<void> {
    queryParams = new BehaviorSubject<Record<string, string>>(params);

    await TestBed.configureTestingModule({
      imports: [ShopDashboardPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ShopDashboardService, useValue: serviceStub },
        { provide: ActivatedRoute, useValue: { queryParams } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShopDashboardPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    serviceStub.listRepairLocations.mockReturnValue(of(LOCATIONS));
    serviceStub.getDashboard.mockReturnValue(of(LOADED_VIEW));
  });

  it('starts in the location-required state with no location selected', async () => {
    await setup();

    expect(component.state()).toBe('idle');
    expect(serviceStub.getDashboard).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('.location-required')).not.toBeNull();
  });

  it('offers only the repair-capable locations from the service', async () => {
    await setup();
    const options = (fixture.nativeElement as HTMLElement).querySelectorAll('#shop-dashboard-location option');

    // Placeholder plus the one repair-capable location.
    expect(options).toHaveLength(2);
    expect(options[1].textContent).toContain('Northgate');
  });

  it('loads and renders the grid when a location arrives via query params', async () => {
    await setup({ locationId: 'loc-1' });

    expect(serviceStub.getDashboard).toHaveBeenCalledWith('loc-1', component.selectedDate());
    expect(component.state()).toBe('ready');
    expect(component.bays()).toHaveLength(1);
    expect(component.mobileUnits()).toHaveLength(1);
  });

  it('renders bays and mobile units in separate labelled sections', async () => {
    await setup({ locationId: 'loc-1' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('#shop-dashboard-bays-title')).not.toBeNull();
    expect(el.querySelector('#shop-dashboard-mobile-units-title')).not.toBeNull();
  });

  it('omits a unit section that has no units', async () => {
    serviceStub.getDashboard.mockReturnValue(
      of({ ...LOADED_VIEW, units: LOADED_VIEW.units.filter(u => u.unitType === 'BAY') }),
    );
    await setup({ locationId: 'loc-1' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('#shop-dashboard-bays-title')).not.toBeNull();
    expect(el.querySelector('#shop-dashboard-mobile-units-title')).toBeNull();
  });

  it('counts units by status band for the summary', async () => {
    await setup({ locationId: 'loc-1' });

    expect(component.counts()).toMatchObject({ total: 2, active: 1, idle: 1, blocked: 0, ready: 0 });
  });

  it('renders the roster below the grid', async () => {
    await setup({ locationId: 'loc-1' });

    expect((fixture.nativeElement as HTMLElement).querySelector('app-open-workorder-roster')).not.toBeNull();
  });

  it('shows the units empty state and still renders the roster when the site has no units', async () => {
    serviceStub.getDashboard.mockReturnValue(
      of({ ...EMPTY_VIEW, openWorkorders: LOADED_VIEW.openWorkorders }),
    );
    await setup({ locationId: 'loc-1' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.empty-state')).not.toBeNull();
    expect(el.querySelector('app-open-workorder-roster')).not.toBeNull();
  });

  it('sets state to error before the error key (ADR-0031)', async () => {
    const order: string[] = [];
    serviceStub.getDashboard.mockReturnValue(throwError(() => new Error('boom')));
    await setup();

    const stateSpy = vi.spyOn(component.state, 'set').mockImplementation(((value: string) => {
      order.push(`state:${value}`);
    }) as never);
    const keySpy = vi.spyOn(component.errorKey, 'set').mockImplementation(((value: string) => {
      order.push(`key:${value}`);
    }) as never);

    queryParams.next({ locationId: 'loc-1' });
    fixture.detectChanges();

    expect(order.indexOf('state:error')).toBeLessThan(
      order.findIndex(entry => entry.startsWith('key:SHOPMGMT')),
    );
    stateSpy.mockRestore();
    keySpy.mockRestore();
  });

  it('maps 403 and 404 to their own error keys', async () => {
    serviceStub.getDashboard.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    await setup({ locationId: 'loc-1' });
    expect(component.errorKey()).toBe('SHOPMGMT.SHOP_DASHBOARD.ERROR_FORBIDDEN');

    TestBed.resetTestingModule();
    serviceStub.getDashboard.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    await setup({ locationId: 'loc-1' });
    expect(component.errorKey()).toBe('SHOPMGMT.SHOP_DASHBOARD.ERROR_NOT_FOUND');
  });

  it('renders the error panel with a retry control', async () => {
    serviceStub.getDashboard.mockReturnValue(throwError(() => new Error('boom')));
    await setup({ locationId: 'loc-1' });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('.btn-text')).not.toBeNull();
  });

  it('re-issues the request on refresh', async () => {
    await setup({ locationId: 'loc-1' });
    expect(serviceStub.getDashboard).toHaveBeenCalledTimes(1);

    component.refresh();
    fixture.detectChanges();

    expect(serviceStub.getDashboard).toHaveBeenCalledTimes(2);
  });

  it('cancels an in-flight request when the location changes, so a stale response cannot paint', async () => {
    const pending = new Subject<ShopDashboardView>();
    serviceStub.getDashboard.mockReturnValueOnce(pending).mockReturnValue(of(LOADED_VIEW));
    await setup({ locationId: 'loc-1' });

    expect(component.state()).toBe('loading');

    queryParams.next({ locationId: 'loc-2' });
    fixture.detectChanges();

    // The first request's late response must be ignored entirely.
    pending.next({ ...LOADED_VIEW, locationId: 'loc-1', units: [] });
    fixture.detectChanges();

    expect(component.view().units).toHaveLength(2);
  });

  it('mirrors the selected location and date to query params', async () => {
    await setup();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onLocationChange('loc-1');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { locationId: 'loc-1' } }),
    );

    component.onDateChange('2026-09-03');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { date: '2026-09-03' } }),
    );
  });

  it('warns when the location list could not be fully derived', async () => {
    serviceStub.listRepairLocations.mockReturnValue(throwError(() => new Error('down')));
    await setup();

    expect(component.locationsError()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.alert-warning')).not.toBeNull();
  });

  it('surfaces the data-quality warning from the view', async () => {
    serviceStub.getDashboard.mockReturnValue(of({ ...LOADED_VIEW, dataQualityWarning: true }));
    await setup({ locationId: 'loc-1' });

    expect((fixture.nativeElement as HTMLElement).querySelector('.alert-warning')).not.toBeNull();
  });
});
