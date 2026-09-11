/**
 * Platform tenant-registry models (pos-tenant, ADR-0062 §7).
 *
 * Hand-typed mirrors of pos-tenant's `TenantResponse`, `TenantCreateRequest`
 * and `AccountResponse` DTOs, because no `@durion-sdk/tenant` package has been
 * generated yet. Once `API Artifacts Sync` publishes it, the service layer
 * switches to the generated types and these go away (ADR-0041).
 */

export const TENANT_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DECOMMISSIONED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** A tenant as platform staff see it (`TenantResponse`). */
export interface Tenant {
  /** Tenant id; the value every module's `tenant_id` refers to. */
  id: string;
  /** URL-safe unique name. */
  slug: string;
  displayName: string;
  status: TenantStatus;
  /** Owning account id. */
  accountId: string;
  /** Cell or region the tenant is served from. */
  cell?: string | null;
  /** Email of the initial administrator provisioned with the tenant. */
  initialAdminEmail: string;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string | null;
  suspendedAt?: string | null;
  decommissionedAt?: string | null;
}

/** Register a tenant under an account (`TenantCreateRequest`). */
export interface TenantCreateRequest {
  /** Lowercase letters, digits and hyphens, 3–63 characters. */
  slug: string;
  displayName: string;
  accountId: string;
  cell?: string;
  initialAdminEmail: string;
}

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | string;

/** The parts of `AccountResponse` the tenant pages need to name an owning account. */
export interface AccountSummary {
  id: string;
  legalName: string;
  tradingName?: string | null;
  status: AccountStatus;
  homeCountry: string;
  homeCurrency: string;
  tenantIds: string[];
}

/** One entry of the standard `ApiError.fieldErrors` list. */
export interface PlatformFieldError {
  field: string;
  message?: string;
}

/**
 * The standard `ApiError` envelope (pos-web-common) that pos-tenant's domain
 * exceptions come back in — 404 unknown account, 409 slug taken, and so on.
 */
export interface PlatformApiErrorBody {
  code?: string;
  message?: string;
  status?: number;
  fieldErrors?: PlatformFieldError[];
}

/**
 * RFC 9457 problem detail. pos-tenant's `TenantGlobalExceptionHandler` extends
 * Spring's `ResponseEntityExceptionHandler`, so a `@Valid` failure on a request
 * body answers 400 with this shape and no per-field list: `title` "Bad
 * Request", `detail` "Invalid request content.", plus `correlationId`.
 */
export interface PlatformProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
}
