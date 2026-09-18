import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef, signal } from '@angular/core';
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { WorkorderSummaryResourceTypeEnum } from '@durion-sdk/workorder';
import { DispatchBoardPageComponent } from './dispatch-board-page.component';
import { BayInventory, BayInventoryEntry, DispatchBoardService } from '../../services/dispatch-board.service';
import { AuthService } from '../../../../core/services/auth.service';
import type {
  BayStatus,
  DashboardResponse,
  MechanicStatus,
  WorkorderRow,
  WorkorderSummary,
} from '../../models/dispatch-board.models';
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

/** `board` with one workorder's summary patched: the shape a readback shows once a write has landed. */
function withWorkorder(board: DashboardResponse, workorderId: string, patch: Partial<WorkorderSummary>): DashboardResponse {
  return {
    ...board,
    workorders: (board.workorders ?? []).map(workorder =>
      workorder.workorderId === workorderId ? { ...workorder, ...patch } : workorder,
    ),
  };
}

/** `board` with the bay's live claim pointing at `workorderId`, or freed when null. */
function withBayClaim(board: DashboardResponse, bayId: string, workorderId: string | null): DashboardResponse {
  return {
    ...board,
    bays: (board.bays ?? []).map(bay =>
      bay.bayId === bayId
        ? { ...bay, available: workorderId === null, assignedWorkorderId: workorderId ?? undefined }
        : bay,
    ),
  };
}

/** A typed inventory, so a phantom field cannot pass for a bay (ADR-0032). */
function inventoryOf(...entries: readonly BayInventoryEntry[]): BayInventory {
  return new Map(entries.map(entry => [entry.bayId, entry]));
}

