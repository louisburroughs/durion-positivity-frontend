/**
 * Vendor order-transmission read client (issue #191, CAP-320; #201).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * Calls the generated `SupplierOrderTransmissionService` from
 * `@durion-sdk/supplier` and maps its `OrderTransmissionStatus` DTOs into the
 * local UI model field by field (ADR-0010). No URL is spelled out here: the
 * generated client is the contract, and anything it does not publish — the
 * status history and the manual-review queue this service used to guess —
 * is absent from the UI rather than simulated.
 *
 * ── The operation this service must never grow ──────────────────────────────
 * There is no re-send / retry / re-transmit method here, and adding one is a
 * safety regression rather than a feature. Re-transmitting an order the vendor
 * may already hold creates a duplicate physical order.
 * `supplier-order-transmission.service.spec.ts` asserts the absence.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  OrderTransmissionStatus,
  SupplierOrderTransmissionService as SupplierOrderTransmissionApi,
} from '@durion-sdk/supplier';
import {
  SupplierOrderTransmission,
  SupplierTransmissionState,
} from '../models/supplier-order-transmission.models';

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
}
