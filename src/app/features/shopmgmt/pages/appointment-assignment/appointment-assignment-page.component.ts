import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail, AssignmentDetail } from '../../models/appointment.models';

@Component({
  selector: 'app-appointment-assignment-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './appointment-assignment-page.component.html',
  styleUrl: './appointment-assignment-page.component.css',
})
export class AppointmentAssignmentPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly appointment = signal<AppointmentDetail | null>(null);
  readonly assignment = signal<AssignmentDetail | null>(null);
  readonly showUpdateNotification = signal(false);
  readonly sseError = signal(false);

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      this.loading.set(true);
      forkJoin({
        appointment: this.appointmentService.getAppointment(id),
        assignments: this.appointmentService.listAssignments(id),
      }).subscribe({
        next: ({ appointment, assignments }) => {
          this.appointment.set(appointment);
          this.assignment.set(assignments.length > 0 ? assignments[0] : null);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load assignment data');
          this.loading.set(false);
        },
      });
    });
  }

  processVersionedUpdate(update: { version?: number }): void {
    const current = this.assignment();
    const currentVersion = current?.version ?? 0;
    const incomingVersion = update.version ?? 0;
    if (incomingVersion > currentVersion) {
      this.showUpdateNotification.set(true);
    }
  }

  get mechanicDisplay(): string {
    const a = this.assignment();
    if (!a?.mechanic) return '';
    if (a.mechanic.displayName?.trim()) {
      return a.mechanic.displayName;
    }
    return `Mechanic ID: ${a.mechanic.mechanicId}`;
  }
}
