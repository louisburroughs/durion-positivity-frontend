import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { DispatchBoardPageComponent } from './dispatch-board-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { DispatchBoardService } from '../../services/dispatch-board.service';

// ---------------------------------------------------------------------------
// Inline model types — match the planned production shapes from the story spec
// ---------------------------------------------------------------------------
interface WorkorderSummary {
  workorderId: string;
  status: string;
}

interface DashboardResponse {
  date: string;
  locationId: string;
  workorders: WorkorderSummary[];
  mechanics: { mechanicId: string; name: string }[];
  bays: { bayId: string; occupied: boolean }[];
  conflicts: { code: string; severity: 'WARNING' | 'BLOCKING'; message: string }[];
  lastRefreshed: string;
  dataQualityWarning: boolean;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const TODAY = new Date().toISOString().slice(0, 10);

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
    { workorderId: 'WO-001', status: 'IN_PROGRESS' },
    { workorderId: 'WO-002', status: 'PENDING' },
  ],
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('DispatchBoardPageComponent', () => {
  let fixture: ComponentFixture<DispatchBoardPageComponent>;
  let component: DispatchBoardPageComponent;

  const dispatchBoardServiceStub = {
    getDashboard: vi.fn().mockReturnValue(of(emptyDashboard)),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DispatchBoardPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: dispatchBoardServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DispatchBoardPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    it('renders a location input in the filter bar', () => {
      fixture.detectChanges();
      const locationInput = fixture.nativeElement.querySelector('input[name="locationId"]');
      expect(locationInput).toBeTruthy();
    });

    it('renders a date input whose value defaults to today ISO date', () => {
      fixture.detectChanges();
      const dateInput: HTMLInputElement | null =
        fixture.nativeElement.querySelector('input[type="date"]');
      expect(dateInput).toBeTruthy();
      expect(component.selectedDate()).toBe(TODAY);
    });
  });

  // -------------------------------------------------------------------------
  // AC3: Refresh button visible
  // -------------------------------------------------------------------------
  describe('AC3: refresh button', () => {
    it('renders a visible Refresh button', () => {
      fixture.detectChanges();
      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      );
      const refreshBtn = buttons.find((b) =>
        b.textContent?.trim().toLowerCase().includes('refresh'),
      );
      expect(refreshBtn).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // AC4: Successful load renders workorder rows (workorderId + status)
  // -------------------------------------------------------------------------
  describe('AC4: workorder rows on successful load', () => {
    it('renders one .workorder-row per workorder in the response', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(loadedDashboard));
      fixture.detectChanges();

      const rows: NodeList = fixture.nativeElement.querySelectorAll('.workorder-row');
      expect(rows.length).toBe(2);
    });

    it('each workorder row displays the workorderId', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(loadedDashboard));
      fixture.detectChanges();

      const rows: NodeListOf<HTMLElement> =
        fixture.nativeElement.querySelectorAll('.workorder-row');
      expect(rows[0].textContent).toContain('WO-001');
    });

    it('each workorder row displays the status', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(loadedDashboard));
      fixture.detectChanges();

      const rows: NodeListOf<HTMLElement> =
        fixture.nativeElement.querySelectorAll('.workorder-row');
      expect(rows[0].textContent).toContain('IN_PROGRESS');
    });
  });

  // -------------------------------------------------------------------------
  // AC5: Empty state message when no workorders returned
  // -------------------------------------------------------------------------
  describe('AC5: empty state', () => {
    it('shows .empty-state element when workorders array is empty', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(emptyDashboard));
      fixture.detectChanges();

      const emptyEl = fixture.nativeElement.querySelector('.empty-state');
      expect(emptyEl).toBeTruthy();
    });

    it('renders zero .workorder-row elements when response has no workorders', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(emptyDashboard));
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('.workorder-row');
      expect(rows.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // AC6: Error state with retry button (no cached data)
  // -------------------------------------------------------------------------
  describe('AC6: error state with retry (no prior successful load)', () => {
    it('shows .state-panel element when service errors on initial load', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Network error' } })),
      );
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.state-panel');
      expect(errorEl).toBeTruthy();
    });

    it('sets error() signal when service errors', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Gateway timeout' } })),
      );
      fixture.detectChanges();

      expect(component.error()).toBeTruthy();
    });

    it('renders a retry button inside the error state panel', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Server error' } })),
      );
      fixture.detectChanges();

      const retryBtn = fixture.nativeElement.querySelector('.state-panel button');
      expect(retryBtn).toBeTruthy();
    });

    it('clicking the retry button triggers a new getDashboard call', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Server error' } })),
      );
      fixture.detectChanges();

      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(loadedDashboard));
      const retryBtn: HTMLButtonElement =
        fixture.nativeElement.querySelector('.state-panel button');
      retryBtn.click();
      fixture.detectChanges();

      expect(dispatchBoardServiceStub.getDashboard).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // AC7: "Last updated" timestamp shown after successful load
  // -------------------------------------------------------------------------
  describe('AC7: last-updated timestamp', () => {
    it('displays a .last-updated element containing "Last updated" after successful load', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(loadedDashboard));
      fixture.detectChanges();

      const el: HTMLElement | null = fixture.nativeElement.querySelector('.last-updated');
      expect(el).toBeTruthy();
      expect(el?.textContent).toContain('SHOPMGMT.DISPATCH_BOARD.LAST_UPDATED');
    });

    it('does not show .last-updated before the first successful load completes', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(new Subject());
      fixture.detectChanges();

      const el = fixture.nativeElement.querySelector('.last-updated');
      expect(el).toBeFalsy();
    });
  });

  // -------------------------------------------------------------------------
  // AC8: Degraded data banner when dataQualityWarning is true
  // -------------------------------------------------------------------------
  describe('AC8: data quality warning banner', () => {
    it('shows .data-quality-warning banner when dataQualityWarning is true', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        of({ ...loadedDashboard, dataQualityWarning: true }),
      );
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('.data-quality-warning');
      expect(banner).toBeTruthy();
    });

    it('does not show .data-quality-warning banner when dataQualityWarning is false', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        of({ ...loadedDashboard, dataQualityWarning: false }),
      );
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('.data-quality-warning');
      expect(banner).toBeFalsy();
    });
  });

  // -------------------------------------------------------------------------
  // AC9: 30-second auto-refresh polling
  // -------------------------------------------------------------------------
  describe('AC9: 30-second auto-refresh polling', () => {
    it('calls getDashboard again after 30 seconds have elapsed', fakeAsync(() => {
      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(emptyDashboard));
      fixture.detectChanges();

      const callsAfterInit = (dispatchBoardServiceStub.getDashboard as ReturnType<typeof vi.fn>)
        .mock.calls.length;

      tick(30_000);
      fixture.detectChanges();

      expect(
        (dispatchBoardServiceStub.getDashboard as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThan(callsAfterInit);
    }));

    it('does NOT poll again before 30 seconds have elapsed', fakeAsync(() => {
      dispatchBoardServiceStub.getDashboard.mockReturnValue(of(emptyDashboard));
      fixture.detectChanges();

      const callsAfterInit = (dispatchBoardServiceStub.getDashboard as ReturnType<typeof vi.fn>)
        .mock.calls.length;

      tick(15_000);
      fixture.detectChanges();

      expect(
        (dispatchBoardServiceStub.getDashboard as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBe(callsAfterInit);
    }));
  });

  // -------------------------------------------------------------------------
  // AC10: After error following a prior success — cached data + stale banner
  // -------------------------------------------------------------------------
  describe('AC10: stale data banner after error following prior success', () => {
    it('keeps workorder rows visible when a refresh fails after prior successful load', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(loadedDashboard));
      fixture.detectChanges();

      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Refresh failed' } })),
      );
      component.refresh();
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('.workorder-row');
      expect(rows.length).toBe(2);
    });

    it('shows .stale-data-banner after a refresh error when prior data exists', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(loadedDashboard));
      fixture.detectChanges();

      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Refresh failed' } })),
      );
      component.refresh();
      fixture.detectChanges();

      const staleBanner = fixture.nativeElement.querySelector('.stale-data-banner');
      expect(staleBanner).toBeTruthy();
    });

    it('does NOT show .stale-data-banner on the initial successful load', () => {
      dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(of(loadedDashboard));
      fixture.detectChanges();

      const staleBanner = fixture.nativeElement.querySelector('.stale-data-banner');
      expect(staleBanner).toBeFalsy();
    });
  });
});
