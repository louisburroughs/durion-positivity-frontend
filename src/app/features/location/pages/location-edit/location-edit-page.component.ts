import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LocationService } from '../../services/location.service';

@Component({
  selector: 'app-location-edit-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './location-edit-page.component.html',
  styleUrl: './location-edit-page.component.css',
})
export class LocationEditPageComponent implements OnInit {
  private readonly locationService = inject(LocationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private locationId: string | null = null;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly location = signal<unknown>(null);
  readonly error = signal<string | null>(null);
  readonly saveSuccess = signal(false);
  readonly conflictError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});

  get isEditMode(): boolean {
    return this.locationId !== null;
  }

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    code: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    timezone: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    type: new FormControl('STORE', { nonNullable: true, validators: [Validators.required] }),
    status: new FormControl('ACTIVE', { nonNullable: true }),
    parentLocationId: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.locationId = this.route.snapshot.paramMap.get('id');
    if (this.isEditMode) {
      this.loadLocation();
    }
  }

  loadLocation(): void {
    if (!this.locationId) {
      return;
    }
    this.loading.set(true);
    this.locationService.getLocationById(this.locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (loc) => {
          this.location.set(loc);
          const data = loc as Record<string, unknown>;
          this.form.patchValue({
            name: String(data['name'] ?? ''),
            code: String(data['code'] ?? ''),
            timezone: String(data['timezone'] ?? ''),
            type: String(data['type'] ?? 'STORE'),
            status: String(data['status'] ?? 'ACTIVE'),
            parentLocationId: String(data['parentLocationId'] ?? ''),
          });
          // Code is immutable after creation.
          this.form.controls.code.disable();
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load location.');
          this.loading.set(false);
        },
      });
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.conflictError.set(null);
    this.fieldErrors.set({});
    this.saveSuccess.set(false);
    const body = this.form.getRawValue();

    if (this.isEditMode) {
      const locationId = this.locationId;
      if (!locationId) {
        this.saving.set(false);
        this.error.set('Failed to save location.');
        return;
      }
      this.locationService.updateLocation(locationId, body)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (loc) => {
            this.location.set(loc);
            this.saving.set(false);
            this.saveSuccess.set(true);
          },
          error: (err) => this.handleSaveError(err),
        });
    } else {
      this.locationService.createLocation(body)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.router.navigate(['/app/location/locations']);
          },
          error: (err) => this.handleSaveError(err),
        });
    }
  }

  private handleSaveError(err: {
    status?: number;
    error?: {
      message?: string;
      fieldErrors?: Record<string, string>;
      errors?: Array<{ field?: string; message?: string }>;
    };
  }): void {
    this.saving.set(false);
    if (err.status === 409) {
      this.conflictError.set(err.error?.message ?? 'A location with this code or name already exists.');
      return;
    }
    if (err.status === 400) {
      if (err.error?.fieldErrors) {
        this.fieldErrors.set(err.error.fieldErrors);
        return;
      }
      const mapped: Record<string, string> = {};
      for (const fe of err.error?.errors ?? []) {
        if (fe.field && fe.message) {
          mapped[fe.field] = fe.message;
        }
      }
      if (Object.keys(mapped).length > 0) {
        this.fieldErrors.set(mapped);
        return;
      }
    }
    this.error.set('Failed to save location.');
  }
}
