import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { PickExecutePageComponent } from './pick-execute-page.component';
import { InventoryPickService } from '../../../services/inventory-pick.service';
import { PickListView, PickTaskLine, ScanResolveResult } from '../../../models/inventory-pick.models';
import { AuthService } from '../../../../../core/services/auth.service';
import { INVENTORY_PAGE } from '../../../../../core/security/route-permissions';

const mockPickService = {
  getWorkorderPickList: vi.fn(),
  getPickTasks: vi.fn(),
  resolvePickScan: vi.fn(),
  confirmPickLine: vi.fn(),
  completePickTask: vi.fn(),
};

const EXECUTE = INVENTORY_PAGE.pickExecute[0];

/** `null` = token with no permission claim (permissions unknown), as in AuthService. */
const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(p => session.permissions?.includes(p) ?? false),
};

const taskA: PickTaskLine = {
  pickTaskId: 'task-A',
  productSku: 'SKU-A',
  requestedQty: 5,
  pickedQty: 0,
  uom: 'EA',
  storageLocationId: 'bin-A',
  status: 'PENDING',
  sortOrder: 1,
};

const taskB: PickTaskLine = {
  pickTaskId: 'task-B',
  productSku: 'SKU-B',
  requestedQty: 3,
  pickedQty: 0,
  uom: 'EA',
  storageLocationId: 'bin-B',
  status: 'PENDING',
  sortOrder: 2,
};

const pickListFixture: PickListView = {
  workorderId: 'wo-001',
  pickListId: 'pl-001',
  status: 'OPEN',
  tasks: [taskA, taskB],
};

const scanMatchedA: ScanResolveResult = {
  pickTaskId: 'task-A',
  matched: true,
  matchStatus: 'MATCHED',
  resolvedSkuId: 'SKU-A',
  resolvedLocationId: 'bin-A',
};

function buildRoute(workorderId: string | null = 'wo-001') {
  return {
    snapshot: { paramMap: { get: vi.fn().mockReturnValue(workorderId) } },
  };
}

