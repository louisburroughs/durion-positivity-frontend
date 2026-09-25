/**
 * The single production logging channel (PAT-08). Application code never calls `console.*`
 * directly — a genuine operational warning/error (a malformed token, a degraded read, a failed
 * background write) goes through this tiny wrapper instead, so there is exactly one file the
 * architecture rule needs to allowlist. This is deliberately not a DI-injectable Angular service:
 * several call sites are plain functions outside any injection context (e.g.
 * `core/security/permission-bits.ts`), and there is currently nothing to swap the implementation
 * for (no remote log sink, no per-environment verbosity). Revisit as an injectable service if
 * that changes.
 */
export const logger = {
  warn(message: string, ...args: unknown[]): void {
    console.warn(message, ...args);
  },
  error(message: string, ...args: unknown[]): void {
    console.error(message, ...args);
  },
};
