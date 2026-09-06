import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PoSupplierAvailabilityPanelComponent } from './po-supplier-availability-panel.component';
import { InventorySupplierAvailabilityService } from '../../services/inventory-supplier-availability.service';

describe('PoSupplierAvailabilityPanelComponent', () => {
  let fixture: ComponentFixture<PoSupplierAvailabilityPanelComponent>;
  let component: PoSupplierAvailabilityPanelComponent;

  const mockService = {
    checkAvailability: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PoSupplierAvailabilityPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: InventorySupplierAvailabilityService, useValue: mockService }],
    }).compileComponents();

    fixture = TestBed.createComponent(PoSupplierAvailabilityPanelComponent);
    fixture.componentRef.setInput('sku', 'SKU-42');
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts idle and issues no request', () => {
    expect(component.state()).toBe('idle');
    expect(mockService.checkAvailability).not.toHaveBeenCalled();
  });

  it('does not submit when the sku is blank', () => {
    fixture.componentRef.setInput('sku', '   ');
    component.form.controls.deliveryLocationId.setValue('loc-1');

    component.checkAvailability();

    expect(mockService.checkAvailability).not.toHaveBeenCalled();
  });

  it('does not submit when the delivery location is blank', () => {
    component.checkAvailability();

    expect(mockService.checkAvailability).not.toHaveBeenCalled();
    expect(component.form.controls.deliveryLocationId.touched).toBe(true);
  });

  it('does not submit when the delivery location is whitespace-only (notBlank)', () => {
    component.form.controls.deliveryLocationId.setValue('   ');

    component.checkAvailability();

    expect(component.form.invalid).toBe(true);
    expect(mockService.checkAvailability).not.toHaveBeenCalled();
  });

  it('does not submit when quantity is 0 (integerAtLeast(1))', () => {
    component.form.controls.deliveryLocationId.setValue('loc-1');
    component.form.controls.quantity.setValue(0);

    component.checkAvailability();

    expect(component.form.invalid).toBe(true);
    expect(mockService.checkAvailability).not.toHaveBeenCalled();
  });

  it('checks availability with the sku, entered location and quantity', () => {
    mockService.checkAvailability.mockReturnValueOnce(of({ vendors: [] }));
    component.form.controls.deliveryLocationId.setValue('loc-1');
    component.form.controls.quantity.setValue(7);

    component.checkAvailability();

    expect(mockService.checkAvailability).toHaveBeenCalledWith({
      sku: 'SKU-42',
      deliveryLocationId: 'loc-1',
      quantity: 7,
    });
  });

  it('trims surrounding whitespace from a valid delivery location before submitting', () => {
    mockService.checkAvailability.mockReturnValueOnce(of({ vendors: [] }));
    component.form.controls.deliveryLocationId.setValue('  loc-1  ');

    component.checkAvailability();

    expect(component.form.valid).toBe(true);
    expect(mockService.checkAvailability).toHaveBeenCalledWith({
      sku: 'SKU-42',
      deliveryLocationId: 'loc-1',
      quantity: undefined,
    });
  });

  it('transitions to ready and stores the result on success', () => {
    const availability = {
      productId: 'prod-9',
      deliveryLocationId: 'loc-1',
      requestedQuantity: null,
      stalenessThreshold: null,
      vendors: [
        {
          vendorProfileId: 'vp-1',
          vendorDisplayName: 'Acme',
          status: 'OK' as const,
          fetchedAt: null,
          asOf: null,
          stale: null,
          lines: [],
        },
      ],
    };
    mockService.checkAvailability.mockReturnValueOnce(of(availability));
    component.form.controls.deliveryLocationId.setValue('loc-1');

    component.checkAvailability();

    expect(component.state()).toBe('ready');
    expect(component.vendors()).toEqual(availability.vendors);
  });

  it('sets state to error before errorKey on failure (ADR-0031)', () => {
    mockService.checkAvailability.mockReturnValueOnce(throwError(() => new Error('boom')));
    component.form.controls.deliveryLocationId.setValue('loc-1');

    const calls: string[] = [];
    const originalState = component.state.set.bind(component.state);
    const originalErrorKey = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => {
      calls.push(`state:${v}`);
      originalState(v);
    });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => {
      if (v !== null) {
        calls.push(`errorKey:${v}`);
      }
      originalErrorKey(v);
    });

    component.checkAvailability();

    const stateIdx = calls.findIndex(c => c === 'state:error');
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(stateIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(stateIdx);
  });

  it('renders the translated UNKNOWN label with the neutral badge, never a raw key, for a null vendor status', () => {
    const availability = {
      productId: 'prod-9',
      deliveryLocationId: 'loc-1',
      requestedQuantity: null,
      stalenessThreshold: null,
      vendors: [
        {
          vendorProfileId: 'vp-unknown',
          vendorDisplayName: 'Mystery Vendor',
          status: null,
          fetchedAt: null,
          asOf: null,
          stale: null,
          lines: [],
        },
      ],
    };
    mockService.checkAvailability.mockReturnValueOnce(of(availability));
    component.form.controls.deliveryLocationId.setValue('loc-1');

    component.checkAvailability();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const statusBadge = el.querySelector('.badge');

    expect(statusBadge).not.toBeNull();
    expect(statusBadge?.classList.contains('badge--neutral')).toBe(true);
    expect(statusBadge?.textContent).toContain(
      'INVENTORY.PURCHASE_ORDERS.FORM.AVAILABILITY.VENDOR_STATUS.UNKNOWN',
    );
    expect(statusBadge?.textContent).not.toMatch(/VENDOR_STATUS\.null/);
  });
});
