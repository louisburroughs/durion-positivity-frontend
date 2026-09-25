import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail, AuditEntry, Conflict } from '../../models/appointment.models';
import { conflictCodeKey } from '../../models/appointment.models';
import { toDatetimeLocalValue, fromDatetimeLocalValue } from '../../../../core/utils/local-date';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-appointment-edit-page',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, DatePipe, ModalDialogDirective],
  templateUrl: './appointment-edit-page.component.html',
  styleUrl: './appointment-edit-page.component.css',
})
export class AppointmentEditPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly appointmentId = signal<string>('');
  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly appointment = signal<AppointmentDetail | null>(null);
  /** Resolved the same way schedule-view/dispatch-board do; `undefined` falls back to COMMON.NOT_AVAILABLE (ADR-0064 §5). */
  readonly facilityName = signal<string | undefined>(undefined);
  readonly auditEntries = signal<AuditEntry[]>([]);
  readonly auditUnavailable = signal(false);

  readonly showRescheduleModal = signal(false);
  readonly showCancelModal = signal(false);
  readonly rescheduleLoading = signal(false);
  readonly cancelLoading = signal(false);
  readonly rescheduleSuccess = signal(false);
  readonly cancelSuccess = signal(false);
  readonly rescheduleErrorKey = signal<string | null>(null);
  readonly cancelErrorKey = signal<string | null>(null);
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

  readonly canModify = computed(() => this.appointment()?.status === 'SCHEDULED');
  readonly statusKey = computed(() => `SHOPMGMT.APPOINTMENT_STATUS.${this.appointment()?.status ?? ''}`);

  constructor() {
    this.route.params
      .pipe(
        switchMap(params => {
          const id = String(params['id'] ?? '');
          this.appointmentId.set(id);
          this.state.set('loading');
          this.errorKey.set(null);
          this.appointment.set(null);
          this.facilityName.set(undefined);
          this.auditEntries.set([]);
          this.auditUnavailable.set(false);
          return this.appointmentService.getAppointment(id);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: appt => {
          this.appointment.set(appt);
          this.state.set('ready');
          this.loadFacilityName(this.appointmentId(), appt.facilityId);
          this.loadAudit(this.appointmentId());
        },
        error: (err: HttpErrorResponse) => {
          this.appointment.set(null);
          this.state.set('error'); // ADR-0031 §5 — state first, then the key
          this.errorKey.set(
            err.status === 404
              ? 'SHOPMGMT.APPOINTMENT_EDIT.ERROR.LOAD_NOT_FOUND'
              : 'SHOPMGMT.APPOINTMENT_EDIT.ERROR.LOAD',
          );
        },
      });
  }

  conflictKey(code: string): string {
    return conflictCodeKey(code);
  }

  private loadFacilityName(id: string, facilityId: string): void {
    if (!facilityId) {
      this.facilityName.set(undefined);
      return;
    }
    this.appointmentService
      .getFacilityName(facilityId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(name => {
        // A route change to another :id while this was in flight must not paint the previous
        // appointment's facility onto the one now on screen (ADR-0063 §1).
        if (id !== this.appointmentId()) return;
        this.facilityName.set(name);
      });
  }

  private loadAudit(id: string): void {
    this.appointmentService
      .searchAudit(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: entries => {
          if (id !== this.appointmentId()) return;
          this.auditEntries.set(entries);
          this.auditUnavailable.set(false);
        },
        error: () => {
          if (id !== this.appointmentId()) return;
          this.auditUnavailable.set(true);
        },
      });
  }

  openReschedule(): void {
    const appt = this.appointment();
    this.rescheduleForm.patchValue({
      scheduledStartDateTime: toDatetimeLocalValue(appt?.scheduledStart),
      scheduledEndDateTime: toDatetimeLocalValue(appt?.scheduledEnd),
    });
    this.rescheduleErrorKey.set(null);
    this.rescheduleConflicts.set([]);
    this.showRescheduleModal.set(true);
  }

  closeReschedule(): void {
    this.showRescheduleModal.set(false);
  }

  openCancel(): void {
    this.cancelErrorKey.set(null);
    this.showCancelModal.set(true);
  }

  closeCancel(): void {
    this.showCancelModal.set(false);
  }

  submitReschedule(): void {
    if (this.rescheduleForm.invalid) return;
    this.rescheduleLoading.set(true);
    this.rescheduleErrorKey.set(null);
    this.rescheduleConflicts.set([]);

    const value = this.rescheduleForm.value;
    const body = {
      scheduledStartDateTime: fromDatetimeLocalValue(value.scheduledStartDateTime),
      scheduledEndDateTime: fromDatetimeLocalValue(value.scheduledEndDateTime),
      reason: value.reason ?? '',
    };

    this.appointmentService.rescheduleAppointment(this.appointmentId(), body).subscribe({
      next: updated => {
        this.appointment.set(updated);
        this.loadFacilityName(this.appointmentId(), updated.facilityId);
        this.rescheduleLoading.set(false);
        this.rescheduleSuccess.set(true);
        this.showRescheduleModal.set(false);
        this.loadAudit(this.appointmentId());
      },
      error: (err: HttpErrorResponse) => {
        this.rescheduleLoading.set(false);
        const body = err.error as { conflicts?: Conflict[] } | null;
        if (err.status === 409 && body?.conflicts) {
          this.rescheduleConflicts.set(body.conflicts);
        } else {
          // Server prose never reaches the UI (ADR-0030) — a fixed key, same family the
          // reschedule page uses for its own generic submit failures.
          this.rescheduleErrorKey.set('SHOPMGMT.APPOINTMENT_EDIT.ERROR.RESCHEDULE_FAILED');
        }
      },
    });
  }

  submitCancel(): void {
    if (this.cancelForm.invalid) return;
    this.cancelLoading.set(true);
    this.cancelErrorKey.set(null);

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
      error: () => {
        this.cancelLoading.set(false);
        this.cancelErrorKey.set('SHOPMGMT.APPOINTMENT_EDIT.ERROR.CANCELLATION_FAILED');
      },
    });
  }
}
