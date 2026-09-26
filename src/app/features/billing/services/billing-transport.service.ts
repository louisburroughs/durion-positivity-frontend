import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Observable, throwError, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  ArtifactDownloadToken as SdkArtifactDownloadToken,
  BillingAuthorizationService,
  CaptureAmountRequest,
  Configuration as InvoiceConfiguration,
  ElevateRequest as SdkElevateRequest,
  FinalizationRequest,
  GenerateReceiptRequest,
  InitiatePaymentRequest,
  InitiatePaymentRequestPaymentFlowEnum,
  InitiatePaymentResponse,
  InitiatePaymentResponseStatusEnum,
  InvoiceArtifact as SdkInvoiceArtifact,
  InvoiceArtifactControllerService,
  InvoiceDetailsResponse,
  InvoiceSearchResult,
  InvoiceSearchService,
  InvoiceService,
  PaymentIntentResponse,
  PaymentIntentResponseStatusEnum,
  PaymentReversalService,
  PaymentService,
  ReceiptResponse,
  ReceiptService,
  ReceiptViewResponse,
  RefundPaymentRequest,
  RefundPaymentRequestReasonEnum,
  ReprintReceiptRequest,
  VoidPaymentRequest,
  VoidPaymentRequestReasonEnum,
} from '@durion-sdk/invoice';
import {
  ArtifactDownloadToken,
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
  RefundContext,
} from '../models/billing.models';

