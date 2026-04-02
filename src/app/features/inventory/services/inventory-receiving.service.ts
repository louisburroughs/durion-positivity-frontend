import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  AsnCreateRequest,
  AsnResponse,
  ConfirmReceiptRequest,
  CrossDockReceiveRequest,
  CrossDockReceiveResult,
  ReceiptResult,
  ReceivingDocumentResponse,
  ReceivingSessionFromAsnRequest,
  WorkorderCrossDockRef,
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryReceivingService {
  private readonly api = inject(ApiBaseService);

  getReceivingDocument(documentId: string, documentType: string): Observable<ReceivingDocumentResponse> {
    const params = new HttpParams().set('documentType', documentType);
    return this.api.get<ReceivingDocumentResponse>(
      `/inventory/v1/receiving/documents/${encodeURIComponent(documentId)}`,
      params,
    );
  }

  confirmReceipt(request: ConfirmReceiptRequest): Observable<ReceiptResult> {
    return this.api.post<ReceiptResult>('/inventory/v1/receiving/receipts', request);
  }

  createAsn(request: AsnCreateRequest): Observable<AsnResponse> {
    return this.api.post<AsnResponse>('/inventory/v1/asns', request);
  }

  getAsn(asnId: string): Observable<AsnResponse> {
    return this.api.get<AsnResponse>(`/inventory/v1/asns/${encodeURIComponent(asnId)}`);
  }

  createReceivingSessionFromAsn(
    request: ReceivingSessionFromAsnRequest,
  ): Observable<ReceivingDocumentResponse> {
    return this.api.post<ReceivingDocumentResponse>(
      '/inventory/v1/receiving/sessions/from-asn',
      request,
    );
  }

  searchWorkordersForCrossDock(query: string): Observable<WorkorderCrossDockRef[]> {
    const params = new HttpParams().set('query', query);
    return this.api.get<WorkorderCrossDockRef[]>('/inventory/v1/receiving/workorders', params);
  }

  submitCrossDockReceipt(request: CrossDockReceiveRequest): Observable<CrossDockReceiveResult> {
    return this.api.post<CrossDockReceiveResult>('/inventory/v1/receiving/cross-dock', request);
  }
}
