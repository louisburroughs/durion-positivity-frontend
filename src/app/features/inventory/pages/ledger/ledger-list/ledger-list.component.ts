import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import {
  InventoryLedgerEntry,
  LedgerFilter,
  LedgerPageResponse,
} from '../../../models/inventory.models';
import { InventoryService } from '../../../services/inventory.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-ledger-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe, FormsModule],
  templateUrl: './ledger-list.component.html',
  styleUrl: './ledger-list.component.css',
})
export class LedgerListComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly entries = signal<InventoryLedgerEntry[]>([]);
  readonly nextPageToken = signal<string | null>(null);
  readonly activeFilter = signal<LedgerFilter>({});

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const productSku = params.get('productSku') ?? undefined;
    const locationId = params.get('locationId') ?? undefined;
    if (productSku || locationId) {
      this.applyFilter({ productSku, locationId });
    }
  }

  applyFilter(filter: LedgerFilter): void {
    this.activeFilter.set(filter);
    this.entries.set([]);
    this.nextPageToken.set(null);
    this.loadPage(filter);
  }

  loadMore(): void {
    const token = this.nextPageToken();
    if (!token) {
      return;
    }
    this.loadPage({ ...this.activeFilter(), pageToken: token });
  }

  selectEntry(id: string): void {
    this.router.navigate(['/app/inventory/ledger', id]);
  }

  private loadPage(filter: LedgerFilter): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.inventoryService
      .queryLedger(filter)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page: LedgerPageResponse) => {
          this.entries.update(existing => [...existing, ...page.items]);
          this.nextPageToken.set(page.nextPageToken);
          this.state.set(this.entries().length ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.LEDGER.ERROR.LOAD');
        },
      });
  }
}
