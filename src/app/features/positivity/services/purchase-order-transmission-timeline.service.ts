/**
 * Purchase-order vendor transmission timeline read client (issue #215;
 * backend PR #1644, closing #1638 row 2).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * Calls the generated `PurchaseOrdersService.listPurchaseOrderTransmissionEvents`
 * from `@durion-sdk/order` (ADR-0010: a feature never injects `HttpClient`).
 * That operation is a Spring `Page`, not this domain's `PagedResponse` shape —
 * `content`/`number`/`totalElements` map straight across, field by field.
 *
 * ── Ordering is the backend's job ────────────────────────────────────────────
 * The backend orders entries by the vendor's clock (`observedAt`), tie-broken
 * by `recordedAt` then `eventId`. This service and every caller of it keep
 * that order exactly as returned — `sort` is accepted by the generated client
 * but is documented as ignored server-side, so it is never sent.
 *
 * ── One read replaces two retired surfaces ──────────────────────────────────
 * This is the sole timeline source for a purchase order's vendor history
 * (#201, #215) — there is no shipment-event read and no status-history read
 * anywhere else in this domain, and none should be added alongside this one.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  PagePurchaseOrderTransmissionEvent,
  PurchaseOrderTransmissionEvent as SdkPurchaseOrderTransmissionEvent,
  PurchaseOrdersService,
} from '@durion-sdk/order';
import {
  PurchaseOrderTransmissionEvent,
  PurchaseOrderTransmissionTimelinePage,
} from '../models/purchase-order-transmission-timeline.models';

/** Default page size for the timeline. */
export const TRANSMISSION_TIMELINE_PAGE_SIZE = 25;

function toTimelineEvent(dto: SdkPurchaseOrderTransmissionEvent): PurchaseOrderTransmissionEvent {
  return {
    transmissionEventId: dto.transmissionEventId ?? '',
    transmissionIntentId: dto.transmissionIntentId ?? null,
    eventType: dto.eventType ?? '',
    status: dto.status ?? null,
    vendorDocumentId: dto.vendorDocumentId ?? null,
    supplierOrderNumber: dto.supplierOrderNumber ?? null,
    vendorReason: dto.vendorReason ?? null,
    despatchDate: dto.despatchDate ?? null,
    estimatedDeliveryDate: dto.estimatedDeliveryDate ?? null,
    observedAt: dto.observedAt ?? null,
    recordedAt: dto.recordedAt ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class PurchaseOrderTransmissionTimelineService {
  private readonly poSdk = inject(PurchaseOrdersService);

  /**
   * One page of a purchase order's vendor transmission timeline, in the
   * server's own order.
   *
   * @param page zero-based page index
   */
  listForPurchaseOrder(
    purchaseOrderId: string,
    page = 0,
    size = TRANSMISSION_TIMELINE_PAGE_SIZE,
  ): Observable<PurchaseOrderTransmissionTimelinePage> {
    return this.poSdk
      .listPurchaseOrderTransmissionEvents(purchaseOrderId, page, size)
      .pipe(map(response => this.toPage(response)));
  }

  private toPage(
    response: PagePurchaseOrderTransmissionEvent,
  ): PurchaseOrderTransmissionTimelinePage {
    return {
      items: (response.content ?? []).map(toTimelineEvent),
      page: response.number ?? 0,
      size: response.size ?? TRANSMISSION_TIMELINE_PAGE_SIZE,
      totalCount: response.totalElements ?? 0,
      totalPages: response.totalPages ?? 0,
    };
  }
}
