import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Router, RouterLink } from '@angular/router';
import { InventoryDomainService } from '../../../services/inventory.service';
import { InventoryCycleCountService } from '../../../services/inventory-cycle-count.service';
import { LocationRef, LocationZone } from '../../../models/inventory.models';

type PageState = 'idle' | 'loading' | 'ready' | 'submitting' | 'error';

@Component({
  selector: 'app-cycle-count-plan-form-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe, RouterLink],
  templateUrl: './cycle-count-plan-form-page.component.html',
  styleUrl: './cycle-count-plan-form-page.component.css',
})
export class CycleCountPlanFormPageComponent {
  private readonly inventoryDomainService = inject(InventoryDomainService);
  private readonly cycleCountService = inject(InventoryCycleCountService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly locations = signal<LocationRef[]>([]);
  readonly zones = signal<LocationZone[]>([]);

  readonly locationId = signal<string>('');
  readonly zoneIds = signal<string[]>([]);
  readonly scheduledDate = signal<string>('');
  readonly planName = signal<string>('');

  readonly canSubmit = computed(
    () =>
      this.locationId().trim().length > 0
      && this.zoneIds().length > 0
      && this.isScheduledDateValid(this.scheduledDate()),
  );

  constructor() {
    this.loadLocations();
  }

  loadLocations(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.inventoryDomainService
      .getLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: locations => {
          this.locations.set(locations);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.COUNTS.PLANS.ERROR.LOAD_LOCATIONS');
        },
      });
  }

  onLocationChange(locationId: string): void {
    this.locationId.set(locationId);
    this.zoneIds.set([]);

    if (!locationId) {
      this.zones.set([]);
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    this.inventoryDomainService
      .getLocationZones(locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: zones => {
          this.zones.set(zones);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.COUNTS.PLANS.ERROR.LOAD_ZONES');
        },
      });
  }

  onZoneSelectionChange(zoneIds: string[]): void {
    this.zoneIds.set(zoneIds);
  }

  onZoneToggle(zoneId: string, checked: boolean): void {
    const current = this.zoneIds();
    if (checked) {
      this.zoneIds.set(current.includes(zoneId) ? current : [...current, zoneId]);
      return;
    }

    this.zoneIds.set(current.filter(id => id !== zoneId));
  }

  submitPlan(): void {
    if (!this.canSubmit()) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.COUNTS.PLANS.ERROR.VALIDATION');
      return;
    }

    this.state.set('submitting');
    this.errorKey.set(null);

    this.cycleCountService
      .createCycleCountPlan({
        locationId: this.locationId(),
        zoneIds: this.zoneIds(),
        scheduledDate: this.scheduledDate(),
        planName: this.planName().trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.router.navigate(['/app/inventory/counts/plans']);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.COUNTS.PLANS.ERROR.SUBMIT');
        },
      });
  }

  private isScheduledDateValid(dateInput: string): boolean {
    if (!dateInput) {
      return false;
    }

    const parts = dateInput.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) {
      return false;
    }

    const selectedDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return selectedDate >= today;
  }
}
