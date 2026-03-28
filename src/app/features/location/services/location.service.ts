import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';

@Injectable({ providedIn: 'root' })
export class LocationService {
  constructor(private readonly api: ApiBaseService) { }

  private idempotencyOptions(key?: string) {
    return key ? { headers: { 'Idempotency-Key': key } } : undefined;
  }

  // ── Locations ────────────────────────────────────────────────────────────

  getAllLocations(): Observable<unknown[]> {
    return this.api.get<unknown[]>('/v1/locations');
  }

  createLocation(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>('/v1/locations', body, this.idempotencyOptions(idempotencyKey));
  }

  getLocationById(locationId: string): Observable<unknown> {
    return this.api.get<unknown>(`/v1/locations/${locationId}`);
  }

  patchLocation(locationId: string, patch: Record<string, unknown>): Observable<unknown> {
    return this.api.patch<unknown>(`/v1/locations/${locationId}`, patch);
  }

  // ── Bays ─────────────────────────────────────────────────────────────────

  listBays(locationId: string): Observable<unknown[]> {
    return this.api.get<unknown[]>(`/v1/locations/${locationId}/bays`);
  }

  createBay(locationId: string, body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>(`/v1/locations/${locationId}/bays`, body, this.idempotencyOptions(idempotencyKey));
  }

  getBay(locationId: string, bayId: string): Observable<unknown> {
    return this.api.get<unknown>(`/v1/locations/${locationId}/bays/${bayId}`);
  }

  patchBay(locationId: string, bayId: string, patch: Record<string, unknown>): Observable<unknown> {
    return this.api.patch<unknown>(`/v1/locations/${locationId}/bays/${bayId}`, patch);
  }

  // ── Mobile Units ─────────────────────────────────────────────────────────

  listMobileUnits(params?: Record<string, string>): Observable<unknown[]> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { httpParams = httpParams.set(k, v); });
    }
    return this.api.get<unknown[]>('/v1/mobile-units', httpParams);
  }

  createMobileUnit(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>('/v1/mobile-units', body, this.idempotencyOptions(idempotencyKey));
  }

  replaceCoverageRules(mobileUnitId: string, body: Record<string, unknown>[]): Observable<unknown> {
    return this.api.put<unknown>(`/v1/mobile-units/${mobileUnitId}/coverage-rules`, body);
  }
}
