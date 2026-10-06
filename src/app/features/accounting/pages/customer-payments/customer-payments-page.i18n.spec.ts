/**
 * Customer payments copy guard — asserts the SENTENCES, not the keys
 * (ADR-0035 §8). The component specs run with no loader, so `| translate`
 * echoes the key; this file loads the real `src/assets/i18n/*.json` bundles and
 * checks what the copy claims, that every key the page builds at runtime exists
 * in all six locales with the same placeholders, and Label in Name per locale.
 */
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService, TranslationObject } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';
import qpsPloc from '../../../../../assets/i18n/qps-ploc.json';
import { PaymentMatchComponent } from '../../components/payment-match/payment-match.component';
import { paymentMethodKey, paymentReasonKey } from '../../utils/payment-match';
import { CustomerPaymentsPageComponent } from './customer-payments-page.component';
import { configurePayments, createPaymentsMocks, payment } from './customer-payments-page.spec-helper';

const LOCALES: readonly (readonly [string, unknown])[] = [
  ['en-US', enUS],
  ['es-US', esUS],
  ['es-MX', esMX],
  ['fr-CA', frCA],
  ['fr-FR', frFR],
  ['qps-ploc', qpsPloc],
];

function lookup(bundle: unknown, key: string): string | undefined {
  let node: unknown = bundle;
  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

function en(key: string): string {
  const value = lookup(enUS, key);
  if (value === undefined) throw new Error(`en-US.json has no string at ${key}`);
  return value;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(match => match[1]).sort();
}

function keysUnder(bundle: unknown, prefix: string): string[] {
  const out: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      out.push(path);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) walk(child, `${path}.${key}`);
  };
  let root: unknown = bundle;
  for (const segment of prefix.split('.')) root = (root as Record<string, unknown>)?.[segment];
  walk(root, prefix);
  return out.sort();
}

/** Keys built at runtime rather than written literally in a template. */
const RUNTIME_KEYS: readonly string[] = [
  ...['REMITTANCE_REFERENCE', 'SAME_CUSTOMER', 'EXACT_TOTAL', 'SOMETHING_NEW'].map(paymentReasonKey),
  ...(['CASH', 'CARD', 'ON_ACCOUNT', 'OTHER', 'WIRE'].map(paymentMethodKey) as string[]),
  'ACCOUNTING.SHELL.NAV.CUSTOMER_PAYMENTS',
  'ACCOUNTING.SHELL.NAV.CUSTOMER_PAYMENTS_TERM',
  'ACCOUNTING.HOME.ACTION.MATCH_CUSTOMER_PAYMENTS',
  'ACCOUNTING.LANDING.CARD.CUSTOMER_PAYMENTS.TITLE',
  'ACCOUNTING.LANDING.CARD.CUSTOMER_PAYMENTS.DESCRIPTION',
  'SITEMAP.LABEL.PAYMENTS',
];

