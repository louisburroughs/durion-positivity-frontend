import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PutawayTaskListComponent } from './putaway-task-list.component';
import { InventoryDomainService } from '../../../services/inventory.service';
import { PutawayTask } from '../../../models/inventory.models';
import enUS from '../../../../../../assets/i18n/en-US.json';

const task: PutawayTask = {
  taskId: 'pt-001',
  sourceReceiptId: 'receipt-1',
  productId: 'sku-001',
  quantity: 5,
  sourceLocationId: 'ssl-1',
  status: 'PENDING',
  locationId: 'loc-01',
  uom: 'EA',
};

const taskWithoutUom: PutawayTask = {
  taskId: 'pt-002',
  sourceReceiptId: 'receipt-2',
  productId: 'sku-002',
  quantity: 3,
  sourceLocationId: 'ssl-2',
  status: 'PENDING',
  locationId: 'loc-02',
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

  describe('UOM column', () => {
    const uomCellText = (fixture: ReturnType<typeof TestBed.createComponent<PutawayTaskListComponent>>, rowIndex: number): string => {
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      const cells = rows[rowIndex].querySelectorAll('td');
      return (cells[5].textContent ?? '').trim();
    };

    it('renders the uom when the task carries one', () => {
      mockInventoryService.getPutawayTasks.mockReturnValue(of([task]));
      const fixture = TestBed.createComponent(PutawayTaskListComponent);
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en-US', enUS as TranslationObject);
      translate.use('en-US');
      fixture.detectChanges();

      expect(uomCellText(fixture, 0)).toBe('EA');
    });

    it('renders the translated COMMON.NOT_AVAILABLE when the task has no uom', () => {
      mockInventoryService.getPutawayTasks.mockReturnValue(of([taskWithoutUom]));
      const fixture = TestBed.createComponent(PutawayTaskListComponent);
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en-US', enUS as TranslationObject);
      translate.use('en-US');
      fixture.detectChanges();

      expect(uomCellText(fixture, 0)).toBe(enUS.COMMON.NOT_AVAILABLE);
    });
  });
});
