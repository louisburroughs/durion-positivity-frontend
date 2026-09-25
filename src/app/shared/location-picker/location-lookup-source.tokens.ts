import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Minimal, display-only shape `LocationPickerComponent` needs. Kept separate from
 * `location`'s SDK-shaped location models so `shared/**` never depends on
 * `features/**` (LAY-02).
 */
export interface LocationLookupResult {
  readonly id: string;
  readonly name?: string;
  readonly code?: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly city?: string;
  readonly state?: string;
  readonly postalCode?: string;
  readonly mailingAddress?: string;
}

/**
 * Inversion point for the location directory: `shared/location-picker` only knows
 * this contract, never `LocationService` directly. The `location` feature provides
 * the real implementation once, at the composition root (`app.config.ts`), via
 * `provideLocationLookupSource()`.
 */
export interface LocationLookupSource {
  getAll(): Observable<LocationLookupResult[]>;
  getById(id: string): Observable<LocationLookupResult | null>;
}

export const LOCATION_LOOKUP_SOURCE = new InjectionToken<LocationLookupSource>('LOCATION_LOOKUP_SOURCE');
