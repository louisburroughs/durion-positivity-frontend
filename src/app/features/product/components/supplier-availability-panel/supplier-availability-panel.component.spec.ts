import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { SupplierAvailabilityPanelComponent } from './supplier-availability-panel.component';
import { ProductSupplierAvailabilityService } from '../../services/product-supplier-availability.service';

describe('SupplierAvailabilityPanelComponent', () => {
  let fixture: ComponentFixture<SupplierAvailabilityPanelComponent>;
  let component: SupplierAvailabilityPanelComponent;

  const mockService = {
    checkAvailability: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupplierAvailabilityPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: ProductSupplierAvailabilityService, useValue: mockService }],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierAvailabilityPanelComponent);
    fixture.componentRef.setInput('productId', 'prod-123');
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts idle and issues no request', () => {
    expect(component.state()).toBe('idle');
    expect(mockService.checkAvailability).not.toHaveBeenCalled();
  });

  it('does not submit when the delivery location is blank', () => {
    component.checkAvailability();

    expect(mockService.checkAvailability).not.toHaveBeenCalled();
    expect(component.form.controls.deliveryLocationId.touched).toBe(true);
  });

  it('checks availability with productId, the entered location and quantity', () => {
    mockService.checkAvailability.mockReturnValueOnce(of({ vendors: [] }));
    component.form.controls.deliveryLocationId.setValue('loc-1');
    component.form.controls.quantity.setValue(4);

    component.checkAvailability();

    expect(mockService.checkAvailability).toHaveBeenCalledWith({
      productId: 'prod-123',
      deliveryLocationId: 'loc-1',
      quantity: 4,
    });
  });

  it('transitions to ready and stores the result on success', () => {
    const availability = {
      productId: 'prod-123',
      deliveryLocationId: 'loc-1',
      requestedQuantity: null,
      stalenessThreshold: 'PT4H',
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
    expect(component.result()).toBeNull();
  });

  it('firstLine() returns null when a vendor has no line', () => {
    const vendor = {
      vendorProfileId: 'vp-1',
      vendorDisplayName: 'Acme',
      status: 'SUPPLIER_UNAVAILABLE' as const,
      fetchedAt: null,
      asOf: null,
      stale: null,
      lines: [],
    };

    expect(component.firstLine(vendor)).toBeNull();
  });
});
