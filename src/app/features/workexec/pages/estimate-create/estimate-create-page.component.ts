import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkexecService } from '../../services/workexec.service';
import { PageState } from '../../models/workexec.models';

/**
 * EstimateCreatePageComponent — Story 239 (CAP-002)
 * Route: /app/workexec/estimates/new
 * operationIds: createEstimate, getEstimateById
 *
 * Creates a new Draft estimate for a selected customer and vehicle,
 * then navigates to the estimate workspace on success.
 */
@Component({
  selector: 'app-estimate-create-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './estimate-create-page.component.html',
  styleUrl: './estimate-create-page.component.css',
})
export class EstimateCreatePageComponent implements OnInit {
  private readonly workexec = inject(WorkexecService);
  private readonly router   = inject(Router);
  private readonly fb       = inject(FormBuilder);

  readonly state        = signal<PageState>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors  = signal<Record<string, string>>({});

  readonly form = this.fb.nonNullable.group({
    customerId:   ['', Validators.required],
    vehicleId:    ['', Validators.required],
    crmPartyId:   [''],
    crmVehicleId: [''],
  });

  ngOnInit(): void {
    // IDs provided via query params when navigating from customer/vehicle context
    const nav = this.router.getCurrentNavigation()?.extras?.state as Record<string, string> | undefined;
    if (nav?.['customerId'])   this.form.patchValue({ customerId: nav['customerId'] });
    if (nav?.['vehicleId'])    this.form.patchValue({ vehicleId: nav['vehicleId'] });
    if (nav?.['crmPartyId'])   this.form.patchValue({ crmPartyId: nav['crmPartyId'] });
    if (nav?.['crmVehicleId']) this.form.patchValue({ crmVehicleId: nav['crmVehicleId'] });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.state.set('saving');
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    const { customerId, vehicleId, crmPartyId, crmVehicleId } = this.form.getRawValue();

    this.workexec.createEstimate({
      customerId,
      vehicleId,
      crmPartyId: crmPartyId || customerId,
      crmVehicleId: crmVehicleId || vehicleId,
      crmContactIds: [],
    }).subscribe({
      next: est => {
        this.state.set('success');
        this.router.navigate(['/app/workexec/estimates', est.id]);
      },
      error: err => {
        this.state.set('error');
        const body = err.error;
        if (body?.fieldErrors?.length) {
          const map: Record<string, string> = {};
          for (const fe of body.fieldErrors) map[fe.field] = fe.message;
          this.fieldErrors.set(map);
        } else if (err.status === 403) {
          this.state.set('access-denied');
          this.errorMessage.set('You do not have permission to create estimates.');
        } else {
          this.errorMessage.set(body?.message ?? 'An unexpected error occurred. Please try again.');
        }
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/app/workexec']);
  }

  fieldError(name: string): string | null {
    return this.fieldErrors()[name] ?? null;
  }
}
