/**
 * Vendor master error classification (CAP:550 S30, #469), extending
 * `mapSupplierError` with S23's vendor codes (#2516) and #2621's reveal codes.
 *
 * Pure function — no Angular. The envelope `code` decides first; an unknown
 * code falls back to the HTTP status (ADR-0017). Field messages are translated
 * keys only: the server's per-field detail text is never rendered here, because
 * a tax-registration field's detail could echo what was typed (ADR-0072).
 */
import { HttpErrorResponse } from '@angular/common/http';
import { mapSupplierError } from './supplier-error.util';
import { VendorCopy } from './supplier-vendor.util';

export type VendorFailureCode =
  | 'NOT_FOUND'
  | 'NUMBER_TAKEN'
  | 'STALE'
  | 'REMIT_PENDING'
  | 'REMIT_NOT_PENDING'
  | 'SELF_APPROVAL'
  | 'INACTIVE'
  | 'VALIDATION'
  | 'JUSTIFICATION_REQUIRED'
  | 'TAX_REGISTRATION_NOT_FOUND'
  | 'TAX_ID_UNREADABLE'
  | 'FORBIDDEN'
  | 'RETRYABLE'
  | 'UNKNOWN';

export interface VendorFailure {
  readonly code: VendorFailureCode;
  /** The page or dialog message. */
  readonly message: VendorCopy;
  /** Payload field path → translated key for the inline message. */
  readonly fieldErrors: Readonly<Record<string, string>>;
  /** The server's state moved on (or may have): read the vendor again before anything else. */
  readonly reread: boolean;
}

const ERROR = 'POSITIVITY.VENDORS.ERROR';

/** Field paths S23 names in `fieldErrors`, mapped to their own message. */
const FIELD_KEYS: Readonly<Record<string, string>> = {
  legalName: `${ERROR}.FIELD.LEGAL_NAME`,
  displayName: `${ERROR}.FIELD.DISPLAY_NAME`,
  vendorNumber: `${ERROR}.FIELD.VENDOR_NUMBER`,
  defaultPaymentTerms: `${ERROR}.FIELD.PAYMENT_TERMS`,
  defaultCurrency: `${ERROR}.FIELD.CURRENCY`,
  reason: `${ERROR}.FIELD.NOTE`,
  note: `${ERROR}.FIELD.NOTE`,
  verificationNote: `${ERROR}.FIELD.NOTE`,
  'remitTo.remittanceEmail': `${ERROR}.FIELD.EMAIL`,
  'remitTo.countryCode': `${ERROR}.FIELD.COUNTRY`,
};

/** `taxRegistrations[2].number` and friends. */
const TAX_FIELD = /^taxRegistrations\[(\d+)\]\.(number|scheme|region|registrationId)$/;

const TAX_FIELD_KEYS: Readonly<Record<string, string>> = {
  number: `${ERROR}.FIELD.TAX_NUMBER`,
  scheme: `${ERROR}.FIELD.TAX_SCHEME`,
  region: `${ERROR}.FIELD.TAX_REGION`,
  registrationId: `${ERROR}.FIELD.TAX_REGISTRATION`,
};

function fieldKey(field: string): string {
  const tax = TAX_FIELD.exec(field);
  if (tax) return TAX_FIELD_KEYS[tax[2]];
  if (field.startsWith('remitTo.')) return FIELD_KEYS[field] ?? `${ERROR}.FIELD.REMIT_TO`;
  return FIELD_KEYS[field] ?? `${ERROR}.FIELD.INVALID`;
}

function envelopeCode(error: HttpErrorResponse): string | null {
  const body: unknown = error.error;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' && code !== '' ? code : null;
}

function failure(code: VendorFailureCode, message: VendorCopy, reread = false, fieldErrors: Record<string, string> = {}): VendorFailure {
  return { code, message, fieldErrors, reread };
}

/** The vendor fields Add vendor and Edit render (`app-vendor-fields`). */
export const VENDOR_FIELD_PATH = /^(legalName|displayName|defaultPaymentTerms|defaultCurrency|taxRegistrations\[\d+\]\.(number|scheme|region|registrationId))$/;
/** The remit-to fields Add vendor and Request a change render (`app-vendor-remit-to-fields`). */
export const REMIT_FIELD_PATH = /^remitTo\.(payeeName|addressLine1|addressLine2|city|region|postalCode|countryCode|remittanceEmail)$/;

/** How one surface classifies a failure. */
export interface VendorErrorOptions {
  /** The permission the operation enforces, named by a `403` (story "Codes classified"). Writes only. */
  readonly writePermission?: string;
  /**
   * The payload paths this surface renders a message for. A field error on any
   * other path is dropped, and when none is left the surface's own message
   * shows — never "some fields need attention" with nothing marked (review B1).
   */
  readonly renders?: (field: string) => boolean;
  /** Per-path message overrides for this surface (e.g. the reveal reason). */
  readonly fieldKeys?: Readonly<Record<string, string>>;
  /**
   * The message for a timeout or 5xx. Defaults to `fallbackKey`, so a read never
   * claims a change could not be confirmed; writes pass their own copy.
   */
  readonly retryableKey?: string;
  /** The message for a stale 409 `CONFLICT` (Edit's and the status dialog's differ). */
  readonly staleKey?: string;
}

