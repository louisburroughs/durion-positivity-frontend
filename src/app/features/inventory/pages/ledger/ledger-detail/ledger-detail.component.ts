import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { InventoryLedgerEntry } from '../../../models/inventory.models';
import { InventoryDomainService } from '../../../services/inventory.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-ledger-detail',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './ledger-detail.component.html',
  styleUrl: './ledger-detail.component.css',
})
export class LedgerDetailComponent {
  private readonly inventoryService = inject(InventoryDomainService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly entry = signal<InventoryLedgerEntry | null>(null);

  constructor() {
    const ledgerEntryId = this.route.snapshot.paramMap.get('ledgerEntryId');
    if (!ledgerEntryId) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.LEDGER.DETAIL.ERROR.MISSING_ID');
      return;
    }

    this.state.set('loading');
    this.inventoryService
      .getLedgerEntry(ledgerEntryId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: entry => {
          this.entry.set(entry);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.LEDGER.DETAIL.ERROR.LOAD');
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/app/inventory/ledger']);
  }
}
