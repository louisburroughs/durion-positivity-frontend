import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  AccountingEventDetail,
  AccountingEventListItem,
  AccountingEventSubmitRequest,
  CreditMemo,
  CreditMemoCreateRequest,
  CreditMemoListItem,
  EventEnvelopeContract,
  IngestionListFilters,
  IngestionSubmitOutcome,
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

@Injectable({ providedIn: 'root' })
export class AccountingService {
  private static readonly BASE = '/v1/accounting';

  constructor(private readonly api: ApiBaseService) { }

  // Events / Ingestion

  listEvents(
    filters: IngestionListFilters,
    page: number,
    size: number,
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
    return this.api.get<AccountingEventDetail>(`${AccountingService.BASE}/events/${eventId}`);
  }

  submitEvent(request: AccountingEventSubmitRequest): Observable<IngestionSubmitOutcome> {
    return this.api.post<IngestionSubmitOutcome>(`${AccountingService.BASE}/events`, request);
  }

  retryEvent(eventId: string, req: ReprocessRequest): Observable<{ jobId: string }> {
    return this.api.post<{ jobId: string }>(`${AccountingService.BASE}/events/${eventId}/retry`, req);
  }

  reprocessSuspendedEvent(eventId: string, req: ReprocessRequest): Observable<{ jobId: string }> {
    return this.api.post<{ jobId: string }>(`${AccountingService.BASE}/events/${eventId}/reprocess`, req);
  }

  getReprocessingHistory(eventId: string): Observable<ReprocessingAttemptHistory[]> {
    return this.api.get<ReprocessingAttemptHistory[]>(
      `${AccountingService.BASE}/events/${eventId}/reprocessing-history`,
    );
  }

  getEventEnvelopeContract(): Observable<EventEnvelopeContract> {
    return this.api.get<EventEnvelopeContract>(`${AccountingService.BASE}/events/contract`);
  }

  // Posting Rules

  listPostingRuleSets(
    page: number,
    size: number,
  ): Observable<PagedResponse<PostingRuleSetListItem>> {
    const params = new HttpParams()
      .set('page', String(page))
      .set('size', String(size))
      .set('sort', 'modifiedAt,desc');
    return this.api.get<PagedResponse<PostingRuleSetListItem>>(
      `${AccountingService.BASE}/posting-rules`,
      params,
    );
  }

  getPostingRuleSet(ruleSetId: string): Observable<PostingRuleSet> {
    return this.api.get<PostingRuleSet>(`${AccountingService.BASE}/posting-rules/${ruleSetId}`);
  }

  createPostingRuleSet(req: PostingRuleSetCreateRequest): Observable<PostingRuleSet> {
    return this.api.post<PostingRuleSet>(`${AccountingService.BASE}/posting-rules`, req);
  }

  updatePostingRuleSet(
    ruleSetId: string,
    req: PostingRuleSetUpdateRequest,
  ): Observable<PostingRuleSet> {
    return this.api.put<PostingRuleSet>(`${AccountingService.BASE}/posting-rules/${ruleSetId}`, req);
  }

  publishPostingRuleSet(ruleSetId: string): Observable<PostingRuleSet> {
    return this.api.post<PostingRuleSet>(`${AccountingService.BASE}/posting-rules/${ruleSetId}/publish`, {});
  }

  archivePostingRuleSet(ruleSetId: string): Observable<void> {
    return this.api.post<void>(`${AccountingService.BASE}/posting-rules/${ruleSetId}/archive`, {});
  }

  // Payment application

  applyPayment(req: PaymentApplicationRequest): Observable<PaymentApplication> {
    const { paymentId, ...body } = req;
    return this.api.post<PaymentApplication>(
      `${AccountingService.BASE}/payments/${paymentId}/applications`,
      body,
    );
  }

  // Credit memo

  listCreditMemos(page: number, size: number): Observable<PagedResponse<CreditMemoListItem>> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size));
    return this.api.get<PagedResponse<CreditMemoListItem>>(`${AccountingService.BASE}/credit-memos`, params);
  }

  getCreditMemo(memoId: string): Observable<CreditMemo> {
    return this.api.get<CreditMemo>(`${AccountingService.BASE}/credit-memos/${memoId}`);
  }

  createCreditMemo(req: CreditMemoCreateRequest): Observable<CreditMemo> {
    return this.api.post<CreditMemo>(`${AccountingService.BASE}/credit-memos`, req);
  }

  // Vendor payment

  listBills(page: number, size: number): Observable<PagedResponse<VendorBill>> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size));
    return this.api.get<PagedResponse<VendorBill>>(`${AccountingService.BASE}/ap/bills`, params);
  }

  listBillsByVendor(vendorId: string, page = 0, size = 100): Observable<VendorBill[]> {
    const params = new HttpParams()
      .set('vendorId', vendorId)
      .set('page', String(page))
      .set('size', String(size));
    return this.api.get<VendorBill[]>(`${AccountingService.BASE}/ap/bills`, params);
  }

  executePayment(req: VendorPaymentRequest): Observable<VendorPaymentResult> {
    return this.api.post<VendorPaymentResult>(`${AccountingService.BASE}/ap/payments`, req);
  }

  getPayment(paymentId: string): Observable<VendorPaymentDetail> {
    return this.api.get<VendorPaymentDetail>(`${AccountingService.BASE}/ap/payments/${paymentId}`);
  }

  getPaymentByRef(paymentRef: string): Observable<VendorPaymentDetail> {
    return this.api.get<VendorPaymentDetail>(`${AccountingService.BASE}/ap/payments/by-ref/${paymentRef}`);
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
