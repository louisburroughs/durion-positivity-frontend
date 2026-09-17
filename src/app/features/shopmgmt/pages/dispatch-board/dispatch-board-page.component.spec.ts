import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { WorkorderSummaryResourceTypeEnum } from '@durion-sdk/workorder';
import { DispatchBoardPageComponent } from './dispatch-board-page.component';
import { DispatchBoardService } from '../../services/dispatch-board.service';
import { AuthService } from '../../../../core/services/auth.service';
import type { DashboardResponse } from '../../models/dispatch-board.models';
import { isoDateLocal } from '../../models/capacity-calendar.models';

// ---------------------------------------------------------------------------
// Fixtures — shaped after the SDK's DashboardResponse, not a local invention
// ---------------------------------------------------------------------------
// The board's day is the LOCAL date: `toISOString()` is already tomorrow from
// 17:00 Pacific onward, and an evening dispatcher would open the wrong day.
const TODAY = isoDateLocal(new Date());

const emptyDashboard: DashboardResponse = {
  date: TODAY,
  locationId: 'LOC-1',
  workorders: [],
  mechanics: [],
  bays: [],
  conflicts: [],
  lastRefreshed: new Date().toISOString(),
  dataQualityWarning: false,
};

const loadedDashboard: DashboardResponse = {
  ...emptyDashboard,
  workorders: [
    { workorderId: 'WO-001', status: 'WORK_IN_PROGRESS', estimatedLaborHours: 3.5 },
    { workorderId: 'WO-002', status: 'APPROVED', estimatedLaborHours: 1 },
  ],
};

/** One row per lane, plus a roster and bays to place them on. */
const fullDashboard: DashboardResponse = {
  ...emptyDashboard,
  workorders: [
    {
      workorderId: 'wo-to-assign',
      workorderNumber: 'WO-24118',
      status: 'APPROVED',
      estimatedLaborHours: 3.5,
      serviceDescriptions: ['Brake reline'],
      vehicleDescription: '2021 Freightliner M2 106',
      customerName: 'Distribution Rt 12',
      serviceCount: 2,
      completedServiceCount: 0,
    },
    {
      workorderId: 'wo-parked',
      workorderNumber: 'WO-24122',
      status: 'APPROVED',
      estimatedLaborHours: 5,
      resourceType: WorkorderSummaryResourceTypeEnum.Hold,
      assignedResourceId: 'LOC-1',
    },
    {
      workorderId: 'wo-assigned',
      workorderNumber: 'WO-24124',
      status: 'ASSIGNED',
      estimatedLaborHours: 2,
      assignedMechanicId: 'M1',
      resourceType: WorkorderSummaryResourceTypeEnum.Bay,
      assignedResourceId: 'B1',
    },
    {
      workorderId: 'wo-draft',
      workorderNumber: 'WO-24129',
      status: 'DRAFT',
      estimatedLaborHours: 1,
    },
  ],
  mechanics: [
    { personId: 'M1', firstName: 'Ray', lastName: 'Delgado', assignedWorkorderId: 'wo-assigned' },
    { personId: 'M2', firstName: 'Dev', lastName: 'Patel' },
    { personId: 'M3', firstName: 'Hollis', lastName: 'Pike', onBreak: true },
  ],
  bays: [
    { bayId: 'B1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-assigned' },
    { bayId: 'B4', bayName: 'Bay 4', available: true, status: 'ACTIVE' },
  ],
};

