import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subscription, catchError, forkJoin, interval, map, of, switchMap } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import {
  BayCard,
  BayStatus,
  BoardState,
  BoardStats,
  DashboardResponse,
  FreeHoursReason,
  MechanicAvailability,
  MechanicCard,
  MechanicStatus,
  PositionKind,
  RowLane,
  RowStatusTone,
  UndoStep,
  WorkorderRow,
  WorkorderSummary,
} from '../../models/dispatch-board.models';
import { isoDateLocal } from '../../models/capacity-calendar.models';
import {
  BayInventory,
  BayInventoryEntry,
  ClockRead,
  ClockState,
  ClockStates,
  DispatchBoardService,
  TechnicianShifts,
  TechnicianSkills,
} from '../../services/dispatch-board.service';
import { LocationPickerComponent } from '../../../location/components/location-picker/location-picker.component';
import { AuthService } from '../../../../core/services/auth.service';
import { SHOPMGMT_PAGE, WORKEXEC_PAGE } from '../../../../core/security/route-permissions';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';

type StatusFilter = 'ALL' | 'OPEN' | 'DRAFT';

/** Only `HOURS` sorts on a field the board actually receives; see `SORT_UNAVAILABLE`. */
type SortKey = 'HOURS' | 'DUE' | 'PRIORITY';

/** What the user is dragging, or what a picker is about to place. */
type SlotKind = 'MECHANIC' | 'BAY';

/** The four pos-people timekeeping writes this board can make. */
type TimekeepingAction = 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END';

/**
 * Where a mechanic drag started. The break bin and the roster are each other's
 * drop target, so the origin is what tells a drop which way the mechanic is
 * moving — and keeps a mechanic dragged out of the bin from landing on a
 * workorder, which would dispatch someone who is on a break.
 */
type DragOrigin = 'ROSTER' | 'BREAK';

interface DragPayload {
  readonly kind: SlotKind;
  readonly id: string;
  readonly from: DragOrigin;
}

interface PickerRequest {
  readonly kind: SlotKind;
  readonly workorderId: string;
}

interface ToastMessage {
  /** Unique per write, so a late readback cannot adopt a newer toast. */
  readonly id: string;
  readonly key: string;
  readonly params: Record<string, string>;
  readonly tone: 'INFO' | 'ERROR';
  readonly undo: UndoStep | null;
}

const POLL_INTERVAL_MS = 30_000;

const DRAFT_STATUS = 'DRAFT';
const CLOSED_STATUSES: readonly string[] = ['COMPLETED', 'CANCELLED'];

/**
 * Technician assign and reassign are allowed on APPROVED, ASSIGNED and
 * WORK_IN_PROGRESS only; every other status answers 400. The workexec API
 * reference states the window for both `assignTechnician` and
 * `reassignTechnician`, so AWAITING_PARTS and AWAITING_APPROVAL are outside it.
 * Bay placement is wider and keeps its own rule: any open workorder, DRAFT too.
 */
const TECHNICIAN_ASSIGNABLE_STATUSES: readonly string[] = ['APPROVED', 'ASSIGNED', 'WORK_IN_PROGRESS'];

/** The statuses `WORKEXEC.WIP_STATUS` ships a translated label for. */
const TRANSLATED_STATUSES: readonly string[] = [
  DRAFT_STATUS,
  'APPROVED',
  'ASSIGNED',
  'WORK_IN_PROGRESS',
  'AWAITING_PARTS',
  'AWAITING_APPROVAL',
  'READY_FOR_PICKUP',
  ...CLOSED_STATUSES,
];

function isClosedStatus(status: string | undefined): boolean {
  return CLOSED_STATUSES.includes(status ?? '');
}

/**
 * `YYYY-MM-DD` through `new Date()` parses as UTC midnight, so the Angular date
 * pipe renders the previous day for every UTC-N user. ADR-0038 requires the
 * three-argument local constructor instead.
 */
function parseDateOnlyLocal(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

/** Sort options the design offers that no field on the response can order by. */
const SORT_UNAVAILABLE: readonly SortKey[] = ['DUE', 'PRIORITY'];

@Component({
  selector: 'app-dispatch-board-page',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, LocationPickerComponent, ModalDialogDirective],
  templateUrl: './dispatch-board-page.component.html',
  styleUrl: './dispatch-board-page.component.css',
})
export class DispatchBoardPageComponent implements OnInit {
  private readonly dispatchBoardService = inject(DispatchBoardService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private pollingStarted = false;

  /** The 30s poll, held so a 403 can end it; the next successful `load` starts it again. */
  private pollingSub: Subscription | null = null;

  /**
   * The board's own calendar day. `toISOString()` is the UTC date, which from
   * 17:00 Pacific onward is already tomorrow — an evening dispatcher would open
   * the wrong day's board.
   */
  /**
   * The local calendar day, re-read on every poll. Fixed at construction it
   * goes stale the moment a board left open crosses local midnight, and every
   * timekeeping gate downstream of `isViewingToday` would still be writing
   * against what is now yesterday's board.
   */
  readonly todayIso = signal(isoDateLocal(new Date()));
  readonly selectedDate = signal(this.todayIso());
  readonly selectedLocationId = signal('');

  // --- page state machine (ADR-0031): `state` always moves before `errorKey` ---
  readonly state = signal<BoardState>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly dashboard = signal<DashboardResponse | null>(null);
  readonly bayInventory = signal<BayInventory>(new Map());
  readonly technicianSkills = signal<TechnicianSkills>(new Map());

  /** Which (location, date) the enrichment maps above describe, so a switch drops them. */
  private enrichedKey: string | null = null;

  /** Orders enrichment responses: two reads of the same shop can still overlap. */
  private enrichmentSeq = 0;

  /**
   * Orders writes to `clockStates`, which has two writers — the enrichment
   * forkJoin and the lighter re-read a clock write triggers. Bumping
   * `enrichmentSeq` from the clock path instead would make a clock write
   * cancel an enrichment already in flight, discarding its bays and roster
   * with nothing sent to replace them; the board would sit on empty skill and
   * shift maps until the next poll. They are separate counters because they
   * guard separate data, and both bump this one so the later read wins.
   */
  private clockSeq = 0;

  /** Which (location, date) the cached board answers; see `hasCachedData`. */
  private readonly cachedKey = signal<string | null>(null);

  readonly isStale = signal(false);
  readonly dataQualityWarning = signal(false);
  readonly lastRefreshed = signal<Date | null>(null);

  // --- board interaction ---
  readonly query = signal('');
  readonly statusFilter = signal<StatusFilter>('ALL');
  readonly sortKey = signal<SortKey>('HOURS');
  readonly dragging = signal<DragPayload | null>(null);
  readonly picker = signal<PickerRequest | null>(null);
  readonly toast = signal<ToastMessage | null>(null);
  readonly pendingWorkorderIds = signal<ReadonlySet<string>>(new Set());

  /** One clock write per mechanic at a time, the way `pendingWorkorderIds` guards a row. */
  readonly pendingClockPersonIds = signal<ReadonlySet<string>>(new Set());

  /**
   * Clock state per person, as the availability read answers it. A person the
   * map omits is one the caller may not see — pos-people nulls `clockState`
   * rather than refusing the read — and their card offers both actions.
   *
   * Only readable together with `clockRead`: while that is not `OK` this map
   * is empty for a reason that has nothing to do with anyone's permissions.
   */
  readonly clockStates = signal<ClockStates>(new Map());

  /**
   * Whether the clock read behind that map answered, for the same reason
   * `rosterRead` exists: an empty map is equally "the caller may see nobody's
   * clock" and "the read failed", and the second must not be reported as the
   * first. `PENDING` covers the stretch before the first read lands — which is
   * every board load, because the enrichment starts only once the dashboard
   * has rendered.
   *
   * `NOT_TODAY` is a third thing again: the board deliberately does not ask.
   * `clockState` is a fact about now and not about the selected date, so on any
   * other day the board holds none and says so.
   */
  private readonly clockRead = signal<'PENDING' | 'OK' | 'FAILED' | 'NOT_TODAY'>('PENDING');

  /** Each technician's shift window, behind the free-hours figure. */
  readonly technicianShifts = signal<TechnicianShifts>(new Map());

  /**
   * Whether the roster read behind those windows answered. A failed read
   * degrades to empty maps, which on its own is indistinguishable from a shop
   * whose roster is genuinely empty — and would tell the dispatcher every
   * mechanic is "not on the location roster" during an outage. `PENDING` is
   * the same reticence before the first read lands.
   */
  private readonly rosterRead = signal<'PENDING' | 'OK' | 'FAILED'>('PENDING');

  /**
   * Monotonic read counter. `refresh()`, the 30s poll and the post-mutation
   * reload are independent subscriptions, so without this an older response
   * that lands late overwrites a newer board.
   */
  private readSeq = 0;

  /** Distinguishes two toasts that share a translation key; see `run()`. */
  private toastSeq = 0;

  /**
   * Cleanup owed by in-flight writes — releasing the row guard and arming its
   * undo — drained by whichever read is the current one when it completes.
   *
   * Tying this to the originating read alone strands it: a refresh, poll or
   * second write that supersedes the mutation readback means the old response
   * is rejected, and the row would stay guarded forever with no way back short
   * of reloading the page. Handing the debt to the next read that lands keeps
   * the stale-state protection without the lockout.
   */
  private readonly owedSettlements = new Set<() => void>();

  /**
   * The same debt, for clock writes: releasing a mechanic's pending guard,
   * owed to whichever clock read is current when it completes.
   *
   * A clock write's own readback can be superseded — by the poll's enrichment,
   * or by a second mechanic's write — and a superseded response must not paint
   * the board. Releasing the guard from it anyway would re-enable the card over
   * the state the write just replaced, and the dispatcher would be invited to
   * send the action that has already succeeded. Parking the debt keeps the card
   * guarded until a read that actually applies pays it.
   *
   * Every reader that bumps `clockSeq` must drain this on every branch it can
   * take while it is still current, or a card stays disabled for good — there
   * is no other caller of `markClockPending(id, false)`.
   */
  private readonly owedClockSettlements = new Set<() => void>();

  readonly sortUnavailable = SORT_UNAVAILABLE;

  /**
   * The route is gated on `workorder:dashboard:view`, which is a read. Placing a
   * technician and placing a bay are separately permissioned, so a read-only
   * dispatcher would otherwise get enabled controls and a guaranteed 403.
   *
   * A token with no `perm_bits` claim leaves permissions unknown; those stay
   * open, the way `AuthService.canAccess()` treats them.
   */
  readonly canAssignMechanic = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(WORKEXEC_PAGE.workorderAssign),
  );

