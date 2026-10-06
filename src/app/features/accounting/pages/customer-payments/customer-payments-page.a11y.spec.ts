import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService, TranslationObject } from '@ngx-translate/core';
import axe from 'axe-core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { CustomerPaymentsPageComponent } from './customer-payments-page.component';
import { PaymentsMocks, applyResult, configurePayments, createPaymentsMocks } from './customer-payments-page.spec-helper';

/**
 * Genuine axe coverage of the RENDERED Customer payments page (§9.6, AC 12).
 * `scripts/a11y/smoke-routes.mjs` scans `/app/accounting/payments` too, but only
 * sees the un-hydrated shell; this renders the real DOM with the real en-US
 * copy: the list, a selected payment's match panel, the refund confirmation,
 * the result and the undo dialog.
 */
async function seriousViolations(root: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical');
}

describe('Customer payments a11y (rendered DOM)', () => {
  let host: HTMLElement | null = null;
  let mocks: PaymentsMocks;

  beforeEach(() => {
    mocks = createPaymentsMocks();
  });
  afterEach(() => {
    host?.remove();
  });

  function render(): ComponentFixture<CustomerPaymentsPageComponent> {
    configurePayments(mocks, { tenantId: signal<string | null>(null) });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS as TranslationObject);
    translate.use('en-US');
    const fixture = TestBed.createComponent(CustomerPaymentsPageComponent);
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    return fixture;
  }

  const settle = async (fixture: ComponentFixture<unknown>): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const click = async (fixture: ComponentFixture<unknown>, selector: string): Promise<void> => {
    (host!.querySelector(selector) as HTMLElement).click();
    await settle(fixture);
  };

  it('reports no serious violation with a payment selected, and keeps one h1', async () => {
    const fixture = render();
    await click(fixture, '[data-testid="payment-item"]');

    expect(host!.querySelectorAll('h1').length).toBe(1);
    expect(host!.querySelector('[data-testid="invoice-list"]')).not.toBeNull();
    expect(await seriousViolations(host!)).toEqual([]);
  });

  it('reports no serious violation with an over-application alert and a field error', async () => {
    const fixture = render();
    await click(fixture, '[data-testid="payment-item"]');
    const tick = host!.querySelector('li[data-invoice="INV-2026-01710"] [data-testid="invoice-tick"]') as HTMLInputElement;
    tick.checked = true;
    tick.dispatchEvent(new Event('change'));
    const field = host!.querySelector('li[data-invoice="INV-2026-01701"] [data-testid="invoice-amount"]') as HTMLInputElement;
    field.value = '999';
    field.dispatchEvent(new Event('input'));
    await settle(fixture);

    expect(host!.querySelector('[data-testid="over-alert"] p')).not.toBeNull();
    expect(host!.querySelector('[data-testid="amount-error"]')).not.toBeNull();
    expect(await seriousViolations(host!)).toEqual([]);
  });

  it('reports no serious violation in the refund confirmation and on the result', async () => {
    mocks.service.applyPayment.mockReturnValue(of(applyResult({ appliedAmount: 500, remainingAmount: 100 })));
    const fixture = render();
    await click(fixture, '[data-testid="payment-item"]');
    const field = host!.querySelector('li[data-invoice="INV-2026-01702"] [data-testid="invoice-amount"]') as HTMLInputElement;
    field.value = '250';
    field.dispatchEvent(new Event('input'));
    await settle(fixture);
    await click(fixture, '[data-testid="leftover-refund"]');
    await click(fixture, '[data-testid="apply"]');

    expect(host!.querySelector('dialog')?.matches(':modal')).toBe(true);
    expect(await seriousViolations(host!)).toEqual([]);

    await click(fixture, '[data-testid="refund-confirm"]');
    expect(host!.querySelector('[data-testid="match-result"] table caption')).not.toBeNull();
    expect(await seriousViolations(host!)).toEqual([]);
  });

  it('reports no serious violation in the undo dialog', async () => {
    const fixture = render();
    (host!.querySelector('[data-testid="automatic"]') as HTMLDetailsElement).open = true;
    await settle(fixture);
    await click(fixture, '[data-testid="undo"]');

    expect(host!.querySelector('dialog')?.matches(':modal')).toBe(true);
    expect(await seriousViolations(host!)).toEqual([]);
  });

  it('makes payment rows, invoice rows and primary actions at least 44px tall (§5.7)', async () => {
    const fixture = render();
    await click(fixture, '[data-testid="payment-item"]');

    const targets = [
      ...Array.from(host!.querySelectorAll<HTMLElement>('[data-testid="payment-item"]')),
      ...Array.from(host!.querySelectorAll<HTMLElement>('.match__invoice')),
      host!.querySelector<HTMLElement>('[data-testid="apply"]')!,
      host!.querySelector<HTMLElement>('[data-testid="start-over"]')!,
    ];
    for (const element of targets) expect(element.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });
});
