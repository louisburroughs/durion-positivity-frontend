import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  PageVendorBillListRow,
  VendorBillAPIService,
  VendorBillExceptionResolutionRequest,
  VendorBillExceptionResolutionRequestResolutionActionEnum,
  VendorBillListRow,
  VendorBillMatchCandidateResponse,
  VendorBillResponse,
} from '@durion-sdk/accounting';
import {
  ExceptionResolution,
  PayableBillDetail,
  PayableBillListPage,
  PayableBillListRow,
  PayableBillStatus,
  PayableMatchCandidate,
} from '../models/payables.models';

/**
 * Payables (vendor-bills) reads and exception handling (#214).
 *
 * ── Transport ────────────────────────────────────────────────────────────
 * Backed entirely by the generated `@durion-sdk/accounting`
 * `VendorBillAPIService` (ADR-0010). By decision (#1637/#1638), there is no
 * raw-invoice read on pos-supplier — every method here calls pos-accounting,
 * never a `/supplier/v1/**` path.
 *
 * ── Actor ──────────────────────────────────────────────────────────────────
 * Since CAP:550 S12 the backend records the acting user from the
 * authenticated request: neither `resolveException` nor
 * `selectMatchCandidate` sends an `operatorId`.
 */
@Injectable({ providedIn: 'root' })
export class PayablesService {
  private readonly vendorBillSdk = inject(VendorBillAPIService);

  /** dueFrom/dueTo are ISO dates (YYYY-MM-DD); the window is server-capped at 366 days. */
  listBills(
    dueFrom: string,
    dueTo: string,
    status?: PayableBillStatus,
    page = 0,
    size = 25,
  ): Observable<PayableBillListPage> {
    return this.vendorBillSdk
      .listVendorBills(dueFrom, dueTo, status, page, size)
      .pipe(map(response => this.toBillListPage(response)));
  }

  getBillById(billId: string): Observable<PayableBillDetail> {
    return this.vendorBillSdk.getVendorBillById(billId).pipe(map(view => this.toBillDetail(view)));
  }

  listMatchCandidates(invoiceEventId: string): Observable<PayableMatchCandidate[]> {
    return this.vendorBillSdk
      .listVendorBillMatchCandidates(invoiceEventId)
      .pipe(map(views => views.map(view => this.toMatchCandidate(view))));
  }

  resolveException(billId: string, resolution: ExceptionResolution): Observable<PayableBillDetail> {
    const request: VendorBillExceptionResolutionRequest = {
      resolutionAction: resolution.resolutionAction as VendorBillExceptionResolutionRequestResolutionActionEnum,
      reason: resolution.reason,
    };
    return this.vendorBillSdk
      .resolveVendorBillMatchException(billId, request)
      .pipe(map(view => this.toBillDetail(view)));
  }

  selectMatchCandidate(candidateId: string): Observable<PayableBillDetail> {
    return this.vendorBillSdk
      .selectVendorBillMatchCandidate(candidateId)
      .pipe(map(view => this.toBillDetail(view)));
  }

  // ── Mapping (SDK view ⇄ domain model) ────────────────────────────────────

  private toBillListPage(response: PageVendorBillListRow): PayableBillListPage {
    const content = response.content ?? [];
    return {
      items: content.map(row => this.toBillListRow(row)),
      page: response.number ?? 0,
      size: response.size ?? content.length,
      totalElements: response.totalElements ?? content.length,
      totalPages: response.totalPages ?? 1,
    };
  }

  private toBillListRow(row: VendorBillListRow): PayableBillListRow {
    return {
      billId: row.billId,
      vendorId: row.vendorId,
      amount: row.amount,
      dueDate: row.dueDate ?? null,
      status: row.status as unknown as PayableBillStatus,
    };
  }

  private toBillDetail(view: VendorBillResponse): PayableBillDetail {
    return {
      billId: view.vendorBillId,
      vendorId: view.vendorId,
      vendorName: view.vendorName ?? null,
      billNumber: view.billNumber,
      billDate: view.billDate ?? null,
      dueDate: view.dueDate ?? null,
      totalAmount: view.totalAmount,
      status: view.status as unknown as PayableBillStatus,
      approvalJustification: view.approval?.approvalJustification ?? null,
      rejectionReason: view.rejection?.reason ?? view.statusExplanation ?? null,
      journalEntryId: view.journalEntryId ?? null,
      paymentTransactionId: view.paymentTransactionId ?? null,
      originEventId: view.originEventId ?? null,
      originEventType: view.originEventType ?? null,
      createdAt: view.createdAt,
      createdBy: view.createdBy ?? null,
    };
  }

  private toMatchCandidate(view: VendorBillMatchCandidateResponse): PayableMatchCandidate {
    return {
      candidateId: view.candidateId,
      invoiceEventId: view.invoiceEventId,
      vendorBillId: view.vendorBillId,
      vendorId: view.vendorId ?? null,
      billNumber: view.billNumber ?? null,
      billTotalAmount: view.billTotalAmount ?? null,
      matchScore: view.matchScore ?? null,
      scoreBreakdown: view.scoreBreakdown ?? null,
      resolved: view.resolved ?? false,
      selected: view.selected ?? false,
      createdAt: view.createdAt ?? null,
    };
  }
}
