import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  AddEstimateItemRequest,
  ApproveEstimateRequest,
  CalculateEstimateTotalsResponse,
  CreateEstimateRequest,
  EstimateItemResponse,
  EstimateResponse,
  EstimateSnapshotResponse,
  EstimateSummaryResponse,
  UpdateEstimateItemRequest,
} from '../models/workexec.models';

/**
 * WorkexecService — adapts Workexec OpenAPI operations to Angular observables.
 *
 * operationId mapping (pos-workorder/openapi.yaml):
 *   createEstimate          → POST   /v1/workorders/estimates
 *   getEstimateById         → GET    /v1/workorders/estimates/{estimateId}
 *   addEstimateItem         → POST   /v1/workorders/estimates/{estimateId}/items
 *   updateEstimateItem      → PATCH  /v1/workorders/estimates/{estimateId}/items/{itemId}
 *   deleteEstimateItem      → DELETE /v1/workorders/estimates/{estimateId}/items/{itemId}
 *   calculateEstimateTotals → POST   /v1/workorders/estimates/{estimateId}/calculate-totals
 *   createEstimateSnapshot  → POST   /v1/workorders/estimates/{estimateId}/snapshots
 *   getEstimateSummary      → GET    /v1/workorders/estimates/{estimateId}/summary
 *   patchEstimateStatus     → PATCH  /v1/workorders/estimates/{estimateId}
 *   reopenEstimate          → POST   /v1/workorders/estimates/{estimateId}/reopen
 *   submitForApproval       → POST   /v1/workorders/estimates/{estimateId}/submit-for-approval
 *   approveEstimate         → POST   /v1/workorders/estimates/{estimateId}/approval
 *
 * Idempotency-Key header is forwarded for mutating operations per
 * DECISION-INVENTORY-012 via ApiBaseService options.
 */
@Injectable({ providedIn: 'root' })
export class WorkexecService {
  constructor(private readonly api: ApiBaseService) {}

  /** Builds an options object carrying the Idempotency-Key header when a key is provided. */
  private idempotencyOptions(key?: string) {
    return key ? { headers: { 'Idempotency-Key': key } } : undefined;
  }

  // ── CAP-002: Estimate CRUD ────────────────────────────────────────────────

  /**
   * operationId: createEstimate
   * POST /v1/workorders/estimates
   * Story 239
   */
  createEstimate(
    request: CreateEstimateRequest,
    idempotencyKey?: string,
  ): Observable<EstimateResponse> {
    return this.api.post<EstimateResponse>('/v1/workorders/estimates', request, this.idempotencyOptions(idempotencyKey));
  }

  /**
   * operationId: getEstimateById
   * GET /v1/workorders/estimates/{estimateId}
   * Stories 239, 238, 237, 234, 235
   */
  getEstimateById(estimateId: string): Observable<EstimateResponse> {
    return this.api.get<EstimateResponse>(`/v1/workorders/estimates/${estimateId}`);
  }

  // ── CAP-002: Estimate Items (Stories 238, 237) ────────────────────────────

