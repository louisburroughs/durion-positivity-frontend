/**
 * Vendor order-transmission read/resolve client (issue #191, CAP-320; #201;
 * manual-review queue restored #216).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * Calls the generated `SupplierOrderTransmissionService` from
 * `@durion-sdk/supplier` and maps its `OrderTransmissionStatus` DTOs into the
 * local UI model field by field (ADR-0010). No URL is spelled out here: the
 * generated client is the contract. The manual-review queue is now a real,
 * filtered search operation (`searchSupplierTransmissions`, backend PR #1644)
 * rather than something this service ever guessed at.
 *
 * ── The operation this service must never grow ──────────────────────────────
 * There is no re-send / retry / re-transmit method here, and adding one is a
 * safety regression rather than a feature. Re-transmitting an order the vendor
 * may already hold creates a duplicate physical order. Resolving a
 * `MANUAL_REVIEW` row (`resolveTransmission`) is not a re-send: it records an
 * operator's finding about what already happened, it never contacts the vendor.
 * `supplier-order-transmission.service.spec.ts` asserts the absence.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  OrderTransmissionStatus,
  PagedResponse,
  SupplierOrderTransmissionService as SupplierOrderTransmissionApi,
  TransmissionResolutionRequest as SdkTransmissionResolutionRequest,
  TransmissionResolutionRequestActionEnum,
} from '@durion-sdk/supplier';
import {
  SupplierOrderTransmission,
  SupplierTransmissionPage,
  SupplierTransmissionSearchFilter,
  SupplierTransmissionState,
  TransmissionResolutionRequest,
} from '../models/supplier-order-transmission.models';
import { startOfLocalDayIso, startOfNextLocalDayIso } from './supplier-exchange-audit.service';

/** Default page size for the manual-review worklist. The contract caps `size` at 200. */
export const MANUAL_REVIEW_PAGE_SIZE = 25;

const KNOWN_STATES: ReadonlySet<string> = new Set<SupplierTransmissionState>([
  'PENDING',
  'DISPATCHING',
  'SENT_AWAITING_RESULT',
  'CONFIRMED',
  'REJECTED',
  'MANUAL_REVIEW',
  'FAILED',
  'CANCELLED',
]);

function toState(value: string | undefined): SupplierTransmissionState | null {
  return value && KNOWN_STATES.has(value) ? (value as SupplierTransmissionState) : null;
}

/** Explicit DTO → UI projection. Every field is named; nothing is cast through. */
export function toSupplierOrderTransmission(dto: OrderTransmissionStatus): SupplierOrderTransmission {
  return {
    transmissionIntentId: dto.transmissionIntentId ?? '',
    purchaseOrderId: dto.purchaseOrderId ?? null,
    purchaseOrderNumber: dto.purchaseOrderNumber ?? null,
    supplierRef: dto.supplierRef ?? null,
    state: toState(dto.state),
    supplierOrderNumber: dto.supplierOrderNumber ?? null,
    documentId: dto.documentId ?? null,
    latestScheduledDeliveryDate: dto.latestScheduledDeliveryDate ?? null,
    vendorReason: dto.vendorReason ?? null,
    vendorErrorCode: dto.vendorErrorCode ?? null,
    failureDetail: dto.failureDetail ?? null,
    lastStatusAt: dto.lastStatusAt ?? null,
    lastTransitionAt: dto.lastTransitionAt ?? null,
    dispatchAttempts: dto.dispatchAttempts ?? null,
    resolutionAction: dto.resolutionAction ?? null,
    resolvedAt: dto.resolvedAt ?? null,
    resolvedBy: dto.resolvedBy ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class SupplierOrderTransmissionService {
  private readonly api = inject(SupplierOrderTransmissionApi);

  /** Every transmission recorded for one purchase order, as the backend orders them. */
  listForPurchaseOrder(purchaseOrderId: string): Observable<SupplierOrderTransmission[]> {
    return this.api
      .listSupplierTransmissionsForPurchaseOrder(purchaseOrderId)
      .pipe(map(list => list.map(toSupplierOrderTransmission)));
  }

  /** One transmission by id, for the manual-review row detail. */
  getTransmission(transmissionIntentId: string): Observable<SupplierOrderTransmission> {
    return this.api
      .getSupplierTransmission(transmissionIntentId)
      .pipe(map(toSupplierOrderTransmission));
  }

  /**
   * The manual-review worklist (issue #216; #1638 decision 6): one page of
   * transmissions stuck in `MANUAL_REVIEW`, across every purchase order.
   *
   * `attemptState` is always `MANUAL_REVIEW` — this method has exactly one
   * purpose and does not take a state parameter. Date filters are date-only
   * `YYYY-MM-DD` (ADR-0038); converted to the contract's half-open instant
   * window here, at the boundary, the same way the exchange-audit list does.
   *
   * @param page zero-based page index
   */
  searchManualReview(
    filter: SupplierTransmissionSearchFilter = {},
    page = 0,
    size = MANUAL_REVIEW_PAGE_SIZE,
  ): Observable<SupplierTransmissionPage> {
    return this.api
      .searchSupplierTransmissions(
        'MANUAL_REVIEW',
        filter.vendorProfileId || undefined,
        filter.search || undefined,
        filter.dateFrom ? startOfLocalDayIso(filter.dateFrom) : undefined,
        filter.dateTo ? startOfNextLocalDayIso(filter.dateTo) : undefined,
        page,
        size,
      )
      .pipe(map(response => this.toSearchPage(response)));
  }

  /**
   * Apply one ADR-0052 §4 resolution to a `MANUAL_REVIEW` transmission.
   *
   * Not a re-send: this records what the operator established with the
   * vendor by phone or portal, and never contacts the vendor itself.
   */
  resolveTransmission(
    transmissionIntentId: string,
    request: TransmissionResolutionRequest,
  ): Observable<SupplierOrderTransmission> {
    const payload: SdkTransmissionResolutionRequest = {
      action: request.action as TransmissionResolutionRequestActionEnum,
      evidence: request.evidence,
      supplierOrderNumber: request.supplierOrderNumber,
    };
    return this.api
      .resolveSupplierTransmission(transmissionIntentId, payload)
      .pipe(map(toSupplierOrderTransmission));
  }

  private toSearchPage(response: PagedResponse): SupplierTransmissionPage {
    const items = (response.items ?? []) as OrderTransmissionStatus[];
    return {
      items: items.map(toSupplierOrderTransmission),
      page: response.page ?? 0,
      size: response.size ?? MANUAL_REVIEW_PAGE_SIZE,
      totalCount: response.totalElements ?? 0,
      totalPages: response.totalPages ?? 0,
    };
  }
}
