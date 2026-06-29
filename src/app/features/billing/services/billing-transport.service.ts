import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Observable, throwError } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  CaptureAmountRequest,
  FinalizationRequest,
  GenerateReceiptRequest,
  InitiatePaymentRequest,
  InitiatePaymentRequestPaymentFlowEnum,
  InitiatePaymentResponse,
  InitiatePaymentResponseStatusEnum,
  InvoiceDetailsResponse,
  InvoiceSearchResult,
  InvoiceSearchService,
  InvoiceService,
  PaymentReversalService,
  PaymentService,
  ReceiptResponse,
  ReceiptService,
  RefundPaymentRequest,
  RefundPaymentRequestReasonEnum,
  ReprintReceiptRequest,
  VoidPaymentRequest,
  VoidPaymentRequestReasonEnum,
} from '@durion-sdk/invoice';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  ArtifactDownloadToken,
  ElevateRequest,
  ElevateResponse,
  GenerateReceiptRequest as UiGenerateReceiptRequest,
  InvoiceArtifact,
  InvoiceDetail,
  InvoiceFinderItem,
  InvoiceLineItem,
  IssueInvoiceRequest,
  PaymentMethod,
  PaymentTransactionRef,
  ReceiptRef,
} from '../models/billing.models';

@Injectable({ providedIn: 'root' })
export class BillingTransportService {
  // Direct ApiBaseService usage inventory:
  // - ADR-0041 temporary exceptions pending SDK transport parity:
  //   loadInvoiceArtifacts, elevate, createArtifactDownloadToken
  // - Temporary compatibility exceptions (outside ADR-0041):
  //   executeRefund (full refund path without amount), loadReceipt
  private readonly api = inject(ApiBaseService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly invoiceSearchService = inject(InvoiceSearchService);
  private readonly translate = inject(TranslateService);
  private readonly paymentService = inject(PaymentService);
  private readonly paymentReversalService = inject(PaymentReversalService);
  private readonly receiptService = inject(ReceiptService);

  loadInvoiceDetail(invoiceId: string): Observable<InvoiceDetail> {
    return this.invoiceService.getInvoice(invoiceId).pipe(
      map(result => this.toInvoiceDetail(result)),
    );
  }

  searchInvoices(q: string): Observable<InvoiceFinderItem[]> {
    return this.invoiceSearchService.searchInvoices({ page: 0, size: 10 }, q).pipe(
      map(page => (page.content ?? []).map(result => this.toInvoiceFinderItem(result))),
    );
  }

  loadInvoiceArtifacts(invoiceId: string): Observable<InvoiceArtifact[]> {
    // ADR-0041 temporary exception: SDK invoice transport does not yet expose artifact listing.
    // Direct call to the pos-invoice route (gateway /invoice/** -> /v1/invoices/...).
    return this.api.get<InvoiceArtifact[]>(`/invoice/v1/invoices/${invoiceId}/artifacts`);
  }

  elevate(managerEmployeeNumber: string, invoiceId: string): Observable<ElevateResponse> {
    // ADR-0041 temporary exception: SDK does not yet expose elevation token transport.
    // No gateway /billing route exists; the elevate endpoint lives on the invoice service
    // (gateway /invoice/** -> pos-invoice /v1/billing/auth/elevate).
    const body: ElevateRequest = { managerEmployeeNumber, invoiceId };
    return this.api.post<ElevateResponse>('/invoice/v1/billing/auth/elevate', body);
  }

  issueInvoice(invoiceId: string, request: IssueInvoiceRequest): Observable<InvoiceDetail> {
    const body: FinalizationRequest = {
      managerApprovalCode: request.elevationToken,
    };
    return this.invoiceService.finalizeInvoice(invoiceId, body).pipe(
      map(result => this.toInvoiceDetail(result)),
    );
  }

  createArtifactDownloadToken(invoiceId: string, artifactRefId: string): Observable<ArtifactDownloadToken> {
    // ADR-0041 temporary exception: SDK does not yet expose artifact download-token creation.
    // Direct call to the pos-invoice route (gateway /invoice/** -> /v1/invoices/...).
    return this.api.post<ArtifactDownloadToken>(
      `/invoice/v1/invoices/${invoiceId}/artifacts/${artifactRefId}/download-token`,
      {},
    );
  }

  initiateAndCapturePayment(
    invoiceId: string,
    paymentMethod: PaymentMethod,
    amount: number,
  ): Observable<PaymentTransactionRef> {
    const initiateRequest: InitiatePaymentRequest = {
      paymentFlow: InitiatePaymentRequestPaymentFlowEnum.SaleCapture,
      amount,
      idempotencyKey: crypto.randomUUID(),
      paymentToken: this.toPaymentToken(paymentMethod),
    };

    return this.paymentService.initiatePayment(invoiceId, initiateRequest).pipe(
      switchMap(result => {
        const paymentId = result.paymentIntentId;
        if (!paymentId) {
          return throwError(() => new Error('Missing payment intent identifier from SDK response.'));
        }

        const captureRequest: CaptureAmountRequest = {
          amount,
          captureIdempotencyKey: crypto.randomUUID(),
        };

        return this.paymentService.capturePayment(invoiceId, paymentId, captureRequest).pipe(
          map(captureResult => this.toPaymentTransactionRef(invoiceId, captureResult, amount)),
        );
      }),
    );
  }

  executeVoid(invoiceId: string, paymentId: string, reason: string, authorityCode: string): Observable<void> {
    const request: VoidPaymentRequest = {
      reason: this.toVoidReason(reason),
      notes: authorityCode,
    };

    return this.paymentReversalService.voidPayment(invoiceId, paymentId, request).pipe(
      map(() => undefined),
    );
  }

  executeRefund(
    invoiceId: string,
    paymentId: string,
    reason: string,
    authorityCode: string,
    amount?: number,
  ): Observable<void> {
    if (amount === undefined) {
      // Temporary compatibility exception (outside ADR-0041): SDK refund contract requires amount,
      // while billing UX still supports full refund via omitted amount.
      return this.api.post<void>(
        `/v1/billing/invoices/${invoiceId}/payments/${paymentId}/refund`,
        { reason, authorityCode },
      );
    }

    const request: RefundPaymentRequest = {
      amount,
      reason: this.toRefundReason(reason),
      notes: authorityCode,
    };

    return this.paymentReversalService.refundPayment(invoiceId, paymentId, request).pipe(
      map(() => undefined),
    );
  }

  generateReceipt(invoiceId: string, request: UiGenerateReceiptRequest): Observable<{ receiptId: string }> {
    const sdkRequest: GenerateReceiptRequest = {
      paymentIntentId: request.emailAddress ?? request.deliveryMethod ?? 'UNSPECIFIED',
      terminalId: 'WEB-UI',
      templateId: 'DEFAULT',
      templateVersion: '1',
    };

    return this.receiptService.generateReceipt(invoiceId, sdkRequest).pipe(
      map(result => ({ receiptId: result.receiptId ?? '' })),
    );
  }

  loadReceipt(invoiceId: string, receiptId: string): Observable<ReceiptRef> {
    // Temporary compatibility exception (outside ADR-0041): SDK ReceiptService does not expose a
    // read endpoint for retrieving receipt detail by ID.
    return this.api.get<ReceiptRef>(`/v1/billing/invoices/${invoiceId}/receipts/${receiptId}`);
  }

  reprintReceipt(invoiceId: string, receiptId: string): Observable<ReceiptRef> {
    const request: ReprintReceiptRequest = {
      reason: 'CUSTOMER_REQUEST',
    };

    return this.receiptService.reprintReceipt(invoiceId, receiptId, request).pipe(
      map(result => this.toReceiptRef(invoiceId, result)),
    );
  }

  private toInvoiceFinderItem(result: InvoiceSearchResult): InvoiceFinderItem {
    const invoiceNumber = result.invoiceNumber ?? result.invoiceId;
    const statusLabel = result.status
      ? this.translate.instant(`BILLING.INVOICE_STATUS.${result.status}`)
      : null;
    const secondary = statusLabel ? `${invoiceNumber} · ${statusLabel}` : invoiceNumber;
    return {
      id: result.invoiceId,
      primary: result.customerName ?? invoiceNumber,
      secondary,
      tertiary: result.workorderNumber ?? undefined,
    };
  }

  private toPaymentToken(paymentMethod: PaymentMethod): string {
    return `UI-${paymentMethod}`;
  }

  private toPaymentTransactionRef(
    invoiceId: string,
    source: InitiatePaymentResponse,
    fallbackAmount: number,
  ): PaymentTransactionRef {
    const amount = source.capturedAmount ?? source.authorizedAmount ?? fallbackAmount;

    return {
      paymentId: source.paymentIntentId ?? '',
      invoiceId,
      transactionId: source.paymentIntentId,
      authCode: source.gatewayProvider,
      status: this.toPaymentStatus(source.status),
      amount,
      currency: 'USD',
    };
  }

  private toPaymentStatus(status?: InitiatePaymentResponseStatusEnum): PaymentTransactionRef['status'] {
    switch (status) {
      case InitiatePaymentResponseStatusEnum.Pending:
        return 'INITIATED';
      case InitiatePaymentResponseStatusEnum.Authorized:
        return 'AUTHORIZED';
      case InitiatePaymentResponseStatusEnum.Captured:
        return 'CAPTURED';
      case InitiatePaymentResponseStatusEnum.Voided:
        return 'VOIDED';
      case InitiatePaymentResponseStatusEnum.CaptureFailed:
      case InitiatePaymentResponseStatusEnum.Expired:
      default:
        return 'FAILED';
    }
  }

  private toVoidReason(reason: string): VoidPaymentRequestReasonEnum {
    switch (reason) {
      case 'CUSTOMER_REQUEST':
        return VoidPaymentRequestReasonEnum.CustomerRequest;
      case 'DUPLICATE_AUTHORIZATION':
        return VoidPaymentRequestReasonEnum.DuplicateAuthorization;
      case 'ENTRY_ERROR':
        return VoidPaymentRequestReasonEnum.EntryError;
      case 'FRAUD_PREVENTION':
        return VoidPaymentRequestReasonEnum.FraudPrevention;
      case 'MANAGER_DISCRETION':
        return VoidPaymentRequestReasonEnum.ManagerDiscretion;
      default:
        return VoidPaymentRequestReasonEnum.Other;
    }
  }

  private toRefundReason(reason: string): RefundPaymentRequestReasonEnum {
    switch (reason) {
      case 'CUSTOMER_RETURN':
        return RefundPaymentRequestReasonEnum.CustomerReturn;
      case 'SERVICE_ERROR':
        return RefundPaymentRequestReasonEnum.ServiceError;
      case 'OVERCHARGE':
        return RefundPaymentRequestReasonEnum.Overcharge;
      case 'DAMAGED_GOODS':
      case 'DAMAGE':
        return RefundPaymentRequestReasonEnum.DamagedGoods;
      case 'GOODWILL':
        return RefundPaymentRequestReasonEnum.Goodwill;
      case 'CHARGEBACK_AVOIDANCE':
        return RefundPaymentRequestReasonEnum.ChargebackAvoidance;
      case 'FRAUD_PREVENTION':
        return RefundPaymentRequestReasonEnum.FraudPrevention;
      case 'MANAGER_DISCRETION':
        return RefundPaymentRequestReasonEnum.ManagerDiscretion;
      default:
        return RefundPaymentRequestReasonEnum.Other;
    }
  }

  private toReceiptRef(invoiceId: string, source: ReceiptResponse): ReceiptRef {
    return {
      receiptId: source.receiptId ?? '',
      invoiceId,
      receiptNumber: source.reference,
    };
  }

  private toLineItemType(raw?: string): InvoiceLineItem['type'] {
    switch (raw?.toUpperCase()) {
      case 'PART':
        return 'PART';
      case 'LABOR':
        return 'LABOR';
      case 'FEE':
        return 'FEE';
      case 'TAX':
        return 'TAX';
      default:
        return undefined;
    }
  }

  private toInvoiceDetail(source: InvoiceDetailsResponse): InvoiceDetail {
    // Preserve the real lifecycle status. Coercing unknown statuses to DRAFT
    // previously made issued/posted invoices look re-issuable (canIssue → true).
    const status = (source.status ?? 'DRAFT') as InvoiceDetail['status'];

    return {
      invoiceId: source.invoiceId ?? '',
      invoiceNumber: source.invoiceNumber,
      workOrderId: source.workorderId,
      workOrderNumber: source.workorderNumber,
      status,
      subtotal: source.subtotal,
      taxAmount: source.tax,
      adjustmentTotal: source.adjustments,
      grandTotal: source.total,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      issuancePolicy: {
        requiresElevation: source.requiresManagerApproval ?? false,
      },
      lineItems: source.items?.map(item => ({
        id: item.id ?? '',
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.amount,
        type: this.toLineItemType(item.type),
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
