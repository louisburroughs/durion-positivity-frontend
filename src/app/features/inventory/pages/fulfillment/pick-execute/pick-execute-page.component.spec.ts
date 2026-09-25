import { TestBed } from '@angular/core/testing';
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
    component.setScannedSkuId('SKU-A');
    component.setScannedLocationId('bin-A');
    component.resolveScan();
    expect(component.scanMatched()).toBe(true);

    component.selectTask('task-B');

    expect(component.activeTaskId()).toBe('task-B');
    expect(component.scanResult()).toBeNull();
    expect(component.scannedSkuId()).toBe('');
    expect(component.confirmQty()).toBe(3); // taskB.requestedQty - taskB.pickedQty
  });

  it('resolveScan success (matched) sets scanResult and defaults confirmQty to the remaining quantity', async () => {
    mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
    const component = await setupPickExecute();

    component.setScannedSkuId('SKU-A');
    component.setScannedLocationId('bin-A');
    component.resolveScan();

    expect(mockPickService.resolvePickScan).toHaveBeenCalledExactlyOnceWith('wo-001', 'task-A', {
      scannedSkuId: 'SKU-A',
      scannedLocationId: 'bin-A',
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

    component.setScannedSkuId('SKU-A');
    component.setScannedLocationId('bin-WRONG');
    component.resolveScan();

    expect(component.scanMatched()).toBe(false);
    expect(component.scanResultKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.SCAN_RESULT.LOCATION_MISMATCH');
  });

  it('resolveScan error sets state error before errorKey (ADR-0031)', async () => {
    mockPickService.resolvePickScan.mockReturnValue(throwError(() => new Error('scan failed')));
    const component = await setupPickExecute();

    component.setScannedSkuId('SKU-A');
    component.setScannedLocationId('bin-A');

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

    component.setScannedSkuId('SKU-A');
    component.setScannedLocationId('bin-A');
    component.resolveScan();
    component.setConfirmQty(5);

    component.confirmLine();

    expect(mockPickService.confirmPickLine).toHaveBeenCalledExactlyOnceWith('wo-001', 'task-A', 5);
    expect(mockPickService.getPickTasks).toHaveBeenCalledExactlyOnceWith('wo-001');
    expect(component.tasks()).toEqual([confirmedTask, taskB]);
    expect(component.scanResult()).toBeNull();
    expect(component.state()).toBe('ready');
  });

  it('confirmLine error sets state error with the confirm key', async () => {
    mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
    mockPickService.confirmPickLine.mockReturnValue(throwError(() => new Error('confirm failed')));
    const component = await setupPickExecute();

    component.setScannedSkuId('SKU-A');
    component.setScannedLocationId('bin-A');
    component.resolveScan();
    component.setConfirmQty(5);
    component.confirmLine();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.CONFIRM');
  });

  it('completeTask completes the active task, then re-reads tasks', async () => {
    const completedTask: PickTaskLine = { ...taskA, pickedQty: 5, status: 'COMPLETE' };
    mockPickService.completePickTask.mockReturnValue(of(completedTask));
    mockPickService.getPickTasks.mockReturnValue(of([completedTask, taskB]));
    const component = await setupPickExecute();

    component.completeTask();

    expect(mockPickService.completePickTask).toHaveBeenCalledExactlyOnceWith('wo-001', 'task-A');
    expect(mockPickService.getPickTasks).toHaveBeenCalledExactlyOnceWith('wo-001');
    expect(component.tasks()).toEqual([completedTask, taskB]);
    expect(component.state()).toBe('ready');
  });

  it('completeTask error sets state error with the complete key', async () => {
    mockPickService.completePickTask.mockReturnValue(throwError(() => new Error('complete failed')));
    const component = await setupPickExecute();

    component.completeTask();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.COMPLETE');
  });

  // ADR-0063 §1/§3/§4: a slower response for a task the mechanic has since
  // navigated away from must not land on the now-active task, but the busy
  // obligation it owes still settles so the new task isn't stuck disabled.
  describe('request-key race: switching the active task mid-request', () => {
    it('a confirmLine in flight for task A does not corrupt task B after switching', async () => {
      mockPickService.resolvePickScan.mockReturnValue(of(scanMatchedA));
      const confirm$ = new Subject<PickTaskLine>();
      mockPickService.confirmPickLine.mockReturnValue(confirm$);
      const component = await setupPickExecute();

      // Resolve a scan for task A and confirm it — held open via the Subject.
      component.setScannedSkuId('SKU-A');
      component.setScannedLocationId('bin-A');
      component.resolveScan();
      component.setConfirmQty(5);
      component.confirmLine();
      expect(component.state()).toBe('mutating');

      // The mechanic switches to task B before A's confirm resolves.
      component.selectTask('task-B');
      expect(component.activeTaskId()).toBe('task-B');
      expect(component.scanResult()).toBeNull();
      expect(component.confirmQty()).toBe(3);

      // A's confirm now lands; its readback reports A picked, B untouched.
      const confirmedA: PickTaskLine = { ...taskA, pickedQty: 5, status: 'PICKED' };
      mockPickService.getPickTasks.mockReturnValue(of([confirmedA, taskB]));
      confirm$.next(confirmedA);
      confirm$.complete();

      // The authoritative tasks list still refreshes (server truth)...
      expect(component.tasks()).toEqual([confirmedA, taskB]);
      // ...but task B's own scan/confirm form was not touched by A's response.
      expect(component.activeTaskId()).toBe('task-B');
      expect(component.scanResult()).toBeNull();
      expect(component.confirmQty()).toBe(3);
      // The busy state A's confirm owed still settles, so B isn't stuck disabled.
      expect(component.state()).toBe('ready');
    });

    it('a resolveScan in flight for task A does not set scanResult for task B after switching', async () => {
      const scan$ = new Subject<ScanResolveResult>();
      mockPickService.resolvePickScan.mockReturnValue(scan$);
      const component = await setupPickExecute();

      component.setScannedSkuId('SKU-A');
      component.setScannedLocationId('bin-A');
      component.resolveScan();
      expect(component.state()).toBe('mutating');

      component.selectTask('task-B');
      scan$.next(scanMatchedA);
      scan$.complete();

      expect(component.activeTaskId()).toBe('task-B');
      expect(component.scanResult()).toBeNull();
      expect(component.state()).toBe('ready'); // unstuck, not left busy forever
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

      component.setScannedSkuId('SKU-A');
      component.setScannedLocationId('bin-A');
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

      component.setScannedSkuId('SKU-A');
      component.setScannedLocationId('bin-A');
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
});
