import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AdjustmentApprovalsComponent } from './adjustment-approvals.component';
import { InventoryCycleCountService } from '../../../services/inventory-cycle-count.service';
import { AdjustmentDetail } from '../../../models/inventory.models';

const adj: AdjustmentDetail = {
  adjustmentId: 'adj-001',
  locationId: 'loc-1',
  productSku: 'SKU-001',
  countedQuantity: 5,
  expectedQuantity: 10,
  varianceQuantity: -5,
  status: 'PENDING',
  requiredApprovalTier: 1,
};

const mockCycleCountService = {
  queryAdjustments: vi.fn(),
  approveAdjustment: vi.fn(),
  rejectAdjustment: vi.fn(),
};

describe('AdjustmentApprovalsComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AdjustmentApprovalsComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryCycleCountService, useValue: mockCycleCountService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockCycleCountService.queryAdjustments.mockReturnValue(of({ items: [], nextPageToken: null }));
    const fixture = TestBed.createComponent(AdjustmentApprovalsComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should transition to ready after successful load', () => {
    mockCycleCountService.queryAdjustments.mockReturnValue(of({ items: [adj], nextPageToken: null }));
    const fixture = TestBed.createComponent(AdjustmentApprovalsComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should transition to empty when no adjustments', () => {
    mockCycleCountService.queryAdjustments.mockReturnValue(of({ items: [], nextPageToken: null }));
    const fixture = TestBed.createComponent(AdjustmentApprovalsComponent);
    expect(fixture.componentInstance.state()).toBe('empty');
  });

  it('should set error state before errorKey on failure', () => {
    mockCycleCountService.queryAdjustments.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(AdjustmentApprovalsComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.COUNTS.APPROVALS.ERROR.LOAD');
  });

  it('should set error state before errorKey when approve fails', () => {
    mockCycleCountService.queryAdjustments.mockReturnValue(of({ items: [adj], nextPageToken: null }));
    mockCycleCountService.approveAdjustment.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(AdjustmentApprovalsComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.approve(adj.adjustmentId);

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe('INVENTORY.COUNTS.APPROVALS.ERROR.APPROVE');
  });

  it('should set error state before errorKey when reject fails', () => {
    mockCycleCountService.queryAdjustments.mockReturnValue(of({ items: [adj], nextPageToken: null }));
    mockCycleCountService.rejectAdjustment.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(AdjustmentApprovalsComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.reject(adj.adjustmentId);

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe('INVENTORY.COUNTS.APPROVALS.ERROR.REJECT');
  });
});
