/**
 * Supplier exchange-audit domain model (ADR-0050 §7).
 *
 * Interfaces only. Exchange rows are **read-only commercial records** — there is
 * no retry/replay action in the UI. Raw payload access is governed by a tighter
 * permission than profile administration; the payload endpoint answers `403`
 * when the caller lacks it, which the UI renders as a dedicated
 * `payload-restricted` state rather than an error.
 */
import { SupplierCapability, SupplierProtocolFamily } from './supplier-profile.models';

/** Terminal outcome of one outbound exchange. */
export type ExchangeOutcome =
  | 'SUCCESS'
  | 'FAILURE'
  | 'TIMEOUT'
  | 'REJECTED'
  | 'CIRCUIT_OPEN';

/** Per-binding payload capture level (ADR-0050 §7). */
export type ExchangeCaptureLevel = 'FULL' | 'REDACTED' | 'METADATA_ONLY';

/** Exchange metadata row — always readable with profile-read access. */
export interface ExchangeAuditRecord {
  readonly exchangeId: string;
  vendorProfileId: string;
  vendorDisplayName: string;
  capability: SupplierCapability;
  protocolFamily: SupplierProtocolFamily;
  protocolVersion: string;
  outcome: ExchangeOutcome;
  httpStatus?: number | null;
  durationMs?: number | null;
  correlationId: string;
  captureLevel: ExchangeCaptureLevel;
  readonly startedAt: string;
  readonly finishedAt?: string | null;
  /** Fields the bound norm could not express (ADR-0051 §4) — diagnosable, never silently dropped. */
  unmappedFields?: string[];
}

/** Filter inputs for the audit list. Dates are date-only `YYYY-MM-DD` strings (ADR-0038). */
export interface ExchangeAuditFilter {
  vendorProfileId?: string;
  capability?: SupplierCapability | '';
  outcome?: ExchangeOutcome | '';
  /** Inclusive start date, `YYYY-MM-DD`. */
  dateFrom?: string;
  /** Inclusive end date, `YYYY-MM-DD`. */
  dateTo?: string;
}

/** Paged audit list response. */
export interface ExchangeAuditPage {
  items: ExchangeAuditRecord[];
  totalCount: number;
  nextPageToken?: string | null;
}

/** One captured header. `redacted` is delivered by the backend; the UI never unredacts. */
export interface ExchangeHeader {
  name: string;
  value: string;
  redacted: boolean;
}

/**
 * Raw request/response capture for one exchange, as delivered (already redacted
 * server-side). Only reachable with the dedicated audit-payload permission.
 */
export interface ExchangePayloadView {
  exchangeId: string;
  captureLevel: ExchangeCaptureLevel;
  requestContentType?: string | null;
  requestBody?: string | null;
  requestHeaders?: ExchangeHeader[];
  responseContentType?: string | null;
  responseBody?: string | null;
  responseHeaders?: ExchangeHeader[];
  /** Body field paths the backend redacted before delivery. */
  redactedFields?: string[];
  /** Set when the payload has aged past the retention window and been hard-deleted. */
  payloadPurgedAt?: string | null;
}