// The board a post-mutation readback shows once each write has landed. The
// settlement arms undo only over a board that reflects the write, so a stub
// that answers the pre-write board arms nothing.
/** M2 put on wo-to-assign. */
const afterM2OnToAssign = withWorkorder(fullDashboard, 'wo-to-assign', { status: 'ASSIGNED', assignedMechanicId: 'M2' });
/** M2 replacing M1 on wo-assigned. */
const afterM2OnAssigned = withWorkorder(fullDashboard, 'wo-assigned', { assignedMechanicId: 'M2' });
/** wo-assigned's mechanic released. */
const afterReleaseOnAssigned = withWorkorder(fullDashboard, 'wo-assigned', {
  status: 'APPROVED',
  assignedMechanicId: undefined,
});
/** wo-to-assign placed on Bay 4. */
const afterB4OnToAssign = withBayClaim(
  withWorkorder(fullDashboard, 'wo-to-assign', {
    resourceType: WorkorderSummaryResourceTypeEnum.Bay,
    assignedResourceId: 'B4',
  }),
  'B4',
  'wo-to-assign',
);
/** The parked workorder placed on Bay 4. */
const afterB4OnParked = withBayClaim(
  withWorkorder(fullDashboard, 'wo-parked', {
    resourceType: WorkorderSummaryResourceTypeEnum.Bay,
    assignedResourceId: 'B4',
  }),
  'B4',
  'wo-parked',
);
/** wo-assigned moved from Bay 1 to Bay 4. */
const afterB1ToB4OnAssigned = withBayClaim(
  withBayClaim(withWorkorder(fullDashboard, 'wo-assigned', { assignedResourceId: 'B4' }), 'B1', null),
  'B4',
  'wo-assigned',
);

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
    getTechnicianRoster: vi.fn().mockReturnValue(of({ skills: new Map(), shifts: new Map(), ok: true })),
    getClockStates: vi.fn().mockReturnValue(of({ states: new Map(), ok: true })),
    assignMechanic: vi.fn().mockReturnValue(of({})),
    releaseMechanic: vi.fn().mockReturnValue(of({})),
    assignBay: vi.fn().mockReturnValue(of({})),
    releaseBay: vi.fn().mockReturnValue(of({})),
    parkWorkorder: vi.fn().mockReturnValue(of({})),
    clockIn: vi.fn().mockReturnValue(of({ sessionId: 'WS-1', personId: 'M1', status: 'ACTIVE' })),
    clockOut: vi.fn().mockReturnValue(of({ sessionId: 'WS-1', personId: 'M1', status: 'ENDED' })),
    startBreak: vi.fn().mockReturnValue(of({ breakId: 'BR-1' })),
    stopBreak: vi.fn().mockReturnValue(of({ breakId: 'BR-1' })),
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
    dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(of({ skills: new Map(), shifts: new Map(), ok: true }));
    dispatchBoardServiceStub.getClockStates.mockReturnValue(of({ states: new Map(), ok: true }));
    dispatchBoardServiceStub.assignMechanic.mockReturnValue(of({}));
    dispatchBoardServiceStub.releaseMechanic.mockReturnValue(of({}));
    dispatchBoardServiceStub.assignBay.mockReturnValue(of({}));
    dispatchBoardServiceStub.releaseBay.mockReturnValue(of({}));
    dispatchBoardServiceStub.parkWorkorder.mockReturnValue(of({}));
    dispatchBoardServiceStub.clockIn.mockReturnValue(of({ sessionId: 'WS-1', personId: 'M1', status: 'ACTIVE' }));
    dispatchBoardServiceStub.clockOut.mockReturnValue(of({ sessionId: 'WS-1', personId: 'M1', status: 'ENDED' }));
    dispatchBoardServiceStub.startBreak.mockReturnValue(of({ breakId: 'BR-1' }));
    dispatchBoardServiceStub.stopBreak.mockReturnValue(of({ breakId: 'BR-1' }));
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
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({ skills: new Map([['M1', ['BRAKES', 'DOT']]]), shifts: new Map(), ok: true }),
      );
      renderWith(fullDashboard);

      const certs: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.mech .cert'));
      expect(certs.map(cert => cert.textContent?.trim())).toEqual(['BRAKES', 'DOT']);
    });

    it('leaves the free-hours slot as a not-available placeholder when no shift is known', () => {
      renderWith(fullDashboard);

      expect(component.mechanics()[0].freeHours).toBeNull();
      expect(fixture.nativeElement.querySelector('.mech .mfree.na')).toBeTruthy();
    });
  });

  describe('free hours', () => {
    /** Render with a shift window for M1 (assigned, 2 h estimate) and M2 (idle). */
    function renderWithShift(minutes: number | null, status = 'DERIVED'): void {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({
          skills: new Map(),
          shifts: new Map([
            ['M1', { status, source: 'LOCATION_HOURS', minutes }],
            ['M2', { status, source: 'LOCATION_HOURS', minutes }],
          ]),
          ok: true,
        }),
      );
      renderWith(fullDashboard);
    }

    it('subtracts the assigned workorder estimate from the shift window', () => {
      // wo-assigned carries a 2 h estimate; an 8 h window leaves 6 h.
      renderWithShift(480);

      const ray = component.mechanics().find(mechanic => mechanic.personId === 'M1');
      expect(ray?.freeHours).toBe(6);
      expect(ray?.freeHoursReason).toBeNull();
    });

    it('gives an unassigned mechanic the whole window', () => {
      renderWithShift(480);

      expect(component.mechanics().find(mechanic => mechanic.personId === 'M2')?.freeHours).toBe(8);
    });

    // The board formats its other hour readings through the `number` pipe; a
    // raw interpolation prints 6.5 with a dot in every locale that writes 6,5.
    it('formats the figure through the number pipe, like the board\u2019s other hours', () => {
      renderWithShift(510);   // 8.5 h window, 2 h committed on M1

      const free: HTMLElement = fixture.nativeElement.querySelector('.mech .mfree');
      // The stub translator echoes the key, so the formatted value is asserted
      // on the card model and the pipe's presence in the rendered markup.
      expect(component.mechanics()[0].freeHours).toBe(6.5);
      expect(free.textContent).toContain('SHOPMGMT.DISPATCH_BOARD.FREE_HOURS');
    });

    it('renders the figure rather than the placeholder', () => {
      renderWithShift(480);
      const free: HTMLElement | null = fixture.nativeElement.querySelector('.mech .mfree');

      expect(free?.classList.contains('na')).toBe(false);
      expect(free?.textContent?.trim()).toContain('SHOPMGMT.DISPATCH_BOARD.FREE_HOURS');
    });

    // An estimate longer than the shop is open means the job runs past close.
    // That is nothing free, not negative free time.
    it('never reports negative free hours', () => {
      renderWithShift(60);

      expect(component.mechanics().find(mechanic => mechanic.personId === 'M1')?.freeHours).toBe(0);
    });

    it('says the shop is closed rather than showing zero', () => {
      renderWithShift(null, 'CLOSED');
      const card = component.mechanics()[0];

      expect(card.freeHours).toBeNull();
      expect(card.freeHoursReason).toBe('CLOSED');
      expect(component.freeHoursReasonKey(card)).toBe(
        'SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS_CLOSED',
      );
    });

    it('distinguishes unreadable hours from a closed day', () => {
      renderWithShift(null, 'UNKNOWN');
      const card = component.mechanics()[0];

      expect(card.freeHoursReason).toBe('UNKNOWN');
      expect(component.freeHoursReasonKey(card)).toBe('SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS');
    });

    // The dispatch projection can carry a mechanic the shop-manager roster read
    // does not return; that is an absence, not a zero-hour shift.
    it('marks a mechanic the roster read did not return as off-roster', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({ skills: new Map(), shifts: new Map([['M2', { status: 'DERIVED', source: 'LOCATION_HOURS', minutes: 480 }]]), ok: true }),
      );
      renderWith(fullDashboard);

      const card = component.mechanics().find(mechanic => mechanic.personId === 'M1');
      expect(card?.freeHours).toBeNull();
      expect(card?.freeHoursReason).toBe('OFF_ROSTER');
      expect(component.freeHoursReasonKey(card!)).toBe(
        'SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS_OFF_ROSTER',
      );
    });

    // A DERIVED day with no minutes is a contract violation, not a full shift.
    // A mechanic can hold a workorder this response does not carry: one
    // scheduled for another date, one parked rather than holding a bay, or an
    // aggregation that came back short (`dataQualityWarning`). Its estimate is
    // the one number that would make the figure right, so the commitment is
    // unknown — and `isBayFree` already reads this same absence as a claim the
    // board cannot disprove rather than as nothing.
    it('will not call a shift free when it cannot see what the mechanic is committed to', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({
          skills: new Map(),
          shifts: new Map([['M1', { status: 'DERIVED', source: 'LOCATION_HOURS', minutes: 480 }]]),
          ok: true,
        }),
      );
      renderWith({
        ...fullDashboard,
        mechanics: [{ personId: 'M1', assignedWorkorderId: 'wo-somewhere-else' }],
      });

      const card = component.mechanics()[0];
      expect(card.freeHours).toBeNull();
      // Its own reason, not the unreadable-window one: the window here was read
      // without difficulty, and it is the commitment that is missing.
      expect(card.freeHoursReason).toBe('UNKNOWN_COMMITMENT');
      expect(component.freeHoursReasonKey(card)).toBe(
        'SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS_COMMITMENT',
      );
    });

    // The commitment can only be the missing thing once there IS a window.
    // During a roster outage — and on the very first paint — there is none, so
    // saying "we just cannot see their workorder" would claim the shift data
    // read fine when it never arrived.
    it('blames the unreadable window, not the workorder, when the roster did not answer', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({ skills: new Map(), shifts: new Map(), ok: false }),
      );
      renderWith({
        ...fullDashboard,
        mechanics: [{ personId: 'M1', assignedWorkorderId: 'wo-somewhere-else' }],
      });

      const card = component.mechanics()[0];
      expect(card.freeHoursReason).toBe('UNKNOWN');
      expect(component.freeHoursReasonKey(card)).toBe('SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS');
    });

    // `assignedWorkorderId` is optional on the wire. Read as "not undefined"
    // rather than truthy, a `null` would mark every unassigned mechanic on the
    // board as having an unreadable commitment and take their hours away.
    it('does not treat a null assignment as a workorder it cannot see', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({
          skills: new Map(),
          shifts: new Map([['M1', { status: 'DERIVED', source: 'LOCATION_HOURS', minutes: 480 }]]),
          ok: true,
        }),
      );
      renderWith({
        ...fullDashboard,
        mechanics: [{ personId: 'M1', assignedWorkorderId: null } as unknown as MechanicStatus],
      });

      // Unassigned: the whole window is free, not an unknown commitment.
      expect(component.mechanics()[0].freeHours).toBe(8);
      expect(component.mechanics()[0].freeHoursReason).toBeNull();
    });

    // A failed roster read empties the credential lists, and the card must not
    // report that as a fact about the technicians: "no certifications on file"
    // is a statement about them, during an outage that never asked.
    it('says credentials could not be read rather than that there are none', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({ skills: new Map(), shifts: new Map(), ok: false }),
      );
      renderWith({
        ...fullDashboard,
        mechanics: [
          { personId: 'M1', firstName: 'Zoe', lastName: 'Adams' },
          { personId: 'M2', firstName: 'Alan', lastName: 'Brook' },
        ],
      });
      // The note lives in the picker dialog, which renders only while open and
      // only for a workorder the board is actually carrying.
      component.picker.set({ kind: 'MECHANIC', workorderId: component.allRows()[0].workorderId });
      fixture.detectChanges();

      expect(component.skillsUnavailable()).toBe(true);
      // Everyone is still offered — the outage is not a reason to hide people.
      expect(component.pickerMechanics().map(mechanic => mechanic.personId)).toEqual(['M2', 'M1']);

      const note: HTMLElement | null = fixture.nativeElement.querySelector('.opt .note');
      expect(note?.textContent).toContain('SHOPMGMT.DISPATCH_BOARD.CERTS_UNAVAILABLE');
    });

    // Third of the three causes that land on `UNKNOWN` — with unreadable hours
    // above and a failed roster read under 'roster read'. All three show the
    // one message, so that message may not name any single cause; naming
    // unreadable operating hours, as it once did, is wrong on the other two.
    it('treats a DERIVED window with no minutes as unknown', () => {
      renderWithShift(null, 'DERIVED');

      const card = component.mechanics()[0];
      expect(card.freeHours).toBeNull();
      expect(card.freeHoursReason).toBe('UNKNOWN');
      expect(component.freeHoursReasonKey(card)).toBe('SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS');
    });

  });

  describe('mechanic clock', () => {
    /** Every clock button on the first mechanic's card. */
    function clockButtonsFor(index: number): HTMLButtonElement[] {
      const rows: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.mech-row'));
      return Array.from(rows[index]?.querySelectorAll('.clock-btn') ?? []);
    }

    it('offers both actions while no clock state has been established', () => {
      renderWith(fullDashboard);

      expect(component.mechanics()[0].clockState).toBe('UNKNOWN');
      expect(clockButtonsFor(0).map(button => button.getAttribute('aria-label'))).toEqual([
        'SHOPMGMT.DISPATCH_BOARD.CLOCK_IN_ARIA',
        'SHOPMGMT.DISPATCH_BOARD.CLOCK_OUT_ARIA',
      ]);
    });

    it('sends the person id on a clock-in and reports it', () => {
      renderWith(fullDashboard);

      component.clockIn(component.mechanics()[0]);

      expect(dispatchBoardServiceStub.clockIn).toHaveBeenCalledWith('M1');
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.CLOCKED_IN');
      expect(component.toast()?.tone).toBe('INFO');
    });

    it('renders the state the availability read reports, as a single opposing action', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);

      expect(component.mechanics()[0].clockState).toBe('CLOCKED_IN');
      expect(component.mechanics()[0].workSessionId).toBe('ws-1');
      // Clocked in: no way further in, and the break becomes available.
      expect(clockButtonsFor(0).map(button => button.getAttribute('aria-label'))).toEqual([
        'SHOPMGMT.DISPATCH_BOARD.BREAK_START_ARIA',
        'SHOPMGMT.DISPATCH_BOARD.CLOCK_OUT_ARIA',
      ]);
    });

    // pos-people owns the clock, so ON_BREAK moves the mechanic to the break
    // bin whatever the dispatch projection's own `onBreak` says.
    it('moves a mechanic the clock reports on break into the break bin', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'ON_BREAK', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);

      expect(component.mechanics().some(mechanic => mechanic.personId === 'M1')).toBe(false);
      const onBreak = component.offDutyMechanics().find(mechanic => mechanic.personId === 'M1');
      expect(onBreak?.availability).toBe('BREAK');
      expect(onBreak?.clockState).toBe('ON_BREAK');
    });

    it('reads the state back after a write rather than predicting it', () => {
      renderWith(fullDashboard);
      expect(component.mechanics()[0].clockState).toBe('UNKNOWN');

      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      component.clockIn(component.mechanics()[0]);
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getClockStates).toHaveBeenCalled();
      expect(component.mechanics()[0].clockState).toBe('CLOCKED_IN');
      expect(clockButtonsFor(0).map(button => button.getAttribute('aria-label'))).toEqual([
        'SHOPMGMT.DISPATCH_BOARD.BREAK_START_ARIA',
        'SHOPMGMT.DISPATCH_BOARD.CLOCK_OUT_ARIA',
      ]);
    });

    // A clock write changes nothing the dashboard reports, so redrawing every
    // row to pick up one field would be wasted work.
    it('re-reads only the clock, not the whole board', () => {
      renderWith(fullDashboard);
      const boardReads = dispatchBoardServiceStub.getDashboard.mock.calls.length;
      const clockReads = dispatchBoardServiceStub.getClockStates.mock.calls.length;

      component.clockIn(component.mechanics()[0]);

      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(boardReads);
      expect(dispatchBoardServiceStub.getClockStates.mock.calls.length).toBe(clockReads + 1);
    });

    it('never offers an undo: a work session is a record, not a placement', () => {
      renderWith(fullDashboard);

      component.clockIn(component.mechanics()[0]);

      expect(component.toast()?.undo).toBeNull();
    });

    it('does not re-read the board, which carries no clock state to confirm', () => {
      renderWith(fullDashboard);
      const readsBefore = dispatchBoardServiceStub.getDashboard.mock.calls.length;

      component.clockIn(component.mechanics()[0]);

      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(readsBefore);
    });

    // A 409 on start means the session was opened somewhere else, so the
    // board's copy is stale. Re-reading corrects it — and picks up the break
    // state, which the refusal does not name.
    it('re-reads after a double clock-in refusal', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.clockIn.mockReturnValueOnce(
        throwError(() => ({ status: 409, error: { code: 'INVALID_STATE' } })),
      );
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'ON_BREAK', workSessionId: 'ws-9' }]]), ok: true }),
      );

      component.clockIn(component.mechanics()[0]);
      fixture.detectChanges();

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_ALREADY_CLOCKED_IN');
      // The re-read found them on a break, which moves them to the bin.
      expect(component.offDutyMechanics().find(mechanic => mechanic.personId === 'M1')?.clockState).toBe('ON_BREAK');
      expect(component.isClockPending('M1')).toBe(false);
    });

    it('re-reads after a clock-out with no open session', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.clockOut.mockReturnValueOnce(
        throwError(() => ({ status: 404, error: { code: 'WORK_SESSION_NOT_FOUND' } })),
      );
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_OUT', workSessionId: null }]]), ok: true }),
      );

      component.clockOut(component.mechanics()[0]);
      fixture.detectChanges();

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_NOT_CLOCKED_IN');
      // Clocked out is off duty, so the re-read moves them to the bin.
      expect(component.offDutyMechanics().find(mechanic => mechanic.personId === 'M1')?.clockState).toBe(
        'CLOCKED_OUT',
      );
    });

    // A refused caller is not a stale board: nothing about the session changed,
    // so spending a read on it would tell the board nothing it does not know.
    it('does not re-read after a refusal that says nothing about the session', () => {
      renderWith(fullDashboard);
      const clockReads = dispatchBoardServiceStub.getClockStates.mock.calls.length;
      dispatchBoardServiceStub.clockIn.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 403 })),
      );

      component.clockIn(component.mechanics()[0]);

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_CLOCK_FORBIDDEN');
      expect(dispatchBoardServiceStub.getClockStates.mock.calls.length).toBe(clockReads);
      expect(component.isClockPending('M1')).toBe(false);
    });

    // The 403 mapping is shared by all four writes, so it must not name only
    // clocking: a denied break would report the wrong operation.
    it('reports a refused break as a timekeeping permission problem', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);
      dispatchBoardServiceStub.startBreak.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 403 })),
      );

      component.startBreak(component.mechanics().find(mechanic => mechanic.personId === 'M1')!);

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_CLOCK_FORBIDDEN');
      expect(component.toast()?.tone).toBe('ERROR');
    });

    it('maps an unknown person and a refused caller onto their own messages', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.clockIn.mockReturnValueOnce(
        throwError(() => ({ status: 404, error: { code: 'PERSON_NOT_FOUND' } })),
      );

      component.clockIn(component.mechanics()[0]);
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_CLOCK_PERSON_NOT_FOUND');
      // Nothing was said about the session, so the card keeps offering both.
      expect(component.mechanics()[0].clockState).toBe('UNKNOWN');

      dispatchBoardServiceStub.clockIn.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 403 })),
      );
      component.clockIn(component.mechanics()[0]);
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_CLOCK_FORBIDDEN');
    });

    it('falls back to a generic message for an unrecognised refusal', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.clockOut.mockReturnValueOnce(throwError(() => ({ status: 500 })));

      component.clockOut(component.mechanics()[0]);

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_CLOCK_GENERIC');
    });

    it('allows one clock write per mechanic at a time', () => {
      renderWith(fullDashboard);
      const pending = new Subject<unknown>();
      dispatchBoardServiceStub.clockIn.mockReturnValue(pending.asObservable());

      component.clockIn(component.mechanics()[0]);
      component.clockIn(component.mechanics()[0]);

      expect(dispatchBoardServiceStub.clockIn).toHaveBeenCalledTimes(1);
      expect(component.isClockPending('M1')).toBe(true);

      pending.next({ sessionId: 'WS-1', personId: 'M1', status: 'ACTIVE' });
      pending.complete();
      expect(component.isClockPending('M1')).toBe(false);
    });

    it('guards each mechanic separately', () => {
      renderWith(fullDashboard);
      const pending = new Subject<unknown>();
      dispatchBoardServiceStub.clockIn.mockReturnValue(pending.asObservable());

      component.clockIn(component.mechanics()[0]);
      component.clockIn(component.mechanics()[1]);

      expect(dispatchBoardServiceStub.clockIn).toHaveBeenCalledTimes(2);
      expect(dispatchBoardServiceStub.clockIn).toHaveBeenLastCalledWith('M2');
    });

    it('is offered on today’s board only', () => {
      renderWith(fullDashboard);
      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();

      expect(component.isViewingToday()).toBe(false);
      expect(clockButtonsFor(0).every(button => button.disabled)).toBe(true);
      expect(component.clockHintKey(component.mechanics()[0])).toBe('SHOPMGMT.DISPATCH_BOARD.CLOCK_TODAY_ONLY');

      component.clockIn(component.mechanics()[0]);
      expect(dispatchBoardServiceStub.clockIn).not.toHaveBeenCalled();
    });

    it('drops clock state when the board switches location', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);
      expect(component.mechanics()[0].clockState).toBe('CLOCKED_IN');

      dispatchBoardServiceStub.getClockStates.mockReturnValue(new Subject());
      component.onLocationPicked('LOC-2');
      fixture.detectChanges();

      // The old shop's clock reading must not paint the new board while the
      // new one is still in flight.
      expect(component.mechanics()[0].clockState).toBe('UNKNOWN');
    });

    // The clock is a fact about now, and a window is resolved for one day.
    it('drops clock state when the board switches date', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);
      expect(component.mechanics()[0].clockState).toBe('CLOCKED_IN');

      dispatchBoardServiceStub.getClockStates.mockReturnValue(new Subject());
      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();

      expect(component.mechanics()[0].clockState).toBe('UNKNOWN');
    });

    // -----------------------------------------------------------------------
    // Reading the clock: whose answer wins, and what an absence means
    // -----------------------------------------------------------------------
    // Each of these was proved missing by mutation: the guard was deleted, or
    // the fix applied, and all 266 tests stayed green either way.

    // The clock write's readback and the poll's enrichment both bump the same
    // sequence counter. A superseded readback must not release the card: the
    // board is still showing the state the write replaced, so re-enabling it
    // invites the dispatcher to send the action that has already succeeded.
    it('does not re-enable a card from a readback the board refused to apply', () => {
      const writeReadback = new Subject<{ states: Map<string, unknown>; ok: boolean }>();
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);

      dispatchBoardServiceStub.getClockStates.mockReturnValue(writeReadback);
      component.clockOut(component.mechanics()[0]);
      expect(component.isClockPending('M1')).toBe(true);

      // A second read supersedes it — here the enrichment, as the 30s poll or
      // any board reload would.
      dispatchBoardServiceStub.getClockStates.mockReturnValue(new Subject());
      component.refresh();
      fixture.detectChanges();

      // The superseded readback lands last and is rejected for painting.
      writeReadback.next({ states: new Map(), ok: true });
      writeReadback.complete();
      fixture.detectChanges();

      // Still guarded: the board holds pre-write state, so the card must not
      // offer the action again.
      expect(component.isClockPending('M1')).toBe(true);
    });

    // The other half of that rule: parking the debt must not strand it. The
    // superseding reader pays on every branch it can take, including the one
    // where its own enrichment fails.
    it('releases the card from the superseding read, even when that read fails', () => {
      const writeReadback = new Subject<{ states: Map<string, unknown>; ok: boolean }>();
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);

      dispatchBoardServiceStub.getClockStates.mockReturnValue(writeReadback);
      component.clockOut(component.mechanics()[0]);

      // The superseding read fails the way the service reports failure.
      dispatchBoardServiceStub.getClockStates.mockReturnValue(of({ states: new Map(), ok: false }));
      component.refresh();
      fixture.detectChanges();
      writeReadback.next({ states: new Map(), ok: true });
      fixture.detectChanges();

      // Released — a card with nothing left to settle it would stay disabled
      // until the page is reloaded.
      expect(component.isClockPending('M1')).toBe(false);
    });

    // A failed read answers an empty map. Writing that over good state empties
    // the clock column for every mechanic at once — off the back of a write on
    // one person, and on the strength of one transient 503.
    it('keeps the clock state it has when a re-read fails', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({
          states: new Map([
            ['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }],
            ['M2', { state: 'ON_BREAK', workSessionId: 'ws-2' }],
          ]),
          ok: true,
        }),
      );
      renderWith(fullDashboard);
      expect(component.offDutyMechanics().some(mechanic => mechanic.personId === 'M2')).toBe(true);

      dispatchBoardServiceStub.getClockStates.mockReturnValue(of({ states: new Map(), ok: false }));
      component.clockOut(component.mechanics().find(mechanic => mechanic.personId === 'M1')!);
      fixture.detectChanges();

      // M2 is untouched by a write on M1 and by the outage that followed it.
      expect(component.offDutyMechanics().some(mechanic => mechanic.personId === 'M2')).toBe(true);
    });

    // `UNKNOWN` is reached both by a read that failed and by a read that
    // answered and nulled the row. Only the second is about permissions, and
    // the first is the state every card is in for the opening round trip.
    it('does not call an unread clock a permissions decision', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(of({ states: new Map(), ok: false }));
      renderWith(fullDashboard);

      const card = component.mechanics()[0];
      expect(card.clockState).toBe('UNKNOWN');
      expect(component.clockHintKey(card)).toBe('SHOPMGMT.DISPATCH_BOARD.CLOCK_STATE_UNREAD');
    });

    it('still names permissions when the read answered and left the row out', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M2', { state: 'CLOCKED_IN', workSessionId: 'ws-2' }]]), ok: true }),
      );
      renderWith(fullDashboard);

      const card = component.mechanics().find(mechanic => mechanic.personId === 'M1')!;
      expect(card.clockState).toBe('UNKNOWN');
      expect(component.clockHintKey(card)).toBe('SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_CLOCK_STATE');
    });

    // pos-people derives `clockState` from the person's OPEN work session, so
    // the same live reading comes back whatever date is asked for. Reading it
    // for another day would label that day with it.
    it('does not read the clock for a date that is not today', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getClockStates.mockClear();

      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getClockStates).not.toHaveBeenCalled();
    });

    // The consequence that the disabled controls do NOT cover: without this,
    // today's clocked-out crew empties yesterday's roster into the bin and the
    // mechanic picker offers nobody for the day being looked at.
    it('leaves the roster alone on another day rather than emptying it', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_OUT', workSessionId: null }]]), ok: true }),
      );
      renderWith(fullDashboard);
      // On today's board the clocked-out mechanic belongs in the bin.
      expect(component.mechanics().some(mechanic => mechanic.personId === 'M1')).toBe(false);

      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();

      expect(component.mechanics().some(mechanic => mechanic.personId === 'M1')).toBe(true);
      expect(component.pickerMechanics().length).toBeGreaterThan(0);
    });

    // Keeping the map on a failed read stops cards bouncing between rails, but
    // it must not also keep OFFERING actions from it. After a clock-out whose
    // readback then failed, the card still reads CLOCKED_IN — so without this
    // it shows "Out" again and invites the write that already succeeded.
    it('stops offering clock actions from a reading it could not refresh', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);
      expect(component.canClock(component.mechanics()[0])).toBe(true);

      dispatchBoardServiceStub.getClockStates.mockReturnValue(of({ states: new Map(), ok: false }));
      component.clockOut(component.mechanics()[0]);
      fixture.detectChanges();

      const card = component.mechanics().find(mechanic => mechanic.personId === 'M1')!;
      // The retained reading still places the card — it has not bounced rails.
      expect(card.clockState).toBe('CLOCKED_IN');
      // But it is no longer good enough to act on, and the card says why.
      expect(component.canClock(card)).toBe(false);
      expect(component.clockHintKey(card)).toBe('SHOPMGMT.DISPATCH_BOARD.CLOCK_STATE_UNREAD');
    });

    // The parked debt needs an owner in every case. Clearing the location
    // starts no replacement enrichment, so "a newer reader will pay" is false
    // and the card would stay disabled with nothing left to release it.
    it('releases the card when the selection is abandoned mid-readback', () => {
      const readback = new Subject<{ states: Map<string, unknown>; ok: boolean }>();
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);

      dispatchBoardServiceStub.getClockStates.mockReturnValue(readback);
      component.clockOut(component.mechanics()[0]);
      expect(component.isClockPending('M1')).toBe(true);

      // The dispatcher clears the location: no replacement read is started.
      component.selectedLocationId.set('');
      fixture.detectChanges();
      readback.next({ states: new Map(), ok: true });
      fixture.detectChanges();

      expect(component.isClockPending('M1')).toBe(false);
    });

    // Midnight is not a date CHANGE: nothing is picked, so nothing clears the
    // clock map. The poll moves `todayIso` on, `selectedDate` stays where the
    // dispatcher left it, and the board is suddenly showing a past day while
    // still holding a live clock reading. Gating the fetch does not cover this
    // — the map is already in hand.
    it('stops believing the clock map when the day rolls over under an open board', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_OUT', workSessionId: null }]]), ok: true }),
      );
      renderWith(fullDashboard);
      expect(component.mechanics().some(mechanic => mechanic.personId === 'M1')).toBe(false);

      // The poll re-reads the local day; the selected date does not move. The
      // rolled-over day is derived from the selection rather than written as a
      // literal: a hardcoded date stops being "tomorrow" on the day it names,
      // and then asserts the opposite of what this test is about.
      const rolledOver = new Date(`${component.selectedDate()}T00:00:00`);
      rolledOver.setDate(rolledOver.getDate() + 1);
      component.todayIso.set(isoDateLocal(rolledOver));
      fixture.detectChanges();

      expect(component.isViewingToday()).toBe(false);
      expect(component.mechanics().some(mechanic => mechanic.personId === 'M1')).toBe(true);
      expect(component.mechanics()[0].clockState).toBe('UNKNOWN');
    });

    // A 5xx or a dropped connection may have landed after pos-people committed
    // the session. Releasing the card against unchanged state would leave the
    // board contradicting what just happened.
    it('re-reads after a failure that may still have written', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.clockOut.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 504 })));
      const reads = dispatchBoardServiceStub.getClockStates.mock.calls.length;

      component.clockOut(component.mechanics()[0]);

      expect(dispatchBoardServiceStub.getClockStates.mock.calls.length).toBe(reads + 1);
    });

    it('does not re-read after a failure that cannot have written', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.clockOut.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
      const reads = dispatchBoardServiceStub.getClockStates.mock.calls.length;

      component.clockOut(component.mechanics()[0]);

      expect(dispatchBoardServiceStub.getClockStates.mock.calls.length).toBe(reads);
    });

    // ngx-translate leaves an unresolved placeholder in the string verbatim, so
    // without the unnamed variant the dispatcher reads "{{mechanic}} is not
    // clocked in."
    it('names nobody in a clock error for a mechanic whose name has not replicated', () => {
      const unnamed: DashboardResponse = {
        ...fullDashboard,
        // A mechanic carrying an id and nothing else: neither name has replicated.
        mechanics: [{ personId: fullDashboard.mechanics![0].personId }],
      };
      dispatchBoardServiceStub.clockOut.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404, error: { code: 'WORK_SESSION_NOT_FOUND' } })),
      );
      renderWith(unnamed);

      component.clockOut(component.mechanics()[0]);

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_NOT_CLOCKED_IN_UNNAMED');
      expect(component.toast()?.params).toEqual({});
    });

    // Every clock control removes its own card from the rail it stands on, so
    // acting on one destroys the focused node and focus falls to <body> — the
    // next Tab would start from the top of the document. These are the controls
    // that give the drag its keyboard equivalent (WCAG 2.5.7), so dropping
    // focus in them defeats what they are for.
    it('keeps keyboard focus on the mechanic after a control destroys itself', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);

      const control: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('[data-clock-for="M1"].clock-out');
      expect(control).not.toBeNull();
      control!.focus();
      expect(document.activeElement).toBe(control);

      // The readback is a Subject, not `of(...)`: a synchronous stub applies the
      // state before the next render, which hides a focus restore scheduled too
      // early. It is the readback that moves the mechanic to the bin and takes
      // this button with it, one render AFTER the write resolves.
      const readback = new Subject<{ states: Map<string, unknown>; ok: boolean }>();
      dispatchBoardServiceStub.getClockStates.mockReturnValue(readback);
      control!.click();
      fixture.detectChanges();
      // `afterNextRender` callbacks run in the render phase; `whenStable` never
      // settles here because the board polls on a 30s interval.
      TestBed.inject(ApplicationRef).tick();
      // Marking the card pending disables the button. Whether a disabled
      // control keeps focus until it is destroyed differs between Chromium
      // builds (the Playwright build in CI keeps it, others drop it to <body>),
      // so the intermediate state is deliberately not asserted here: the
      // contract under test is where focus ends up once the readback has moved
      // the mechanic and destroyed the control.
      readback.next({ states: new Map([['M1', { state: 'CLOCKED_OUT', workSessionId: null }]]), ok: true });
      fixture.detectChanges();
      TestBed.inject(ApplicationRef).tick();

      const landed = document.activeElement as HTMLElement | null;
      expect(landed).not.toBe(document.body);
      expect(landed?.dataset['clockFor'] ?? landed?.dataset['dragFor']).toBe('M1');
    });

    it('hides the control from a caller without the timekeeping authority', () => {
      authStub.hasAnyPermission.mockImplementation(
        (codes: readonly string[]) => !codes.includes('people:timekeeping:approve'),
      );
      renderWith(fullDashboard);

      expect(component.canManageClock()).toBe(false);
      expect(clockButtonsFor(0)).toHaveLength(0);
      // The drag handle it sits beside is untouched.
      expect(fixture.nativeElement.querySelectorAll('button.mech').length).toBeGreaterThan(0);
    });
  });

  describe('bay rail', () => {
    it('lists only bays that are available and hold no workorder', () => {
      renderWith(fullDashboard);

      expect(component.openBays().map(bay => bay.bayId)).toEqual(['B4']);
    });

    it('labels an open bay with the bay type from the location domain', () => {
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(
        of(inventoryOf({ bayId: 'B4', name: 'Bay 4', kind: 'ALIGNMENT', outOfService: false })),
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
    // Undo is armed by a readback that shows the write, so each of these
    // answers the post-mutation read with the board as the write left it.
    it('clears a mechanic that had no predecessor', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterM2OnToAssign));
      component.assignMechanic(component.toAssignRows()[0], 'M2');

      component.undo();

      expect(dispatchBoardServiceStub.releaseMechanic).toHaveBeenCalledWith('wo-to-assign');
    });

    // The incumbent undo passes is the one its own mutation left behind, which
    // the readback now also shows: the row names M2, and undo hands it back to M1.
    it('puts the previous mechanic back after a reassignment', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterM2OnAssigned));
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

    // The capacity placeholder used to say the board receives no shift windows.
    // It receives them (backend #2060) and spends them on per-mechanic free
    // hours; what it still lacks is a window per person rather than the shop's
    // opening hours repeated, which would overstate a shop-wide total. Capacity
    // staying null while windows are in hand is that distinction.
    it('holds shift windows and still reports no open capacity', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({
          skills: new Map(),
          shifts: new Map([
            ['M1', { status: 'DERIVED', source: 'LOCATION_HOURS', minutes: 480 }],
            ['M2', { status: 'DERIVED', source: 'LOCATION_HOURS', minutes: 480 }],
          ]),
          ok: true,
        }),
      );
      renderWith(fullDashboard);

      expect(component.technicianShifts().size).toBe(2);
      expect(component.mechanics().every(mechanic => mechanic.freeHours !== null)).toBe(true);
      expect(component.stats().openCapacityHours).toBeNull();
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
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(throwError(() => ({ status: 503 })));
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
        of(inventoryOf({ bayId: 'B4', name: 'Bay 4', kind: 'ALIGNMENT', outOfService: false })),
      );
      renderWith(fullDashboard);
      expect(component.bayInventory().size).toBe(1);

      const pendingInventory = new Subject<never>();
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(pendingInventory);
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(new Subject());
      component.selectedLocationId.set('LOC-2');
      component.refresh();

      expect(component.bayInventory().size).toBe(0);
      expect(component.technicianSkills().size).toBe(0);
    });

    it('drops enrichment that arrives after the location changed', () => {
      const slowRoster = new Subject<{
        skills: ReadonlyMap<string, readonly string[]>;
        shifts: ReadonlyMap<string, unknown>;
        ok: boolean;
      }>();
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(slowRoster);
      renderWith(fullDashboard);

      component.selectedLocationId.set('LOC-2');
      slowRoster.next({ skills: new Map([['M1', ['STALE']]]), shifts: new Map(), ok: true });
      slowRoster.complete();

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

    // T1: with a synchronous stub this could only ever see the settled state.
    // The guard is held across BOTH round trips — the write and its readback.
    it('releases the guard only once the write and its readback have both settled', () => {
      renderWith(fullDashboard);
      const row = component.toAssignRows()[0];
      const write = new Subject<unknown>();
      const readback = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(write);
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(readback);

      component.assignMechanic(row, 'M2');
      expect(component.isPending(row.workorderId)).toBe(true);

      write.next({});
      write.complete();
      expect(component.isPending(row.workorderId)).toBe(true);

      readback.next(afterM2OnToAssign);
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
    // Every code the board's own writes can provoke (T2): the three added
    // here were mapped but never exercised.
    const refusals: readonly [string, string][] = [
      ['TECHNICIAN_NOT_ASSIGNED', 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_MECHANIC_NOT_ASSIGNED'],
      ['TECHNICIAN_NOT_FOUND', 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_MECHANIC_NOT_FOUND'],
      ['SERVICE_POSITION_INVALID', 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_BAY_INVALID'],
      ['TECHNICIAN_ALREADY_ASSIGNED', 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_MECHANIC_TAKEN'],
      ['SERVICE_POSITION_INACTIVE', 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_BAY_INACTIVE'],
      ['WORKORDER_CLOSED', 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_WORKORDER_CLOSED'],
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
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterReleaseOnAssigned));
      component.clearMechanic(component.assignedRows()[0]);

      component.undo();

      expect(dispatchBoardServiceStub.assignMechanic).toHaveBeenCalledWith('wo-assigned', 'M1', null);
    });

    // A parked workorder stands in the site's lot; releasing it would leave it
    // deliberately unplaced, which is a third state, not the original.
    it('parks a workorder again when undoing a bay placement that replaced a HOLD', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterB4OnParked));
      component.assignBay(component.heldRows()[0], 'B4');

      component.undo();

      expect(dispatchBoardServiceStub.parkWorkorder).toHaveBeenCalledWith('wo-parked');
      expect(dispatchBoardServiceStub.releaseBay).not.toHaveBeenCalled();
    });

    it('still releases the position when there was none to put back', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterB4OnToAssign));
      component.assignBay(component.toAssignRows()[0], 'B4');

      component.undo();

      expect(dispatchBoardServiceStub.releaseBay).toHaveBeenCalledWith('wo-to-assign');
    });

    // T2: a bay-to-bay move is one write, and its undo is the same write back
    // to the previous bay — not a release, not a park.
    it('puts the workorder back on its previous bay when undoing a bay-to-bay move', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterB1ToB4OnAssigned));
      component.assignBay(component.assignedRows()[0], 'B4');
      expect(dispatchBoardServiceStub.assignBay).toHaveBeenCalledWith('wo-assigned', 'B4');
      expect(component.toast()?.undo).not.toBeNull();

      component.undo();

      expect(dispatchBoardServiceStub.assignBay).toHaveBeenLastCalledWith('wo-assigned', 'B1');
      expect(dispatchBoardServiceStub.releaseBay).not.toHaveBeenCalled();
      expect(dispatchBoardServiceStub.parkWorkorder).not.toHaveBeenCalled();
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
        of(inventoryOf({ bayId: 'B9', name: 'Bay 9', kind: 'GENERAL_SERVICE', outOfService: false })),
      );
      renderWith({ ...fullDashboard, bays: [] });

      expect(component.openBays().map(bay => bay.bayId)).toEqual(['B9']);
      expect(component.openBays()[0].name).toBe('Bay 9');
    });

    it('drops an out-of-service bay no open work stands on', () => {
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(
        of(inventoryOf({ bayId: 'B9', name: 'Bay 9', kind: null, outOfService: true })),
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

    // The bay writes are workexec's position endpoints, whose authority is
    // workorder:position:assign (durion-positivity-backend#2059) — not shop
    // management's bay grant, and no longer the operational-context override.
    it('allows the bay write while refusing the technician write', () => {
      authStub.hasAnyPermission.mockImplementation((codes: readonly string[]) =>
        codes.includes('workorder:position:assign'),
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
        codes.includes('workorder:position:assign'),
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

      slowRead.next(afterM2OnToAssign);

      expect(component.toast()?.undo).not.toBeNull();
    });

    it('the undo it finally offers actually runs', () => {
      renderWith(fullDashboard);
      const row = component.toAssignRows()[0];
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterM2OnToAssign));

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

      // The refresh supersedes the readback and pays the debt it left; it
      // shows the write, so it also arms the undo.
      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(afterM2OnToAssign));
      component.refresh();

      expect(component.isPending(row.workorderId)).toBe(false);
      expect(component.toast()?.undo).not.toBeNull();

      // The stale readback landing afterwards changes nothing.
      mutationRead.next(fullDashboard);
      expect(component.isPending(row.workorderId)).toBe(false);
      expect(component.allRows().find(candidate => candidate.workorderId === row.workorderId)?.mechanicId).toBe('M2');
      expect(component.toast()?.undo).not.toBeNull();
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
      const firstInventory = new Subject<BayInventory>();
      dispatchBoardServiceStub.getBayInventory.mockReturnValueOnce(firstInventory);
      renderWith(fullDashboard);

      dispatchBoardServiceStub.getBayInventory.mockReturnValue(
        of(inventoryOf({ bayId: 'B9', name: 'Bay 9', kind: 'HEAVY_DUTY', outOfService: false })),
      );
      component.refresh();

      firstInventory.next(inventoryOf({ bayId: 'B4', name: 'Bay 4', kind: 'ALIGNMENT', outOfService: false }));

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

    // F10: d89a09a canTakeBay :515-517 checked only !closed, so '' was
    // placeable, and bayBlockedKey :534-536 had no reason to give for it.
    it('refuses a bay on a statusless row and says why', () => {
      renderWith({
        ...fullDashboard,
        workorders: [{ workorderId: 'wo-blank', workorderNumber: 'WO-BLANK' }],
      });

      const row = component.allRows()[0];
      expect(row.status).toBe('');
      expect(component.canTakeBay(row)).toBe(false);
      expect(component.bayBlockedKey(row)).toBe('SHOPMGMT.DISPATCH_BOARD.STATUS_UNKNOWN_NO_CHANGE');
      component.onDragStart('BAY', 'B4', new DragEvent('dragstart'));
      expect(component.canDrop(row)).toBe(false);

      const slots: HTMLButtonElement[] = Array.from(rowFor('wo-blank').querySelectorAll('button.slot'));
      const baySlot = slots.find(slot => slot.getAttribute('aria-label')?.includes('ADD_BAY_ARIA'));
      expect(baySlot?.disabled).toBe(true);
      expect(baySlot?.getAttribute('title')).toBe('SHOPMGMT.DISPATCH_BOARD.STATUS_UNKNOWN_NO_CHANGE');

      component.openPicker('BAY', 'wo-blank');
      component.pick('B4');
      expect(dispatchBoardServiceStub.assignBay).not.toHaveBeenCalled();
    });

    // Bay placement keeps its wider window: a DRAFT can stand on a bay.
    it('still places a DRAFT workorder on a bay', () => {
      renderWith(fullDashboard);

      const draft = component.allRows().find(row => row.workorderId === 'wo-draft')!;
      expect(component.canTakeBay(draft)).toBe(true);
      expect(component.bayBlockedKey(draft)).toBeNull();
      component.onDragStart('BAY', 'B4', new DragEvent('dragstart'));
      expect(component.canDrop(draft)).toBe(true);
    });
  });
  // -------------------------------------------------------------------------
  // Round-7: two ways the board could act on the shop you just left
  // -------------------------------------------------------------------------
  describe('a response is cached under the selection it answers', () => {
    // applySuccess used to default its key to the live controls, so a response
    // in flight across a location change was filed under the NEW key and the
    // previous shop's rows read as current — and stayed assignable.
    it('does not file a late response under the new selection', () => {
      renderWith(fullDashboard);
      const inFlight = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValue(inFlight);
      component.refresh();

      component.selectedLocationId.set('LOC-OTHER');
      inFlight.next(fullDashboard);

      expect(component.hasCachedData()).toBe(false);
      expect(component.showBoard()).toBe(false);
    });
  });

  describe('undo respects the current selection', () => {
    // F2(d): d89a09a :735 nulled the toast before the guard at :745, so this
    // was a silent no-op; the toast now says the undo is gone.
    it('does not undo against the board the dispatcher left, and says so', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterM2OnToAssign));
      component.assignMechanic(component.toAssignRows()[0], 'M2');
      expect(component.toast()?.undo).not.toBeNull();
      const toastId = component.toast()?.id;
      vi.clearAllMocks();

      component.selectedLocationId.set('LOC-OTHER');
      component.undo();

      expect(dispatchBoardServiceStub.releaseMechanic).not.toHaveBeenCalled();
      expect(dispatchBoardServiceStub.assignMechanic).not.toHaveBeenCalled();
      expect(component.toast()).toEqual({
        id: toastId,
        key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.UNDO_UNAVAILABLE',
        params: { workorder: 'WO-24118' },
        tone: 'ERROR',
        undo: null,
      });
    });
  });

  // =========================================================================
  // Review cycle 1 (PR #275). Each block names the finding it answers and the
  // head-d89a09a line the test fails on, so a regression is traceable.
  // =========================================================================
  describe('F1: bay writes are gated on the workexec position authority', () => {
    function slotFor(workorderId: string, ariaKey: string): HTMLButtonElement | undefined {
      const slots: HTMLButtonElement[] = Array.from(rowFor(workorderId).querySelectorAll('button.slot'));
      return slots.find(slot => slot.getAttribute('aria-label')?.includes(ariaKey));
    }

    // d89a09a :194-196 gated on SHOPMGMT_PAGE.bayAssign ('shop:bay:assign'), so
    // the grant the position endpoints actually require bought nothing here.
    // #2059 then split that grant off the manager override onto its own code,
    // which is what a dispatcher holds.
    it('enables the bay controls for a session holding only workorder:position:assign', () => {
      authStub.hasAnyPermission.mockImplementation((codes: readonly string[]) =>
        codes.includes('workorder:position:assign'),
      );
      renderWith(fullDashboard);

      expect(component.canAssignBay()).toBe(true);
      expect(component.canAssignMechanic()).toBe(false);
      expect(component.canTakeBay(component.toAssignRows()[0])).toBe(true);
      expect(component.canClearBay(component.assignedRows()[0])).toBe(true);
      expect(slotFor('wo-to-assign', 'ADD_BAY_ARIA')?.disabled).toBe(false);
      expect(slotFor('wo-to-assign', 'ADD_MECHANIC_ARIA')?.disabled).toBe(true);

      component.openPicker('BAY', 'wo-to-assign');
      component.pick('B4');
      expect(dispatchBoardServiceStub.assignBay).toHaveBeenCalledWith('wo-to-assign', 'B4');
    });

    // The other half of the #2059 split: the manager override grant alone must
    // NOT reach the bay rails any more. Without this case a fallback to the old
    // code, or its accidental re-addition to positionAssign, would pass the
    // suite while quietly restoring a manager-only authority here.
    it('disables the bay controls for a session holding only workorder:operationalContext:override', () => {
      authStub.hasAnyPermission.mockImplementation((codes: readonly string[]) =>
        codes.includes('workorder:operationalContext:override'),
      );
      renderWith(fullDashboard);

      expect(component.canAssignBay()).toBe(false);
      expect(component.canTakeBay(component.toAssignRows()[0])).toBe(false);
      expect(component.canClearBay(component.assignedRows()[0])).toBe(false);
      expect(slotFor('wo-to-assign', 'ADD_BAY_ARIA')?.disabled).toBe(true);

      component.openPicker('BAY', 'wo-to-assign');
      component.pick('B4');
      component.clearBay(component.assignedRows()[0]);
      expect(dispatchBoardServiceStub.assignBay).not.toHaveBeenCalled();
      expect(dispatchBoardServiceStub.releaseBay).not.toHaveBeenCalled();
    });

    // d89a09a :194-196 enabled these for the appointment page's grant, which
    // the position endpoints answer with 403.
    it('disables the bay controls for a session holding only shop:bay:assign', () => {
      authStub.hasAnyPermission.mockImplementation((codes: readonly string[]) => codes.includes('shop:bay:assign'));
      renderWith(fullDashboard);

      expect(component.canAssignBay()).toBe(false);
      expect(component.canTakeBay(component.toAssignRows()[0])).toBe(false);
      expect(component.canClearBay(component.assignedRows()[0])).toBe(false);
      expect(slotFor('wo-to-assign', 'ADD_BAY_ARIA')?.disabled).toBe(true);

      component.openPicker('BAY', 'wo-to-assign');
      component.pick('B4');
      component.clearBay(component.assignedRows()[0]);
      expect(dispatchBoardServiceStub.assignBay).not.toHaveBeenCalled();
      expect(dispatchBoardServiceStub.releaseBay).not.toHaveBeenCalled();
    });

    it('leaves the technician gate on workorder:workorder:assign-technician', () => {
      authStub.hasAnyPermission.mockImplementation((codes: readonly string[]) =>
        codes.includes('workorder:workorder:assign-technician'),
      );
      renderWith(fullDashboard);

      expect(component.canAssignMechanic()).toBe(true);
      expect(component.canAssignBay()).toBe(false);
      expect(slotFor('wo-to-assign', 'ADD_MECHANIC_ARIA')?.disabled).toBe(false);
      expect(slotFor('wo-to-assign', 'ADD_BAY_ARIA')?.disabled).toBe(true);
    });
  });

  describe('F2: undo only puts back what is still there', () => {
    /** Arm undo for M2 on wo-to-assign through a readback that shows the write. */
    function armAssignOnToAssign(): string {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterM2OnToAssign));
      component.assignMechanic(component.toAssignRows()[0], 'M2');
      expect(component.toast()?.undo).not.toBeNull();
      return component.toast()?.id ?? '';
    }

    /** Arm undo for M2 replacing M1 on wo-assigned — the branch that re-assigns on undo. */
    function armReassignOnAssigned(): string {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterM2OnAssigned));
      component.assignMechanic(component.assignedRows()[0], 'M2');
      expect(component.toast()?.undo).not.toBeNull();
      return component.toast()?.id ?? '';
    }

    function expectNoWrite(): void {
      expect(dispatchBoardServiceStub.assignMechanic).not.toHaveBeenCalled();
      expect(dispatchBoardServiceStub.releaseMechanic).not.toHaveBeenCalled();
      expect(dispatchBoardServiceStub.assignBay).not.toHaveBeenCalled();
      expect(dispatchBoardServiceStub.releaseBay).not.toHaveBeenCalled();
      expect(dispatchBoardServiceStub.parkWorkorder).not.toHaveBeenCalled();
    }

    /** The refusal replaces the toast in place: same id, error tone, no undo, nothing sent. */
    function expectUndoRefused(toastId: string, workorderNumber: string): void {
      expect(component.toast()).toEqual({
        id: toastId,
        key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.UNDO_UNAVAILABLE',
        params: { workorder: workorderNumber },
        tone: 'ERROR',
        undo: null,
      });
      expectNoWrite();
    }

    it('arms undo from a readback that shows the write, and the undo performs the inverse write', () => {
      renderWith(fullDashboard);
      armAssignOnToAssign();

      component.undo();

      expect(dispatchBoardServiceStub.releaseMechanic).toHaveBeenCalledWith('wo-to-assign');
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_CLEARED');
    });

    // d89a09a undo :752 released whoever the row held by then — another
    // dispatcher's M5, not the M2 this write put there.
    it('refuses to undo a mechanic assignment a later poll has replaced', fakeAsync(() => {
      renderWith(fullDashboard);
      const toastId = armAssignOnToAssign();
      vi.clearAllMocks();
      dispatchBoardServiceStub.getDashboard.mockReturnValue(
        of(withWorkorder(fullDashboard, 'wo-to-assign', { status: 'ASSIGNED', assignedMechanicId: 'M5' })),
      );

      tick(30_000);
      expect(component.allRows().find(row => row.workorderId === 'wo-to-assign')?.mechanicId).toBe('M5');
      component.undo();

      expectUndoRefused(toastId, 'WO-24118');
      fixture.destroy();
    }));

    // d89a09a undo :765 released the position whoever had since placed it.
    it('refuses to undo a bay placement a later poll has moved', fakeAsync(() => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(afterB4OnToAssign));
      component.assignBay(component.toAssignRows()[0], 'B4');
      expect(component.toast()?.undo).not.toBeNull();
      const toastId = component.toast()?.id ?? '';
      vi.clearAllMocks();
      const movedToB7: DashboardResponse = {
        ...withWorkorder(fullDashboard, 'wo-to-assign', {
          resourceType: WorkorderSummaryResourceTypeEnum.Bay,
          assignedResourceId: 'B7',
        }),
        bays: [
          ...(fullDashboard.bays ?? []),
          { bayId: 'B7', bayName: 'Bay 7', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-to-assign' },
        ],
      };
      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(movedToB7));

      tick(30_000);
      expect(component.allRows().find(row => row.workorderId === 'wo-to-assign')?.bayId).toBe('B7');
      component.undo();

      expectUndoRefused(toastId, 'WO-24118');
      fixture.destroy();
    }));

    // d89a09a undo :750 re-assigned without the permission gate the assign path applies.
    it('issues nothing when the write authority was revoked after the undo was armed', () => {
      const granted = signal(true);
      authStub.hasAnyPermission.mockImplementation(() => granted());
      renderWith(fullDashboard);
      const toastId = armReassignOnAssigned();
      vi.clearAllMocks();

      granted.set(false);
      component.undo();

      expectUndoRefused(toastId, 'WO-24124');
    });

    // d89a09a undo :750 re-assigned onto a row the technician window no longer covers (400).
    it('issues nothing when the row has since left the technician window', () => {
      renderWith(fullDashboard);
      const toastId = armReassignOnAssigned();
      vi.clearAllMocks();
      dispatchBoardServiceStub.getDashboard.mockReturnValue(
        of(withWorkorder(afterM2OnAssigned, 'wo-assigned', { status: 'READY_FOR_PICKUP' })),
      );
      component.refresh();

      component.undo();

      expectUndoRefused(toastId, 'WO-24124');
    });

    // d89a09a :804-809 armed undo on whichever read paid the debt, another shop's included.
    it("arms no undo when the settlement is paid by another shop's read", () => {
      renderWith(fullDashboard);
      const readback = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(readback);
      component.assignMechanic(component.toAssignRows()[0], 'M2');
      expect(component.isPending('wo-to-assign')).toBe(true);

      component.selectedLocationId.set('LOC-2');
      dispatchBoardServiceStub.getDashboard.mockReturnValue(of({ ...emptyDashboard, locationId: 'LOC-2' }));
      component.refresh();

      expect(component.hasCachedData()).toBe(true);
      expect(component.isPending('wo-to-assign')).toBe(false);
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_ASSIGNED');
      expect(component.toast()?.undo).toBeNull();
    });

    // d89a09a :880-889 paid the debt on an error too, and :804-809 then armed undo over the error panel.
    it('arms no undo when the paying read fails and the board is gone', () => {
      renderWith(fullDashboard);
      const readback = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(readback);
      component.assignMechanic(component.toAssignRows()[0], 'M2');

      component.selectedLocationId.set('LOC-2');
      dispatchBoardServiceStub.getDashboard.mockReturnValue(throwError(() => ({ status: 500 })));
      component.refresh();

      expect(component.state()).toBe('error');
      expect(component.error()).toBe('SHOPMGMT.DISPATCH_BOARD.ERROR_LOAD');
      expect(component.hasCachedData()).toBe(false);
      expect(component.isPending('wo-to-assign')).toBe(false);
      expect(component.toast()?.undo).toBeNull();
    });

    // d89a09a reloadBoard :850-853 settled at once with no read, arming undo against nothing.
    it('arms no undo when the write settles with no location to read back', () => {
      renderWith(fullDashboard);
      const write = new Subject<unknown>();
      dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(write);
      component.assignMechanic(component.toAssignRows()[0], 'M2');
      const readsBefore = dispatchBoardServiceStub.getDashboard.mock.calls.length;

      component.selectedLocationId.set('');
      write.next({});
      write.complete();

      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(readsBefore);
      expect(component.isPending('wo-to-assign')).toBe(false);
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_ASSIGNED');
      expect(component.toast()?.undo).toBeNull();
    });
  });

  describe('F3: a refusal holds the row until the corrective re-read settles', () => {
    /** The write refused with 409, its corrective re-read left in flight. */
    function refuseWithSlowReload(): { row: WorkorderRow; reload: Subject<DashboardResponse> } {
      renderWith(fullDashboard);
      const row = component.assignedRows()[0];
      const reload = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(
        throwError(() => ({ status: 409, error: { code: 'TECHNICIAN_NOT_ASSIGNED' } })),
      );
      dispatchBoardServiceStub.getDashboard.mockReturnValue(reload);

      component.assignMechanic(row, 'M2');

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_MECHANIC_NOT_ASSIGNED');
      expect(dispatchBoardServiceStub.assignMechanic).toHaveBeenCalledTimes(1);
      return { row, reload };
    }

    // d89a09a run :812 released the guard before the reload at :825, which
    // carried no onSettled: a second click repeated the same wrong call.
    it('keeps the row pending across the refusal reload and refuses a second click', () => {
      const { row, reload } = refuseWithSlowReload();
      expect(component.isPending(row.workorderId)).toBe(true);
      expect(component.canTakeMechanic(row)).toBe(false);
      fixture.detectChanges();
      expect(rowFor(row.workorderId).classList.contains('busy')).toBe(true);

      component.assignMechanic(row, 'M2');
      component.openPicker('MECHANIC', row.workorderId);
      component.pick('M2');
      expect(dispatchBoardServiceStub.assignMechanic).toHaveBeenCalledTimes(1);

      reload.next(fullDashboard);
      expect(component.isPending(row.workorderId)).toBe(false);
    });

    it('a refresh that supersedes the refusal reload still releases the row', () => {
      const { row, reload } = refuseWithSlowReload();

      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(fullDashboard));
      component.refresh();
      expect(component.isPending(row.workorderId)).toBe(false);

      reload.next(fullDashboard);
      expect(component.isPending(row.workorderId)).toBe(false);
    });

    it('a refusal reload that itself fails still releases the row', () => {
      const { row, reload } = refuseWithSlowReload();

      reload.error({ status: 500 });

      expect(component.isPending(row.workorderId)).toBe(false);
      expect(component.isStale()).toBe(true);
    });

    it('releases the row at once after a failure that says nothing about the board', () => {
      renderWith(fullDashboard);
      const row = component.assignedRows()[0];
      dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      const reads = dispatchBoardServiceStub.getDashboard.mock.calls.length;

      component.assignMechanic(row, 'M2');

      expect(component.isPending(row.workorderId)).toBe(false);
      expect(component.canTakeMechanic(row)).toBe(true);
      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(reads);
    });
  });

  describe('F4: a readback for the shop switched to mid-write also re-enriches', () => {
    const loc1Inventory = inventoryOf({ bayId: 'B4', name: 'Bay 4', kind: 'ALIGNMENT', outOfService: false });
    const loc2Inventory = inventoryOf({ bayId: 'B7', name: 'Bay 7', kind: 'HEAVY_DUTY', outOfService: false });
    const loc2Board: DashboardResponse = {
      ...emptyDashboard,
      locationId: 'LOC-2',
      workorders: [{ workorderId: 'wo-loc2', workorderNumber: 'WO-L2', status: 'APPROVED' }],
    };

    /** A write on LOC-1 left in flight while the dispatcher switches to LOC-2. */
    function switchMidWrite(): Subject<unknown> {
      dispatchBoardServiceStub.getBayInventory.mockImplementation((locationId: string) =>
        of(locationId === 'LOC-2' ? loc2Inventory : loc1Inventory),
      );
      renderWith(fullDashboard);
      expect(component.openBays().map(bay => bay.bayId)).toEqual(['B4']);
      const write = new Subject<unknown>();
      dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(write);
      component.assignMechanic(component.toAssignRows()[0], 'M2');

      // The effect's own LOC-2 read never lands: the readback overtakes it.
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(new Subject<DashboardResponse>());
      component.onLocationPicked('LOC-2');
      fixture.detectChanges();
      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(loc2Board));
      return write;
    }

    function expectLoc2Enriched(): void {
      expect(dispatchBoardServiceStub.getBayInventory).toHaveBeenLastCalledWith('LOC-2');
      expect(component.hasCachedData()).toBe(true);
      expect(component.bayInventory().has('B4')).toBe(false);
      expect(component.openBays().map(bay => bay.bayId)).toEqual(['B7']);
      expect(component.isPending('wo-to-assign')).toBe(false);
    }

    // d89a09a reloadBoard :865-868 applied the LOC-2 board without loadEnrichment,
    // and load :430-432 had already exited superseded: LOC-1's bays stayed on
    // LOC-2's rail, draggable, until the next poll.
    it('re-enriches for the new location when the write lands after the switch', () => {
      const write = switchMidWrite();

      write.next({});
      write.complete();

      expectLoc2Enriched();
    });

    // d89a09a :824-826 — the refusal re-read was the same bare reloadBoard().
    it('re-enriches for the new location when the write is refused after the switch', () => {
      const write = switchMidWrite();

      write.error({ status: 409, error: { code: 'TECHNICIAN_NOT_ASSIGNED' } });

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_MECHANIC_NOT_ASSIGNED');
      expectLoc2Enriched();
    });
  });

  describe('F5: a blank location is not a location', () => {
    // d89a09a poll :901-907 asked getDashboard('', date) every 30s; a success
    // was cached under the blank key the controls also read, and rendered as current.
    it('never polls a blank location, and shows no board for it', fakeAsync(() => {
      renderWith(fullDashboard);
      component.onLocationPicked('');
      fixture.detectChanges();
      dispatchBoardServiceStub.getDashboard.mockClear();

      tick(60_000);

      expect(dispatchBoardServiceStub.getDashboard).not.toHaveBeenCalled();
      expect(component.hasCachedData()).toBe(false);
      expect(component.showBoard()).toBe(false);
      fixture.destroy();
    }));

    // d89a09a effect :383-388 returned after cleanup had cancelled the read in
    // flight, leaving 'loading' with nothing left to resolve it.
    it('does not leave the machine loading when the location is cleared mid-read', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValue(new Subject<DashboardResponse>());
      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();
      expect(component.state()).toBe('loading');

      component.onLocationPicked('');
      fixture.detectChanges();

      expect(component.state()).toBe('idle');
      expect(component.hasCachedData()).toBe(false);
      expect(fixture.nativeElement.querySelector('.loading-state')).toBeFalsy();
      expect(fixture.nativeElement.querySelectorAll('.workorder-row')).toHaveLength(0);
    });

    // d89a09a :997-1003 cleared freshness only inside load; the previous
    // shop's banners stayed up over an empty page.
    it("drops the previous selection's freshness banners when the location is cleared", () => {
      renderWith({ ...fullDashboard, dataQualityWarning: true });
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      component.refresh();
      expect(component.isStale()).toBe(true);
      expect(component.dataQualityWarning()).toBe(true);

      component.onLocationPicked('');
      fixture.detectChanges();

      expect(component.isStale()).toBe(false);
      expect(component.dataQualityWarning()).toBe(false);
      expect(component.lastRefreshed()).toBeNull();
      expect(fixture.nativeElement.querySelector('.stale-data-banner')).toBeFalsy();
      expect(fixture.nativeElement.querySelector('.data-quality-warning')).toBeFalsy();
      expect(component.showBoard()).toBe(false);
    });
  });

  describe("F6: a live bay claim outranks the summary's HOLD or MOBILE_UNIT", () => {
    const onMobileUnit: WorkorderSummary = {
      workorderId: 'wo-truck',
      workorderNumber: 'WO-TRUCK',
      status: 'ASSIGNED',
      assignedMechanicId: 'M1',
      resourceType: WorkorderSummaryResourceTypeEnum.MobileUnit,
      assignedResourceId: 'MU-1',
    };
    const freeBay4: BayStatus = { bayId: 'B4', bayName: 'Bay 4', available: true, status: 'ACTIVE' };

    function bayChangeControl(workorderId: string): HTMLButtonElement | undefined {
      const controls: HTMLButtonElement[] = Array.from(rowFor(workorderId).querySelectorAll('button.change'));
      return controls.find(control => control.getAttribute('aria-label')?.includes('CHANGE_BAY_ARIA'));
    }

    // d89a09a toRowBayId :1101-1103 returned null for a MOBILE_UNIT summary
    // before reading the claim: the rail showed the bay taken, the row nothing.
    it('shows the bay, with a clear control, when a bay claims a workorder the summary puts on a mobile unit', () => {
      renderWith({
        ...emptyDashboard,
        workorders: [onMobileUnit],
        mechanics: [{ personId: 'M1', firstName: 'Ray', lastName: 'Delgado', assignedWorkorderId: 'wo-truck' }],
        bays: [
          { bayId: 'B1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-truck' },
          freeBay4,
        ],
      });

      const row = component.allRows()[0];
      expect(row.bayId).toBe('B1');
      expect(row.bayName).toBe('Bay 1');
      expect(row.onMobileUnit).toBe(false);
      expect(row.parked).toBe(false);
      expect(component.canTakeBay(row)).toBe(true);
      expect(component.openBays().map(bay => bay.bayId)).toEqual(['B4']);
      expect(component.mechanics().find(mechanic => mechanic.personId === 'M1')?.whereLabel).toBe('Bay 1');
      expect(bayChangeControl('wo-truck')?.textContent).toContain('Bay 1');
      expect(bayChangeControl('wo-truck')?.disabled).toBe(false);
      expect(rowFor('wo-truck').querySelectorAll('button.clear')).toHaveLength(2);
      expect(rowFor('wo-truck').querySelector('.slot.mobile')).toBeNull();
    });

    // d89a09a html :470-475 rendered "+ bay" for it and canTakeBay :515-517
    // allowed the write, so a truck job could be moved off its unit unknowingly.
    it('renders a mobile-unit placement read-only when no bay claims it', () => {
      renderWith({
        ...emptyDashboard,
        workorders: [{ ...onMobileUnit, status: 'APPROVED', assignedMechanicId: undefined }],
        bays: [freeBay4],
      });

      const row = component.allRows()[0];
      expect(row.onMobileUnit).toBe(true);
      expect(row.bayId).toBeNull();
      expect(row.parked).toBe(false);
      expect(row.lane).toBe('TO_ASSIGN');
      expect(component.canTakeBay(row)).toBe(false);
      expect(component.bayBlockedKey(row)).toBe('SHOPMGMT.DISPATCH_BOARD.MOBILE_UNIT_NO_CHANGE');
      component.onDragStart('BAY', 'B4', new DragEvent('dragstart'));
      expect(component.canDrop(row)).toBe(false);

      const rowElement = rowFor('wo-truck');
      const slot = rowElement.querySelector('.slot.mobile');
      expect(slot?.textContent).toContain('SHOPMGMT.DISPATCH_BOARD.ON_MOBILE_UNIT');
      expect(slot?.querySelector('.sr-only')?.textContent).toContain('SHOPMGMT.DISPATCH_BOARD.MOBILE_UNIT_NO_CHANGE');
      expect(slot?.querySelector('button')).toBeNull();
      const buttons: HTMLButtonElement[] = Array.from(rowElement.querySelectorAll('button'));
      const bayControls = buttons.filter(button =>
        /ADD_BAY_ARIA|CHANGE_BAY_ARIA|PARKED_ARIA|CLEAR_BAY_ARIA/.test(button.getAttribute('aria-label') ?? ''),
      );
      expect(bayControls).toHaveLength(0);

      component.openPicker('BAY', 'wo-truck');
      component.pick('B4');
      expect(dispatchBoardServiceStub.assignBay).not.toHaveBeenCalled();
    });

    // d89a09a :1101-1103 returned null for a HOLD summary too, so the row
    // parked while the rail showed its bay occupied.
    it('puts a parked workorder on the bay that claims it', () => {
      renderWith({
        ...emptyDashboard,
        workorders: [
          {
            workorderId: 'wo-parked',
            workorderNumber: 'WO-24122',
            status: 'APPROVED',
            resourceType: WorkorderSummaryResourceTypeEnum.Hold,
            assignedResourceId: 'LOC-1',
          },
        ],
        bays: [
          { bayId: 'B1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-parked' },
          freeBay4,
        ],
      });

      const row = component.allRows()[0];
      expect(row.bayId).toBe('B1');
      expect(row.bayName).toBe('Bay 1');
      expect(row.parked).toBe(false);
      expect(row.lane).toBe('TO_ASSIGN');
      expect(component.heldRows()).toHaveLength(0);
      expect(component.stats().parked).toBe(0);
      expect(component.openBays().map(bay => bay.bayId)).toEqual(['B4']);
      expect(bayChangeControl('wo-parked')?.textContent).toContain('Bay 1');
    });
  });

  describe('F7: a mechanic whose name has not replicated is never named by id', () => {
    const WORKING_ID = 'person-uuid-working';
    const IDLE_ID = 'person-uuid-idle';
    const OFF_ID = 'person-uuid-off';
    const nameless: DashboardResponse = {
      ...withWorkorder(fullDashboard, 'wo-assigned', { assignedMechanicId: WORKING_ID }),
      mechanics: [
        { personId: WORKING_ID, assignedWorkorderId: 'wo-assigned' },
        { personId: IDLE_ID },
        { personId: OFF_ID, onBreak: true },
      ],
    };

    function ariaLabels(): string[] {
      const labelled: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('[aria-label]'));
      return labelled.map(element => element.getAttribute('aria-label') ?? '');
    }

    // d89a09a displayName :1237 returned mechanic.personId, which reached the
    // rail, the picker, the slot and three accessible names.
    it('keeps the person id out of every label, chip and slot', () => {
      renderWith(nameless);
      component.openPicker('MECHANIC', 'wo-to-assign');
      fixture.detectChanges();

      const text: string = fixture.nativeElement.textContent;
      for (const personId of [WORKING_ID, IDLE_ID, OFF_ID]) {
        expect(text).not.toContain(personId);
        for (const label of ariaLabels()) {
          expect(label).not.toContain(personId);
        }
      }
      expect(component.mechanics().map(mechanic => mechanic.name)).toEqual([null, null]);
      expect(component.mechanics().map(mechanic => mechanic.initials)).toEqual(['?', '?']);
      expect(component.assignedRows()[0].mechanicName).toBeNull();
      expect(component.assignedRows()[0].mechanicInitials).toBe('?');

      // Each consumer renders its unnamed variant rather than a blank.
      const chips: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('button.mech'));
      expect(chips.map(chip => chip.getAttribute('aria-label'))).toEqual([
        'SHOPMGMT.DISPATCH_BOARD.MECHANIC_ARIA_UNNAMED',
        'SHOPMGMT.DISPATCH_BOARD.MECHANIC_ARIA_UNNAMED',
      ]);
      expect(fixture.nativeElement.querySelectorAll('button.mech .mname-text.na')).toHaveLength(2);
      const change: HTMLButtonElement | null = rowFor('wo-assigned').querySelector('.slot.filled button.change');
      expect(change?.getAttribute('aria-label')).toBe('SHOPMGMT.DISPATCH_BOARD.CHANGE_MECHANIC_ARIA_UNNAMED');
      expect(change?.querySelector('.na')).toBeTruthy();
      expect(fixture.nativeElement.querySelectorAll('dialog .opt-name.na')).toHaveLength(2);
      expect(fixture.nativeElement.querySelector('.binchip .na .sr-only')?.textContent).toContain(
        'SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_MECHANIC_NAME',
      );
    });

    // d89a09a :638 passed displayName — the id — as the toast's mechanic parameter.
    it('confirms an assignment to an unnamed mechanic without naming them', () => {
      renderWith(nameless);

      component.assignMechanic(component.toAssignRows()[0], IDLE_ID);

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_ASSIGNED_UNNAMED');
      expect(component.toast()?.params).toEqual({ workorder: 'WO-24118' });
    });
  });

  describe('F8: "every bay is full" is only said when there are bays', () => {
    function railEmptyMessage(): string | undefined {
      const message: HTMLElement | null = fixture.nativeElement.querySelector(
        'section[aria-labelledby="dispatch-board-bays-title"] .none-left',
      );
      return message?.textContent?.trim();
    }

    function pickerEmptyMessage(): string | undefined {
      component.openPicker('BAY', 'wo-to-assign');
      fixture.detectChanges();
      const message: HTMLElement | null = fixture.nativeElement.querySelector('dialog.picker .none-left');
      return message?.textContent?.trim();
    }

    // d89a09a html :181-183 and :331-333 rendered NO_BAYS whenever openBays() was empty.
    it('says the location has no bays in service when neither the inventory nor the projection has one', () => {
      renderWith({ ...fullDashboard, bays: [] });

      expect(component.allBays()).toHaveLength(0);
      expect(railEmptyMessage()).toBe('SHOPMGMT.DISPATCH_BOARD.NO_BAYS_AT_LOCATION');
      expect(pickerEmptyMessage()).toBe('SHOPMGMT.DISPATCH_BOARD.NO_BAYS_AT_LOCATION');
    });

    it('says the same when every bay in the inventory is out of service', () => {
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(
        of(inventoryOf({ bayId: 'B9', name: 'Bay 9', kind: null, outOfService: true })),
      );
      renderWith({ ...fullDashboard, bays: [] });

      expect(railEmptyMessage()).toBe('SHOPMGMT.DISPATCH_BOARD.NO_BAYS_AT_LOCATION');
      expect(pickerEmptyMessage()).toBe('SHOPMGMT.DISPATCH_BOARD.NO_BAYS_AT_LOCATION');
    });

    it('still says every bay is full when the bays are all occupied', () => {
      renderWith({
        ...fullDashboard,
        bays: [{ bayId: 'B1', bayName: 'Bay 1', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-assigned' }],
      });

      expect(component.openBays()).toHaveLength(0);
      expect(railEmptyMessage()).toBe('SHOPMGMT.DISPATCH_BOARD.NO_BAYS');
      expect(pickerEmptyMessage()).toBe('SHOPMGMT.DISPATCH_BOARD.NO_BAYS');
    });
  });

  describe('F9: an out-of-service bay keeps its name for the work still standing on it', () => {
    // d89a09a bayNamesById :230-238 walked allBays(), which drops out-of-service
    // inventory at :327, so the row and the chip lost a name the inventory carried.
    it('names the bay on the row and the mechanic chip while keeping it off the open rail', () => {
      dispatchBoardServiceStub.getBayInventory.mockReturnValue(
        of(inventoryOf({ bayId: 'B9', name: 'Bay 9', kind: 'GENERAL_SERVICE', outOfService: true })),
      );
      renderWith({
        ...emptyDashboard,
        workorders: [
          {
            workorderId: 'wo-on-b9',
            workorderNumber: 'WO-B9',
            status: 'WORK_IN_PROGRESS',
            assignedMechanicId: 'M1',
            resourceType: WorkorderSummaryResourceTypeEnum.Bay,
            assignedResourceId: 'B9',
          },
        ],
        mechanics: [{ personId: 'M1', firstName: 'Ray', lastName: 'Delgado', assignedWorkorderId: 'wo-on-b9' }],
        // The projection carries the claim but no name: the inventory's must be used.
        bays: [{ bayId: 'B9', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-on-b9' }],
      });

      const row = component.allRows()[0];
      expect(row.bayId).toBe('B9');
      expect(row.bayName).toBe('Bay 9');
      expect(component.mechanics()[0].whereLabel).toBe('Bay 9');
      expect(component.openBays().map(bay => bay.bayId)).not.toContain('B9');
      expect(component.allBays().map(bay => bay.bayId)).not.toContain('B9');
      const controls: HTMLButtonElement[] = Array.from(rowFor('wo-on-b9').querySelectorAll('button.change'));
      expect(controls.map(control => control.textContent?.trim())).toContain('Bay 9');
      expect(fixture.nativeElement.querySelector('.mech .mwhere')?.textContent?.trim()).toBe('Bay 9');
    });
  });

  describe('F11: finished work is not waiting to be assigned', () => {
    const cancelledWithoutMechanic: WorkorderSummary = {
      workorderId: 'wo-cancelled',
      workorderNumber: 'WO-CANCELLED',
      status: 'CANCELLED',
      estimatedLaborHours: 9,
    };

    // d89a09a toLane :1107-1112 returned TO_ASSIGN for any row without a
    // mechanic, closed or not, and stats :335-353 summed its hours.
    it('lists a cancelled workorder with no mechanic in no lane and leaves the to-assign stats alone', () => {
      renderWith({
        ...fullDashboard,
        workorders: [...(fullDashboard.workorders ?? []), cancelledWithoutMechanic],
        bays: [
          ...(fullDashboard.bays ?? []),
          { bayId: 'B5', bayName: 'Bay 5', available: false, status: 'ACTIVE', assignedWorkorderId: 'wo-cancelled' },
        ],
      });

      expect(component.toAssignRows().map(row => row.workorderId)).toEqual(['wo-to-assign', 'wo-draft']);
      expect(component.heldRows().map(row => row.workorderId)).toEqual(['wo-parked']);
      expect(component.assignedRows().map(row => row.workorderId)).toEqual(['wo-assigned']);
      expect(component.stats().toAssign).toBe(2);
      expect(component.stats().toAssignHours).toBe(4.5);
      expect(component.allRows().find(row => row.workorderId === 'wo-cancelled')?.lane).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-wo="wo-cancelled"]')).toBeNull();
      // It stays known to the board, so the bay it left behind reads as free.
      expect(component.openBays().map(bay => bay.bayId)).toContain('B5');
    });

    it('keeps a completed workorder that still holds a mechanic under assigned, with inert controls', () => {
      renderWith({
        ...fullDashboard,
        workorders: [
          ...(fullDashboard.workorders ?? []),
          { workorderId: 'wo-closed', workorderNumber: 'WO-24100', status: 'COMPLETED', assignedMechanicId: 'M1' },
        ],
      });

      const closed = component.allRows().find(row => row.workorderId === 'wo-closed')!;
      expect(closed.lane).toBe('ASSIGNED');
      expect(component.assignedRows().map(row => row.workorderId)).toContain('wo-closed');
      expect(component.toAssignRows().map(row => row.workorderId)).not.toContain('wo-closed');
      const change: HTMLButtonElement | null = rowFor('wo-closed').querySelector('.slot.filled button.change');
      expect(change?.disabled).toBe(true);
      const clear: HTMLButtonElement | null = rowFor('wo-closed').querySelector('button.clear');
      expect(clear?.disabled).toBe(true);
    });
  });

  describe('F12: a 403 is an answer, not an outage', () => {
    // The interceptor rethrows a real HttpErrorResponse; the board keys on the class.
    const forbidden = () =>
      throwError(
        () => new HttpErrorResponse({ status: 403, statusText: 'Forbidden', error: { code: 'LOCATION_SCOPE_DENIED' } }),
      );

    // d89a09a applyError :1029-1034 kept the board up under a stale banner and
    // the poll :894-928 kept asking every 30s.
    it('drops the board, names the condition and stops polling when a poll answers 403', fakeAsync(() => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValue(forbidden());

      tick(30_000);

      expect(component.state()).toBe('error');
      expect(component.error()).toBe('SHOPMGMT.DISPATCH_BOARD.ERROR_FORBIDDEN');
      expect(component.hasCachedData()).toBe(false);
      expect(component.isStale()).toBe(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.workorder-row')).toHaveLength(0);
      expect(fixture.nativeElement.querySelector('.state-panel')?.textContent).toContain(
        'SHOPMGMT.DISPATCH_BOARD.ERROR_FORBIDDEN',
      );

      dispatchBoardServiceStub.getDashboard.mockClear();
      tick(60_000);
      expect(dispatchBoardServiceStub.getDashboard).not.toHaveBeenCalled();
      fixture.destroy();
    }));

    // The stale and data-quality banners render outside the board region, so
    // dropping the board without clearing them would leave them describing a
    // board that is no longer shown.
    it('clears the freshness banners it can no longer vouch for when a poll answers 403', fakeAsync(() => {
      renderWith({ ...fullDashboard, dataQualityWarning: true });
      dispatchBoardServiceStub.getDashboard.mockReturnValue(throwError(() => new Error('down')));
      tick(30_000);
      fixture.detectChanges();
      expect(component.isStale()).toBe(true);
      expect(component.dataQualityWarning()).toBe(true);
      expect(fixture.nativeElement.querySelector('.stale-data-banner')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.data-quality-warning')).toBeTruthy();

      dispatchBoardServiceStub.getDashboard.mockReturnValue(forbidden());
      tick(30_000);
      fixture.detectChanges();

      expect(component.error()).toBe('SHOPMGMT.DISPATCH_BOARD.ERROR_FORBIDDEN');
      expect(component.isStale()).toBe(false);
      expect(component.dataQualityWarning()).toBe(false);
      expect(component.lastRefreshed()).toBeNull();
      expect(fixture.nativeElement.querySelector('.stale-data-banner')).toBeNull();
      expect(fixture.nativeElement.querySelector('.data-quality-warning')).toBeNull();
      fixture.destroy();
    }));

    // d89a09a toLoadErrorKey :1302-1311 answered a first-load 403 with ERROR_LOAD.
    it('names the condition when the first load answers 403', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(forbidden());
      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.error()).toBe('SHOPMGMT.DISPATCH_BOARD.ERROR_FORBIDDEN');
      expect(fixture.nativeElement.querySelector('.state-panel')).toBeTruthy();
    });

    it('polls again once a location the caller may read has loaded', fakeAsync(() => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.getDashboard.mockReturnValue(forbidden());
      tick(30_000);
      expect(component.error()).toBe('SHOPMGMT.DISPATCH_BOARD.ERROR_FORBIDDEN');

      dispatchBoardServiceStub.getDashboard.mockReturnValue(of({ ...fullDashboard, locationId: 'LOC-2' }));
      component.onLocationPicked('LOC-2');
      fixture.detectChanges();
      expect(component.state()).toBe('ready');
      expect(component.error()).toBeNull();
      expect(component.showBoard()).toBe(true);

      dispatchBoardServiceStub.getDashboard.mockClear();
      tick(30_000);
      expect(dispatchBoardServiceStub.getDashboard).toHaveBeenCalledTimes(1);
      expect(dispatchBoardServiceStub.getDashboard).toHaveBeenCalledWith('LOC-2', TODAY);
      fixture.destroy();
    }));

    // Scope pin: the write path keeps its own reading of a 403 — a refused
    // write is a toast over a board that stays up (position P1), never a page error.
    it('reports a 403 on a write through the toast and leaves the board up', () => {
      renderWith(fullDashboard);
      dispatchBoardServiceStub.assignMechanic.mockReturnValueOnce(forbidden());

      component.assignMechanic(component.toAssignRows()[0], 'M2');

      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_GENERIC');
      expect(component.state()).toBe('ready');
      expect(component.showBoard()).toBe(true);
    });
  });

  describe('F14: a cleared date input falls back to the local today', () => {
    // d89a09a html :18-19 used `$event ?? todayIso()`, which lets '' through
    // and asks the backend for a board dated ''.
    // fakeAsync rather than whenStable(): the 30s poll keeps the zone busy, so
    // the fixture never reports stable; tick() flushes NgModel's write instead.
    it('asks for today again when the date input is cleared', fakeAsync(() => {
      renderWith(fullDashboard);
      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();
      tick();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#dispatch-date');
      expect(input.value).toBe('2026-05-04');
      expect(dispatchBoardServiceStub.getDashboard).toHaveBeenLastCalledWith('LOC-1', '2026-05-04');

      input.value = '';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(component.selectedDate()).toBe(TODAY);
      expect(dispatchBoardServiceStub.getDashboard).toHaveBeenLastCalledWith('LOC-1', TODAY);
      fixture.destroy();
    }));
  });

  describe('T3: interleavings the settlement mechanism must survive', () => {
    /** A write on wo-to-assign whose readback is left in flight. */
    function writeWithSlowReadback(): Subject<DashboardResponse> {
      renderWith(fullDashboard);
      const readback = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(readback);
      component.assignMechanic(component.toAssignRows()[0], 'M2');
      expect(component.isPending('wo-to-assign')).toBe(true);
      return readback;
    }

    function mechanicOn(workorderId: string): string | null | undefined {
      return component.allRows().find(row => row.workorderId === workorderId)?.mechanicId;
    }

    // (a) A poll fires while the readback is in flight. Whichever lands first,
    // the row is released exactly once, the board shows the poll's answer, and
    // the undo is armed off that answer — never off the stale read.
    it('poll lands before the readback: the poll settles the write and the late readback is dropped', fakeAsync(() => {
      const readback = writeWithSlowReadback();
      const poll = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(poll);
      tick(30_000);
      expect(component.isPending('wo-to-assign')).toBe(true);

      poll.next(afterM2OnToAssign);
      poll.complete();
      expect(component.isPending('wo-to-assign')).toBe(false);
      expect(component.toast()?.undo).not.toBeNull();

      readback.next(fullDashboard);
      readback.complete();
      expect(mechanicOn('wo-to-assign')).toBe('M2');
      expect(component.toast()?.undo).not.toBeNull();
      expect(component.isPending('wo-to-assign')).toBe(false);
      fixture.destroy();
    }));

    it('readback lands before the poll: the superseded readback settles nothing and the poll does', fakeAsync(() => {
      const readback = writeWithSlowReadback();
      const poll = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(poll);
      tick(30_000);

      readback.next(fullDashboard);
      readback.complete();
      expect(component.isPending('wo-to-assign')).toBe(true);
      expect(component.toast()?.undo).toBeNull();

      poll.next(afterM2OnToAssign);
      poll.complete();
      expect(component.isPending('wo-to-assign')).toBe(false);
      expect(component.toast()?.undo).not.toBeNull();
      expect(mechanicOn('wo-to-assign')).toBe('M2');
      fixture.destroy();
    }));

    // A poll that fails still pays the debt; over cached data that is a stale
    // banner, and the toast keeps its confirmation with no undo to offer.
    it('a failing poll releases the row without arming an undo', fakeAsync(() => {
      writeWithSlowReadback();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      tick(30_000);

      expect(component.isPending('wo-to-assign')).toBe(false);
      expect(component.isStale()).toBe(true);
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_ASSIGNED');
      expect(component.toast()?.undo).toBeNull();
      fixture.destroy();
    }));

    // (c) Two writes on different rows, both readbacks slow. The later read
    // pays both debts whichever lands first, and the earlier, once superseded,
    // changes nothing. One toast slot: the second write's undo is the one kept.
    function twoWritesWithSlowReadbacks(): {
      first: Subject<DashboardResponse>;
      second: Subject<DashboardResponse>;
    } {
      renderWith(fullDashboard);
      const first = new Subject<DashboardResponse>();
      const second = new Subject<DashboardResponse>();
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(first).mockReturnValueOnce(second);
      component.assignMechanic(component.toAssignRows()[0], 'M2');
      component.assignMechanic(component.assignedRows()[0], 'M2');
      expect(component.isPending('wo-to-assign')).toBe(true);
      expect(component.isPending('wo-assigned')).toBe(true);
      return { first, second };
    }
    const bothLanded = withWorkorder(afterM2OnToAssign, 'wo-assigned', { assignedMechanicId: 'M2' });

    it('the later readback landing first releases both rows; the earlier then changes nothing', () => {
      const { first, second } = twoWritesWithSlowReadbacks();
      const secondToastId = component.toast()?.id;

      second.next(bothLanded);
      expect(component.isPending('wo-to-assign')).toBe(false);
      expect(component.isPending('wo-assigned')).toBe(false);
      expect(component.toast()?.id).toBe(secondToastId);
      expect(component.toast()?.undo?.workorderId).toBe('wo-assigned');

      first.next(fullDashboard);
      expect(mechanicOn('wo-to-assign')).toBe('M2');
      expect(mechanicOn('wo-assigned')).toBe('M2');
      expect(component.toast()?.id).toBe(secondToastId);
      expect(component.toast()?.undo?.workorderId).toBe('wo-assigned');
    });

    it('the earlier readback landing first settles nothing; the later then releases both rows', () => {
      const { first, second } = twoWritesWithSlowReadbacks();
      const secondToastId = component.toast()?.id;

      first.next(fullDashboard);
      expect(component.isPending('wo-to-assign')).toBe(true);
      expect(component.isPending('wo-assigned')).toBe(true);
      expect(component.toast()?.undo).toBeNull();

      second.next(bothLanded);
      expect(component.isPending('wo-to-assign')).toBe(false);
      expect(component.isPending('wo-assigned')).toBe(false);
      expect(component.toast()?.id).toBe(secondToastId);
      expect(component.toast()?.undo?.workorderId).toBe('wo-assigned');
      expect(mechanicOn('wo-to-assign')).toBe('M2');
      expect(mechanicOn('wo-assigned')).toBe('M2');
    });
  });

  // Findings from the Copilot review on PR #282. Each one is a real defect the
  // implementation had; these pin the fixes.
  describe('review findings', () => {
    function dragEvent(): DragEvent {
      return {
        dataTransfer: { dropEffect: 'none', effectAllowed: 'none', setData: vi.fn(), getData: vi.fn() },
        preventDefault: vi.fn(),
      } as unknown as DragEvent;
    }

    // `todayIso` was fixed at construction, so a board left open across local
    // midnight still called yesterday "today" and kept clock writes live
    // against a historical board.
    // Two halves, because the bug spanned both: the poll never refreshed the
    // day, and every timekeeping gate hangs off it.
    it('re-reads the local day on each poll tick', fakeAsync(() => {
      renderWith(fullDashboard);
      // Stand in for a board left open across midnight: the signal now holds a
      // day that is no longer today, exactly as it would at 00:01.
      component.todayIso.set('2020-01-01');

      tick(30_000);

      expect(component.todayIso()).toBe(TODAY);
      discardPeriodicTasks();
    }));

    it('closes the clock once the day has moved past the board\u2019s date', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);
      expect(component.isViewingToday()).toBe(true);

      // The day turns; the dispatcher's chosen date does not move with it.
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      component.todayIso.set(isoDateLocal(tomorrow));
      fixture.detectChanges();

      expect(component.isViewingToday()).toBe(false);
      expect(component.canClock(component.mechanics()[0])).toBe(false);
      expect(component.canStartBreak(component.mechanics()[0])).toBe(false);
      // The board does not advance under them; it stops offering to write.
      expect(component.selectedDate()).toBe(TODAY);
      expect(component.clockHintKey(component.mechanics()[0])).toBe(
        'SHOPMGMT.DISPATCH_BOARD.CLOCK_TODAY_ONLY',
      );
    });

    // PTO wins in `toAvailability`, so a mechanic on approved time off sits in
    // the bin — but the bin's actions read the clock alone and would offer to
    // change a record the board says comes from HR.
    it('offers no bin action for a mechanic on time off, whatever the clock says', () => {
      const onPtoAndOnBreak: DashboardResponse = {
        ...fullDashboard,
        mechanics: [
          {
            personId: 'M1',
            firstName: 'Ray',
            lastName: 'Delgado',
            ptoEntries: [{ ptoId: 'p1', ptoType: 'VACATION', start: `${TODAY}T00:00:00Z`, end: `${TODAY}T23:59:59Z` }],
          },
        ],
      };
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'ON_BREAK', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(onPtoAndOnBreak);

      const card = component.offDutyMechanics().find(mechanic => mechanic.personId === 'M1')!;
      expect(card.onTimeOff).toBe(true);
      expect(card.availability).toBe('OFF');
      expect(component.canEndBreak(card)).toBe(false);
      expect(component.canLeaveBin(card)).toBe(false);
      expect(fixture.nativeElement.querySelectorAll('.binchip .clock-btn')).toHaveLength(0);
    });

    it('offers no clock-in from the bin for a mechanic on time off', () => {
      const onPtoAndClockedOut: DashboardResponse = {
        ...fullDashboard,
        mechanics: [
          {
            personId: 'M1',
            firstName: 'Ray',
            lastName: 'Delgado',
            ptoEntries: [{ ptoId: 'p1', ptoType: 'VACATION', start: `${TODAY}T00:00:00Z`, end: `${TODAY}T23:59:59Z` }],
          },
        ],
      };
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_OUT', workSessionId: null }]]), ok: true }),
      );
      renderWith(onPtoAndClockedOut);

      const card = component.offDutyMechanics().find(mechanic => mechanic.personId === 'M1')!;
      expect(card.onTimeOff).toBe(true);
      expect(component.canClockInFromBin(card)).toBe(false);
      expect(component.canLeaveBin(card)).toBe(false);

      // And the drag refuses rather than clocking them in.
      component.onDragStart('MECHANIC', 'M1', dragEvent(), 'BREAK');
      component.onRosterDrop(dragEvent());
      expect(dispatchBoardServiceStub.clockIn).not.toHaveBeenCalled();
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_OFF_DUTY_NOT_CHANGEABLE');
    });

    // Second review round. `binStatusKey` read the clock before PTO, so a
    // mechanic on time off who is also clocked out — the exact state the
    // clock-in guard above creates — was labelled "not clocked in" on the one
    // chip this board is not allowed to change.
    it('labels a mechanic on time off as off duty, not as merely not clocked in', () => {
      const onPtoAndClockedOut: DashboardResponse = {
        ...fullDashboard,
        mechanics: [
          {
            personId: 'M1',
            firstName: 'Ray',
            lastName: 'Delgado',
            ptoEntries: [{ ptoId: 'p1', ptoType: 'VACATION', start: `${TODAY}T00:00:00Z`, end: `${TODAY}T23:59:59Z` }],
          },
        ],
      };
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_OUT', workSessionId: null }]]), ok: true }),
      );
      renderWith(onPtoAndClockedOut);

      const card = component.offDutyMechanics().find(mechanic => mechanic.personId === 'M1')!;
      expect(component.binStatusKey(card)).toBe('SHOPMGMT.DISPATCH_BOARD.OFF_DUTY');
    });

    it('still says not-clocked-in for a mechanic who is simply off the clock', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_OUT', workSessionId: null }]]), ok: true }),
      );
      renderWith(fullDashboard);

      const card = component.offDutyMechanics().find(mechanic => mechanic.personId === 'M1')!;
      expect(card.onTimeOff).toBe(false);
      expect(component.binStatusKey(card)).toBe('SHOPMGMT.DISPATCH_BOARD.NOT_CLOCKED_IN');
    });

    // The note told the dispatcher to drag on a board where dragging is off.
    it('stops advertising the drag on another day\u2019s board', () => {
      renderWith(fullDashboard);
      expect(component.binNoteKey()).toBe('SHOPMGMT.DISPATCH_BOARD.BREAK_DRAG_HINT');

      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();
      expect(component.binNoteKey()).toBe('SHOPMGMT.DISPATCH_BOARD.BREAK_OTHER_DAY');
      expect(fixture.nativeElement.querySelector('.bin-note')?.textContent?.trim()).toBe(
        'SHOPMGMT.DISPATCH_BOARD.BREAK_OTHER_DAY',
      );
    });

    it('still says read-only to a caller without the timekeeping authority', () => {
      authStub.hasAnyPermission.mockImplementation(
        (codes: readonly string[]) => !codes.includes('people:timekeeping:approve'),
      );
      renderWith(fullDashboard);

      expect(component.binNoteKey()).toBe('SHOPMGMT.DISPATCH_BOARD.BREAK_NO_PERMISSION');
    });

    // Fifth round. A write in flight dimmed the row and disabled its buttons,
    // but left the drag handle live — and dropping it hit the pending branch of
    // `canStartBreak`, which words its refusal "clock them in first" even for
    // someone who is plainly already clocked in.
    it('accepts no drop while a write on that mechanic is in flight', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);

      const pending = new Subject<unknown>();
      dispatchBoardServiceStub.clockOut.mockReturnValue(pending.asObservable());
      component.clockOut(component.mechanics().find(mechanic => mechanic.personId === 'M1')!);
      fixture.detectChanges();
      expect(component.isClockPending('M1')).toBe(true);

      component.onDragStart('MECHANIC', 'M1', dragEvent());
      expect(component.isBreakBinDropTarget()).toBe(false);

      component.onBreakBinDrop(dragEvent());
      expect(dispatchBoardServiceStub.startBreak).not.toHaveBeenCalled();
      // And no refusal naming a reason that is not the reason.
      expect(component.toast()?.key).not.toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_BREAK_NEEDS_CLOCK_IN');
    });

    it('stops offering the drag handle while that write is in flight', () => {
      renderWith(fullDashboard);
      const pending = new Subject<unknown>();
      dispatchBoardServiceStub.clockIn.mockReturnValue(pending.asObservable());

      component.clockIn(component.mechanics()[0]);
      fixture.detectChanges();

      const handle: HTMLElement = fixture.nativeElement.querySelector('.mech-row button.mech');
      expect(handle.getAttribute('draggable')).toBe('false');
    });

    // `shiftSource` is the field the API says to read to tell a placeholder
    // window from a real one; the projection was discarding it and captioning
    // every figure as the shop-hours stand-in.
    it('drops the placeholder caveat when the window is a real per-person one', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({
          skills: new Map(),
          shifts: new Map([['M1', { status: 'DERIVED', source: 'PERSON_SCHEDULE', minutes: 480 }]]),
          ok: true,
        }),
      );
      renderWith(fullDashboard);

      const card = component.mechanics().find(mechanic => mechanic.personId === 'M1')!;
      expect(card.freeHours).toBe(6);
      expect(card.freeHoursIsPlaceholder).toBe(false);

      const free: HTMLElement = fixture.nativeElement.querySelector('#mfree-M1');
      expect(free.textContent).toContain('SHOPMGMT.DISPATCH_BOARD.FREE_HOURS');
      expect(free.querySelector('.sr-only')).toBeNull();
      expect(free.getAttribute('title')).toBeNull();
    });

    it('keeps the caveat while the window is the shop-hours stand-in', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({
          skills: new Map(),
          shifts: new Map([['M1', { status: 'DERIVED', source: 'LOCATION_HOURS', minutes: 480 }]]),
          ok: true,
        }),
      );
      renderWith(fullDashboard);

      expect(component.mechanics().find(m => m.personId === 'M1')?.freeHoursIsPlaceholder).toBe(true);
      const free: HTMLElement = fixture.nativeElement.querySelector('#mfree-M1');
      expect(free.querySelector('.sr-only')?.textContent).toContain('FREE_HOURS_PLACEHOLDER_HINT');
      expect(free.getAttribute('title')).toContain('FREE_HOURS_PLACEHOLDER_HINT');
    });

    // The bin lit up as a drop target on a historical board and then answered
    // "clock them in first", which names the wrong reason.
    it('offers neither drop target on another day\u2019s board', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);
      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();

      component.onDragStart('MECHANIC', 'M1', dragEvent());
      expect(component.isBreakBinDropTarget()).toBe(false);

      component.onDragStart('MECHANIC', 'M1', dragEvent(), 'BREAK');
      expect(component.isRosterDropTarget()).toBe(false);
    });

    // A clock write used to bump the enrichment sequence, which cancelled an
    // in-flight bays/roster read and sent nothing to replace it.
    it('does not discard an in-flight roster read when a clock write lands', () => {
      const slowRoster = new Subject<{
        skills: ReadonlyMap<string, readonly string[]>;
        shifts: ReadonlyMap<string, unknown>;
        ok: boolean;
      }>();
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(slowRoster);
      renderWith(fullDashboard);

      // A clock write, and its re-read, while the roster is still in flight.
      component.clockIn(component.mechanics()[0]);

      slowRoster.next({
        skills: new Map([['M1', ['BRAKES']]]),
        shifts: new Map([['M1', { status: 'DERIVED', source: 'LOCATION_HOURS', minutes: 480 }]]),
        ok: true,
      });
      slowRoster.complete();
      fixture.detectChanges();

      // The roster still landed; it was not cancelled by the clock write.
      expect(component.technicianSkills().get('M1')).toEqual(['BRAKES']);
      expect(component.technicianShifts().size).toBe(1);
    });

    // A failed roster read degrades to empty maps, which read as "not on the
    // location roster" against every mechanic — an outage reported as a fact
    // about the people.
    it('calls a failed roster read unknown, not off-roster', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({ skills: new Map(), shifts: new Map(), ok: false }),
      );
      renderWith(fullDashboard);

      const card = component.mechanics()[0];
      expect(card.freeHours).toBeNull();
      expect(card.freeHoursReason).toBe('UNKNOWN');
      expect(component.freeHoursReasonKey(card)).toBe('SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS');
    });

    it('still calls a genuine roster omission off-roster', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({ skills: new Map(), shifts: new Map([['M2', { status: 'DERIVED', source: 'LOCATION_HOURS', minutes: 480 }]]), ok: true }),
      );
      renderWith(fullDashboard);

      expect(component.mechanics().find(mechanic => mechanic.personId === 'M1')?.freeHoursReason).toBe('OFF_ROSTER');
    });

    // The roster read is dated, so its credentials are dated too; they were
    // only being dropped on a location change.
    it('drops skill chips on a date change, not only a location change', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({ skills: new Map([['M1', ['BRAKES']]]), shifts: new Map(), ok: true }),
      );
      renderWith(fullDashboard);
      expect(component.technicianSkills().get('M1')).toEqual(['BRAKES']);

      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(new Subject());
      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();

      expect(component.technicianSkills().size).toBe(0);
    });

    // `title` reaches neither the keyboard nor touch, as this board's own `.na`
    // rule says, so the placeholder caveat has to be in the accessible name.
    it('announces the free-hours placeholder caveat, not just as a title', () => {
      dispatchBoardServiceStub.getTechnicianRoster.mockReturnValue(
        of({ skills: new Map(), shifts: new Map([['M1', { status: 'DERIVED', source: 'LOCATION_HOURS', minutes: 480 }]]), ok: true }),
      );
      renderWith(fullDashboard);

      const free: HTMLElement = fixture.nativeElement.querySelector('.mech .mfree');
      expect(free.querySelector('.sr-only')?.textContent).toContain(
        'SHOPMGMT.DISPATCH_BOARD.FREE_HOURS_PLACEHOLDER_HINT',
      );
    });
  });

  describe('breaks by drag', () => {
    /** A drag event whose preventDefault and dropEffect can be inspected. */
    function dragEvent(): DragEvent & { defaultPrevented: boolean } {
      const dataTransfer = { dropEffect: 'none', effectAllowed: 'none', setData: vi.fn(), getData: vi.fn() };
      return {
        dataTransfer,
        preventDefault: vi.fn(function (this: { defaultPrevented: boolean }) {
          this.defaultPrevented = true;
        }),
        defaultPrevented: false,
      } as unknown as DragEvent & { defaultPrevented: boolean };
    }

    /** Render with M1 clocked in and M2 on a break. */
    function renderWithClocks(): void {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([
            ['M1', { state: 'CLOCKED_IN', workSessionId: 'ws-1' }],
            ['M2', { state: 'ON_BREAK', workSessionId: 'ws-2' }],
          ]), ok: true }),
      );
      renderWith(fullDashboard);
    }

    function rosterCard(personId: string) {
      return component.mechanics().find(mechanic => mechanic.personId === personId)!;
    }

    function binCard(personId: string) {
      return component.offDutyMechanics().find(mechanic => mechanic.personId === personId)!;
    }

    it('starts a break when a clocked-in mechanic is dragged into the bin', () => {
      renderWithClocks();
      component.onDragStart('MECHANIC', 'M1', dragEvent());

      expect(component.isBreakBinDropTarget()).toBe(true);
      component.onBreakBinDrop(dragEvent());

      expect(dispatchBoardServiceStub.startBreak).toHaveBeenCalledWith('ws-1');
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.BREAK_STARTED');
      expect(component.toast()?.tone).toBe('INFO');
    });

    it('ends a break when a mechanic is dragged out of the bin onto the roster', () => {
      renderWithClocks();
      component.onDragStart('MECHANIC', 'M2', dragEvent(), 'BREAK');

      expect(component.isRosterDropTarget()).toBe(true);
      component.onRosterDrop(dragEvent());

      expect(dispatchBoardServiceStub.stopBreak).toHaveBeenCalledWith('ws-2');
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.BREAK_ENDED');
    });

    // The break is keyed by the open session, so someone with no session has
    // nothing to hang one on. Since clocked-out mechanics sit in the bin, the
    // roster case left is a row whose clock state the caller may not read.
    // A read that ANSWERED and left the row out is pos-people withholding the
    // state, not proof there is no session — the hidden state may well be
    // CLOCKED_IN. "Clock them in first" would be the board asserting something
    // it was never told, so it says what it actually knows.
    it('will not claim a mechanic is off the clock when it was not told', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(of({ states: new Map(), ok: true }));
      renderWith(fullDashboard);
      expect(component.mechanics()[0].clockState).toBe('UNKNOWN');
      component.onDragStart('MECHANIC', 'M1', dragEvent());

      // The bin still takes the drop: a dead cursor would not explain itself.
      expect(component.isBreakBinDropTarget()).toBe(true);
      component.onBreakBinDrop(dragEvent());

      expect(dispatchBoardServiceStub.startBreak).not.toHaveBeenCalled();
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_CLOCK_UNREADABLE');
      expect(component.toast()?.tone).toBe('ERROR');
    });

    // The confirmed case still says the useful thing, because here the board
    // WAS told: this mechanic has no open session.
    // A CLOCKED_OUT mechanic is already in the bin and not draggable from the
    // roster at all, so the reachable case is a state the board WAS told that
    // carries no session id.
    it('refuses a break when the board was told the state but got no session', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'CLOCKED_IN', workSessionId: null }]]), ok: true }),
      );
      renderWith(fullDashboard);
      component.onDragStart('MECHANIC', 'M1', dragEvent());
      component.onBreakBinDrop(dragEvent());

      expect(dispatchBoardServiceStub.startBreak).not.toHaveBeenCalled();
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_BREAK_NEEDS_CLOCK_IN');
    });

    // A chip in the bin for approved time off is HR's record, not a session.
    it('will not end a break for a mechanic who is off duty on PTO', () => {
      const onPto: DashboardResponse = {
        ...fullDashboard,
        mechanics: [
          {
            personId: 'M1',
            firstName: 'Ray',
            lastName: 'Delgado',
            ptoEntries: [
              { ptoId: 'p1', ptoType: 'VACATION', start: `${TODAY}T00:00:00Z`, end: `${TODAY}T23:59:59Z` },
            ],
          },
        ],
      };
      dispatchBoardServiceStub.getClockStates.mockReturnValue(of({ states: new Map(), ok: true }));
      renderWith(onPto);

      expect(binCard('M1').availability).toBe('OFF');
      expect(component.canEndBreak(binCard('M1'))).toBe(false);

      component.onDragStart('MECHANIC', 'M1', dragEvent(), 'BREAK');
      component.onRosterDrop(dragEvent());

      expect(dispatchBoardServiceStub.stopBreak).not.toHaveBeenCalled();
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_OFF_DUTY_NOT_CHANGEABLE');
    });

    // Dispatching someone who is on a break is not what this drag means.
    it('refuses to drop a mechanic from the bin onto a workorder', () => {
      renderWithClocks();
      component.onDragStart('MECHANIC', 'M2', dragEvent(), 'BREAK');

      expect(component.canDrop(component.toAssignRows()[0])).toBe(false);

      component.onDrop(component.toAssignRows()[0], dragEvent());
      expect(dispatchBoardServiceStub.assignMechanic).not.toHaveBeenCalled();
    });

    it('still dispatches a mechanic dragged from the roster', () => {
      renderWithClocks();
      component.onDragStart('MECHANIC', 'M1', dragEvent());

      expect(component.canDrop(component.toAssignRows()[0])).toBe(true);
      expect(component.isRosterDropTarget()).toBe(false);
    });

    it('reads the clock back after a break write rather than predicting it', () => {
      renderWithClocks();
      const clockReads = dispatchBoardServiceStub.getClockStates.mock.calls.length;
      const boardReads = dispatchBoardServiceStub.getDashboard.mock.calls.length;

      component.startBreak(rosterCard('M1'));

      expect(dispatchBoardServiceStub.getClockStates.mock.calls.length).toBe(clockReads + 1);
      expect(dispatchBoardServiceStub.getDashboard.mock.calls.length).toBe(boardReads);
    });

    it('maps the break refusals onto their own messages', () => {
      renderWithClocks();
      dispatchBoardServiceStub.startBreak.mockReturnValueOnce(
        throwError(() => ({ status: 409, error: { code: 'INVALID_STATE' } })),
      );
      component.startBreak(rosterCard('M1'));
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_ALREADY_ON_BREAK');

      dispatchBoardServiceStub.stopBreak.mockReturnValueOnce(
        throwError(() => ({ status: 409, error: { code: 'INVALID_STATE' } })),
      );
      component.endBreak(binCard('M2'));
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_NOT_ON_BREAK');
    });

    it('guards one break write per mechanic at a time', () => {
      renderWithClocks();
      const pending = new Subject<unknown>();
      dispatchBoardServiceStub.startBreak.mockReturnValue(pending.asObservable());

      component.startBreak(rosterCard('M1'));
      component.startBreak(rosterCard('M1'));

      expect(dispatchBoardServiceStub.startBreak).toHaveBeenCalledTimes(1);
      expect(component.isClockPending('M1')).toBe(true);
    });

    it('offers no break drop to a caller without the timekeeping authority', () => {
      authStub.hasAnyPermission.mockImplementation(
        (codes: readonly string[]) => !codes.includes('people:timekeeping:approve'),
      );
      renderWithClocks();
      component.onDragStart('MECHANIC', 'M1', dragEvent());

      expect(component.isBreakBinDropTarget()).toBe(false);
      component.onBreakBinDrop(dragEvent());
      expect(dispatchBoardServiceStub.startBreak).not.toHaveBeenCalled();
    });

    it('is not offered on another day\u2019s board', () => {
      renderWithClocks();
      component.selectedDate.set('2026-05-04');
      fixture.detectChanges();

      expect(component.canStartBreak(rosterCard('M1'))).toBe(false);
    });
  });

  describe('clocked out is off duty', () => {
    function dragEvent(): DragEvent {
      return {
        dataTransfer: { dropEffect: 'none', effectAllowed: 'none', setData: vi.fn(), getData: vi.fn() },
        preventDefault: vi.fn(),
      } as unknown as DragEvent;
    }

    function renderClockedOut(): void {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([
            ['M1', { state: 'CLOCKED_OUT', workSessionId: null }],
            ['M2', { state: 'CLOCKED_IN', workSessionId: 'ws-2' }],
          ]), ok: true }),
      );
      renderWith(fullDashboard);
    }

    // A workorder assigned to someone who has gone home is a plan for
    // tomorrow, not a mechanic on the floor: M1 holds wo-assigned and still
    // leaves the roster.
    it('moves a clocked-out mechanic to the bin even when work is assigned to them', () => {
      renderClockedOut();

      expect(component.mechanics().some(mechanic => mechanic.personId === 'M1')).toBe(false);
      const out = component.offDutyMechanics().find(mechanic => mechanic.personId === 'M1');
      expect(out?.availability).toBe('OFF');
      expect(out?.assignedWorkorderId).toBe('wo-assigned');
    });

    it('counts them as out rather than on duty', () => {
      renderClockedOut();

      expect(component.stats().onDuty).toBe(1);
      expect(component.stats().out).toBe(2);
    });

    // The roster card that used to carry the clock-in button is exactly where
    // they are no longer listed, so the bin has to carry it instead.
    it('offers the way back on the clock from the bin', () => {
      renderClockedOut();
      const out = component.offDutyMechanics().find(mechanic => mechanic.personId === 'M1')!;

      expect(component.canClockInFromBin(out)).toBe(true);
      expect(component.canLeaveBin(out)).toBe(true);

      const chipButtons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.binchip .clock-btn'),
      );
      expect(chipButtons.map(button => button.getAttribute('aria-label'))).toContain(
        'SHOPMGMT.DISPATCH_BOARD.CLOCK_IN_ARIA',
      );
    });

    it('clocks them in when dragged out of the bin onto the roster', () => {
      renderClockedOut();
      component.onDragStart('MECHANIC', 'M1', dragEvent(), 'BREAK');

      expect(component.isRosterDropTarget()).toBe(true);
      component.onRosterDrop(dragEvent());

      expect(dispatchBoardServiceStub.clockIn).toHaveBeenCalledWith('M1');
      expect(dispatchBoardServiceStub.stopBreak).not.toHaveBeenCalled();
      expect(component.toast()?.key).toBe('SHOPMGMT.DISPATCH_BOARD.TOAST.CLOCKED_IN');
    });

    // The same gesture means two things; the state decides which write it is.
    it('ends a break instead when that is the state they are in', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(
        of({ states: new Map([['M1', { state: 'ON_BREAK', workSessionId: 'ws-1' }]]), ok: true }),
      );
      renderWith(fullDashboard);
      component.onDragStart('MECHANIC', 'M1', dragEvent(), 'BREAK');
      component.onRosterDrop(dragEvent());

      expect(dispatchBoardServiceStub.stopBreak).toHaveBeenCalledWith('ws-1');
      expect(dispatchBoardServiceStub.clockIn).not.toHaveBeenCalled();
    });

    it('labels not-clocked-in apart from approved time off', () => {
      renderClockedOut();
      const out = component.offDutyMechanics().find(mechanic => mechanic.personId === 'M1')!;

      expect(component.binStatusKey(out)).toBe('SHOPMGMT.DISPATCH_BOARD.NOT_CLOCKED_IN');
    });

    // `UNKNOWN` is "the caller may not read this", not "off the clock". Moving
    // those rows would empty the roster for a dispatcher with no timekeeping
    // grant, which is the one case that must keep working as it always did.
    it('leaves a mechanic whose clock state cannot be read on the roster', () => {
      dispatchBoardServiceStub.getClockStates.mockReturnValue(of({ states: new Map(), ok: true }));
      renderWith(fullDashboard);

      expect(component.mechanics().map(mechanic => mechanic.personId)).toContain('M1');
      expect(component.mechanics()[0].clockState).toBe('UNKNOWN');
    });
  });
});
