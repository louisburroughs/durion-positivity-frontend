/**
 * Supplier exchange-audit domain model (ADR-0050 §7, ADR-0052 §5).
 *
 * Interfaces only. Exchange rows are **read-only commercial records** — there is
 * no retry/replay action in the UI. Reading payload content is a separate,
 * individually audited call that answers `403` when the caller lacks the tighter
 * permission; the UI renders that as a dedicated `payload-restricted` state
 * rather than as an error.
 */
// `import type`, not a value import: `SupplierCaptureLevel` is a type-only
// export, and under isolatedModules a value import of it emits a runtime
// binding that does not exist — which corrupts this module's other exports.
import type { SupplierCaptureLevel } from './supplier-profile.models';

/**
 * Classification of one attempt (ADR-0052 §5).
 *
 * An **open** string: the contract types `outcome` as a free-form key, so a new
 * backend classification must not be dropped on the floor by the frontend.
 */
export type ExchangeOutcome = string;

/** Per-row payload capture level (ADR-0050 §7). */
export type ExchangeCaptureLevel = SupplierCaptureLevel;

/**
 * Exchange metadata row — always readable with profile-read access, and never
 * containing payload content.
 */
export interface ExchangeAuditRecord {
  readonly exchangeAuditId: string;
  /** Still populated when the profile has since been deleted: history outlives configuration. */
  vendorProfileId: string;
  /** The profile's alias **as at the time of the exchange** — a snapshot, never a lookup key. */
  supplierRef: string;
  bindingId?: string | null;
  capability: string;
  protocolFamily: string;
  protocolVersion: string;
  httpMethod?: string | null;
  /**
   * Absolute request URI, credential-redacted at capture time. At
   * `METADATA_ONLY` the query string is removed entirely and this is the **path
   * only** — it must not be presented as a full URI.
   */
  endpointUri?: string | null;
  /** 1-based attempt number within one logical call. */
  attempt: number;
  /** Groups every attempt of one logical call; use it to trace a retry sequence. */
  correlationId: string;
  outcome: ExchangeOutcome;
  /**
   * Response status code, or `null` when **no response was received at all** —
   * a connect failure, a timeout before headers, or an attempt suppressed by an
   * open circuit breaker. `null` is a real state and is never rendered as `0`.
   */
  httpStatus: number | null;
  readonly startedAt: string;
  durationMs: number | null;
  /** Operator-facing failure summary. Null on success. Backend data, not UI copy. */
  failureDetail?: string | null;
  /** The level actually applied to THIS row — recorded, not re-derived from the binding. */
  captureLevel: ExchangeCaptureLevel;
  /** Whether a request payload is currently stored. Determined without decrypting anything. */
  requestPayloadPresent: boolean;
  responsePayloadPresent: boolean;
  /** When retention nulled this row's payloads. Distinguishes 'purged' from 'never captured'. */
  payloadsPurgedAt?: string | null;
  /** Audit actor that caused the exchange (ADR-0018); the system actor for scheduled runs. */
  createdBy?: string | null;
}

/**
 * Filter inputs for the audit list.
 *
 * `vendorProfileId` and the date window are **required** by the contract. Dates
 * are date-only `YYYY-MM-DD` strings at this layer (ADR-0038) and are converted
 * to the contract's half-open instant window at the service boundary.
 */
export interface ExchangeAuditFilter {
  vendorProfileId: string;
  /** Inclusive start date, `YYYY-MM-DD`. */
  dateFrom: string;
  /** Inclusive end date, `YYYY-MM-DD`. Converted to an exclusive instant downstream. */
  dateTo: string;
  capability?: string;
}

/** Paged audit list response. */
export interface ExchangeAuditPage {
  items: ExchangeAuditRecord[];
  /** Zero-based page index. */
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
}

/**
 * Stored payload content for one exchange.
 *
 * A `null` payload is a **normal state, not an error**: a `METADATA_ONLY`
 * binding captured none, the exchange carried no body, or retention purged the
 * content. When `redacted` is true these are **not** the wire documents —
 * sensitive fields were replaced at capture time and the originals were never
 * persisted, so they cannot be recovered from anywhere.
 */
export interface ExchangePayloadView {
  exchangeAuditId: string;
  captureLevel: ExchangeCaptureLevel;
  redacted: boolean;
  requestPayload: string | null;
  responsePayload: string | null;
}
