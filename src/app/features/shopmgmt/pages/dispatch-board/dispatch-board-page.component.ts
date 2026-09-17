import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError, forkJoin, interval, map, of, switchMap } from 'rxjs';
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
  RowLane,
  RowStatusTone,
  UndoStep,
  WorkorderRow,
  WorkorderSummary,
} from '../../models/dispatch-board.models';
import { BayKinds, DispatchBoardService, TechnicianSkills } from '../../services/dispatch-board.service';
import { LocationPickerComponent } from '../../../location/components/location-picker/location-picker.component';
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
  private readonly destroyRef = inject(DestroyRef);
  private pollingStarted = false;

  readonly todayIso = signal(new Date().toISOString().slice(0, 10));
  readonly selectedDate = signal(this.todayIso());
  readonly selectedLocationId = signal('');

  // --- page state machine (ADR-0031): `state` always moves before `errorKey` ---
  readonly state = signal<BoardState>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly dashboard = signal<DashboardResponse | null>(null);
  readonly bayKinds = signal<BayKinds>(new Map());
  readonly technicianSkills = signal<TechnicianSkills>(new Map());

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

  // --- derived reads kept for the existing contract ---
  readonly loading = computed(() => this.state() === 'loading');
  readonly error = computed(() => this.errorKey());
  readonly workorders = computed<WorkorderSummary[]>(() => this.dashboard()?.workorders ?? []);
  readonly canRefresh = computed(() => this.selectedLocationId().trim().length > 0);
  readonly hasCachedData = computed(() => this.dashboard() !== null);

  /**
   * Bay name by id, so a row and a mechanic chip can both name where a
   * workorder stands without re-walking the bay array.
   */
  private readonly bayNamesById = computed(() => {
    const names = new Map<string, string>();
    for (const bay of this.dashboard()?.bays ?? []) {
      names.set(bay.bayId, bay.bayName ?? bay.bayId);
    }
    return names;
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

  readonly allBays = computed<BayCard[]>(() =>
    (this.dashboard()?.bays ?? []).map(bay => this.toBayCard(bay)),
  );

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

    this.selectedLocationId.set(locationId);
    this.state.set('loading');
    this.errorKey.set(null);

    const seq = ++this.readSeq;
    this.dispatchBoardService
      .getDashboard(locationId, this.selectedDate())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          if (!this.applySuccess(response, seq)) {
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
   * A closed workorder refuses every dispatch write with 409 WORKORDER_CLOSED,
   * and a DRAFT one refuses a technician with 400. The click path has to apply
   * the same two guards the drag path does, or the buttons issue requests the
   * backend is guaranteed to reject.
   */
  canTakeMechanic(row: WorkorderRow): boolean {
    return !row.closed && row.status !== DRAFT_STATUS && !this.isPending(row.workorderId);
  }

  canTakeBay(row: WorkorderRow): boolean {
    return !row.closed && !this.isPending(row.workorderId);
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

    if (request.kind === 'MECHANIC') {
      this.assignMechanic(row, id);
    } else {
      this.assignBay(row, id);
    }
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  assignMechanic(row: WorkorderRow, mechanicId: string): void {
    const mechanic = this.mechanicsById().get(mechanicId);
    const previous = row.mechanicId;
    this.run(
      row.workorderId,
      () => this.dispatchBoardService.assignMechanic(row.workorderId, mechanicId, previous),
      {
        key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_ASSIGNED',
        params: { workorder: row.number, mechanic: this.displayName(mechanic) },
        tone: 'INFO',
        undo: { workorderId: row.workorderId, kind: 'MECHANIC', previousId: previous },
      },
    );
  }

  clearMechanic(row: WorkorderRow): void {
    const previous = row.mechanicId;
    this.run(row.workorderId, () => this.dispatchBoardService.releaseMechanic(row.workorderId), {
      key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.MECHANIC_CLEARED',
      params: { workorder: row.number },
      tone: 'INFO',
      undo: { workorderId: row.workorderId, kind: 'MECHANIC', previousId: previous },
    });
  }

  assignBay(row: WorkorderRow, bayId: string): void {
    const previous = row.bayId;
    this.run(row.workorderId, () => this.dispatchBoardService.assignBay(row.workorderId, bayId), {
      key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.BAY_ASSIGNED',
      params: { workorder: row.number, bay: this.bayNamesById().get(bayId) ?? bayId },
      tone: 'INFO',
      undo: { workorderId: row.workorderId, kind: 'BAY', previousId: previous },
    });
  }

  clearBay(row: WorkorderRow): void {
    const previous = row.bayId;
    this.run(row.workorderId, () => this.dispatchBoardService.releaseBay(row.workorderId), {
      key: 'SHOPMGMT.DISPATCH_BOARD.TOAST.BAY_CLEARED',
      params: { workorder: row.number },
      tone: 'INFO',
      undo: { workorderId: row.workorderId, kind: 'BAY', previousId: previous },
    });
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
        this.assignMechanic(row, step.previousId);
      } else {
        this.clearMechanic(row);
      }
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
          this.markPending(workorderId, false);
          this.toast.set(success);
          this.reloadBoard();
        },
        error: (err: unknown) => {
          this.markPending(workorderId, false);
          this.toast.set({
            key: this.toMutationErrorKey(err),
            params: { workorder: success.params['workorder'] ?? '' },
            tone: 'ERROR',
            undo: null,
          });
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
  private reloadBoard(): void {
    const locationId = this.selectedLocationId().trim();
    if (!locationId) {
      return;
    }

    const seq = ++this.readSeq;
    this.dispatchBoardService
      .getDashboard(locationId, this.selectedDate())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => this.applySuccess(response, seq),
        error: (err: unknown) => this.applyError(err, seq),
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
   * Bay types and technician credentials come from other domains and are
   * decoration on top of the board, so they load beside it and never block or
   * fail it — both service calls already answer an empty map on failure.
   */
  private loadEnrichment(locationId: string): void {
    forkJoin({
      bayKinds: this.dispatchBoardService.getBayKinds(locationId),
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
        this.bayKinds.set(result.bayKinds);
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

          this.selectedLocationId.set(locationId);
          this.refresh();
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('SHOPMGMT.DISPATCH_BOARD.ERROR_LOCATION_REQUIRED');
        },
      });
  }

  /** Returns false when a newer read has already superseded this one. */
  private applySuccess(response: DashboardResponse, seq: number): boolean {
    if (seq !== this.readSeq) {
      return false;
    }
    this.dashboard.set(response);
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
      // A refresh that fails over good data leaves the board up and marks it stale.
      this.isStale.set(true);
      this.state.set('ready');
      return;
    }

    this.state.set('error');
    this.errorKey.set(this.toErrorMessage(err));
    this.dashboard.set(null);
  }

  // -------------------------------------------------------------------------
  // Projection
  // -------------------------------------------------------------------------
  private toRow(workorder: WorkorderSummary): WorkorderRow {
    const mechanic = workorder.assignedMechanicId
      ? this.mechanicsById().get(workorder.assignedMechanicId)
      : undefined;
    const parked = workorder.resourceType === 'HOLD';
    const bayId = workorder.resourceType === 'BAY' ? (workorder.assignedResourceId ?? null) : null;
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

  private toBayCard(bay: BayStatus): BayCard {
    return {
      bayId: bay.bayId,
      name: bay.bayName ?? bay.bayId,
      kind: this.bayKinds().get(bay.bayId) ?? null,
      available: bay.available,
      assignedWorkorderId: bay.assignedWorkorderId,
      free: this.isBayFree(bay),
    };
  }

  /**
   * A bay still linked to a closed workorder reads as idle. Completing or
   * cancelling a workorder frees its position backend-side, so a lingering
   * link is a stale projection; treating it as occupied under-reports free
   * bays. Same rule the shop dashboard projection applies.
   */
  private isBayFree(bay: BayStatus): boolean {
    if (!bay.available) {
      return false;
    }
    if (!bay.assignedWorkorderId) {
      return true;
    }
    const holder = this.workordersById().get(bay.assignedWorkorderId);
    return !holder || isClosedStatus(holder.status);
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
      default:
        return 'SHOPMGMT.DISPATCH_BOARD.TOAST.ERROR_GENERIC';
    }
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

  private toErrorMessage(err: unknown): string {
    if (typeof err === 'object' && err !== null) {
      const record = err as Record<string, unknown>;
      const errPayload = record['error'];

      if (typeof errPayload === 'object' && errPayload !== null) {
        const payloadRecord = errPayload as Record<string, unknown>;
        if (typeof payloadRecord['message'] === 'string') {
          return payloadRecord['message'];
        }
      }

      if (typeof record['message'] === 'string') {
        return record['message'];
      }
    }

    return 'SHOPMGMT.DISPATCH_BOARD.ERROR_LOAD';
  }
}
