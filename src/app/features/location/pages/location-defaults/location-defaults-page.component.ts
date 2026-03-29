import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { LocationService } from '../../services/location.service';

@Component({
  selector: 'app-location-defaults-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './location-defaults-page.component.html',
  styleUrl: './location-defaults-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationDefaultsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formStateTick = signal(0);

  readonly locationId = signal('');
  readonly siteDefaults = signal<Record<string, unknown> | null>(null);
  readonly storageLocations = signal<unknown[]>([]);
  readonly loading = signal(false);
  readonly storageLocationsLoading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly saveSuccess = signal(false);
  readonly version = signal<number | null>(null);
  readonly showReloadPrompt = signal(false);

  readonly defaultsForm = new FormGroup({
    defaultStagingLocationId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    defaultQuarantineLocationId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly stagingId = computed(() => {
    this.formStateTick();
    return this.defaultsForm.controls.defaultStagingLocationId.value;
  });

  readonly quarantineId = computed(() => {
    this.formStateTick();
    return this.defaultsForm.controls.defaultQuarantineLocationId.value;
  });

  readonly isSameLocation = computed(() => !!this.stagingId() && this.stagingId() === this.quarantineId());

  readonly canSave = computed(
    () => !this.saving() && !this.isSameLocation() && !!this.stagingId() && !!this.quarantineId(),
  );

  constructor() {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const routeLocationId = String(params['locationId'] ?? '');
        this.locationId.set(routeLocationId);
        if (!routeLocationId) {
          this.siteDefaults.set(null);
          this.storageLocations.set([]);
          return;
        }
        this.loadDefaults();
        this.loadStorageLocations();
      });

    this.defaultsForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.formStateTick.update(v => v + 1);
      });

    this.defaultsForm.statusChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.formStateTick.update(v => v + 1);
      });
  }

  loadDefaults(): void {
    const locationId = this.locationId();
    if (!locationId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    this.locationService.getLocationDefaults(locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const payload = this.toRecord(response);
          this.siteDefaults.set(payload);
          this.version.set(this.toVersion(payload?.['version']));
          this.defaultsForm.patchValue({
            defaultStagingLocationId: String(payload?.['defaultStagingLocationId'] ?? ''),
            defaultQuarantineLocationId: String(payload?.['defaultQuarantineLocationId'] ?? ''),
          });
          this.defaultsForm.markAsPristine();
          this.formStateTick.update(v => v + 1);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loadError.set(this.errorMessage(err, 'Failed to load default locations.'));
          this.loading.set(false);
        },
      });
  }

  loadStorageLocations(): void {
    const locationId = this.locationId();
    if (!locationId) {
      return;
    }

    this.storageLocationsLoading.set(true);
    this.loadError.set(null);

    this.locationService.listStorageLocations(locationId, { status: 'ACTIVE', pageIndex: 0, pageSize: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.storageLocations.set(this.normalizeItems(response));
          this.storageLocationsLoading.set(false);
        },
        error: (err: unknown) => {
          this.loadError.set(this.errorMessage(err, 'Failed to load storage locations.'));
          this.storageLocationsLoading.set(false);
        },
      });
  }

  saveDefaults(): void {
    this.defaultsForm.markAllAsTouched();
    if (this.defaultsForm.invalid) {
      return;
    }
    if (this.isSameLocation()) {
      this.saveError.set('Staging and quarantine locations must be different.');
      return;
    }

    const locationId = this.locationId();
    if (!locationId) {
      this.saveError.set('Location ID is required.');
      return;
    }

    const { defaultStagingLocationId, defaultQuarantineLocationId } = this.defaultsForm.getRawValue();
    const currentVersion = this.version();
    const body: Record<string, unknown> = {
      defaultStagingLocationId,
      defaultQuarantineLocationId,
      ...(currentVersion === null ? {} : { version: currentVersion }),
    };

    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);
    this.showReloadPrompt.set(false);

    this.locationService.configureLocationDefaults(locationId, body, uuidv4())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saveSuccess.set(true);
          this.saving.set(false);
          this.loadDefaults();
        },
        error: (err: unknown) => {
          const message = this.mapSaveError(err);
          this.saveError.set(message);
          if (this.toStatus(err) === 409 || this.toCode(err) === 'OPTIMISTIC_LOCK_FAILED') {
            this.showReloadPrompt.set(true);
          }
          this.saving.set(false);
        },
      });
  }

  reload(): void {
    this.showReloadPrompt.set(false);
    this.saveError.set(null);
    this.defaultsForm.reset({
      defaultStagingLocationId: '',
      defaultQuarantineLocationId: '',
    });
    this.defaultsForm.markAsPristine();
    this.formStateTick.update(v => v + 1);
    this.loadDefaults();
    this.loadStorageLocations();
  }

  private normalizeItems(response: unknown): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }
    const payload = this.toRecord(response);
    const items = payload?.['items'];
    return Array.isArray(items) ? items : [];
  }

  private mapSaveError(err: unknown): string {
    const status = this.toStatus(err);
    const code = this.toCode(err);

    if (code === 'DEFAULT_LOCATION_ROLE_CONFLICT') {
      return 'Default locations must be distinct.';
    }
    if (status === 409 || code === 'OPTIMISTIC_LOCK_FAILED') {
      return 'Another user updated this config. Please reload.';
    }
    if (status === 403) {
      return 'Not authorized.';
    }
    return this.errorMessage(err, 'Failed to save default locations.');
  }

  private errorMessage(err: unknown, fallback: string): string {
    const payload = this.toRecord(this.toRecord(err)?.['error']);
    const message = payload?.['message'];
    return typeof message === 'string' && message.trim().length > 0 ? message : fallback;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
  }

  private toStatus(err: unknown): number | null {
    const status = this.toRecord(err)?.['status'];
    return typeof status === 'number' ? status : null;
  }

  private toCode(err: unknown): string | null {
    const envelope = this.toRecord(this.toRecord(err)?.['error']);
    const code = envelope?.['code'] ?? envelope?.['errorCode'];
    return typeof code === 'string' ? code : null;
  }

  private toVersion(value: unknown): number | null {
    return typeof value === 'number' ? value : null;
  }
}
