import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  InventoryAvailabilityService,
  LocationAvailabilityDto,
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

  queryInventoryAvailability(sku: string, locationId?: string): Observable<InventoryAvailability> {
    return this.availSdk.getInventoryAvailability(sku).pipe(
      map((items: Array<LocationAvailabilityDto> | InventoryAvailability) =>
        this.toInventoryAvailabilityResponse(sku, items, locationId),
      ),
    );
  }

  queryAvailabilityBySku(sku: string, sourceType: FeedSourceType): Observable<SkuAvailability[]> {
    const params = new HttpParams().set('sku', sku).set('sourceType', sourceType);
    return this.api.get<SkuAvailability[]>('/inventory/v1/availability/by-sku', params);
  }

  queryLeadTime(sku: string, sourceType: FeedSourceType): Observable<LeadTime[]> {
    const params = new HttpParams().set('sku', sku).set('sourceType', sourceType);
    return this.api.get<LeadTime[]>('/inventory/v1/lead-time', params);
  }

  getLocationInventory(locationId: string, sku: string): Observable<LocationInventory> {
    const params = new HttpParams().set('sku', sku);
    return this.api.get<LocationInventory>(
      `/inventory/v1/locations/${encodeURIComponent(locationId)}/inventory`,
      params,
    );
  }

  // =========================================================================
  // Private adapters
  // =========================================================================

  private toLocationInventory(dto: LocationAvailabilityDto): LocationInventory {
    return {
      locationId: dto.locationId ?? '',
      locationName: dto.locationName ?? '',
      onHand: dto.onHandQuantity ?? 0,
      reserved: 0,
      atp: dto.availableToPromiseQuantity ?? 0,
    };
  }

  private toInventoryAvailability(
    sku: string,
    items: Array<LocationAvailabilityDto>,
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
      totalReserved: breakdown.reduce((sum, l) => sum + l.reserved, 0),
      totalAtp: breakdown.reduce((sum, l) => sum + l.atp, 0),
      locationBreakdown: breakdown,
    };
  }

  private toInventoryAvailabilityResponse(
    sku: string,
    response: Array<LocationAvailabilityDto> | InventoryAvailability,
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
      totalReserved: breakdown.reduce((sum, l) => sum + l.reserved, 0),
      totalAtp: breakdown.reduce((sum, l) => sum + l.atp, 0),
      locationBreakdown: breakdown,
    };
  }
}