  /**
   * The bay writes are workexec's position endpoints, whose authority is
   * `workorder:position:assign` (durion-positivity-backend#2059) — not
   * `shop:bay:assign`, which is the appointment page's authority in
   * pos-shop-manager and buys nothing here, and no longer the manager
   * operational-context override, which those endpoints stopped accepting.
   */
  readonly canAssignBay = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(WORKEXEC_PAGE.positionAssign),
  );

  /**
   * Clocking in and out is a pos-people write on a separate authority from
   * anything else on this board, so a dispatcher who can place work is not
   * thereby a timekeeper.
   *
   * pos-people admits the person themself *or* a `people:timekeeping:approve`
   * holder. This board is a dispatcher's tool, clocking other people, so it
   * asks for the grant; a mechanic clocking themselves does it from their own
   * self-service view, not from here.
   */
  readonly canManageClock = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(SHOPMGMT_PAGE.mechanicClock),
  );

  /**
   * Clocking in happens *now*; the board's date picker chooses which day to
   * look at. Offering the control over last Tuesday's roster would write a
   * session stamped today against a day the dispatcher is only reading, so the
   * clock is offered on today's board alone.
   */
  readonly isViewingToday = computed(() => this.selectedDate() === this.todayIso());

  // --- derived reads kept for the existing contract ---
  readonly loading = computed(() => this.state() === 'loading');

  /**
   * A manual refresh moves the machine to 'loading', but blanking a board the
   * dispatcher is reading — mid-glance, mid-decision — to redraw the same rows
   * a moment later is a worse answer than a quiet busy mark. The poll already
   * refuses to do it; a refresh over cached data for the same selection does
   * not either.
   */
  readonly showBoard = computed(() => this.hasCachedData() && (this.state() === 'ready' || this.loading()));
  readonly error = computed(() => this.errorKey());
  readonly workorders = computed<WorkorderSummary[]>(() => this.dashboard()?.workorders ?? []);
  readonly canRefresh = computed(() => this.selectedLocationId().trim().length > 0);

  /** The (location, date) the controls currently ask for. */
  private readonly requestKey = computed(() => this.toRequestKey(this.selectedLocationId().trim(), this.selectedDate()));

  /**
   * Cached data for **this** selection. A board loaded for another shop or
   * another day is not a fallback: left interactive behind a failed read it
   * shows one location while the controls show another, and a drop then mutates
   * workorders the dispatcher is not looking at.
   */
  readonly hasCachedData = computed(() => this.dashboard() !== null && this.cachedKey() === this.requestKey());

  /**
   * Bay name by id, so a row and a mechanic chip can both name where a
   * workorder stands without re-walking the bay array. Every bay the inventory
   * or the projection knows is named here, out-of-service ones included: an
   * open workorder can still stand on a bay that has since gone out of
   * service, and its slot should say which. Only real names: a bay whose name
   * has not replicated stays out, so the placeholder renders instead of a UUID
   * leaking into a label. The projection's name wins when both carry one, as
   * it does on the rail card.
   */
  private readonly bayNamesById = computed(() => {
    const names = new Map<string, string>();
    for (const entry of this.bayInventory().values()) {
      if (entry.name) {
        names.set(entry.bayId, entry.name);
      }
    }
    for (const bay of this.dashboard()?.bays ?? []) {
      const name = bay.bayName?.trim();
      if (name) {
        names.set(bay.bayId, name);
      }
    }
    return names;
  });

  /**
   * Bay id by the workorder that bay claims. Occupancy and the workorder's own
   * `resourceType`/`assignedResourceId` are independent projections, so the bay
   * side can carry a placement the workorder side has not caught up with.
   */
  private readonly bayClaimsByWorkorder = computed(() => {
    const byWorkorder = new Map<string, string>();
    for (const bay of this.dashboard()?.bays ?? []) {
      if (bay.assignedWorkorderId && !byWorkorder.has(bay.assignedWorkorderId)) {
        byWorkorder.set(bay.assignedWorkorderId, bay.bayId);
      }
    }
    return byWorkorder;
  });

  private readonly workordersById = computed(() => {
    const byId = new Map<string, WorkorderSummary>();
    for (const workorder of this.dashboard()?.workorders ?? []) {
      byId.set(workorder.workorderId, workorder);
    }
    return byId;
  });

  private readonly mechanicsById = computed(() => {
    const byId = new Map<string, MechanicStatus>();
    for (const mechanic of this.dashboard()?.mechanics ?? []) {
      byId.set(mechanic.personId, mechanic);
    }
    return byId;
  });

  /** Every row on the board, before the search box and status segment narrow it. */
  readonly allRows = computed<WorkorderRow[]>(() =>
    (this.dashboard()?.workorders ?? []).map(workorder => this.toRow(workorder)),
  );

  readonly rows = computed<WorkorderRow[]>(() => {
    const needle = this.query().trim().toLowerCase();
    const status = this.statusFilter();

    return this.allRows().filter(row => {
      if (status === 'DRAFT' && row.status !== DRAFT_STATUS) {
        return false;
      }
      if (status === 'OPEN' && !this.isOpenStatus(row.status)) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const haystack = [row.number, row.job, row.vehicle, row.customer, row.status]
        .filter((part): part is string => Boolean(part))
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  });

  readonly toAssignRows = computed(() => this.sorted(this.rows().filter(row => row.lane === 'TO_ASSIGN')));
  readonly heldRows = computed(() => this.sorted(this.rows().filter(row => row.lane === 'HELD')));
  readonly assignedRows = computed(() => this.sorted(this.rows().filter(row => row.lane === 'ASSIGNED')));

  readonly mechanics = computed<MechanicCard[]>(() =>
    (this.dashboard()?.mechanics ?? [])
      .map(mechanic => this.toMechanicCard(mechanic))
      .filter(card => card.availability !== 'BREAK' && card.availability !== 'OFF'),
  );

  /**
   * On break or off duty. Both are settable from here: the chip carries `End
   * break` or `In`, and the drag out of the bin does the same — except for a
   * mechanic on approved time off, whose record is HR's and is offered nothing.
   */
  readonly offDutyMechanics = computed<MechanicCard[]>(() =>
    (this.dashboard()?.mechanics ?? [])
      .map(mechanic => this.toMechanicCard(mechanic))
      .filter(card => card.availability === 'BREAK' || card.availability === 'OFF'),
  );

  /**
   * The rail's bays: the location inventory merged with dispatch occupancy.
   * The inventory is the roster of record — a bay the dispatch replica has not
   * received would otherwise vanish from the rail and be unassignable — and a
   * bay only the dispatch projection knows is still carried, so live work never
   * goes invisible. An inventory bay that is OUT_OF_SERVICE is left off the
   * rail whatever the projection says of it: it is not capacity to drag or
   * pick. Its name is still known to `bayNamesById`, so a row still standing on
   * it says where it is.
   */
  readonly allBays = computed<BayCard[]>(() => {
    const statuses = new Map<string, BayStatus>((this.dashboard()?.bays ?? []).map(bay => [bay.bayId, bay]));
    const inventory = this.bayInventory();
    const bayIds = [
      ...[...inventory.values()].filter(entry => !entry.outOfService).map(entry => entry.bayId),
      ...[...statuses.keys()].filter(bayId => !inventory.has(bayId)),
    ];
    return bayIds.map(bayId => this.toBayCard(bayId, statuses.get(bayId), inventory.get(bayId)));
  });

  readonly openBays = computed(() => this.allBays().filter(bay => bay.free));

  readonly stats = computed<BoardStats>(() => {
    const rows = this.allRows();
    const toAssign = rows.filter(row => row.lane === 'TO_ASSIGN');
    const hours = toAssign.reduce((sum, row) => sum + (row.estimatedHours ?? 0), 0);
    const hasHours = toAssign.some(row => row.estimatedHours !== null);
    const bays = this.allBays();

    return {
      toAssign: toAssign.length,
      toAssignHours: hasHours ? Math.round(hours * 10) / 10 : null,
      openCapacityHours: null,
      onDuty: this.mechanics().length,
      out: this.offDutyMechanics().length,
      baysOpen: bays.filter(bay => bay.free).length,
      baysTotal: bays.length,
      parked: rows.filter(row => row.lane === 'HELD').length,
      dueSoon: null,
    };
  });

  /**
   * Mechanics a picker offers, credentialled ones first, then by name.
   *
   * A failed roster read empties every credential list at once, so this falls
   * back to alphabetical on its own — there is nothing to guard, because no
   * mechanic can out-rank another on credentials nobody has. What the outage
   * does still change is what the card SAYS about them, which `skillsUnavailable`
   * answers: "could not be read" rather than "none on file".
   */
  readonly pickerMechanics = computed<MechanicCard[]>(() =>
    [...this.mechanics()].sort(
      (left, right) =>
        right.skillCodes.length - left.skillCodes.length || (left.name ?? '').localeCompare(right.name ?? ''),
    ),
  );

  /**
   * Whether the absence of skill chips is a fact about the technician or about
   * the read behind them — the same distinction `freeHoursReason` draws, on the
   * other half of what that one read answers.
   */
  skillsUnavailable(): boolean {
    return this.rosterRead() !== 'OK';
  }

  readonly pickerRow = computed<WorkorderRow | null>(() => {
    const request = this.picker();
    // The dialog renders outside the keyed board region, so without this it
    // survives a location or date change and its options would write to a
    // workorder from the shop the dispatcher just left.
    if (!request || !this.hasCachedData()) {
      return null;
    }
    return this.allRows().find(row => row.workorderId === request.workorderId) ?? null;
  });

  constructor() {
    /**
     * Location and date are the board's query, so the read follows them. Loaded
     * from ngOnInit and a manual refresh alone, the controls and the data could
     * disagree until the 30s poll swapped the board underneath a drag or an
     * open picker.
     */
    effect(onCleanup => {
      const locationId = this.selectedLocationId().trim();
      const date = this.selectedDate();
      if (!locationId) {
        // Nothing to ask for yet. `loadCurrentLocation` and `refresh` own the
        // location-required state; announcing it here would fire it during
        // bootstrap, before the primary location has had a chance to resolve.
        // A cleared picker still has to leave the machine somewhere it can
        // move from: the cleanup above cancelled any read in flight, so
        // 'loading' would never resolve, and the freshness banners describe a
        // board that is no longer shown.
        untracked(() => {
          this.isStale.set(false);
          this.dataQualityWarning.set(false);
          this.lastRefreshed.set(null);
          if (this.state() === 'loading') {
            this.state.set('idle');
          }
        });
        return;
      }

      // The read's own callbacks write and read board signals; untracked keeps
      // those out of this effect's dependencies so a response cannot re-trigger
      // the load that produced it.
      const sub = untracked(() => this.load(locationId, date));
      onCleanup(() => sub.unsubscribe());
    });
  }

  ngOnInit(): void {
    this.loadCurrentLocation();
  }

  refresh(): void {
    const locationId = this.selectedLocationId().trim();
    if (!locationId) {
      this.state.set('error');
      this.errorKey.set('SHOPMGMT.DISPATCH_BOARD.ERROR_LOCATION_REQUIRED');
      return;
    }

    this.load(locationId, this.selectedDate());
  }

  /**
   * One read of the board. The effect, the retry button and the first load all
   * come through here, so the sequence guard, the enrichment fetch and the poll
   * hand-off live in one place.
   */
  private load(locationId: string, date: string): Subscription {
    this.state.set('loading');
    this.errorKey.set(null);

    const seq = ++this.readSeq;
    const key = this.toRequestKey(locationId, date);
    this.clearFreshnessForNewSelection(key);
    return this.dispatchBoardService
      .getDashboard(locationId, date)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          if (!this.applySuccess(response, seq, key)) {
            return;
          }
          this.finishRead(seq);
          this.loadEnrichment(locationId, date);
          if (!this.pollingStarted) {
            this.startPolling();
          }
        },
        error: (err: unknown) => {
          this.applyError(err, seq);
          this.finishRead(seq);
        },
      });
  }

  private toRequestKey(locationId: string, date: string): string {
    return `${locationId}|${date}`;
  }

  onLocationPicked(id: string): void {
    this.selectedLocationId.set(id);
    if (this.errorKey() === 'SHOPMGMT.DISPATCH_BOARD.ERROR_LOCATION_REQUIRED') {
      // State moves before the error clears, so no observer sees a cleared
      // error while the machine still reads 'error'.
      this.state.set(this.hasCachedData() ? 'ready' : 'idle');
      this.errorKey.set(null);
    }
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------
  setStatusFilter(status: StatusFilter): void {
    this.statusFilter.set(status);
  }

  setSort(key: SortKey): void {
    if (SORT_UNAVAILABLE.includes(key)) {
      return;
    }
    this.sortKey.set(key);
  }

  isSortAvailable(key: SortKey): boolean {
    return !SORT_UNAVAILABLE.includes(key);
  }

  // -------------------------------------------------------------------------
  // Drag and drop
  // -------------------------------------------------------------------------
  onDragStart(kind: SlotKind, id: string, event: DragEvent, from: DragOrigin = 'ROSTER'): void {
    this.dragging.set({ kind, id, from });
    event.dataTransfer?.setData('text/plain', `${kind}:${id}`);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove';
    }
  }

  onDragEnd(): void {
    this.dragging.set(null);
  }

  /** A row takes a drop only when the dragged thing can legally go on it. */
  canDrop(row: WorkorderRow): boolean {
    const payload = this.dragging();
    if (!payload) {
      return false;
    }
    if (payload.kind === 'BAY') {
      return this.canTakeBay(row);
    }
    // A mechanic dragged out of the break bin is going back on the clock, not
    // onto a job: the only place that drag may land is the roster.
    return payload.from === 'ROSTER' && this.canTakeMechanic(row);
  }

  /**
   * Technician writes need one of the three statuses the contract allows, so
   * the click path and the drag path both gate on the allow-list rather than on
   * "not draft, not closed" — READY_FOR_PICKUP is neither, and answers 400.
   */
  canTakeMechanic(row: WorkorderRow): boolean {
    return (
      this.canAssignMechanic() &&
      TECHNICIAN_ASSIGNABLE_STATUSES.includes(row.status) &&
      !this.isPending(row.workorderId)
    );
  }

  /**
   * Bay placement is the wider window — any open workorder, DRAFT too — but a
   * row must at least carry a status to be reasoned about (a missing one is
   * normalised to '' and is not "open"), and a workorder on a mobile unit is
   * dispatched elsewhere: this board writes bays only, and moving a truck job
   * off its unit is not a change it can show it is making.
   */
  canTakeBay(row: WorkorderRow): boolean {
    return (
      this.canAssignBay() &&
      row.status.length > 0 &&
      !row.closed &&
      !row.onMobileUnit &&
      !this.isPending(row.workorderId)
    );
  }

  /** Why the mechanic slot is inert, or null when it is usable. */
  mechanicBlockedKey(row: WorkorderRow): string | null {
    if (row.closed) {
      return 'SHOPMGMT.DISPATCH_BOARD.CLOSED_NO_CHANGE';
    }
    if (row.status === DRAFT_STATUS) {
      return 'SHOPMGMT.DISPATCH_BOARD.DRAFT_NO_MECHANIC';
    }
    if (!TECHNICIAN_ASSIGNABLE_STATUSES.includes(row.status)) {
      return 'SHOPMGMT.DISPATCH_BOARD.STATUS_NO_MECHANIC';
    }
    return null;
  }

  /** Why the bay slot is inert, or null when it is usable. */
  bayBlockedKey(row: WorkorderRow): string | null {
    if (row.closed) {
      return 'SHOPMGMT.DISPATCH_BOARD.CLOSED_NO_CHANGE';
    }
    if (row.status.length === 0) {
      return 'SHOPMGMT.DISPATCH_BOARD.STATUS_UNKNOWN_NO_CHANGE';
    }
    if (row.onMobileUnit) {
      return 'SHOPMGMT.DISPATCH_BOARD.MOBILE_UNIT_NO_CHANGE';
    }
    return null;
  }

  /**
   * The key for a status's translated label, or null for a value the locale
   * files do not carry — which renders the raw status rather than a key path.
   */
  statusLabelKey(status: string): string | null {
    return TRANSLATED_STATUSES.includes(status) ? `WORKEXEC.WIP_STATUS.${status}` : null;
  }

  isPending(workorderId: string): boolean {
    return this.pendingWorkorderIds().has(workorderId);
  }

  /**
   * Clearing is a write too — `releaseTechnician` and `releaseServicePosition`
   * carry the same authorities as their assign counterparts, so a view-only
   * session must not be offered the x either.
   */
  canClearMechanic(row: WorkorderRow): boolean {
    return this.canAssignMechanic() && !row.closed && !this.isPending(row.workorderId);
  }

  canClearBay(row: WorkorderRow): boolean {
    return this.canAssignBay() && !row.closed && !this.isPending(row.workorderId);
  }

  onDragOver(row: WorkorderRow, event: DragEvent): void {
    if (!this.canDrop(row)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDrop(row: WorkorderRow, event: DragEvent): void {
    const payload = this.dragging();
    if (!payload || !this.canDrop(row)) {
      return;
    }
    event.preventDefault();
    this.dragging.set(null);

    if (payload.kind === 'MECHANIC') {
      this.assignMechanic(row, payload.id);
    } else {
      this.assignBay(row, payload.id);
    }
  }

  // -------------------------------------------------------------------------
  // Picker (the click path onto the same two mutations)
  // -------------------------------------------------------------------------
  openPicker(kind: SlotKind, workorderId: string): void {
    this.picker.set({ kind, workorderId });
  }

  closePicker(): void {
    this.picker.set(null);
  }


  pick(id: string): void {
    const request = this.picker();
    const row = this.pickerRow();
    this.picker.set(null);
    if (!request || !row) {
      return;
    }

    // The dialog can outlive the row it was opened for: a poll or a readback
    // may have closed the workorder or moved it out of the assignable window
    // while it sat open. Re-check against the row as it stands now.
    if (request.kind === 'MECHANIC') {
      if (this.canTakeMechanic(row)) {
        this.assignMechanic(row, id);
      }
      return;
    }
    if (this.canTakeBay(row)) {
      this.assignBay(row, id);
    }
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  /**
   * `incumbentId` is who the workorder is known to hold, which decides assign
   * against reassign. It defaults to the row, and undo overrides it with what
   * its own mutation left behind — the re-read has not landed yet when the
   * dispatcher clicks Undo straight away, so the row is a stale answer.
   */
  assignMechanic(row: WorkorderRow, mechanicId: string, incumbentId: string | null = row.mechanicId): void {
    // A mechanic whose name has not replicated is still assignable; the
    // confirmation just cannot name them, which is better than naming a UUID.
    const mechanicName = this.displayName(this.mechanicsById().get(mechanicId));
    this.run(
      row.workorderId,
      () => this.dispatchBoardService.assignMechanic(row.workorderId, mechanicId, incumbentId),
      {
        key: mechanicName
          ? 'SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_ASSIGNED'
          : 'SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_ASSIGNED_UNNAMED',
        params: mechanicName ? { workorder: row.number, mechanic: mechanicName } : { workorder: row.number },
        tone: 'INFO',
        undo: {
          workorderId: row.workorderId,
          kind: 'MECHANIC',
          previousId: incumbentId,
          currentMechanicId: mechanicId,
          previousPosition: null,
          currentPosition: null,
          currentBayId: null,
        },
      },
    );
  }

  clearMechanic(row: WorkorderRow): void {
    if (!this.canClearMechanic(row)) {
      return;
    }
    const previous = row.mechanicId;
    this.run(row.workorderId, () => this.dispatchBoardService.releaseMechanic(row.workorderId), {
      key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_CLEARED',
      params: { workorder: row.number },
      tone: 'INFO',
      undo: {
        workorderId: row.workorderId,
        kind: 'MECHANIC',
        previousId: previous,
        currentMechanicId: null,
        previousPosition: null,
        currentPosition: null,
        currentBayId: null,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Timekeeping clock
  // -------------------------------------------------------------------------

  /**
   * Which placeholder message stands in for a missing free-hours figure. Each
   * reason gets its own wording: "the shop is closed today" and "this board
   * could not read the shop's hours" are different facts, and collapsing them
   * into one message would hide a data problem behind a normal day.
   */
  freeHoursReasonKey(mechanic: MechanicCard): string {
    switch (mechanic.freeHoursReason) {
      case 'CLOSED':
        return 'SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS_CLOSED';
      case 'OFF_ROSTER':
        return 'SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS_OFF_ROSTER';
      case 'UNKNOWN_COMMITMENT':
        return 'SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS_COMMITMENT';
      default:
        return 'SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_FREE_HOURS';
    }
  }

  /**
   * What the note under the bin says. The drag it describes is gated on the
   * board showing today, so on any other date the instruction would be telling
   * the dispatcher to do something the board will not accept.
   */
  binNoteKey(): string {
    // Not "breaks come from HR": an authorised caller changes them from right
    // here. What this caller lacks is the grant, and the note has to say so
    // rather than blaming a system that is not the blocker.
    if (!this.canManageClock()) {
      return 'SHOPMGMT.DISPATCH_BOARD.BREAK_NO_PERMISSION';
    }
    return this.isViewingToday()
      ? 'SHOPMGMT.DISPATCH_BOARD.BREAK_DRAG_HINT'
      : 'SHOPMGMT.DISPATCH_BOARD.BREAK_OTHER_DAY';
  }

  /**
   * What the bin chip says under the name. "Off duty" covers two different
   * facts now — someone who has not clocked in, and someone on approved time
   * off — and only the first is something the dispatcher can act on, so they
   * are worded apart rather than sharing one label.
   */
  binStatusKey(mechanic: MechanicCard): string {
    // Same precedence as `toAvailability`: approved time off outranks whatever
    // the clock says. Reading `clockState` first would label someone on PTO
    // "not clocked in" — true, and the wrong fact about why they are here, on
    // the one chip whose state this board is not allowed to change.
    if (mechanic.onTimeOff) {
      return 'SHOPMGMT.DISPATCH_BOARD.OFF_DUTY';
    }
    if (mechanic.availability === 'BREAK') {
      return mechanic.breakExpectedReturn
        ? 'SHOPMGMT.DISPATCH_BOARD.BREAK_UNTIL'
        : 'SHOPMGMT.DISPATCH_BOARD.ON_BREAK';
    }
    return mechanic.clockState === 'CLOCKED_OUT'
      ? 'SHOPMGMT.DISPATCH_BOARD.NOT_CLOCKED_IN'
      : 'SHOPMGMT.DISPATCH_BOARD.OFF_DUTY';
  }

  /** Whether a clock write on this mechanic is in flight. */
  isClockPending(personId: string): boolean {
    return this.pendingClockPersonIds().has(personId);
  }

  /** The permission, the date and the per-mechanic guard, in one answer. */
  /**
   * Whether the clock the board is holding is current enough to write against.
   *
   * Two questions are being kept apart here, and conflating them is what
   * produced three rounds of defects. **Where a card sits** is answered from
   * the last reading the board was given: dropping it on a failed re-read
   * bounces mechanics between the rails on the strength of a transient 503,
   * which is worse than showing a reading a few seconds old. **Whether a write
   * may be offered** is a stricter question — a stale reading is exactly how a
   * dispatcher gets invited to repeat an action that has already succeeded, so
   * that needs a reading the board can still vouch for.
   *
   * So the retained map keeps placing cards, and this gate stops them acting.
   */
  readonly clockIsActionable = computed(() => this.isViewingToday() && this.clockRead() === 'OK');

  canClock(mechanic: MechanicCard): boolean {
    return this.canManageClock() && this.clockIsActionable() && !this.isClockPending(mechanic.personId);
  }

  /**
   * Both actions are offered while the state is `UNKNOWN`, which is every card
   * on load: with nothing to read, hiding one of them would be picking a state
   * for the mechanic rather than reporting one. Once a write has told the board
   * where the mechanic stands, the control becomes an ordinary toggle and only
   * the opposing action remains.
   */
  showClockIn(mechanic: MechanicCard): boolean {
    return mechanic.clockState === 'UNKNOWN' || mechanic.clockState === 'CLOCKED_OUT';
  }

  showClockOut(mechanic: MechanicCard): boolean {
    return mechanic.clockState !== 'CLOCKED_OUT';
  }

  /**
   * Why the control reads the way it does, or null when it needs no excuse.
   * Being out of date outranks an unknown state: on another day's board the
   * clock is not offered at all, so what the state is does not arise.
   */
  clockHintKey(mechanic: MechanicCard): string | null {
    if (!this.isViewingToday()) {
      return 'SHOPMGMT.DISPATCH_BOARD.CLOCK_TODAY_ONLY';
    }
    // Checked before the state, not after: after a clock-out whose readback
    // then failed, the card still holds CLOCKED_IN — not `UNKNOWN` — and
    // without this it would offer "Out" again and explain nothing.
    if (this.clockRead() !== 'OK') {
      return 'SHOPMGMT.DISPATCH_BOARD.CLOCK_STATE_UNREAD';
    }
    if (mechanic.clockState !== 'UNKNOWN') {
      return null;
    }
    // The read answered and left this row out: pos-people nulls `clockState`
    // for a row the caller holds no `people:timekeeping:view` over.
    return 'SHOPMGMT.DISPATCH_BOARD.NOT_AVAILABLE_CLOCK_STATE';
  }

  /**
   * Whether the mechanic can be sent on a break: they must be on the clock,
   * because pos-people keys a break by the open session rather than the person.
   * A mechanic whose clock state the caller may not see (`UNKNOWN`) has no
   * session id either, so the break is not offered for them.
   */
  canStartBreak(mechanic: MechanicCard): boolean {
    return this.canClock(mechanic) && mechanic.clockState === 'CLOCKED_IN' && mechanic.workSessionId !== null;
  }

  /** Whether the mechanic's open break can be ended. */
  canEndBreak(mechanic: MechanicCard): boolean {
    return (
      this.canClock(mechanic) &&
      !mechanic.onTimeOff &&
      mechanic.clockState === 'ON_BREAK' &&
      mechanic.workSessionId !== null
    );
  }

  /**
   * Whether a mechanic sitting in the bin can be put back on the clock from
   * there. Clocking out now moves them into the bin, so the control that
   * reverses it has to move with them — the roster card they used to carry it
   * on is exactly the place they are no longer listed.
   */
  canClockInFromBin(mechanic: MechanicCard): boolean {
    return this.canClock(mechanic) && !mechanic.onTimeOff && mechanic.clockState === 'CLOCKED_OUT';
  }

  /** Whether the bin chip has any control on it, and so needs a grab handle. */
  canLeaveBin(mechanic: MechanicCard): boolean {
    return this.canEndBreak(mechanic) || this.canClockInFromBin(mechanic);
  }

  startBreak(mechanic: MechanicCard): void {
    if (!this.canStartBreak(mechanic)) {
      return;
    }
    this.runClockWrite(mechanic, 'BREAK_START');
  }

  endBreak(mechanic: MechanicCard): void {
    if (!this.canEndBreak(mechanic)) {
      return;
    }
    this.runClockWrite(mechanic, 'BREAK_END');
  }

  // --- the break bin as a drop target --------------------------------------

  /**
   * The bin accepts any mechanic dragged from the roster, including one it will
   * then refuse: a dead cursor says only "not here", while a drop that lands
   * and answers "clock in first" says what to do about it.
   */
  isBreakBinDropTarget(): boolean {
    const payload = this.dragging();
    return (
      payload?.kind === 'MECHANIC' &&
      payload.from === 'ROSTER' &&
      this.canManageClock() &&
      this.isViewingToday() &&
      // A write already in flight on this mechanic: `canStartBreak` would
      // refuse the drop for being pending and word it "clock them in first",
      // which is the wrong reason for someone who is already clocked in. The
      // handle stops being draggable too, but a drag begun before the write
      // started can still arrive here.
      !this.isClockPending(payload.id)
    );
  }

  onBreakBinDragOver(event: DragEvent): void {
    if (!this.isBreakBinDropTarget()) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onBreakBinDrop(event: DragEvent): void {
    const payload = this.dragging();
    if (!payload || !this.isBreakBinDropTarget()) {
      return;
    }
    event.preventDefault();
    this.dragging.set(null);

    const mechanic = this.mechanics().find(candidate => candidate.personId === payload.id);
    if (!mechanic) {
      return;
    }
    if (!this.canStartBreak(mechanic)) {
      this.refuseTimekeepingDrop(mechanic, 'BREAK_START');
      return;
    }
    this.startBreak(mechanic);
  }

  // --- the roster as a drop target for someone coming off a break ----------

  isRosterDropTarget(): boolean {
    const payload = this.dragging();
    return (
      payload?.kind === 'MECHANIC' &&
      payload.from === 'BREAK' &&
      this.canManageClock() &&
      this.isViewingToday() &&
      !this.isClockPending(payload.id)
    );
  }

  onRosterDragOver(event: DragEvent): void {
    if (!this.isRosterDropTarget()) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onRosterDrop(event: DragEvent): void {
    const payload = this.dragging();
    if (!payload || !this.isRosterDropTarget()) {
      return;
    }
    event.preventDefault();
    this.dragging.set(null);

    const mechanic = this.offDutyMechanics().find(candidate => candidate.personId === payload.id);
    if (!mechanic) {
      return;
    }
    // One gesture, two meanings, decided by the state they are in: a mechanic
    // on a break comes back from it, and one who is clocked out comes back on
    // the clock. Both are "back on duty", which is what the drag says.
    if (this.canEndBreak(mechanic)) {
      this.endBreak(mechanic);
      return;
    }
    if (this.canClockInFromBin(mechanic)) {
      this.clockIn(mechanic);
      return;
    }
    this.refuseTimekeepingDrop(mechanic, 'BACK_ON_DUTY');
  }

  /**
   * Say why a drop the board accepted cannot be carried out. The two cases are
   * distinct and neither is a server error: a mechanic who is not clocked in
   * has no session to hang a break on, and one in the bin for time off is not
   * on a break the board can end — that is HR's record, not a session.
   */
  private refuseTimekeepingDrop(mechanic: MechanicCard, action: 'BREAK_START' | 'BACK_ON_DUTY'): void {
    const named = mechanic.name !== null;
    const suffix = named ? '' : '_UNNAMED';
    // "Clock them in first" is a claim about the session. When the clock could
    // not be read, or the row was nulled for this caller, the board has no
    // session to make a claim about — the hidden state may well be CLOCKED_IN —
    // so it says what it actually knows instead.
    // Approved time off is checked first and outranks everything: it is an HR
    // record the board never owns, so it is the reason whatever the clock says
    // or fails to say.
    const key = mechanic.onTimeOff
      ? `SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_OFF_DUTY_NOT_CHANGEABLE${suffix}`
      : !this.clockIsActionable() || mechanic.clockState === 'UNKNOWN'
        ? `SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_CLOCK_UNREADABLE${suffix}`
        : action === 'BREAK_START'
          ? `SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_BREAK_NEEDS_CLOCK_IN${suffix}`
          : `SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_OFF_DUTY_NOT_CHANGEABLE${suffix}`;
    this.toast.set({
      id: `${mechanic.personId}:${++this.toastSeq}`,
      key,
      params: named ? { mechanic: mechanic.name as string } : {},
      tone: 'ERROR',
      undo: null,
    });
  }

  clockIn(mechanic: MechanicCard): void {
    if (!this.canClock(mechanic)) {
      return;
    }
    this.runClockWrite(mechanic, 'IN');
  }

  clockOut(mechanic: MechanicCard): void {
    if (!this.canClock(mechanic)) {
      return;
    }
    this.runClockWrite(mechanic, 'OUT');
  }

  /**
   * Unlike `run()`, this does not re-read the board afterwards. The dashboard
   * carries no clock state at all, so a readback would fetch the same
   * clock-less roster and confirm nothing; the clock is re-read on its own
   * instead, by `reloadClockStates`. Undo is not offered either: a work
   * session is an attendance record, and "clock back out" is a second real
   * event rather than a retraction of the first.
   */
  private runClockWrite(mechanic: MechanicCard, action: TimekeepingAction): void {
    const personId = mechanic.personId;
    if (this.isClockPending(personId)) {
      return;
    }
    const toastId = `${personId}:${++this.toastSeq}`;
    // A mechanic whose name has not replicated is still clockable; the
    // confirmation just cannot name them, which beats naming them with a UUID.
    const name = mechanic.name;
    const params: Record<string, string> = name ? { mechanic: name } : {};
    this.parkClockFocus(personId);
    this.markClockPending(personId, true);

    const call = this.toTimekeepingCall(mechanic, action);
    if (!call) {
      // Guarded by `canStartBreak` / `canEndBreak` before we get here; this is
      // the belt to their braces, and releasing the card matters more than the
      // unreachable branch being tidy.
      this.markClockPending(personId, false);
      return;
    }

    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.set({
          id: toastId,
          key: this.toClockSuccessKey(action, name !== null),
          params,
          tone: 'INFO',
          undo: null,
        });
        // Read the state back rather than predicting it, the way the placement
        // writes do. The guard is held across the re-read: released at the
        // write, the card would still show the pre-write state and a second
        // press would send the action that just succeeded.
        this.reloadClockStates(() => this.settleClockCard(personId));
      },
      error: (err: unknown) => {
        this.toast.set({
          id: toastId,
          key: this.toClockErrorKey(action, err, name !== null),
          params,
          tone: 'ERROR',
          undo: null,
        });
        // Re-read unless the failure tells us nothing was written.
        //
        // A 409 on start or a 404 on stop is the backend saying this board's
        // copy is stale — the session was opened or closed elsewhere — and the
        // endpoint is the authority. But a 504 or a dropped connection is an
        // UNKNOWN outcome, not a known no-write: pos-people may well have
        // committed the session before the response was lost. Releasing the
        // card against unchanged state would leave the dispatcher looking at a
        // board that contradicts what just happened, so the unknown cases
        // re-read too, and only a failure that cannot have written — a 403, an
        // unknown person, a rejected request — releases on the spot.
        if (this.isKnownNoWrite(err)) {
          // The mechanic has not moved, but focus still went: the pending guard
          // disables the button, and a disabled control cannot hold focus.
          this.settleClockCard(personId);
        } else {
          this.reloadClockStates(() => this.settleClockCard(personId));
        }
      },
    });
  }

  /**
   * Put keyboard focus back once a clock write has settled, whichever way.
   *
   * On success these controls remove their own card from the rail it is on:
   * clocking out moves the mechanic to the bin, ending a break moves them back
   * to the roster. Angular destroys the focused node and focus falls to
   * `<body>`, so the next Tab starts from the top of the document — past the
   * location picker, the date field and the filters. A dispatcher clocking in
   * eight mechanics would traverse the page eight times, and these are the
   * controls that exist to give the drag a keyboard equivalent in the first
   * place (WCAG 2.5.7), so losing focus in them defeats their purpose. On a
   * refused write the card stays where it is and the control is re-enabled,
   * with focus still parked on the mechanic's anchor.
   *
   * Reclaims focus in the two cases this board owns: it fell to `<body>` because
   * the re-read destroyed the card, or it is still on the anchor `parkClockFocus`
   * moved it to because the write was refused and the card never moved. If the
   * dispatcher has moved on and something else holds it, that is theirs to keep.
   */
  /**
   * Everything a clock card is owed once its readback has settled: the guard
   * released, and keyboard focus put back if the card moved rails.
   *
   * Both belong to the readback rather than to the write. The write's own
   * response changes nothing on screen — it is the re-read that moves the
   * mechanic — so focus scheduled from the write would be checked against a
   * render that still holds the focused button, find it alive, and stand down
   * before the button is ever destroyed.
   *
   * Focus is lost earlier than the move, and on every write: marking the card
   * pending disables the button, and a disabled control cannot hold focus. So
   * this runs even when the mechanic stays exactly where they are.
   */
  private settleClockCard(personId: string): void {
    this.markClockPending(personId, false);
    this.restoreClockFocus(personId);
  }

  /**
   * Moves keyboard focus off a clock control the pending guard is about to
   * disable, onto the mechanic's own card: the roster drag handle, or the bin
   * chip. Browsers disagree about a focused control that becomes disabled —
   * some keep it as `activeElement`, some drop focus to `<body>` — and neither
   * is acceptable for the round trip, so the board decides instead of the
   * browser. `restoreClockFocus` recognises the parked anchor and moves focus
   * on to the enabled control once the readback has settled.
   */
  private parkClockFocus(personId: string): void {
    const root = this.host.nativeElement as HTMLElement;
    const active = root.ownerDocument.activeElement;
    if (!(active instanceof HTMLElement) || active.dataset['clockFor'] !== personId) {
      return;
    }
    this.clockAnchorFor(personId)?.focus();
  }

  private clockAnchorFor(personId: string): HTMLElement | null {
    const root = this.host.nativeElement as HTMLElement;
    return (
      root.querySelector<HTMLElement>(`[data-drag-for="${personId}"]`) ??
      root.querySelector<HTMLElement>(`[data-card-for="${personId}"]`)
    );
  }

  private restoreClockFocus(personId: string): void {
    const root = this.host.nativeElement as HTMLElement;
    afterNextRender(
      () => {
        // Checked AFTER the render, not before it: focus was parked on the
        // mechanic's card when the write started, and the card is destroyed
        // when the re-read moves the mechanic to the other rail, which is the
        // render this callback runs behind. Focus still on that parked anchor
        // (the mechanic did not move) or fallen to <body> (they did) is this
        // board's to put back; anything else holding it by then is the
        // dispatcher having moved on, and is theirs to keep.
        const active = root.ownerDocument.activeElement;
        const parked =
          active instanceof HTMLElement &&
          (active.dataset['dragFor'] === personId || active.dataset['cardFor'] === personId);
        if (active && active !== root.ownerDocument.body && !parked) {
          return;
        }
        const moved = root.querySelector<HTMLElement>(`[data-clock-for="${personId}"]:not([disabled])`);
        // The mechanic may have no control at all now — on PTO, or a state the
        // caller may not see. The card itself is the next best anchor; the
        // drag handle carries the name, so the announcement still identifies
        // who focus landed on.
        const anchor = moved ?? this.clockAnchorFor(personId);
        anchor?.focus();
      },
      { injector: this.injector },
    );
  }

  private markClockPending(personId: string, pending: boolean): void {
    const next = new Set(this.pendingClockPersonIds());
    if (pending) {
      next.add(personId);
    } else {
      next.delete(personId);
    }
    this.pendingClockPersonIds.set(next);
  }

  /**
   * Re-read clock state alone, without disturbing the board.
   *
   * A clock write changes nothing the dashboard reports — not the assignment,
   * not the bay, not the lane — so the full `reloadBoard` would redraw every
   * row to pick up one field. `onSettled` runs whichever way the read goes: a
   * failed re-read must still release the card, or it stays guarded for good.
   */
  private reloadClockStates(onSettled?: () => void): void {
    const locationId = this.selectedLocationId().trim();
    if (!locationId) {
      onSettled?.();
      return;
    }
    // The clock is a fact about now, so off today's board there is nothing to
    // re-read and nothing that would change. Release immediately rather than
    // waiting on a read that is not going to happen.
    const date = this.selectedDate();
    if (date !== this.todayIso()) {
      onSettled?.();
      return;
    }
    const seq = ++this.clockSeq;
    // Owed to whichever read is current when it lands, not to this one: this
    // response may be superseded, and releasing the card from a response the
    // board refused to apply would re-enable it over pre-write state.
    if (onSettled) {
      this.owedClockSettlements.add(onSettled);
    }
    this.dispatchBoardService
      .getClockStates(locationId, date)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(read => {
        // A location or date switch while this was in flight must not paint the
        // new board with the old shop's clock state.
        if (
          seq !== this.clockSeq ||
          this.selectedLocationId().trim() !== locationId ||
          this.selectedDate() !== date
        ) {
          // Superseded — but only pass the debt on if there is in fact someone
          // to pass it to. Clearing the location, or switching to one whose
          // dashboard read fails, starts no replacement enrichment, and the
          // card would stay disabled with nothing left to release it.
          if (seq !== this.clockSeq) {
            return;
          }
          this.drainClockSettlements();
          return;
        }
        this.applyClockRead(read);
        this.drainClockSettlements();
      });
  }

  /**
   * Hold what the board has when a read fails.
   *
   * The failure answers an empty map, and writing that over good state would
   * empty the clock column for every mechanic at once — on the strength of one
   * transient 503, and off the back of a write on a single person. The board
   * keeps what it was last told and records that it is no longer current.
   */
  private applyClockRead(read: ClockRead): void {
    this.clockRead.set(read.ok ? 'OK' : 'FAILED');
    if (read.ok) {
      this.clockStates.set(read.states);
    }
  }

  /** Release every mechanic waiting on a clock read; see `owedClockSettlements`. */
  private drainClockSettlements(): void {
    if (this.owedClockSettlements.size === 0) {
      return;
    }
    const owed = [...this.owedClockSettlements];
    this.owedClockSettlements.clear();
    for (const settle of owed) {
      settle();
    }
  }

  /**
   * The SDK call for each action, or null when the board lacks what it needs.
   *
   * Clock in and out are keyed by PERSON — pos-people finds the open session
   * itself — while the break calls are keyed by the SESSION, so a break needs
   * a `workSessionId` the clock-state read supplied and a mechanic who is not
   * on the clock has none.
   */
  private toTimekeepingCall(mechanic: MechanicCard, action: TimekeepingAction): Observable<unknown> | null {
    switch (action) {
      case 'IN':
        return this.dispatchBoardService.clockIn(mechanic.personId);
      case 'OUT':
        return this.dispatchBoardService.clockOut(mechanic.personId);
      case 'BREAK_START':
        return mechanic.workSessionId ? this.dispatchBoardService.startBreak(mechanic.workSessionId) : null;
      case 'BREAK_END':
        return mechanic.workSessionId ? this.dispatchBoardService.stopBreak(mechanic.workSessionId) : null;
    }
  }

  private toClockSuccessKey(action: TimekeepingAction, named: boolean): string {
    const suffix = named ? '' : '_UNNAMED';
    switch (action) {
      case 'IN':
        return `SHOPMGMT.DISPATCH_BOARD.TOAST.CLOCKED_IN${suffix}`;
      case 'OUT':
        return `SHOPMGMT.DISPATCH_BOARD.TOAST.CLOCKED_OUT${suffix}`;
      case 'BREAK_START':
        return `SHOPMGMT.DISPATCH_BOARD.TOAST.BREAK_STARTED${suffix}`;
      case 'BREAK_END':
        return `SHOPMGMT.DISPATCH_BOARD.TOAST.BREAK_ENDED${suffix}`;
    }
  }

  /**
   * pos-people answers a double clock-in with a bare 409 INVALID_STATE and a
   * clock-out with nothing open with 404 WORK_SESSION_NOT_FOUND. INVALID_STATE
   * is the module's catch-all for `IllegalStateException`, so it is read
   * together with the action that provoked it rather than on its own.
   */
  private toClockErrorKey(action: TimekeepingAction, err: unknown, named: boolean): string {
    // Four of these name the mechanic. ngx-translate leaves an unresolved
    // `{{mechanic}}` in the string verbatim, so an unnamed mechanic would put
    // the raw token in front of the dispatcher — the same reason every other
    // consumer on this board carries an unnamed variant.
    const suffix = named ? '' : '_UNNAMED';
    if (err instanceof HttpErrorResponse && err.status === 403) {
      return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_CLOCK_FORBIDDEN';
    }
    const code = this.toApiErrorCode(err);
    if (code === 'PERSON_NOT_FOUND') {
      return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_CLOCK_PERSON_NOT_FOUND';
    }
    if (action === 'IN' && code === 'INVALID_STATE') {
      return `SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_ALREADY_CLOCKED_IN${suffix}`;
    }
    if (action === 'OUT' && code === 'WORK_SESSION_NOT_FOUND') {
      return `SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_NOT_CLOCKED_IN${suffix}`;
    }
    // Starting a break answers 404 when the session closed under us and 409
    // when a break is already open; ending one answers 409 for "no open
    // break", which is also its answer for a session id it does not know.
    if (action === 'BREAK_START' && code === 'INVALID_STATE') {
      return `SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_ALREADY_ON_BREAK${suffix}`;
    }
    if (action === 'BREAK_START' && code === 'WORK_SESSION_NOT_FOUND') {
      return `SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_NOT_CLOCKED_IN${suffix}`;
    }
    if (action === 'BREAK_END' && code === 'INVALID_STATE') {
      return `SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_NOT_ON_BREAK${suffix}`;
    }
    return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_CLOCK_GENERIC';
  }

  /**
   * Failures that cannot have changed anything, so the board's copy still holds.
   *
   * Stated as what is known NOT to have written rather than what is known to
   * have: the client can answer the first honestly and cannot answer the
   * second. A refused request never reached the session; a 5xx, a timeout or a
   * connection that died may have landed after the write committed, and is
   * treated as an unknown outcome — re-read, do not assume.
   */
  private isKnownNoWrite(err: unknown): boolean {
    if (!(err instanceof HttpErrorResponse)) {
      return false;
    }
    // 0 is a request that never got an answer — the outcome is unknown.
    if (err.status === 0) {
      return false;
    }
    return err.status === 400 || err.status === 401 || err.status === 403 || err.status === 422 ||
      this.toApiErrorCode(err) === 'PERSON_NOT_FOUND';
  }


  assignBay(row: WorkorderRow, bayId: string): void {
    // A bay whose name has not replicated is still placeable; its confirmation
    // just cannot name it, which is better than naming it with a UUID.
    const bayName = this.bayNamesById().get(bayId) ?? null;
    this.run(row.workorderId, () => this.dispatchBoardService.assignBay(row.workorderId, bayId), {
      key: bayName
        ? 'SHOPMGMT.DISPATCH_BOARD.TOAST.BAY_ASSIGNED'
        : 'SHOPMGMT.DISPATCH_BOARD.TOAST.BAY_ASSIGNED_UNNAMED',
      params: bayName ? { workorder: row.number, bay: bayName } : { workorder: row.number },
      tone: 'INFO',
      undo: this.toPositionUndo(row, 'BAY', bayId),
    });
  }

  clearBay(row: WorkorderRow): void {
    if (!this.canClearBay(row)) {
      return;
    }
    this.run(row.workorderId, () => this.dispatchBoardService.releaseBay(row.workorderId), {
      key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.BAY_CLEARED',
      params: { workorder: row.number },
      tone: 'INFO',
      undo: this.toPositionUndo(row, null, null),
    });
  }

  /** Put the workorder back in the site's parking lot, rather than nowhere. */
  private parkWorkorder(row: WorkorderRow): void {
    this.run(row.workorderId, () => this.dispatchBoardService.parkWorkorder(row.workorderId), {
      key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.WORKORDER_PARKED',
      params: { workorder: row.number },
      tone: 'INFO',
      undo: this.toPositionUndo(row, 'HOLD', null),
    });
  }

  /**
   * Where the row stands before a position write, and where the write puts it.
   * A parked workorder carries no bay id, so the kind has to be recorded too or
   * undo would release its HOLD instead of restoring it.
   */
  private toPositionUndo(
    row: WorkorderRow,
    currentPosition: PositionKind | null,
    currentBayId: string | null,
  ): UndoStep {
    let previousPosition: PositionKind | null = null;
    if (row.bayId) {
      previousPosition = 'BAY';
    } else if (row.parked) {
      previousPosition = 'HOLD';
    }

    return {
      workorderId: row.workorderId,
      kind: 'BAY',
      previousId: row.bayId,
      currentMechanicId: null,
      previousPosition,
      currentPosition,
      currentBayId,
    };
  }

  /**
   * Put back what the last mutation changed. Undoing onto nothing is a release;
   * undoing onto a previous holder is the assign call again, which the service
   * routes to reassign because the board now shows an incumbent.
   *
   * The step is only good against the world it was recorded in. Before anything
   * is written the row must still be on the current board — the toast outlives
   * a location or date change — must still show the outcome the write
   * produced, and must pass the same guard the assign or clear path applies,
   * permission re-check included. Otherwise the toast says the undo is gone and
   * nothing is sent: a stale undo would otherwise release or replace what
   * another dispatcher has since done to the row.
   */
  undo(): void {
    const message = this.toast();
    const step = message?.undo;
    if (!message || !step) {
      return;
    }

    const row = this.hasCachedData()
      ? this.allRows().find(candidate => candidate.workorderId === step.workorderId)
      : undefined;
    if (!row || !this.rowReflects(row, step) || !this.canUndo(row, step)) {
      this.toast.set({
        id: message.id,
        key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.UNDO_UNAVAILABLE',
        params: { workorder: message.params['workorder'] ?? '' },
        tone: 'ERROR',
        undo: null,
      });
      return;
    }
    this.toast.set(null);

    if (step.kind === 'MECHANIC') {
      if (step.previousId) {
        this.assignMechanic(row, step.previousId, step.currentMechanicId);
      } else {
        this.clearMechanic(row);
      }
      return;
    }

    if (step.previousPosition === 'HOLD') {
      this.parkWorkorder(row);
      return;
    }

    if (step.previousId) {
      this.assignBay(row, step.previousId);
    } else {
      this.clearBay(row);
    }
  }

  /** True while the row still shows the outcome the step's own write produced. */
  private rowReflects(row: WorkorderRow, step: UndoStep): boolean {
    if (step.kind === 'MECHANIC') {
      return row.mechanicId === step.currentMechanicId;
    }
    switch (step.currentPosition) {
      case 'BAY':
        return row.bayId === step.currentBayId;
      case 'HOLD':
        return row.parked;
      default:
        return row.bayId === null && !row.parked && !row.onMobileUnit;
    }
  }

  /** The guard the corresponding assign or clear path applies, re-run for the undo. */
  private canUndo(row: WorkorderRow, step: UndoStep): boolean {
    if (step.kind === 'MECHANIC') {
      return step.previousId ? this.canTakeMechanic(row) : this.canClearMechanic(row);
    }
    const restoresPosition = step.previousPosition === 'HOLD' || step.previousId !== null;
    return restoresPosition ? this.canTakeBay(row) : this.canClearBay(row);
  }

  dismissToast(): void {
    this.toast.set(null);
  }

  /**
   * Every mutation follows the same shape: mark the row busy, fire, then re-read
   * the board rather than predicting the new status — the backend decides whether
   * a workorder becomes ASSIGNED, and the contract says to read it back.
   */
  private run(workorderId: string, call: () => Observable<unknown>, success: Omit<ToastMessage, 'id'>): void {
    // Identity for the toast this write owns. Two rows assigned at once share a
    // translation key, so matching on the key alone lets an earlier readback
    // overwrite a newer toast — and hand it the wrong undo target.
    const toastId = `${workorderId}:${++this.toastSeq}`;
    // One write per workorder at a time. Without this, a second drop or click
    // while the first is in flight races it, and which assignment survives —
    // and what the undo step points at — is decided by response order.
    if (this.isPending(workorderId)) {
      return;
    }
    this.markPending(workorderId, true);

    call()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          // The guard is held across the readback, not released at the write:
          // the board deliberately does not predict the row, so between the two
          // the slot still shows pre-mutation state and a second write from it
          // would pick the wrong endpoint.
          // Undo is part of that guard: offering it while the row is still
          // pending means a quick click is swallowed by the re-entry check and
          // the toast is already gone. The message goes up without its undo,
          // and the undo is attached once the readback releases the guard.
          this.toast.set({ ...success, id: toastId, undo: null });
          this.reloadBoard(() => {
            this.markPending(workorderId, false);
            if (this.toast()?.id === toastId) {
              // Undo is offered only over a board that already shows this
              // write's outcome. The read that pays this settlement may be
              // another shop's, an error, none at all (a blank location), or a
              // readback the replica has not caught up with: an undo armed
              // there could only answer that it is unavailable, so none is
              // offered. `undo()` still re-checks the row at the click — a
              // poll between now and then can change it again.
              const step = success.undo;
              const row = this.hasCachedData()
                ? this.allRows().find(candidate => candidate.workorderId === workorderId)
                : undefined;
              const showsOutcome = step !== null && row !== undefined && this.rowReflects(row, step);
              this.toast.set({ ...success, id: toastId, undo: showsOutcome ? step : null });
            }
          });
        },
        error: (err: unknown) => {
          this.toast.set({
            id: toastId,
            key: this.toMutationErrorKey(err),
            params: { workorder: success.params['workorder'] ?? '' },
            tone: 'ERROR',
            undo: null,
          });
          // A 409 or 422 is the backend saying the board's copy is wrong — the
          // incumbent moved, the bay filled. Without a re-read the row keeps
          // showing what was contradicted and every retry repeats the same
          // wrong call. The guard is held until that re-read settles: released
          // at the refusal, the row is interactive over the contradicted copy
          // and a second click repeats the same wrong call before it lands.
          if (this.isRefusal(err)) {
            this.reloadBoard(() => this.markPending(workorderId, false));
          } else {
            this.markPending(workorderId, false);
          }
        },
      });
  }

  private markPending(workorderId: string, pending: boolean): void {
    const next = new Set(this.pendingWorkorderIds());
    if (pending) {
      next.add(workorderId);
    } else {
      next.delete(workorderId);
    }
    this.pendingWorkorderIds.set(next);
  }

  /**
   * Re-read after a mutation without dropping the board into its loading state.
   *
   * `onSettled` releases the write guard and arms undo, so it must fire only
   * while a current read completes. A refresh or poll that supersedes this one
   * would otherwise unlock the row and offer an undo computed from
   * pre-readback state while the newer read is still in flight; the debt is
   * parked in `owedSettlements` and paid by whichever read is current when it
   * lands. With no location to ask, there is no read and the debt is paid now.
   */
  private reloadBoard(onSettled?: () => void): void {
    const locationId = this.selectedLocationId().trim();
    if (!locationId) {
      onSettled?.();
      return;
    }

    const seq = ++this.readSeq;
    const date = this.selectedDate();
    const key = this.toRequestKey(locationId, date);
    if (onSettled) {
      this.owedSettlements.add(onSettled);
    }
    this.dispatchBoardService
      .getDashboard(locationId, date)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          // Enrichment rides an accepted readback as it rides an accepted poll:
          // this may be the first read of a shop switched to mid-write, and
          // `load` skipped its own enrichment when this read superseded it.
          if (this.applySuccess(response, seq, key)) {
            this.loadEnrichment(locationId, date);
          }
          this.finishRead(seq);
        },
        error: (err: unknown) => {
          this.applyError(err, seq);
          this.finishRead(seq);
        },
      });
  }

  /**
   * Called when any read completes. The current read pays every debt owed,
   * including those left by reads it superseded.
   */
  private finishRead(seq: number): void {
    if (seq !== this.readSeq || this.owedSettlements.size === 0) {
      return;
    }
    const owed = [...this.owedSettlements];
    this.owedSettlements.clear();
    for (const settle of owed) {
      settle();
    }
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  private startPolling(): void {
    this.pollingStarted = true;

    this.pollingSub = interval(POLL_INTERVAL_MS)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(() => {
          // Before anything reads it: the day may have turned since the last
          // tick. `selectedDate` is deliberately left alone — advancing the
          // board under the dispatcher is worse than showing them that the day
          // they are looking at is no longer today.
          this.todayIso.set(isoDateLocal(new Date()));
          const locationId = this.selectedLocationId().trim();
          // A cleared picker is not a location. Asking for '' either errors —
          // and the retry button then names a different problem — or answers a
          // board cached under the blank key the controls also read, so it
          // renders as current. Nothing is asked and no read is superseded.
          if (!locationId) {
            return EMPTY;
          }
          const seq = ++this.readSeq;
          const date = this.selectedDate();
          // The key belongs to the request, not to whatever the controls read
          // by the time the response lands.
          const key = this.toRequestKey(locationId, date);
          return this.dispatchBoardService.getDashboard(locationId, date).pipe(
            map(response => ({ response, seq, key })),
            catchError((err: unknown) => {
              this.applyError(err, seq);
              this.finishRead(seq);
              return EMPTY;
            }),
          );
        }),
      )
      .subscribe({
        next: ({ response, seq, key }) => {
          // Enrichment rides an accepted poll: bay lifecycle, names, types and
          // skill chips go stale otherwise, and an out-of-service bay stays
          // draggable until someone presses Refresh.
          if (this.applySuccess(response, seq, key)) {
            // The poll refreshes the clock too, so a session started or ended
            // elsewhere corrects itself within 30s.
            this.loadEnrichment(this.selectedLocationId().trim(), this.selectedDate());
          }
          this.finishRead(seq);
        },
      });
  }

  /**
   * A 403 ends the poll — repeating a read the caller is not allowed is noise —
   * and the next successful `load` starts it again, for a location that is.
   */
  private stopPolling(): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = null;
    this.pollingStarted = false;
  }

  /**
   * The bay inventory, the technician roster and the clock come from other
   * domains and load beside the board rather than gating it: all three answer
   * rather than error on failure, so the dispatch projection alone still
   * renders. Two of them say so — the roster and the clock each carry an `ok`
   * flag — because an empty answer and a failed one call for different words
   * on the card. The bay inventory does not yet; see its own note.
   */
  private loadEnrichment(locationId: string, date: string): void {
    // Drop the previous selection's maps as the new load STARTS, not when it
    // lands. The inventory is the bay rail's roster of record, so holding the
    // old one across the gap offers another site's bays as draggable on this
    // board — and placing one is a 422, the position being at another site.
    //
    // The shift window and the clock state are keyed on the DATE as well: a
    // window is resolved for one day, and the clock is a fact about now. Held
    // across a date change they would label the new day with the old one's
    // hours and a clock reading that was never about it.
    const key = this.toRequestKey(locationId, date);
    if (this.enrichedKey !== null && this.enrichedKey !== key) {
      // Everything the roster read answers is date-scoped, credentials
      // included: the roster is asked for one date and a technician it returns
      // for today need not be on it tomorrow. Only the bay inventory is keyed
      // on location alone, so only it survives a date change.
      this.technicianShifts.set(new Map());
      this.technicianSkills.set(new Map());
      this.clockStates.set(new Map());
      this.rosterRead.set('PENDING');
      this.clockRead.set('PENDING');
      if (this.enrichedKey.split('|')[0] !== locationId) {
        this.bayInventory.set(new Map());
      }
    }
    this.enrichedKey = key;
    const seq = ++this.enrichmentSeq;
    const clockSeq = ++this.clockSeq;

    // The clock is not date-scoped: pos-people derives `clockState` from the
    // person's OPEN work session, so the same live reading comes back whatever
    // date is asked for. Reading it for another day would label that day with
    // it — the crew showing as clocked out all through yesterday's board — so
    // off today the board does not ask, and the cards say the state is unknown
    // for that reason. This is the same argument the date-change reset above
    // makes; it just has to hold for the re-fetch as well.
    const isToday = date === this.todayIso();
    forkJoin({
      bays: this.dispatchBoardService.getBayInventory(locationId),
      roster: this.dispatchBoardService.getTechnicianRoster(locationId, date),
      clocks: isToday
        ? this.dispatchBoardService.getClockStates(locationId, date)
        : of<ClockRead>({ states: new Map(), ok: true }),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of(null)),
      )
      .subscribe(result => {
        // A selection switch while these were in flight must not let the old
        // shop's bay types and credentials paint the new board — and two reads
        // of the SAME selection can overlap, so an older one landing last would
        // put back the data the newer one just corrected.
        // Whether or not this enrichment is still the one to paint the board,
        // it may be the current CLOCK reader, and a mechanic's pending guard is
        // owed to whoever that is. Pay first, on every branch, or the card that
        // is waiting stays disabled with nothing left to release it.
        if (clockSeq === this.clockSeq) {
          if (!isToday) {
            this.clockRead.set('NOT_TODAY');
          } else if (result) {
            this.applyClockRead(result.clocks);
          } else {
            // Unreachable while every source carries its own `catchError`, but
            // the settlement below must not depend on that staying true.
            this.clockRead.set('FAILED');
          }
          this.drainClockSettlements();
        }
        if (!result || seq !== this.enrichmentSeq || this.toRequestKey(this.selectedLocationId().trim(), this.selectedDate()) !== key) {
          return;
        }
        this.bayInventory.set(result.bays);
        this.technicianSkills.set(result.roster.skills);
        this.technicianShifts.set(result.roster.shifts);
        this.rosterRead.set(result.roster.ok ? 'OK' : 'FAILED');
      });
  }

  private loadCurrentLocation(): void {
    this.dispatchBoardService
      .getPrimaryLocation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: location => {
          const locationId = String(location.locationId ?? '').trim();

          if (!locationId) {
            this.state.set('error');
            this.errorKey.set('SHOPMGMT.DISPATCH_BOARD.ERROR_LOCATION_REQUIRED');
            return;
          }

          // Setting the location is the read: the effect watches it.
          this.selectedLocationId.set(locationId);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('SHOPMGMT.DISPATCH_BOARD.ERROR_LOCATION_REQUIRED');
        },
      });
  }

  /**
   * Freshness describes a selection; carrying it across a switch misreports the
   * new one.
   */
  private clearFreshnessForNewSelection(key: string): void {
    if (this.cachedKey() !== null && this.cachedKey() !== key) {
      this.isStale.set(false);
      this.dataQualityWarning.set(false);
      this.lastRefreshed.set(null);
    }
  }

  /**
   * Returns false when a newer read has already superseded this one.
   *
   * `key` is the selection the response ANSWERS, captured when its request was
   * issued — never re-read here. Defaulting it to the live controls let a late
   * response be cached under a selection it does not describe, so the previous
   * shop's board read as current and its rows stayed assignable.
   */
  private applySuccess(response: DashboardResponse, seq: number, key: string): boolean {
    if (seq !== this.readSeq) {
      return false;
    }
    this.dashboard.set(response);
    this.cachedKey.set(key);
    this.lastRefreshed.set(new Date());
    this.dataQualityWarning.set(Boolean(response.dataQualityWarning));
    this.isStale.set(false);
    this.state.set('ready');
    this.errorKey.set(null);
    return true;
  }

  private applyError(err: unknown, seq: number): void {
    if (seq !== this.readSeq) {
      return;
    }
    // A 403 is an answer, not an outage: the caller's location scope does not
    // cover this shop (LOCATION_SCOPE_DENIED). Treating it as a failed refresh
    // would keep the old board interactive under a stale banner and poll it
    // every 30s for good; the story says stop polling and say so. A 401 is the
    // interceptor's concern (refresh, then logout) and is not classified here.
    if (err instanceof HttpErrorResponse && err.status === 403) {
      this.state.set('error');
      this.errorKey.set('SHOPMGMT.DISPATCH_BOARD.ERROR_FORBIDDEN');
      this.dashboard.set(null);
      this.cachedKey.set(null);
      // The board is gone, so the banners that described its freshness go too.
      this.isStale.set(false);
      this.dataQualityWarning.set(false);
      this.lastRefreshed.set(null);
      this.stopPolling();
      return;
    }
    if (this.hasCachedData()) {
      // A refresh that fails over good data for the same selection leaves the
      // board up and marks it stale.
      this.isStale.set(true);
      this.state.set('ready');
      return;
    }

    this.state.set('error');
    this.errorKey.set(this.toLoadErrorKey(err));
    // Anything cached answers a different location or date; keeping it would
    // leave the previous shop's board interactive under the new controls.
    this.dashboard.set(null);
    this.cachedKey.set(null);
  }

  // -------------------------------------------------------------------------
  // Projection
  // -------------------------------------------------------------------------
  private toRow(workorder: WorkorderSummary): WorkorderRow {
    const mechanic = workorder.assignedMechanicId
      ? this.mechanicsById().get(workorder.assignedMechanicId)
      : undefined;
    const bayId = this.toRowBayId(workorder);
    // A live bay claim outranks the summary's HOLD or MOBILE_UNIT, so neither
    // is the row's place while a bay names the workorder.
    const parked = bayId === null && workorder.resourceType === 'HOLD';
    const onMobileUnit = bayId === null && workorder.resourceType === 'MOBILE_UNIT';
    const name = mechanic ? this.displayName(mechanic) : null;

    return {
      workorderId: workorder.workorderId,
      number: workorder.workorderNumber ?? workorder.workorderId,
      status: workorder.status ?? '',
      statusTone: this.toStatusTone(workorder.status ?? ''),
      lane: this.toLane(workorder, parked),
      job: workorder.serviceDescriptions?.length ? workorder.serviceDescriptions.join(' · ') : null,
      vehicle: workorder.vehicleDescription ?? null,
      customer: workorder.customerName ?? null,
      estimatedHours: workorder.estimatedLaborHours ?? null,
      actualHours: workorder.actualLaborHours ?? null,
      serviceCount: workorder.serviceCount ?? null,
      completedServiceCount: workorder.completedServiceCount ?? null,
      scheduledDate: parseDateOnlyLocal(workorder.scheduledDate),
      mechanicId: workorder.assignedMechanicId ?? null,
      mechanicName: name,
      mechanicInitials: mechanic ? this.toInitials(mechanic.firstName, mechanic.lastName) : null,
      bayId,
      // Null, never the raw id: an unresolved replica renders as the
      // not-available placeholder rather than leaking a UUID at the user.
      bayName: bayId ? (this.bayNamesById().get(bayId) ?? null) : null,
      parked,
      onMobileUnit,
      closed: isClosedStatus(workorder.status),
      dueAt: null,
      priority: null,
      requiredSkills: null,
    };
  }

  /**
   * Where the row stands. A bay's own `BayStatus` row is the live operational
   * feed for that bay, so the workorder it names outranks the summary's own
   * `resourceType`/`assignedResourceId` — a HOLD or a MOBILE_UNIT included —
   * the precedence the shop dashboard's reconciliation applies. The two sides
   * are independent projections, and a row that shows an empty slot, a parked
   * lane or a mobile unit while the rail shows the bay occupied leaves a
   * placement nobody can clear.
   */
  private toRowBayId(workorder: WorkorderSummary): string | null {
    // A closed workorder's link is a freed position the projection has not
    // caught up with, never a live placement — including its own resource
    // fields, so this precedes both reads rather than following them.
    if (isClosedStatus(workorder.status)) {
      return null;
    }
    const claimedBayId = this.bayClaimsByWorkorder().get(workorder.workorderId);
    if (claimedBayId) {
      return claimedBayId;
    }
    if (workorder.resourceType === 'BAY') {
      return workorder.assignedResourceId ?? null;
    }
    return null;
  }

  /**
   * Which lane the row is dispatched from. A closed workorder is finished
   * work: one still holding a mechanic keeps its ASSIGNED placement, but one
   * with no mechanic — and, being closed, no live bay — has nothing left to
   * dispatch and is listed in no lane rather than under "to assign". It stays
   * in `workordersById`, so a bay still linked to it reads as free.
   */
  private toLane(workorder: WorkorderSummary, parked: boolean): RowLane | null {
    if (workorder.assignedMechanicId) {
      return 'ASSIGNED';
    }
    if (isClosedStatus(workorder.status)) {
      return null;
    }
    return parked ? 'HELD' : 'TO_ASSIGN';
  }

  private toStatusTone(status: string): RowStatusTone {
    switch (status) {
      case DRAFT_STATUS:
        return 'DRAFT';
      case 'WORK_IN_PROGRESS':
        return 'ACTIVE';
      case 'AWAITING_PARTS':
      case 'AWAITING_APPROVAL':
        return 'WAITING';
      case 'COMPLETED':
      case 'READY_FOR_PICKUP':
        return 'DONE';
      default:
        return 'NEUTRAL';
    }
  }

  private toMechanicCard(mechanic: MechanicStatus): MechanicCard {
    const workorder = mechanic.assignedWorkorderId
      ? (this.dashboard()?.workorders ?? []).find(candidate => candidate.workorderId === mechanic.assignedWorkorderId)
      : undefined;
    // Same reconciliation the row uses: reading only the summary leaves this
    // chip blank while the row names a bay, and the two surfaces disagree.
    const bayId = workorder ? this.toRowBayId(workorder) : null;
    // Only today's board reads the clock. Gating the fetch does not cover a
    // board left open across local midnight: the poll moves `todayIso` on, the
    // selected date does not, and the map already in hand would then label a
    // now-historical day with a live reading.
    const clock = this.isViewingToday() ? this.clockStates().get(mechanic.personId) : undefined;

    return {
      personId: mechanic.personId,
      name: this.displayName(mechanic),
      initials: this.toInitials(mechanic.firstName, mechanic.lastName),
      availability: this.toAvailability(mechanic, clock),
      skillCodes: this.technicianSkills().get(mechanic.personId) ?? [],
      assignedWorkorderId: mechanic.assignedWorkorderId,
      whereLabel: bayId ? (this.bayNamesById().get(bayId) ?? null) : null,
      breakExpectedReturn: mechanic.breakExpectedReturn ?? null,
      // Truthy, exactly as the lookup above and `toAvailability` treat it: a
      // nullable id arriving as `null` is not an assignment, and reading it as
      // one would cost every unassigned mechanic their free-hours figure.
      ...this.toFreeHours(mechanic.personId, workorder, Boolean(mechanic.assignedWorkorderId) && !workorder),
      onTimeOff: this.isOnPto(mechanic),
      clockState: clock?.state ?? 'UNKNOWN',
      workSessionId: clock?.workSessionId ?? null,
    };
  }

  /**
   * Hours left in the shift window after the mechanic's committed work.
   *
   * The window is the shop's operating hours standing in for a personal roster
   * (see `TechnicianShift`), so this is deliberately coarse. What it must not
   * do is turn an absence into a number: a closed day, unreadable hours and a
   * technician the roster read did not return are each null with a reason, and
   * the card renders the placeholder that names it.
   *
   * Committed time is the labour estimate on the workorder the mechanic holds
   * — the only per-mechanic commitment this board has. A workorder with no
   * estimate commits nothing here rather than guessing at one, which makes the
   * figure an upper bound; that is the honest reading of the data available.
   */
  private toFreeHours(
    personId: string,
    workorder: WorkorderSummary | undefined,
    assignmentUnresolved: boolean,
  ): { freeHours: number | null; freeHoursReason: FreeHoursReason | null; freeHoursIsPlaceholder: boolean } {
    const shift = this.technicianShifts().get(personId);
    if (!shift) {
      // Absent from a roster that answered is a fact about the technician;
      // absent from one that failed or has not landed is a fact about the
      // read, and saying "not on the roster" then would be the board
      // asserting something it was never told.
      return {
        freeHours: null,
        freeHoursReason: this.rosterRead() === 'OK' ? 'OFF_ROSTER' : 'UNKNOWN',
        freeHoursIsPlaceholder: false,
      };
    }
    if (shift.status === 'CLOSED') {
      return { freeHours: null, freeHoursReason: 'CLOSED', freeHoursIsPlaceholder: false };
    }
    if (shift.status !== 'DERIVED' || shift.minutes === null) {
      return { freeHours: null, freeHoursReason: 'UNKNOWN', freeHoursIsPlaceholder: false };
    }
    // Asked only once there is a window to spend. The commitment cannot be the
    // thing that is missing while the window itself is unreadable — on the
    // first paint, or during a roster outage, there is no window at all, and
    // saying "we just cannot see their workorder" would claim the shift data
    // read fine when it never arrived.
    if (assignmentUnresolved) {
      // The mechanic holds a workorder this response does not carry — it is
      // scheduled for another date, parked rather than holding a bay, or the
      // aggregation came back short. Its estimate is the one number that would
      // make this figure right, so the commitment is unknown and the figure
      // with it. `isBayFree` reads the same absence the same way: a claim the
      // board cannot disprove, not an empty slot.
      return { freeHours: null, freeHoursReason: 'UNKNOWN_COMMITMENT', freeHoursIsPlaceholder: false };
    }
    const committed = workorder?.estimatedLaborHours ?? 0;
    // Never below zero: an estimate longer than the shop's open hours means the
    // job runs past close, which is nothing free, not negative free time.
    const free = Math.max(0, shift.minutes / 60 - committed);
    return {
      freeHours: Math.round(free * 10) / 10,
      freeHoursReason: null,
      // `shiftSource` is the field the API says to read to tell a placeholder
      // window from a real one, so the caveat follows it rather than being
      // pinned on every figure. When per-person scheduling lands
      // (durion-positivity-backend#71) the source turns `PERSON_SCHEDULE` and
      // the shop-hours caveat stops being true — and stops being shown.
      freeHoursIsPlaceholder: shift.source === 'LOCATION_HOURS',
    };
  }

  /**
   * PTO wins over a break, and a break over having work: a mechanic on approved
   * time off is out for the day whatever the roster's other flags still say.
   */
  private toAvailability(mechanic: MechanicStatus, clock: ClockState | undefined): MechanicAvailability {
    if (this.isOnPto(mechanic)) {
      return 'OFF';
    }
    // pos-people owns the clock (#2061), so its reading outranks the dispatch
    // projection's `onBreak` — a field that projection has never populated.
    // `onBreak` stays below as the fallback for a row whose clock state the
    // caller may not see, where it is the only break signal there is.
    if (clock?.state === 'ON_BREAK') {
      return 'BREAK';
    }
    if (clock?.state === 'CLOCKED_IN') {
      return mechanic.assignedWorkorderId ? 'WORKING' : 'IDLE';
    }
    // Not on the clock is off duty, whatever work the projection still has
    // against them: a workorder assigned to someone who has gone home is a
    // plan for tomorrow, not a mechanic on the floor. No CLOCK state the caller
    // was not told moves anyone: `UNKNOWN` falls through to the reading this
    // board had before it could ask pos-people anything, `onBreak` included.
    // That fallback is the point rather than an oversight — it is the only
    // break signal a caller without `people:timekeeping:view` has, and dropping
    // it would take the bin away from them entirely. So `UNKNOWN` does not mean
    // "never relocates"; it means the clock casts no vote.
    if (clock?.state === 'CLOCKED_OUT') {
      return 'OFF';
    }
    if (mechanic.onBreak) {
      return 'BREAK';
    }
    if ((mechanic.currentStatus ?? '').toUpperCase().includes('OFF')) {
      return 'OFF';
    }
    return mechanic.assignedWorkorderId ? 'WORKING' : 'IDLE';
  }

  private isOnPto(mechanic: MechanicStatus): boolean {
    const date = this.selectedDate();
    return (mechanic.ptoEntries ?? []).some(entry => {
      const start = (entry.start ?? '').slice(0, 10);
      const end = (entry.end ?? '').slice(0, 10);
      return Boolean(start) && start <= date && (!end || end >= date);
    });
  }

  private toBayCard(bayId: string, status: BayStatus | undefined, entry: BayInventoryEntry | undefined): BayCard {
    return {
      bayId,
      // Null, never the id: an unnamed bay renders the placeholder rather than
      // putting a UUID into a chip and into its accessible name.
      name: status?.bayName?.trim() || entry?.name || null,
      kind: entry?.kind ?? null,
      // A bay the dispatch projection does not carry holds no workorder there.
      available: status ? status.available : true,
      assignedWorkorderId: status?.assignedWorkorderId,
      free: this.isBayFree(status),
    };
  }

  /**
   * A bay still linked to a closed workorder reads as idle: completing or
   * cancelling a workorder frees its position backend-side, so that link is a
   * stale projection. Every other claim counts as occupancy — including one
   * whose workorder summary is missing from this response, which is a claim the
   * board cannot disprove, not an empty bay.
   */
  private isBayFree(bay: BayStatus | undefined): boolean {
    if (!bay) {
      return true;
    }
    // A claimed bay is resolved by its holder, not by `available`: the two
    // projections go stale independently, and a closed holder that left
    // `available: false` behind would otherwise hide the bay for good.
    if (bay.assignedWorkorderId) {
      const holder = this.workordersById().get(bay.assignedWorkorderId);
      return Boolean(holder) && isClosedStatus(holder?.status);
    }
    return bay.available;
  }

  private sorted(rows: readonly WorkorderRow[]): WorkorderRow[] {
    // Only HOURS is backed by a field; the other two options are disabled in the
    // template, so an unsorted fallback keeps the response's own order.
    if (this.sortKey() !== 'HOURS') {
      return [...rows];
    }
    return [...rows].sort((left, right) => (right.estimatedHours ?? 0) - (left.estimatedHours ?? 0));
  }

  /**
   * A row whose status did not survive the projection is unclassified, not
   * open: the shared shop-dashboard helper requires a truthy status for the
   * same reason, and showing a malformed row under Open invites a write the
   * board cannot reason about.
   */
  private isOpenStatus(status: string): boolean {
    return status.length > 0 && status !== DRAFT_STATUS && !isClosedStatus(status);
  }

  /**
   * Null when neither name has replicated — never the person id, which would
   * otherwise reach the rail, the picker, the slot, three accessible names and
   * the confirmation toast. Each consumer renders its unnamed variant instead.
   */
  private displayName(mechanic: MechanicStatus | undefined): string | null {
    if (!mechanic) {
      return null;
    }
    const name = [mechanic.firstName, mechanic.lastName].filter(Boolean).join(' ').trim();
    return name || null;
  }

  private toInitials(firstName?: string, lastName?: string): string {
    const initials = `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase();
    return initials || '?';
  }

  // -------------------------------------------------------------------------
  // Errors
  // -------------------------------------------------------------------------
  /**
   * The refusals this board can provoke each have their own message; anything
   * else falls back to a generic one rather than showing a raw server string.
   */
  private toMutationErrorKey(err: unknown): string {
    const code = this.toApiErrorCode(err);
    switch (code) {
      case 'RESOURCE_OCCUPIED':
        return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_BAY_OCCUPIED';
      case 'TECHNICIAN_ALREADY_ASSIGNED':
        return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_MECHANIC_TAKEN';
      case 'TECHNICIAN_NOT_STAFFED_AT_SITE':
        return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_NOT_STAFFED';
      case 'SERVICE_POSITION_INACTIVE':
        return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_BAY_INACTIVE';
      case 'WORKORDER_CLOSED':
        return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_WORKORDER_CLOSED';
      case 'TECHNICIAN_NOT_ASSIGNED':
        return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_MECHANIC_NOT_ASSIGNED';
      case 'TECHNICIAN_NOT_FOUND':
        return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_MECHANIC_NOT_FOUND';
      case 'SERVICE_POSITION_INVALID':
        return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_BAY_INVALID';
      default:
        return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_GENERIC';
    }
  }

  /** A refusal: the write was understood and rejected, so the board is behind. */
  private isRefusal(err: unknown): boolean {
    const status = typeof err === 'object' && err !== null ? (err as Record<string, unknown>)['status'] : null;
    return status === 409 || status === 422;
  }

  private toApiErrorCode(err: unknown): string | null {
    if (typeof err !== 'object' || err === null) {
      return null;
    }
    const payload = (err as Record<string, unknown>)['error'];
    if (typeof payload === 'object' && payload !== null) {
      const code = (payload as Record<string, unknown>)['code'];
      if (typeof code === 'string') {
        return code;
      }
    }
    return null;
  }

  /**
   * A load failure resolves to a translation key, never to the server's own
   * message: that string is English and backend-authored, and the translate
   * pipe would pass it through verbatim — with any dot in it read as a nested
   * key path. Codes map the way a refused mutation's do.
   */
  private toLoadErrorKey(err: unknown): string {
    switch (this.toApiErrorCode(err)) {
      case 'LOCATION_NOT_FOUND':
        // Not the same as "you did not pick one": telling someone who chose a
        // location to choose a location names the wrong recovery.
        return 'SHOPMGMT.DISPATCH_BOARD.ERROR_LOCATION_NOT_FOUND';
      default:
        return 'SHOPMGMT.DISPATCH_BOARD.ERROR_LOAD';
    }
  }
}
