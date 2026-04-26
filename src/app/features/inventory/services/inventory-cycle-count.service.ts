import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  CycleCountAPIService,
  CycleCountAdjustmentsService,
  CycleCountPlansService,
  CycleCountTaskResponse,
  CountResponse,
  AdjustmentResponse,
  CycleCountPlanResponse,
  SubmitCountRequest,
  ApproveAdjustmentRequest,
  RejectAdjustmentRequest,
  CreateCycleCountPlanRequest,
} from '@durion-sdk/inventory';
import {
  AdjustmentDetail,
  AdjustmentPageResponse,
  ApprovalQueueFilter,
  CountSubmitRequest,
  CountSubmitResponse,
  CycleCountPlan,
  CycleCountPlanRequest,
  CycleCountTask,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryCycleCountService {
  private readonly api = inject(ApiBaseService);
  private readonly cycleCountSdk = inject(CycleCountAPIService);
  private readonly adjustmentsSdk = inject(CycleCountAdjustmentsService);
  private readonly plansSdk = inject(CycleCountPlansService);

  getCycleCountTask(taskId: string): Observable<CycleCountTask> {
    return this.cycleCountSdk.getTask(taskId).pipe(
      map((dto: CycleCountTaskResponse) => this.toCycleCountTask(dto)),
    );
  }

  submitCount(taskId: string, req: CountSubmitRequest): Observable<CountSubmitResponse> {
    const sdkRequest: SubmitCountRequest = this.toSubmitCountRequest(taskId, req);
    return this.cycleCountSdk.submitCount(sdkRequest).pipe(
      map((dto: CountResponse) => this.toCountSubmitResponse(dto)),
    );
  }

  queryAdjustments(filter: ApprovalQueueFilter): Observable<AdjustmentPageResponse> {
    const status = filter.status as 'PENDING_APPROVAL' | 'AUTO_APPROVED' | 'APPROVED' | 'POSTED' | 'REJECTED' | 'FAILED' | undefined;
    return this.adjustmentsSdk.listAdjustments(status).pipe(
      map((dtos: AdjustmentResponse[]) => this.toAdjustmentPageResponse(dtos)),
    );
  }

  getAdjustmentDetail(adjustmentId: string): Observable<AdjustmentDetail> {
    return this.adjustmentsSdk.getAdjustment(adjustmentId).pipe(
      map((dto: AdjustmentResponse) => this.toAdjustmentDetail(dto)),
    );
  }

  approveAdjustment(adjustmentId: string): Observable<AdjustmentDetail> {
    const sdkRequest: ApproveAdjustmentRequest = {};
    return this.adjustmentsSdk.approveAdjustment(adjustmentId, sdkRequest).pipe(
      map((dto: AdjustmentResponse) => this.toAdjustmentDetail(dto)),
    );
  }

  rejectAdjustment(adjustmentId: string, rejectionReason: string): Observable<AdjustmentDetail> {
    const sdkRequest: RejectAdjustmentRequest = { rejectorUserId: '', rejectionReason };
    return this.adjustmentsSdk.rejectAdjustment(adjustmentId, sdkRequest).pipe(
      map((dto: AdjustmentResponse) => this.toAdjustmentDetail(dto)),
    );
  }

  getCycleCountPlans(locationId?: string): Observable<CycleCountPlan[]> {
    let params = new HttpParams();
    if (locationId) {
      params = params.set('locationId', locationId);
    }
    return this.api.get<CycleCountPlan[]>('/inventory/v1/cycle-count-plans', params);
  }

  createCycleCountPlan(request: CycleCountPlanRequest): Observable<CycleCountPlan> {
    const sdkRequest: CreateCycleCountPlanRequest = this.toCreateCycleCountPlanRequest(request);
    return this.plansSdk.createPlan(sdkRequest).pipe(
      map((dto: CycleCountPlanResponse) => this.toCycleCountPlan(dto)),
    );
  }

  private toCycleCountTask(dto: CycleCountTaskResponse): CycleCountTask {
    return {
      cycleCountTaskId: dto.taskId ?? '',
      locationId: '',
      storageLocationId: dto.binLocation,
      productSku: dto.itemSku ?? '',
      uom: '',
      status: dto.status ?? '',
      assignedToId: dto.auditorId,
    };
  }

  private toSubmitCountRequest(taskId: string, req: CountSubmitRequest): SubmitCountRequest {
    const firstEntry = req.entries?.[0];
    return {
      taskId,
      auditorId: '',
      actualQuantity: firstEntry?.countedQuantity ?? 0,
    };
  }

  private toCountSubmitResponse(dto: CountResponse): CountSubmitResponse {
    return {
      cycleCountTaskId: dto.taskId ?? '',
      status: dto.taskStatus ?? '',
      entries: [],
    };
  }

  private toAdjustmentPageResponse(dtos: AdjustmentResponse[]): AdjustmentPageResponse {
    return {
      items: dtos.map((dto) => this.toAdjustmentDetail(dto)),
      nextPageToken: null,
    };
  }

  private toAdjustmentDetail(dto: AdjustmentResponse): AdjustmentDetail {
    return {
      adjustmentId: dto.adjustmentId ?? '',
      locationId: '',
      storageLocationId: undefined,
      productSku: dto.stockItemId ?? '',
      countedQuantity: dto.countedQuantity ?? 0,
      expectedQuantity: dto.quantityOnHandBefore ?? 0,
      varianceQuantity: dto.quantityChange ?? 0,
      varianceValue: dto.varianceValue,
      status: dto.status ?? '',
      requiredApprovalTier: 0,
      createdAt: dto.createdAt,
      approvedAt: dto.approvedAt,
      rejectedAt: dto.rejectedAt,
      rejectionReason: dto.rejectionReason,
      ledgerReference: dto.ledgerEntryId,
    };
  }

  private toCreateCycleCountPlanRequest(request: CycleCountPlanRequest): CreateCycleCountPlanRequest {
    return {
      locationId: request.locationId,
      zoneIds: request.zoneIds,
      planName: request.planName,
      scheduledDate: request.scheduledDate,
    };
  }

  private toCycleCountPlan(dto: CycleCountPlanResponse): CycleCountPlan {
    return {
      planId: dto.planId ?? '',
      locationId: dto.locationId ?? '',
      zoneIds: dto.zoneIds ?? [],
      planName: dto.planName,
      scheduledDate: dto.scheduledDate ?? '',
      status: dto.status ?? '',
      createdAt: dto.createdAt,
    };
  }
}
