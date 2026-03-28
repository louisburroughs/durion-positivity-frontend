import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail, AssignmentDetail, Conflict } from '../../models/appointment.models';

@Component({
  selector: 'app-appointment-dispatch-assign-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './appointment-dispatch-assign-page.component.html',
  styleUrl: './appointment-dispatch-assign-page.component.css',
})
export class AppointmentDispatchAssignPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);

  readonly loading = signal(false);
  readonly appointment = signal<AppointmentDetail | null>(null);
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

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = String(params['id'] ?? '');
      this.appointmentId = id;
      if (!id) {
        return;
      }

      this.loading.set(true);
      forkJoin({
        appointment: this.appointmentService.getAppointment(id),
        assignments: this.appointmentService.listAssignments(id),
      }).subscribe({
        next: ({ appointment, assignments }) => {
          this.appointment.set(appointment);
          this.assignments.set(assignments);
          this.loading.set(false);
        },
        error: () => {
          this.submitError.set('Failed to load dispatch assignment data.');
          this.loading.set(false);
        },
      });
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

    const payload = {
      resourceId: this.assignForm.controls.resourceId.value,
      mechanicId: this.assignForm.controls.mechanicId.value,
      role: this.assignForm.controls.role.value,
    } as unknown as Partial<AssignmentDetail>;

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
          this.submitError.set('Assignment conflicts were detected.');
        } else {
          this.submitError.set('Failed to create assignment.');
        }
        this.submitLoading.set(false);
      },
    });
  }

  getAssignmentRole(assignment: AssignmentDetail): string {
    const candidate = assignment as unknown as Record<string, unknown>;
    return String(candidate['role'] ?? assignment.assignmentType ?? 'UNASSIGNED');
  }
}
