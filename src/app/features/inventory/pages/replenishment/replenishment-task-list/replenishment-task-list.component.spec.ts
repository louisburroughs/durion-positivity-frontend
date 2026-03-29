import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ReplenishmentTaskListComponent } from './replenishment-task-list.component';
import { InventoryService } from '../../../services/inventory.service';

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
    mockInventoryService.getReplenishmentTasks.mockReturnValue(of([{ taskId: 'rt1' }]));
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
    expect(component.errorKey()).toBeTruthy();
  });
});
