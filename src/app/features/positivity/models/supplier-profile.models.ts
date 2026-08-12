/**
 * Supplier (positivity) vendor-profile domain model.
 *
 * Interfaces only — no logic, no Angular imports (AGENTS.md file-structure rule).
 * These shapes mirror `@durion-sdk/supplier` (ADR-0050/ADR-0051) but keep the
 * frontend's own naming and required-ness: almost every SDK view field is
 * optional, and that optionality is resolved once in the service mapping layer
 * rather than being pushed into every template.
 *
 * Vocabulary is canonical per ADR-0050 §5: **billing** and **delivery**. Vendor
 * wire vocabulary (`billTo`/`shipTo`, `BuyerParty`/`Consignee`) lives only inside
 * backend adapters and must never appear in this layer or in the UI.
 *
 * Credential-bearing fields are **write-only reference strings** (ADR-0050 §4),
 * e.g. `env:MICHELIN_EDI_USER`. `AuthConfigView` carries no credential material
 * at all by shape, so the read model below has no `*Ref` property to render.
 */
import type {
  AuthConfigViewTypeEnum,
  CommercialAccountViewRoleEnum,
  EndpointBindingViewCaptureLevelEnum,
  VendorProfileViewRetryBackoffEnum,
  VendorProfileViewSourceOfTruthEnum,
} from '@durion-sdk/supplier';

/**
 * Who owns a profile's configuration (ADR-0050 §6). Every mutation is rejected
 * with `409` while this is `YAML`.
 */
export type SupplierSourceOfTruth = `${VendorProfileViewSourceOfTruthEnum}`;

/** Supported auth config shapes (ADR-0050 §4), driven off the generated enum. */
export type SupplierAuthType = `${AuthConfigViewTypeEnum}`;

/** Canonical commercial-account roles (ADR-0050 §5), driven off the generated enum. */
export type SupplierAccountRole = `${CommercialAccountViewRoleEnum}`;

/** Retry backoff strategies offered by the profile contract. */
export type SupplierRetryBackoff = `${VendorProfileViewRetryBackoffEnum}`;

/** Per-binding payload capture level (ADR-0050 §7). */
export type SupplierCaptureLevel = `${EndpointBindingViewCaptureLevelEnum}`;

/**
 * Protocol family key of the adapter to use.
 *
 * Deliberately an **open** string, not a closed union: the contract types this as
 * a free-form key so a newly registered adapter family needs no frontend change.
 * Unknown keys are rejected server-side with `SUPPLIER_UNKNOWN_PROTOCOL_FAMILY`;
 * the frontend must not pre-reject a value the backend would have accepted.
 */
export type SupplierProtocolFamily = string;

/**
 * Canonical supplier capability key.
 *
 * Also an open string, for the same reason. See
 * `utils/supplier-capability-keys.ts` for the display aid used to render
 * unbound capabilities.
 */
export type SupplierCapability = string;

/** Row shape for the profile list. */
export interface VendorProfileSummary {
  readonly vendorProfileId: string;
  /** Human-readable configuration alias (ADR-0050 §1) — an attribute, never an identifier. */
  supplierRef: string;
  displayName: string;
  enabled: boolean;
  /** True when the profile resolves its sandbox overlay instead of production endpoints. */
  sandbox: boolean;
  sourceOfTruth: SupplierSourceOfTruth;
}

/** Full profile record returned by the detail endpoint. */
export interface VendorProfile extends VendorProfileSummary {
  /** Default connect timeout in **milliseconds** — contract name, not an abbreviation. */
  connectTimeoutMillis?: number;
  /** Default read timeout in **milliseconds**. */
  readTimeoutMillis?: number;
  /** Pre-send retry budget. Only pre-send failures are retried. */
  maxRetries?: number;
  /** Base URL the bindings use while `sandbox` is set (ADR-0050 §2). */
  sandboxBaseUrlOverride?: string;
  retryBackoff?: SupplierRetryBackoff;
}

/** Create/update payload — server-generated fields are omitted entirely (ADR-0034). */
export interface VendorProfileRequest {
  supplierRef: string;
  displayName: string;
  enabled: boolean;
  sandbox: boolean;
  connectTimeoutMillis?: number;
  readTimeoutMillis?: number;
  maxRetries?: number;
  sandboxBaseUrlOverride?: string;
  retryBackoff?: SupplierRetryBackoff;
}

/**
 * An auth configuration attached to a profile, as **read**.
 *
 * The contract's read model carries no secret reference field of any kind — not
 * even a masked one — so there is nothing here for a template to leak. The
 * `apiKeyHeader` below is the header *name*, which is ordinary configuration.
 */
export interface SupplierAuthConfig {
  readonly authConfigId: string;
  /** Config name, unique within the profile. Bindings reference it by this name. */
  authRef: string;
  authType: SupplierAuthType;
  /** Header NAME the API key is sent in — configuration data, not a secret. */
  apiKeyHeader?: string;
}

