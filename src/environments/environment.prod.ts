export const environment = {
  production: true,
  apiBaseUrl: '/api', // Proxied by production reverse-proxy; override via build-time substitution if needed.
  mockAuth: false,
  /**
   * Host suffix that names the tenant (ADR-0062 §3); must match the gateway's
   * `auth.tenant-host-suffix`. Empty until the production cell serves tenants on
   * their own hosts — the login form then asks for the tenant slug instead.
   */
  tenantHostSuffix: '',
};
