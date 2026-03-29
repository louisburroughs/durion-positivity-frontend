export interface PriceBookScope {
  locationId: string | null;
  customerTierId: string | null;
  currencyUomId: string;
}

export interface PriceBook {
  id: string;
  name: string;
  scope: PriceBookScope;
  effectiveAt: string;
  endAt: string | null;
}

export type PriceAdjustmentType = 'PERCENT' | 'FIXED';

export interface PriceRule {
  id: string;
  priceBookId: string;
  name: string;
  conditionDimension: string;
  conditionValue: string;
  adjustment: number;
  adjustmentType: PriceAdjustmentType;
  priority: number;
  effectiveAt: string;
  endAt: string | null;
  active: boolean;
}

export interface Msrp {
  id: string;
  productSku: string;
  amount: number;
  currency: string;
  effectiveAt: string;
  endAt: string | null;
}

export interface ActiveMsrp extends Msrp {
  active: true;
}

export type LocationPriceOverrideStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED';

export interface LocationPriceOverride {
  id: string;
  locationId: string;
  productSku: string;
  overridePrice: number;
  currency: string;
  status: LocationPriceOverrideStatus;
  reason: string;
  requestedAt: string;
  approvedAt: string | null;
}

export interface EffectiveLocationPrice {
  locationId: string;
  productSku: string;
  basePrice: number;
  overridePrice: number | null;
  finalPrice: number;
  currency: string;
}

export interface GuardrailPolicy {
  locationId: string;
  minPricePercent: number;
  maxPricePercent: number;
  requiresApprovalAbovePercent: number;
}
