import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BayAPIService, LocationAPIService, MobileUnitAPIService } from '@durion-sdk/location';
import { DailyDispatchBoardDashboardService, WorkorderDetailService } from '@durion-sdk/workorder';
import { VehicleRegistryAPIService } from '@durion-sdk/vehicle-inventory';
import { ShopDashboardService } from './shop-dashboard.service';

const dispatchStub = { getDispatchDashboard: vi.fn() };
const locationStub = { listLocations: vi.fn() };
const bayStub = { listBays: vi.fn() };
const mobileUnitStub = { listMobileUnits: vi.fn() };
const workorderDetailStub = { getWorkorderDetail: vi.fn() };
const vehicleStub = { getVehicle: vi.fn() };

const DATE = '2026-09-02';

function dashboard(overrides: Record<string, unknown> = {}) {
  return {
    date: DATE,
    locationId: 'loc-1',
    lastRefreshed: '2026-09-02T10:42:11Z',
    dataQualityWarning: false,
    workorders: [],
    mechanics: [],
    bays: [],
    conflicts: [],
    ...overrides,
  };
}

describe('ShopDashboardService', () => {
  let service: ShopDashboardService;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchStub.getDispatchDashboard.mockReturnValue(of(dashboard()));
    locationStub.listLocations.mockReturnValue(of([]));
    bayStub.listBays.mockReturnValue(of({ content: [] }));
    mobileUnitStub.listMobileUnits.mockReturnValue(of({ content: [] }));
    workorderDetailStub.getWorkorderDetail.mockReturnValue(of({ vehicleId: 'veh-1' }));
    vehicleStub.getVehicle.mockReturnValue(
      of({ vehicleId: 'veh-1', vin: '1FTFW1E85MFA88823', year: 2021, make: 'Ford', model: 'F-150' }),
    );

    TestBed.configureTestingModule({
      providers: [
        ShopDashboardService,
        { provide: DailyDispatchBoardDashboardService, useValue: dispatchStub },
        { provide: LocationAPIService, useValue: locationStub },
        { provide: BayAPIService, useValue: bayStub },
        { provide: MobileUnitAPIService, useValue: mobileUnitStub },
        { provide: WorkorderDetailService, useValue: workorderDetailStub },
        { provide: VehicleRegistryAPIService, useValue: vehicleStub },
      ],
    });
    service = TestBed.inject(ShopDashboardService);
  });

  // ── listRepairLocations ──────────────────────────────────────────────────

  describe('listRepairLocations', () => {
    it('keeps a location that has bays only', async () => {
      locationStub.listLocations.mockReturnValue(of([{ id: 'loc-1', name: 'Northgate', active: true }]));
      bayStub.listBays.mockReturnValue(of({ content: [{ id: 'bay-1', name: 'Bay 1' }] }));

      const options = await firstValueFrom(service.listRepairLocations());

      expect(options).toHaveLength(1);
      expect(options[0]).toMatchObject({ locationId: 'loc-1', bayCount: 1, mobileUnitCount: 0 });
    });

    it('keeps a location that has mobile units only', async () => {
      locationStub.listLocations.mockReturnValue(of([{ id: 'loc-1', name: 'Northgate', active: true }]));
      mobileUnitStub.listMobileUnits.mockReturnValue(
        of({ content: [{ id: 'unit-1', name: 'Van 4', baseLocationId: 'loc-1' }] }),
      );

      const options = await firstValueFrom(service.listRepairLocations());

      expect(options).toHaveLength(1);
      expect(options[0]).toMatchObject({ bayCount: 0, mobileUnitCount: 1 });
    });

    it('drops a location with neither bays nor mobile units', async () => {
      locationStub.listLocations.mockReturnValue(of([{ id: 'loc-office', name: 'HQ', active: true }]));

      expect(await firstValueFrom(service.listRepairLocations())).toEqual([]);
    });

    it('drops an inactive location even when it has bays', async () => {
      locationStub.listLocations.mockReturnValue(of([{ id: 'loc-1', name: 'Closed', active: false }]));
      bayStub.listBays.mockReturnValue(of({ content: [{ id: 'bay-1' }] }));

      expect(await firstValueFrom(service.listRepairLocations())).toEqual([]);
    });

    it('still offers a location with mobile units when its bays call fails', async () => {
      locationStub.listLocations.mockReturnValue(of([{ id: 'loc-1', name: 'Northgate', active: true }]));
      bayStub.listBays.mockReturnValue(throwError(() => new Error('bays down')));
      mobileUnitStub.listMobileUnits.mockReturnValue(
        of({ content: [{ id: 'unit-1', baseLocationId: 'loc-1' }] }),
      );

      const options = await firstValueFrom(service.listRepairLocations());

      expect(options).toHaveLength(1);
      expect(options[0].bayCount).toBe(0);
    });

    it('caches the derived list so switching location does not re-fan-out', async () => {
      locationStub.listLocations.mockReturnValue(of([{ id: 'loc-1', name: 'Northgate', active: true }]));
      bayStub.listBays.mockReturnValue(of({ content: [{ id: 'bay-1' }] }));

      await firstValueFrom(service.listRepairLocations());
      await firstValueFrom(service.listRepairLocations());

      expect(locationStub.listLocations).toHaveBeenCalledTimes(1);
    });
  });

  // ── getDashboard ─────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('passes a trimmed location id and an already-ISO date through unchanged', async () => {
      await firstValueFrom(service.getDashboard('  loc-1  ', DATE));

      expect(dispatchStub.getDispatchDashboard).toHaveBeenCalledWith('loc-1', DATE);
    });

    it('builds a bay card with workorder, vehicle and mechanic', async () => {
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            bays: [{ bayId: 'bay-1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-1' }],
            workorders: [{ workorderId: 'wo-1', workorderNumber: 'WO-10428', status: 'WORK_IN_PROGRESS' }],
            mechanics: [{ personId: 'p-1', firstName: 'M.', lastName: 'Alvarez', assignedWorkorderId: 'wo-1' }],
          }),
        ),
      );
      bayStub.listBays.mockReturnValue(of({ content: [{ id: 'bay-1', name: 'Bay 1', bayType: 'Alignment' }] }));

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

      expect(view.units).toHaveLength(1);
      expect(view.units[0]).toMatchObject({
        unitId: 'bay-1',
        unitType: 'BAY',
        unitName: 'Bay 1',
        unitSubtitle: 'Alignment',
      });
      expect(view.units[0].workorder).toMatchObject({
        workorderId: 'wo-1',
        workorderNumber: 'WO-10428',
        status: 'WORK_IN_PROGRESS',
      });
      expect(view.units[0].workorder?.vehicle).toMatchObject({
        vin: '1FTFW1E85MFA88823',
        year: 2021,
        make: 'Ford',
        model: 'F-150',
      });
      expect(view.units[0].workorder?.mechanic).toEqual({ personId: 'p-1', displayName: 'M. Alvarez' });
    });

    it('reads a bay as idle when its linked workorder is closed', async () => {
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            bays: [{ bayId: 'bay-1', available: true, status: 'ACTIVE', assignedWorkorderId: 'wo-done' }],
            workorders: [{ workorderId: 'wo-done', status: 'COMPLETED' }],
          }),
        ),
      );

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

      expect(view.units[0].workorder).toBeUndefined();
    });

    it('includes mobile units based at the location and excludes others', async () => {
      mobileUnitStub.listMobileUnits.mockReturnValue(
        of({
          content: [
            { id: 'unit-1', name: 'Van 4', baseLocationId: 'loc-1', status: 'ACTIVE' },
            { id: 'unit-2', name: 'Van 9', baseLocationId: 'loc-2' },
          ],
        }),
      );

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));
      const mobile = view.units.filter(unit => unit.unitType === 'MOBILE_UNIT');

      expect(mobile).toHaveLength(1);
      expect(mobile[0]).toMatchObject({ unitId: 'unit-1', unitName: 'Van 4' });
      // Backend gap louisburroughs/durion#416 — no assignment feed for mobile units.
      expect(mobile[0].workorder).toBeUndefined();
    });

    it('builds the roster from open workorders and excludes closed ones', async () => {
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            workorders: [
              { workorderId: 'wo-open', workorderNumber: 'WO-2', status: 'ASSIGNED' },
              { workorderId: 'wo-done', workorderNumber: 'WO-1', status: 'COMPLETED' },
              { workorderId: 'wo-cancel', workorderNumber: 'WO-3', status: 'CANCELLED' },
            ],
          }),
        ),
      );

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

      expect(view.openWorkorders.map(row => row.workorderId)).toEqual(['wo-open']);
    });

    it('sorts roster rows with unassigned work first', async () => {
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            bays: [{ bayId: 'bay-1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-on-bay' }],
            workorders: [
              { workorderId: 'wo-on-bay', workorderNumber: 'WO-1', status: 'WORK_IN_PROGRESS', assignedBayId: 'bay-1' },
              { workorderId: 'wo-loose', workorderNumber: 'WO-2', status: 'ASSIGNED' },
            ],
          }),
        ),
      );

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

      expect(view.openWorkorders[0].workorderId).toBe('wo-loose');
      expect(view.openWorkorders[0].unitId).toBeUndefined();
      expect(view.openWorkorders[1].unitName).toBe('Bay 1');
    });

    it('falls back to the unstructured vehicle description when the registry lookup fails', async () => {
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            workorders: [
              { workorderId: 'wo-1', status: 'ASSIGNED', vehicleDescription: '2019 Toyota Camry' },
            ],
          }),
        ),
      );
      vehicleStub.getVehicle.mockReturnValue(throwError(() => new Error('registry down')));

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

      expect(view.openWorkorders[0].vehicle).toMatchObject({ description: '2019 Toyota Camry' });
    });

    it('surfaces the dispatch data-quality warning', async () => {
      dispatchStub.getDispatchDashboard.mockReturnValue(of(dashboard({ dataQualityWarning: true })));

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

      expect(view.dataQualityWarning).toBe(true);
    });

    it('propagates a dispatch failure rather than rendering an empty board', async () => {
      dispatchStub.getDispatchDashboard.mockReturnValue(throwError(() => new Error('boom')));

      await expect(firstValueFrom(service.getDashboard('loc-1', DATE))).rejects.toThrow('boom');
    });

    it('normalises a non-ISO date without shifting the day', async () => {
      await firstValueFrom(service.getDashboard('loc-1', '2026-09-02T23:30:00Z'));

      expect(dispatchStub.getDispatchDashboard).toHaveBeenCalledWith('loc-1', '2026-09-02');
    });

    it('falls back to today when the date cannot be parsed', async () => {
      await firstValueFrom(service.getDashboard('loc-1', 'not-a-date'));

      const [, passedDate] = dispatchStub.getDispatchDashboard.mock.calls[0];
      expect(passedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
