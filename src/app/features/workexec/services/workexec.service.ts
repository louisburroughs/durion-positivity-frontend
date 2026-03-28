import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  AddEstimateItemRequest,
  ApproveEstimateRequest,
  AssignTechnicianRequest,
  CalculateEstimateTotalsResponse,
  ChangeRequestResponse,
  CompleteWorkorderRequest,
  CompleteWorkorderResponse,
  ConsumePartsRequest,
  CreateChangeRequestRequest,
  CreateEstimateRequest,
  CreateLaborPerformedRequest,
  EstimateItemResponse,
  EstimateResponse,
  EstimateSnapshotResponse,
  EstimateSummaryResponse,
  FinalizeWorkorderRequest,
  FinalizeWorkorderResponse,
  IssuePartsRequest,
  OperationalContextResponse,
  PartUsageResponse,
  ReopenWorkorderRequest,
  ReopenWorkorderResponse,
  ReturnPartsRequest,
  StartLaborRequest,
  StopLaborRequest,
  SubstitutePartRequest,
  SubstituteLinkResponse,
  TechnicianAssignmentResponse,
  UpdateEstimateItemRequest,
  WorkorderDetailResponse,
  WorkorderLaborEntryResponse,
  WorkorderResponse,
  WorkorderSnapshotHistoryEntry,
  WorkorderStartResponse,
  WorkorderTransition,
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
 *
 * CAP-004 (Promotion) operationId mapping:
 *   promoteEstimateToWorkorder → POST /v1/workorders/estimates/{estimateId}/promote
 *   getWorkorderById           → GET  /v1/workorders/{workorderId}
 *   getWorkorderDetail         → GET  /v1/workorders/{workorderId}/detail
 *   getTransitionHistory       → GET  /v1/workorders/{workorderId}/transitions
 *
 * CAP-005 (Execution) operationId mapping:
 *   assignTechnician           → POST   /v1/workorders/{workorderId}/technician
 *   reassignTechnician         → PUT    /v1/workorders/{workorderId}/technician
 *   getTechnicianAssignment    → GET    /v1/workorders/{workorderId}/technician
 *   startWork                  → POST   /v1/workorders/{workorderId}/start
 *   startLaborSession          → POST   /v1/workorders/{workorderId}/services/{serviceId}/labor/start
 *   stopLaborSession           → POST   /v1/workorders/{workorderId}/labor/{entryId}/stop
 *   createLaborPerformed       → POST   /v1/workexec/labor-performed
 *   getLaborHistory            → GET    /v1/workorders/{workorderId}/labor
 *   issueParts                 → POST   /v1/workorders/{workorderId}/parts/issue
 *   consumeParts               → POST   /v1/workorders/{workorderId}/parts/consume
 *   returnParts                → POST   /v1/workorders/{workorderId}/parts/return
 *   returnUnusedQuantity       → POST   /v1/workorders/{workorderId}/parts/returnUnused
 *   substitutePart             → POST   /v1/workorders/{workorderId}/parts/substitute
 *   suggestSubstitutes         → POST   /v1/workorders/{workorderId}/suggestSubstitutes
 *   correctPartQuantity        → POST   /v1/workorders/{workorderId}/parts/correct
 *   getUsageHistory            → GET    /v1/workorders/{workorderId}/parts/usageHistory
 *   getOperationalContext      → GET    /v1/workorders/{workorderId}/operationalContext
 *   getChangeRequestsByWorkorder → GET  /v1/workorders/{workorderId}/changeRequests
 *   createChangeRequest        → POST   /v1/workorders/{workorderId}/changeRequests
 *   approveChangeRequest       → POST   /v1/workorders/changeRequests/{changeId}/approve
 *   declineChangeRequest       → POST   /v1/workorders/changeRequests/{changeId}/decline
 *   getChangeRequestById       → GET    /v1/workorders/changeRequests/{changeId}
 */
@Injectable({ providedIn: 'root' })
export class WorkexecService {
  constructor(private readonly api: ApiBaseService) { }

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

  // ── CAP-004: Workorder Promotion ──────────────────────────────────────────

