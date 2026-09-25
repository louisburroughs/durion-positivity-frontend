import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AppointmentService } from '../../services/appointment.service';
import { conflictCodeKey } from '../../models/appointment.models';
import type { AppointmentDetail, AssignmentDetail, Conflict } from '../../models/appointment.models';

@Component({
  selector: 'app-appointment-dispatch-assign-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './appointment-dispatch-assign-page.component.html',
  styleUrl: './appointment-dispatch-assign-page.component.css',
})
export class AppointmentDispatchAssignPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);

  readonly loading = signal(false);
  readonly appointment = signal<AppointmentDetail | null>(null);
  /** Resolved the same way appointment-edit/appointment-reschedule do; `undefined` falls back to COMMON.NOT_AVAILABLE (ADR-0064 §5). */
  readonly facilityName = signal<string | undefined>(undefined);
  readonly assignments = signal<AssignmentDetail[]>([]);
  readonly submitLoading = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly submitSuccess = signal(false);
  readonly conflicts = signal<Conflict[]>([]);

  readonly assignForm = new FormGroup({
    resourceId: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    mechanicId: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    role: new FormControl('LEAD', { nonNullable: true }),
  });

  private appointmentId = '';

  readonly statusKey = computed(() => `SHOPMGMT.APPOINTMENT_STATUS.${this.appointment()?.status ?? ''}`);

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = String(params['id'] ?? '');
      this.appointmentId = id;
      this.facilityName.set(undefined);
      if (!id) {
        return;
      }

      this.loading.set(true);
      forkJoin({
        appointment: this.appointmentService.getAppointment(id),
        assignments: this.appointmentService.listAssignments(id),
      }).subscribe({
        next: ({ appointment, assignments }) => {
          if (id !== this.appointmentId) return;
          this.appointment.set(appointment);
          this.assignments.set(assignments);
          this.loading.set(false);
          this.loadFacilityName(id, appointment.facilityId);
        },
        error: () => {
          if (id !== this.appointmentId) return;
          this.submitError.set('SHOPMGMT.APPOINTMENT_DISPATCH_ASSIGN.ERROR.LOAD');
          this.loading.set(false);
        },
      });
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
    this.appointmentService.getFacilityName(facilityId).subscribe(name => {
      // A route change to another :id while this was in flight must not paint the previous
      // appointment's facility onto the one now on screen (ADR-0063 §1).
      if (id !== this.appointmentId) return;
      this.facilityName.set(name);
    });
  }

  submitAssignment(): void {
    if (this.assignForm.invalid || !this.appointmentId) {
      this.assignForm.markAllAsTouched();
      return;
    }

    this.submitLoading.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(false);
    this.conflicts.set([]);

    const payload: Partial<AssignmentDetail> = {
      bayId: this.assignForm.controls.resourceId.value || undefined,
      assignmentType: this.assignForm.controls.role.value || undefined,
      mechanic: {
        mechanicId: this.assignForm.controls.mechanicId.value,
      },
    };

    this.appointmentService.createAssignment(this.appointmentId, payload).subscribe({
      next: (createdAssignment) => {
        this.assignments.set([...this.assignments(), createdAssignment]);
        this.submitSuccess.set(true);
        this.submitLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 409) {
          const conflictList = (error.error as { conflicts?: Conflict[] } | null)?.conflicts ?? [];
          this.conflicts.set(conflictList);
          this.submitError.set('SHOPMGMT.APPOINTMENT_DISPATCH_ASSIGN.ERROR.CONFLICTS');
        } else {
          this.submitError.set('SHOPMGMT.APPOINTMENT_DISPATCH_ASSIGN.ERROR.CREATE');
        }
        this.submitLoading.set(false);
      },
    });
  }

  getAssignmentRole(assignment: AssignmentDetail): string {
    return String(assignment.assignmentType ?? 'UNASSIGNED');
  }
}
