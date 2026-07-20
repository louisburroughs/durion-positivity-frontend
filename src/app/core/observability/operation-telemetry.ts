/**
 * Operation telemetry helper for the 8 cataloged frontend operations in
 * `docs/domain/operations.yaml` (durion-positivity-backend repo). Resolves
 * the `app.operation.*` <-> Faro event/measurement mapping documented in
 * `docs/observability/plan.md` 10.2:
 *
 * - Page-view spans (Faro's auto navigation span): `app.operation.name`,
 *   `app.operation.type`, `app.operation.outcome` set as span attributes via
 *   the OTel TracerProvider Faro installs.
 * - A companion `pushEvent('feature_used', {...})` call carries the same
 *   three attributes so the trace view and event view in Grafana agree.
 * - `pushMeasurement` has no attribute channel, so operation identity is
 *   encoded in the measurement `type` string itself, e.g.
 *   `type: 'view-operations-dashboard.load'`.
 *
 * All calls are fail-open: telemetry must never break the UI.
 */
import { trace } from '@opentelemetry/api';
import { faro } from '@grafana/faro-web-sdk';

/** Frontend-only extension of `app.operation.type`, within the approved
 * `app.operation.*` namespace (plan.md 10.2). */
export type OperationType = 'ui_view' | 'ui_action';
export type OperationOutcome = 'success' | 'failure';

export interface OperationAttributes {
  /** Must match the operation's `telemetry.spans.business_span` in operations.yaml exactly. */
  name: string;
  type: OperationType;
  outcome: OperationOutcome;
}

/** Sets `app.operation.*` attributes on the active span and fires the
 * companion `feature_used` event. Call once per page render/reload outcome. */
export function recordOperation(op: OperationAttributes): void {
  try {
    trace.getActiveSpan()?.setAttributes({
      'app.operation.name': op.name,
      'app.operation.type': op.type,
      'app.operation.outcome': op.outcome,
    });
  } catch {
    // Telemetry must never break the UI.
  }

  try {
    faro.api?.pushEvent('feature_used', {
      'app.operation.name': op.name,
      'app.operation.type': op.type,
      'app.operation.outcome': op.outcome,
    });
  } catch {
    // Telemetry must never break the UI.
  }
}

/** Pushes a Faro measurement whose `type` encodes the operation identity
 * (`{operationId}.{suffix}`), since `pushMeasurement` has no attribute
 * channel (plan.md 10.2). Use for operation-specific latency/KPI values;
 * Core Web Vitals arrive separately and automatically via
 * `getWebInstrumentations()`. */
export function recordOperationMeasurement(
  operationId: string,
  values: Record<string, number>,
  suffix = 'load',
): void {
  try {
    faro.api?.pushMeasurement({ type: `${operationId}.${suffix}`, values });
  } catch {
    // Telemetry must never break the UI.
  }
}

/** Monotonic timestamp (ms) for measuring page-load durations. */
export function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
