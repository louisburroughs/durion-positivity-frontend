import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { LocationService } from '../../services/location.service';

@Component({
  selector: 'app-mobile-units-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './mobile-units-page.component.html',
  styleUrl: './mobile-units-page.component.css',
})
export class MobileUnitsPageComponent implements OnInit {
  private readonly locationService = inject(LocationService);

  readonly loading = signal(false);
  readonly mobileUnits = signal<unknown[]>([]);
  readonly error = signal<string | null>(null);
  readonly showCreateModal = signal(false);
  readonly selectedUnit = signal<unknown>(null);
  readonly showCoverageModal = signal(false);

  readonly createName = signal('');
  readonly coverageRegion = signal('');

  ngOnInit(): void {
    this.loadMobileUnits();
  }

  loadMobileUnits(): void {
    this.loading.set(true);
    this.error.set(null);

    this.locationService.listMobileUnits().subscribe({
      next: (result) => {
        const payload = Array.isArray(result)
          ? result
          : (result as { items?: unknown[] })?.items ?? [];
        this.mobileUnits.set(payload);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('LOCATION.MOBILE_UNITS.ERROR.LOAD');
        this.loading.set(false);
      },
    });
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
        this.loadMobileUnits();
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
        this.loadMobileUnits();
      },
      error: () => this.error.set('LOCATION.MOBILE_UNITS.ERROR.UPDATE_COVERAGE'),
    });
  }

  getUnitName(unit: unknown): string {
    const candidate = unit as Record<string, unknown>;
    return String(candidate['name'] ?? candidate['unitName'] ?? candidate['mobileUnitId'] ?? 'Mobile Unit');
  }
}
