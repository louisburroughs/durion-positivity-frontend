import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AddItemRequest,
  ApiError,
  ApplyPriceOverrideRequest,
  CancelOrderRequest,
  CancellationResponse,
  CheckoutRequest,
  CreateCartRequest,
  OrderCancellationService,
  PriceOverrideDetail,
  PriceOverrideResult,
  PriceOverridesService,
  SalesOrderLineResponse,
  SalesOrderResponse,
  SalesOrdersService,
  SetCartCustomerRequest,
} from '@durion-sdk/order';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly salesOrdersApi = inject(SalesOrdersService);
  private readonly orderCancellationApi = inject(OrderCancellationService);
  private readonly priceOverridesApi = inject(PriceOverridesService);

  getOrder(orderId: string): Observable<SalesOrderResponse> {
    return this.salesOrdersApi.getOrder(orderId);
  }

  createCart(request: CreateCartRequest): Observable<SalesOrderResponse> {
    return this.salesOrdersApi.createCart(request);
  }

  addItem(orderId: string, request: AddItemRequest): Observable<SalesOrderLineResponse> {
    return this.salesOrdersApi.addCartItem(orderId, request);
  }

  removeItem(orderId: string, lineId: string): Observable<SalesOrderLineResponse> {
    return this.salesOrdersApi.removeCartItem(orderId, lineId);
  }

  /**
   * Names who a DRAFT cart's sale is for: a registered customer (`{ customerId }`) or the
   * business's Walk-in customer (`{ walkIn: true }`), an explicit choice only (CAP:550 S8, AW12).
   */
  setCartCustomer(orderId: string, request: SetCartCustomerRequest): Observable<SalesOrderResponse> {
    return this.salesOrdersApi.setCartCustomer(orderId, request);
  }

  /**
   * Freezes the cart into PENDING_PAYMENT (or COMPLETED on account). The caller owns the
   * `Idempotency-Key`: one per checkout attempt, reused only to retry that same attempt (§8.2).
   */
  checkout(orderId: string, idempotencyKey: string, request: CheckoutRequest): Observable<SalesOrderResponse> {
    return this.salesOrdersApi.checkoutOrder(orderId, idempotencyKey, request);
  }

  cancelOrder(orderId: string, request: CancelOrderRequest): Observable<CancellationResponse> {
    return this.orderCancellationApi.cancelOrder(orderId, request);
  }

  getOverridesByOrder(orderId: string): Observable<PriceOverrideDetail[]> {
    return this.priceOverridesApi.searchPriceOverrides(orderId);
  }

  applyPriceOverride(request: ApplyPriceOverrideRequest): Observable<PriceOverrideResult> {
    return this.priceOverridesApi.applyPriceOverride(request);
  }
}

/** A register cart action whose refusal {@link classifyCartActionError} explains. */
export type CartAction = 'SET_CUSTOMER' | 'CHECKOUT';

export interface CartActionFailure {
  /** Translation key for the inline alert. */
  readonly key: string;
  /** Interpolation params for {@link key}; only business values, never ids. */
  readonly params?: Readonly<Record<string, string | number>>;
  /** The cart changed under the cashier (ORDER_NOT_EDITABLE): re-read it. */
  readonly reread: boolean;
  /**
   * The server answered with a refusal (any 4xx), so the cart or request is now judged and a
   * next checkout attempt is a new attempt with a new Idempotency-Key. False for a network
   * failure or 5xx, whose retry reuses the key so the server replays rather than checks out twice
   * (§8.2).
   */
  readonly answered: boolean;
}

const WALK_IN_REASONS = new Set(['ON_ACCOUNT', 'DEPOSIT', 'WORKORDER_LINK']);
const GENERIC_KEY: Record<CartAction, string> = {
  SET_CUSTOMER: 'ORDER.CART.ERROR.SET_CUSTOMER',
  CHECKOUT: 'ORDER.CART.ERROR.CHECKOUT',
};

/** The grand total `fieldErrors[tenderedAmount]` names ("must cover the grand total 86.02"). */
function namedGrandTotal(message: string | undefined): number | null {
  const match = /(\d+(?:\.\d+)?)\s*$/.exec(message ?? '');
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Classifies a refused `setCartCustomer` or `checkoutOrder` by the backend's `ApiError.code`
 * (CAP:550 S8), falling back to the HTTP status and then to the action's generic key.
 * `permission` is the code the refused action needs, named in the 403 copy.
 */
export function classifyCartActionError(error: unknown, action: CartAction, permission: string): CartActionFailure {
  if (!(error instanceof HttpErrorResponse)) {
    return { key: GENERIC_KEY[action], reread: false, answered: false };
  }
  const answered = error.status >= 400 && error.status < 500;
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as Partial<ApiError>;
  const fieldErrors = Array.isArray(body.fieldErrors) ? body.fieldErrors : [];
  const field = (name: string) => fieldErrors.find(entry => entry?.field === name)?.message;

  switch (body.code) {
    case 'ORDER_CUSTOMER_REQUIRED':
      return { key: 'ORDER.CART.ERROR.CUSTOMER_REQUIRED', reread: false, answered };
    case 'ORDER_WALK_IN_NOT_ALLOWED': {
      const reason = field('walkIn');
      return {
        key: reason && WALK_IN_REASONS.has(reason)
          ? `ORDER.CART.ERROR.WALK_IN_NOT_ALLOWED_${reason}`
          : 'ORDER.CART.ERROR.WALK_IN_NOT_ALLOWED',
        reread: false,
        answered,
      };
    }
    case 'ORDER_WALK_IN_NOT_PAID_IN_FULL': {
      const total = namedGrandTotal(field('tenderedAmount'));
      return total === null
        ? { key: 'ORDER.CART.ERROR.WALK_IN_NOT_PAID_IN_FULL_NO_TOTAL', reread: false, answered }
        : { key: 'ORDER.CART.ERROR.WALK_IN_NOT_PAID_IN_FULL', params: { total }, reread: false, answered };
    }
    case 'ORDER_WALK_IN_UNAVAILABLE':
      return { key: 'ORDER.CART.ERROR.WALK_IN_UNAVAILABLE', reread: false, answered };
    case 'ORDER_INVALID_CUSTOMER':
      return { key: 'ORDER.CART.ERROR.INVALID_CUSTOMER', reread: false, answered };
    case 'ORDER_NOT_EDITABLE':
      return { key: 'ORDER.CART.ERROR.NOT_EDITABLE', reread: true, answered };
    case 'ORDER_UNPROCESSABLE':
      return { key: 'ORDER.CART.ERROR.UNPROCESSABLE', reread: false, answered };
    case 'ORDER_FORBIDDEN':
      return { key: 'ORDER.CART.ERROR.FORBIDDEN', params: { permission }, reread: false, answered };
  }
  if (error.status === 403) {
    return { key: 'ORDER.CART.ERROR.FORBIDDEN', params: { permission }, reread: false, answered };
  }
  return { key: GENERIC_KEY[action], reread: false, answered };
}
