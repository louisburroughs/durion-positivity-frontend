import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  AvailabilityView,
  InventoryAvailabilityService,
  InventoryLocationsService,
  LocationAvailabilityDto,
  LocationInventoryInquiryResponse,
} from '@durion-sdk/inventory';
import {
  FeedSourceType,
  InventoryAvailability,
  LeadTime,
  LocationInventory,
  SkuAvailability,
} from '../models/availability.models';

@Injectable({ providedIn: 'root' })
export class ProductInventoryService {
  private readonly api = inject(ApiBaseService);
  private readonly availSdk = inject(InventoryAvailabilityService);
  private readonly locationsSdk = inject(InventoryLocationsService);

  queryInventoryAvailability(sku: string, locationId?: string): Observable<InventoryAvailability> {
    return this.availSdk.listAvailabilityBySku(sku).pipe(
      map((items: Array<LocationAvailabilityDto | AvailabilityView> | InventoryAvailability) =>
        this.toInventoryAvailabilityResponse(sku, items, locationId),
      ),
    );
  }

  // Issue #370: was missing the doubled /inventory module segment the gateway's
  // StripPrefix=1 requires (real path: InventoryAvailabilityController#getAvailabilityBySku,
  // GET /v1/inventory/availability/by-sku). SDK gap remains open even at the correct path:
  // that endpoint takes `productSku` (not `sku`) and a WAREHOUSE/SUPPLIER/TRANSIT
  // `sourceType`, with no vendor-feed (MFR/DISTRIBUTOR) concept or by-sku listing —
  // backend #2213. Left on ApiBaseService.
  queryAvailabilityBySku(sku: string, sourceType: FeedSourceType): Observable<SkuAvailability[]> {
    const params = new HttpParams().set('sku', sku).set('sourceType', sourceType);
    return this.api.get<SkuAvailability[]>('/inventory/v1/inventory/availability/by-sku', params);
  }

  // Issue #370: was missing the doubled /inventory module segment and the /availability
  // segment (real path: InventoryAvailabilityController#getInventoryLeadTime, GET
  // /v1/inventory/availability/lead-time). SDK gap remains open even at the correct path:
  // that endpoint keys by `productId` (UUID) and a WAREHOUSE/SUPPLIER/TRANSIT `sourceType`,
  // not this `sku` + MFR/DISTRIBUTOR vendor-feed shape — backend #2213. Left on ApiBaseService.
  queryLeadTime(sku: string, sourceType: FeedSourceType): Observable<LeadTime[]> {
    const params = new HttpParams().set('sku', sku).set('sourceType', sourceType);
    return this.api.get<LeadTime[]>('/inventory/v1/inventory/availability/lead-time', params);
  }

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
