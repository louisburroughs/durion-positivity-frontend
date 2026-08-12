/**
 * SupplierDeliveryLocationService contract tests.
 *
 * ADR-0035: every public method is exercised; the roster call asserts the SDK
 * operation it delegates to (there is no raw URL — it goes through
 * `@durion-sdk/location`).
 * ADR-0032: fixtures typed as the exact SDK/domain interfaces.
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationAPIService, LocationResponseDTO } from '@durion-sdk/location';
import { SupplierDeliveryLocationService } from './supplier-delivery-location.service';
import { SupplierDeliveryLocation } from '../models/supplier-availability.models';

const LOCATION_A = 'ffc9a4c2-0000-7000-8000-0000000000aa';
const LOCATION_B = 'ffc9a4c2-0000-7000-8000-0000000000bb';

const locations: LocationResponseDTO[] = [
  { id: LOCATION_A, name: 'Downtown Service Center', active: true },
  { id: LOCATION_B, name: 'Closed Warehouse', active: false },
];

function createService(): SupplierDeliveryLocationService {
  return TestBed.inject(SupplierDeliveryLocationService);
}

describe('SupplierDeliveryLocationService', () => {
  const locationSdk = { getAllLocations: vi.fn() };

  beforeEach(() => {
    sessionStorage.clear();
    locationSdk.getAllLocations.mockReturnValue(of(locations));

    TestBed.configureTestingModule({
      providers: [
        SupplierDeliveryLocationService,
        { provide: LocationAPIService, useValue: locationSdk },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('listActiveLocations() delegates to LocationAPIService.getAllLocations()', () => {
    let received: SupplierDeliveryLocation[] | undefined;
    createService()
      .listActiveLocations()
      .subscribe(value => (received = value));

    expect(locationSdk.getAllLocations).toHaveBeenCalledTimes(1);
    expect(received).toEqual([{ locationId: LOCATION_A, name: 'Downtown Service Center' }]);
  });

  it('offers only active locations — you cannot take delivery at a disabled one', () => {
    let received: SupplierDeliveryLocation[] = [];
    createService()
      .listActiveLocations()
      .subscribe(value => (received = value));

    expect(received.some(entry => entry.locationId === LOCATION_B)).toBe(false);
  });

  it('starts with no location chosen', () => {
    expect(createService().selectedLocationId()).toBeNull();
  });

  it('select() records the choice and persists it under a positivity-scoped key', () => {
    const service = createService();
    service.select(LOCATION_A);

    expect(service.selectedLocationId()).toBe(LOCATION_A);
    expect(service.storageKey).toBe('durion.positivity.deliveryLocationId');
    expect(sessionStorage.getItem(service.storageKey)).toBe(LOCATION_A);
  });

  it('restores the session choice so the user is not re-picking on every navigation', () => {
    sessionStorage.setItem('durion.positivity.deliveryLocationId', LOCATION_A);

    expect(createService().selectedLocationId()).toBe(LOCATION_A);
  });

  it('select(null) clears both the signal and the persisted value', () => {
    const service = createService();
    service.select(LOCATION_A);
    service.select(null);

    expect(service.selectedLocationId()).toBeNull();
    expect(sessionStorage.getItem(service.storageKey)).toBeNull();
  });

  it('treats a blank selection as no selection', () => {
    const service = createService();
    service.select('   ');

    expect(service.selectedLocationId()).toBeNull();
  });
});
