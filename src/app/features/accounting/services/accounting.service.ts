import { HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  APPaymentsService,
  AccountingEventsService,
  CreditMemosService,
  FinancialReportingService,
  InvoicePaymentsService,
  PaymentApplicationsService,
  PostingRulesService,
  AccountingEventResponse,
  InvoiceStatusResponse,
  ReprocessingAttemptHistoryResponse,
  PostingRuleSetListResponse,
  PostingRuleSetResponse,
  PostingRuleVersionResponse,
  PaymentApplicationResponse,
  CreditMemoResponse,
  APPaymentResponse,
  VendorBillSummaryResponse,
  AccountingEventSubmitRequest as SdkAccountingEventSubmitRequest,
  ReprocessEventRequest,
  PostingRuleSetCreateRequest as SdkPostingRuleSetCreateRequest,
  PaymentApplicationRequest as SdkPaymentApplicationRequest,
  CreateCreditMemoRequest,
  ExecuteAPPaymentRequest,
  type Pageable,
  type PageCreditMemoResponse,
} from '@durion-sdk/accounting';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import {
  AccountingEventDetail,
  AccountingEventListItem,
  AccountingEventSubmitRequest,
  CreditMemo,
  CreditMemoCreateRequest,
  CreditMemoListItem,
  EventProcessingLogEntry,
  EventEnvelopeContract,
  IngestionListFilters,
  IngestionProcessingStatus,
  IngestionSubmitOutcome,
  InvoicePaymentStatus,
  PagedResponse,
  PaymentApplication,
  PaymentApplicationRequest,
  PostingRuleSet,
  PostingRuleSetCreateRequest,
  PostingRuleSetListItem,
  PostingRuleSetUpdateRequest,
  ReprocessRequest,
  ReprocessingAttemptHistory,
  VendorBill,
  VendorPaymentDetail,
  VendorPaymentRequest,
  VendorPaymentResult,
} from '../models/accounting.models';
import { AuthService } from '../../../core/services/auth.service';
import type { JwtClaims } from '../../../core/models/auth.models';

@Injectable({ providedIn: 'root' })
export class AccountingService {
  private static readonly BASE = '/v1/accounting';

  private readonly api = inject(ApiBaseService);
  private readonly authService = inject(AuthService);
  private readonly accountingEventsService = inject(AccountingEventsService);
  private readonly apPaymentsService = inject(APPaymentsService);
  private readonly creditMemosService = inject(CreditMemosService);
  private readonly financialReportingService = inject(FinancialReportingService);
  private readonly invoicePaymentsService = inject(InvoicePaymentsService);
  private readonly paymentApplicationsService = inject(PaymentApplicationsService);
  private readonly postingRulesService = inject(PostingRulesService);

  // Events / Ingestion

  listEvents(
    filters: IngestionListFilters,
    page = 0,
    size = 20,
  ): Observable<PagedResponse<AccountingEventListItem>> {
    let params = new HttpParams().set('page', String(page)).set('size', String(size));

    if (filters.organizationId) {
      params = params.set('organizationId', filters.organizationId);
    }
    if (filters.processingStatus) {
      params = params.set('status', filters.processingStatus);
    }
    if (filters.eventType) {
      params = params.set('eventType', filters.eventType);
    }
    if (filters.idempotencyOutcome) {
      params = params.set('idempotencyOutcome', filters.idempotencyOutcome);
    }
    if (filters.receivedAtFrom) {
      params = params.set('receivedAtFrom', filters.receivedAtFrom);
    }
    if (filters.receivedAtTo) {
      params = params.set('receivedAtTo', filters.receivedAtTo);
    }
    if (filters.eventId) {
      params = params.set('eventId', filters.eventId);
    }
    if (filters.ingestionId) {
      params = params.set('ingestionId', filters.ingestionId);
    }
    if (filters.domainKeyId) {
      params = params.set('domainKeyId', filters.domainKeyId);
    }
    if (filters.invoiceId) {
      params = params.set('invoiceId', filters.invoiceId);
    }

    return this.api
      .get<PagedResponse<AccountingEventDetail>>(`${AccountingService.BASE}/events`, params)
      .pipe(
        map(resp => {
          const mapped = (resp.items ?? resp.content ?? []).map(item => this.toListItem(item));
          return {
            ...resp,
            items: mapped,
            content: mapped,
          };
        }),
      );
  }

