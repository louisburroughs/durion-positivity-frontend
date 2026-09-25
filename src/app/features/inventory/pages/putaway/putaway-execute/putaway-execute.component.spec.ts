import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PutawayExecuteComponent } from './putaway-execute.component';
import { InventoryDomainService } from '../../../services/inventory.service';
import { PutawayTask } from '../../../models/inventory.models';

const mockInventoryService = {
  getPutawayTasks: vi.fn(),
  executePutawayTask: vi.fn(),
};

const mockRoute = {
  snapshot: { paramMap: { get: (key: string) => (key === 'taskId' ? 'task-001' : null) } },
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
    mockInventoryService.getPutawayTasks.mockReturnValue(of([task]));
    await TestBed.configureTestingModule({
      imports: [PutawayExecuteComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryDomainService, useValue: mockInventoryService },
        { provide: ActivatedRoute, useValue: mockRoute },
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
});
