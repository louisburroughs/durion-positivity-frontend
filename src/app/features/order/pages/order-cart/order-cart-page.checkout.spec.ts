import { formatCurrency, getCurrencySymbol } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { TranslateService, TranslationObject } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { ApiError, SalesOrderResponse } from '@durion-sdk/order';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import { CustomerLookupComponent } from '../../../../shared/customer-lookup/customer-lookup.component';
import { moneyToCents } from './order-cart-page.component';
import {
  ALL_CART_PERMISSIONS,
  draftCart,
  registeredCart,
  renderCart,
  text,
  typeAmount,
  walkInCart,
} from './order-cart-page.checkout.spec-helper';

const CART = enUS.ORDER.CART;
const usd = (value: number): string => formatCurrency(value, 'en-US', getCurrencySymbol('USD', 'wide', 'en-US'), 'USD', '1.2-2');
const without = (...codes: string[]): string[] => ALL_CART_PERMISSIONS.filter(code => !codes.includes(code));

function refusal(status: number, code: string, fieldErrors?: ApiError['fieldErrors']): HttpErrorResponse {
  const body: ApiError = { code, message: 'refused', status, correlationId: 'corr-1', timestamp: '2026-10-06T12:00:00Z', fieldErrors };
  return new HttpErrorResponse({ status, error: body });
}

const checkedOut: SalesOrderResponse = {
  ...walkInCart,
  status: 'PENDING_PAYMENT',
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-2001',
};

