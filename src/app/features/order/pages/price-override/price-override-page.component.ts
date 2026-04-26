import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  ApplyPriceOverrideRequest,
  PriceOverrideDetail,
  PriceOverridesService,
  SalesOrderLineResponse,
  SalesOrderResponse,
  SalesOrdersService,
} from '@durion-sdk/order';
import { Subscription, distinctUntilChanged, forkJoin, map, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-price-override-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './price-override-page.component.html',
  styleUrl: './price-override-page.component.css',
})
export class PriceOverridePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly priceOverridesService = inject(PriceOverridesService);
  private readonly salesOrdersService = inject(SalesOrdersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly overrides = signal<PriceOverrideDetail[]>([]);
  readonly orderLine = signal<SalesOrderLineResponse | null>(null);
  readonly orderId = signal<string>('');
  readonly lineId = signal<string>('');
  readonly reasonCodes = [
    'PRICE_MATCH',
    'MANAGER_DISCOUNT',
    'DEFECTIVE',
    'CUSTOMER_SERVICE',
  ] as const;

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.route.paramMap
        .pipe(
          map(paramMap => ({
            orderId: paramMap.get('orderId') ?? '',
            lineId: paramMap.get('lineId') ?? '',
          })),
          distinctUntilChanged((a, b) => a.orderId === b.orderId && a.lineId === b.lineId),
          switchMap(params => {
            this.orderId.set(params.orderId);
            this.lineId.set(params.lineId);

            if (!params.orderId) {
              this.overrides.set([]);
              this.orderLine.set(null);
              this.state.set('empty');
              return of({ overrides: [] as PriceOverrideDetail[], order: null as SalesOrderResponse | null });
            }

            this.state.set('loading');
            this.errorKey.set(null);
            return forkJoin({
              overrides: this.priceOverridesService.getOverridesByOrder(params.orderId),
              order: this.salesOrdersService.getOrder(params.orderId),
            });
          }),
        )
        .subscribe({
          next: result => {
            this.overrides.set(result.overrides);
            const line = result.order?.lines?.find(l => l.orderLineId === this.lineId()) ?? null;
            this.orderLine.set(line);
            this.state.set(result.overrides.length > 0 ? 'ready' : 'empty');
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('ORDER.OVERRIDE.ERROR.LOAD');
          },
        });

      onCleanup(() => sub.unsubscribe());
    }, { allowSignalWrites: true });
  }

  applyOverride(overridePrice: number, reasonCode: string): void {
    const orderId = this.orderId();
    const lineId = this.lineId();
    if (!orderId || !lineId) {
      this.state.set('error');
      this.errorKey.set('ORDER.OVERRIDE.ERROR.APPLY');
      return;
    }

    const line = this.orderLine();
    const request: ApplyPriceOverrideRequest = {
      orderId,
      orderLineId: lineId,
      productId: line?.itemSku ?? '',
      originalPrice: line?.unitPrice ?? 0,
      overridePrice,
      reasonCode,
    };

    this.state.set('loading');
    this.errorKey.set(null);

    this.priceOverridesService
      .applyPriceOverride(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.state.set('ready');
          this.router.navigate(['/app/order/cart', orderId]);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('ORDER.OVERRIDE.ERROR.APPLY');
        },
      });
  }
}
