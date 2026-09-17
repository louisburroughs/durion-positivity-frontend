import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
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
import { BayInventory, BayInventoryEntry, DispatchBoardService, TechnicianSkills } from '../../services/dispatch-board.service';
import { LocationPickerComponent } from '../../../location/components/location-picker/location-picker.component';
import { AuthService } from '../../../../core/services/auth.service';
import { SHOPMGMT_PAGE, WORKEXEC_PAGE } from '../../../../core/security/route-permissions';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';

type StatusFilter = 'ALL' | 'OPEN' | 'DRAFT';

/** Only `HOURS` sorts on a field the board actually receives; see `SORT_UNAVAILABLE`. */
type SortKey = 'HOURS' | 'DUE' | 'PRIORITY';

/** What the user is dragging, or what a picker is about to place. */
type SlotKind = 'MECHANIC' | 'BAY';

interface DragPayload {
  readonly kind: SlotKind;
  readonly id: string;
}

interface PickerRequest {
  readonly kind: SlotKind;
  readonly workorderId: string;
}

interface ToastMessage {
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
 * WORK_IN_PROGRESS only; every other status answers 400. AWAITING_PARTS and
 * AWAITING_APPROVAL are read as outside the window — the conservative reading
 * of the contract's three named statuses, pending confirmation from workexec.
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
  private pollingStarted = false;

  /**
   * The board's own calendar day. `toISOString()` is the UTC date, which from
   * 17:00 Pacific onward is already tomorrow — an evening dispatcher would open
   * the wrong day's board.
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

  /** Which location the enrichment maps above describe, so a switch can drop them. */
  private enrichedLocation: string | null = null;

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

  /**
   * Monotonic read counter. `refresh()`, the 30s poll and the post-mutation
   * reload are independent subscriptions, so without this an older response
   * that lands late overwrites a newer board.
   */
  private readSeq = 0;

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

