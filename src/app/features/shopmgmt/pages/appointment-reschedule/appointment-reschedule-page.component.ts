import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap, map, catchError, of } from 'rxjs';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail, Conflict, TimeSlot } from '../../models/appointment.models';
import { conflictCodeKey } from '../../models/appointment.models';
import { toDatetimeLocalValue, fromDatetimeLocalValue } from '../../../../core/utils/local-date';
import { AuthService } from '../../../../core/services/auth.service';
import { SHOPMGMT_PAGE } from '../../../../core/security/route-permissions';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

interface FieldError {
  readonly field: string;
  readonly message: string;
}

/** Backend `RescheduleAppointmentRequest` field name → this form's control name. */
const BACKEND_FIELD_TO_CONTROL: Record<string, string> = {
  newStartAt: 'scheduledStartDateTime',
  newEndAt: 'scheduledEndDateTime',
  reason: 'reason',
  rescheduleReasonNotes: 'notes',
};

/** Backend `RescheduleAppointmentRequest` field name → translation key (never the server's own message). */
const BACKEND_FIELD_TO_KEY: Record<string, string> = {
  newStartAt: 'SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.FIELD_START',
  newEndAt: 'SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.FIELD_END',
  reason: 'SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.FIELD_REASON',
  rescheduleReasonNotes: 'SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.FIELD_NOTES',
};

