import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { CountExecuteComponent } from './count-execute.component';
import { InventoryCycleCountService } from '../../../services/inventory-cycle-count.service';
import { CycleCountTask } from '../../../models/inventory.models';

const task: CycleCountTask = {
  cycleCountTaskId: 'cct-001',
  locationId: 'loc-1',
  productSku: 'SKU-001',
  uom: 'EA',
  status: 'PENDING',
};

const mockCycleCountService = {
  getCycleCountTask: vi.fn(),
  submitCount: vi.fn(),
};

const mockRoute = {
  snapshot: { queryParamMap: { get: (key: string) => (key === 'taskId' ? 'task-001' : null) } },
};

describe('CountExecuteComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [CountExecuteComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryCycleCountService, useValue: mockCycleCountService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockCycleCountService.getCycleCountTask.mockReturnValue(of(task));
    const fixture = TestBed.createComponent(CountExecuteComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should transition to ready after successful load', () => {
    mockCycleCountService.getCycleCountTask.mockReturnValue(of(task));
    const fixture = TestBed.createComponent(CountExecuteComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should set error state before errorKey on load failure', () => {
    mockCycleCountService.getCycleCountTask.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(CountExecuteComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.COUNTS.EXECUTE.ERROR.LOAD');
  });

  it('should set error state before errorKey on submit failure', () => {
    mockCycleCountService.getCycleCountTask.mockReturnValue(of(task));
    mockCycleCountService.submitCount.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(CountExecuteComponent);
    const component = fixture.componentInstance;
    component.countedQuantity.set(5);
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.submitCount();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe('INVENTORY.COUNTS.EXECUTE.ERROR.SUBMIT');
  });
});
