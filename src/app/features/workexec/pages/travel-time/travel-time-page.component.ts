import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { WorkexecService } from '../../services/workexec.service';

@Component({
  selector: 'app-travel-time-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './travel-time-page.component.html',
  styleUrl: './travel-time-page.component.css',
})
export class TravelTimePageComponent {
  private readonly workexecService = inject(WorkexecService);

  readonly activeSegment = signal<Record<string, unknown> | null>(null);
  readonly loading = signal(false);
  readonly mobileWorkAssignmentId = signal('');
  readonly submitSuccess = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly startError = signal<string | null>(null);
  readonly stopError = signal<string | null>(null);

  readonly startForm = new FormGroup({
    mobileWorkAssignmentId: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    workorderId: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  startTravel(): void {
    if (this.startForm.invalid) {
      this.startForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.startError.set(null);
    const body = this.startForm.getRawValue();

    this.workexecService.startTravelSegment(body).subscribe({
      next: (segment) => {
        this.activeSegment.set(segment as Record<string, unknown>);
        this.mobileWorkAssignmentId.set(body.mobileWorkAssignmentId);
        this.loading.set(false);
      },
      error: () => {
        this.startError.set('Failed to start travel.');
        this.loading.set(false);
      },
    });
  }

  stopTravel(segmentId: string): void {
    this.workexecService.stopTravelSegment(segmentId, {}).subscribe({
      next: () => {
        this.activeSegment.set(null);
      },
      error: () => {
        this.stopError.set('Failed to stop travel.');
      },
    });
  }

  submitAll(assignmentId: string): void {
    this.submitError.set(null);
    this.submitSuccess.set(false);

    this.workexecService.submitTravelSegments(assignmentId, {}).subscribe({
      next: () => {
        this.submitSuccess.set(true);
      },
      error: () => {
        this.submitError.set('Failed to submit travel segments.');
      },
    });
  }

  getSegmentId(): string {
    const segment = this.activeSegment();
    return String(segment?.['travelSegmentId'] ?? segment?.['id'] ?? 'segment-1');
  }
}
