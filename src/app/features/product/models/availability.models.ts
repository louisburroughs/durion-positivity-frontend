export type FeedSourceType = 'MFR' | 'DISTRIBUTOR';

export interface SkuAvailability {
  sku: string;
  locationId: string;
  onHand: number;
  reserved: number;
  atp: number;
  asOf: string;
  sourceType: FeedSourceType;
}

export interface LeadTime {
  sku: string;
  sourceType: FeedSourceType;
  sourceName: string;
  minDays: number;
  maxDays: number;
}

export interface LocationInventory {
  locationId: string;
  // Optional: LocationInventoryInquiryResponse (@durion-sdk/inventory) has no locationName or
  // reserved field (backend #2206) — getLocationInventory() omits them rather than faking a
  // value; the by-sku listing path still supplies both.
  locationName?: string;
  onHand: number;
  reserved?: number;
  atp: number;
}

export interface InventoryAvailability {
  sku: string;
  totalOnHand: number;
  totalReserved: number;
  totalAtp: number;
  locationBreakdown: LocationInventory[];
}
