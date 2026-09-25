/**
 * Identity keys for per-user caches and storage
 * ---------------------------------------------
 * Anything that caches or persists tenant data in the browser is namespaced by
 * the token's tenant AND subject together: one `sub` outlives a tenant switch and
 * one `tid` covers every account inside it, so either half alone lets one
 * context read the other's data (ADR-0062, ADR-0065 §4/§5).
 *
 * Both halves are percent-encoded before they are joined. Raw values are opaque
 * strings from the token, and a `sub` that happens to contain the delimiter would
 * otherwise let `tid=a|b`/`sub=c` and `tid=a`/`sub=b|c` resolve to the same key —
 * a cross-tenant collision in the one place that exists to prevent it.
 */

/** The two claims that decide whose data something is. */
export interface IdentityClaims {
  readonly tid?: string;
  readonly sub?: string;
}

/** Percent-encode one half of an identity key, so no value can contain a delimiter. */
export function encodeIdentityPart(value: string | null | undefined): string {
  return encodeURIComponent(value?.trim() ?? '');
}

/**
 * The tracked identity of the current token: `tid|sub`, both halves encoded.
 * Missing claims encode to an empty half, which never matches a signed-in token.
 */
export function identityKey(claims: IdentityClaims | null | undefined): string {
  return `${encodeIdentityPart(claims?.tid)}|${encodeIdentityPart(claims?.sub)}`;
}
