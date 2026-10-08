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
  msrpCurrency: string;
  effectiveAt: string;
}

/**
 * Catalog search filters. Every field is optional and a blank one is no filter, so an
 * empty criteria object lists the whole catalog. `query` is a substring match on name
 * and description; `sku`, `brand` and `category` are exact, case-insensitive matches.
 */
export interface ProductSearchCriteria {
  query?: string;
  sku?: string;
  brand?: string;
  category?: string;
}

/** One cursor-paged slice of catalog search results. */
export interface ProductSearchPage {
  items: ProductSummary[];
  /** Opaque cursor that reads the following page; null on the last page. */
  nextCursor: string | null;
}

export interface ServiceSummary {
  id: string;
  name: string;
  shortDescription: string;
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
  /** @serverGenerated */
  readonly createdAt?: string;
  /** @serverGenerated */
  readonly updatedAt?: string;
}
