import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ActiveMsrp, Msrp } from '../../../models/pricing.models';
import { ProductCatalogService } from '../../../services/product-catalog.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-msrp',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './msrp.component.html',
  styleUrl: './msrp.component.css',
})
export class MsrpComponent {
  private readonly productCatalog = inject(ProductCatalogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly skuChanges$ = new Subject<string>();

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly productSku = signal('');
  readonly msrpList = signal<Msrp[]>([]);
  readonly activeMsrp = signal<ActiveMsrp | null>(null);

  constructor() {
    this.skuChanges$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(sku => this.loadSkuData(sku));
  }

  onSkuChange(sku: string): void {
    this.productSku.set(sku);
    this.skuChanges$.next(sku);
  }

  search(): void {
    this.skuChanges$.next(this.productSku());
  }

  createMsrp(msrp: Partial<Msrp>): void {
    this.productCatalog
      .createMsrp(msrp)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.msrpList.update(current => [...current, created]);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.PRICING.MSRP.ERROR.CREATE');
        },
      });
  }

  updateMsrp(msrpId: string, update: Partial<Msrp>): void {
    this.productCatalog
      .updateMsrp(msrpId, update)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.msrpList.update(current =>
            current.map(entry => (entry.id === updated.id ? updated : entry)),
          );
          if (this.activeMsrp()?.id === updated.id) {
            this.activeMsrp.set({ ...updated, active: true });
          }
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.PRICING.MSRP.ERROR.UPDATE');
        },
      });
  }

  private loadSkuData(sku: string): void {
    const normalizedSku = sku.trim();
    if (!normalizedSku) {
      this.msrpList.set([]);
      this.activeMsrp.set(null);
      this.state.set('idle');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    forkJoin({
      msrpList: this.productCatalog.listMsrp(normalizedSku),
      activeMsrp: this.productCatalog.getActiveMsrp(normalizedSku),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.msrpList.set(result.msrpList);
          this.activeMsrp.set(result.activeMsrp);
          this.state.set(result.msrpList.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.PRICING.MSRP.ERROR.LOAD');
        },
      });
  }
}