describe('OrderCartPageComponent — customer, payment and checkout (CAP:550 S10)', () => {
  afterEach(() => vi.useRealTimers());

  describe('AC1: Check out needs a customer', () => {
    it('is visible but aria-disabled with the reason, and its handler sends nothing', () => {
      const h = renderCart(draftCart);
      const button = h.q<HTMLButtonElement>('order-cart-checkout')!;

      expect(button).not.toBeNull();
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(text(h.q('order-cart-checkout-reason'))).toBe(CART.CHECKOUT.REASON_NO_CUSTOMER);
      expect(button.getAttribute('aria-describedby')).toContain('order-cart-checkout-reason');

      button.click();
      h.component.checkout();
      expect(h.mocks.checkout).not.toHaveBeenCalled();
    });

    it('shows the consequence sentence before the action (P4)', () => {
      const h = renderCart(registeredCart);
      expect(text(h.root.querySelector('#order-cart-checkout-consequence'))).toBe(CART.CHECKOUT.CONSEQUENCE);
      expect(h.q('order-cart-checkout')!.getAttribute('aria-disabled')).toBeNull();
    });
  });

  describe('AC2: Walk-in is enabled only when the typed tender covers the served total', () => {
    it('stays aria-disabled at 80.00 of 84.37 and enables at 84.37, sending {walkIn: true} once', () => {
      const h = renderCart(draftCart);
      typeAmount(h, 'cash', '50.00');
      typeAmount(h, 'card', '30.00');

      const walkIn = h.q<HTMLButtonElement>('order-cart-walk-in')!;
      expect(walkIn.getAttribute('aria-disabled')).toBe('true');
      expect(text(h.q('order-cart-walk-in-reason'))).toBe(CART.CUSTOMER.WALK_IN_REASON);
      expect(walkIn.getAttribute('aria-describedby')).toContain('order-cart-walk-in-reason');
      expect(text(h.q('order-cart-taking-now'))).toBe(`Taking now: ${usd(80)} of ${usd(84.37)}`);

      walkIn.click();
      expect(h.mocks.setCartCustomer).not.toHaveBeenCalled();

      typeAmount(h, 'card', '34.37');
      expect(walkIn.getAttribute('aria-disabled')).toBeNull();
      expect(h.q('order-cart-walk-in-reason')).toBeNull();

      const pending = new Subject<SalesOrderResponse>();
      h.mocks.setCartCustomer.mockReturnValue(pending);
      walkIn.click();
      h.render();
      walkIn.click();
      expect(h.mocks.setCartCustomer).toHaveBeenCalledTimes(1);
      expect(h.mocks.setCartCustomer).toHaveBeenCalledWith('ord-1', { walkIn: true });
    });

    const table: ReadonlyArray<[string, 'PAY_NOW' | 'ON_ACCOUNT', string, string, number | undefined, string[] | null, boolean]> = [
      ['exact cover', 'PAY_NOW', '84.37', '', 84.37, ALL_CART_PERMISSIONS as unknown as string[], true],
      ['over cover', 'PAY_NOW', '100', '', 84.37, ALL_CART_PERMISSIONS as unknown as string[], true],
      ['one cent short', 'PAY_NOW', '84.36', '', 84.37, ALL_CART_PERMISSIONS as unknown as string[], false],
      ['decimal comma', 'PAY_NOW', '84,37', '', 84.37, ALL_CART_PERMISSIONS as unknown as string[], true],
      ['nothing typed', 'PAY_NOW', '', '', 84.37, ALL_CART_PERMISSIONS as unknown as string[], false],
      ['on account', 'ON_ACCOUNT', '84.37', '', 84.37, ALL_CART_PERMISSIONS as unknown as string[], false],
      ['no served total', 'PAY_NOW', '84.37', '', undefined, ALL_CART_PERMISSIONS as unknown as string[], false],
      ['no order:order:edit', 'PAY_NOW', '84.37', '', 84.37, without('order:order:edit'), false],
      ['legacy token', 'PAY_NOW', '84.37', '', 84.37, null, true],
    ];
    for (const [name, mode, cash, card, total, permissions, enabled] of table) {
      it(`enablement: ${name} → ${enabled ? 'enabled' : 'disabled'}`, () => {
        const h = renderCart({ ...draftCart, grandTotal: total }, permissions);
        h.component.tenderMode.set(mode);
        h.component.cashText.set(cash);
        h.component.cardText.set(card);
        expect(h.component.walkInEnabled()).toBe(enabled);

        h.mocks.setCartCustomer.mockReturnValue(of(walkInCart));
        h.component.chooseWalkIn();
        expect(h.mocks.setCartCustomer).toHaveBeenCalledTimes(enabled ? 1 : 0);
      });
    }

    it('previews money in cents, never trusting a malformed amount', () => {
      expect(moneyToCents('84.37')).toBe(8437);
      expect(moneyToCents(' 34,37 ')).toBe(3437);
      expect(moneyToCents('-5')).toBe(0);
      expect(moneyToCents('abc')).toBe(0);
      expect(moneyToCents('')).toBe(0);
    });
  });

  describe('AC3: walk-in checkout', () => {
    it('sends DEFAULT with the typed tender and hands off to payment capture', () => {
      const h = renderCart(walkInCart);
      typeAmount(h, 'cash', '50');
      typeAmount(h, 'card', '34.37');
      h.mocks.checkout.mockReturnValue(of(checkedOut));

      h.q<HTMLButtonElement>('order-cart-checkout')!.click();

      expect(h.mocks.checkout).toHaveBeenCalledTimes(1);
      const [orderId, key, body] = h.mocks.checkout.mock.calls[0];
      expect(orderId).toBe('ord-1');
      expect(key).toMatch(/^[0-9a-f-]{36}$/);
      expect(body).toEqual({ tenderType: 'DEFAULT', tenderedAmount: 84.37 });
      expect(h.navigate).toHaveBeenCalledWith(['/app/billing/invoices', 'inv-1', 'payment-capture']);
    });

    it('without invoice:payment:process, stays and names the next step instead of navigating', () => {
      const h = renderCart(walkInCart, without('invoice:payment:process'));
      typeAmount(h, 'cash', '84.37');
      h.mocks.checkout.mockReturnValue(of(checkedOut));

      h.q<HTMLButtonElement>('order-cart-checkout')!.click();
      h.render();

      expect(h.navigate).not.toHaveBeenCalled();
      expect(text(h.q('order-cart-outcome'))).toBe(
        'Order SO-1001 is checked out. Invoice INV-2001 is ready for payment.',
      );
      expect(h.q('order-cart-take-payment')).toBeNull();
    });

    it('blocks a walk-in checkout until the typed amounts cover the total', () => {
      const h = renderCart(walkInCart);
      typeAmount(h, 'cash', '80');
      expect(h.q('order-cart-checkout')!.getAttribute('aria-disabled')).toBe('true');
      expect(text(h.q('order-cart-checkout-reason'))).toBe(CART.CUSTOMER.WALK_IN_REASON);
      h.component.checkout();
      expect(h.mocks.checkout).not.toHaveBeenCalled();
    });

    it('charges a registered customer on account with ON_ACCOUNT and shows the completion', () => {
      const h = renderCart(registeredCart);
      h.q<HTMLInputElement>('order-cart-on-account')!.click();
      h.render();
      expect(h.component.tenderMode()).toBe('ON_ACCOUNT');
      h.mocks.checkout.mockReturnValue(
        of({ ...registeredCart, status: 'COMPLETED', invoiceId: 'inv-9', invoiceNumber: 'INV-2009' }),
      );

      h.q<HTMLButtonElement>('order-cart-checkout')!.click();
      h.render();

      expect(h.mocks.checkout.mock.calls[0][2]).toEqual({ tenderType: 'ON_ACCOUNT' });
      expect(h.navigate).not.toHaveBeenCalled();
      expect(text(h.q('order-cart-outcome'))).toContain('INV-2009');
      expect(h.q('order-cart-checkout')).toBeNull();
    });
  });

  describe('AC4: the server refuses an underpaid walk-in', () => {
    it('shows the named total, keeps the typed amounts and the cart, and renews the key', () => {
      vi.useFakeTimers();
      const h = renderCart(walkInCart);
      document.body.appendChild(h.root);
      typeAmount(h, 'cash', '84.37');
      h.mocks.checkout.mockReturnValueOnce(
        throwError(() =>
          refusal(422, 'ORDER_WALK_IN_NOT_PAID_IN_FULL', [
            { field: 'tenderedAmount', message: 'must cover the grand total 86.02' },
          ]),
        ),
      );

      h.q<HTMLButtonElement>('order-cart-checkout')!.click();
      h.render();
      vi.runAllTimers();

      const alert = h.q('order-cart-action-alert')!;
      expect(alert.getAttribute('role')).toBe('alert');
      expect(text(alert)).toContain(usd(86.02));
      expect(document.activeElement).toBe(alert);
      expect(h.q<HTMLInputElement>('order-cart-cash')!.value).toBe('84.37');
      expect(h.component.state()).toBe('ready');
      expect(h.root.querySelector('.order-cart__table')).not.toBeNull();

      typeAmount(h, 'cash', '86.02');
      h.mocks.checkout.mockReturnValueOnce(of(checkedOut));
      h.q<HTMLButtonElement>('order-cart-checkout')!.click();

      const [first, second] = h.mocks.checkout.mock.calls.map(call => call[1]);
      expect(second).not.toBe(first);
      expect(h.mocks.checkout.mock.calls[1][2]).toEqual({ tenderType: 'DEFAULT', tenderedAmount: 86.02 });
      h.root.remove();
    });

    it('moves the action state to error before setting the key (ADR-0031 §1)', () => {
      const h = renderCart(registeredCart);
      h.mocks.checkout.mockReturnValue(throwError(() => refusal(422, 'ORDER_UNPROCESSABLE')));
      const stateSpy = vi.spyOn(h.component.actionState, 'set');
      const keySpy = vi.spyOn(h.component.actionErrorKey, 'set');

      h.component.checkout();

      const stateCall = stateSpy.mock.calls.findIndex(call => call[0] === 'error');
      const keyCall = keySpy.mock.calls.findIndex(call => call[0] === 'ORDER.CART.ERROR.UNPROCESSABLE');
      expect(stateSpy.mock.invocationCallOrder[stateCall]).toBeLessThan(keySpy.mock.invocationCallOrder[keyCall]);
      expect(h.component.state()).toBe('ready');
    });

    it('re-reads the cart on ORDER_NOT_EDITABLE', () => {
      const h = renderCart(registeredCart);
      h.mocks.checkout.mockReturnValue(throwError(() => refusal(409, 'ORDER_NOT_EDITABLE')));
      h.mocks.getOrder.mockReturnValue(of({ ...registeredCart, status: 'PENDING_PAYMENT', invoiceId: 'inv-3' }));

      h.component.checkout();
      h.render();

      expect(h.mocks.getOrder).toHaveBeenCalledTimes(2);
      expect(h.component.order()?.status).toBe('PENDING_PAYMENT');
      expect(text(h.q('order-cart-action-alert'))).toBe(CART.ERROR.NOT_EDITABLE);
    });

    it('shows the story message when Walk-in is not set up, never inventing one', () => {
      const h = renderCart(draftCart);
      h.component.cashText.set('84.37');
      h.mocks.setCartCustomer.mockReturnValue(throwError(() => refusal(422, 'ORDER_WALK_IN_UNAVAILABLE')));

      h.component.chooseWalkIn();
      h.render();

      expect(text(h.q('order-cart-action-alert'))).toBe(CART.ERROR.WALK_IN_UNAVAILABLE);
    });
  });

  describe('AC5: idempotency', () => {
    it('keeps one checkout in flight when pressed twice quickly', () => {
      const h = renderCart(registeredCart);
      const pending = new Subject<SalesOrderResponse>();
      h.mocks.checkout.mockReturnValue(pending);
      const button = h.q<HTMLButtonElement>('order-cart-checkout')!;

      button.click();
      h.render();
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('aria-busy')).toBe('true');
      button.click();

      expect(h.mocks.checkout).toHaveBeenCalledTimes(1);
    });

    it('reuses the same Idempotency-Key when retrying after a network failure', () => {
      const h = renderCart(registeredCart);
      const first = new Subject<SalesOrderResponse>();
      h.mocks.checkout.mockReturnValueOnce(first).mockReturnValueOnce(of(checkedOut));

      h.component.checkout();
      first.error(new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' }));
      h.render();
      h.component.checkout();

      const keys = h.mocks.checkout.mock.calls.map(call => call[1]);
      expect(keys).toHaveLength(2);
      expect(keys[1]).toBe(keys[0]);
    });

    it('starts a new attempt after the cart changes', () => {
      const h = renderCart(registeredCart);
      h.mocks.checkout.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      h.mocks.setCartCustomer.mockReturnValue(of(registeredCart));

      h.component.checkout();
      h.component.chooseCustomer('b3f1c2d4-0000-7000-8000-000000000003');
      h.component.checkout();

      const keys = h.mocks.checkout.mock.calls.map(call => call[1]);
      expect(keys[1]).not.toBe(keys[0]);
    });
  });

  describe('AC6: the account option', () => {
    it('is not rendered without order:order:charge_on_account, and the handler refuses', () => {
      const h = renderCart(registeredCart, without('order:order:charge_on_account'));
      expect(h.q('order-cart-on-account')).toBeNull();
      h.component.setTenderMode('ON_ACCOUNT');
      expect(h.component.tenderMode()).toBe('PAY_NOW');
    });

    it('is aria-disabled with the reason on a walk-in cart, and cannot be selected', () => {
      const h = renderCart(walkInCart);
      const option = h.q<HTMLInputElement>('order-cart-on-account')!;
      expect(option.getAttribute('aria-disabled')).toBe('true');
      expect(text(h.root.querySelector('#order-cart-on-account-reason'))).toBe(CART.PAYMENT.ON_ACCOUNT_WALK_IN_REASON);

      option.click();
      h.render();
      expect(option.checked).toBe(false);
      expect(h.component.tenderMode()).toBe('PAY_NOW');
    });
  });

  describe('AC7: the register lookup never offers the house account', () => {
    it('opts the shared lookup into excludeHouseAccounts', () => {
      const h = renderCart(draftCart);
      const lookup = h.fixture.debugElement.query(By.directive(CustomerLookupComponent));
      expect(lookup).not.toBeNull();
      expect((lookup.componentInstance as CustomerLookupComponent).excludeHouseAccounts).toBe(true);
    });

    it('puts a picked customer on the cart and shows them by name', () => {
      const h = renderCart(draftCart);
      h.mocks.setCartCustomer.mockReturnValue(of(registeredCart));
      h.mocks.getOrder.mockReturnValue(of(registeredCart));
      const lookup = h.fixture.debugElement.query(By.directive(CustomerLookupComponent))
        .componentInstance as CustomerLookupComponent;

      lookup.select({ partyId: 'b3f1c2d4-0000-7000-8000-000000000002', legalName: 'Acme Tire Co' });
      h.render();

      expect(h.mocks.setCartCustomer).toHaveBeenCalledWith('ord-1', {
        customerId: 'b3f1c2d4-0000-7000-8000-000000000002',
      });
      expect(text(h.q('order-cart-chosen-customer'))).toBe('Acme Tire Co');
    });
  });

  describe('AC8: the chosen customer by name, never an id', () => {
    it('shows the display name of a registered customer', () => {
      const h = renderCart(registeredCart);
      expect(text(h.q('order-cart-chosen-customer'))).toBe('Acme Tire Co');
      expect(text(h.q('order-cart-customer'))).not.toContain(registeredCart.customerId!);
    });

    it('shows the localised Walk-in customer, not the house account name', () => {
      const h = renderCart(walkInCart);
      expect(text(h.q('order-cart-chosen-customer'))).toBe(CART.CUSTOMER.WALK_IN_NAME);
      expect(text(h.q('order-cart-customer'))).not.toContain(walkInCart.customerId!);
    });

    it('says no customer yet before a choice', () => {
      const h = renderCart(draftCart);
      expect(text(h.q('order-cart-chosen-customer'))).toBe(CART.CUSTOMER.NONE);
    });

    it('falls back to not-available rather than an id when the name is missing', () => {
      const h = renderCart({ ...registeredCart, customerDisplayName: undefined });
      expect(text(h.q('order-cart-chosen-customer'))).toBe(enUS.COMMON.NOT_AVAILABLE);
    });
  });

  describe('permission gates (ADR-0040 §6a)', () => {
    it('hides the lookup and Walk-in without order:order:edit, and the handlers refuse', () => {
      const h = renderCart(draftCart, without('order:order:edit'));
      expect(h.fixture.debugElement.query(By.directive(CustomerLookupComponent))).toBeNull();
      expect(h.q('order-cart-walk-in')).toBeNull();
      expect(text(h.q('order-cart-chosen-customer'))).toBe(CART.CUSTOMER.NONE);

      h.component.chooseCustomer('b3f1c2d4-0000-7000-8000-000000000002');
      h.component.cashText.set('100');
      h.component.chooseWalkIn();
      expect(h.mocks.setCartCustomer).not.toHaveBeenCalled();
    });

    it('hides Check out without order:order:checkout, and the handler refuses', () => {
      const h = renderCart(registeredCart, without('order:order:checkout'));
      expect(h.q('order-cart-checkout')).toBeNull();
      h.component.checkout();
      expect(h.mocks.checkout).not.toHaveBeenCalled();
    });

    it('splits the two authorities: edit without checkout still sets the customer', () => {
      const h = renderCart(draftCart, ['order:order:view', 'order:order:edit']);
      h.mocks.setCartCustomer.mockReturnValue(of(registeredCart));
      expect(h.q('order-cart-checkout')).toBeNull();
      h.component.chooseCustomer('b3f1c2d4-0000-7000-8000-000000000002');
      expect(h.mocks.setCartCustomer).toHaveBeenCalledTimes(1);
    });

    it('a legacy token without perm_bits keeps every control', () => {
      const h = renderCart(draftCart, null);
      expect(h.q('order-cart-walk-in')).not.toBeNull();
      expect(h.q('order-cart-checkout')).not.toBeNull();
      expect(h.q('order-cart-on-account')).not.toBeNull();
    });
  });

  describe('read-only states', () => {
    it('a PENDING_PAYMENT deep link is read-only and links to payment capture', () => {
      const h = renderCart({ ...registeredCart, status: 'PENDING_PAYMENT', invoiceId: 'inv-1', invoiceNumber: 'INV-2001' });
      expect(h.fixture.debugElement.query(By.directive(CustomerLookupComponent))).toBeNull();
      expect(h.q('order-cart-walk-in')).toBeNull();
      expect(h.q('order-cart-payment')).toBeNull();
      expect(h.q('order-cart-checkout')).toBeNull();
      expect(h.q<HTMLAnchorElement>('order-cart-take-payment')!.getAttribute('href'))
        .toBe('/app/billing/invoices/inv-1/payment-capture');
      expect(text(h.q('order-cart-take-payment'))).toBe(CART.CHECKOUT.TAKE_PAYMENT);
      h.component.chooseCustomer('b3f1c2d4-0000-7000-8000-000000000002');
      expect(h.mocks.setCartCustomer).not.toHaveBeenCalled();
    });
  });

  describe('totals from the server', () => {
    it('renders tax and grand total as served, with the stale-tax note', () => {
      const h = renderCart({ ...registeredCart, taxStale: true });
      expect(text(h.q('order-cart-tax'))).toBe(usd(6.37));
      expect(text(h.q('order-cart-grand-total'))).toBe(usd(84.37));
      expect(text(h.q('order-cart-tax-stale'))).toBe(CART.SUMMARY.TAX_STALE);
    });
  });

  describe('sequence guard (ADR-0063)', () => {
    it('drops a slower re-read after setCartCustomer once a newer read has landed', () => {
      const h = renderCart(draftCart);
      const slowRead = new Subject<SalesOrderResponse>();
      h.mocks.setCartCustomer.mockReturnValue(of(registeredCart));
      h.mocks.getOrder.mockReturnValueOnce(slowRead);
      h.component.chooseCustomer('b3f1c2d4-0000-7000-8000-000000000002');

      // A newer cart read (after adding an item) lands first.
      h.mocks.addItem.mockReturnValue(of({}));
      h.mocks.getOrder.mockReturnValueOnce(of({ ...registeredCart, grandTotal: 99 }));
      h.component.addItem('SKU-2', 1);
      expect(h.component.order()?.grandTotal).toBe(99);

      slowRead.next({ ...registeredCart, grandTotal: 84.37 });
      slowRead.complete();
      expect(h.component.order()?.grandTotal).toBe(99);
    });
  });

  describe('AC10: Label in Name holds in every shipped locale', () => {
    const bundles = { 'en-US': enUS, 'fr-CA': frCA, 'fr-FR': frFR, 'es-MX': esMX, 'es-US': esUS } as const;
    for (const [locale, bundle] of Object.entries(bundles)) {
      it(`${locale}: Walk-in and Check out carry their visible text as their name`, () => {
        const h = renderCart(draftCart);
        const translate = TestBed.inject(TranslateService);
        translate.setTranslation(locale, bundle as TranslationObject);
        translate.use(locale);
        h.render();

        const walkIn = h.q('order-cart-walk-in')!;
        const checkout = h.q('order-cart-checkout')!;
        expect(walkIn.hasAttribute('aria-label')).toBe(false);
        expect(checkout.hasAttribute('aria-label')).toBe(false);
        expect(text(walkIn)).toBe(bundle.ORDER.CART.CUSTOMER.WALK_IN_ACTION);
        expect(text(checkout)).toBe(bundle.ORDER.CART.CHECKOUT.ACTION);
      });
    }
  });
});
