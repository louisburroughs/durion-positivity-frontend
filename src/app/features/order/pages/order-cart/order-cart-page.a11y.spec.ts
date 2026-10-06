import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { draftCart, renderCart, typeAmount, walkInCart } from './order-cart-page.checkout.spec-helper';

/**
 * Genuine axe coverage of the RENDERED register cart (CAP:550 S10, AC 10, §5.7).
 * `scripts/a11y/smoke-routes.mjs` scans `/app/order/cart/:orderId` too, but it only sees the
 * un-hydrated index shell; this renders the Customer, Payment, Totals and Check out panels
 * through TestBed with the real en-US copy, in both themes.
 */
async function seriousViolations(root: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical');
}

describe('Order cart a11y (rendered DOM)', () => {
  let host: HTMLElement | null = null;

  afterEach(() => {
    host?.remove();
    document.documentElement.removeAttribute('data-theme');
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`reports no serious violation on a draft cart with blocked controls (${theme})`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const h = renderCart(draftCart);
      host = h.root;
      document.body.appendChild(host);
      typeAmount(h, 'cash', '50.00');
      await new Promise(resolve => setTimeout(resolve));

      expect(await seriousViolations(host)).toEqual([]);
    });

    it(`reports no serious violation on a walk-in cart with a refusal shown (${theme})`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const h = renderCart(walkInCart);
      host = h.root;
      document.body.appendChild(host);
      h.component.actionState.set('error');
      h.component.actionErrorKey.set('ORDER.CART.ERROR.WALK_IN_NOT_PAID_IN_FULL');
      h.component.actionErrorParams.set({ total: 86.02 });
      h.render();
      await new Promise(resolve => setTimeout(resolve));

      expect(await seriousViolations(host)).toEqual([]);
    });
  }

  it('groups the tender choice in a fieldset with a legend and labels both money inputs', () => {
    const h = renderCart(draftCart);
    const fieldset = h.q('order-cart-payment')!;
    expect(fieldset.tagName).toBe('FIELDSET');
    expect(fieldset.querySelector('legend')?.textContent?.trim()).toBeTruthy();
    for (const id of ['order-cart-cash', 'order-cart-card']) {
      const input = h.root.querySelector<HTMLInputElement>(`#${id}`)!;
      expect(input.getAttribute('inputmode')).toBe('decimal');
      expect(h.root.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
    expect(h.q('order-cart-taking-now')!.getAttribute('aria-live')).toBe('polite');
  });
});
