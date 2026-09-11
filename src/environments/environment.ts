export const environment = {
  production: false,
  apiBaseUrl: '/api', // dev-server proxies /api -> http://localhost:8080 (see proxy.conf.json), mirroring alpha/prod
  /** Set to true to skip the real login API and use a local mock session. */
  mockAuth: true,
  /**
   * Host suffix that names the tenant (ADR-0062 §3). When the page is served from
   * `<slug><suffix>` the gateway derives the tenant from the Host header and the
   * login form hides its tenant field; empty means form mode — the login page asks
   * for the tenant slug and sends it as `LoginRequest.tenantSlug`.
   */
  tenantHostSuffix: '',
};