async function setupPickExecuteFixture(workorderId: string | null = 'wo-001', permissions: string[] | null = null) {
  session.permissions = permissions;
  await TestBed.configureTestingModule({
    imports: [PickExecutePageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: InventoryPickService, useValue: mockPickService },
      { provide: AuthService, useValue: authStub },
      { provide: ActivatedRoute, useValue: buildRoute(workorderId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(PickExecutePageComponent);
}

async function setupPickExecute(workorderId: string | null = 'wo-001', permissions: string[] | null = null) {
  return (await setupPickExecuteFixture(workorderId, permissions)).componentInstance;
}

describe('PickExecutePageComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPickService.getWorkorderPickList.mockReturnValue(of(pickListFixture));
  });

  it('initial load populates tasks and auto-selects the first task', async () => {
    const component = await setupPickExecute();

    expect(component.state()).toBe('ready');
    expect(component.tasks()).toEqual([taskA, taskB]);
    expect(component.activeTaskId()).toBe('task-A');
  });

  it('no pick list (null) sets state error with the load key', async () => {
    mockPickService.getWorkorderPickList.mockReturnValue(of(null));
    const component = await setupPickExecute();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOAD');
    expect(component.tasks()).toEqual([]);
  });

  it('selectTask switches the active task and resets the scan/confirm form', async () => {
    mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
    const component = await setupPickExecute();
    component.setScannedProductCode('SKU-A');
    component.setScannedLocationCode('bin-A');
    component.resolveScan();
    expect(component.scanMatched()).toBe(true);

    component.selectTask('task-B');

    expect(component.activeTaskId()).toBe('task-B');
    expect(component.scanResult()).toBeNull();
    expect(component.scannedProductCode()).toBe('');
    expect(component.confirmQty()).toBe(3); // taskB.requestedQty - taskB.pickedQty
  });

  it('resolveScan success (matched) sets scanResult and defaults confirmQty to the remaining quantity', async () => {
    mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
    const component = await setupPickExecute();

    component.setScannedProductCode('SKU-A');
    component.setScannedLocationCode('bin-A');
    component.resolveScan();

    expect(mockPickService.resolvePickScan).toHaveBeenCalledExactlyOnceWith('wo-001', 'task-A', {
      scannedProductCode: 'SKU-A',
      scannedLocationCode: 'bin-A',
    });
    expect(component.scanMatched()).toBe(true);
    expect(component.scanResultKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.SCAN_RESULT.MATCHED');
    expect(component.confirmQty()).toBe(5);
    expect(component.state()).toBe('ready');
  });

  it('resolveScan success (mismatch) surfaces the matching SCAN_RESULT key and leaves confirm hidden', async () => {
    mockPickService.resolvePickScan.mockReturnValue(
      of({ pickTaskId: 'task-A', matched: false, matchStatus: 'LOCATION_MISMATCH' }),
    );
    const component = await setupPickExecute();

    component.setScannedProductCode('SKU-A');
    component.setScannedLocationCode('bin-WRONG');
    component.resolveScan();

    expect(component.scanMatched()).toBe(false);
    expect(component.scanResultKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.SCAN_RESULT.LOCATION_MISMATCH');
  });

  // #2217: PRODUCT_CODE_UNAVAILABLE / LOCATION_CODE_UNAVAILABLE mean "this
  // task carries no replicated code to verify a code-based scan against yet"
  // — cannot verify, not wrong — and each renders its own localized message.
  describe.each([
    ['PRODUCT_CODE_UNAVAILABLE'],
    ['LOCATION_CODE_UNAVAILABLE'],
  ])('resolveScan success (%s)', (matchStatus) => {
    it('surfaces the matching SCAN_RESULT key', async () => {
      mockPickService.resolvePickScan.mockReturnValue(
        of({ pickTaskId: 'task-A', matched: false, matchStatus }),
      );
      const component = await setupPickExecute();

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();

      expect(component.scanMatched()).toBe(false);
      expect(component.scanResultKey()).toBe(`INVENTORY.FULFILLMENT.PICK_EXECUTE.SCAN_RESULT.${matchStatus}`);
    });
  });

  it('resolveScan error sets state error before errorKey (ADR-0031)', async () => {
    mockPickService.resolvePickScan.mockReturnValue(throwError(() => new Error('scan failed')));
    const component = await setupPickExecute();

    component.setScannedProductCode('SKU-A');
    component.setScannedLocationCode('bin-A');

    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => {
      calls.push(`state:${v}`);
      origState(v);
    });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => {
      if (v !== null) calls.push(`errorKey:${v}`);
      origError(v);
    });

    component.resolveScan();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.RESOLVE_SCAN');
  });

  it('confirmLine confirms the active task, then re-reads tasks and resets the scan form', async () => {
    mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
    const confirmedTask: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
    mockPickService.confirmPickLine.mockReturnValue(of(confirmedTask));
    mockPickService.getPickTasks.mockReturnValue(of([confirmedTask, taskB]));
    const component = await setupPickExecute();

    component.setScannedProductCode('SKU-A');
    component.setScannedLocationCode('bin-A');
    component.resolveScan();
    component.setConfirmQty(5);

    component.confirmLine();

    expect(mockPickService.confirmPickLine).toHaveBeenCalledExactlyOnceWith('wo-001', 'task-A', 5);
    expect(mockPickService.getPickTasks).toHaveBeenCalledExactlyOnceWith('wo-001');
    expect(component.tasks()).toEqual([confirmedTask, taskB]);
    expect(component.scanResult()).toBeNull();
    expect(component.pendingTaskId()).toBeNull();
    expect(component.activeTaskStatus()).toBeNull();
  });

  it('confirmLine error surfaces a task-scoped status, not a page-wide error (issue #374 finding 6)', async () => {
    mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
    mockPickService.confirmPickLine.mockReturnValue(throwError(() => new Error('confirm failed')));
    const component = await setupPickExecute();

    component.setScannedProductCode('SKU-A');
    component.setScannedLocationCode('bin-A');
    component.resolveScan();
    component.setConfirmQty(5);
    component.confirmLine();

    expect(component.state()).toBe('ready'); // no page-wide error
    expect(component.errorKey()).toBeNull();
    expect(component.pendingTaskId()).toBeNull();
    expect(component.activeTaskStatus()).toEqual({
      taskId: 'task-A',
      kind: 'error',
      key: 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.CONFIRM',
    });
  });

  // issue #374 finding 1: completeTask() must refuse (and the button stay
  // disabled) until the active task has nothing left to pick — otherwise a
  // mechanic can complete a task blind, bypassing scan/confirm entirely.
  describe('completeTask() guards on remaining quantity (issue #374 finding 1)', () => {
    it('refuses while the active task still has quantity remaining', async () => {
      const component = await setupPickExecute(); // taskA: requestedQty 5, pickedQty 0

      component.completeTask();

      expect(mockPickService.completePickTask).not.toHaveBeenCalled();
    });

    it('disables the Complete task button in the template while quantity remains', async () => {
      const fixture = await setupPickExecuteFixture('wo-001', [EXECUTE]);
      fixture.detectChanges();

      const completeButton: HTMLButtonElement | null =
        fixture.nativeElement.querySelectorAll('.scan-card .action-row button.btn-primary')[1] ?? null;
      expect(completeButton?.disabled).toBe(true);
    });

    it('enables the button and allows completion once picked reaches requested', async () => {
      const fullyPicked: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [fullyPicked, taskB] }),
      );
      mockPickService.completePickTask.mockReturnValue(of(fullyPicked));
      mockPickService.getPickTasks.mockReturnValue(of([fullyPicked, taskB]));
      const fixture = await setupPickExecuteFixture('wo-001', [EXECUTE]);
      fixture.detectChanges();

      const completeButton: HTMLButtonElement | null =
        fixture.nativeElement.querySelectorAll('.scan-card .action-row button.btn-primary')[1] ?? null;
      expect(completeButton?.disabled).toBe(false);

      fixture.componentInstance.completeTask();
      expect(mockPickService.completePickTask).toHaveBeenCalledExactlyOnceWith('wo-001', 'task-A');
    });
  });

  it('completeTask completes the active task, then re-reads tasks', async () => {
    const fullyPicked: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
    mockPickService.getWorkorderPickList.mockReturnValue(
      of({ ...pickListFixture, tasks: [fullyPicked, taskB] }),
    );
    const completedTask: PickTaskLine = { ...fullyPicked, status: 'PICKED' };
    mockPickService.completePickTask.mockReturnValue(of(completedTask));
    mockPickService.getPickTasks.mockReturnValue(of([completedTask, taskB]));
    const component = await setupPickExecute();

    component.completeTask();

    expect(mockPickService.completePickTask).toHaveBeenCalledExactlyOnceWith('wo-001', 'task-A');
    expect(mockPickService.getPickTasks).toHaveBeenCalledExactlyOnceWith('wo-001');
    expect(component.tasks()).toEqual([completedTask, taskB]);
    expect(component.pendingTaskId()).toBeNull();
    expect(component.activeTaskStatus()).toBeNull();
  });

  it('completeTask error surfaces a task-scoped status, not a page-wide error (issue #374 finding 6)', async () => {
    const fullyPicked: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
    mockPickService.getWorkorderPickList.mockReturnValue(
      of({ ...pickListFixture, tasks: [fullyPicked, taskB] }),
    );
    mockPickService.completePickTask.mockReturnValue(throwError(() => new Error('complete failed')));
    const component = await setupPickExecute();

    component.completeTask();

    expect(component.state()).toBe('ready'); // no page-wide error
    expect(component.errorKey()).toBeNull();
    expect(component.pendingTaskId()).toBeNull();
    expect(component.activeTaskStatus()).toEqual({
      taskId: 'task-A',
      kind: 'error',
      key: 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.COMPLETE',
    });
  });

  // ADR-0063 §1/§3/§4: a slower response for a task the mechanic has since
  // navigated away from must not land on the now-active task, but the busy
  // obligation it owes still settles so the new task isn't stuck disabled.
  describe('request-key race: switching the active task mid-request', () => {
    it('a confirmLine in flight for task A does not corrupt task B after switching, and its poll is cancelled (issue #374 findings 5/6)', async () => {
      mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
      const confirm$ = new Subject<PickTaskLine>();
      mockPickService.confirmPickLine.mockReturnValue(confirm$);
      const component = await setupPickExecute();

      // Resolve a scan for task A and confirm it — held open via the Subject.
      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      component.setConfirmQty(5);
      component.confirmLine();
      expect(component.pendingTaskId()).toBe('task-A');
      expect(component.activeTaskPending()).toBe(true);

      // The mechanic switches to task B before A's confirm resolves — this
      // abandons A's poll obligation immediately (ADR-0063 §2/§4).
      component.selectTask('task-B');
      expect(component.activeTaskId()).toBe('task-B');
      expect(component.scanResult()).toBeNull();
      expect(component.confirmQty()).toBe(3);
      expect(component.pendingTaskId()).toBeNull();
      expect(component.activeTaskPending()).toBe(false);

      // A's confirm now lands; the readback it triggers still refreshes the
      // authoritative task list (server truth)...
      const confirmedA: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
      mockPickService.getPickTasks.mockReturnValue(of([confirmedA, taskB]));
      confirm$.next(confirmedA);
      confirm$.complete();

      expect(component.tasks()).toEqual([confirmedA, taskB]);
      // ...but task B's own scan/confirm form was not touched by A's response,
      // and A's now-superseded mutation didn't reinstate a pending/error state.
      expect(component.activeTaskId()).toBe('task-B');
      expect(component.scanResult()).toBeNull();
      expect(component.confirmQty()).toBe(3);
      expect(component.pendingTaskId()).toBeNull();
      expect(component.activeTaskStatus()).toBeNull();
      expect(component.state()).toBe('ready');
    });

    it('a resolveScan in flight for task A does not set scanResult for task B after switching', async () => {
      const scan$ = new Subject<ScanResolveResult>();
      mockPickService.resolvePickScan.mockReturnValue(scan$);
      const component = await setupPickExecute();

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      expect(component.state()).toBe('mutating');

      component.selectTask('task-B');
      scan$.next(scanMatchedA);
      scan$.complete();

      expect(component.activeTaskId()).toBe('task-B');
      expect(component.scanResult()).toBeNull();
      expect(component.state()).toBe('ready'); // unstuck, not left busy forever
    });

    it('a resolveScan error for task A settles quietly after switching to task B, not as a page-level error (issue #374 finding 1)', async () => {
      const scan$ = new Subject<ScanResolveResult>();
      mockPickService.resolvePickScan.mockReturnValue(scan$);
      const component = await setupPickExecute();

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      expect(component.state()).toBe('mutating');

      // The mechanic switches away before the scan settles — this abandons
      // the scan's ownership immediately, unsticking the busy state without
      // waiting on the late response.
      component.selectTask('task-B');
      expect(component.state()).toBe('ready');

      // Task A's scan now fails, long after the mechanic moved on. Before
      // the fix, `scanReqSeq` was never bumped by `selectTask()`, so this
      // late failure would still match and push task B's page into a
      // page-level error.
      scan$.error(new Error('scan failed'));

      expect(component.state()).toBe('ready');
      expect(component.errorKey()).toBeNull();
      expect(component.activeTaskId()).toBe('task-B');
    });

    it('a getPickTasks readback failure superseded by a task switch settles quietly, not as a page-level error (issue #374 finding 3)', async () => {
      const readyToClose: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PENDING' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [readyToClose, taskB] }),
      );
      mockPickService.completePickTask.mockReturnValue(of(readyToClose));
      const readback$ = new Subject<PickTaskLine[]>();
      mockPickService.getPickTasks.mockReturnValue(readback$);
      const component = await setupPickExecute();

      component.completeTask();
      expect(component.pendingTaskId()).toBe('task-A');

      // The mechanic switches to task B before the post-mutation readback
      // resolves — this abandons the obligation (ADR-0063 §2/§4).
      component.selectTask('task-B');
      expect(component.pendingTaskId()).toBeNull();

      // The abandoned readback now fails. Before the fix, `applyRefreshError`
      // ignored `mutSeq` entirely and would still push the page into
      // `error`, replacing task B's working view with a refresh error.
      readback$.error(new Error('refresh failed'));

      expect(component.state()).toBe('ready');
      expect(component.errorKey()).toBeNull();
      expect(component.activeTaskId()).toBe('task-B');
    });
  });

  // issue #374 finding 1: a full (re)load must also abandon any in-flight
  // scan — its late arrival must not repopulate the confirm UI over
  // freshly-reloaded data.
  describe('reload() abandons an in-flight scan (issue #374 finding 1)', () => {
    it('a scan resolved after reload() does not repopulate scanResult', async () => {
      const scan$ = new Subject<ScanResolveResult>();
      mockPickService.resolvePickScan.mockReturnValue(scan$);
      const component = await setupPickExecute();

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      expect(component.state()).toBe('mutating');

      // A full reload starts before the scan resolves.
      mockPickService.getWorkorderPickList.mockReturnValue(of(pickListFixture));
      component.reload();
      expect(component.state()).toBe('ready'); // reload's own (synchronous) load already settled

      // The abandoned scan now lands. Before the fix, `loadPickList()` never
      // bumped `scanReqSeq`, so this late success would still repopulate the
      // confirm UI over the reloaded page.
      scan$.next(scanMatchedA);
      scan$.complete();

      expect(component.scanResult()).toBeNull();
      expect(component.state()).toBe('ready');
    });
  });

  // issue #374 finding 2: confirmLine() must reject an over-pick, NaN, or
  // infinite quantity itself — the input's `max` attribute is not a
  // programmatic guard, so it never blocks calling this method directly.
  describe('confirmLine validates quantity before calling the facade (issue #374 finding 2)', () => {
    beforeEach(() => {
      mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
    });

    it('refuses a quantity beyond what remains on the task (over-pick)', async () => {
      const component = await setupPickExecute(); // taskA: requestedQty 5, pickedQty 0
      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      component.setConfirmQty(6); // > activeTaskRemainingQty() (5)

      component.confirmLine();

      expect(mockPickService.confirmPickLine).not.toHaveBeenCalled();
    });

    it('refuses a NaN quantity', async () => {
      const component = await setupPickExecute();
      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      component.setConfirmQty(NaN);

      component.confirmLine();

      expect(mockPickService.confirmPickLine).not.toHaveBeenCalled();
    });

    it('refuses an infinite quantity', async () => {
      const component = await setupPickExecute();
      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      component.setConfirmQty(Infinity);

      component.confirmLine();

      expect(mockPickService.confirmPickLine).not.toHaveBeenCalled();
    });

    it('allows a valid, in-range quantity through to the facade', async () => {
      const confirmedTask: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
      mockPickService.confirmPickLine.mockReturnValue(of(confirmedTask));
      mockPickService.getPickTasks.mockReturnValue(of([confirmedTask, taskB]));
      const component = await setupPickExecute();
      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      component.setConfirmQty(5); // == activeTaskRemainingQty()

      component.confirmLine();

      expect(mockPickService.confirmPickLine).toHaveBeenCalledExactlyOnceWith('wo-001', 'task-A', 5);
    });

    it('disables the confirm control in the template for an over-pick quantity, not only via the input max attribute', async () => {
      const fixture = await setupPickExecuteFixture('wo-001', [EXECUTE]);
      const component = fixture.componentInstance;
      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      component.setConfirmQty(6);
      fixture.detectChanges();

      const confirmButton: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('.pending-section button.btn-primary');
      expect(confirmButton?.disabled).toBe(true);

      component.setConfirmQty(5);
      fixture.detectChanges();
      expect(confirmButton?.disabled).toBe(false);
    });
  });

  // ADR-0040 §6a.1/§6a.5: every write control gates on inventory:pick_list:execute
  // independently, matching what WorkorderPickFacadeController enforces — not the
  // inventory:pick_list:view the route used to carry (issue #347 group 5, #369).
  describe('permissions (inventory:pick_list:execute)', () => {
    it('allows scan/confirm/complete for a session holding inventory:pick_list:execute', async () => {
      mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
      const confirmedTask: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
      mockPickService.confirmPickLine.mockReturnValue(of(confirmedTask));
      mockPickService.getPickTasks.mockReturnValue(of([confirmedTask, taskB]));
      mockPickService.completePickTask.mockReturnValue(of(confirmedTask));
      const component = await setupPickExecute('wo-001', [EXECUTE]);

      expect(component.canExecute()).toBe(true);

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      expect(mockPickService.resolvePickScan).toHaveBeenCalledTimes(1);

      component.setConfirmQty(5);
      component.confirmLine();
      expect(mockPickService.confirmPickLine).toHaveBeenCalledTimes(1);

      component.completeTask();
      expect(mockPickService.completePickTask).toHaveBeenCalledTimes(1);
    });

    it('refuses scan/confirm/complete for a view-only session (the pre-fix authority)', async () => {
      const fixture = await setupPickExecuteFixture('wo-001', ['inventory:pick_list:view']);
      const component = fixture.componentInstance;

      expect(component.canExecute()).toBe(false);

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      expect(mockPickService.resolvePickScan).not.toHaveBeenCalled();

      component.completeTask();
      expect(mockPickService.completePickTask).not.toHaveBeenCalled();

      // Independent control assertions (ADR-0040 §6a.5): scan and complete
      // must be disabled in the rendered template too, not only refused
      // imperatively — a template regression removing a [disabled] binding
      // would otherwise pass while these buttons stayed clickable.
      fixture.detectChanges();
      const scanButton: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('.scan-card .action-row button.btn-primary');
      const completeButton: HTMLButtonElement | null =
        fixture.nativeElement.querySelectorAll('.scan-card .action-row button.btn-primary')[1] ?? null;
      expect(scanButton?.disabled).toBe(true);
      expect(completeButton?.disabled).toBe(true);

      // Force a matched scan so the confirm control renders, then check its
      // independent disablement and that confirmLine() itself refuses too.
      component.scanResult.set(scanMatchedA);
      component.setConfirmQty(5);
      fixture.detectChanges();
      const confirmButton: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('.pending-section button.btn-primary');
      expect(confirmButton?.disabled).toBe(true);

      component.confirmLine();
      expect(mockPickService.confirmPickLine).not.toHaveBeenCalled();
    });

    it('treats an unknown permission claim (legacy token) as granted, matching canAccess()', async () => {
      const component = await setupPickExecute('wo-001', null);

      expect(component.canExecute()).toBe(true);
    });
  });

  // issue #374 finding 2: "all tasks complete" gates on the backend's own
  // completion status (PickTaskStatus.PICKED), never a local quantity check —
  // a queued (202 PENDING) confirm can make picked>=requested true on the
  // stale pre-readback snapshot before the command has actually applied.
  describe('allTasksComplete gates on backend status, not quantity (issue #374 finding 2)', () => {
    it('is false when quantity looks satisfied but status has not caught up yet', async () => {
      const notYetPicked: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PENDING' };
      const fullyPickedB: PickTaskLine = { ...taskB, pickedQty: 3, status: 'PICKED' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [notYetPicked, fullyPickedB] }),
      );
      const component = await setupPickExecute();

      expect(component.allTasksComplete()).toBe(false);
    });

    it('is true once every task carries the backend PICKED status', async () => {
      const pickedA: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
      const pickedB: PickTaskLine = { ...taskB, pickedQty: 3, status: 'PICKED' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [pickedA, pickedB] }),
      );
      const component = await setupPickExecute();

      expect(component.allTasksComplete()).toBe(true);
    });
  });

  // issue #374 finding 3: the task DTO never carries a human-readable location
  // code today — the fallback must land on COMMON.NOT_AVAILABLE, never the raw
  // storageLocationId UUID (ADR-0064 §5).
  describe('location column never renders the raw location id (issue #374 finding 3)', () => {
    it('shows the location code when present', async () => {
      const withCode: PickTaskLine = { ...taskA, storageLocationCode: 'A-01-03' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [withCode, taskB] }),
      );
      const fixture = await setupPickExecuteFixture();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('A-01-03');
      expect(text).not.toContain('bin-A');
    });

    it('falls back to COMMON.NOT_AVAILABLE, never the raw storageLocationId, when no code exists', async () => {
      const fixture = await setupPickExecuteFixture();
      fixture.detectChanges();

      // Neither task fixture carries a storageLocationCode — the raw
      // storageLocationId UUID must never leak into rendered text (ADR-0064 §5).
      const text = fixture.nativeElement.textContent as string;
      expect(text).not.toContain('bin-A');
      expect(text).not.toContain('bin-B');
      const locationCells = fixture.nativeElement.querySelectorAll('.data-table tbody td:nth-child(2)');
      expect(locationCells.length).toBe(2);
      locationCells.forEach((cell: HTMLElement) => {
        expect(cell.textContent?.trim()).toBe('COMMON.NOT_AVAILABLE');
      });
    });
  });

  // issue #374 finding 4: task selection is a toggle-button widget, not a
  // "current page" landmark — aria-pressed matches Label in Name / widget
  // semantics (ADR-0029 §8.8), aria-current does not.
  describe('task selection uses aria-pressed, not aria-current (issue #374 finding 4)', () => {
    it('reflects pressed state per row and never renders aria-current', async () => {
      const fixture = await setupPickExecuteFixture();
      fixture.detectChanges();

      const buttons: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.select-task-btn'),
      );
      expect(buttons).toHaveLength(2);
      expect(buttons[0].getAttribute('aria-pressed')).toBe('true'); // task-A auto-selected
      expect(buttons[0].getAttribute('aria-current')).toBeNull();
      expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
      expect(buttons[1].getAttribute('aria-current')).toBeNull();
    });
  });

  // issue #374 finding 5: confirm/complete return 202 PENDING and apply
  // asynchronously — a single readback can be stale, so the page must poll
  // getPickTasks (bounded, with backoff) until the task reflects the command.
  describe('post-mutation polling (issue #374 finding 5)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('settles on the attempt that reflects the change, disabling controls meanwhile', async () => {
      mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
      mockPickService.confirmPickLine.mockReturnValue(of(taskA)); // command accepted, 202 PENDING
      const stillPending: PickTaskLine = { ...taskA, status: 'PENDING' }; // not applied yet
      const applied: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
      mockPickService.getPickTasks
        .mockReturnValueOnce(of([stillPending, taskB])) // attempt 1: not yet
        .mockReturnValueOnce(of([stillPending, taskB])) // attempt 2: not yet
        .mockReturnValueOnce(of([applied, taskB])); // attempt 3: applied
      const component = await setupPickExecute();

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      component.setConfirmQty(5);
      component.confirmLine();

      // Attempt 1 fired synchronously off the command's success.
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(1);
      expect(component.activeTaskPending()).toBe(true);
      expect(component.tasks()).toEqual([stillPending, taskB]);

      vi.advanceTimersByTime(500); // backoff before attempt 2
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(2);
      expect(component.activeTaskPending()).toBe(true); // still processing

      vi.advanceTimersByTime(1000); // backoff before attempt 3
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(3);
      expect(component.tasks()).toEqual([applied, taskB]);
      expect(component.activeTaskPending()).toBe(false); // settled
      expect(component.activeTaskStatus()).toBeNull();

      // No further polling once settled.
      vi.advanceTimersByTime(10_000);
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(3);
    });

    it('a concurrent partial change does not settle a confirm; only this command\'s quantity does', async () => {
      mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
      mockPickService.confirmPickLine.mockReturnValue(of(taskA));
      const concurrent: PickTaskLine = { ...taskA, pickedQty: taskA.pickedQty + 1, status: 'PENDING' };
      const applied: PickTaskLine = { ...taskA, pickedQty: taskA.pickedQty + 5, status: 'PENDING' };
      mockPickService.getPickTasks
        .mockReturnValueOnce(of([concurrent, taskB])) // someone else picked 1: not this command
        .mockReturnValueOnce(of([applied, taskB])); // this command's +5 landed
      const component = await setupPickExecute();

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      component.setConfirmQty(5);
      component.confirmLine();

      expect(component.activeTaskPending()).toBe(true); // +1 is not this confirm's result
      vi.advanceTimersByTime(500);
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(2);
      expect(component.activeTaskPending()).toBe(false);
    });

    it('a complete does not settle on quantity alone, only on the PICKED status', async () => {
      mockPickService.completePickTask.mockReturnValue(of(taskA));
      const readyToClose: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PENDING' };
      const closed: PickTaskLine = { ...readyToClose, status: 'PICKED' };
      mockPickService.getWorkorderPickList.mockReturnValue(of({ ...pickListFixture, tasks: [readyToClose, taskB] }));
      mockPickService.getPickTasks
        .mockReturnValueOnce(of([readyToClose, taskB])) // full quantity, but the complete hasn't applied
        .mockReturnValueOnce(of([closed, taskB]));
      const component = await setupPickExecute();

      component.completeTask();
      expect(component.activeTaskPending()).toBe(true);
      vi.advanceTimersByTime(500);
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(2);
      expect(component.activeTaskPending()).toBe(false);
    });

    it('shows a localized still-processing message after exhausting all attempts', async () => {
      mockPickService.completePickTask.mockReturnValue(of(taskA));
      const notYetApplied: PickTaskLine = { ...taskA, status: 'PENDING' };
      mockPickService.getPickTasks.mockReturnValue(of([notYetApplied, taskB]));
      // completeTask() requires remaining <= 0; use a task already at its
      // requested quantity so the guard (finding 1) doesn't block the call.
      const readyToClose: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PENDING' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [readyToClose, taskB] }),
      );
      const component = await setupPickExecute();

      component.completeTask();
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(1); // attempt 1

      vi.advanceTimersByTime(500); // attempt 2
      vi.advanceTimersByTime(1000); // attempt 3
      vi.advanceTimersByTime(2000); // attempt 4
      vi.advanceTimersByTime(4000); // attempt 5
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(5);

      expect(component.activeTaskPending()).toBe(false);
      expect(component.activeTaskStatus()).toEqual({
        taskId: 'task-A',
        kind: 'stalled',
        key: 'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.STILL_PROCESSING',
      });

      // Exhaustion stops polling — no 6th attempt.
      vi.advanceTimersByTime(20_000);
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(5);
    });

    it('cancels polling when the mechanic switches tasks before it settles', async () => {
      mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
      mockPickService.confirmPickLine.mockReturnValue(of(taskA));
      const stillPending: PickTaskLine = { ...taskA, status: 'PENDING' };
      mockPickService.getPickTasks.mockReturnValue(of([stillPending, taskB]));
      const component = await setupPickExecute();

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      component.setConfirmQty(5);
      component.confirmLine();
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(1); // attempt 1

      component.selectTask('task-B');
      expect(component.pendingTaskId()).toBeNull();

      // The scheduled backoff timer for attempt 2 must not fire another read.
      vi.advanceTimersByTime(10_000);
      expect(mockPickService.getPickTasks).toHaveBeenCalledTimes(1);
    });
  });

  // issue #374 finding 6: a late confirm/complete failure must be scoped to
  // the task it belongs to — never surfaced as a page-wide error once the
  // mechanic has moved on to another task (Subject-driven, ADR-0035 §6-7).
  describe('mutation errors are task-scoped, not page-wide (issue #374 finding 6)', () => {
    it('a late completeTask failure for task A after switching to B settles quietly, with no page error', async () => {
      const readyToClose: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PENDING' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [readyToClose, taskB] }),
      );
      const complete$ = new Subject<PickTaskLine>();
      mockPickService.completePickTask.mockReturnValue(complete$);
      const component = await setupPickExecute();

      component.completeTask();
      expect(component.pendingTaskId()).toBe('task-A');

      component.selectTask('task-B');
      expect(component.pendingTaskId()).toBeNull();
      expect(component.activeTaskId()).toBe('task-B');

      // Task A's command now fails, long after the mechanic moved on.
      complete$.error(new Error('complete failed'));

      // No page-wide error, and B's own (unrelated) view is untouched.
      expect(component.state()).toBe('ready');
      expect(component.errorKey()).toBeNull();
      expect(component.activeTaskId()).toBe('task-B');
      expect(component.activeTaskStatus()).toBeNull();
      expect(component.pendingTaskId()).toBeNull();
    });

    it('an error for the still-active task renders scoped to it, not through the page errorKey', async () => {
      const complete$ = new Subject<PickTaskLine>();
      const readyToClose: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PENDING' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [readyToClose, taskB] }),
      );
      mockPickService.completePickTask.mockReturnValue(complete$);
      const fixture = await setupPickExecuteFixture();
      const component = fixture.componentInstance;

      component.completeTask();
      complete$.error(new Error('complete failed'));
      fixture.detectChanges();

      expect(component.state()).toBe('ready');
      expect(component.errorKey()).toBeNull();
      const scoped = fixture.nativeElement.querySelector('.scan-card [role="alert"]');
      expect(scoped?.textContent).toContain('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.COMPLETE');
    });

    it('a workorder-wide readback failure after a successful command stays page-level (finding 6, contrast case)', async () => {
      const readyToClose: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PENDING' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [readyToClose, taskB] }),
      );
      mockPickService.completePickTask.mockReturnValue(of(readyToClose));
      mockPickService.getPickTasks.mockReturnValue(throwError(() => new Error('refresh failed')));
      const component = await setupPickExecute();

      component.completeTask();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.REFRESH');
      expect(component.pendingTaskId()).toBeNull();
      expect(component.activeTaskStatus()).toBeNull(); // not task-scoped — it's the shared read
    });

    it('a readback failure moves focus to the error card retry action (the confirm/complete controls unmount)', async () => {
      const readyToClose: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PENDING' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [readyToClose, taskB] }),
      );
      mockPickService.completePickTask.mockReturnValue(of(readyToClose));
      mockPickService.getPickTasks.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'LOCATION_SCOPE_DENIED' } })),
      );
      const fixture = await setupPickExecuteFixture('wo-001', [EXECUTE]);
      fixture.detectChanges();

      fixture.componentInstance.completeTask();
      fixture.detectChanges();
      await fixture.whenStable();

      const retry: HTMLButtonElement | null = fixture.nativeElement.querySelector('.btn-secondary');
      expect(fixture.componentInstance.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOCATION_SCOPE_DENIED');
      expect(retry).not.toBeNull();
      expect(document.activeElement).toBe(retry);
    });
  });

  // #2217: a mechanic's scanner sends Enter after every code — the first
  // Enter (product code) must advance to the location-code field rather than
  // firing a half-filled resolve; the second (location code) submits. Fields
  // clear immediately once the scan is issued, ready for the next attempt.
  describe('scanner Enter flow (#2217)', () => {
    it('Enter in the product-code field moves focus to the location-code field without submitting', async () => {
      const fixture = await setupPickExecuteFixture('wo-001', [EXECUTE]);
      fixture.detectChanges();

      const productInput: HTMLInputElement = fixture.nativeElement.querySelector('#scan-product-code');
      const locationInput: HTMLInputElement = fixture.nativeElement.querySelector('#scan-location-code');
      productInput.value = 'UPC-001';
      productInput.dispatchEvent(new Event('input'));
      productInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();
      await Promise.resolve(); // flush the queued focus() call

      expect(document.activeElement).toBe(locationInput);
      expect(mockPickService.resolvePickScan).not.toHaveBeenCalled();
    });

    it('Enter in the location-code field submits the scan', async () => {
      mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
      const fixture = await setupPickExecuteFixture('wo-001', [EXECUTE]);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      fixture.detectChanges();

      const locationInput: HTMLInputElement = fixture.nativeElement.querySelector('#scan-location-code');
      locationInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(mockPickService.resolvePickScan).toHaveBeenCalledExactlyOnceWith('wo-001', 'task-A', {
        scannedProductCode: 'SKU-A',
        scannedLocationCode: 'bin-A',
      });
    });

    it('switching to another task refocuses the product-code field', async () => {
      const fixture = await setupPickExecuteFixture('wo-001', [EXECUTE]);
      fixture.detectChanges();

      const productInput: HTMLInputElement = fixture.nativeElement.querySelector('#scan-product-code');
      productInput.blur();
      fixture.componentInstance.selectTask('task-B');
      fixture.detectChanges();
      await Promise.resolve(); // flush the queued focus() call

      expect(document.activeElement).toBe(productInput);
    });

    it('refocuses the product-code field only once an async scan settles and the input is re-enabled', async () => {
      const pending = new Subject<ScanResolveResult>();
      mockPickService.resolvePickScan.mockReturnValue(pending.asObservable());
      const fixture = await setupPickExecuteFixture('wo-001', [EXECUTE]);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const productInput: HTMLInputElement = fixture.nativeElement.querySelector('#scan-product-code');

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      fixture.detectChanges();
      expect(productInput.hasAttribute('disabled')).toBe(true);

      pending.next(scanMatchedA);
      pending.complete();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(productInput.hasAttribute('disabled')).toBe(false);
      expect(document.activeElement).toBe(productInput);
    });

    it('moves focus to the error card retry action when a scan fails (inputs are no longer rendered)', async () => {
      mockPickService.resolvePickScan.mockReturnValue(throwError(() => new Error('boom')));
      const fixture = await setupPickExecuteFixture('wo-001', [EXECUTE]);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      fixture.detectChanges();
      await fixture.whenStable();

      const retry: HTMLButtonElement | null = fixture.nativeElement.querySelector('.btn-secondary');
      expect(fixture.nativeElement.querySelector('#scan-product-code')).toBeNull();
      expect(retry).not.toBeNull();
      expect(document.activeElement).toBe(retry);
    });

    it('clears both scan fields immediately once the scan is issued', async () => {
      mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
      const component = await setupPickExecute();

      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();

      expect(component.scannedProductCode()).toBe('');
      expect(component.scannedLocationCode()).toBe('');
    });
  });

  // #2204/#2225: every pick-facade endpoint is now location-scoped. A
  // LOCATION_SCOPE_DENIED 403 means the caller's location scope no longer
  // covers this workorder's site at all — a page-wide condition, never a
  // per-task one, even when it surfaces from a per-task mutation.
  describe('LOCATION_SCOPE_DENIED maps to a localized error (#2204/#2225)', () => {
    const scopeDenied = () =>
      new HttpErrorResponse({ status: 403, statusText: 'Forbidden', error: { code: 'LOCATION_SCOPE_DENIED' } });

    it('the initial load', async () => {
      mockPickService.getWorkorderPickList.mockReturnValue(throwError(() => scopeDenied()));
      const component = await setupPickExecute();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOCATION_SCOPE_DENIED');
    });

    it('resolveScan', async () => {
      mockPickService.resolvePickScan.mockReturnValue(throwError(() => scopeDenied()));
      const component = await setupPickExecute();
      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');

      component.resolveScan();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOCATION_SCOPE_DENIED');
    });

    it('confirmLine surfaces it page-wide, not scoped to the task', async () => {
      mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
      mockPickService.confirmPickLine.mockReturnValue(throwError(() => scopeDenied()));
      const component = await setupPickExecute();
      component.setScannedProductCode('SKU-A');
      component.setScannedLocationCode('bin-A');
      component.resolveScan();
      component.setConfirmQty(5);

      component.confirmLine();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOCATION_SCOPE_DENIED');
      expect(component.pendingTaskId()).toBeNull();
      expect(component.activeTaskStatus()).toBeNull(); // not task-scoped
    });

    it('completeTask surfaces it page-wide', async () => {
      const fullyPicked: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [fullyPicked, taskB] }),
      );
      mockPickService.completePickTask.mockReturnValue(throwError(() => scopeDenied()));
      const component = await setupPickExecute();

      component.completeTask();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOCATION_SCOPE_DENIED');
    });

    it('the post-mutation readback failing with the same code maps too', async () => {
      const readyToClose: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PENDING' };
      mockPickService.getWorkorderPickList.mockReturnValue(
        of({ ...pickListFixture, tasks: [readyToClose, taskB] }),
      );
      mockPickService.completePickTask.mockReturnValue(of(readyToClose));
      mockPickService.getPickTasks.mockReturnValue(throwError(() => scopeDenied()));
      const component = await setupPickExecute();

      component.completeTask();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOCATION_SCOPE_DENIED');
    });

    it('a plain 403 without the scope-denied code keeps the generic load error', async () => {
      mockPickService.getWorkorderPickList.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
      );
      const component = await setupPickExecute();

      expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOAD');
    });
  });
});
