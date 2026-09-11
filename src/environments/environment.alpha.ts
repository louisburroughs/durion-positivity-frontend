export const environment = {
  production: false,
  apiBaseUrl: '/api',
  mockAuth: false,
  /**
   * Host suffix that names the tenant (ADR-0062 §3); must match the gateway's
   * `auth.tenant-host-suffix`. Empty: the alpha cell is a shared host, so the
   * login form asks for the tenant slug (form mode).
   */
  tenantHostSuffix: '',
};
