import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { InventoryService } from '../../services/inventory.service';

@Component({
  selector: 'app-storage-locations-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './storage-locations-page.component.html',
  styleUrl: './storage-locations-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageLocationsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly inventoryService = inject(InventoryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly locationId = signal('');
  readonly storageLocations = signal<unknown[]>([]);
  readonly storageTypes = signal<unknown[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
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
    code: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
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

  loadStorageLocations(): void {
    const locationId = this.locationId();
    if (!locationId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    this.inventoryService.listStorageLocations(locationId, { pageSize: 50 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.storageLocations.set(this.normalizeItems(response));
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loadError.set(this.errorMessage(err, 'Failed to load storage locations.'));
          this.loading.set(false);
        },
      });
  }

  loadStorageTypes(): void {
    this.loadError.set(null);
    this.inventoryService.listStorageTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.storageTypes.set(this.normalizeItems(response));
        },
        error: (err: unknown) => {
          this.loadError.set(this.errorMessage(err, 'Failed to load storage types.'));
        },
      });
  }

  openCreateForm(): void {
    this.showCreateForm.set(true);
    this.createSuccess.set(false);
    this.createError.set(null);
    this.createForm.reset({
      locationId: this.locationId(),
      code: '',
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

    const body = this.createForm.getRawValue();

    this.inventoryService.createStorageLocation(body, uuidv4())
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

    this.inventoryService.deactivateStorageLocation(id, body, uuidv4())
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
    const items = payload?.['items'];
    return Array.isArray(items) ? items : [];
  }

  private isDestinationRequiredError(err: unknown): boolean {
    const code = this.toCode(err);
    return code === 'DESTINATION_REQUIRED';
  }

  private errorMessage(err: unknown, fallback: string): string {
    const payload = this.toRecord(this.toRecord(err)?.['error']);
    const message = payload?.['message'];
    return typeof message === 'string' && message.trim().length > 0 ? message : fallback;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
  }

  private toCode(err: unknown): string | null {
    const payload = this.toRecord(this.toRecord(err)?.['error']);
    const code = payload?.['code'] ?? payload?.['errorCode'];
    return typeof code === 'string' ? code : null;
  }
}
