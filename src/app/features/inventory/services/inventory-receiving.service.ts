import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  ConfirmReceiptRequest,
  ReceiptResult,
  ReceivingDocumentResponse,
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
}
