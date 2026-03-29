import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../../../../core/services/auth.service';
import { LocationOverridesComponent } from './location-overrides.component';
import { ProductCatalogService } from '../../../services/product-catalog.service';

describe('LocationOverridesComponent', () => {
  let fixture: ComponentFixture<LocationOverridesComponent>;
  let component: LocationOverridesComponent;

  const mockCatalog = {
    createLocationPriceOverride: vi.fn().mockReturnValue(of({ id: 'ovr-1' })),
    approveLocationPriceOverride: vi.fn().mockReturnValue(of({ id: 'ovr-1' })),
    rejectLocationPriceOverride: vi.fn().mockReturnValue(of({ id: 'ovr-1' })),
    upsertLocationGuardrailPolicy: vi.fn().mockReturnValue(of({ id: 'guardrail-1' })),
    getEffectiveLocationPrice: vi.fn().mockReturnValue(of({ id: 'eff-1' })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LocationOverridesComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ProductCatalogService, useValue: mockCatalog },
        { provide: AuthService, useValue: { hasAnyRole: vi.fn().mockReturnValue(false) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LocationOverridesComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with state "idle"', () => {
    expect(component.state()).toBe('idle');
  });

  // ── canManageGuardrails() ──────────────────────────────────────────────────────

  describe('canManageGuardrails()', () => {
    it('returns false when user has no admin or pricing role', () => {
      expect(component.canManageGuardrails()).toBe(false);
    });

    it('returns true when user has ROLE_ADMIN', () => {
      vi.mocked(TestBed.inject(AuthService).hasAnyRole).mockReturnValue(true);
      expect(component.canManageGuardrails()).toBe(true);
    });
  });

  // ── canApproveOverrides() ──────────────────────────────────────────────────────

  describe('canApproveOverrides()', () => {
    it('returns true when user has ROLE_PRICING_APPROVER', () => {
      vi.mocked(TestBed.inject(AuthService).hasAnyRole).mockReturnValue(true);
      expect(component.canApproveOverrides()).toBe(true);
    });
  });

  // ── rejectOverride() ──────────────────────────────────────────────────────────

  describe('rejectOverride()', () => {
    it('calls rejectLocationPriceOverride with overrideId and reason', () => {
      component.rejectOverride('ovr-1', 'Pricing mismatch');
      expect(mockCatalog.rejectLocationPriceOverride).toHaveBeenCalledWith('ovr-1', 'Pricing mismatch');
    });
  });
});
