import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { FinalizationRequest, InvoiceDetailsResponse, InvoiceService } from '@durion-sdk/invoice';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  ArtifactDownloadToken,
  GenerateReceiptRequest,
  InvoiceArtifact,
  InvoiceDetail,
  IssueInvoiceRequest,
  PaymentMethod,
  PaymentTransactionRef,
  ReceiptRef,
} from '../models/billing.models';

@Injectable({ providedIn: 'root' })
export class BillingTransportService {
  private readonly api = inject(ApiBaseService);
  private readonly invoiceService = inject(InvoiceService);

  loadInvoiceDetail(invoiceId: string): Observable<InvoiceDetail> {
    return this.invoiceService.getInvoice(invoiceId).pipe(
      map(result => this.toInvoiceDetail(result)),
    );
  }

  loadInvoiceArtifacts(invoiceId: string): Observable<InvoiceArtifact[]> {
    return this.api.get<InvoiceArtifact[]>(`/billing/invoices/${invoiceId}/artifacts`);
  }

  elevate(password: string): Observable<{ elevationToken: string }> {
    return this.api.post<{ elevationToken: string }>('/billing/auth/elevate', { password });
  }

  issueInvoice(invoiceId: string, request: IssueInvoiceRequest): Observable<InvoiceDetail> {
    const body: FinalizationRequest = {
      managerApprovalCode: request.elevationToken,
    };
    return this.invoiceService.finalizeInvoice(invoiceId, body).pipe(
      map(result => this.toInvoiceDetail(result)),
    );
  }

  createArtifactDownloadToken(artifactRefId: string): Observable<ArtifactDownloadToken> {
    return this.api.post<ArtifactDownloadToken>(`/billing/artifacts/${artifactRefId}/download-token`, {});
  }

  initiateAndCapturePayment(
    invoiceId: string,
    paymentMethod: PaymentMethod,
    amount: number,
  ): Observable<PaymentTransactionRef> {
    return this.api
      .post<PaymentTransactionRef>(`/v1/billing/invoices/${invoiceId}/payments`, {
        paymentMethod,
        amount,
        currency: 'USD',
      })
      .pipe(
        switchMap(result => this.api.post<PaymentTransactionRef>(
          `/v1/billing/invoices/${invoiceId}/payments/${result.paymentId}/capture`,
          {},
        )),
      );
  }

  executeVoid(invoiceId: string, paymentId: string, reason: string, authorityCode: string): Observable<void> {
    return this.api.post<void>(
      `/v1/billing/invoices/${invoiceId}/payments/${paymentId}/void`,
      { reason, authorityCode },
    );
  }

  executeRefund(
    invoiceId: string,
    paymentId: string,
    reason: string,
    authorityCode: string,
    amount?: number,
  ): Observable<void> {
    return this.api.post<void>(
      `/v1/billing/invoices/${invoiceId}/payments/${paymentId}/refund`,
      { reason, authorityCode, amount },
    );
  }

  generateReceipt(invoiceId: string, request: GenerateReceiptRequest): Observable<{ receiptId: string }> {
    return this.api.post<{ receiptId: string }>(`/v1/billing/invoices/${invoiceId}/receipts`, request);
  }

  loadReceipt(invoiceId: string, receiptId: string): Observable<ReceiptRef> {
    return this.api.get<ReceiptRef>(`/v1/billing/invoices/${invoiceId}/receipts/${receiptId}`);
  }

  reprintReceipt(invoiceId: string, receiptId: string): Observable<ReceiptRef> {
    return this.api.post<ReceiptRef>(`/v1/billing/invoices/${invoiceId}/receipts/${receiptId}/reprint`, {});
  }

  private toInvoiceDetail(source: InvoiceDetailsResponse): InvoiceDetail {
    const status = source.status === 'FINALIZED' || source.status === 'DRAFT'
      ? source.status
      : 'DRAFT';

    return {
      invoiceId: source.invoiceId ?? '',
      invoiceNumber: source.invoiceNumber,
      workOrderId: source.workorderId,
      status,
      subtotal: source.subtotal,
      taxTotal: source.tax,
      adjustmentTotal: source.adjustments,
      grandTotal: source.total,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      lineItems: source.items?.map(item => ({
        id: item.id ?? '',
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.amount,
      })),
      adjustments: source.adjustmentEntries?.map(entry => ({
        id: entry.id ?? '',
        reasonCode: entry.reason ?? 'UNKNOWN',
        reason: entry.reason,
        adjustmentType: entry.type,
        amount: entry.amount ?? 0,
        adjustedAt: entry.createdAt,
        adjustedBy: entry.authorizedBy,
      })),
    };
  }
}