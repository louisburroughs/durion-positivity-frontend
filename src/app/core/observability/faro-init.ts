/**
 * Faro Web SDK initialization.
 * ----------------------------
 * Must be the FIRST import in the entry point (`main.ts`) so Faro captures
 * errors and spans from the moment the app loads (see
 * `.sre/opentelemetry-agent-skills/faro-web-setup/SKILL.md` "code rules" and
 * `docs/observability/plan.md` 5.1 in the durion-positivity-backend repo).
 *
 * Fail-open: initialization is wrapped in try/catch so a Faro/collector
 * problem can never block app startup.
 *
 * `app.name` is fixed to `durion-positivity-frontend` (the git repo name /
 * `service.name` convention used across this workspace) — do not derive it
 * from `package.json` `name` if that value ever diverges.
 */
import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import { environment } from '../../../environments/environment';

try {
  initializeFaro({
    url: environment.faroCollectorUrl,
    app: {
      name: 'durion-positivity-frontend',
      version: '0.0.0', // mirrors package.json "version" field
      environment: environment.production ? 'production' : 'development',
    },
    sessionTracking: {
      enabled: true,
    },
    instrumentations: [
      // Bundles Core Web Vitals, error capture, console capture, and
      // page-view/session events.
      ...getWebInstrumentations({ captureConsole: true }),
      // Wraps the OTel Web SDK: auto-navigation spans + fetch/XHR spans for
      // every ApiBaseService call, with W3C traceparent propagation.
      new TracingInstrumentation({
        instrumentationOptions: {
          // apiBaseUrl is always same-origin ('/api', '/mcp-server' — proxied
          // in dev via proxy.conf.json and by the prod/alpha reverse proxy),
          // so traceparent propagation is automatic and this list is empty.
          // If a Tier-1 route ever calls a cross-origin gateway/CDN domain,
          // add that origin here (anchored regex, never a wildcard) so the
          // browser span still becomes the trace root.
          propagateTraceHeaderCorsUrls: [],
        },
      }),
    ],
    // Auto-navigation tracking: this app's Angular Router doesn't have a
    // dedicated Faro router integration wired yet, so URL changes/timing are
    // still captured without a hand-rolled NavigationEnd listener.
    experimental: {
      trackNavigation: true,
    },
    ignoreErrors: [
      // Layout quirks — harmless, not real errors.
      /^ResizeObserver loop limit exceeded$/,
      /^ResizeObserver loop completed with undelivered notifications$/,
      // Cross-origin scripts with no useful stack.
      /^Script error\.$/,
      // Browser extension interference.
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
    ],
  });
} catch {
  // Telemetry must never block app startup.
}
