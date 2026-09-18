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
  /**
   * Feature flags for backend capabilities the assistant needs but that the MCP
   * server does not expose yet. Each is OFF until its backend issue lands; the
   * frontend runs a local stub in the meantime (see chat-history.store.ts).
   */
  features: {
    /** Conversation history CRUD on the server. Off: history is per-browser only. */
    chatHistoryApi: false,
    /** Server-side audio transcription. Off: voice needs in-browser recognition. */
    chatSpeechTranscription: false,
  },
};
