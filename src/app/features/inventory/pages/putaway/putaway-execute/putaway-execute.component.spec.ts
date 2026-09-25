import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PutawayExecuteComponent } from './putaway-execute.component';
import { InventoryDomainService } from '../../../services/inventory.service';
import { PutawayTask } from '../../../models/inventory.models';
import { AuthService } from '../../../../../core/services/auth.service';
import { INVENTORY_PAGE } from '../../../../../core/security/route-permissions';

const mockInventoryService = {
  getPutawayTasks: vi.fn(),
  executePutawayTask: vi.fn(),
};

const mockRoute = {
  snapshot: { paramMap: { get: (key: string) => (key === 'taskId' ? 'task-001' : null) } },
};

const EXECUTE = INVENTORY_PAGE.putawayExecute[0];

/** `null` = token with no permission claim (permissions unknown), as in AuthService. */
const session: { permissions: string[] | null } = { permissions: null };
const authStub = {
  permissionsKnown: () => session.permissions !== null,
  hasAnyPermission: (permissions: readonly string[]) =>
    permissions.some(p => session.permissions?.includes(p) ?? false),
};

const task: PutawayTask = {
  taskId: 'task-001',
  sourceReceiptId: 'receipt-001',
  productId: 'sku-001',
  quantity: 10,
  sourceLocationId: 'sl-001',
  status: 'PENDING',
};

describe('PutawayExecuteComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    session.permissions = null;
    mockInventoryService.getPutawayTasks.mockReturnValue(of([task]));
    await TestBed.configureTestingModule({
      imports: [PutawayExecuteComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryDomainService, useValue: mockInventoryService },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(PutawayExecuteComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should be in ready state after task loads', () => {
    const fixture = TestBed.createComponent(PutawayExecuteComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should set error state before errorKey on complete failure', () => {
    mockInventoryService.executePutawayTask.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(PutawayExecuteComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.completePutaway();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
  });

  it('calls executePutawayTask with skuId/sourceLocationId/destinationLocationId/quantity from the task (issue #377)', () => {
    mockInventoryService.executePutawayTask.mockReturnValue(of({
      ledgerEntryId: 'le-001',
      taskId: 'task-001',
      skuId: 'sku-001',
      sourceLocationId: 'sl-001',
      destinationLocationId: 'sl-target',
      quantityMoved: 10,
      transactionType: 'PUT_AWAY',
      status: 'COMPLETED',
    }));
    const fixture = TestBed.createComponent(PutawayExecuteComponent);
    const component = fixture.componentInstance;
    component.updateTargetLocation('sl-target');

    component.completePutaway();

    expect(mockInventoryService.executePutawayTask).toHaveBeenCalledWith('task-001', {
      skuId: 'sku-001',
      sourceLocationId: 'sl-001',
      destinationLocationId: 'sl-target',
      quantity: 10,
    });
  });

  // ADR-0040 §6a.1/§6a.5: `completePutaway` is a write — `PutawayExecuteController`
  // is `@PreAuthorize('inventory:putaway:execute')` — so the submit control and the
  // method body each gate on that code independently, not the `inventory:putaway:view`
  // the route admits on (Copilot #4105526174).
  describe('permissions (inventory:putaway:execute)', () => {
    it('allows completePutaway for a session holding inventory:putaway:execute', () => {
      session.permissions = [EXECUTE];
      mockInventoryService.executePutawayTask.mockReturnValue(of({
        ledgerEntryId: 'le-001', taskId: 'task-001', skuId: 'sku-001',
        sourceLocationId: 'sl-001', destinationLocationId: 'sl-target',
        quantityMoved: 10, transactionType: 'PUT_AWAY', status: 'COMPLETED',
      }));
      const fixture = TestBed.createComponent(PutawayExecuteComponent);
      const component = fixture.componentInstance;

      expect(component.canExecute()).toBe(true);

      component.updateTargetLocation('sl-target');
      component.completePutaway();

      expect(mockInventoryService.executePutawayTask).toHaveBeenCalledTimes(1);
    });

    it('refuses completePutaway for a view-only session and disables the control in the template', () => {
      session.permissions = ['inventory:putaway:view'];
      const fixture = TestBed.createComponent(PutawayExecuteComponent);
      const component = fixture.componentInstance;

      expect(component.canExecute()).toBe(false);

      component.updateTargetLocation('sl-target');
      component.completePutaway();
      expect(mockInventoryService.executePutawayTask).not.toHaveBeenCalled();

      // Independent control assertion (ADR-0040 §6a.5): the submit button must
      // be disabled in the rendered template too, not only refused imperatively.
      fixture.detectChanges();
      const completeButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.action-bar button.btn-primary');
      expect(completeButton?.disabled).toBe(true);
    });

    it('treats an unknown permission claim (legacy token) as granted, matching canAccess()', () => {
      session.permissions = null;
      const fixture = TestBed.createComponent(PutawayExecuteComponent);
      expect(fixture.componentInstance.canExecute()).toBe(true);
    });
  });
});
