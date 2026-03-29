import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { AppointmentService } from '../../services/appointment.service';
import type { Conflict } from '../../models/appointment.models';

@Component({
  selector: 'app-appointment-create-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './appointment-create-page.component.html',
  styleUrl: './appointment-create-page.component.css',
})
export class AppointmentCreatePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly appointmentService = inject(AppointmentService);

  readonly sourceType = signal<string>('');
  readonly sourceId = signal<string>('');
  readonly facilityId = signal<string>('');
  readonly facilityTimeZoneId = signal<string>('');

  readonly submitLoading = signal(false);
  readonly conflicts = signal<Conflict[]>([]);
  readonly hasHardConflict = signal(false);
  readonly hasSoftOnly = signal(false);
  readonly overrideEnabled = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly correlationId = signal<string | null>(null);
  readonly showEligibilityError = signal(false);
  readonly showBackToSource = signal(false);

  private readonly clientRequestId = signal<string>('');

  readonly form = new FormGroup({
    scheduledStartDateTime: new FormControl('', Validators.required),
    scheduledEndDateTime: new FormControl(''),
    overrideReason: new FormControl(''),
  });

  get isSubmitDisabled(): boolean {
    return this.form.invalid || this.submitLoading();
  }

  ngOnInit(): void {
    this.clientRequestId.set(this.generateUuid());
    this.route.queryParams.subscribe(params => {
      this.sourceType.set(params['sourceType'] ?? '');
      this.sourceId.set(params['sourceId'] ?? '');
      this.facilityId.set(params['facilityId'] ?? '');
      this.facilityTimeZoneId.set(params['facilityTimeZoneId'] ?? '');
    });
  }

  submit(): void {
    if (this.form.invalid) return;
    this.submitLoading.set(true);
    this.errorMessage.set(null);
    this.correlationId.set(null);
    this.conflicts.set([]);
    this.hasHardConflict.set(false);
    this.hasSoftOnly.set(false);
    this.overrideEnabled.set(false);
    this.showEligibilityError.set(false);
    this.showBackToSource.set(false);

    const value = this.form.value;
    const body = {
      sourceType: this.sourceType() as 'ESTIMATE' | 'WORKORDER',
      sourceId: this.sourceId(),
      facilityId: this.facilityId(),
      scheduledStartDateTime: value.scheduledStartDateTime ?? '',
      scheduledEndDateTime: value.scheduledEndDateTime || undefined,
      clientRequestId: this.clientRequestId(),
      overrideSoftConflicts: this.overrideEnabled() || undefined,
      overrideReason: value.overrideReason || undefined,
    };

    this.appointmentService.createAppointment(body, this.clientRequestId()).subscribe({
      next: (result) => {
        this.submitLoading.set(false);
        this.router.navigate(['/app/shopmgmt/appointments', result.appointmentId, 'edit']);
      },
      error: (err: HttpErrorResponse) => {
        this.submitLoading.set(false);
        this.handleError(err);
      },
    });
  }

  private handleError(err: HttpErrorResponse): void {
    const body = err.error as { correlationId?: string; code?: string; message?: string; conflicts?: Conflict[] };
    this.correlationId.set(body?.correlationId ?? null);

    if (err.status === 409) {
      const conflictList: Conflict[] = body?.conflicts ?? [];
      this.conflicts.set(conflictList);
      const hasHard = conflictList.some(c => c.type === 'HARD');
      this.hasHardConflict.set(hasHard);
      this.hasSoftOnly.set(!hasHard && conflictList.length > 0);
    } else if (err.status === 422) {
      this.showEligibilityError.set(true);
    } else if (err.status === 404 || err.status === 403) {
      this.errorMessage.set(this.genericErrorMessage(err.status));
      if (err.status === 404) {
        this.showBackToSource.set(true);
      }
    } else {
      this.errorMessage.set('SHOPMGMT.APPOINTMENT_CREATE.ERROR.GENERIC');
    }
  }

  private genericErrorMessage(status: number): string {
    if (status === 403) return 'SHOPMGMT.APPOINTMENT_CREATE.ERROR.PERMISSION';
    if (status === 404) return 'SHOPMGMT.APPOINTMENT_CREATE.ERROR.UNABLE';
    return 'SHOPMGMT.APPOINTMENT_CREATE.ERROR.GENERIC';
  }

  private generateUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `req-${Date.now()}`;
  }
}
