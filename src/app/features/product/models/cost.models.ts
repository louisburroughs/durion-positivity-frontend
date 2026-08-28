export interface ItemCost {
  itemId: string;
  standardCost: number;
  lastCost: number;
  averageCost: number;
  currency: string;
}

export interface StandardCostUpdate {
  standardCost: number;
  reasonCode: string;
  currency: string;
}

export interface CostAuditEntry {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}
