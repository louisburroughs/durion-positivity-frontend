export const environment = {
  production: true,
  apiBaseUrl: '/api', // Proxied by production reverse-proxy; override via build-time substitution if needed.
  mockAuth: false,
  // PLACEHOLDER: confirm the production Faro-compatible collector endpoint (Alloy
  // `faro.receiver`) with the SRE team before release -- do NOT point Faro directly
  // at the raw OTLP/HTTP port. Override via build-time substitution if needed.
  faroCollectorUrl: '/faro/collect',
};
