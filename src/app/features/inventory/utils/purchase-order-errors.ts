/**
 * Purchase-order command failures (CAP:550, #514), classified for the
 * purchase-order form.
 *
 * Pure function — no Angular beyond the error type. The envelope `code` decides
 * first; an unknown code falls back to the HTTP status (ADR-0017). Messages are
 * translation keys only: the server's `message` text is never rendered.
 *
 * Codes pos-order answers on create and revise since S24 (backend #2648):
 *
 *   422 VENDOR_INACTIVE             the vendor is in pos-order's copy and INACTIVE
 *   503 VENDOR_REPLICATION_PENDING  the vendor is not in the copy (yet); Retry-After;
 *                                   nothing was written, so trying again is safe
 *   409 PURCHASE_ORDER_INVALID_STATE  a revision changed the vendor of an order past DRAFT
 *   404 PURCHASE_ORDER_NOT_FOUND
 *   400 VALIDATION_ERROR (fieldErrors) / PURCHASE_ORDER_BAD_REQUEST
 *   422 UOM_CONVERSION_UNDEFINED (a line's unit)
 *
 * Neither create nor revise carries an idempotency key, so a timeout or another
 * 5xx is an unknown outcome — the order may have been written — and its copy says
 * so, distinct from a refusal.
 */
import { HttpErrorResponse } from '@angular/common/http';

export type PurchaseOrderCommand = 'create' | 'revise';

/** The fields the form renders a message for. */
export type PurchaseOrderField = 'vendorId' | 'revisionReason' | 'deliveryDate' | 'notes' | 'lines';

export type PurchaseOrderFailureCode =
  | 'VENDOR_INACTIVE'
  | 'VENDOR_PENDING'
  | 'VENDOR_LOCKED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'LINES_REFUSED'
  | 'FORBIDDEN'
  | 'UNKNOWN_OUTCOME'
  | 'REFUSED';

export interface PurchaseOrderFailure {
  readonly code: PurchaseOrderFailureCode;
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
  /** Field → translated key, only for fields the form renders. */
  readonly fieldErrors: Readonly<Partial<Record<PurchaseOrderField, string>>>;
  /** The vendor list is stale: read it again. */
  readonly rereadVendors: boolean;
  /** The order changed under the form: read it again. */
  readonly rereadOrder: boolean;
}

const BASE = 'INVENTORY.PURCHASE_ORDERS.FORM.ERROR';

/** The message each rendered field shows. */
export const PURCHASE_ORDER_FIELD_KEYS: Readonly<Record<PurchaseOrderField, string>> = {
  vendorId: `${BASE}.FIELD.VENDOR`,
  revisionReason: `${BASE}.FIELD.REASON`,
  deliveryDate: `${BASE}.FIELD.DELIVERY_DATE`,
  notes: `${BASE}.FIELD.NOTES`,
  lines: `${BASE}.FIELD.LINES`,
};

/**
 * Payload path → the form field showing it. A create sends the delivery date as
 * `poDate` too; a revision sends the order's own `poDate`, which the form never
 * shows, so there it is not rendered.
 */
function fieldOf(path: string, command: PurchaseOrderCommand): PurchaseOrderField | null {
  if (path === 'vendorId') return 'vendorId';
  if (path === 'revisionReason') return command === 'revise' ? 'revisionReason' : null;
  if (path === 'expectedDeliveryDate') return 'deliveryDate';
  if (path === 'poDate') return command === 'create' ? 'deliveryDate' : null;
  if (path === 'comment') return 'notes';
  if (path === 'lines' || path.startsWith('lines[') || path.startsWith('lines.')) return 'lines';
  return null;
}

interface Envelope {
  readonly code: string | null;
  readonly fields: readonly string[];
  readonly retryAfter: number | null;
}