  getEvent(eventId: string): Observable<AccountingEventDetail> {
    return this.accountingEventsService
      .getEvent(eventId)
      .pipe(map(dto => this.toAccountingEventDetail(dto)));
  }

  getEventProcessingLog(eventId: string): Observable<EventProcessingLogEntry[]> {
    return this.api.get<EventProcessingLogEntry[]>(
      `${AccountingService.BASE}/events/${eventId}/processing-log`,
    );
  }

  getInvoiceStatus(invoiceId: string): Observable<InvoicePaymentStatus> {
    return this.invoicePaymentsService
      .getInvoiceStatus(invoiceId)
      .pipe(map(dto => this.toInvoicePaymentStatus(dto)));
  }

  submitEvent(request: AccountingEventSubmitRequest): Observable<IngestionSubmitOutcome> {
    return this.accountingEventsService
      .submitEvent(this.toSdkAccountingEventSubmitRequest(request))
      .pipe(map(dto => this.toIngestionSubmitOutcome(dto)));
  }

  retryEvent(eventId: string, req: ReprocessRequest): Observable<{ jobId: string }> {
    return this.accountingEventsService
      .retryEventProcessing(eventId, req)
      .pipe(map(dto => this.toJobIdResponse(dto)));
  }

  reprocessSuspendedEvent(eventId: string, req: ReprocessRequest): Observable<{ jobId: string }> {
    return this.accountingEventsService
      .reprocessSuspendedEvent(eventId, this.toReprocessEventRequest(req))
      .pipe(map(dto => this.toJobIdResponse(dto)));
  }

  getReprocessingHistory(eventId: string): Observable<ReprocessingAttemptHistory[]> {
    return this.accountingEventsService
      .getReprocessingHistory(eventId)
      .pipe(map(dtos => dtos.map(dto => this.toReprocessingAttemptHistory(dto))));
  }

  getEventEnvelopeContract(): Observable<EventEnvelopeContract> {
    return this.api.get<EventEnvelopeContract>(`${AccountingService.BASE}/events/contract`);
  }

  // Posting Rules

  listPostingRuleSets(
    page: number,
    size: number,
  ): Observable<PagedResponse<PostingRuleSetListItem>> {
    return this.postingRulesService
      .listPostingRuleSets('modifiedAt,desc', page, size)
      .pipe(map(dto => this.toPagedPostingRuleSetListItems(dto)));
  }

  getPostingRuleSet(ruleSetId: string): Observable<PostingRuleSet> {
    return this.postingRulesService
      .getPostingRuleSet(ruleSetId)
      .pipe(map(dto => this.toPostingRuleSet(dto)));
  }

  createPostingRuleSet(req: PostingRuleSetCreateRequest): Observable<PostingRuleSet> {
    return this.postingRulesService
      .createPostingRuleSet(this.toSdkPostingRuleSetCreateRequest(req))
      .pipe(map(dto => this.toPostingRuleSet(dto)));
  }

  updatePostingRuleSet(
    ruleSetId: string,
    req: PostingRuleSetUpdateRequest,
  ): Observable<PostingRuleSet> {
    return this.postingRulesService
      .updatePostingRuleSet(ruleSetId, this.toSdkPostingRuleSetCreateRequest(req))
      .pipe(map(dto => this.toPostingRuleSet(dto)));
  }

  publishPostingRuleSet(ruleSetId: string): Observable<PostingRuleSet> {
    return this.postingRulesService
      .publishPostingRuleSet(ruleSetId)
      .pipe(map(dto => this.toPostingRuleSetFromVersion(dto)));
  }

