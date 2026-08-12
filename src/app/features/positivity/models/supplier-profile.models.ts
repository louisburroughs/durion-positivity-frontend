/**
 * Supplier (positivity) vendor-profile domain model.
 *
 * Interfaces only — no logic, no Angular imports (AGENTS.md file-structure rule).
 *
 * Vocabulary is canonical per ADR-0050 §5: **billing** and **delivery**. Vendor
 * wire vocabulary (`billTo`/`shipTo`, `BuyerParty`/`Consignee`) lives only inside
 * backend adapters and must never appear in this layer or in the UI.
 *
 * Credential-bearing fields are **write-only reference strings** (ADR-0050 §4),
 * e.g. `env:MICHELIN_EDI_USER`. The backend never echoes a resolved secret and
 * the UI must never ask for one — hence every credential field on this model is
 * named `*Ref` and is documented as a reference, not a value.
 */

/** Who owns a profile's configuration (ADR-0050 §6). `YAML` profiles are read-only in the admin UI. */
export type SupplierSourceOfTruth = 'YAML' | 'ADMIN';

/** Supported auth config shapes (ADR-0050 §4). */
export type SupplierAuthType =
  | 'BASIC_PLUS_APIKEY'
  | 'OAUTH2_CLIENT_CREDENTIALS'
  | 'BEARER';

/** Protocol families registered by the backend adapter registry (ADR-0051 §2). */
export type SupplierProtocolFamily =
  | 'EDIWHEEL_A25'
  | 'EDIWHEEL_C1'
  | 'EDIWHEEL_B'
  | 'EDIWHEEL_JSON'
  | 'MICHELIN_S2S';

/** Business capabilities a vendor profile can bind (ADR-0051 §3). */
export type SupplierCapability =
  | 'ORDER'
  | 'ORDER_STATUS'
  | 'STOCK_REPORT'
  | 'PRICE_CATALOG'
  | 'PRODUCT_CATALOG'
  | 'DELIVERY_NOTE';

/** Circuit-breaker state reported by the health endpoint (read-only in the UI). */
export type SupplierBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'UNKNOWN';

/**
 * Health roll-up per capability. `NOT_CONFIGURED` is the typed status for an
 * absent binding (ADR-0050 §3) — absence is meaningful and is rendered as an
 * explicitly disabled row, never hidden.
 */
export type SupplierHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'FAILING'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN';

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
  readonly updatedAt?: string;
}

/** Full profile record returned by the detail endpoint. */
export interface VendorProfile extends VendorProfileSummary {
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
  maxRetries?: number;
  readonly createdAt?: string;
}

/** Create/update payload — server-generated fields are omitted entirely (ADR-0034). */
export interface VendorProfileRequest {
  supplierRef: string;
  displayName: string;
  enabled: boolean;
  sandbox: boolean;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
  maxRetries?: number;
}

/**
 * An auth configuration attached to a profile.
 *
 * Every credential-bearing property is a **secret reference string** resolved at
 * call time by the backend. The API never returns a plaintext value for these
 * fields and the UI never renders one.
 */
