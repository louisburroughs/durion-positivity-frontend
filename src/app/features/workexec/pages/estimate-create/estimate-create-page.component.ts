import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { CustomerAPIService, CustomerDTO, CRMSnapshotsService, VehicleSummary } from '@durion-sdk/customer';
import { WorkexecService } from '../../services/workexec.service';
import { PageState } from '../../models/workexec.models';

const MAX_SUGGESTIONS = 8;

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly customerApi = inject(CustomerAPIService);
  private readonly snapshotsApi = inject(CRMSnapshotsService);

  readonly state        = signal<PageState>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors  = signal<Record<string, string>>({});

  readonly allCustomers = signal<CustomerDTO[]>([]);
  readonly customerDisplayName = signal('');
  readonly showCustomerSuggestions = signal(false);

  readonly customerVehicles = signal<VehicleSummary[]>([]);
  readonly vehicleVinInput = signal('');
  readonly showVehicleSuggestions = signal(false);

  readonly customerSuggestions = computed<CustomerDTO[]>(() => {
    const q = this.customerDisplayName().trim().toLowerCase();
    const all = this.allCustomers();
    if (!q) return all.slice(0, MAX_SUGGESTIONS);
    return all.filter(c => {
      const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.toLowerCase();
      const email = (c.email ?? '').toLowerCase();
      return name.includes(q) || email.includes(q);
    }).slice(0, MAX_SUGGESTIONS);
  });

  readonly vehicleSuggestions = computed<VehicleSummary[]>(() => {
    const q = this.vehicleVinInput().trim().toLowerCase();
    const vehicles = this.customerVehicles();
    if (!q) return vehicles.slice(0, MAX_SUGGESTIONS);
    return vehicles.filter(v =>
      v.vin?.toLowerCase().includes(q) ||
      `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.toLowerCase().includes(q),
    ).slice(0, MAX_SUGGESTIONS);
  });

  readonly form = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    vehicleId:  ['', Validators.required],
  });

  ngOnInit(): void {
    this.customerApi.getAllCustomers({ page: 0, size: 200 }, undefined, 'body', false, { transferCache: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => this.allCustomers.set(page.content ?? []),
        error: () => {},
      });

    const nav = this.router.getCurrentNavigation()?.extras?.state as Record<string, string> | undefined;
    if (nav?.['customerId']) this.form.patchValue({ customerId: nav['customerId'] });
    if (nav?.['vehicleId'])  this.form.patchValue({ vehicleId: nav['vehicleId'] });
  }

  onCustomerInput(value: string): void {
    this.customerDisplayName.set(value);
    this.form.patchValue({ customerId: '' });
    this.customerVehicles.set([]);
    this.vehicleVinInput.set('');
    this.form.patchValue({ vehicleId: '' });
    this.showCustomerSuggestions.set(true);
  }

  onCustomerFocus(): void {
    if (this.allCustomers().length > 0) this.showCustomerSuggestions.set(true);
  }

  onCustomerBlur(): void {
    setTimeout(() => this.showCustomerSuggestions.set(false), 150);
  }

  selectCustomer(customer: CustomerDTO): void {
    const id = customer.id ?? '';
    this.form.patchValue({ customerId: id });
    this.customerDisplayName.set(`${customer.firstName} ${customer.lastName}`);
    this.showCustomerSuggestions.set(false);
    this.vehicleVinInput.set('');
    this.form.patchValue({ vehicleId: '' });

    if (!id) { return; }

    // Try CRM snapshot to get full VehicleSummary objects (vehicleId + vin + make/model/year)
    this.snapshotsApi.fetchByParty(id, 'body', false, { transferCache: false })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of(null)),
      )
      .subscribe(snapshot => {
        const vehicles: VehicleSummary[] = (snapshot as { vehicles?: VehicleSummary[] } | null)?.vehicles ?? [];
        if (vehicles.length === 0 && customer.vehicleVins?.length) {
          // Fallback: build VehicleSummary stubs from VIN strings on the CustomerDTO
          this.customerVehicles.set(customer.vehicleVins.map(vin => ({ vin })));
        } else {
          this.customerVehicles.set(vehicles);
        }
      });
  }

  onVehicleInput(value: string): void {
    this.vehicleVinInput.set(value);
    this.form.patchValue({ vehicleId: '' });
    this.showVehicleSuggestions.set(true);
  }

  onVehicleFocus(): void {
    if (this.customerVehicles().length > 0) this.showVehicleSuggestions.set(true);
  }

  onVehicleBlur(): void {
    setTimeout(() => this.showVehicleSuggestions.set(false), 150);
  }

  selectVehicle(vehicle: VehicleSummary): void {
    // vehicleId must be a UUID; VIN stubs (no UUID) leave the field empty so form stays invalid
    const id = vehicle.vehicleId ?? '';
    this.form.patchValue({ vehicleId: id });
    this.vehicleVinInput.set(vehicle.vin ?? id);
    this.showVehicleSuggestions.set(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.state.set('saving');
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    const { customerId, vehicleId } = this.form.getRawValue();

    this.workexec.createEstimate({
      customerId,
      vehicleId,
      crmPartyId:   customerId,
      crmVehicleId: vehicleId,
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
