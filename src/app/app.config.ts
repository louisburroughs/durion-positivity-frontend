import { provideAppInitializer, ApplicationConfig, provideBrowserGlobalErrorListeners, importProvidersFrom, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { HttpClient, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { firstValueFrom, Observable, of } from 'rxjs';

import { TranslateLoader, TranslateModule, TranslationObject } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { LocaleService } from './core/services/locale.service';
import { authInterceptor } from './core/interceptors/auth.interceptor';

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
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor]),
    ),
    provideClientHydration(withEventReplay()),
    importProvidersFrom(TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient, PLATFORM_ID]
      },
      defaultLanguage: 'en-US'
    })),
    provideAppInitializer(() => inject(LocaleService).initialize()),
  ],
};
