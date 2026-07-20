export const environment = {
  production: false,
  apiBaseUrl: '/api',
  mockAuth: false,
  // PLACEHOLDER: confirm the alpha Faro-compatible collector endpoint (Alloy
  // `faro.receiver`) with the SRE team -- do NOT point Faro directly at the raw
  // OTLP/HTTP port.
  faroCollectorUrl: '/faro/collect',
};
