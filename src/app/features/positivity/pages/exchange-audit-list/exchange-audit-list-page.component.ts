import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../../components/supplier-status-chip/supplier-status-chip.component';
import { SupplierExchangeAuditService } from '../../services/supplier-exchange-audit.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  ExchangeAuditFilter,
  ExchangeAuditRecord,
  ExchangeOutcome,
} from '../../models/supplier-exchange.models';
import {
  SupplierCapability,
  VendorProfileSummary,
} from '../../models/supplier-profile.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

const OUTCOMES: readonly ExchangeOutcome[] = [
  'SUCCESS',
  'FAILURE',
  'TIMEOUT',
  'REJECTED',
  'CIRCUIT_OPEN',
];

const CAPABILITIES: readonly SupplierCapability[] = [
  'ORDER',
  'ORDER_STATUS',
  'STOCK_REPORT',
  'PRICE_CATALOG',
  'PRODUCT_CATALOG',
  'DELIVERY_NOTE',
];

const OUTCOME_TONES: Readonly<Record<ExchangeOutcome, SupplierStatusTone>> = {
  SUCCESS: 'success',
  FAILURE: 'danger',
  TIMEOUT: 'warning',
  REJECTED: 'warning',
  CIRCUIT_OPEN: 'danger',
};

/**
 * Exchange audit viewer — the filterable list half (issue #188).
 *
 * Exchange rows are historical commercial records used to settle disputes, so
 * this screen is strictly read-only: no retry, no replay, no edit. Adding a
 * replay button here would let an operator re-send a real order to a vendor from
 * a screen whose purpose is to explain what already happened.
 *
 * Filter dates are date-only `YYYY-MM-DD` values passed through to the API
 * verbatim (ADR-0038).
 */
@Component({
  selector: 'app-exchange-audit-list-page',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, TranslatePipe, SupplierStatusChipComponent],
  templateUrl: './exchange-audit-list-page.component.html',
  styleUrls: ['../../positivity-shared.css', './exchange-audit-list-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExchangeAuditListPageComponent {
  private readonly auditService = inject(SupplierExchangeAuditService);
  private readonly profileService = inject(SupplierProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly exchanges = signal<ExchangeAuditRecord[]>([]);
  readonly totalCount = signal(0);
  readonly profiles = signal<VendorProfileSummary[]>([]);

  readonly outcomes = OUTCOMES;
  readonly capabilities = CAPABILITIES;

  readonly filterForm = new FormGroup({
    vendorProfileId: new FormControl('', { nonNullable: true }),
    capability: new FormControl<SupplierCapability | ''>('', { nonNullable: true }),
    outcome: new FormControl<ExchangeOutcome | ''>('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.load();
  }

  outcomeTone(outcome: ExchangeOutcome): SupplierStatusTone {
    return OUTCOME_TONES[outcome] ?? 'neutral';
  }

  private currentFilter(): ExchangeAuditFilter {
    const raw = this.filterForm.getRawValue();
    return {
      vendorProfileId: raw.vendorProfileId || undefined,
      capability: raw.capability || undefined,
      outcome: raw.outcome || undefined,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
    };
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    forkJoin({
      page: this.auditService.listExchanges(this.currentFilter()),
      profiles: this.profileService.listProfiles(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.exchanges.set(result.page.items);
          this.totalCount.set(result.page.totalCount);
          this.profiles.set(result.profiles);
          this.state.set(result.page.items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AUDIT.ERROR.LOAD');
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
        },
      });
  }

  applyFilter(): void {
    this.load();
  }

  clearFilter(): void {
    this.filterForm.reset({
      vendorProfileId: '',
      capability: '',
      outcome: '',
      dateFrom: '',
      dateTo: '',
    });
    this.load();
  }
}