export interface SupplierAuthConfig {
  readonly authConfigId: string;
  /** Logical name bindings point at via `authRef`. */
  authRef: string;
  authType: SupplierAuthType;
  /** Reference to the basic-auth username, e.g. `env:MICHELIN_EDI_USER`. */
  usernameRef?: string;
  /** Reference to the basic-auth password. Never a password. */
  passwordRef?: string;
  /** Reference to the API key. Never an API key. */
  apiKeyRef?: string;
  /** Reference to the OAuth2 client id. */
  clientIdRef?: string;
  /** Reference to the OAuth2 client secret. Never a secret. */
  clientSecretRef?: string;
  /** OAuth2 token endpoint — ordinary configuration data, not a credential. */
  tokenUrl?: string;
  /** OAuth2 scope — ordinary configuration data. */
  scope?: string;
  /** Reference to a static bearer token. Never a token. */
  tokenRef?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/** Create/update payload for an auth config (ADR-0034: no server-generated fields). */
export interface SupplierAuthConfigRequest {
  authRef: string;
  authType: SupplierAuthType;
  usernameRef?: string;
  passwordRef?: string;
  apiKeyRef?: string;
  clientIdRef?: string;
  clientSecretRef?: string;
  tokenUrl?: string;
  scope?: string;
  tokenRef?: string;
}

/** Invoicing/settlement account for the profile (ADR-0050 §5). */
export interface SupplierBillingAccount {
  accountNumber: string;
  agencyCode?: string;
}

/** Per-Durion-location receiving account mapping (ADR-0050 §5). */
export interface SupplierDeliveryAccount {
  /** pos-location site UUID. */
  locationId: string;
  /** Denormalized site name supplied by the backend for display only. */
  locationName?: string;
  accountNumber: string;
  agencyCode?: string;
}

/**
 * An active Durion location the deployment expects a delivery mapping for.
 * Supplied by the accounts endpoint so the UI can flag mapping gaps without
 * reaching across the domain boundary into pos-location.
 */
export interface SupplierActiveLocation {
  locationId: string;
  name: string;
}

/** Accounts tab payload: billing account, delivery mappings, and the active-location roster. */
export interface SupplierAccounts {
  billing: SupplierBillingAccount | null;
  delivery: SupplierDeliveryAccount[];
  activeLocations: SupplierActiveLocation[];
}

/** Update payload for the billing account. */
export interface SupplierBillingAccountRequest {
  accountNumber: string;
  agencyCode?: string;
}

/** Upsert payload for a single delivery mapping. */
export interface SupplierDeliveryAccountRequest {
  locationId: string;
  accountNumber: string;
  agencyCode?: string;
}

/** A capability binding (ADR-0050 §3, ADR-0051 §3). */
export interface SupplierBinding {
  readonly bindingId: string;
  capability: SupplierCapability;
  protocolFamily: SupplierProtocolFamily;
  protocolVersion: string;
  baseUrl: string;
  path: string;
  /** Points at a `SupplierAuthConfig.authRef` on the same profile. */
  authRef: string;
  /** Optional cron schedule for batch capabilities. */
  cronSchedule?: string | null;
  enabled: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
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
}

/** One `(protocolFamily, version[])` option offered for a capability. */
export interface SupplierProtocolOption {
  protocolFamily: SupplierProtocolFamily;
  versions: string[];
}

/** Registry-derived catalog of bindable capabilities and their protocol options. */
export interface SupplierCapabilityDescriptor {
  capability: SupplierCapability;
  protocolOptions: SupplierProtocolOption[];
}

/**
 * Read-only health/breaker snapshot for one capability of a profile.
 * `bindingId` is null when the capability is unbound (`NOT_CONFIGURED`).
 */
export interface SupplierBindingHealth {
  capability: SupplierCapability;
  bindingId: string | null;
  status: SupplierHealthStatus;
  breakerState: SupplierBreakerState;
  consecutiveFailures?: number;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  /** When the backend sampled this snapshot. */
  observedAt: string;
  /** Backend-delivered staleness threshold for the snapshot, in minutes. */
  stalenessThresholdMinutes: number;
}

/** One field-level validation failure returned by the admin API on `400`. */
export interface SupplierFieldError {
  /** Payload field path, e.g. `authRef`, `cronSchedule`, `delivery[0].locationId`. */
  field: string;
  /** Stable machine code, e.g. `BINDING_AUTH_REQUIRED`, `CRON_MALFORMED`. */
  code: string;
  /** Optional backend-supplied English detail; the UI prefers its own translated copy. */
  message?: string;
}

/** Problem body shape accepted from the admin API. */
export interface SupplierApiErrorBody {
  code?: string;
  message?: string;
  fieldErrors?: SupplierFieldError[];
  errors?: SupplierFieldError[];
}
