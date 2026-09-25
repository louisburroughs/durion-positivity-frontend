import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Minimal, display-only shape workexec's estimate-labor page needs. Kept
 * separate from `product`'s `ServiceSummary` so `shared/**` never depends on
 * `features/**` (LAY-02).
 */
export interface CatalogServiceSummary {
  readonly id: string;
  readonly name: string;
  readonly shortDescription?: string;
}

/**
 * Minimal, display-only shape workexec's estimate-parts page needs. Kept
 * separate from `product`'s `ProductSummary`, which also carries
 * `lifecycleState`/`msrp`/`msrpCurrency`/`effectiveAt` that no workexec page
 * reads.
 */
export interface CatalogProductSummary {
  readonly id: string;
  readonly sku?: string;
  readonly name: string;
  readonly category?: string;
}

/**
 * Inversion point for the product-catalog reads workexec's estimate-labor
 * and estimate-parts pages need: they only know this contract, never
 * `ProductCatalogService` directly. The `product` feature provides the real
 * implementation once, at the composition root (`app.config.ts`), via
 * `provideProductCatalogSource()`.
 */
export interface ProductCatalogSource {
  searchServices(query: string): Observable<readonly CatalogServiceSummary[]>;
  searchProducts(query: string): Observable<readonly CatalogProductSummary[]>;
  /** The product's active MSRP amount, or null when none is active (e.g. a 404). */
  getActiveMsrpAmount(productId: string): Observable<number | null>;
}

export const PRODUCT_CATALOG_SOURCE = new InjectionToken<ProductCatalogSource>('PRODUCT_CATALOG_SOURCE');
