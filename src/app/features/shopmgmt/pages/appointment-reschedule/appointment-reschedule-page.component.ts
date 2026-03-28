import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail, Conflict, TimeSlot } from '../../models/appointment.models';

@Component({
  selector: 'app-appointment-reschedule-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './appointment-reschedule-page.component.html',
  styleUrl: './appointment-reschedule-page.component.css',
})
export class AppointmentReschedulePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);

  private readonly appointmentId = signal<string>('');
  readonly loading = signal(true);
  readonly submitLoading = signal(false);
  readonly appointment = signal<AppointmentDetail | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly conflicts = signal<Conflict[]>([]);
  readonly suggestedAlternatives = signal<TimeSlot[]>([]);
  readonly hasHardConflict = signal(false);
  readonly showOverrideReason = signal(false);
  readonly showApprovalReason = signal(false);
  readonly versionMismatch = signal(false);
  readonly fieldErrors = signal<{ field: string; message: string }[]>([]);

  readonly form = new FormGroup({
    scheduledStartDateTime: new FormControl('', Validators.required),
    scheduledEndDateTime: new FormControl(''),
    reason: new FormControl('', Validators.required),
    notes: new FormControl(''),
    overrideReason: new FormControl(''),
    approvalReason: new FormControl(''),
  });

  get isSubmitDisabled(): boolean {
    return this.form.invalid || this.submitLoading() || this.hasHardConflict();
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      this.appointmentId.set(id);
      this.appointmentService.getAppointment(id).subscribe({
        next: appt => {
          this.appointment.set(appt);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.fieldErrors.set([{ field: '', message: 'Failed to load appointment details.' }]);
        },
      });
    });
  }

  submit(): void {
    if (this.form.invalid) return;
    this.submitLoading.set(true);
    this.successMessage.set(null);
    this.conflicts.set([]);
    this.fieldErrors.set([]);
    this.versionMismatch.set(false);
    this.hasHardConflict.set(false);
    this.showOverrideReason.set(false);
    this.showApprovalReason.set(false);

    const value = this.form.value;
    const body = {
      scheduledStartDateTime: value.scheduledStartDateTime ?? '',
      scheduledEndDateTime: value.scheduledEndDateTime || undefined,
      reason: value.reason ?? '',
      notes: value.notes || undefined,
      overrideReason: value.overrideReason || undefined,
      approvalReason: value.approvalReason || undefined,
    };

    this.appointmentService.rescheduleAppointment(this.appointmentId(), body).subscribe({
      next: () => {
        this.submitLoading.set(false);
        this.successMessage.set('Appointment rescheduled successfully');
      },
      error: (err: HttpErrorResponse) => {
        this.submitLoading.set(false);
        this.handleError(err);
      },
    });
  }

  private handleError(err: HttpErrorResponse): void {
    if (err.status === 409) {
      const body = err.error as { code?: string; conflicts?: Conflict[]; suggestedAlternatives?: TimeSlot[] };
      if (body?.code === 'VERSION_MISMATCH') {
        this.versionMismatch.set(true);
        return;
      }
      const conflictList: Conflict[] = body?.conflicts ?? [];
      this.conflicts.set(conflictList);
      this.suggestedAlternatives.set(body?.suggestedAlternatives ?? []);
      const hasHard = conflictList.some(c => c.type === 'HARD');
      this.hasHardConflict.set(hasHard);
      if (!hasHard) {
        this.showOverrideReason.set(true);
      }
    } else if (err.status === 422) {
      const body = err.error as { requiresApproval?: boolean };
      if (body?.requiresApproval) {
        this.showApprovalReason.set(true);
      }
    } else if (err.status === 400) {
      const body = err.error as { fieldErrors?: { field: string; message: string }[] };
      this.fieldErrors.set(body?.fieldErrors ?? []);
    }
  }
}
