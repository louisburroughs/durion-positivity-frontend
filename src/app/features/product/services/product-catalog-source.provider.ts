import { EnvironmentInjector, Provider, inject, runInInjectionContext } from '@angular/core';
import { from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
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
        getActiveMsrpAmount: productId =>
          from(getCatalog()).pipe(
            switchMap(catalog => catalog.getActiveMsrp(productId).pipe(map(msrp => msrp?.amount ?? null))),
          ),
      };
    },
  };
}
