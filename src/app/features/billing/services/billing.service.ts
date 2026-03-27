import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  ArtifactDownloadToken,
  CreateInvoiceDraftRequest,
  CreateInvoiceDraftResponse,
  ElevateRequest,
  ElevateResponse,
  InvoiceArtifact,
  InvoiceDetail,
  IssueInvoiceRequest,
} from '../models/billing.models';

/**
 * BillingService — CAP-007 (Stories 213–209)
 * Base path: /billing (billing microservice)
 */
@Injectable({ providedIn: 'root' })
export class BillingService {
  constructor(private readonly api: ApiBaseService) {}

  // ── Invoice draft ─────────────────────────────────────────────────────────

  /**
   * POST /billing/invoices/draft
   * Creates an invoice draft from a completed workorder (Story 213).
   * Idempotent by workOrderId.
   */
  createInvoiceDraft(
    body: CreateInvoiceDraftRequest,
    idempotencyKey?: string,
  ): Observable<CreateInvoiceDraftResponse> {
    return this.api.post<CreateInvoiceDraftResponse>(
      '/billing/invoices/draft',
      body,
      idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined,
    );
  }

  // ── Invoice detail ────────────────────────────────────────────────────────

  /**
   * GET /billing/invoices/{invoiceId}
   * Returns full invoice detail with line items, totals, traceability,
   * issuance policy (Stories 212, 211, 210, 209).
   */
  getInvoiceDetail(invoiceId: string): Observable<InvoiceDetail> {
    return this.api.get<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
  }

  /**
   * GET /billing/invoices/by-work-order/{workOrderId}
   * Look up invoice by work order (optional alternate entry point).
   */
  getInvoiceByWorkOrder(workOrderId: string): Observable<InvoiceDetail> {
    return this.api.get<InvoiceDetail>(`/billing/invoices/by-work-order/${workOrderId}`);
  }

  // ── Artifacts ─────────────────────────────────────────────────────────────

  /**
   * GET /billing/invoices/{invoiceId}/artifacts
   * Returns artifact list for the invoice (Story 209).
   */
  getInvoiceArtifacts(invoiceId: string): Observable<InvoiceArtifact[]> {
    return this.api.get<InvoiceArtifact[]>(`/billing/invoices/${invoiceId}/artifacts`);
  }

  /**
   * POST /billing/artifacts/{artifactRefId}/download-token
   * Obtains a short-lived download token for an artifact (Story 209).
   */
  getArtifactDownloadToken(artifactRefId: string): Observable<ArtifactDownloadToken> {
    return this.api.post<ArtifactDownloadToken>(
      `/billing/artifacts/${artifactRefId}/download-token`,
      {},
    );
  }

  // ── Issue invoice ─────────────────────────────────────────────────────────

  /**
   * POST /billing/invoices/{invoiceId}/issue
   * Issues the invoice. Requires elevationToken when policy demands it (Story 209).
   */
  issueInvoice(invoiceId: string, body: IssueInvoiceRequest): Observable<InvoiceDetail> {
    return this.api.post<InvoiceDetail>(`/billing/invoices/${invoiceId}/issue`, body);
  }

  // ── Step-up authentication ────────────────────────────────────────────────

  /**
   * POST /billing/auth/elevate
   * Returns a short-lived elevationToken for privileged actions (Story 209).
   */
  elevate(body: ElevateRequest): Observable<ElevateResponse> {
    return this.api.post<ElevateResponse>('/billing/auth/elevate', body);
  }
}
