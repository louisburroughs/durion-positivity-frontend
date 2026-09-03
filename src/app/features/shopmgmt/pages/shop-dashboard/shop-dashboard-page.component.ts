import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { DatePipe } from '@angular/common';
import { RepairUnitCardComponent } from '../../components/repair-unit-card/repair-unit-card.component';
import { OpenWorkorderRosterComponent } from '../../components/open-workorder-roster/open-workorder-roster.component';
import {
  RepairLocationOption,
  RepairUnitCard,
  ShopDashboardView,
  statusBand,
  todayIsoLocal,
} from '../../models/shop-dashboard.models';
import { ShopDashboardService } from '../../services/shop-dashboard.service';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

const EMPTY_VIEW: ShopDashboardView = {
  locationId: '',
  date: '',
  units: [],
  openWorkorders: [],
  openWorkordersTruncated: false,
  dataQualityWarning: false,
};

/**
 * Shop Manager Dashboard — every repair unit at one location with the work on
 * it, plus the roster of open workorders.
 *
 * See docs/design/shopmgmt-shop-manager-dashboard.md in the durion repo.
 */
@Component({
  selector: 'app-shop-dashboard-page',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DatePipe, RepairUnitCardComponent, OpenWorkorderRosterComponent],
  templateUrl: './shop-dashboard-page.component.html',
  styleUrls: ['./shop-dashboard-page.component.css', '../../styles/status-band.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopDashboardPageComponent {
  private readonly service = inject(ShopDashboardService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly todayIso = todayIsoLocal();

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly locations = signal<readonly RepairLocationOption[]>([]);
  readonly locationsLoaded = signal(false);
  readonly locationsError = signal(false);

  readonly selectedLocationId = signal('');
  readonly selectedDate = signal(this.todayIso);
  readonly view = signal<ShopDashboardView>(EMPTY_VIEW);

  /** Bumped to re-run the load effect for the same location and date. */
  private readonly refreshToken = signal(0);

  readonly bays = computed(() => this.view().units.filter(unit => unit.unitType === 'BAY'));
  readonly mobileUnits = computed(() =>
    this.view().units.filter(unit => unit.unitType === 'MOBILE_UNIT'),
  );

  readonly counts = computed(() => {
    const units = this.view().units;
    const tally = { total: units.length, active: 0, blocked: 0, ready: 0, idle: 0 };
    for (const unit of units) {
      const band = statusBand(unit.workorder?.status);
      if (band === 'active') {
        tally.active += 1;
      } else if (band === 'blocked') {
        tally.blocked += 1;
      } else if (band === 'ready') {
        tally.ready += 1;
      } else if (band === 'idle') {
        tally.idle += 1;
      }
    }
    return tally;
  });

  readonly hasUnits = computed(() => this.view().units.length > 0);

  /** Placeholder cards for the loading grid; count is cosmetic only. */
  readonly skeletons = [0, 1, 2, 3, 4, 5];

  constructor() {
    this.loadRepairLocations();

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const locationId = String(params['locationId'] ?? '');
      const date = String(params['date'] ?? '') || this.todayIso;
      if (locationId !== this.selectedLocationId()) {
        this.selectedLocationId.set(locationId);
      }
      if (date !== this.selectedDate()) {
        this.selectedDate.set(date);
      }
    });

    // ADR-0033: every subscription started here is torn down through onCleanup,
    // so a fast location switch cannot land a stale response over a newer one.
    effect(onCleanup => {
      const locationId = this.selectedLocationId().trim();
      const date = this.selectedDate();
      this.refreshToken();

      if (!locationId) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.view.set(EMPTY_VIEW);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const subscription = this.service.getDashboard(locationId, date).subscribe({
        next: view => {
          this.view.set(view);
          this.state.set('ready');
        },
        error: (error: unknown) => {
          this.view.set(EMPTY_VIEW);
          // ADR-0031: the state flips to error before the key is set.
          this.state.set('error');
          this.errorKey.set(this.toErrorKey(error));
        },
      });

      onCleanup(() => subscription.unsubscribe());
    });
  }

  onLocationChange(locationId: string): void {
    this.selectedLocationId.set(locationId);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { locationId: locationId || null },
      queryParamsHandling: 'merge',
    });
  }

  onDateChange(date: string): void {
    const next = date || this.todayIso;
    this.selectedDate.set(next);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: next },
      queryParamsHandling: 'merge',
    });
  }

  refresh(): void {
    // The filter list is memoised beyond this page's lifetime, so a bay created
    // elsewhere would never appear without an explicit invalidation here.
    this.service.invalidateRepairLocations();
    this.loadRepairLocations();
    this.refreshToken.update(token => token + 1);
  }

  private loadRepairLocations(): void {
    this.service
      .listRepairLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.locations.set(result.options);
          // `degraded` is how a partial derivation reaches the user: the inner
          // calls are caught so the list still renders, which means this never
          // arrives as an observable error.
          this.locationsError.set(result.degraded);
          this.locationsLoaded.set(true);
        },
        error: () => {
          this.locationsError.set(true);
          this.locationsLoaded.set(true);
        },
      });
  }

  trackUnit(_index: number, unit: RepairUnitCard): string {
    return unit.unitId;
  }

  private toErrorKey(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) {
        return 'SHOPMGMT.SHOP_DASHBOARD.ERROR_FORBIDDEN';
      }
      if (error.status === 404) {
        return 'SHOPMGMT.SHOP_DASHBOARD.ERROR_NOT_FOUND';
      }
    }
    return 'SHOPMGMT.SHOP_DASHBOARD.ERROR_LOAD';
  }
}
