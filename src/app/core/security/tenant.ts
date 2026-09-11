/**
 * tenant.ts
 * ---------
 * Tenant identity helpers for the session layer (ADR-0062).
 *
 * The tenant a session belongs to comes from the access token's `tid` claim
 * only. The browser never sends a tenant identifier: the gateway injects
 * `X-Tenant-Id` from the token on every authenticated request, and at login it
 * derives `X-Tenant-Slug` from the request host — the one case where the login
 * form supplies the slug itself is a host that carries no tenant suffix.
 */

/**
 * The platform tenant (`PlatformTenant.ID` in pos-tenant): the single tenant
 * whose roles may hold `platform:*` authorities. A session bound to it is a
 * platform operator, not a customer tenant.
 */
export const PLATFORM_TENANT_ID = '01900000-0000-7000-8000-000000000000';

/** The slug shape pos-tenant enforces: lowercase letters, digits and hyphens, 3–63 characters. */
export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

/** A slug as it is sent: trimmed and lowercased, since slugs are case-insensitive names. */
export function normalizeTenantSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function isTenantSlug(value: string): boolean {
  return TENANT_SLUG_PATTERN.test(value);
}

/**
 * Tenant slug named by a host, or null when the host carries no tenant.
 *
 * With suffix `.positivity.example` the host `acme-tire.positivity.example`
 * names `acme-tire`; `localhost`, a bare `positivity.example`, an empty
 * suffix, or a prefix that is not a well-formed slug (`a_b.positivity.example`)
 * name nothing, and the login form asks for the slug instead. The gateway
 * applies the same rule (`auth.tenant-host-suffix`), so a slug shown here is
 * the one the login will actually be resolved against.
 */
export function tenantSlugFromHost(hostname: string, suffix: string): string | null {
  const host = hostname.trim().toLowerCase();
  const tail = suffix.trim().toLowerCase();
  if (!host || !tail || !host.endsWith(tail)) return null;

  const slug = host.slice(0, host.length - tail.length);
  return isTenantSlug(slug) ? slug : null;
}
