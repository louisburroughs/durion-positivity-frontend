import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PoListComponent } from './po-list.component';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';
import { PurchaseOrderDetail, PurchaseOrderPageResponse } from '../../../models/inventory.models';

const mockPoService = {
  queryPurchaseOrders: vi.fn(),
};

const poListItem: PurchaseOrderDetail = {
  poId: 'po-1',
  poNumber: 'PO-0001',
  status: 'DRAFT',
  supplierId: 's-1',
  lineCount: 0,
  openBalance: 0,
  scheduledDeliveryDate: '2025-01-01',
  lines: [],
};

const emptyPoPage: PurchaseOrderPageResponse = { items: [], nextPageToken: null };
const poPageWithItems: PurchaseOrderPageResponse = { items: [poListItem], nextPageToken: null };

describe('PoListComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [PoListComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryPurchaseOrderService, useValue: mockPoService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockPoService.queryPurchaseOrders.mockReturnValue(of(emptyPoPage));
    const fixture = TestBed.createComponent(PoListComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should transition to ready after successful load', () => {
    mockPoService.queryPurchaseOrders.mockReturnValue(of(poPageWithItems));
    const fixture = TestBed.createComponent(PoListComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should transition to empty when no purchase orders', () => {
    mockPoService.queryPurchaseOrders.mockReturnValue(of(emptyPoPage));
    const fixture = TestBed.createComponent(PoListComponent);
    expect(fixture.componentInstance.state()).toBe('empty');
  });

  it('should set error state before errorKey on failure', () => {
    mockPoService.queryPurchaseOrders.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(PoListComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.PURCHASE_ORDERS.LIST.ERROR.LOAD');
  });
});