describe('DispatchBoardPageComponent', () => {
  let fixture: ComponentFixture<DispatchBoardPageComponent>;
  let component: DispatchBoardPageComponent;

  /** Permissions default to granted; the permission specs narrow them. */
  const authStub = {
    permissionsKnown: () => true,
    hasAnyPermission: vi.fn().mockReturnValue(true),
    hasPermission: vi.fn().mockReturnValue(true),
  };

  const dispatchBoardServiceStub = {
    getDashboard: vi.fn().mockReturnValue(of(emptyDashboard)),
    getPrimaryLocation: vi.fn().mockReturnValue(of({ locationId: 'LOC-1' })),
    getAvailability: vi.fn().mockReturnValue(of([])),
    getBayInventory: vi.fn().mockReturnValue(of(new Map())),
    getTechnicianSkills: vi.fn().mockReturnValue(of(new Map())),
    assignMechanic: vi.fn().mockReturnValue(of({})),
    releaseMechanic: vi.fn().mockReturnValue(of({})),
    assignBay: vi.fn().mockReturnValue(of({})),
    releaseBay: vi.fn().mockReturnValue(of({})),
    parkWorkorder: vi.fn().mockReturnValue(of({})),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DispatchBoardPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: dispatchBoardServiceStub },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DispatchBoardPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
    authStub.permissionsKnown = () => true;
    authStub.hasAnyPermission.mockReturnValue(true);
    dispatchBoardServiceStub.getDashboard.mockReturnValue(of(emptyDashboard));
    dispatchBoardServiceStub.getPrimaryLocation.mockReturnValue(of({ locationId: 'LOC-1' }));
    dispatchBoardServiceStub.getBayInventory.mockReturnValue(of(new Map()));
    dispatchBoardServiceStub.getTechnicianSkills.mockReturnValue(of(new Map()));
    dispatchBoardServiceStub.assignMechanic.mockReturnValue(of({}));
    dispatchBoardServiceStub.releaseMechanic.mockReturnValue(of({}));
    dispatchBoardServiceStub.assignBay.mockReturnValue(of({}));
    dispatchBoardServiceStub.releaseBay.mockReturnValue(of({}));
    dispatchBoardServiceStub.parkWorkorder.mockReturnValue(of({}));
  });

  /** Render the board with a given payload already loaded. */
  function renderWith(response: DashboardResponse): void {
    dispatchBoardServiceStub.getDashboard.mockReturnValue(of(response));
    fixture.detectChanges();
  }

  function rowFor(workorderId: string): HTMLElement {
    const row = fixture.nativeElement.querySelector(`[data-wo="${workorderId}"]`);
    expect(row).toBeTruthy();
    return row as HTMLElement;
  }

  describe('initial location bootstrap', () => {
    it('loads the current user primary location on init', () => {
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getPrimaryLocation).toHaveBeenCalledTimes(1);
    });

    it('calls getDashboard with the primary location on init', () => {
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getDashboard).toHaveBeenCalledWith('LOC-1', TODAY);
    });

    it('does not call getDashboard when no location can be resolved', () => {
      dispatchBoardServiceStub.getPrimaryLocation.mockReturnValueOnce(of({}));
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getDashboard).not.toHaveBeenCalled();
      expect(component.error()).toBe('SHOPMGMT.DISPATCH_BOARD.ERROR_LOCATION_REQUIRED');
    });

    // #201: a persona with no primary assignment answers 404 upstream; the
    // service turns that into `{ locationId: undefined }`, which this page must
    // render as its location-required state, not as a broken page.
    it('treats the empty primary-location response as location-required without loading the dashboard', () => {
      dispatchBoardServiceStub.getPrimaryLocation.mockReturnValueOnce(of({ locationId: undefined }));
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getDashboard).not.toHaveBeenCalled();
      expect(component.error()).toBe('SHOPMGMT.DISPATCH_BOARD.ERROR_LOCATION_REQUIRED');
      expect(component.selectedLocationId()).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // AC1: "Daily Dispatch Board" title heading
  // -------------------------------------------------------------------------
  describe('AC1: title heading', () => {
    it('renders "Daily Dispatch Board" as the page title', () => {
      fixture.detectChanges();
      const heading: HTMLHeadingElement | null = fixture.nativeElement.querySelector('h1');
      expect(heading?.textContent).toContain('SHOPMGMT.DISPATCH_BOARD.TITLE');
    });
  });

  // -------------------------------------------------------------------------
  // AC2: Filter bar — location input and date input defaulting to today
  // -------------------------------------------------------------------------
  describe('AC2: filter bar', () => {
    it('renders a location picker in the filter bar', () => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-location-picker')).toBeTruthy();
    });

    it('renders a date input whose value defaults to today ISO date', () => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('input[type="date"]')).toBeTruthy();
      expect(component.selectedDate()).toBe(TODAY);
    });

    it('disables the refresh button when location is blank', () => {
      dispatchBoardServiceStub.getPrimaryLocation.mockReturnValueOnce(of({}));
      fixture.detectChanges();

      const refreshButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
      expect(refreshButton?.disabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AC3: Refresh button visible
  // -------------------------------------------------------------------------
  describe('AC3: refresh button', () => {
    it('renders a visible Refresh button', () => {
      fixture.detectChanges();
      const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
      const refreshBtn = buttons.find(button =>
        button.textContent?.trim().includes('SHOPMGMT.DISPATCH_BOARD.REFRESH'),
      );
      expect(refreshBtn).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // AC4: Successful load renders workorder rows
  // -------------------------------------------------------------------------
  describe('AC4: workorder rows on successful load', () => {
    it('renders one .workorder-row per workorder in the response', () => {
      renderWith(loadedDashboard);

      expect(fixture.nativeElement.querySelectorAll('.workorder-row').length).toBe(2);
    });

    it('each workorder row displays the workorder identifier', () => {
      renderWith(loadedDashboard);

      const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.workorder-row');
      expect(rows[0].textContent).toContain('WO-001');
    });

    // The status is a translated label, not the raw backend enum: the locale
    // files already carry one for every value this board can receive.
    it('each workorder row displays the status through its translated label', () => {
      renderWith(loadedDashboard);

      const chip: HTMLElement = fixture.nativeElement.querySelector('.workorder-status');
      expect(chip.textContent?.trim()).toBe('WORKEXEC.WIP_STATUS.WORK_IN_PROGRESS');
    });

    it('falls back to the raw value for a status no locale file carries', () => {
      renderWith({ ...emptyDashboard, workorders: [{ workorderId: 'WO-9', status: 'NEW_STATUS' }] });

      const chip: HTMLElement = fixture.nativeElement.querySelector('.workorder-status');
      expect(chip.textContent?.trim()).toBe('NEW_STATUS');
    });

    it('prefers the human-readable workorder number over the id', () => {
      renderWith(fullDashboard);

      expect(rowFor('wo-to-assign').textContent).toContain('WO-24118');
    });
  });

  // -------------------------------------------------------------------------
  // AC5: empty state
  // -------------------------------------------------------------------------
  describe('AC5: empty state', () => {
    it('shows .empty-state element when workorders array is empty', () => {
      renderWith(emptyDashboard);

      expect(fixture.nativeElement.querySelector('.empty-state')).toBeTruthy();
    });

    it('renders zero .workorder-row elements when response has no workorders', () => {
      renderWith(emptyDashboard);

      expect(fixture.nativeElement.querySelectorAll('.workorder-row').length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // AC6: error state with retry (no prior successful load)
  // -------------------------------------------------------------------------
  describe('AC6: error state with retry', () => {
    it('shows .state-panel element when service errors on initial load', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Server error' } })),
      );
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.state-panel')).toBeTruthy();
    });

    // `errorKey` is rendered through `| translate`, and ngx-translate passes an
    // unknown key through verbatim: a server message would reach a French user
    // in English, with every dot in it read as a nested key path.
    it('sets the error signal to a translation key, never to the server message', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Server error' } })),
      );
      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.error()).toBe('SHOPMGMT.DISPATCH_BOARD.ERROR_LOAD');
    });

    it('clicking the retry button triggers a new getDashboard call', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Server error' } })),
      );
      fixture.detectChanges();

      const retryBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.state-panel button');
      retryBtn.click();
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getDashboard).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // AC7 / AC8 / AC9 / AC10: freshness, degraded data, polling, staleness
  // -------------------------------------------------------------------------
  describe('AC7: last-updated timestamp', () => {
    it('displays a .last-updated element after a successful load', () => {
      renderWith(loadedDashboard);

      const el: HTMLElement | null = fixture.nativeElement.querySelector('.last-updated');
      expect(el?.textContent).toContain('SHOPMGMT.DISPATCH_BOARD.LAST_UPDATED');
    });

    it('does not show .last-updated before the first successful load completes', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(new Subject());
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.last-updated')).toBeFalsy();
    });
  });

  describe('AC8: data quality warning banner', () => {
    it('shows .data-quality-warning banner when dataQualityWarning is true', () => {
      renderWith({ ...loadedDashboard, dataQualityWarning: true });

      expect(fixture.nativeElement.querySelector('.data-quality-warning')).toBeTruthy();
    });

    it('does not show .data-quality-warning banner when dataQualityWarning is false', () => {
      renderWith(loadedDashboard);

      expect(fixture.nativeElement.querySelector('.data-quality-warning')).toBeFalsy();
    });
  });

  describe('AC9: 30-second auto-refresh polling', () => {
    it('calls getDashboard again after 30 seconds have elapsed', fakeAsync(() => {
      renderWith(loadedDashboard);
      const before = dispatchBoardServiceStub.getDashboard.mock.calls.length;

      tick(30_000);

      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(before + 1);
      discardPolling();
    }));

    it('does NOT poll again before 30 seconds have elapsed', fakeAsync(() => {
      renderWith(loadedDashboard);
      const before = dispatchBoardServiceStub.getDashboard.mock.calls.length;

      tick(29_000);

      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(before);
      discardPolling();
    }));

    /** The 30s interval never completes; tearing the fixture down cancels it. */
    function discardPolling(): void {
      fixture.destroy();
    }
  });

  describe('AC10: stale data banner after error following prior success', () => {
    it('keeps workorder rows visible when a refresh fails after prior successful load', () => {
      renderWith(loadedDashboard);

      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      component.refresh();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('.workorder-row').length).toBe(2);
    });

    it('shows .stale-data-banner after a refresh error when prior data exists', () => {
      renderWith(loadedDashboard);

      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      component.refresh();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.stale-data-banner')).toBeTruthy();
    });

    it('does NOT show .stale-data-banner on the initial successful load', () => {
      renderWith(loadedDashboard);

      expect(fixture.nativeElement.querySelector('.stale-data-banner')).toBeFalsy();
    });
  });

  // -------------------------------------------------------------------------
  // Roster rail
  // -------------------------------------------------------------------------
  describe('mechanic rail', () => {
    it('lists on-duty mechanics and keeps those on break out of the list', () => {
      renderWith(fullDashboard);

      expect(component.mechanics().map(mechanic => mechanic.personId)).toEqual(['M1', 'M2']);
      expect(component.offDutyMechanics().map(mechanic => mechanic.personId)).toEqual(['M3']);
    });

    it('reads a mechanic holding a workorder as WORKING and an unassigned one as IDLE', () => {
      renderWith(fullDashboard);

      const byId = new Map(component.mechanics().map(mechanic => [mechanic.personId, mechanic]));
      expect(byId.get('M1')?.availability).toBe('WORKING');
      expect(byId.get('M2')?.availability).toBe('IDLE');
    });

    // PTO outranks every other flag: approved time off means out for the day.
    // Pinned to an explicit date rather than "today" so the assertion cannot
    // straddle a midnight rollover between fixture and component construction.
    it('puts a mechanic on PTO covering the selected date out of the on-duty list', () => {
      const onLeave = '2026-05-04';
      renderWith({
        ...fullDashboard,
        mechanics: [
          {
            personId: 'M2',
            firstName: 'Dev',
            lastName: 'Patel',
            assignedWorkorderId: 'wo-assigned',
            ptoEntries: [
              { ptoId: 'p1', ptoType: 'VACATION', start: `${onLeave}T00:00:00Z`, end: `${onLeave}T23:59:59Z` },
            ],
          },
        ],
      });
      component.selectedDate.set(onLeave);

      expect(component.mechanics()).toHaveLength(0);
      expect(component.offDutyMechanics()[0].availability).toBe('OFF');
    });

    it('keeps a mechanic on duty when their PTO does not cover the selected date', () => {
      renderWith({
        ...fullDashboard,
        mechanics: [
          {
            personId: 'M2',
            firstName: 'Dev',
            lastName: 'Patel',
            ptoEntries: [
              { ptoId: 'p1', ptoType: 'VACATION', start: '2026-05-04T00:00:00Z', end: '2026-05-04T23:59:59Z' },
            ],
          },
        ],
      });
      component.selectedDate.set('2026-05-05');

      expect(component.mechanics().map(mechanic => mechanic.personId)).toEqual(['M2']);
    });

    it('names the bay a working mechanic stands in', () => {
      renderWith(fullDashboard);

      expect(component.mechanics().find(m => m.personId === 'M1')?.whereLabel).toBe('Bay 1');
    });

    it('renders the skill codes the technician roster supplies', () => {
      dispatchBoardServiceStub.getTechnicianSkills.mockReturnValue(
        of(new Map([['M1', ['BRAKES', 'DOT']]])),
      );
      renderWith(fullDashboard);

      const certs: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.mech .cert'));
      expect(certs.map(cert => cert.textContent?.trim())).toEqual(['BRAKES', 'DOT']);
    });

    it('leaves the free-hours slot as a not-available placeholder', () => {
      renderWith(fullDashboard);

      expect(component.mechanics()[0].freeHours).toBeNull();
      expect(fixture.nativeElement.querySelector('.mech .mfree.na')).toBeTruthy();
    });
  });

  describe('bay rail', () => {
    it('lists only bays that are available and hold no workorder', () => {
      renderWith(fullDashboard);

      expect(component.openBays().map(bay => bay.bayId)).toEqual(['B4']);
    });

    it('labels an open bay with the bay type from the location domain', () => {
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(
        of(new Map([['B4', { bayId: 'B4', name: 'Bay 4', kind: 'ALIGNMENT', outOfService: false }]])),
      );
      renderWith(fullDashboard);

      expect(component.openBays()[0].kind).toBe('ALIGNMENT');
      expect(fixture.nativeElement.querySelector('.bay em')?.textContent).toContain('ALIGNMENT');
    });

    it('falls back to a not-available placeholder when the bay type has not replicated', () => {
      renderWith(fullDashboard);

      expect(component.openBays()[0].kind).toBeNull();
      expect(fixture.nativeElement.querySelector('.bay em.na')).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Lanes, filters and sort
  // -------------------------------------------------------------------------
  describe('lanes', () => {
    it('splits rows into to-assign, parked and assigned', () => {
      renderWith(fullDashboard);

      expect(component.toAssignRows().map(row => row.workorderId)).toEqual(['wo-to-assign', 'wo-draft']);
      expect(component.heldRows().map(row => row.workorderId)).toEqual(['wo-parked']);
      expect(component.assignedRows().map(row => row.workorderId)).toEqual(['wo-assigned']);
    });

    // HOLD is the site's parking position, which is the board's on-hold lane.
    it('reads a workorder placed on HOLD as parked rather than as awaiting assignment', () => {
      renderWith(fullDashboard);

      const parked = component.heldRows()[0];
      expect(parked.parked).toBe(true);
      expect(parked.bayId).toBeNull();
    });
  });

  describe('filters', () => {
    it('narrows rows to the search term across number, job, vehicle and customer', () => {
      renderWith(fullDashboard);

      component.query.set('freightliner');
      fixture.detectChanges();

      expect(component.rows().map(row => row.workorderId)).toEqual(['wo-to-assign']);
    });

    it('the DRAFT segment keeps only draft workorders', () => {
      renderWith(fullDashboard);

      component.setStatusFilter('DRAFT');

      expect(component.rows().map(row => row.workorderId)).toEqual(['wo-draft']);
    });

    it('the OPEN segment drops drafts', () => {
      renderWith(fullDashboard);

      component.setStatusFilter('OPEN');

      expect(component.rows().map(row => row.workorderId)).not.toContain('wo-draft');
    });

    it('sorts by estimated hours, longest first', () => {
      renderWith(fullDashboard);

      expect(component.toAssignRows().map(row => row.estimatedHours)).toEqual([3.5, 1]);
    });

    // Nothing on the response orders by promise time or priority, so those two
    // options stay inert rather than silently sorting by something else.
    it('refuses the sort options no field backs', () => {
      renderWith(fullDashboard);

      component.setSort('DUE');

      expect(component.sortKey()).toBe('HOURS');
      expect(component.isSortAvailable('PRIORITY')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Assignment
  // -------------------------------------------------------------------------
  describe('assigning a mechanic', () => {
    it('assigns with no incumbent when the row has no mechanic', () => {
      renderWith(fullDashboard);

      component.assignMechanic(component.toAssignRows()[0], 'M2');

      expect(dispatchBoardServiceStub.assignMechanic).toHaveBeenCalledWith('wo-to-assign', 'M2', null);
    });

    // The incumbent decides the endpoint: assign refuses a taken workorder and
    // reassign refuses an empty one, so the board must pass what it knows.
    it('passes the incumbent when the row already has a mechanic', () => {
      renderWith(fullDashboard);

      component.assignMechanic(component.assignedRows()[0], 'M2');

      expect(dispatchBoardServiceStub.assignMechanic).toHaveBeenCalledWith('wo-assigned', 'M2', 'M1');
    });

    it('releases the mechanic when the slot is cleared', () => {
      renderWith(fullDashboard);

      component.clearMechanic(component.assignedRows()[0]);

      expect(dispatchBoardServiceStub.releaseMechanic).toHaveBeenCalledWith('wo-assigned');
    });

    it('re-reads the board after a successful assignment rather than predicting the status', () => {
      renderWith(fullDashboard);
      const before = dispatchBoardServiceStub.getDashboard.mock.calls.length;

      component.assignMechanic(component.toAssignRows()[0], 'M2');

      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(before + 1);
    });

    it('disables the mechanic slot on a draft workorder', () => {
      renderWith(fullDashboard);

      const slot: HTMLButtonElement | null = rowFor('wo-draft').querySelector('button.slot');
      expect(slot?.disabled).toBe(true);
    });

    it('refuses a mechanic drop onto a draft workorder', () => {
      renderWith(fullDashboard);
      component.onDragStart('MECHANIC', 'M2', new DragEvent('dragstart'));

      const draft = component.rows().find(row => row.workorderId === 'wo-draft')!;
      expect(component.canDrop(draft)).toBe(false);
    });
  });

  describe('assigning a bay', () => {
    it('places the workorder on the chosen bay', () => {
      renderWith(fullDashboard);

      component.assignBay(component.toAssignRows()[0], 'B4');

      expect(dispatchBoardServiceStub.assignBay).toHaveBeenCalledWith('wo-to-assign', 'B4');
    });

    it('releases the position when the bay slot is cleared', () => {
      renderWith(fullDashboard);

      component.clearBay(component.assignedRows()[0]);

      expect(dispatchBoardServiceStub.releaseBay).toHaveBeenCalledWith('wo-assigned');
    });

    it('routes a picker choice to the same mutation', () => {
      renderWith(fullDashboard);

      component.openPicker('BAY', 'wo-to-assign');
      component.pick('B4');

      expect(dispatchBoardServiceStub.assignBay).toHaveBeenCalledWith('wo-to-assign', 'B4');
      expect(component.picker()).toBeNull();
    });
  });

  describe('undo', () => {
    it('clears a mechanic that had no predecessor', () => {
      renderWith(fullDashboard);
      component.assignMechanic(component.toAssignRows()[0], 'M2');

      component.undo();

      expect(dispatchBoardServiceStub.releaseMechanic).toHaveBeenCalledWith('wo-to-assign');
    });

    // The incumbent undo passes is the one its own mutation left behind, not the
    // one the row still shows: the post-mutation re-read has not landed yet.
    it('puts the previous mechanic back after a reassignment', () => {
      renderWith(fullDashboard);
      component.assignMechanic(component.assignedRows()[0], 'M2');

      component.undo();

      expect(dispatchBoardServiceStub.assignMechanic).toHaveBeenLastCalledWith('wo-assigned', 'M1', 'M2');
    });
  });

  describe('mutation failures', () => {
    it('maps an occupied bay onto its own message', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.assignBay.mockReturnValueOnce(
        throwError(() => ({ error: { code: 'RESOURCE_OCCUPIED' } })),
      );

      component.assignBay(component.toAssignRows()[0], 'B4');

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_BAY_OCCUPIED');
      expect(component.toast()?.tone).toBe('ERROR');
    });

    it('maps an unstaffed technician onto its own message', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(
        throwError(() => ({ error: { code: 'TECHNICIAN_NOT_STAFFED_AT_SITE' } })),
      );

      component.assignMechanic(component.toAssignRows()[0], 'M2');

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_NOT_STAFFED');
    });

    it('falls back to a generic message for an unrecognised refusal', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.assignBay.mockReturnValueOnce(throwError(() => ({ status: 500 })));

      component.assignBay(component.toAssignRows()[0], 'B4');

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_GENERIC');
    });

    it('offers no undo on a failed mutation', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.assignBay.mockReturnValueOnce(throwError(() => ({ status: 500 })));

      component.assignBay(component.toAssignRows()[0], 'B4');

      expect(component.toast()?.undo).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Fields with no backing source
  // -------------------------------------------------------------------------
  describe('unavailable fields', () => {
    it('counts what it can and leaves capacity and due-soon unset', () => {
      renderWith(fullDashboard);

      const stats = component.stats();
      expect(stats.toAssign).toBe(2);
      expect(stats.toAssignHours).toBe(4.5);
      expect(stats.baysOpen).toBe(1);
      expect(stats.baysTotal).toBe(2);
      expect(stats.parked).toBe(1);
      expect(stats.openCapacityHours).toBeNull();
      expect(stats.dueSoon).toBeNull();
    });

    it('marks promised time, priority and required skills as not available on every row', () => {
      renderWith(fullDashboard);

      for (const row of component.allRows()) {
        expect(row.dueAt).toBeNull();
        expect(row.priority).toBeNull();
        expect(row.requiredSkills).toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Enrichment is decoration, never a gate on the board
  // -------------------------------------------------------------------------
  describe('enrichment failures', () => {
    it('still renders the board when bay types and technician skills both fail', () => {
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(throwError(() => ({ status: 503 })));
      dispatchBoardServiceStub.getTechnicianSkills.mockReturnValue(throwError(() => ({ status: 503 })));
      renderWith(fullDashboard);

      expect(component.state()).toBe('ready');
      expect(fixture.nativeElement.querySelectorAll('.workorder-row').length).toBe(4);
    });
  });
  // -------------------------------------------------------------------------
  // Regressions from PR review
  // -------------------------------------------------------------------------
  describe('stale response handling', () => {
    // refresh(), the 30s poll and the post-mutation reload are independent
    // subscriptions; without sequencing, a slow earlier read lands last and
    // overwrites the newer board.
    it('ignores a dashboard response superseded by a newer read', () => {
      const slow = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(slow);
      fixture.detectChanges();

      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(fullDashboard));
      component.refresh();
      expect(component.allRows()).toHaveLength(4);

      slow.next({ ...emptyDashboard, workorders: [{ workorderId: 'stale', status: 'APPROVED' }] });

      expect(component.allRows().map(row => row.workorderId)).not.toContain('stale');
      expect(component.allRows()).toHaveLength(4);
    });

    it('ignores an error from a read a newer one has already superseded', () => {
      const slow = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(slow);
      fixture.detectChanges();

      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(fullDashboard));
      component.refresh();

      slow.error({ status: 500 });

      expect(component.state()).toBe('ready');
      expect(component.isStale()).toBe(false);
    });

    // Guarding the APPLY is not enough: the rail's roster of record would keep
    // the previous shop's bays draggable for the whole in-flight window, and
    // placing one is a 422 because the position is at another site.
    it('clears the previous shop\'s enrichment as the new load starts', () => {
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(
        of(new Map([['B4', { bayId: 'B4', name: 'Bay 4', kind: 'ALIGNMENT', outOfService: false }]])),
      );
      renderWith(fullDashboard);
      expect(component.bayInventory().size).toBe(1);

      const pendingInventory = new Subject<never>();
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(pendingInventory);
      dispatchBoardServiceStub.getTechnicianSkills.mockReturnValue(new Subject());
      component.selectedLocationId.set('LOC-2');
      component.refresh();

      expect(component.bayInventory().size).toBe(0);
      expect(component.technicianSkills().size).toBe(0);
    });

    it('drops enrichment that arrives after the location changed', () => {
      const slowSkills = new Subject<ReadonlyMap<string, readonly string[]>>();
      dispatchBoardServiceStub.getTechnicianSkills.mockReturnValue(slowSkills);
      renderWith(fullDashboard);

      component.selectedLocationId.set('LOC-2');
      slowSkills.next(new Map([['M1', ['STALE']]]));
      slowSkills.complete();

      expect(component.mechanics().find(m => m.personId === 'M1')?.skillCodes).toEqual([]);
    });
  });

  describe('closed workorders', () => {
    const withClosed: DashboardResponse = {
      ...fullDashboard,
      workorders: [
        ...fullDashboard.workorders,
        {
          workorderId: 'wo-closed',
          workorderNumber: 'WO-24100',
          status: 'COMPLETED',
          assignedMechanicId: 'M1',
        },
      ],
    };

    // Every dispatch write on a closed workorder answers 409 WORKORDER_CLOSED,
    // so the click path must refuse it exactly as the drag path does.
    it('refuses a mechanic and a bay on a closed workorder', () => {
      renderWith(withClosed);

      const closed = component.allRows().find(row => row.workorderId === 'wo-closed')!;
      expect(closed.closed).toBe(true);
      expect(component.canTakeMechanic(closed)).toBe(false);
      expect(component.canTakeBay(closed)).toBe(false);
    });

    it('disables the clear control on a closed workorder', () => {
      renderWith(withClosed);

      const clear: HTMLButtonElement | null = rowFor('wo-closed').querySelector('button.clear');
      expect(clear?.disabled).toBe(true);
    });

    it('refuses a drop onto a closed workorder', () => {
      renderWith(withClosed);
      component.onDragStart('BAY', 'B4', new DragEvent('dragstart'));

      const closed = component.allRows().find(row => row.workorderId === 'wo-closed')!;
      expect(component.canDrop(closed)).toBe(false);
    });
  });

  describe('concurrent mutations', () => {
    // A second drop or click while the first write is in flight races it, and
    // response order would decide which assignment survives.
    it('refuses a second write on a workorder while the first is pending', () => {
      const pending = new Subject<unknown>();
      dispatchBoardServiceStub.assignMechanic.mockReturnValue(pending);
      renderWith(fullDashboard);
      const row = component.toAssignRows()[0];

      component.assignMechanic(row, 'M2');
      component.assignMechanic(row, 'M3');

      expect(dispatchBoardServiceStub.assignMechanic).toHaveBeenCalledTimes(1);
      expect(component.isPending(row.workorderId)).toBe(true);
    });

    it('releases the guard once the write settles', () => {
      renderWith(fullDashboard);
      const row = component.toAssignRows()[0];

      component.assignMechanic(row, 'M2');

      expect(component.isPending(row.workorderId)).toBe(false);
    });

    it('does not block a different workorder', () => {
      const pending = new Subject<unknown>();
      dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(pending);
      renderWith(fullDashboard);

      component.assignMechanic(component.toAssignRows()[0], 'M2');
      component.assignMechanic(component.assignedRows()[0], 'M2');

      expect(dispatchBoardServiceStub.assignMechanic).toHaveBeenCalledTimes(2);
    });
  });

  describe('stale projections', () => {
    // Completing a workorder frees its position backend-side, so a bay still
    // linked to a closed one is stale data, not occupancy.
    it('reads a bay linked to a closed workorder as free', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'done', status: 'COMPLETED' }],
        bays: [{ bayId: 'B1', bayName: 'Bay 1', available: true, status: 'ACTIVE', assignedWorkorderId: 'done' }],
      });

      expect(component.openBays().map(bay => bay.bayId)).toEqual(['B1']);
      expect(component.stats().baysOpen).toBe(1);
    });

    it('still reads a bay held by an open workorder as occupied', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'live', status: 'WORK_IN_PROGRESS' }],
        bays: [{ bayId: 'B1', bayName: 'Bay 1', available: true, status: 'ACTIVE', assignedWorkorderId: 'live' }],
      });

      expect(component.openBays()).toHaveLength(0);
    });

    // A DRAFT workorder can hold a bay even though it cannot take a technician.
    it('reads a bay held by a draft workorder as occupied', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'draft', status: 'DRAFT' }],
        bays: [{ bayId: 'B1', bayName: 'Bay 1', available: true, status: 'ACTIVE', assignedWorkorderId: 'draft' }],
      });

      expect(component.openBays()).toHaveLength(0);
    });

    it('never renders a raw resource id when the bay replica has not arrived', () => {
      renderWith({
        ...fullDashboard,
        bays: [],
        workorders: [
          {
            workorderId: 'wo-assigned',
            workorderNumber: 'WO-24124',
            status: 'ASSIGNED',
            assignedMechanicId: 'M1',
            resourceType: WorkorderSummaryResourceTypeEnum.Bay,
            assignedResourceId: 'bay-uuid-not-replicated',
          },
        ],
      });

      expect(component.allRows()[0].bayName).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('bay-uuid-not-replicated');
    });
  });

  describe('date-only handling (ADR-0038)', () => {
    // `new Date('2026-09-16')` is UTC midnight, which the date pipe renders as
    // the previous day for every UTC-N user.
    it('parses the scheduled date at local midnight, not UTC midnight', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'w', status: 'APPROVED', scheduledDate: '2026-09-16' }],
      });

      const scheduled = component.allRows()[0].scheduledDate!;
      expect(scheduled.getFullYear()).toBe(2026);
      expect(scheduled.getMonth()).toBe(8);
      expect(scheduled.getDate()).toBe(16);
    });

    it('leaves the scheduled date null when the response omits it', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'w', status: 'APPROVED' }],
      });

      expect(component.allRows()[0].scheduledDate).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Reassignment without a release
  // -------------------------------------------------------------------------
  describe('changing a filled slot', () => {
    // Clear-then-add is not the same write: release + assign walks the status
    // ASSIGNED -> APPROVED -> ASSIGNED and writes two extra transitions and two
    // extra status events, where reassignTechnician keeps it ASSIGNED.
    it('opens the mechanic picker from a filled slot and routes it to a reassign', () => {
      renderWith(fullDashboard);

      const change: HTMLButtonElement | null = rowFor('wo-assigned').querySelector('.slot.filled button.change');
      expect(change).toBeTruthy();
      change!.click();
      expect(component.picker()).toEqual({ kind: 'MECHANIC', workorderId: 'wo-assigned' });

      component.pick('M2');

      expect(dispatchBoardServiceStub.assignMechanic).toHaveBeenCalledWith('wo-assigned', 'M2', 'M1');
      expect(dispatchBoardServiceStub.releaseMechanic).not.toHaveBeenCalled();
    });

    it('opens the bay picker from a filled bay slot, so a move is one write', () => {
      renderWith(fullDashboard);

      const controls: HTMLButtonElement[] = Array.from(
        rowFor('wo-assigned').querySelectorAll('.slot.filled button.change'),
      );
      expect(controls).toHaveLength(2);
      controls[1].click();
      expect(component.picker()).toEqual({ kind: 'BAY', workorderId: 'wo-assigned' });

      component.pick('B4');

      expect(dispatchBoardServiceStub.assignBay).toHaveBeenCalledWith('wo-assigned', 'B4');
      expect(dispatchBoardServiceStub.releaseBay).not.toHaveBeenCalled();
    });

    it('keeps the change control inert where the guards refuse the write', () => {
      renderWith({
        ...fullDashboard,
        workorders: [
          {
            workorderId: 'wo-closed',
            workorderNumber: 'WO-24100',
            status: 'COMPLETED',
            assignedMechanicId: 'M1',
          },
        ],
      });

      const change: HTMLButtonElement | null = rowFor('wo-closed').querySelector('.slot.filled button.change');
      expect(change?.disabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Statuses the technician endpoints accept
  // -------------------------------------------------------------------------
  describe('technician assignment window', () => {
    const readyForPickup: DashboardResponse = {
      ...fullDashboard,
      workorders: [{ workorderId: 'wo-ready', workorderNumber: 'WO-24140', status: 'READY_FOR_PICKUP' }],
    };

    // The contract allows APPROVED, ASSIGNED and WORK_IN_PROGRESS; "not draft,
    // not closed" also lets READY_FOR_PICKUP through, and that answers 400.
    it('refuses a mechanic on a status outside the allow-list', () => {
      renderWith(readyForPickup);

      const row = component.allRows()[0];
      expect(component.canTakeMechanic(row)).toBe(false);
      expect(component.mechanicBlockedKey(row)).toBe('SHOPMGMT.DISPATCH_BOARD.STATUS_NO_MECHANIC');
    });

    it('refuses a mechanic drop on a status outside the allow-list', () => {
      renderWith(readyForPickup);
      component.onDragStart('MECHANIC', 'M2', new DragEvent('dragstart'));

      expect(component.canDrop(component.allRows()[0])).toBe(false);
    });

    // Position placement keeps the wider rule: any open workorder, DRAFT too.
    it('still takes a bay on the same workorder', () => {
      renderWith(readyForPickup);

      expect(component.canTakeBay(component.allRows()[0])).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Refusals
  // -------------------------------------------------------------------------
  describe('refused mutations', () => {
    const refusals: readonly [string, string][] = [
      ['TECHNICIAN_NOT_ASSIGNED', 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_MECHANIC_NOT_ASSIGNED'],
      ['TECHNICIAN_NOT_FOUND', 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_MECHANIC_NOT_FOUND'],
      ['SERVICE_POSITION_INVALID', 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_BAY_INVALID'],
    ];

    for (const [code, key] of refusals) {
      it(`maps ${code} onto its own message`, () => {
        renderWith(fullDashboard);
        dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(
          throwError(() => ({ status: 409, error: { code } })),
        );

        component.assignMechanic(component.assignedRows()[0], 'M2');

        expect(component.toast()?.key).toBe(key);
      });
    }

    // A 409 is the backend saying the board's copy is wrong. Without a re-read
    // the row keeps showing what was contradicted, and every retry repeats the
    // same wrong call.
    it('re-reads the board after a refusal', () => {
      renderWith(fullDashboard);
      const before = dispatchBoardServiceStub.getDashboard.mock.calls.length;
      dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(
        throwError(() => ({ status: 409, error: { code: 'TECHNICIAN_NOT_ASSIGNED' } })),
      );

      component.assignMechanic(component.assignedRows()[0], 'M2');

      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(before + 1);
    });

    it('does not re-read after a failure that says nothing about the board', () => {
      renderWith(fullDashboard);
      const before = dispatchBoardServiceStub.getDashboard.mock.calls.length;
      dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(throwError(() => ({ status: 500 })));

      component.assignMechanic(component.assignedRows()[0], 'M2');

      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // Undo puts back what was there, not something near it
  // -------------------------------------------------------------------------
  describe('undo fidelity', () => {
    // Releasing already took the incumbent off, so undo must assign, not
    // reassign — the row has not been re-read yet and still names the old one.
    it('assigns rather than reassigns when undoing a release', () => {
      renderWith(fullDashboard);
      component.clearMechanic(component.assignedRows()[0]);

      component.undo();

      expect(dispatchBoardServiceStub.assignMechanic).toHaveBeenCalledWith('wo-assigned', 'M1', null);
    });

    // A parked workorder stands in the site's lot; releasing it would leave it
    // deliberately unplaced, which is a third state, not the original.
    it('parks a workorder again when undoing a bay placement that replaced a HOLD', () => {
      renderWith(fullDashboard);
      component.assignBay(component.heldRows()[0], 'B4');

      component.undo();

      expect(dispatchBoardServiceStub.parkWorkorder).toHaveBeenCalledWith('wo-parked');
      expect(dispatchBoardServiceStub.releaseBay).not.toHaveBeenCalled();
    });

    it('still releases the position when there was none to put back', () => {
      renderWith(fullDashboard);
      component.assignBay(component.toAssignRows()[0], 'B4');

      component.undo();

      expect(dispatchBoardServiceStub.releaseBay).toHaveBeenCalledWith('wo-to-assign');
    });
  });

  // -------------------------------------------------------------------------
  // The controls are the query
  // -------------------------------------------------------------------------
  describe('reactive loading', () => {
    it('loads exactly once on the first render', () => {
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getDashboard).toHaveBeenCalledTimes(1);
    });

    it('reloads when the date changes', () => {
      renderWith(fullDashboard);
      const before = dispatchBoardServiceStub.getDashboard.mock.calls.length;

      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(before + 1);
      expect(dispatchBoardServiceStub.getDashboard).toHaveBeenLastCalledWith('LOC-1', '2026-05-04');
    });

    it('reloads when the location changes', () => {
      renderWith(fullDashboard);

      component.onLocationPicked('LOC-2');
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getDashboard).toHaveBeenLastCalledWith('LOC-2', TODAY);
    });

    // The poll never blanks the board; a manual refresh over the same selection
    // should not either.
    it('keeps the board on screen while a manual refresh is in flight', () => {
      renderWith(fullDashboard);
      const slow = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(slow);

      component.refresh();
      fixture.detectChanges();

      expect(component.state()).toBe('loading');
      expect(fixture.nativeElement.querySelectorAll('.workorder-row').length).toBe(4);
      expect(fixture.nativeElement.querySelector('.refreshing')).toBeTruthy();
    });

    // A board loaded for another shop is not a fallback: left up behind a failed
    // read it shows one location while the controls show another, and a drop
    // would then mutate workorders the dispatcher is not looking at.
    it('drops the cached board when the failed read was for a different location', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValue(throwError(() => ({ status: 500 })));

      component.onLocationPicked('LOC-2');
      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.allRows()).toHaveLength(0);
      expect(fixture.nativeElement.querySelectorAll('.workorder-row').length).toBe(0);
    });

    it('defaults the date to the local calendar day, not the UTC one', () => {
      fixture.detectChanges();
      const now = new Date();
      const local = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-');

      expect(component.todayIso()).toBe(local);
      expect(component.selectedDate()).toBe(local);
    });
  });

  // -------------------------------------------------------------------------
  // Two projections of the same bay
  // -------------------------------------------------------------------------
  describe('bay reconciliation', () => {
    it('never gives a bay a display name it does not have', () => {
      renderWith({
        ...fullDashboard,
        workorders: [],
        bays: [{ bayId: 'bay-uuid-not-replicated', available: true, status: 'ACTIVE' }],
      });

      expect(component.openBays()[0].name).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('bay-uuid-not-replicated');
      expect(fixture.nativeElement.querySelector('.bay')?.getAttribute('aria-label')).not.toContain(
        'bay-uuid-not-replicated',
      );
    });

    // The claim is the bay's own live feed. A summary the response does not
    // carry disproves nothing, and calling the bay free invites a second
    // workorder onto it.
    it('keeps a bay occupied when the workorder claiming it is absent from the response', () => {
      renderWith({
        ...fullDashboard,
        workorders: [],
        bays: [
          { bayId: 'B1', bayName: 'Bay 1', available: true, status: 'ACTIVE', assignedWorkorderId: 'unknown' },
        ],
      });

      expect(component.openBays()).toHaveLength(0);
    });

    // Occupancy and the workorder's own resource fields are independent
    // projections; a row showing an empty slot against an occupied bay leaves an
    // assignment nobody can clear.
    it('shows the bay that claims a workorder whose summary carries no resource', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'wo-x', workorderNumber: 'WO-X', status: 'APPROVED' }],
        bays: [{ bayId: 'B1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-x' }],
      });

      expect(component.allRows()[0].bayId).toBe('B1');
      expect(component.allRows()[0].bayName).toBe('Bay 1');
    });

    it('ignores a bay-side claim on a closed workorder', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'wo-done', workorderNumber: 'WO-DONE', status: 'COMPLETED' }],
        bays: [{ bayId: 'B1', bayName: 'Bay 1', available: true, status: 'ACTIVE', assignedWorkorderId: 'wo-done' }],
      });

      expect(component.allRows()[0].bayId).toBeNull();
    });

    // pos-workorder omits a bay whose replica row has not arrived, so the
    // location inventory is the roster of record for the rail.
    it('carries a bay the dispatch projection has not replicated', () => {
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(
        of(new Map([['B9', { bayId: 'B9', name: 'Bay 9', kind: 'GENERAL_SERVICE', outOfService: false }]])),
      );
      renderWith({ ...fullDashboard, bays: [] });

      expect(component.openBays().map(bay => bay.bayId)).toEqual(['B9']);
      expect(component.openBays()[0].name).toBe('Bay 9');
    });

    it('drops an out-of-service bay no open work stands on', () => {
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(
        of(new Map([['B9', { bayId: 'B9', name: 'Bay 9', kind: null, outOfService: true }]])),
      );
      renderWith({ ...fullDashboard, bays: [] });

      expect(component.allBays()).toHaveLength(0);
    });
  });

  describe('state machine ordering', () => {
    // The invariant is that `state` moves before `errorKey` changes, so no
    // observer sees a cleared error while the machine still reads 'error'.
    it('moves state before clearing the location-required error', () => {
      dispatchBoardServiceStub.getPrimaryLocation.mockReturnValueOnce(of({}));
      fixture.detectChanges();
      expect(component.state()).toBe('error');

      const seen: string[] = [];
      const originalState = component.state.set.bind(component.state);
      const originalError = component.errorKey.set.bind(component.errorKey);
      component.state.set = (value: never) => {
        seen.push('state');
        originalState(value);
      };
      component.errorKey.set = (value: never) => {
        seen.push('errorKey');
        originalError(value);
      };

      component.onLocationPicked('LOC-9');

      expect(seen).toEqual(['state', 'errorKey']);
    });
  });
  // -------------------------------------------------------------------------
  // Write permissions — the route is gated on a read authority only
  // -------------------------------------------------------------------------
  describe('write permissions', () => {
    it('refuses both writes when the session holds neither assign authority', () => {
      authStub.hasAnyPermission.mockReturnValue(false);
      renderWith(fullDashboard);

      expect(component.canAssignMechanic()).toBe(false);
      expect(component.canAssignBay()).toBe(false);
      expect(component.canTakeMechanic(component.toAssignRows()[0])).toBe(false);
      expect(component.canTakeBay(component.toAssignRows()[0])).toBe(false);
    });

    it('allows the bay write while refusing the technician write', () => {
      authStub.hasAnyPermission.mockImplementation((codes: readonly string[]) =>
        codes.includes('shop:bay:assign'),
      );
      renderWith(fullDashboard);

      expect(component.canTakeBay(component.toAssignRows()[0])).toBe(true);
      expect(component.canTakeMechanic(component.toAssignRows()[0])).toBe(false);
    });

    it('disables the slot control when the write is not permitted', () => {
      authStub.hasAnyPermission.mockReturnValue(false);
      renderWith(fullDashboard);

      const slot: HTMLButtonElement | null = rowFor('wo-to-assign').querySelector('button.slot');
      expect(slot?.disabled).toBe(true);
    });

    // A token with no perm_bits leaves permissions unknown; AuthService.canAccess
    // treats that as open, and so does this board.
    it('stays open when the token carries no permission claim', () => {
      authStub.permissionsKnown = () => false;
      authStub.hasAnyPermission.mockReturnValue(false);
      renderWith(fullDashboard);

      expect(component.canAssignMechanic()).toBe(true);
      expect(component.canAssignBay()).toBe(true);
    });
  });

  describe('guards re-checked at dispatch time', () => {
    // The dialog can outlive the row it was opened for.
    it('does not write when the row left the assignable window while the picker was open', () => {
      renderWith(fullDashboard);
      component.openPicker('MECHANIC', 'wo-to-assign');

      dispatchBoardServiceStub.getDashboard.mockReturnValue(
        of({
          ...fullDashboard,
          workorders: [
            { workorderId: 'wo-to-assign', workorderNumber: 'WO-24118', status: 'READY_FOR_PICKUP' },
          ],
        }),
      );
      component.refresh();
      component.pick('M2');

      expect(dispatchBoardServiceStub.assignMechanic).not.toHaveBeenCalled();
    });

    it('holds the pending guard until the post-mutation read settles', () => {
      renderWith(fullDashboard);
      const row = component.toAssignRows()[0];
      const slowRead = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValue(slowRead);

      component.assignMechanic(row, 'M2');
      expect(component.isPending(row.workorderId)).toBe(true);

      slowRead.next(fullDashboard);
      expect(component.isPending(row.workorderId)).toBe(false);
    });
  });

  describe('closed and stale projections, second pass', () => {
    // A closed workorder's own resource fields are stale too, not just a
    // bay-side claim.
    it('ignores a closed workorder\'s own BAY resource', () => {
      renderWith({
        ...fullDashboard,
        bays: [{ bayId: 'B1', bayName: 'Bay 1', available: false, status: 'ACTIVE' }],
        workorders: [
          {
            workorderId: 'wo-done',
            workorderNumber: 'WO-1',
            status: 'COMPLETED',
            resourceType: WorkorderSummaryResourceTypeEnum.Bay,
            assignedResourceId: 'B1',
          },
        ],
      });

      expect(component.allRows()[0].bayId).toBeNull();
    });

    // `available` and the claim go stale independently; resolving the holder
    // first stops a closed holder hiding the bay for good.
    it('frees a bay whose closed holder left available false behind', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'done', status: 'CANCELLED' }],
        bays: [
          { bayId: 'B1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'done' },
        ],
      });

      expect(component.openBays().map(bay => bay.bayId)).toContain('B1');
    });
  });
  // -------------------------------------------------------------------------
  // Round-4 regressions
  // -------------------------------------------------------------------------
  describe('clear controls are writes too', () => {
    it('refuses to clear a mechanic without the technician write authority', () => {
      authStub.hasAnyPermission.mockImplementation((codes: readonly string[]) =>
        codes.includes('shop:bay:assign'),
      );
      renderWith(fullDashboard);
      const row = component.assignedRows()[0];

      expect(component.canClearMechanic(row)).toBe(false);
      component.clearMechanic(row);

      expect(dispatchBoardServiceStub.releaseMechanic).not.toHaveBeenCalled();
    });

    it('refuses to clear a bay without the bay write authority', () => {
      authStub.hasAnyPermission.mockImplementation((codes: readonly string[]) =>
        codes.includes('workorder:workorder:assign-technician'),
      );
      renderWith(fullDashboard);
      const row = component.assignedRows()[0];

      expect(component.canClearBay(row)).toBe(false);
      component.clearBay(row);

      expect(dispatchBoardServiceStub.releaseBay).not.toHaveBeenCalled();
    });

    it('disables the clear control when the write is not permitted', () => {
      authStub.hasAnyPermission.mockReturnValue(false);
      renderWith(fullDashboard);

      const clear: HTMLButtonElement | null = rowFor('wo-assigned').querySelector('button.clear');
      expect(clear?.disabled).toBe(true);
    });
  });

  describe('undo survives the readback guard', () => {
    // Holding the pending guard across the readback made an immediate Undo
    // click a no-op: run() refused re-entry and the toast was already gone.
    it('offers undo only once the post-mutation read has settled', () => {
      renderWith(fullDashboard);
      const row = component.toAssignRows()[0];
      const slowRead = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValue(slowRead);

      component.assignMechanic(row, 'M2');
      expect(component.toast()?.undo).toBeNull();

      slowRead.next(fullDashboard);

      expect(component.toast()?.undo).not.toBeNull();
    });

    it('the undo it finally offers actually runs', () => {
      renderWith(fullDashboard);
      const row = component.toAssignRows()[0];

      component.assignMechanic(row, 'M2');
      component.undo();

      expect(dispatchBoardServiceStub.releaseMechanic).toHaveBeenCalledWith('wo-to-assign');
    });
  });

  describe('the two board surfaces agree', () => {
    // The row reconciles a bay-side claim; the mechanic chip must too, or the
    // row names a bay while the chip that points at it is blank.
    it('names the bay on the mechanic chip when only the bay side claims it', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'wo-x', workorderNumber: 'WO-X', status: 'ASSIGNED', assignedMechanicId: 'M1' }],
        mechanics: [{ personId: 'M1', firstName: 'Ray', lastName: 'Delgado', assignedWorkorderId: 'wo-x' }],
        bays: [
          { bayId: 'B1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-x' },
        ],
      });

      expect(component.allRows()[0].bayName).toBe('Bay 1');
      expect(component.mechanics().find(m => m.personId === 'M1')?.whereLabel).toBe('Bay 1');
    });
  });

  describe('load error messages name the right recovery', () => {
    it('does not tell a user who chose a location to choose a location', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        throwError(() => ({ error: { code: 'LOCATION_NOT_FOUND' } })),
      );
      fixture.detectChanges();

      expect(component.error()).toBe('SHOPMGMT.DISPATCH_BOARD.ERROR_LOCATION_NOT_FOUND');
    });
  });
  // -------------------------------------------------------------------------
  // Round-5 regressions
  // -------------------------------------------------------------------------
  describe('toast identity', () => {
    // Two rows assigned at once share a translation key, so matching the toast
    // on the key alone let an earlier readback hand a newer toast the wrong
    // undo target.
    it('does not let an earlier readback adopt a newer write\'s toast', () => {
      renderWith(fullDashboard);
      const firstRead = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(firstRead);

      component.assignMechanic(component.toAssignRows()[0], 'M2');
      const firstToastId = component.toast()?.id;

      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(fullDashboard));
      component.assignMechanic(component.assignedRows()[0], 'M2');
      const secondToastId = component.toast()?.id;

      firstRead.next(fullDashboard);

      expect(secondToastId).not.toBe(firstToastId);
      expect(component.toast()?.id).toBe(secondToastId);
    });
  });

  describe('a superseded readback hands its settlement on', () => {
    // This assertion previously required the opposite — that a superseded
    // readback never settles — which is exactly the lockout that behaviour
    // caused. Settlement is owed to whichever read lands as the current one,
    // so the write completes rather than being stranded.
    it('settles through the superseding read rather than being dropped', () => {
      renderWith(fullDashboard);
      const row = component.toAssignRows()[0];
      const mutationRead = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(mutationRead);

      component.assignMechanic(row, 'M2');
      expect(component.toast()?.undo).toBeNull();

      // The refresh supersedes the readback and pays the debt it left.
      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(fullDashboard));
      component.refresh();

      expect(component.isPending(row.workorderId)).toBe(false);
      expect(component.toast()?.undo).not.toBeNull();

      // The stale readback landing afterwards changes nothing.
      mutationRead.next(fullDashboard);
      expect(component.isPending(row.workorderId)).toBe(false);
    });
  });

  describe('the board never outlives its selection', () => {
    it('hides a board that answers a different location', () => {
      renderWith(fullDashboard);
      expect(component.showBoard()).toBe(true);

      component.selectedLocationId.set('LOC-OTHER');

      expect(component.hasCachedData()).toBe(false);
      expect(component.showBoard()).toBe(false);
    });

    it('drops freshness metadata that described the previous selection', () => {
      renderWith({ ...fullDashboard, dataQualityWarning: true });
      expect(component.dataQualityWarning()).toBe(true);

      component.selectedLocationId.set('LOC-OTHER');
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      component.refresh();

      expect(component.dataQualityWarning()).toBe(false);
      expect(component.lastRefreshed()).toBeNull();
    });
  });

  describe('polling keeps the rails current', () => {
    // An out-of-service bay would otherwise stay draggable until someone
    // pressed Refresh.
    it('refreshes bay inventory and skills on an accepted poll', fakeAsync(() => {
      renderWith(fullDashboard);
      const before = dispatchBoardServiceStub.getBayInventory.mock.calls.length;

      tick(30_000);

      expect(dispatchBoardServiceStub.getBayInventory.mock.calls.length).toBeGreaterThan(before);
      fixture.destroy();
    }));
  });

  describe('slot controls name their workorder', () => {
    it('gives the add-mechanic and add-bay controls an accessible name', () => {
      renderWith(fullDashboard);

      const slots: HTMLButtonElement[] = Array.from(
        rowFor('wo-to-assign').querySelectorAll('button.slot'),
      );

      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.getAttribute('aria-label')).toBeTruthy();
      }
    });
  });
  // -------------------------------------------------------------------------
  // Round-6 regressions
  // -------------------------------------------------------------------------
  describe('a write is never stranded', () => {
    // The previous round tied settlement to the originating read, so any read
    // that superseded the mutation readback left the row guarded forever with
    // no recovery short of reloading the page.
    it('releases the guard when a later read supersedes the mutation readback', () => {
      renderWith(fullDashboard);
      const row = component.toAssignRows()[0];
      const mutationRead = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(mutationRead);

      component.assignMechanic(row, 'M2');
      expect(component.isPending(row.workorderId)).toBe(true);

      // A refresh overtakes the readback, which then lands stale and is dropped.
      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(fullDashboard));
      component.refresh();
      mutationRead.next(fullDashboard);

      expect(component.isPending(row.workorderId)).toBe(false);
    });

    it('two overlapping writes both come out of the pending set', () => {
      renderWith(fullDashboard);
      const first = component.toAssignRows()[0];
      const second = component.assignedRows()[0];
      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(fullDashboard));

      component.assignMechanic(first, 'M2');
      component.assignMechanic(second, 'M2');

      expect(component.isPending(first.workorderId)).toBe(false);
      expect(component.isPending(second.workorderId)).toBe(false);
    });
  });

  describe('the picker never outlives its selection', () => {
    it('drops the picker row when the location changes', () => {
      renderWith(fullDashboard);
      component.openPicker('MECHANIC', 'wo-to-assign');
      expect(component.pickerRow()).not.toBeNull();

      component.selectedLocationId.set('LOC-OTHER');

      expect(component.pickerRow()).toBeNull();
    });

    it('writes nothing when picked after the selection moved on', () => {
      renderWith(fullDashboard);
      component.openPicker('MECHANIC', 'wo-to-assign');

      component.selectedLocationId.set('LOC-OTHER');
      component.pick('M2');

      expect(dispatchBoardServiceStub.assignMechanic).not.toHaveBeenCalled();
    });
  });

  describe('enrichment ordering', () => {
    // Two reads of the SAME shop can overlap; the older landing last would put
    // back the lifecycle data the newer one just corrected.
    it('ignores an older enrichment response for the same location', () => {
      const firstInventory = new Subject<never>();
      dispatchBoardServiceStub.getBayInventory.mockReturnValueOnce(firstInventory);
      renderWith(fullDashboard);

      dispatchBoardServiceStub.getBayInventory.mockReturnValue(
        of(new Map([['B9', { bayId: 'B9', name: 'Bay 9', kind: 'HEAVY_DUTY', outOfService: false }]])),
      );
      component.refresh();

      firstInventory.next(
        new Map([['B4', { bayId: 'B4', name: 'Bay 4', kind: 'ALIGNMENT', outOfService: false }]]) as never,
      );

      expect(component.bayInventory().has('B9')).toBe(true);
      expect(component.bayInventory().has('B4')).toBe(false);
    });
  });

  describe('a row with no status is unclassified', () => {
    it('keeps a statusless row out of the Open filter', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'wo-blank', workorderNumber: 'WO-BLANK' }],
      });

      component.setStatusFilter('OPEN');

      expect(component.rows()).toHaveLength(0);
    });
  });
});
