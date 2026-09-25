import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail, Conflict, TimeSlot } from '../../models/appointment.models';
import { conflictCodeKey } from '../../models/appointment.models';
import { toDatetimeLocalValue, fromDatetimeLocalValue } from '../../../../core/utils/local-date';

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
  readonly showOverrideReason = signal(false);
  readonly showApprovalReason = signal(false);
  readonly versionMismatch = signal(false);
  readonly fieldErrors = signal<FieldError[]>([]);

  readonly form = new FormGroup({
    scheduledStartDateTime: new FormControl('', Validators.required),
    scheduledEndDateTime: new FormControl(''),
    reason: new FormControl('', Validators.required),
    notes: new FormControl(''),
    overrideReason: new FormControl(''),
    approvalReason: new FormControl(''),
  });

  readonly statusKey = computed(() => `SHOPMGMT.APPOINTMENT_STATUS.${this.appointment()?.status ?? ''}`);

  get isSubmitDisabled(): boolean {
    return this.form.invalid || this.submitLoading() || this.hasHardConflict();
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
          return this.appointmentService.getAppointment(id);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: appt => {
          this.appointment.set(appt);
          this.state.set('ready');
          this.prefill(appt);
          this.loadFacilityName(this.appointmentId(), appt.facilityId);
        },
        error: (err: HttpErrorResponse) => {
          this.appointment.set(null);
          this.state.set('error'); // ADR-0031 §5 — state first, then the key
          this.errorKey.set(
            err.status === 404
              ? 'SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.LOAD_NOT_FOUND'
              : 'SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.LOAD_DETAILS',
          );
        },
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
    this.submitLoading.set(true);
    this.successMessage.set(null);
    this.submitErrorKey.set(null);
    this.conflicts.set([]);
    this.fieldErrors.set([]);
    this.versionMismatch.set(false);
    this.hasHardConflict.set(false);
    this.showOverrideReason.set(false);
    this.showApprovalReason.set(false);

    const value = this.form.value;
    const body = {
      scheduledStartDateTime: fromDatetimeLocalValue(value.scheduledStartDateTime),
      scheduledEndDateTime: value.scheduledEndDateTime ? fromDatetimeLocalValue(value.scheduledEndDateTime) : undefined,
      reason: value.reason ?? '',
      notes: value.notes || undefined,
      overrideReason: value.overrideReason || undefined,
      approvalReason: value.approvalReason || undefined,
    };

    this.appointmentService.rescheduleAppointment(this.appointmentId(), body).subscribe({
      next: () => {
        this.submitLoading.set(false);
        this.successMessage.set('SHOPMGMT.APPOINTMENT_RESCHEDULE.SUCCESS');
        // What's on screen must match the server afterward (ADR-0063 §5) — re-read rather than
        // trust the pre-reschedule signal the form was seeded from.
        this.refreshAppointment();
      },
      error: (err: HttpErrorResponse) => {
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

  private refreshAppointment(): void {
    const id = this.appointmentId();
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
        // The success banner already says the reschedule went through; a failed re-read keeps
        // the last known state rather than surfacing a second, unrelated error.
        error: () => undefined,
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
      this.conflicts.set(conflictList);
      this.suggestedAlternatives.set(body?.suggestedAlternatives ?? []);
      const hasHard = conflictList.some(c => c.severity === 'HARD');
      this.hasHardConflict.set(hasHard);
      if (!hasHard) {
        this.showOverrideReason.set(true);
      }
      return;
    }
    if (err.status === 422) {
      const body = err.error as { requiresApproval?: boolean } | null;
      if (body?.requiresApproval) {
        this.showApprovalReason.set(true);
        return;
      }
      // A 422 without the approval hint was previously silent (issue #333) — same generic
      // fallback as any other unhandled outcome.
      this.submitErrorKey.set('SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.SUBMIT_FAILED');
      return;
    }
    if (err.status === 400) {
      const body = err.error as { fieldErrors?: FieldError[] } | null;
      this.fieldErrors.set(body?.fieldErrors ?? []);
      return;
    }
    // 403, 404, 5xx and network failures all cleared submitLoading and showed nothing before
    // (issue #333) — every one now produces a visible, localized message.
    this.submitErrorKey.set('SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.SUBMIT_FAILED');
  }
}
