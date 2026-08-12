import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, catchError, of } from 'rxjs';
import { SupplierShipmentService } from '../../services/supplier-shipment.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierUnlinkedShipmentEvent,
  SupplierUnlinkedShipmentEventFilter,
} from '../../models/supplier-shipment.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/**
 * Flagged list of shipment events that matched no purchase order (issue #193).
 *
 * ── A worklist, not an inbox ────────────────────────────────────────────────
 * Rows are owned by the backend and clear when a matching order appears or the
 * vendor reference is corrected. There is deliberately **no** dismiss, ignore or
 * manual-link control here, exactly as with the PRICAT and enrichment
 * worklists: an operator hiding an unmatched shipment event hides an inbound
 * delivery from the dock that will still turn up, and manual linking is a
 * matching decision the backend owns.
 *
 * ── Both time facts are shown ───────────────────────────────────────────────
 * The carrier's event time and the platform's ingest time are separate columns.
 * An event that arrived late to us is a different problem from a shipment that
 * happened late, and this list is where that distinction gets diagnosed.
 *
 * Filter dates are date-only `YYYY-MM-DD` values passed through untouched
 * (ADR-0038). The vendor filter is a convenience: if the profile roster cannot
 * be read the filter is unavailable and the list still loads.
 */
@Component({
  selector: 'app-shipment-events-unlinked-page',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './shipment-events-unlinked-page.component.html',
  styleUrls: ['../../positivity-shared.css', './shipment-events-unlinked-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShipmentEventsUnlinkedPageComponent implements OnInit {
  private readonly service = inject(SupplierShipmentService);
  private readonly profiles = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly rows = signal<SupplierUnlinkedShipmentEvent[]>([]);
  readonly totalCount = signal(0);
  readonly vendorOptions = signal<VendorProfileSummary[]>([]);

  readonly filterForm = new FormGroup({
    vendorProfileId: new FormControl('', { nonNullable: true }),
    search: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  readonly vendorFilterAvailable = computed(() => this.vendorOptions().length > 0);

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.profiles
        .listProfiles()
        .pipe(catchError(() => of<VendorProfileSummary[]>([])))
        .subscribe(items => this.vendorOptions.set(items));

      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Unconditional one-shot read; an `effect` here would exist only to run once. */
  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .listUnlinkedEvents(this.currentFilter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => {
          this.rows.set(page.items);
          this.totalCount.set(page.totalCount);
          this.state.set(page.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.SHIPMENT.UNLINKED.ERROR.LOAD');
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  applyFilter(): void {
    this.load();
  }

  clearFilter(): void {
    this.filterForm.reset({ vendorProfileId: '', search: '', dateFrom: '', dateTo: '' });
    this.load();
  }

  private currentFilter(): SupplierUnlinkedShipmentEventFilter {
    const raw = this.filterForm.getRawValue();
    return {
      vendorProfileId: raw.vendorProfileId || undefined,
      search: raw.search.trim() || undefined,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
    };
  }
}
