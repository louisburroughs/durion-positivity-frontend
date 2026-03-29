import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PoDetailComponent } from './po-detail.component';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';

const mockPoService = {
  getPurchaseOrder: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
};

const mockRoute = {
  paramMap: of({ get: (key: string) => (key === 'poId' ? 'po-001' : null) }),
};

describe('PoDetailComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PoDetailComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryPurchaseOrderService, useValue: mockPoService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(of({ poId: 'po-001' }));
    const fixture = TestBed.createComponent(PoDetailComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should be in ready state after successful load', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(of({ poId: 'po-001' }));
    const fixture = TestBed.createComponent(PoDetailComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should set error state before errorKey on load failure', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(PoDetailComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBeTruthy();
  });

  it('should set error state before errorKey on cancel failure', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(of({ poId: 'po-001' }));
    mockPoService.cancelPurchaseOrder.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(PoDetailComponent);
    const component = fixture.componentInstance;
    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => { calls.push(`state:${v}`); origState(v); });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => { calls.push(`errorKey:${v}`); origError(v); });

    component.cancel();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
  });
});
