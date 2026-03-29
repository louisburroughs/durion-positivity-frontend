import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { PeopleService } from '../../../people/services/people.service';

@Component({
  selector: 'app-mechanic-availability-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './mechanic-availability-page.component.html',
  styleUrl: './mechanic-availability-page.component.css',
})
export class MechanicAvailabilityPageComponent implements OnInit {
  private readonly peopleService = inject(PeopleService);

  readonly loading = signal(false);
  readonly availabilityData = signal<unknown[]>([]);
  readonly locationId = signal('');
  readonly selectedDate = signal(this.todayIso());
  readonly error = signal<string | null>(null);

  readonly filterForm = new FormGroup({
    locationId: new FormControl('', { nonNullable: true }),
    date: new FormControl(this.todayIso(), { nonNullable: true }),
  });

  ngOnInit(): void {
    this.loadCurrentLocation();
  }

  loadCurrentLocation(): void {
    this.peopleService.getCurrentUserPrimaryLocation().subscribe({
      next: (location) => {
        const data = location as Record<string, unknown>;
        const id = String(data['locationId'] ?? data['id'] ?? '');
        this.locationId.set(id);
        this.filterForm.controls.locationId.setValue(id);
        this.loadAvailability();
      },
      error: () => {
        this.error.set('SHOPMGMT.MECHANIC_AVAILABILITY.ERROR.LOAD_LOCATION');
        this.loadAvailability();
      },
    });
  }

  loadAvailability(): void {
    this.loading.set(true);
    this.error.set(null);

    const locationId = this.filterForm.controls.locationId.value.trim();
    const date = this.filterForm.controls.date.value.trim();
    this.locationId.set(locationId);
    this.selectedDate.set(date);

    this.peopleService.getPeopleAvailability({ locationId, date }).subscribe({
      next: (availability) => {
        this.availabilityData.set(Array.isArray(availability) ? availability : []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('SHOPMGMT.MECHANIC_AVAILABILITY.ERROR.LOAD_AVAILABILITY');
        this.availabilityData.set([]);
        this.loading.set(false);
      },
    });
  }

  getMechanicName(entry: unknown): string {
    const candidate = entry as Record<string, unknown>;
    return String(candidate['mechanicName'] ?? candidate['name'] ?? candidate['personId'] ?? 'Unknown');
  }

  isAvailable(entry: unknown): boolean {
    const candidate = entry as Record<string, unknown>;
    return Boolean(candidate['available'] ?? candidate['isAvailable']);
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
