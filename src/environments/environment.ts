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
  /**
   * Feature flags for backend capabilities the assistant needs but that the MCP
   * server does not expose yet. Each is OFF until its backend issue lands; the
   * frontend runs a local stub in the meantime (see chat-history.store.ts).
   */
  features: {
    /** Conversation history CRUD on the server (backend #2073). Off: per-browser only. */
    chatHistoryApi: false,
    /** Server-side audio transcription (backend #2074). Off: needs in-browser recognition. */
    chatSpeechTranscription: false,
  },
};
