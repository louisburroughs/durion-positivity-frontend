
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PickListView, PickTaskLine, ScanResolveResult } from '../../../models/inventory-pick.models';
import { InventoryPickService } from '../../../services/inventory-pick.service';
import { INVENTORY_PAGE } from '../../../../../core/security/route-permissions';
import { AuthService } from '../../../../../core/services/auth.service';

type PageState = 'idle' | 'loading' | 'ready' | 'mutating' | 'error';

const SCAN_RESULT_KEY_BASE = 'INVENTORY.FULFILLMENT.PICK_EXECUTE.SCAN_RESULT.';

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

  readonly allTasksComplete = computed(() => {
    const tasks = this.tasks();
    return tasks.length > 0 && tasks.every(t => t.pickedQty >= t.requestedQty);
  });

  readonly scannedSkuId = signal('');
  readonly scannedLocationId = signal('');
  readonly scanAttempted = signal(false);
  readonly scanResult = signal<ScanResolveResult | null>(null);
  /** Whether the current `scanResult` cleared the active task to confirm. */
  readonly scanMatched = computed(() => this.scanResult()?.matched === true);
  readonly scanResultKey = computed(() => {
    const result = this.scanResult();
    if (!result) return null;
    if (result.matched) return `${SCAN_RESULT_KEY_BASE}MATCHED`;
    const status = result.matchStatus;
    if (status === 'SKU_MISMATCH' || status === 'LOCATION_MISMATCH' || status === 'NO_MATCH') {
      return `${SCAN_RESULT_KEY_BASE}${status}`;
    }
    return `${SCAN_RESULT_KEY_BASE}UNKNOWN`;
  });

  readonly confirmQty = signal(0);

  /**
   * Guards writes to `tasks` — shared by the initial load, `reload()`, and
   * every post-mutation readback (ADR-0063 §2: one source, "the pick-tasks
   * reader", reused from four call sites; each bumps this counter before
   * issuing its read so a stale readback can never revert a fresher one).
   */
  private tasksReadSeq = 0;
  /** Guards writes to `scanResult` from `resolveScan()` only. */
  private scanReqSeq = 0;
  /** Guards the task-scoped busy/error/form-reset UI a confirm or complete
   * action owns; independent of `tasksReadSeq` because it answers "is this
   * still the mutation the active task is waiting on", not "is this still
   * the freshest tasks read". */
  private mutationSeq = 0;

  constructor() {
    this.loadPickList();
  }

  selectTask(taskId: string): void {
    if (taskId === this.activeTaskId()) {
      return;
    }
    this.activeTaskId.set(taskId);
    this.resetScanState();
    const task = this.tasks().find(t => t.pickTaskId === taskId);
    this.confirmQty.set(task ? Math.max(task.requestedQty - task.pickedQty, 0) : 0);
  }

  setScannedSkuId(value: string): void {
    this.scannedSkuId.set(value);
    this.scanAttempted.set(false);
    this.scanResult.set(null);
  }

  setScannedLocationId(value: string): void {
    this.scannedLocationId.set(value);
    this.scanAttempted.set(false);
    this.scanResult.set(null);
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
    const scannedSkuId = this.scannedSkuId().trim();
    const scannedLocationId = this.scannedLocationId().trim();
    this.scanAttempted.set(true);
    if (!workorderId || !task || !scannedSkuId || !scannedLocationId || !this.canExecute()) {
      return;
    }

    const taskId = task.pickTaskId;
    const seq = ++this.scanReqSeq;
    this.state.set('mutating');
    this.errorKey.set(null);

    this.pickService
      .resolvePickScan(workorderId, taskId, { scannedSkuId, scannedLocationId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => this.applyScanResult(result, taskId, seq),
        error: () => this.applyScanError(seq),
      });
  }

  confirmLine(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    const task = this.activeTask();
    const quantity = this.confirmQty();

    if (!workorderId || !task || !this.scanMatched() || quantity <= 0 || !this.canExecute()) {
      return;
    }

    const taskId = task.pickTaskId;
    const seq = ++this.mutationSeq;
    this.state.set('mutating');
    this.errorKey.set(null);

    this.pickService
      .confirmPickLine(workorderId, taskId, quantity)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.afterMutationSuccess(workorderId, taskId, seq),
        error: () => this.applyMutationError(seq, 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.CONFIRM'),
      });
  }

  completeTask(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    const task = this.activeTask();
    if (!workorderId || !task || !this.canExecute()) {
      return;
    }

    const taskId = task.pickTaskId;
    const seq = ++this.mutationSeq;
    this.state.set('mutating');
    this.errorKey.set(null);

    this.pickService
      .completePickTask(workorderId, taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.afterMutationSuccess(workorderId, taskId, seq),
        error: () => this.applyMutationError(seq, 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.COMPLETE'),
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
  }

  private applyScanError(seq: number): void {
    if (seq !== this.scanReqSeq) {
      return;
    }
    this.state.set('error');
    this.errorKey.set('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.RESOLVE_SCAN');
  }

  /**
   * confirmPickLine/completePickTask queue an async command (202 PENDING) —
   * re-read `getPickTasks` through the shared `tasksReadSeq` guard so a
   * slower earlier readback can't clobber a fresher one (ADR-0063 §5).
   */
  private afterMutationSuccess(workorderId: string, taskId: string, mutSeq: number): void {
    const readSeq = ++this.tasksReadSeq;
    this.pickService
      .getPickTasks(workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tasks => this.applyMutationReadback(tasks, taskId, mutSeq, readSeq),
        error: () => this.applyMutationError(mutSeq, 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.REFRESH'),
      });
  }

  private applyMutationReadback(tasks: PickTaskLine[], taskId: string, mutSeq: number, readSeq: number): void {
    // The refreshed task list is the authoritative server state for the
    // whole workorder (not per-selection data): apply it whenever it's still
    // the freshest tasks read, regardless of which task is active now.
    if (readSeq === this.tasksReadSeq) {
      this.applyTasks(tasks);
    }
    // A newer confirm/complete (on this task or another) has since been
    // issued — that mutation now owns settling the busy state (ADR-0063 §2).
    if (mutSeq !== this.mutationSeq) {
      return;
    }
    // The mechanic switched away from this task before the readback landed:
    // the busy obligation this mutation owes is still settled below (§4),
    // but the now-irrelevant task's form must not clobber whatever the
    // active task's scan/confirm section already shows (§3).
    if (taskId === this.activeTaskId()) {
      this.resetScanState();
      const refreshed = this.tasks().find(t => t.pickTaskId === taskId);
      this.confirmQty.set(refreshed ? Math.max(refreshed.requestedQty - refreshed.pickedQty, 0) : 0);
    }
    this.state.set('ready');
    this.errorKey.set(null);
  }

  private applyMutationError(mutSeq: number, key: string): void {
    if (mutSeq !== this.mutationSeq) {
      return;
    }
    this.state.set('error');
    this.errorKey.set(key);
  }

  private resetScanState(): void {
    this.scannedSkuId.set('');
    this.scannedLocationId.set('');
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
    const seq = ++this.tasksReadSeq;

    this.pickService
      .getWorkorderPickList(workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: pickList => this.applyPickList(pickList, seq),
        error: () => this.applyLoadError(seq),
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

  private applyLoadError(seq: number): void {
    if (seq !== this.tasksReadSeq) {
      return;
    }
    this.state.set('error');
    this.errorKey.set('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOAD');
  }
}
