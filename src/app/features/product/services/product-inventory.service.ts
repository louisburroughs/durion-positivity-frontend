import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  FeedSourceType,
  InventoryAvailability,
  LeadTime,
  LocationInventory,
  SkuAvailability,
} from '../models/availability.models';

@Injectable({ providedIn: 'root' })
export class ProductInventoryService {
  constructor(private readonly api: ApiBaseService) {}

  queryInventoryAvailability(sku: string, locationId?: string): Observable<InventoryAvailability> {
    let params = new HttpParams().set('sku', sku);
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    return this.api.get<InventoryAvailability>('/inventory/v1/availability', params);
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
}
