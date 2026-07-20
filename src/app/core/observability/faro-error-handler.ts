/**
 * Custom Angular ErrorHandler that forwards uncaught errors to Faro
 * (`faro.api.pushError`) in addition to the console, per
 * `.sre/opentelemetry-agent-skills/faro-web-setup/frameworks.md` (Angular
 * section) in the durion-positivity-backend repo. Registered in
 * `app.config.ts` alongside the existing `provideBrowserGlobalErrorListeners()`.
 */
import { ErrorHandler, Injectable } from '@angular/core';
import { faro } from '@grafana/faro-web-sdk';

@Injectable()
export class FaroErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    try {
      faro.api?.pushError(err);
    } catch {
      // Telemetry must never break error handling.
    }
    console.error(error);
  }
}
