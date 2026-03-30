import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import {
  ApplyPriceOverrideRequest,
  PriceOverride,
} from '../../models/order.models';
import { OrderService } from '../../services/order.service';

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
  private readonly orderService = inject(OrderService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly overrides = signal<PriceOverride[]>([]);
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
              this.state.set('empty');
              return of<PriceOverride[]>([]);
            }

            this.state.set('loading');
            this.errorKey.set(null);
            return this.orderService.getOverridesByOrder(params.orderId);
          }),
        )
        .subscribe({
          next: overrides => {
            this.overrides.set(overrides);
            this.state.set(overrides.length > 0 ? 'ready' : 'empty');
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('ORDER.OVERRIDE.ERROR.LOAD');
          },
        });

      onCleanup(() => sub.unsubscribe());
    }, { allowSignalWrites: true });
  }

  applyOverride(request: ApplyPriceOverrideRequest): void {
    const orderId = this.orderId();
    const lineId = this.lineId();
    if (!orderId || !lineId) {
      this.state.set('error');
      this.errorKey.set('ORDER.OVERRIDE.ERROR.APPLY');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    this.orderService
      .applyPriceOverride(orderId, lineId, request)
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
