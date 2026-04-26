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

type AdjustmentStatus =
  | 'PENDING_APPROVAL'
  | 'AUTO_APPROVED'
  | 'APPROVED'
  | 'POSTED'
  | 'REJECTED'
  | 'FAILED';

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
    const status = this.toAdjustmentStatus(filter.status);
    return this.adjustmentsSdk.listAdjustments(status).pipe(
      map((response: AdjustmentResponse[] | AdjustmentPageResponse) => {
        if (Array.isArray(response)) {
          return this.toFilteredAdjustmentPageResponse(response, filter);
        }
        return this.filterAdjustmentPageResponse(response, filter);
      }),
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

  private toFilteredAdjustmentPageResponse(
    dtos: AdjustmentResponse[],
    filter: ApprovalQueueFilter,
  ): AdjustmentPageResponse {
    const page = this.toAdjustmentPageResponse(dtos);
    return this.filterAdjustmentPageResponse(page, filter);
  }

  private filterAdjustmentPageResponse(
    page: AdjustmentPageResponse,
    filter: ApprovalQueueFilter,
  ): AdjustmentPageResponse {
    const items = (page.items ?? []).filter(item => this.matchesAdjustmentFilter(item, filter));
    return {
      ...page,
      items,
    };
  }

  private matchesAdjustmentFilter(item: AdjustmentDetail, filter: ApprovalQueueFilter): boolean {
    if (filter.status && item.status !== filter.status) {
      return false;
    }
    if (filter.locationId && item.locationId !== filter.locationId) {
      return false;
    }
    if (filter.productSku && item.productSku !== filter.productSku) {
      return false;
    }
    if (
      filter.requiredApprovalTier != null
      && item.requiredApprovalTier !== filter.requiredApprovalTier
    ) {
      return false;
    }

    const createdAt = item.createdAt;
    if (filter.dateFrom && createdAt && createdAt < filter.dateFrom) {
      return false;
    }
    if (filter.dateTo && createdAt && createdAt > filter.dateTo) {
      return false;
    }

    return true;
  }

  private toAdjustmentStatus(
    status?: string,
  ): AdjustmentStatus | undefined {
    if (!status) {
      return undefined;
    }

    if (!this.isAdjustmentStatus(status)) {
      return undefined;
    }

    return status;
  }

  private isAdjustmentStatus(
    status: string,
  ): status is AdjustmentStatus {
    switch (status) {
      case 'PENDING_APPROVAL':
      case 'AUTO_APPROVED':
      case 'APPROVED':
      case 'POSTED':
      case 'REJECTED':
      case 'FAILED':
        return true;
      default:
        return false;
    }
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
