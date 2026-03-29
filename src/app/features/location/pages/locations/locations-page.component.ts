import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { LocationService } from '../../services/location.service';

@Component({
  selector: 'app-locations-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './locations-page.component.html',
  styleUrl: './locations-page.component.css',
})
export class LocationsPageComponent implements OnInit {
  private readonly locationService = inject(LocationService);

  readonly loading = signal(false);
  readonly locations = signal<unknown[]>([]);
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
        this.locations.set(locations);
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

  getLocationName(location: unknown): string {
    const candidate = location as Record<string, unknown>;
    return String(candidate['name'] ?? candidate['locationName'] ?? candidate['locationId'] ?? 'Unknown');
  }

  getLocationType(location: unknown): string {
    const candidate = location as Record<string, unknown>;
    return String(candidate['type'] ?? candidate['locationType'] ?? 'UNSPECIFIED');
  }
}
