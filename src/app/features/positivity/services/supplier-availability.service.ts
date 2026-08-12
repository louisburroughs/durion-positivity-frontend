/**
 * Live supplier availability (stock inquiry) client — issue #190, CAP-319.
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * `@durion-sdk/supplier` covers vendor profiles, auth configs, commercial
 * accounts, endpoint bindings and exchange audit only (issue #188). It exposes
 * **no** availability or stock-inquiry operation, and the `@durion-sdk/catalog`
 * product payload has no `supplierAvailability` composition component, so the
 * "existing composition endpoint" the story assumes does not exist on the
 * client side yet. This service therefore calls `ApiBaseService` directly
 * (ADR-0010 — never `HttpClient` in a feature), exactly as the PRICAT surface
 * does, and the assumed contract is written down here so reconciling it against
 * the real controller is a diff rather than an investigation.
 *
 * ── Assumed endpoint contract (`/supplier/v1/**`) ────────────────────────────
 * Coded against durion-positivity-backend#1225 (SupplierStockService read).
 *
 *   GET /supplier/v1/availability?productId={id}&deliveryLocationId={id}[&quantity=n]
 *   GET /supplier/v1/availability?sku={sku}&deliveryLocationId={id}[&quantity=n]
 *     → 200 SupplierAvailability
 *         { productId?, sku?, deliveryLocationId, fetchedAt,
 *           stalenessThresholdMinutes,
 *           vendors: [ { vendorProfileId, vendorDisplayName, warehouseName?,
 *                        status, availableQuantity, unitOfMeasure,
 *                        deliveryEstimate?, asOf, errorCode? } ] }
 *     → 400 invalid/missing productId|sku or deliveryLocationId
 *     → 403 caller may not read supplier availability
 *     → 5xx / timeout — retryable; the caller renders a degraded state
 *
 * The `sku` variant exists because procurement purchase-order lines are keyed by
 * SKU, not by catalog product id; both variants answer with the same envelope.
 *
 * ── What this service deliberately does not do ───────────────────────────────
 * No caching (the backend owns TTL caching), no retry loop, no vendor ranking,
 * and no aggregation across vendors. A per-vendor `status` other than `OK`
 * carries `null` quantities and is returned untouched: inventing a `0` here
 * would put a fabricated number in front of a counter user quoting a customer.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { SupplierAvailability } from '../models/supplier-availability.models';

const AVAILABILITY_PATH = '/supplier/v1/availability';

@Injectable({ providedIn: 'root' })
export class SupplierAvailabilityService {
  private readonly api = inject(ApiBaseService);

  /** Availability for a catalog product id at one delivery location. */
  getAvailabilityByProductId(
    productId: string,
    deliveryLocationId: string,
    quantity?: number,
  ): Observable<SupplierAvailability> {
    return this.api.get<SupplierAvailability>(
      AVAILABILITY_PATH,
      this.buildParams('productId', productId, deliveryLocationId, quantity),
    );
  }

  /** Availability for a vendor/catalog SKU — the key procurement lines carry. */
  getAvailabilityBySku(
    sku: string,
    deliveryLocationId: string,
    quantity?: number,
  ): Observable<SupplierAvailability> {
    return this.api.get<SupplierAvailability>(
      AVAILABILITY_PATH,
      this.buildParams('sku', sku, deliveryLocationId, quantity),
    );
  }

  private buildParams(
    key: 'productId' | 'sku',
    value: string,
    deliveryLocationId: string,
    quantity?: number,
  ): HttpParams {
    let params = new HttpParams()
      .set(key, value)
      .set('deliveryLocationId', deliveryLocationId);
    if (typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0) {
      params = params.set('quantity', String(quantity));
    }
    return params;
  }
}
