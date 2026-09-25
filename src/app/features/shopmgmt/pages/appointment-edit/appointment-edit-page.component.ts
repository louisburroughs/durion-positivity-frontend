import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap, map, catchError, of } from 'rxjs';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail, AuditEntry, Conflict } from '../../models/appointment.models';
import { conflictCodeKey } from '../../models/appointment.models';
import { toDatetimeLocalValue, fromDatetimeLocalValue } from '../../../../core/utils/local-date';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { AuthService } from '../../../../core/services/auth.service';
import { SHOPMGMT_PAGE } from '../../../../core/security/route-permissions';

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
  private readonly auth = inject(AuthService);

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

  /** Whether the appointment's own state permits a reschedule/cancel at all, independent of authority. */
  readonly canModify = computed(() => this.appointment()?.status === 'SCHEDULED');
  /**
   * The edit route is gated on the read authority `appointmentView`, but `rescheduleAppointment`
   * requires the separate write authority `appointments:reschedule` (route-permissions.ts) — a
   * view-only user must not see this control enabled, and the submit method re-checks it too
   * (ADR-0040 §6a).
   */
  readonly canReschedule = computed(
    () => this.canModify() && (!this.auth.permissionsKnown() || this.auth.hasAnyPermission(SHOPMGMT_PAGE.appointmentReschedule)),
  );
  /** Same split for `cancelAppointment`, gated on `appointments:cancel` (ADR-0040 §6a). */
  readonly canCancel = computed(
    () => this.canModify() && (!this.auth.permissionsKnown() || this.auth.hasAnyPermission(SHOPMGMT_PAGE.appointmentCancel)),
  );
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
          // A load failure must not terminate this outer stream (switchMap unsubscribes/completes
          // on an upstream error) — catch it inside the inner observable so a later :id still
          // issues its own getAppointment (ADR-0063 §1).
          return this.appointmentService.getAppointment(id).pipe(
            map(appt => ({ id, appt, error: null as HttpErrorResponse | null })),
            catchError((err: HttpErrorResponse) => of({ id, appt: null as AppointmentDetail | null, error: err })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(result => {
        if (result.error) {
          this.appointment.set(null);
          this.state.set('error'); // ADR-0031 §5 — state first, then the key
          this.errorKey.set(
            result.error.status === 404
              ? 'SHOPMGMT.APPOINTMENT_EDIT.ERROR.LOAD_NOT_FOUND'
              : 'SHOPMGMT.APPOINTMENT_EDIT.ERROR.LOAD',
          );
          return;
        }
        this.appointment.set(result.appt);
        this.state.set('ready');
        this.loadFacilityName(result.id, result.appt!.facilityId);
        this.loadAudit(result.id);
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
    if (!this.canReschedule()) return; // ADR-0040 §6a — re-checked, not only gated at the control
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
    if (!this.canCancel()) return; // ADR-0040 §6a — re-checked, not only gated at the control
    this.cancelErrorKey.set(null);
    this.showCancelModal.set(true);
  }

  closeCancel(): void {
    this.showCancelModal.set(false);
  }

  submitReschedule(): void {
    if (this.rescheduleForm.invalid) return;
    if (!this.canReschedule()) return; // ADR-0040 §6a — re-checked, not only gated at the control
    this.rescheduleLoading.set(true);
    this.rescheduleErrorKey.set(null);
    this.rescheduleConflicts.set([]);

    // Captured at issue time — a route change to another :id while this request is in flight
    // must not let a late answer overwrite the appointment now on screen (ADR-0063 §1).
    const id = this.appointmentId();
    const value = this.rescheduleForm.value;
    const body = {
      scheduledStartDateTime: fromDatetimeLocalValue(value.scheduledStartDateTime),
      scheduledEndDateTime: fromDatetimeLocalValue(value.scheduledEndDateTime),
      reason: value.reason ?? '',
    };

    this.appointmentService
      .rescheduleAppointment(id, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          if (id !== this.appointmentId()) return;
          this.appointment.set(updated);
          this.loadFacilityName(id, updated.facilityId);
          this.rescheduleLoading.set(false);
          this.rescheduleSuccess.set(true);
          this.showRescheduleModal.set(false);
          this.loadAudit(id);
        },
        error: (err: HttpErrorResponse) => {
          if (id !== this.appointmentId()) return;
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
    if (!this.canCancel()) return; // ADR-0040 §6a — re-checked, not only gated at the control
    this.cancelLoading.set(true);
    this.cancelErrorKey.set(null);

    // Captured at issue time — same stale-response guard as submitReschedule (ADR-0063 §1).
    const id = this.appointmentId();
    const value = this.cancelForm.value;
    const body = {
      cancellationReason: value.cancellationReason ?? 'OTHER',
      notes: value.notes ?? undefined,
    };

    this.appointmentService
      .cancelAppointment(id, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          if (id !== this.appointmentId()) return;
          this.appointment.set(updated);
          this.cancelLoading.set(false);
          this.cancelSuccess.set(true);
          this.showCancelModal.set(false);
          this.loadAudit(id);
        },
        error: () => {
          if (id !== this.appointmentId()) return;
          this.cancelLoading.set(false);
          this.cancelErrorKey.set('SHOPMGMT.APPOINTMENT_EDIT.ERROR.CANCELLATION_FAILED');
        },
      });
  }
}
