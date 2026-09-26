
import { Component, DestroyRef, ElementRef, Injector, ViewChild, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { timer } from 'rxjs';
import { PickListView, PickTaskLine, ScanResolveResult } from '../../../models/inventory-pick.models';
import { InventoryPickService } from '../../../services/inventory-pick.service';
import { INVENTORY_PAGE } from '../../../../../core/security/route-permissions';
import { AuthService } from '../../../../../core/services/auth.service';

type PageState = 'idle' | 'loading' | 'ready' | 'mutating' | 'error';

/** The backend's terminal "done" value for a pick task (PickTaskStatus.PICKED in
 * pos-inventory) — set on the replica as soon as any confirm applies, and always
 * true once `completeTask()` succeeds. Mirrors pos-inventory's own `allPicked`
 * check (`PickListServiceImpl#confirmPickTask`), never a local quantity comparison. */
const PICK_TASK_STATUS_PICKED = 'PICKED';

const SCAN_RESULT_KEY_BASE = 'INVENTORY.FULFILLMENT.PICK_EXECUTE.SCAN_RESULT.';

/** Every non-match `MatchStatus` the backend can answer with (#2217) — the two
 * *_UNAVAILABLE statuses mean "cannot verify a code-based scan against this
 * task yet", not "wrong part"/"wrong bin"; they still render their own
 * localized message rather than falling through to UNKNOWN. */
const KNOWN_SCAN_MISMATCH_STATUSES = new Set([
  'SKU_MISMATCH',
  'LOCATION_MISMATCH',
  'NO_MATCH',
  'PRODUCT_CODE_UNAVAILABLE',
  'LOCATION_CODE_UNAVAILABLE',
]);

/** The backend's error code for a caller whose location scope does not cover
 * the workorder's own site (#2204/#2225) — now enforced on every pick-facade
 * endpoint (read and write alike). Answered as a plain 403 wherever a
 * permission failure would otherwise land, so it is distinguished by its
 * `error.code`, not solely by status. */
const LOCATION_SCOPE_DENIED_CODE = 'LOCATION_SCOPE_DENIED';

function isLocationScopeDenied(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 403 && err.error?.code === LOCATION_SCOPE_DENIED_CODE;
}

/** A command error or stalled-poll message scoped to the task it belongs to —
 * never rendered unless that task is still the active one (issue #374 finding 6). */
interface TaskStatusMessage {
  taskId: string;
  kind: 'error' | 'stalled';
  key: string;
}

/**
 * Per-pick-task mechanic execution (issue #369): rebuilt from a whole-pick-list
 * page to a per-task one because the SDK's `WorkorderPickFacadeService` models
 * scan-resolve/confirm/complete at pick-task granularity, not list-wide. The
 * mechanic selects one of the workorder's pick tasks as `activeTaskId`, scans
 * against it, confirms a quantity, and completes it; other tasks stay listed
 * and selectable throughout.
 */
@Component({
  selector: 'app-pick-execute-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './pick-execute-page.component.html',
  styleUrls: ['./pick-execute-page.component.css'],
})
export class PickExecutePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly pickService = inject(InventoryPickService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  /** A scanner types the code then sends Enter — these refs drive the
   * product→location autofocus flow without relying on the static HTML
   * `autofocus` attribute, which only fires once per element insertion, not
   * every time a new task is selected or a scan resolves (#2217). */
  @ViewChild('scanProductCodeInput') private readonly productCodeInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('retryButton') private readonly retryButtonRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('scanLocationCodeInput') private readonly locationCodeInputRef?: ElementRef<HTMLInputElement>;

  /**
   * Every mutation surface on this page (scan resolve, line confirm, task
   * complete) gates independently on `inventory:pick_list:execute` — the write
   * authority the backend actually enforces (`WorkorderPickFacadeController`),
   * not the `inventory:pick_list:view` the route itself used to carry
   * (ADR-0040 §6a.1). Unknown permissions (legacy token, no `perm_bits` claim)
   * stay open, matching `canAccess()`'s own fallback.
   */
  readonly canExecute = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(INVENTORY_PAGE.pickExecute),
  );

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly pickList = signal<PickListView | null>(null);
  readonly tasks = signal<PickTaskLine[]>([]);

  readonly activeTaskId = signal<string | null>(null);
  readonly activeTask = computed(
    () => this.tasks().find(t => t.pickTaskId === this.activeTaskId()) ?? null,
  );
  readonly activeTaskRemainingQty = computed(() => {
    const task = this.activeTask();
    return task ? Math.max(task.requestedQty - task.pickedQty, 0) : 0;
  });

  /**
   * Gated on the backend's own completion status (issue #374 finding 2), not a
   * local quantity comparison — `pickedQty >= requestedQty` can be true on the
   * stale pre-readback snapshot the instant a confirm is queued (202 PENDING),
   * showing "all complete" before the command has actually applied.
   */
  readonly allTasksComplete = computed(() => {
    const tasks = this.tasks();
    return tasks.length > 0 && tasks.every(t => t.status === PICK_TASK_STATUS_PICKED);
  });

  /** Scanned product code (EAN/UPC) and location code (name or barcode) —
   * the two fields a barcode scanner drives (#2217). The UUID pair the SDK
   * still accepts has no input on this page; nothing here fabricates a UUID
   * from a scanned code. */
  readonly scannedProductCode = signal('');
  readonly scannedLocationCode = signal('');
  readonly scanAttempted = signal(false);
  readonly scanResult = signal<ScanResolveResult | null>(null);
  /** Whether the current `scanResult` cleared the active task to confirm. */
  readonly scanMatched = computed(() => this.scanResult()?.matched === true);
  readonly scanResultKey = computed(() => {
    const result = this.scanResult();
    if (!result) return null;
    if (result.matched) return `${SCAN_RESULT_KEY_BASE}MATCHED`;
    const status = result.matchStatus;
    if (status && KNOWN_SCAN_MISMATCH_STATUSES.has(status)) {
      return `${SCAN_RESULT_KEY_BASE}${status}`;
    }
    return `${SCAN_RESULT_KEY_BASE}UNKNOWN`;
  });

  readonly confirmQty = signal(0);

  /**
   * Whether `confirmQty` is a real, in-range amount to pick (issue #374
   * finding 2) — finite, positive, and no more than what remains on the
   * active task. The input's `max` attribute isn't a programmatic guard, so
   * both the confirm button's `disabled` binding and `confirmLine()` itself
   * gate on this same computed rather than duplicating the condition.
   */
  readonly confirmQtyValid = computed(() => {
    const quantity = this.confirmQty();
    return Number.isFinite(quantity) && quantity > 0 && quantity <= this.activeTaskRemainingQty();
  });

  /**
   * The pick task with a confirm/complete command in flight (including its
   * post-mutation poll) — `null` when nothing is pending. Only ever one task
   * at a time: the scan/confirm/complete controls exist solely for the active
   * task, and `selectTask()` abandons a leaving task's poll (issue #374 finding 5).
   */
  readonly pendingTaskId = signal<string | null>(null);
  /** A command error or stalled-poll message, scoped to the task it belongs
   * to (issue #374 finding 6) — never a page-wide `errorKey`. */
  readonly taskStatus = signal<TaskStatusMessage | null>(null);

  /** Whether the *active* task specifically has a confirm/complete in flight —
   * drives disabling its own controls without blocking a switch to another task. */
  readonly activeTaskPending = computed(
    () => this.pendingTaskId() !== null && this.pendingTaskId() === this.activeTaskId(),
  );
  /** The active task's own command error/stalled message, or `null` if the
   * current `taskStatus()` belongs to a task the mechanic has since left. */
  readonly activeTaskStatus = computed(() => {
    const status = this.taskStatus();
    return status && status.taskId === this.activeTaskId() ? status : null;
  });
  /** Combines the scan-resolve page-level busy flag with the active task's own
   * confirm/complete pending flag for a single disable condition in the template. */
  readonly activeTaskBusy = computed(() => this.state() === 'mutating' || this.activeTaskPending());

  private static readonly MUTATION_POLL_MAX_ATTEMPTS = 5;
  private static readonly MUTATION_POLL_BACKOFF_MS = [500, 1000, 2000, 4000];

  /**
   * Guards writes to `tasks` — shared by the initial load, `reload()`, and
   * every post-mutation readback (ADR-0063 §2: one source, "the pick-tasks
   * reader", reused from four call sites; each bumps this counter before
   * issuing its read so a stale readback can never revert a fresher one).
   */
  private tasksReadSeq = 0;
  /** Guards writes to `scanResult`/`state` from a `resolveScan()` in flight.
   * `selectTask()` and `loadPickList()` also bump it — switching tasks or
   * (re)loading abandons any outstanding scan, so its late success or
   * failure settles quietly instead of hitting the wrong task or the page
   * (issue #374 finding 1). */
  private scanReqSeq = 0;
  /** Guards the task-scoped busy/error/form-reset UI a confirm or complete
   * action owns; independent of `tasksReadSeq` because it answers "is this
   * still the mutation the active task is waiting on", not "is this still
   * the freshest tasks read". Also the poll-cancellation switch (issue #374
   * finding 5): `selectTask()` bumps it when leaving a task with a pending
   * mutation, so that mutation's post-mutation poll stops scheduling further
   * attempts (ADR-0063 §2/§4). */
  private mutationSeq = 0;

  constructor() {
    this.loadPickList();
  }

  selectTask(taskId: string): void {
    if (taskId === this.activeTaskId()) {
      return;
    }
    const leavingTaskId = this.activeTaskId();
    if (leavingTaskId !== null && this.pendingTaskId() === leavingTaskId) {
      // The mechanic switched away from a task with a confirm/complete still
      // polling — abandon it; no further retry attempts are useful once its
      // controls are off screen (ADR-0063 §2/§4: this call owns settling the
      // obligation now, so no page-wide error or stuck busy state follows).
      ++this.mutationSeq;
      this.pendingTaskId.set(null);
    }
    if (leavingTaskId !== null && this.taskStatus()?.taskId === leavingTaskId) {
      this.taskStatus.set(null);
    }
    // Abandon any outstanding scan for the task being left — its result or
    // error belongs to a task no longer on screen and must not repopulate
    // the confirm UI, or land on the page-level error state, once it lands
    // late (issue #374 finding 1; ADR-0063 §1-2). `applyScanResult`/
    // `applyScanError` key off this counter, so bumping it here is enough
    // for a stale scan to settle quietly.
    ++this.scanReqSeq;
    if (this.state() === 'mutating') {
      this.state.set('ready');
    }
    this.activeTaskId.set(taskId);
    this.resetScanState();
    this.focusProductCodeInput();
    const task = this.tasks().find(t => t.pickTaskId === taskId);
    this.confirmQty.set(task ? Math.max(task.requestedQty - task.pickedQty, 0) : 0);
  }

  setScannedProductCode(value: string): void {
    this.scannedProductCode.set(value);
    this.scanAttempted.set(false);
    this.scanResult.set(null);
  }

  setScannedLocationCode(value: string): void {
    this.scannedLocationCode.set(value);
    this.scanAttempted.set(false);
    this.scanResult.set(null);
  }

  /** Enter in the product-code field moves to the location-code field instead
   * of submitting — a scan gun sends Enter after every code, so the first
   * Enter must advance the flow, not fire a half-filled resolve (#2217). */
  onProductCodeEnter(event: Event): void {
    event.preventDefault();
    this.focusLocationCodeInput();
  }

  /** Enter in the location-code field submits — this is the second scan of
   * the product→location pair, so both fields are expected to be filled. */
  onLocationCodeEnter(event: Event): void {
    event.preventDefault();
    this.resolveScan();
  }

  private focusProductCodeInput(): void {
    queueMicrotask(() => this.productCodeInputRef?.nativeElement.focus());
  }

  /** Focus once the next render has re-enabled the inputs after a settled scan. */
  private focusProductCodeInputAfterRender(): void {
    afterNextRender(() => this.productCodeInputRef?.nativeElement.focus(), { injector: this.injector });
  }

  /** The page-wide error card replaces the scan controls; move focus to its retry action. */
  private focusRetryButtonAfterRender(): void {
    afterNextRender(() => this.retryButtonRef?.nativeElement.focus(), { injector: this.injector });
  }

  private focusLocationCodeInput(): void {
    queueMicrotask(() => this.locationCodeInputRef?.nativeElement.focus());
  }

  setConfirmQty(quantity: number): void {
    this.confirmQty.set(quantity);
  }

  reload(): void {
    this.loadPickList();
  }

  resolveScan(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    const task = this.activeTask();
    const scannedProductCode = this.scannedProductCode().trim();
    const scannedLocationCode = this.scannedLocationCode().trim();
    this.scanAttempted.set(true);
    if (!workorderId || !task || !scannedProductCode || !scannedLocationCode || !this.canExecute()) {
      return;
    }

    const taskId = task.pickTaskId;
    const seq = ++this.scanReqSeq;
    this.state.set('mutating');
    this.errorKey.set(null);
    // Clear immediately (#2217) — a scan-gun flow never needs to re-see the
    // codes it just submitted, and the next attempt (this task or another)
    // starts from an empty pair. Refocus waits for the scan to settle: the
    // inputs are disabled while it is pending, which drops focus (ADR-0029 §8.7).
    this.scannedProductCode.set('');
    this.scannedLocationCode.set('');

    this.pickService
      .resolvePickScan(workorderId, taskId, { scannedProductCode, scannedLocationCode })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => this.applyScanResult(result, taskId, seq),
        error: err => this.applyScanError(seq, err),
      });
  }

  confirmLine(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    const task = this.activeTask();
    const quantity = this.confirmQty();

    // Re-checked here, not only via the button's `disabled` binding: the
    // input's `max` attribute is not a programmatic guard, so a caller
    // reaching this method directly could still send an over-pick, NaN, or
    // infinite quantity to the write facade (issue #374 finding 2).
    if (!workorderId || !task || !this.scanMatched() || !this.confirmQtyValid() || !this.canExecute()) {
      return;
    }

    const taskId = task.pickTaskId;
    const priorPickedQty = task.pickedQty;
    const seq = ++this.mutationSeq;
    this.pendingTaskId.set(taskId);
    this.clearTaskStatus(taskId);

    this.pickService
      .confirmPickLine(workorderId, taskId, quantity)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () =>
          this.pollForTaskUpdate(
            workorderId,
            taskId,
            seq,
            // Settle on *this* command's result: the picked quantity reaching what
            // this confirm added (or the task closing), not merely any change, which
            // a concurrent update could also produce.
            t => t.pickedQty >= priorPickedQty + quantity || t.status === PICK_TASK_STATUS_PICKED,
            1,
          ),
        error: err => this.applyMutationError(taskId, seq, err, 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.CONFIRM'),
      });
  }

  /**
   * Disabled in the template until the active task has nothing left to pick
   * (issue #374 finding 1) — re-checked here too, so a mechanic can't complete
   * a task blind, bypassing scan/confirm, by calling this method directly.
   */
  completeTask(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    const task = this.activeTask();
    if (!workorderId || !task || !this.canExecute() || this.activeTaskRemainingQty() > 0) {
      return;
    }

    const taskId = task.pickTaskId;
    const seq = ++this.mutationSeq;
    this.pendingTaskId.set(taskId);
    this.clearTaskStatus(taskId);

    this.pickService
      .completePickTask(workorderId, taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () =>
          this.pollForTaskUpdate(
            workorderId,
            taskId,
            seq,
            // Completion is only allowed once nothing remains to pick, so the
            // quantity condition already holds before the command applies; only
            // the backend's terminal status proves this complete landed.
            t => t.status === PICK_TASK_STATUS_PICKED,
            1,
          ),
        error: err => this.applyMutationError(taskId, seq, err, 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.COMPLETE'),
      });
  }

  private applyScanResult(result: ScanResolveResult, taskId: string, seq: number): void {
    // A newer scan (from this task or another) superseded this one entirely —
    // that read owns settling the busy state; drop this one (ADR-0063 §1/§2).
    if (seq !== this.scanReqSeq) {
      return;
    }
    // The mechanic switched to a different task before this scan resolved:
    // the busy obligation is still owed and settles below (§4), but the
    // result itself belongs to a task that's no longer on screen and must
    // not clobber whatever the now-active task's scan section shows (§3).
    if (taskId === this.activeTaskId()) {
      this.scanResult.set(result);
      if (result.matched) {
        this.confirmQty.set(this.activeTaskRemainingQty());
      }
    }
    this.state.set('ready');
    this.focusProductCodeInputAfterRender();
  }

  private applyScanError(seq: number, err: unknown): void {
    if (seq !== this.scanReqSeq) {
      return;
    }
    this.state.set('error');
    this.errorKey.set(
      isLocationScopeDenied(err)
        ? 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOCATION_SCOPE_DENIED'
        : 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.RESOLVE_SCAN',
    );
    // The error card replaces the scan inputs, so focus its retry action.
    this.focusRetryButtonAfterRender();
  }

  /**
   * confirmPickLine/completePickTask queue an async command (202 PENDING) — a
   * single immediate readback can land before the command has actually
   * applied (issue #374 finding 5). Re-reads `getPickTasks` through the
   * shared `tasksReadSeq` guard (ADR-0063 §5) and keeps retrying, with
   * backoff, up to `MUTATION_POLL_MAX_ATTEMPTS`, until `isSettled` confirms
   * the task reflects the command. `selectTask()` bumps `mutationSeq` to
   * cancel further attempts if the mechanic moves on; `takeUntilDestroyed`
   * cancels on page destroy.
   */
  private pollForTaskUpdate(
    workorderId: string,
    taskId: string,
    mutSeq: number,
    isSettled: (task: PickTaskLine) => boolean,
    attempt: number,
  ): void {
    const readSeq = ++this.tasksReadSeq;
    this.pickService
      .getPickTasks(workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tasks => {
          // The refreshed task list is the authoritative server state for
          // the whole workorder (not per-selection data): apply it whenever
          // it's still the freshest tasks read, regardless of which task is
          // active now, and regardless of whether this mutation is current.
          if (readSeq === this.tasksReadSeq) {
            this.applyTasks(tasks);
          }
          // A newer confirm/complete, or a task switch, has since taken over
          // (or abandoned) settling this obligation — stop here without
          // scheduling another attempt (ADR-0063 §2/§4).
          if (mutSeq !== this.mutationSeq) {
            return;
          }
          const updated = tasks.find(t => t.pickTaskId === taskId);
          if (updated && isSettled(updated)) {
            this.settleMutationSuccess(taskId, mutSeq);
            return;
          }
          if (attempt >= PickExecutePageComponent.MUTATION_POLL_MAX_ATTEMPTS) {
            this.settleMutationExhausted(taskId, mutSeq);
            return;
          }
          const delayMs =
            PickExecutePageComponent.MUTATION_POLL_BACKOFF_MS[
              Math.min(attempt - 1, PickExecutePageComponent.MUTATION_POLL_BACKOFF_MS.length - 1)
            ];
          timer(delayMs)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
              if (mutSeq !== this.mutationSeq) {
                return; // cancelled — task switch or a newer mutation (ADR-0063 §2)
              }
              this.pollForTaskUpdate(workorderId, taskId, mutSeq, isSettled, attempt + 1);
            });
        },
        error: err => this.applyRefreshError(taskId, mutSeq, err),
      });
  }

  private settleMutationSuccess(taskId: string, mutSeq: number): void {
    if (mutSeq !== this.mutationSeq) {
      return;
    }
    this.pendingTaskId.set(null);
    this.clearTaskStatus(taskId);
    // The mechanic switched away from this task before it settled: the busy
    // obligation is still paid above: the now-irrelevant task's form must
    // not clobber whatever the active task's scan/confirm section shows
    // (ADR-0063 §3).
    if (taskId === this.activeTaskId()) {
      this.resetScanState();
      const refreshed = this.tasks().find(t => t.pickTaskId === taskId);
      this.confirmQty.set(refreshed ? Math.max(refreshed.requestedQty - refreshed.pickedQty, 0) : 0);
    }
  }

  private settleMutationExhausted(taskId: string, mutSeq: number): void {
    if (mutSeq !== this.mutationSeq) {
      return;
    }
    this.pendingTaskId.set(null);
    this.taskStatus.set({
      taskId,
      kind: 'stalled',
      key: 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.STILL_PROCESSING',
    });
  }

  /**
   * A confirm/complete command failure — scoped to its task (issue #374
   * finding 6), never a page-wide `errorKey`, so a late failure for a task
   * the mechanic has since left doesn't surface as a page error over
   * whichever task is now active.
   *
   * A `LOCATION_SCOPE_DENIED` 403 is the one exception: it means the
   * caller's location scope no longer covers this workorder's site at all
   * (#2204/#2225), not that this one command failed, so it is surfaced
   * page-wide instead of scoped to the task, matching the read-side handling
   * below (ADR-0064 §6).
   */
  private applyMutationError(taskId: string, mutSeq: number, err: unknown, fallbackKey: string): void {
    if (mutSeq !== this.mutationSeq) {
      return; // superseded — obligation already settled by selectTask() or a newer mutation
    }
    this.pendingTaskId.set(null);
    if (isLocationScopeDenied(err)) {
      this.clearTaskStatus(taskId);
      this.state.set('error');
      this.errorKey.set('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOCATION_SCOPE_DENIED');
      this.focusRetryButtonAfterRender();
      return;
    }
    this.taskStatus.set({ taskId, kind: 'error', key: fallbackKey });
  }

  /** The post-mutation `getPickTasks` readback itself failing — a workorder-wide
   * problem (issue #374 finding 6), kept on the page-level `state`/`errorKey`
   * machine (ADR-0031 §1) rather than the task-scoped `taskStatus`. Gated by
   * the same ownership check as the success path (issue #374 finding 3): if
   * a newer mutation, task switch, or reload has since taken over this
   * obligation, the stale failure settles quietly instead of replacing
   * whatever the mechanic is now looking at with a refresh error. */
  private applyRefreshError(taskId: string, mutSeq: number, err: unknown): void {
    if (mutSeq !== this.mutationSeq) {
      return; // superseded — obligation already settled by selectTask() or a newer mutation
    }
    if (this.pendingTaskId() === taskId) {
      this.pendingTaskId.set(null);
    }
    this.state.set('error');
    this.errorKey.set(
      isLocationScopeDenied(err)
        ? 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOCATION_SCOPE_DENIED'
        : 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.REFRESH',
    );
  }

  private clearTaskStatus(taskId: string): void {
    if (this.taskStatus()?.taskId === taskId) {
      this.taskStatus.set(null);
    }
  }

  private resetScanState(): void {
    this.scannedProductCode.set('');
    this.scannedLocationCode.set('');
    this.scanAttempted.set(false);
    this.scanResult.set(null);
  }

  private applyTasks(tasks: PickTaskLine[]): void {
    this.tasks.set(tasks);
    const activeId = this.activeTaskId();
    if (activeId && !tasks.some(t => t.pickTaskId === activeId)) {
      this.activeTaskId.set(null);
    }
    if (!this.activeTaskId() && tasks.length > 0) {
      this.selectTask(tasks[0].pickTaskId);
    }
  }

  private loadPickList(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    if (!workorderId) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.MISSING_ID');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);
    // A full (re)load abandons any in-flight confirm/complete poll and any
    // outstanding scan — both belong to state that's about to be replaced by
    // fresh server data (issue #374 finding 1; ADR-0063 §2/§7).
    ++this.mutationSeq;
    ++this.scanReqSeq;
    this.pendingTaskId.set(null);
    this.taskStatus.set(null);
    const seq = ++this.tasksReadSeq;

    this.pickService
      .getWorkorderPickList(workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: pickList => this.applyPickList(pickList, seq),
        error: err => this.applyLoadError(seq, err),
      });
  }

  private applyPickList(pickList: PickListView | null, seq: number): void {
    if (seq !== this.tasksReadSeq) {
      return; // superseded by a later load/reload
    }
    // Nothing to execute without a pick list; this page has no empty state.
    if (!pickList) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOAD');
      return;
    }
    this.pickList.set(pickList);
    this.applyTasks(pickList.tasks);
    this.state.set('ready');
    this.errorKey.set(null);
  }

  private applyLoadError(seq: number, err: unknown): void {
    if (seq !== this.tasksReadSeq) {
      return;
    }
    this.state.set('error');
    this.errorKey.set(
      isLocationScopeDenied(err)
        ? 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOCATION_SCOPE_DENIED'
        : 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOAD',
    );
  }
}
