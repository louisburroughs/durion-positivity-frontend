import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PoDetailComponent } from './po-detail.component';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';
import { PurchaseOrderDetail } from '../../../models/inventory.models';
import { SupplierOrderTransmissionService } from '../../../../positivity/services/supplier-order-transmission.service';
import { SupplierOrderTransmission } from '../../../../positivity/models/supplier-order-transmission.models';
import { PurchaseOrderTransmissionTimelineService } from '../../../../positivity/services/purchase-order-transmission-timeline.service';
import { PurchaseOrderTransmissionTimelinePage } from '../../../../positivity/models/purchase-order-transmission-timeline.models';

const mockPoService = {
  getPurchaseOrder: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
};

const mockTransmissionService = {
  listForPurchaseOrder: vi.fn(),
};

const mockTimelineService = {
  listForPurchaseOrder: vi.fn(),
};

const timelinePageFixture: PurchaseOrderTransmissionTimelinePage = {
  items: [],
  page: 0,
  size: 25,
  totalCount: 0,
  totalPages: 0,
};

const transmissionFixture: SupplierOrderTransmission = {
  transmissionIntentId: 'ti-1',
  purchaseOrderId: 'po-001',
  purchaseOrderNumber: 'PO-001',
  supplierRef: 'michelin-eu',
  state: 'MANUAL_REVIEW',
  supplierOrderNumber: null,
  documentId: null,
  latestScheduledDeliveryDate: null,
  vendorReason: 'No vendor acknowledgement.',
  vendorErrorCode: null,
  failureDetail: null,
  lastStatusAt: '2026-08-12T11:00:00Z',
  lastTransitionAt: null,
  dispatchAttempts: 2,
  resolutionAction: null,
  resolvedAt: null,
  resolvedBy: null,
};

const mockRoute = {
  paramMap: of({ get: (key: string) => (key === 'poId' ? 'po-001' : null) }),
};

const poFixture: PurchaseOrderDetail = {
  poId: 'po-001',
  poNumber: 'PO-001',
  status: 'DRAFT',
  supplierId: 's-1',
  lineCount: 0,
  openBalance: 0,
  scheduledDeliveryDate: '2025-01-01',
  lines: [],
};

describe('PoDetailComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockTransmissionService.listForPurchaseOrder.mockReturnValue(of([transmissionFixture]));
    mockTimelineService.listForPurchaseOrder.mockReturnValue(of(timelinePageFixture));

    await TestBed.configureTestingModule({
      imports: [PoDetailComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryPurchaseOrderService, useValue: mockPoService },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: SupplierOrderTransmissionService, useValue: mockTransmissionService },
        { provide: PurchaseOrderTransmissionTimelineService, useValue: mockTimelineService },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(of(poFixture));
    const fixture = TestBed.createComponent(PoDetailComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should be in ready state after successful load', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(of(poFixture));
    const fixture = TestBed.createComponent(PoDetailComponent);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('should set error state before errorKey on load failure', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(PoDetailComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.PURCHASE_ORDERS.DETAIL.ERROR.LOAD');
  });

  it('should set error state before errorKey on cancel failure', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(of(poFixture));
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

  describe('supplier connectivity section (#191, #201, #215)', () => {
    it('hosts the transmission panel and the transmission timeline, keyed by the PO UUID, and no shipment timeline', () => {
      mockPoService.getPurchaseOrder.mockReturnValue(of(poFixture));
      const fixture = TestBed.createComponent(PoDetailComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('app-supplier-transmission-panel')).not.toBeNull();
      expect(el.querySelector('app-purchase-order-transmission-timeline-panel')).not.toBeNull();
      expect(el.querySelector('app-supplier-shipment-panel')).toBeNull();
      expect(mockTransmissionService.listForPurchaseOrder).toHaveBeenCalledWith('po-001');
      expect(mockTimelineService.listForPurchaseOrder).toHaveBeenCalledWith('po-001', 0);
    });

    it('exposes no path anywhere on the page that re-transmits the order', () => {
      mockPoService.getPurchaseOrder.mockReturnValue(of(poFixture));
      const fixture = TestBed.createComponent(PoDetailComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      const controlText = Array.from(el.querySelectorAll('button, a, input[type="submit"]'))
        .map(n => `${n.textContent ?? ''} ${n.className}`)
        .join(' ')
        .toLowerCase();

      expect(controlText).not.toMatch(/resend|re-send|retransmit|re-transmit|send.?again|transmit/);
      // MANUAL_REVIEW is reported, never resolved, from this page.
      expect(el.querySelector('app-supplier-manual-review-actions')).toBeNull();
    });

    it('keeps rendering the order when the supplier read fails', () => {
      mockPoService.getPurchaseOrder.mockReturnValue(of(poFixture));
      mockTransmissionService.listForPurchaseOrder.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
      );

      const fixture = TestBed.createComponent(PoDetailComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(fixture.componentInstance.state()).toBe('ready');
      expect(fixture.componentInstance.errorKey()).toBeNull();
      expect(el.querySelector('#po-detail-title')?.textContent?.trim()).toBe('PO-001');
    });

    it('injects no supplier service into the host page itself', () => {
      mockPoService.getPurchaseOrder.mockReturnValue(of(poFixture));
      const fixture = TestBed.createComponent(PoDetailComponent);
      const own = Object.keys(fixture.componentInstance as unknown as Record<string, unknown>);

      expect(own.some(key => /supplier|transmission|shipment|vendor/i.test(key))).toBe(false);
    });
  });
});