  /**
   * operationId: addEstimateItem
   * POST /v1/workorders/estimates/{estimateId}/items
   * Stories 238, 237
   */
  addEstimateItem(
    estimateId: string,
    request: AddEstimateItemRequest,
    idempotencyKey?: string,
  ): Observable<EstimateItemResponse> {
    return this.api.post<EstimateItemResponse>(
      `/v1/workorders/estimates/${estimateId}/items`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: updateEstimateItem
   * PATCH /v1/workorders/estimates/{estimateId}/items/{itemId}
   * Stories 238, 237, 235
   */
  updateEstimateItem(
    estimateId: string,
    itemId: string,
    request: UpdateEstimateItemRequest,
    idempotencyKey?: string,
  ): Observable<EstimateItemResponse> {
    return this.api.patch<EstimateItemResponse>(
      `/v1/workorders/estimates/${estimateId}/items/${itemId}`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: deleteEstimateItem
   * DELETE /v1/workorders/estimates/{estimateId}/items/{itemId}
   */
  deleteEstimateItem(estimateId: string, itemId: string, idempotencyKey?: string): Observable<void> {
    return this.api.delete<void>(
      `/v1/workorders/estimates/${estimateId}/items/${itemId}`,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  // ── CAP-002: Totals (Story 236) ────────────────────────────────────────────

  /**
   * operationId: calculateEstimateTotals
   * POST /v1/workorders/estimates/{estimateId}/calculate-totals
   * Story 236
   */
  calculateEstimateTotals(
    estimateId: string,
    idempotencyKey?: string,
  ): Observable<CalculateEstimateTotalsResponse> {
    return this.api.post<CalculateEstimateTotalsResponse>(
      `/v1/workorders/estimates/${estimateId}/calculate-totals`,
      {},
      this.idempotencyOptions(idempotencyKey),
    );
  }

  // ── CAP-002: Revise (Story 235) ───────────────────────────────────────────

  /**
   * operationId: patchEstimateStatus
   * PATCH /v1/workorders/estimates/{estimateId}
   * Story 235 — reopen / state patch
   */
  patchEstimateStatus(
    estimateId: string,
    patch: Record<string, unknown>,
    idempotencyKey?: string,
  ): Observable<EstimateResponse> {
    return this.api.patch<EstimateResponse>(
      `/v1/workorders/estimates/${estimateId}`,
      patch,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: reopenEstimate
   * POST /v1/workorders/estimates/{estimateId}/reopen
   * Story 235
   */
  reopenEstimate(estimateId: string, idempotencyKey?: string): Observable<EstimateResponse> {
    return this.api.post<EstimateResponse>(
      `/v1/workorders/estimates/${estimateId}/reopen`,
      {},
      this.idempotencyOptions(idempotencyKey),
    );
  }

  // ── CAP-002: Summary + Snapshot (Story 234) ────────────────────────────────

  /**
   * operationId: createEstimateSnapshot
   * POST /v1/workorders/estimates/{estimateId}/snapshots
   * Story 234
   */
  createEstimateSnapshot(
    estimateId: string,
    notes?: string,
    idempotencyKey?: string,
  ): Observable<EstimateSnapshotResponse> {
    return this.api.post<EstimateSnapshotResponse>(
      `/v1/workorders/estimates/${estimateId}/snapshots`,
      { notes },
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: getEstimateSummary
   * GET /v1/workorders/estimates/{estimateId}/summary
   * Story 234
   */
  getEstimateSummary(estimateId: string): Observable<EstimateSummaryResponse> {
    return this.api.get<EstimateSummaryResponse>(
      `/v1/workorders/estimates/${estimateId}/summary`,
    );
  }

  // ── CAP-003: Approval Workflow ────────────────────────────────────────────

  /**
   * operationId: submitForApproval
   * POST /v1/workorders/estimates/{estimateId}/submit-for-approval
   * Story 233
   *
   * Note: AGENT_WORKSET lists `createEstimate` as the only operationId for Story 233.
   * Contract normalization via OpenAPI inspection reveals the actual operation is
   * `submitForApproval`. This finding is recorded in CAP-003/runs/latest.md.
   */
  submitForApproval(
    estimateId: string,
    idempotencyKey?: string,
  ): Observable<EstimateResponse> {
    return this.api.post<EstimateResponse>(
      `/v1/workorders/estimates/${estimateId}/submit-for-approval`,
      {},
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: approveEstimate
   * POST /v1/workorders/estimates/{estimateId}/approval
   * Stories 271 (digital), 270 (in-person), 269 (partial)
   *
   * Contract normalization: Stories 271, 269, 268 had empty operation_ids in
   * AGENT_WORKSET.yaml. OpenAPI inspection identifies `approveEstimate` as the
   * shared approval endpoint for digital, in-person, and partial approval.
   * Story 269 uses the same endpoint with `lineItemApprovals[]` for selective approval.
   * Story 268 expiration is detected from `approveEstimate` returning 400 with
   * APPROVAL_EXPIRED code and from `getEstimateById` returning `expiresAt` < now.
   */
  approveEstimate(
    estimateId: string,
    request: ApproveEstimateRequest,
    idempotencyKey?: string,
  ): Observable<EstimateResponse> {
    return this.api.post<EstimateResponse>(
      `/v1/workorders/estimates/${estimateId}/approval`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }
}
