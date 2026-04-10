/** Shape of the JWT claims expected from durion-positivity-backend. */
export interface JwtClaims {
  sub: string;          // username / subject
  roles?: string[];     // optional in greenfield PERM mode
  authorities?: string[];
  exp: number;          // expiry epoch (seconds)
  iat?: number;
  perm_bits?: string;
  perm_ver?: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string; // 'Bearer'
}
