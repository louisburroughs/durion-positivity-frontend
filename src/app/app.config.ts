import { provideAppInitializer, ApplicationConfig, provideBrowserGlobalErrorListeners, importProvidersFrom, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, provideRouter, Router, withComponentInputBinding, withNavigationErrorHandler } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { HttpClient, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { firstValueFrom, Observable, of } from 'rxjs';

import { TranslateLoader, TranslateModule, TranslationObject } from '@ngx-translate/core';
import { TranslateHttpLoader, TRANSLATE_HTTP_LOADER_CONFIG } from '@ngx-translate/http-loader';

// Import Configuration directly from its package entry to avoid pulling the
// generated SDK barrel (which re-exports every API class) into the app's
// initial bundle. The SDK service classes are still providedIn: 'root' and are
// loaded only when the consuming feature actually imports them.
import { Configuration as AccountingConfiguration } from '@durion-sdk/accounting/configuration';
import { Configuration as BulkLoaderConfiguration } from '@durion-sdk/bulk-loader/configuration';
import { Configuration as CatalogConfiguration } from '@durion-sdk/catalog/configuration';
import { Configuration as CustomerConfiguration } from '@durion-sdk/customer/configuration';
import { Configuration as InventoryConfiguration } from '@durion-sdk/inventory/configuration';
import { Configuration as InvoiceConfiguration } from '@durion-sdk/invoice/configuration';
import { Configuration as LocationConfiguration } from '@durion-sdk/location/configuration';
import { Configuration as OrderConfiguration } from '@durion-sdk/order/configuration';
import { Configuration as PeopleConfiguration } from '@durion-sdk/people/configuration';
import { Configuration as PeopleContactConfiguration } from '@durion-sdk/people-contact/configuration';
import { Configuration as SecurityConfiguration } from '@durion-sdk/security/configuration';
import { Configuration as ShopManagerConfiguration } from '@durion-sdk/shop-manager/configuration';
import { Configuration as SupplierConfiguration } from '@durion-sdk/supplier/configuration';
import { Configuration as VehicleInventoryConfiguration } from '@durion-sdk/vehicle-inventory/configuration';
import { Configuration as WorkorderConfiguration } from '@durion-sdk/workorder/configuration';

import { routes } from './app.routes';
import { clearChunkReloadGuard, recoverFromChunkError } from './core/router/chunk-error-recovery';
import { AuthService } from './core/services/auth.service';
import { LocaleService } from './core/services/locale.service';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { environment } from '../environments/environment';

/**
 * No-op TranslateLoader used during SSR/build-time route extraction.
 * TranslateHttpLoader requires a running HTTP server to resolve relative asset
 * URLs, which is unavailable at build time. This loader returns an empty
 * translation object so Angular's DI can resolve TranslateService during SSR
 * without triggering any HTTP requests.
 */
class NullTranslateLoader implements TranslateLoader {
  getTranslation(): Observable<TranslationObject> {
    return of({});
  }
}

/**
 * Returns the appropriate TranslateLoader based on the rendering platform.
 * During SSR/build-time route extraction, TranslateHttpLoader cannot load
 * assets via relative URL (no HTTP server backing the request). A no-op loader
 * is used instead so LocaleService can be injected unconditionally without
 * triggering an HTTP request or NG0201.
 *
 * Note: `http` must remain in the signature (and in deps) so Angular DI
 * injects HttpClient into the factory; it is unused on the SSR path.
 */
export function HttpLoaderFactory(http: HttpClient, platformId: object): TranslateLoader {
  if (isPlatformBrowser(platformId)) {
    return new TranslateHttpLoader();
  }
  return new NullTranslateLoader();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => firstValueFrom(inject(AuthService).validateSessionOnResume())),
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // Recover stale-tab lazy-chunk failures after a deploy by reloading the
      // attempted URL (browser only; a no-op during SSR).
      withNavigationErrorHandler(event => {
        if (isPlatformBrowser(inject(PLATFORM_ID))) {
          recoverFromChunkError(event);
        }
      }),
    ),
    // Reset the chunk-reload budget once the app completes a navigation: a
    // successful nav proves the tab is healthy, so the next stale-chunk click
    // gets a fresh recovery attempt (see chunk-error-recovery.ts).
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
      inject(Router).events
        .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), take(1))
        .subscribe(() => clearChunkReloadGuard());
    }),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor]),
    ),
    provideClientHydration(withEventReplay()),
    // Required by @ngx-translate/http-loader v17 when TranslateHttpLoader uses inject().
    { provide: TRANSLATE_HTTP_LOADER_CONFIG, useValue: {} },
    importProvidersFrom(TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient, PLATFORM_ID]
      },
      fallbackLang: 'en-US'
    })),
    provideAppInitializer(() => inject(LocaleService).initialize()),
    { provide: AccountingConfiguration, useFactory: () => new AccountingConfiguration({ basePath: `${environment.apiBaseUrl}/accounting` }) },
    { provide: BulkLoaderConfiguration, useFactory: () => new BulkLoaderConfiguration({ basePath: `${environment.apiBaseUrl}/bulk-loader` }) },
    { provide: CatalogConfiguration, useFactory: () => new CatalogConfiguration({ basePath: `${environment.apiBaseUrl}/catalog` }) },
    { provide: CustomerConfiguration, useFactory: () => new CustomerConfiguration({ basePath: `${environment.apiBaseUrl}/customer` }) },
    { provide: InventoryConfiguration, useFactory: () => new InventoryConfiguration({ basePath: `${environment.apiBaseUrl}/inventory` }) },
    { provide: InvoiceConfiguration, useFactory: () => new InvoiceConfiguration({ basePath: `${environment.apiBaseUrl}/invoice` }) },
    { provide: LocationConfiguration, useFactory: () => new LocationConfiguration({ basePath: `${environment.apiBaseUrl}/location` }) },
    { provide: OrderConfiguration, useFactory: () => new OrderConfiguration({ basePath: `${environment.apiBaseUrl}/order` }) },
    { provide: PeopleConfiguration, useFactory: () => new PeopleConfiguration({ basePath: `${environment.apiBaseUrl}/people` }) },
    { provide: PeopleContactConfiguration, useFactory: () => new PeopleContactConfiguration({ basePath: `${environment.apiBaseUrl}/people-contact` }) },
    { provide: SecurityConfiguration, useFactory: () => new SecurityConfiguration({ basePath: `${environment.apiBaseUrl}/security-service` }) },
    { provide: ShopManagerConfiguration, useFactory: () => new ShopManagerConfiguration({ basePath: `${environment.apiBaseUrl}/shop-manager` }) },
    { provide: SupplierConfiguration, useFactory: () => new SupplierConfiguration({ basePath: `${environment.apiBaseUrl}/supplier` }) },
    { provide: VehicleInventoryConfiguration, useFactory: () => new VehicleInventoryConfiguration({ basePath: `${environment.apiBaseUrl}/vehicle-inventory` }) },
    { provide: WorkorderConfiguration, useFactory: () => new WorkorderConfiguration({ basePath: `${environment.apiBaseUrl}/workorder` }) },
  ],
};