/**
 * Create/update payload for an auth config (ADR-0034: no server-generated fields).
 *
 * Every `*Ref` is a scheme-prefixed reference such as `env:MICHELIN_EDI_USER`
 * resolved at call time. Plaintext credentials are rejected by the backend, and
 * references are write-only: they never come back in any response.
 */
export interface SupplierAuthConfigRequest {
  authRef: string;
  authType: SupplierAuthType;
  /** BASIC_PLUS_APIKEY only. */
  usernameRef?: string;
  /** BASIC_PLUS_APIKEY only. */
  passwordRef?: string;
  /** BASIC_PLUS_APIKEY only. */
  apiKeyRef?: string;
  /** Header name for the API key — plain configuration, not a reference. */
  apiKeyHeader?: string;
  /** OAUTH2_CLIENT_CREDENTIALS only. A reference, not the URL itself. */
  tokenUrlRef?: string;
  /** OAUTH2_CLIENT_CREDENTIALS only. */
  clientIdRef?: string;
  /** OAUTH2_CLIENT_CREDENTIALS only. */
  clientSecretRef?: string;
  /** BEARER only. */
  bearerTokenRef?: string;
}

/** Invoicing/settlement account for the profile (ADR-0050 §5). */
export interface SupplierBillingAccount {
  readonly accountId: string;
  accountNumber: string;
  agencyCode?: string;
}

/** Per-Durion-location receiving account mapping (ADR-0050 §5). */
export interface SupplierDeliveryAccount {
  readonly accountId: string;
  /** pos-location site UUID. */
  locationId: string;
  /** Resolved from the pos-location roster for display only. */
  locationName?: string;
  accountNumber: string;
  agencyCode?: string;
}

/** An active Durion location a delivery mapping is expected for. */
export interface SupplierActiveLocation {
  locationId: string;
  name: string;
}

/**
 * Accounts tab payload: billing account, delivery mappings, and the active-location
 * roster used for the mapping-gap check.
 *
 * The roster comes from a *different* domain (pos-location) than the accounts, so
 * its availability is reported separately: losing it must degrade the gap check
 * alone, never the mappings the operator came here to read.
 */
export interface SupplierAccounts {
  billing: SupplierBillingAccount | null;
  delivery: SupplierDeliveryAccount[];
  activeLocations: SupplierActiveLocation[];
  /** False when the pos-location roster could not be read; the gap check is then unavailable. */
  locationsAvailable: boolean;
}

/** Upsert payload for the billing account. `accountId` absent ⇒ create. */
export interface SupplierBillingAccountRequest {
  accountId?: string;
  accountNumber: string;
  agencyCode?: string;
}

/** Upsert payload for a single delivery mapping. `accountId` absent ⇒ create. */
export interface SupplierDeliveryAccountRequest {
  accountId?: string;
  locationId: string;
  accountNumber: string;
  agencyCode?: string;
}

/** A capability binding (ADR-0050 §3, ADR-0051 §3). */
export interface SupplierBinding {
  readonly bindingId: string;
  capability: SupplierCapability;
  protocolFamily: SupplierProtocolFamily;
  /** Adapter version key within the family. Free-form by contract. */
  protocolVersion: string;
  baseUrl: string;
  path: string;
  /** Points at a `SupplierAuthConfig.authRef` on the same profile. */
  authRef: string;
  /** Optional cron schedule for scheduled capabilities. */
  cronSchedule?: string | null;
  enabled: boolean;
  /** Payload capture level for this binding; absent means the deployment default. */
  captureLevel?: SupplierCaptureLevel;
}

/** Create/update payload for a binding (ADR-0034: no server-generated fields). */
export interface SupplierBindingRequest {
  capability: SupplierCapability;
  protocolFamily: SupplierProtocolFamily;
  protocolVersion: string;
  baseUrl: string;
  path: string;
  authRef: string;
  cronSchedule?: string | null;
  enabled: boolean;
  captureLevel?: SupplierCaptureLevel;
}

/**
 * One field-level validation failure returned by the admin API.
 *
 * The contract's `FieldError` is `{ field, message }` — **there is no `code`**;
 * `code` lives on the enclosing `ApiError`. `code` is retained as optional here
 * only because the PRICAT surface still goes through `ApiBaseService` against a
 * backend that emits the older shape.
 */
export interface SupplierFieldError {
  /** Payload field path, e.g. `authRef`, `schedule`, `deliveryLocationId`. */
  field: string;
  /** Backend detail text. **Data, not UI copy** — never rendered as the primary label. */
  message?: string;
  /** Legacy machine code, still produced by the `ApiBaseService` PRICAT path. */
  code?: string;
}

/** Standard Durion error envelope, as much of it as this UI consumes. */
export interface SupplierApiErrorBody {
  code?: string;
  message?: string;
  fieldErrors?: SupplierFieldError[];
  /** Legacy alias still emitted by the `ApiBaseService` PRICAT path. */
  errors?: SupplierFieldError[];
}
