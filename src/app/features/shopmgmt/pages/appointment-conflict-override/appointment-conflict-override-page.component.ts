import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { SHOPMGMT_PAGE } from '../../../../core/security/route-permissions';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentConflict, AppointmentDetail, Conflict, RescheduleRequest } from '../../models/appointment.models';

@Component({
  selector: 'app-appointment-conflict-override-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './appointment-conflict-override-page.component.html',
  styleUrl: './appointment-conflict-override-page.component.css',
})
export class AppointmentConflictOverridePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);
  private readonly auth = inject(AuthService);

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
  /**
   * A 409 on reschedule carries the DECISION-002 envelope: every rule that fired. A HARD one refused
   * the change, and nothing in that panel can be overridden — the override below acts on the
   * conflicts recorded against the appointment, never on a refused attempt.
   */
  readonly hasHardConflict = computed(() => this.conflicts().some(conflict => conflict.severity === 'HARD'));
  /** The SOFT conflicts recorded against the appointment that a manager may still accept (CAP-326). */
  readonly recordedConflicts = computed<readonly AppointmentConflict[]>(() => this.appointment()?.conflicts ?? []);
  readonly overridableConflicts = computed(() => this.recordedConflicts().filter(conflict => conflict.overridable));
  /**
   * The override is gated on `shop:conflict:override` (CAP-326 D12), not on the reschedule codes
   * that open this page. Permissions unknown (a legacy token) is not "none granted", as
   * `canAccess()` reads it; the server still refuses with 403 either way.
   */
  readonly canOverride = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(SHOPMGMT_PAGE.conflictOverride),
  );
  readonly hasOverridableConflicts = computed(() => this.canOverride() && this.overridableConflicts().length > 0);

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
          // The route can move to another appointment while this read is in flight (the
          // component is reused across :id changes); a late answer for the old id must not
          // overwrite the one now on screen.
          if (id !== this.appointmentId) {
            return;
          }
          this.appointment.set(appointment);
          this.loading.set(false);
        },
        error: () => {
          if (id !== this.appointmentId) {
            return;
          }
          this.rescheduleError.set('SHOPMGMT.APPOINTMENT_CONFLICT_OVERRIDE.ERROR.LOAD');
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
          this.rescheduleError.set('SHOPMGMT.APPOINTMENT_CONFLICT_OVERRIDE.ERROR.CONFLICTS');
        } else {
          this.rescheduleError.set('SHOPMGMT.APPOINTMENT_CONFLICT_OVERRIDE.ERROR.RESCHEDULE');
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
    // The override accepts the recorded SOFT conflicts by id (spec D18.3). A HARD conflict is never
    // recorded against an appointment — it refused the booking — so there is nothing to send for it.
    const conflictIds = this.overridableConflicts().map(conflict => conflict.conflictId);
    if (conflictIds.length === 0) {
      this.overrideError.set('SHOPMGMT.APPOINTMENT_CONFLICT_OVERRIDE.ERROR.NOTHING_TO_OVERRIDE');
      return;
    }

    this.overrideLoading.set(true);
    this.overrideSuccess.set(false);
    this.overrideError.set(null);

    this.appointmentService
      .executeOverride(this.appointmentId, {
        conflictIds,
        overrideReason: this.overrideForm.controls.overrideReason.value,
      })
      .subscribe({
        next: () => {
          // The 201 body is the override record, not the appointment: re-read it so the recorded
          // conflicts show as overridden rather than replacing the summary with the record.
          this.refreshAppointment();
          this.overrideLoading.set(false);
          this.overrideSuccess.set(true);
          this.overrideMode.set(false);
          this.showConflictPanel.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.overrideLoading.set(false);
          if (error.status === 409) {
            // A 409 means the server's view of the conflicts differs from this page's: re-read the
            // recorded list rather than leave a stale button on screen. Only the documented
            // CONFLICT_ALREADY_OVERRIDDEN code (ApiError.code) gets its own message; any other 409
            // — a HARD rule in the ids, say — is the generic failure, never mislabelled.
            const code = (error.error as { code?: string } | null)?.code;
            this.overrideError.set(
              code === 'CONFLICT_ALREADY_OVERRIDDEN'
                ? 'SHOPMGMT.APPOINTMENT_CONFLICT_OVERRIDE.ERROR.ALREADY_OVERRIDDEN'
                : 'SHOPMGMT.APPOINTMENT_CONFLICT_OVERRIDE.ERROR.OVERRIDE',
            );
            this.overrideMode.set(false);
            this.refreshAppointment();
            return;
          }
          this.overrideError.set('SHOPMGMT.APPOINTMENT_CONFLICT_OVERRIDE.ERROR.OVERRIDE');
        },
      });
  }

  /** Re-reads the appointment so the recorded conflicts reflect what the server now holds. */
  private refreshAppointment(): void {
    const id = this.appointmentId;
    if (!id) {
      return;
    }
    this.appointmentService.getAppointment(id).subscribe({
      // Same stale-response guard as the route load: only the appointment still in the route lands.
      next: (appointment) => {
        if (id === this.appointmentId) {
          this.appointment.set(appointment);
        }
      },
      // The override error already says what happened; a failed refresh keeps the last known state.
      error: () => undefined,
    });
  }
}
