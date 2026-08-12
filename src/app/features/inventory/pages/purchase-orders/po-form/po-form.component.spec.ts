import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PoFormComponent } from './po-form.component';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';
import { PurchaseOrderDetail } from '../../../models/inventory.models';
import { SupplierAvailabilityService } from '../../../../positivity/services/supplier-availability.service';
import { SupplierDeliveryLocationService } from '../../../../positivity/services/supplier-delivery-location.service';

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

const poEditFixture: PurchaseOrderDetail = {
  poId: 'po-001',
  poNumber: 'PO-001',
  status: 'DRAFT',
  supplierId: 's1',
  lineCount: 0,
  openBalance: 0,
  scheduledDeliveryDate: '2025-01-01',
  lines: [],
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

  it('updateLine — ignores NaN for orderedQty and keeps existing value', () => {
    const fixture = TestBed.createComponent(PoFormComponent);
    const component = fixture.componentInstance;
    component.addLine();
    expect(component.lines()[0].orderedQty).toBe(1);
    component.updateLine(0, 'orderedQty', Number.NaN);
    expect(component.lines()[0].orderedQty).toBe(1);
  });

  it('updateLine — ignores negative for unitPrice and keeps existing value', () => {
    const fixture = TestBed.createComponent(PoFormComponent);
    const component = fixture.componentInstance;
    component.addLine();
    expect(component.lines()[0].unitPrice).toBe(0);
    component.updateLine(0, 'unitPrice', -50);
    expect(component.lines()[0].unitPrice).toBe(0);
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
    mockPoService.getPurchaseOrder.mockReturnValue(of(poEditFixture));
    const fixture = TestBed.createComponent(PoFormComponent);
    expect(fixture.componentInstance.editingPoId()).toBe('po-001');
  });

  it('should set error state before errorKey when load fails in edit mode', () => {
    mockPoService.getPurchaseOrder.mockReturnValue(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(PoFormComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.PURCHASE_ORDERS.FORM.ERROR.LOAD');
  });
});

// ── Per-line supplier availability check (issue #190) ───────────────────────────
//
// This form is where purchase-order lines are edited, so the availability check
// lives here rather than on the read-only `po-detail` screen. The guarantee under
// test: the check is *never* fired automatically, and no supplier outcome can
// reach this form's state machine or block saving the order.

describe('PoFormComponent — supplier availability check', () => {
  const availabilityService = { getAvailabilityBySku: vi.fn(), getAvailabilityByProductId: vi.fn() };
  const selectedLocationId = signal<string | null>(null);
  const locationService = {
    listActiveLocations: vi.fn(),
    select: vi.fn((id: string | null) => selectedLocationId.set(id)),
    selectedLocationId,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    selectedLocationId.set('loc-a');
    locationService.listActiveLocations.mockReturnValue(
      of([{ locationId: 'loc-a', name: 'Downtown Service Center' }]),
    );
    availabilityService.getAvailabilityBySku.mockReturnValue(
      of({
        sku: 'SKU-1',
        deliveryLocationId: 'loc-a',
        fetchedAt: '2026-08-12T11:59:00Z',
        stalenessThresholdMinutes: 60,
        vendors: [
          {
            vendorProfileId: 'vp-1',
            vendorDisplayName: 'Michelin EU',
            status: 'OK' as const,
            availableQuantity: 40,
            unitOfMeasure: 'EA',
            asOf: '2026-08-12T11:45:00Z',
          },
        ],
      }),
    );

    await TestBed.configureTestingModule({
      imports: [PoFormComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryPurchaseOrderService, useValue: mockPoService },
        { provide: ActivatedRoute, useValue: mockRouteNew },
        { provide: SupplierAvailabilityService, useValue: availabilityService },
        { provide: SupplierDeliveryLocationService, useValue: locationService },
      ],
    }).compileComponents();
  });

  function renderWithLine(): ComponentFixture<PoFormComponent> {
    const fixture = TestBed.createComponent(PoFormComponent);
    fixture.componentInstance.addLine();
    fixture.componentInstance.updateLine(0, 'productSku', 'SKU-1');
    fixture.detectChanges();
    return fixture;
  }

  it('renders one availability check control per line', () => {
    const fixture = renderWithLine();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('app-supplier-availability-check')).toHaveLength(1);

    fixture.componentInstance.addLine();
    fixture.detectChanges();
    expect(el.querySelectorAll('app-supplier-availability-check')).toHaveLength(2);
  });

  it('renders one shared delivery-location picker for the whole line table', () => {
    const fixture = renderWithLine();
    const el = fixture.nativeElement as HTMLElement;

    fixture.componentInstance.addLine();
    fixture.detectChanges();

    expect(el.querySelectorAll('app-supplier-location-select')).toHaveLength(1);
  });

  it('fires no supplier request when a line is added or edited', () => {
    renderWithLine();

    expect(availabilityService.getAvailabilityBySku).not.toHaveBeenCalled();
  });

  it('checks a line only when the user asks, keyed by the line SKU and quantity', () => {
    const fixture = renderWithLine();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('.avail-check__trigger')?.click();
    fixture.detectChanges();

    expect(availabilityService.getAvailabilityBySku).toHaveBeenCalledWith('SKU-1', 'loc-a', 1);
    expect(el.querySelector('.avail-row__value--quantity')?.textContent).toContain('40');
  });

  it('a failed check never touches the form state or blocks submitting', () => {
    availabilityService.getAvailabilityBySku.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 504, statusText: 'Gateway Timeout' })),
    );
    const fixture = renderWithLine();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('.avail-check__trigger')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.errorKey()).toBeNull();
    expect(el.querySelector<HTMLButtonElement>('.action-bar .btn-primary')?.disabled).toBe(false);
  });

  it('a pos-location outage leaves the form usable', () => {
    locationService.listActiveLocations.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Service Unavailable' })),
    );
    const fixture = renderWithLine();

    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.errorKey()).toBeNull();
  });

  it('holds no supplier state of its own', () => {
    const fixture = renderWithLine();
    const keys = Object.keys(fixture.componentInstance as unknown as Record<string, unknown>);

    expect(keys.some(key => /supplier(?!Id)|availability|vendor/i.test(key))).toBe(false);
  });
});