  /**
   * operationId: promoteEstimateToWorkorder
   * POST /v1/workorders/estimates/{estimateId}/promote
   * Stories 231, 230, 228, 227
   *
   * Contract normalization: empty in AGENT_WORKSET. OpenAPI path verified:
   * POST /v1/workorders/estimates/{estimateId}/promote with optional Idempotency-Key header.
   * Returns WorkorderResponse (201) or 409 Conflict with existingWorkorderId.
   */
  promoteEstimateToWorkorder(estimateId: string, idempotencyKey?: string): Observable<WorkorderResponse> {
    return this.api.post<WorkorderResponse>(
      `/v1/workorders/estimates/${estimateId}/promote`,
      {},
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: getWorkorderById
   * GET /v1/workorders/{workorderId}
   * Stories 230, 228
   */
  getWorkorderById(workorderId: string): Observable<WorkorderResponse> {
    return this.api.get<WorkorderResponse>(`/v1/workorders/${workorderId}`);
  }

  getWorkorder(workorderId: string): Observable<WorkorderResponse> {
    return this.getWorkorderById(workorderId);
  }

  /**
   * operationId: getWorkorderDetail
   * GET /v1/workorders/{workorderId}/detail
   * Stories 229, 226, 224
   *
   * Accepts X-Authorities header for role-gated field exposure.
   * Contract normalization: empty in AGENT_WORKSET. Path verified from OpenAPI.
   */
  getWorkorderDetail(workorderId: string, authorities?: string): Observable<WorkorderDetailResponse> {
    const opts = authorities ? { headers: { 'X-Authorities': authorities } } : undefined;
    return this.api.get<WorkorderDetailResponse>(`/v1/workorders/${workorderId}/detail`, undefined, opts);
  }

  /**
   * operationId: getTransitionHistory
   * GET /v1/workorders/{workorderId}/transitions
   * Stories 226, 224
   */
  getTransitionHistory(workorderId: string): Observable<WorkorderTransition[]> {
    return this.api.get<WorkorderTransition[]>(`/v1/workorders/${workorderId}/transitions`);
  }

  /**
   * operationId: getOperationalContext
   * GET /v1/workorders/{workorderId}/operationalContext
   * Story 219 — role-based visibility flags
   */
  getOperationalContext(workorderId: string): Observable<OperationalContextResponse> {
    return this.api.get<OperationalContextResponse>(`/v1/workorders/${workorderId}/operationalContext`);
  }

  // ── CAP-005: Technician Assignment (Story 225) ────────────────────────────

  /**
   * operationId: assignTechnician
   * POST /v1/workorders/{workorderId}/technician
   */
  assignTechnician(
    workorderId: string,
    request: AssignTechnicianRequest,
    idempotencyKey?: string,
  ): Observable<TechnicianAssignmentResponse> {
    return this.api.post<TechnicianAssignmentResponse>(
      `/v1/workorders/${workorderId}/technician`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: reassignTechnician
   * PUT /v1/workorders/{workorderId}/technician
   */
  reassignTechnician(
    workorderId: string,
    request: AssignTechnicianRequest,
    idempotencyKey?: string,
  ): Observable<TechnicianAssignmentResponse> {
    return this.api.put<TechnicianAssignmentResponse>(
      `/v1/workorders/${workorderId}/technician`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: getTechnicianAssignment
   * GET /v1/workorders/{workorderId}/technician
   */
  getTechnicianAssignment(workorderId: string): Observable<TechnicianAssignmentResponse> {
    return this.api.get<TechnicianAssignmentResponse>(`/v1/workorders/${workorderId}/technician`);
  }

  // ── CAP-005: Start Work (Story 224) ──────────────────────────────────────

  /**
   * operationId: startWork
   * POST /v1/workorders/{workorderId}/start
   */
  startWork(workorderId: string, idempotencyKey?: string): Observable<WorkorderStartResponse> {
    return this.api.post<WorkorderStartResponse>(
      `/v1/workorders/${workorderId}/start`,
      {},
      this.idempotencyOptions(idempotencyKey),
    );
  }

  // ── CAP-005: Labor Sessions (Story 223) ──────────────────────────────────

  /**
   * operationId: startLaborSession
   * POST /v1/workorders/{workorderId}/services/{serviceId}/labor/start
   */
  startLaborSession(
    workorderId: string,
    serviceId: string,
    request: StartLaborRequest,
    idempotencyKey?: string,
  ): Observable<WorkorderLaborEntryResponse> {
    return this.api.post<WorkorderLaborEntryResponse>(
      `/v1/workorders/${workorderId}/services/${serviceId}/labor/start`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: stopLaborSession
   * POST /v1/workorders/{workorderId}/labor/{entryId}/stop
   */
  stopLaborSession(
    workorderId: string,
    entryId: string,
    request: StopLaborRequest,
    idempotencyKey?: string,
  ): Observable<WorkorderLaborEntryResponse> {
    return this.api.post<WorkorderLaborEntryResponse>(
      `/v1/workorders/${workorderId}/labor/${entryId}/stop`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: createLaborPerformed
   * POST /v1/workexec/labor-performed
   * Manual labor entry (no session)
   */
  createLaborPerformed(
    request: CreateLaborPerformedRequest,
    idempotencyKey?: string,
  ): Observable<WorkorderLaborEntryResponse> {
    return this.api.post<WorkorderLaborEntryResponse>(
      `/v1/workexec/labor-performed`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: getLaborHistory
   * GET /v1/workorders/{workorderId}/labor
   */
  getLaborHistory(workorderId: string): Observable<WorkorderLaborEntryResponse[]> {
    return this.api.get<WorkorderLaborEntryResponse[]>(`/v1/workorders/${workorderId}/labor`);
  }

  // ── CAP-005: Parts (Stories 222, 221) ─────────────────────────────────────

  /**
   * operationId: issueParts
   * POST /v1/workorders/{workorderId}/parts/issue
   */
  issueParts(workorderId: string, request: IssuePartsRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.api.post<PartUsageResponse>(
      `/v1/workorders/${workorderId}/parts/issue`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: consumeParts
   * POST /v1/workorders/{workorderId}/parts/consume
   */
  consumeParts(workorderId: string, request: ConsumePartsRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.api.post<PartUsageResponse>(
      `/v1/workorders/${workorderId}/parts/consume`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: returnParts
   * POST /v1/workorders/{workorderId}/parts/return
   */
  returnParts(workorderId: string, request: ReturnPartsRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.api.post<PartUsageResponse>(
      `/v1/workorders/${workorderId}/parts/return`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: returnUnusedQuantity
   * POST /v1/workorders/{workorderId}/parts/returnUnused
   */
  returnUnusedQuantity(workorderId: string, request: ReturnPartsRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.api.post<PartUsageResponse>(
      `/v1/workorders/${workorderId}/parts/returnUnused`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: substitutePart
   * POST /v1/workorders/{workorderId}/parts/substitute
   * Story 221
   */
  substitutePart(workorderId: string, request: SubstitutePartRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.api.post<PartUsageResponse>(
      `/v1/workorders/${workorderId}/parts/substitute`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: suggestSubstitutes
   * POST /v1/workorders/{workorderId}/suggestSubstitutes
   * Story 221
   */
  suggestSubstitutes(workorderId: string, partId: string): Observable<SubstituteLinkResponse[]> {
    return this.api.post<SubstituteLinkResponse[]>(
      `/v1/workorders/${workorderId}/suggestSubstitutes`,
      { partId },
    );
  }

  /**
   * operationId: correctPartQuantity
   * POST /v1/workorders/{workorderId}/parts/correct
   */
  correctPartQuantity(workorderId: string, request: ConsumePartsRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.api.post<PartUsageResponse>(
      `/v1/workorders/${workorderId}/parts/correct`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: getUsageHistory
   * GET /v1/workorders/{workorderId}/parts/usageHistory
   */
  getUsageHistory(workorderId: string): Observable<PartUsageResponse[]> {
    return this.api.get<PartUsageResponse[]>(`/v1/workorders/${workorderId}/parts/usageHistory`);
  }

  // ── CAP-005: Change Requests (Story 220) ──────────────────────────────────

  /**
   * operationId: getChangeRequestsByWorkorder
   * GET /v1/workorders/{workorderId}/changeRequests
   */
  getChangeRequestsByWorkorder(workorderId: string): Observable<ChangeRequestResponse[]> {
    return this.api.get<ChangeRequestResponse[]>(`/v1/workorders/${workorderId}/changeRequests`);
  }

  /**
   * operationId: createChangeRequest
   * POST /v1/workorders/{workorderId}/changeRequests
   */
  createChangeRequest(
    workorderId: string,
    request: CreateChangeRequestRequest,
    idempotencyKey?: string,
  ): Observable<ChangeRequestResponse> {
    return this.api.post<ChangeRequestResponse>(
      `/v1/workorders/${workorderId}/changeRequests`,
      request,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: getChangeRequestById
   * GET /v1/workorders/changeRequests/{changeId}
   */
  getChangeRequestById(changeId: string): Observable<ChangeRequestResponse> {
    return this.api.get<ChangeRequestResponse>(`/v1/workorders/changeRequests/${changeId}`);
  }

  /**
   * operationId: approveChangeRequest
   * POST /v1/workorders/changeRequests/{changeId}/approve
   * Story 220 (manager flow)
   */
  approveChangeRequest(changeId: string, notes?: string, idempotencyKey?: string): Observable<ChangeRequestResponse> {
    return this.api.post<ChangeRequestResponse>(
      `/v1/workorders/changeRequests/${changeId}/approve`,
      { notes },
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: declineChangeRequest
   * POST /v1/workorders/changeRequests/{changeId}/decline
   */
  declineChangeRequest(changeId: string, reason?: string, idempotencyKey?: string): Observable<ChangeRequestResponse> {
    return this.api.post<ChangeRequestResponse>(
      `/v1/workorders/changeRequests/${changeId}/decline`,
      { reason },
      this.idempotencyOptions(idempotencyKey),
    );
  }

  // ── CAP-006: Complete / Reopen / Finalize (Stories 215, 214, 216) ──────────

  /**
   * operationId: completeWorkorder
   * POST /v1/workorders/{workorderId}/complete
   */
  completeWorkorder(
    workorderId: string,
    body: CompleteWorkorderRequest,
    idempotencyKey?: string,
  ): Observable<CompleteWorkorderResponse> {
    return this.api.post<CompleteWorkorderResponse>(
      `/v1/workorders/${workorderId}/complete`,
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: reopenWorkorder
   * POST /v1/workorders/{workorderId}/reopen
   */
  reopenWorkorder(
    workorderId: string,
    body: ReopenWorkorderRequest,
    idempotencyKey?: string,
  ): Observable<ReopenWorkorderResponse> {
    return this.api.post<ReopenWorkorderResponse>(
      `/v1/workorders/${workorderId}/reopen`,
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * POST /v1/workorders/{workorderId}/finalize
   * Creates billable scope snapshot (Story 216).
   */
  finalizeWorkorder(
    workorderId: string,
    body: FinalizeWorkorderRequest,
    idempotencyKey?: string,
  ): Observable<FinalizeWorkorderResponse> {
    return this.api.post<FinalizeWorkorderResponse>(
      `/v1/workorders/${workorderId}/finalize`,
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: getSnapshotHistory
   * GET /v1/workorders/{workorderId}/snapshots
   */
  getSnapshotHistory(workorderId: string): Observable<WorkorderSnapshotHistoryEntry[]> {
    return this.api.get<WorkorderSnapshotHistoryEntry[]>(`/v1/workorders/${workorderId}/snapshots`);
  }

  /**
   * operationId: generateInvoice
   * POST /v1/workorders/{workorderId}/generate-invoice
   * CAP-007 Story 213 — triggers invoice draft creation; use billing service for detail.
   */
  generateInvoice(workorderId: string, idempotencyKey?: string): Observable<{ invoiceId: string; status?: string }> {
    return this.api.post<{ invoiceId: string; status?: string }>(
      `/v1/workorders/${workorderId}/generate-invoice`,
      {},
      this.idempotencyOptions(idempotencyKey),
    );
  }

  // ── CAP-140: Operational Context override ───────────────────────────────

  /**
   * operationId: overrideOperationalContext
   * POST /v1/workorders/{workorderId}/operationalContext/override
   */
  overrideOperationalContext(
    workorderId: string,
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ): Observable<OperationalContextResponse> {
    return this.api.post<OperationalContextResponse>(
      `/v1/workorders/${workorderId}/operationalContext/override`,
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  // ── CAP-140: Estimate from Appointment ─────────────────────────────────

  /**
   * operationId: createEstimateFromAppointment
   * POST /v1/workorders/estimates/from-appointment
   */
  createEstimateFromAppointment(
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ): Observable<EstimateResponse> {
    return this.api.post<EstimateResponse>(
      '/v1/workorders/estimates/from-appointment',
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  // ── CAP-139: Travel Segments ────────────────────────────────────────────

  /**
   * operationId: startTravelSegment
   * POST /v1/workorders/travelSegments/start
   */
  startTravelSegment(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>(
      '/v1/workorders/travelSegments/start',
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: stopTravelSegment
   * POST /v1/workorders/travelSegments/{travelSegmentId}/stop
   */
  stopTravelSegment(travelSegmentId: string, body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>(
      `/v1/workorders/travelSegments/${travelSegmentId}/stop`,
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  /**
   * operationId: submitTravelSegments
   * POST /v1/workorders/travelSegments/submit/{mobileWorkAssignmentId}
   */
  submitTravelSegments(
    mobileWorkAssignmentId: string,
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ): Observable<unknown> {
    return this.api.post<unknown>(
      `/v1/workorders/travelSegments/submit/${mobileWorkAssignmentId}`,
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  getActiveTimerEntries(): Observable<unknown> {
    return this.api.get<unknown>('/v1/workexec/time-entries/timer/active');
  }

  startTimer(
    body: { workOrderId: string; workOrderItemId?: string; laborCode?: string },
    idempotencyKey: string,
  ): Observable<unknown> {
    return this.api.post<unknown>(
      '/v1/workexec/time-entries/timer/start',
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  stopTimers(idempotencyKey: string): Observable<unknown> {
    return this.api.post<unknown>(
      '/v1/workexec/time-entries/timer/stop',
      {},
      this.idempotencyOptions(idempotencyKey),
    );
  }
}
