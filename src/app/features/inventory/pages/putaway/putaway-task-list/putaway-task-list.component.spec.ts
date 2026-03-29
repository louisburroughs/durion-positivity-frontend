import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PutawayTaskListComponent } from './putaway-task-list.component';
import { InventoryService } from '../../../services/inventory.service';

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
        { provide: InventoryService, useValue: mockInventoryService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockInventoryService.getPutawayTasks.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(PutawayTaskListComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should transition to ready after successful load', () => {
    mockInventoryService.getPutawayTasks.mockReturnValue(of([{ taskId: 't1' }]));
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
    expect(component.errorKey()).toBeTruthy();
  });
});
