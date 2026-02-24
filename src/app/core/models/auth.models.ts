/** Shape of the JWT claims expected from durion-positivity-backend. */
export interface JwtClaims {
  sub: string;          // username / subject
  roles: string[];      // e.g. ['ROLE_ADMIN', 'ROLE_CASHIER']
  authorities?: string[];
  exp: number;          // expiry epoch (seconds)
  iat: number;
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
