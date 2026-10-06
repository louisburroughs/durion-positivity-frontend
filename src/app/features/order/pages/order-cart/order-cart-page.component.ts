import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  AddItemRequest,
  CheckoutRequest,
  CreateCartRequest,
  SalesOrderResponse,
  SetCartCustomerRequest,
} from '@durion-sdk/order';
import { Subscription, distinctUntilChanged, filter, map, of, switchMap } from 'rxjs';
import { BILLING_SECTION, ORDER_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { CartAction, CartActionFailure, OrderService, classifyCartActionError } from '../../services/order.service';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { CustomerLookupComponent } from '../../../../shared/customer-lookup/customer-lookup.component';

/** How the cashier is settling: cash and card taken now, or the customer's account. */
export type TenderMode = 'PAY_NOW' | 'ON_ACCOUNT';

/** Why Check out is blocked, or null when it may be pressed. */
export type CheckoutBlock = 'NO_CUSTOMER' | 'WALK_IN_NOT_COVERED' | null;

/**
 * A typed money amount as integer cents, or 0 when blank or not a non-negative number.
 * Accepts a decimal comma as well as a point, since fr/es cashiers type one. A preview only
 * (P7): the server decides whether the tender covers its own total.
 */
export function moneyToCents(text: string): number {
  const normalised = text.trim().replace(',', '.');
  if (!normalised) {
    return 0;
  }
  const value = Number(normalised);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : 0;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

@Component({
  selector: 'app-order-cart-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe, MoneyPipe, ReactiveFormsModule, RouterLink, CustomerLookupComponent],
  templateUrl: './order-cart-page.component.html',
  styleUrl: './order-cart-page.component.css',
})
export class OrderCartPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly order = signal<SalesOrderResponse | null>(null);
  readonly addingItem = signal(false);
  readonly orderId = signal<string | null>(null);

  // ── Customer, payment and checkout (CAP:550 S10) ─────────────────────────────────────────
  /**
   * Sub-state of a customer or checkout action, separate from the page `state` so a refused
   * action never blanks the cart (the cart stays visible beside the alert).
   */
  readonly actionState = signal<'idle' | 'submitting' | 'error'>('idle');
  readonly actionErrorKey = signal<string | null>(null);
  readonly actionErrorParams = signal<Readonly<Record<string, string | number>> | null>(null);

  readonly tenderMode = signal<TenderMode>('PAY_NOW');
  readonly cashText = signal('');
  readonly cardText = signal('');
  readonly customerControl = new FormControl<string>('', { nonNullable: true });

  private readonly actionAlert = viewChild<ElementRef<HTMLElement>>('actionAlert');

  /**
   * The Idempotency-Key of the current checkout attempt: created on the first press, reused when
   * that same attempt is retried after a network failure (the server then replays rather than
   * checks out twice), and dropped once the server answers or the cart changes (§8.2).
   */
  private checkoutKey: string | null = null;

  /**
   * Shared coordinator for every write to {@link order}: the route load and each re-read after
   * an action take a ticket, and only the latest ticket may apply, so a slower earlier read never
   * overwrites a newer one (ADR-0063 §2).
   */
  private orderSeq = 0;

  /** ADR-0040 §6a: each control and its handler gate on its own code; unknown perm_bits falls back open. */
  readonly canSetCustomer = computed(() => this.permitted(ORDER_SECTION.setCustomer));
  readonly canCheckout = computed(() => this.permitted(ORDER_SECTION.checkout));
  readonly canChargeOnAccount = computed(() => this.permitted(ORDER_SECTION.chargeOnAccount));
  readonly canTakePayment = computed(() => this.permitted(BILLING_SECTION.paymentProcess));

  readonly isDraft = computed(() => this.order()?.status === 'DRAFT');
  readonly isWalkIn = computed(() => this.order()?.walkIn === true);
  readonly hasCustomer = computed(() => this.isWalkIn() || !!this.order()?.customerId);
  readonly submitting = computed(() => this.actionState() === 'submitting');

  /** Client preview of the cash and card typed (P7), in cents. */
  readonly typedCents = computed(() => moneyToCents(this.cashText()) + moneyToCents(this.cardText()));
  readonly typedAmount = computed(() => this.typedCents() / 100);
  readonly grandTotalCents = computed(() => {
    const total = this.order()?.grandTotal;
    return total === undefined || total === null ? null : Math.round(total * 100);
  });

  /** Pay now is chosen and the typed amounts cover the served grand total. */
  readonly tenderCoversTotal = computed(() => {
    const total = this.grandTotalCents();
    return this.tenderMode() === 'PAY_NOW' && total !== null && this.typedCents() >= total;
  });

  /** Walk-in is enabled only for a paid-in-full sale on an editable cart (§4.4 item 2). */
  readonly walkInEnabled = computed(
    () => this.canSetCustomer() && this.isDraft() && this.tenderCoversTotal() && !this.submitting(),
  );

  readonly checkoutBlock = computed<CheckoutBlock>(() => {
    if (!this.hasCustomer()) {
      return 'NO_CUSTOMER';
    }
    if (this.isWalkIn() && !this.tenderCoversTotal()) {
      return 'WALK_IN_NOT_COVERED';
    }
    return null;
  });

  readonly checkoutEnabled = computed(
    () => this.canCheckout() && this.isDraft() && this.checkoutBlock() === null && !this.submitting(),
  );

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = this.route.paramMap
        .pipe(
          map(paramMap => paramMap.get('orderId')),
          distinctUntilChanged(),
          switchMap(orderId => {
            this.orderId.set(orderId);
            this.errorKey.set(null);
            this.resetAction();
            const seq = ++this.orderSeq;

            if (!orderId) {
              this.order.set(null);
              this.state.set('idle');
              return of<{ order: SalesOrderResponse | null; seq: number }>({ order: null, seq });
            }

            this.state.set('loading');
            return this.orderService.getOrder(orderId).pipe(map(order => ({ order, seq })));
          }),
        )
        .subscribe({
          next: ({ order, seq }) => {
            if (!order) {
              return;
            }
            this.applyOrder(order, seq);
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('ORDER.CART.ERROR.LOAD');
          },
        });

      onCleanup(() => sub.unsubscribe());
    }, { allowSignalWrites: true });

    this.customerControl.valueChanges
      .pipe(
        filter(customerId => !!customerId),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(customerId => {
        this.customerControl.setValue('', { emitEvent: false });
        this.chooseCustomer(customerId);
      });
  }

  createNewCart(vehicleId?: string): void {
    const request: CreateCartRequest = {
      clerkId: this.authService.currentUserClaims()?.sub ?? '',
      terminalId: 'DEFAULT',
      vehicleId,
    };

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
      itemSku: sku,
      quantity,
    };

    this.addingItem.set(true);
    this.errorKey.set(null);
    this.checkoutKey = null;
    const seq = ++this.orderSeq;

    this.orderService
      .addItem(orderId, request)
      .pipe(
        switchMap(() => this.orderService.getOrder(orderId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: order => {
          this.addingItem.set(false);
          this.applyOrder(order, seq);
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
    this.checkoutKey = null;
    const seq = ++this.orderSeq;

    this.orderService
      .removeItem(orderId, lineId)
      .pipe(
        switchMap(() => this.orderService.getOrder(orderId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: order => this.applyOrder(order, seq),
        error: () => {
          this.state.set('error');
          this.errorKey.set('ORDER.CART.ERROR.REMOVE_ITEM');
        },
      });
  }

  setTenderMode(mode: TenderMode): void {
    if (mode === 'ON_ACCOUNT' && (!this.canChargeOnAccount() || this.isWalkIn())) {
      return;
    }
    this.tenderMode.set(mode);
  }

  /** The account option stays focusable while blocked (P5); a click on it must not select it. */
  onAccountOptionClick(event: Event): void {
    if (!this.canChargeOnAccount() || this.isWalkIn()) {
      event.preventDefault();
    }
  }

  /** Puts a registered customer, picked in the lookup, on the cart. */
  chooseCustomer(customerId: string): void {
    if (!this.canSetCustomer() || !this.isDraft() || this.submitting() || !customerId) {
      return;
    }
    this.setCustomer({ customerId }, 'SET_CUSTOMER');
  }

  /** The explicit Walk-in choice; the page never selects it by itself. */
  chooseWalkIn(): void {
    if (!this.walkInEnabled()) {
      return;
    }
    this.setCustomer({ walkIn: true }, 'SET_CUSTOMER');
  }

  checkout(): void {
    const orderId = this.orderId();
    if (!orderId || !this.checkoutEnabled()) {
      return;
    }
    const onAccount = this.tenderMode() === 'ON_ACCOUNT';
    if (onAccount && (!this.canChargeOnAccount() || this.isWalkIn())) {
      return;
    }

    this.checkoutKey ??= newIdempotencyKey();
    const key = this.checkoutKey;
    const request: CheckoutRequest = onAccount
      ? { tenderType: 'ON_ACCOUNT' }
      : { tenderType: 'DEFAULT', tenderedAmount: this.typedAmount() };
    const permission = onAccount ? ORDER_SECTION.chargeOnAccount[0] : ORDER_SECTION.checkout[0];

    this.beginAction();
    const seq = ++this.orderSeq;

    this.orderService
      .checkout(orderId, key, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: order => {
          this.checkoutKey = null;
          this.actionState.set('idle');
          if (order.status === 'PENDING_PAYMENT' && order.invoiceId && this.canTakePayment()) {
            this.router.navigate(['/app/billing/invoices', order.invoiceId, 'payment-capture']);
            return;
          }
          this.applyOrder(order, seq);
        },
        error: (error: unknown) => {
          const failure = classifyCartActionError(error, 'CHECKOUT', permission);
          if (failure.answered) {
            // The server judged this attempt; the next press is a new attempt (§8.2).
            this.checkoutKey = null;
          }
          this.failAction(failure, orderId);
        },
      });
  }

  private setCustomer(request: SetCartCustomerRequest, action: CartAction): void {
    const orderId = this.orderId();
    if (!orderId) {
      return;
    }
    this.beginAction();
    this.checkoutKey = null;
    const seq = ++this.orderSeq;

    this.orderService
      .setCartCustomer(orderId, request)
      .pipe(
        switchMap(() => this.orderService.getOrder(orderId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: order => {
          this.actionState.set('idle');
          this.applyOrder(order, seq);
        },
        error: (error: unknown) =>
          this.failAction(classifyCartActionError(error, action, ORDER_SECTION.setCustomer[0]), orderId),
      });
  }

  private beginAction(): void {
    this.actionState.set('submitting');
    this.actionErrorKey.set(null);
    this.actionErrorParams.set(null);
  }

  /** ADR-0031 §1: the action state moves before its error key; the cart stays on screen. */
  private failAction(failure: CartActionFailure, orderId: string): void {
    this.actionState.set('error');
    this.actionErrorKey.set(failure.key);
    this.actionErrorParams.set(failure.params ?? null);
    setTimeout(() => this.actionAlert()?.nativeElement.focus());
    if (failure.reread) {
      this.reread(orderId);
    }
  }

  private reread(orderId: string): void {
    const seq = ++this.orderSeq;
    this.orderService
      .getOrder(orderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: order => this.applyOrder(order, seq),
        error: () => undefined, // keep the cart already on screen beside the refusal
      });
  }

  private applyOrder(order: SalesOrderResponse, seq: number): void {
    if (seq !== this.orderSeq) {
      return;
    }
    this.order.set(order);
    if (order.walkIn && this.tenderMode() === 'ON_ACCOUNT') {
      this.tenderMode.set('PAY_NOW');
    }
    this.state.set((order.lines?.length ?? 0) > 0 ? 'ready' : 'empty');
  }

  private resetAction(): void {
    this.actionState.set('idle');
    this.actionErrorKey.set(null);
    this.actionErrorParams.set(null);
    this.checkoutKey = null;
    this.cashText.set('');
    this.cardText.set('');
    this.tenderMode.set('PAY_NOW');
  }

  private permitted(codes: readonly string[]): boolean {
    return !this.authService.permissionsKnown() || this.authService.hasAnyPermission(codes);
  }
}
