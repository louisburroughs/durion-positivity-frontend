/**
 * Identity key for the inventory pages' async ownership checks (ADR-0063 §7).
 *
 * `tid|sub`, each half percent-encoded before joining — the same encoding as
 * `features/shell/utils/identity.util.ts`, replicated here because features do
 * not import one another. Raw claims are opaque strings, so without encoding
 * `tid=a|b`/`sub=c` and `tid=a`/`sub=b|c` would produce the same key and a
 * previous identity's data could survive a switch (ADR-0065 §4/§5).
 *
 * Pure function: callers pass the tenant (from `AuthService.tenantId()`, never
 * the raw claim — TEN-05) and the subject.
 */

function encodePart(value: string | null | undefined): string {
  return encodeURIComponent(value?.trim() ?? '');
}

/** `tid|sub`, both halves encoded. Missing claims encode to an empty half. */
export function inventoryIdentityKey(tenant: string | null | undefined, subject: string | null | undefined): string {
  return `${encodePart(tenant)}|${encodePart(subject)}`;
}
