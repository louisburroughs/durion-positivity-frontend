
import { TranslatePipe } from '@ngx-translate/core';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateResponse } from '../../models/workexec.models';

@Component({
  selector: 'app-estimate-from-appointment-page',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './estimate-from-appointment-page.component.html',
  styleUrl: './estimate-from-appointment-page.component.css',
})
export class EstimateFromAppointmentPageComponent {
  private readonly workexecService = inject(WorkexecService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly estimateResult = signal<EstimateResponse | null>(null);
  readonly createError = signal<string | null>(null);
  readonly createSuccess = signal(false);

  readonly estimateForm = new FormGroup({
    appointmentId: new FormControl('', { validators: [Validators.required], nonNullable: true }),
    workorderId: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  submit(): void {
    if (this.estimateForm.invalid) {
      this.estimateForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.createError.set(null);
    this.createSuccess.set(false);

    this.workexecService.createEstimateFromAppointment(this.estimateForm.getRawValue()).subscribe({
      next: (result) => {
        this.estimateResult.set(result);
        this.createSuccess.set(true);
        this.loading.set(false);
        void this.router.navigate(['/app/workexec/workorders']);
      },
      error: () => {
        this.createError.set('Failed to create estimate from appointment.');
        this.loading.set(false);
      },
    });
  }
}
