import { EnvironmentInjector, Provider, inject, runInInjectionContext } from '@angular/core';
import { from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  LOCATION_LOOKUP_SOURCE,
  LocationLookupResult,
  LocationLookupSource,
} from '../../../shared/location-picker/location-lookup-source.tokens';
import type { LocationService } from './location.service';

/**
 * Registers the `location`-backed implementation of `shared/location-picker`'s
 * `LocationLookupSource` contract. Registered once, at the composition root
 * (`app.config.ts`), so no feature importing `LocationPickerComponent` needs to
 * import anything from `location` directly (LAY-03).
 *
 * `LocationService` (and the generated `@durion-sdk/location` API classes it
 * wraps) is loaded via a dynamic `import()` rather than a static one, so it
 * lands in its own chunk and is fetched only the first time a location lookup
 * actually runs, instead of being pulled into the initial bundle by
 * `app.config.ts`.
 */
/**
 * The location SDK keys a location by `id`, but older local models (and some callers' fixtures)
 * used `locationId`. The pages that moved onto this source accepted both, so keep doing that
 * rather than silently dropping rows that only carry `locationId`.
 */
export function toLocationLookupResult(row: unknown): LocationLookupResult | null {
  if (!row || typeof row !== 'object') return null;
  const rec = row as Record<string, unknown>;
  const id = [rec['id'], rec['locationId']].find((v): v is string => typeof v === 'string' && v !== '');
  if (!id) return null;
  return { ...(rec as Partial<LocationLookupResult>), id };
}

export function provideLocationLookupSource(): Provider {
  return {
    provide: LOCATION_LOOKUP_SOURCE,
    useFactory: (): LocationLookupSource => {
      const injector = inject(EnvironmentInjector);
      let locationPromise: Promise<LocationService> | undefined;
      const getLocation = (): Promise<LocationService> => {
        locationPromise ??= import('./location.service').then(({ LocationService }) =>
          runInInjectionContext(injector, () => inject(LocationService)),
        );
        return locationPromise;
      };
      return {
        getAll: () =>
          from(getLocation()).pipe(
            switchMap(location =>
              location
                .getAllLocations()
                .pipe(map(rows => rows.map(toLocationLookupResult).filter((r): r is LocationLookupResult => r !== null))),
            ),
          ),
        getById: id =>
          from(getLocation()).pipe(
            switchMap(location =>
              location.getLocationById(id).pipe(map(toLocationLookupResult)),
            ),
          ),
      };
    },
  };
}
