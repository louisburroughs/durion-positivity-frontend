import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail, Conflict, RescheduleRequest } from '../../models/appointment.models';

@Component({
  selector: 'app-appointment-conflict-override-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './appointment-conflict-override-page.component.html',
  styleUrl: './appointment-conflict-override-page.component.css',
})
export class AppointmentConflictOverridePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);

  readonly loading = signal(false);
  readonly appointment = signal<AppointmentDetail | null>(null);
  readonly conflicts = signal<Conflict[]>([]);
  readonly showConflictPanel = signal(false);
  readonly overrideMode = signal(false);
  readonly rescheduleLoading = signal(false);
  readonly overrideLoading = signal(false);
  readonly rescheduleSuccess = signal(false);
  readonly overrideSuccess = signal(false);
  readonly rescheduleError = signal<string | null>(null);
  readonly overrideError = signal<string | null>(null);

  readonly rescheduleForm = new FormGroup({
    scheduledStartDateTime: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    scheduledEndDateTime: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
  });

  readonly overrideForm = new FormGroup({
    overrideReason: new FormControl('', { validators: [Validators.required], nonNullable: true }),
  });

  private appointmentId = '';

  readonly hasConflicts = computed(() => this.conflicts().length > 0);

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = String(params['id'] ?? '');
      this.appointmentId = id;
      if (!id) {
        return;
      }

      this.loading.set(true);
      this.appointmentService.getAppointment(id).subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          this.loading.set(false);
        },
        error: () => {
          this.rescheduleError.set('Failed to load appointment.');
          this.loading.set(false);
        },
      });
    });
  }

  submitReschedule(): void {
    if (this.rescheduleForm.invalid || !this.appointmentId) {
      this.rescheduleForm.markAllAsTouched();
      return;
    }

    this.rescheduleLoading.set(true);
    this.rescheduleSuccess.set(false);
    this.rescheduleError.set(null);

    const body: RescheduleRequest = {
      scheduledStartDateTime: this.rescheduleForm.controls.scheduledStartDateTime.value,
      scheduledEndDateTime: this.rescheduleForm.controls.scheduledEndDateTime.value,
      reason: this.rescheduleForm.controls.reason.value,
    };

    this.appointmentService.rescheduleAppointment(this.appointmentId, body).subscribe({
      next: (appointment) => {
        this.appointment.set(appointment);
        this.conflicts.set([]);
        this.showConflictPanel.set(false);
        this.rescheduleSuccess.set(true);
        this.rescheduleLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 409) {
          const conflictList = (error.error as { conflicts?: Conflict[] } | null)?.conflicts ?? [];
          this.conflicts.set(conflictList);
          this.showConflictPanel.set(conflictList.length > 0);
          this.rescheduleError.set('Conflicts were found for the selected slot.');
        } else {
          this.rescheduleError.set('Failed to reschedule appointment.');
        }
        this.rescheduleLoading.set(false);
      },
    });
  }

  enableOverrideMode(): void {
    this.overrideMode.set(true);
    this.overrideSuccess.set(false);
    this.overrideError.set(null);
  }

  submitOverride(): void {
    if (this.overrideForm.invalid || !this.appointmentId) {
      this.overrideForm.markAllAsTouched();
      return;
    }

    this.overrideLoading.set(true);
    this.overrideSuccess.set(false);
    this.overrideError.set(null);

    this.appointmentService
      .executeOverride(this.appointmentId, { overrideReason: this.overrideForm.controls.overrideReason.value })
      .subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          this.overrideLoading.set(false);
          this.overrideSuccess.set(true);
          this.overrideMode.set(false);
          this.showConflictPanel.set(false);
        },
        error: () => {
          this.overrideLoading.set(false);
          this.overrideError.set('Failed to execute override.');
        },
      });
  }
}
