/**
 * Interim delivery-location context for supplier availability surfaces (#190).
 *
 * ── Why this exists, and why it is interim ───────────────────────────────────
 * Issue #190 lists "a delivery location context (current location) available on
 * both screens" as a precondition. **That context does not exist in this
 * application**: there is no current-location service in `core/`, Product Detail
 * has no location concept, and the purchase-order form carries a supplier and a
 * delivery date but no location. Building a platform-wide current-location state
 * is a cross-cutting concern (it would have to bind to the shell, the auth
 * session and every domain that is location-scoped) and is out of scope here.
 *
 * So this service is deliberately small and deliberately local to the supplier
 * surfaces: it holds the location the user picked for availability lookups and
 * remembers it for the session, so they are not re-picking on every navigation.
 * `sessionStorage` — not `localStorage` — because a delivery location is a
 * working context, not a durable preference: a user who returns tomorrow should
 * re-state where they are shipping rather than inherit a stale answer.
 *
 * **When a platform location context lands, delete this and read from it.** The
 * only thing consumers depend on is `selectedLocationId()` and
 * `listActiveLocations()`.
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * The roster comes from `@durion-sdk/location` (`LocationAPIService`), the same
 * source `supplier-profile.service.ts` uses for delivery-account mapping, so
 * there is one definition of "active location" across the supplier surfaces.
 * Only `active === true` locations are offered: you cannot take delivery at a
 * location that is switched off.
 */
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, map } from 'rxjs';
import { LocationAPIService, LocationResponseDTO } from '@durion-sdk/location';
import { SupplierDeliveryLocation } from '../models/supplier-availability.models';

/** Positivity-scoped session key. Namespaced so it cannot collide with other domains. */
const STORAGE_KEY = 'durion.positivity.deliveryLocationId';

@Injectable({ providedIn: 'root' })
export class SupplierDeliveryLocationService {
  private readonly locationSdk = inject(LocationAPIService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The delivery location chosen for this session, or null when nothing is chosen yet. */
  readonly selectedLocationId = signal<string | null>(null);

  constructor() {
    this.selectedLocationId.set(this.readPersisted());
  }

  /** Session-storage key, exposed so specs assert the namespacing rather than guess it. */
  get storageKey(): string {
    return STORAGE_KEY;
  }

  /** Active pos-locations offered as delivery contexts. */
  listActiveLocations(): Observable<SupplierDeliveryLocation[]> {
    return this.locationSdk.listLocations().pipe(
      map((items: LocationResponseDTO[]) =>
        (items ?? [])
          .filter(location => location.active === true)
          .map(location => ({ locationId: location.id, name: location.name })),
      ),
    );
  }

  /** Record the user's choice for the rest of the session. `null` clears it. */
  select(locationId: string | null): void {
    const next = locationId && locationId.trim() !== '' ? locationId : null;
    this.selectedLocationId.set(next);
    this.persist(next);
  }

  private readPersisted(): string | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      return sessionStorage.getItem(STORAGE_KEY) || null;
    } catch {
      // Private-browsing / disabled storage: the picker still works, it just forgets.
      return null;
    }
  }

  private persist(locationId: string | null): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      if (locationId) {
        sessionStorage.setItem(STORAGE_KEY, locationId);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage refused; the in-memory signal remains authoritative for this page.
    }
  }
}