@Injectable({ providedIn: 'root' })
export class BillingTransportService {
  private readonly configuration = inject(InvoiceConfiguration);
  private readonly invoiceService = inject(InvoiceService);
  private readonly invoiceSearchService = inject(InvoiceSearchService);
  private readonly invoiceArtifactService = inject(InvoiceArtifactControllerService);
  private readonly billingAuthorizationService = inject(BillingAuthorizationService);
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
    return this.invoiceSearchService
      .searchInvoices(q, undefined, undefined, undefined, undefined, 0, 10)
      .pipe(map(page => (page.content ?? []).map(result => this.toInvoiceFinderItem(result))));
  }

  loadInvoiceArtifacts(invoiceId: string): Observable<InvoiceArtifact[]> {
    return this.invoiceArtifactService.listInvoiceArtifacts(invoiceId).pipe(
      map(artifacts => artifacts.map(artifact => this.toInvoiceArtifact(artifact))),
    );
  }

  elevate(managerEmployeeNumber: string, invoiceId: string): Observable<ElevateResponse> {
    const request: SdkElevateRequest = { managerEmployeeNumber, invoiceId };
    return this.billingAuthorizationService.elevateManagerApproval(request);
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
    return this.invoiceArtifactService.createArtifactDownloadToken(invoiceId, artifactRefId).pipe(
      map(result => this.toArtifactDownloadToken(result)),
    );
  }

  /**
   * Resolves the artifact's download URL: prefers the server-issued `downloadUrl`, falling back
   * to a signed-token URL built from the injected InvoiceConfiguration's basePath rather than
   * reading environment.apiBaseUrl directly (SDK-06). The SDK has no operation that returns a
   * URL — `InvoiceArtifactDownloadControllerService.downloadInvoiceArtifact` streams the PDF body
   * itself, which isn't useful for an anchor href — so this still builds the public, token-only
   * download link by hand, matching the `download-token` endpoint's own path exactly (issue #350).
   */
  resolveArtifactDownloadUrl(invoiceId: string, artifactRefId: string, token: ArtifactDownloadToken): string {
    return token.downloadUrl
      ?? `${this.configuration.basePath}/v1/invoices/${invoiceId}/artifacts/${artifactRefId}/download?token=${token.downloadToken}`;
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

  /**
   * Issue #381 / durion-positivity-backend#2215 ruling: `PaymentReversalService.refundPayment`
   * (`POST /v1/invoices/{id}/payments/{pid}/refunds`) always requires an explicit `amount` — there
   * is no implicit "refund everything" flow on the backend. The caller
   * (`PaymentVoidRefundPageComponent`) lets the operator prefill that amount from
   * {@link loadRefundContext}'s `refundableAmount` for a full-balance refund, or type a smaller
   * one for a partial refund, but always submits an explicit amount the operator has confirmed.
   */
  executeRefund(
    invoiceId: string,
    paymentId: string,
    reason: string,
    authorityCode: string,
    amount: number,
  ): Observable<void> {
    const request: RefundPaymentRequest = {
      amount,
      reason: this.toRefundReason(reason),
      notes: authorityCode,
    };

    return this.paymentReversalService.refundPayment(invoiceId, paymentId, request).pipe(
      map(() => undefined),
    );
  }

  /**
   * durion-positivity-backend#2226 added `PaymentService.getInvoicePayment`
   * (`GET /v1/invoices/{invoiceId}/payments/{paymentId}`), which returns the payment intent's
   * `capturedAmount`, `refundedAmount` and `refundableAmount` directly — superseding the
   * `listInvoiceRefunds`-derived `priorRefundsTotal` this replaced (Copilot #4106106128 had found
   * `invoice.total` unsafe as a captured-amount proxy on a multiply-tendered invoice; that gap is
   * what #2226 closed). `refundableAmount` is `null` unless the intent is `CAPTURED`.
   */
  loadRefundContext(invoiceId: string, paymentId: string): Observable<RefundContext> {
    return this.paymentService.getInvoicePayment(invoiceId, paymentId).pipe(
      map(payment => this.toRefundContext(payment)),
    );
  }

  /**
   * Issue #381 bug fix: `GenerateReceiptRequest.paymentIntentId` must be a real payment-intent
   * UUID (verified against `@durion-sdk/invoice` types) — the prior implementation sent the UI's
   * delivery-method selection or email address instead, which the backend would reject as an
   * unknown payment intent. There is no route param carrying a payment id here
   * (`invoices/:invoiceId/receipts`), so this resolves it from
   * `PaymentService.listInvoicePayments(invoiceId)` (durion-positivity-backend#2226), preferring
   * the most recently updated `CAPTURED` intent — the only status a receipt can document.
   *
   * `_request`'s `deliveryMethod`/`emailAddress` are UI-only today: `GenerateReceiptRequest` (the
   * real SDK request shape, verified against `@durion-sdk/invoice` types) has no delivery field —
   * recording an actual email/print delivery is `recordReceiptEmailDelivery`/
   * `recordReceiptPrintDelivery`, separate endpoints this PR does not wire up.
   */
  generateReceipt(invoiceId: string, _request: UiGenerateReceiptRequest, paymentId?: string): Observable<ReceiptRef> {
    // The payment the operator just captured, when the caller knows it (the capture page passes
    // it through); otherwise fall back to the invoice's most recent CAPTURED intent.
    const intent$: Observable<{ paymentId?: string } | undefined> = paymentId
      ? of({ paymentId })
      : this.paymentService.listInvoicePayments(invoiceId).pipe(map(payments => this.mostRecentCapturedPayment(payments)));
    return intent$.pipe(
      switchMap(capturedIntent => {
        if (!capturedIntent?.paymentId) {
          return throwError(() => new Error(
            `No captured payment intent found for invoice ${invoiceId}; cannot generate a receipt.`,
          ));
        }

        const sdkRequest: GenerateReceiptRequest = {
          paymentIntentId: capturedIntent.paymentId,
          terminalId: 'WEB-UI',
          templateId: 'DEFAULT',
          templateVersion: '1',
        };

        return this.receiptService.generateReceipt(invoiceId, sdkRequest);
      }),
      map(result => this.toReceiptRef(invoiceId, result)),
    );
  }

  /**
   * `ReceiptService.reprintReceipt`'s `ReceiptResponse` (verified against `@durion-sdk/invoice`
   * types) carries only `receiptId`/`reference`/`status` — no `reprintCount`, unlike
   * `ReceiptViewResponse`. Callers must not treat this method's result as the new authoritative
   * receipt detail (it would silently drop `reprintCount` and disarm
   * `ReceiptPageComponent.reprintOverrideNeeded`); `ReceiptPageComponent.reprint` re-reads via
   * {@link loadReceipt} after this succeeds instead.
   */
  reprintReceipt(invoiceId: string, receiptId: string): Observable<ReceiptRef> {
    const request: ReprintReceiptRequest = {
      reason: 'CUSTOMER_REQUEST',
    };

    return this.receiptService.reprintReceipt(invoiceId, receiptId, request).pipe(
      map(result => this.toReceiptRef(invoiceId, result)),
    );
  }

  /**
   * Receipt deep-link load (durion-positivity-backend#2214): `ReceiptService.getReceipt` is a
   * read-only GET, unlike `generateReceipt`/`reprintReceipt`, which both side-effect. This is what
   * `ReceiptPageComponent` now calls when a `receiptId` already appears in the route (a deep link
   * or a reload) instead of showing a not-available state.
   */
  loadReceipt(invoiceId: string, receiptId: string): Observable<ReceiptRef> {
    return this.receiptService.getReceipt(invoiceId, receiptId).pipe(
      map(result => this.toReceiptDetail(result)),
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
    return this.toPaymentStatusFromString(status);
  }

  /**
   * `InitiatePaymentResponseStatusEnum` and `PaymentIntentResponseStatusEnum` are two distinct
   * generated enums with identical string values (verified against `@durion-sdk/invoice` types),
   * so this maps by string rather than duplicating the switch per enum.
   */
  private toPaymentStatusFromString(status?: string): PaymentTransactionRef['status'] {
    switch (status) {
      case 'PENDING':
        return 'INITIATED';
      case 'AUTHORIZED':
        return 'AUTHORIZED';
      case 'CAPTURED':
        return 'CAPTURED';
      case 'VOIDED':
        return 'VOIDED';
      case 'CAPTURE_FAILED':
      case 'EXPIRED':
      default:
        return 'FAILED';
    }
  }

  /**
   * `refundableAmount` is `capturedAmount` minus non-failed refunds and is `null` unless the
   * intent's `status` is `CAPTURED` (`@durion-sdk/invoice` docblock, verified). Passed through as
   * `null` rather than defaulted to 0 so the page can tell "not captured, no balance to refund"
   * apart from "captured, fully refunded already".
   */
  private toRefundContext(source: PaymentIntentResponse): RefundContext {
    return {
      capturedAmount: source.capturedAmount ?? 0,
      refundedAmount: source.refundedAmount ?? 0,
      refundableAmount: source.refundableAmount ?? null,
      status: this.toPaymentStatusFromString(source.status),
    };
  }

  /**
   * A receipt documents exactly one payment intent, and only a `CAPTURED` one can be refunded or
   * receipted (`ReceiptServiceImpl`/`PaymentReversalServiceImpl` both require it, verified against
   * backend origin/main). When more than one exists (a re-tendered invoice), this prefers the most
   * recently updated — the newest capture is the one a cashier at the terminal is generating a
   * receipt for.
   */
  private mostRecentCapturedPayment(payments: readonly PaymentIntentResponse[]): PaymentIntentResponse | undefined {
    return payments
      .filter(payment => payment.status === PaymentIntentResponseStatusEnum.Captured)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      .at(0);
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

  private toInvoiceArtifact(source: SdkInvoiceArtifact): InvoiceArtifact {
    return {
      artifactRefId: source.artifactRefId ?? '',
      fileName: source.fileName,
      mimeType: source.mimeType,
      createdAt: source.createdAt,
    };
  }

  private toArtifactDownloadToken(source: SdkArtifactDownloadToken): ArtifactDownloadToken {
    return {
      downloadToken: source.downloadToken ?? '',
      expiresAt: source.expiresAt,
    };
  }

  private toReceiptRef(invoiceId: string, source: ReceiptResponse): ReceiptRef {
    return {
      receiptId: source.receiptId ?? '',
      invoiceId,
      receiptNumber: source.reference,
    };
  }

  /**
   * `ReceiptViewResponse` (durion-positivity-backend#2214) carries no card brand or last-4 — the
   * backend does not store them (`paymentMethod` is the gateway/processor name, e.g. "stripe").
   */
  private toReceiptDetail(source: ReceiptViewResponse): ReceiptRef {
    return {
      receiptId: source.receiptId,
      invoiceId: source.invoiceId,
      paymentId: source.paymentIntentId,
      receiptNumber: source.reference,
      status: source.status as ReceiptRef['status'],
      paidAmount: source.paidAmount,
      paymentMethod: source.paymentMethod,
      cashierId: source.cashierId,
      terminalId: source.terminalId,
      deliveryMethod: source.deliveryMethod as ReceiptRef['deliveryMethod'],
      deliveryStatus: source.deliveryStatus as ReceiptRef['deliveryStatus'],
      deliveryEmailAddress: source.deliveryEmailAddress,
      reprintCount: source.reprintCount,
      lastReprintedBy: source.lastReprintedBy,
      lastReprintReason: source.lastReprintReason,
      createdAt: source.createdAt,
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
