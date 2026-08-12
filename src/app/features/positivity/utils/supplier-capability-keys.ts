/**
 * Known supplier key vocabularies.
 *
 * These are **display aids, never validation.** The supplier contract types
 * capability, protocol family, adapter version and exchange outcome as plain
 * free-form strings (ADR-0051 §3) precisely so a vendor's new norm needs no
 * frontend change, and there is no capability-registry endpoint to enumerate
 * them from. The lists below exist only so the UI can:
 *
 *   - render a "not configured" row for a capability that has no binding —
 *     without a roster there is nothing to render that row *for*;
 *   - offer combobox suggestions beside free-text entry;
 *   - use translated copy for keys it recognises.
 *
 * A key that is not listed here is still accepted on write, still listed when
 * bound, and still rendered (verbatim) when read. The backend owns the
 * judgement and rejects unknown keys itself.
 *
 * These live outside `models/` deliberately: per AGENTS.md that directory holds
 * interfaces only.
 *
 * ── Read these at access time, not at class-field-init time ──────────────────
 * Components expose them through getters rather than assigning them to a field
 * in the class body. The test bundler can hand a component module an import
 * binding that is still unresolved when its instance fields initialise, which
 * silently yields `undefined` — an empty `<datalist>` or an option-less
 * `<select>` with nothing to indicate anything went wrong. A getter resolves the
 * binding when the template actually reads it, by which point it is always
 * populated. The arrays are module constants, so each getter returns one stable
 * reference and `@for` has nothing to re-render.
 */
import {
  AuthConfigViewTypeEnum,
  EndpointBindingViewCaptureLevelEnum,
  VendorProfileViewRetryBackoffEnum,
} from '@durion-sdk/supplier';
import type {
  SupplierAuthType,
  SupplierCaptureLevel,
  SupplierRetryBackoff,
} from '../models/supplier-profile.models';

/** Canonical supplier capability keys this UI can name. */
export const KNOWN_SUPPLIER_CAPABILITIES: readonly string[] = [
  'ORDER',
  'ORDER_STATUS',
  'STOCK_REPORT',
  'PRICE_CATALOG',
  'PRODUCT_CATALOG',
  'DELIVERY_NOTE',
];

/** Protocol family keys suggested in the binding form. Not a closed set. */
export const KNOWN_SUPPLIER_PROTOCOL_FAMILIES: readonly string[] = [
  'EDIWHEEL_A25',
  'EDIWHEEL_C1',
  'EDIWHEEL_B',
  'EDIWHEEL_JSON',
  'MICHELIN_S2S',
];

/**
 * Adapter version keys shipped today.
 *
 * A key with no registered codec is accepted on write and then resolves to
 * `CAPABILITY_NOT_CONFIGURED` on every call, so it must match a codec exactly —
 * which is why these are offered as suggestions rather than left unhinted.
 */
export const KNOWN_SUPPLIER_PROTOCOL_VERSIONS: readonly string[] = [
  'A2_5',
  'B2_1',
  'B3_3',
  'B4_0',
  'C1_0',
  'C1_1',
  'C1_2',
  'S2S_V1',
];

/** Exchange outcome classifications this UI can name (ADR-0052 §5). */
export const KNOWN_EXCHANGE_OUTCOMES: readonly string[] = [
  'SUCCESS',
  'FAILURE',
  'TIMEOUT',
  'REJECTED',
  'CIRCUIT_OPEN',
];

/**
 * Closed enumerations, materialised once from the generated SDK enums.
 *
 * Unlike the open vocabularies above these really are closed sets: the contract
 * types them as enums, so a value outside them is not a key the backend has yet
 * to learn — it is a value the contract does not have.
 *
 * They are module constants rather than per-component `Object.values(...)` calls
 * so each is a single stable array reference: `@for` tracks by identity, and a
 * fresh array on every read would re-render the option list on every change
 * detection pass.
 */
export const SUPPLIER_CAPTURE_LEVELS: readonly SupplierCaptureLevel[] = Object.values(
  EndpointBindingViewCaptureLevelEnum,
);

export const SUPPLIER_AUTH_TYPES: readonly SupplierAuthType[] =
  Object.values(AuthConfigViewTypeEnum);

export const SUPPLIER_RETRY_BACKOFFS: readonly SupplierRetryBackoff[] = Object.values(
  VendorProfileViewRetryBackoffEnum,
);
