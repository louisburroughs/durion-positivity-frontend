import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { LOCATION_LOOKUP_SOURCE } from '../../../shared/location-picker/location-lookup-source.tokens';
import { LocationService } from './location.service';
import { provideLocationLookupSource, toLocationLookupResult } from './location-lookup-source.provider';

describe('toLocationLookupResult', () => {
  it('keeps the SDK id', () => {
    expect(toLocationLookupResult({ id: 'loc-1', name: 'Main' })).toEqual({ id: 'loc-1', name: 'Main' });
  });

  it('maps a locationId-only row to id instead of dropping it', () => {
    expect(toLocationLookupResult({ locationId: 'loc-2', name: 'North' })).toEqual(
      expect.objectContaining({ id: 'loc-2', name: 'North' }),
    );
  });

  it('falls back to locationId when id is present but unusable', () => {
    expect(toLocationLookupResult({ id: '', locationId: 'loc-4' })?.id).toBe('loc-4');
    expect(toLocationLookupResult({ id: 42, locationId: 'loc-5' })?.id).toBe('loc-5');
  });

  it('drops rows with no usable id', () => {
    expect(toLocationLookupResult({ name: 'Nameless' })).toBeNull();
    expect(toLocationLookupResult(null)).toBeNull();
  });
});

describe('provideLocationLookupSource', () => {
  const getLocationById = vi.fn();
  const setup = (rows: unknown[], byId: unknown) => {
    getLocationById.mockReset().mockReturnValue(of(byId));
    TestBed.configureTestingModule({
      providers: [
        provideLocationLookupSource(),
        { provide: LocationService, useValue: { getAllLocations: () => of(rows), getLocationById } },
      ],
    });
    return TestBed.inject(LOCATION_LOOKUP_SOURCE);
  };

  it('returns both id-shaped and locationId-shaped rows from getAll', async () => {
    const source = setup([{ id: 'loc-1', name: 'Main' }, { locationId: 'loc-2', name: 'North' }, { name: 'x' }], null);
    const rows = await firstValueFrom(source.getAll());
    expect(rows.map(r => r.id)).toEqual(['loc-1', 'loc-2']);
  });

  it('normalizes getById', async () => {
    const source = setup([], { locationId: 'loc-3', name: 'South' });
    expect((await firstValueFrom(source.getById('loc-3')))?.id).toBe('loc-3');
    expect(getLocationById).toHaveBeenCalledExactlyOnceWith('loc-3');
  });
});
