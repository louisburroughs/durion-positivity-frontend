import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../../core/services/auth.service';
import {
  EffectiveLocationPrice,
  GuardrailPolicy,
  LocationPriceOverride,
} from '../../../models/pricing.models';
import { ProductCatalogService } from '../../../services/product-catalog.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-location-overrides',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './location-overrides.component.html',
  styleUrl: './location-overrides.component.css',
})
export class LocationOverridesComponent {
  private readonly productCatalog = inject(ProductCatalogService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly overrides = signal<LocationPriceOverride[]>([]);
  readonly guardrail = signal<GuardrailPolicy | null>(null);
  readonly effectivePrice = signal<EffectiveLocationPrice | null>(null);
  readonly canManageGuardrails = computed(() =>
    this.authService.hasAnyRole(['ROLE_ADMIN', 'ROLE_PRICING_MANAGER']),
  );
  readonly canApproveOverrides = computed(() =>
    this.authService.hasAnyRole(['ROLE_ADMIN', 'ROLE_PRICING_MANAGER', 'ROLE_PRICING_APPROVER']),
  );

  createOverride(override: Partial<LocationPriceOverride>): void {
    this.productCatalog
      .createLocationPriceOverride(override)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.overrides.update(current => [...current, created]);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.PRICING.LOCATION_OVERRIDES.ERROR.CREATE');
        },
      });
  }

  approveOverride(overrideId: string): void {
    this.productCatalog
      .approveLocationPriceOverride(overrideId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.overrides.update(current =>
            current.map(entry => (entry.id === updated.id ? updated : entry)),
          );
        },
        error: () => this.errorKey.set('PRODUCT.PRICING.LOCATION_OVERRIDES.ERROR.APPROVE'),
      });
  }

  rejectOverride(overrideId: string, reason: string): void {
    this.productCatalog
      .rejectLocationPriceOverride(overrideId, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.overrides.update(current =>
            current.map(entry => (entry.id === updated.id ? updated : entry)),
          );
        },
        error: () => this.errorKey.set('PRODUCT.PRICING.LOCATION_OVERRIDES.ERROR.REJECT'),
      });
  }

  updateGuardrail(policy: GuardrailPolicy): void {
    this.productCatalog
      .upsertLocationGuardrailPolicy(policy)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.guardrail.set(updated);
        },
        error: () => this.errorKey.set('PRODUCT.PRICING.LOCATION_OVERRIDES.ERROR.GUARDRAIL'),
      });
  }

  loadEffectivePrice(locationId: string, productSku: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.productCatalog
      .getEffectiveLocationPrice(locationId, productSku)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: effectivePrice => {
          this.effectivePrice.set(effectivePrice);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.PRICING.LOCATION_OVERRIDES.ERROR.EFFECTIVE_PRICE');
        },
      });
  }
}
