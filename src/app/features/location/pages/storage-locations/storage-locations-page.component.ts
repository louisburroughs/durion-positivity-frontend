import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { LocationService, STORAGE_LOCATION_TYPES } from '../../services/location.service';
import { LocationPickerComponent } from '../../components/location-picker/location-picker.component';

@Component({
  selector: 'app-storage-locations-page',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, LocationPickerComponent],
  templateUrl: './storage-locations-page.component.html',
  styleUrl: './storage-locations-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageLocationsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly locationId = signal('');
  readonly invalidId = signal(false);
  readonly storageLocations = signal<unknown[]>([]);
  readonly storageTypes = signal<unknown[]>([]);
  readonly loading = signal(false);
  readonly storageLocationsError = signal<string | null>(null);
  readonly storageTypesError = signal<string | null>(null);
  readonly showCreateForm = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createSuccess = signal(false);
  readonly showDeactivateDialog = signal(false);
  readonly deactivateTarget = signal<Record<string, unknown> | null>(null);
  readonly deactivating = signal(false);
  readonly deactivateError = signal<string | null>(null);
  readonly deactivateDestinationId = signal('');
  readonly requiresDestination = signal(false);

  readonly createForm = new FormGroup({
    locationId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    storageType: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    parentStorageLocationId: new FormControl('', { nonNullable: true }),
    barcode: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const routeLocationId = String(params['locationId'] ?? '');
        if (routeLocationId === this.locationId()) {
          return;
        }
        this.locationId.set(routeLocationId);
        this.createForm.controls.locationId.setValue(routeLocationId);
        if (!routeLocationId) {
          this.storageLocations.set([]);
          return;
        }
        this.loadStorageLocations();
        this.loadStorageTypes();
      });
  }

  onLocationSelected(locationId: string): void {
    if (!locationId) {
      this.resetToPrompt();
      this.invalidId.set(false);
      return;
    }
    this.invalidId.set(false);
    this.locationId.set(locationId);
    this.createForm.controls.locationId.setValue(locationId);
    this.router.navigate([], { queryParams: { locationId }, queryParamsHandling: 'merge' });
    this.loadStorageLocations();
    this.loadStorageTypes();
  }

  onInvalidSelection(_id: string): void {
    this.resetToPrompt();
    this.invalidId.set(true);
  }

  private resetToPrompt(): void {
    this.locationId.set('');
    this.storageLocations.set([]);
    this.storageTypes.set([]);
    this.createSuccess.set(false);
    this.showCreateForm.set(false);
    this.storageLocationsError.set(null);
    this.storageTypesError.set(null);
    this.createForm.controls.locationId.setValue('');
    this.router.navigate([], { queryParams: { locationId: null }, queryParamsHandling: 'merge' });
  }

  loadStorageLocations(): void {
    const locationId = this.locationId();
    if (!locationId) {
      return;
    }

    this.loading.set(true);
    this.storageLocationsError.set(null);

    this.locationService.listStorageLocations(locationId, { pageSize: 50 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.storageLocations.set(this.normalizeItems(response));
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.storageLocationsError.set(this.errorMessage(err, 'Failed to load storage locations.'));
          this.loading.set(false);
        },
      });
  }

  loadStorageTypes(): void {
    // The location service has no storage-types meta endpoint; the StorageLocationType
    // enum is fixed, so the options are sourced from a client-side constant.
    this.storageTypesError.set(null);
    this.storageTypes.set([...STORAGE_LOCATION_TYPES]);
  }

  openCreateForm(): void {
    this.showCreateForm.set(true);
    this.createSuccess.set(false);
    this.createError.set(null);
    this.createForm.reset({
      locationId: this.locationId(),
      name: '',
      storageType: '',
      parentStorageLocationId: '',
      barcode: '',
    });
    this.createForm.controls.locationId.setValue(this.locationId());
  }

  cancelCreate(): void {
    this.showCreateForm.set(false);
  }

  createStorageLocation(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) {
      return;
    }

    this.creating.set(true);
    this.createError.set(null);
    this.createSuccess.set(false);

    const form = this.createForm.getRawValue();
    const body = {
      name: form.name,
      type: form.storageType,
      barcode: form.barcode,
      parentStorageLocationId: form.parentStorageLocationId,
    };

    this.locationService.createStorageLocation(this.locationId(), body, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showCreateForm.set(false);
          this.createSuccess.set(true);
          this.creating.set(false);
          this.loadStorageLocations();
        },
        error: (err: unknown) => {
          this.createError.set(this.errorMessage(err, 'Failed to create storage location.'));
          this.creating.set(false);
        },
      });
  }

  openDeactivateDialog(location: unknown): void {
    this.deactivateTarget.set(this.toRecord(location));
    this.requiresDestination.set(false);
    this.deactivateDestinationId.set('');
    this.deactivateError.set(null);
    this.showDeactivateDialog.set(true);
  }

  cancelDeactivate(): void {
    this.showDeactivateDialog.set(false);
    this.deactivateTarget.set(null);
    this.deactivateError.set(null);
    this.requiresDestination.set(false);
    this.deactivateDestinationId.set('');
  }

  confirmDeactivate(): void {
    if (this.requiresDestination() && !this.deactivateDestinationId()) {
      this.deactivateError.set('Destination required.');
      return;
    }

    const target = this.deactivateTarget();
    const id = String(target?.['storageLocationId'] ?? target?.['id'] ?? '');
    if (!id) {
      this.deactivateError.set('Storage location ID is required.');
      return;
    }

    this.deactivating.set(true);
    this.deactivateError.set(null);

    const body = {
      ...(this.requiresDestination() && this.deactivateDestinationId()
        ? { destinationStorageLocationId: this.deactivateDestinationId() }
        : {}),
    };

    this.locationService.deactivateStorageLocation(this.locationId(), id, body, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deactivating.set(false);
          this.showDeactivateDialog.set(false);
          this.deactivateTarget.set(null);
          this.loadStorageLocations();
        },
        error: (err: unknown) => {
          if (this.isDestinationRequiredError(err)) {
            this.requiresDestination.set(true);
            this.deactivateError.set('Destination required.');
            this.deactivating.set(false);
            return;
          }
          this.deactivateError.set(this.errorMessage(err, 'Failed to deactivate storage location.'));
          this.deactivating.set(false);
        },
      });
  }

  private normalizeItems(response: unknown): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }
    const payload = this.toRecord(response);
    const content = payload?.['content'] ?? payload?.['items'];
    return Array.isArray(content) ? content : [];
  }

  private isDestinationRequiredError(err: unknown): boolean {
    // The location service returns an RFC 9457 ProblemDetail
    // ({ status: 422, detail: 'DESTINATION_REQUIRED' }); the marker is in
    // `detail`. Legacy `code`/`errorCode` are also checked for safety.
    const payload = this.toRecord(this.toRecord(err)?.['error']);
    const marker = payload?.['detail'] ?? payload?.['code'] ?? payload?.['errorCode'];
    return typeof marker === 'string' && marker.includes('DESTINATION_REQUIRED');
  }

  private errorMessage(err: unknown, fallback: string): string {
    // ProblemDetail carries the message in `detail`; fall back to legacy `message`.
    const payload = this.toRecord(this.toRecord(err)?.['error']);
    const message = payload?.['detail'] ?? payload?.['message'];
    return typeof message === 'string' && message.trim().length > 0 ? message : fallback;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
  }
}
