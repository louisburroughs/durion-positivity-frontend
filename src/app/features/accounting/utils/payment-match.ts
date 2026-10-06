import { UnappliedPaymentRow } from '@durion-sdk/accounting';
import { WaitingPayment } from '../models/customer-payments.models';
import { parseAmountInput } from './file-base64.util';

/**
 * Helpers shared by the home's to-do and the Customer payments page
 * (CAP:550 S4, S6). Money the page adds up is only what the person typed,
 * held in integer minor units (cents) so no float drift reaches a sum or a
 * comparison; a served amount is brought to the same scale HALF_UP, as the
 * backend rounds (P7).
 */

const text = (value: string | null | undefined): string | null => value?.trim() || null;
const amount = (value: number | null | undefined): number | null => (typeof value === 'number' ? value : null);

/** One unapplied-payments row as the home and the page hold it. */
export function toWaitingPayment(row: UnappliedPaymentRow): WaitingPayment {
  const suggestion = row.suggestion;
  return {
    paymentId: row.paymentId,
    customerId: row.customerId,
    customerName: text(row.customerDisplayName),
    customerReference: text(row.customerReference),
    sourceInvoiceId: text(row.sourceInvoiceId),
    sourceInvoiceNumber: text(row.sourceInvoiceNumber),
    method: text(row.paymentMethod),
    receivedAt: text(row.receivedAt),
    totalAmount: row.totalAmount,
    unappliedAmount: row.unappliedAmount,
    currency: text(row.currency),
    reasons: suggestion?.reasons ?? [],
    suggestedInvoices: (suggestion?.invoices ?? [])
      .filter(invoice => !!invoice.invoiceId)
      .map(invoice => ({
        invoiceId: invoice.invoiceId,
        invoiceNumber: text(invoice.invoiceNumber),
        balanceDue: invoice.balanceDue,
        suggestedAmount: invoice.suggestedAmount,
      })),
    suggestedTotal: suggestion?.suggestedTotal ?? 0,
    // Served null for walk-in (CASH) payments, whose remainder never becomes a credit.
    leftOver: amount(suggestion?.leftOver),
  };
}

/**
 * The walk-in (CASH) account never keeps a customer credit: S1 serves its
 * `leftOver` as null, so "Keep as credit" and "Refund" are never offered for it
 * (Accounting ruling on backend #2508).
 */
export function canKeepCredit(payment: WaitingPayment): boolean {
  return payment.leftOver !== null;
}

/**
 * "Invoice already paid — possible duplicate payment" (Accounting ruling on
 * backend #2503, case g): the payment names the invoice it was taken against,
 * but S1 did not suggest it, which it always does while that invoice is open
 * (`UnappliedPaymentSuggester` rule A). The payment stays for a person.
 */
export function isPossibleDuplicate(payment: WaitingPayment): boolean {
  return (
    !!(payment.sourceInvoiceId || payment.sourceInvoiceNumber) && !payment.reasons.includes('REMITTANCE_REFERENCE')
  );
}

const DECIMAL = /^([-+]?)(\d+)(?:\.(\d+))?$/;

/** A decimal string in minor units (cents), HALF_UP at the third decimal, like the backend's `setScale(2, HALF_UP)`. */
function decimalTextToMinor(value: string): number | null {
  const match = DECIMAL.exec(value);
  if (!match) return null;
  const [, sign, whole, fraction = ''] = match;
  const padded = `${fraction}000`;
  let minor = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) minor += 1;
  return sign === '-' ? -minor : minor;
}

/** A served amount at cent scale, HALF_UP. Non-finite input reads as null. */
export function toMinor(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const literal = String(value);
  return decimalTextToMinor(literal.includes('e') ? value.toFixed(6) : literal);
}

/** Minor units back to the decimal amount the API takes. */
export function fromMinor(minor: number): number {
  return minor / 100;
}

/** Why a typed amount cannot be sent. */
export type AmountError = 'INVALID' | 'PRECISION' | 'MINIMUM';

export interface TypedAmount {
  readonly minor: number | null;
  readonly error: AmountError | null;
}

/**
 * A typed amount (`parseAmountInput`: a comma decimal and spaces are fine) in
 * minor units: at least 0.01 and at most two decimals (§4.4 item 5, AD-010).
 */
export function parseTypedAmount(value: string): TypedAmount {
  const parsed = parseAmountInput(value);
  if (parsed === null || parsed < 0) return { minor: null, error: 'INVALID' };
  const literal = String(parsed);
  const decimals = literal.includes('.') ? literal.split('.')[1].length : 0;
  if (literal.includes('e') || decimals > 2) return { minor: null, error: 'PRECISION' };
  const minor = decimalTextToMinor(literal);
  if (minor === null) return { minor: null, error: 'INVALID' };
  if (minor < 1) return { minor: null, error: 'MINIMUM' };
  return { minor, error: null };
}

/** An amount pre-filled into an amount field: two decimals, no grouping, the locale's decimal sign. */
export function formatAmountInput(minor: number, locale: string): string {
  const fixed = (minor / 100).toFixed(2);
  return fixed.replace('.', decimalSeparator(locale));
}

function decimalSeparator(locale: string): string {
  try {
    return new Intl.NumberFormat(locale).formatToParts(1.5).find(part => part.type === 'decimal')?.value ?? '.';
  } catch {
    return '.';
  }
}

/** Served suggestion reasons (S1); literal so the i18n check sees every key. Anything else reads "Unknown". */
const PAYMENT_REASON_KEYS: Readonly<Record<string, string>> = {
  REMITTANCE_REFERENCE: 'ACCOUNTING.CUSTOMER_PAYMENTS.REASON.REMITTANCE_REFERENCE',
  SAME_CUSTOMER: 'ACCOUNTING.CUSTOMER_PAYMENTS.REASON.SAME_CUSTOMER',
  EXACT_TOTAL: 'ACCOUNTING.CUSTOMER_PAYMENTS.REASON.EXACT_TOTAL',
};

/** Served settlement methods (S1); anything else reads "Unknown". */
const METHOD_KEYS: Readonly<Record<string, string>> = {
  CASH: 'ACCOUNTING.CUSTOMER_PAYMENTS.METHOD.CASH',
  CARD: 'ACCOUNTING.CUSTOMER_PAYMENTS.METHOD.CARD',
  ON_ACCOUNT: 'ACCOUNTING.CUSTOMER_PAYMENTS.METHOD.ON_ACCOUNT',
  OTHER: 'ACCOUNTING.CUSTOMER_PAYMENTS.METHOD.OTHER',
};

export function paymentReasonKey(reason: string): string {
  return PAYMENT_REASON_KEYS[reason] ?? 'ACCOUNTING.CUSTOMER_PAYMENTS.REASON.UNKNOWN';
}

export function paymentMethodKey(method: string | null): string | null {
  if (!method) return null;
  return METHOD_KEYS[method] ?? 'ACCOUNTING.CUSTOMER_PAYMENTS.METHOD.UNKNOWN';
}
