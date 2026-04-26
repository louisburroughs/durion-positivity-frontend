import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  ASNService,
  ReceivingService,
  ReceivingSessionResponse,
  ReceiveItemsRequest,
  ReceiveItemsResponse,
  CreateAsnRequest,
  AsnResponse as SdkAsnResponse,
  CreateReceivingSessionRequest,
  CrossDockRequest,
  CrossDockResponse,
} from '@durion-sdk/inventory';
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
  private readonly asnSdk = inject(ASNService);
  private readonly receivingSdk = inject(ReceivingService);

  getReceivingDocument(documentId: string, _documentType: string): Observable<ReceivingDocumentResponse> {
    return this.receivingSdk.getReceivingSession(documentId).pipe(
      map((dto: ReceivingSessionResponse) => this.toReceivingDocumentResponse(dto)),
    );
  }

  confirmReceipt(request: ConfirmReceiptRequest): Observable<ReceiptResult> {
    const sdkRequest: ReceiveItemsRequest = this.toReceiveItemsRequest(request);
    return this.receivingSdk.receiveItemsIntoStaging(request.documentId, sdkRequest).pipe(
      map((dto: ReceiveItemsResponse) => this.toReceiptResult(dto)),
    );
  }

  createAsn(request: AsnCreateRequest): Observable<AsnResponse> {
    const sdkRequest: CreateAsnRequest = this.toCreateAsnRequest(request);
    return this.asnSdk.createAsn(sdkRequest).pipe(
      map((dto: SdkAsnResponse) => this.toAsnResponse(dto)),
    );
  }

  getAsn(asnId: string): Observable<AsnResponse> {
    return this.asnSdk.getAsn(asnId).pipe(
      map((dto: SdkAsnResponse) => this.toAsnResponse(dto)),
    );
  }

  createReceivingSessionFromAsn(
    request: ReceivingSessionFromAsnRequest,
  ): Observable<ReceivingDocumentResponse> {
    const sdkRequest: CreateReceivingSessionRequest = this.toCreateReceivingSessionRequest(request);
    return this.receivingSdk.createReceivingSession(sdkRequest).pipe(
      map((dto: ReceivingSessionResponse) => this.toReceivingDocumentResponse(dto)),
    );
  }

  searchWorkordersForCrossDock(query: string): Observable<WorkorderCrossDockRef[]> {
    const params = new HttpParams().set('query', query);
    return this.api.get<WorkorderCrossDockRef[]>('/inventory/v1/receiving/workorders', params);
  }

  submitCrossDockReceipt(request: CrossDockReceiveRequest): Observable<CrossDockReceiveResult> {
    const sdkRequest: CrossDockRequest = this.toCrossDockRequest(request);
    return this.receivingSdk.crossDockLineToWorkorder(request.sessionId, request.receivingLineId, sdkRequest).pipe(
      map((dto: CrossDockResponse) => this.toCrossDockReceiveResult(dto)),
    );
  }

  private toReceivingDocumentResponse(dto: ReceivingSessionResponse): ReceivingDocumentResponse {
    return {
      documentId: dto.sessionId ?? '',
      documentType: dto.sourceDocumentType ?? '',
      status: dto.status ?? '',
      locationId: '',
      stagingStorageLocationId: '',
      stagingStorageLocationName: '',
      lines: (dto.lines ?? []).map((line) => ({
        receivingLineId: line.lineId ?? '',
        productSku: line.productId ?? '',
        expectedQty: line.expectedQuantity ?? 0,
        expectedUomId: '',
        state: line.status ?? '',
        isReceivable: true,
      })),
    };
  }

  private toReceiveItemsRequest(request: ConfirmReceiptRequest): ReceiveItemsRequest {
    return {
      lines: (request.lines ?? []).map((line) => ({
        lineId: line.receivingLineId,
        receivedQuantity: line.actualQty,
      })),
    };
  }

  private toReceiptResult(dto: ReceiveItemsResponse): ReceiptResult {
    return {
      receiptCorrelationId: dto.sessionId ?? '',
      receivedByUserId: '',
      lines: [],
      ledgerEntryCount: dto.linesProcessed,
    };
  }

  private toCreateAsnRequest(request: AsnCreateRequest): CreateAsnRequest {
    return {
      vendorId: request.supplierId,
      asnReferenceNumber: request.supplierShipmentRef,
      relatedPoIds: [request.poId],
      lineItems: (request.lines ?? []).map((line) => ({
        poId: request.poId,
        poLineId: line.poLineId,
        sku: '',
        quantityShipped: line.expectedQty,
      })),
    };
  }

  private toAsnResponse(dto: SdkAsnResponse): AsnResponse {
    return {
      asnId: dto.asnId ?? '',
      poId: '',
      status: dto.status ?? '',
      createdAt: dto.createdAt,
      lines: (dto.lineItems ?? []).map((line) => ({
        asnLineId: line.asnLineId ?? '',
        poLineId: line.poId ?? '',
        expectedQty: line.quantityShipped ?? 0,
      })),
    };
  }

  private toCreateReceivingSessionRequest(request: ReceivingSessionFromAsnRequest): CreateReceivingSessionRequest {
    return {
      sourceDocumentId: request.asnId,
    };
  }

  private toCrossDockRequest(request: CrossDockReceiveRequest): CrossDockRequest {
    return {
      workorderId: request.workorderId,
      workorderLineId: request.workorderLineId,
      quantity: request.quantity,
      notes: request.overrideReasonCode,
    };
  }

  private toCrossDockReceiveResult(dto: CrossDockResponse): CrossDockReceiveResult {
    return {
      issueReferenceId: dto.lineId ?? '',
      issueMode: '',
    };
  }
}
