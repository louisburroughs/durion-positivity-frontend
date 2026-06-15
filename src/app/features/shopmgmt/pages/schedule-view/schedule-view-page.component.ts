import { Component, DestroyRef, OnInit, signal, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { LocationAPIService, LocationResponseDTO } from '@durion-sdk/location';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail } from '../../models/appointment.models';

export interface ScheduleResource {
  resourceId?: string;
  resourceName?: string;
  resourceType?: string;
  appointments?: AppointmentDetail[];
}

const MAX_SUGGESTIONS = 8;

@Component({
  selector: 'app-schedule-view-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './schedule-view-page.component.html',
  styleUrl: './schedule-view-page.component.css',
})
export class ScheduleViewPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);
  private readonly locationApi = inject(LocationAPIService);

  private readonly today = new Date().toISOString().split('T')[0];

  readonly loading = signal(false);
  readonly scheduleData = signal<ScheduleResource[]>([]);
  readonly selectedItem = signal<AppointmentDetail | null>(null);
  readonly availabilityError = signal(false);

  readonly allLocations = signal<LocationResponseDTO[]>([]);
  readonly locationDisplayName = signal('');
  readonly showSuggestions = signal(false);

  readonly locationSuggestions = computed<LocationResponseDTO[]>(() => {
    const q = this.locationDisplayName().trim().toLowerCase();
    const locs = this.allLocations();
    if (!q) return locs.slice(0, MAX_SUGGESTIONS);
    return locs
      .filter(l =>
        l.name?.toLowerCase().includes(q) ||
        l.code?.toLowerCase().includes(q),
      )
      .slice(0, MAX_SUGGESTIONS);
  });

  readonly filterForm = new FormGroup({
    locationId: new FormControl('', Validators.required),
    selectedDate: new FormControl(this.today),
    resourceType: new FormControl(''),
    resourceId: new FormControl(''),
  });

  ngOnInit(): void {
    this.locationApi
      .getAllLocations('body', false, { transferCache: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: locs => this.allLocations.set(locs as LocationResponseDTO[]),
        error: () => { /* proceed without typeahead */ },
      });

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      if (params['locationId']) {
        this.filterForm.patchValue({ locationId: params['locationId'] });
        this.locationDisplayName.set(params['locationId']);
      }
      if (params['date']) this.filterForm.patchValue({ selectedDate: params['date'] });
      if (params['resourceType']) this.filterForm.patchValue({ resourceType: params['resourceType'] });
      if (params['resourceId']) this.filterForm.patchValue({ resourceId: params['resourceId'] });
    });
  }

  onLocationInput(value: string): void {
    this.locationDisplayName.set(value);
    this.filterForm.patchValue({ locationId: '' });
    this.showSuggestions.set(true);
  }

  onLocationFocus(): void {
    if (this.allLocations().length > 0) {
      this.showSuggestions.set(true);
    }
  }

  onLocationBlur(): void {
    setTimeout(() => this.showSuggestions.set(false), 150);
  }

  selectLocation(loc: LocationResponseDTO): void {
    const id = loc.id ?? '';
    this.filterForm.patchValue({ locationId: id });
    this.locationDisplayName.set(loc.name ?? loc.code ?? id);
    this.showSuggestions.set(false);
  }

  loadBoard(): void {
    const { locationId, selectedDate, resourceType, resourceId } = this.filterForm.value;
    if (!locationId || !selectedDate) return;
    this.loading.set(true);
    this.availabilityError.set(false);
    this.appointmentService.viewSchedule(locationId, selectedDate, resourceType ?? undefined, resourceId ?? undefined).subscribe({
      next: (data: unknown) => {
        this.scheduleData.set((data as ScheduleResource[]) ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.availabilityError.set(true);
        this.loading.set(false);
      },
    });
  }

  selectItem(item: AppointmentDetail): void {
    this.selectedItem.set(item);
  }

  closeDetails(): void {
    this.selectedItem.set(null);
  }
}
