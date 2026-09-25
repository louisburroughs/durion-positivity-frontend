import { Provider, inject } from '@angular/core';
import { map } from 'rxjs/operators';
import {
  LOCATION_LOOKUP_SOURCE,
  LocationLookupResult,
  LocationLookupSource,
} from '../../../shared/location-picker/location-lookup-source.tokens';
import { LocationService } from './location.service';

/**
 * Registers the `location`-backed implementation of `shared/location-picker`'s
 * `LocationLookupSource` contract. Registered once, at the composition root
 * (`app.config.ts`), so no feature importing `LocationPickerComponent` needs to
 * import anything from `location` directly (LAY-03).
 */
export function provideLocationLookupSource(): Provider {
  return {
    provide: LOCATION_LOOKUP_SOURCE,
    useFactory: (): LocationLookupSource => {
      const location = inject(LocationService);
      return {
        getAll: () =>
          location.getAllLocations().pipe(map(rows => (rows as LocationLookupResult[]).filter(r => !!r?.id))),
        getById: id =>
          location.getLocationById(id).pipe(map(loc => (loc as LocationLookupResult | null) ?? null)),
      };
    },
  };
}