@Component({
  selector: 'app-appointment-reschedule-page',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, DatePipe],
  templateUrl: './appointment-reschedule-page.component.html',
  styleUrl: './appointment-reschedule-page.component.css',
})
export class AppointmentReschedulePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  private readonly appointmentId = signal<string>('');
  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly submitLoading = signal(false);
  readonly appointment = signal<AppointmentDetail | null>(null);
  readonly facilityName = signal<string | undefined>(undefined);
  readonly successMessage = signal<string | null>(null);
  readonly submitErrorKey = signal<string | null>(null);
  readonly conflicts = signal<Conflict[]>([]);
  readonly suggestedAlternatives = signal<TimeSlot[]>([]);
  readonly hasHardConflict = signal(false);
  readonly versionMismatch = signal(false);
  readonly fieldErrors = signal<FieldError[]>([]);

  readonly form = new FormGroup({
    scheduledStartDateTime: new FormControl('', Validators.required),
    scheduledEndDateTime: new FormControl(''),
    reason: new FormControl('', Validators.required),
    notes: new FormControl(''),
  });

  readonly statusKey = computed(() => `SHOPMGMT.APPOINTMENT_STATUS.${this.appointment()?.status ?? ''}`);
  /**
   * The route is gated on `appointmentReschedule` (shopmgmt.routes.ts), but a route permission
   * never substitutes for the control-and-method write gate the endpoint itself enforces
   * (ADR-0040 §6a) — checked again here and in `submit()`.
   */
  readonly canReschedule = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(SHOPMGMT_PAGE.appointmentReschedule),
  );

  get isSubmitDisabled(): boolean {
    return this.form.invalid || this.submitLoading() || this.hasHardConflict() || !this.canReschedule();
  }

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
              ? 'SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.LOAD_NOT_FOUND'
              : 'SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.LOAD_DETAILS',
          );
          return;
        }
        this.appointment.set(result.appt);
        this.state.set('ready');
        this.prefill(result.appt!);
        this.loadFacilityName(result.id, result.appt!.facilityId);
      });
  }

  conflictKey(code: string): string {
    return conflictCodeKey(code);
  }

  /**
   * The translation key for a control's server-named error, or `undefined` when the backend named
   * no error for it. The 400 envelope names fields by the backend request's own shape
   * (`newStartAt`/`newEndAt`/`reason`/`rescheduleReasonNotes`), not this form's control names, so
   * this maps through `BACKEND_FIELD_TO_CONTROL` first.
   */
  fieldErrorKeyFor(controlName: string): string | undefined {
    const match = this.fieldErrors().find(fe => BACKEND_FIELD_TO_CONTROL[fe.field] === controlName);
    if (!match) return undefined;
    return BACKEND_FIELD_TO_KEY[match.field] ?? 'SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.FIELD_INVALID';
  }

  fillSuggestedSlot(slot: TimeSlot): void {
    this.form.patchValue({
      scheduledStartDateTime: toDatetimeLocalValue(slot.scheduledStartDateTime),
      scheduledEndDateTime: toDatetimeLocalValue(slot.scheduledEndDateTime),
    });
  }

  submit(): void {
    if (this.form.invalid) return;
    if (!this.canReschedule()) return; // ADR-0040 §6a — re-checked, not only gated at the control
    this.submitLoading.set(true);
    this.successMessage.set(null);
    this.submitErrorKey.set(null);
    this.conflicts.set([]);
    this.fieldErrors.set([]);
    this.versionMismatch.set(false);
    this.hasHardConflict.set(false);

    // Captured at issue time — a route change to another :id while this request is in flight
    // must not let a late answer paint the wrong appointment (ADR-0063 §1).
    const id = this.appointmentId();
    const value = this.form.value;
    const body = {
      scheduledStartDateTime: fromDatetimeLocalValue(value.scheduledStartDateTime),
      scheduledEndDateTime: value.scheduledEndDateTime ? fromDatetimeLocalValue(value.scheduledEndDateTime) : undefined,
      reason: value.reason ?? '',
      notes: value.notes || undefined,
    };

    this.appointmentService
      .rescheduleAppointment(id, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (id !== this.appointmentId()) return;
          this.submitLoading.set(false);
          this.successMessage.set('SHOPMGMT.APPOINTMENT_RESCHEDULE.SUCCESS');
          // What's on screen must match the server afterward (ADR-0063 §5) — re-read rather than
          // trust the pre-reschedule signal the form was seeded from.
          this.refreshAppointment(id);
        },
        error: (err: HttpErrorResponse) => {
          if (id !== this.appointmentId()) return;
          this.submitLoading.set(false);
          this.handleError(err);
        },
      });
  }

  private prefill(appt: AppointmentDetail): void {
    this.form.patchValue({
      scheduledStartDateTime: toDatetimeLocalValue(appt.scheduledStart),
      scheduledEndDateTime: toDatetimeLocalValue(appt.scheduledEnd),
    });
  }

  /** @param id the appointment id the just-completed submit answered (ADR-0063 §1). */
  private refreshAppointment(id: string): void {
    this.appointmentService
      .getAppointment(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: appt => {
          if (id !== this.appointmentId()) return;
          this.appointment.set(appt);
          this.prefill(appt);
          this.loadFacilityName(id, appt.facilityId);
        },
        error: () => {
          if (id !== this.appointmentId()) return;
          // The reschedule itself succeeded, but this page can no longer show what the server now
          // holds — leaving the success banner up over the stale pre-reschedule form would
          // contradict the server (ADR-0063 §5, ADR-0064 §1). Withdraw the success claim and
          // surface a distinct, localized readback failure instead of swallowing it.
          this.successMessage.set(null);
          this.submitErrorKey.set('SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.READBACK_FAILED');
        },
      });
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
        if (id !== this.appointmentId()) return;
        this.facilityName.set(name);
      });
  }

  private handleError(err: HttpErrorResponse): void {
    if (err.status === 409) {
      const body = err.error as { code?: string; conflicts?: Conflict[]; suggestedAlternatives?: TimeSlot[] } | null;
      if (body?.code === 'VERSION_MISMATCH') {
        this.versionMismatch.set(true);
        return;
      }
      const conflictList: Conflict[] = body?.conflicts ?? [];
      if (conflictList.length === 0) {
        // A non-VERSION_MISMATCH 409 with an empty envelope is still a real failure; the
        // template only renders the conflict panel when conflicts().length > 0, so an empty
        // list here must not be silent (ADR-0064).
        this.submitErrorKey.set('SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.SUBMIT_FAILED');
        return;
      }
      this.conflicts.set(conflictList);
      this.suggestedAlternatives.set(body?.suggestedAlternatives ?? []);
      this.hasHardConflict.set(conflictList.some(c => c.severity === 'HARD'));
      return;
    }
    if (err.status === 400) {
      const body = err.error as { fieldErrors?: FieldError[] } | null;
      const fieldErrorList = body?.fieldErrors ?? [];
      this.fieldErrors.set(fieldErrorList);
      // A field error only renders when a control maps to it (fieldErrorKeyFor); an empty list,
      // or one naming only fields this form doesn't carry, is otherwise silent despite the
      // page's every-non-2xx requirement (ADR-0031/ADR-0064) — fall back to the generic key.
      const hasDisplayable = fieldErrorList.some(fe => BACKEND_FIELD_TO_CONTROL[fe.field] !== undefined);
      if (!hasDisplayable) {
        this.submitErrorKey.set('SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.SUBMIT_FAILED');
      }
      return;
    }
    // 403, 404, 422, 5xx and network failures all cleared submitLoading and showed nothing before
    // (issue #333) — every one now produces a visible, localized message.
    this.submitErrorKey.set('SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.SUBMIT_FAILED');
  }
}
