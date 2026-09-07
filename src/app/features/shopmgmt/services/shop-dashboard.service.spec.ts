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
    function location(overrides: Record<string, unknown> = {}) {
      return {
        id: 'loc-1',
        name: 'Northgate',
        active: true,
        hasRepairCapability: false,
        activeBayCount: 0,
        activeMobileUnitCount: 0,
        ...overrides,
      };
    }

    it('keeps a location that has bays only', async () => {
      locationStub.listLocations.mockReturnValue(
        of([location({ hasRepairCapability: true, activeBayCount: 1 })]),
      );

      const { options, degraded } = await firstValueFrom(service.listRepairLocations());

      expect(options).toHaveLength(1);
      expect(options[0]).toMatchObject({ locationId: 'loc-1', bayCount: 1, mobileUnitCount: 0 });
      expect(degraded).toBe(false);
    });

    it('keeps a location that has mobile units only', async () => {
      locationStub.listLocations.mockReturnValue(
        of([location({ hasRepairCapability: true, activeMobileUnitCount: 1 })]),
      );

      const { options } = await firstValueFrom(service.listRepairLocations());

      expect(options).toHaveLength(1);
      expect(options[0]).toMatchObject({ bayCount: 0, mobileUnitCount: 1 });
    });

    it('drops a location with neither bays nor mobile units', async () => {
      locationStub.listLocations.mockReturnValue(of([location({ id: 'loc-office', name: 'HQ' })]));

      expect((await firstValueFrom(service.listRepairLocations())).options).toEqual([]);
    });

    it('drops an inactive location even when the backend reports counts', async () => {
      // The projection already zeroes hasRepairCapability/counts for an
      // inactive location; this guards against a future backend regression
      // rather than re-deriving the filter client-side.
      locationStub.listLocations.mockReturnValue(
        of([location({ name: 'Closed', active: false, hasRepairCapability: false, activeBayCount: 1 })]),
      );

      expect((await firstValueFrom(service.listRepairLocations())).options).toEqual([]);
    });

    it('reports degraded when the locations call fails', async () => {
      locationStub.listLocations.mockReturnValue(throwError(() => new Error('locations down')));

      const { options, degraded } = await firstValueFrom(service.listRepairLocations());

      expect(options).toEqual([]);
      expect(degraded).toBe(true);
    });

    it('re-derives the list after invalidation so a newly capable location appears', async () => {
      locationStub.listLocations.mockReturnValue(of([location()]));

      expect((await firstValueFrom(service.listRepairLocations())).options).toEqual([]);

      locationStub.listLocations.mockReturnValue(
        of([location({ hasRepairCapability: true, activeBayCount: 1 })]),
      );
      service.invalidateRepairLocations();

      expect((await firstValueFrom(service.listRepairLocations())).options).toHaveLength(1);
    });

    it('caches the derived list so switching location does not re-call listLocations', async () => {
      locationStub.listLocations.mockReturnValue(
        of([location({ hasRepairCapability: true, activeBayCount: 1 })]),
      );

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

    it('requests an explicit page size for bays and mobile units so a large estate is not silently truncated', async () => {
      await firstValueFrom(service.getDashboard('loc-1', DATE));

      expect(mobileUnitStub.listMobileUnits).toHaveBeenCalledWith(0, expect.any(Number));
      const [, , , , size] = bayStub.listBays.mock.calls[0];
      expect(size).toBeGreaterThan(100);
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
      expect(mobile[0].workorder).toBeUndefined();
    });

    it('puts a MOBILE_UNIT-assigned workorder on its mobile-unit card', async () => {
      mobileUnitStub.listMobileUnits.mockReturnValue(
        of({ content: [{ id: 'unit-1', name: 'Van 4', baseLocationId: 'loc-1', status: 'ACTIVE' }] }),
      );
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            workorders: [
              {
                workorderId: 'wo-mobile',
                workorderNumber: 'WO-77',
                status: 'WORK_IN_PROGRESS',
                assignedResourceId: 'unit-1',
                resourceType: 'MOBILE_UNIT',
              },
            ],
            mechanics: [{ personId: 'p-2', firstName: 'R.', lastName: 'Okafor', assignedWorkorderId: 'wo-mobile' }],
          }),
        ),
      );

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));
      const mobile = view.units.find(unit => unit.unitType === 'MOBILE_UNIT');

      expect(mobile?.workorder).toMatchObject({ workorderId: 'wo-mobile', workorderNumber: 'WO-77' });
      expect(mobile?.workorder?.mechanic).toEqual({ personId: 'p-2', displayName: 'R. Okafor' });
      // The roster must agree with the card above it.
      expect(view.openWorkorders[0]).toMatchObject({ unitId: 'unit-1', unitName: 'Van 4' });
    });

    it('lets the bay card win when a bay and a mobile-unit assignment name the same workorder', async () => {
      // BayStatus.assignedWorkorderId and WorkorderSummary.assignedResourceId/
      // resourceType are independent, optional fields with no consistency
      // guarantee. When they disagree about which unit holds this work, the
      // bay's own live feed must win: the mobile-unit card must render idle,
      // and the roster must agree with the bay card, not the mobile-unit card.
      mobileUnitStub.listMobileUnits.mockReturnValue(
        of({ content: [{ id: 'unit-1', name: 'Van 4', baseLocationId: 'loc-1', status: 'ACTIVE' }] }),
      );
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            bays: [
              { bayId: 'bay-1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-conflict' },
            ],
            workorders: [
              {
                workorderId: 'wo-conflict',
                workorderNumber: 'WO-9',
                status: 'WORK_IN_PROGRESS',
                assignedResourceId: 'unit-1',
                resourceType: 'MOBILE_UNIT',
              },
            ],
          }),
        ),
      );

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));
      const bayCard = view.units.find(unit => unit.unitId === 'bay-1');
      const mobileCard = view.units.find(unit => unit.unitId === 'unit-1');

      expect(bayCard?.workorder).toMatchObject({ workorderId: 'wo-conflict', workorderNumber: 'WO-9' });
      expect(mobileCard?.workorder).toBeUndefined();
      expect(view.openWorkorders[0]).toMatchObject({ unitId: 'bay-1', unitName: 'Bay 1' });
    });

    it('does not put a BAY-assigned workorder on a mobile unit that shares its id', async () => {
      // The identifier alone says nothing about the kind of unit; only
      // resourceType does. Reading it as a bay is the 0.10 assumption.
      mobileUnitStub.listMobileUnits.mockReturnValue(
        of({ content: [{ id: 'res-1', name: 'Van 4', baseLocationId: 'loc-1', status: 'ACTIVE' }] }),
      );
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            workorders: [
              {
                workorderId: 'wo-bay',
                status: 'ASSIGNED',
                assignedResourceId: 'res-1',
                resourceType: 'BAY',
              },
            ],
          }),
        ),
      );

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

      expect(view.units.find(unit => unit.unitType === 'MOBILE_UNIT')?.workorder).toBeUndefined();
    });

    it('names a mobile-unit assignment from the mobile-unit inventory, not the bays', async () => {
      // Only reached when the unit is not based at the rendered location, so no
      // card carries the join — the roster still must not show a raw UUID.
      mobileUnitStub.listMobileUnits.mockReturnValue(
        of({ content: [{ id: 'unit-9', name: 'Van 9', baseLocationId: 'loc-2', status: 'ACTIVE' }] }),
      );
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            workorders: [
              {
                workorderId: 'wo-away',
                status: 'ASSIGNED',
                assignedResourceId: 'unit-9',
                resourceType: 'MOBILE_UNIT',
              },
            ],
          }),
        ),
      );

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

      expect(view.openWorkorders[0]).toMatchObject({ unitId: 'unit-9', unitName: 'Van 9' });
    });

    it('leaves the unit name blank when the assigned resource cannot be resolved', async () => {
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            workorders: [
              {
                workorderId: 'wo-1',
                status: 'ASSIGNED',
                assignedResourceId: 'bay-ghost',
                resourceType: 'BAY',
              },
            ],
          }),
        ),
      );

      const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

      expect(view.openWorkorders[0].unitId).toBe('bay-ghost');
      // Never a raw UUID: the page renders its own "unknown unit" copy instead.
      expect(view.openWorkorders[0].unitName).toBeUndefined();
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
              {
                workorderId: 'wo-on-bay',
                workorderNumber: 'WO-1',
                status: 'WORK_IN_PROGRESS',
                assignedResourceId: 'bay-1',
                resourceType: 'BAY',
              },
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

    it('resolves a timestamp to its LOCAL calendar date, not the UTC day', async () => {
      // 18:00 local on 2 Sep. `toISOString()` would give 2026-09-03 for any UTC-N
      // zone — the exact pattern ADR-0038 rejects — and would ask the dispatch
      // board for tomorrow's shift every evening.
      const localEvening = new Date(2026, 8, 2, 18, 0, 0);

      await firstValueFrom(service.getDashboard('loc-1', localEvening.toISOString()));

      expect(dispatchStub.getDispatchDashboard).toHaveBeenCalledWith('loc-1', '2026-09-02');
    });

    it('passes an already-correct date-only string through untouched', async () => {
      await firstValueFrom(service.getDashboard('loc-1', '2026-09-02'));

      expect(dispatchStub.getDispatchDashboard).toHaveBeenCalledWith('loc-1', '2026-09-02');
    });

    it('falls back to the current calendar date when the value cannot be parsed', async () => {
      // Frozen so the expectation cannot straddle local midnight.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 2, 18, 0, 0));
      try {
        await firstValueFrom(service.getDashboard('loc-1', 'not-a-date'));

        const [, passedDate] = dispatchStub.getDispatchDashboard.mock.calls[0];
        expect(passedDate).toBe('2026-09-02');
      } finally {
        vi.useRealTimers();
      }
      // As above: under a UTC CI clock this cannot tell local getters from
      // `toISOString()`. See models/shop-dashboard.models.spec.ts for the test
      // that actually enforces ADR-0038.
    });

    it('spends the vehicle-lookup budget on unit-assigned workorders first', async () => {
      // 45 open workorders, roster-only ones listed first; only the last is on a bay.
      const workorders = Array.from({ length: 45 }, (_, i) => ({
        workorderId: `wo-${i}`,
        status: 'ASSIGNED',
      }));
      dispatchStub.getDispatchDashboard.mockReturnValue(
        of(
          dashboard({
            workorders,
            bays: [
              { bayId: 'bay-1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-44' },
            ],
          }),
        ),
      );

      await firstValueFrom(service.getDashboard('loc-1', DATE));

      const looked = workorderDetailStub.getWorkorderDetail.mock.calls.map(call => call[0]);
      // The cap is real...
      expect(looked).toHaveLength(40);
      // ...and the bay's workorder is not the one starved by it.
      expect(looked).toContain('wo-44');
    });

    // ── Bay roster sourcing ────────────────────────────────────────────────
    //
    // pos-workorder serves `DashboardResponse.bays` from its own event-fed
    // replica of the location domain and omits a bay whose replica row has not
    // arrived. Every bay created before backend#1668 began publishing
    // `location.bay.*` has no such row, so on a real site that array comes back
    // empty and sourcing the cards from it rendered the grid with no bays at
    // all. The location inventory owns bays and is complete today, so it is the
    // roster of record.

    describe('bay roster', () => {
      it('renders bay cards from the location inventory when the dispatch projection reports no bays', async () => {
        bayStub.listBays.mockReturnValue(
          of({
            content: [
              { id: 'bay-1', name: 'Bay 1', bayType: 'Alignment', status: 'ACTIVE' },
              { id: 'bay-2', name: 'Bay 2', bayType: 'General', status: 'ACTIVE' },
            ],
          }),
        );
        dispatchStub.getDispatchDashboard.mockReturnValue(of(dashboard({ bays: [] })));

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units.map(unit => unit.unitId)).toEqual(['bay-1', 'bay-2']);
        expect(view.units[0]).toMatchObject({
          unitType: 'BAY',
          unitName: 'Bay 1',
          unitSubtitle: 'Alignment',
          unitStatus: 'ACTIVE',
        });
        expect(view.units[0].workorder).toBeUndefined();
      });

      it('puts a BAY-assigned workorder on an inventory-only bay card, and the roster agrees', async () => {
        bayStub.listBays.mockReturnValue(
          of({ content: [{ id: 'bay-1', name: 'Bay 1', status: 'ACTIVE' }] }),
        );
        dispatchStub.getDispatchDashboard.mockReturnValue(
          of(
            dashboard({
              bays: [],
              workorders: [
                {
                  workorderId: 'wo-1',
                  workorderNumber: 'WO-10428',
                  status: 'WORK_IN_PROGRESS',
                  assignedResourceId: 'bay-1',
                  resourceType: 'BAY',
                },
              ],
              mechanics: [
                { personId: 'p-1', firstName: 'M.', lastName: 'Alvarez', assignedWorkorderId: 'wo-1' },
              ],
            }),
          ),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units[0].workorder).toMatchObject({
          workorderId: 'wo-1',
          workorderNumber: 'WO-10428',
          status: 'WORK_IN_PROGRESS',
        });
        expect(view.units[0].workorder?.mechanic).toEqual({
          personId: 'p-1',
          displayName: 'M. Alvarez',
        });
        expect(view.openWorkorders[0]).toMatchObject({ unitId: 'bay-1', unitName: 'Bay 1' });
      });

      it('resolves the vehicle for a BAY-assigned workorder that no dispatch bay row carries', async () => {
        // The lookup budget is prioritised by "is this work on a unit?". Reading
        // that only from the bay status rows starved every bay card of its
        // vehicle on exactly the sites this fix exists for.
        bayStub.listBays.mockReturnValue(
          of({ content: [{ id: 'bay-1', name: 'Bay 1', status: 'ACTIVE' }] }),
        );
        dispatchStub.getDispatchDashboard.mockReturnValue(
          of(
            dashboard({
              bays: [],
              workorders: [
                ...Array.from({ length: 44 }, (_, i) => ({
                  workorderId: `wo-loose-${i}`,
                  status: 'ASSIGNED',
                })),
                {
                  workorderId: 'wo-on-bay',
                  status: 'WORK_IN_PROGRESS',
                  assignedResourceId: 'bay-1',
                  resourceType: 'BAY',
                },
              ],
            }),
          ),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(workorderDetailStub.getWorkorderDetail.mock.calls.map(call => call[0])).toContain(
          'wo-on-bay',
        );
        expect(view.units[0].workorder?.vehicle).toMatchObject({ make: 'Ford', model: 'F-150' });
      });

      it('keeps a bay the dispatch projection knows but the bays call did not return', async () => {
        // The inventory call is caught, not propagated, so a failure there must
        // degrade to whatever the dispatch projection holds rather than blank
        // the grid.
        bayStub.listBays.mockReturnValue(throwError(() => new Error('bays down')));
        dispatchStub.getDispatchDashboard.mockReturnValue(
          of(
            dashboard({
              bays: [
                { bayId: 'bay-1', bayName: 'Bay 1', available: true, status: 'ACTIVE' },
              ],
            }),
          ),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units.map(unit => unit.unitId)).toEqual(['bay-1']);
        expect(view.units[0].unitName).toBe('Bay 1');
      });

      it('lists a bay once when both sources carry it', async () => {
        bayStub.listBays.mockReturnValue(
          of({ content: [{ id: 'bay-1', name: 'Bay 1', bayType: 'Alignment', status: 'ACTIVE' }] }),
        );
        dispatchStub.getDispatchDashboard.mockReturnValue(
          of(
            dashboard({
              bays: [{ bayId: 'bay-1', bayName: 'Bay 1', available: true, status: 'ACTIVE' }],
            }),
          ),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units).toHaveLength(1);
        expect(view.units[0].unitSubtitle).toBe('Alignment');
      });

      it("prefers the bay's own live assignment over a workorder-side claim on the same bay", async () => {
        bayStub.listBays.mockReturnValue(
          of({ content: [{ id: 'bay-1', name: 'Bay 1', status: 'ACTIVE' }] }),
        );
        dispatchStub.getDispatchDashboard.mockReturnValue(
          of(
            dashboard({
              bays: [
                {
                  bayId: 'bay-1',
                  bayName: 'Bay 1',
                  available: false,
                  status: 'ACTIVE',
                  assignedWorkorderId: 'wo-live',
                },
              ],
              workorders: [
                { workorderId: 'wo-live', workorderNumber: 'WO-1', status: 'WORK_IN_PROGRESS' },
                {
                  workorderId: 'wo-stale',
                  workorderNumber: 'WO-2',
                  status: 'ASSIGNED',
                  assignedResourceId: 'bay-1',
                  resourceType: 'BAY',
                },
              ],
            }),
          ),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units[0].workorder?.workorderId).toBe('wo-live');
      });

      it('drops an out-of-service bay so it is not counted as available capacity', async () => {
        bayStub.listBays.mockReturnValue(
          of({
            content: [
              { id: 'bay-1', name: 'Bay 1', status: 'ACTIVE' },
              { id: 'bay-2', name: 'Bay 2', status: 'OUT_OF_SERVICE' },
            ],
          }),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units.map(unit => unit.unitId)).toEqual(['bay-1']);
      });

      it('renders a bay whose status is absent or unrecognised', async () => {
        // Dropping a bay is the failure this whole path exists to prevent, so
        // only the one known out-of-service value removes a card.
        bayStub.listBays.mockReturnValue(
          of({
            content: [
              { id: 'bay-1', name: 'Bay 1' },
              { id: 'bay-2', name: 'Bay 2', status: 'RESERVED' },
            ],
          }),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units.map(unit => unit.unitId)).toEqual(['bay-1', 'bay-2']);
      });

      it('orders bay cards by name, reading numbers as numbers', async () => {
        bayStub.listBays.mockReturnValue(
          of({
            content: [
              { id: 'bay-10', name: 'Bay 10', status: 'ACTIVE' },
              { id: 'bay-2', name: 'Bay 2', status: 'ACTIVE' },
              { id: 'bay-1', name: 'Bay 1', status: 'ACTIVE' },
            ],
          }),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units.map(unit => unit.unitName)).toEqual(['Bay 1', 'Bay 2', 'Bay 10']);
      });

      it('renders no bay cards for a mobile-only site', async () => {
        // The mobile hub has no fixed bays; the grid must show its vans and
        // nothing else.
        bayStub.listBays.mockReturnValue(of({ content: [] }));
        mobileUnitStub.listMobileUnits.mockReturnValue(
          of({ content: [{ id: 'unit-1', name: 'Van 4', baseLocationId: 'loc-1', status: 'ACTIVE' }] }),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units.map(unit => unit.unitType)).toEqual(['MOBILE_UNIT']);
      });

      it('carries the location inventory lifecycle status, not the dispatch occupancy verdict', async () => {
        // `BayResponse.status` is ACTIVE / OUT_OF_SERVICE, owned by pos-location.
        // `BayStatus.status` is pos-workorder's OCCUPIED / AVAILABLE occupancy
        // verdict (DashboardServiceImpl builds it as `occupant != null ?
        // "OCCUPIED" : "AVAILABLE"`). The design contract defines unitStatus as
        // the unit's own operational status, so only the first belongs here —
        // occupancy is already carried by whether `workorder` is set.
        bayStub.listBays.mockReturnValue(
          of({ content: [{ id: 'bay-1', name: 'Bay 1', status: 'ACTIVE' }] }),
        );
        dispatchStub.getDispatchDashboard.mockReturnValue(
          of(
            dashboard({
              bays: [
                {
                  bayId: 'bay-1',
                  bayName: 'Bay 1',
                  available: false,
                  status: 'OCCUPIED',
                  assignedWorkorderId: 'wo-1',
                },
              ],
              workorders: [{ workorderId: 'wo-1', status: 'WORK_IN_PROGRESS' }],
            }),
          ),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units[0].unitStatus).toBe('ACTIVE');
        expect(view.units[0].workorder?.workorderId).toBe('wo-1');
      });

      it('renders a dispatch-only bay that is holding open work', async () => {
        // pos-workorder emits a bay row outside its active set when open work is
        // on it — a bay decommissioned mid-job, or a replica row that has not
        // landed. It renders that row deliberately rather than let live work go
        // invisible; dropping it here would reintroduce the same blindness.
        // Its `status` is an occupancy verdict, never OUT_OF_SERVICE, so no
        // lifecycle filter applies.
        bayStub.listBays.mockReturnValue(of({ content: [] }));
        dispatchStub.getDispatchDashboard.mockReturnValue(
          of(
            dashboard({
              bays: [
                {
                  bayId: 'bay-gone',
                  bayName: 'Bay 9',
                  available: false,
                  status: 'OCCUPIED',
                  assignedWorkorderId: 'wo-1',
                },
              ],
              workorders: [{ workorderId: 'wo-1', workorderNumber: 'WO-1', status: 'WORK_IN_PROGRESS' }],
            }),
          ),
        );

        const view = await firstValueFrom(service.getDashboard('loc-1', DATE));

        expect(view.units.map(unit => unit.unitId)).toEqual(['bay-gone']);
        expect(view.units[0].workorder?.workorderNumber).toBe('WO-1');
        // No inventory row, so no lifecycle status is known — never the
        // occupancy value.
        expect(view.units[0].unitStatus).toBeUndefined();
      });
    });
  });
});
