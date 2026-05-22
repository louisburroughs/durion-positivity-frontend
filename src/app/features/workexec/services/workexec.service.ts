import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  ChangeRequestAPIService,
  EstimateAPIService,
  EstimatesFromAppointmentsService,
  OperationalContextService,
  SubstituteLinkAPIService,
  TechnicianAssignmentAPIService,
  TravelSegmentAPIService,
  WIPDashboardService,
  WorkOrderAPIService,
  WorkexecTimeTrackingAPIService,
  WorkorderDetailService,
  WorkorderLaborAPIService,
  WorkorderPartsUsageService,
  WorkorderPartAdjustmentsService,
  WorkorderPickFacadeService,
  WorkorderPickedItemsService,
} from '@durion-sdk/workorder';
import {
  AddEstimateItemRequest,
  ApproveEstimateRequest,
  AssignTechnicianRequest,
  CalculateEstimateTotalsResponse,
  ChangeRequestResponse,
  CompleteWorkorderRequest,
  CompleteWorkorderResponse,
  ConsumePickedItemsRequest,
  ConsumePartsRequest,
  ConsumptionResult,
  CreateChangeRequestRequest,
  CreateEstimateRequest,
  CreateLaborPerformedRequest,
  EstimateItemResponse,
  EstimateItemType,
  EstimateListItem,
  EstimateResponse,
  EstimateSnapshotResponse,
  EstimateSummaryResponse,
  EstimateStatus,
  FinalizeInvoiceRequest,
  FinalizeInvoiceResponse,
  FinalizeWorkorderRequest,
  FinalizeWorkorderResponse,
  IssuePartsRequest,
  OperationalContextResponse,
  PartUsageResponse,
  PickConfirmRequest,
  PickExecuteLine,
  PickListView,
  PickedItemLine,
  ReopenWorkorderRequest,
  ReopenWorkorderResponse,
  ScanResolveRequest,
  ReturnPartsRequest,
  StartLaborRequest,
  StopLaborRequest,
  SubstitutePartRequest,
  SubstituteLinkResponse,
  TechnicianAssignmentResponse,
  UpdateEstimateItemRequest,
  WorkorderDetailResponse,
  WorkorderInvoiceView,
  WorkorderLaborEntryResponse,
  WorkorderResponse,
  WorkorderSnapshotHistoryEntry,
  WorkorderStartResponse,
  WorkorderStatus,
  WorkorderTransition,
  WorkorderWipView,
  WipListFilters,
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
  private readonly api = inject(ApiBaseService);
  private readonly estimateApi = inject(EstimateAPIService);
  private readonly estimatesFromAppointments = inject(EstimatesFromAppointmentsService);
  private readonly changeRequest = inject(ChangeRequestAPIService);
  private readonly operationalContext = inject(OperationalContextService);
  private readonly technicianAssignment = inject(TechnicianAssignmentAPIService);
  private readonly workOrderApi = inject(WorkOrderAPIService);
  private readonly workorderDetail = inject(WorkorderDetailService);
  private readonly workorderLabor = inject(WorkorderLaborAPIService);
  private readonly workorderParts = inject(WorkorderPartsUsageService);
  private readonly workorderPickFacade = inject(WorkorderPickFacadeService);
  private readonly workorderPickedItems = inject(WorkorderPickedItemsService);
  private readonly travelSegment = inject(TravelSegmentAPIService);
  private readonly wipDashboard = inject(WIPDashboardService);
  private readonly substituteLink = inject(SubstituteLinkAPIService);
  private readonly workorderPartAdjustments = inject(WorkorderPartAdjustmentsService);
  private readonly timeTracking = inject(WorkexecTimeTrackingAPIService);

  /** Builds an options object carrying the Idempotency-Key header when a key is provided. */
  private idempotencyOptions(key?: string) {
    return key ? { headers: { 'Idempotency-Key': key } } : undefined;
  }

  // ── Private SDK request adapters ─────────────────────────────────────────────

  /**
   * Adapts local CreateEstimateRequest (optional crm fields) to SDK (required crm fields).
   */
  private toSdkCreateEstimateRequest(r: CreateEstimateRequest): import('@durion-sdk/workorder').CreateEstimateRequest {
    return {
      customerId: r.customerId,
      vehicleId: r.vehicleId,
      crmPartyId: r.crmPartyId ?? '',
      crmVehicleId: r.crmVehicleId ?? '',
      crmContactIds: r.crmContactIds ?? [],
      locationId: r.locationId,
      currencyUomId: r.currencyUomId,
      taxRegionId: r.taxRegionId,
    };
  }

  /**
   * Adapts local AddEstimateItemRequest (string union itemType) to SDK (enum itemType).
   */
  private toSdkAddEstimateItemRequest(r: AddEstimateItemRequest): import('@durion-sdk/workorder').AddEstimateItemRequest {
    return {
      itemType: r.itemType as import('@durion-sdk/workorder').AddEstimateItemRequestItemTypeEnum,
      description: r.description,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      taxCode: r.taxCode,
      productId: r.productId,
      serviceId: r.serviceId,
    };
  }

  /**
   * Adapts local AssignTechnicianRequest to SDK ReassignTechnicianRequest.
   * The reassign SDK method uses newTechnicianId instead of technicianId.
   */
  private toSdkReassignTechnicianRequest(r: AssignTechnicianRequest): import('@durion-sdk/workorder').ReassignTechnicianRequest {
    return {
      newTechnicianId: r.technicianId,
      reassignedByUserId: r.assignedByUserId,
      notes: r.notes,
    };
  }

  /**
   * Adapts local StartLaborRequest (optional technicianId) to SDK (required technicianId).
   */
  private toSdkStartLaborRequest(r: StartLaborRequest): import('@durion-sdk/workorder').StartLaborRequest {
    return {
      technicianId: r.technicianId ?? '',
      notes: undefined,
    };
  }

  /**
   * Adapts local IssuePartsRequest (partId) to SDK IssuePartRequest (workorderPartId).
   */
  private toSdkIssuePartRequest(r: IssuePartsRequest): import('@durion-sdk/workorder').IssuePartRequest {
    return {
      workorderPartId: r.partId,
      quantity: r.quantity,
      notes: r.notes,
    };
  }

  /**
   * Adapts local ConsumePartsRequest (partId) to SDK ConsumePartRequest (workorderPartId).
   */
  private toSdkConsumePartRequest(r: ConsumePartsRequest): import('@durion-sdk/workorder').ConsumePartRequest {
    return {
      workorderPartId: r.partId,
      quantity: r.quantity,
    };
  }

  /**
   * Adapts local ReturnPartsRequest (partId, reason) to SDK ReturnPartRequest (workorderPartId, notes).
   */
  private toSdkReturnPartRequest(r: ReturnPartsRequest): import('@durion-sdk/workorder').ReturnPartRequest {
    return {
      workorderPartId: r.partId,
      quantity: r.quantity,
      notes: r.reason,
    };
  }

  /**
   * Adapts local ReturnPartsRequest to SDK ReturnPartQuantityRequest (requires reason).
   */
  private toSdkReturnPartQuantityRequest(r: ReturnPartsRequest): import('@durion-sdk/workorder').ReturnPartQuantityRequest {
    return {
      workorderPartId: r.partId,
      quantity: r.quantity,
      reason: r.reason ?? '',
    };
  }

  /**
   * Adapts local ConsumePartsRequest to SDK CorrectPartQuantityRequest.
   * correctPartQuantity uses newQuantity and reason; partId maps to workorderPartId.
   */
  private toSdkCorrectPartQuantityRequest(r: ConsumePartsRequest): import('@durion-sdk/workorder').CorrectPartQuantityRequest {
    return {
      workorderPartId: r.partId,
      newQuantity: r.quantity,
      reason: '',
    };
  }

  /**
   * Adapts local ConsumePickedItemsRequest (lines with pickedItemId/quantity) to SDK
   * ConsumePickedItemsRequest (items with pickTaskId/quantityToConsume).
   */
  private toSdkConsumePickedItemsRequest(r: ConsumePickedItemsRequest): import('@durion-sdk/workorder').ConsumePickedItemsRequest {
    return {
      items: r.lines.map(line => ({
        pickTaskId: line.pickedItemId,
        quantityToConsume: line.quantity,
      })),
    };
  }

  /**
   * Adapts local CreateChangeRequestRequest to SDK CreateChangeRequestDTO.
   */
  private toSdkCreateChangeRequestDTO(r: CreateChangeRequestRequest): import('@durion-sdk/workorder').CreateChangeRequestDTO {
    return {
      description: r.description,
      services: r.requestedItems
        .filter(item => item.type === 'SERVICE')
        .map(item => ({ serviceEntityId: item.serviceId, quantity: item.quantity })),
      parts: r.requestedItems
        .filter(item => item.type === 'PART')
        .map(item => ({ productEntityId: item.partId, quantity: item.quantity })),
    };
  }

  /**
   * Adapts local CompleteWorkorderRequest to SDK CompleteWorkorderRequest.
   * SDK field `completionNotes` matches local; no required mismatch.
   */
  private toSdkCompleteWorkorderRequest(r: CompleteWorkorderRequest): import('@durion-sdk/workorder').CompleteWorkorderRequest {
    return {
      completionNotes: r.completionNotes,
    };
  }

  /**
   * Adapts local ReopenWorkorderRequest to SDK ReopenWorkorderRequest.
   * SDK has reopenReason as optional; local has it required.
   */
  private toSdkReopenWorkorderRequest(r: ReopenWorkorderRequest): import('@durion-sdk/workorder').ReopenWorkorderRequest {
    return {
      reopenReason: r.reopenReason,
    };
  }

  /**
   * Adapts startTimer body to SDK WorkexecTimerStartRequest.
   * Local uses workOrderId (camelCase capital O) but SDK uses workorderId (lowercase o).
   */
  private toSdkTimerStartRequest(
    body: { workOrderId: string; workOrderItemId?: string; laborCode?: string },
  ): import('@durion-sdk/workorder').WorkexecTimerStartRequest {
    return {
      workorderId: body.workOrderId,
      workorderItemId: body.workOrderItemId,
      laborCode: body.laborCode,
    };
  }

  // ── Private SDK response adapters ────────────────────────────────────────────

  /**
   * Adapts SDK EstimateItemResponse (all fields optional) to local EstimateItemResponse
   * (id, estimateId, itemType, quantity, unitPrice required).
   */
  private toEstimateItemResponse(dto: import('@durion-sdk/workorder').EstimateItemResponse): EstimateItemResponse {
    return {
      id: dto.id ?? '',
      estimateId: dto.estimateId ?? '',
      itemType: (dto.itemType as string as EstimateItemType) ?? 'PART',
      description: dto.description,
      quantity: dto.quantity ?? 0,
      unitPrice: dto.unitPrice ?? 0,
      lineTotal: dto.lineTotal,
      taxCode: dto.taxCode,
      productId: dto.productId,
      serviceId: dto.serviceId,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    };
  }

  /**
   * Adapts SDK EstimateResponse (status?: string, id?: string) to local EstimateResponse
   * (status: EstimateStatus required, id: string required).
   */
  private toEstimateResponse(dto: import('@durion-sdk/workorder').EstimateResponse): EstimateResponse {
    // SDK EstimateResponse does not declare an `items` field; items arrive as extra runtime properties.
    // Cast to include items as SDK EstimateItemResponse[] so each entry can be normalised through the adapter.
    const raw = dto as import('@durion-sdk/workorder').EstimateResponse & {
      items?: import('@durion-sdk/workorder').EstimateItemResponse[];
    };
    return {
      id: dto.id ?? '',
      estimateNumber: dto.estimateNumber,
      customerId: dto.customerId ?? '',
      vehicleId: dto.vehicleId ?? '',
      locationId: dto.locationId,
      currencyUomId: dto.currencyUomId,
      taxRegionId: dto.taxRegionId,
      status: (dto.status as EstimateStatus) ?? 'DRAFT',
      createdByUserId: dto.createdByUserId,
      createdAt: dto.createdAt,
      subtotal: dto.subtotal,
      taxAmount: dto.taxAmount,
      total: dto.total,
      submittedAt: dto.submittedAt,
      submittedBy: dto.submittedBy,
      expiresAt: dto.expiresAt,
      approvedAt: dto.approvedAt,
      approvedBy: dto.approvedBy,
      signatureData: dto.signatureData,
      signatureMimeType: dto.signatureMimeType,
      signerName: dto.signerName,
      approvalNotes: dto.approvalNotes,
      purchaseOrderNumber: dto.purchaseOrderNumber,
      version: dto.version,
      crmPartyId: dto.crmPartyId,
      crmVehicleId: dto.crmVehicleId,
      crmContactIds: dto.crmContactIds,
      items: (raw.items ?? []).map(i => this.toEstimateItemResponse(i)),
    };
  }

  /**
   * Adapts SDK WorkorderDetailResponse (workorderId, enum status) to local
   * WorkorderDetailResponse (id, WorkorderStatus union).
   */
  private toWorkorderDetailResponse(dto: import('@durion-sdk/workorder').WorkorderDetailResponse): WorkorderDetailResponse {
    const raw = dto as typeof dto & { crmPartyId?: string; crmVehicleId?: string; crmContactIds?: string[] };
    return {
      id: dto.workorderId,
      status: (dto.status as string as WorkorderStatus) ?? undefined,
      customerId: dto.customerId,
      vehicleId: dto.vehicleId,
      crmPartyId: raw.crmPartyId,
      crmVehicleId: raw.crmVehicleId,
      crmContactIds: raw.crmContactIds,
      primaryTechnicianId: dto.assignedTechnicianId,
      primaryTechnicianName: dto.assignedTechnicianName,
      isStarted: dto.isStarted === 'true',
      startedAt: dto.startedAt,
      isInProgress: dto.isInProgress === 'true',
      createdAt: dto.createdAt,
    };
  }

  /**
   * Adapts SDK CompleteWorkorderResponse to local CompleteWorkorderResponse.
   * SDK has workorderId?/currentStatus? but local requires workorderId/status.
   */
  private toCompleteWorkorderResponse(dto: import('@durion-sdk/workorder').CompleteWorkorderResponse): CompleteWorkorderResponse {
    return {
      workorderId: dto.workorderId ?? '',
      status: (dto.currentStatus as WorkorderStatus) ?? 'COMPLETED',
      completedAt: dto.completedAt,
    };
  }

  /**
   * Adapts SDK ReopenWorkorderResponse to local ReopenWorkorderResponse.
   * SDK has currentStatus? but local requires workorderId/status.
   */
  private toReopenWorkorderResponse(dto: import('@durion-sdk/workorder').ReopenWorkorderResponse): ReopenWorkorderResponse {
    return {
      workorderId: dto.workorderId ?? '',
      status: (dto.currentStatus as WorkorderStatus) ?? 'IN_PROGRESS',
      reopenedAt: dto.reopenedAt,
    };
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
    return this.estimateApi.createEstimate(this.toSdkCreateEstimateRequest(request), idempotencyKey).pipe(
      map(dto => this.toEstimateResponse(dto as import('@durion-sdk/workorder').EstimateResponse)),
    );
  }

  /**
   * operationId: getEstimateById
   * GET /v1/workorders/estimates/{estimateId}
   * Stories 239, 238, 237, 234, 235
   */
  getEstimateById(estimateId: string): Observable<EstimateResponse> {
    return this.estimateApi.getEstimateById(estimateId).pipe(
      map(dto => this.toEstimateResponse(dto)),
    );
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
    return this.estimateApi.addEstimateItem(estimateId, this.toSdkAddEstimateItemRequest(request)).pipe(
      map(dto => this.toEstimateItemResponse(dto)),
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
    return this.estimateApi.updateEstimateItem(estimateId, itemId, request).pipe(
      map(dto => this.toEstimateItemResponse(dto)),
    );
  }

  /**
   * operationId: deleteEstimateItem
   * DELETE /v1/workorders/estimates/{estimateId}/items/{itemId}
   */
  deleteEstimateItem(estimateId: string, itemId: string, idempotencyKey?: string): Observable<void> {
    return this.estimateApi.deleteEstimateItem(estimateId, itemId);
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
    return this.estimateApi.calculateEstimateTotals(estimateId) as Observable<CalculateEstimateTotalsResponse>;
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
    return this.estimateApi.patchEstimateStatus(estimateId, patch).pipe(
      map(dto => this.toEstimateResponse(dto as import('@durion-sdk/workorder').EstimateResponse)),
    );
  }

  /**
   * operationId: reopenEstimate
   * POST /v1/workorders/estimates/{estimateId}/reopen
   * Story 235
   */
  reopenEstimate(estimateId: string, idempotencyKey?: string): Observable<EstimateResponse> {
    return this.estimateApi.reopenEstimate(estimateId).pipe(
      map(dto => this.toEstimateResponse(dto)),
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
    return this.estimateApi.createEstimateSnapshot(estimateId, notes) as Observable<EstimateSnapshotResponse>;
  }

  /**
   * operationId: getEstimateSummary
   * GET /v1/workorders/estimates/{estimateId}/summary
   * Story 234
   */
  getEstimateSummary(estimateId: string): Observable<EstimateSummaryResponse> {
    return this.estimateApi.getEstimateSummary(estimateId) as Observable<EstimateSummaryResponse>;
  }

  /**
   * operationId: listEstimatesForCustomer
   * GET /v1/workorders/estimates?customerId={customerId}
   */
  listEstimatesForCustomer(customerId: string): Observable<EstimateListItem[]> {
    return this.estimateApi.getEstimatesByCustomer(customerId) as Observable<EstimateListItem[]>;
  }

  /**
   * operationId: listEstimatesForVehicle
   * GET /v1/workorders/estimates?vehicleId={vehicleId}
   */
  listEstimatesForVehicle(vehicleId: string): Observable<EstimateListItem[]> {
    const params = new HttpParams().set('vehicleId', vehicleId);
    return this.api.get<EstimateListItem[]>('/v1/workorders/estimates', params);
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
    return this.estimateApi.submitForApproval(estimateId).pipe(
      map(dto => this.toEstimateResponse(dto)),
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
    return this.estimateApi.approveEstimate(estimateId, request).pipe(
      map(dto => this.toEstimateResponse(dto)),
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
    return this.estimateApi.promoteEstimateToWorkorder(estimateId) as Observable<WorkorderResponse>;
  }

  /**
   * operationId: getWorkorderById
   * GET /v1/workorders/{workorderId}
   * Stories 230, 228
   */
  getWorkorderById(workorderId: string): Observable<WorkorderResponse> {
    return this.workOrderApi.getWorkorderById(workorderId) as Observable<WorkorderResponse>;
  }

  getWorkorder(workorderId: string): Observable<WorkorderResponse> {
    return this.getWorkorderById(workorderId);
  }

  /**
   * operationId: getWorkorderDetail
   * GET /v1/workorders/{workorderId}/detail
   * Stories 229, 226, 224
   */
  getWorkorderDetail(workorderId: string): Observable<WorkorderDetailResponse> {
    return this.workorderDetail.getWorkorderDetail(workorderId).pipe(
      map(dto => this.toWorkorderDetailResponse(dto)),
    );
  }

  /**
   * operationId: getTransitionHistory
   * GET /v1/workorders/{workorderId}/transitions
   * Stories 226, 224
   */
  getTransitionHistory(workorderId: string): Observable<WorkorderTransition[]> {
    return this.workOrderApi.getTransitionHistory(workorderId) as Observable<WorkorderTransition[]>;
  }

  /**
   * operationId: getOperationalContext
   * GET /v1/workorders/{workorderId}/operationalContext
   * Story 219 — role-based visibility flags
   */
  getOperationalContext(workorderId: string): Observable<OperationalContextResponse> {
    return this.operationalContext.getOperationalContext(workorderId) as Observable<OperationalContextResponse>;
  }

  /**
   * operationId: listActiveWorkorders
   * GET /v1/workorders/wip?wipStatus={...}
   */
  listActiveWorkorders(filters?: WipListFilters): Observable<WorkorderWipView[]> {
    let params = new HttpParams();
    if (filters?.wipStatus?.length) {
      params = params.set('wipStatus', filters.wipStatus.join(','));
    }
    return this.api.get<WorkorderWipView[]>('/v1/workorders/wip', params);
  }

  /**
   * operationId: getWorkorderWipStatus
   * GET /v1/workorders/{workorderId}/wip-status
   */
  getWorkorderWipStatus(workorderId: string): Observable<WorkorderWipView> {
    return this.api.get<WorkorderWipView>(`/v1/workorders/${workorderId}/wip-status`);
  }

  /**
   * operationId: getWorkorderInvoiceView
   * GET /v1/workorders/{workorderId}/invoice-view
   */
  getWorkorderInvoiceView(workorderId: string): Observable<WorkorderInvoiceView> {
    return this.api.get<WorkorderInvoiceView>(`/v1/workorders/${workorderId}/invoice-view`);
  }

  /**
   * operationId: requestInvoiceFinalization
   * POST /v1/workorders/{workorderId}/invoice/finalize
   */
  requestInvoiceFinalization(
    workorderId: string,
    request?: FinalizeInvoiceRequest,
  ): Observable<FinalizeInvoiceResponse> {
    return this.api.post<FinalizeInvoiceResponse>(
      `/v1/workorders/${workorderId}/invoice/finalize`,
      request ?? {},
    );
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
    return this.technicianAssignment.assignTechnician(workorderId, request, idempotencyKey) as Observable<TechnicianAssignmentResponse>;
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
    return this.technicianAssignment.reassignTechnician(workorderId, this.toSdkReassignTechnicianRequest(request), idempotencyKey) as Observable<TechnicianAssignmentResponse>;
  }

  /**
   * operationId: getTechnicianAssignment
   * GET /v1/workorders/{workorderId}/technician
   */
  getTechnicianAssignment(workorderId: string): Observable<TechnicianAssignmentResponse> {
    return this.technicianAssignment.getTechnicianAssignment(workorderId) as Observable<TechnicianAssignmentResponse>;
  }

  // ── CAP-005: Start Work (Story 224) ──────────────────────────────────────

  /**
   * operationId: startWork
   * POST /v1/workorders/{workorderId}/start
   */
  startWork(workorderId: string, idempotencyKey?: string): Observable<WorkorderStartResponse> {
    return this.operationalContext.startWork(workorderId) as Observable<WorkorderStartResponse>;
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
    return this.workorderLabor.startLaborSession(workorderId, serviceId, this.toSdkStartLaborRequest(request), idempotencyKey) as Observable<WorkorderLaborEntryResponse>;
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
    return this.workorderLabor.stopLaborSession(workorderId, entryId, idempotencyKey) as Observable<WorkorderLaborEntryResponse>;
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
    const sdkRequest: import('@durion-sdk/workorder').WorkexecLaborPerformedRequest = {
      workorderId: request.workorderId,
      technicianId: request.technicianId ?? '',
      performedAt: request.startTime ?? new Date().toISOString(),
      labor: { quantity: request.hoursWorked ?? 0, unit: 'HOURS' },
      source: { system: 'WORKEXEC', sourceReferenceId: request.workorderServiceId ?? '' },
    };
    return this.timeTracking.createLaborPerformed(idempotencyKey ?? '', sdkRequest) as Observable<WorkorderLaborEntryResponse>;
  }

  /**
   * operationId: getLaborHistory
   * GET /v1/workorders/{workorderId}/labor
   */
  getLaborHistory(workorderId: string): Observable<WorkorderLaborEntryResponse[]> {
    return this.workorderLabor.getLaborHistory(workorderId) as Observable<WorkorderLaborEntryResponse[]>;
  }

  // ── CAP-005: Parts (Stories 222, 221) ─────────────────────────────────────

  /**
   * operationId: issueParts
   * POST /v1/workorders/{workorderId}/parts/issue
   */
  issueParts(workorderId: string, request: IssuePartsRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.workorderParts.issueParts(workorderId, this.toSdkIssuePartRequest(request), idempotencyKey) as Observable<PartUsageResponse>;
  }

  /**
   * operationId: consumeParts
   * POST /v1/workorders/{workorderId}/parts/consume
   */
  consumeParts(workorderId: string, request: ConsumePartsRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.workorderParts.consumeParts(workorderId, this.toSdkConsumePartRequest(request), idempotencyKey) as Observable<PartUsageResponse>;
  }

  /**
   * operationId: returnParts
   * POST /v1/workorders/{workorderId}/parts/return
   */
  returnParts(workorderId: string, request: ReturnPartsRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.workorderParts.returnParts(workorderId, this.toSdkReturnPartRequest(request), idempotencyKey) as Observable<PartUsageResponse>;
  }

  /**
   * operationId: returnUnusedQuantity
   * POST /v1/workorders/{workorderId}/parts/returnUnused
   */
  returnUnusedQuantity(workorderId: string, request: ReturnPartsRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.workorderPartAdjustments.returnUnusedQuantity(workorderId, this.toSdkReturnPartQuantityRequest(request), idempotencyKey) as Observable<PartUsageResponse>;
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
    return this.substituteLink.suggestSubstitutes(workorderId) as Observable<SubstituteLinkResponse[]>;
  }

  /**
   * operationId: correctPartQuantity
   * POST /v1/workorders/{workorderId}/parts/correct
   */
  correctPartQuantity(workorderId: string, request: ConsumePartsRequest, idempotencyKey?: string): Observable<PartUsageResponse> {
    return this.workorderPartAdjustments.correctPartQuantity(workorderId, this.toSdkCorrectPartQuantityRequest(request), idempotencyKey) as Observable<PartUsageResponse>;
  }

  /**
   * operationId: getUsageHistory
   * GET /v1/workorders/{workorderId}/parts/usageHistory
   */
  getUsageHistory(workorderId: string): Observable<PartUsageResponse[]> {
    return this.workorderParts.getUsageHistory(workorderId) as Observable<PartUsageResponse[]>;
  }

  getWorkorderPickList(workorderId: string): Observable<PickListView> {
    return this.workorderPickFacade.getPickList(workorderId) as Observable<PickListView>;
  }

  getPickedItems(workorderId: string): Observable<PickedItemLine[]> {
    return this.workorderPickedItems.getPickedItems(workorderId) as Observable<PickedItemLine[]>;
  }

  consumePickedItems(
    workorderId: string,
    request: ConsumePickedItemsRequest,
  ): Observable<ConsumptionResult> {
    return this.workorderPickedItems.consumePickedItems(workorderId, this.toSdkConsumePickedItemsRequest(request)) as Observable<ConsumptionResult>;
  }

  resolvePickScan(workorderId: string, req: ScanResolveRequest): Observable<PickExecuteLine[]> {
    return this.api.post<PickExecuteLine[]>(
      `/workexec/v1/workorders/${encodeURIComponent(workorderId)}/picks/resolve-scan`,
      req,
    );
  }

  confirmPickLine(workorderId: string, req: PickConfirmRequest): Observable<PickExecuteLine> {
    return this.api.post<PickExecuteLine>(
      `/workexec/v1/workorders/${encodeURIComponent(workorderId)}/picks/confirm`,
      req,
    );
  }

  completePickList(
    workorderId: string,
  ): Observable<{ status: string; readonly completedAt?: string }> {
    return this.api.post<{ status: string; readonly completedAt?: string }>(
      `/workexec/v1/workorders/${encodeURIComponent(workorderId)}/picks/complete`,
      {},
    );
  }

  // ── CAP-005: Change Requests (Story 220) ──────────────────────────────────

  /**
   * operationId: getChangeRequestsByWorkorder
   * GET /v1/workorders/{workorderId}/changeRequests
   */
  getChangeRequestsByWorkorder(workorderId: string): Observable<ChangeRequestResponse[]> {
    return this.changeRequest.getChangeRequestsByWorkorder(workorderId) as Observable<ChangeRequestResponse[]>;
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
    return this.changeRequest.createChangeRequest(workorderId, this.toSdkCreateChangeRequestDTO(request), idempotencyKey) as Observable<ChangeRequestResponse>;
  }

  /**
   * operationId: getChangeRequestById
   * GET /v1/workorders/changeRequests/{changeId}
   */
  getChangeRequestById(changeId: string): Observable<ChangeRequestResponse> {
    return this.changeRequest.getChangeRequestById(changeId) as Observable<ChangeRequestResponse>;
  }

  /**
   * operationId: approveChangeRequest
   * POST /v1/workorders/changeRequests/{changeId}/approve
   * Story 220 (manager flow)
   */
  approveChangeRequest(changeId: string, notes?: string, idempotencyKey?: string): Observable<ChangeRequestResponse> {
    const sdkRequest: import('@durion-sdk/workorder').ApproveChangeRequestDTO = {
      approvalNote: notes ?? '',
    };
    return this.changeRequest.approveChangeRequest(changeId, sdkRequest) as Observable<ChangeRequestResponse>;
  }

  /**
   * operationId: declineChangeRequest
   * POST /v1/workorders/changeRequests/{changeId}/decline
   */
  declineChangeRequest(changeId: string, reason?: string, idempotencyKey?: string): Observable<ChangeRequestResponse> {
    const sdkRequest: import('@durion-sdk/workorder').DeclineChangeRequestDTO = {
      approvalNote: reason ?? '',
    };
    return this.changeRequest.declineChangeRequest(changeId, sdkRequest) as Observable<ChangeRequestResponse>;
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
    return this.workOrderApi.completeWorkorder(workorderId, this.toSdkCompleteWorkorderRequest(body)).pipe(
      map(dto => this.toCompleteWorkorderResponse(dto)),
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
    return this.workOrderApi.reopenWorkorder(workorderId, this.toSdkReopenWorkorderRequest(body)).pipe(
      map(dto => this.toReopenWorkorderResponse(dto)),
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
    return this.workOrderApi.getSnapshotHistory(workorderId) as Observable<WorkorderSnapshotHistoryEntry[]>;
  }

  /**
   * operationId: generateInvoice
   * POST /v1/workorders/{workorderId}/generate-invoice
   * CAP-007 Story 213 — triggers invoice draft creation; use billing service for detail.
   */
  generateInvoice(workorderId: string, idempotencyKey?: string): Observable<{ invoiceId: string; status?: string }> {
    return this.workOrderApi.generateInvoice(workorderId, idempotencyKey) as Observable<{ invoiceId: string; status?: string }>;
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
    const sdkRequest: import('@durion-sdk/workorder').OperationalContextOverrideRequest = {
      locationId: typeof body['locationId'] === 'string' ? body['locationId'] : '',
      bayId: typeof body['bayId'] === 'string' ? body['bayId'] : undefined,
      assignedMechanics: Array.isArray(body['assignedMechanics']) ? (body['assignedMechanics'] as string[]) : undefined,
      assignedResources: Array.isArray(body['assignedResources']) ? (body['assignedResources'] as string[]) : undefined,
      constraints: Array.isArray(body['constraints']) ? (body['constraints'] as string[]) : undefined,
    };
    return this.operationalContext.overrideOperationalContext(workorderId, sdkRequest) as Observable<OperationalContextResponse>;
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
    const sdkRequest: import('@durion-sdk/workorder').CreateEstimateFromAppointmentRequest = {
      idempotencyKey: idempotencyKey ?? (typeof body['idempotencyKey'] === 'string' ? body['idempotencyKey'] : ''),
      appointmentId: typeof body['appointmentId'] === 'string' ? body['appointmentId'] : '',
      customerId: typeof body['customerId'] === 'string' ? body['customerId'] : '',
      vehicleId: typeof body['vehicleId'] === 'string' ? body['vehicleId'] : '',
      locationId: typeof body['locationId'] === 'string' ? body['locationId'] : '',
      requestedServices: Array.isArray(body['requestedServices']) ? (body['requestedServices'] as string[]) : undefined,
    };
    return this.estimatesFromAppointments.createEstimateFromAppointment(sdkRequest).pipe(
      map(dto => ({
        id: dto.estimateId ?? '',
        customerId: '',
        vehicleId: '',
        status: (dto.status as EstimateStatus) ?? 'DRAFT',
      } as EstimateResponse)),
    );
  }

  // ── CAP-139: Travel Segments ────────────────────────────────────────────

  /**
   * operationId: startTravelSegment
   * POST /v1/workorders/travelSegments/start
   */
  startTravelSegment(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    const sdkRequest: import('@durion-sdk/workorder').StartTravelSegmentRequest = {
      mobileWorkAssignmentId: typeof body['mobileWorkAssignmentId'] === 'string' ? body['mobileWorkAssignmentId'] : '',
      technicianId: typeof body['technicianId'] === 'string' ? body['technicianId'] : '',
      segmentType: (typeof body['segmentType'] === 'string' ? body['segmentType'] : 'DEPART_SHOP') as import('@durion-sdk/workorder').StartTravelSegmentRequestSegmentTypeEnum,
      fromLocationId: typeof body['fromLocationId'] === 'string' ? body['fromLocationId'] : undefined,
      toLocationId: typeof body['toLocationId'] === 'string' ? body['toLocationId'] : undefined,
      workOrderId: typeof body['workOrderId'] === 'string' ? body['workOrderId'] : undefined,
    };
    return this.travelSegment.startTravelSegment(sdkRequest);
  }

  /**
   * operationId: stopTravelSegment
   * POST /v1/workorders/travelSegments/{travelSegmentId}/stop
   */
  stopTravelSegment(travelSegmentId: string, body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    const sdkRequest: import('@durion-sdk/workorder').StopTravelSegmentRequest = {
      toLocationId: typeof body['toLocationId'] === 'string' ? body['toLocationId'] : undefined,
      notes: typeof body['notes'] === 'string' ? body['notes'] : undefined,
    };
    return this.travelSegment.stopTravelSegment(travelSegmentId, sdkRequest);
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
    const sdkRequest: import('@durion-sdk/workorder').SubmitTravelSegmentsRequest = {
      workDate: typeof body['workDate'] === 'string' ? body['workDate'] : new Date().toISOString().slice(0, 10),
      notes: typeof body['notes'] === 'string' ? body['notes'] : undefined,
    };
    return this.travelSegment.submitTravelSegments(mobileWorkAssignmentId, sdkRequest);
  }

  getActiveTimerEntries(): Observable<unknown> {
    return this.timeTracking.getActiveTimerEntries();
  }

  startTimer(
    body: { workOrderId: string; workOrderItemId?: string; laborCode?: string },
    idempotencyKey: string,
  ): Observable<unknown> {
    return this.timeTracking.startTimer(this.toSdkTimerStartRequest(body), idempotencyKey);
  }

  stopTimers(idempotencyKey: string): Observable<unknown> {
    return this.timeTracking.stopTimers();
  }
}