  archivePostingRuleSet(ruleSetId: string): Observable<void> {
    return this.postingRulesService
      .archivePostingRuleSet(ruleSetId)
      .pipe(map(() => undefined as void));
  }

  // Payment application

  applyPayment(req: PaymentApplicationRequest): Observable<PaymentApplication> {
    const { paymentId, ...body } = req;
    return this.paymentApplicationsService
      .applyPayment(paymentId, this.toSdkPaymentApplicationRequest(body))
      .pipe(map(dto => this.toPaymentApplication(dto)));
  }

  // Credit memo

  listCreditMemos(page: number, size: number): Observable<PagedResponse<CreditMemoListItem>> {
    const pageable: Pageable = { page, size };
    return this.creditMemosService.listCreditMemos(pageable).pipe(
      map((sdkPage: PageCreditMemoResponse) => ({
        items: (sdkPage.content ?? []).map(dto => this.toCreditMemoListItem(dto)),
        content: (sdkPage.content ?? []).map(dto => this.toCreditMemoListItem(dto)),
        totalCount: sdkPage.totalElements,
        totalPages: sdkPage.totalPages,
        pageNumber: sdkPage.number,
        pageSize: sdkPage.size,
        totalElements: sdkPage.totalElements,
      })),
    );
  }

  getCreditMemo(memoId: string): Observable<CreditMemo> {
    return this.creditMemosService
      .getCreditMemo(memoId)
      .pipe(map(dto => this.toCreditMemo(dto)));
  }

  createCreditMemo(req: CreditMemoCreateRequest): Observable<CreditMemo> {
    return this.creditMemosService
      .createCreditMemo(this.toSdkCreateCreditMemoRequest(req))
      .pipe(map(dto => this.toCreditMemo(dto)));
  }

  // Vendor payment

