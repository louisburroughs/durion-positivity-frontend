import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  LocationRef,
  LocationRosterEntry,
  LocationValidationResult,
} from '../models/location.models';

@Injectable({ providedIn: 'root' })
export class ProductLocationService {
  constructor(private readonly api: ApiBaseService) {}

  getRoster(filter?: { status?: string }): Observable<LocationRosterEntry[]> {
    let params = new HttpParams();
    if (filter?.status) {
      params = params.set('status', filter.status);
    }
    return this.api.get<LocationRosterEntry[]>('/location/v1/roster', params);
  }

  getAllLocations(): Observable<LocationRef[]> {
    return this.api.get<LocationRef[]>('/location/v1/locations');
  }

  validateLocation(locationId: string): Observable<LocationValidationResult> {
    return this.api.post<LocationValidationResult>(
      `/location/v1/locations/${encodeURIComponent(locationId)}/validate`,
      {},
    );
  }
}
