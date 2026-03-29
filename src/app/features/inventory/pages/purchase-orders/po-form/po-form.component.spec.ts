import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PoFormComponent } from './po-form.component';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';

const mockPoService = {
  getPurchaseOrder: vi.fn(),
  createPurchaseOrder: vi.fn(),
  revisePurchaseOrder: vi.fn(),
};

const mockRouteNew = {
  snapshot: { paramMap: { get: (_key: string) => null } },
};

const mockRouteEdit = {
  snapshot: { paramMap: { get: (key: string) => (key === 'poId' ? 'po-001' : null) } },
};

describe('PoFormComponent — create mode', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PoFormComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryPurchaseOrderService, useValue: mockPoService },
        { provide: ActivatedRoute, useValue: mockRouteNew },
      ],
    }).compileComponents();
  });

  it('should create with null editingPoId', () => {
    const fixture = TestBed.createComponent(PoFormComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
    expect(component.editingPoId()).toBeNull();
  });

  it('should be in ready state immediately', () => {
    const fixture = TestBed.createComponent(PoFormComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should set error state before errorKey on create failure', () => {
    mockPoService.createPurchaseOrder.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(PoFormComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { if (v !== null) { calls.push(`errorKey:${v}`); } origError(v); });

    component.submit();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
  });
});

describe('PoFormComponent — edit mode', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PoFormComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryPurchaseOrderService, useValue: mockPoService },
        { provide: ActivatedRoute, useValue: mockRouteEdit },
      ],
    }).compileComponents();
  });

  it('should populate editingPoId from route', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(of({ poId: 'po-001', lines: [], supplierId: 's1', scheduledDeliveryDate: '2025-01-01' }));
    const fixture = TestBed.createComponent(PoFormComponent);
    expect(fixture.componentInstance.editingPoId()).toBe('po-001');
  });

  it('should set error state before errorKey when load fails in edit mode', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(PoFormComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBeTruthy();
  });
});
