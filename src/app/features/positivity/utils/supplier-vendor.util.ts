/**
 * Pure helpers for the vendor pages (CAP:550 S30, #469). No Angular, no HTTP.
 */
import { RemitTo, RemitToInput, VENDOR_NET_DAYS_MAX, VENDOR_NET_DAYS_MIN, VENDOR_NOTE_MIN } from '../models/supplier-vendor.models';

/** A translation key and its parameters. */
export interface VendorCopy {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export type PaymentTermsChoice =
  | { readonly kind: 'DUE_ON_RECEIPT' }
  | { readonly kind: 'NET'; readonly days: number };

const NET_TERMS = /^NET(\d{1,3})$/;

/** `DUE_ON_RECEIPT` or `NET<n>` (n 1–120); anything else is not a term this page can show. */
export function parsePaymentTerms(terms: string | null | undefined): PaymentTermsChoice | null {
  if (terms === 'DUE_ON_RECEIPT') return { kind: 'DUE_ON_RECEIPT' };
  const net = NET_TERMS.exec(terms ?? '');
  if (!net) return null;
  const days = Number(net[1]);
  return days >= VENDOR_NET_DAYS_MIN && days <= VENDOR_NET_DAYS_MAX ? { kind: 'NET', days } : null;
}

/** The wire form of a choice; the server validates it again. */
export function formatPaymentTerms(choice: PaymentTermsChoice): string {
  return choice.kind === 'DUE_ON_RECEIPT' ? 'DUE_ON_RECEIPT' : `NET${choice.days}`;
}

/** Translated terms: "Due on receipt", "Net 30"; unknown or missing terms show as not available. */
export function paymentTermsCopy(terms: string | null | undefined): VendorCopy {
  const parsed = parsePaymentTerms(terms);
  if (!parsed) return { key: 'COMMON.NOT_AVAILABLE' };
  return parsed.kind === 'DUE_ON_RECEIPT'
    ? { key: 'POSITIVITY.VENDORS.TERMS.DUE_ON_RECEIPT' }
    : { key: 'POSITIVITY.VENDORS.TERMS.NET', params: { days: parsed.days } };
}

/**
 * The only places "Add vendor" may return to (story item 4, ADR-0037): Bills to
 * pay, or one draft bill. Anything else — another route, an absolute URL,
 * `//host`, a query or fragment — is refused and the page falls back to the
 * new vendor's detail.
 */
const RETURN_TO = /^\/app\/accounting\/bills(\/drafts\/[0-9a-f-]{36})?$/;

export function safeVendorReturnTo(raw: string | null | undefined): string | null {
  return typeof raw === 'string' && RETURN_TO.test(raw) ? raw : null;
}

const UUID_SHAPED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A person named by the server (requester, decider, creator) as display text,
 * or null to show "not available": blank values and raw identities never
 * render (P8, ADR-0064 §5).
 */
export function displayActor(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed && !UUID_SHAPED.test(trimmed) ? trimmed : null;
}

/** A reason or note long enough for S23 (and, when given, short enough). */
export function noteValid(value: string, min = VENDOR_NOTE_MIN, max?: number): boolean {
  const length = value.trim().length;
  return length >= min && (max === undefined || length <= max);
}

/** The remit-to lines that carry text, in postal order, for a read-only block. */
export function remitToLines(remitTo: RemitTo | null): string[] {
  if (!remitTo) return [];
  const cityLine = [remitTo.city, remitTo.region, remitTo.postalCode].filter(part => !!part?.trim()).join(' ');
  return [remitTo.payeeName, remitTo.addressLine1, remitTo.addressLine2, cityLine, remitTo.countryCode]
    .map(line => line?.trim() ?? '')
    .filter(line => line !== '');
}

/** A remit-to form's values with blanks dropped; null when every field is blank (no remit-to). */
export function compactRemitTo(input: Readonly<Record<keyof RemitToInput, string>>): RemitToInput | null {
  const entries = Object.entries(input)
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value !== '');
  if (entries.length === 0) return null;
  const compact: Record<string, string> = {};
  for (const [key, value] of entries) {
    compact[key] = key === 'countryCode' ? value.toUpperCase() : value;
  }
  return compact as RemitToInput;
}
