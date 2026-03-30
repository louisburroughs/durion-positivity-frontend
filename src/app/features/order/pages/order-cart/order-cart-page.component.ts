import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { AddItemRequest, CreateCartRequest, PosOrder } from '../../models/order.models';
import { OrderService } from '../../services/order.service';

@Component({
  selector: 'app-order-cart-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './order-cart-page.component.html',
  styleUrl: './order-cart-page.component.css',
})
export class OrderCartPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly order = signal<PosOrder | null>(null);
  readonly addingItem = signal(false);
  readonly orderId = signal<string | null>(null);

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.route.paramMap
        .pipe(
          map(paramMap => paramMap.get('orderId')),
          distinctUntilChanged(),
          switchMap(orderId => {
            this.orderId.set(orderId);
            this.errorKey.set(null);

            if (!orderId) {
              this.order.set(null);
              this.state.set('idle');
              return of<PosOrder | null>(null);
            }

            this.state.set('loading');
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
            this.errorKey.set('ORDER.CART.ERROR.LOAD');
          },
        });

      onCleanup(() => sub.unsubscribe());
    }, { allowSignalWrites: true });
  }

  createNewCart(request: CreateCartRequest): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.orderService
      .createCart(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: order => {
          this.state.set('ready');
          this.router.navigate(['/app/order/cart', order.orderId]);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('ORDER.CART.ERROR.CREATE');
        },
      });
  }

  addItem(sku: string, quantity: number): void {
    const orderId = this.orderId();
    if (!orderId) {
      this.state.set('error');
      this.errorKey.set('ORDER.CART.ERROR.ADD_ITEM');
      return;
    }

    const request: AddItemRequest = {
      skuCode: sku,
      quantity,
    };

    this.addingItem.set(true);
    this.errorKey.set(null);

    this.orderService
      .addItem(orderId, request)
      .pipe(
        switchMap(() => this.orderService.getOrder(orderId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: order => {
          this.order.set(order);
          this.state.set(order.lines.length > 0 ? 'ready' : 'empty');
          this.addingItem.set(false);
        },
        error: () => {
          this.addingItem.set(false);
          this.state.set('error');
          this.errorKey.set('ORDER.CART.ERROR.ADD_ITEM');
        },
      });
  }

  removeItem(lineId: string): void {
    const orderId = this.orderId();
    if (!orderId) {
      this.state.set('error');
      this.errorKey.set('ORDER.CART.ERROR.REMOVE_ITEM');
      return;
    }

    this.errorKey.set(null);
    this.state.set('loading');

    this.orderService
      .removeItem(orderId, lineId)
      .pipe(
        switchMap(() => this.orderService.getOrder(orderId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: order => {
          this.order.set(order);
          this.state.set(order.lines.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('ORDER.CART.ERROR.REMOVE_ITEM');
        },
      });
  }
}