describe('Customer payments copy (real bundles)', () => {
  it.each(LOCALES)('%s carries every ACCOUNTING.CUSTOMER_PAYMENTS key with en-US placeholders', (_name, bundle) => {
    const expected = keysUnder(enUS, 'ACCOUNTING.CUSTOMER_PAYMENTS');
    expect(expected.length).toBeGreaterThan(100);
    expect(keysUnder(bundle, 'ACCOUNTING.CUSTOMER_PAYMENTS')).toEqual(expected);
    for (const key of expected) {
      const value = lookup(bundle, key);
      expect(value?.trim(), `${key} is empty`).toBeTruthy();
      expect(placeholders(value!), key).toEqual(placeholders(en(key)));
    }
  });

  it.each(LOCALES)('%s resolves every key built at runtime, and no longer carries the old Apply payment page', (_name, bundle) => {
    for (const key of RUNTIME_KEYS) expect(lookup(bundle, key), key).toBeDefined();
    expect((bundle as { ACCOUNTING: Record<string, unknown> }).ACCOUNTING['PAYMENT_APPLY']).toBeUndefined();
    expect(lookup(bundle, 'ACCOUNTING.LANDING.CARD.PAYMENT_APPLY.TITLE')).toBeUndefined();
  });

  it('words the header and the empty list as the story does (PROPOSED 2, 4)', () => {
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.OVERLINE')).toBe('Accounting · Money owed to you');
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.TITLE')).toBe('Customer payments');
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.STANDFIRST')).toBe(
      "Payments taken at the counter skip this list: they're matched as soon as they're taken and show under Matched automatically.",
    );
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.LIST.EMPTY')).toBe('No payments are waiting to be matched');
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.LIST.SUGGESTED')).toBe('Suggested match');
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.SUMMARY')).toBe('Matched automatically this week');
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.FILTER_LABEL')).toBe('Search other invoices');
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.START_OVER')).toBe('Start over');
  });

  it('labels case-g payments with the Accounting ruling’s words', () => {
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.DUPLICATE.BADGE')).toBe('Invoice already paid — possible duplicate payment');
  });

  it('puts the consequence, the over-application and the refund warning as the story words them (P4)', () => {
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.CONSEQUENCE')).toBe(
      'This lowers what {{customer}} owes on {{count}} invoices. A mistake is fixed with a reversal, recorded as a new entry.',
    );
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.PREVIEW.OVER_APPLIED')).toBe(
      "You're applying {{amount}} more than this payment. Untick an invoice or lower an amount.",
    );
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.REFUND.BODY')).toBe(
      "{{customer}} gets {{amount}} back. Money leaves the shop; this can't be undone here.",
    );
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.APPLY')).toBe('Apply {{applying}}');
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.MATCH.APPLY_AND_KEEP')).toBe('Apply {{applying}} and keep {{leftOver}} as credit');
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.PREVIEW.APPLYING')).toBe('Applying to {{count}} invoices');
  });

  it('says what the alternate flows say (story "Alternate and error flows")', () => {
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_CHANGED')).toMatch(/^This payment changed since you opened it/);
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_CONFLICT')).toBe('One of these invoices can no longer take a payment.');
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_UNKNOWN')).toMatch(/^We couldn't confirm the payment was applied/);
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.ERROR.WHOLE_REQUEST')).toBe(
      'This match was made together with others; reverse it from the payment.',
    );
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.REFUND_FAILED')).toContain('kept as credit');
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.RESULT.RETRY_REFUND')).toBe('Try the refund again');
  });

  it('names a refusal by its permission, never as a connection problem (ADR-0064 §6)', () => {
    for (const key of [
      'ACCOUNTING.CUSTOMER_PAYMENTS.REGION.DENIED',
      'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.APPLY_FORBIDDEN',
      'ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.REFUND_FORBIDDEN',
      'ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.ERROR.FORBIDDEN',
    ]) {
      expect(en(key)).toContain('{{permission}}');
    }
    expect(en('ACCOUNTING.CUSTOMER_PAYMENTS.ERROR.LOAD').toLowerCase()).not.toContain('permission');
  });

  it('labels reasons with the story’s words, Unknown for anything else', () => {
    expect(en(paymentReasonKey('SAME_CUSTOMER'))).toBe('Same customer');
    expect(en(paymentReasonKey('EXACT_TOTAL'))).toBe('Adds up exactly');
    expect(en(paymentReasonKey('REMITTANCE_REFERENCE'))).toBe('Remittance reference');
    expect(en(paymentReasonKey('NEW'))).toBe('Unknown');
  });

  it('keeps plain words first and the accountant’s term as the suffix (P1)', () => {
    expect(en('ACCOUNTING.SHELL.NAV.CUSTOMER_PAYMENTS')).toBe('Customer payments');
    expect(en('ACCOUNTING.SHELL.NAV.CUSTOMER_PAYMENTS_TERM')).toBe('accounts receivable');
  });
});

describe('Label in Name per shipped locale (ADR-0029 §8.6)', () => {
  it.each(LOCALES)('%s: Undo’s accessible name starts with its visible text; Apply and the amount fields carry their own text', async (name, bundle) => {
    TestBed.resetTestingModule();
    configurePayments(createPaymentsMocks(), { tenantId: signal<string | null>(null) });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(name, bundle as TranslationObject);
    translate.use(name);

    const page = TestBed.createComponent(CustomerPaymentsPageComponent);
    page.detectChanges();
    await page.whenStable();
    const root = page.nativeElement as HTMLElement;
    const undo = root.querySelector<HTMLButtonElement>('[data-testid="undo"]')!;
    const visible = undo.querySelector('span:not(.sr-only)')!.textContent!.trim();
    expect(visible).toBe(lookup(bundle, 'ACCOUNTING.CUSTOMER_PAYMENTS.AUTOMATIC.UNDO'));
    // No aria-label: the name is the visible text followed by the invoice and customer.
    expect(undo.hasAttribute('aria-label')).toBe(false);
    expect(undo.textContent!.replace(/\s+/g, ' ').trim().startsWith(visible)).toBe(true);
    expect(undo.textContent).toContain('INV-2026-01690');

    const match = TestBed.createComponent(PaymentMatchComponent);
    match.componentRef.setInput('payment', payment());
    match.detectChanges();
    await match.whenStable();
    const panel = match.nativeElement as HTMLElement;
    const apply = panel.querySelector<HTMLButtonElement>('[data-testid="apply"]')!;
    expect(apply.hasAttribute('aria-label')).toBe(false);
    expect(apply.textContent!.trim()).toContain('600');
    const field = panel.querySelector<HTMLInputElement>('[data-testid="invoice-amount"]')!;
    const label = panel.querySelector(`label[for="${field.id}"]`)!.textContent!.trim();
    expect(label).toContain('INV-2026-01701');
    expect(field.hasAttribute('aria-label')).toBe(false);
  });
});
