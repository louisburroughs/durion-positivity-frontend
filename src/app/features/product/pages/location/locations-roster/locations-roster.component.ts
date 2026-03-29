import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  LocationRef,
  LocationRosterEntry,
  LocationValidationResult,
} from '../../../models/location.models';
import { ProductLocationService } from '../../../services/product-location.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-locations-roster',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './locations-roster.component.html',
  styleUrl: './locations-roster.component.css',
})
export class LocationsRosterComponent implements OnInit {
  private readonly locationService = inject(ProductLocationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly roster = signal<LocationRosterEntry[]>([]);
  readonly locations = signal<LocationRef[]>([]);
  readonly statusFilter = signal<string>('ACTIVE');

  ngOnInit(): void {
    this.loadRosterAndLocations();
  }

  validate(locationId: string): void {
    this.locationService
      .validateLocation(locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.applyValidationResult(result);
        },
        error: () => this.errorKey.set('PRODUCT.LOCATION.ROSTER.ERROR.VALIDATE'),
      });
  }

  refresh(): void {
    this.loadRosterAndLocations();
  }

  private loadRosterAndLocations(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    forkJoin({
      roster: this.locationService.getRoster({ status: this.statusFilter() }),
      locations: this.locationService.getAllLocations(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.roster.set(result.roster);
          this.locations.set(result.locations);
          this.state.set(result.roster.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.LOCATION.ROSTER.ERROR.LOAD');
        },
      });
  }

  private applyValidationResult(result: LocationValidationResult): void {
    this.roster.update(current =>
      current.map(entry =>
        entry.id === result.locationId
          ? {
              ...entry,
              lastValidatedAt: result.validatedAt,
              validationStatus: result.valid ? 'VALID' : 'INVALID',
            }
          : entry,
      ),
    );
  }
}
