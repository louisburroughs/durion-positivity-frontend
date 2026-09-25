import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PickExecutePageComponent } from './pick-execute-page.component';
import { InventoryPickService } from '../../../services/inventory-pick.service';
import { PickExecuteLine, PickListView, PickTaskLine } from '../../../models/inventory-pick.models';
import { AuthService } from '../../../../../core/services/auth.service';
import { INVENTORY_PAGE } from '../../../../../core/security/route-permissions';

const mockPickService = {
  getWorkorderPickList: vi.fn(),
  resolvePickScan: vi.fn(),
  confirmPickLine: vi.fn(),
  completePickList: vi.fn(),
};

const EXECUTE = INVENTORY_PAGE.pickExecute[0];

/** `null` = token with no permission claim (permissions unknown), as in AuthService. */
const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(p => session.permissions?.includes(p) ?? false),
};

const pickTaskLine: PickTaskLine = {
  pickTaskId: 'task-001',
  productSku: 'SKU-001',
  requestedQty: 5,
  pickedQty: 0,
  uom: 'EA',
  status: 'PENDING',
};

const pickListFixture: PickListView = {
  workorderId: 'wo-001',
  pickListId: 'pl-001',
  status: 'OPEN',
  tasks: [pickTaskLine],
};

const executeLineFixture: PickExecuteLine = {
  pickLineId: 'pline-001',
  pickTaskId: 'task-001',
  productSku: 'SKU-001',
  requestedQty: 5,
  confirmedQty: 0,
  status: 'PENDING',
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

  it('initial load sets state ready and populates lines', async () => {
    const component = await setupPickExecute();

    expect(component.state()).toBe('ready');
    expect(component.lines().length).toBeGreaterThan(0);
  });

  it('no pick list (null) sets state error with the load key', async () => {
    mockPickService.getWorkorderPickList.mockReturnValue(of(null));
    const component = await setupPickExecute();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.LOAD');
    expect(component.lines()).toEqual([]);
  });

  it('scan resolve success sets pendingLine', async () => {
    mockPickService.resolvePickScan.mockReturnValue(of([executeLineFixture]));
    const component = await setupPickExecute();

    component.setScanInput('BARCODE-123');
    component.resolveScan();

    expect(component.pendingLine()).toEqual(executeLineFixture);
  });

  it('scan error sets state error before errorKey (ADR-0031)', async () => {
    mockPickService.resolvePickScan.mockReturnValue(
      throwError(() => new Error('scan failed')),
    );
    const component = await setupPickExecute();

    component.setScanInput('BARCODE-BAD');

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
    expect(component.errorKey()).toBe(
      'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.RESOLVE_SCAN',
    );
  });

  it('complete success sets state to complete', async () => {
    mockPickService.completePickList.mockReturnValue(
      of({ status: 'COMPLETE' }),
    );
    const component = await setupPickExecute();

    component.complete();

    expect(component.state()).toBe('complete');
  });

  it('SCAN_NO_MATCH is not shown before resolveScan is called', async () => {
    const component = await setupPickExecute();

    component.setScanInput('barcode-123');

    expect(component.scanAttempted()).toBe(false);
  });

  it('SCAN_NO_MATCH is shown after resolveScan returns no match', async () => {
    mockPickService.resolvePickScan.mockReturnValue(of([]));
    const component = await setupPickExecute();

    component.setScanInput('barcode-123');
    component.resolveScan();

    expect(component.scanAttempted()).toBe(true);
    expect(component.pendingLine()).toBeNull();
  });

  it('setScanInput resets scanAttempted to false', async () => {
    mockPickService.resolvePickScan.mockReturnValue(of([]));
    const component = await setupPickExecute();

    component.setScanInput('barcode-123');
    component.resolveScan();
    expect(component.scanAttempted()).toBe(true);

    component.setScanInput('new-scan');

    expect(component.scanAttempted()).toBe(false);
  });

  // ADR-0040 §6a.1/§6a.5: every write control gates on inventory:pick_list:execute
  // independently, matching what WorkorderPickFacadeController enforces — not the
  // inventory:pick_list:view the route used to carry (issue #347 group 5).
  describe('permissions (inventory:pick_list:execute)', () => {
    it('allows scan/confirm/complete for a session holding inventory:pick_list:execute', async () => {
      mockPickService.resolvePickScan.mockReturnValue(of([executeLineFixture]));
      mockPickService.completePickList.mockReturnValue(of({ status: 'COMPLETE' }));
      const component = await setupPickExecute('wo-001', [EXECUTE]);

      expect(component.canExecute()).toBe(true);

      component.setScanInput('BARCODE-123');
      component.resolveScan();
      expect(mockPickService.resolvePickScan).toHaveBeenCalledTimes(1);

      component.complete();
      expect(mockPickService.completePickList).toHaveBeenCalledTimes(1);
    });

    it('refuses scan/confirm/complete for a view-only session (the pre-fix authority)', async () => {
      const fixture = await setupPickExecuteFixture('wo-001', ['inventory:pick_list:view']);
      const component = fixture.componentInstance;

      expect(component.canExecute()).toBe(false);

      component.setScanInput('BARCODE-123');
      component.resolveScan();
      expect(mockPickService.resolvePickScan).not.toHaveBeenCalled();

      component.complete();
      expect(mockPickService.completePickList).not.toHaveBeenCalled();

      // Independent control assertions (ADR-0040 §6a.5): scan and complete
      // must be disabled in the rendered template too, not only refused
      // imperatively — a template regression removing a [disabled] binding
      // would otherwise pass while these buttons stayed clickable.
      fixture.detectChanges();
      const scanButton: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('.scan-card button.btn-primary');
      const completeButton: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('.action-row button.btn-primary');
      expect(scanButton?.disabled).toBe(true);
      expect(completeButton?.disabled).toBe(true);

      // The confirm control only renders once a line is pending; force one
      // to check its independent disablement and that confirmLine() itself
      // refuses too.
      component.pendingLine.set(executeLineFixture);
      component.setConfirmQty(1);
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
