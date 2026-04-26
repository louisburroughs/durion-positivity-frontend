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

  queryInventoryAvailability(sku: string, _locationId?: string): Observable<InventoryAvailability> {
    return this.availSdk.queryInventoryAvailability(sku).pipe(
      map((items: Array<LocationAvailabilityDto>) => this.toInventoryAvailability(sku, items)),
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

  private toInventoryAvailability(sku: string, items: Array<LocationAvailabilityDto>): InventoryAvailability {
    const breakdown = items.map(d => this.toLocationInventory(d));
    return {
      sku,
      totalOnHand: breakdown.reduce((sum, l) => sum + l.onHand, 0),
      totalReserved: breakdown.reduce((sum, l) => sum + l.reserved, 0),
      totalAtp: breakdown.reduce((sum, l) => sum + l.atp, 0),
      locationBreakdown: breakdown,
    };
  }
}
