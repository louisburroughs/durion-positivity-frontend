/** Shape of the JWT claims expected from durion-positivity-backend. */
export interface JwtClaims {
  sub: string;          // username / subject
  roles?: string[];     // canonical UI-gating claim
  authorities?: string[]; // legacy compatibility only; not issued for new tokens
  exp: number;          // expiry epoch (seconds)
  iat?: number;
  /**
   * Base64URL-encoded permission bitset (ADR-0040). Absent on tokens issued
   * before the claim existed — absent means "permissions unknown", which is
   * not the same as the empty string, which means "no permissions granted".
   */
  perm_bits?: string;
  /** Backend permission-catalog version `perm_bits` was encoded against. */
  perm_ver?: number;
  /** Location-scope bitsets; backend-authoritative, not used for UI gating. */
  loc_fin_bits?: string;
  loc_oth_bits?: string;
}
