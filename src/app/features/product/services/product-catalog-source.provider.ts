import { EnvironmentInjector, Provider, inject, runInInjectionContext } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  PRODUCT_CATALOG_SOURCE,
  ProductCatalogSource,
} from '../../../shared/product-catalog/product-catalog-source.tokens';
import type { ProductCatalogService } from './product-catalog.service';

/**
 * Registers the `product`-backed implementation of `shared/product-catalog`'s
 * `ProductCatalogSource` contract. Registered once, at the composition root
 * (`app.config.ts`), so workexec's estimate-labor/estimate-parts pages need
 * no import from `product` directly (LAY-03).
 *
 * `ProductCatalogService` (and the generated `@durion-sdk/catalog` client it
 * wraps) is loaded via a dynamic `import()` rather than a static one, so it
 * lands in its own chunk and is fetched only the first time a page actually
 * searches the catalog, instead of being pulled into the initial bundle by
 * `app.config.ts`.
 */
export function provideProductCatalogSource(): Provider {
  return {
    provide: PRODUCT_CATALOG_SOURCE,
    useFactory: (): ProductCatalogSource => {
      const injector = inject(EnvironmentInjector);
      let catalogPromise: Promise<ProductCatalogService> | undefined;
      const getCatalog = (): Promise<ProductCatalogService> => {
        catalogPromise ??= import('./product-catalog.service').then(({ ProductCatalogService }) =>
          runInInjectionContext(injector, () => inject(ProductCatalogService)),
        );
        return catalogPromise;
      };
      return {
        searchServices: query =>
          from(getCatalog()).pipe(switchMap(catalog => catalog.searchServices(query))),
        searchProducts: query =>
          from(getCatalog()).pipe(switchMap(catalog => catalog.searchProducts(query))),
        getActiveMsrpAmount: (sku): Observable<number | null> =>
          from(getCatalog()).pipe(
            switchMap(catalog =>
              catalog.getActiveMsrp(sku).pipe(
                map(msrp => msrp?.amount ?? null),
                // The contract promises null for "no active MSRP", but
                // ProductCatalogService.getActiveMsrp lets a 404 through as an
                // Rx error rather than a null value — map exactly that case to
                // null here; any other failure (network, 5xx, auth) still
                // propagates so the caller's error branch fires.
                catchError((err: unknown) =>
                  err instanceof HttpErrorResponse && err.status === 404
                    ? of(null)
                    : throwError(() => err),
                ),
              ),
            ),
          ),
      };
    },
  };
}
