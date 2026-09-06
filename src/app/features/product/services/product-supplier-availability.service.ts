import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  SupplierStockAvailability,
  SupplierStockAvailabilityLine,
  SupplierStockAvailabilityService,
  SupplierStockAvailabilityVendor,
} from '@durion-sdk/supplier';
import {
  SupplierAvailability,
  SupplierAvailabilityLine,
  SupplierAvailabilityLineStatus,
  SupplierAvailabilityQuery,
  SupplierAvailabilityVendor,
  SupplierAvailabilityVendorStatus,
} from '../models/supplier-availability.models';

/**
 * Live per-vendor stock-availability check for a catalog product (#212).
 *
 * ── Transport ────────────────────────────────────────────────────────────
 * Backed entirely by the generated `@durion-sdk/supplier` fan-out read
 * (`getSupplierStockAvailability`, ADR-0010) — no hand-written
 * `/supplier/v1/**` path anywhere in this file.
 *
 * ── Partial answers are not errors ──────────────────────────────────────
 * The fan-out runs under a bounded deadline: a vendor that has not answered
 * in time comes back with vendor status `SUPPLIER_UNAVAILABLE` alongside the
 * vendors that did answer, and an empty `vendors` list means none is
 * configured. Every one of those is a 200 from the SDK and is mapped through
 * unchanged; none of it is raised as an Observable error here.
 *
 * ── Staleness is backend-owned ──────────────────────────────────────────
 * `stale` and `fetchedAt`/`asOf` are echoed exactly as the backend computed
 * them against its own `stalenessThreshold`. This service never recomputes
 * freshness from the client clock.
 */
@Injectable({ providedIn: 'root' })
export class ProductSupplierAvailabilityService {
  private readonly stockSdk = inject(SupplierStockAvailabilityService);

  checkAvailability(query: SupplierAvailabilityQuery): Observable<SupplierAvailability> {
    return this.stockSdk
      .getSupplierStockAvailability(
        query.deliveryLocationId,
        query.productId,
        query.sku,
        query.quantity,
      )
      .pipe(map(view => this.toSupplierAvailability(view)));
  }

  // ── Mapping (SDK view ⇄ domain model) ────────────────────────────────────

  private toSupplierAvailability(view: SupplierStockAvailability): SupplierAvailability {
    return {
      productId: view.productId ?? '',
      deliveryLocationId: view.deliveryLocationId ?? '',
      requestedQuantity: view.requestedQuantity ?? null,
      stalenessThreshold: view.stalenessThreshold ?? null,
      vendors: (view.vendors ?? []).map(vendor => this.toVendor(vendor)),
    };
  }

  private toVendor(vendor: SupplierStockAvailabilityVendor): SupplierAvailabilityVendor {
    return {
      vendorProfileId: vendor.vendorProfileId ?? '',
      vendorDisplayName: vendor.vendorDisplayName ?? '',
      status: (vendor.status as unknown as SupplierAvailabilityVendorStatus) ?? null,
      fetchedAt: vendor.fetchedAt ?? null,
      asOf: vendor.asOf ?? null,
      stale: vendor.stale ?? null,
      lines: (vendor.lines ?? []).map(line => this.toLine(line)),
    };
  }

  private toLine(line: SupplierStockAvailabilityLine): SupplierAvailabilityLine {
    return {
      status: (line.status as unknown as SupplierAvailabilityLineStatus) ?? null,
      availableQuantity: line.availableQuantity ?? null,
      currency: line.currency ?? null,
      earliestDeliveryDate: line.earliestDeliveryDate ?? null,
      quotedUnitPrice: line.quotedUnitPrice ?? null,
    };
  }
}