/** Keep only the field errors the surface renders, with its overrides applied. */
function renderedOnly(fieldErrors: Record<string, string>, options: VendorErrorOptions): Record<string, string> {
  const rendered: Record<string, string> = {};
  for (const [field, key] of Object.entries(fieldErrors)) {
    if (options.renders && !options.renders(field)) continue;
    rendered[field] = options.fieldKeys?.[field] ?? key;
  }
  return rendered;
}

/** A field-level failure: the generic "check the fields" only when one is actually marked. */
function fieldFailure(code: VendorFailureCode, fieldErrors: Record<string, string>, fallbackKey: string, options: VendorErrorOptions): VendorFailure {
  const rendered = renderedOnly(fieldErrors, options);
  const marked = Object.keys(rendered).length > 0;
  return failure(code, { key: marked ? `${ERROR}.VALIDATION` : fallbackKey }, false, rendered);
}

/**
 * Classify a vendor-command or vendor-read failure.
 *
 * @param error        the caught error
 * @param fallbackKey  the surface's own message for an unclassified failure
 * @param options      what the surface renders and names; see `VendorErrorOptions`
 */
export function classifyVendorError(error: unknown, fallbackKey: string, options: VendorErrorOptions = {}): VendorFailure {
  if (!(error instanceof HttpErrorResponse)) {
    return failure('UNKNOWN', { key: fallbackKey });
  }
  const staleKey = options.staleKey ?? `${ERROR}.STALE`;

  switch (envelopeCode(error)) {
    case 'SUPPLIER_VENDOR_NOT_FOUND':
      return failure('NOT_FOUND', { key: `${ERROR}.NOT_FOUND` });
    case 'SUPPLIER_VENDOR_NUMBER_TAKEN':
      return fieldFailure('NUMBER_TAKEN', { vendorNumber: `${ERROR}.NUMBER_TAKEN` }, fallbackKey, options);
    case 'CONFLICT':
      return failure('STALE', { key: staleKey }, true);
    case 'SUPPLIER_VENDOR_REMIT_CHANGE_PENDING':
      return failure('REMIT_PENDING', { key: `${ERROR}.REMIT_PENDING` }, true);
    case 'SUPPLIER_VENDOR_REMIT_CHANGE_NOT_PENDING':
      return failure('REMIT_NOT_PENDING', { key: `${ERROR}.REMIT_NOT_PENDING` }, true);
    case 'SUPPLIER_VENDOR_REMIT_SELF_APPROVAL':
      return failure('SELF_APPROVAL', { key: 'POSITIVITY.VENDORS.REMIT.SELF_APPROVAL' });
    case 'SUPPLIER_VENDOR_INACTIVE':
      return failure('INACTIVE', { key: `${ERROR}.INACTIVE` }, true);
    case 'JUSTIFICATION_REQUIRED':
      return fieldFailure('JUSTIFICATION_REQUIRED', { reason: `${ERROR}.FIELD.NOTE` }, fallbackKey, options);
    case 'SUPPLIER_VENDOR_TAX_REGISTRATION_NOT_FOUND':
      return failure('TAX_REGISTRATION_NOT_FOUND', { key: `${ERROR}.TAX_REGISTRATION_NOT_FOUND` }, true);
    case 'SUPPLIER_VENDOR_TAX_ID_UNREADABLE':
      return failure('TAX_ID_UNREADABLE', { key: `${ERROR}.TAX_ID_UNREADABLE` });
    default:
      break;
  }

  // Unknown or absent code: the status decides, through the module's shared mapping.
  const outcome = mapSupplierError(error, fallbackKey);
  switch (outcome.kind) {
    case 'validation': {
      const fieldErrors: Record<string, string> = {};
      for (const field of Object.keys(outcome.fieldErrors)) fieldErrors[field] = fieldKey(field);
      return fieldFailure('VALIDATION', fieldErrors, fallbackKey, options);
    }
    case 'forbidden':
      return options.writePermission
        ? failure('FORBIDDEN', { key: `${ERROR}.FORBIDDEN_WRITE`, params: { permission: options.writePermission } })
        : failure('FORBIDDEN', { key: `${ERROR}.FORBIDDEN` });
    case 'conflict':
      return failure('STALE', { key: staleKey }, true);
    case 'retryable':
      return failure('RETRYABLE', { key: options.retryableKey ?? fallbackKey }, true);
    default:
      return error.status === 404
        ? failure('NOT_FOUND', { key: `${ERROR}.NOT_FOUND` })
        : failure('UNKNOWN', { key: `${ERROR}.STATUS`, params: { status: error.status } });
  }
}
