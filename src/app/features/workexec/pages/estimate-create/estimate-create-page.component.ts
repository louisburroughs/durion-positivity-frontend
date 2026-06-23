import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import {
  CRMVehiclesService,
  CreateVehicleForPartyRequest,
  VehicleResponse,
  VehicleSummary,
} from '@durion-sdk/customer';
import { CrmService } from '../../../crm/services/crm.service';
import { PartyDetail } from '../../../crm/models/crm.models';
import { partyLabel as crmPartyLabel, vehicleLabel as crmVehicleLabel } from '../../../crm/util/crm-labels';
import { WorkexecService } from '../../services/workexec.service';
import { PageState } from '../../models/workexec.models';

const MAX_SUGGESTIONS = 8;
const ADD_VEHICLE_OPTION = '__add__';

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
  private readonly crm = inject(CrmService);
  private readonly vehiclesApi = inject(CRMVehiclesService);

  readonly state        = signal<PageState>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors  = signal<Record<string, string>>({});

  readonly customerSuggestions = signal<PartyDetail[]>([]);
  readonly customerDisplayName = signal('');
  readonly showCustomerSuggestions = signal(false);
  private readonly customerQuery$ = new Subject<string>();
  private customerSearchPrimed = false;

  readonly customerVehicles = signal<VehicleSummary[]>([]);

  readonly showAddVehicle = signal(false);
  readonly vehicleSaving = signal(false);
  readonly vehicleSaveError = signal<string | null>(null);

  readonly addVehicleOption = ADD_VEHICLE_OPTION;

  constructor() {
    // Server-side customer search (debounced); the browse term matches name and
    // customer number, so there is no client-side row cap.
    this.customerQuery$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap(q => this.crm.searchParties(q).pipe(catchError(() => of({ parties: [] as PartyDetail[] })))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(res => this.customerSuggestions.set((res.parties ?? []).slice(0, MAX_SUGGESTIONS)));
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
    const nav = this.router.getCurrentNavigation()?.extras?.state as Record<string, string> | undefined;
    if (nav?.['customerId']) this.form.patchValue({ customerId: nav['customerId'] });
    if (nav?.['vehicleId'])  this.form.patchValue({ vehicleId: nav['vehicleId'] });
  }

  onCustomerInput(value: string): void {
    this.customerDisplayName.set(value);
    this.form.patchValue({ customerId: '' });
    this.resetVehicleSelection();
    this.showCustomerSuggestions.set(true);
    this.customerQuery$.next(value);
  }

  onCustomerFocus(): void {
    this.showCustomerSuggestions.set(true);
    if (!this.customerSearchPrimed) {
      this.customerSearchPrimed = true;
      this.customerQuery$.next(this.customerDisplayName());
    }
  }

  onCustomerBlur(): void {
    setTimeout(() => this.showCustomerSuggestions.set(false), 150);
  }

  selectCustomer(party: PartyDetail): void {
    const id = party.partyId ?? '';
    this.form.patchValue({ customerId: id });
    this.customerDisplayName.set(this.customerLabel(party));
    this.showCustomerSuggestions.set(false);
    this.resetVehicleSelection();

    if (!id) { return; }

    // Authoritative, complete vehicle list for the customer (the CRM snapshot does
    // not reliably carry vehicles for commercial accounts).
    this.vehiclesApi.listVehiclesForCustomer(id, 'body', false, { transferCache: false })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of([] as VehicleSummary[])),
      )
      .subscribe(vehicles => this.customerVehicles.set(vehicles ?? []));
  }

  /** Display label for a party row (shared CRM label: name + DBA + customer number). */
  customerLabel(party: PartyDetail): string {
    return crmPartyLabel(party);
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
