// CAP-246: Order domain models

export type OrderStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'PENDING_PAYMENT'
  | 'CANCELLED'
  | 'COMPLETED';

export type OrderLineStatus = 'ACTIVE' | 'REMOVED' | 'OVERRIDDEN';

export interface PosOrderLine {
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly lineId: string;
  readonly skuCode: string;
  readonly description: string;
  quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly currency: string;
  status: OrderLineStatus;
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly addedAt?: string;
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly updatedAt?: string;
}

export interface PosOrder {
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly orderId: string;
  readonly customerId?: string;
  readonly vehicleId?: string;
  readonly workorderId?: string;
  readonly estimateId?: string;
  status: OrderStatus;
  readonly lines: PosOrderLine[];
  readonly subtotal: number;
  readonly taxAmount: number;
  readonly total: number;
  readonly currency: string;
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly createdAt?: string;
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly updatedAt?: string;
}

export interface CreateCartRequest {
  customerId?: string;
  vehicleId?: string;
  workorderId?: string;
  estimateId?: string;
  currency?: string;
}

export interface AddItemRequest {
  skuCode: string;
  description?: string;
  quantity: number;
  unitPrice?: number;
}

export interface UpdateItemQuantityRequest {
  quantity: number;
}

export interface PriceOverride {
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly overrideId: string;
  readonly orderId: string;
  readonly lineId: string;
  readonly originalPrice: number;
  readonly overridePrice: number;
  readonly reasonCode: string;
  readonly authorityCode: string;
  readonly approvalToken?: string;
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly appliedBy?: string;
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly appliedAt?: string;
}

export interface ApplyPriceOverrideRequest {
  overridePrice: number;
  reasonCode: string;
  authorityCode: string;
  approvalToken?: string;
}

export interface CancelOrderRequest {
  reason: string;
  authorityCode: string;
  forceCancel?: boolean;
}

export interface CancelOrderResult {
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly orderId: string;
  readonly status: OrderStatus;
  /** @serverGenerated — do not include in create/update request payloads. */
  readonly cancelledAt: string;
  readonly paymentReversalRequired: boolean;
  readonly paymentReversalRef?: string;
}