  listBills(page: number, size: number): Observable<PagedResponse<VendorBill>> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size));
    return this.api.get<PagedResponse<VendorBill>>(`${AccountingService.BASE}/ap/bills`, params);
  }

  listBillsByVendor(vendorId: string): Observable<VendorBill[]> {
    return this.apPaymentsService
      .listBills(vendorId)
      .pipe(map(dtos => dtos.map(dto => this.toVendorBill(dto))));
  }

  executePayment(req: VendorPaymentRequest): Observable<VendorPaymentResult> {
    return this.apPaymentsService
      .executePayment(this.toSdkExecuteAPPaymentRequest(req))
      .pipe(map(dto => this.toVendorPaymentResult(dto)));
  }

  getPayment(paymentId: string): Observable<VendorPaymentDetail> {
    return this.apPaymentsService
      .getPayment(paymentId)
      .pipe(map(dto => this.toVendorPaymentResult(dto)));
  }

  getPaymentByRef(paymentRef: string): Observable<VendorPaymentDetail> {
    return this.apPaymentsService
      .getPaymentByRef(paymentRef)
      .pipe(map(dto => this.toVendorPaymentResult(dto)));
  }

  // Timekeeping Export

  requestExport(
    body: {
      startDate: string;
      endDate: string;
      locationIds: string[];
      format: 'CSV' | 'JSON';
    },
    idempotencyKey?: string,
  ): Observable<{ exportId: string; status: string }> {
    return this.api.post<{ exportId: string; status: string }>(
      `${AccountingService.BASE}/export/request`,
      body,
      idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined,
    );
  }

  getExportStatus(exportId: string): Observable<{
    exportId: string;
    status: string;
    recordsExportedCount?: number;
    recordsSkippedCount?: number;
    requestedAt?: string;
    completedAt?: string;
    errorCode?: string;
    message?: string;
  }> {
    const params = new HttpParams().set('exportId', exportId);
    return this.api.get<{
      exportId: string;
      status: string;
      recordsExportedCount?: number;
      recordsSkippedCount?: number;
      requestedAt?: string;
      completedAt?: string;
      errorCode?: string;
      message?: string;
    }>(`${AccountingService.BASE}/export/status`, params);
  }

  getExportHistory(params?: { pageIndex?: number; pageSize?: number }): Observable<unknown[]> {
    let httpParams = new HttpParams();
    if (params?.pageIndex !== undefined) {
      httpParams = httpParams.set('pageIndex', String(params.pageIndex));
    }
    if (params?.pageSize !== undefined) {
      httpParams = httpParams.set('pageSize', String(params.pageSize));
    }
    return this.api.get<unknown[]>(`${AccountingService.BASE}/export/history`, httpParams);
  }

  downloadExport(exportId: string): void {
    // Trigger browser download via anchor element (appended to DOM for cross-browser reliability)
    const url = `${environment.apiBaseUrl}${AccountingService.BASE}/export/download?exportId=${encodeURIComponent(exportId)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `time-export-${exportId}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
  }

  // --- Private adapter methods: SDK DTOs → local models ---

  private toAccountingEventDetail(dto: AccountingEventResponse): AccountingEventDetail {
    return {
      eventId: dto.eventId ?? '',
      eventType: dto.eventType ?? '',
      processingStatus: (dto.status as string as IngestionProcessingStatus) ?? IngestionProcessingStatus.Received,
      receivedAt: dto.receivedAt,
      processedAt: dto.processedAt,
      journalEntryId: dto.journalEntryId,
      errorMessage: dto.errorMessage,
      organizationId: dto.organizationId,
      sourceSystem: dto.sourceSystem,
      transactionDate: dto.transactionDate,
      payload: dto.payload,
    };
  }

  private toInvoicePaymentStatus(dto: InvoiceStatusResponse): InvoicePaymentStatus {
    const statusMap: Record<string, InvoicePaymentStatus['paymentStatus']> = {
      PAID: 'PAID',
      PARTIALLY_PAID: 'PARTIALLY_PAID',
      UNPAID: 'UNPAID',
      FAILED: 'UNKNOWN',
      CHARGEBACK: 'UNKNOWN',
    };
    return {
      invoiceId: dto.invoiceId ?? '',
      paymentStatus: statusMap[dto.status ?? ''] ?? 'UNKNOWN',
      balanceDue: dto.remainingBalance ?? 0,
      totalAmount: dto.invoiceTotal,
      paidAmount: dto.totalPaid,
      latestEventId: dto.latestTransactionReference,
    };
  }

  private toIngestionSubmitOutcome(dto: AccountingEventResponse): IngestionSubmitOutcome {
    return {
      eventId: dto.eventId,
      status: dto.status as string as IngestionProcessingStatus,
      journalEntryId: dto.journalEntryId,
      errorMessage: dto.errorMessage,
    };
  }

  private toJobIdResponse(dto: AccountingEventResponse): { jobId: string } {
    return { jobId: dto.eventId ?? '' };
  }

  private toReprocessingAttemptHistory(dto: ReprocessingAttemptHistoryResponse): ReprocessingAttemptHistory {
    return {
      attemptId: dto.attemptId,
      eventId: dto.eventId,
      attemptedAt: dto.attemptedAt,
      triggeredByUserId: dto.triggeredByUserId,
      outcome: dto.outcome as string as ReprocessingAttemptHistory['outcome'],
      outcomeDetails: dto.outcomeDetails,
      mappingVersionUsed: dto.mappingVersionUsed,
    };
  }

  private toPostingRuleSet(dto: PostingRuleSetResponse): PostingRuleSet {
    return {
      postingRuleSetId: dto.postingRuleSetId,
      name: dto.name,
      eventType: dto.eventType,
      description: dto.description,
      createdAt: dto.createdAt,
      createdBy: dto.createdBy,
      modifiedAt: dto.modifiedAt,
      modifiedBy: dto.modifiedBy,
    };
  }

  private toPostingRuleSetFromVersion(dto: PostingRuleVersionResponse): PostingRuleSet {
    return {
      postingRuleSetId: dto.postingRuleSetId,
      createdAt: dto.createdAt,
      createdBy: dto.createdBy,
      modifiedAt: dto.modifiedAt,
      modifiedBy: dto.modifiedBy,
    };
  }

  private toPagedPostingRuleSetListItems(dto: PostingRuleSetListResponse): PagedResponse<PostingRuleSetListItem> {
    const items: PostingRuleSetListItem[] = (dto.ruleSets ?? []).map(rs => ({
      postingRuleSetId: rs.postingRuleSetId,
      name: rs.name,
      eventType: rs.eventType,
      updatedAt: rs.modifiedAt,
      updatedBy: rs.modifiedBy,
    }));
    return {
      items,
      content: items,
      totalCount: dto.totalElements,
      totalPages: dto.totalPages,
      pageNumber: dto.currentPage,
      pageSize: dto.pageSize,
      totalElements: dto.totalElements,
    };
  }

  private toPaymentApplication(dto: PaymentApplicationResponse): PaymentApplication {
    return {
      paymentId: dto.paymentId,
      customerId: dto.customerId,
      currency: dto.currency,
      totalAmount: dto.totalAmount,
      appliedAmount: dto.appliedAmount,
      remainingAmount: dto.remainingAmount,
      applicationRequestId: dto.applicationRequestId,
      customerCredit: dto.customerCredit
        ? {
            creditId: dto.customerCredit.creditId,
            amount: dto.customerCredit.amount,
          }
        : undefined,
    };
  }

  private toCreditMemoListItem(dto: CreditMemoResponse): CreditMemoListItem {
    return {
      creditMemoId: dto.creditMemoId,
      originalInvoiceId: dto.originalInvoiceId,
      customerId: dto.customerId,
      creditAmount: dto.creditAmount,
      totalAmount: dto.totalAmount,
      status: dto.status as CreditMemoListItem['status'],
      creationTimestamp: dto.creationTimestamp,
    };
  }

  private toCreditMemo(dto: CreditMemoResponse): CreditMemo {
    return {
      creditMemoId: dto.creditMemoId,
      originalInvoiceId: dto.originalInvoiceId,
      customerId: dto.customerId,
      creditAmount: dto.creditAmount,
      taxAmountReversed: dto.taxAmountReversed,
      totalAmount: dto.totalAmount,
      reasonCode: dto.reasonCode,
      justificationNote: dto.justificationNote,
      status: dto.status as string as CreditMemo['status'],
      creationTimestamp: dto.creationTimestamp,
      postedTimestamp: dto.postedTimestamp,
      createdByUserId: dto.createdByUserId,
      priorPeriodAdjustment: dto.priorPeriodAdjustment,
      originalPeriodId: dto.originalPeriodId,
      currency: dto.currency,
      invoiceBalanceAfter: dto.invoiceBalanceAfter,
    };
  }

  private toVendorBill(dto: VendorBillSummaryResponse): VendorBill {
    return {
      vendorBillId: dto.vendorBillId,
      vendorId: dto.vendorId,
      vendorName: dto.vendorName,
      billNumber: dto.billNumber,
      billDate: dto.billDate,
      dueDate: dto.dueDate,
      totalAmount: dto.totalAmount,
      openAmount: dto.openAmount,
      status: dto.status as string as VendorBill['status'],
    };
  }

  private toVendorPaymentResult(dto: APPaymentResponse): VendorPaymentResult {
    return {
      paymentId: dto.paymentId,
      paymentRef: dto.paymentRef,
      vendorId: dto.vendorId,
      vendorName: dto.vendorName,
      grossAmount: dto.grossAmount,
      feeAmount: dto.feeAmount,
      netAmount: dto.netAmount,
      unappliedAmount: dto.unappliedAmount,
      currency: dto.currency,
      status: dto.status as string as VendorPaymentResult['status'],
      gatewayTransactionId: dto.gatewayTransactionId,
      gatewayTimestamp: dto.gatewayTimestamp,
      glJournalEntryId: dto.glJournalEntryId,
      glPostedAt: dto.glPostedAt,
      glPostError: dto.glPostError,
      memo: dto.memo,
      createdAt: dto.createdAt,
      createdBy: dto.createdBy,
      allocations: dto.allocations?.map(a => ({
        vendorBillId: a.vendorBillId,
        amount: a.appliedAmount,
      })),
    };
  }

  // --- Private adapter methods: local models → SDK request types ---

  private toSdkAccountingEventSubmitRequest(req: AccountingEventSubmitRequest): SdkAccountingEventSubmitRequest {
    return {
      eventId: req.eventId,
      eventType: req.eventType,
      organizationId: req.organizationId,
      sourceSystem: req.sourceSystem,
      transactionDate: req.transactionDate,
      payload: req.payload,
    };
  }

  private toReprocessEventRequest(req: ReprocessRequest): ReprocessEventRequest {
    const claims = this.authService.currentUserClaims();
    const actor = claims?.sub
      ?? this.getOptionalClaim(claims, 'preferred_username')
      ?? this.getOptionalClaim(claims, 'email')
      ?? this.getOptionalClaim(claims, 'name');

    if (!actor) {
      throw new Error('Unable to reprocess event without an authenticated actor identifier');
    }

    return {
      triggeredByUserId: actor,
      reprocessingNotes: req.justification,
    };
  }

  private getOptionalClaim(claims: JwtClaims | null, key: string): string | undefined {
    if (!claims) {
      return undefined;
    }

    const value = (claims as unknown as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }

  private toSdkPostingRuleSetCreateRequest(req: PostingRuleSetCreateRequest): SdkPostingRuleSetCreateRequest {
    return {
      name: req.name,
      eventType: req.eventType,
      description: req.description,
      rulesDefinition: req.rulesDefinition,
      createdBy: req.createdBy,
    };
  }

  private toSdkPaymentApplicationRequest(
    body: Omit<PaymentApplicationRequest, 'paymentId'>,
  ): SdkPaymentApplicationRequest {
    return {
      applicationRequestId: body.applicationRequestId,
      applications: body.applications.map(a => ({
        invoiceId: a.invoiceId,
        amountToApply: a.amount,
      })),
    };
  }

  private toSdkCreateCreditMemoRequest(req: CreditMemoCreateRequest): CreateCreditMemoRequest {
    return {
      originalInvoiceId: req.originalInvoiceId,
      creditAmount: req.creditAmount,
      reasonCode: req.reasonCode,
      justificationNote: req.justificationNote,
    };
  }

  private toSdkExecuteAPPaymentRequest(req: VendorPaymentRequest): ExecuteAPPaymentRequest {
    return {
      vendorId: req.vendorId,
      grossAmount: req.grossAmount,
      feeAmount: req.feeAmount,
      netAmount: req.netAmount,
      currency: req.currency,
      paymentRef: req.paymentRef,
      paymentMethod: req.paymentMethod as ExecuteAPPaymentRequest['paymentMethod'],
      paymentSource: req.paymentSource,
      memo: req.memo,
      allocations: req.allocations?.map(a => ({
        vendorBillId: a.vendorBillId,
        appliedAmount: a.amount,
      })),
    };
  }

  private toListItem(item: AccountingEventDetail): AccountingEventListItem {
    return {
      eventId: item.eventId,
      eventType: item.eventType,
      processingStatus: item.processingStatus,
      idempotencyOutcome: item.idempotencyOutcome,
      receivedAt: item.receivedAt,
      processedAt: item.processedAt,
      journalEntryId: item.journalEntryId,
      ledgerTransactionId: item.ledgerTransactionId,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      domainKeyId: item.domainKeyId,
    };
  }
}
