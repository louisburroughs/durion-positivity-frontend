import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  AdjustmentDetail,
  AdjustmentPageResponse,
  ApprovalQueueFilter,
  CountSubmitRequest,
  CountSubmitResponse,
  CycleCountTask,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryCycleCountService {
  private readonly api = inject(ApiBaseService);

  getCycleCountTask(taskId: string): Observable<CycleCountTask> {
    return this.api.get<CycleCountTask>(
      `/inventory/v1/cycle-counts/tasks/${encodeURIComponent(taskId)}`,
    );
  }

  submitCount(taskId: string, req: CountSubmitRequest): Observable<CountSubmitResponse> {
    return this.api.post<CountSubmitResponse>(
      `/inventory/v1/cycle-counts/tasks/${encodeURIComponent(taskId)}/entries`,
      req,
    );
  }

  queryAdjustments(filter: ApprovalQueueFilter): Observable<AdjustmentPageResponse> {
    let params = new HttpParams();
    if (filter.status != null) { params = params.set('status', filter.status); }
    if (filter.locationId != null) { params = params.set('locationId', filter.locationId); }
    if (filter.productSku != null) { params = params.set('productSku', filter.productSku); }
    if (filter.requiredApprovalTier != null) { params = params.set('requiredApprovalTier', String(filter.requiredApprovalTier)); }
    if (filter.dateFrom != null) { params = params.set('dateFrom', filter.dateFrom); }
    if (filter.dateTo != null) { params = params.set('dateTo', filter.dateTo); }
    if (filter.pageToken != null) { params = params.set('pageToken', filter.pageToken); }
    return this.api.get<AdjustmentPageResponse>('/inventory/v1/adjustments', params);
  }

  getAdjustmentDetail(adjustmentId: string): Observable<AdjustmentDetail> {
    return this.api.get<AdjustmentDetail>(
      `/inventory/v1/adjustments/${encodeURIComponent(adjustmentId)}`,
    );
  }

  approveAdjustment(adjustmentId: string): Observable<AdjustmentDetail> {
    return this.api.post<AdjustmentDetail>(
      `/inventory/v1/adjustments/${encodeURIComponent(adjustmentId)}/approve`,
      {},
    );
  }

  rejectAdjustment(adjustmentId: string, rejectionReason: string): Observable<AdjustmentDetail> {
    return this.api.post<AdjustmentDetail>(
      `/inventory/v1/adjustments/${encodeURIComponent(adjustmentId)}/reject`,
      { rejectionReason },
    );
  }
}
