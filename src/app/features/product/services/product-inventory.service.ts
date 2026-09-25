import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  AvailabilityView,
  InventoryAvailabilityService,
  InventoryLocationsService,
  LocationAvailabilityDto,
  LocationInventoryInquiryResponse,
} from '@durion-sdk/inventory';
import {
  InventoryAvailability,
  LocationInventory,
} from '../models/availability.models';

@Injectable({ providedIn: 'root' })
export class ProductInventoryService {
  private readonly availSdk = inject(InventoryAvailabilityService);
  private readonly locationsSdk = inject(InventoryLocationsService);

  queryInventoryAvailability(sku: string, locationId?: string): Observable<InventoryAvailability> {
    return this.availSdk.listAvailabilityBySku(sku).pipe(
      map((items: Array<LocationAvailabilityDto | AvailabilityView> | InventoryAvailability) =>
        this.toInventoryAvailabilityResponse(sku, items, locationId),
      ),
    );
  }

  // Issue #370/#373: queryAvailabilityBySku()/queryLeadTime() were removed. Even at the
  // corrected /v1/inventory/availability/{by-sku,lead-time} paths, those endpoints expect a
  // `productSku` + WAREHOUSE/SUPPLIER/TRANSIT `sourceType` contract with no vendor-feed
  // (MFR/DISTRIBUTOR) equivalent — backend #2213. Their only caller, FeedsComponent, now
  // shows a "vendor-feed availability isn't available yet" notice instead of calling an
  // endpoint that cannot serve this request shape.

  // Issue #370: moved to InventoryLocationsService.getLocationInventory (SDK), which matches
  // LocationInventoryInquiryController#getLocationInventory, GET
  // /v1/inventory/locations/{locationId}/inventory-inquiry. Its LocationInventoryInquiryResponse
  // carries only onHandQuantity/availableToPromiseQuantity -- no locationName or reserved -- so
  // those are omitted (undefined) rather than faked, pending backend #2206.
  getLocationInventory(locationId: string, sku: string): Observable<LocationInventory> {
    return this.locationsSdk
      .getLocationInventory(locationId, sku)
      .pipe(map((dto: LocationInventoryInquiryResponse) => this.toLocationInventoryFromInquiry(locationId, dto)));
  }

  // =========================================================================
  // Private adapters
  // =========================================================================

  private toLocationInventoryFromInquiry(
    locationId: string,
    dto: LocationInventoryInquiryResponse,
  ): LocationInventory {
    return {
      locationId: dto.locationId ?? locationId,
      // KNOWN GAP (backend #2206): LocationInventoryInquiryResponse has no locationName or
      // reserved field. Omitted rather than faked with '' / 0.
      locationName: undefined,
      onHand: dto.onHandQuantity ?? 0,
      reserved: undefined,
      atp: dto.availableToPromiseQuantity ?? 0,
    };
  }

  private toLocationInventory(dto: LocationAvailabilityDto | AvailabilityView): LocationInventory {
    return {
      locationId: dto.locationId ?? '',
      // KNOWN GAP: listAvailabilityBySku returns AvailabilityView, which has no
      // locationName, and nothing downstream resolves it -- the location column
      // on the availability page renders blank. Needs either a join against the
      // location list or a switch to getAvailabilityByProduct (which does carry
      // locationName but is keyed by productId, not sku).
      locationName: 'locationName' in dto ? dto.locationName ?? '' : '',
      onHand: dto.onHandQuantity ?? 0,
      reserved: 0,
      atp: dto.availableToPromiseQuantity ?? 0,
    };
  }

  private toInventoryAvailability(
    sku: string,
    items: Array<LocationAvailabilityDto | AvailabilityView>,
    locationId?: string,
  ): InventoryAvailability {
    const normalizedLocationId = locationId?.trim();
    const allRows = items.map(d => this.toLocationInventory(d));
    const breakdown = normalizedLocationId
      ? allRows.filter(row => row.locationId === normalizedLocationId)
      : allRows;
    return {
      sku,
      totalOnHand: breakdown.reduce((sum, l) => sum + l.onHand, 0),
      totalReserved: breakdown.reduce((sum, l) => sum + (l.reserved ?? 0), 0),
      totalAtp: breakdown.reduce((sum, l) => sum + l.atp, 0),
      locationBreakdown: breakdown,
    };
  }

  private toInventoryAvailabilityResponse(
    sku: string,
    response: Array<LocationAvailabilityDto | AvailabilityView> | InventoryAvailability,
    locationId?: string,
  ): InventoryAvailability {
    if (Array.isArray(response)) {
      return this.toInventoryAvailability(sku, response, locationId);
    }

    const normalizedLocationId = locationId?.trim();
    const breakdown = normalizedLocationId
      ? (response.locationBreakdown ?? []).filter(row => row.locationId === normalizedLocationId)
      : (response.locationBreakdown ?? []);

    return {
      sku,
      totalOnHand: breakdown.reduce((sum, l) => sum + l.onHand, 0),
      totalReserved: breakdown.reduce((sum, l) => sum + (l.reserved ?? 0), 0),
      totalAtp: breakdown.reduce((sum, l) => sum + l.atp, 0),
      locationBreakdown: breakdown,
    };
  }
}
