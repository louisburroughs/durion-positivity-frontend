export const environment = {
  production: false,
  apiBaseUrl: '/api', // dev-server proxies /api -> http://localhost:8080 (see proxy.conf.json), mirroring alpha/prod
  /** Set to true to skip the real login API and use a local mock session. */
  mockAuth: true,
  // PLACEHOLDER: point at the Grafana Alloy `faro.receiver` HTTP endpoint fronting
  // otel_destination (sre.config.yaml -> http://localhost:4318). Never point Faro
  // directly at the raw OTLP/HTTP port -- confirm the actual local port/path with
  // the SRE team (see docs/observability/plan.md 5.1 in durion-positivity-backend).
  faroCollectorUrl: 'http://localhost:12347/collect',
};
