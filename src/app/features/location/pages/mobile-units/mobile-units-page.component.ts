import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LocationService } from '../../services/location.service';
import { LocationPickerComponent } from '../../components/location-picker/location-picker.component';

@Component({
  selector: 'app-mobile-units-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, LocationPickerComponent],
  templateUrl: './mobile-units-page.component.html',
  styleUrl: './mobile-units-page.component.css',
})
export class MobileUnitsPageComponent implements OnInit {
  private readonly locationService = inject(LocationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly mobileUnits = signal<unknown[]>([]);
  private readonly allUnits = signal<unknown[]>([]);
  readonly locationId = signal('');
  readonly invalidId = signal(false);
  readonly error = signal<string | null>(null);
  readonly showCreateModal = signal(false);
  readonly selectedUnit = signal<unknown>(null);
  readonly showCoverageModal = signal(false);

  readonly createName = signal('');
  readonly coverageRegion = signal('');

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const locationId = String(params['locationId'] ?? '');
      if (locationId === this.locationId()) {
        return;
      }
      this.locationId.set(locationId);
      if (locationId) {
        this.loadMobileUnits(locationId);
      } else {
        this.mobileUnits.set([]);
      }
    });
  }

  onLocationSelected(locationId: string): void {
    this.invalidId.set(false);
    this.locationId.set(locationId);
    this.router.navigate([], { queryParams: { locationId }, queryParamsHandling: 'merge' });
    this.loadMobileUnits(locationId);
  }

  onInvalidSelection(_id: string): void {
    this.invalidId.set(true);
    this.locationId.set('');
    this.mobileUnits.set([]);
    this.router.navigate([], { queryParams: { locationId: null }, queryParamsHandling: 'merge' });
  }

  loadMobileUnits(locationId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.locationService.listMobileUnits().subscribe({
      next: (result) => {
        const payload = Array.isArray(result)
          ? result
          : (result as { items?: unknown[] })?.items ?? [];
        this.allUnits.set(payload);
        this.applyFilter(locationId);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('LOCATION.MOBILE_UNITS.ERROR.LOAD');
        this.loading.set(false);
      },
    });
  }

  private applyFilter(locationId: string): void {
    const filtered = this.allUnits().filter(u =>
      String((u as Record<string, unknown>)['baseLocationId'] ?? '') === locationId,
    );
    this.mobileUnits.set(filtered);
  }

  openCreate(): void {
    this.createName.set('');
    this.showCreateModal.set(true);
  }

  closeCreate(): void {
    this.showCreateModal.set(false);
  }

  submitCreate(): void {
    const name = this.createName().trim();
    if (!name) {
      this.error.set('LOCATION.MOBILE_UNITS.ERROR.NAME_REQUIRED');
      return;
    }

    this.locationService.createMobileUnit({ name }).subscribe({
      next: () => {
        this.closeCreate();
        this.loadMobileUnits(this.locationId());
      },
      error: () => this.error.set('LOCATION.MOBILE_UNITS.ERROR.CREATE'),
    });
  }

  openCoverage(unit: unknown): void {
    this.selectedUnit.set(unit);
    this.coverageRegion.set('');
    this.showCoverageModal.set(true);
  }

  closeCoverage(): void {
    this.showCoverageModal.set(false);
    this.selectedUnit.set(null);
  }

  submitCoverageRules(): void {
    const unit = this.selectedUnit() as Record<string, unknown> | null;
    const unitId = String(unit?.['mobileUnitId'] ?? unit?.['id'] ?? '');
    const coverage = this.coverageRegion().trim();

    if (!unitId) {
      this.error.set('LOCATION.MOBILE_UNITS.ERROR.SELECT_UNIT');
      return;
    }

    const body = coverage ? [{ region: coverage }] : [];
    this.locationService.replaceCoverageRules(unitId, body).subscribe({
      next: () => {
        this.closeCoverage();
        this.loadMobileUnits(this.locationId());
      },
      error: () => this.error.set('LOCATION.MOBILE_UNITS.ERROR.UPDATE_COVERAGE'),
    });
  }

  getUnitName(unit: unknown): string {
    const candidate = unit as Record<string, unknown>;
    return String(candidate['name'] ?? candidate['unitName'] ?? candidate['mobileUnitId'] ?? 'Mobile Unit');
  }
}
