import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PutawayTaskListComponent } from './putaway-task-list.component';
import { InventoryDomainService } from '../../../services/inventory.service';
import { PutawayTask } from '../../../models/inventory.models';

const task: PutawayTask = {
  putawayTaskId: 'pt-001',
  locationId: 'loc-1',
  stagingStorageLocationId: 'ssl-1',
  productSku: 'SKU-001',
  quantity: 5,
  uom: 'EA',
  status: 'PENDING',
};

const mockInventoryService = {
  getPutawayTasks: vi.fn(),
};

describe('PutawayTaskListComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PutawayTaskListComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryDomainService, useValue: mockInventoryService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockInventoryService.getPutawayTasks.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(PutawayTaskListComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should transition to ready after successful load', () => {
    mockInventoryService.getPutawayTasks.mockReturnValue(of([task]));
    const fixture = TestBed.createComponent(PutawayTaskListComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should transition to empty when no tasks', () => {
    mockInventoryService.getPutawayTasks.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(PutawayTaskListComponent);
    expect(fixture.componentInstance.state()).toBe('empty');
  });

  it('should set error state before errorKey on failure', () => {
    mockInventoryService.getPutawayTasks.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(PutawayTaskListComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.PUTAWAY.LIST.ERROR.LOAD');
  });
});
