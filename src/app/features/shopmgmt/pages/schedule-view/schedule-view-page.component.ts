import { Component, DestroyRef, OnInit, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail } from '../../models/appointment.models';

export interface ScheduleResource {
  resourceId?: string;
  resourceName?: string;
  resourceType?: string;
  appointments?: AppointmentDetail[];
}

@Component({
  selector: 'app-schedule-view-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './schedule-view-page.component.html',
  styleUrl: './schedule-view-page.component.css',
})
export class ScheduleViewPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);

  private readonly today = new Date().toISOString().split('T')[0];

  readonly loading = signal(false);
  readonly scheduleData = signal<ScheduleResource[]>([]);
  readonly selectedItem = signal<AppointmentDetail | null>(null);
  readonly availabilityError = signal(false);

  readonly filterForm = new FormGroup({
    locationId: new FormControl('', Validators.required),
    selectedDate: new FormControl(this.today),
    resourceType: new FormControl(''),
    resourceId: new FormControl(''),
  });

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      if (params['locationId']) this.filterForm.patchValue({ locationId: params['locationId'] });
      if (params['date']) this.filterForm.patchValue({ selectedDate: params['date'] });
      if (params['resourceType']) this.filterForm.patchValue({ resourceType: params['resourceType'] });
      if (params['resourceId']) this.filterForm.patchValue({ resourceId: params['resourceId'] });
    });
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
