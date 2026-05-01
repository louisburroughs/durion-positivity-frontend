/** Shape of the JWT claims expected from durion-positivity-backend. */
export interface JwtClaims {
  sub: string;          // username / subject
  roles?: string[];     // canonical UI-gating claim
  authorities?: string[]; // legacy compatibility only; not issued for new tokens
  exp: number;          // expiry epoch (seconds)
  iat?: number;
  perm_bits?: string;
  perm_ver?: number;
}