function envelope(error: HttpErrorResponse): Envelope {
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as {
    code?: unknown;
    fieldErrors?: unknown;
  };
  const fields = Array.isArray(body.fieldErrors)
    ? body.fieldErrors
        .map(entry => (entry && typeof entry === 'object' ? (entry as { field?: unknown }).field : null))
        .filter((field): field is string => typeof field === 'string')
    : [];
  const header = error.headers?.get('Retry-After') ?? null;
  const retryAfter = header !== null && /^\d+$/.test(header.trim()) ? Number(header.trim()) : null;
  return { code: typeof body.code === 'string' && body.code !== '' ? body.code : null, fields, retryAfter };
}

function failure(
  code: PurchaseOrderFailureCode,
  key: string,
  extra: Partial<Omit<PurchaseOrderFailure, 'code' | 'key'>> = {},
): PurchaseOrderFailure {
  return { code, key, params: {}, fieldErrors: {}, rereadVendors: false, rereadOrder: false, ...extra };
}

function unknownOutcome(command: PurchaseOrderCommand): PurchaseOrderFailure {
  return failure('UNKNOWN_OUTCOME', command === 'create' ? `${BASE}.UNKNOWN_CREATE` : `${BASE}.UNKNOWN_REVISE`);
}

/** A 400: "check the highlighted fields" only when a field is actually marked. */
function validation(fields: readonly string[], command: PurchaseOrderCommand): PurchaseOrderFailure {
  const fieldErrors: Partial<Record<PurchaseOrderField, string>> = {};
  for (const path of fields) {
    const field = fieldOf(path, command);
    if (field) fieldErrors[field] = PURCHASE_ORDER_FIELD_KEYS[field];
  }
  const marked = Object.keys(fieldErrors).length > 0;
  return failure('VALIDATION', marked ? `${BASE}.VALIDATION` : `${BASE}.VALIDATION_UNNAMED`, { fieldErrors });
}

/** Classify a failed create or revise. */
export function classifyPurchaseOrderError(error: unknown, command: PurchaseOrderCommand): PurchaseOrderFailure {
  if (!(error instanceof HttpErrorResponse)) return unknownOutcome(command);
  const { code, fields, retryAfter } = envelope(error);

  switch (code) {
    case 'VENDOR_INACTIVE':
      return failure('VENDOR_INACTIVE', `${BASE}.VENDOR_INACTIVE`, {
        fieldErrors: { vendorId: PURCHASE_ORDER_FIELD_KEYS.vendorId },
        rereadVendors: true,
      });
    case 'VENDOR_REPLICATION_PENDING':
      return retryAfter !== null
        ? failure('VENDOR_PENDING', `${BASE}.VENDOR_PENDING_AFTER`, { params: { seconds: retryAfter } })
        : failure('VENDOR_PENDING', `${BASE}.VENDOR_PENDING`);
    case 'PURCHASE_ORDER_INVALID_STATE':
      return failure('VENDOR_LOCKED', `${BASE}.VENDOR_LOCKED`, { rereadOrder: true });
    case 'PURCHASE_ORDER_NOT_FOUND':
      return failure('NOT_FOUND', `${BASE}.NOT_FOUND`);
    case 'PURCHASE_ORDER_BAD_REQUEST':
    case 'UOM_CONVERSION_UNDEFINED':
      return failure('LINES_REFUSED', `${BASE}.LINES_REFUSED`, { fieldErrors: { lines: PURCHASE_ORDER_FIELD_KEYS.lines } });
    case 'VALIDATION_ERROR':
      return validation(fields, command);
    default:
      break;
  }

  if (error.status === 0 || error.status >= 500) return unknownOutcome(command);
  if (error.status === 400) return validation(fields, command);
  if (error.status === 401 || error.status === 403) {
    return failure('FORBIDDEN', `${BASE}.FORBIDDEN`, { params: { permission: 'order:purchase_order:create' } });
  }
  if (error.status === 404) return failure('NOT_FOUND', `${BASE}.NOT_FOUND`);
  if (error.status === 409 && command === 'revise') return failure('VENDOR_LOCKED', `${BASE}.VENDOR_LOCKED`, { rereadOrder: true });
  return failure('REFUSED', `${BASE}.REFUSED`, { params: { status: error.status } });
}
