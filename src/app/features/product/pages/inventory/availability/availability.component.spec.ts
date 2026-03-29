import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AvailabilityComponent } from './availability.component';
import { ProductInventoryService } from '../../../services/product-inventory.service';

describe('AvailabilityComponent', () => {
  let fixture: ComponentFixture<AvailabilityComponent>;
  let component: AvailabilityComponent;

  const mockInventory = {
    queryInventoryAvailability: vi.fn().mockReturnValue(of({ sku: 'SKU-001', totalOnHand: 5, totalReserved: 0, totalAtp: 5, locationBreakdown: [] })),
    queryAvailabilityBySku: vi.fn().mockReturnValue(of([])),
    queryLeadTime: vi.fn().mockReturnValue(of([])),
    getLocationInventory: vi.fn().mockReturnValue(of({})),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvailabilityComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ProductInventoryService, useValue: mockInventory },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AvailabilityComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial state ─────────────────────────────────────────────────────────────

  it('initializes with state "idle"', () => {
    expect(component.state()).toBe('idle');
  });

  it('initializes with null availability', () => {
    expect(component.availability()).toBeNull();
  });

  it('initializes with empty locationBreakdown', () => {
    expect(component.locationBreakdown()).toHaveLength(0);
  });

  // ── search() with empty sku ───────────────────────────────────────────────────

  it('search() with empty sku stays in "idle" state', () => {
    component.sku.set('');
    component.search();

    expect(component.state()).toBe('idle');
    expect(mockInventory.queryInventoryAvailability).not.toHaveBeenCalled();
  });

  it('search() with whitespace-only sku stays in "idle" state', () => {
    component.sku.set('   ');
    component.search();

    expect(component.state()).toBe('idle');
    expect(mockInventory.queryInventoryAvailability).not.toHaveBeenCalled();
  });

  // ── search() with valid sku ───────────────────────────────────────────────────

  it('search() calls queryInventoryAvailability with trimmed sku', () => {
    mockInventory.queryInventoryAvailability.mockReturnValueOnce(of({ sku: 'SKU-001', totalOnHand: 0, totalReserved: 0, totalAtp: 0, locationBreakdown: [] }));

    component.sku.set('SKU-001');
    component.search();

    expect(mockInventory.queryInventoryAvailability).toHaveBeenCalledWith('SKU-001', undefined);
  });

  it('search() transitions to "empty" when no location breakdown entries', () => {
    mockInventory.queryInventoryAvailability.mockReturnValueOnce(
      of({ sku: 'SKU-001', totalOnHand: 5, totalReserved: 0, totalAtp: 5, locationBreakdown: [] }),
    );

    component.sku.set('SKU-001');
    component.search();

    expect(component.state()).toBe('empty');
  });

  it('search() transitions to "ready" when location breakdown is present', () => {
    mockInventory.queryInventoryAvailability.mockReturnValueOnce(
      of({ sku: 'SKU-001', totalOnHand: 5, totalReserved: 0, totalAtp: 5, locationBreakdown: [{ locationId: 'loc-01', locationName: 'Loc 1', onHand: 5, reserved: 0, atp: 5 }] }),
    );

    component.sku.set('SKU-001');
    component.search();

    expect(component.state()).toBe('ready');
  });

  it('search() populates locationBreakdown signal on success', () => {
    const breakdown = [{ locationId: 'loc-01', locationName: 'Loc 1', onHand: 5, reserved: 0, atp: 5 }, { locationId: 'loc-02', locationName: 'Loc 2', onHand: 3, reserved: 0, atp: 3 }];
    mockInventory.queryInventoryAvailability.mockReturnValueOnce(
      of({ sku: 'SKU-001', totalOnHand: 8, totalReserved: 0, totalAtp: 8, locationBreakdown: breakdown }),
    );

    component.sku.set('SKU-001');
    component.search();

    expect(component.locationBreakdown()).toEqual(breakdown);
  });

  it('search() transitions to "error" when service throws', () => {
    mockInventory.queryInventoryAvailability.mockReturnValueOnce(
      throwError(() => new Error('network error')),
    );

    component.sku.set('SKU-001');
    component.search();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PRODUCT.INVENTORY.AVAILABILITY.ERROR.LOAD');
  });
});