  readonly canAssignBay = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(SHOPMGMT_PAGE.bayAssign),
  );

  // --- derived reads kept for the existing contract ---
  readonly loading = computed(() => this.state() === 'loading');

  /**
   * A manual refresh moves the machine to 'loading', but blanking a board the
   * dispatcher is reading — mid-glance, mid-decision — to redraw the same rows
   * a moment later is a worse answer than a quiet busy mark. The poll already
   * refuses to do it; a refresh over cached data for the same selection does
   * not either.
   */
  readonly showBoard = computed(() => this.state() === 'ready' || (this.loading() && this.hasCachedData()));
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
   * workorder stands without re-walking the bay array. Only real names: a bay
   * whose name has not replicated stays out, so the placeholder renders instead
   * of a UUID leaking into a label.
   */
  private readonly bayNamesById = computed(() => {
    const names = new Map<string, string>();
    for (const bay of this.allBays()) {
      if (bay.name) {
        names.set(bay.bayId, bay.name);
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

  /** On break or off duty — read-only: neither state is settable from this board. */
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
   * goes invisible. An OUT_OF_SERVICE bay the projection does not mention is
   * dropped: it is not capacity.
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

  /** Mechanics a picker offers, credentialled ones first, then by name. */
  readonly pickerMechanics = computed<MechanicCard[]>(() =>
    [...this.mechanics()].sort(
      (left, right) => right.skillCodes.length - left.skillCodes.length || left.name.localeCompare(right.name),
    ),
  );

  readonly pickerRow = computed<WorkorderRow | null>(() => {
    const request = this.picker();
    if (!request) {
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
    return this.dispatchBoardService
      .getDashboard(locationId, date)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          if (!this.applySuccess(response, seq, key)) {
            return;
          }
          this.loadEnrichment(locationId);
          if (!this.pollingStarted) {
            this.startPolling();
          }
        },
        error: (err: unknown) => this.applyError(err, seq),
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
  onDragStart(kind: SlotKind, id: string, event: DragEvent): void {
    this.dragging.set({ kind, id });
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
    return payload.kind === 'MECHANIC' ? this.canTakeMechanic(row) : this.canTakeBay(row);
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

  canTakeBay(row: WorkorderRow): boolean {
    return this.canAssignBay() && !row.closed && !this.isPending(row.workorderId);
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
    return row.closed ? 'SHOPMGMT.DISPATCH_BOARD.CLOSED_NO_CHANGE' : null;
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
    const mechanic = this.mechanicsById().get(mechanicId);
    this.run(
      row.workorderId,
      () => this.dispatchBoardService.assignMechanic(row.workorderId, mechanicId, incumbentId),
      {
        key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_ASSIGNED',
        params: { workorder: row.number, mechanic: this.displayName(mechanic) },
        tone: 'INFO',
        undo: {
          workorderId: row.workorderId,
          kind: 'MECHANIC',
          previousId: incumbentId,
          currentMechanicId: mechanicId,
          previousPosition: null,
        },
      },
    );
  }

  clearMechanic(row: WorkorderRow): void {
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
      },
    });
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
      undo: this.toPositionUndo(row),
    });
  }

  clearBay(row: WorkorderRow): void {
    this.run(row.workorderId, () => this.dispatchBoardService.releaseBay(row.workorderId), {
      key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.BAY_CLEARED',
      params: { workorder: row.number },
      tone: 'INFO',
      undo: this.toPositionUndo(row),
    });
  }

  /** Put the workorder back in the site's parking lot, rather than nowhere. */
  private parkWorkorder(row: WorkorderRow): void {
    this.run(row.workorderId, () => this.dispatchBoardService.parkWorkorder(row.workorderId), {
      key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.WORKORDER_PARKED',
      params: { workorder: row.number },
      tone: 'INFO',
      undo: this.toPositionUndo(row),
    });
  }

  /**
   * Where the row stands before a position write. A parked workorder carries no
   * bay id, so the kind has to be recorded too or undo would release its HOLD
   * instead of restoring it.
   */
  private toPositionUndo(row: WorkorderRow): UndoStep {
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
    };
  }

  /**
   * Put back what the last mutation changed. Undoing onto nothing is a release;
   * undoing onto a previous holder is the assign call again, which the service
   * routes to reassign because the board now shows an incumbent.
   */
  undo(): void {
    const step = this.toast()?.undo;
    this.toast.set(null);
    if (!step) {
      return;
    }

    const row = this.allRows().find(candidate => candidate.workorderId === step.workorderId);
    if (!row) {
      return;
    }

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

  dismissToast(): void {
    this.toast.set(null);
  }

  /**
   * Every mutation follows the same shape: mark the row busy, fire, then re-read
   * the board rather than predicting the new status — the backend decides whether
   * a workorder becomes ASSIGNED, and the contract says to read it back.
   */
  private run(workorderId: string, call: () => Observable<unknown>, success: ToastMessage): void {
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
          this.toast.set(success);
          this.reloadBoard(() => this.markPending(workorderId, false));
        },
        error: (err: unknown) => {
          this.markPending(workorderId, false);
          this.toast.set({
            key: this.toMutationErrorKey(err),
            params: { workorder: success.params['workorder'] ?? '' },
            tone: 'ERROR',
            undo: null,
          });
          // A 409 or 422 is the backend saying the board's copy is wrong — the
          // incumbent moved, the bay filled. Without a re-read the row keeps
          // showing what was contradicted and every retry repeats the same
          // wrong call.
          if (this.isRefusal(err)) {
            this.reloadBoard();
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

  /** Re-read after a mutation without dropping the board into its loading state. */
  private reloadBoard(onSettled?: () => void): void {
    const locationId = this.selectedLocationId().trim();
    if (!locationId) {
      onSettled?.();
      return;
    }

    const seq = ++this.readSeq;
    this.dispatchBoardService
      .getDashboard(locationId, this.selectedDate())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.applySuccess(response, seq);
          onSettled?.();
        },
        error: (err: unknown) => {
          this.applyError(err, seq);
          onSettled?.();
        },
      });
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  private startPolling(): void {
    this.pollingStarted = true;

    interval(POLL_INTERVAL_MS)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(() => {
          const seq = ++this.readSeq;
          return this.dispatchBoardService
            .getDashboard(this.selectedLocationId(), this.selectedDate())
            .pipe(
              map(response => ({ response, seq })),
              catchError((err: unknown) => {
                this.applyError(err, seq);
                return EMPTY;
              }),
            );
        }),
      )
      .subscribe({
        next: ({ response, seq }) => this.applySuccess(response, seq),
      });
  }

  /**
   * The bay roster and technician credentials come from other domains and load
   * beside the board rather than gating it — both service calls already answer
   * an empty map on failure, and the dispatch projection alone still renders.
   */
  private loadEnrichment(locationId: string): void {
    // Drop the previous shop's maps as the new load STARTS, not when it lands.
    // The inventory is the bay rail's roster of record, so holding the old one
    // across the gap offers another site's bays as draggable on this board —
    // and placing one is a 422, the position being at another site.
    if (this.enrichedLocation !== null && this.enrichedLocation !== locationId) {
      this.bayInventory.set(new Map());
      this.technicianSkills.set(new Map());
    }
    this.enrichedLocation = locationId;

    forkJoin({
      bays: this.dispatchBoardService.getBayInventory(locationId),
      skills: this.dispatchBoardService.getTechnicianSkills(locationId),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of(null)),
      )
      .subscribe(result => {
        // A location switch while these were in flight must not let the old
        // shop's bay types and credentials paint the new board.
        if (!result || this.selectedLocationId().trim() !== locationId) {
          return;
        }
        this.bayInventory.set(result.bays);
        this.technicianSkills.set(result.skills);
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

  /** Returns false when a newer read has already superseded this one. */
  private applySuccess(response: DashboardResponse, seq: number, key = this.requestKey()): boolean {
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
    const parked = workorder.resourceType === 'HOLD';
    const bayId = this.toRowBayId(workorder, parked);
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
      mechanicInitials: name ? this.toInitials(mechanic?.firstName, mechanic?.lastName) : null,
      bayId,
      // Null, never the raw id: an unresolved replica renders as the
      // not-available placeholder rather than leaking a UUID at the user.
      bayName: bayId ? (this.bayNamesById().get(bayId) ?? null) : null,
      parked,
      closed: isClosedStatus(workorder.status),
      dueAt: null,
      priority: null,
      requiredSkills: null,
    };
  }

  /**
   * Where the row stands. The workorder's own resource fields come first, but a
   * bay claiming the workorder is a placement too: the two sides are
   * independent projections, and a row that shows an empty slot while the rail
   * shows the bay occupied leaves an assignment nobody can clear.
   */
  private toRowBayId(workorder: WorkorderSummary, parked: boolean): string | null {
    // A closed workorder's link is a freed position the projection has not
    // caught up with, never a live placement — including its own resource
    // fields, so this precedes the summary-side read rather than following it.
    if (isClosedStatus(workorder.status)) {
      return null;
    }
    if (workorder.resourceType === 'BAY') {
      return workorder.assignedResourceId ?? null;
    }
    if (parked || workorder.resourceType) {
      return null;
    }
    return this.bayClaimsByWorkorder().get(workorder.workorderId) ?? null;
  }

  private toLane(workorder: WorkorderSummary, parked: boolean): RowLane {
    if (workorder.assignedMechanicId) {
      return 'ASSIGNED';
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
    const bayId = workorder?.resourceType === 'BAY' ? workorder.assignedResourceId : undefined;

    return {
      personId: mechanic.personId,
      name: this.displayName(mechanic),
      initials: this.toInitials(mechanic.firstName, mechanic.lastName),
      availability: this.toAvailability(mechanic),
      skillCodes: this.technicianSkills().get(mechanic.personId) ?? [],
      assignedWorkorderId: mechanic.assignedWorkorderId,
      whereLabel: bayId ? (this.bayNamesById().get(bayId) ?? null) : null,
      breakExpectedReturn: mechanic.breakExpectedReturn ?? null,
      freeHours: null,
    };
  }

  /**
   * PTO wins over a break, and a break over having work: a mechanic on approved
   * time off is out for the day whatever the roster's other flags still say.
   */
  private toAvailability(mechanic: MechanicStatus): MechanicAvailability {
    if (this.isOnPto(mechanic)) {
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

  private isOpenStatus(status: string): boolean {
    return status !== DRAFT_STATUS && !isClosedStatus(status);
  }

  private displayName(mechanic: MechanicStatus | undefined): string {
    if (!mechanic) {
      return '';
    }
    const name = [mechanic.firstName, mechanic.lastName].filter(Boolean).join(' ').trim();
    return name || mechanic.personId;
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
        return 'SHOPMGMT.DISPATCH_BOARD.ERROR_LOCATION_REQUIRED';
      default:
        return 'SHOPMGMT.DISPATCH_BOARD.ERROR_LOAD';
    }
  }
}
