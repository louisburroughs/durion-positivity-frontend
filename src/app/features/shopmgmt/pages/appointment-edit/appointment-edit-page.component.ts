import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail, AssignmentDetail, Conflict, TimeSlot } from '../../models/appointment.models';

export interface AuditEntry {
  id?: string;
  timestamp?: string;
  actor?: string;
  action?: string;
  details?: string;
}

@Component({
  selector: 'app-appointment-edit-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './appointment-edit-page.component.html',
  styleUrl: './appointment-edit-page.component.css',
})
export class AppointmentEditPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);

  private readonly appointmentId = signal<string>('');
  readonly loading = signal(true);
  readonly appointment = signal<AppointmentDetail | null>(null);
  readonly auditEntries = signal<AuditEntry[]>([]);
  readonly auditUnavailable = signal(false);

  readonly showRescheduleModal = signal(false);
  readonly showCancelModal = signal(false);
  readonly rescheduleLoading = signal(false);
  readonly cancelLoading = signal(false);
  readonly rescheduleSuccess = signal(false);
  readonly cancelSuccess = signal(false);
  readonly rescheduleError = signal<string | null>(null);
  readonly cancelError = signal<string | null>(null);
  readonly rescheduleConflicts = signal<Conflict[]>([]);

  readonly rescheduleForm = new FormGroup({
    scheduledStartDateTime: new FormControl('', Validators.required),
    scheduledEndDateTime: new FormControl('', Validators.required),
    reason: new FormControl(''),
  });

  readonly cancelForm = new FormGroup({
    cancellationReason: new FormControl('CUSTOMER_REQUEST', Validators.required),
    notes: new FormControl(''),
  });

  get canModify(): boolean {
    return this.appointment()?.status === 'SCHEDULED';
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      this.appointmentId.set(id);
      this.loadAppointment(id);
    });
  }

  private loadAppointment(id: string): void {
    this.loading.set(true);
    this.appointmentService.getAppointment(id).subscribe({
      next: appt => {
        this.appointment.set(appt);
        this.loading.set(false);
        this.loadAudit(id);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadAudit(id: string): void {
    this.appointmentService.searchAudit(id).subscribe({
      next: (entries: unknown[]) => this.auditEntries.set(entries as AuditEntry[]),
      error: () => this.auditUnavailable.set(true),
    });
  }

  openReschedule(): void {
    const appt = this.appointment();
    this.rescheduleForm.patchValue({
      scheduledStartDateTime: appt?.scheduledStart ?? '',
      scheduledEndDateTime: appt?.scheduledEnd ?? '',
    });
    this.rescheduleError.set(null);
    this.rescheduleConflicts.set([]);
    this.showRescheduleModal.set(true);
  }

  closeReschedule(): void {
    this.showRescheduleModal.set(false);
  }

  openCancel(): void {
    this.cancelError.set(null);
    this.showCancelModal.set(true);
  }

  closeCancel(): void {
    this.showCancelModal.set(false);
  }

  submitReschedule(): void {
    if (this.rescheduleForm.invalid) return;
    this.rescheduleLoading.set(true);
    this.rescheduleError.set(null);
    this.rescheduleConflicts.set([]);

    const value = this.rescheduleForm.value;
    const body = {
      scheduledStartDateTime: value.scheduledStartDateTime ?? '',
      scheduledEndDateTime: value.scheduledEndDateTime ?? '',
      reason: value.reason ?? '',
    };

    this.appointmentService.rescheduleAppointment(this.appointmentId(), body).subscribe({
      next: updated => {
        this.appointment.set(updated);
        this.rescheduleLoading.set(false);
        this.rescheduleSuccess.set(true);
        this.showRescheduleModal.set(false);
        this.loadAudit(this.appointmentId());
      },
      error: (err: HttpErrorResponse) => {
        this.rescheduleLoading.set(false);
        const body = err.error as { conflicts?: Conflict[]; message?: string };
        if (err.status === 409 && body?.conflicts) {
          this.rescheduleConflicts.set(body.conflicts);
        } else {
          this.rescheduleError.set(body?.message ?? 'SHOPMGMT.APPOINTMENT_EDIT.ERROR.RESCHEDULE_FAILED');
        }
      },
    });
  }

  submitCancel(): void {
    if (this.cancelForm.invalid) return;
    this.cancelLoading.set(true);
    this.cancelError.set(null);

    const value = this.cancelForm.value;
    const body = {
      cancellationReason: value.cancellationReason ?? 'OTHER',
      notes: value.notes ?? undefined,
    };

    this.appointmentService.cancelAppointment(this.appointmentId(), body).subscribe({
      next: updated => {
        this.appointment.set(updated);
        this.cancelLoading.set(false);
        this.cancelSuccess.set(true);
        this.showCancelModal.set(false);
        this.loadAudit(this.appointmentId());
      },
      error: (err: HttpErrorResponse) => {
        this.cancelLoading.set(false);
        const body = err.error as { message?: string };
        this.cancelError.set(body?.message ?? 'SHOPMGMT.APPOINTMENT_EDIT.ERROR.CANCELLATION_FAILED');
      },
    });
  }
}
