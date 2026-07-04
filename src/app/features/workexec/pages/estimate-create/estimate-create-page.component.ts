import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  CRMVehiclesService,
  CreateVehicleForPartyRequest,
  VehicleResponse,
  VehicleSummary,
} from '@durion-sdk/customer';
import { vehicleLabel as crmVehicleLabel } from '../../../crm/util/crm-labels';
import { CustomerLookupComponent } from '../../../crm/components/customer-lookup/customer-lookup.component';
import { WorkexecService } from '../../services/workexec.service';
import { PageState } from '../../models/workexec.models';

const ADD_VEHICLE_OPTION = '__add__';

@Component({
  selector: 'app-estimate-create-page',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, CustomerLookupComponent],
  templateUrl: './estimate-create-page.component.html',
  styleUrl: './estimate-create-page.component.css',
})
export class EstimateCreatePageComponent implements OnInit {
  private readonly workexec = inject(WorkexecService);
  private readonly router   = inject(Router);
  private readonly fb       = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly vehiclesApi = inject(CRMVehiclesService);

  readonly state        = signal<PageState>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors  = signal<Record<string, string>>({});

  readonly customerVehicles = signal<VehicleSummary[]>([]);
  // Single-signal lifecycle for the vehicle fetch so the template can distinguish
  // loading, a genuinely empty list ('loaded' + length 0), and a failed fetch
  // ('error') — an error must NOT look like "no vehicles" or users re-create
  // vehicles that already exist.
  readonly vehiclesState = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  private readonly vehicleCustomer$ = new Subject<string>();

  readonly showAddVehicle = signal(false);
  readonly vehicleSaving = signal(false);
  readonly vehicleSaveError = signal<string | null>(null);

  readonly addVehicleOption = ADD_VEHICLE_OPTION;

  constructor() {
    // Authoritative vehicle list for the selected customer. switchMap cancels an
    // in-flight request when the customer changes, so a slow earlier response can
    // never overwrite a later selection's vehicles.
    this.vehicleCustomer$
      .pipe(
        switchMap(id =>
          this.vehiclesApi.listVehiclesForCustomer(id, 'body', false, { transferCache: false }).pipe(
            map(vehicles => ({ ok: true, vehicles: vehicles ?? [] })),
            catchError(() => of({ ok: false, vehicles: [] as VehicleSummary[] })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(res => {
        this.customerVehicles.set(res.vehicles);
        this.vehiclesState.set(res.ok ? 'loaded' : 'error');
      });
  }

  readonly form = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    vehicleId:  ['', Validators.required],
  });

  readonly newVehicleForm = this.fb.nonNullable.group({
    vinNumber:          ['', Validators.required],
    description:        [''],
    unitNumber:         [''],
    licensePlate:       [''],
    licensePlateRegion: [''],
  });

  ngOnInit(): void {
    // The customer-lookup control drives the vehicle list: a new customer id
    // (interactive select or deep-link patch) resets and reloads vehicles;
    // clearing the field resets the selection.
    this.form.controls.customerId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(id => {
        this.resetVehicleSelection();
        if (id) { this.loadVehicles(id); }
      });

    const nav = this.router.getCurrentNavigation()?.extras?.state as Record<string, string> | undefined;
    if (nav?.['customerId']) {
      // patchValue fires customerId.valueChanges above, which loads vehicles.
      this.form.patchValue({ customerId: nav['customerId'] });
    }
    if (nav?.['vehicleId'])  this.form.patchValue({ vehicleId: nav['vehicleId'] });
  }

  /** Kick off (or retry) the vehicle fetch for a customer via the cancelling pipeline. */
  private loadVehicles(customerId: string): void {
    this.vehiclesState.set('loading');
    this.vehicleCustomer$.next(customerId);
  }

  /** Retry handler for the vehicle-fetch error state. */
  retryLoadVehicles(): void {
    const id = this.form.controls.customerId.value;
    if (id) { this.loadVehicles(id); }
  }

  /** Human-readable label for a vehicle dropdown option. */
  vehicleLabel(v: VehicleSummary): string {
    return crmVehicleLabel(v) || v.vehicleId || 'Vehicle';
  }

  onVehicleSelect(value: string): void {
    if (value === ADD_VEHICLE_OPTION) {
      this.form.patchValue({ vehicleId: '' });
      this.showAddVehicle.set(true);
      this.vehicleSaveError.set(null);
      return;
    }
    this.showAddVehicle.set(false);
    this.form.patchValue({ vehicleId: value });
  }

  cancelAddVehicle(): void {
    this.showAddVehicle.set(false);
    this.vehicleSaveError.set(null);
    this.newVehicleForm.reset();
  }

  saveNewVehicle(): void {
    if (this.newVehicleForm.invalid) {
      this.newVehicleForm.markAllAsTouched();
      return;
    }
    const customerId = this.form.controls.customerId.value;
    if (!customerId) { return; }

    this.vehicleSaving.set(true);
    this.vehicleSaveError.set(null);

    const raw = this.newVehicleForm.getRawValue();
    const request: CreateVehicleForPartyRequest = {
      vinNumber: raw.vinNumber.trim(),
      ...(raw.description.trim()        ? { description: raw.description.trim() } : {}),
      ...(raw.unitNumber.trim()         ? { unitNumber: raw.unitNumber.trim() } : {}),
      ...(raw.licensePlate.trim()       ? { licensePlate: raw.licensePlate.trim() } : {}),
      ...(raw.licensePlateRegion.trim() ? { licensePlateRegion: raw.licensePlateRegion.trim() } : {}),
    };

    this.vehiclesApi.createVehicles(customerId, request, 'body', false, { transferCache: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created: VehicleResponse) => {
          this.vehicleSaving.set(false);
          const summary: VehicleSummary = {
            vehicleId: created.vehicleId ?? '',
            vin: created.vin,
            make: created.make,
            model: created.model,
            year: created.year,
          };
          this.customerVehicles.update(list => [...list, summary]);
          this.vehiclesState.set('loaded');
          this.form.patchValue({ vehicleId: summary.vehicleId });
          this.showAddVehicle.set(false);
          this.newVehicleForm.reset();
        },
        error: err => {
          this.vehicleSaving.set(false);
          const body = err.error;
          this.vehicleSaveError.set(body?.message ?? 'Could not add vehicle. Please try again.');
        },
      });
  }

  private resetVehicleSelection(): void {
    this.customerVehicles.set([]);
    this.vehiclesState.set('idle');
    this.form.patchValue({ vehicleId: '' });
    this.showAddVehicle.set(false);
    this.vehicleSaveError.set(null);
    this.newVehicleForm.reset();
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
