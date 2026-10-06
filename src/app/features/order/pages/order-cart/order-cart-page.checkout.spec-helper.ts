import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { CheckoutRequest, SalesOrderResponse, SetCartCustomerRequest } from '@durion-sdk/order';
import enUS from '../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../core/services/auth.service';
import { CUSTOMER_LOOKUP_SOURCE, CustomerLookupResult } from '../../../../shared/customer-lookup/customer-lookup.tokens';
import { OrderService } from '../../services/order.service';
import { OrderCartPageComponent } from './order-cart-page.component';

/** Every permission the register cart gates on (CAP:550 S10). */
export const ALL_CART_PERMISSIONS = [
  'order:order:view',
  'order:order:edit',
  'order:order:checkout',
  'order:order:charge_on_account',
  'invoice:payment:process',
] as const;

/** A DRAFT cart with one line, no customer yet, and a served grand total of 84.37. */
export const draftCart: SalesOrderResponse = {
  orderId: 'ord-1',
  orderNumber: 'SO-1001',
  status: 'DRAFT',
  subtotal: 78,
  taxTotal: 6.37,
  grandTotal: 84.37,
  lines: [{ orderLineId: 'line-1', itemSku: 'SKU-1', itemDescription: 'Brake pad', quantity: 1, unitPrice: 78 }],
};

export const walkInCart: SalesOrderResponse = {
  ...draftCart,
  customerId: 'b3f1c2d4-0000-7000-8000-000000000001',
  customerDisplayName: 'Walk-in',
  walkIn: true,
};

export const registeredCart: SalesOrderResponse = {
  ...draftCart,
  customerId: 'b3f1c2d4-0000-7000-8000-000000000002',
  customerDisplayName: 'Acme Tire Co',
  walkIn: false,
};

export interface CartMocks {
  getOrder: ReturnType<typeof vi.fn<(orderId: string) => Observable<SalesOrderResponse>>>;
  createCart: ReturnType<typeof vi.fn>;
  addItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
  setCartCustomer: ReturnType<
    typeof vi.fn<(orderId: string, request: SetCartCustomerRequest) => Observable<SalesOrderResponse>>
  >;
  checkout: ReturnType<
    typeof vi.fn<(orderId: string, key: string, request: CheckoutRequest) => Observable<SalesOrderResponse>>
  >;
  search: ReturnType<typeof vi.fn<(query: string) => Observable<CustomerLookupResult[]>>>;
}

export interface CartHarness {
  fixture: ComponentFixture<OrderCartPageComponent>;
  component: OrderCartPageComponent;
  root: HTMLElement;
  mocks: CartMocks;
  navigate: ReturnType<typeof vi.spyOn>;
  /** Re-renders after a signal change. */
  render(): void;
  q<T extends Element = HTMLElement>(testId: string): T | null;
}

/**
 * Renders the cart page over `cart` with the real en-US copy. `permissions` null models a
 * legacy token without perm_bits (every gate falls back open, ADR-0040 §6a.3).
 */
export function renderCart(
  cart: SalesOrderResponse,
  permissions: readonly string[] | null = ALL_CART_PERMISSIONS,
): CartHarness {
  const granted = signal<ReadonlySet<string> | null>(permissions ? new Set(permissions) : null);
  const mocks: CartMocks = {
    getOrder: vi.fn<(orderId: string) => Observable<SalesOrderResponse>>().mockReturnValue(of(cart)),
    createCart: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    setCartCustomer: vi.fn<(orderId: string, request: SetCartCustomerRequest) => Observable<SalesOrderResponse>>(),
    checkout: vi.fn<(orderId: string, key: string, request: CheckoutRequest) => Observable<SalesOrderResponse>>(),
    search: vi.fn<(query: string) => Observable<CustomerLookupResult[]>>().mockReturnValue(of([])),
  };

  TestBed.configureTestingModule({
    imports: [OrderCartPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: OrderService, useValue: mocks },
      {
        provide: AuthService,
        useValue: {
          currentUserClaims: () => ({ sub: 'clerk-1' }),
          permissionsKnown: () => granted() !== null,
          hasAnyPermission: (codes: readonly string[]) => codes.some(code => granted()?.has(code) ?? false),
        },
      },
      { provide: CUSTOMER_LOOKUP_SOURCE, useValue: { search: mocks.search, getById: () => of(null) } },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: new BehaviorSubject(convertToParamMap({ orderId: cart.orderId })).asObservable() },
      },
    ],
  });

  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('en-US', enUS as TranslationObject);
  translate.use('en-US');

  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(OrderCartPageComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;

  return {
    fixture,
    component: fixture.componentInstance,
    root,
    mocks,
    navigate,
    render: () => fixture.detectChanges(),
    q: <T extends Element = HTMLElement>(testId: string) => root.querySelector<T>(`[data-testid="${testId}"]`),
  };
}

/** Types an amount into one of the Pay now inputs the way a cashier would. */
export function typeAmount(harness: CartHarness, which: 'cash' | 'card', value: string): void {
  const input = harness.q<HTMLInputElement>(`order-cart-${which}`);
  if (!input) {
    throw new Error(`no ${which} input rendered`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
  harness.render();
}

export function text(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
