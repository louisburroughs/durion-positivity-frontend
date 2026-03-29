import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { MsrpComponent } from './msrp.component';
import { ProductCatalogService } from '../../../services/product-catalog.service';
import type { Msrp } from '../../../models/pricing.models';

describe('MsrpComponent', () => {
  let fixture: ComponentFixture<MsrpComponent>;
  let component: MsrpComponent;

  const sampleMsrp: Msrp = {
    id: 'msrp-1',
    productSku: 'SKU-001',
    amount: 49.99,
    currency: 'USD',
    effectiveAt: '2026-01-01T00:00:00Z',
    endAt: null,
  };

  const mockCatalog = {
    listMsrp: vi.fn().mockReturnValue(of([])),
    getActiveMsrp: vi.fn().mockReturnValue(of(null)),
    createMsrp: vi.fn().mockReturnValue(of(sampleMsrp)),
    updateMsrp: vi.fn().mockReturnValue(of(sampleMsrp)),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MsrpComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ProductCatalogService, useValue: mockCatalog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MsrpComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial state ─────────────────────────────────────────────────────────────

  it('initializes with state "idle"', () => {
    expect(component.state()).toBe('idle');
  });

  it('initializes with empty productSku signal', () => {
    expect(component.productSku()).toBe('');
  });

  it('initializes with empty msrpList', () => {
    expect(component.msrpList()).toHaveLength(0);
  });

  it('initializes with activeMsrp as null', () => {
    expect(component.activeMsrp()).toBeNull();
  });

  // ── onSkuChange() ─────────────────────────────────────────────────────────────

  it('onSkuChange(sku) updates productSku signal immediately', () => {
    component.onSkuChange('SKU-001');
    expect(component.productSku()).toBe('SKU-001');
  });

  it('onSkuChange("") resets state to "idle" after debounce', fakeAsync(() => {
    component.state.set('ready');
    component.onSkuChange('');
    tick(300);

    expect(component.state()).toBe('idle');
  }));

  it('onSkuChange("") clears msrpList after debounce', fakeAsync(() => {
    component.msrpList.set([sampleMsrp as any]);
    component.onSkuChange('');
    tick(300);

    expect(component.msrpList()).toHaveLength(0);
  }));

  it('onSkuChange("whitespace only") resets state to "idle" after debounce', fakeAsync(() => {
    component.state.set('ready');
    component.onSkuChange('   ');
    tick(300);

    expect(component.state()).toBe('idle');
  }));

  // ── search() with valid SKU ───────────────────────────────────────────────────

  it('search() calls listMsrp and getActiveMsrp when sku is set', fakeAsync(() => {
    mockCatalog.listMsrp.mockReturnValueOnce(of([sampleMsrp]));
    mockCatalog.getActiveMsrp.mockReturnValueOnce(of(sampleMsrp));

    component.onSkuChange('SKU-001');
    tick(300);

    expect(mockCatalog.listMsrp).toHaveBeenCalledWith('SKU-001');
    expect(mockCatalog.getActiveMsrp).toHaveBeenCalledWith('SKU-001');
  }));

  it('search() transitions to "ready" when msrp list is non-empty', fakeAsync(() => {
    mockCatalog.listMsrp.mockReturnValueOnce(of([sampleMsrp]));
    mockCatalog.getActiveMsrp.mockReturnValueOnce(of(sampleMsrp));

    component.onSkuChange('SKU-001');
    tick(300);

    expect(component.state()).toBe('ready');
  }));

  it('search() transitions to "empty" when msrp list is empty', fakeAsync(() => {
    mockCatalog.listMsrp.mockReturnValueOnce(of([]));
    mockCatalog.getActiveMsrp.mockReturnValueOnce(of(null));

    component.onSkuChange('SKU-001');
    tick(300);

    expect(component.state()).toBe('empty');
  }));
});
