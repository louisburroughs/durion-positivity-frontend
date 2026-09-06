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
 * Known vendor-status tokens (`SupplierStockAvailabilityVendorStatusEnum` in
 * `@durion-sdk/supplier`). Anything else maps to `null` rather than being
 * cast through — mirrors `SupplierOrderTransmissionService.toState`.
 */
const KNOWN_VENDOR_STATUSES: ReadonlySet<string> = new Set<SupplierAvailabilityVendorStatus>([
  'OK',
  'SUPPLIER_UNAVAILABLE',
  'NOT_LISTED',
  'CAPABILITY_NOT_CONFIGURED',
  'CONFIGURATION_ERROR',
]);

function toVendorStatus(value: string | undefined): SupplierAvailabilityVendorStatus | null {
  return value && KNOWN_VENDOR_STATUSES.has(value)
    ? (value as SupplierAvailabilityVendorStatus)
    : null;
}

/** Known line-status tokens (`SupplierStockAvailabilityLineStatusEnum`). */
const KNOWN_LINE_STATUSES: ReadonlySet<string> = new Set<SupplierAvailabilityLineStatus>([
  'AVAILABLE',
  'UNAVAILABLE',
  'NOT_LISTED',
  'NOT_ANSWERED',
]);

function toLineStatus(value: string | undefined): SupplierAvailabilityLineStatus | null {
  return value && KNOWN_LINE_STATUSES.has(value) ? (value as SupplierAvailabilityLineStatus) : null;
}

/**
 * Live per-vendor stock-availability check for a purchase-order line (#212).
 *
 * ── Transport ────────────────────────────────────────────────────────────
 * Backed entirely by the generated `@durion-sdk/supplier` fan-out read
 * (`getSupplierStockAvailability`, ADR-0010) — no hand-written
 * `/supplier/v1/**` path anywhere in this file. Purchase-order lines carry a
 * SKU, not a productId, so this check is always keyed by `sku`.
 *
 * ── Why the fan-out read, not getPurchaseOrderSupplierAvailability ────────
 * The PO create/revise form (`po-form`) has no `vendorProfileId` or
 * `deliveryLocationId` in its model — only `supplierId` (a different
 * identity than a supplier-module vendor profile) and no location field at
 * all — and a PO being drafted has no `poId` yet. The fan-out read needs
 * only a delivery location the operator supplies here, and returns a
 * cross-vendor comparison, which is what a buyer wants before submitting a
 * line. See #212.
 *
 * ── Partial answers are not errors ──────────────────────────────────────
 * A vendor that has not answered by the fan-out deadline comes back with
 * vendor status `SUPPLIER_UNAVAILABLE` alongside the vendors that did
 * answer, and an empty `vendors` list means none is configured. Every one
 * of those is a 200 from the SDK, mapped through unchanged.
 */
@Injectable({ providedIn: 'root' })
export class InventorySupplierAvailabilityService {
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
      status: toVendorStatus(vendor.status),
      fetchedAt: vendor.fetchedAt ?? null,
      asOf: vendor.asOf ?? null,
      stale: vendor.stale ?? null,
      lines: (vendor.lines ?? []).map(line => this.toLine(line)),
    };
  }

  private toLine(line: SupplierStockAvailabilityLine): SupplierAvailabilityLine {
    return {
      status: toLineStatus(line.status),
      availableQuantity: line.availableQuantity ?? null,
      currency: line.currency ?? null,
      earliestDeliveryDate: line.earliestDeliveryDate ?? null,
      quotedUnitPrice: line.quotedUnitPrice ?? null,
    };
  }
}
