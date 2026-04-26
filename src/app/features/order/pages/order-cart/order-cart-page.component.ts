import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AddItemRequest, CreateCartRequest, SalesOrderResponse, SalesOrdersService } from '@durion-sdk/order';
import { Subscription, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';

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
  private readonly salesOrdersService = inject(SalesOrdersService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly order = signal<SalesOrderResponse | null>(null);
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
              return of<SalesOrderResponse | null>(null);
            }

            this.state.set('loading');
            return this.salesOrdersService.getOrder(orderId);
          }),
        )
        .subscribe({
          next: order => {
            if (!order) {
              return;
            }

            this.order.set(order);
            this.state.set((order.lines?.length ?? 0) > 0 ? 'ready' : 'empty');
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('ORDER.CART.ERROR.LOAD');
          },
        });

      onCleanup(() => sub.unsubscribe());
    }, { allowSignalWrites: true });
  }

  createNewCart(customerId?: string, vehicleId?: string): void {
    const request: CreateCartRequest = {
      clerkId: this.authService.currentUserClaims()?.sub ?? '',
      terminalId: 'DEFAULT',
      customerId,
      vehicleId,
    };

    this.state.set('loading');
    this.errorKey.set(null);

    this.salesOrdersService
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
      itemSku: sku,
      quantity,
    };

    this.addingItem.set(true);
    this.errorKey.set(null);

    this.salesOrdersService
      .addItem(orderId, request)
      .pipe(
        switchMap(() => this.salesOrdersService.getOrder(orderId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: order => {
          this.order.set(order);
          this.state.set((order.lines?.length ?? 0) > 0 ? 'ready' : 'empty');
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

    this.salesOrdersService
      .removeItem(orderId, lineId)
      .pipe(
        switchMap(() => this.salesOrdersService.getOrder(orderId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: order => {
          this.order.set(order);
          this.state.set((order.lines?.length ?? 0) > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('ORDER.CART.ERROR.REMOVE_ITEM');
        },
      });
  }
}
