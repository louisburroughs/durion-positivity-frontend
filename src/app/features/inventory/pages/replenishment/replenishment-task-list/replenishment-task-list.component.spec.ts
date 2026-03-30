import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ReplenishmentTaskListComponent } from './replenishment-task-list.component';
import { InventoryService } from '../../../services/inventory.service';
import { ReplenishmentTask } from '../../../models/inventory.models';

const task: ReplenishmentTask = {
  replenishmentTaskId: 'rt-1',
  locationId: 'loc-1',
  fromStorageLocationId: 'sl-from',
  toStorageLocationId: 'sl-to',
  productSku: 'SKU-001',
  requestedQty: 10,
  uom: 'EA',
  status: 'PENDING',
};

const mockInventoryService = {
  getReplenishmentTasks: vi.fn(),
};

describe('ReplenishmentTaskListComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ReplenishmentTaskListComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryService, useValue: mockInventoryService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockInventoryService.getReplenishmentTasks.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(ReplenishmentTaskListComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should transition to ready after successful load', () => {
    mockInventoryService.getReplenishmentTasks.mockReturnValue(of([task]));
    const fixture = TestBed.createComponent(ReplenishmentTaskListComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should transition to empty when no tasks', () => {
    mockInventoryService.getReplenishmentTasks.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(ReplenishmentTaskListComponent);
    expect(fixture.componentInstance.state()).toBe('empty');
  });

  it('should set error state before errorKey on failure', () => {
    mockInventoryService.getReplenishmentTasks.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(ReplenishmentTaskListComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.REPLENISHMENT.LIST.ERROR.LOAD');
  });
});
