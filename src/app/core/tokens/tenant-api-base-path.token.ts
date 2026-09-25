import { InjectionToken } from '@angular/core';

/**
 * Base path for `@durion-sdk/tenant`'s `Configuration` (ADR-0062 §7).
 *
 * Provided as a plain string in `app.config.ts`, the one place `environment.apiBaseUrl`
 * may be read directly (SDK-06, LAY-08). The `@durion-sdk/tenant` package itself —
 * including its `Configuration` class — is imported and constructed only under
 * `features/platform` (SDK-10), in `platform.routes.ts`'s route-scoped providers, so the
 * SDK stays out of the eager initial bundle and loads only with the lazy platform chunk.
 */
export const TENANT_API_BASE_PATH = new InjectionToken<string>('TENANT_API_BASE_PATH');
