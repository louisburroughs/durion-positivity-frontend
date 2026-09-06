import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { TreadDesignEnrichmentPanelComponent } from './tread-design-enrichment-panel.component';
import { ProductTreadDesignService } from '../../services/product-tread-design.service';

describe('TreadDesignEnrichmentPanelComponent', () => {
  let fixture: ComponentFixture<TreadDesignEnrichmentPanelComponent>;
  let component: TreadDesignEnrichmentPanelComponent;

  const mockService = {
    getEnrichmentForProduct: vi.fn(),
  };

  function createFixture(): void {
    fixture = TestBed.createComponent(TreadDesignEnrichmentPanelComponent);
    component = fixture.componentInstance;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TreadDesignEnrichmentPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: ProductTreadDesignService, useValue: mockService }],
    }).compileComponents();
  });

  afterEach(() => {
    // resetAllMocks (not clearAllMocks) — also drops any unconsumed
    // mockReturnValueOnce queued by a test that never triggered the effect,
    // which would otherwise leak into the next test's first call.
    vi.resetAllMocks();
  });

  it('is not visible while nothing has loaded yet', () => {
    mockService.getEnrichmentForProduct.mockReturnValueOnce(of(null));
    createFixture();
    // Before the effect first runs (no productId set / no change detection tick).
    expect(component.visible()).toBe(false);
  });

  it('renders nothing when the service resolves null (no match) — not an error, not a placeholder', () => {
    mockService.getEnrichmentForProduct.mockReturnValueOnce(of(null));
    createFixture();
    fixture.componentRef.setInput('productId', 'prod-1');
    fixture.detectChanges();

    expect(component.visible()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.enrichment-panel')).toBeNull();
  });

  it('becomes visible once enrichment data resolves', () => {
    mockService.getEnrichmentForProduct.mockReturnValueOnce(
      of({
        id: 'td-1',
        brand: 'Acme',
        treadDesign: 'Sierra',
        treadDesign2: null,
        productName: null,
        vehicleType: null,
        seasonality: null,
        supplierRef: 'acme-inc',
        vendorProfileId: null,
        vendorVariantId: null,
        updatedAt: null,
        hasUnresolvedImages: false,
        images: [],
        texts: [],
      }),
    );
    createFixture();
    fixture.componentRef.setInput('productId', 'prod-1');
    fixture.detectChanges();

    expect(component.visible()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.enrichment-panel')).not.toBeNull();
    expect(el.textContent).toContain('Acme');
  });

  it('shows the artwork-pending notice when hasUnresolvedImages is true', () => {
    mockService.getEnrichmentForProduct.mockReturnValueOnce(
      of({
        id: 'td-2',
        brand: 'Acme',
        treadDesign: null,
        treadDesign2: null,
        productName: null,
        vehicleType: null,
        seasonality: null,
        supplierRef: null,
        vendorProfileId: null,
        vendorVariantId: null,
        updatedAt: null,
        hasUnresolvedImages: true,
        images: [],
        texts: [],
      }),
    );
    createFixture();
    fixture.componentRef.setInput('productId', 'prod-2');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.artwork-pending')).not.toBeNull();
  });

  it('shows the match state when present (phase 2, backend #1645)', () => {
    mockService.getEnrichmentForProduct.mockReturnValueOnce(
      of({
        id: 'td-3',
        brand: 'Acme',
        treadDesign: 'Sierra',
        treadDesign2: null,
        productName: null,
        vehicleType: null,
        seasonality: null,
        supplierRef: null,
        vendorProfileId: null,
        vendorVariantId: null,
        updatedAt: null,
        hasUnresolvedImages: false,
        images: [],
        texts: [],
        matchState: 'MATCHED',
        matchStateAt: null,
        candidates: [],
      }),
    );
    createFixture();
    fixture.componentRef.setInput('productId', 'prod-3');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.match-state-badge--matched')).not.toBeNull();
  });

  it('omits the match-state row entirely when matchState is absent', () => {
    mockService.getEnrichmentForProduct.mockReturnValueOnce(
      of({
        id: 'td-4',
        brand: 'Acme',
        treadDesign: null,
        treadDesign2: null,
        productName: null,
        vehicleType: null,
        seasonality: null,
        supplierRef: null,
        vendorProfileId: null,
        vendorVariantId: null,
        updatedAt: null,
        hasUnresolvedImages: false,
        images: [],
        texts: [],
      }),
    );
    createFixture();
    fixture.componentRef.setInput('productId', 'prod-4');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.match-state-badge')).toBeNull();
  });

  it('re-fetches when productId changes', () => {
    mockService.getEnrichmentForProduct.mockReturnValueOnce(of(null));
    createFixture();
    fixture.componentRef.setInput('productId', 'prod-1');
    fixture.detectChanges();

    mockService.getEnrichmentForProduct.mockReturnValueOnce(of(null));
    fixture.componentRef.setInput('productId', 'prod-2');
    fixture.detectChanges();

    expect(mockService.getEnrichmentForProduct).toHaveBeenNthCalledWith(1, 'prod-1');
    expect(mockService.getEnrichmentForProduct).toHaveBeenNthCalledWith(2, 'prod-2');
  });
});
