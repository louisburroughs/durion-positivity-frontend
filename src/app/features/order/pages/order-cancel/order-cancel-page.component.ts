import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, distinctUntilChanged, finalize, map, of, switchMap } from 'rxjs';
import {
  CancelOrderRequest,
  CancelOrderResult,
  PosOrder,
} from '../../models/order.models';
import { OrderService } from '../../services/order.service';

@Component({
  selector: 'app-order-cancel-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './order-cancel-page.component.html',
  styleUrl: './order-cancel-page.component.css',
})
export class OrderCancelPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly orderService = inject(OrderService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly order = signal<PosOrder | null>(null);
  readonly cancelResult = signal<CancelOrderResult | null>(null);
  readonly orderId = signal<string>('');
  readonly submitting = signal(false);

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.route.paramMap
        .pipe(
          map(paramMap => paramMap.get('orderId') ?? ''),
          distinctUntilChanged(),
          switchMap(orderId => {
            this.orderId.set(orderId);

            if (!orderId) {
              this.order.set(null);
              this.state.set('empty');
              return of<PosOrder | null>(null);
            }

            this.state.set('loading');
            this.errorKey.set(null);
            return this.orderService.getOrder(orderId);
          }),
        )
        .subscribe({
          next: order => {
            if (!order) {
              return;
            }

            this.order.set(order);
            this.state.set(order.lines.length > 0 ? 'ready' : 'empty');
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('ORDER.CANCEL.ERROR.LOAD');
          },
        });

      onCleanup(() => sub.unsubscribe());
    }, { allowSignalWrites: true });
  }

  confirmCancel(request: CancelOrderRequest): void {
    const orderId = this.orderId();
    if (!orderId) {
      this.state.set('error');
      this.errorKey.set('ORDER.CANCEL.ERROR.SUBMIT');
      return;
    }

    this.errorKey.set(null);
    this.submitting.set(true);

    this.orderService
      .cancelOrder(orderId, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: result => {
          this.cancelResult.set(result);
          this.state.set('ready');

          const existing = this.order();
          if (existing) {
            this.order.set({ ...existing, status: result.status });
          }
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('ORDER.CANCEL.ERROR.SUBMIT');
        },
      });
  }

}
