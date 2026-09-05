import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  PeopleAvailabilityResponse,
  PeopleAvailabilityResponseAssignmentStatusEnum,
} from '@durion-sdk/people';
import { DispatchBoardService } from '../../services/dispatch-board.service';

@Component({
  selector: 'app-mechanic-availability-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './mechanic-availability-page.component.html',
  styleUrl: './mechanic-availability-page.component.css',
})
export class MechanicAvailabilityPageComponent implements OnInit {
  private readonly dispatchBoardService = inject(DispatchBoardService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(false);
  readonly availabilityData = signal<PeopleAvailabilityResponse[]>([]);
  readonly locationId = signal('');
  readonly locationName = signal('');
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
    this.dispatchBoardService.getPrimaryLocation().subscribe({
      next: (location) => {
        const id = String(location.locationId ?? '').trim();
        const name = String(location.locationName ?? '').trim();
        this.locationId.set(id);
        this.locationName.set(name);
        this.filterForm.controls.locationId.setValue(id);
        // loadAvailability guards empty ids itself and prompts for a location,
        // which is also the right outcome when the primary location is blank.
        this.loadAvailability();
      },
      error: () => {
        this.error.set('SHOPMGMT.MECHANIC_AVAILABILITY.ERROR.LOAD_LOCATION');
      },
    });
  }

  loadAvailability(): void {
    const locationId = this.filterForm.controls.locationId.value.trim();
    const date = this.filterForm.controls.date.value.trim();
    if (!locationId) {
      this.error.set('SHOPMGMT.MECHANIC_AVAILABILITY.ERROR.LOCATION_REQUIRED');
      this.availabilityData.set([]);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.locationId.set(locationId);
    this.selectedDate.set(date);
    this.dispatchBoardService.getAvailability(locationId, date).subscribe({
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

  getMechanicName(entry: PeopleAvailabilityResponse): string {
    const name = [entry.firstName, entry.lastName]
      .map(part => String(part ?? '').trim())
      .filter(Boolean)
      .join(' ');
    return name || this.translate.instant('COMMON.NOT_AVAILABLE');
  }

  isAvailable(entry: PeopleAvailabilityResponse): boolean {
    return entry.assignmentStatus === PeopleAvailabilityResponseAssignmentStatusEnum.Active;
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
