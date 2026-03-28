import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AppointmentService } from '../../services/appointment.service';
import type { CreateAppointmentPayload } from '../../models/appointment.models';

@Component({
  selector: 'app-appointment-create-crm-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './appointment-create-crm-page.component.html',
  styleUrl: './appointment-create-crm-page.component.css',
})
export class AppointmentCreateCrmPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly appointmentService = inject(AppointmentService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly createForm = new FormGroup({
    crmCustomerId: new FormControl('', Validators.required),
    crmVehicleId: new FormControl('', Validators.required),
    locationId: new FormControl('', Validators.required),
    resourceId: new FormControl(''),
    startAt: new FormControl('', Validators.required),
    endAt: new FormControl('', Validators.required),
    serviceRequests: new FormArray<FormControl<string | null>>([]),
  });

  get serviceRequestsArray(): FormArray<FormControl<string | null>> {
    return this.createForm.get('serviceRequests') as FormArray<FormControl<string | null>>;
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['locationId']) {
        this.createForm.patchValue({ locationId: params['locationId'] });
      }
      if (params['crmCustomerId']) {
        this.createForm.patchValue({ crmCustomerId: params['crmCustomerId'] });
      }
      if (params['crmVehicleId']) {
        this.createForm.patchValue({ crmVehicleId: params['crmVehicleId'] });
      }
    });
  }

  addServiceRequest(): void {
    this.serviceRequestsArray.push(new FormControl('', Validators.required));
  }

  removeServiceRequest(index: number): void {
    this.serviceRequestsArray.removeAt(index);
  }

  submit(): void {
    if (this.createForm.invalid) return;
    this.loading.set(true);
    this.error.set(null);

    const value = this.createForm.value;
    const body: CreateAppointmentPayload = {
      sourceType: 'WORKORDER',
      sourceId: value.crmCustomerId ?? '',
      facilityId: value.locationId ?? '',
      scheduledStartDateTime: value.startAt ?? '',
      scheduledEndDateTime: value.endAt ?? '',
      clientRequestId: crypto.randomUUID(),
    };

    const idempotencyKey = crypto.randomUUID();

    this.appointmentService.createAppointment(body, idempotencyKey).subscribe({
      next: result => {
        this.loading.set(false);
        this.router.navigate(['/app/shopmgmt/appointments', result.appointmentId, 'edit']);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        const errBody = err.error as { message?: string };
        this.error.set(errBody?.message ?? 'Failed to create appointment.');
      },
    });
  }
}
