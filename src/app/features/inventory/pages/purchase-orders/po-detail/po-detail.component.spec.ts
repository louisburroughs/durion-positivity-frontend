import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PoDetailComponent } from './po-detail.component';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';
import { PurchaseOrderDetail } from '../../../models/inventory.models';
import { SupplierOrderTransmissionService } from '../../../../positivity/services/supplier-order-transmission.service';
import { SupplierShipmentService } from '../../../../positivity/services/supplier-shipment.service';
import { SupplierOrderStatusHistory, SupplierOrderTransmission } from '../../../../positivity/models/supplier-order-transmission.models';
import { SupplierShipmentTimeline } from '../../../../positivity/models/supplier-shipment.models';

const mockPoService = {
  getPurchaseOrder: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
};

const mockTransmissionService = {
  getTransmission: vi.fn(),
  getStatusHistory: vi.fn(),
  listManualReview: vi.fn(),
  getManualReviewItem: vi.fn(),
  resolveManualReview: vi.fn(),
};

const mockShipmentService = {
  getShipmentTimeline: vi.fn(),
  listUnlinkedEvents: vi.fn(),
};

const transmissionFixture: SupplierOrderTransmission = {
  purchaseOrderId: 'po-001',
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  state: 'MANUAL_REVIEW',
  vendorOrderNumber: null,
  vendorDocumentId: null,
  lines: [],
  manualReviewReason: 'No vendor acknowledgement.',
  resolutionActions: [{ action: 'CONFIRM_MATCHED' }, { action: 'MARK_REJECTED' }],
  asOf: '2026-08-12T11:00:00Z',
  fetchedAt: '2026-08-12T12:00:00Z',
  stalenessThresholdMinutes: 120,
};

const historyFixture: SupplierOrderStatusHistory = {
  purchaseOrderId: 'po-001',
  events: [
    { statusEventId: 'ev-1', occurredAt: '2026-08-12T09:00:00Z', state: 'SENT' },
  ],
  fetchedAt: '2026-08-12T12:00:00Z',
};

const shipmentFixture: SupplierShipmentTimeline = {
  purchaseOrderId: 'po-001',
  events: [
    {
      shipmentEventId: 'se-1',
      purchaseOrderId: 'po-001',
      eventCode: 'SHIPPED',
      carrierCode: 'DHL',
      occurredAt: '2026-08-11T08:00:00Z',
      receivedAt: '2026-08-11T08:05:00Z',
    },
  ],
  fetchedAt: '2026-08-12T12:00:00Z',
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
    mockTransmissionService.getTransmission.mockReturnValue(of(transmissionFixture));
    mockTransmissionService.getStatusHistory.mockReturnValue(of(historyFixture));
    mockShipmentService.getShipmentTimeline.mockReturnValue(of(shipmentFixture));

    await TestBed.configureTestingModule({
      imports: [PoDetailComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryPurchaseOrderService, useValue: mockPoService },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: SupplierOrderTransmissionService, useValue: mockTransmissionService },
        { provide: SupplierShipmentService, useValue: mockShipmentService },
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

  describe('supplier connectivity sections (#191, #193)', () => {
    it('hosts the transmission panel and the shipment timeline, keyed by the PO UUID', () => {
      mockPoService.getPurchaseOrder.mockReturnValue(of(poFixture));
      const fixture = TestBed.createComponent(PoDetailComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('app-supplier-transmission-panel')).not.toBeNull();
      expect(el.querySelector('app-supplier-shipment-panel')).not.toBeNull();
      expect(mockTransmissionService.getTransmission).toHaveBeenCalledWith('po-001');
      expect(mockShipmentService.getShipmentTimeline).toHaveBeenCalledWith('po-001');
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
      // The transmission panel is rendering MANUAL_REVIEW and the backend
      // offered resolution actions, but this route carries no role guard while
      // the administrator queue does (#191). So the page offers no resolution
      // control at all, and never reaches the resolution endpoint.
      expect(el.querySelectorAll('.review-actions__trigger')).toHaveLength(0);
      expect(el.querySelector('app-supplier-manual-review-actions')).toBeNull();
      expect(mockTransmissionService.resolveManualReview).not.toHaveBeenCalled();
    });

    it('keeps rendering the order when the supplier services fail', () => {
      mockPoService.getPurchaseOrder.mockReturnValue(of(poFixture));
      mockTransmissionService.getTransmission.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
      );
      mockShipmentService.getShipmentTimeline.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
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
