
import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { LocationService } from '../../services/location.service';

interface LocationItem {
  id?: string;
  name?: string;
  code?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  mailingAddress?: string;
  active?: boolean;
  type?: { id?: string; name?: string; description?: string };
}

@Component({
  selector: 'app-locations-page',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './locations-page.component.html',
  styleUrl: './locations-page.component.css',
})
export class LocationsPageComponent implements OnInit {
  private readonly locationService = inject(LocationService);

  readonly loading = signal(false);
  readonly locations = signal<LocationItem[]>([]);
  readonly error = signal<string | null>(null);
  readonly showCreateModal = signal(false);
  readonly createName = signal('');
  readonly createType = signal('STORE');
  readonly createError = signal<string | null>(null);
  readonly createSuccess = signal(false);

  ngOnInit(): void {
    this.loadLocations();
  }

  loadLocations(): void {
    this.loading.set(true);
    this.error.set(null);
    this.locationService.getAllLocations().subscribe({
      next: (locations) => {
        this.locations.set(this.normalizeLocations(locations));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('LOCATION.LOCATIONS.ERROR.LOAD');
        this.loading.set(false);
      },
    });
  }

  openCreateModal(): void {
    this.createError.set(null);
    this.createSuccess.set(false);
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
    this.createError.set(null);
  }

  submitCreate(): void {
    const name = this.createName().trim();
    const type = this.createType().trim();
    if (!name || !type) {
      this.createError.set('LOCATION.LOCATIONS.ERROR.NAME_TYPE_REQUIRED');
      return;
    }

    this.createError.set(null);
    this.locationService.createLocation({ name, type }).subscribe({
      next: () => {
        this.createSuccess.set(true);
        this.closeCreateModal();
        this.createName.set('');
        this.createType.set('STORE');
        this.loadLocations();
      },
      error: () => {
        this.createError.set('LOCATION.LOCATIONS.ERROR.CREATE');
      },
    });
  }

  getLocationName(location: LocationItem): string {
    return location.name ?? location.id ?? 'Unknown';
  }

  getLocationType(location: LocationItem): string {
    return location.type?.name ?? '';
  }

  getLocationCode(location: LocationItem): string {
    return location.code ?? '';
  }

  getLocationAddress(location: LocationItem): string {
    const parts = [
      location.addressLine1,
      location.addressLine2,
      location.city,
      location.state,
      location.postalCode,
      location.country,
    ].filter(Boolean);
    return parts.join(', ');
  }

  isActive(location: LocationItem): boolean {
    return location.active ?? false;
  }

  private normalizeLocations(response: unknown): LocationItem[] {
    if (Array.isArray(response)) {
      return response as LocationItem[];
    }

    if (response !== null && typeof response === 'object') {
      const payload = response as Record<string, unknown>;
      const items = payload['items'];
      if (Array.isArray(items)) {
        return items as LocationItem[];
      }
    }

    return [];
  }
}
