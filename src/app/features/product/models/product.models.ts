export type LifecycleState = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  status: string;
  msrp: number | null;
}

export interface ProductSummary {
  id: string;
  sku: string;
  name: string;
  category: string;
  lifecycleState: string;
  msrp: number | null;
}

export interface ProductLifecycle {
  productId: string;
  currentState: LifecycleState;
  effectiveAt: string;
  lastChangedBy: string;
  lastChangedAt: string;
}

export interface LifecycleStateTransition {
  targetState: LifecycleState;
  effectiveAt: string;
  overrideReason?: string;
}

export interface ReplacementProduct {
  id: string;
  productId: string;
  replacementProductId: string;
  priority: number;
  notes: string;
  effectiveAt: string;
}

export interface UomConversion {
  id: string;
  fromUom: string;
  toUom: string;
  conversionFactor: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
